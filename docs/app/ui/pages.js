/**
 * An author's page and a series' page - where an author's or a series'
 * name leads, from an open book, Stats or Recommendations.
 *
 * Both are built from Hardcover (through the Worker) and laid over what is on
 * everyone's shelves: who has read which book, what is still to come, and for
 * a series, the reader's own who's who and "Previously on…".
 */

import { h, fill, coverEl, coverSrc, starsEl, fmtRelease, buyLinks } from './dom.js';
import { today } from '../core/model.js';
import { completedSeries } from '../core/watch.js';
import { avatar } from './together.js';
import { previouslyOn, whosWhoBox } from './memory.js';
import { emptyArt, trinketFor, trinketArt, shelfPalette } from './art.js';
import { plural } from './views.js';

const cache = new Map();
/** One fetch per page load for each author and series; a failure is retried next time. */
function load(kind, id, fetcher) {
  const key = `${kind}:${id}`;
  if (!cache.has(key)) {
    const p = fetcher(id);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key);
}

/** Whose shelf a Hardcover book is on, and how far they are with it. */
function readersOf(ctx, book, seriesId = null) {
  const out = [];
  for (const p of ctx.state.profiles) {
    const mine = (ctx.state.libraries[p.id]?.books ?? []).find((b) => b.hardcoverId === String(book.id)
      || (seriesId && book.position != null && b.series?.id === String(seriesId) && b.series.position === book.position));
    if (mine && mine.status !== 'abandoned') out.push({ profile: p, book: mine });
  }
  return out;
}

const STATE = { read: 'read it', reading: 'reading it', tbr: 'wants to read it', wish: 'wishes for it' };

/** Little faces under a book: who has it, ringed by how far they are. */
function readerDots(readers) {
  if (!readers.length) return null;
  return h('span', { class: 'pg-readers' }, readers.map(({ profile, book }) => h('span', {
    class: `pg-reader ${book.status}`, title: `${profile.name} ${STATE[book.status] ?? ''}${book.rating ? ` · ${book.rating}★` : ''}`,
  }, avatar(profile))));
}

/** Open a book the best way available: someone's own copy, or a preview. */
function openFrom(ctx, book, readers) {
  const viewer = readers.find((r) => r.profile.id === ctx.state.viewer) ?? readers[0];
  if (viewer) return ctx.actions.openBook(viewer.book, viewer.profile);
  return ctx.actions.openBookPreview({ ...book, cover: book.image, released: book.releaseDate });
}

const loading = (text) => h('div', { class: 'pg-loading' }, h('div', { class: 'skeleton pg-sk-head' }), h('p', { class: 'hint', text }));

/* ------------------------------------------------------------------ author */

export function authorView(ctx, id) {
  const root = h('div', { class: 'pg author-page' }, loading('Finding the author…'));
  load('author', id, ctx.actions.fetchAuthor).then((a) => {
    if (!a) return fill(root, emptyArt('books', 'Hardcover has no author by that id.'));
    document.title = `${a.name} — Bookshelf`;
    const now = today();
    const books = [...a.books].sort((x, y) => String(x.releaseDate ?? x.releaseYear ?? '9999').localeCompare(String(y.releaseDate ?? y.releaseYear ?? '9999')));
    const coming = books.filter((b) => b.releaseDate && b.releaseDate > now);
    const out = books.filter((b) => !coming.includes(b));
    const shelfCounts = ctx.state.profiles.map((p) => {
      const mine = (ctx.state.libraries[p.id]?.books ?? []).filter((b) => b.authors?.some((x) => x.id === a.id) && b.status !== 'abandoned');
      return { p, read: mine.filter((b) => b.status === 'read').length, total: mine.length };
    }).filter((x) => x.total);

    const bio = a.bio ? h('p', { class: 'pg-bio clamp', text: a.bio }) : null;
    fill(root,
      h('header', { class: 'pg-head' },
        a.image ? h('img', { class: 'pg-photo', src: coverSrc(a.image, 160), alt: '', loading: 'lazy' })
          : h('div', { class: 'pg-photo none', 'aria-hidden': 'true', text: a.name.slice(0, 1) }),
        h('div', { class: 'pg-title' },
          h('div', { class: 'eyebrow', text: 'Author' }),
          h('h1', { text: a.name }),
          h('div', { class: 'pg-sub', text: [a.location ? `From ${a.location}` : null, a.bornYear ? `born ${a.bornYear}` : null].filter(Boolean).join(' · ') }),
          shelfCounts.length ? h('div', { class: 'pg-shelfs' }, shelfCounts.map(({ p, read, total }) => h('span', { class: 'pg-shelf' },
            avatar(p), `${p.name}: ${read} read${total > read ? `, ${total - read} more on the shelf` : ''}`))) : null)),
      bio, bio ? h('button', { class: 'link-btn more', type: 'button', onclick: (e) => {
        bio.classList.toggle('clamp');
        e.currentTarget.textContent = bio.classList.contains('clamp') ? 'Show more' : 'Show less';
      } }, 'Show more') : null,
      coming.length ? section('Coming next', coming.slice(0, 6).map((b) => bookCard(ctx, b, { upcoming: true }))) : null,
      booksSection(ctx, out));
  }).catch((err) => fill(root, h('p', { class: 'hint error', text: err.message })));
  return root;
}

