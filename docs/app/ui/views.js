/**
 * The views rendered into <main>. Each takes the app context and returns a
 * DocumentFragment; none of them mutate state directly — they call back into
 * ctx.actions so every change goes through one save path.
 */

import {
  h, stars, fmtDate, fmtDays, fmtReadOnShort, authorNames, coverEl, seriesLabel, daysUntil,
} from './dom.js';
import { deriveWatchlist, readOnOf, readYearOf } from '../core/model.js';
import { upcomingFrom } from '../core/watch.js';

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const STATUS_ORDER = ['reading', 'tbr', 'read', 'abandoned'];
const STATUS_LABEL = {
  reading: 'Reading now', tbr: 'Want to read', read: 'Finished', abandoned: 'Gave up on',
};

function frag(...nodes) {
  const f = document.createDocumentFragment();
  f.append(...nodes.flat(Infinity).filter(Boolean));
  return f;
}

function pageHead(title, sub, ...actions) {
  return h('div', { class: 'page-head' },
    h('div', {}, h('h1', { text: title }), sub && h('div', { class: 'sub', text: sub })),
    h('div', { class: 'spacer' }),
    ...actions);
}

function emptyState(text) {
  return h('p', { class: 'empty', text });
}

/** One book row. `side` is whatever belongs on the right-hand side. */
function bookRow(book, ctx, side, owner) {
  const bits = [authorNames(book), seriesLabel(book)].filter(Boolean);
  return h('button', {
    class: 'book', type: 'button',
    onclick: () => ctx.actions.openBook(book, owner),
  },
    coverEl(book),
    h('div', { class: 'book-main' },
      h('div', { class: 'book-title', text: book.title }),
      h('div', { class: 'book-meta', text: bits.join(' · ') }),
      book.note && h('div', { class: 'book-meta', text: `“${book.note}”` })),
    side && h('div', { class: 'book-side' }, side));
}

/* --------------------------------------------------------------- grouping */

export const GROUPINGS = [
  ['recent', 'Recent'],
  ['series', 'By series'],
  ['year', 'By year'],
];

const GROUPING_KEY = 'bookshelf.grouping';

export function getGrouping() {
  try {
    const saved = localStorage.getItem(GROUPING_KEY);
    return GROUPINGS.some(([id]) => id === saved) ? saved : 'recent';
  } catch {
    return 'recent';
  }
}

export function setGrouping(value) {
  try { localStorage.setItem(GROUPING_KEY, value); } catch { /* private mode */ }
}

/**
 * Group finished books by series.
 *
 * Books within a series are ordered by their position in it, not by when they
 * were read - the useful question is "where am I up to", and a series read out
 * of order should still read in order on screen.
 */
function groupBySeries(books) {
  const groups = new Map();
  const standalone = [];

  for (const book of books) {
    if (!book.series?.id) { standalone.push(book); continue; }
    if (!groups.has(book.series.id)) {
      groups.set(book.series.id, { id: book.series.id, name: book.series.name, books: [] });
    }
    groups.get(book.series.id).books.push(book);
  }

  const ordered = [...groups.values()].map((g) => {
    g.books.sort((a, b) => (a.series.position ?? 0) - (b.series.position ?? 0));
    const rated = g.books.filter((b) => typeof b.rating === 'number');
    g.average = rated.length ? rated.reduce((sum, b) => sum + b.rating, 0) / rated.length : null;
    g.latest = g.books.map(readOnOf).filter(Boolean).sort().pop() ?? '';
    return g;
  });

  // Biggest series first: that's where the reading actually went.
  ordered.sort((a, b) => b.books.length - a.books.length || a.name.localeCompare(b.name));

  if (standalone.length) {
    standalone.sort((a, b) => String(readOnOf(b) ?? '').localeCompare(String(readOnOf(a) ?? '')));
    ordered.push({ id: '__standalone', name: 'Standalones', books: standalone, average: null, standalone: true });
  }
  return ordered;
}

/** Group by the year read, with undated books gathered at the end. */
function groupByYear(books) {
  const groups = new Map();
  for (const book of books) {
    const year = readYearOf(book);
    const key = year ?? '__unknown';
    if (!groups.has(key)) groups.set(key, { id: String(key), year, books: [] });
    groups.get(key).books.push(book);
  }

  const ordered = [...groups.values()].filter((g) => g.year != null);
  ordered.sort((a, b) => b.year - a.year);
  for (const g of ordered) {
    g.name = String(g.year);
    g.books.sort((a, b) => String(readOnOf(b) ?? '').localeCompare(String(readOnOf(a) ?? '')));
  }

  const unknown = groups.get('__unknown');
  if (unknown) {
    unknown.name = 'Year not recorded';
    unknown.unknown = true;
    ordered.push(unknown);
  }
  return ordered;
}

