/**
 * Sigils: each member's mark. A simple line icon (or a letter) on a colour
 * of their choosing - their avatar everywhere, the stamp on the foot of their
 * spines, and the seal pressed into their library card.
 *
 * The icons are fixed path data written here; none of it ever comes from
 * what anyone types (a letter sigil is set as text).
 */

import { h } from './dom.js';

// 24x24, drawn with a 1.8 stroke. Bookish first, then nature and creatures.
export const SIGILS = {
  book: 'M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5zM11 4v15M13 4v15',
  quill: 'M20 4c-7 1-12 6-14 14l1 2c3-1 6-3 8-6-2 0-3-.5-4-1 3 0 5-1 6-3-1 0-2-.3-3-1 3-1 5-3 6-5zM6 18l-2 2',
  inkwell: 'M8 10h8l1 9a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1zM9 10V8h6v2M14 3l-2 7',
  glasses: 'M3 13a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0zM14 13a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0zM10 13c1-1 3-1 4 0M3 13l1-5M21 13l-1-5',
  bookmark: 'M7 3h10v18l-5-4-5 4z',
  lantern: 'M9 4h6M10 4v2M14 4v2M7 8h10l-1 10H8zM9 21h6M12 11v4',
  key: 'M8 14a4 4 0 1 1 3-6.5L21 7v3h-2v2h-2v2h-3.5A4 4 0 0 1 8 14z',
  crown: 'M4 18l-1-10 5 4 4-7 4 7 5-4-1 10zM4 21h16',
  candle: 'M10 10h4v11h-4zM12 10V8M12 3c1.5 1.8 1.5 3.2 0 5-1.5-1.8-1.5-3.2 0-5z',
  teacup: 'M4 9h12v4a6 6 0 0 1-12 0zM16 10h1.5a2.5 2.5 0 0 1 0 5H15M3 21h14M8 3c-.7 1.3.7 2 0 3M12 3c-.7 1.3.7 2 0 3',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z',
  sword: 'M20 4l-9 9M20 4h-4M20 4v4M8 13l3 3M6 15l3 3M4 20l3-3',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z',
  star: 'M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5',
  leaf: 'M5 19C5 10 10 5 20 4c-1 10-6 15-15 15zM5 19l8-8',
  rose: 'M12 21v-8M12 13c-3 0-5-2-5-5 2 0 3 1 3 1 0-2 2-4 2-4s2 2 2 4c0 0 1-1 3-1 0 3-2 5-5 5zM12 17c-2 0-3-1-4-2M12 17c2 0 3-1 4-2',
  mushroom: 'M4 12a8 8 0 0 1 16 0zM10 12v6a2 2 0 0 0 4 0v-6M9 8.5h.01M14 7h.01',
  feather: 'M20 4C11 4 6 9 6 18l-2 2M6 18c7 0 12-4 13-11M10 14h5',
  mountain: 'M3 20l6-11 4 6 2-3 6 8zM9 9l1.5 2.5',
  wave: 'M3 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0',
  flame: 'M12 21c-4 0-6-2.5-6-6 0-4 4-6 4-10 3 2 4 4 4 6 1-1 1.5-2 1.5-3 2 2 2.5 4.5 2.5 7 0 3.5-2 6-6 6z',
  cat: 'M5 20v-9l-1-7 4 3h8l4-3-1 7v9zM9 13h.01M15 13h.01M11 16h2',
  owl: 'M6 20V9a6 6 0 0 1 12 0v11zM9.5 11.5h.01M14.5 11.5h.01M6 6L4 3M18 6l2-3M11 14l1 1 1-1',
  fox: 'M4 4l4 5h8l4-5-1 9-7 8-7-8zM9.5 12h.01M14.5 12h.01',
  raven: 'M3 14c4 0 6-2 8-5 2-3 5-4 8-3l2 2-3 1c0 5-4 9-10 9H3l3-2z',
  dragon: 'M4 18c3-1 4-3 4-6 0-4 3-7 7-7 2 0 4 1 5 3l-3 1c2 2 2 5 0 7-2 1.5-5 2-7 2zM14 9h.01M8 12l-4-1',
  tree: 'M12 21v-6M12 15c-4 0-7-2-7-6a7 7 0 0 1 14 0c0 4-3 6-7 6z',
};

