/**
 * Cover wall — an alternative shelf layout that shows book covers as a grid
 * instead of rows of text.
 *
 * TRIAL FEATURE. Deliberately self-contained so it can be removed cleanly:
 * everything lives in this file plus one clearly-marked CSS block, and
 * views.js touches it in exactly two places (the layout toggle and one branch
 * in shelfView's paint). Reverting the commit that added it removes it whole.
 */

import { h, stars, authorNames, seriesLabel, fmtReadOnShort } from './dom.js';
import { readOnOf } from '../core/model.js';

const LAYOUT_KEY = 'bookshelf.layout';

export const LAYOUTS = [
  ['list', 'List'],
  ['covers', 'Covers'],
];

export function getLayout() {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY);
    return LAYOUTS.some(([id]) => id === saved) ? saved : 'list';
  } catch {
    return 'list';
  }
}

export function setLayout(value) {
  try { localStorage.setItem(LAYOUT_KEY, value); } catch { /* private mode */ }
}

/** The List / Covers switch that sits with the shelf's other controls. */
export function layoutToggle(onChange) {
  const current = getLayout();
  return h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Shelf layout' },
    LAYOUTS.map(([id, label]) => h('button', {
      class: 'seg-btn', type: 'button', role: 'tab',
      'aria-selected': String(id === current),
      onclick: (e) => {
        setLayout(id);
        [...e.currentTarget.parentElement.children]
          .forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget)));
        onChange();
      },
    }, label)));
}

const SECTIONS = [
  ['tbr', 'Want to read'],
  ['reading', 'Reading now'],
  ['read', 'Finished'],
];

/**
 * One cover.
 *
 * The title sits under the image rather than only on hover: a wall of covers
 * is unusable on a phone if identifying a book needs a pointer, and plenty of
 * covers are illegible at this size anyway.
 */
function tile(book, ctx) {
  const caption = [];
  if (book.status === 'read') {
    if (book.rating) caption.push(h('span', { class: 'stars', text: stars(book.rating) }));
    const when = fmtReadOnShort(readOnOf(book));
    if (when) caption.push(h('span', { class: 'tile-when', text: when }));
  }
  if (book.status === 'reading' && book.started) {
    caption.push(h('span', { class: 'tile-when', text: `since ${fmtReadOnShort(book.started)}` }));
  }

  const art = book.cover
    ? h('img', {
        class: 'tile-art', src: book.cover, alt: '', loading: 'lazy',
        onerror: (e) => e.target.replaceWith(
          h('div', { class: 'tile-art tile-fallback' }, h('span', { text: book.title }))),
      })
    : h('div', { class: 'tile-art tile-fallback' }, h('span', { text: book.title }));

  return h('button', {
    class: 'tile', type: 'button',
    title: `${book.title}${seriesLabel(book) ? ` — ${seriesLabel(book)}` : ''}`,
    onclick: () => ctx.actions.openBook(book),
  },
    art,
    h('span', { class: 'tile-title', text: book.title }),
    h('span', { class: 'tile-meta', text: authorNames(book) }),
    caption.length ? h('span', { class: 'tile-caption' }, caption) : null);
}

/**
 * The wall itself. Keeps the same three sections as the list layout so
 * switching between them does not rearrange what you are looking at.
 */
export function coverWall(ctx, books) {
  const wall = h('div', { class: 'cover-wall' });

  for (const [status, label] of SECTIONS) {
    const group = books.filter((b) => b.status === status);
    if (!group.length) continue;

    // Finished books read most recently first; the rest by when they were added.
    group.sort((a, b) => status === 'read'
      ? String(readOnOf(b) ?? b.added ?? '').localeCompare(String(readOnOf(a) ?? a.added ?? ''))
      : String(b.added ?? '').localeCompare(String(a.added ?? '')));

    wall.append(h('section', { class: 'wall-section' },
      h('div', { class: 'col-head' },
        h('h2', { text: label }),
        h('span', { class: 'count', text: String(group.length) })),
      h('div', { class: 'tiles' }, group.map((b) => tile(b, ctx)))));
  }

  if (!wall.children.length) {
    wall.append(h('p', { class: 'empty', text: 'Nothing to show.' }));
  }
  return wall;
}
