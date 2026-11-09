import { camera, Scene, mix } from './lib.mjs';
import { rotor } from './furniture.mjs';
const cam = camera({ eyeX: 0.38 });
// Firelight: from the right, low, a little from behind.
const L = [0.85, 0.55, -0.12];
const out = {};

// ----------------------------------------------------- wingback and footstool
{
  const S = new Scene(cam, L, { id: 'ac', lo: 0.42, hi: 1.16, warm: '#ffcf8a', grad: .14 });
  const leather = '#9a5530', walnut = '#3a2416', brass = '#d8a64e';
  const R = rotor(212, 146, 0.72); const q = (u, y, v) => R([u, y, v]);
  let o = 100;
  // Back: an arched panel, tufted.
  const arch = [];
  arch.push([-31, 34, -34]);
  for (let i = 0; i <= 16; i++) { const t = i / 16; const v = -34 + 68 * t; const y = 102 + 16 * Math.sin(Math.PI * t) - (t < .08 || t > .92 ? 6 * (1 - Math.abs(t - .5) * 2) : 0); arch.push([-31, y, v]); }
  arch.push([-31, 34, 34]);
  S.prism(arch.map((p) => q(...p)), (() => { const a = q(0, 0, 0), b = q(11, 0, 0); return [b[0] - a[0], 0, b[2] - a[2]]; })(), leather, { order: o-- });
  // A rolled, piped edge along the top of the back.
  S.tube(arch.slice(1, -1).map(([u, y, v]) => q(-21, y - 1, v * .97)), 3.2, mix(leather, '#ffcf8a', .06), { order: o--, hl: .35 });
  // Tufting: buttons in a diamond grid on the face of the back, with pleats.
  let tuft = '', pleat = '';
  const rows = [[56, [-20, -6, 8, 22]], [70, [-27, -13, 1, 15, 27]], [84, [-20, -6, 8, 22]], [98, [-13, 1, 15]]];
  for (const [y, vs] of rows) for (const v of vs) { const [x, yy] = cam.p(q(-19.6, y, v)); tuft += `<circle cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="1.6" fill="${mix(leather, '#000', .4)}"/><circle cx="${(x - .4).toFixed(1)}" cy="${(yy - .5).toFixed(1)}" r=".6" fill="${mix(leather, '#ffcf8a', .5)}"/>`; }
  for (let r = 0; r < rows.length - 1; r++) for (const v of rows[r][1]) for (const v2 of rows[r + 1][1]) if (Math.abs(v - v2) === 7) pleat += S.open([q(-19.6, rows[r][0], v), q(-19.6, rows[r + 1][0], v2)]);
  S.raw(`<path d="${pleat}" stroke="${mix(leather, '#000', .35)}" stroke-width=".8" fill="none" opacity=".7"/>${tuft}`, o--);
  // The far wing and the far arm, then the seat, then the near arm and wing.
  // The wing's outline: up from the arm, a full curve forward, back to the top of the back.
  const wingUY = [[-30, 58]];
  for (let i = 0; i <= 12; i++) { const t = i / 12; const a = -Math.PI / 2 + Math.PI * 0.95 * t; wingUY.push([-14 + 12 * Math.cos(a) * (1 - .25 * t), 82 + 24 * Math.sin(a)]); }
  wingUY.push([-30, 110]);
  const wing = (sg) => wingUY.map(([u, y]) => q(u, y, sg * 34));
  const dirV = (dv) => { const a = q(0, 0, 0), b = q(0, 0, dv); return [b[0] - a[0], 0, b[2] - a[2]]; };
  S.prism(wing(-1), dirV(9), leather, { order: o-- });
  S.tube(wingUY.slice(1).map(([u, y]) => q(u, y, -29.5)), 3, leather, { order: o--, hl: .3 });
  const arm = (sg) => {
    S.obox(q, [-26, 30], [34, 57], sg > 0 ? [24, 34] : [-34, -24], leather, { order: o-- });
    S.tube([q(-26, 58, sg * 29), q(29, 58, sg * 29)], 6.2, leather, { order: o--, hl: .3 });
    const scroll = Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * Math.PI * 2; return q(30.4, 55 + 6.6 * Math.sin(a), sg * 29 + 6.6 * Math.cos(a)); });
    S.face(scroll, mix(leather, '#ffcf8a', .12), { twoSided: true, shade: false, order: o-- });
    const inner = Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return q(30.6, 55 + 3 * Math.sin(a), sg * 29 + 3 * Math.cos(a)); });
    S.raw(`<path d="${S.path(inner)}" fill="none" stroke="${mix(leather, '#000', .4)}" stroke-width=".9"/>`, o--);
    // A row of brass nailheads along the front of the arm.
    let nails = ''; for (let y = 36; y <= 52; y += 4) { const [x, yy] = cam.p(q(30.5, y, sg * 34)); nails += `<circle cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="1" fill="${brass}"/>`; }
    S.raw(nails, o--);
  };
  arm(-1);
  // Base with its skirt of nailheads, legs.
  for (const [u, v] of [[-26, -30], [26, -30], [-26, 30], [26, 30]]) S.tube([q(u, 11, v), q(u, 4, v), q(u + (u > 0 ? 1.5 : 0), 0, v)], 3, walnut, { order: v < 0 ? 200 : o - 0.5, cap: 'round' });
  S.obox(q, [-30, 31], [10, 35], [-34, 34], leather, { order: o-- });
  let skirt = '';
  for (let v = -32; v <= 32; v += 4) { const [x, y] = cam.p(q(31.2, 13, v)); skirt += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r=".95" fill="${brass}"/>`; }
  for (let u = -28; u <= 30; u += 4) { const [x, y] = cam.p(q(u, 13, 34.2)); skirt += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r=".95" fill="${brass}"/>`; }
  S.raw(skirt, o--);
  // The seat cushion: a plump box with a piped edge and a dip where one sits.
  S.obox(q, [-21, 33], [34, 45], [-24, 24], mix(leather, '#ffd9a8', .06), { order: o-- });
  S.tube([q(33, 43, -23), q(33, 43, 23)], 3.4, mix(leather, '#ffd9a8', .1), { order: o--, hl: .35 });
  S.raw(`<path d="${S.open([q(33.2, 45, 24), q(-21, 45, 24)])}" stroke="${mix(leather, '#000', .4)}" stroke-width="1" fill="none"/><path d="${S.open([q(-12, 45.2, -10), q(8, 45.2, 0), q(-12, 45.2, 10)])}" stroke="${mix(leather, '#000', .25)}" stroke-width="1" fill="none" opacity=".5"/>`, o--);
  arm(1);
  S.prism(wing(1), dirV(-9), leather, { order: o-- });
  S.tube(wingUY.slice(1).map(([u, y]) => q(u, y, 29.5)), 3, leather, { order: o--, hl: .3 });

  // A round tripod wine table at its elbow: a cup of tea and a candle.
  const tx = 300, tz = 168;
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + k * (2 * Math.PI / 3);
    S.tube([[tx + 3 * Math.cos(a), 12, tz + 3 * Math.sin(a)], [tx + 9 * Math.cos(a), 4, tz + 9 * Math.sin(a)], [tx + 12 * Math.cos(a), 0, tz + 12 * Math.sin(a)]], 1.6, walnut, { order: Math.sin(a) < 0 ? 400 : 0.9 });
  }
  S.post(tx, tz, 10, 48, 2.2, walnut, { order: 0.8 });
  S.disc(tx, 48, 51, tz, 17, 17, '#5a3420', { order: 0.7 });
  S.disc(tx - 5, 51, 52, tz + 4, 6, 5, '#f6f0e6', { order: 0.6 });
  S.disc(tx - 5, 52, 57, tz + 4, 3.6, 3, '#fbf6ee', { order: 0.5, edge: '#ebe2d4' });
  S.disc(tx - 5, 56.9, 57, tz + 4, 2.9, 2.4, '#8a4a22', { order: 0.45 });
  S.disc(tx + 6, 51, 52, tz - 3, 4, 3.4, '#c99a3e', { order: 0.4 });
  S.post(tx + 6, tz - 3, 52, 64, 1.8, '#f4ead6', { order: 0.35 });
  const [fx, fy] = cam.p([tx + 6, 64, tz - 3]);
  S.raw(`<path class="flame" d="M${fx.toFixed(1)} ${(fy - 7).toFixed(1)}c2.6 3 2.6 5 0 7c-2.6-2-2.6-4 0-7z" fill="#ffb347"/>`, 0.3);
  out.armchair = S.svg('ac', { cast: .24, contact: .5, blur: 8, castLen: .5 });
}

