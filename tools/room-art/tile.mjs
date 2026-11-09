// The library's wall of shelves, as one repeating tile: three bays, two shelves.
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const cols = ['#6b2a2a', '#2f4858', '#8a6a2a', '#3f5a3a', '#5b3a5a', '#2c5a5a', '#7a4a2a', '#7a2f40', '#34506a', '#4f5a2a', '#8a4a2a', '#3b3355', '#4a3a2a', '#6a5a3a'];
const W = 330, ROW = 92, BAY = 110;
let s = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${ROW * 2}'>`;
s += `<rect width='${W}' height='${ROW * 2}' fill='#22150c'/>`;
for (let r = 0; r < 2; r++) {
  const base = ROW * (r + 1) - 9;
  for (let b = 0; b < 3; b++) {
    let x = b * BAY + 9;
    const end = (b + 1) * BAY - 3;
    // back panel shade: darker at the top of each shelf (the board above shades it)
    s += `<rect x='${b * BAY + 7}' y='${ROW * r}' width='${BAY - 8}' height='14' fill='#000' opacity='.35'/>`;
    while (x < end - 4) {
      if (rnd() < 0.025 && end - x > 22) {
        // a leaning book, then a gap
        const w = 7, hgt = 50 + rnd() * 12, c = cols[(rnd() * cols.length) | 0];
        s += `<rect x='${x + 6}' y='${base - hgt}' width='${w}' height='${hgt}' fill='${c}' transform='rotate(-14 ${x + 6} ${base})'/>`;
        x += 18; continue;
      }
      if (rnd() < 0.02 && end - x > 20) {
        // a small ornament: a pot or a box
        if (rnd() < .5) s += `<path d='M${x + 2} ${base - 14}h12l-2 14h-8z' fill='#9a5a3a'/><path d='M${x + 8} ${base - 14}c-6-8 0-14 2-16 2 4 2 10-2 16z' fill='#3f6f4a'/>`;
        else s += `<rect x='${x + 1}' y='${base - 10}' width='16' height='10' fill='#6a4a2a'/><rect x='${x + 1}' y='${base - 10}' width='16' height='2' fill='#c9a14a'/>`;
        x += 20; continue;
      }
      const w = 4 + Math.round(rnd() * 6), hgt = 46 + Math.round(rnd() * 26), c = cols[(rnd() * cols.length) | 0];
      s += `<path d='M${x} ${base - hgt}h${w}v${hgt}h-${w}z' fill='${c}' stroke='#000' stroke-opacity='.35' stroke-width='.8'/>`;
      if (rnd() < .45) { const gy = base - hgt + 6; s += `<rect x='${x}' y='${gy}' width='${w}' height='1.4' fill='#d8b261' opacity='.75'/><rect x='${x}' y='${base - 8}' width='${w}' height='1.4' fill='#d8b261' opacity='.6'/>`; }
      x += w + (rnd() < .12 ? 2 : 0);
    }
  }
  // the shelf board: lit lip, face, and its shadow on the books below the board above
  s += `<rect x='0' y='${base}' width='${W}' height='9' fill='#5a3a24'/><rect x='0' y='${base}' width='${W}' height='2' fill='#8a6040'/><rect x='0' y='${base + 7}' width='${W}' height='2' fill='#2a1a10'/>`;
}
// uprights
for (let b = 0; b < 3; b++) s += `<rect x='${b * BAY}' y='0' width='7' height='${ROW * 2}' fill='#4a3020'/><rect x='${b * BAY}' y='0' width='1.5' height='${ROW * 2}' fill='#7a5232'/><rect x='${b * BAY + 7}' y='0' width='4' height='${ROW * 2}' fill='#000' opacity='.3'/>`;
s += '</svg>';
const enc = s.replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'");
console.log(enc.length);
import { writeFileSync } from 'node:fs';
writeFileSync(new URL('./tile.txt', import.meta.url), enc);
writeFileSync(new URL('./tile.svg', import.meta.url), s);
