/**
 * "Play your year": the year in books as a full-screen story, a slide at a
 * time - the Spotify Wrapped / Instagram stories pattern.
 *
 * Tap the right of the screen (or press →) for the next slide, the left for
 * the one before; hold to pause; Escape closes. Slides advance on their own.
 * A slide whose data is too thin to say anything is left out rather than
 * shown half empty. The last slide is a card to save or copy.
 */

import { h, fill, coverEl, starsEl, countUp } from './dom.js';
import { yearInBooks } from '../core/recap.js';
import { readingDays, longestStreak, tasteByMonth, records, passport, finishedIn } from '../core/story.js';
import { plural } from './views.js';
import { groupChapter, storyPicture, sharePicture } from './wrapped.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SLIDE_MS = 6500;
// Pages an hour, for a rough sense of time spent. A common reading pace.
const PAGES_PER_HOUR = 40;

const locationCache = new Map();

export function playStory(ctx, profile, year) {
  const library = ctx.state.libraries[profile.id] ?? { books: [] };
  const r = yearInBooks(library, year);
  const books = finishedIn(library, year);
  if (!books.length) return;
  const days = readingDays(library, year);
  const rec = records(books);
  const taste = tasteByMonth(books);
  const who = profile.colour ?? '#a2461f';

  const slides = [
    intro(profile, year, r, books),
    timeSlide(r, rec),
    days.size >= 5 ? heatmap(year, days) : null,
    taste.filter((m) => m.genre).length >= 3 ? tasteSlide(taste) : null,
    rec.fastest || rec.longest || rec.bestMonth ? recordsSlide(rec) : null,
    passportSlide(ctx, books),
    r.favourites.length ? favouritesSlide(r) : null,
    // The group chapter: everyone's year, and the awards.
    ...groupChapter(ctx, profile, year),
    shareSlide(profile, year, r, rec, days, taste, books),
  ].filter(Boolean);

  const dialog = h('dialog', { class: 'story', style: `--who:${who}`, 'aria-label': `${profile.name}’s ${year} in books` });
  const bars = h('div', { class: 'story-bars' }, slides.map(() => h('span', {}, h('i'))));
  const stage = h('div', { class: 'story-stage' });
  const close = h('button', { class: 'story-close', type: 'button', 'aria-label': 'Close' }, '✕');
  // Any slide as a picture for an Instagram story (wrapped.js).
  const share = h('button', { class: 'story-share', type: 'button', 'aria-label': 'Share this slide', title: 'Share this slide as a story' },
    h('span', { class: 'ico ico-share', 'aria-hidden': 'true' }), 'Share');
  share.addEventListener('click', async () => {
    const slide = slides[i];
    if (!slide.card) return;
    pause(true);
    share.disabled = true;
    try {
      const blob = await storyPicture(profile, await slide.card());
      await sharePicture(blob, `${year}-in-books-${slide.kind}.png`, `My ${year} in books`);
    } catch { /* nothing to share */ }
    share.disabled = false;
  });
  dialog.append(bars, close, share, stage);
  document.body.append(dialog);

  let i = 0;
  let timer = null;
  let startedAt = 0;
  let remaining = SLIDE_MS;
  let paused = false;

  function show(n) {
    i = Math.max(0, Math.min(slides.length - 1, n));
    [...bars.children].forEach((bar, k) => {
      bar.className = k < i ? 'done' : k === i ? 'now' : '';
      bar.style.setProperty('--ms', `${SLIDE_MS}ms`);
    });
    const slide = slides[i];
    fill(stage, h('section', { class: `story-slide ${slide.kind}` }, slide.build()));
    share.hidden = !slide.card;
    stage.firstChild.querySelectorAll('[data-count]').forEach((el) => countUp(el, Number(el.dataset.count)));
    remaining = SLIDE_MS;
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    // The last slide waits for the reader.
    if (i >= slides.length - 1) { bars.children[i].className = 'done'; return; }
    startedAt = performance.now();
    timer = setTimeout(() => show(i + 1), remaining);
  }
  function pause(on) {
    if (on === paused) return;
    paused = on;
    dialog.classList.toggle('paused', on);
    if (on) { clearTimeout(timer); remaining -= performance.now() - startedAt; } else schedule();
  }
  function end() {
    clearTimeout(timer);
    dialog.classList.add('closing');
    setTimeout(() => { dialog.close(); dialog.remove(); }, 260);
  }

  // Tap left for back, right for next; hold anywhere to pause.
  let downAt = 0;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a')) return;
    downAt = performance.now();
    setTimeout(() => { if (downAt) pause(true); }, 220);
  });
  stage.addEventListener('pointerup', (e) => {
    if (e.target.closest('button, a') || !downAt) return;
    const held = performance.now() - downAt > 220;
    downAt = 0;
    if (held) return pause(false);
    const r2 = stage.getBoundingClientRect();
    show(e.clientX - r2.left < r2.width * 0.3 ? i - 1 : i + 1);
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(i + 1);
    else if (e.key === 'ArrowLeft') show(i - 1);
    else if (e.key === ' ') { e.preventDefault(); pause(!paused); }
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); end(); });
  close.addEventListener('click', end);

  dialog.showModal();
  close.focus();
  show(0);
}

