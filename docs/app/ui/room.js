/**
 * The room the bookshelf stands in.
 *
 * The case stands against the back wall of a small room drawn in perspective
 * - back wall, side walls, floor and ceiling - and the chosen scene furnishes
 * it:
 *
 *   reading  "Home": a window on the left wall, a print on the right, a fig
 *            in the corner, a side table, a rug
 *   fire     a fireplace on the left wall with a fire going, a wingback
 *            chair, firelight on the floor and the shelves
 *   rain     a dark bedroom on a stormy night: rain and lightning in the
 *            window, a bed with a quilt, the lamp on
 *   cafe     a chalkboard menu, a counter, a café table, pendant lights,
 *            tiles and a checked floor
 *
 * The scene is picked with the switch above the room (sceneSwitch), and with
 * sound on its sound plays (sound.js). The window's sky and the light in the
 * room follow the time of day.
 *
 * Sunrise and sunset are worked out from the date for a mid-northern latitude
 * (about Montreal's), since the site never asks where anyone is.
 *
 * The drawings are fixed SVG written here, parsed from these constant strings
 * only - nothing typed by anyone goes through the parser.
 */

import { h } from './dom.js';
import { lampArt } from './art.js';

/** 'dawn' | 'day' | 'dusk' | 'night' for a moment in local time. */
export function timeOfDay(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 1);
  const doy = Math.floor((date - start) / 864e5);
  // Day length swings about ±3.4 hours around 12 at 45°N, longest near 21 June.
  const length = 12 + 3.4 * Math.sin((2 * Math.PI * (doy - 80)) / 365);
  const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
  const summerTime = date.getTimezoneOffset() < Math.max(jan, jul);
  const noon = 12.1 + (summerTime ? 1 : 0);
  const rise = noon - length / 2;
  const set = noon + length / 2;
  const t = date.getHours() + date.getMinutes() / 60;
  if (t >= rise - 0.5 && t < rise + 1) return 'dawn';
  if (t >= rise + 1 && t < set - 1) return 'day';
  if (t >= set - 1 && t < set + 0.6) return 'dusk';
  return 'night';
}

/* ------------------------------------------------------------- drawings */

