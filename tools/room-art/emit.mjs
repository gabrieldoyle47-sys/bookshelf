// Write docs/app/ui/room-art.js from the generated JSON files.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The repo's docs/app/ui, wherever the repo is checked out.
const UI = fileURLToPath(new URL('../../docs/app/ui/', import.meta.url));
// Sorted by file name, so the output is the same whatever order they are given in.
const files = process.argv.slice(2).sort((a, b) => a.split('/').pop().localeCompare(b.split('/').pop()));
const all = {};
for (const f of files) if (existsSync(f)) Object.assign(all, JSON.parse(readFileSync(f, 'utf8')));
const notes = JSON.parse(readFileSync(new URL('./notes.json', import.meta.url), 'utf8'));
let js = `/**
 * The furniture that stands in the room, drawn in the room's own perspective.
 *
 * Each piece was modelled in the room's coordinates (x across from its left
 * edge, y up from the floor, z out from the back wall, in pixels at a 1280px
 * window) and projected through the same eye as the CSS room (room.js,
 * fitRoom), so a counter shows its top, a chair its seat, and every edge
 * runs back towards the vanishing point the floor and walls use. Faces are
 * shaded from the scene's light - the window on the left, the fire, the
 * lamp - and each piece carries its own shadow on the floor, cast along that
 * light, with a darker contact shadow where it touches.
 *
 * Fixed strings, parsed by room.js like the other drawings; nothing anyone
 * types goes through them.
 */

export const FURNITURE = {\n`;
for (const [k, v] of Object.entries(all)) js += `  // ${notes[k] ?? k}\n  ${k}: \`${v.svg}\`,\n`;
js += '};\n';
writeFileSync(`${UI}room-art.js`, js);
for (const [k, v] of Object.entries(all)) console.log(k.padEnd(12), JSON.stringify(v.css));
// Placement, written into the marked block in style.css.
const W = 1032; const pct = (n) => `${Math.round((n / W) * 10000) / 100}%`;
let css = '';
for (const [k, v] of Object.entries(all)) {
  if (v.place === false) continue;
  const c = v.css; const side = c.left <= c.right ? 'left' : 'right';
  const glow = v.glow ? ` --glow-x: ${v.glow[0]}%; --glow-y: ${v.glow[1]}%;` : '';
  css += `.room-item.${k}.front { ${side}: min(${c[side]}px, ${pct(c[side])}); width: min(${c.width}px, ${pct(c.width)}); bottom: ${c.bottom}px;${glow} }\n`;
}
const sp = `${UI}style.css`;
let st = readFileSync(sp, 'utf8');
const a = '/* -- placed with the drawings (room-art.js): a share of the room, never more than at 1280px -- */\n';
const b = '/* -- end of placement -- */\n';
const i = st.indexOf(a), j = st.indexOf(b);
if (i < 0 || j < 0) throw new Error('placement markers missing');
st = st.slice(0, i + a.length) + css + st.slice(j);
writeFileSync(sp, st);
console.log('bytes', js.length);
