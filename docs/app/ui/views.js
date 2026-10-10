/**
 * The views rendered into <main>. Each takes the app context and returns a
 * DocumentFragment; none of them mutate state directly — they call back into
 * ctx.actions so every change goes through one save path.
 */

import {
  h, clear, starsEl, fmtDate, fmtDays, fmtReadOnShort, authorNames, coverEl, seriesLabel, daysUntil,
} from './dom.js';
import {
  readOnOf, readYearOf, tagCounts, matchesQuery, matchesRating, RATING_FILTERS,
} from '../core/model.js';
import { visibleEvents, unseenEvents, eventStamp } from '../core/watch.js';
import { getLayout, layoutToggle, coverWall } from './covers.js';
import { profileHero, readingSpotlight } from './shelfhero.js';
import { emptyArt } from './art.js';

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
function bookRow(book, ctx, side, owner, opts = {}) {
  // Inside a series group the series name is already the heading, so repeating
  // it on every row just crowds a narrow column.
  const series = opts.hideSeries
    ? (book.series?.position != null ? `#${book.series.position}` : null)
    : seriesLabel(book);
  const bits = [authorNames(book), series].filter(Boolean);
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
  ['series', 'Series'],
  ['year', 'Year'],
  ['recent', 'Recent'],
];

const GROUPING_KEY = 'bookshelf.grouping';

export function getGrouping() {
  try {
    const saved = localStorage.getItem(GROUPING_KEY);
    return GROUPINGS.some(([id]) => id === saved) ? saved : 'series';
  } catch {
    return 'series';
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
function groupBlock(group, ctx, { open, onToggle, sideFor: side, subtitle, hideSeries }) {
  const body = h('div', { class: 'books group-body' },
    // A bucket of undated books is otherwise a dead end - say how to fix it.
    group.unknown
      ? h('div', { class: 'group-hint' },
          h('span', { text: 'No read date on these. A year on its own is enough.' }),
          ctx.state.canWrite ? h('button', {
            class: 'btn secondary small', type: 'button',
            onclick: (e) => { e.stopPropagation(); ctx.actions.openDates(ctx.currentProfile); },
          }, 'Set them all') : null)
      : null,
    group.books.map((b) => bookRow(b, ctx, side(b), undefined, { hideSeries })));

  const summary = h('summary', { class: 'group-head' },
    h('span', { class: 'group-name', text: group.name }),
    h('span', { class: 'count', text: String(group.books.length) }),
    subtitle ? h('span', { class: 'group-sub', text: subtitle }) : null);

  return h('details', {
    class: 'group', ...(open ? { open: true } : {}),
    ontoggle: (e) => onToggle?.(e.currentTarget.open),
  }, summary, body);
}

/* ------------------------------------------------------------------ shelf */

// Per shelf, for this page load only: the search text, rating filter and
// which groups are open.
const filterMemory = new Map();
function shelfFilters(profileId) {
  if (!filterMemory.has(profileId)) filterMemory.set(profileId, { query: '', rating: 'all', open: new Set() });
  return filterMemory.get(profileId);
}

export function shelfView(ctx, profile) {
  const library = ctx.state.libraries[profile.id] ?? { books: [] };
  const canWrite = ctx.state.canWrite;

  const addBtn = h('button', {
    class: 'btn', type: 'button',
    disabled: !canWrite,
    title: canWrite ? '' : 'This browser cannot make changes',
    onclick: () => ctx.actions.openAdd(profile),
  }, '+ Add a book');

  if (!library.books.length) {
    return frag(
      profileHero(ctx, profile, library, { tally: null, actions: addBtn }),
      emptyArt('books', canWrite
        ? 'Add the book you are reading right now — its series is watched automatically from then on.'
        : 'This shelf is empty, and this browser is in read-only mode.'));
  }

  // Filters outlive a redraw. Every save re-renders the page, so rating a
  // book found by searching used to clear the search and fold every group
  // shut, leaving you hunting for your place.
  const filters = shelfFilters(profile.id);
  filters.repaint = () => paint();
  const columns = h('div', { class: 'shelf-columns' });
  const tally = h('span', { class: 'sub' });
  const extra = h('div', { class: 'shelf-extra' });

  const visible = () => library.books.filter((b) =>
    matchesQuery(b, filters.query) && matchesRating(b, filters.rating));

  function paint() {
    const books = visible();
    const of = (status) => books.filter((b) => b.status === status);

    clear(columns);
    // The covers layout (covers.js) or the default list layout.
    if (getLayout() === 'covers') {
      columns.className = 'shelf-wall';
      columns.append(coverWall(ctx, books));
    } else {
      // Columns, left to right: what you mean to read, what you are reading,
      // what you have read. With the spotlight above showing what is being read, a Reading now
      // column would only repeat it - so the other two get the room.
      const spotlit = library.books.some((b) => b.status === 'reading');
      columns.className = `shelf-columns${spotlit ? ' two' : ''}`;
      columns.append(...[
        plainColumn('tbr', of('tbr'), ctx),
        spotlit ? null : plainColumn('reading', of('reading'), ctx),
        finishedColumn(of('read'), ctx, filters),
      ].filter(Boolean));
    }

    const filtering = filters.query || filters.rating !== 'all';
    tally.textContent = filtering
      ? `${books.length} of ${library.books.length} books`
      : plural(library.books.length, 'book');

    const abandoned = of('abandoned');
    clear(extra).append(abandoned.length ? h('details', { class: 'optional' },
      h('summary', { text: plural(abandoned.length, 'book') + ' you gave up on' }),
      h('div', { class: 'books' }, abandoned.map((b) => bookRow(b, ctx, sideFor(b))))) : '');

    if (filtering && !books.length) {
      // The covers layout already says "Nothing to show"; one message is enough.
      clear(columns).append(h('p', { class: 'empty', text: filters.query
        ? `Nothing matches “${filters.query}”${filters.rating !== 'all' ? ' with that rating filter' : ''}.`
        : 'No books match that rating filter.' }));
    }
  }

  const search = h('input', {
    type: 'search', class: 'shelf-search', placeholder: 'Search title, author or series…', value: filters.query,
    'aria-label': 'Search this shelf', autocomplete: 'off', spellcheck: 'false',
    oninput: (e) => { filters.query = e.target.value.trim(); paint(); },
  });

  const ratingFilter = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Filter by rating' },
    RATING_FILTERS.map(([id, label]) => h('button', {
      class: 'seg-btn', type: 'button', role: 'tab',
      'aria-selected': String(id === filters.rating),
      onclick: (e) => {
        filters.rating = id;
        [...e.currentTarget.parentElement.children]
          .forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget)));
        paint();
      },
    }, label)));

  paint();

  // A shuffle through the to-read pile, for when choosing is the hard part.
  const tbrCount = library.books.filter((b) => b.status === 'tbr').length;
  const pickBtn = tbrCount > 1 ? h('button', {
    class: 'btn secondary', type: 'button', onclick: () => ctx.actions.openPicker(profile),
  }, h('span', { class: 'ico ico-dice', 'aria-hidden': 'true' }), 'Pick my next read') : null;

  const suggestBtn = h('button', {
    class: 'btn secondary', type: 'button', onclick: () => ctx.actions.goSuggest(profile),
  }, h('span', { class: 'ico ico-sparkle', 'aria-hidden': 'true' }), 'Suggest a book');

  return frag(
    profileHero(ctx, profile, library, { tally, actions: [suggestBtn, pickBtn, addBtn] }),
    readingSpotlight(ctx, profile, library.books),
    h('div', { class: 'shelf-tools' }, search, ratingFilter, layoutToggle(() => paint())),
    columns,
    extra);
}

