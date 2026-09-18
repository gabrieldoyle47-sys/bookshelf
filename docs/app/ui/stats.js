/**
 * Stats tab.
 *
 * Deliberately tile-first. A new shelf has a handful of books, and reading
 * dates are optional, so a monthly-pace chart would usually be one lonely bar
 * implying far more than it knows. Charts appear only once there is enough
 * data to carry meaning, and anything derived from optional dates says how
 * much of the shelf it actually covers.
 *
 * Both charts are single-series, so they use one hue and need no legend —
 * the heading names the measure.
 */

import { h, stars } from './dom.js';
import { deriveWatchlist } from '../core/model.js';
import { frag, pageHead, emptyState } from './views.js';

const MIN_POINTS = 3; // below this a chart misleads more than it informs

export function statsView(ctx, profile) {
  const library = ctx.state.libraries[profile.id] ?? { books: [] };
  const books = library.books;
  const read = books.filter((b) => b.status === 'read');
  const rated = read.filter((b) => typeof b.rating === 'number' && b.rating > 0);
  const dated = read.filter((b) => b.finished);
  const watch = deriveWatchlist(library);

  const pagesKnown = read.filter((b) => b.pages);
  const pages = pagesKnown.reduce((sum, b) => sum + b.pages, 0);
  const avg = rated.length ? rated.reduce((s, b) => s + b.rating, 0) / rated.length : null;

  if (!books.length) {
    return frag(pageHead(`Stats · ${profile.name}`), emptyState('Nothing to count yet.'));
  }

  return frag(
    pageHead(`Stats · ${profile.name}`),

    h('div', { class: 'stat-row' },
      tile(read.length, 'books finished'),
      tile(pages ? pages.toLocaleString() : '—', 'pages',
        pagesKnown.length < read.length ? `${pagesKnown.length} of ${read.length} have a page count` : null),
      tile(avg ? avg.toFixed(1) : '—', 'average rating',
        rated.length ? `${rated.length} rated` : 'nothing rated yet'),
      tile(Object.keys(watch.series).length, 'series watched'),
      tile(books.filter((b) => b.status === 'tbr').length, 'on the to-read pile')),

    ratingSection(rated),
    paceSection(read, dated),
  );
}

function tile(n, label, footnote) {
  return h('div', { class: 'stat' },
    h('div', { class: 'n', text: String(n) }),
    h('div', { class: 'k', text: label }),
    footnote && h('div', { class: 'k', style: 'opacity:.75', text: footnote }));
}

/* ------------------------------------------------------- rating histogram */

function ratingSection(rated) {
  if (rated.length < MIN_POINTS) {
    return h('section', { class: 'section' },
      h('h2', { text: 'Ratings' }),
      h('p', { class: 'empty', text: `Rate ${MIN_POINTS - rated.length} more book${MIN_POINTS - rated.length === 1 ? '' : 's'} and the spread will show up here.` }));
  }

  const buckets = [1, 2, 3, 4, 5].map((score) => ({
    key: stars(score),
    label: String(score),
    value: rated.filter((b) => b.rating === score).length,
    tip: (n) => `${n} book${n === 1 ? '' : 's'} rated ${score}`,
  }));

  return h('section', { class: 'section' },
    h('div', { class: 'section-head' },
      h('h2', { text: 'How you rate' }),
      h('span', { class: 'count', text: `${rated.length} rated` })),
    h('div', { class: 'chart-wrap' }, barChart(buckets)));
}

/* ------------------------------------------------------------ reading pace */

function paceSection(read, dated) {
  const coverage = h('p', { class: 'hint',
    text: `Based on the ${dated.length} of ${read.length} finished book${read.length === 1 ? '' : 's'} with a finish date recorded. Dates are optional — add them from a book's detail panel if you want this to be complete.` });

  if (dated.length < MIN_POINTS) {
    return h('section', { class: 'section' },
      h('h2', { text: 'Reading pace' }),
      h('p', { class: 'empty', text: 'Reading dates are optional and there are too few recorded to plot a pace yet.' }),
      read.length ? coverage : null);
  }

  const months = lastMonths(12);
  const counts = months.map((m) => ({
    key: m.short,
    label: m.short,
    value: dated.filter((b) => String(b.finished).slice(0, 7) === m.key).length,
    tip: (n) => `${n} finished in ${m.long}`,
  }));

  return h('section', { class: 'section' },
    h('div', { class: 'section-head' },
      h('h2', { text: 'Reading pace' }),
      h('span', { class: 'count', text: 'last 12 months' })),
    h('div', { class: 'chart-wrap' }, barChart(counts)),
    coverage);
}

function lastMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      short: d.toLocaleDateString(undefined, { month: 'short' }),
      long: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ chart */

/**
 * Single-series bar chart, built from HTML rather than SVG.
 *
 * An SVG viewBox has a fixed aspect ratio, so in a fluid column it either
 * letterboxes or scales the label text along with the bars — unreadable on a
 * phone. HTML bars flex to whatever width they are given and the labels stay
 * real text at a real font size.
 *
 * Bars are anchored to the baseline with rounded tops and a 2px gap; only the
 * peak is labelled directly, the rest are on hover. A table view sits under
 * every chart so the numbers are never colour- or size-only.
 */
function barChart(data) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const summary = data.map((d) => `${d.label}: ${d.value}`).join(', ');

  const bars = h('div', { class: 'bars' }, data.map((d) => {
    const pct = d.value === 0 ? 0 : Math.max(2, (d.value / max) * 100);
    return h('div', {
      class: 'bar-col',
      title: d.tip ? d.tip(d.value) : `${d.label}: ${d.value}`,
    },
      d.value === max && d.value > 0 ? h('span', { class: 'bar-val', text: String(d.value) }) : null,
      h('div', { class: `bar${d.value === 0 ? ' zero' : ''}`, style: `height:${pct}%` }));
  }));

  const keys = h('div', { class: 'bar-keys' },
    data.map((d) => h('div', { class: 'bar-key', text: d.key })));

  const table = h('details', { class: 'optional' },
    h('summary', { text: 'View as table' }),
    h('table', { class: 'data-table' },
      h('tbody', {}, data.map((d) =>
        h('tr', {}, h('th', { scope: 'row', text: d.label }), h('td', { text: String(d.value) }))))));

  return h('figure', { class: 'chart', role: 'group', 'aria-label': `Bar chart. ${summary}` },
    bars, keys, table);
}
