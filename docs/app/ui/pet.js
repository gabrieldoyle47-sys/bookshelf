/**
 * The pet on the rug: a black cat or a Cavalier King Charles spaniel
 * (Blenheim - chestnut and white), chosen in Decorate -> Room.
 *
 * Gently alive: it breathes, the cat's tail tip flicks and an ear twitches,
 * the dog's tail thumps now and then. While a book is open (the page gets
 * .book-open) it lifts its head and opens its eyes; when the book closes it
 * settles back down.
 *
 * Drawn here as fixed SVG; nothing comes from what anyone types.
 */

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  e.append(...kids.flat().filter(Boolean));
  return e;
};

/** A black cat, curled on the rug, facing right. */
function cat() {
  const fur = '#1c1a20';
  return [
    el('ellipse', { cx: 62, cy: 66, rx: 48, ry: 5, fill: 'rgb(0 0 0 / .28)' }),
    el('g', { class: 'pet-breath' },
      // The tail curls round the front of the body; its tip flicks.
      el('path', { d: 'M22 56 C 8 56, 8 66, 26 66 L 60 66', fill: 'none', stroke: fur, 'stroke-width': 7, 'stroke-linecap': 'round' }),
      el('g', { class: 'pet-tail' }, el('path', { d: 'M58 66 C 66 66, 72 64, 76 60', fill: 'none', stroke: fur, 'stroke-width': 6.5, 'stroke-linecap': 'round' })),
      el('path', { d: 'M18 61 C 12 44, 26 31, 44 30 C 54 29, 60 33, 66 33 C 82 35, 90 47, 88 62 C 70 64.5, 36 64.5, 18 61 Z', fill: fur }),
      // The haunch.
      el('path', { d: 'M28 58 C 26 48, 34 40, 44 40', fill: 'none', stroke: 'rgb(255 255 255 / .07)', 'stroke-width': 2, 'stroke-linecap': 'round' }),
      // Moonlight along the back.
      el('path', { d: 'M24 44 C 34 33, 52 29, 66 32', fill: 'none', stroke: 'rgb(255 255 255 / .16)', 'stroke-width': 2, 'stroke-linecap': 'round' }),
      el('ellipse', { cx: 82, cy: 63, rx: 9, ry: 3.6, fill: fur }),
      el('ellipse', { cx: 96, cy: 63, rx: 8, ry: 3.4, fill: fur })),
    el('g', { class: 'pet-head' },
      el('g', { class: 'pet-ear' }, el('path', { d: 'M78 37 L 80 22 L 89 32 Z', fill: fur }), el('path', { d: 'M80.5 34 L 81.5 26 L 86 31 Z', fill: '#4a2f3c' })),
      el('path', { d: 'M93 31 L 101 21 L 102 37 Z', fill: fur }), el('path', { d: 'M95.5 32 L 100 25.5 L 100.5 34 Z', fill: '#4a2f3c' }),
      el('ellipse', { cx: 90, cy: 44, rx: 15.5, ry: 13, fill: fur }),
      el('path', { d: 'M79 38 C 84 33, 94 32, 100 36', fill: 'none', stroke: 'rgb(255 255 255 / .14)', 'stroke-width': 1.6, 'stroke-linecap': 'round' }),
      // Dozing: closed eyes. Awake: gold eyes with slit pupils.
      el('g', { class: 'pet-eyes-shut' },
        el('path', { d: 'M82 45 q 3.2 2.2 6.4 0', fill: 'none', stroke: '#8d8496', 'stroke-width': 1.3, 'stroke-linecap': 'round' }),
        el('path', { d: 'M93 45 q 3.2 2.2 6.4 0', fill: 'none', stroke: '#8d8496', 'stroke-width': 1.3, 'stroke-linecap': 'round' })),
      el('g', { class: 'pet-eyes-open' },
        el('ellipse', { cx: 85.2, cy: 44.5, rx: 3.4, ry: 2.7, fill: '#d9b53c' }), el('ellipse', { cx: 85.2, cy: 44.5, rx: .9, ry: 2.4, fill: '#111' }),
        el('ellipse', { cx: 96.2, cy: 44.5, rx: 3.4, ry: 2.7, fill: '#d9b53c' }), el('ellipse', { cx: 96.2, cy: 44.5, rx: .9, ry: 2.4, fill: '#111' })),
      el('path', { d: 'M89.4 49.5 h 2.6 l -1.3 1.6 z', fill: '#5a3a46' }),
      el('path', { d: 'M76 50 l -7 -1 M76 52 l -7 1.5 M105 50 l 7 -1 M105 52 l 7 1.5', stroke: 'rgb(255 255 255 / .22)', 'stroke-width': .6 })),
  ];
}

/** A Blenheim Cavalier King Charles, lying with its head on its paws, facing right:
 *  long wavy chestnut ears, a domed head with a white blaze, big dark eyes. */
