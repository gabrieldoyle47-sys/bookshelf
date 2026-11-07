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
};

/** A decorative object for the end of a shelf. Hidden from screen readers. */
export function ornament(name) {
  const doc = new DOMParser().parseFromString(ORNAMENTS[name], 'image/svg+xml');
  const svg = document.importNode(doc.documentElement, true);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return h('span', { class: `ornament ${name}`, 'aria-hidden': 'true' }, svg);
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
