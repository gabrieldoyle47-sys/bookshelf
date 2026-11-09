/**
 * The room the bookshelf stands in.
 *
 * The case stands against the back wall of a small room drawn in perspective
 * - back wall, side walls, floor and ceiling - and the chosen scene furnishes
 * it:
 *
 *   library  bookcases lining the side walls, a rolling ladder, panelled
 *            walnut behind the case, a writing desk with a green banker's
 *            lamp, a floor globe, a Persian rug
 *   fire     a chimney breast standing out from the right wall with a fire
 *            going and a painting over it, a leather wingback turned to the
 *            fire, a wine table, a basket of logs, firelight on the floor
 *   rain     a dark bedroom on a stormy night: rain and lightning only in the
 *            window, the bed against the wall in front with its lamp lit and
 *            a cat asleep on it
 *   cafe     a chalkboard menu, a marble-topped counter, a café table between
 *            bentwood chairs, pendant lights, tiles and a checked floor
 *
 * Every room has its window on the left wall, and the light in each room is
 * one light: the window by day, the fire, the lamps - the furniture's faces
 * and shadows (room-art.js) and the light on the floor and walls agree on it.
 *
 * The scene is picked with the switch above the room (sceneSwitch), and with
 * sound on its sound plays (sound.js). The window's sky and the light in the
 * room follow the time of day.
 *
 * Sunrise and sunset are worked out from the date for a mid-northern latitude
 * (about Montreal's), since the site never asks where anyone is.
 *
 * The drawings are fixed SVG written here and in room-art.js, parsed from
 * those constant strings only - nothing typed by anyone goes through the
 * parser.
 */

import { h } from './dom.js';
import { FURNITURE } from './room-art.js';

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

