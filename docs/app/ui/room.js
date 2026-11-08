/**
 * The room the bookshelf stands in: a small window that shows the sky as it
 * is outside right now, light that follows it, and a lamp on top of the case
 * that comes on after dark.
 *
 * All decoration - quiet on purpose. The light on the shelves shifts a little;
 * nothing ever makes a book harder to read.
 *
 * Sunrise and sunset are worked out from the date for a mid-northern latitude
 * (about Montreal's), since the site never asks where anyone is: short days in
 * December, long ones in June, and summer time handled through the clock's own
 * offset.
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

/** The window: sky, sun or moon, a few stars, two slow clouds. */
export function roomWindow() {
  const stars = Array.from({ length: 7 }, (_, n) => h('i', { class: 'win-star', style: `--n:${n}` }));
  return h('div', { class: 'room-window', 'aria-hidden': 'true' },
    h('div', { class: 'win-sky' },
      h('i', { class: 'win-sun' }), h('i', { class: 'win-moon' }), stars,
      h('i', { class: 'win-cloud c1' }), h('i', { class: 'win-cloud c2' })),
    h('div', { class: 'win-frame' }),
    h('div', { class: 'win-sill' }));
}

/**
 * The lamp. It follows the time of day unless someone has clicked it, which
 * holds for the rest of the visit - an easter egg rather than a setting.
 */
let lampOverride = null;

export function roomLamp(onChange) {
  const el = h('button', { class: 'room-lamp', type: 'button', tabindex: '-1', 'aria-hidden': 'true' },
    h('span', { class: 'lamp-glow' }), lampArt());
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
    const on = lampOverride ?? (tod === 'night' || tod === 'dusk');
    library.querySelector('.room-lamp')?.classList.toggle('on', on);
    library.classList.toggle('lamp-on', on);
  };
  paint();
  const timer = setInterval(() => (library.isConnected ? paint() : clearInterval(timer)), 5 * 60 * 1000);
  return paint;
}
