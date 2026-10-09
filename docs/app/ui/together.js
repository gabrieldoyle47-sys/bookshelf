/**
 * The group page ("Both of us" with two people, "Everyone" with more).
 *
 * The old page paired the first two profiles and nobody else. This one works
 * for any group, borrowing patterns that already work at scale:
 *   - Spotify Blend: a taste-match percentage for every pair, and choosing
 *     who is in the blend.
 *   - Goodreads Compare Books: books in common with everyone's rating.
 *   - Letterboxd: a friends' activity feed, and all your friends' ratings of
 *     a film side by side.
 *   - Strava club leaderboards: a friendly "this year" table.
 * "Viewing as" decides whose picks are shown - the one part of the page that
 * is about a single person.
 */

import { h, fill, fmtAgo, coverEl, starsEl, authorNames, seriesLabel } from './dom.js';
import { today } from '../core/model.js';
import {
  matchPairs, readTogether, picksFor, activity, genreGrid, yearBoard,
} from '../core/together.js';
import { frag, pageHead, emptyState, plural } from './views.js';

/** "Both of us" while there are two of you; "Everyone" once there are more. */
export const groupLabel = (profiles) => (profiles.length === 2 ? 'Both of us' : 'Everyone');

/** A person's initial on their colour - the same mark as the sidebar. */
export function avatar(p, { size = '' } = {}) {
  return h('span', {
    class: `avatar-chip ${size}`, title: p.name, 'aria-hidden': 'true',
    style: `background:${p.colour ?? 'var(--accent)'}`, text: (p.name ?? '?').slice(0, 1).toUpperCase(),
  });
}

const GROUP_KEY = 'bookshelf.group';
const VIEWER_KEY = 'bookshelf.viewer';
const session = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

