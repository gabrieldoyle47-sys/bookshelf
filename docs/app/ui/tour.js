/**
 * A short first-visit tour: five coachmarks over the bookshelf, each
 * pointing at one thing and saying one sentence about it.
 *
 * Shown once per browser, again for a newly added person's first visit, and
 * from Settings on request. A step whose target is not on screen (no
 * Rearrange in read-only mode, no sidebar on a phone) is skipped. Skip ends
 * it at any point.
 */

import { h } from './dom.js';

const KEY = 'bookshelf.toured';

export const toured = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return true; } };
const markToured = () => { try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ } };

const STEPS = [
  { target: '.case .lspine', title: 'Your bookshelf', text: 'Every book stands here, a series together in its own colour. Click one to open it.' },
  { target: '.rearrange-btn', title: 'Make it yours', text: 'Rearrange the books and ornaments by hand. Double-click an ornament to swap it for another.' },
  { target: '.shelf-block.cabinet', title: 'Trophies', text: 'Finish every book in a series and its trophy stands on the mantel above your shelf.' },
  { target: '.tabs, .bottom-nav', title: 'Everything else', text: 'Your books as a list, recommendations, upcoming releases, news and stats.' },
  { target: '#nav .nav-add', title: 'Friends', text: 'Find people by name, send a request, and once they accept, their shelves appear here.' },
  { target: '.scene-switch', title: 'Your room', text: 'Pick the room your shelf stands in. Decorate changes your colours, type and what is in the room.' },
  { target: '#sound-slot', title: 'Something to read by', text: 'Turn sound on to hear your room — a fire, the rain, a café. Off until you choose.' },
];

const visible = (el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

export function startTour({ name = null } = {}) {
  document.querySelector('.tour')?.remove();
  const steps = STEPS.filter((s) => visible(document.querySelector(s.target)));
  if (!steps.length) return;
  let i = 0;

  const ring = h('div', { class: 'tour-ring', 'aria-hidden': 'true' });
  const title = h('strong', { class: 'tour-title' });
  const text = h('p', { class: 'tour-text' });
  const count = h('span', { class: 'tour-count' });
  const back = h('button', { class: 'btn secondary small', type: 'button', onclick: () => go(i - 1) }, 'Back');
  const next = h('button', { class: 'btn small', type: 'button', onclick: () => go(i + 1) }, 'Next');
  const bubble = h('div', { class: 'tour-bubble', role: 'dialog', 'aria-live': 'polite', 'aria-label': 'Tour' },
    title, text,
    h('div', { class: 'tour-foot' }, count,
      h('button', { class: 'link-btn tour-skip', type: 'button', onclick: () => end() }, 'Skip'),
      h('div', { class: 'spacer' }), back, next));
  const root = h('div', { class: 'tour' }, ring, bubble);
  document.body.append(root);

  function place() {
    const el = document.querySelector(steps[i].target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    const below = r.bottom + pad + 14 + bh < innerHeight;
    const above = r.top - pad - 14 - bh > 0;
    bubble.style.left = `${Math.max(12, Math.min(innerWidth - bw - 12, r.left + r.width / 2 - bw / 2))}px`;
    bubble.style.top = `${below ? r.bottom + pad + 14 : above ? r.top - pad - 14 - bh : Math.max(12, innerHeight - bh - 12)}px`;
  }

  function go(n) {
    if (n >= steps.length) return end();
    i = Math.max(0, n);
    const step = steps[i];
    const el = document.querySelector(step.target);
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    title.textContent = i === 0 && name ? `Welcome, ${name}` : step.title;
    text.textContent = step.text;
    count.textContent = `${i + 1} of ${steps.length}`;
    back.style.display = i === 0 ? 'none' : '';
    next.textContent = i === steps.length - 1 ? 'Done' : 'Next';
    place();
    // Again once a smooth scroll has settled.
    setTimeout(place, 420);
    next.focus({ preventScroll: true });
  }

  const onKey = (e) => {
    if (e.key === 'Escape') end();
    else if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
  };
  function end() {
    markToured();
    root.remove();
    removeEventListener('resize', place);
    removeEventListener('scroll', place, true);
    document.removeEventListener('keydown', onKey);
    // A redraw of the page takes the tour with it.
  }
  addEventListener('resize', place);
  addEventListener('scroll', place, true);
  document.addEventListener('keydown', onKey);
  go(0);
}
