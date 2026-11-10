/**
 * One release check: fetch everything anyone watches, diff it against the
 * stored snapshots, and return the new state plus any genuinely new events.
 *
 * Shared by the nightly job (src/run-check.js) and the Worker's "check now"
 * button, which used to carry a copy each - so pressing the button and waiting
 * for tonight's run cannot disagree. Storage is the caller's business; this
 * only takes and returns plain objects.
 */

import { seriesById, authorBooks, booksByIds } from './hardcover.js';
import { unionWatchlists, deriveWatchlist, today } from './model.js';
import {
  diffSeries, diffAuthor, diffTracked, snapshotSeries, snapshotAuthor, snapshotTracked, dedupe,
} from './watch.js';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Hardcover allows 60 calls a minute with a burst of 10. Spend most of the
 * burst, then settle into roughly one a second - and if we are throttled
 * anyway, wait out the window rather than losing that series for the run.
 */
export function makePacer({ burst = 6, gap = 900, backoff = 2000 } = {}) {
  let calls = 0;
  return async (fn) => {
    if (calls++ >= burst) await pause(gap);
    try {
      return await fn();
    } catch (err) {
      if (!/rate limit/i.test(err.message)) throw err;
      await pause(backoff);
      return fn();
    }
  };
}

/**
 * @param {object} args
 * @param {Function} args.gql        Hardcover client
 * @param {object} args.libraries    profile id -> library
 * @param {object} args.seriesState  series-state.json (mutated)
 * @param {object} args.authorState  authors.json (mutated)
 * @param {object} args.bookState    books-state.json (mutated)
 * @param {Set}    args.seen         event keys already logged (mutated)
 * @param {Function} [args.paced]    wraps each API call, for rate limiting
 * @param {Function} [args.log]      progress output
 * @param {Set}    [args.only]       check only what these profiles watch (one
 *                                   person's turn in the nightly run); news still
 *                                   goes to everyone who watches it
 * @param {object} [args.done]       { series, authors, tracked } Sets of ids
 *                                   already checked this run (mutated), skipped
 */
