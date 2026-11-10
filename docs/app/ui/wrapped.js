/**
 * Wrapped, the shareable part: the group chapter at the end of "Play your
 * year", every slide as a 1080 x 1920 picture for an Instagram story, and
 * the year poster.
 *
 * Pictures are drawn on a canvas. Covers come through the image resizer
 * (dom.js coverSrc), which allows them to be drawn - Hardcover's own covers
 * would make the canvas impossible to save. On a phone, "Share" opens the
 * share sheet with the picture, where Instagram offers "Story"; anywhere
 * else the picture downloads.
 */

import { h, coverSrc, toast } from './dom.js';
import { yearInBooks } from '../core/recap.js';
import { finishedIn } from '../core/story.js';
import { tasteMatch } from '../core/together.js';
import { cleanTags } from '../core/model.js';
import { SIGILS, ICON_FIT, sigilOf } from './sigil.js';
import { plural } from './views.js';

/* ------------------------------------------------------------ the group */

/**
 * The last chapter: how everyone's year went, and a few awards. Only
 * friends whose shelves are loaded (and who read something that year).
 */
export function groupChapter(ctx, profile, year) {
  // Everyone whose shelf is here - a friend who read nothing this year is still in it.
  const people = (ctx.state.profiles ?? [])
    .filter((p) => ctx.state.libraries[p.id])
    .map((p) => ({ p, books: finishedIn(ctx.state.libraries[p.id], year) }));
  if (people.length < 2 || !people.some((x) => x.books.length)) return [];
  const stats = people.map(({ p, books }) => {
    const pages = books.reduce((n, b) => n + (b.pages ?? 0), 0);
    const genres = new Set(books.flatMap((b) => cleanTags(b.genres, 3)));
    const top = [...books].filter((b) => b.rating).sort((a, b) => b.rating - a.rating)[0] ?? books.at(-1);
    return { p, count: books.length, pages, genres: genres.size, top: top ?? null };
  }).sort((a, b) => b.count - a.count);
  const best = (key) => [...stats].sort((a, b) => b[key] - a[key])[0];
  const me = stats.find((s) => s.p.id === profile.id);
  const twin = (ctx.state.profiles ?? []).filter((p) => p.id !== profile.id && ctx.state.libraries[p.id])
    .map((p) => ({ p, score: tasteMatch(ctx.state.libraries[profile.id]?.books ?? [], ctx.state.libraries[p.id].books ?? []).score }))
    .sort((a, b) => b.score - a.score)[0];
  const awards = [
    ['Most books', best('count'), (s) => plural(s.count, 'book')],
    ['Most pages', best('pages'), (s) => `${s.pages.toLocaleString()} pages`],
    ['Genre explorer', best('genres'), (s) => `${s.genres} genres`],
  ].filter(([, s]) => s);

  const friends = {
    kind: 'group', build: () => [
      h('div', { class: 'st-eyebrow', text: 'Your friends’ year' }),
      h('div', { class: 'st-group' }, stats.map((s, k) => h('div', { class: `st-person${s.p.id === profile.id ? ' me' : ''}`, style: `--d:${k * 120}ms;--c:${s.p.colour ?? '#a2461f'}` },
        h('strong', { text: s.p.id === profile.id ? 'You' : s.p.name }),
        h('span', { class: 'st-person-n', text: plural(s.count, 'book') }),
        s.top ? h('span', { class: 'st-person-top', text: s.top.title }) : h('span', { class: 'st-person-top', text: 'still to come' })))),
      me ? h('p', { class: 'st-sub', text: me === stats[0] ? 'You read the most of anyone.' : `You came ${ordinal(stats.indexOf(me) + 1)} of ${stats.length}.` }) : null],
    card: () => ({ eyebrow: 'Our year in books', title: `${year}, together`,
      lines: stats.map((s) => `${s.p.id === profile.id ? 'Me' : s.p.name} — ${plural(s.count, 'book')}`) }),
  };
  const prizes = {
    kind: 'awards', build: () => [
      h('div', { class: 'st-eyebrow', text: 'The awards' }),
      h('div', { class: 'st-records' }, awards.map(([label, s, say]) => h('div', { class: 'st-record' },
        h('span', { class: 'k', text: label }), h('strong', { text: s.p.id === profile.id ? 'You!' : s.p.name }), h('span', { text: say(s) }))),
      twin ? h('div', { class: 'st-record' }, h('span', { class: 'k', text: 'Your taste twin' }), h('strong', { text: twin.p.name }), h('span', { text: `${twin.score}% match` })) : null)],
    card: () => ({ eyebrow: `${year} awards`, title: 'The book club awards',
      lines: [...awards.map(([label, s, say]) => `${label}: ${s.p.name} (${say(s)})`), twin ? `Taste twin: ${twin.p.name}, ${twin.score}%` : null].filter(Boolean) }),
  };
  return [friends, prizes];
}

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] ?? 'th'}`;

/* ---------------------------------------------------------- the pictures */

/** A cover as an image the canvas may draw, or null. */
function loadCover(url, width = 300) {
  const src = coverSrc(url, width);
  if (!src || src === url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrap(g, text, x, y, width, lineHeight, maxLines = 4) {
  const words = String(text).split(' ');
  let line = '';
  let n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (g.measureText(test).width > width && line) {
      if (++n === maxLines) { g.fillText(`${line}…`, x, y); return y + lineHeight; }
      g.fillText(line, x, y); line = words[i]; y += lineHeight;
    } else line = test;
  }
  g.fillText(line, x, y);
  return y + lineHeight;
}

/** The member's sigil drawn on the canvas: their colour, their icon. */
function drawSigil(g, profile, cx, cy, r) {
  const s = sigilOf(profile);
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = s.bg; g.fill();
  g.lineWidth = r * 0.06; g.strokeStyle = 'rgba(255,246,230,.7)'; g.beginPath(); g.arc(cx, cy, r * 0.88, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  if (s.icon === 'letter') {
    g.font = `700 ${r}px Newsreader, Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText((s.letter || profile.name?.[0] || '?').toUpperCase(), cx, cy + r * 0.05);
  } else {
    const [ox, oy, k] = ICON_FIT[s.icon] ?? [12, 12, 1];
    const scale = (r * 1.15) / 24 * k;
    g.translate(cx, cy); g.scale(scale, scale); g.translate(-ox, -oy);
    g.lineWidth = 1.9 / k; g.lineCap = 'round'; g.lineJoin = 'round';
    g.stroke(new Path2D(SIGILS[s.icon]));
  }
  g.restore();
}