/**
 * A collapsible group. Open by default only for the first one, so a long shelf
 * opens as a scannable list of series or years rather than a wall of books.
 */
function groupBlock(group, ctx, { open, sideFor: side, subtitle }) {
  const body = h('div', { class: 'books group-body' },
    // A bucket of undated books is otherwise a dead end - say how to fix it.
    group.unknown
      ? h('p', { class: 'group-hint',
          text: 'Open a book and set when you read it. A year on its own is enough — you do not need the exact date.' })
      : null,
    group.books.map((b) => bookRow(b, ctx, side(b))));

  const summary = h('summary', { class: 'group-head' },
    h('span', { class: 'group-name', text: group.name }),
    h('span', { class: 'count', text: String(group.books.length) }),
    subtitle ? h('span', { class: 'group-sub', text: subtitle }) : null);

  return h('details', { class: 'group', ...(open ? { open: true } : {}) }, summary, body);
}

/* ------------------------------------------------------------------ shelf */

export function shelfView(ctx, profile) {
  const library = ctx.state.libraries[profile.id] ?? { books: [] };
  const canWrite = ctx.state.canWrite;

  const addBtn = h('button', {
    class: 'btn', type: 'button',
    disabled: !canWrite,
    title: canWrite ? '' : 'Add a GitHub token in Settings to make changes',
    onclick: () => ctx.actions.openAdd(profile),
  }, '+ Add a book');

  if (!library.books.length) {
    return frag(
      pageHead(profile.name, 'Nothing on the shelf yet', addBtn),
      emptyState(canWrite
        ? 'Add the book you are reading right now — its series is watched automatically from then on.'
        : 'This shelf is empty, and this browser is in read-only mode.'));
  }

  const sections = STATUS_ORDER.map((status) => {
    const group = library.books.filter((b) => b.status === status);
    if (!group.length) return null;

    // The finished pile is the one that grows without limit, so it gets the
    // grouping control; the others stay a simple list.
    if (status === 'read' && group.length > 1) return finishedSection(group, ctx);

    // Most recently added first; nearly always the order someone wants.
    group.sort((a, b) => String(b.added ?? '').localeCompare(String(a.added ?? '')));

    return h('section', { class: 'section' },
      h('div', { class: 'section-head' },
        h('h2', { text: STATUS_LABEL[status] }),
        h('span', { class: 'count', text: String(group.length) })),
      h('div', { class: 'books' },
        group.map((b) => bookRow(b, ctx, sideFor(b)))));
  });

  return frag(
    pageHead(profile.name, plural(library.books.length, 'book'), addBtn),
    sections);
}

/** The Finished pile, grouped however the reader last chose. */
function finishedSection(books, ctx) {
  const mode = getGrouping();

  const control = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Group finished books by' },
    GROUPINGS.map(([id, label]) => h('button', {
      class: 'seg-btn', type: 'button', role: 'tab',
      'aria-selected': String(id === mode),
      onclick: () => { setGrouping(id); ctx.actions.rerender(); },
    }, label)));

  const head = h('div', { class: 'section-head' },
    h('h2', { text: STATUS_LABEL.read }),
    h('span', { class: 'count', text: String(books.length) }),
    h('div', { class: 'spacer' }),
    control);

  if (mode === 'recent') {
    const recent = [...books].sort((a, b) =>
      String(readOnOf(b) ?? b.added ?? '').localeCompare(String(readOnOf(a) ?? a.added ?? '')));
    return h('section', { class: 'section' }, head,
      h('div', { class: 'books' }, recent.map((b) => bookRow(b, ctx, sideFor(b)))));
  }

  const groups = mode === 'series' ? groupBySeries(books) : groupByYear(books);

  return h('section', { class: 'section' }, head,
    h('div', { class: 'groups' }, groups.map((g, i) => groupBlock(g, ctx, {
      open: i === 0,
      sideFor,
      subtitle: mode === 'series'
        ? (g.average ? `avg ${g.average.toFixed(1)}` : null)
        : null,
    }))));
}

