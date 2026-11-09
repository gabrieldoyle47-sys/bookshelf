// Reusable pieces, in world units.
export function rotor(cx, cz, th) {
  const c = Math.cos(th), s = Math.sin(th);
  return ([u, y, v]) => [cx + u * c - v * s, y, cz + u * s + v * c];
}
// A bentwood café chair (after the Thonet No. 14): a round cane seat, four
// splayed legs with a ring, the back legs running up into a looped back.
export function bentwood(S, cx, cz, th, { wood = '#4a2a18', cane = '#d9bf86', scale = 1 } = {}) {
  const R = rotor(cx, cz, th); const k = scale;
  const q = (u, y, v) => R([u * k, y * k, v * k]);
  const r = 1.9 * k;
  const back = (sgn) => [q(-13, 0, 13 * sgn), q(-12, 20, 12 * sgn), q(-13, 41, 12 * sgn), q(-15, 58, 12.5 * sgn), q(-17, 76, 12 * sgn), q(-18.5, 90, 9.5 * sgn), q(-19, 96, 5 * sgn), q(-19.2, 98, 0)];
  const L = back(1), Rr = back(-1);
  const loop = [...L, ...Rr.slice(0, -1).reverse()];
  const inner = [q(-15, 44, 7.5), q(-16, 60, 8.5), q(-17.5, 76, 8), q(-18.2, 86, 4), q(-18.4, 88, 0), q(-18.2, 86, -4), q(-17.5, 76, -8), q(-16, 60, -8.5), q(-15, 44, -7.5)];
  // Back loop drawn behind or in front of the seat depending on which way the chair faces.
  const seatTop = S.ring(cx, 43 * k, cz, 0, 0);
  const seatD = S.depth([q(0, 43, 0)]);
  const backD = S.depth([q(-17, 60, 0)]);
  const ord = (d) => d;
  S.tube(loop, r, wood, { order: backD });
  S.tube(inner, r * 0.75, wood, { order: backD - 0.2 });
  // Front legs.
  for (const sgn of [1, -1]) S.tube([q(11, 41, 11 * sgn), q(13, 20, 13 * sgn), q(14.5, 0, 14.5 * sgn)], r, wood, { order: S.depth([q(13, 20, 13 * sgn)]) });
  // The leg ring.
  const ring = Array.from({ length: 25 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return q(13.6 * Math.cos(a), 15, 13.6 * Math.sin(a)); });
  S.tube(ring, r * 0.6, wood, { order: seatD + 1.5 });
  // The seat: a bent wooden rim and the cane inside it.
  const rim = Array.from({ length: 28 }, (_, i) => { const a = (i / 28) * Math.PI * 2; return q(18 * Math.cos(a), 43, 18 * Math.sin(a)); });
  const rimLow = rim.map(([x, y, z]) => [x, y - 4 * k, z]);
  const n = rim.length; const frontIdx = []; // the near half of the rim, as a band
  const band = []; let best = 0, bi = 0;
  for (let i = 0; i < n; i++) { const z = rim[i][2]; if (z > best) { best = z; bi = i; } }
  for (let j = -n / 4; j <= n / 4; j++) band.push(rim[(bi + j + n) % n]);
  const bandLow = band.map(([x, y, z]) => [x, y - 4 * k, z]);
  S.raw(`<path d="${S.path([...band, ...bandLow.reverse()])}" fill="${S.shade(wood, [0.3, 0, 1])}"/>`, seatD);
  S.raw(`<path d="${S.path(rim)}" fill="${S.shade(wood, [0, 1, 0])}"/>`, seatD - 0.01);
  const caneR = Array.from({ length: 28 }, (_, i) => { const a = (i / 28) * Math.PI * 2; return q(14.5 * Math.cos(a), 43.3, 14.5 * Math.sin(a)); });
  S.raw(`<path d="${S.path(caneR)}" fill="${S.shade(cane, [0, 1, 0])}"/>`, seatD - 0.02);
  // A little cane weave: two sets of lines across the seat.
  let weave = '';
  for (let t = -10; t <= 10; t += 4) {
    const w = Math.sqrt(Math.max(0, 14 * 14 - t * t));
    weave += S.open([q(t, 43.4, -w), q(t, 43.4, w)]) + S.open([q(-w, 43.4, t), q(w, 43.4, t)]);
  }
  S.raw(`<path d="${weave}" stroke="${S.shade(mix0(cane), [0, 1, 0])}" stroke-width=".7" fill="none" opacity=".55"/>`, seatD - 0.03);
  S.pts.push(...rim, ...rimLow);
  // Back legs below the seat are part of the loop; when the back is nearer
  // than the seat it must cover it, otherwise the seat covers the legs.
  if (backD < seatD) S.tube(loop, r, wood, { order: backD - 1 });
}
function mix0(c) { return c === '#d9bf86' ? '#a8874f' : c; }
