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
 * Cloth colours for spines. Picked by hashing the title, so a book keeps its
 * colour forever; deep enough that light gold lettering reads in both themes.
 */
const CLOTH = ['#7a2e2e', '#2f4858', '#3f5e3a', '#9a6b1f', '#2c6e6a', '#5b3a63',
  '#4a5568', '#a4532b', '#1f3b5a', '#6b4f2a', '#6d2c4b', '#365f7a', '#54632a', '#3b3355'];

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
export function bookshelf(books, onOpen, { label = 'Your shelf' } = {}) {
  if (!books.length) return null;
  const longest = Math.max(400, ...books.map((b) => b.pages ?? 0));
  const spines = books.map((b) => {
    const pages = Math.min(b.pages ?? 320, 1400);
    const t = pages / Math.min(longest, 1400);
    const colour = CLOTH[hash(b.title) % CLOTH.length];
    return h('button', {
      class: `spine${b.rating >= 5 ? ' gilt' : ''}`, type: 'button',
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
