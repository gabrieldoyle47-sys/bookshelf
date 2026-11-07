/**
 * The bookshelf: each profile's landing page.
 *
 * Every book standing in a wooden case, arranged the way a person would shelve
 * them (core/arrange.js): a series together and in order, an author's books
 * together, authors gathered by genre - each genre opening with an engraved
 * bookend. Spines are coloured and finished per series, so a set reads as a
 * set. Books being read stand proud with a ribbon; books not yet read are
 * crisp and new.
 *
 * Books drop onto the shelves on arrival, lift on hover with a peek at the
 * cover, and open on click.
 */

import { h, fill, coverEl, authorNames, seriesLabel, starsEl, countUp } from './dom.js';
import { arrangeShelf, shelvable } from '../core/arrange.js';
import { readOnOf } from '../core/model.js';
import { shelfPalette, emptyArt, ornament } from './art.js';
import { avatar } from './together.js';

const FILTERS = [['all', 'Everything'], ['read', 'Read'], ['reading', 'Reading'], ['tbr', 'To read']];
const ARRANGE = [['shelf', 'By series & genre'], ['rainbow', 'Rainbow']];
const prefs = { filter: 'all', arrange: 'shelf' };
try { Object.assign(prefs, JSON.parse(sessionStorage.getItem('bookshelf.library') ?? '{}')); } catch { /* private mode */ }
const savePrefs = () => { try { sessionStorage.setItem('bookshelf.library', JSON.stringify(prefs)); } catch { /* ignore */ } };

export function libraryView(ctx, profile) {
  const library = ctx.state.libraries[profile.id] ?? { books: [] };
  const all = shelvable(library.books);
  const canWrite = ctx.state.canWrite;
  const animate = ctx.state.navigated && !matchMedia('(prefers-reduced-motion: reduce)').matches;

  const addBtn = h('button', { class: 'btn', type: 'button', disabled: !canWrite,
    onclick: () => ctx.actions.openAdd(profile) }, '+ Add a book');
  const booksBtn = h('button', { class: 'btn secondary', type: 'button',
    onclick: () => { location.hash = `#/p/${profile.id}/shelf`; } }, 'Browse as a list →');

  const n = (k) => all.filter((b) => b.status === k).length;
  const stat = (value, label) => {
    const num = h('strong', { text: String(value) });
    if (animate) countUp(num, value);
    return h('span', { class: 'lib-stat' }, num, ` ${label}`);
  };

  const head = h('header', { class: 'lib-head', style: `--who:${profile.colour ?? 'var(--accent)'}` },
    avatar(profile, { size: 'xl' }),
    h('div', { class: 'lib-title' },
      h('div', { class: 'eyebrow', text: 'The bookshelf' }),
      h('h1', { text: `${profile.name}’s shelf` }),
      h('div', { class: 'lib-stats' }, stat(all.length, all.length === 1 ? 'book' : 'books'),
        stat(n('read'), 'read'), stat(n('reading'), 'reading'), stat(n('tbr'), 'to read'))),
    h('div', { class: 'spacer' }),
    h('div', { class: 'lib-actions' }, booksBtn, addBtn));

  if (!all.length) {
    return h('div', { class: 'library' }, head,
      emptyArt('books', `${profile.name}’s shelf is empty. Add the book you are reading now and it will be the first one here.`));
  }

  const caseBox = h('div', { class: 'bookcase' });
  const chips = (items, current, set, label) => h('div', { class: 'seg', role: 'tablist', 'aria-label': label },
    items.map(([id, text]) => h('button', {
      class: 'seg-btn', type: 'button', role: 'tab', 'aria-selected': String(id === current()),
      onclick: (e) => {
        set(id);
        for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-selected', String(b === e.currentTarget));
        savePrefs();
        paint(true);
      },
    }, text)));

  const tools = h('div', { class: 'lib-tools' },
    chips(FILTERS, () => prefs.filter, (v) => { prefs.filter = v; }, 'Which books'),
    h('div', { class: 'spacer' }),
    chips(ARRANGE, () => prefs.arrange, (v) => { prefs.arrange = v; }, 'How to arrange them'));

  // One palette for the whole shelf, so no two series share a colour.
  const colourOf = shelfPalette(all);

  function paint(withMotion) {
    const books = prefs.filter === 'all' ? all : all.filter((b) => b.status === prefs.filter);
    let i = 0;
    const spine = (b) => spineEl(ctx, profile, b, colourOf(b), withMotion ? i++ : null);

    if (!books.length) {
      fill(caseBox, bookcase([h('p', { class: 'lib-empty', text: 'No books on this part of the shelf.' })]));
      return;
    }

    let items;
    if (prefs.arrange === 'rainbow') {
      // Sorted by spine colour: a shelf you'd photograph.
      const sorted = [...books].sort((a, b) => hue(colourOf(a).cloth) - hue(colourOf(b).cloth));
      items = [bookend('Rainbow'), h('div', { class: 'shelf-group' }, sorted.map(spine))];
    } else {
      // Each genre opens with a bookend carrying its name; then each author's
      // series and standalones, in order (core/arrange.js).
      items = arrangeShelf(books).flatMap((section) => [
        bookend(section.genre, section.count),
        ...section.authors.flatMap((author) => author.groups.map((g) => h('div', {
          class: 'shelf-group', title: g.name ?? `${author.name} — standalones`,
        },
          g.books.map(spine),
          // A label on the plank under a series - only where it can be read.
          g.name && g.books.length >= 3 ? h('span', { class: 'shelf-mark', text: g.name }) : null))),
      ]);
    }
    // Ornaments at the end, so a short shelf looks lived-in rather than empty.
    items.push(lyingStack(books, colourOf), ornament('plant'), ornament('candle'));
    fill(caseBox, bookcase(items));
  }

  paint(animate);
  return h('div', { class: 'library' }, head, tools, caseBox, legend());
}