/**
 * An author's books: the best known first, then everything on a click. A
 * prolific author has sixty, and a wall of sixty covers says nothing.
 */
function booksSection(ctx, books) {
  const TOP = 18;
  const onShelves = (b) => readersOf(ctx, b).length > 0;
  const top = new Set([...books].sort((x, y) => Number(onShelves(y)) - Number(onShelves(x)) || y.usersCount - x.usersCount).slice(0, TOP));
  const grid = h('div', { class: 'pg-grid' });
  const paint = (all) => fill(grid, books.filter((b) => all || top.has(b)).map((b) => bookCard(ctx, b)));
  paint(books.length <= TOP);
  const more = books.length > TOP ? h('button', { class: 'btn secondary small pg-more', type: 'button', onclick: (e) => {
    paint(true);
    e.currentTarget.remove();
  } }, `Show all ${books.length}`) : null;
  return h('section', { class: 'section pg-section' },
    h('div', { class: 'section-head' }, h('h2', { text: 'Books' }),
      h('span', { class: 'count', text: books.length > TOP ? `the best known, oldest first` : `oldest first` })),
    grid, more);
}

function section(title, cards, sub = null) {
  if (!cards.length) return null;
  return h('section', { class: 'section pg-section' },
    h('div', { class: 'section-head' }, h('h2', { text: title }), sub ? h('span', { class: 'count', text: sub }) : null),
    h('div', { class: 'pg-grid' }, cards));
}

