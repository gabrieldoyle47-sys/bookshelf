/**
 * The group page: how everyone's reading fits together, for any number of
 * people rather than exactly two.
 *
 * Pure functions over libraries keyed by profile id, so every number on the
 * page is tested without a browser. A "group" is whichever people are
 * selected on the page - everyone, or any two or more of them.
 */

import { tagCounts, readOnOf, readYearOf } from './model.js';

const engaged = (b) => b.status === 'read' || b.status === 'reading';
const rated = (b) => b.status === 'read' && typeof b.rating === 'number' && b.rating > 0;

/** Books are the same book when Hardcover says so. */
const keyOf = (b) => String(b.hardcoverId ?? b.id).replace(/^hc:/, '');

/* ------------------------------------------------------------ taste match */

function genreVector(books) {
  return new Map(tagCounts(books.filter(engaged), 'genres').map((g) => [g.tag, g.count]));
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of a) { na += v * v; if (b.has(k)) dot += v * b.get(k); }
  for (const v of b.values()) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * How alike two readers' tastes are, 0-100 - the "taste match" of Spotify
 * Blend and Goodreads' Compare Books.
 *
 * Mostly what they read (genre profiles, cosine similarity), and once they
 * have rated at least three of the same books, also whether they liked the
 * same ones: agreeing on a 5★ and a 2★ says more than both reading fantasy.
 */
export function tasteMatch(booksA, booksB) {
  const genre = cosine(genreVector(booksA), genreVector(booksB));
  const byKey = new Map(booksB.map((b) => [keyOf(b), b]));
  const common = booksA.filter((b) => byKey.has(keyOf(b)));
  const bothRated = common.filter((b) => rated(b) && rated(byKey.get(keyOf(b))));
  const agreement = bothRated.length
    ? 1 - bothRated.reduce((s, b) => s + Math.abs(b.rating - byKey.get(keyOf(b)).rating), 0) / bothRated.length / 4.5
    : null;
  const score = bothRated.length >= 3 ? 0.6 * genre + 0.4 * agreement : genre;

  const ga = genreVector(booksA);
  const gb = genreVector(booksB);
  const sharedGenres = [...ga.keys()].filter((g) => gb.has(g))
    .sort((x, y) => Math.min(gb.get(y), ga.get(y)) - Math.min(gb.get(x), ga.get(x)));

  return {
    score: Math.round(score * 100),
    common: common.length,
    bothRead: common.filter((b) => b.status === 'read' && byKey.get(keyOf(b)).status === 'read').length,
    agreement: agreement == null ? null : Math.round(agreement * 100),
    sharedGenres: sharedGenres.slice(0, 3),
  };
}

/** Every pair in the group with its match, best match first. */
export function matchPairs(libraries, ids) {
  const pairs = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const m = tasteMatch(libraries[ids[i]]?.books ?? [], libraries[ids[j]]?.books ?? []);
      pairs.push({ a: ids[i], b: ids[j], ...m });
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}

/* -------------------------------------------------------- books in common */

/**
 * Books finished by two or more of the group, with everyone's rating - the
 * Letterboxd "friends who watched this" strip, for a whole shelf at once.
 * `spread` is the gap between the highest and lowest rating, for debates.
 */
export function readTogether(libraries, ids) {
  const byKey = new Map();
  for (const id of ids) {
    for (const b of libraries[id]?.books ?? []) {
      if (b.status !== 'read') continue;
      const k = keyOf(b);
      if (!byKey.has(k)) byKey.set(k, { book: b, readers: [] });
      byKey.get(k).readers.push({ id, rating: rated(b) ? b.rating : null, book: b });
    }
  }
  return [...byKey.values()]
    .filter((x) => x.readers.length >= 2)
    .map((x) => {
      const ratings = x.readers.map((r) => r.rating).filter((r) => r != null);
      return {
        ...x,
        average: ratings.length ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null,
        spread: ratings.length >= 2 ? Math.max(...ratings) - Math.min(...ratings) : 0,
      };
    })
    .sort((x, y) => y.readers.length - x.readers.length || (y.average ?? 0) - (x.average ?? 0));
}

