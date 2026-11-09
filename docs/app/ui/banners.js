/**
 * Library-card banners: soft, flowing designs drawn as SVG and coloured from
 * the member's sigil colour - layered ribbons, blooms of colour, dunes, fine
 * lines like silk. Every member's banner is their own palette.
 *
 * Drawn in a 600 x 200 box that is cropped to fit (a wide card, a small
 * swatch in the picker). Nothing here comes from what anyone types; the
 * colour is checked to be a hex value first.
 */

const NS = 'http://www.w3.org/2000/svg';

export const BANNERS = [
  ['flow', 'Flow'], ['aurora', 'Aurora'], ['dunes', 'Dunes'], ['silk', 'Silk'], ['ripple', 'Ripple'],
  ['glow', 'Horizon'], ['petals', 'Petals'], ['tide', 'Tide'], ['plain', 'Gradient'],
];
// Banners chosen before these existed.
const RENAMED = { marbled: 'aurora', florals: 'petals', starry: 'glow', stripes: 'silk', waves: 'flow' };
export const bannerId = (id) => (BANNERS.some(([b]) => b === id) ? id : RENAMED[id] ?? 'flow');

/* ---------------------------------------------------------------- colour */

function hsl(hex) {
  const n = /^#[0-9a-f]{6}$/i.test(hex ?? '') ? parseInt(hex.slice(1), 16) : 0xa2461f;
  const r = (n >> 16) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2;
  if (max === min) return { h: 30, s: 8, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** A small family of colours around one: deep, base, light, and two neighbours. */
function palette(hex) {
  const { h, s: s0, l: l0 } = hsl(hex);
  const s = clamp(s0, 22, 78);
  const l = clamp(l0, 34, 56);
  const c = (dh, ds, dl, a = 1) => `hsl(${Math.round((h + dh + 360) % 360)} ${Math.round(clamp(s + ds, 8, 92))}% ${Math.round(clamp(l + dl, 6, 96))}%${a < 1 ? ` / ${a}` : ''})`;
  return {
    c,
    deep: c(-8, 4, -24), dark: c(-4, 0, -12), base: c(0, 0, 0), light: c(12, -6, 22), pale: c(18, -14, 36),
    warm: c(32, 6, 10), cool: c(-34, 0, 4),
  };
}

/* ---------------------------------------------------------------- drawing */

let seq = 0;
const el = (name, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v));
  e.append(...kids.flat(Infinity).filter(Boolean));
  return e;
};
const linear = (id, stops, { x1 = 0, y1 = 0, x2 = 0, y2 = 1 } = {}) => el('linearGradient', { id, x1, y1, x2, y2 },
  stops.map(([o, c, a = 1]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })));
const radial = (id, stops, { cx = 0.5, cy = 0.5, r = 0.5 } = {}) => el('radialGradient', { id, cx, cy, r },
  stops.map(([o, c, a = 1]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })));
const blur = (id, sd) => el('filter', { id, x: '-50%', y: '-50%', width: '200%', height: '200%' }, el('feGaussianBlur', { stdDeviation: sd }));
const rect = (fill) => el('rect', { x: -20, y: -20, width: 640, height: 240, fill });

