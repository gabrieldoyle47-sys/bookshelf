#!/usr/bin/env node
/**
 * The daily watcher. This is what GitHub Actions runs.
 *
 * Reads every profile's library, unions their watchlists so each series is
 * fetched exactly once however many people follow it, diffs against the stored
 * snapshot, and appends any genuinely new events to the log.
 *
 * Safe to run repeatedly: the event log dedupes, so a re-run is a no-op.
 */

import { createClient, rateLimit } from '../docs/app/core/hardcover.js';
import { today } from '../docs/app/core/model.js';
import { runReleaseCheck } from '../docs/app/core/check.js';
import * as store from './store.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const token = await store.loadToken();
  if (!token) {
    console.error('No Hardcover token. Set HARDCOVER_API_TOKEN in the environment or .env');
    process.exitCode = 1;
    return;
  }

  const gql = createClient(token);
  const now = today();
  const libraries = await store.loadAllLibraries();
  const profileIds = Object.keys(libraries);

  if (!profileIds.length) {
    console.log('No profiles yet — nothing to check.');
    return;
  }

  const seriesState = await store.loadSeriesState();
  const authorState = await store.loadAuthorState();
  const bookState = await store.loadBookState();
  const seen = await store.loadEventKeys();

  console.log(`Checking for ${profileIds.length} profile(s) on ${now}`);
  const result = await runReleaseCheck({
    gql, libraries, seriesState, authorState, bookState, seen, now, log: (line) => console.log(line),
  });
  const { events: fresh, failures } = result;
  console.log(`${result.checkedSeries} series, ${result.checkedAuthors} authors, ${result.checkedTracked} tracked books`);

  if (DRY_RUN) {
    console.log(`\n[dry run] ${fresh.length} new event(s); nothing written.`);
    for (const ev of fresh) console.log('  ', ev.type, '—', ev.title, ev.releaseDate ?? '');
    return;
  }

  await store.saveSeriesState(seriesState);
  await store.saveAuthorState(authorState);
  await store.saveBookState(bookState);
  // `detectedAt` is a plain date for display, but "unread" needs finer
  // resolution: without it, marking the feed read hides anything found later
  // the same day until the date rolls over.
  const stamped = new Date().toISOString();
  await store.appendEvents(fresh.map((e) => ({ ...e, at: stamped })));

  console.log(`\n${fresh.length} new event(s)`);
  for (const ev of fresh) {
    const when = ev.releaseDate ? ` — ${ev.releaseDate}` : '';
    console.log(`  [${ev.profile}] ${ev.type}: ${ev.title}${when}`);
  }
  if (rateLimit.dailyRemaining) console.log(`\nHardcover calls left today: ${rateLimit.dailyRemaining}`);

  if (failures.length) {
    // Surface problems loudly but still exit 0 — a flaky series shouldn't turn
    // the whole scheduled run red and mask a real failure later.
    console.warn(`\n${failures.length} problem(s):`);
    for (const f of failures) console.warn(`  ! ${f}`);
  }
}

main().catch((err) => {
  console.error(`\nWatcher failed: ${err.message}`);
  process.exitCode = 1;
});
