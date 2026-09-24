/**
 * The yearly reading goal and the Year in books recap, both on Stats.
 *
 * The goal is optional and per year: nothing nags if it is never set. The
 * recap only counts books with a read date in that year, and says so.
 */

import { h, clear, fill, fmtReadOnShort, authorNames, coverEl, starsEl, fmtRating } from './dom.js';
import { goalProgress, today } from '../core/model.js';
import { recapYears, yearInBooks } from '../core/recap.js';
import { plural } from './views.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ------------------------------------------------------------------- goal */

export function goalSection(ctx, profile) {
  const library = ctx.state.libraries[profile.id] ?? { books: [] };
  const year = Number(today().slice(0, 4));
  const g = goalProgress(library, year);
  const canWrite = ctx.state.canWrite;
  const section = h('section', { class: 'section goal' });

  const editor = (initial) => {
    const input = h('input', {
      type: 'number', min: '1', max: '500', inputmode: 'numeric', value: initial ?? '',
      placeholder: 'e.g. 25', 'aria-label': `Books to read in ${year}`, class: 'goal-input',
    });
    const save = () => ctx.actions.setGoal(profile, year, input.value);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    return h('div', { class: 'row goal-edit' },
      input,
      h('button', { class: 'btn small', type: 'button', onclick: save }, initial ? 'Save' : 'Set goal'),
      initial ? h('button', { class: 'btn secondary small', type: 'button',
        onclick: () => ctx.actions.setGoal(profile, year, 0) }, 'Remove goal') : null);
  };

  if (!g.target) {
    fill(section,
      h('div', { class: 'section-head' }, h('h2', { text: `${year} reading goal` }),
        h('span', { class: 'count', text: 'optional' })),
      h('p', { class: 'hint', text: `${plural(g.done, 'book')} finished in ${year} so far. Set a target and this tracks whether you are ahead or behind.` }),
      canWrite ? editor(null) : null);
    return section;
  }

  const pace = g.met ? `Goal reached${g.done > g.target ? ` — ${g.done - g.target} over` : ''} 🎉`
    : g.ahead > 0 ? `${plural(g.ahead, 'book')} ahead of schedule`
    : g.ahead < 0 ? `${plural(-g.ahead, 'book')} behind schedule`
    : 'Right on schedule';

  const body = h('div', {});
  const paint = (editing) => fill(body,
    h('div', { class: 'goal-bar', role: 'progressbar', 'aria-valuemin': '0',
      'aria-valuemax': String(g.target), 'aria-valuenow': String(g.done), 'aria-label': `${year} reading goal` },
      h('span', { class: 'goal-fill', style: `width:${Math.max(g.done ? 2 : 0, g.percent)}%` }),
      // Where a steady pace would have you by today.
      !g.met ? h('span', { class: 'goal-marker', style: `left:${Math.min(100, (g.expected / g.target) * 100)}%`, title: 'Where a steady pace would have you today' }) : null),
    h('div', { class: 'row goal-line' },
      h('strong', { text: `${g.done} of ${g.target} books` }),
      h('span', { class: `count ${g.ahead < 0 && !g.met ? 'behind' : ''}`, text: pace }),
      h('div', { class: 'spacer' }),
      canWrite && !editing ? h('button', { class: 'link-btn', type: 'button', onclick: () => paint(true) }, 'Change goal') : null),
    editing ? editor(g.target) : null);
  paint(false);

  section.append(h('div', { class: 'section-head' }, h('h2', { text: `${year} reading goal` })), body);
  return section;
}

/* ------------------------------------------------------------ year in books */