function dog() {
  const white = '#f6efe5';
  const chestnut = '#a9572a';
  const shade = '#87411d';
  const wisp = { fill: 'none', stroke: shade, 'stroke-width': .8, 'stroke-linecap': 'round' };
  return [
    el('ellipse', { cx: 60, cy: 66, rx: 50, ry: 5, fill: 'rgb(0 0 0 / .25)' }),
    // A feathered plume of a tail; it thumps now and then.
    el('g', { class: 'pet-tail' }, el('path', { d: 'M20 49 C 9 48, 2 38, 8 29 C 10 35, 12 37, 16 38 C 12 41, 14 46, 23 46 Z', fill: chestnut }),
      el('path', { d: 'M9 33 c 1 4, 3 7, 7 9 M7 39 c 2 3, 5 5, 9 6', ...wisp })),
    el('g', { class: 'pet-breath' },
      el('path', { d: 'M14 61 C 11 46, 28 35, 50 34.5 C 66 34, 80 40, 84 52 C 85 56, 85 60, 84 62 C 62 64.5, 32 64.5, 14 61 Z', fill: white }),
      el('path', { d: 'M24 45 C 31 37, 46 34, 59 35.5 C 62 42, 55 48.5, 43 49.5 C 34 50.2, 27 49.5, 24 45 Z', fill: chestnut }),
      el('path', { d: 'M78 50 c 2 3, 2 6, 0 9 M74 48 c 2 3, 2.2 7, 0 11', fill: 'none', stroke: 'rgb(0 0 0 / .08)', 'stroke-width': 1.2, 'stroke-linecap': 'round' }),
      el('ellipse', { cx: 92, cy: 63.2, rx: 11, ry: 3.8, fill: white }),
      el('ellipse', { cx: 104, cy: 62.8, rx: 8.5, ry: 3.6, fill: white })),
    el('g', { class: 'pet-head' },
      el('path', { d: 'M101 40 C 109 42, 112 52, 110 60 C 108 64, 104 64, 102 61 C 100 55, 99 47, 98 43 Z', fill: shade }),
      el('path', { d: 'M80 50 C 79 40, 86 33, 94 33 C 102 33, 108 39, 107 47 C 106 54, 100 58, 93 58 C 86 58, 81 55, 80 50 Z', fill: white }),
      el('path', { d: 'M80.5 47 C 80 39, 86 34, 92 33.5 L 93 40 C 92 43, 91 45, 88 46 C 85 46.5, 82 47, 80.5 47 Z', fill: chestnut }),
      el('path', { d: 'M95 33.5 C 101 33.6, 107 38, 107 45 C 104 45.5, 100 45, 97.5 43.5 C 96 41, 95.5 38, 95 33.5 Z', fill: chestnut }),
      el('ellipse', { cx: 101, cy: 52.5, rx: 8, ry: 5.5, fill: white }),
      el('ellipse', { cx: 108, cy: 51, rx: 2.7, ry: 2.1, fill: '#2a1a14' }),
      el('path', { d: 'M102 56.5 q 2.6 1.6 5.2 0', fill: 'none', stroke: '#7a5a4a', 'stroke-width': .8, 'stroke-linecap': 'round' }),
      // The near ear: long, wavy, down to the paws.
      el('g', { class: 'pet-ear' },
        el('path', { d: 'M85 40 C 76 41, 72 49, 73 57 C 73.5 60, 72 62, 74 64 C 76 66, 78 64, 80 66 C 82 67, 84 64, 86 64 C 88 60, 88.5 52, 88 46 C 87.5 43, 86.5 41, 85 40 Z', fill: chestnut }),
        el('path', { d: 'M76 49 c 1.5 3, 1.5 7, 0 11 M80 46 c 1.5 4, 1.7 9, .5 14 M84 45 c 1 4, 1.2 9, .5 13', ...wisp })),
      el('g', { class: 'pet-eyes-shut' },
        el('path', { d: 'M86 47 q 2.8 2 5.6 0', fill: 'none', stroke: '#3a2014', 'stroke-width': 1.3, 'stroke-linecap': 'round' }),
        el('path', { d: 'M97 46.3 q 2.6 1.8 5.2 0', fill: 'none', stroke: '#3a2014', 'stroke-width': 1.3, 'stroke-linecap': 'round' })),
      el('g', { class: 'pet-eyes-open' },
        el('circle', { cx: 88.8, cy: 46.6, r: 3.6, fill: '#24150f' }), el('circle', { cx: 89.9, cy: 45.4, r: 1, fill: '#fff' }),
        el('circle', { cx: 99.7, cy: 46, r: 3.4, fill: '#24150f' }), el('circle', { cx: 100.7, cy: 44.9, r: .95, fill: '#fff' }))),
  ];
}

/** The pet for a look, or null for none. */
export function petEl(kind) {
  if (kind !== 'cat' && kind !== 'dog') return null;
  const svg = el('svg', { viewBox: '0 0 120 72', class: `pet ${kind}`, 'aria-hidden': 'true' }, kind === 'cat' ? cat() : dog());
  return svg;
}

/** Tell the pet a book is open (or closed), so it looks up. */
export function petWatch(open) {
  document.documentElement.classList.toggle('book-open', open);
}
