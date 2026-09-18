/**
 * The diff engine: compares a freshly-fetched series against the last known
 * snapshot and produces release events.
 *
 * Every function here is pure. The watcher's correctness lives or dies on this
 * file, and pure functions let us test every case against fabricated snapshots
 * without touching the network.
 */

import { today } from './model.js';

export const PREORDER_WINDOW_DAYS = 30;

/** Events that are worth interrupting someone for, versus digest material. */
export const URGENT = new Set(['released', 'date_set']);

/** Whole days from `from` to `to`, both ISO dates. Negative means in the past. */
export function daysBetween(from, to) {
  const MS = 86_400_000;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / MS);
}

/**
 * Stable identity for an event, used to guarantee we never alert twice.
 *
 * Note that `date_set` and `date_moved` include the date itself: a book whose
 * release slips three times *should* produce three events, whereas a book
 * sitting at the same date must produce exactly one however many times the
 * watcher runs.
 */
export function eventKey(ev) {
  const base = `${ev.profile}|${ev.seriesId ?? ev.authorId}|${ev.bookId}|${ev.type}`;
  return ev.type === 'date_set' || ev.type === 'date_moved' ? `${base}|${ev.releaseDate}` : base;
}

/**
 * Diff one series for one watcher.
 *
 * @param {object|null} prev  snapshot from series-state.json, or null if never seen
 * @param {object} fresh      result of hardcover.seriesById()
 * @param {string} profile    whose watchlist this fired for
 * @param {string} [now]      ISO date, injectable for tests
 * @returns {Array<object>} events
 */
export function diffSeries(prev, fresh, profile, now = today()) {
  const events = [];

  // First sighting: record the snapshot silently. Announcing every book in a
  // series the moment you add it would bury the genuine news, and the upcoming
  // titles are shown by the Upcoming view regardless, which reads state rather
  // than this feed.
  if (!prev) return events;

  const prevBooks = prev.books ?? {};

  for (const book of fresh.books) {
    const before = prevBooks[book.bookId];
    const common = {
      profile,
      seriesId: fresh.id,
      seriesName: fresh.name,
      bookId: book.bookId,
      title: book.title,
      position: book.position,
      releaseDate: book.releaseDate,
      detectedAt: now,
    };

    // An unseen book produces exactly one piece of news. Firing "new book!"
    // and "out now!" and "releases in 20 days!" for the same discovery is three
    // notifications for one fact, so a first sighting stops here.
    if (!before) {
      events.push({ ...common, type: 'new_book' });
      continue;
    }

    if (!before.releaseDate && book.releaseDate) {
      events.push({ ...common, type: 'date_set' });
    } else if (before.releaseDate && book.releaseDate && before.releaseDate !== book.releaseDate) {
      events.push({ ...common, type: 'date_moved', previousDate: before.releaseDate });
    }

    if (!book.releaseDate) continue;
    const days = daysBetween(now, book.releaseDate);
    if (days === null) continue;

    if (days <= 0) {
      // "Out now" means it crossed the line since we last looked — not merely
      // that its date is in the past. Without this, every backlist book in a
      // series would be announced as newly released the first time we diff it.
      const crossed = prev.checkedAt ? book.releaseDate > prev.checkedAt : false;
      if (crossed) events.push({ ...common, type: 'released' });
    } else if (days <= PREORDER_WINDOW_DAYS) {
      events.push({ ...common, type: 'preorder', daysUntil: days });
    }
  }

  return events;
}

/**
 * Diff a watched author's catalogue. This is the safety net for series that
 * Hardcover hasn't catalogued a sequel into yet — a new title usually appears
 * against the author first.
 */
export function diffAuthor(prev, fresh, profile, now = today()) {
  if (!prev) return [];
  const prevBooks = prev.books ?? {};
  const events = [];

  for (const book of fresh.books) {
    if (prevBooks[book.bookId]) continue;
    // Only announce things that aren't already old news; adding an author to
    // the watchlist shouldn't replay their entire backlist.
    const days = book.releaseDate ? daysBetween(now, book.releaseDate) : null;
    if (days !== null && days < -PREORDER_WINDOW_DAYS) continue;

    events.push({
      profile,
      authorId: fresh.id,
      authorName: fresh.name,
      bookId: book.bookId,
      title: book.title,
      releaseDate: book.releaseDate,
      detectedAt: now,
      type: 'author_new_book',
    });
  }
  return events;
}

/** Collapse a fetched series into the shape stored in series-state.json. */
export function snapshotSeries(fresh, now = today()) {
  const books = {};
  for (const b of fresh.books) {
    books[b.bookId] = {
      position: b.position,
      title: b.title,
      releaseDate: b.releaseDate,
      releaseYear: b.releaseYear ?? null,
    };
  }
  return { id: fresh.id, name: fresh.name, checkedAt: now, books };
}

export function snapshotAuthor(fresh, now = today()) {
  const books = {};
  for (const b of fresh.books) {
    books[b.bookId] = { title: b.title, releaseDate: b.releaseDate };
  }
  return { id: fresh.id, name: fresh.name, checkedAt: now, books };
}

/**
 * Drop events we've already logged. `seen` is the set of keys from
 * events.jsonl; it is mutated so repeated calls within one run also dedupe.
 */
export function dedupe(events, seen) {
  const fresh = [];
  for (const ev of events) {
    const key = eventKey(ev);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push({ ...ev, key });
  }
  return fresh;
}

/** Books across all watched series that haven't come out yet, soonest first. */
export function upcomingFrom(seriesState, watchedIds, now = today()) {
  const out = [];
  for (const id of watchedIds) {
    const s = seriesState[id];
    if (!s) continue;
    for (const [bookId, b] of Object.entries(s.books ?? {})) {
      if (!b.releaseDate) continue;
      const days = daysBetween(now, b.releaseDate);
      if (days === null || days < 0) continue;
      out.push({ ...b, bookId, seriesId: id, seriesName: s.name, daysUntil: days });
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}