// The flat drawings: what hangs on the walls or stands on the case. The
// furniture standing in the room is in room-art.js, drawn in perspective.
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
  // The fireplace in the chimney breast: a pale stone surround and mantel, a
  // deep firebox (its inner walls drawn in so it has depth), a brick back, a
  // fire on a grate with the glow round it, a brass fender, and on the mantel
  // a clock between two candles.
  fireplace: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 172">
    <defs><radialGradient id="fp-glow" cx="50%" cy="80%" r="60%"><stop offset="0" stop-color="#ffd27a" stop-opacity=".95"/><stop offset=".45" stop-color="#f08a2c" stop-opacity=".55"/><stop offset="1" stop-color="#f08a2c" stop-opacity="0"/></radialGradient>
    <linearGradient id="fp-stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2d8c8"/><stop offset="1" stop-color="#c4b7a3"/></linearGradient>
    <pattern id="fp-brick" width="16" height="8" patternUnits="userSpaceOnUse"><rect width="16" height="8" fill="#5e2a1c"/><path d="M0 .5h16M0 4.5h16M4 .5v4M12 4.5v4" stroke="#3a180f" stroke-width="1"/></pattern></defs>
    <rect x="16" y="44" width="168" height="128" fill="url(#fp-stone)"/>
    <path d="M16 44h12v128H16zM172 44h12v128h-12z" fill="#cfc3b0"/><path d="M28 44v128M172 44v128" stroke="#a89a85" stroke-width="1.4"/>
    <rect x="4" y="34" width="192" height="11" rx="2" fill="#d9cfbf"/><rect x="4" y="34" width="192" height="3" rx="1.5" fill="#efe7da"/>
    <path d="M10 45h180l-4 5H14z" fill="#9c8f7c"/>
    <path d="M48 172V92c0-14 10-22 52-22s52 8 52 22v80z" fill="#a69883"/>
    <path d="M54 172V94c0-11 9-18 46-18s46 7 46 18v78z" fill="#140c08"/>
    <path d="M64 172V100c0-8 8-13 36-13s36 5 36 13v72z" fill="url(#fp-brick)"/>
    <path d="M54 94c0-11 9-18 46-18s46 7 46 18l-10 6c0-8-8-13-36-13s-36 5-36 13z" fill="#2a1710"/>
    <path d="M54 94l10 6v72H54zM146 94l-10 6v72h10z" fill="#24140d"/>
    <ellipse cx="100" cy="150" rx="46" ry="34" fill="url(#fp-glow)"/>
    <path d="M70 166h60" stroke="#1d1411" stroke-width="5" stroke-linecap="round"/>
    <path d="M72 164v-8M84 164v-8M96 164v-8M108 164v-8M120 164v-8M128 164v-8" stroke="#1d1411" stroke-width="2"/>
    <path d="M74 158l52-8M78 150l46 9" stroke="#5a3a24" stroke-width="7" stroke-linecap="round"/>
    <path d="M74 158l52-8" stroke="#ff8a3a" stroke-width="2" stroke-linecap="round" opacity=".7"/>
    <g class="flames">
      <path class="fl f1" d="M80 156c-6-18 6-26 4-42 12 12 16 26 10 42z" fill="#e8672a"/>
      <path class="fl f2" d="M92 156c-4-26 12-36 9-60 16 20 20 40 11 60z" fill="#f08a2c"/>
      <path class="fl f3" d="M108 156c-2-18 8-26 8-42 12 14 12 30 5 42z" fill="#f4a24c"/>
      <path class="fl f4" d="M96 156c-2-14 6-22 6-34 9 12 11 24 6 34z" fill="#ffd27a"/>
      <path class="fl f2" d="M112 156c-2-10 4-14 4-22 7 8 7 16 3 22z" fill="#ffe7a8"/>
    </g>
    <path d="M70 162h60" stroke="#ff9a4a" stroke-width="2" opacity=".55"/>
    <path d="M40 160h120M40 160v12M160 160v12M40 166h120" stroke="#c99a3e" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <circle cx="40" cy="160" r="3" fill="#e0b55a"/><circle cx="160" cy="160" r="3" fill="#e0b55a"/>
    <rect x="34" y="14" width="7" height="20" rx="1.5" fill="#f4ead6"/><path class="flame" d="M37.5 3c4 5 4 8 0 10-4-2-4-5 0-10z" fill="#ffb347"/>
    <rect x="159" y="18" width="7" height="16" rx="1.5" fill="#f4ead6"/><path class="flame" d="M162.5 8c3.5 4 3.5 7 0 9-3.5-2-3.5-5 0-9z" fill="#ffb347"/>
    <path d="M86 34c0-16 6-24 14-24s14 8 14 24z" fill="#6e4426"/><circle cx="100" cy="22" r="8" fill="#f6efe0" stroke="#c99a3e" stroke-width="1.6"/>
    <path d="M100 22v-5M100 22l3.5 2" stroke="#2a1c10" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M128 34c-2-8 2-12 6-12s8 4 6 12z" fill="#3f6f5f"/><path d="M134 22c-4-6-2-12 2-14M134 22c2-6 8-8 10-6" stroke="#4f8a5c" stroke-width="1.6" fill="none"/></svg>`,
  // The painting over the mantel: a moonlit lake in a gilt frame.
  overmantel: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90">
    <rect x="1" y="1" width="118" height="88" rx="2" fill="#b8892f"/><rect x="5" y="5" width="110" height="80" fill="#8a6420"/><rect x="9" y="9" width="102" height="72" fill="#d9b25a"/>
    <rect x="13" y="13" width="94" height="64" fill="#1f2c3c"/>
    <circle cx="80" cy="30" r="7" fill="#efe6c8"/>
    <path d="M13 56c14-12 22-14 34-6s18 2 26-6 22-4 34 6v27H13z" fill="#2f3f36"/>
    <path d="M13 64h94v13H13z" fill="#26384a"/><path d="M60 66h40M66 70h28" stroke="#efe6c8" stroke-width="1.2" opacity=".5"/></svg>`,
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
  // The library's pendant: green cased glass on a brass fitting, like the banker's lamp.
  pendantLibrary: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 70">
    <path d="M30 0v26" stroke="#b8893a" stroke-width="2"/><rect x="26" y="24" width="8" height="8" rx="1.5" fill="#c99a52"/>
    <path d="M8 54c0-15 10-24 22-24s22 9 22 24z" fill="#2f6b4f"/><path d="M14 46c4-8 10-12 16-12" stroke="#5fa07f" stroke-width="2.4" fill="none" opacity=".6"/>
    <path d="M7 54h46" stroke="#b8893a" stroke-width="3" stroke-linecap="round"/>
    <ellipse class="pendant-bulb" cx="30" cy="56" rx="9" ry="4" fill="#fff0bf"/></svg>`,
  // The fireside's: a black iron lantern with a candle bulb.
  pendantFire: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 70">
    <path d="M30 0v14" stroke="#2a2420" stroke-width="2"/><circle cx="30" cy="16" r="3" fill="none" stroke="#2a2420" stroke-width="2"/>
    <path d="M18 24h24l-4-5H22z" fill="#2a2420"/>
    <path d="M20 24h20v30H20z" fill="rgb(255 200 120 / .22)"/>
    <ellipse class="pendant-bulb" cx="30" cy="42" rx="4" ry="7" fill="#fff0bf"/>
    <path d="M20 24v30M40 24v30M30 24v30M20 39h20" stroke="#2a2420" stroke-width="2.2"/>
    <path d="M16 54h28l-4 5H20z" fill="#2a2420"/><path d="M30 59v5" stroke="#2a2420" stroke-width="2"/></svg>`,
  // The bedroom's: a soft linen drum shade, light spilling below it.
  pendantRain: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 70">
    <path d="M30 0v26" stroke="#d8cfc0" stroke-width="1.6"/>
    <path d="M9 30h42l-2 22H11z" fill="#e8dcc6"/><path d="M9 30h42" stroke="#cdbfa6" stroke-width="2"/>
    <path d="M14 34v15M22 34v15M30 34v15M38 34v15M46 34v15" stroke="#d9cbb2" stroke-width="1" opacity=".7"/>
    <ellipse class="pendant-bulb" cx="30" cy="53" rx="18" ry="3" fill="#fff0bf"/></svg>`,
  // A pendant light on a long cord.
  pendant: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 70">
    <path d="M30 0v30" stroke="#2f2f33" stroke-width="1.6"/>
    <path d="M12 52c0-14 8-22 18-22s18 8 18 22z" fill="#2f4f45"/><path d="M12 52h36" stroke="#1f3a32" stroke-width="2"/>
    <ellipse class="pendant-bulb" cx="30" cy="54" rx="7" ry="5" fill="#fff0bf"/></svg>`,
};

const parsed = new Map();
function drawing(name, cls = '') {
  if (!parsed.has(name)) parsed.set(name, new DOMParser().parseFromString(FURNITURE[name] ?? ART[name], 'image/svg+xml').documentElement);
  const svg = document.importNode(parsed.get(name), true);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return h('span', { class: `room-item ${name} ${cls}`.trim(), 'aria-hidden': 'true' }, svg);
}

/** A window: sky, sun or moon, stars, clouds, and a storm if it is a stormy night. */
function roomWindow(stormy, season = null) {
  const stars = Array.from({ length: 10 }, (_, n) => h('i', { class: 'win-star', style: `--n:${n}` }));
  return h('div', { class: `wall-window${stormy ? ' rainy' : ''}`, 'aria-hidden': 'true' },
    h('div', { class: 'win-sky' },
      h('i', { class: 'win-sun' }), h('i', { class: 'win-moon' }), stars,
      h('i', { class: 'win-cloud c1' }), h('i', { class: 'win-cloud c2' }),
      stormy ? [h('i', { class: 'rain r1' }), h('i', { class: 'rain r2' }),
        ...Array.from({ length: 8 }, (_, n) => h('i', { class: 'raindrop', style: `--n:${n}` }))] : null,
      // The season outside: leaves, snow or blossom drifting past.
      season && season !== 'summer' ? h('div', { class: `season-fx ${season}` },
        Array.from({ length: 12 }, (_, n) => h('i', { style: `--n:${n}` }))) : null),
    stormy ? h('i', { class: 'win-flash' }) : null,
    h('div', { class: 'win-frame' }),
    h('i', { class: 'win-cafe' }),
    h('div', { class: 'win-sill' }, stormy ? h('span', { class: 'sill-candle' }, h('i')) : null,
      season === 'winter' ? h('i', { class: 'sill-snow' }) : null, season === 'autumn' ? h('i', { class: 'sill-pumpkin' }) : null),
    h('i', { class: 'win-curtain l' }), h('i', { class: 'win-curtain r' }), h('i', { class: 'win-rod' }));
}

/**
 * The room itself, in perspective: a back wall the case stands against, two
 * side walls, a floor and a ceiling, hinged off the back wall's edges and
 * turned towards the viewer (CSS 3D), so the floorboards, the rug, the
 * skirting and anything on the side walls all recede properly. What hangs on
 * the walls goes on the walls themselves; the window is on the left wall and
 * throws a patch of light across the floor.
 */
export function roomBox(scene, look = {}) {
  // Every room has its window on the left wall.
  const left = [roomWindow(scene === 'rain', look.season)];
  const right = [];
  const floor = [h('div', { class: 'rug' })];
  if (scene === 'fire') {
    // A chimney breast standing out from the right wall, near enough the
    // front that the floor under its fire is in view: the fire in its face,
    // a painting over the mantel, firelight thrown round it.
    right.push(h('div', { class: 'chimney' },
      h('div', { class: 'ch-face front' }, h('i', { class: 'ch-glow' }), drawing('overmantel', 'over-mantel'), drawing('fireplace', 'in-chimney')),
      h('div', { class: 'ch-face side near' }), h('div', { class: 'ch-face side far' })));
    floor.push(h('div', { class: 'fire-pool' }), h('div', { class: 'hearth' }));
  } else if (scene === 'library') {
    right.push(h('div', { class: 'sun-splash' }), h('div', { class: 'ladder' }));
  } else if (scene === 'cafe') {
    right.push(h('div', { class: 'sun-splash' }), drawing('chalkboard', 'on-wall'));
  } else if (scene === 'rain') {
    right.push(drawing('print', 'on-wall'));
  }
  // The window's light on the floor (in the bedroom, only when the lightning
  // flashes), and the lamp's pool under it.
  floor.push(h('div', { class: 'light-patch' }), h('div', { class: 'lamp-pool' }));
  // The box holds the perspective and the fade at the top; the shell inside
  // it is the room itself. Split in two because a mask flattens 3D, so it can
  // only sit on an element whose children carry the depth.
  return h('div', { class: 'room-box', 'aria-hidden': 'true' },
    h('div', { class: 'room-shell' },
      h('div', { class: 'wall back' }),
      h('div', { class: 'wall side left' }, left),
      h('div', { class: 'wall side right' }, right),
      h('div', { class: 'floor' }, floor),
      h('div', { class: 'ceiling' })));
}

/** What stands in the room in front, at the corners - it is what makes the room deep. */
export function roomFront(scene, onLamp = () => {}, look = {}) {
  const items = {
    fire: [drawing('armchair', 'front left'), drawing('logs', 'front right')],
    rain: [drawing('bed', 'front left')],
    cafe: [drawing('cafeTable', 'front right'), drawing('counter', 'front left')],
  }[scene] ?? [drawing('globe', 'front left'), drawing('desk', 'front right')];
  return h('div', { class: 'room-front', 'aria-hidden': 'true' },
    ceilingLamps(look.lamp && look.lamp !== 'room' ? look.lamp : scene, onLamp),
    scene === 'cafe' ? h('div', { class: 'bokeh' }, Array.from({ length: 9 }, (_, n) => h('i', { style: `--n:${n}` }))) : null,
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
  const shell = room?.querySelector('.room-shell');
  const kase = room?.querySelector('.case');
  if (!box || !shell || !kase) return;
  const r = room.getBoundingClientRect();
  const c = kase.getBoundingClientRect();
  const bottom = Math.max(0, r.bottom - c.bottom);
  shell.style.bottom = `${bottom}px`;
  const css = getComputedStyle(room);
  const top = parseFloat(getComputedStyle(shell).top) || 0;
  // Where the eye stands is the scene's (--eye-x): the fireside room is seen
  // from a little left of centre, so the chimney breast on the right wall
  // turns towards us. The eye is always a little above the middle of the case.
  const eyeX = css.getPropertyValue('--eye-x').trim() || '50%';
  box.style.perspectiveOrigin = `${eyeX} ${Math.round(top + (r.height - top - bottom) * 0.42)}px`;
}

/** The four scenes, for the switch on the bookshelf page. */
export const SCENES = [['library', 'ico-books', 'Library'], ['fire', 'ico-fire', 'Fireplace'], ['rain', 'ico-rain', 'Rainy'], ['cafe', 'ico-cup', 'Café']];

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
    class: 'scene-opt', type: 'button', role: 'radio', dataset: { id }, 'aria-checked': String(id === current), title: label, 'aria-label': label,
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
 * The room's lights: two lamps hanging from the ceiling either side of the
 * case, in the room's own style. They follow the time of day (on at dusk and
 * night, always in the bedroom and the café) unless someone has clicked one,
 * which holds for the rest of the visit.
 */
let lampOverride = null;
const LAMP_ART = { library: 'pendantLibrary', fire: 'pendantFire', rain: 'pendantRain', cafe: 'pendant' };

function ceilingLamps(scene, onChange) {
  return ['p1', 'p2'].map((pos) => {
    const el = drawing(LAMP_ART[scene] ?? 'pendantLibrary', `pendant ${pos}`);
    el.setAttribute('title', 'Light');
    el.addEventListener('click', () => {
      lampOverride = !el.closest('.library')?.classList.contains('lamp-on');
      onChange();
    });
    return el;
  });
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
    const on = lampOverride ?? (tod === 'night' || tod === 'dusk' || scene === 'rain' || scene === 'cafe');
    library.classList.toggle('lamp-on', on);
  };
  paint();
  const timer = setInterval(() => (library.isConnected ? paint() : clearInterval(timer)), 5 * 60 * 1000);
  return paint;
}
