/**
 * The top of a shelf: who it belongs to, their bookshelf of finished books,
 * and a spotlight on what they are reading right now.
 *
 * "Reading now" used to be one column of three, the same size as the to-read
 * pile. It is the book someone actually has open, so it gets the room: a
 * large cover on a blurred wash of itself (the Apple Music / Spotify
 * now-playing treatment), progress, and a finish estimate.
 */

import { h, fill, coverEl, authorNames, seriesLabel, fmtDate, fmtReadOnShort } from './dom.js';
import { readOnOf, readYearOf, readingEstimate, today } from '../core/model.js';
import { bookshelf } from './art.js';
import { avatar } from './together.js';
import { plural } from './views.js';

/** A cover as a CSS background, with anything that could escape url("…") removed. */
export const cssArt = (src) => (src ? `--art:url("${String(src).replace(/["\\\n\r]/g, '')}")` : '');

export function profileHero(ctx, profile, library, { tally, actions }) {
  const books = library.books ?? [];
  const finished = books.filter((b) => b.status === 'read')
    .sort((a, b) => String(readOnOf(a) ?? a.added ?? '').localeCompare(String(readOnOf(b) ?? b.added ?? '')));
  const year = Number(today().slice(0, 4));
  const thisYear = finished.filter((b) => readYearOf(b) === year).length;
  const pages = finished.reduce((s, b) => s + (b.pages ?? 0), 0);

  const chip = (n, label) => h('span', { class: 'ph-stat' }, h('strong', { text: n }), ` ${label}`);
  const shelf = bookshelf(finished, (b) => ctx.actions.openBook(b, profile), { label: `${profile.name}'s finished books` });
  // Most recent on the right, where the eye lands; start scrolled there.
  if (shelf) requestAnimationFrame(() => { const row = shelf.querySelector('.shelf-row'); if (row) row.scrollLeft = row.scrollWidth; });

  return h('header', { class: 'profile-hero', style: `--who:${profile.colour ?? 'var(--accent)'}` },
    h('div', { class: 'ph-top' },
      avatar(profile, { size: 'xl' }),
      h('div', { class: 'ph-name' },
        h('h1', { text: profile.name }),
        h('div', { class: 'ph-stats' },
          chip(String(finished.length), 'finished'),
          pages ? chip(pages.toLocaleString(), 'pages') : null,
          chip(String(thisYear), `in ${year}`),
          tally)),
      h('div', { class: 'spacer' }),
      h('div', { class: 'ph-actions' }, actions)),
    shelf);
}

/** Big cards for every book being read, above the columns. */
export function readingSpotlight(ctx, profile, books) {
  const reading = books.filter((b) => b.status === 'reading');
  if (!reading.length) return null;
  return h('section', { class: 'spotlight', 'aria-label': 'Reading now' },
    reading.map((b) => spotlightCard(ctx, profile, b)));
}

function spotlightCard(ctx, profile, book) {
  const est = readingEstimate(book, today());
  const canWrite = ctx.state.canWrite;
  const actions = h('div', { class: 'sl-actions' });

  const paintActions = () => fill(actions,
    canWrite ? h('button', { class: 'btn secondary small', type: 'button', onclick: editProgress },
      est.page != null ? 'Update progress' : 'Add progress') : null,
    canWrite ? h('button', { class: 'btn small', type: 'button',
      onclick: (e) => { e.currentTarget.disabled = true; ctx.actions.finishBook(profile, book); } }, 'Finished!') : null);

  // An inline page field, rather than a dialog for one number.
  function editProgress() {
    const input = h('input', {
      type: 'number', min: '0', max: book.pages ? String(book.pages) : null, inputmode: 'numeric',
      value: est.page ?? '', placeholder: 'Page', 'aria-label': `Page you are on in ${book.title}`, class: 'sl-page',
    });
    const save = () => ctx.actions.setProgress(profile, book, input.value);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') paintActions();
    });
    fill(actions,
      h('label', { class: 'sl-edit' }, 'Page ', input, book.pages ? ` of ${book.pages}` : null),
      h('button', { class: 'btn small', type: 'button', onclick: save }, 'Save'),
      h('button', { class: 'btn secondary small', type: 'button', onclick: paintActions }, 'Cancel'));
    input.focus();
    input.select();
  }
  paintActions();

  const meta = [
    est.day ? `Day ${est.day}` : null,
    book.started ? `since ${fmtReadOnShort(book.started)}` : null,
  ].filter(Boolean).join(' · ');

  const pace = est.daysLeft != null
    ? `About ${plural(est.daysLeft, 'day')} to go at ${est.pagesPerDay} pages a day — around ${fmtDate(est.finishOn)}`
    : est.page != null && book.pages ? `${book.pages - est.page} pages to go`
      : 'Add the page you are on to see when you will finish';

  return h('article', { class: 'sl-card', style: cssArt(book.cover) },
    h('div', { class: 'sl-wash', 'aria-hidden': 'true' }),
    h('button', { class: 'sl-cover', type: 'button', onclick: () => ctx.actions.openBook(book, profile),
      'aria-label': `Open ${book.title}` }, coverEl(book)),
    h('div', { class: 'sl-main' },
      h('div', { class: 'eyebrow', text: 'Reading now' }),
      h('h2', { class: 'sl-title', text: book.title }),
      h('div', { class: 'sl-meta', text: [authorNames(book), seriesLabel(book)].filter(Boolean).join(' · ') }),
      meta ? h('div', { class: 'sl-meta', text: meta }) : null,
      h('div', { class: 'sl-progress' },
        h('div', { class: 'sl-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100',
          'aria-valuenow': String(est.percent ?? 0), 'aria-label': `Progress through ${book.title}` },
          h('span', { style: `width:${est.percent ?? 0}%` })),
        h('div', { class: 'sl-progress-text' },
          est.percent != null ? h('strong', { text: `${est.percent}%` }) : null,
          est.page != null ? ` · page ${est.page}${book.pages ? ` of ${book.pages}` : ''}` : null)),
      h('p', { class: 'sl-pace', text: pace }),
      actions));
}
