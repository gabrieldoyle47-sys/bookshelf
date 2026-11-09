import { camera, Scene, mix } from './lib.mjs';
const cam = camera({});
// Daylight from the window on the left wall.
const L = [-0.7, 0.75, 0.3];
const out = {};
const f1 = (n) => n.toFixed(1);

// ------------------------------------------------------------------ the desk
{
  const S = new Scene(cam, L, { id: 'dk', lo: 0.55, hi: 1.1 });
  const walnut = '#5e3a22', top = '#6e4428', leather = '#2f5a3e', brass = '#d4a64e';
  // Drawn strictly back to front: o counts down.
  let o = 10000;
  // Bun feet, two pedestals of drawers, the kneehole between.
  for (const z of [112, 164]) for (const x of [684, 726, 804, 848]) S.disc(x, 0, 4, z, 3.5, 3, '#3a2416', { order: o-- });
  S.box(732, 800, 40, 62, 110, 164, mix(walnut, '#3a2416', .5), { order: o-- });
  S.box(680, 732, 4, 64, 108, 168, walnut, { order: o-- });
  S.box(800, 852, 4, 64, 108, 168, walnut, { order: o-- });
  // Drawer fronts and pulls.
  let dr = '';
  for (const [x0, x1] of [[684, 728], [804, 848]]) for (const [y0, y1] of [[8, 26], [28, 44], [46, 60]]) {
    dr += `<path d="${S.path([[x0, y0, 168.2], [x1, y0, 168.2], [x1, y1, 168.2], [x0, y1, 168.2]])}" fill="none" stroke="${mix(walnut, '#000', .45)}" stroke-width="1.1"/>`;
    const [px, py] = cam.p([(x0 + x1) / 2, (y0 + y1) / 2, 168.4]); dr += `<circle cx="${f1(px)}" cy="${f1(py)}" r="1.8" fill="${brass}"/>`;
  }
  const [kx, ky] = cam.p([766, 51, 164.2]); dr += `<circle cx="${f1(kx)}" cy="${f1(ky)}" r="1.6" fill="${brass}"/>`;
  S.raw(dr, o--);
  // The top, and its leather.
  S.box(672, 860, 64, 70, 102, 174, top, { order: o-- });
  S.raw(`<path d="${S.path([[684, 70.1, 112], [848, 70.1, 112], [848, 70.1, 164], [684, 70.1, 164]])}" fill="${S.shade(leather, [0, 1, 0])}"/><path d="${S.path([[687, 70.2, 115], [845, 70.2, 115], [845, 70.2, 161], [687, 70.2, 161]])}" fill="none" stroke="#c9a14a" stroke-width=".8" opacity=".7"/>`, o--);
  // The lamp's pool of light on the leather.
  const pool = S.ring(812, 70.3, 136, 44, 30, 32);
  S.defs.push(`<radialGradient id="dk-pool"><stop offset="0" stop-color="#ffe7a8" stop-opacity=".55"/><stop offset="1" stop-color="#ffe7a8" stop-opacity="0"/></radialGradient>`);
  S.raw(`<path class="desk-pool" d="${S.path(pool)}" fill="url(#dk-pool)"/>`, o--);
  // A stack of books, an open book, an inkwell and quill.
  const stack = [[690, 726, 70, 76, 122, 150, '#7a2e2e'], [693, 724, 76, 81, 124, 148, '#2f4858'], [691, 722, 81, 87, 123, 149, '#b8861f']];
  for (const [x0, x1, y0, y1, z0, z1, c] of stack) S.box(x0, x1, y0, y1, z0, z1, c, { order: o--, colors: { front: mix(c, '#f4ead6', .55), left: mix(c, '#f4ead6', .5) } });
  const ob = [[734, 70.4, 146], [770, 70.4, 142], [774, 70.4, 162], [738, 70.4, 166]];
  S.raw(`<path d="${S.path(ob)}" fill="#f4ead6"/><path d="${S.open([[752, 70.5, 144], [756, 70.5, 164]])}" stroke="#c9b48a" stroke-width="1"/><path d="${S.open([[740, 70.5, 151], [750, 70.5, 150]])}${S.open([[741, 70.5, 155], [751, 70.5, 154]])}${S.open([[759, 70.5, 149], [769, 70.5, 148]])}${S.open([[760, 70.5, 153], [770, 70.5, 152]])}" stroke="#bcae94" stroke-width=".6"/>`, o--);
  S.disc(788, 70, 76, 154, 4, 3.4, '#1e2a30', { order: o--, edge: '#2a3a42' });
  S.raw(`<path d="${S.open([[788, 76, 154], [800, 100, 150]])}" stroke="#f4ead6" stroke-width="1.6" stroke-linecap="round"/>`, o--);
  // The banker's lamp: brass foot and stem, a green glass shade, lit underneath.
  S.disc(830, 70, 73, 130, 10, 8, brass, { order: o-- });
  S.post(830, 130, 73, 104, 1.6, brass, { order: o-- });
  S.tube([[830, 104, 130], [830, 104, 136]], 1.4, brass, { order: o-- });
  const bulb = S.ring(830, 103.5, 136, 15, 9, 24);
  S.raw(`<path class="desk-bulb" d="${S.path(bulb)}" fill="#fff0bf"/>`, o--);
  const shade = [];
  for (let i = 0; i <= 14; i++) { const a = Math.PI * (i / 14); shade.push([812, 104 + 9 * Math.sin(a), 136 - 11 * Math.cos(a)]); }
  S.prism(shade, [36, 0, 0], '#2f6b4f', { order: o-- });
  S.raw(`<path d="${S.open(shade.map(([x, y, z]) => [x + 18, y + .4, z]))}" stroke="#7fc29a" stroke-width="1.4" fill="none" opacity=".5"/>`, o--);
  S.pts.push([812, 113, 125], [848, 113, 147]);
  S.glowAt = [830, 100, 136];
  out.desk = S.svg('dk', { cast: .3, contact: .55, blur: 7, castLen: .55 });
}