export function yearSection(ctx, profile) {
  const library = ctx.state.libraries[profile.id] ?? { books: [] };
  const years = recapYears(library);
  const section = h('section', { class: 'section recap' });

  if (!years.length) {
    const undated = (library.books ?? []).filter((b) => b.status === 'read').length;
    fill(section, h('h2', { text: 'Year in books' }),
      h('p', { class: 'empty', text: 'Once finished books have a read date, each year gets a recap here. A year on its own is enough.' }),
      undated && ctx.state.canWrite ? h('button', { class: 'btn secondary', type: 'button',
        onclick: () => ctx.actions.openDates(profile) }, `Add read dates for ${plural(undated, 'book')}`) : null);
    return section;
  }

  const body = h('div', {});
  let current = years[0];

  const picker = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Year' },
    years.slice(0, 6).map((y) => h('button', {
      class: 'seg-btn', type: 'button', role: 'tab', 'aria-selected': String(y === current),
      onclick: (e) => {
        current = y;
        [...e.currentTarget.parentElement.children]
          .forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget)));
        paint();
      },
    }, String(y))));

  function paint() {
    clear(body).append(recap(ctx, library, current));
  }
  paint();

  section.append(
    h('div', { class: 'section-head' }, h('h2', { text: 'Year in books' }), h('div', { class: 'spacer' }), picker),
    body);
  return section;
}

function recap(ctx, library, year) {
  const r = yearInBooks(library, year);
  const goal = goalProgress(library, year);
  const open = (book) => () => ctx.actions.openBook(book);

  const highlight = (label, book, detail) => book ? h('button', { class: 'hl', type: 'button', onclick: open(book) },
    coverEl(book),
    h('div', { class: 'book-main' },
      h('div', { class: 'k', text: label }),
      h('div', { class: 'book-title', text: book.title }),
      h('div', { class: 'book-meta', text: detail })) ) : null;

  const fact = (label, value, detail) => value ? h('div', { class: 'hl fact' },
    h('div', { class: 'book-main' },
      h('div', { class: 'k', text: label }),
      h('div', { class: 'book-title', text: value }),
      detail ? h('div', { class: 'book-meta', text: detail }) : null)) : null;

  const busiest = r.busiest
    ? fact(r.busiest.months.length > 1 ? 'Busiest months' : 'Busiest month',
        r.busiest.months.map((m) => MONTHS[m - 1]).join(', '), `${r.busiest.count} books${r.busiest.months.length > 1 ? ' each' : ''}`) : null;

  return h('div', { class: 'recap-body' },
    h('div', { class: 'stat-row recap-tiles' },
      tile(r.count, plural(r.count, 'book').replace(/^\d+ /, '')),
      tile(r.pages ? r.pages.toLocaleString() : '—', 'pages', r.pagesKnown < r.count ? `${r.pagesKnown} of ${r.count} have a page count` : null),
      tile(r.averageRating ? r.averageRating.toFixed(1) : '—', 'average rating'),
      goal.target ? tile(`${goal.done}/${goal.target}`, goal.met ? 'goal reached' : goal.finished ? 'goal missed' : 'goal so far') : null),

    h('div', { class: 'mosaic', 'aria-label': `Covers of the books read in ${year}` },
      r.books.map((b) => h('button', {
        class: 'mosaic-tile', type: 'button', onclick: open(b),
        title: `${b.title}${fmtReadOnShort(b.readOn ?? b.finished) ? ` — ${fmtReadOnShort(b.readOn ?? b.finished)}` : ''}`,
      }, coverEl(b)))),

    h('div', { class: 'highlights' },
      r.favourites.length ? highlight(
        r.favourites.length > 1 ? `Favourites (${r.favourites.length} at ${fmtRating(r.topRating)}★)` : 'Favourite',
        r.favourites[0],
        r.favourites.length > 1 ? `and ${r.favourites.slice(1, 3).map((b) => b.title).join(', ')}${r.favourites.length > 3 ? '…' : ''}` : authorNames(r.favourites[0])) : null,
      highlight('Longest', r.longest, r.longest ? `${r.longest.pages.toLocaleString()} pages` : ''),
      highlight('Shortest', r.shortest, r.shortest ? `${r.shortest.pages.toLocaleString()} pages` : ''),
      fact('Most-read author', r.topAuthor?.name, r.topAuthor ? plural(r.topAuthor.count, 'book') : null),
      fact('Most-read series', r.topSeries?.name, r.topSeries ? plural(r.topSeries.count, 'book') : null),
      fact('Top genres', r.genres.map((g) => g.tag).join(', ')),
      busiest,
      highlight('First of the year', r.first, r.first ? fmtReadOnShort(r.first.readOn ?? r.first.finished) : ''),
      highlight('Most recent', r.last, r.last ? fmtReadOnShort(r.last.readOn ?? r.last.finished) : '')),

    r.months ? h('div', { class: 'month-strip', 'aria-label': 'Books per month' },
      r.months.map((m) => h('div', { class: 'month', title: `${plural(m.count, 'book')} in ${MONTHS[m.month - 1]}` },
        h('div', { class: 'month-bar-wrap' },
          h('div', { class: `month-bar${m.count ? '' : ' zero'}`, style: `height:${m.count ? Math.max(8, (m.count / Math.max(...r.months.map((x) => x.count))) * 100) : 0}%` })),
        h('span', { text: MONTHS[m.month - 1][0] })))) : null,

    h('p', { class: 'hint', text: r.undated
      ? `Counts the ${plural(r.count, 'book')} with a read date in ${year}. ${plural(r.undated, 'finished book')} with no date can’t be placed in any year.`
      : `Every finished book has a read date, so this is the whole of ${year}.` }),
    r.undated && ctx.state.canWrite ? h('button', { class: 'btn secondary small', type: 'button',
      onclick: () => ctx.actions.openDates(ctx.currentProfile) }, 'Add read dates') : null);
}

