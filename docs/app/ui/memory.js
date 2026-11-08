/**
 * Remembering a series, on screen: "Previously on…" and who's who.
 *
 * Both are folded away until asked for - they are there for the moment you
 * pick up book four after a year and cannot remember who anyone is, not to
 * sit open on every page.
 */

import { h, fill, starsEl, fmtReadOnShort } from './dom.js';
import { storySentences, earlierBooks } from '../core/memory.js';
import { whosWho, readOnOf } from '../core/model.js';
import { loadDetails } from './upcoming.js';

/**
 * "Previously on…": each earlier book you have read, in a sentence or two of
 * its own description, with your note and rating beside it. Descriptions are
 * fetched only when the section is opened.
 */
export function previouslyOn(ctx, profile, { seriesId, seriesName, before }) {
  const library = ctx.state.libraries[profile.id];
  const books = earlierBooks(library, seriesId, before);
  if (!books.length) return null;
  const body = h('div', { class: 'prev-body' });
  const box = h('details', { class: 'memory prev-on' },
    h('summary', {},
      h('span', { class: 'memory-title' }, 'Previously on ', h('em', { text: seriesName ?? 'this series' })),
      h('span', { class: 'count', text: `${books.length} book${books.length === 1 ? '' : 's'}` })),
    body);
  let loaded = false;
  box.addEventListener('toggle', async () => {
    if (!box.open || loaded) return;
    loaded = true;
    fill(body, h('p', { class: 'hint', text: 'Gathering what happened…' }));
    const details = await Promise.all(books.map((b) => loadDetails(ctx, b.hardcoverId).catch(() => null)));
    fill(body, books.map((b, i) => h('div', { class: 'prev-book' },
      h('div', { class: 'prev-head' },
        h('span', { class: 'prev-num', text: Number.isInteger(b.series.position) ? `Book ${b.series.position}` : `Book ${b.series.position} · novella` }),
        h('strong', { text: b.title }),
        b.rating ? starsEl(b.rating) : null,
        readOnOf(b) ? h('span', { class: 'count', text: `read ${fmtReadOnShort(readOnOf(b))}` }) : null),
      h('p', { class: 'prev-story', text: storySentences(details[i]?.description) || 'Hardcover has no description for this one.' }),
      b.note ? h('blockquote', { class: 'prev-note' }, h('span', { class: 'k', text: 'Your note' }), b.note) : null)),
    h('p', { class: 'hint', text: 'From each book’s own description and your notes.' }));
  });
  return box;
}

/**
 * Who's who, as far as this reader has got. People first met in a later book
 * are counted but never named, so the list can be kept for a whole series
 * without spoiling it.
 */
export function whosWhoBox(ctx, profile, { seriesId, upTo, open = false }) {
  const canWrite = ctx.state.canWrite;
  const body = h('div', { class: 'who-body' });
  const count = h('span', { class: 'count' });
  const box = h('details', { class: 'memory who', open },
    h('summary', {}, h('span', { class: 'memory-title', text: 'Who’s who' }), count), body);

  function paint(editing = null) {
    const { shown, hidden } = whosWho(ctx.state.libraries[profile.id], seriesId, upTo);
    count.textContent = shown.length ? String(shown.length) : '';
    fill(body,
      shown.length ? h('ul', { class: 'who-list' }, shown.map((p) => (editing === p.id ? h('li', {}, form(p)) : h('li', {},
        h('div', { class: 'who-row' },
          h('strong', { text: p.name }),
          h('span', { class: 'who-from', text: `book ${p.from}` }),
          canWrite ? h('span', { class: 'who-tools' },
            h('button', { class: 'link-btn', type: 'button', onclick: () => paint(p.id) }, 'Edit'),
            h('button', { class: 'link-btn', type: 'button', onclick: () => remove(p) }, 'Remove')) : null),
        p.note ? h('div', { class: 'who-note', text: p.note }) : null))))
        : h('p', { class: 'hint', text: canWrite
          ? 'Keep track of the characters — each note stays hidden from anyone not yet at the book it comes from.'
          : 'No one noted yet.' }),
      hidden ? h('p', { class: 'hint who-hidden', text: `${hidden} more ${hidden === 1 ? 'person comes' : 'people come'} later in the series — hidden, so nothing is spoiled.` }) : null,
      canWrite && editing === 'new' ? form() : null,
      canWrite && editing !== 'new' ? h('button', { class: 'btn secondary small who-add', type: 'button', onclick: () => paint('new') }, '+ Add someone') : null);
    body.querySelector('input')?.focus();
  }

  function form(person = {}) {
    const name = h('input', { type: 'text', value: person.name ?? '', placeholder: 'Name', 'aria-label': 'Name', maxlength: '80', required: true });
    const note = h('input', { type: 'text', value: person.note ?? '', placeholder: 'Who they are — no spoilers past this book', 'aria-label': 'Note', maxlength: '240' });
    const from = h('input', { type: 'number', min: '1', step: '0.5', value: String(person.from ?? Math.max(1, Math.floor(upTo === Infinity ? 1 : upTo))),
      'aria-label': 'First appears in book', class: 'who-from-input' });
    const problem = h('span', { class: 'hint error', role: 'alert' });
    return h('form', { class: 'who-form', onsubmit: async (e) => {
      e.preventDefault();
      const button = e.submitter;
      if (button) button.disabled = true;
      const ok = await ctx.actions.saveSeriesPerson(profile, seriesId,
        { id: person.id, name: name.value, note: note.value, from: Number(from.value) || 1 });
      if (ok) paint(); else if (button) button.disabled = false;
    } },
      name, note,
      h('label', { class: 'who-from-label' }, 'First in book ', from),
      problem,
      h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'submit' }, person.id ? 'Save' : 'Add'),
        h('button', { class: 'btn secondary small', type: 'button', onclick: () => paint() }, 'Cancel')));
  }

  async function remove(p) {
    if (await ctx.actions.removeSeriesPerson(profile, seriesId, p)) paint();
  }

  paint();
  return box;
}