export function togetherView(ctx) {
  const profiles = ctx.state.profiles;
  const label = groupLabel(profiles);
  if (profiles.length < 2) {
    return frag(pageHead(label),
      emptyState('This page compares people — add someone else with “+ Add a person” in the sidebar.'));
  }

  const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const libraries = ctx.state.libraries;

  // Who is in the comparison. Everyone by default; with three or more you can
  // narrow it to any two or more, like picking who is in a Blend.
  let group = (session.get(GROUP_KEY) ?? []).filter((id) => byId[id]);
  if (group.length < 2) group = profiles.map((p) => p.id);
  let viewer = ctx.state.viewer && group.includes(ctx.state.viewer) ? ctx.state.viewer : group[0];
  if (session.get(VIEWER_KEY) && group.includes(session.get(VIEWER_KEY))) viewer = session.get(VIEWER_KEY);

  const body = h('div', { class: 'tg' });
  const names = (ids) => {
    const n = ids.map((id) => byId[id].name);
    return n.length <= 2 ? n.join(' and ') : `${n.slice(0, -1).join(', ')} and ${n.at(-1)}`;
  };
  const sub = h('div', { class: 'sub' });

  function setGroup(next) {
    group = next;
    session.set(GROUP_KEY, group);
    if (!group.includes(viewer)) viewer = group[0];
    paint();
  }

  function paint() {
    sub.textContent = names(group);
    fill(body,
      profiles.length > 2 ? groupPicker() : null,
      h('div', { class: 'tg-top' }, matchSection(), activitySection()),
      togetherSection(),
      debateSection(),
      picksSection(),
      genreSection(),
      boardSection());
  }

  /* -- who's in -------------------------------------------------------- */
  function groupPicker() {
    return h('div', { class: 'tg-picker' },
      h('span', { class: 'k', text: 'Comparing' }),
      h('div', { class: 'row tg-chips', role: 'group', 'aria-label': 'Who to compare' }, profiles.map((p) => {
        const on = group.includes(p.id);
        return h('button', {
          class: 'tg-chip', type: 'button', 'aria-pressed': String(on),
          // Two is the smallest group there is anything to compare in.
          disabled: on && group.length <= 2,
          title: on && group.length <= 2 ? 'At least two people are needed to compare' : '',
          onclick: () => setGroup(on ? group.filter((id) => id !== p.id) : profiles.map((x) => x.id).filter((id) => id === p.id || group.includes(id))),
        }, avatar(p), p.name);
      })),
      group.length < profiles.length ? h('button', { class: 'link-btn', type: 'button',
        onclick: () => setGroup(profiles.map((p) => p.id)) }, 'Everyone') : null);
  }

  /* -- taste match ----------------------------------------------------- */
  function matchSection() {
    const pairs = matchPairs(libraries, group);
    const verdict = (s) => (s >= 75 ? 'Strong match' : s >= 55 ? 'Good match' : s >= 35 ? 'Some overlap' : 'Different tastes');
    return h('section', { class: 'section tg-match' },
      h('div', { class: 'section-head' }, h('h2', { text: 'Taste match' }),
        pairs.length > 1 ? h('span', { class: 'count', text: `${pairs.length} pairs` }) : null),
      h('div', { class: 'match-cards' }, pairs.map((m) => {
        const a = byId[m.a];
        const b = byId[m.b];
        const isWholeGroup = group.length === 2;
        return h(isWholeGroup ? 'div' : 'button', {
          class: 'match-card', ...(isWholeGroup ? {} : {
            type: 'button', title: `Compare just ${a.name} and ${b.name}`,
            onclick: () => setGroup([m.a, m.b]),
          }),
        },
          h('div', { class: 'match-faces' }, avatar(a, { size: 'lg' }), avatar(b, { size: 'lg' })),
          h('div', { class: 'match-main' },
            h('div', { class: 'match-names', text: `${a.name} & ${b.name}` }),
            h('div', { class: 'match-score' }, h('strong', { text: `${m.score}%` }), h('span', { text: verdict(m.score) })),
            h('div', { class: 'match-meter', 'aria-hidden': 'true' }, h('span', { style: `width:${m.score}%` })),
            h('div', { class: 'book-meta', text: [
              m.bothRead ? `${plural(m.bothRead, 'book')} both read` : 'No books both read yet',
              m.sharedGenres.length ? `both into ${m.sharedGenres.slice(0, 2).join(' and ')}` : null,
            ].filter(Boolean).join(' · ') })));
      })),
      h('p', { class: 'hint', text: 'From the genres you read and, once you have rated a few of the same books, whether you liked the same ones.' }));
  }

  /* -- activity -------------------------------------------------------- */
  function activitySection() {
    const items = activity(libraries, group, { limit: 12 });
    const VERB = {
      finished: 'finished', started: 'started', added: 'wants to read',
      recommended: 'recommended',
    };
    const open = (item) => () => (item.id === viewer && item.type !== 'recommended'
      ? ctx.actions.openBook(item.book, byId[item.id])
      : ctx.actions.openBookPreview(item.book));
    return h('section', { class: 'section tg-activity' },
      h('div', { class: 'section-head' }, h('h2', { text: 'Lately' })),
      items.length ? h('ol', { class: 'feed' }, items.map((it) => h('li', {},
        h('button', { class: 'feed-item', type: 'button', onclick: open(it) },
          avatar(byId[it.id]),
          h('span', { class: 'feed-text' },
            h('strong', { text: byId[it.id].name }), ` ${VERB[it.type]} `,
            h('em', { text: it.book.title }),
            it.type === 'recommended' ? ` to ${byId[it.to]?.name ?? 'someone'}` : null,
            it.rating ? h('span', { class: 'feed-stars' }, starsEl(it.rating)) : null),
          h('span', { class: 'feed-when', text: fmtAgo(it.at) })))))
        : emptyState('Nothing dated yet — finishing or starting a book shows up here.'));
  }

  /* -- books in common ------------------------------------------------- */
  const ratingsStrip = (readers) => h('div', { class: 'ratings-strip' }, readers.map((r) => h('span', {
    class: 'rs-item', title: `${byId[r.id].name}: ${r.rating ?? 'not rated'}`,
  }, avatar(byId[r.id]), starsEl(r.rating, { empty: '—' }))));

  const commonRow = (x) => h('div', { class: 'common-row' },
    h('button', { class: 'rec-open', type: 'button', onclick: () => ctx.actions.openBookPreview(x.book) },
      coverEl(x.book),
      h('div', { class: 'book-main' },
        h('div', { class: 'book-title', text: x.book.title }),
        h('div', { class: 'book-meta', text: [authorNames(x.book), seriesLabel(x.book)].filter(Boolean).join(' · ') }))),
    h('div', { class: 'common-side' },
      ratingsStrip(x.readers),
      x.average != null ? h('span', { class: 'count', text: `avg ${x.average.toFixed(1)}` }) : null));

  function togetherSection() {
    const common = readTogether(libraries, group);
    const shown = common.slice(0, 8);
    const list = h('div', { class: 'common-rows' }, shown.map(commonRow));
    return h('section', { class: 'section' },
      h('div', { class: 'section-head' },
        h('h2', { text: group.length === 2 ? 'Both read' : 'Read by more than one of you' }),
        h('span', { class: 'count', text: String(common.length) })),
      common.length ? list : emptyState(`Nothing ${group.length === 2 ? 'you have both' : 'two of you have'} finished yet.`),
      common.length > shown.length ? h('button', { class: 'btn secondary small', type: 'button',
        onclick: (e) => { fill(list, common.map(commonRow)); e.currentTarget.remove(); } },
        `Show all ${common.length}`) : null);
  }

  function debateSection() {
    const debates = readTogether(libraries, group).filter((x) => x.spread >= 2).sort((a, b) => b.spread - a.spread);
    return h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', { text: 'Where you disagree' }),
        h('span', { class: 'count', text: String(debates.length) })),
      debates.length ? h('div', { class: 'common-rows' }, debates.slice(0, 6).map(commonRow))
        : emptyState('No real debates — every shared book is rated within two stars.'));
  }

  /* -- picks for the viewer -------------------------------------------- */
  function picksSection() {
    const me = byId[viewer];
    const picks = picksFor(viewer, libraries, group, 10);
    const others = group.filter((id) => id !== viewer);
    return h('section', { class: 'section' },
      h('div', { class: 'section-head tg-picks-head' },
        h('h2', { text: `Loved by ${others.length === 1 ? byId[others[0]].name : 'the others'}, not on ${me.name}’s shelf` }),
        h('div', { class: 'spacer' }),
        h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Viewing as' }, group.map((id) => h('button', {
          class: 'seg-btn', type: 'button', role: 'tab', 'aria-selected': String(id === viewer),
          onclick: () => { viewer = id; session.set(VIEWER_KEY, id); paint(); },
        }, byId[id].name)))),
      picks.length ? h('div', { class: 'rec-rows picks' }, picks.map((x) => h('div', { class: 'rec-row' },
        h('button', { class: 'rec-open', type: 'button', onclick: () => ctx.actions.openBookPreview(x.book) },
          coverEl(x.book),
          h('div', { class: 'book-main' },
            h('div', { class: 'book-title', text: x.book.title }),
            h('div', { class: 'book-meta', text: authorNames(x.book) }),
            h('div', { class: 'lovers' }, x.lovers.map((l) => h('span', { class: 'rs-item' }, avatar(byId[l.id]), starsEl(l.rating)))))),
        ctx.state.canWrite ? h('div', { class: 'rec-actions' }, h('button', {
          class: 'btn small', type: 'button', 'aria-label': `Add ${x.book.title} to ${me.name}'s want-to-read pile`,
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            if (!(await ctx.actions.addById(me, x.book.hardcoverId, x.book.title))) e.currentTarget.disabled = false;
          },
        }, `+ ${me.name}`)) : null)))
        : emptyState(`Nothing rated 4★ or more by the others that ${me.name} is missing.`));
  }

  /* -- genre map ------------------------------------------------------- */
  function genreSection() {
    const grid = genreGrid(libraries, group, 8);
    if (grid.genres.length < 3) return null;
    return h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', { text: 'What each of you reads' })),
      h('div', { class: 'genre-map', style: `--cols:${group.length}` },
        h('div', { class: 'gm-corner' }),
        group.map((id) => h('div', { class: 'gm-person', title: byId[id].name }, avatar(byId[id]), h('span', { text: byId[id].name }))),
        grid.genres.flatMap((g, gi) => [
          h('div', { class: 'gm-genre', title: g, text: g }),
          ...group.map((id) => {
            const n = grid.counts[id][gi];
            return h('div', {
              class: `gm-cell${n ? '' : ' zero'}`, title: `${byId[id].name}: ${plural(n, 'book')} of ${g}`,
              style: `--p:${n / grid.max};--c:${byId[id].colour}`,
            }, n ? String(n) : '·');
          }),
        ])),
      h('p', { class: 'hint', text: 'Genres come from Hardcover readers, so they are opinions rather than a catalogue.' }));
  }

  /* -- this year ------------------------------------------------------- */
  function boardSection() {
    const year = Number(today().slice(0, 4));
    const board = yearBoard(libraries, group, year);
    const top = Math.max(1, ...board.map((r) => r.books));
    const total = board.reduce((s, r) => s + r.books, 0);
    return h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', { text: `${year} so far` }),
        h('span', { class: 'count', text: `${plural(total, 'book')} between you` })),
      h('ol', { class: 'board' }, board.map((r, i) => h('li', { class: 'board-row' },
        h('span', { class: 'board-rank', text: String(i + 1) }),
        avatar(byId[r.id]),
        h('span', { class: 'board-name', text: byId[r.id].name }),
        h('span', { class: 'board-bar' }, h('span', { style: `width:${(r.books / top) * 100}%;background:${byId[r.id].colour}` })),
        h('span', { class: 'board-n', text: `${plural(r.books, 'book')}${r.pages ? ` · ${r.pages.toLocaleString()} pp` : ''}` })))),
      h('p', { class: 'hint', text: 'Counts books with a read date this year.' }));
  }

  paint();
  return frag(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: label }), sub)),
    body);
}