/**
 * One story picture: eyebrow, a big number or a title, a few lines, covers.
 * 1080 x 1920, the size Instagram stories use.
 */
export async function storyPicture(profile, card) {
  await document.fonts?.ready;
  const W = 1080; const H = 1920;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const accent = profile.sigil?.bg ?? profile.colour ?? '#a2461f';
  const bg = g.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, '#120d09'); bg.addColorStop(0.55, '#1e140d'); bg.addColorStop(1, accent);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // A soft bloom of the member's colour.
  const glow = g.createRadialGradient(W * 0.85, H * 0.12, 20, W * 0.85, H * 0.12, 700);
  glow.addColorStop(0, `${accent}aa`); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);

  const covers = (await Promise.all((card.covers ?? []).slice(0, 9).map((b) => loadCover(b.cover)))).filter(Boolean);
  let y = 260;
  g.fillStyle = 'rgba(255,246,230,.7)'; g.font = '700 38px system-ui, sans-serif'; g.textAlign = 'left';
  g.fillText(String(card.eyebrow ?? '').toUpperCase(), 96, y);
  y += 40;
  if (card.big != null) {
    g.fillStyle = '#fff6e6'; g.font = '600 260px Newsreader, Georgia, serif';
    g.fillText(Number(card.big).toLocaleString(), 84, y + 230); y += 300;
    if (card.bigLabel) { g.font = '600 64px Newsreader, Georgia, serif'; g.fillText(card.bigLabel, 100, y + 24); y += 94; }
  }
  if (card.title) { g.fillStyle = '#fff6e6'; g.font = '600 96px Newsreader, Georgia, serif'; y = wrap(g, card.title, 96, y + 100, W - 192, 108, 3); }
  g.font = '500 44px system-ui, sans-serif'; g.fillStyle = 'rgba(255,246,230,.88)';
  y += 30;
  for (const line of (card.lines ?? []).slice(0, 8)) y = wrap(g, line, 96, y, W - 192, 58, 2) + 18;
  if (covers.length) {
    // A fan of covers along the bottom.
    const n = covers.length; const cw = Math.min(260, (W - 120) / Math.max(3, n * 0.62)); const ch = cw * 1.5;
    const top = Math.max(y + 60, H - ch - 330);
    covers.forEach((img, i) => {
      const k = i - (n - 1) / 2;
      g.save();
      g.translate(W / 2 + k * cw * 0.62, top + ch / 2 + Math.abs(k) * 18);
      g.rotate((k * 4 * Math.PI) / 180);
      g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 30; g.shadowOffsetY = 14;
      g.drawImage(img, -cw / 2, -ch / 2, cw, ch);
      g.restore();
    });
  }
  // Signed with the member's sigil.
  drawSigil(g, profile, 150, H - 150, 54);
  g.fillStyle = 'rgba(255,246,230,.8)'; g.font = '600 40px Newsreader, Georgia, serif'; g.textAlign = 'left';
  g.fillText(profile.name ?? '', 228, H - 158);
  g.fillStyle = 'rgba(255,246,230,.5)'; g.font = '600 28px system-ui, sans-serif';
  g.fillText('Bookshelf', 228, H - 118);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