const DESIGNS = {
  /** Layered ribbons sweeping across, each catching a little light on its edge. */
  flow(p, u) {
    const bands = [0, 1, 2, 3, 4];
    return [
      el('defs', {}, linear(`${u}bg`, [[0, p.deep], [1, p.dark]], { x2: 1, y2: 1 }),
        bands.map((i) => linear(`${u}b${i}`, [[0, p.c(6 * i, -4 * i, 4 + 8 * i)], [1, p.c(-6 + 4 * i, 0, -10 + 6 * i), 0.92]]))),
      rect(`url(#${u}bg)`),
      bands.map((i) => {
        const y = 30 + i * 34;
        const d = `M-20 ${y + 20} C 120 ${y - 50}, 260 ${y + 70}, 420 ${y + 6} S 600 ${y - 30}, 640 ${y - 6} L640 240 L-20 240 Z`;
        return el('g', {}, el('path', { d, fill: `url(#${u}b${i})` }),
          el('path', { d: d.split(' L640')[0], fill: 'none', stroke: '#fff', 'stroke-opacity': 0.16 + i * 0.03, 'stroke-width': 1.2 }));
      }),
    ];
  },
  /** Big soft blooms of colour melting into each other. */
  aurora(p, u) {
    return [
      el('defs', {}, blur(`${u}f`, 46)),
      rect(p.dark),
      el('g', { filter: `url(#${u}f)` },
        el('circle', { cx: 90, cy: 40, r: 150, fill: p.warm, opacity: 0.85 }),
        el('circle', { cx: 330, cy: 170, r: 160, fill: p.cool, opacity: 0.8 }),
        el('circle', { cx: 520, cy: 30, r: 140, fill: p.light, opacity: 0.85 }),
        el('circle', { cx: 300, cy: -20, r: 90, fill: p.pale, opacity: 0.6 })),
    ];
  },
  /** Rolling dunes under a pale sky, each ridge lit along its top. */
  dunes(p, u) {
    const hills = [
      ['M-20 120 C 110 70, 220 70, 330 112 S 520 150, 640 90 L640 240 L-20 240 Z', p.c(20, -10, 18), p.c(10, -6, 4)],
      ['M-20 150 C 140 100, 280 170, 400 132 S 560 96, 640 128 L640 240 L-20 240 Z', p.c(4, 0, 2), p.c(-4, 4, -12)],
      ['M-20 182 C 160 140, 300 200, 460 168 S 600 150, 640 160 L640 240 L-20 240 Z', p.c(-8, 4, -14), p.c(-12, 6, -26)],
    ];
    return [
      el('defs', {}, linear(`${u}sky`, [[0, p.pale], [1, p.c(24, -10, 26)]]),
        hills.map(([, a, b], i) => linear(`${u}h${i}`, [[0, a], [1, b]]))),
      rect(`url(#${u}sky)`),
      el('circle', { cx: 470, cy: 70, r: 34, fill: '#fff', opacity: 0.55 }),
      hills.map(([d], i) => el('g', {}, el('path', { d, fill: `url(#${u}h${i})` }),
        el('path', { d: d.split(' L640')[0], fill: 'none', stroke: '#fff', 'stroke-opacity': 0.35, 'stroke-width': 1.4 }))),
    ];
  },
  /** Fine lines following one long wave, like folds of silk. */
  silk(p, u) {
    const lines = [];
    for (let k = 0; k < 34; k++) {
      const y = -10 + k * 7;
      const f = 1 - Math.abs(k - 17) / 22;
      lines.push(el('path', {
        d: `M-20 ${y} C 140 ${y - 70 * f}, 320 ${y + 80 * f}, 640 ${y - 20 * f}`,
        fill: 'none', stroke: '#fff', 'stroke-opacity': (0.07 + 0.3 * f * f).toFixed(3), 'stroke-width': 0.9,
      }));
    }
    return [
      el('defs', {}, linear(`${u}bg`, [[0, p.light], [0.55, p.base], [1, p.deep]], { x2: 1, y2: 0.6 })),
      rect(`url(#${u}bg)`), lines,
    ];
  },
  /** Rings spreading from a corner, shading from deep to light. */
  ripple(p, u) {
    const rings = [];
    for (let i = 11; i >= 0; i--) {
      const t = i / 11;
      rings.push(el('circle', { cx: 560, cy: 210, r: 40 + i * 48, fill: p.c(-10 + 20 * (1 - t), 0, -22 + 46 * (1 - t)) }));
    }
    return [rect(p.deep), rings,
      el('defs', {}, linear(`${u}sh`, [[0, '#fff', 0.12], [1, '#fff', 0]])), rect(`url(#${u}sh)`)];
  },
  /** Dusk: light blooming up from behind a curved horizon. */
  glow(p, u) {
    return [
      el('defs', {}, linear(`${u}sky`, [[0, p.c(-20, 0, -30)], [0.7, p.c(-6, 4, -8)], [1, p.warm]]),
        radial(`${u}sun`, [[0, p.c(40, 10, 40)], [0.35, p.warm, 0.85], [1, p.warm, 0]], { cx: 0.5, cy: 1, r: 0.75 }),
        linear(`${u}land`, [[0, p.c(-12, 0, -24)], [1, p.c(-16, 0, -36)]])),
      rect(`url(#${u}sky)`), rect(`url(#${u}sun)`),
      el('path', { d: 'M-20 176 Q 300 132 640 176 L640 240 L-20 240 Z', fill: `url(#${u}land)` }),
      el('path', { d: 'M-20 176 Q 300 132 640 176', fill: 'none', stroke: p.c(40, 10, 40), 'stroke-opacity': 0.6, 'stroke-width': 1.5 }),
    ];
  },
  /** Translucent petals opening from one point. */
  petals(p, u) {
    const tints = [p.warm, p.light, p.base, p.cool, p.pale, p.c(20, 4, 6), p.c(-18, 0, 12)];
    return [
      el('defs', {}, linear(`${u}bg`, [[0, p.pale], [1, p.c(10, -8, 22)]], { x2: 1, y2: 1 })),
      rect(`url(#${u}bg)`),
      el('g', { transform: 'translate(430 120)' },
        tints.map((c, i) => el('ellipse', { rx: 170, ry: 52, cx: 120, fill: c, opacity: 0.5, transform: `rotate(${i * (360 / tints.length) + 8})` }))),
      el('circle', { cx: 430, cy: 120, r: 16, fill: '#fff', opacity: 0.6 }),
    ];
  },
  /** One great swell, light on its crest. */
  tide(p, u) {
    return [
      el('defs', {}, linear(`${u}bg`, [[0, p.light], [1, p.base]]),
        linear(`${u}w`, [[0, p.c(-6, 4, -2)], [1, p.deep]]), blur(`${u}f`, 8)),
      rect(`url(#${u}bg)`),
      el('path', { d: 'M-20 150 C 140 30, 360 250, 640 50 L640 240 L-20 240 Z', fill: p.deep, opacity: 0.35, filter: `url(#${u}f)`, transform: 'translate(0 10)' }),
      el('path', { d: 'M-20 150 C 140 30, 360 250, 640 50 L640 240 L-20 240 Z', fill: `url(#${u}w)` }),
      el('path', { d: 'M-20 150 C 140 30, 360 250, 640 50', fill: 'none', stroke: '#fff', 'stroke-opacity': 0.45, 'stroke-width': 2 }),
      el('path', { d: 'M-20 172 C 150 60, 370 262, 640 76', fill: 'none', stroke: '#fff', 'stroke-opacity': 0.15, 'stroke-width': 1 }),
    ];
  },
  /** Just the colour, as a gentle gradient. */
  plain(p, u) {
    return [el('defs', {}, linear(`${u}bg`, [[0, p.light], [1, p.dark]], { x2: 1, y2: 1 })), rect(`url(#${u}bg)`)];
  },
};

/** A banner design as an SVG that fills its box. */
export function bannerArt(id, colour) {
  const u = `bn${++seq}`;
  const draw = DESIGNS[bannerId(id)];
  return el('svg', { class: 'banner-art', viewBox: '0 0 600 200', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' },
    draw(palette(colour), u));
}
