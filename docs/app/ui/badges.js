/**
 * Badges on the page: each one an ink stamp - a ring, a motif, a family
 * colour - pressed into the wood of the trophy mantel and shown on the
 * library card. And the moment one (or a trophy) is earned: a card in the
 * middle of the screen with the stamp coming down, a sound if sound is on,
 * and confetti.
 */

import { h } from './dom.js';
import { BADGES } from '../core/badges.js';
import { SIGILS } from './sigil.js';
import { celebrate, trinketArt } from './art.js';
import { play } from './sound.js';

// Motifs not among the sigils.
const EXTRA = {
  ten: 'M7 8v8M5 9.5L7 8M12 12a3 4 0 1 0 6 0 3 4 0 1 0-6 0',
  stack: 'M4 17h16v3H4zM5 13h14v4H5zM6 9h12v4H6z',
  shelf: 'M3 20h18M3 11h18M5 4h3v7H5zM9 5h3v6H9zM13.5 5.5l2.8-.8 1.5 5.4-2.8.8zM6 13h3v7H6zM10 14h3v6h-3z',
  laurel: 'M12 21c-5-2-8-6-8-11M12 21c5-2 8-6 8-11M6 14l-2-1M7 10L5 8M18 14l2-1M17 10l2-2M12 4l1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 10l-2.4 1.2.5-2.6L8.2 6.8l2.6-.4z',
  pages: 'M6 3h9l4 4v14H6zM15 3v4h4M9 11h7M9 14h7M9 17h5',
  door: 'M5 3h11v18H5zM16 6h3v15h-3M13 12h.01',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  headphones: 'M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H4zM17 15h3v5h-3z',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  quills: 'M18 4c-6 1-10 5-12 12l1 2c3-1 5-3 7-6M21 7c-5 1-8 4-9 9l1 1M6 18l-2 2',
  medal: 'M8 3l2 6M16 3l-2 6M12 21a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z',
  medals: 'M5 3l2 5M11 3L9 8M8 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM13 3l2 5M19 3l-2 5M16 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
};
const FAMILY_INK = { Milestones: '#8a2d2d', Explorer: '#1f6f8b', 'Devoted reader': '#6a3d7a', 'Award shelf': '#9c7330' };

export const badgeById = (id) => BADGES.find((b) => b.id === id);

/** A badge as a stamp. `pressed` is the look on wood: ink sunk in, a little worn. */
export function badgeStamp(badge, { size = '', pressed = false } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('aria-hidden', 'true');
  const ring = (r, w) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '20'); c.setAttribute('cy', '20'); c.setAttribute('r', String(r));
    c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', String(w));
    return c;
  };
  svg.append(ring(18, 2), ring(15, .8));
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('transform', 'translate(10 10) scale(.8333)');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', EXTRA[badge.icon] ?? SIGILS[badge.icon] ?? SIGILS.star);
  g.append(path);
  svg.append(g);
  return h('span', {
    class: `badge-stamp ${size}${pressed ? ' pressed' : ''}`, style: `--ink:${FAMILY_INK[badge.family] ?? '#8a2d2d'}`,
    title: `${badge.name} — ${badge.desc}`, role: 'img', 'aria-label': `${badge.name}: ${badge.desc}`,
  }, svg);
}

/* ---------------------------------------------------------- the moment */

let queue = [];
let showing = false;

/**
 * Announce what was just earned, one at a time: badges (a stamp coming down)
 * and trophies (the trinket catching the light). `onDone` runs once all of
 * them have been seen, to remember they were shown.
 */
export function announce(items, onDone = () => {}) {
  if (!items.length) return;
  queue.push(...items);
  queue.at(-1).onDone = onDone;
  if (!showing) next();
}

function next() {
  const item = queue.shift();
  if (!item) { showing = false; return; }
  showing = true;
  const isTrophy = item.kind === 'trophy';
  const card = h('div', { class: `earned-card ${isTrophy ? 'trophy' : 'badge'}`, role: 'dialog', 'aria-live': 'assertive' },
    h('div', { class: 'earned-eyebrow', text: isTrophy ? 'Series complete — a trophy for your mantel' : `New badge · ${item.badge.family}` }),
    h('div', { class: 'earned-art' }, isTrophy ? trinketArt(item.trinket, item.colour) : badgeStamp(item.badge, { size: 'huge' })),
    h('h2', { class: 'earned-name', text: isTrophy ? item.name : item.badge.name }),
    h('p', { class: 'earned-desc', text: isTrophy ? `You have read every book in ${item.name}.` : item.badge.desc }),
    queue.length ? h('p', { class: 'hint', text: `${queue.length} more to see` }) : null,
    h('button', { class: 'btn', type: 'button', onclick: () => close() }, queue.length ? 'Next' : 'Lovely'));
  const layer = h('div', { class: 'earned-layer', onclick: (e) => { if (e.target === layer) close(); } }, card);
  document.body.append(layer);
  play(isTrophy ? 'trophy' : 'stamp');
  celebrate();
  card.querySelector('.btn').focus();
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  function close() {
    document.removeEventListener('keydown', onKey);
    layer.classList.add('leaving');
    setTimeout(() => layer.remove(), 220);
    item.onDone?.();
    setTimeout(next, 260);
  }
}