/** Share a picture: the share sheet where there is one (Instagram Story on a phone), a download otherwise. */
export async function sharePicture(blob, filename, title) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; } catch (err) { if (err?.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return 'saved';
}

/* ------------------------------------------------------------- the poster */

/**
 * The year as a poster: every book finished, cover out, on shelves; the
 * numbers underneath; the member's sigil as a seal. As a print (3:4, 2400 x
 * 3200) or as a story (1080 x 1920).
 */
export async function yearPoster(ctx, profile, year, { story = false } = {}) {
  await document.fonts?.ready;
  const library = ctx.state.libraries[profile.id] ?? { books: [] };
  const books = finishedIn(library, year);
  const r = yearInBooks(library, year);
  const W = story ? 1080 : 2400; const H = story ? 1920 : 3200; const u = W / 1080;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const accent = profile.sigil?.bg ?? profile.colour ?? '#a2461f';
  g.fillStyle = '#f3ebdd'; g.fillRect(0, 0, W, H);
  const band = g.createLinearGradient(0, 0, 0, H * 0.3);
  band.addColorStop(0, accent); band.addColorStop(1, '#2a1c12');
  g.fillStyle = band; g.fillRect(0, 0, W, H * (story ? 0.22 : 0.2));
  g.fillStyle = '#fff6e6'; g.textAlign = 'left';
  g.font = `700 ${30 * u}px system-ui, sans-serif`; g.fillText(`${(profile.name ?? '').toUpperCase()}’S`, 80 * u, 130 * u);
  g.font = `600 ${118 * u}px Newsreader, Georgia, serif`; g.fillText(`${year} in books`, 72 * u, 250 * u);
  drawSigil(g, profile, W - 140 * u, 175 * u, 70 * u);

  // The shelves: covers in reading order, a plank under each row.
  const covers = await Promise.all(books.map((b) => loadCover(b.cover, 220)));
  const areaTop = H * (story ? 0.25 : 0.23); const areaBottom = H * (story ? 0.78 : 0.8);
  const n = Math.max(1, books.length);
  let cols = Math.ceil(Math.sqrt((n * (W - 120 * u)) / ((areaBottom - areaTop) * 0.66)));
  cols = Math.max(4, Math.min(12, cols));
  const cw = (W - 120 * u - (cols - 1) * 14 * u) / cols; const ch = cw * 1.5;
  const rows = Math.ceil(n / cols);
  const rowH = Math.min(ch + 44 * u, (areaBottom - areaTop) / Math.max(1, rows));
  const scale = Math.min(1, (rowH - 44 * u) / ch);
  books.forEach((b, i) => {
    const row = Math.floor(i / cols); const col = i % cols;
    const x = 60 * u + col * (cw + 14 * u) + (cw - cw * scale) / 2;
    const bottom = areaTop + (row + 1) * rowH - 30 * u;
    const w = cw * scale; const hh = ch * scale;
    g.save(); g.shadowColor = 'rgba(40,25,10,.35)'; g.shadowBlur = 14 * u; g.shadowOffsetY = 6 * u;
    if (covers[i]) g.drawImage(covers[i], x, bottom - hh, w, hh);
    else {
      g.fillStyle = '#6b4a2e'; g.fillRect(x, bottom - hh, w, hh);
      g.shadowColor = 'transparent'; g.fillStyle = '#f6ead2'; g.font = `600 ${Math.max(10, w / 7)}px Newsreader, Georgia, serif`; g.textAlign = 'center';
      wrap(g, b.title, x + w / 2, bottom - hh * 0.6, w * 0.85, w / 6, 4); g.textAlign = 'left';
    }
    g.restore();
    if (col === 0 || i === 0) {
      g.fillStyle = '#8a5a34'; g.fillRect(40 * u, bottom, W - 80 * u, 12 * u);
      g.fillStyle = '#5e3c22'; g.fillRect(40 * u, bottom + 12 * u, W - 80 * u, 8 * u);
    }
  });

  // The numbers.
  const stats = [
    [String(r.count), plural(r.count, 'book').replace(/^\d+ /, '')],
    [r.pages ? r.pages.toLocaleString() : '—', 'pages'],
    [r.genres?.[0]?.tag ?? '—', 'top genre'],
    [r.topAuthor?.name ?? '—', 'most read'],
  ];
  const sy = H * (story ? 0.84 : 0.86);
  stats.forEach(([v, k], i) => {
    const x = 80 * u + i * ((W - 160 * u) / 4);
    g.fillStyle = '#2a1c12'; g.font = `600 ${(v.length > 9 ? 34 : 54) * u}px Newsreader, Georgia, serif`;
    wrap(g, v, x, sy, (W - 200 * u) / 4, 44 * u, 2);
    g.fillStyle = '#8a7560'; g.font = `700 ${18 * u}px system-ui, sans-serif`; g.fillText(k.toUpperCase(), x, sy + 70 * u);
  });
  g.fillStyle = '#8a7560'; g.font = `600 ${20 * u}px system-ui, sans-serif`;
  g.fillText(r.favourites?.[0] ? `Favourite: ${r.favourites[0].title}` : 'Bookshelf', 80 * u, H - 70 * u);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

/** The poster dialog: a preview and the two ways to take it away. */
export function openPoster(ctx, profile, year) {
  const preview = h('img', { class: 'poster-preview', alt: `${profile.name}’s ${year} poster` });
  const status = h('p', { class: 'hint', 'aria-live': 'polite', text: 'Drawing your poster…' });
  const dialog = h('dialog', { class: 'poster-dialog', 'aria-label': 'Year poster' },
    h('div', { class: 'poster-head' }, h('h2', { text: `${year} poster` }), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => dialog.close() }, '✕')),
    preview, status,
    h('div', { class: 'row end' },
      h('button', { class: 'btn secondary', type: 'button', onclick: async (e) => {
        e.currentTarget.disabled = true;
        const blob = await yearPoster(ctx, profile, year, { story: true });
        const how = await sharePicture(blob, `${year}-in-books-story.png`, `My ${year} in books`);
        status.textContent = how === 'shared' ? 'Shared.' : how === 'saved' ? 'Saved — add it to your story from your photos.' : '';
        e.currentTarget.disabled = false;
      } }, 'Share to story'),
      h('button', { class: 'btn', type: 'button', onclick: async (e) => {
        e.currentTarget.disabled = true;
        const blob = await yearPoster(ctx, profile, year);
        await sharePicture(blob, `${year}-in-books-poster.png`, `My ${year} in books`);
        status.textContent = 'Poster saved — 2400 × 3200, ready to print.';
        e.currentTarget.disabled = false;
      } }, 'Download to print')));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  yearPoster(ctx, profile, year).then((blob) => {
    preview.src = URL.createObjectURL(blob);
    status.textContent = '';
  }).catch(() => { status.textContent = 'Could not draw the poster here.'; toast('Could not draw the poster.', true); });
}