function tile(n, label, footnote) {
  return h('div', { class: 'stat' },
    h('div', { class: 'n', text: String(n) }),
    h('div', { class: 'k', text: label }),
    footnote ? h('div', { class: 'k', style: 'opacity:.75', text: footnote }) : null);
}

/* ------------------------------------------------------- the two of you */

/** A small joint recap for the Both of us page. */
export function togetherYear(ctx, a, b) {
  const libA = ctx.state.libraries[a.id] ?? { books: [] };
  const libB = ctx.state.libraries[b.id] ?? { books: [] };
  const years = [...new Set([...recapYears(libA), ...recapYears(libB)])].sort((x, y) => y - x);
  if (!years.length) return null;
  const year = years[0];
  const ra = yearInBooks(libA, year);
  const rb = yearInBooks(libB, year);
  const idsB = new Set(rb.books.map((x) => x.id));
  const both = ra.books.filter((x) => idsB.has(x.id));

  const person = (p, r) => h('div', { class: 'stat' },
    h('div', { class: 'k', text: p.name }),
    h('div', { class: 'n', text: String(r.count) }),
    h('div', { class: 'k', text: `${plural(r.count, 'book').replace(/^\d+ /, '')}${r.pages ? ` · ${r.pages.toLocaleString()} pages` : ''}` }));

  return h('section', { class: 'section' },
    h('div', { class: 'section-head' },
      h('h2', { text: `Your ${year} together` }),
      h('span', { class: 'count', text: `${ra.count + rb.count} books between you` })),
    h('div', { class: 'stat-row' }, person(a, ra), person(b, rb),
      h('div', { class: 'stat' },
        h('div', { class: 'k', text: 'Read by both' }),
        h('div', { class: 'n', text: String(both.length) }),
        h('div', { class: 'k', text: both.length ? both.slice(0, 2).map((x) => x.title).join(', ') : 'nothing in common yet' }))),
    both.length ? h('div', { class: 'books' }, both.map((x) => {
      const other = rb.books.find((y) => y.id === x.id);
      return h('div', { class: 'book static' }, coverEl(x),
        h('div', { class: 'book-main' },
          h('div', { class: 'book-title', text: x.title }),
          h('div', { class: 'rating-pair' },
            h('div', { class: 'rating-line start' }, h('span', { class: 'who', text: a.name }), starsEl(x.rating, { empty: '—' })),
            h('div', { class: 'rating-line start' }, h('span', { class: 'who', text: b.name }), starsEl(other?.rating, { empty: '—' })))));
    })) : null);
}
