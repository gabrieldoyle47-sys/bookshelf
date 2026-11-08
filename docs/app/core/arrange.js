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

/* ------------------------------------------------------- shelves as items */

/**
 * The bookcase as data: shelves, each a list of item keys -
 *   b:<book id>     a book
 *   e:<label>       a bookend carrying a shelf's name
 *   o:<id>          an ornament, its kind in `ornaments`
 *   t:<series id>   a trophy for a finished series (see placeTrophies)
 * The automatic arrangement and a person's own saved one share this shape,
 * so the page draws either the same way and a saved one survives new books.
 */
const DEFAULT_ORNAMENTS = [['plant', 'cat'], ['candle', 'globe'], ['hourglass', 'plant']];

/** The arrangements a shelf can have: by genre (the default) or by author. */
export const MODES = ['genre', 'author'];

// What decides a book's shelf in each arrangement. A shelf keeps the key it
// was made with, so renaming "Dystopian" to "Sci-fi" still gathers the books
// that would have gone on it.
const MORE_AUTHORS = 'More authors';
const shelfKeyFor = (mode, genreOf, authorShelves) => (b) => (mode === 'author'
  ? (authorShelves.has(authorKey(b)) ? `author:${authorKey(b)}` : 'author:more')
  : `genre:${genreOf.get(b.id) ?? MORE}`);
/** A shelf's key - saved layouts from before keys existed fall back to the genre in their title. */
export const keyOfShelf = (s) => s.key ?? (s.kind === 'genre' ? `genre:${s.title}` : s.kind);

/** Each author's books, in shelf order (series together), most-read authors first. */
function authorsOf(list) {
  const byAuthor = new Map();
  for (const b of list) {
    const k = authorKey(b);
    if (!byAuthor.has(k)) byAuthor.set(k, { key: k, name: b.authors?.[0]?.name ?? 'Unknown author', books: [] });
    byAuthor.get(k).books.push(b);
  }
  return [...byAuthor.values()]
    .map((a) => ({ ...a, books: shelfOrder(arrangeShelf(a.books)) }))
    .sort((a, b) => b.books.length - a.books.length || a.name.localeCompare(b.name));
}

export function autoShelves(books, mode = 'genre') {
  const list = shelvable(books);
  const shelves = [];
  const ornaments = {};
  let n = 0;
  const addOrnaments = (kinds) => kinds.map((kind) => {
    const id = `${++n}`;
    ornaments[id] = kind;
    return `o:${id}`;
  });
  const done = list.filter((b) => b.status !== 'tbr');
  if (mode === 'author') {
    // A shelf for each author with two or more books; everyone else shares one.
    const authors = authorsOf(done);
    const own = authors.filter((a) => a.books.length >= 2);
    const rest = authors.filter((a) => a.books.length < 2).sort((a, b) => a.name.localeCompare(b.name));
    own.forEach((a, i) => shelves.push({
      title: a.name, kind: 'genre', key: `author:${a.key}`,
      keys: [`e:${a.name}`, ...a.books.map((b) => `b:${b.id}`), ...addOrnaments(DEFAULT_ORNAMENTS[i % DEFAULT_ORNAMENTS.length])],
    }));
    if (rest.length) {
      shelves.push({ title: MORE_AUTHORS, kind: 'genre', key: 'author:more',
        keys: [`e:${MORE_AUTHORS}`, ...rest.flatMap((a) => a.books).map((b) => `b:${b.id}`), ...addOrnaments(['plant'])] });
    }
  } else {
    arrangeShelf(done).forEach((section, i) => {
      shelves.push({
        title: section.genre, kind: 'genre', key: `genre:${section.genre}`,
        keys: [`e:${section.genre}`, ...shelfOrder([section]).map((b) => `b:${b.id}`),
          ...addOrnaments(DEFAULT_ORNAMENTS[i % DEFAULT_ORNAMENTS.length])],
      });
    });
  }
  const pile = list.filter((b) => b.status === 'tbr');
  shelves.push({
    title: 'To read', kind: 'pile', key: 'pile',
    keys: ['e:To read', ...shelfOrder(arrangeShelf(pile)).map((b) => `b:${b.id}`), ...addOrnaments(['mug', 'hourglass'])],
  });
  // The top of the case holds up to two ornaments; it starts clear.
  return { shelves, ornaments, top: [] };
}

/**
 * A saved arrangement brought up to date with the shelf as it is now.
 *
 * Books that have gone are dropped. A new book - or one whose status moved it
 * on or off the to-read pile - slots in beside its series; failing that,
 * beside its author; failing that, at the end of the shelf for its genre (or
 * the to-read shelf); failing that, at the end of the last shelf. Everything
 * the person placed by hand stays where they put it.
 */