function sideFor(book) {
  if (book.status === 'read') {
    const when = fmtReadOnShort(readOnOf(book));
    if (!book.rating && !when) return null;
    return h('div', { class: 'read-side' },
      book.rating ? h('span', { class: 'stars', text: stars(book.rating) }) : null,
      when ? h('span', { class: 'when', text: when }) : null);
  }
  if (book.status === 'tbr' && book.series) return h('span', { class: 'pill', text: 'series' });
  if (book.status === 'reading') return h('span', { class: 'pill', text: 'reading' });
  return null;
}

/* --------------------------------------------------------------- upcoming */

function releaseRow(item, ctx, extra) {
  const soon = item.daysUntil <= 30;
  return h('div', { class: 'card release' },
    h('div', { class: 'release-when' },
      h('strong', { text: fmtDays(item.daysUntil) }),
      fmtDate(item.releaseDate)),
    h('div', { class: 'book-main' },
      h('div', { class: 'book-title', text: item.title }),
      h('div', { class: 'book-meta', text: item.seriesName + (item.position != null ? ` #${item.position}` : '') })),
    extra ?? (soon ? h('span', { class: `pill ${item.daysUntil === 0 ? 'today' : 'soon'}`, text: item.daysUntil === 0 ? 'out now' : 'soon' }) : null));
}

export function upcomingView(ctx, profile) {
  const library = ctx.state.libraries[profile.id] ?? { books: [] };
  const watch = deriveWatchlist(library);
  const items = upcomingFrom(ctx.state.seriesState, Object.keys(watch.series));
  const watched = Object.values(watch.series);

  return frag(
    pageHead(`Upcoming · ${profile.name}`,
      `${watched.length} series watched automatically`),
    items.length
      ? h('div', { class: 'books' }, items.map((i) => releaseRow(i, ctx)))
      : emptyState(watched.length
          ? 'No dated releases yet. The watcher checks daily — announced dates will appear here.'
          : 'No series watched yet. Start or finish a book in a series and it is watched from then on.'),
    watched.length ? h('details', { class: 'optional' },
      h('summary', { text: `Watching ${watched.length} series` }),
      h('ul', {}, watched.map((s) => h('li', { text: s.name })))) : null);
}

export function allUpcomingView(ctx) {
  const byBook = new Map();

  for (const profile of ctx.state.profiles) {
    const library = ctx.state.libraries[profile.id] ?? { books: [] };
    const watch = deriveWatchlist(library);
    for (const item of upcomingFrom(ctx.state.seriesState, Object.keys(watch.series))) {
      // One row per book, tagged with everyone waiting on it, rather than a
      // duplicate row per person.
      const key = `${item.seriesId}:${item.bookId}`;
      if (!byBook.has(key)) byBook.set(key, { ...item, who: [] });
      byBook.get(key).who.push(profile);
    }
  }

  const items = [...byBook.values()].sort((a, b) => a.daysUntil - b.daysUntil);

  return frag(
    pageHead('All upcoming', 'Every watched series, everyone'),
    items.length
      ? h('div', { class: 'books' }, items.map((item) => releaseRow(item, ctx,
          h('div', { class: 'row' }, item.who.map((p) =>
            h('span', { class: 'pill person', style: `background:${p.colour}`, text: p.name }))))))
      : emptyState('Nothing dated yet across any profile.'));
}

/* ------------------------------------------------------------- what's new */

/** Short label for the left-hand column — not a truncation of the sentence. */
const EVENT_LABEL = {
  new_book: 'New book',
  date_set: 'Date set',
  date_moved: 'Date moved',
  preorder: 'Coming soon',
  released: 'Out now',
  author_new_book: 'New title',
};

const EVENT_TEXT = {
  new_book: (e) => `New book in ${e.seriesName}`,
  date_set: (e) => `Release date announced — ${fmtDate(e.releaseDate)}`,
  date_moved: (e) => `Moved from ${fmtDate(e.previousDate)} to ${fmtDate(e.releaseDate)}`,
  preorder: (e) => `Out in ${fmtDays(e.daysUntil ?? daysUntil(e.releaseDate))}`,
  released: () => 'Out now',
  author_new_book: (e) => `New from ${e.authorName}`,
};