// ------------------------------------------------- a floor globe and some books
{
  const S = new Scene(cam, L, { id: 'gl', lo: 0.55, hi: 1.12 });
  const wood = '#5e3a22', brass = '#c99a3e';
  const cx = 214, cz = 138;
  // Three legs splayed out to a ring.
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + k * (2 * Math.PI / 3);
    S.tube([[cx + 7 * Math.cos(a), 40, cz + 7 * Math.sin(a)], [cx + 15 * Math.cos(a), 18, cz + 15 * Math.sin(a)], [cx + 19 * Math.cos(a), 0, cz + 19 * Math.sin(a)]], 2.2, wood, { order: S.depth([[cx + 15 * Math.cos(a), 18, cz + 15 * Math.sin(a)]]) });
  }
  const r16 = Array.from({ length: 25 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return [cx + 14 * Math.cos(a), 16, cz + 14 * Math.sin(a)]; });
  S.tube(r16, 1.2, wood, { order: S.depth([[cx, 16, cz]]) - 2 });
  S.post(cx, cz, 30, 44, 3, wood);
  // The horizon ring, behind and in front of the globe; the globe; the meridian.
  const horiz = Array.from({ length: 41 }, (_, i) => { const a = (i / 40) * Math.PI * 2; return [cx + 28 * Math.cos(a), 68, cz + 28 * Math.sin(a)]; });
  const backH = horiz.filter((p) => p[2] <= cz + .1), frontH = horiz.filter((p) => p[2] >= cz - .1);
  S.tube(backH.sort((a, b) => a[0] - b[0]), 2.4, wood, { order: 500 });
  S.blob(cx, 68, cz, 23, 23, 23, '#3d7f8c', { order: 400, n: 22 });
  // Land on the globe: a few soft shapes on its lit face.
  const [gx, gy] = cam.p([cx, 68, cz]); const R = 23 * cam.s(cz);
  S.raw(`<g opacity=".85"><path d="M${f1(gx - R * .55)} ${f1(gy - R * .5)}c${f1(R * .3)} ${f1(-R * .2)} ${f1(R * .55)} 0 ${f1(R * .5)} ${f1(R * .25)}s${f1(-R * .2)} ${f1(R * .35)} ${f1(-R * .1)} ${f1(R * .6)}s${f1(-R * .45)} ${f1(-R * .15)} ${f1(-R * .4)} ${f1(-R * .85)}z" fill="#a8b46a"/><path d="M${f1(gx + R * .15)} ${f1(gy + R * .05)}c${f1(R * .25)} ${f1(-R * .1)} ${f1(R * .5)} ${f1(R * .1)} ${f1(R * .4)} ${f1(R * .4)}s${f1(-R * .3)} ${f1(R * .35)} ${f1(-R * .45)} ${f1(R * .1)}z" fill="#c4b57a"/></g><circle cx="${f1(gx - R * .35)}" cy="${f1(gy - R * .4)}" r="${f1(R * .28)}" fill="#fff" opacity=".12"/>`, 399);
  const mer = Array.from({ length: 33 }, (_, i) => { const a = Math.PI * 0.15 + (i / 32) * Math.PI * 1.7; return [cx + 26 * Math.cos(a) * .5, 68 + 26 * Math.sin(a), cz + 26 * Math.cos(a) * .866]; });
  S.tube(mer, 1.2, brass, { order: 300 });
  S.tube(frontH.sort((a, b) => a[0] - b[0]), 2.4, wood, { order: 200 });
  // Books piled on the floor beside it.
  const pile = [[250, 290, 0, 7, 158, 184, '#3f5e3a'], [253, 287, 7, 13, 160, 182, '#8a3b4f'], [251, 284, 13, 18, 159, 181, '#365f7a'], [256, 282, 18, 24, 161, 180, '#a4532b']];
  let o = 100; for (const [x0, x1, y0, y1, z0, z1, c] of pile) S.box(x0, x1, y0, y1, z0, z1, c, { bias: -(o++), colors: { left: mix(c, '#f4ead6', .55), right: mix(c, '#f4ead6', .5) } });
  out.globe = S.svg('gl', { cast: .28, contact: .5, blur: 6, castLen: .5 });
}
import { writeFileSync } from 'node:fs';
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v.css), v.svg.length);
writeFileSync(new URL('./library.json', import.meta.url), JSON.stringify(out));
