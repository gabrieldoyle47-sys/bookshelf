/**
 * A book, opened.
 *
 * Clicking a book anywhere on the site lifts it off the shelf and opens it:
 * the cover swings back and the details are printed on its pages - the
 * rating, the note, when it was read and how fast, and for a series what
 * happened before and who everyone is. "Edit" leads on to the usual panel.
 * Closing swings the cover shut again.
 *
 * On a wide screen it is a two-page spread; on a phone, one page, the cover
 * opening away to the left.
 */

import { h, fill, coverEl, authorNames, starsEl, fmtReadOn, fmtRating, buyLinks } from './dom.js';
import { readOnOf, cleanTags, isAudiobook, audioHours, REACTIONS, reactionSummary } from '../core/model.js';
import { shelfPalette } from './art.js';
import { previouslyOn, whosWhoBox } from './memory.js';

const STATUS = { read: 'Finished', reading: 'Reading now', tbr: 'On the to-read pile', abandoned: 'Put down' };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let dialog = null;

export function openBookView(ctx, book, profile) {
  if (!dialog) {
    dialog = h('dialog', { class: 'ob-dialog', 'aria-label': 'Book' });
    document.body.append(dialog);
    // Escape and a click outside the book both close it the slow way.
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); dialog.closeBook?.(); });
    dialog.addEventListener('click', (e) => { if (e.target === dialog || e.target.classList.contains('ob-stage')) dialog.closeBook?.(); });
  }
  if (dialog.open) dialog.close();

  const library = ctx.state.libraries[profile.id] ?? { books: [] };
  const cloth = shelfPalette(library.books)(book).cloth;
  const wide = innerWidth >= 760;
  const pageA = leftPage(ctx, book, profile);
  const pageB = rightPage(ctx, book, profile, () => closeBook());

  const front = h('div', { class: 'ob-face front', style: `--cloth:${cloth}` },
    book.cover ? coverEl(book) : h('div', { class: 'ob-plain-cover' }, h('span', { text: book.title })));
  const back = h('div', { class: 'ob-face back' },
    wide ? [h('div', { class: 'ob-page-inner' }, pageA), h('span', { class: 'ob-folio', text: '1' })] : h('div', { class: 'ob-endpaper' }));
  const cover = h('div', { class: 'ob-cover' }, front, back);
  const right = h('div', { class: 'ob-page right' },
    h('div', { class: 'ob-page-inner' }, wide ? null : pageA, pageB), h('span', { class: 'ob-folio', text: wide ? '2' : '1' }));
  const bookEl = h('div', { class: `ob-book closed ${wide ? 'spread' : 'single'}`, style: `--cloth:${cloth}` },
    h('div', { class: 'ob-spine-edge', 'aria-hidden': 'true' }), right, cover);
  fill(dialog, h('div', { class: 'ob-stage' }, bookEl));
  dialog.setAttribute('aria-label', book.title);
  dialog.classList.remove('closing');
  dialog.showModal();
  dialog.querySelector('.ob-close')?.focus({ preventScroll: true });

  // Two frames, so the closed state is painted before the cover swings.
  requestAnimationFrame(() => requestAnimationFrame(() => bookEl.classList.remove('closed')));

  let closing = false;
  function closeBook(then) {
    if (closing) return;
    closing = true;
    bookEl.classList.add('closed');
    dialog.classList.add('closing');
    setTimeout(() => {
      dialog.close();
      dialog.closeBook = null;
      then?.();
    }, reduced() ? 0 : 760);
  }
  dialog.closeBook = closeBook;
  dialog.editBook = () => closeBook(() => ctx.actions.editBook(book, profile));
}

/* ------------------------------------------------------------- left page */