function columnHead(label, count, extra) {
  return h('div', { class: 'col-head' },
    h('h2', { text: label }),
    h('span', { class: 'count', text: String(count) }),
    extra ?? null);
}

/** A column that is just a list: to-read and currently-reading. */
function plainColumn(status, books, ctx) {
  const sorted = [...books].sort((a, b) =>
    String(b.added ?? '').localeCompare(String(a.added ?? '')));

  return h('section', { class: 'shelf-col' },
    columnHead(STATUS_LABEL[status], books.length),
    books.length
      ? h('div', { class: 'books' }, sorted.map((b) => bookRow(b, ctx, sideFor(b))))
      : h('p', { class: 'col-empty', text: status === 'tbr' ? 'Nothing waiting.' : 'Not reading anything.' }));
}

/** The finished column, grouped however the reader last chose. */
function finishedColumn(books, ctx, filters) {
  const mode = getGrouping();

  const control = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Group finished books by' },
    GROUPINGS.map(([id, label]) => h('button', {
      class: 'seg-btn', type: 'button', role: 'tab',
      'aria-selected': String(id === mode),
      // Repaint just the columns: a full re-render would discard whatever is
      // typed in the search box.
      onclick: () => { setGrouping(id); (filters?.repaint ?? ctx.actions.rerender)(); },
    }, label)));

  const head = columnHead(STATUS_LABEL.read, books.length);

  if (!books.length) {
    return h('section', { class: 'shelf-col' }, head,
      h('p', { class: 'col-empty', text: 'Nothing finished yet.' }));
  }

  // Grouping one or two books is just noise.
  if (books.length < 3 || mode === 'recent') {
    const recent = [...books].sort((a, b) =>
      String(readOnOf(b) ?? b.added ?? '').localeCompare(String(readOnOf(a) ?? a.added ?? '')));
    return h('section', { class: 'shelf-col' },
      head,
      books.length >= 3 ? control : null,
      h('div', { class: 'books' }, recent.map((b) => bookRow(b, ctx, sideFor(b)))));
  }

  const groups = mode === 'series' ? groupBySeries(books) : groupByYear(books);

  return h('section', { class: 'shelf-col' },
    head,
    control,
    // Every group starts closed. Expanding the largest by default would undo
    // the compactness that grouping is for - the overview is the feature.
    h('div', { class: 'groups' }, groups.map((g) => groupBlock(g, ctx, {
      open: Boolean(filters?.query) || Boolean(filters?.open.has(`${mode}:${g.id}`)),
      // While searching every group is forced open; that is not a choice to remember.
      onToggle: (isOpen) => { if (filters && !filters.query) filters.open[isOpen ? 'add' : 'delete'](`${mode}:${g.id}`); },
      sideFor,
      hideSeries: mode === 'series' && !g.standalone,
      subtitle: mode === 'series' && g.average ? `avg ${g.average.toFixed(1)}` : null,
    }))));
}

