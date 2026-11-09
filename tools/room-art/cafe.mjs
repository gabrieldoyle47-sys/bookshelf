import { camera, Scene, mix } from './lib.mjs';
import { bentwood, rotor } from './furniture.mjs';
const cam = camera({});
const L = [-0.45, 1, 0.35];
const out = {};

// ---------------------------------------------------------------- counter
{
  const S = new Scene(cam, L, { id: 'ct' });
  const wood = '#6e4428';
  // Kick plinth, cabinet, then the marble top overhanging it.
  S.box(162, 386, 0, 7, 114, 170, '#3a2416');
  S.box(160, 388, 7, 76, 112, 174, wood);
  // Panels on the front: raised frames, each a little lighter at the top rail.
  const fr = (x0, x1) => S.raw(`<path d="${S.path([[x0, 16, 174.2], [x1, 16, 174.2], [x1, 66, 174.2], [x0, 66, 174.2]])}" fill="none" stroke="${S.shade('#4f2f1a', [0, 0, 1])}" stroke-width="2.2"/><path d="${S.open([[x0 + 1.5, 64.5, 174.3], [x1 - 1.5, 64.5, 174.3]])}" stroke="${mix(wood, '#ffe2b0', .25)}" stroke-width="1.2" opacity=".6"/>`, 0);
  for (let x = 168; x < 380; x += 54) fr(x, x + 46);
  // Marble top.
  S.box(156, 392, 76, 82, 106, 180, '#ece4d6', { colors: { front: '#d9cfbf' } });
  // Veins on the marble.
  S.raw(`<path d="${S.open([[180, 82.1, 120], [210, 82.1, 140], [236, 82.1, 136], [270, 82.1, 160]])}${S.open([[300, 82.1, 114], [330, 82.1, 140], [372, 82.1, 130]])}" stroke="#c7bba8" stroke-width="1" fill="none" opacity=".7"/>`, -1);
  // Brass foot rail along the front on two brackets.
  S.tube([[152, 12, 186], [396, 12, 186]], 2, '#c99a3e', { order: -2 });
  for (const x of [176, 372]) S.tube([[x, 12, 186], [x, 12, 174]], 1.4, '#a77d2c', { order: -1.9 });

  // The espresso machine, chrome and brass, on the left of the top.
  const mx0 = 164, mx1 = 226, mz0 = 120, mz1 = 156;
  S.box(mx0, mx1, 82, 88, mz0, mz1 + 4, '#3b3b40');              // drip tray base
  S.box(mx0 + 2, mx1 - 2, 100, 138, mz0, mz1, '#c4ccd3', { colors: { front: '#b7c0c8' } });
  S.box(mx0, mx1, 138, 142, mz0 - 1, mz1 + 1, '#9aa3ab');        // cup warmer lip
  S.raw(`<path d="${S.path([[mx0 + 8, 108, mz1 + .2], [mx1 - 8, 108, mz1 + .2], [mx1 - 8, 132, mz1 + .2], [mx0 + 8, 132, mz1 + .2]])}" fill="#7d878f"/>`, -3);
  for (const gx of [mx0 + 20, mx1 - 20]) {
    S.tube([[gx, 104, mz1], [gx, 104, mz1 + 9]], 4.2, '#3a3a3e', { order: -4 });
    S.tube([[gx, 103, mz1 + 6], [gx, 103, mz1 + 18]], 1.6, '#2a2a2e', { order: -4.1 });
    const [cx, cy] = cam.p([gx, 122, mz1 + .3]);
    S.raw(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.2" fill="#d9a03a"/><circle cx="${(cx - 1).toFixed(1)}" cy="${(cy - 1).toFixed(1)}" r="1.6" fill="#ffe3a0"/>`, -4.2);
  }
  // Pressure gauge, steam wand, two cups warming on top.
  S.tube([[mx1 - 2, 128, mz1 - 6], [mx1 + 8, 118, mz1 - 4], [mx1 + 9, 96, mz1]], 1.1, '#9aa3ab', { order: -5 });
  for (const cx of [mx0 + 16, mx0 + 30]) S.disc(cx, 142, 149, (mz0 + mz1) / 2, 5, 5, '#f4ece0', { order: S.depth([[cx, 145, 150]]) - 50 });
  // Cups on saucers by the machine.
  for (const [cx, cz] of [[262, 164], [284, 152]]) {
    S.disc(cx, 82, 83.5, cz, 9, 7, '#f6f0e6', { order: -6 - cz / 100 });
    S.disc(cx, 83.5, 92, cz, 5.2, 4.4, '#f8f2e8', { order: -6.1 - cz / 100, edge: '#e9e0d2' });
  }
  // A cake under a glass dome on a stand.
  const dx = 334, dz = 164;
  S.disc(dx, 82, 83, dz, 20, 16, '#d9d2c4', { order: -7 });
  S.post(dx, dz, 83, 88, 3, '#cfc8ba', { order: -7.1 });
  S.disc(dx, 88, 89.5, dz, 18, 14, '#efe8dc', { order: -7.2 });
  S.disc(dx, 89.5, 98, dz, 12, 10, '#d8a06a', { order: -7.3, edge: '#c98b58' });
  S.disc(dx, 98, 99.5, dz, 12, 10, '#f6eee2', { order: -7.4 });
  const [chx, chy] = cam.p([dx, 102, dz]);
  S.raw(`<circle cx="${chx.toFixed(1)}" cy="${chy.toFixed(1)}" r="2.6" fill="#b8322a"/>`, -7.5);
  const dome = []; for (let h = 0; h <= 1.0001; h += 0.125) { const rr = 16 * Math.sqrt(1 - h * h); dome.push(...S.ring(dx, 89.5 + 24 * h, dz, rr + .01, rr * .82 + .01, 24)); }
  const hull = S.hull(dome);
  S.raw(`<path d="${hull.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')}Z" fill="rgb(225 238 246 / .28)" stroke="rgb(255 255 255 / .7)" stroke-width="1.2"/>`, -8);
  const [g1x, g1y] = cam.p([dx - 8, 104, dz + 10]);
  S.raw(`<path d="M${(g1x).toFixed(1)} ${(g1y + 10).toFixed(1)}q2 -8 8 -11" stroke="#fff" stroke-width="2" fill="none" opacity=".75" stroke-linecap="round"/>`, -8.1);
  S.pts.push(...dome);
  const steamAt = cam.p([mx0 + 34, 150, (mz0 + mz1) / 2]);
  const after = `<path class="steam" d="M${steamAt[0].toFixed(1)} ${steamAt[1].toFixed(1)}c-5 -6 5 -10 0 -17c-4 -5 3 -9 0 -13" stroke="#fff" stroke-width="2" fill="none" opacity=".45" stroke-linecap="round"/>`;
  out.counter = S.svg('ct', { cast: .32, contact: .55, blur: 8, castLen: .8 }, { after });
}

// ----------------------------------------------------- table and two chairs
{
  const S = new Scene(cam, L, { id: 'ctb' });
  const tx = 790, tz = 140;
  bentwood(S, 724, 146, 0.12);                 // left chair, facing the table
  bentwood(S, 846, 110, Math.PI * 0.8);    // far chair, facing back across it
  // The table: a cast-iron foot, a fluted column, a round marble top.
  S.disc(tx, 0, 3, tz, 16, 16, '#2b2b2f', { order: S.depth([[tx, 1, tz]]) });
  S.post(tx, tz, 3, 64, 2.8, '#34343a');
  S.disc(tx, 62, 64, tz, 7, 7, '#2b2b2f');
  S.disc(tx, 64, 69, tz, 33, 33, '#efe9de', { edge: '#d2c9b9', order: S.depth([[tx, 64, tz]]) - 4 });
  // Two cups and a croissant on the table.
  for (const [cx, cz] of [[778, 148], [804, 130]]) {
    S.disc(cx, 69, 70.5, cz, 7.5, 6, '#f6f0e6', { order: S.depth([[tx, 64, tz]]) - 5 - cz / 100 });
    S.disc(cx, 70.5, 77, cz, 4.4, 3.8, '#fbf6ee', { order: S.depth([[tx, 64, tz]]) - 5.1 - cz / 100, edge: '#ebe2d4' });
    S.disc(cx, 76.9, 77, cz, 3.6, 3, '#6b4126', { order: S.depth([[tx, 64, tz]]) - 5.2 - cz / 100 });
  }
  const [px, py] = cam.p([796, 70, 154]);
  S.raw(`<path d="M${(px - 9).toFixed(1)} ${py.toFixed(1)}c3 -6 15 -6 18 0c-3 3 -15 3 -18 0z" fill="#d9a35a"/><path d="M${(px - 3).toFixed(1)} ${(py - 3).toFixed(1)}l1 4M${(px + 3).toFixed(1)} ${(py - 3).toFixed(1)}l-1 4" stroke="#b57b35" stroke-width="1"/>`, S.depth([[tx, 64, tz]]) - 6);
  const st = cam.p([778, 80, 148]);
  const after = `<path class="steam" d="M${st[0].toFixed(1)} ${st[1].toFixed(1)}c-3 -5 3 -8 0 -13c-3 -4 2 -7 0 -10" stroke="#fff" stroke-width="1.6" fill="none" opacity=".5" stroke-linecap="round"/>`;
  out.cafeTable = S.svg('ctb', { cast: .28, contact: .5, blur: 6, castLen: .8 }, { after });
}
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v.css), v.svg.length);
import { writeFileSync } from 'node:fs';
writeFileSync(new URL('./cafe.json', import.meta.url), JSON.stringify(out));