const ART = {
  // A basket of trailing pothos hung from the ceiling on a cord.
  basket: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 80">
    <path d="M45 0v18M45 18L18 34M45 18l27 16" stroke="#8a6a44" stroke-width="1.6" fill="none"/>
    <path d="M14 34h62l-6 24c-1 4-4 6-8 6H28c-4 0-7-2-8-6z" fill="#b8874f"/>
    <path d="M16 40h58M18 47h54M20 54h50" stroke="#946a3a" stroke-width="1.6"/>
    <path d="M24 34c-8-10-2-20 8-18 2 8-2 14-8 18zM44 34c-2-12 6-18 14-14-2 8-6 12-14 14zM60 34c6-8 16-8 18-2-6 4-12 4-18 2z" fill="#4f9a5c"/>
    <path d="M34 34c-2-8 4-14 10-12 0 6-4 10-10 12z" fill="#5fae6b"/>
    <path d="M20 58c-6 6-8 14-6 22M70 58c4 6 6 12 4 20" stroke="#3f7d4c" stroke-width="2" fill="none"/>
    <ellipse cx="14" cy="66" rx="5" ry="3.4" fill="#4f9a5c" transform="rotate(-50 14 66)"/>
    <ellipse cx="75" cy="70" rx="5" ry="3.4" fill="#3f7d4c" transform="rotate(50 75 70)"/></svg>`,
  // The end of a bed: a wooden headboard, pillows, a patchwork quilt, a book left open.
  bed: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 150">
    <ellipse cx="130" cy="146" rx="110" ry="5" fill="#000" opacity=".3"/>
    <path d="M196 16c0-8 8-12 18-12s18 4 18 12v130h-36z" fill="#5a3a26"/><path d="M202 24h24v118h-24z" fill="#4a2f1f"/>
    <path d="M24 132v14M190 132v14" stroke="#3a2416" stroke-width="7" stroke-linecap="round"/>
    <rect x="16" y="88" width="182" height="46" rx="8" fill="#e9e1d2"/>
    <path d="M150 62c0-8 6-12 22-12s22 4 22 12v26h-44z" fill="#f4eee4"/><path d="M118 70c0-6 6-9 18-9s18 3 18 9v18h-36z" fill="#dfe4ea"/>
    <path d="M10 92c40-10 80-12 128-6 20 2 34 8 40 16v34H10z" fill="#3d5a73"/>
    <path d="M10 106h168M10 120h168M50 92v44M90 88v48M130 88v48" stroke="#2f4a60" stroke-width="2"/>
    <path d="M30 98h14v10H30zM104 112h18v10h-18zM64 124h14v8H64z" fill="#b8865a" opacity=".8"/>
    <path d="M60 86l22-8 22 8-22 4z" fill="#f4ead6"/><path d="M82 78v12" stroke="#c9b48a" stroke-width="1.4"/></svg>`,
  // A fiddle-leaf fig in a tall pot.
  fig: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 260">
    <ellipse cx="60" cy="254" rx="40" ry="6" fill="#000" opacity=".28"/>
    <path d="M32 190h56l-6 62H38z" fill="#c9b8a0"/><path d="M28 182h64v12H28z" fill="#ddd0bc"/><path d="M36 200h48" stroke="#b5a48c" stroke-width="2"/>
    <path d="M60 184V60M60 120c-8-10-20-14-30-12M60 96c10-8 22-10 30-6M60 150c-10-6-20-6-28 0" stroke="#5a4028" stroke-width="3" fill="none"/>
    <g fill="#3f7d4c"><path d="M30 108c-22-4-30 12-26 24 14 4 26-6 26-24z"/><path d="M90 90c20-6 30 8 26 20-14 4-26-4-26-20z"/>
    <path d="M32 150c-20 0-26 16-20 26 14 0 22-10 20-26z"/><path d="M60 60c-14-16-6-34 6-40 10 14 6 30-6 40z"/></g>
    <g fill="#4f9a5c"><path d="M60 80c-18-6-28 6-26 18 12 4 24-2 26-18z"/><path d="M62 70c14-12 30-6 32 6-10 8-24 8-32-6z"/>
    <path d="M60 130c16-8 30 0 30 12-12 6-26 2-30-12z"/><path d="M58 40c-10-14-2-28 8-30 6 12 2 24-8 30z"/></g>
    <g fill="#5fae6b"><path d="M60 116c-14 2-20 14-16 22 10 0 18-8 16-22z"/><path d="M64 50c12-10 24-4 24 6-8 6-18 6-24-6z"/></g></svg>`,
  // A small framed landscape.
  print: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80">
    <rect x="2" y="2" width="96" height="76" rx="2" fill="#7a5530"/><rect x="9" y="9" width="82" height="62" fill="#f3ead8"/>
    <rect x="15" y="15" width="70" height="50" fill="#cfe0e6"/>
    <circle cx="66" cy="30" r="7" fill="#f2c57a"/>
    <path d="M15 52c12-14 20-16 30-6s16 2 22-6 12-4 18 4v21H15z" fill="#7fa37a"/>
    <path d="M15 58c16-8 30-6 70 0v7H15z" fill="#5d8560"/></svg>`,
  // A round side table with a stack of books and a small plant.
  sideTable: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 120">
    <ellipse cx="45" cy="116" rx="34" ry="4" fill="#000" opacity=".22"/>
    <path d="M45 60v52M30 112h30" stroke="#6b4a2a" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="45" cy="60" rx="38" ry="8" fill="#8a5f36"/><ellipse cx="45" cy="57" rx="38" ry="8" fill="#a8774a"/>
    <rect x="16" y="44" width="34" height="9" rx="1.5" fill="#2f4858"/><rect x="19" y="36" width="30" height="8" rx="1.5" fill="#8a2d2d"/>
    <rect x="17" y="29" width="28" height="7" rx="1.5" fill="#b8861f"/>
    <path d="M58 56h16l-2 -14H60z" fill="#c26b3f"/>
    <path d="M66 42c-6-10-2-18 4-18 0 8-2 12-4 18zM66 42c2-10 10-14 14-10-4 6-8 8-14 10zM66 42c-6-6-14-6-16-2 6 4 10 4 16 2z" fill="#4f9a5c"/></svg>`,
  // A stone fireplace, a fire going, candles and a clock on the mantel.
  fireplace: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 210">
    <rect x="18" y="56" width="204" height="150" fill="#9b8f80"/>
    <path d="M18 56h204v150H18z" fill="url(#stone)" opacity=".5"/>
    <defs><pattern id="stone" width="40" height="22" patternUnits="userSpaceOnUse"><path d="M0 0h40v22H0z" fill="none" stroke="#7d7264" stroke-width="2"/><path d="M20 0v11M0 11h40M10 11v11M30 11v11" stroke="#7d7264" stroke-width="2"/></pattern></defs>
    <rect x="6" y="44" width="228" height="14" rx="2" fill="#5a3d26"/><rect x="2" y="40" width="236" height="6" rx="2" fill="#6e4a2e"/>
    <path d="M62 206V112c0-24 26-40 58-40s58 16 58 40v94z" fill="#1d1512"/>
    <path d="M62 206V112c0-24 26-40 58-40s58 16 58 40v94z" fill="none" stroke="#6e6457" stroke-width="5"/>
    <path d="M78 196h84" stroke="#3a2a1e" stroke-width="10" stroke-linecap="round"/>
    <path d="M84 188l72-10M88 178l66 12" stroke="#5a3a24" stroke-width="9" stroke-linecap="round"/>
    <g class="flames">
      <path class="fl f1" d="M96 186c-6-22 8-30 6-50 14 14 18 30 12 50z" fill="#f08a2c"/>
      <path class="fl f2" d="M114 186c-4-28 12-40 10-64 16 20 20 42 12 64z" fill="#f4a24c"/>
      <path class="fl f3" d="M132 186c-2-18 8-26 8-42 12 14 12 30 6 42z" fill="#e8672a"/>
      <path class="fl f4" d="M110 186c-2-14 6-20 6-32 8 10 10 22 6 32z" fill="#ffd27a"/>
    </g>
    <rect x="34" y="16" width="8" height="24" rx="1.5" fill="#f4ead6"/><path class="flame" d="M38 4c4 5 4 8 0 11-4-3-4-6 0-11z" fill="#ffb347"/>
    <rect x="50" y="22" width="7" height="18" rx="1.5" fill="#f4ead6"/><path class="flame" d="M53.5 12c3 4 3 6 0 9-3-3-3-5 0-9z" fill="#ffb347"/>
    <path d="M176 40c0-14 8-22 18-22s18 8 18 22z" fill="#7a4a2a"/><circle cx="194" cy="28" r="7" fill="#f6efe0"/>
    <path d="M194 28v-4M194 28l3 2" stroke="#2a1c10" stroke-width="1.2"/></svg>`,
  // A wingback armchair with a cushion and a folded throw.
  armchair: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 140">
    <ellipse cx="65" cy="136" rx="56" ry="5" fill="#000" opacity=".25"/>
    <path d="M24 122v12M106 122v12" stroke="#3a2416" stroke-width="6" stroke-linecap="round"/>
    <path d="M22 20c0-10 10-16 43-16s43 6 43 16v70H22z" fill="#7a2e2e"/>
    <path d="M10 40c0-8 14-10 18-2v60H10z" fill="#8a3434"/><path d="M120 40c0-8-14-10-18-2v60h18z" fill="#8a3434"/>
    <path d="M6 88h118v34c0 4-3 6-6 6H12c-3 0-6-2-6-6z" fill="#6e2828"/>
    <path d="M20 84c0-6 6-10 45-10s45 4 45 10v10H20z" fill="#943a3a"/>
    <rect x="44" y="50" width="42" height="30" rx="8" fill="#e8c88a" transform="rotate(-6 65 65)"/>
    <path d="M86 74l22 6v30l-18-8z" fill="#c9b48a"/><path d="M90 80l14 4M90 88l14 4M90 96l12 3" stroke="#a8946a" stroke-width="1.4"/>
    <path d="M30 30c10-6 60-6 70 0" stroke="#5e2222" stroke-width="2" fill="none" opacity=".6"/></svg>`,
  // A café counter: an espresso machine, cups, a cake under a dome.
  counter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 150">
    <rect x="0" y="70" width="250" height="80" fill="#6b4226"/><rect x="0" y="62" width="250" height="10" rx="2" fill="#3a2a1e"/>
    <path d="M10 82h230M10 104h230M10 126h230" stroke="#5a3820" stroke-width="2"/>
    <rect x="22" y="14" width="74" height="48" rx="6" fill="#c9cfd4"/><rect x="22" y="14" width="74" height="10" rx="4" fill="#a7afb6"/>
    <rect x="34" y="30" width="50" height="16" rx="3" fill="#7d878f"/><circle cx="46" cy="38" r="4" fill="#d9a03a"/><circle cx="72" cy="38" r="4" fill="#d9a03a"/>
    <path d="M40 46v8M78 46v8" stroke="#3a3a3e" stroke-width="3"/>
    <path class="steam" d="M59 12c-4-5 4-8 0-13" stroke="#fff" stroke-width="2" fill="none" opacity=".4" stroke-linecap="round"/>
    <path d="M112 46h16v14h-16zM134 48h14v12h-14z" fill="#f4ead6"/><path d="M128 50h4a3 3 0 0 1 0 6h-4" stroke="#f4ead6" stroke-width="2" fill="none"/>
    <path d="M170 60h52" stroke="#8a8a8a" stroke-width="3"/><path d="M174 58c0-22 44-22 44 0z" fill="rgb(220 235 245 / .4)" stroke="rgb(255 255 255 / .6)" stroke-width="1.5"/>
    <path d="M182 58v-10h28v10z" fill="#e8b88a"/><path d="M182 50h28" stroke="#f4ead6" stroke-width="3"/><circle cx="196" cy="44" r="3" fill="#c0392b"/></svg>`,
  // The chalkboard of the day's drinks.
  chalkboard: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">
    <rect x="2" y="2" width="156" height="116" rx="4" fill="#8a5f36"/><rect x="10" y="10" width="140" height="100" rx="2" fill="#2b3330"/>
    <g fill="#eef0ea" font-family="Georgia, serif" text-anchor="middle">
      <text x="80" y="32" font-size="13" letter-spacing="2">TODAY</text>
      <text x="80" y="54" font-size="11" font-style="italic">flat white</text>
      <text x="80" y="72" font-size="11" font-style="italic">chai latte</text>
      <text x="80" y="90" font-size="11" font-style="italic">cinnamon buns</text></g>
    <path d="M40 38h80" stroke="#eef0ea" stroke-width="1" opacity=".6"/>
    <path d="M118 96c4 0 8 2 8 6h-16c0-4 4-6 8-6z" fill="#eef0ea" opacity=".7"/></svg>`,
  // A little round café table, two chairs, two cups.
  cafeTable: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 110">
    <ellipse cx="80" cy="106" rx="70" ry="4" fill="#000" opacity=".22"/>
    <path d="M14 106V60M14 62h28v6M42 106V68" stroke="#2f2f33" stroke-width="3.4" fill="none"/>
    <path d="M146 106V60M146 62h-28v6M118 106V68" stroke="#2f2f33" stroke-width="3.4" fill="none"/>
    <path d="M10 40c0-4 4-6 8-6s8 2 8 6v22M150 40c0-4-4-6-8-6s-8 2-8 6v22" stroke="#2f2f33" stroke-width="3" fill="none"/>
    <path d="M80 56v48M66 106h28" stroke="#2f2f33" stroke-width="4"/>
    <ellipse cx="80" cy="56" rx="38" ry="6" fill="#d8d2c4"/>
    <path d="M62 50h12v-8H62zM88 50h12v-8H88z" fill="#f4ead6"/>
    <path class="steam" d="M68 38c-3-4 3-6 0-10" stroke="#fff" stroke-width="1.6" fill="none" opacity=".4"/></svg>`,
  // A pendant light on a long cord.
  pendant: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 70">
    <path d="M30 0v30" stroke="#2f2f33" stroke-width="1.6"/>
    <path d="M12 52c0-14 8-22 18-22s18 8 18 22z" fill="#2f4f45"/><path d="M12 52h36" stroke="#1f3a32" stroke-width="2"/>
    <ellipse class="pendant-bulb" cx="30" cy="54" rx="7" ry="5" fill="#fff0bf"/></svg>`,
};

const parsed = new Map();
function drawing(name, cls = '') {
  if (!parsed.has(name)) parsed.set(name, new DOMParser().parseFromString(ART[name], 'image/svg+xml').documentElement);
  const svg = document.importNode(parsed.get(name), true);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return h('span', { class: `room-item ${name} ${cls}`.trim(), 'aria-hidden': 'true' }, svg);
}

/** A window: sky, sun or moon, stars, clouds, and a storm if it is a stormy night. */
function roomWindow(stormy) {
  const stars = Array.from({ length: 10 }, (_, n) => h('i', { class: 'win-star', style: `--n:${n}` }));
  return h('div', { class: `wall-window${stormy ? ' rainy' : ''}`, 'aria-hidden': 'true' },
    h('div', { class: 'win-sky' },
      h('i', { class: 'win-sun' }), h('i', { class: 'win-moon' }), stars,
      h('i', { class: 'win-cloud c1' }), h('i', { class: 'win-cloud c2' }),
      stormy ? [h('i', { class: 'rain r1' }), h('i', { class: 'rain r2' }),
        ...Array.from({ length: 8 }, (_, n) => h('i', { class: 'raindrop', style: `--n:${n}` }))] : null),
    stormy ? h('i', { class: 'win-flash' }) : null,
    h('div', { class: 'win-frame' }),
    h('div', { class: 'win-sill' }, stormy ? h('span', { class: 'sill-candle' }, h('i')) : null));
}

/**
 * The room itself, in perspective: a back wall the case stands against, two
 * side walls, a floor and a ceiling, hinged off the back wall's edges and
 * turned towards the viewer (CSS 3D), so the floorboards, the rug, the
 * skirting and anything on the side walls all recede properly. What hangs on
 * the walls goes on the walls themselves; the window is on the left wall and
 * throws a patch of light across the floor.
 */
export function roomBox(scene) {
  const left = [];
  const right = [];
  const floor = [h('div', { class: 'rug' })];
  if (scene === 'fire') {
    left.push(drawing('fireplace', 'on-wall'));
    right.push(drawing('print', 'on-wall'));
    floor.push(h('div', { class: 'fire-pool' }));
  } else if (scene === 'cafe') {
    left.push(drawing('chalkboard', 'on-wall'));
    right.push(roomWindow(false));
    floor.push(h('div', { class: 'light-patch from-right' }));
  } else {
    left.push(roomWindow(scene === 'rain'));
    right.push(drawing('print', 'on-wall'));
    if (scene !== 'rain') floor.push(h('div', { class: 'light-patch' }));
  }
  return h('div', { class: 'room-box', 'aria-hidden': 'true' },
    h('div', { class: 'wall back' }),
    h('div', { class: 'wall side left' }, left),
    h('div', { class: 'wall side right' }, right),
    h('div', { class: 'floor' }, floor),
    h('div', { class: 'ceiling' }));
}

/** What stands in the room in front, at the corners - it is what makes the room deep. */
export function roomFront(scene) {
  const items = {
    fire: [drawing('armchair', 'front right')],
    rain: [drawing('bed', 'front right')],
    cafe: [drawing('cafeTable', 'front right'), drawing('counter', 'front left')],
  }[scene] ?? [drawing('sideTable', 'front right')];
  return h('div', { class: 'room-front', 'aria-hidden': 'true' },
    scene === 'cafe' ? [drawing('pendant', 'p1'), drawing('pendant', 'p2')] : null,
    scene === 'cafe' ? h('div', { class: 'bokeh' }, Array.from({ length: 9 }, (_, n) => h('i', { style: `--n:${n}` }))) : null,
    scene === 'rain' ? h('div', { class: 'lightning' }) : null,
    h('div', { class: 'room-shade' }),
    items);
}

/** A tall plant in a pot, in the back corner beside the case. */
export const cornerPlant = () => drawing('fig', 'corner-plant');

/**
 * Fit the room to the case: the back wall ends where the case stands, and
 * the eye looks at the middle of it. Measured, because the case's height is
 * whatever its books make it.
 */
export function fitRoom(room) {
  const box = room?.querySelector('.room-box');
  const kase = room?.querySelector('.case');
  if (!box || !kase) return;
  const r = room.getBoundingClientRect();
  const c = kase.getBoundingClientRect();
  const bottom = Math.max(0, r.bottom - c.bottom);
  box.style.bottom = `${bottom}px`;
  const top = parseFloat(getComputedStyle(box).top) || 0;
  room.style.perspectiveOrigin = `50% ${Math.round(top + (r.height - top - bottom) * 0.42)}px`;
}

/** The four scenes, for the switch on the bookshelf page. */
export const SCENES = [['reading', 'ico-home', 'Home'], ['fire', 'ico-fire', 'Fireplace'], ['rain', 'ico-rain', 'Rainy'], ['cafe', 'ico-cup', 'Café']];

/**
 * The long switch above the room: Home, Fireplace, Rainy night, Café. It
 * changes the room and, with sound on, what plays (sound.js).
 */
export function sceneSwitch(current, onPick) {
  const box = h('div', { class: 'scene-switch', role: 'radiogroup', 'aria-label': 'Room' });
  const paint = (id) => {
    for (const b of box.children) b.setAttribute('aria-checked', String(b.dataset.id === id));
    box.style.setProperty('--at', String(SCENES.findIndex(([x]) => x === id)));
  };
  box.append(...SCENES.map(([id, icon, label]) => h('button', {
    class: 'scene-opt', type: 'button', role: 'radio', dataset: { id }, 'aria-checked': String(id === current),
    onclick: () => { paint(id); onPick(id); },
  }, h('span', { class: `ico ${icon}`, 'aria-hidden': 'true' }), h('span', { class: 'scene-label', text: label }))));
  box.prepend(h('span', { class: 'scene-thumb', 'aria-hidden': 'true' }));
  paint(current);
  return box;
}

/** The basket on its cord, top left, its vine trailing down the side of the case. */
export function hangingBasket() {
  return h('div', { class: 'ivy', 'aria-hidden': 'true' }, drawing('basket'), h('div', { class: 'ivy-vine' }));
}

/**
 * The floor lamp: a brass arc standing beside the case, its arm reaching
 * over the top. It follows the time of day (and stays on on a rainy day)
 * unless someone has clicked it, which holds for the rest of the visit.
 */
let lampOverride = null;

export function floorLamp(onChange) {
  const el = h('button', { class: 'floor-lamp', type: 'button', tabindex: '-1', 'aria-hidden': 'true', title: 'Lamp' },
    h('span', { class: 'fl-glow' }),
    h('span', { class: 'fl-pole' }),
    h('span', { class: 'fl-base' }),
    lampArt());
  el.addEventListener('click', () => {
    lampOverride = !el.classList.contains('on');
    onChange();
  });
  return el;
}

/**
 * Set the time of day on the bookshelf and keep it current while the page is
 * open - checked every few minutes, and stopped once the page is gone.
 */
export function lightRoom(library) {
  const paint = () => {
    const tod = timeOfDay();
    library.dataset.tod = tod;
    const scene = library.querySelector('.room')?.dataset.scene;
    const on = lampOverride ?? (tod === 'night' || tod === 'dusk' || scene === 'rain');
    library.querySelector('.floor-lamp')?.classList.toggle('on', on);
    library.classList.toggle('lamp-on', on);
  };
  paint();
  const timer = setInterval(() => (library.isConnected ? paint() : clearInterval(timer)), 5 * 60 * 1000);
  return paint;
}