/** The case: a carved top, shelves that wrap, a plinth. */
function bookcase(items) {
  return h('div', { class: 'case' },
    h('div', { class: 'case-crown', 'aria-hidden': 'true' }),
    h('div', { class: 'case-shelves' }, items),
    h('div', { class: 'case-plinth', 'aria-hidden': 'true' }));
}

/** A bookend engraved with the genre that follows it. */
function bookend(title, count) {
  return h('div', { class: 'bookend', role: 'heading', 'aria-level': '2', 'aria-label': count ? `${title}, ${count} books` : title },
    h('span', { class: 'bookend-text', text: title }));
}

/** A few books lying flat - in the shelf's own colours. */
function lyingStack(books, colourOf) {
  const picks = books.slice(-3).map((b) => colourOf(b).cloth);
  while (picks.length < 3) picks.push('#6b4f2a');
  return h('span', { class: 'ornament lying', 'aria-hidden': 'true' },
    picks.map((c, n) => h('span', { class: 'lying-book', style: `--cloth:${c};--n:${n}` })));
}

/** A spine for the bookshelf page: same family as the profile header's, with more to say. */
function spineEl(ctx, profile, b, style, order) {
  const { cloth, finish } = style;
  const pages = Math.min(b.pages ?? 320, 1300);
  const t = Math.max(0, Math.min(1, (pages - 150) / 1000));
  const pos = b.series?.position;
  const label = `${b.title}${seriesLabel(b) ? `, ${seriesLabel(b)}` : ''}${b.rating ? `, rated ${b.rating}` : ''}`
    + (b.status === 'reading' ? ', reading now' : b.status === 'tbr' ? ', to read' : '');
  const el = h('button', {
    class: `lspine ${finish} ${b.status}${b.rating >= 5 ? ' gilt' : ''}`, type: 'button',
    style: `--h:${Math.round(118 + t * 40)}px;--w:${Math.round(25 + t * 18)}px;--cloth:${cloth}${order != null ? `;--i:${order}` : ''}`,
    'aria-label': label,
    onclick: () => ctx.actions.openBook(b, profile),
  },
    h('span', { class: 'lspine-title', text: b.title }),
    pos != null && Number.isInteger(pos) ? h('span', { class: 'lspine-num', text: String(pos) }) : null,
    b.status === 'reading' ? h('span', { class: 'lspine-ribbon', 'aria-hidden': 'true' }) : null);
  if (order != null) el.classList.add('drop');
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') peek(el, b); });
  el.addEventListener('pointerleave', hidePeek);
  el.addEventListener('focus', () => peek(el, b));
  el.addEventListener('blur', hidePeek);
  return el;
}

/* ---------------------------------------------------------------- peek */

let peekEl = null;

/** A little card above the spine: the cover, the title, where it stands. */
function peek(anchor, b) {
  if (!peekEl) {
    peekEl = h('div', { class: 'spine-peek', 'aria-hidden': 'true' });
    document.body.append(peekEl);
    addEventListener('scroll', hidePeek, { passive: true, capture: true });
  }
  const when = b.status === 'read' && readOnOf(b) ? `Read ${String(readOnOf(b)).slice(0, 4)}` : null;
  fill(peekEl,
    coverEl(b),
    h('div', { class: 'peek-main' },
      h('div', { class: 'peek-title', text: b.title }),
      h('div', { class: 'peek-meta', text: [authorNames(b), seriesLabel(b)].filter(Boolean).join(' · ') }),
      b.rating ? starsEl(b.rating) : null,
      h('div', { class: 'peek-meta', text: [
        { read: 'Finished', reading: 'Reading now', tbr: 'On the to-read pile' }[b.status], when, b.pages ? `${b.pages} pages` : null,
      ].filter(Boolean).join(' · ') })));
  const r = anchor.getBoundingClientRect();
  peekEl.classList.add('show');
  const w = peekEl.offsetWidth;
  const hgt = peekEl.offsetHeight;
  const left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const top = r.top - hgt - 12 > 8 ? r.top - hgt - 12 : r.bottom + 12;
  peekEl.style.left = `${left}px`;
  peekEl.style.top = `${top}px`;
}

function hidePeek() { peekEl?.classList.remove('show'); }

/* -------------------------------------------------------------- legend */

function legend() {
  return h('div', { class: 'lib-legend', 'aria-hidden': 'true' },
    h('span', {}, h('i', { class: 'key series' }), 'Same colour, same series'),
    h('span', {}, h('i', { class: 'key num' }, '3'), 'Number in the series'),
    h('span', {}, h('i', { class: 'key gilt' }), 'Gold bands: five stars'),
    h('span', {}, h('i', { class: 'key ribbon' }), 'Ribbon: reading now'),
    h('span', {}, h('i', { class: 'key tbr' }), 'Crisp and new: to read'));
}

/** Hue of a #rrggbb colour, for the rainbow arrangement. */
function hue(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const hh = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (hh * 60 + 360) % 360;
}

