/**
 * The site's drawn pieces: empty-state illustrations, the bookshelf of
 * spines, and a small celebration.
 *
 * Illustrations are fixed SVG written here, coloured with the theme's CSS
 * variables so they sit right in light and dark. They are parsed with
 * DOMParser from these constant strings only - nothing a user typed ever
 * goes through it, which is why this is the one place markup is parsed.
 */

import { h } from './dom.js';
import { arrangeShelf, shelfOrder } from '../core/arrange.js';

/* ---------------------------------------------------------- illustrations */

const PAPER = 'var(--surface-3)';
const INK = 'var(--text-faint)';
const ACCENT = 'var(--accent)';
const SOFT = 'var(--accent-soft)';
const STAR = 'var(--star)';

const ART = {
  // A shelf with three books leaning, and room for more.
  books: `
    <rect x="18" y="92" width="124" height="5" rx="2.5" fill="${INK}" opacity=".5"/>
    <rect x="34" y="40" width="16" height="52" rx="2" fill="${ACCENT}"/>
    <rect x="37" y="48" width="10" height="2" rx="1" fill="${SOFT}"/>
    <rect x="52" y="30" width="14" height="62" rx="2" fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/>
    <rect x="55" y="38" width="8" height="2" rx="1" fill="${INK}"/>
    <rect x="68" y="44" width="15" height="48" rx="2" transform="rotate(14 75 92)" fill="${SOFT}" stroke="${ACCENT}" stroke-width="1.5"/>
    <path d="M112 92c0-14 6-24 6-24s6 10 6 24z" fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/>
    <path d="M118 68c-4-8-12-10-16-8 2 6 9 10 16 8zM118 74c4-9 12-12 17-10-2 7-10 12-17 10z" fill="${ACCENT}" opacity=".75"/>`,
  // A calendar page with a star: nothing announced yet.
  calendar: `
    <rect x="44" y="24" width="72" height="68" rx="9" fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/>
    <rect x="44" y="24" width="72" height="18" rx="9" fill="${ACCENT}"/>
    <rect x="44" y="36" width="72" height="6" fill="${ACCENT}"/>
    <rect x="58" y="16" width="5" height="14" rx="2.5" fill="${INK}"/>
    <rect x="97" y="16" width="5" height="14" rx="2.5" fill="${INK}"/>
    <path d="M80 52l4.2 8.6 9.5 1.4-6.9 6.7 1.6 9.4L80 73.6l-8.4 4.5 1.6-9.4-6.9-6.7 9.5-1.4z" fill="${STAR}"/>
    <circle cx="128" cy="30" r="3" fill="${STAR}" opacity=".7"/><circle cx="34" cy="60" r="2" fill="${ACCENT}" opacity=".6"/>`,
  // An envelope with a book peeking out: recommendations.
  letter: `
    <rect x="36" y="44" width="88" height="54" rx="8" fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/>
    <rect x="58" y="20" width="44" height="52" rx="3" fill="${ACCENT}"/>
    <rect x="64" y="28" width="32" height="3" rx="1.5" fill="${SOFT}"/>
    <rect x="64" y="35" width="22" height="3" rx="1.5" fill="${SOFT}"/>
    <path d="M37 47l43 30 43-30v49a2 2 0 0 1-2 2H39a2 2 0 0 1-2-2z" fill="${PAPER}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M80 62c-3-5-11-4-11 2 0 5 11 11 11 11s11-6 11-11c0-6-8-7-11-2z" fill="${ACCENT}"/>`,
  // A bell with sparkles: no news yet.
  bell: `
    <path d="M80 22c-15 0-26 12-26 27v18l-8 12h68l-8-12V49c0-15-11-27-26-27z" fill="${PAPER}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M70 84a10 10 0 0 0 20 0z" fill="${ACCENT}"/>
    <rect x="76" y="14" width="8" height="10" rx="4" fill="${INK}"/>
    <path d="M122 30l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="${STAR}"/>
    <path d="M36 44l1.5 4 4 1.5-4 1.5L36 55l-1.5-4-4-1.5 4-1.5z" fill="${ACCENT}" opacity=".7"/>`,
  // Two open books overlapping: reading together.
  together: `
    <path d="M24 46c14-6 30-6 44 0v44c-14-6-30-6-44 0z" fill="${PAPER}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M68 46c14-6 30-6 44 0v44c-14-6-30-6-44 0z" fill="${SOFT}" stroke="${ACCENT}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M92 36c14-6 30-6 44 0v44c-14-6-30-6-44 0z" fill="${ACCENT}" opacity=".85"/>
    <path d="M32 58h28M32 66h22M76 58h28M76 66h20" stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity=".6"/>`,
};

const parsed = new Map();

