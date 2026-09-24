/**
 * Series progress, on Stats: one bar per series, one segment per main book.
 *
 * The point is the gaps. "Stormlight: 5 of 5, next due 2031" and "Red Rising:
 * reading book 2, 4 more out" are both easy to lose track of when the only
 * view of a series is a list of the books you happen to own.
 */

import { h, fmtRelease, isPlaceholderDate } from './dom.js';
import { today } from '../core/model.js';
import { seriesProgress } from '../core/watch.js';
import { openRelease } from './upcoming.js';

const STATE_LABEL = {
  read: 'Read', reading: 'Reading now', tbr: 'On your pile', abandoned: 'Gave up',
  missing: 'Out, not on your shelf', skipped: 'Not interested', upcoming: 'Not out yet',
};

export function seriesSection(ctx, profile) {
  const library = ctx.state.libraries[profile.id] ?? { books: [] };
  const all = seriesProgress(ctx.state.seriesState, library, today());
  if (!all.length) return null;

  const open = (slot, series) => () => (slot.book
    ? ctx.actions.openBook(slot.book, profile)
    : openRelease(ctx, {
        bookId: slot.bookId, title: slot.title, image: slot.image, releaseDate: slot.releaseDate,
        seriesName: series.name, position: slot.position,
      }, profile));

  const row = (s) => {
    const bits = [];
    if (s.reading) bits.push(`reading book ${s.reading.position}`);
    if (s.nextDue) {
      const when = isPlaceholderDate(s.nextDue.releaseDate)
        ? s.nextDue.releaseDate.slice(0, 4) : fmtRelease(s.nextDue.releaseDate).date;
      bits.push(`book ${s.nextDue.position} due ${when}`);
    }
    return h('div', { class: `sp-row${s.complete ? ' complete' : ''}` },
      h('div', { class: 'sp-head' },
        h('strong', { class: 'sp-name', text: s.name }),
        h('span', { class: 'sp-count', text: s.complete ? `All ${s.released} read` : `${s.read} of ${s.released} read` })),
      h('div', { class: 'sp-bar', role: 'list', 'aria-label': `${s.name}: ${s.read} of ${s.released} read` },
        s.slots.map((slot) => h('button', {
          class: `sp-seg ${slot.state}`, type: 'button', role: 'listitem',
          title: `Book ${slot.position}: ${slot.title} — ${STATE_LABEL[slot.state]}`,
          'aria-label': `Book ${slot.position}, ${slot.title}: ${STATE_LABEL[slot.state]}`,
          onclick: open(slot, s),
        }, String(slot.position)))),
      bits.length || s.gaps.length ? h('div', { class: 'sp-note' },
        s.gaps.length ? h('span', { class: 'sp-gap', text: `Skipped ${s.gaps.map((g) => `book ${g.position}`).join(', ')}` }) : null,
        bits.length ? h('span', { text: bits.join(' · ') }) : null) : null);
  };

  const inProgress = all.filter((s) => !s.complete);
  const caughtUp = all.filter((s) => s.complete);

  return h('section', { class: 'section series-progress' },
    h('div', { class: 'section-head' },
      h('h2', { text: 'Series progress' }),
      h('span', { class: 'count', text: `${all.length} series${caughtUp.length ? ` · ${caughtUp.length} caught up` : ''}` })),
    h('div', { class: 'sp-legend', 'aria-hidden': 'true' },
      ['read', 'reading', 'tbr', 'missing', 'upcoming'].map((k) =>
        h('span', {}, h('i', { class: `sp-key ${k}` }), STATE_LABEL[k]))),
    h('div', { class: 'sp-rows' }, inProgress.map(row)),
    caughtUp.length ? h('details', { class: 'optional', ...(inProgress.length ? {} : { open: true }) },
      h('summary', { text: `Caught up (${caughtUp.length})` }),
      h('div', { class: 'sp-rows' }, caughtUp.map(row))) : null,
    h('p', { class: 'hint', text: 'Main books only — novellas are left out. Tap a book to open it.' }));
}
