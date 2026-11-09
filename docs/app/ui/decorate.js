/**
 * Decorate: a panel at the side of someone's bookshelf for changing their
 * look - the colours and heading type of their pages, their room and what is
 * in it, and whether it follows the seasons. Everything previews live on the
 * page behind; Save keeps it with their profile, so everyone who visits sees
 * it, and Cancel puts it back.
 *
 * The panel is a non-modal dialog, so the page stays visible beside it.
 */

import { h, fill } from './dom.js';
import { PROFILE_THEMES, PROFILE_FONTS, ROOM_OPTIONS, lookOf, seasonOf } from '../core/model.js';
import { SCENES } from './room.js';

const LABEL = {
  wall: { room: 'As the room', cream: 'Cream', sage: 'Sage', 'dusk-blue': 'Dusk blue', plum: 'Plum', charcoal: 'Charcoal' },
  wood: { room: 'As the room', walnut: 'Walnut', oak: 'Oak', cherry: 'Cherry', ebony: 'Ebony', driftwood: 'Driftwood' },
  rug: { room: 'As the room', crimson: 'Crimson', navy: 'Navy', sage: 'Sage', gold: 'Gold', none: 'No rug' },
  lamp: { room: 'As the room', library: 'Green glass', fire: 'Iron lantern', rain: 'Linen drum', cafe: 'Enamel' },
};
// Colours for the little swatches in the room options. Fixed values only.
const SWATCH = {
  wall: { room: null, cream: '#ece2cf', sage: '#b9c4a8', 'dusk-blue': '#5d6f8a', plum: '#6e4258', charcoal: '#3b3c40' },
  wood: { room: null, walnut: '#5a3d26', oak: '#c9a06a', cherry: '#b5694a', ebony: '#3a312d', driftwood: '#b5aa98' },
  rug: { room: null, crimson: '#7a2f2f', navy: '#26324f', sage: '#6f8462', gold: '#b8862f', none: null },
  lamp: { room: null, library: '#2f6b4f', fire: '#2a2420', rain: '#e8dcc6', cafe: '#3f6f5f' },
};
const SEASON = { spring: 'spring blossom drifts past', summer: 'long summer light', autumn: 'leaves fall past, a pumpkin on the sill', winter: 'snow falls, and settles on the sill' };

let panel = null;

/**
 * Open the panel for a profile. `preview(look)` shows a look on the page
 * without saving it; `save(look)` keeps it; `cancel()` drops the preview.
 */
