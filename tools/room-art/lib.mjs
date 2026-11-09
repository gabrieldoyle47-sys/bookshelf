// A tiny projector: furniture modelled in the room's world (px at the 1280 layout:
// x from the room's left, y up from the floor, z out from the back wall) and
// drawn as the CSS room's camera sees it.
export function camera({ W = 1032, H = 1150, top = 20, bottom = 170, eyeX = 0.5, P = 820 } = {}) {
  const floorY = H - bottom; const eyeY = top + (floorY - top) * 0.42; const He = floorY - eyeY; const ex = W * eyeX;
  const s = (z) => P / (P - z);
  return { W, H, floorY, eyeY, He, ex, P, s, eye: [ex, He, P],
    p: ([x, y, z]) => { const k = s(z); return [ex + (x - ex) * k, eyeY + (He - y) * k]; } };
}
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((t, v, i) => t + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
const hex = (c) => { if (c.length === 4) c = '#' + [...c.slice(1)].map((h) => h + h).join(''); return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); };
const toHex = (r) => '#' + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
const f1 = (n) => (Math.round(n * 10) / 10).toString();

export class Scene {
  constructor(cam, light, { lo = 0.6, hi = 1.1, warm = '#ffe2b0', id = 'x', grad = 0.1 } = {}) { this.grad = grad; this.cam = cam; this.L = norm(light); this.lo = lo; this.hi = hi; this.warm = warm; this.parts = []; this.pts = []; this.defs = []; this.id = id; this.n = 0; }
  shade(base, n) {
    const d = Math.max(0, dot(norm(n), this.L));
    const k = this.lo + (this.hi - this.lo) * d;
    return k <= 1 ? mix(base, '#0b0806', 1 - k) : mix(base, this.warm, (k - 1) * 1.6);
  }
  path(pts3) { return pts3.map((q, i) => { const [x, y] = this.cam.p(q); return `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`; }).join('') + 'Z'; }
  open(pts3) { return pts3.map((q, i) => { const [x, y] = this.cam.p(q); return `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`; }).join(''); }
  depth(pts3) { const c = pts3.reduce((a, q) => a.map((v, i) => v + q[i] / pts3.length), [0, 0, 0]); return Math.hypot(...sub(this.cam.eye, c)); }
  // A flat polygon in 3D, shaded by its normal; hidden if it faces away (unless twoSided).
  face(pts3, base, { twoSided = false, shade = true, extra = '', order, cast = true, centre } = {}) {
    // Newell's normal: sound for any planar polygon, even with collinear points.
    let n = [0, 0, 0];
    for (let i = 0; i < pts3.length; i++) { const a = pts3[i], b = pts3[(i + 1) % pts3.length]; n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); }
    n = norm(n);
    const c = pts3.reduce((a, q) => a.map((v, i) => v + q[i] / pts3.length), [0, 0, 0]);
    // With the solid's centre given, the normal is made to point out of it.
    if (centre && dot(n, sub(c, centre)) < 0) n = n.map((v) => -v);
    let facing = dot(n, sub(this.cam.eye, c)) > 0;
    if (!facing && !twoSided) { if (cast) this.pts.push(...pts3); return; }
    if (!facing) n = n.map((v) => -v);
    let fill = shade ? this.shade(base, n) : base;
    // Larger faces get a soft fall-off, lighter at the top: it rounds them.
    const ys = pts3.map((q) => this.cam.p(q)[1]); const y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (this.grad && y1 - y0 > 8) {
      const gid = `${this.id}-f${this.n++}`;
      this.defs.push(`<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(y0)}" x2="0" y2="${f1(y1)}"><stop offset="0" stop-color="${mix(fill, this.warm, this.grad)}"/><stop offset="1" stop-color="${mix(fill, '#0b0806', this.grad * 1.3)}"/></linearGradient>`);
      fill = `url(#${gid})`;
    }
    this.parts.push({ d: order ?? this.depth(pts3), svg: `<path d="${this.path(pts3)}" fill="${fill}"${extra}/>` });
    if (cast) this.pts.push(...pts3);
  }
  raw(svg, d) { this.parts.push({ d, svg }); }
  // A profile (3D points, in order round its edge) pushed along `dir`: arched
  // backs, wings, a headboard. Faces point out of the solid.
  prism(prof, dir, base, { order, colors = {}, bias = 0 } = {}) {
    const P0 = prof, P1 = prof.map((q) => q.map((v, i) => v + dir[i]));
    const all = [...P0, ...P1];
    const centre = all.reduce((a, q) => a.map((v, i) => v + q[i] / all.length), [0, 0, 0]);
    const d = (order ?? this.depth(all)) + bias;
    this.face(P0, colors.cap0 ?? base, { centre, order: d });
    this.face(P1, colors.cap1 ?? base, { centre, order: d - 0.02 });
    for (let i = 0; i < P0.length; i++) {
      const j = (i + 1) % P0.length;
      this.face([P0[i], P0[j], P1[j], P1[i]], colors.side ?? base, { centre, order: d - 0.01 });
    }
  }
  // A soft rounded thing - a pillow, a cushion, a cat - as its outline, filled
  // with a gradient lit from the light's side.
  blob(cx, cy, cz, rx, ry, rz, base, { order, rot = 0, squash = 1, n = 18 } = {}) {
    const pts = [];
    for (let i = 0; i <= n; i++) for (let j = 0; j < n; j++) {
      const t = (i / n) * Math.PI, f = (j / n) * Math.PI * 2;
      let x = Math.sin(t) * Math.cos(f), y = Math.cos(t), z = Math.sin(t) * Math.sin(f);
      // Flatten the top and bottom a little, like stuffing.
      y = Math.sign(y) * Math.pow(Math.abs(y), squash);
      const u = x * rx, v = z * rz;
      pts.push([cx + u * Math.cos(rot) - v * Math.sin(rot), cy + y * ry, cz + u * Math.sin(rot) + v * Math.cos(rot)]);
    }
    const h = this.hull(pts);
    const gid = `${this.id}-g${this.n++}`;
    const lx = 50 - this.L[0] * 30, ly = 50 - this.L[1] * 30;
    this.defs.push(`<radialGradient id="${gid}" cx="${f1(lx)}%" cy="${f1(ly)}%" r="75%"><stop offset="0" stop-color="${mix(base, this.warm, 0.22)}"/><stop offset=".55" stop-color="${base}"/><stop offset="1" stop-color="${mix(base, '#0b0806', 0.4)}"/></radialGradient>`);
    this.parts.push({ d: order ?? this.depth(pts), svg: `<path d="${h.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`).join('')}Z" fill="url(#${gid})"/>` });
    this.pts.push(...pts.filter((_, i) => i % 3 === 0));
    return h;
  }
  // A box in a turned frame: q maps local (u, y, v) to the world.
  obox(q, [u0, u1], [y0, y1], [v0, v1], base, { order, colors = {}, bias = 0 } = {}) {
    const C = [[u0, y0, v0], [u1, y0, v0], [u1, y0, v1], [u0, y0, v1], [u0, y1, v0], [u1, y1, v0], [u1, y1, v1], [u0, y1, v1]].map((c) => q(...c));
    const centre = C.reduce((a, p) => a.map((v, i) => v + p[i] / 8), [0, 0, 0]);
    const d = (order ?? this.depth(C)) + bias;
    const F = { bottom: [0, 1, 2, 3], top: [4, 5, 6, 7], v0: [0, 1, 5, 4], v1: [3, 2, 6, 7], u0: [0, 3, 7, 4], u1: [1, 2, 6, 5] };
    for (const [k, idx] of Object.entries(F)) this.face(idx.map((i) => C[i]), colors[k] ?? base, { centre, order: d - (k === 'top' ? 0.02 : 0) });
  }
  dot2(q, r, fill, d) { const [x, y] = this.cam.p(q); this.parts.push({ d, svg: `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * this.cam.s(q[2]))}" fill="${fill}"/>` }); }
  // An axis-aligned box (or turned by `rot` radians about its own centre).
  box(x0, x1, y0, y1, z0, z1, base, opt = {}) {
    const { rot = 0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, colors = {} } = opt;
    const R = ([x, y, z]) => { const dx = x - cx, dz = z - cz; return [cx + dx * Math.cos(rot) + dz * Math.sin(rot), y, cz - dx * Math.sin(rot) + dz * Math.cos(rot)]; };
    const v = (x, y, z) => R([x, y, z]);
    const F = [
      ['front', [v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)]],
      ['back', [v(x1, y0, z0), v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0)]],
      ['left', [v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0)]],
      ['right', [v(x1, y0, z1), v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1)]],
      ['top', [v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0), v(x0, y1, z0)]],
    ];
    const d = opt.order ?? this.depth(F.flatMap((f) => f[1]));
    for (const [k, p] of F) this.face(p, colors[k] ?? base, { order: d + (k === 'top' ? -0.01 : 0) + (opt.bias ?? 0) });
  }
  // A tube along a 3D polyline: wood or metal, round, with a highlight toward the light.
  tube(pts3, r, base, { order, hl = 0.35, cap = 'round' } = {}) {
    const zm = pts3.reduce((t, q) => t + q[2], 0) / pts3.length; const w = 2 * r * this.cam.s(zm);
    const d = this.open(pts3);
    const dark = mix(base, '#0b0806', 0.25), lite = mix(base, this.warm, hl);
    // Highlight sits on the light's side of the tube, in screen space.
    const ox = -this.L[0] * w * 0.22, oy = -this.L[1] * w * 0.22;
    this.parts.push({ d: order ?? this.depth(pts3), svg: `<path d="${d}" fill="none" stroke="${dark}" stroke-width="${f1(w)}" stroke-linecap="${cap}" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${base}" stroke-width="${f1(w * 0.7)}" stroke-linecap="${cap}" stroke-linejoin="round" transform="translate(${f1(ox * 0.4)} ${f1(oy * 0.4)})"/><path d="${d}" fill="none" stroke="${lite}" stroke-width="${f1(Math.max(0.8, w * 0.22))}" stroke-linecap="${cap}" stroke-linejoin="round" opacity=".8" transform="translate(${f1(ox)} ${f1(oy)})"/>` });
    this.pts.push(...pts3);
  }
  // A horizontal ellipse at height y: a table top, a seat, a plate.
  ring(cx, y, cz, rx, rz, n = 48) { return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + rx * Math.cos(a), y, cz + rz * Math.sin(a)]; }); }
  disc(cx, y0, y1, cz, rx, rz, base, { order, edge, n = 32 } = {}) {
    const top = this.ring(cx, y1, cz, rx, rz, n), bot = this.ring(cx, y0, cz, rx, rz, n);
    const d = order ?? this.depth(top);
    if (y1 > y0) {
      // The rim: the near half of the side, as one band.
      const front = [], back = [];
      for (let i = 0; i <= n / 2; i++) { front.push(top[i % n]); back.push(bot[i % n]); }
      const band = [...front, ...back.reverse()];
      this.parts.push({ d: d + 0.01, svg: `<path d="${this.path(band)}" fill="${edge ?? this.shade(base, [0.2, 0, 1])}"/>` });
    }
    this.parts.push({ d, svg: `<path d="${this.path(top)}" fill="${this.shade(base, [0, 1, 0])}"/>` });
    this.pts.push(...top, ...bot);
  }
  // A vertical cylinder: legs, posts, a pedestal.
  post(x, z, y0, y1, r, base, opt = {}) { this.tube([[x, y0, z], [x, y1, z]], r, base, { ...opt, cap: 'butt' }); }
  hull(pts) {
    const P = pts.map((q) => this.cam.p(q)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const c = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of P) { while (lo.length >= 2 && c(lo.at(-2), lo.at(-1), p) <= 0) lo.pop(); lo.push(p); }
    for (const p of P.reverse()) { while (up.length >= 2 && c(up.at(-2), up.at(-1), p) <= 0) up.pop(); up.push(p); }
    return [...lo.slice(0, -1), ...up.slice(0, -1)];
  }
  // Shadows: the item's cast shadow along the light onto the floor, and a
  // tight dark contact shadow under what touches the floor.
  shadows({ cast = 0.3, contact = 0.5, blur = 7, castLen = 1, foot = null, extraFoot = [] } = {}) {
    const L = this.L; const out = [];
    const proj = this.pts.map(([x, y, z]) => [x - (L[0] / L[1]) * y * castLen, 0, z - (L[2] / L[1]) * y * castLen]);
    const all = [...proj, ...this.pts.filter((q) => q[1] < 3).map(([x, , z]) => [x, 0, z])];
    const toD = (h) => h.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`).join('') + 'Z';
    out.push(`<path d="${toD(this.hull(all))}" fill="#000" opacity="${cast}" filter="url(#${this.id}-b1)"/>`);
    const feet = foot ?? this.pts.filter((q) => q[1] < 3);
    if (feet.length) out.push(`<path d="${toD(this.hull([...feet, ...extraFoot]))}" fill="#000" opacity="${contact}" filter="url(#${this.id}-b2)"/>`);
    this.defs.push(`<filter id="${this.id}-b1" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${blur}"/></filter><filter id="${this.id}-b2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${Math.max(1.5, blur / 3)}"/></filter>`);
    return out.join('');
  }
  svg(id, shadowOpt = {}, { pad = 14, after = '' } = {}) {
    if (id) this.id = id;
    const shadow = shadowOpt === false ? '' : this.shadows(shadowOpt);
    const body = this.parts.sort((a, b) => b.d - a.d).map((p) => p.svg).join('');
    // Bounds from every projected point we drew.
    const xs = [], ys = [];
    for (const m of (shadow + body + after).matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)) { xs.push(+m[1]); ys.push(+m[2]); }
    for (const m of (body + after).matchAll(/c[xy]="(-?[\d.]+)"/g)) { /* circles counted via extraBounds */ }
    const x0 = Math.floor(Math.min(...xs) - pad), x1 = Math.ceil(Math.max(...xs) + pad);
    const y0 = Math.floor(Math.min(...ys) - pad), y1 = Math.ceil(Math.max(...ys) + pad / 2);
    const vb = [x0, y0, x1 - x0, y1 - y0];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}"><defs>${this.defs.join('')}</defs>${shadow}${body}${after}</svg>`;
    // Where a lamp is, as a share of the drawing, for its glow in CSS.
    const glow = this.glowAt ? (() => { const [gx, gy] = this.cam.p(this.glowAt); return [((gx - vb[0]) / vb[2]) * 100, ((gy - vb[1]) / vb[3]) * 100].map((v) => Math.round(v * 10) / 10); })() : null;
    return { svg, vb, glow, css: { left: x0, right: this.cam.W - x1, bottom: this.cam.H - y1, width: x1 - x0, height: y1 - y0 } };
  }
}