export async function runReleaseCheck({
  gql, libraries, seriesState, authorState, bookState, seen,
  now = today(), paced = makePacer(), log = () => {}, only = null, done = null,
}) {
  const all = unionWatchlists(libraries);
  // On someone's turn: their series, authors and tracked books, minus any
  // already fetched for someone else tonight.
  const mine = (watch, kind) => (!only || watch.watchers.some((w) => only.has(w)))
    && !(done?.[kind]?.has(String(watch.id)));
  const series = all.series.filter((w) => mine(w, 'series'));
  const readAuthors = all.readAuthors.filter((w) => mine(w, 'authors'));
  const tracked = all.tracked.filter((w) => mine(w, 'tracked'));
  const { authors } = all;
  if (done) {
    for (const w of series) done.series.add(String(w.id));
    for (const w of readAuthors) done.authors.add(String(w.id));
    for (const w of tracked) done.tracked.add(String(w.id));
  }
  const events = [];
  const failures = [];
  let newSeries = 0;

  for (const watch of series) {
    try {
      const data = await paced(() => seriesById(gql, watch.id));
      if (!data) { failures.push(`series ${watch.id} (${watch.name}) returned nothing`); continue; }
      if (!seriesState[watch.id]) newSeries++;
      // Diff per watcher: two people following the same series each get their
      // own event, so one person reading it doesn't consume the other's news.
      for (const profile of watch.watchers) {
        events.push(...dedupe(diffSeries(seriesState[watch.id] ?? null, data, profile, now), seen));
      }
      seriesState[watch.id] = snapshotSeries(data, now);
      log(`  ✓ ${data.name} (${data.books.length} books)`);
    } catch (err) {
      // One bad series must not abort the run and lose every other update.
      failures.push(`series ${watch.id} (${watch.name}): ${err.message}`);
    }
  }

  // Every author anyone reads is fetched, for the Upcoming page; only those on
  // someone's author watchlist (rated 4+) produce news, and only for them.
  const newsFor = new Map(authors.map((a) => [a.id, a.watchers]));
  for (const watch of readAuthors) {
    try {
      const data = await paced(() => authorBooks(gql, watch.id, now));
      if (!data) { failures.push(`author ${watch.id} (${watch.name}) returned nothing`); continue; }
      for (const profile of newsFor.get(watch.id) ?? []) {
        events.push(...dedupe(diffAuthor(authorState[watch.id] ?? null, data, profile, now), seen));
      }
      authorState[watch.id] = snapshotAuthor(data, now);
      log(`  ✓ ${data.name} (${data.books.length} titles, ${data.forthcoming.length} forthcoming)`);
    } catch (err) {
      failures.push(`author ${watch.id} (${watch.name}): ${err.message}`);
    }
  }

  if (tracked.length) {
    try {
      const fresh = await paced(() => booksByIds(gql, tracked.map((t) => t.id)));
      const byId = new Map(fresh.map((b) => [b.id, b]));
      for (const t of tracked) {
        const data = byId.get(t.id);
        if (!data) { failures.push(`tracked book ${t.id} (${t.title}) returned nothing`); continue; }
        for (const profile of t.watchers) {
          // A tracked book in a series this person already watches is announced
          // by the series; saying it twice would be noise.
          const watched = data.series?.id && deriveWatchlist(libraries[profile]).series[data.series.id];
          if (watched) continue;
          events.push(...dedupe(diffTracked(bookState[t.id] ?? null, data, profile, now), seen));
        }
        bookState[t.id] = snapshotTracked(data, now);
      }
      log(`  ✓ ${tracked.length} tracked book${tracked.length === 1 ? '' : 's'}`);
    } catch (err) {
      failures.push(`tracked books: ${err.message}`);
    }
  }

  // Wishlist books not out yet (or with no date): their release date and
  // cover as Hardcover has them now. One call for the whole turn's wishes.
  const wishes = [];
  for (const [profile, lib] of Object.entries(libraries)) {
    if (only && !only.has(profile)) continue;
    for (const b of lib.books ?? []) {
      if (b.status === 'wish' && b.hardcoverId && (!b.released || b.released >= now || !b.cover)) wishes.push({ profile, book: b });
    }
  }
  const wishUpdates = [];
  if (wishes.length) {
    try {
      const fresh = await paced(() => booksByIds(gql, wishes.slice(0, 100).map((w) => w.book.hardcoverId)));
      const byId = new Map(fresh.map((b) => [String(b.id), b]));
      for (const { profile, book } of wishes) {
        const data = byId.get(String(book.hardcoverId));
        if (!data) continue;
        const change = {};
        if (data.releaseDate && data.releaseDate !== book.released) change.released = data.releaseDate;
        if (data.releaseYear && data.releaseYear !== book.releaseYear) change.releaseYear = data.releaseYear;
        if (data.image && !book.cover) change.cover = data.image;
        if (Object.keys(change).length) wishUpdates.push({ profile, bookId: book.id, ...change });
      }
      log(`  ✓ ${wishes.length} wishlist book${wishes.length === 1 ? '' : 's'}, ${wishUpdates.length} updated`);
    } catch (err) {
      failures.push(`wishlist books: ${err.message}`);
    }
  }

  // Count what is actually coming, so a first run - where every series is new
  // and so, by design, silent - can still say something useful.
  let upcoming = 0;
  for (const state of Object.values(seriesState)) {
    for (const b of Object.values(state.books ?? {})) {
      if (b.releaseDate && b.releaseDate > now) upcoming++;
    }
  }

  return {
    events,
    failures,
    newSeries,
    upcoming,
    checkedSeries: series.length,
    checkedAuthors: readAuthors.length,
    checkedTracked: tracked.length,
    wishUpdates,
  };
}