export function mergeLayout(layout, books, mode = 'genre') {
  const list = shelvable(books);
  const byId = new Map(list.map((b) => [b.id, b]));
  const shelves = (layout?.shelves ?? []).map((s) => ({ ...s, keys: [...s.keys] }));
  const ornaments = { ...(layout?.ornaments ?? {}) };
  if (!shelves.length) return autoShelves(books, mode);
  // Only ornaments that still exist, and at most two, on top of the case.
  const top = (layout?.top ?? []).filter((k) => k.startsWith('o:') && ornaments[k.slice(2)]).slice(0, 2);

  const pileShelf = shelves.find((s) => s.kind === 'pile');
  const placed = new Set();
  for (const shelf of shelves) {
    shelf.keys = shelf.keys.filter((k) => {
      if (!k.startsWith('b:')) return true;
      const b = byId.get(k.slice(2));
      if (!b || placed.has(b.id)) return false;
      // A book that changed sides of the pile is re-placed by the rules.
      if (pileShelf && ((shelf === pileShelf) !== (b.status === 'tbr'))) return false;
      placed.add(b.id);
      return true;
    });
  }

  const genreOf = new Map();
  for (const section of arrangeShelf(list)) for (const b of shelfOrder([section])) genreOf.set(b.id, section.genre);
  const authorShelves = new Set(shelves.map(keyOfShelf).filter((k) => k.startsWith('author:') && k !== 'author:more').map((k) => k.slice(7)));
  const keyOf = shelfKeyFor(mode, genreOf, authorShelves);

  const insertAfterLast = (test) => {
    for (let s = shelves.length - 1; s >= 0; s--) {
      const keys = shelves[s].keys;
      for (let i = keys.length - 1; i >= 0; i--) {
        if (keys[i].startsWith('b:') && test(byId.get(keys[i].slice(2)), shelves[s])) return { s, i: i + 1 };
      }
    }
    return null;
  };
  // Before the shelf's trailing ornaments, so a new book never lands beyond the plant.
  const endOf = (shelf) => {
    let i = shelf.keys.length;
    while (i > 0 && shelf.keys[i - 1].startsWith('o:')) i--;
    return i;
  };

  for (const b of shelfOrder(arrangeShelf(list))) {
    if (placed.has(b.id)) continue;
    const onPileSide = (shelf) => !pileShelf || ((shelf === pileShelf) === (b.status === 'tbr'));
    const spot = (b.series?.id && insertAfterLast((x, shelf) => x?.series?.id === b.series.id && onPileSide(shelf)))
      || insertAfterLast((x, shelf) => authorKey(x ?? {}) === authorKey(b) && onPileSide(shelf))
      || (() => {
        const target = b.status === 'tbr' && pileShelf ? pileShelf
          : shelves.find((s) => keyOfShelf(s) === keyOf(b) && s !== pileShelf)
          ?? [...shelves].reverse().find((s) => s !== pileShelf && s.kind !== 'cabinet') ?? shelves[0];
        return { s: shelves.indexOf(target), i: endOf(target) };
      })();
    shelves[spot.s].keys.splice(spot.i, 0, `b:${b.id}`);
    placed.add(b.id);
  }
  return { shelves, ornaments, top };
}

/**
 * The trophy cabinet: the last shelf, one trophy per finished series. A trophy
 * someone has moved stays where they put it; one for a series that is no
 * longer finished (a new book was announced) is taken down; a new one goes at
 * the end of the cabinet.
 */
export function placeTrophies(layout, seriesIds) {
  const want = new Set(seriesIds.map(String));
  const shelves = layout.shelves.map((s) => ({ ...s, keys: s.keys.filter((k) => !k.startsWith('t:') || want.has(k.slice(2))) }));
  let cabinet = shelves.find((s) => s.kind === 'cabinet');
  if (!cabinet) {
    cabinet = { title: 'Trophies', kind: 'cabinet', keys: [] };
    shelves.push(cabinet);
  }
  const have = new Set(shelves.flatMap((s) => s.keys).filter((k) => k.startsWith('t:')).map((k) => k.slice(2)));
  for (const id of want) if (!have.has(id)) cabinet.keys.push(`t:${id}`);
  // The cabinet always stands at the bottom, whatever was moved around it.
  return { ...layout, shelves: [...shelves.filter((s) => s !== cabinet), cabinet] };
}