/** A drawing by name, sized by CSS. Decorative, so hidden from screen readers. */
export function art(name) {
  if (!ART[name]) return null;
  if (!parsed.has(name)) {
    const doc = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 110">${ART[name]}</svg>`, 'image/svg+xml');
    parsed.set(name, doc.documentElement);
  }
  const svg = document.importNode(parsed.get(name), true);
  svg.setAttribute('class', 'art');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
}

/** An empty state with a drawing above the words. */
export function emptyArt(name, text, ...extra) {
  return h('div', { class: 'empty empty-art' }, art(name), h('p', { text }), ...extra);
}

/* ------------------------------------------------------------- bookshelf */

/**
 * Cloth colours for spines, deep enough that light gold lettering reads in
 * both themes.
 */
const CLOTH = ['#7a2e2e', '#2f4858', '#3f5e3a', '#9a6b1f', '#2c6e6a', '#5b3a63',
  '#4a5568', '#a4532b', '#1f3b5a', '#6b4f2a', '#6d2c4b', '#365f7a', '#54632a', '#3b3355',
  '#8a3b4f', '#2e5e4e', '#6a4c93', '#7c5a1e', '#25576d', '#9b4a2a'];

/**
 * Distinct cloth colours, ordered so each sits far from the last in hue -
 * warm, cool, warm - and deep enough for light lettering in either theme.
 */
const SHELF_CLOTH = ['#8a2d2d', '#1f4e79', '#b8861f', '#2f6b4f', '#6a3d7a', '#b4532a', '#2c7a7b',
  '#8a2f55', '#3b5b8c', '#6b7a2a', '#4b3a8c', '#9b6a3c', '#245a4a', '#a23b5c'];

/**
 * Colours for a whole shelf at once. Series (and standalone authors) take
 * colours in the order they stand on the shelf, so neighbours always differ
 * and no two series share one until the palette runs out. Worked out from
 * the shelf's own arrangement, so the bookshelf page and the profile
 * header's strip agree.
 */
export function shelfPalette(books) {
  const map = new Map();
  for (const b of shelfOrder(arrangeShelf(books ?? []))) {
    const key = paletteKey(b);
    if (!map.has(key)) map.set(key, SHELF_CLOTH[map.size % SHELF_CLOTH.length]);
  }
  return (book) => ({ ...spineStyle(book), cloth: map.get(paletteKey(book)) ?? spineStyle(book).cloth });
}

const paletteKey = (b) => (b.series?.id ? `series:${b.series.id}`
  : `author:${b.authors?.[0]?.id ?? b.authors?.[0]?.name ?? b.title}`);

/**
 * A book's colour. Every book in a series shares one, so a set reads as a
 * set at a glance; a standalone takes its author's colour. Hashed from the
 * series (or author), so it never changes.
 */
export function spineStyle(book) {
  if (book.series?.id) {
    const n = hash(`series:${book.series.id}`);
    // One plain finish for every book: decoration on a spine should mean
    // something, and the only thing it means here is a five-star rating.
    return { cloth: CLOTH[n % CLOTH.length], finish: 'plain' };
  }
  const who = book.authors?.[0]?.id ?? book.authors?.[0]?.name ?? book.title;
  return { cloth: CLOTH[hash(`author:${who}`) % CLOTH.length], finish: 'plain' };
}

function hash(s) {
  let n = 2166136261;
  for (const ch of String(s)) n = Math.imul(n ^ ch.codePointAt(0), 16777619);
  return n >>> 0;
}

/**
 * Everything someone has finished, as spines on a shelf: thicker and taller
 * for longer books, a gold band on the ones they rated five stars. It is the
 * picture of a reading life that a list never gives you.
 */
export function bookshelf(books, onOpen, { label = 'Your shelf', palette = spineStyle } = {}) {
  if (!books.length) return null;
  const longest = Math.max(400, ...books.map((b) => b.pages ?? 0));
  const spines = books.map((b) => {
    const pages = Math.min(b.pages ?? 320, 1400);
    const t = pages / Math.min(longest, 1400);
    const { cloth: colour, finish } = palette(b);
    return h('button', {
      class: `spine ${finish}${b.rating >= 5 ? ' gilt' : ''}`, type: 'button',
      // Mouse and touch only: every book here is also in the Finished list,
      // and fifty Tab stops would stand between a keyboard user and the page.
      tabindex: '-1',
      style: `--h:${Math.round(78 + t * 46)}px;--w:${Math.round(15 + t * 17)}px;--cloth:${colour}`,
      title: `${b.title}${b.rating ? ` — ${b.rating}★` : ''}${b.pages ? ` · ${b.pages} pages` : ''}`,
      'aria-label': `${b.title}${b.rating ? `, rated ${b.rating}` : ''}`,
      onclick: () => onOpen(b),
    }, h('span', { class: 'spine-title', text: b.title }));
  });
  return h('div', { class: 'bookshelf', role: 'group', 'aria-label': label },
    h('div', { class: 'shelf-row' }, spines),
    h('div', { class: 'shelf-plank', 'aria-hidden': 'true' }));
}