/* ----------------------------------------------------------------- slides */

const big = (n, text) => h('div', { class: 'st-big' }, h('strong', { dataset: { count: String(n) }, text: Number(n).toLocaleString() }), text ? h('span', { text }) : null);

function intro(profile, year, r, books) {
  return { kind: 'intro', build: () => [
    h('div', { class: 'st-fan', 'aria-hidden': 'true' }, books.filter((b) => b.cover).slice(-9).map((b, k, all) =>
      h('span', { style: `--k:${k - (all.length - 1) / 2}` }, coverEl(b, { width: 320 })))),
    h('div', { class: 'st-eyebrow', text: `${profile.name}’s` }),
    h('h2', { class: 'st-title', text: `${year} in books` }),
    h('p', { class: 'st-sub', text: `${plural(r.count, 'book')} finished${r.pages ? ` · ${r.pages.toLocaleString()} pages` : ''}` }),
    h('p', { class: 'st-hint', text: 'Tap to go on' })],
  card: () => ({ eyebrow: `${profile.name}’s`, title: `${year} in books`,
    lines: [`${plural(r.count, 'book')} finished`, r.pages ? `${r.pages.toLocaleString()} pages` : null].filter(Boolean), covers: books.filter((b) => b.cover).slice(-9) }) };
}

function timeSlide(r, rec) {
  const hours = Math.round(r.pages / PAGES_PER_HOUR + rec.listening);
  return { kind: 'time', build: () => [
    h('div', { class: 'st-eyebrow', text: 'You turned' }),
    big(r.pages, 'pages'),
    h('p', { class: 'st-sub', text: `That is about ${plural(hours, 'hour')} with a book${hours >= 24 ? ` — ${Math.round(hours / 24 * 10) / 10} whole days and nights` : ''}.` }),
    rec.listening ? h('p', { class: 'st-sub small', text: `Including ${rec.listening} hours listening.` }) : null,
    r.pagesKnown < r.count ? h('p', { class: 'st-note', text: `${r.pagesKnown} of ${r.count} books have a page count.` }) : null],
  card: () => ({ eyebrow: 'This year I turned', big: r.pages, bigLabel: 'pages', lines: [`About ${plural(hours, 'hour')} with a book.`] }) };
}

function heatmap(year, days) {
  const first = new Date(`${year}-01-01T00:00:00`);
  const offset = (first.getDay() + 6) % 7; // weeks start on Monday
  const total = (Date.parse(`${Number(year) + 1}-01-01`) - Date.parse(`${year}-01-01`)) / 864e5;
  const max = Math.max(1, ...days.values());
  const cells = [];
  for (let k = 0; k < offset; k++) cells.push(h('i', { class: 'blank' }));
  for (let d = 0; d < total; d++) {
    const key = new Date(Date.UTC(Number(year), 0, 1 + d)).toISOString().slice(0, 10);
    const n = days.get(key) ?? 0;
    cells.push(h('i', { style: n ? `--a:${0.35 + 0.65 * (n / max)}` : null, class: n ? 'on' : '', title: n ? key : null }));
  }
  const streak = longestStreak(days);
  return { kind: 'heat', build: () => [
    h('div', { class: 'st-eyebrow', text: 'The days you had a book open' }),
    big(days.size, plural(days.size, 'day').replace(/^\d+ /, '')),
    h('div', { class: 'st-heat', 'aria-hidden': 'true' }, cells),
    h('div', { class: 'st-months', 'aria-hidden': 'true' }, MONTHS.map((m) => h('span', { text: m[0] }))),
    streak > 1 ? h('p', { class: 'st-sub', text: `Longest streak: ${plural(streak, 'day')} in a row.` }) : null,
    h('p', { class: 'st-note', text: 'From the start and finish dates you gave.' })],
  card: () => ({ eyebrow: 'Days I had a book open', big: days.size, bigLabel: 'reading days', lines: streak > 1 ? [`Longest streak: ${plural(streak, 'day')} in a row.`] : [] }) };
}