// --------------------------------------------------- a basket of logs, by the hearth
{
  const S = new Scene(cam, L, { id: 'lb', lo: 0.5, hi: 1.12, warm: '#ffcf8a' });
  const cx = 772, cz = 172;
  S.disc(cx, 0, 26, cz, 22, 15, '#8a6236', { edge: '#9c7444', order: 10 });
  // Wicker: a few bands round the near side.
  let wk = '';
  for (let y = 4; y < 26; y += 5) { const r = S.ring(cx, y, cz, 22.2, 15.2, 24).filter((p) => p[2] >= cz - 2); r.sort((a, b) => a[0] - b[0]); wk += S.open(r); }
  S.raw(`<path d="${wk}" stroke="#6b4a26" stroke-width="1.2" fill="none" opacity=".8"/>`, 9);
  S.disc(cx, 25, 26, cz, 19, 12.5, '#3a2616', { order: 8 });
  const logs = [[-11, 28, -2, '#7a5234'], [0, 28, -3, '#6b4a2e'], [11, 28, -2, '#8a6040'], [-6, 36, 0, '#8a6040'], [6, 36, 0, '#7a5234'], [0, 44, 1, '#6b4a2e']];
  for (const [dx, y, dz, c] of logs) {
    const a = [cx + dx, y, cz + dz - 18], b = [cx + dx, y, cz + dz + 16];
    S.tube([a, b], 4.6, c, { order: 7 - dz / 10, cap: 'butt' });
    const [ex, ey] = cam.p(b);
    S.raw(`<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${(4.6 * cam.s(b[2])).toFixed(1)}" fill="#c9a06a"/><circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${(2.2 * cam.s(b[2])).toFixed(1)}" fill="none" stroke="#a87c48" stroke-width=".8"/>`, 6.9 - dz / 10);
  }
  out.logs = S.svg('lb', { cast: .3, contact: .55, blur: 5, castLen: .5 });
}
import { writeFileSync } from 'node:fs';
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v.css), v.svg.length);
writeFileSync(new URL('./fire.json', import.meta.url), JSON.stringify(out));
