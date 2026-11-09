import { camera, Scene, mix } from './lib.mjs';
const cam = camera({});
// Lamplight: the floor lamp on the right of the case, and the bedside lamp.
const L = [0.55, 0.8, 0.25];
const out = {};
const f1 = (n) => n.toFixed(1);

{
  const S = new Scene(cam, L, { id: 'bd', lo: 0.5, hi: 1.1, warm: '#ffd9a0' });
  let o = 10000;
  const velvet = '#9a6a3a', wood = '#4a3020', linen = '#eee7da', duvet = '#e6dfd2', knit = '#c98f2e';

  // The bedside table and its lamp, behind the head of the bed.
  S.box(154, 198, 0, 50, 30, 70, wood, { order: o-- });
  S.raw(`<path d="${S.path([[158, 32, 70.2], [194, 32, 70.2], [194, 44, 70.2], [158, 44, 70.2]])}" fill="none" stroke="${mix(wood, '#000', .4)}" stroke-width="1"/>`, o--);
  S.dot2([176, 38, 70.4], 1.4, '#d4a64e', o--);
  S.disc(174, 50, 51, 52, 8, 7, '#d9cfbf', { order: o-- });
  S.blob(174, 60, 52, 7, 9, 7, '#c9b48a', { order: o-- });
  S.post(174, 52, 66, 80, 1, '#8a6a44', { order: o-- });
  // The shade: a drum, lit from inside.
  const top = S.ring(174, 98, 52, 12, 12, 24), bot = S.ring(174, 80, 52, 16, 16, 24);
  const fr = [], bk = [];
  for (let i = 0; i <= 12; i++) { fr.push(top[i % 24]); bk.push(bot[i % 24]); }
  S.raw(`<path d="${S.path(top)}" fill="#f6e2b0"/>`, o--);
  S.raw(`<path class="bed-lamp" d="${S.path([...fr, ...bk.reverse()])}" fill="#f2d79a"/>`, o--);
  S.pts.push(...top, ...bot);
  const [lx, ly] = cam.p([174, 86, 60]);
  // A glass of water.
  S.disc(190, 50, 60, 40, 3, 3, '#cfe0e6', { order: o--, edge: '#b9d0d8' });

  // The headboard against the wall: upholstered, its top a soft curve.
  const hb = [];
  hb.push([152, 0, 76]);
  for (let i = 0; i <= 16; i++) { const t = i / 16; hb.push([152, 96 + 14 * Math.sin(Math.PI * t), 76 + 114 * t]); }
  hb.push([152, 0, 190]);
  S.prism(hb, [9, 0, 0], velvet, { order: o-- });
  // Channel stitching down the headboard.
  let ch = '';
  for (let z = 92; z <= 176; z += 14) ch += S.open([[161.2, 8, z], [161.2, 96 + 14 * Math.sin(Math.PI * (z - 76) / 114) - 4, z]]);
  S.raw(`<path d="${ch}" stroke="${mix(velvet, '#000', .3)}" stroke-width="1.2" fill="none" opacity=".7"/>`, o--);

  // Frame, mattress, then the duvet turned down off the pillows.
  for (const [x, z] of [[166, 84], [404, 84], [166, 184], [404, 184]]) S.post(x, z, 0, 8, 2.4, wood, { order: o-- });
  S.box(161, 410, 8, 22, 82, 186, wood, { order: o-- });
  S.box(163, 408, 22, 38, 84, 184, linen, { order: o-- });
  // Pillows: two soft ones against the headboard, a small square one in front.
  // Pillows: wide and soft, flattened where they lie, a little lifted against the headboard.
  S.blob(182, 46, 108, 13, 8, 24, '#f7f3ec', { order: o--, squash: .45, rot: .08 });
  S.blob(184, 46, 158, 13, 8, 24, '#f2ede4', { order: o--, squash: .45, rot: -.06 });
  S.blob(204, 44, 134, 7, 9, 12, '#c98a6a', { order: o--, squash: .4 });
  // The duvet: thick, draped over the front edge, a fold at its top.
  S.box(218, 412, 30, 47, 81, 189, duvet, { order: o--, colors: { front: '#dcd4c4' } });
  // Its hem hangs in soft folds down the side of the bed.
  const hem = [[218, 47, 189.2], [412, 47, 189.2]];
  for (let x = 412; x >= 218; x -= 6) hem.push([x, 24 + 3 * Math.sin((x - 218) / 9) + (x > 404 ? 4 : 0), 189.4]);
  S.raw(`<path d="${S.path(hem)}" fill="${S.shade('#d9d1c1', [0, 0, 1])}"/>`, o--);
  let folds = ''; for (let x = 232; x < 410; x += 18) folds += S.open([[x, 46, 189.5], [x + 3, 28, 189.5]]);
  S.raw(`<path d="${folds}" stroke="#bfb5a3" stroke-width="1.2" fill="none" opacity=".6"/>`, o--);
  // The turned-down top: a soft roll.
  S.tube([[222, 47.5, 81], [222, 47.5, 189]], 3.2, '#efe9de', { order: o--, hl: .2 });
  // Soft creases in the duvet.
  S.raw(`<path d="${S.open([[250, 47.1, 96], [290, 47.1, 120], [320, 47.1, 112]])}${S.open([[260, 47.1, 170], [300, 47.1, 150], [344, 47.1, 160]])}" stroke="#cfc6b6" stroke-width="1.4" fill="none" opacity=".8"/>`, o--);
  // A knitted blanket over the foot, hanging down the front.
  S.box(352, 414, 47, 49.5, 79, 191, knit, { order: o--, colors: { front: mix(knit, '#000', .12) } });
  S.box(352, 414, 20, 49.5, 189.5, 191, mix(knit, '#000', .1), { order: o-- });
  let rib = '';
  for (let x = 358; x < 412; x += 6) rib += S.open([[x, 49.6, 80], [x, 49.6, 191]]) + S.open([[x, 49.5, 191.1], [x, 22, 191.1]]);
  S.raw(`<path d="${rib}" stroke="${mix(knit, '#000', .28)}" stroke-width="1" fill="none" opacity=".55"/>`, o--);
  // A book left open on the bed.
  S.raw(`<path d="${S.path([[268, 47.3, 138], [298, 47.3, 132], [302, 47.3, 152], [272, 47.3, 158]])}" fill="#f4ead6"/><path d="${S.open([[283, 47.4, 135], [287, 47.4, 155]])}" stroke="#c9b48a" stroke-width="1"/>`, o--);
  // The cat, asleep on the blanket: a curled body, its head tucked in, a tail round.
  S.blob(384, 55, 124, 18, 8, 13, '#4a4a52', { order: o--, rot: .3, squash: .7 });
  S.blob(372, 57, 138, 8, 6.5, 7.5, '#55555e', { order: o--, squash: .8 });
  const [ex, ey] = cam.p([368, 63, 140]), [ex2, ey2] = cam.p([376, 63, 141]);
  S.raw(`<path d="M${f1(ex - 3)} ${f1(ey)}l2 -6 3 5zM${f1(ex2 - 2)} ${f1(ey2)}l3 -6 2 6z" fill="#4a4a52"/><path d="M${f1(ex - 2)} ${f1(ey + 5)}q2 1.4 4 0M${f1(ex2 - 2)} ${f1(ey2 + 5)}q2 1.4 4 0" stroke="#22222a" stroke-width=".9" fill="none"/>`, o--);
  S.tube([[400, 52, 128], [401, 51, 138], [394, 50.5, 144], [384, 50.5, 146], [376, 50.5, 146]], 2.3, '#4a4a52', { order: o--, hl: .15 });
  S.glowAt = [174, 88, 52];
  out.bed = S.svg('bd', { cast: .3, contact: .55, blur: 8, castLen: .45 });
}
import { writeFileSync } from 'node:fs';
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v.css), v.svg.length);
writeFileSync(new URL('./rain.json', import.meta.url), JSON.stringify(out));