const genreHue = (g) => { let n = 0; for (const c of g) n = (n * 31 + c.charCodeAt(0)) % 360; return n; };

function tasteSlide(taste) {
  const named = taste.filter((m) => m.genre);
  const genres = [...new Set(named.map((m) => m.genre))].slice(0, 6);
  const start = named[0];
  const finish = named[named.length - 1];
  return { kind: 'taste', build: () => [
    h('div', { class: 'st-eyebrow', text: 'How your taste moved' }),
    h('div', { class: 'st-ribbon' }, taste.map((m) => h('div', { class: 'st-month' },
      h('span', { class: `st-swatch${m.genre ? '' : ' empty'}`, style: m.genre ? `--h:${genreHue(m.genre)}` : null, title: m.genre ?? '' }),
      h('span', { class: 'st-mlabel', text: MONTHS[m.month - 1].slice(0, 3) })))),
    h('div', { class: 'st-legend' }, genres.map((g) => h('span', {}, h('i', { style: `--h:${genreHue(g)}` }), g))),
    start.genre !== finish.genre
      ? h('p', { class: 'st-sub', text: `You began the year in ${start.genre} and ended it in ${finish.genre}.` })
      : h('p', { class: 'st-sub', text: `${start.genre}, start to finish.` })],
  card: () => ({ eyebrow: 'How my taste moved', title: start.genre !== finish.genre ? `From ${start.genre} to ${finish.genre}` : `${start.genre}, start to finish`, lines: genres }) };
}

function recordsSlide(rec) {
  const card = (label, value, detail) => h('div', { class: 'st-record' },
    h('span', { class: 'k', text: label }), h('strong', { text: value }), detail ? h('span', { text: detail }) : null);
  return { kind: 'records', build: () => [
    h('div', { class: 'st-eyebrow', text: 'Personal records' }),
    h('div', { class: 'st-records' },
      rec.fastest ? card('Fastest read', rec.fastest.book.title, `${rec.fastest.perDay} pages a day · ${plural(rec.fastest.days, 'day')}`) : null,
      rec.longest ? card('Longest book', rec.longest.title, `${rec.longest.pages.toLocaleString()} pages`) : null,
      rec.bestMonth ? card('Biggest month', MONTHS[rec.bestMonth.month - 1], plural(rec.bestMonth.count, 'book')) : null,
      rec.listening ? card('Listening', `${rec.listening} hours`, 'of audiobooks') : null)],
  card: () => ({ eyebrow: 'Personal records', title: 'My reading records', lines: [
    rec.fastest ? `Fastest: ${rec.fastest.book.title} — ${rec.fastest.perDay} pages a day` : null,
    rec.longest ? `Longest: ${rec.longest.title} — ${rec.longest.pages.toLocaleString()} pages` : null,
    rec.bestMonth ? `Biggest month: ${MONTHS[rec.bestMonth.month - 1]}, ${plural(rec.bestMonth.count, 'book')}` : null,
    rec.listening ? `${rec.listening} hours of audiobooks` : null].filter(Boolean) }) };
}

/**
 * Passport stamps: the countries the year's authors come from, looked up on
 * Hardcover when the story opens (and kept for the visit).
 */