function leftPage(ctx, book, profile) {
  const author = book.authors?.[0];
  const pos = book.series?.position;
  const days = book.started && book.finished
    ? Math.max(1, Math.round((new Date(book.finished) - new Date(book.started)) / 864e5) + 1) : null;
  const facts = [
    ['Started', book.started ? fmtReadOn(book.started) : null],
    ['Finished', book.status === 'read' ? (book.finished ? fmtReadOn(book.finished) : readOnOf(book) ? fmtReadOn(readOnOf(book)) : 'Yes') : null],
    ['Read in', days ? `${days} day${days === 1 ? '' : 's'}` : null],
    ['Pages', book.pages ? book.pages.toLocaleString() : null],
    ['Pace', days && book.pages && !isAudiobook(book) ? `${Math.round(book.pages / days)} pages a day` : null],
    ['Listening', isAudiobook(book) ? (audioHours(book) ? `${audioHours(book)} hours` : 'Audiobook') : null],
    ['Narrated by', isAudiobook(book) && book.audio?.narrators?.length ? book.audio.narrators.join(', ') : null],
    ['Progress', book.status === 'reading' && book.progress?.page
      ? `Page ${book.progress.page}${book.pages ? ` of ${book.pages}` : ''}` : null],
    ['Published', book.releaseYear ? String(book.releaseYear) : null],
  ].filter(([, v]) => v);

  return h('div', { class: 'ob-left' },
    h('div', { class: 'ob-eyebrow', text: `${profile.name}’s copy · ${STATUS[book.status] ?? ''}` }),
    h('h2', { class: 'ob-title', text: book.title }),
    h('div', { class: 'ob-by' }, 'by ',
      author?.id ? h('a', { href: `#/author/${author.id}`, onclick: () => dialog.close() }, authorNames(book)) : authorNames(book)),
    book.series?.id ? h('div', { class: 'ob-series' },
      pos != null ? `Book ${pos} of ` : '',
      h('a', { href: `#/series/${book.series.id}`, onclick: () => dialog.close() }, book.series.name)) : null,
    h('div', { class: 'ob-rule', 'aria-hidden': 'true' }),
    book.rating ? h('div', { class: 'ob-rating' },
      starsEl(book.rating), h('span', { class: 'ob-rating-n', text: `${fmtRating(book.rating)} / 5` }),
      reactionBar(ctx, profile, book, 'rating')) : null,
    book.note ? h('blockquote', { class: 'ob-note', text: book.note }) : null,
    facts.length ? h('dl', { class: 'ob-facts' }, facts.map(([k, v]) => h('div', {},
      h('dt', { text: k }), h('dd', {}, v,
        k === 'Finished' ? reactionBar(ctx, profile, book, 'finished') : null)))) : null);
}

/* ------------------------------------------------------------ right page */

function rightPage(ctx, book, profile, close) {
  const tags = cleanTags(book.genres, 3);
  const moods = (book.moods ?? []).slice(0, 2);
  const pos = book.series?.position;
  return h('div', { class: 'ob-right' },
    tags.length || moods.length ? h('div', { class: 'ob-tags' },
      tags.map((g) => h('span', { class: 'ob-tag', text: g })),
      moods.map((m) => h('span', { class: 'ob-tag mood', text: m.toLowerCase() }))) : null,
    book.series?.id && typeof pos === 'number' && pos > 1
      ? previouslyOn(ctx, profile, { seriesId: book.series.id, seriesName: book.series.name, before: pos }) : null,
    book.series?.id ? whosWhoBox(ctx, profile, { seriesId: book.series.id, upTo: typeof pos === 'number' ? pos : Infinity }) : null,
    book.status !== 'read' ? h('div', { class: 'ob-buy' }, buyLinks(book)) : null,
    h('div', { class: 'ob-actions' },
      h('button', { class: 'btn secondary ob-close', type: 'button', onclick: () => close() }, 'Close'),
      ctx.state.canWrite ? h('button', { class: 'btn', type: 'button', onclick: () => dialog.editBook() }, 'Edit') : null));
}

/* -------------------------------------------------------------- reactions */

/**
 * Emoji under a rating or a finish date. Anyone can add one; for now they are
 * anonymous (see addReaction in core/model.js for how they will carry a name).
 */
export function reactionBar(ctx, profile, book, on) {
  const wrap = h('span', { class: 'reacts' });
  const canWrite = ctx.state.canWrite;
  let picking = false;

  const add = async (emoji) => {
    picking = false;
    for (const b of wrap.querySelectorAll('button')) b.disabled = true;
    await ctx.actions.react(profile, book, on, emoji);
    paint();
  };

  function paint() {
    const summary = reactionSummary(ctx.state.libraries[profile.id], book.id, on);
    fill(wrap,
      summary.map(({ emoji, count }) => h('button', {
        class: 'react-chip', type: 'button', disabled: !canWrite,
        title: canWrite ? `React ${emoji}` : null, 'aria-label': `${emoji} ${count}`,
        onclick: () => add(emoji),
      }, emoji, h('span', { text: String(count) }))),
      canWrite ? h('button', {
        class: 'react-add', type: 'button', 'aria-expanded': String(picking),
        title: on === 'rating' ? 'React to this rating' : 'React to finishing it',
        'aria-label': on === 'rating' ? 'React to this rating' : 'React to finishing it',
        onclick: () => { picking = !picking; paint(); },
      }, '☺', h('span', { class: 'plus', text: '+' })) : null,
      picking ? h('span', { class: 'react-pick', role: 'group', 'aria-label': 'Pick a reaction' },
        REACTIONS.map((emoji) => h('button', { type: 'button', class: 'react-opt', onclick: () => add(emoji) }, emoji))) : null);
  }
  paint();
  return wrap;
}