/** The icons in the order the picker lists them, with names for the picker. */
export const SIGIL_NAMES = {
  book: 'Book', quill: 'Quill', inkwell: 'Inkwell', glasses: 'Reading glasses', bookmark: 'Bookmark', lantern: 'Lantern',
  key: 'Key', crown: 'Crown', candle: 'Candle', teacup: 'Teacup', compass: 'Compass', sword: 'Sword', moon: 'Moon', star: 'Star',
  sun: 'Sun', leaf: 'Leaf', rose: 'Rose', mushroom: 'Mushroom', feather: 'Feather', mountain: 'Mountain', wave: 'Wave',
  flame: 'Flame', cat: 'Cat', owl: 'Owl', fox: 'Fox', raven: 'Raven', dragon: 'Dragon', tree: 'Tree',
};

export const SIGIL_COLOURS = ['#a2461f', '#8a2d2d', '#b0476a', '#c2622d', '#b8861f', '#6b7a2a', '#2f6b4f', '#2c7a7b',
  '#1f6f8b', '#3b5b8c', '#4b5bb8', '#6a3d7a', '#5b4a3a', '#2e2e33'];

/** A profile's sigil, with the old initial-on-colour as the fallback. */
export function sigilOf(p) {
  const s = p?.sigil;
  if (s?.icon && (SIGILS[s.icon] || s.icon === 'letter')) return s;
  return { icon: 'letter', bg: p?.colour ?? '#a2461f', letter: (p?.name ?? '?').slice(0, 1).toUpperCase() };
}

const svgIcon = (path, cls = '') => {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  if (cls) svg.setAttribute('class', cls);
  const el = document.createElementNS(NS, 'path');
  el.setAttribute('d', path);
  svg.append(el);
  return svg;
};

/** The mark itself: icon (or letter) on its colour, sized by CSS. */
export function sigilEl(p, { size = '', title = p?.name } = {}) {
  const s = sigilOf(p);
  const el = h('span', { class: `sigil ${size}`, style: `--sg:${/^#[0-9a-f]{6}$/i.test(s.bg) ? s.bg : '#a2461f'}`, title, 'aria-hidden': 'true' });
  if (s.icon === 'letter') el.append(h('span', { class: 'sigil-letter', text: (s.letter || p?.name?.[0] || '?').toUpperCase() }));
  else el.append(svgIcon(SIGILS[s.icon]));
  return el;
}

/** Just the drawing, in the current colour - for stamps on spines and seals. */
export function sigilMark(p) {
  const s = sigilOf(p);
  if (s.icon === 'letter') return h('span', { class: 'sigil-mark letter', text: (s.letter || '?').toUpperCase() });
  return h('span', { class: 'sigil-mark' }, svgIcon(SIGILS[s.icon]));
}

/** Choosing a sigil: an icon (or your initial) and a colour, previewed as you go. */
export function sigilPicker(profile, current, onChange) {
  let pick = { ...sigilOf(profile), ...(current ?? {}) };
  const preview = h('div', { class: 'sp-preview' });
  const icons = h('div', { class: 'sp-icons', role: 'radiogroup', 'aria-label': 'Sigil' });
  const colours = h('div', { class: 'swatches sp-colours', role: 'radiogroup', 'aria-label': 'Colour' });
  const paint = () => {
    preview.replaceChildren(sigilEl({ ...profile, sigil: pick }, { size: 'xl' }));
    for (const b of icons.children) b.setAttribute('aria-checked', String(b.dataset.icon === pick.icon));
    for (const b of colours.children) b.setAttribute('aria-checked', String(b.dataset.c === pick.bg));
    onChange({ icon: pick.icon, bg: pick.bg, ...(pick.icon === 'letter' ? { letter: (profile.name ?? '?')[0] } : {}) });
  };
  icons.append(h('button', { class: 'sp-icon', type: 'button', role: 'radio', dataset: { icon: 'letter' }, title: 'Your initial',
    onclick: () => { pick = { ...pick, icon: 'letter' }; paint(); } }, h('span', { class: 'sigil-letter', text: (profile.name ?? '?')[0].toUpperCase() })));
  for (const [id, name] of Object.entries(SIGIL_NAMES)) {
    icons.append(h('button', { class: 'sp-icon', type: 'button', role: 'radio', dataset: { icon: id }, title: name, 'aria-label': name,
      onclick: () => { pick = { ...pick, icon: id }; paint(); } }, svgIcon(SIGILS[id])));
  }
  for (const c of SIGIL_COLOURS) {
    colours.append(h('button', { class: 'swatch', type: 'button', role: 'radio', dataset: { c }, style: `background:${c}`, 'aria-label': `Colour ${c}`,
      onclick: () => { pick = { ...pick, bg: c }; paint(); } }));
  }
  paint();
  return h('div', { class: 'sigil-picker' }, preview, h('div', { class: 'sp-choices' }, icons, colours));
}