export function openDecorate(profile, { preview, save, cancel }) {
  panel?.close();
  const saved = lookOf(profile);
  let draft = { ...saved };
  let tab = 'theme';
  let done = false;

  const body = h('div', { class: 'dec-body' });
  const tabs = h('div', { class: 'seg dec-tabs', role: 'tablist', 'aria-label': 'What to change' });
  const saveBtn = h('button', { class: 'btn', type: 'button', onclick: async () => {
    saveBtn.disabled = true;
    done = true;
    if (await save(draft)) close(); else { saveBtn.disabled = false; done = false; }
  } }, 'Save');
  const changed = () => JSON.stringify(draft) !== JSON.stringify(saved);

  panel = h('dialog', { class: 'decorate', 'aria-label': `Decorate ${profile.name}’s shelf` },
    h('div', { class: 'dec-head' },
      h('div', {}, h('div', { class: 'eyebrow', text: 'Decorate' }), h('h2', { text: `${profile.name}’s shelf` })),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => close() }, '✕')),
    tabs, body,
    h('div', { class: 'dec-foot' },
      h('button', { class: 'link-btn', type: 'button', title: 'Back to the site’s own look and the library',
        onclick: () => { draft = lookOf({}); update(); } }, 'Reset all'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn secondary', type: 'button', onclick: () => close() }, 'Cancel'),
      saveBtn));
  document.body.append(panel);
  panel.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

  function close() {
    if (!done && changed()) {
      if (!confirm('Leave without saving these changes?')) return;
    }
    if (!done) cancel();
    panel.close();
    panel.remove();
    panel = null;
  }

  function set(changes) {
    draft = { ...draft, ...changes };
    update();
  }

  function update() {
    preview(draft);
    paintTabs();
    paint();
    saveBtn.disabled = !changed();
  }

  function paintTabs() {
    fill(tabs, [['theme', 'Colours & type'], ['room', 'Room'], ['seasons', 'Seasons']].map(([id, label]) => h('button', {
      class: 'seg-btn', type: 'button', role: 'tab', 'aria-selected': String(id === tab),
      onclick: () => { tab = id; paintTabs(); paint(); },
    }, label)));
  }

  const choice = (name, value, current, label, onPick, extra = null) => h('button', {
    class: `dec-choice ${name}`, type: 'button', role: 'radio', 'aria-checked': String(value === current), title: label,
    onclick: () => onPick(value),
  }, extra, h('span', { class: 'dec-label', text: label }));

  function paint() {
    if (tab === 'theme') {
      fill(body,
        section('Colours', 'Every page of this profile takes them: background, cards, buttons and tabs.',
          h('div', { class: 'dec-grid palettes', role: 'radiogroup', 'aria-label': 'Colours' }, PROFILE_THEMES.map((t) =>
            choice('palette', t.id, draft.palette, t.name, (palette) => set({ palette }),
              h('span', { class: 'dec-swatch', style: `--c:${t.accent ?? '#a2461f'};--c2:${t.accent2 ?? t.accent ?? '#c98a5a'}` }))))),
        section('Heading type', 'Titles and headings. Body text stays the same, so it is always easy to read.',
          h('div', { class: 'dec-grid fonts', role: 'radiogroup', 'aria-label': 'Heading type' }, PROFILE_FONTS.map((f) =>
            choice('font', f.id, draft.font, f.name, (font) => set({ font }),
              h('span', { class: 'dec-font-sample', style: `font-family:"${f.family}", serif`, text: 'Aa' }))))));
    } else if (tab === 'room') {
      fill(body,
        section('Room', 'The room the bookshelf stands in. With sound on, its sound plays.',
          h('div', { class: 'dec-grid rooms', role: 'radiogroup', 'aria-label': 'Room' }, SCENES.map(([id, icon, label]) =>
            choice('room', id, draft.room, label, (room) => set({ room }), h('span', { class: `ico ${icon}`, 'aria-hidden': 'true' }))))),
        ...['wall', 'wood', 'rug', 'lamp'].map((key) => section(
          { wall: 'Walls', wood: 'Bookcase wood', rug: 'Rug', lamp: 'Ceiling lamps' }[key], null,
          h('div', { class: 'dec-grid swatches', role: 'radiogroup', 'aria-label': key }, ROOM_OPTIONS[key].map((v) =>
            choice(key, v, draft[key], LABEL[key][v], (value) => set({ [key]: value }),
              h('span', { class: `dec-dot${SWATCH[key][v] ? '' : ' plain'}`, style: SWATCH[key][v] ? `--c:${SWATCH[key][v]}` : null })))))));
    } else {
      const now = seasonOf();
      fill(body, section('Follow the seasons', null,
        h('label', { class: 'dec-toggle' },
          h('input', { type: 'checkbox', checked: draft.seasons, onchange: (e) => set({ seasons: e.target.checked }) }),
          h('span', { text: 'Change with the time of year' })),
        h('p', { class: 'hint', text: `The room changes with the calendar: in ${now} now, ${SEASON[now]}. The page colours shift a little warmer in autumn and cooler in winter.` })));
    }
  }

  function section(title, hint, ...content) {
    return h('section', { class: 'dec-section' }, h('h3', { text: title }), hint ? h('p', { class: 'hint', text: hint }) : null, content);
  }

  update();
  saveBtn.disabled = true;
  panel.show();
}