function sideFor(book) {
  if (book.status === 'read') {
    const when = fmtReadOnShort(readOnOf(book));
    if (!book.rating && !when) return null;
    return h('div', { class: 'read-side' },
      book.rating ? starsEl(book.rating) : null,
      when ? h('span', { class: 'when', text: when }) : null);
  }
  if (book.status === 'tbr' && book.series) return h('span', { class: 'pill', text: 'series' });
  if (book.status === 'reading') {
    // Showing the start date is what makes the automatic stamp visible -
    // otherwise it is a silent side effect nobody can check.
    return book.started
      ? h('span', { class: 'pill', text: `since ${fmtReadOnShort(book.started)}` })
      : h('span', { class: 'pill', text: 'reading' });
  }
  return null;
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
  // Counted from today, not from the day the event was logged - a week-old
  // "out in 7 days" was already wrong the next morning.
  preorder: (e) => {
    const days = daysUntil(e.releaseDate) ?? e.daysUntil;
    return days == null ? 'Coming soon' : days <= 0 ? `Out ${fmtDate(e.releaseDate)}` : `Out ${fmtDate(e.releaseDate)} · in ${fmtDays(days)}`;
  },
  released: () => 'Out now',
  author_new_book: (e) => `New from ${e.authorName}`,
};

const FEED_PAGE = 60;

export function whatsNewView(ctx, profile) {
  const library = ctx.state.libraries[profile.id];
  const mine = visibleEvents(ctx.state.events, profile, library)
    .sort((a, b) => eventStamp(b).localeCompare(eventStamp(a)));
  const unseen = unseenEvents(ctx.state.events, profile, library);
  const unseenKeys = new Set(unseen.map((e) => e.key ?? eventStamp(e) + e.title));

  const markRead = h('button', {
    class: 'btn secondary', type: 'button',
    disabled: !unseen.length || !ctx.state.canWrite,
    onclick: () => ctx.actions.markSeen(profile),
  }, 'Mark all as read');

  // Each event opens the same panel as Upcoming - description, date history
  // and the add/hide actions - rather than being a dead end.
  const open = (e) => {
    const known = ctx.state.seriesState[e.seriesId]?.books?.[e.bookId];
    ctx.actions.openRelease({
      bookId: String(e.bookId), title: e.title, releaseDate: known?.releaseDate ?? e.releaseDate ?? null,
      image: known?.image ?? null, seriesName: e.seriesName ?? null, position: e.position ?? null,
      authorName: e.authorName ?? '', daysUntil: daysUntil(known?.releaseDate ?? e.releaseDate),
      source: e.tracked ? 'tracked' : e.authorId ? 'author' : 'series',
    }, profile);
  };

  const row = (e, isNew) => h('button', { class: `card release${isNew ? ' unread' : ''}`, type: 'button', onclick: () => open(e) },
    h('div', { class: 'release-when' },
      h('strong', { text: EVENT_LABEL[e.type] ?? e.type }),
      fmtDate(e.detectedAt)),
    h('div', { class: 'book-main' },
      h('div', { class: 'book-title', text: e.title }),
      h('div', { class: 'book-meta', text: (EVENT_TEXT[e.type] ?? (() => e.type))(e) })),
    isNew ? h('span', { class: 'pill soon', text: 'new' }) : null);

  // The log only grows, so draw a page at a time rather than silently
  // cutting it off as it used to at 80.
  const list = h('div', { class: 'books' });
  const more = h('button', { class: 'btn secondary', type: 'button' });
  let shown = 0;
  const showMore = () => {
    const next = mine.slice(shown, shown + FEED_PAGE);
    list.append(...next.map((e) => row(e, unseenKeys.has(e.key ?? eventStamp(e) + e.title))));
    shown += next.length;
    more.hidden = shown >= mine.length;
    more.textContent = `Show older (${mine.length - shown})`;
  };
  more.addEventListener('click', showMore);
  showMore();

  return frag(
    pageHead(`What's new · ${profile.name}`,
      unseen.length ? `${unseen.length} since you last looked` : 'All caught up', markRead),
    mine.length
      ? [list, h('div', { class: 'row feed-more' }, more)]
      : emptyArt('bell', 'No release news yet. The watcher runs daily and anything it finds shows up here.'));
}

export { frag, pageHead, emptyState, bookRow };
