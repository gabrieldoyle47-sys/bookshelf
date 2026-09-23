/**
 * The diff engine: compares a freshly-fetched series against the last known
 * snapshot and produces release events.
 *
 * Every function here is pure. The watcher's correctness lives or dies on this
 * file, and pure functions let us test every case against fabricated snapshots
 * without touching the network.
 */

import { today, deriveWatchlist, readAuthors, hiddenIds, onShelfIds } from './model.js';

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
      image: b.image ?? null,
    };
  }
  return { id: fresh.id, name: fresh.name, checkedAt: now, books };
}

export function snapshotAuthor(fresh, now = today()) {
  const books = {};
  for (const b of fresh.books) {
    books[b.bookId] = { title: b.title, releaseDate: b.releaseDate };
  }
  // Forthcoming titles carry enough to be shown on their own (cover, series),
  // since they are exactly the books nobody has on a shelf yet.
  const forthcoming = (fresh.forthcoming ?? []).map((b) => ({ ...b }));
  return { id: fresh.id, name: fresh.name, checkedAt: now, books, forthcoming };
}

/**
 * Diff books someone chose to track by hand.
 *
 * Reuses the series rules by treating each book as a series of one: the first
 * sighting is silent (you only just asked for it), and after that a date
 * appearing, moving or arriving is news exactly as it would be in a series.
 *
 * @param {object|null} prev  this book's entry in books-state.json
 * @param {object} fresh      one result of hardcover.booksByIds()
 */
export function diffTracked(prev, fresh, profile, now = today()) {
  const asSeries = (b, checkedAt) => ({
    id: 'tracked',
    name: b.series?.name ?? b.title,
    checkedAt,
    books: [{ bookId: String(b.id ?? b.bookId), title: b.title, position: b.series?.position ?? null, releaseDate: b.releaseDate ?? null }],
  });
  if (!prev) return [];
  const before = asSeries(prev, prev.checkedAt);
  const prevSnap = { checkedAt: prev.checkedAt, books: { [before.books[0].bookId]: before.books[0] } };
  return diffSeries(prevSnap, asSeries(fresh, now), profile, now)
    .map((e) => ({ ...e, tracked: true }));
}

/** What books-state.json keeps for a tracked book. */
export function snapshotTracked(fresh, now = today()) {
  return {
    id: String(fresh.id),
    title: fresh.title,
    authors: fresh.authors ?? [],
    series: fresh.series ?? null,
    releaseDate: fresh.releaseDate ?? null,
    releaseYear: fresh.releaseYear ?? null,
    image: fresh.image ?? null,
    checkedAt: now,
  };
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

/* ------------------------------------------------------ building the lists */

const UNTITLED = /^untitled\b/i;

/**
 * Released books in the series you read that are nowhere on your shelf.
 *
 * The watcher already knows every book in each watched series; this is the
 * half of that knowledge that is not about the future. "Released" includes a
 * year-only date in the past - Hardcover's Jan 1st placeholder - because a
 * book dated "2019" is out, whatever day it was.
 *
 * Extras (a 2.5 novella, a 0.1 "Prime" draft) are kept but flagged, so the
 * main-numbered books can lead.
 */
export function nextInSeries(seriesState, library, now = today()) {
  const watched = deriveWatchlist(library).series;
  const have = onShelfIds(library);
  const hidden = hiddenIds(library);
  const groups = [];

  for (const id of Object.keys(watched)) {
    const s = seriesState[id];
    if (!s) continue;
    // Where you are is what you have read or are reading - a book waiting on
    // the to-read pile is not progress.
    const mine = library.books.filter((b) => b.series?.id === id && (b.status === 'read' || b.status === 'reading'));
    const reached = Math.max(0, ...mine.map((b) => b.series?.position ?? 0));
    const books = [];
    for (const [bookId, b] of Object.entries(s.books ?? {})) {
      if (have.has(bookId) || hidden.has(bookId)) continue;
      if (!b.releaseDate || b.releaseDate > now) continue;
      if (UNTITLED.test(b.title ?? '')) continue;
      const extra = b.position == null || !Number.isInteger(b.position) || b.position <= 0;
      books.push({ ...b, bookId, seriesId: id, seriesName: s.name, extra });
    }
    if (!books.length) continue;
    books.sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
    // The first main book past where you are is the one to read next.
    const next = books.find((b) => !b.extra && b.position > reached) ?? books.find((b) => !b.extra) ?? null;
    groups.push({ id, name: s.name, books, next, reached });
  }

  // Series with a main book waiting come first; within that, alphabetical.
  return groups.sort((a, b) => Number(!a.next) - Number(!b.next) || a.name.localeCompare(b.name));
}

/**
 * Forthcoming books by authors you read, that are not already covered by a
 * series you watch, a book you track, or your shelf.
 */
export function authorUpcoming(authorState, library, seriesState = {}, now = today()) {
  const authors = readAuthors(library);
  const watchedSeries = new Set(Object.keys(deriveWatchlist(library).series));
  const have = onShelfIds(library);
  const hidden = hiddenIds(library);
  const tracked = new Set((library.tracked ?? []).map((t) => String(t.bookId)));
  const inWatchedSeries = new Set();
  for (const id of watchedSeries) {
    for (const bookId of Object.keys(seriesState[id]?.books ?? {})) inWatchedSeries.add(bookId);
  }

  // Hardcover sometimes holds the same forthcoming book twice (two editions
  // not yet merged by its librarians), so one title per author, keeping the
  // record with a cover and the most readers.
  const quality = (b) => (b.image ? 1e9 : 0) + (b.usersCount ?? 0);
  const out = new Map();
  for (const author of Object.values(authors)) {
    for (const b of authorState[author.id]?.forthcoming ?? []) {
      if (!b.releaseDate || b.releaseDate <= now) continue;
      if (have.has(b.bookId) || hidden.has(b.bookId) || tracked.has(b.bookId)) continue;
      if (inWatchedSeries.has(b.bookId) || (b.series && watchedSeries.has(b.series.id))) continue;
      const key = `${author.id}|${String(b.title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
      if (out.has(key) && quality(out.get(key)) >= quality(b)) continue;
      out.set(key, {
        ...b,
        seriesId: b.series?.id ?? null,
        seriesName: b.series?.name ?? null,
        position: b.series?.position ?? null,
        authorId: author.id,
        authorName: author.name,
        daysUntil: daysBetween(now, b.releaseDate),
        source: 'author',
      });
    }
  }
  return [...out.values()].sort((a, b) => a.daysUntil - b.daysUntil);
}

/** Books tracked by hand, with the freshest date the watcher has for each. */
export function trackedUpcoming(bookState, library, now = today()) {
  return (library.tracked ?? []).map((t) => {
    const fresh = bookState[t.bookId] ?? {};
    const releaseDate = fresh.releaseDate ?? t.releaseDate ?? null;
    return {
      ...t,
      ...fresh,
      bookId: String(t.bookId),
      releaseDate,
      image: fresh.image ?? t.image ?? null,
      seriesId: (fresh.series ?? t.series)?.id ?? null,
      seriesName: (fresh.series ?? t.series)?.name ?? null,
      position: (fresh.series ?? t.series)?.position ?? null,
      authorName: (fresh.authors ?? t.authors ?? []).map((a) => a.name).join(', '),
      daysUntil: releaseDate ? daysBetween(now, releaseDate) : null,
      source: 'tracked',
    };
  }).sort((a, b) => (a.daysUntil ?? 1e9) - (b.daysUntil ?? 1e9));
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
      out.push({ ...b, bookId, seriesId: id, seriesName: s.name, daysUntil: days, source: 'series' });
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}
