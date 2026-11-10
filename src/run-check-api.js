#!/usr/bin/env node
/**
 * The nightly release check, for the accounts site. GitHub Actions runs it.
 *
 * Reads every active shelf and the watcher's state from the API with the
 * private service key (nothing is in the repo any more), then checks one
 * person at a time, each in a minute of their own: what they watch that no
 * one before them tonight already covered. A series several people read is
 * fetched once, on the first of their turns, and its news goes to all of
 * them. Results are saved after each turn, so a failure part-way loses
 * nothing already done.
 *
 *   BOOKSHELF_API=https://... SERVICE_KEY=... HARDCOVER_API_TOKEN=... node src/run-check-api.js
 */

import { createClient } from '../docs/app/core/hardcover.js';
import { today } from '../docs/app/core/model.js';
import { runReleaseCheck } from '../docs/app/core/check.js';

const API = (process.env.BOOKSHELF_API ?? '').replace(/\/$/, '');
const KEY = process.env.SERVICE_KEY ?? '';
const TOKEN = process.env.HARDCOVER_API_TOKEN ?? '';
const DRY_RUN = process.argv.includes('--dry-run');
// A turn's calls are paced at about one a second; a minute each keeps every
// turn well inside Hardcover's 60 a minute, whoever is first.
const TURN_MS = Number(process.env.TURN_MS ?? 60_000);

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options, headers: { Authorization: `Service ${KEY}`, 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${body.error ?? res.status}`);
  return body;
}

const parse = (text, fallback) => { try { return text ? JSON.parse(text) : fallback; } catch { return fallback; } };

async function main() {
  if (!API || !KEY || !TOKEN) throw new Error('Set BOOKSHELF_API, SERVICE_KEY and HARDCOVER_API_TOKEN.');
  const { libraries, state } = await api('/service/export');
  const seriesState = parse(state['series-state.json'], {});
  const authorState = parse(state['authors.json'], {});
  const bookState = parse(state['books-state.json'], {});
  const seen = new Set((state['events.jsonl'] ?? '').split('\n').filter(Boolean).map((l) => parse(l, {}).key).filter(Boolean));

  let calls = 0;
  const base = createClient(TOKEN);
  const gql = (...args) => { calls++; return base(...args); };
  const done = { series: new Set(), authors: new Set(), tracked: new Set() };
  const people = Object.keys(libraries);
  const totals = { series: 0, authors: 0, tracked: 0, events: 0, failures: [] };
  console.log(`Checking ${people.length} shelves on ${today()}, one a minute`);

  for (const [n, person] of people.entries()) {
    const started = Date.now();
    const before = calls;
    const result = await runReleaseCheck({
      gql, libraries, seriesState, authorState, bookState, seen, only: new Set([person]), done,
    });
    const stamped = new Date().toISOString();
    const events = result.events.map((e) => ({ ...e, at: stamped }));
    totals.series += result.checkedSeries;
    totals.authors += result.checkedAuthors;
    totals.tracked += result.checkedTracked;
    totals.events += events.length;
    totals.failures.push(...result.failures);
    console.log(`  ${person}: ${result.checkedSeries} series, ${result.checkedAuthors} authors, ${result.checkedTracked} tracked — ${calls - before} calls, ${events.length} new`);
    if (!DRY_RUN) {
      await api('/service/import', { method: 'POST', body: JSON.stringify({
        seriesState, authorState, bookState, events, calls: calls - before, wishes: result.wishUpdates,
        summary: n === people.length - 1 ? { people: people.length, ...totals, failures: totals.failures.length, calls } : undefined,
      }) });
    }
    // The next person starts on a fresh minute.
    if (n < people.length - 1) await pause(Math.max(0, TURN_MS - (Date.now() - started)));
  }

  console.log(`\n${totals.events} new event(s), ${calls} Hardcover calls in all`);
  if (totals.failures.length) {
    console.warn(`\n${totals.failures.length} problem(s):`);
    for (const f of totals.failures) console.warn(`  ! ${f}`);
  }
}

main().catch((err) => {
  console.error(`\nWatcher failed: ${err.message}`);
  process.exitCode = 1;
});