function bookCard(ctx, b, { upcoming = false } = {}) {
  const readers = readersOf(ctx, b);
  const when = upcoming ? fmtRelease(b.releaseDate) : null;
  return h('button', { class: `pg-card${readers.length ? ' owned' : ''}`, type: 'button', onclick: () => openFrom(ctx, b, readers),
    title: b.title },
    coverEl({ cover: b.image, title: b.title }),
    h('span', { class: 'pg-card-title', text: b.title }),
    h('span', { class: 'pg-card-meta', text: upcoming ? when.date
      : [b.series?.name ? `${b.series.name}${b.series.position != null ? ` #${b.series.position}` : ''}` : null, b.releaseYear].filter(Boolean).join(' · ') }),
    readerDots(readers));
}

/* ------------------------------------------------------------------ series */

export function seriesView(ctx, id) {
  const root = h('div', { class: 'pg series-page' }, loading('Finding the series…'));
  load('series', id, ctx.actions.fetchSeries).then((s) => {
    if (!s) return fill(root, emptyArt('books', 'Hardcover has no series by that id.'));
    document.title = `${s.name} — Bookshelf`;
    const now = today();
    const viewer = ctx.state.profiles.find((p) => p.id === ctx.state.viewer) ?? ctx.state.profiles[0];
    const mainBooks = s.books.filter((b) => Number.isInteger(b.position) && b.position > 0);
    const extras = s.books.filter((b) => !mainBooks.includes(b));

    // Who finished it: a trophy line, the same trinket as their cabinet.
    const winners = ctx.state.profiles.filter((p) => completedSeries(ctx.state.seriesState ?? {}, ctx.state.libraries[p.id] ?? { books: [] }, now)
      .some((x) => String(x.id) === String(s.id)));
    const anyShelf = ctx.state.profiles.map((p) => ctx.state.libraries[p.id]?.books ?? []).flat().filter((b) => b.series?.id === String(s.id));
    const colour = anyShelf.length ? shelfPalette(anyShelf)(anyShelf[0]).cloth : '#8a2d2d';

    // How far the viewer has got, for spoiler-safe notes and the recap.
    const mine = (ctx.state.libraries[viewer.id]?.books ?? []).filter((b) => b.series?.id === String(s.id));
    const furthest = Math.max(0, ...mine.filter((b) => b.status === 'read' || b.status === 'reading').map((b) => b.series.position ?? 0));
    const nextUp = mainBooks.find((b) => b.position > furthest && !mine.some((m) => m.series.position === b.position && m.status === 'read'));

    const years = s.books.map((b) => b.releaseYear).filter(Boolean);
    fill(root,
      h('header', { class: 'pg-head series' },
        h('div', { class: 'pg-stack', 'aria-hidden': 'true' }, mainBooks.slice(0, 4).map((b, i) => h('span', { style: `--i:${i}` }, coverEl({ ...b, cover: b.image })))),
        h('div', { class: 'pg-title' },
          h('div', { class: 'eyebrow', text: 'Series' }),
          h('h1', { text: s.name }),
          h('div', { class: 'pg-sub' }, s.author ? ['by ', h('a', { href: `#/author/${s.author.id}` }, s.author.name)] : null,
            ` · ${plural(mainBooks.length, 'book')}${extras.length ? ` and ${extras.length} extra${extras.length === 1 ? '' : 's'}` : ''}`,
            years.length ? ` · ${Math.min(...years)}–${Math.max(...years)}` : null),
          winners.length ? h('div', { class: 'pg-trophy' }, trinketArt(trinketFor(anyShelf.flatMap((b) => b.genres ?? [])), colour),
            `${winners.map((p) => p.name).join(' and ')} finished the whole series`) : null)),
      h('div', { class: 'pg-columns' },
        h('section', { class: 'section pg-order' },
          h('div', { class: 'section-head' }, h('h2', { text: 'Reading order' })),
          h('ol', { class: 'pg-list' }, orderRows(ctx, s, mainBooks, now)),
          extras.length ? h('details', { class: 'pg-extras' },
            h('summary', { text: `${plural(extras.length, 'novella')} and extras` }),
            h('ol', { class: 'pg-list' }, extras.map((b) => orderRow(ctx, s, b, now)))) : null),
        h('aside', { class: 'pg-side' },
          h('div', { class: 'pg-side-head' }, avatar(viewer), h('span', { text: `${viewer.name}’s notes` })),
          nextUp && nextUp.position > 1 ? previouslyOn(ctx, viewer, { seriesId: s.id, seriesName: s.name, before: nextUp.position }) : null,
          whosWhoBox(ctx, viewer, { seriesId: s.id, upTo: Math.max(1, furthest), open: true }),
          nextUp ? h('div', { class: 'pg-next' },
            h('div', { class: 'k', text: 'Next to read' }),
            h('strong', { text: `${nextUp.position}. ${nextUp.title}` }),
            nextUp.releaseDate && nextUp.releaseDate > now ? h('div', { class: 'hint', text: `Out ${fmtRelease(nextUp.releaseDate).date}` }) : null,
            buyLinks({ title: nextUp.title, authorName: s.author?.name ?? '' }, { released: !(nextUp.releaseDate > now) })) : null)));
  }).catch((err) => fill(root, h('p', { class: 'hint error', text: err.message })));
  return root;
}

/**
 * The reading order. Announced books with no title yet ("Untitled #7") are
 * placeholders: the first is shown, the rest fold into one line.
 */
function orderRows(ctx, s, books, now) {
  const untitled = (b) => b.releaseDate > now && /^untitled\b/i.test(b.title);
  const firstUntitled = books.findIndex(untitled);
  const folded = firstUntitled < 0 ? [] : books.slice(firstUntitled + 1).filter(untitled);
  const rows = books.filter((b) => !folded.includes(b)).map((b) => orderRow(ctx, s, b, now));
  if (folded.length) {
    const years = folded.map((b) => b.releaseYear).filter(Boolean);
    rows.push(h('li', { class: 'pg-row pg-folded' }, h('span', { class: 'pg-pos', text: '…' }),
      h('span', { class: 'hint', text: `${plural(folded.length, 'more book')} announced, still untitled${years.length ? ` — through ${Math.max(...years)}` : ''}` })));
  }
  return rows;
}

function orderRow(ctx, s, b, now) {
  const readers = readersOf(ctx, b, s.id);
  const upcoming = b.releaseDate && b.releaseDate > now;
  return h('li', { class: `pg-row${upcoming ? ' upcoming' : ''}${Number.isInteger(b.position) ? '' : ' extra'}` },
    h('button', { class: 'pg-row-main', type: 'button', onclick: () => openFrom(ctx, b, readers) },
      h('span', { class: 'pg-pos', text: b.position != null ? String(b.position) : '–' }),
      coverEl({ ...b, cover: b.image }),
      h('span', { class: 'book-main' },
        h('span', { class: 'book-title', text: b.title }),
        h('span', { class: 'book-meta', text: upcoming ? `Out ${fmtRelease(b.releaseDate).date}`
          : [b.releaseYear, b.pages ? `${b.pages} pages` : null].filter(Boolean).join(' · ') }),
        b.rating ? h('span', { class: 'pg-hc-rating', title: 'Average on Hardcover' }, starsEl(Math.round(b.rating * 2) / 2), ` ${b.rating.toFixed(1)}`) : null)),
    readerDots(readers));
}