function passportSlide(ctx, books) {
  const authors = [...new Map(books.flatMap((b) => b.authors ?? []).filter((a) => a.id).map((a) => [a.id, a])).values()].slice(0, 24);
  if (!authors.length) return null;
  const lookups = authors.map((a) => {
    if (!locationCache.has(a.id)) {
      const p = ctx.actions.fetchAuthor(a.id).then((x) => ({ name: a.name, location: x?.location ?? null })).catch(() => ({ name: a.name, location: null }));
      locationCache.set(a.id, p);
    }
    return locationCache.get(a.id);
  });
  const ready = Promise.all(lookups).then(passport);
  return { kind: 'passport', build: () => {
    const box = h('div', { class: 'st-stamps' }, h('p', { class: 'st-note', text: 'Looking up where your authors are from…' }));
    ready.then((stamps) => {
      if (!stamps.length) return fill(box, h('p', { class: 'st-sub', text: 'Hardcover does not know where this year’s authors are from.' }));
      fill(box, stamps.map((s, k) => h('div', { class: 'st-stamp', style: `--r:${((k * 37) % 24) - 12}deg;--d:${k * 120}ms;--h:${genreHue(s.country)}` },
        h('strong', { text: s.country }), h('span', { text: s.authors.slice(0, 2).join(' · ') + (s.authors.length > 2 ? ` +${s.authors.length - 2}` : '') }))));
    });
    return [h('div', { class: 'st-eyebrow', text: 'Your reading passport' }),
      h('h2', { class: 'st-title small', text: 'Where your authors are from' }), box];
  },
  card: async () => {
    const stamps = await ready;
    return { eyebrow: 'My reading passport', title: stamps.length ? `Books from ${plural(stamps.length, 'country')}` : 'Where my authors are from', lines: stamps.slice(0, 8).map((s) => s.country) };
  } };
}

function favouritesSlide(r) {
  const favs = r.favourites.slice(0, 5);
  return { kind: 'favs', build: () => [
    h('div', { class: 'st-eyebrow', text: favs.length > 1 ? 'Your favourites' : 'Your favourite' }),
    h('div', { class: 'st-favs' }, favs.map((b, k) => h('figure', { style: `--d:${k * 140}ms` }, coverEl(b, { width: 360 }), h('figcaption', { text: b.title })))),
    starsEl(r.topRating)],
  card: () => ({ eyebrow: favs.length > 1 ? 'My favourites' : 'My favourite', title: favs[0].title, lines: favs.slice(1).map((b) => b.title), covers: favs }) };
}

/* ------------------------------------------------------------------ share */

function shareSlide(profile, year, r, rec, days, taste, books) {
  const topGenre = r.genres[0]?.tag ?? null;
  const lines = [
    `${profile.name}’s ${year} in books`,
    `${plural(r.count, 'book')} · ${r.pages.toLocaleString()} pages`,
    days.size >= 5 ? `${plural(days.size, 'reading day')} · longest streak ${plural(longestStreak(days), 'day')}` : null,
    topGenre ? `Mostly ${topGenre}` : null,
    r.favourites[0] ? `Favourite: ${r.favourites[0].title}` : null,
    rec.fastest ? `Fastest: ${rec.fastest.book.title} (${rec.fastest.perDay} pages a day)` : null,
  ].filter(Boolean);
  const text = lines.join('\n');
  return { kind: 'share', card: () => ({ eyebrow: `${year}`, title: lines[0], lines: lines.slice(1), covers: books.filter((b) => b.cover).slice(-9) }), build: () => {
    const status = h('p', { class: 'st-note', 'aria-live': 'polite' });
    return [
      h('div', { class: 'st-card' }, h('div', { class: 'st-card-year', text: String(year) }),
        h('strong', { text: lines[0] }), lines.slice(1).map((l) => h('span', { text: l }))),
      h('div', { class: 'st-share' },
        h('button', { class: 'btn', type: 'button', onclick: async () => {
          try {
            const blob = await storyPicture(profile, { eyebrow: `${year}`, title: lines[0], lines: lines.slice(1), covers: books.filter((b) => b.cover).slice(-9) });
            const how = await sharePicture(blob, `${year}-in-books.png`, lines[0]);
            status.textContent = how === 'shared' ? 'Shared.' : how === 'saved' ? 'Saved — add it to your story from your photos.' : '';
          } catch { status.textContent = 'Could not make the image here.'; }
        } }, 'Share as a story'),
        h('button', { class: 'btn secondary', type: 'button', onclick: async () => {
          try { await navigator.clipboard.writeText(text); status.textContent = 'Copied — paste it anywhere.'; } catch { status.textContent = 'Copying is blocked here.'; }
        } }, 'Copy text')),
      status];
  } };
}
