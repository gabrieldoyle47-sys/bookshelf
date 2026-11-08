/**
 * Drag and drop for rearranging the bookshelf.
 *
 * Pointer events rather than HTML drag-and-drop, which does nothing on a
 * phone. The item itself moves through the shelves as you drag - the gap it
 * leaves is the placeholder - while a copy follows the finger. Every
 * `[data-key]` inside a `.shelf-block[data-shelf]` can be picked up except
 * the bookend, which always opens its shelf.
 */

import { play } from './sound.js';

export function enableDrag(container, { onDrop }) {
  let drag = null;

  container.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const item = e.target.closest('[data-key]');
    if (!item || item.classList.contains('bookend') || !container.contains(item)) return;
    drag = { item, x: e.clientX, y: e.clientY, id: e.pointerId, started: false };
  });

  const start = (e) => {
    const r = drag.item.getBoundingClientRect();
    const ghost = drag.item.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.classList.remove('drop');
    Object.assign(ghost.style, { width: `${r.width}px`, height: `${r.height}px`, left: `${r.left}px`, top: `${r.top}px` });
    document.body.append(ghost);
    drag.ghost = ghost;
    drag.dx = e.clientX - r.left;
    drag.dy = e.clientY - r.top;
    drag.item.classList.add('drag-source');
    drag.started = true;
    try { container.setPointerCapture(drag.id); } catch { /* the pointer may be gone */ }
  };

  container.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      start(e);
    }
    e.preventDefault();
    drag.ghost.style.left = `${e.clientX - drag.dx}px`;
    drag.ghost.style.top = `${e.clientY - drag.dy}px`;
    // Near the top or bottom of the screen, scroll so a book can travel
    // from the first shelf to the last.
    if (e.clientY < 70) scrollBy(0, -14);
    else if (e.clientY > innerHeight - 70) scrollBy(0, 14);
    moveTo(e.clientX, e.clientY);
  });

  function moveTo(x, y) {
    drag.ghost.style.visibility = 'hidden';
    const under = document.elementFromPoint(x, y);
    drag.ghost.style.visibility = '';
    if (!under) return;
    const block = under.closest('.shelf-block[data-shelf]');
    if (!block || !container.contains(block)) return;
    const target = under.closest('[data-key]');
    if (target && target !== drag.item && block.contains(target)) {
      const r = target.getBoundingClientRect();
      const after = target.classList.contains('bookend') || x > r.left + r.width / 2;
      const ref = after ? target.nextElementSibling : target;
      if (ref !== drag.item && (after ? target.nextElementSibling : target.previousElementSibling) !== drag.item) {
        block.insertBefore(drag.item, ref);
      }
    } else if (!target) {
      // Empty space on a shelf: the item goes to the end of it, or right
      // after the bookend if that is nearer.
      const items = [...block.querySelectorAll(':scope > [data-key]')];
      const last = items[items.length - 1];
      if (last !== drag.item) block.insertBefore(drag.item, last?.nextElementSibling ?? null);
    }
  }

  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const was = drag;
    drag = null;
    if (!was.started) return;
    was.ghost.remove();
    was.item.classList.remove('drag-source');
    play('tick');
    onDrop();
  };
  container.addEventListener('pointerup', end);
  container.addEventListener('pointercancel', end);
}

/** The order on screen, read back as the layout's shelves. */
export function readShelves(container, shelves) {
  return shelves.map((shelf, n) => {
    const block = container.querySelector(`.shelf-block[data-shelf="${n}"]`);
    if (!block) return shelf;
    return { ...shelf, keys: [...block.querySelectorAll(':scope > [data-key]')].map((el) => el.dataset.key) };
  });
}
