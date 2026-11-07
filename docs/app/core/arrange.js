/**
 * How the books stand on the bookshelf page.
 *
 * Three rules, in order of importance:
 *   1. a series always stands together, in reading order;
 *   2. an author's books stand together - their series first, then their
 *      standalones;
 *   3. authors are shelved by genre, so like sits with like.
 *
 * Rule 3 can only hold without breaking rule 2 if each author goes into one
 * genre section. That genre is the one most of their books share, preferring
 * a distinctive genre ("Romantasy") over a broad one ("Fantasy"), and among
 * those the one most common on the whole shelf - so authors gather into a few
 * real sections instead of one each.
 *
 * Pure, so the order is tested.
 */

import { cleanTags } from './model.js';

// Umbrella genres: true of so many books that they make poor shelves.
// "Science Fiction" is one - Hardcover's readers tag plenty of epic fantasy
// with it, which put James Islington beside Red Rising instead of Sanderson.
const BROAD = new Set(['fantasy', 'science fiction & fantasy', 'fiction', 'young adult', 'adult',
  'literature & fiction', 'adventure', 'action & adventure', 'teen & young adult', 'young adult fiction',
  'science fiction']);

const authorKey = (b) => b.authors?.[0]?.id ?? b.authors?.[0]?.name ?? 'unknown';

/** The books that belong on the shelf: everything except what was given up on. */
export const shelvable = (books) => (books ?? []).filter((b) => b.status !== 'abandoned');

export function arrangeShelf(books) {
  const list = shelvable(books);
  const shelfGenreCount = new Map();
  for (const b of list) for (const g of cleanTags(b.genres, 6)) shelfGenreCount.set(g, (shelfGenreCount.get(g) ?? 0) + 1);

  // Gather by author first; everything else hangs off that.
  const byAuthor = new Map();
  for (const b of list) {
    const k = authorKey(b);
    if (!byAuthor.has(k)) byAuthor.set(k, { key: k, name: b.authors?.[0]?.name ?? 'Unknown author', books: [] });
    byAuthor.get(k).books.push(b);
  }

  const sections = new Map();
  for (const author of byAuthor.values()) {
    author.genre = genreFor(author.books, shelfGenreCount);

    // Series in the order the author's biggest comes first; each in reading order.
    const series = new Map();
    const standalone = [];
    for (const b of author.books) {
      if (!b.series?.id) { standalone.push(b); continue; }
      if (!series.has(b.series.id)) series.set(b.series.id, { id: b.series.id, name: b.series.name, books: [] });
      series.get(b.series.id).books.push(b);
    }
    for (const s of series.values()) s.books.sort((a, b) => (a.series.position ?? 999) - (b.series.position ?? 999));
    standalone.sort((a, b) => a.title.localeCompare(b.title));
    author.groups = [
      ...[...series.values()].sort((a, b) => b.books.length - a.books.length || a.name.localeCompare(b.name)),
      ...(standalone.length ? [{ id: null, name: null, books: standalone }] : []),
    ];

    if (!sections.has(author.genre)) sections.set(author.genre, { genre: author.genre, authors: [] });
    sections.get(author.genre).authors.push(author);
  }

  const count = (x) => x.authors.reduce((n, a) => n + a.books.length, 0);
  const sorted = [...sections.values()]
    .map((s) => ({ ...s, count: count(s) }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));

  // A section of one book is a shelf with a single book on it; those gather
  // at the end instead. (Authors still never split - they move whole.)
  const main = sorted.filter((s) => s.count >= 2 && s.genre !== MORE);
  const rest = sorted.filter((s) => !main.includes(s));
  if (rest.length) main.push({ genre: MORE, authors: rest.flatMap((s) => s.authors), count: rest.reduce((n, s) => n + s.count, 0) });
  for (const s of main) s.authors.sort((a, b) => b.books.length - a.books.length || a.name.localeCompare(b.name));
  return main;
}

export const MORE = 'More books';

/**
 * An author's section: a genre at least half their books share, distinctive
 * before broad, then whichever is commonest on the shelf as a whole.
 */
function genreFor(books, shelfGenreCount) {
  const counts = new Map();
  for (const b of books) for (const g of cleanTags(b.genres, 6)) counts.set(g, (counts.get(g) ?? 0) + 1);
  if (!counts.size) return MORE;
  const common = [...counts.entries()].filter(([, n]) => n >= books.length / 2).map(([g]) => g);
  const pool = common.length ? common : [...counts.keys()];
  const rank = (g) => [BROAD.has(g.toLowerCase()) ? 1 : 0, -(shelfGenreCount.get(g) ?? 0), -(counts.get(g) ?? 0), g];
  return pool.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i] ? -1 : 1;
    return 0;
  })[0];
}

/** Every book in shelf order, flattened - for anything that wants a single line. */
export const shelfOrder = (sections) =>
  sections.flatMap((s) => s.authors.flatMap((a) => a.groups.flatMap((g) => g.books)));