export function whatsNewView(ctx, profile) {
  const stamp = (e) => String(e.at ?? e.detectedAt ?? '');
  const mine = ctx.state.events
    .filter((e) => e.profile === profile.id)
    .sort((a, b) => stamp(b).localeCompare(stamp(a)));

  const since = profile.lastSeen;
  const unseen = since ? mine.filter((e) => stamp(e) > since) : mine;
  const unseenKeys = new Set(unseen.map((e) => e.key ?? stamp(e) + e.title));

  const markRead = h('button', {
    class: 'btn secondary', type: 'button',
    disabled: !unseen.length || !ctx.state.canWrite,
    onclick: () => ctx.actions.markSeen(profile),
  }, 'Mark all as read');

  const row = (e, isNew) => h('div', { class: 'card release' },
    h('div', { class: 'release-when' },
      h('strong', { text: EVENT_LABEL[e.type] ?? e.type }),
      fmtDate(e.detectedAt)),
    h('div', { class: 'book-main' },
      h('div', { class: 'book-title', text: e.title }),
      h('div', { class: 'book-meta', text: (EVENT_TEXT[e.type] ?? (() => e.type))(e) })),
    isNew ? h('span', { class: 'pill soon', text: 'new' }) : null);

  return frag(
    pageHead(`What's new · ${profile.name}`,
      unseen.length ? `${unseen.length} since you last looked` : 'All caught up', markRead),
    mine.length
      ? h('div', { class: 'books' }, mine.slice(0, 80).map((e) => row(e, unseenKeys.has(e.key ?? stamp(e) + e.title))))
      : emptyState('No release news yet. The watcher runs daily and anything it finds shows up here.'));
}

/* ----------------------------------------------------------------- shared */

export function sharedView(ctx) {
  const [a, b] = ctx.state.profiles;
  if (!a || !b) {
    return frag(pageHead('Both of us'),
      emptyState('This view compares two profiles — add a second one to use it.'));
  }

  const libA = ctx.state.libraries[a.id]?.books ?? [];
  const libB = ctx.state.libraries[b.id]?.books ?? [];
  const byId = (books) => new Map(books.map((x) => [x.id, x]));
  const mapB = byId(libB);

  const both = [];
  for (const book of libA) {
    const other = mapB.get(book.id);
    if (other) both.push({ book, mine: book, theirs: other });
  }

  const readBoth = both.filter((p) => p.mine.status === 'read' && p.theirs.status === 'read');
  const disagree = readBoth
    .filter((p) => typeof p.mine.rating === 'number' && typeof p.theirs.rating === 'number')
    .map((p) => ({ ...p, gap: Math.abs(p.mine.rating - p.theirs.rating) }))
    .filter((p) => p.gap >= 2)
    .sort((x, y) => y.gap - x.gap);

  // Name each rating rather than relying on left/right position, which is
  // guesswork for the reader.
  const rating = (person, value) => h('div', { class: 'rating-line' },
    h('span', { class: 'who', text: person.name }),
    h('span', { class: 'stars', text: stars(value) || '—' }));
  const ratingPair = (p) => h('div', { class: 'rating-pair' },
    rating(a, p.mine.rating), rating(b, p.theirs.rating));

  return frag(
    pageHead('Both of us', `${a.name} and ${b.name}`),

    h('section', { class: 'section' },
      h('div', { class: 'section-head' },
        h('h2', { text: 'Where you disagree' }),
        h('span', { class: 'count', text: String(disagree.length) })),
      disagree.length
        ? h('div', { class: 'books' }, disagree.map((p) => bookRow(p.mine, ctx, ratingPair(p), a)))
        : emptyState('No strong disagreements — you have rated everything within a star of each other.')),

    h('section', { class: 'section' },
      h('div', { class: 'section-head' },
        h('h2', { text: 'Both read' }),
        h('span', { class: 'count', text: String(readBoth.length) })),
      readBoth.length
        ? h('div', { class: 'books' }, readBoth.map((p) => bookRow(p.mine, ctx, ratingPair(p), a)))
        : emptyState('Nothing you have both finished yet.')),

    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', { text: 'On their shelf, not yours' })),
      recommendations(libA, libB, a, b, ctx)));
}

function recommendations(libA, libB, a, b, ctx) {
  const mine = new Set(libA.map((x) => x.id));
  // Their favourites you have never touched — the useful half of a shared tracker.
  const picks = libB
    .filter((x) => x.status === 'read' && (x.rating ?? 0) >= 4 && !mine.has(x.id))
    .sort((x, y) => (y.rating ?? 0) - (x.rating ?? 0))
    .slice(0, 8);

  if (!picks.length) return h('p', { class: 'empty', text: `Nothing ${b.name} has rated 4+ that ${a.name} is missing.` });
  return h('div', { class: 'books' }, picks.map((x) => bookRow(x, ctx,
    h('span', { class: 'stars', text: stars(x.rating) }), b)));
}

export { frag, pageHead, emptyState, bookRow };