/* ----------------------------------------------------------- picks for you */

/**
 * Books the rest of the group loved (4★+) that are nowhere on the viewer's
 * shelf, ranked by how many people loved them - one person's 5★ is a tip,
 * three people's is a consensus.
 */
export function picksFor(viewer, libraries, ids, limit = 10) {
  const have = new Set((libraries[viewer]?.books ?? []).map(keyOf));
  const byKey = new Map();
  for (const id of ids) {
    if (id === viewer) continue;
    for (const b of libraries[id]?.books ?? []) {
      if (!rated(b) || b.rating < 4 || have.has(keyOf(b))) continue;
      const k = keyOf(b);
      if (!byKey.has(k)) byKey.set(k, { book: b, lovers: [] });
      byKey.get(k).lovers.push({ id, rating: b.rating });
    }
  }
  return [...byKey.values()]
    .map((x) => ({ ...x, average: x.lovers.reduce((s, l) => s + l.rating, 0) / x.lovers.length }))
    .sort((x, y) => y.lovers.length - x.lovers.length || y.average - x.average)
    .slice(0, limit);
}

/* ---------------------------------------------------------------- activity */

/** The day something happened, if it is known to the day. */
const exactDay = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/**
 * What everyone has been up to, newest first - a friends feed in the manner
 * of Letterboxd and Goodreads, built from dates the shelves already hold.
 * Only events dated to the day: "finished in 2019" is history, not news.
 */
export function activity(libraries, ids, { limit = 15 } = {}) {
  const items = [];
  for (const id of ids) {
    const lib = libraries[id] ?? { books: [] };
    for (const b of lib.books ?? []) {
      const finished = b.status === 'read' ? exactDay(b.finished) ?? exactDay(readOnOf(b)) : null;
      if (finished) items.push({ id, type: 'finished', at: finished, book: b, rating: rated(b) ? b.rating : null });
      const started = exactDay(b.started);
      if (started && (b.status === 'reading' || !finished || started !== finished)) {
        items.push({ id, type: 'started', at: started, book: b });
      }
      if (b.status === 'tbr' && exactDay(b.added)) items.push({ id, type: 'added', at: exactDay(b.added), book: b });
    }
    // Recommendations live in the recipient's library; credit the sender.
    for (const r of lib.recommendations ?? []) {
      if (exactDay(r.at) && ids.includes(r.from)) {
        items.push({ id: r.from, to: id, type: 'recommended', at: exactDay(r.at), book: r.book, note: r.note });
      }
    }
  }
  const order = { finished: 0, recommended: 1, started: 2, added: 3 };
  return items
    .sort((x, y) => y.at.localeCompare(x.at) || order[x.type] - order[y.type])
    .slice(0, limit);
}

/* -------------------------------------------------------------- genre map */

/** The group's top genres, with how many books each person has read in each. */
export function genreGrid(libraries, ids, top = 8) {
  const per = Object.fromEntries(ids.map((id) => [id, genreVector(libraries[id]?.books ?? [])]));
  const total = new Map();
  for (const v of Object.values(per)) for (const [g, n] of v) total.set(g, (total.get(g) ?? 0) + n);
  const genres = [...total.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([g]) => g);
  const max = Math.max(1, ...ids.flatMap((id) => genres.map((g) => per[id].get(g) ?? 0)));
  return { genres, max, counts: Object.fromEntries(ids.map((id) => [id, genres.map((g) => per[id].get(g) ?? 0)])) };
}

/* ------------------------------------------------------------- this year */

/** Books and pages per person this year, most first - a club leaderboard. */
export function yearBoard(libraries, ids, year) {
  return ids.map((id) => {
    const read = (libraries[id]?.books ?? []).filter((b) => b.status === 'read' && readYearOf(b) === Number(year));
    return { id, books: read.length, pages: read.reduce((s, b) => s + (b.pages ?? 0), 0) };
  }).sort((a, b) => b.books - a.books || b.pages - a.pages);
}