/* ------------------------------------------------------------ ornaments */

const ORNAMENTS = {
  // A potted plant with a trailing leaf.
  plant: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 130">
    <path d="M14 98h36l-4 30H18z" fill="#b5653d"/><path d="M12 94h40v7H12z" fill="#c97a4f"/>
    <path d="M32 96C30 70 18 58 8 56c4 14 12 26 24 40z" fill="#3f7d4c"/>
    <path d="M32 96c2-28 14-44 26-46-2 18-12 34-26 46z" fill="#4f9a5c"/>
    <path d="M32 96c-1-22 2-40 8-52 4 16 0 34-8 52z" fill="#367043"/>
    <path d="M33 96c-6-16-4-30 0-40 6 10 6 26 0 40z" fill="#5fae6b"/>
    <path d="M50 100c6 6 8 14 6 22" fill="none" stroke="#4f9a5c" stroke-width="3" stroke-linecap="round"/></svg>`,
  // A candle in a brass holder; the flame flickers in CSS.
  candle: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 130">
    <ellipse cx="20" cy="124" rx="17" ry="5" fill="#b8893a"/><path d="M8 118h24v6H8z" fill="#d8b261"/>
    <rect x="12" y="66" width="16" height="54" rx="2" fill="#f4ead6"/><path d="M12 70c4 3 12 3 16 0v-4H12z" fill="#e6d8bc"/>
    <path d="M20 66v-6" stroke="#3b2a1b" stroke-width="1.6"/>
    <path class="flame" d="M20 36c6 8 7 15 0 22-7-7-6-14 0-22z" fill="#ffb347"/>
    <path class="flame" d="M20 46c3 4 3 8 0 11-3-3-3-7 0-11z" fill="#fff3c4"/></svg>`,
  // A cat asleep, curled up; the tail tip twitches.
  cat: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 70">
    <ellipse cx="60" cy="64" rx="48" ry="5" fill="#000" opacity=".25"/>
    <path d="M18 60c0-22 18-36 42-36s40 12 40 30c0 4-2 6-6 6H22c-3 0-4-0-4 0z" fill="#3b3a3f"/>
    <path d="M28 44c-6-4-10-12-8-20l8 8c4-2 8-2 12-1l6-9c3 8 1 16-4 21" fill="#3b3a3f"/>
    <path d="M24 26l3 7M42 23l-2 8" stroke="#e8a6b0" stroke-width="2" stroke-linecap="round"/>
    <path d="M26 44c2 2 5 2 7 0M36 44c2 2 5 2 7 0" stroke="#c9c2cf" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M60 34c14-4 28 2 32 14" stroke="#4a4950" stroke-width="2" fill="none" opacity=".6"/>
    <path class="tail" d="M98 56c10 0 16-8 12-16-2-4-8-4-8 0 0 3 3 3 3 6 0 4-4 6-9 6z" fill="#3b3a3f"/></svg>`,
  // A mug of tea, steam rising.
  mug: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 100">
    <path class="steam" d="M22 40c-4-6 4-10 0-16s4-10 0-16" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".45"/>
    <path class="steam s2" d="M34 42c-4-6 4-10 0-16s4-10 0-16" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".35"/>
    <path d="M10 50h36v36c0 6-5 10-10 10H20c-5 0-10-4-10-10z" fill="#e7dcc8"/>
    <path d="M46 58h4a8 8 0 0 1 0 16h-4" stroke="#e7dcc8" stroke-width="5" fill="none"/>
    <path d="M10 50h36v8H10z" fill="#7a2e2e"/><ellipse cx="28" cy="50" rx="18" ry="3" fill="#6b4226"/></svg>`,
  // An hourglass; the sand runs.
  hourglass: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 110">
    <rect x="4" y="4" width="42" height="7" rx="2" fill="#7a5530"/><rect x="4" y="99" width="42" height="7" rx="2" fill="#7a5530"/>
    <rect x="7" y="11" width="3" height="88" fill="#9c6f40"/><rect x="40" y="11" width="3" height="88" fill="#9c6f40"/>
    <path d="M13 12h24c0 20-10 26-10 43 0 17 10 23 10 43H13c0-20 10-26 10-43 0-17-10-23-10-43z" fill="rgb(210 230 240 / .28)" stroke="rgb(255 255 255 / .5)"/>
    <path class="sand-top" d="M16 22h18c-2 12-7 18-9 26-2-8-7-14-9-26z" fill="#e3c176"/>
    <path d="M24.5 55v38" class="sand-stream" stroke="#e3c176" stroke-width="1.4"/>
    <path d="M15 96c3-10 7-14 10-14s7 4 10 14z" fill="#e3c176"/></svg>`,
  // A little globe on a brass stand.
  globe: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 110">
    <ellipse cx="35" cy="104" rx="20" ry="4" fill="#b8893a"/><path d="M30 92h10l3 12H27z" fill="#d8b261"/>
    <path d="M12 46a26 26 0 0 0 46 18" stroke="#d8b261" stroke-width="3" fill="none"/>
    <g class="globe-spin"><circle cx="38" cy="42" r="23" fill="#2c6e8a"/>
    <path d="M26 30c6-4 10 0 9 6s6 8 3 13-9 2-11 8c-6-6-8-18-1-27zM44 24c6 1 12 6 14 12-5 1-7-3-11-2s-6-6-3-10zM46 52c5-2 9 2 10 6-4 4-9 6-12 4 0-4 0-8 2-10z" fill="#6fae6a"/></g>
    <circle cx="38" cy="42" r="23" fill="none" stroke="rgb(0 0 0 / .25)" stroke-width="2"/>
    <path d="M38 92V66" stroke="#d8b261" stroke-width="3"/></svg>`,
  // The pot that sits on top of the case; the vine is drawn in CSS down the side.
  ivyPot: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 80">
    <path d="M22 44h46l-6 34H28z" fill="#b5653d"/><path d="M18 38h54v8H18z" fill="#c97a4f"/>
    <path d="M44 40c-6-14-20-18-30-14 6 10 18 16 30 14z" fill="#3f7d4c"/>
    <path d="M46 40c4-16 18-24 30-22-4 12-16 20-30 22z" fill="#4f9a5c"/>
    <path d="M45 40c-2-14 2-26 8-32 3 12 0 24-8 32z" fill="#5fae6b"/>
    <path d="M30 40c-10 4-18 14-20 24M60 40c10 6 18 16 22 30" stroke="#3f7d4c" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="10" cy="64" rx="6" ry="4" fill="#4f9a5c" transform="rotate(-40 10 64)"/>
    <ellipse cx="82" cy="70" rx="6" ry="4" fill="#3f7d4c" transform="rotate(40 82 70)"/></svg>`,
  // A teapot, a wisp of steam from the spout.
  teapot: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80">
    <path class="steam" d="M86 22c-3-5 3-8 0-13" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".4"/>
    <ellipse cx="46" cy="76" rx="30" ry="3.5" fill="#000" opacity=".25"/>
    <path d="M18 46c0-14 12-22 28-22s28 8 28 22c0 16-10 28-28 28S18 62 18 46z" fill="#5b7f9a"/>
    <path d="M22 44c6 3 42 3 48 0" stroke="#e8eef2" stroke-width="2.4" fill="none" opacity=".7"/>
    <path d="M72 44c8-2 12-8 14-18l4 2c-2 12-8 22-18 24z" fill="#5b7f9a"/>
    <path d="M20 40c-10-2-14 6-12 14 2 7 8 8 12 6" stroke="#5b7f9a" stroke-width="5" fill="none"/>
    <ellipse cx="46" cy="25" rx="16" ry="4" fill="#4a6d87"/><circle cx="46" cy="18" r="4" fill="#e3c176"/></svg>`,
  // A snow globe: a tiny pine and falling snow.
  snowGlobe: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 96">
    <path d="M12 78h46l-4 16H16z" fill="#7a5530"/><rect x="10" y="74" width="50" height="6" rx="2" fill="#9c6f40"/>
    <circle cx="35" cy="44" r="30" fill="rgb(200 225 245 / .22)" stroke="rgb(255 255 255 / .55)" stroke-width="1.5"/>
    <path d="M35 30l-10 16h6l-8 12h24l-8-12h6z" fill="#2f6b4f"/><rect x="33" y="58" width="4" height="6" fill="#6b4226"/>
    <ellipse cx="35" cy="68" rx="22" ry="4" fill="#f4f7fa"/>
    <g class="snow" fill="#fff"><circle cx="22" cy="30" r="1.4"/><circle cx="48" cy="26" r="1.2"/><circle cx="28" cy="48" r="1"/>
    <circle cx="50" cy="44" r="1.4"/><circle cx="40" cy="20" r="1"/><circle cx="18" cy="54" r="1.2"/></g>
    <path d="M18 30a20 20 0 0 1 14-14" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".55"/></svg>`,
  // A small framed picture on a stand: hills under a low sun.
  frame: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 76 100">
    <path d="M52 96l-8-30" stroke="#5a3d26" stroke-width="3"/>
    <rect x="6" y="18" width="56" height="74" rx="3" fill="#b8893a" transform="rotate(-6 34 55)"/>
    <g transform="rotate(-6 34 55)"><rect x="12" y="24" width="44" height="62" fill="#f1dcb8"/>
    <circle cx="40" cy="44" r="8" fill="#e98a4f"/><path d="M12 70c10-12 20-12 28-4s12 2 16-4v24H12z" fill="#5f8a5b"/>
    <path d="M12 78c12-8 24-6 44 0v8H12z" fill="#3f6b45"/></g></svg>`,
  // A cluster of amethyst.
  crystal: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 80">
    <ellipse cx="35" cy="76" rx="28" ry="3.5" fill="#000" opacity=".25"/>
    <path d="M10 76l6-26 8 26z" fill="#7d5ba6"/><path d="M22 76l10-56 10 56z" fill="#9b7bc8"/>
    <path d="M32 20l10 56h-10z" fill="#6f4f99"/><path d="M40 76l10-36 8 36z" fill="#8a69b8"/>
    <path d="M50 40l8 36h-8z" fill="#5e4285"/><path d="M28 40l4-20 2 30z" fill="#fff" opacity=".35"/>
    <path d="M6 76h58" stroke="#4a3566" stroke-width="3" stroke-linecap="round"/></svg>`,
  // A stack of three books lying flat, the right way up.
  bookStack: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 60">
    <rect x="6" y="42" width="78" height="14" rx="2" fill="#2f4858"/><rect x="8" y="44" width="74" height="2" fill="#e3c176" opacity=".6"/>
    <rect x="12" y="28" width="66" height="14" rx="2" fill="#8a2d2d"/><rect x="14" y="34" width="62" height="2" fill="#f4ead6" opacity=".5"/>
    <rect x="18" y="16" width="56" height="12" rx="2" fill="#b8861f"/><rect x="20" y="21" width="52" height="2" fill="#3a2608" opacity=".4"/>
    <path d="M78 42v14M84 46v6" stroke="#f4ead6" stroke-width="1" opacity=".5"/></svg>`,
  // A cat sitting up, tail curled round; it blinks now and then.
  sittingCat: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 110">
    <ellipse cx="34" cy="106" rx="26" ry="3.5" fill="#000" opacity=".25"/>
    <path class="tail" d="M48 100c14 0 18-10 14-20-2-5-8-4-7 1 1 4 4 6 2 11-2 4-6 5-9 5z" fill="#c98a4b"/>
    <path d="M14 104c-2-24 2-44 20-52 16 4 22 26 18 52z" fill="#d99a5b"/>
    <path d="M24 104c0-14 4-26 10-30 6 4 10 16 9 30z" fill="#f2d2a8"/>
    <path d="M16 36l2-22 12 12h8l12-12 2 22c0 12-8 20-18 20s-18-8-18-20z" fill="#d99a5b"/>
    <path d="M20 18l7 8M48 18l-7 8" stroke="#f2b6b0" stroke-width="2.4" stroke-linecap="round"/>
    <g class="eyes" fill="#3a2a1a"><ellipse cx="27" cy="37" rx="2.4" ry="3"/><ellipse cx="41" cy="37" rx="2.4" ry="3"/></g>
    <path d="M32 44l2 2 2-2" stroke="#8a4a3a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M22 30l-6-2M46 30l6-2" stroke="#a86a3a" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  // A robin on a twig; it tilts its head.
  bird: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
    <path d="M6 70h64M60 70l8-8" stroke="#6b4a2a" stroke-width="4" stroke-linecap="round"/>
    <path d="M28 70v-8M38 70v-8" stroke="#c9822f" stroke-width="2"/>
    <path d="M18 52c0-14 10-22 22-22 10 0 16 8 16 18 0 10-8 16-20 16H22l-12 6 6-8z" fill="#6f5a48"/>
    <path d="M30 40c6-4 16-2 18 8 1 8-6 13-14 12-7-1-9-12-4-20z" fill="#e0723a"/>
    <g class="head"><circle cx="46" cy="30" r="10" fill="#6f5a48"/><path d="M44 34c4-4 9-3 10 0-2 5-7 6-10 0z" fill="#e0723a"/>
    <circle cx="49" cy="27" r="1.8" fill="#1d1a16"/><path d="M55 29l7 2-7 2z" fill="#e3a83a"/></g>
    <path d="M22 50c6 2 12 2 18-2" stroke="#4f3f32" stroke-width="2" fill="none"/></svg>`,
  // A carved wooden owl.
  owl: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 84">
    <ellipse cx="30" cy="80" rx="20" ry="3" fill="#000" opacity=".25"/>
    <path d="M10 30c0-14 8-24 20-24s20 10 20 24v26c0 14-9 22-20 22S10 70 10 56z" fill="#8a5f36"/>
    <path d="M10 14l8 8M50 14l-8 8" stroke="#8a5f36" stroke-width="6" stroke-linecap="round"/>
    <path d="M18 52c4 10 20 10 24 0-2 14-22 14-24 0z" fill="#b48653"/>
    <path d="M20 54l3 4 3-4M27 58l3 4 3-4M34 54l3 4 3-4" stroke="#7a5230" stroke-width="1.4" fill="none"/>
    <circle cx="21" cy="30" r="8" fill="#e8d3a6"/><circle cx="39" cy="30" r="8" fill="#e8d3a6"/>
    <circle cx="21" cy="30" r="3.6" fill="#2a1c10"/><circle cx="39" cy="30" r="3.6" fill="#2a1c10"/>
    <circle cx="22.4" cy="28.6" r="1" fill="#fff"/><circle cx="40.4" cy="28.6" r="1" fill="#fff"/>
    <path d="M27 38l3 5 3-5z" fill="#d89a3a"/>
    <path d="M10 46c-4 8-2 18 6 22M50 46c4 8 2 18-6 22" stroke="#6e4a29" stroke-width="3" fill="none"/></svg>`,
  // A round bowl with a goldfish swimming in it.
  fishbowl: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
    <ellipse cx="40" cy="77" rx="26" ry="3" fill="#000" opacity=".25"/>
    <path d="M22 14h36" stroke="rgb(255 255 255 / .6)" stroke-width="3" stroke-linecap="round"/>
    <path d="M24 16C10 24 6 44 14 60c6 12 18 16 26 16s20-4 26-16c8-16 4-36-10-44" fill="rgb(200 225 245 / .22)" stroke="rgb(255 255 255 / .55)" stroke-width="2"/>
    <path d="M10 36c10 4 50 4 60 0 2 10 1 22-4 32-6 10-16 8-26 8s-20 2-26-8c-5-10-6-22-4-32z" fill="#4f9cc7" opacity=".55"/>
    <path d="M18 70c4-6 8-6 10 0M50 72c2-8 8-10 10-4" stroke="#3f7d4c" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <g class="fish"><path d="M30 50c4-6 14-6 18 0-4 6-14 6-18 0z" fill="#f08a2c"/><path d="M30 50l-7-5v10z" fill="#f4a24c"/><circle cx="44" cy="49" r="1.2" fill="#1d1a16"/></g>
    <circle class="bubble" cx="50" cy="42" r="1.6" fill="none" stroke="#fff" opacity=".7"/>
    <path d="M20 26c-4 6-5 12-4 18" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".5"/></svg>`,
  // A cactus in a terracotta pot.
  cactus: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 100">
    <path d="M14 70h32l-4 28H18z" fill="#c26b3f"/><path d="M12 66h36v7H12z" fill="#d6804f"/>
    <path d="M24 66V24c0-8 12-8 12 0v42z" fill="#4f8a55"/>
    <path d="M24 46h-6c-4 0-6-3-6-7V30c0-5 7-5 7 0v8h5zM36 40h6c3 0 4-2 4-5v-7c0-5 6-5 6 0v9c0 6-4 10-10 10h-6z" fill="#5f9a64"/>
    <path d="M30 20v44M27 30h-2M35 36h2M27 50h-2M35 56h2" stroke="#3f7247" stroke-width="1.2"/>
    <circle cx="30" cy="18" r="4" fill="#e86a8a"/><circle cx="30" cy="18" r="1.6" fill="#f7c64a"/></svg>`,
  // Tulips in a glass vase.
  tulips: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 120">
    <path d="M32 62C30 44 22 34 18 28M32 62c0-20 2-32 6-40M32 62c2-16 10-24 16-28" stroke="#3f7d4c" stroke-width="2.4" fill="none"/>
    <path d="M22 54c-8-4-12-12-10-20 8 4 12 12 10 20zM42 56c8-2 12-10 12-18-8 2-12 10-12 18z" fill="#4f9a5c"/>
    <path d="M12 28c0-8 4-12 6-12s6 4 6 12c0 4-3 6-6 6s-6-2-6-6z" fill="#e0607a"/>
    <path d="M32 22c0-8 4-12 6-12s6 4 6 12c0 4-3 6-6 6s-6-2-6-6z" fill="#f2b84b"/>
    <path d="M42 34c0-8 4-12 6-12s6 4 6 12c0 4-3 6-6 6s-6-2-6-6z" fill="#c45ab0"/>
    <path d="M20 62h24l4 50c0 4-4 6-8 6H24c-4 0-8-2-8-6z" fill="rgb(200 225 245 / .3)" stroke="rgb(255 255 255 / .55)" stroke-width="1.5"/>
    <path d="M18 84h28l2 28c0 3-3 5-6 5H22c-3 0-6-2-6-5z" fill="rgb(140 190 220 / .3)"/></svg>`,
  // A small mantel clock whose second hand goes round.
  clock: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 90">
    <ellipse cx="40" cy="86" rx="30" ry="3" fill="#000" opacity=".25"/>
    <path d="M6 84c0-8 4-12 10-14 2-30 12-56 24-56s22 26 24 56c6 2 10 6 10 14z" fill="#7a4a2a"/>
    <path d="M10 84h60" stroke="#5a3418" stroke-width="3"/>
    <circle cx="40" cy="44" r="20" fill="#d8b261"/><circle cx="40" cy="44" r="17" fill="#f6efe0"/>
    <g stroke="#3a2a1a" stroke-width="1.4"><path d="M40 29v3M40 56v3M25 44h3M52 44h3"/></g>
    <path d="M40 44V33M40 44l7 4" stroke="#2a1c10" stroke-width="2" stroke-linecap="round"/>
    <path class="second" d="M40 46V30" stroke="#b3402f" stroke-width="1" stroke-linecap="round"/>
    <circle cx="40" cy="44" r="1.6" fill="#2a1c10"/></svg>`,
  // An oil lantern with a small flame.
  lantern: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 100">
    <ellipse cx="25" cy="96" rx="18" ry="3" fill="#000" opacity=".25"/>
    <path d="M25 4c-6 0-8 4-8 8" stroke="#3a3a3e" stroke-width="2.4" fill="none"/>
    <path d="M14 18h22l-3 8H17z" fill="#3a3a3e"/>
    <path d="M15 26h20v52H15z" fill="rgb(255 210 120 / .28)" stroke="#3a3a3e" stroke-width="2.4"/>
    <path d="M25 26v52" stroke="#3a3a3e" stroke-width="1.4"/>
    <path class="flame" d="M25 46c5 6 5 11 0 15-5-4-5-9 0-15z" fill="#ffb347"/>
    <path class="flame" d="M25 52c2 3 2 5 0 7-2-2-2-4 0-7z" fill="#fff3c4"/>
    <path d="M10 78h30l-3 16H13z" fill="#3a3a3e"/></svg>`,
};

/** What an ornament can be swapped for, in the order the menu lists them. */
export const ORNAMENT_CHOICES = [
  ['plant', 'Plant'], ['candle', 'Candle'], ['cat', 'Sleeping cat'], ['mug', 'Mug of tea'], ['teapot', 'Teapot'],
  ['hourglass', 'Hourglass'], ['globe', 'Globe'], ['snowGlobe', 'Snow globe'], ['frame', 'Little painting'],
  ['crystal', 'Amethyst'], ['bookStack', 'Stack of books'], ['sittingCat', 'Sitting cat'], ['bird', 'Robin'], ['owl', 'Wooden owl'],
  ['fishbowl', 'Goldfish'], ['cactus', 'Cactus'], ['tulips', 'Tulips'], ['clock', 'Mantel clock'], ['lantern', 'Lantern'],
];

/** A decorative object for the end of a shelf. Hidden from screen readers. */
export function ornament(name) {
  const doc = new DOMParser().parseFromString(ORNAMENTS[name] ?? ORNAMENTS.plant, 'image/svg+xml');
  const svg = document.importNode(doc.documentElement, true);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return h('span', { class: `ornament ${ORNAMENTS[name] ? name : 'plant'}`, 'aria-hidden': 'true' }, svg);
}

/* --------------------------------------------------------------- the lamp */


/* ---------------------------------------------------------------- trophies */

/**
 * The trinket for a finished series, chosen by its genre and painted in the
 * series' own spine colour - so the cabinet reads against the shelves above.
 * `colour` is always one of the palette's own hex values, never user text,
 * and is checked anyway before it goes into the markup.
 */
const TRINKETS = {
  // Epic fantasy: a sword on a stand.
  sword: (c) => `<path d="M30 4l4 8v42h-8V12z" fill="#dfe6ec"/><path d="M30 6v48" stroke="#9aa6b0" stroke-width="1"/>
    <rect x="16" y="54" width="28" height="5" rx="2" fill="${c}"/><rect x="27" y="59" width="6" height="12" fill="${c}"/>
    <circle cx="30" cy="56.5" r="2.2" fill="#f3cf6a"/><circle cx="30" cy="73" r="3.5" fill="#f3cf6a"/>`,
  // Romantasy: a crown.
  crown: (c) => `<path d="M10 62l-2-30 12 12 10-20 10 20 12-12-2 30z" fill="#e3c176"/>
    <rect x="10" y="58" width="40" height="8" rx="2" fill="${c}"/>
    <circle cx="20" cy="62" r="2" fill="#f4ead6"/><circle cx="30" cy="62" r="2.4" fill="#f4ead6"/><circle cx="40" cy="62" r="2" fill="#f4ead6"/>
    <circle cx="8" cy="32" r="2.6" fill="${c}"/><circle cx="30" cy="24" r="2.8" fill="${c}"/><circle cx="52" cy="32" r="2.6" fill="${c}"/>`,
  // Science fiction and dystopia: a rocket.
  rocket: (c) => `<path d="M30 4c10 10 12 26 10 46H20c-2-20 0-36 10-46z" fill="#e8ecef"/>
    <circle cx="30" cy="28" r="6" fill="${c}"/><circle cx="30" cy="28" r="3.5" fill="#bfe0f4"/>
    <path d="M20 40l-10 14 10-2zM40 40l10 14-10-2z" fill="${c}"/><path d="M24 50h12l-2 6h-8z" fill="${c}"/>
    <path class="trinket-flame" d="M26 56c0 8 4 12 4 16 0-4 4-8 4-16z" fill="#f4a84a"/>`,
  // Romance: a rose in a bud vase.
  rose: (c) => `<path d="M30 30v26" stroke="#3f7d4c" stroke-width="2.4"/>
    <path d="M30 44c-8-6-14-2-14 2 6 2 10 2 14-2z" fill="#4f9a5c"/>
    <circle cx="30" cy="22" r="11" fill="${c}"/><path d="M24 22c2-6 10-6 12 0-4-2-8-2-12 0zM22 26c4 4 12 4 16 0" stroke="rgb(0 0 0 / .3)" stroke-width="1.4" fill="none"/>
    <path d="M22 56h16l-2 18h-12z" fill="rgb(210 230 240 / .35)" stroke="rgb(255 255 255 / .55)"/>`,
  // Mystery, thriller, crime: a magnifying glass.
  magnifier: (c) => `<circle cx="26" cy="28" r="15" fill="rgb(200 225 245 / .25)" stroke="#e3c176" stroke-width="4"/>
    <path d="M20 22a8 8 0 0 1 8-6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".6"/>
    <path d="M37 39l14 22" stroke="${c}" stroke-width="7" stroke-linecap="round"/>`,
  // Horror: a lantern.
  lantern: (c) => `<path d="M24 6h12v6H24z" fill="${c}"/><path d="M18 12h24l-2 6H20z" fill="${c}"/>
    <rect x="20" y="18" width="20" height="36" fill="rgb(255 210 120 / .35)" stroke="${c}" stroke-width="3"/>
    <path class="trinket-flame" d="M30 30c4 5 4 10 0 14-4-4-4-9 0-14z" fill="#ffb347"/>
    <path d="M18 54h24l2 6H16z" fill="${c}"/>`,
  // Everything else: a quill in an inkpot.
  quill: (c) => `<path d="M42 4C28 10 22 26 24 50l4 0C30 30 34 18 42 4z" fill="#f4ead6"/>
    <path d="M42 4c-6 12-10 26-12 46" stroke="#c9bfae" stroke-width="1"/>
    <path d="M16 50h28l-3 18H19z" fill="${c}"/><rect x="18" y="46" width="24" height="5" rx="2" fill="#2a2a2e"/>`,
};

/** The trinket for a list of genres, most telling first (a shelf name before raw tags). */
export function trinketFor(genres) {
  const g = (genres ?? []).join(' ').toLowerCase();
  if (/romantasy/.test(g)) return 'crown';
  if (/fantasy|epic|magic|dragon/.test(g)) return 'sword';
  if (/science fiction|sci-fi|dystop|space|cyberpunk/.test(g)) return 'rocket';
  if (/horror|gothic/.test(g)) return 'lantern';
  if (/mystery|thriller|crime|detective|suspense/.test(g)) return 'magnifier';
  if (/romance|love/.test(g)) return 'rose';
  return 'quill';
}

export function trinketArt(kind, colour) {
  const c = /^#[0-9a-f]{6}$/i.test(colour) ? colour : '#8a2d2d';
  const body = (TRINKETS[kind] ?? TRINKETS.quill)(c);
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 80">${body}</svg>`, 'image/svg+xml');
  const svg = document.importNode(doc.documentElement, true);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
}

/* ------------------------------------------------------------- celebrate */

/**
 * A short burst of confetti for finishing a book or reaching a goal. Skipped
 * entirely for anyone whose device asks for reduced motion.
 */
export function celebrate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = h('canvas', { class: 'confetti', 'aria-hidden': 'true' });
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colours = ['#f0a27c', '#f1b94c', '#6366f1', '#ec4899', '#10b981', '#0ea5e9'];
  const bits = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 13 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    w: 6 + Math.random() * 6,
    c: colours[Math.floor(Math.random() * colours.length)],
  }));
  const started = performance.now();
  (function frame(now) {
    const t = now - started;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const b of bits) {
      b.vy += 0.38;
      b.vx *= 0.99;
      b.x += b.vx;
      b.y += b.vy;
      b.r += b.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 1800);
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.w / 2, -b.w / 4, b.w, b.w / 2);
      ctx.restore();
    }
    if (t < 1800) requestAnimationFrame(frame);
    else canvas.remove();
  })(started);
}
