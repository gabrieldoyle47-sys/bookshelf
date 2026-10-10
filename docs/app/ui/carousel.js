/**
 * A horizontal row that scrolls - the shelf rows of Spotify and Netflix.
 *
 * Snap scrolling, so a swipe lands on a card rather than between two; arrow
 * buttons that appear only when there is more to see in that direction; and
 * click-and-drag with a mouse, since a trackpad-less desktop otherwise has
 * no way to scroll sideways. A drag never counts as a click on the card it
 * started on.
 */

import { h } from './dom.js';

export function carousel(items, { label, className = '' } = {}) {
  const track = h('div', { class: 'carousel-track', role: 'list', 'aria-label': label ?? null },
    items.map((item) => h('div', { class: 'carousel-item', role: 'listitem' }, item)));
  const prev = h('button', { class: 'carousel-arrow prev', type: 'button', 'aria-label': 'Scroll back', tabindex: '-1' }, '‹');
  const next = h('button', { class: 'carousel-arrow next', type: 'button', 'aria-label': 'Scroll forward', tabindex: '-1' }, '›');
  const root = h('div', { class: `carousel ${className}` }, prev, track, next);

  const step = () => Math.max(track.clientWidth * 0.8, 200);
  prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));

  const update = () => {
    const max = track.scrollWidth - track.clientWidth;
    root.classList.toggle('can-prev', track.scrollLeft > 4);
    root.classList.toggle('can-next', track.scrollLeft < max - 4);
  };
  track.addEventListener('scroll', update, { passive: true });
  // Measure once laid out, and whenever the space changes.
  requestAnimationFrame(update);
  if (typeof ResizeObserver === 'function') new ResizeObserver(update).observe(track);

  // Mouse drag. Touch and pens already scroll natively. Capturing the
  // pointer keeps every listener on this row, so redrawing the page (which
  // happens on every save) leaves nothing behind on the window.
  let drag = null;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, left: track.scrollLeft, moved: false, id: e.pointerId };
  });
  track.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 5) {
      drag.moved = true;
      track.setPointerCapture(drag.id);
      track.classList.add('dragging');
    }
    if (drag.moved) track.scrollLeft = drag.left - dx;
  });
  const end = () => {
    if (!drag) return;
    if (drag.moved) {
      // Swallow the click that ends a drag, once.
      track.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); }, { capture: true, once: true });
    }
    track.classList.remove('dragging');
    drag = null;
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);

  return root;
}
