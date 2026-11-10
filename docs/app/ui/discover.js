/**
 * More ways to find a book, on the Recommendations page:
 *
 *   "Because you loved…" - a chip for each five-star book; picking one shows
 *   a row of books like it. One row at a time, so a reader with forty
 *   five-star books gets forty small chips, not forty rows.
 *
 *   "Find a new book" - search by title or author, browse by vibe (Hardcover's
 *   mood tags), or go through an award list.
 *
 * Results are kept for the visit per person, so a save that redraws the page
 * does not throw them away.
 */

import { emptyNote } from './art.js';
import { h, coverEl } from './dom.js';
import { cleanTags, onShelfIds } from '../core/model.js';
import { becauseYouLoved, vibeMatches } from '../core/suggest.js';
import { AWARD_LISTS } from '../core/hardcover.js';
import { carousel } from './carousel.js';

const memo = new Map();
const stateFor = (profile) => {
  if (!memo.has(profile.id)) memo.set(profile.id, { loved: null, showAllLoved: false, tab: 'search', query: '', moods: [], list: null, results: {} });
  return memo.get(profile.id);
};

const skeleton = () => carousel(Array.from({ length: 5 }, () => h('div', { class: 'sg-card sk-card-skeleton' },
  h('div', { class: 'sk sg-sk-cover' }), h('div', { class: 'sk sk-line' }), h('div', { class: 'sk sk-line short' }))), { className: 'suggest-row' });

/** A row of results in any state: loading, failed, empty or ready. */
function resultRow(ctx, profile, r, card, emptyText) {
  if (!r) return null;
  if (r.status === 'loading') return skeleton();
  if (r.status === 'error') return h('p', { class: 'hint error', text: r.error });
  const have = onShelfIds(ctx.state.libraries[profile.id]);
  const items = r.items.filter((s) => !have.has(String(s.book.id)));
  if (!items.length) return emptyNote(emptyText, 'compass');
  return h('div', {}, r.note ? h('p', { class: 'hint find-note', text: r.note }) : null,
    carousel(items.map((s) => card(ctx, profile, s)), { className: 'suggest-row' }));
}

/* ---------------------------------------------------------- because you loved */

export function becauseSection(ctx, profile, library, card, redraw) {
  const st = stateFor(profile);
  let seeds = (library.books ?? []).filter((b) => b.status === 'read' && b.rating >= 5);
  // No five-star books yet: the four-and-a-halfs will do.
  if (!seeds.length) seeds = (library.books ?? []).filter((b) => b.status === 'read' && b.rating >= 4.5);
  if (!seeds.length) return null;
  seeds.sort((a, b) => String(b.finished ?? b.readOn ?? '').localeCompare(String(a.finished ?? a.readOn ?? '')));
  const SHOW = 8;
  const shown = st.showAllLoved ? seeds : seeds.slice(0, SHOW);

  const pick = async (seed) => {
    if (st.loved?.seedId === seed.id) { st.loved = null; return redraw(); }
    st.loved = { seedId: seed.id, status: 'loading' };
    redraw();
    try {
      const genres = cleanTags(seed.genres, 6).slice(0, 3);
      const author = seed.authors?.[0]?.id;
      const [byGenre, byAuthor] = await Promise.all([
        genres.length ? ctx.actions.discover(genres) : [],
        author ? ctx.actions.fetchAuthor(author).then((a) => a?.books ?? []).catch(() => []) : [],
      ]);
      if (st.loved?.seedId !== seed.id) return;
      st.loved = { seedId: seed.id, status: 'ready', items: becauseYouLoved(seed, [...byGenre, ...byAuthor], ctx.state.libraries[profile.id] ?? library) };
    } catch (err) {
      if (st.loved?.seedId === seed.id) st.loved = { seedId: seed.id, status: 'error', error: err.message };
    }
    redraw();
  };

  const seed = seeds.find((b) => b.id === st.loved?.seedId);
  return h('section', { class: 'section loved' },
    h('div', { class: 'eyebrow', text: 'Because you loved' }),
    h('h2', { text: seeds[0].rating >= 5 ? 'More like your five-star books' : 'More like your favourites' }),
    h('div', { class: 'loved-chips', role: 'group', 'aria-label': 'Pick a book' },
      shown.map((b) => h('button', {
        class: 'loved-chip', type: 'button', 'aria-pressed': String(b.id === st.loved?.seedId),
        title: `Books like ${b.title}`, onclick: () => pick(b),
      }, coverEl(b), h('span', { text: b.title }))),
      seeds.length > SHOW ? h('button', { class: 'loved-more', type: 'button', onclick: () => { st.showAllLoved = !st.showAllLoved; redraw(); } },
        st.showAllLoved ? 'Fewer' : `+${seeds.length - SHOW} more`) : null),
    seed ? h('div', { class: 'loved-result' },
      h('p', { class: 'col-sub' }, 'Because you loved ', h('em', { text: seed.title })),
      resultRow(ctx, profile, st.loved, card, 'Nothing new turned up like this one — try another.'))
      : h('p', { class: 'hint', text: 'Pick a book to see others like it.' }));
}

/* ----------------------------------------------------------- find a new book */

// Hardcover's mood tags, spelled as Hardcover stores them.
const VIBES = [['Adventurous', 'Adventurous'], ['dark', 'Dark'], ['emotional', 'Emotional'], ['funny', 'Funny'],
  ['hopeful', 'Hopeful'], ['inspiring', 'Inspiring'], ['lighthearted', 'Lighthearted'], ['mysterious', 'Mysterious'],
  ['reflective', 'Reflective'], ['relaxing', 'Relaxing'], ['sad', 'Sad'], ['tense', 'Tense'], ['challenging', 'Challenging']];
const TABS = [['search', 'Search'], ['vibe', 'By vibe'], ['awards', 'Award lists']];

export function findSection(ctx, profile, library, card, redraw) {
  const st = stateFor(profile);
  const run = async (key, work, note = null) => {
    st.results[key] = { status: 'loading' };
    redraw();
    try {
      const items = await work();
      st.results[key] = { status: 'ready', items, note: typeof note === 'function' ? note(items) : note };
    } catch (err) {
      st.results[key] = { status: 'error', error: err.message };
    }
    redraw();
  };

  let panel;
  if (st.tab === 'search') {
    const input = h('input', { type: 'search', value: st.query, placeholder: 'A title or an author', 'aria-label': 'Search for a book', class: 'find-input' });
    panel = h('div', {},
      h('form', { class: 'row find-form', onsubmit: (e) => {
        e.preventDefault();
        st.query = input.value.trim();
        if (st.query) run('search', async () => (await ctx.actions.searchBooks(st.query, 16)).map((b) => ({ book: b, match: null, reasons: [] })));
      } }, input, h('button', { class: 'btn', type: 'submit' }, 'Search')),
      resultRow(ctx, profile, st.results.search, card, 'Nothing found that is not already on the shelf.'));
  } else if (st.tab === 'vibe') {
    panel = h('div', {},
      h('div', { class: 'vibe-chips', role: 'group', 'aria-label': 'Pick up to three' }, VIBES.map(([tag, label]) => h('button', {
        class: 'vibe-chip', type: 'button', 'aria-pressed': String(st.moods.includes(tag)),
        onclick: () => {
          st.moods = st.moods.includes(tag) ? st.moods.filter((m) => m !== tag) : [...st.moods, tag].slice(-3);
          redraw();
        },
      }, label))),
      h('div', { class: 'row find-form' },
        h('span', { class: 'hint', text: st.moods.length ? `Feeling ${st.moods.map((m) => m.toLowerCase()).join(' + ')}` : 'Pick up to three.' }),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn', type: 'button', disabled: !st.moods.length,
          onclick: () => run('vibe', async () => vibeMatches(await ctx.actions.fetchMoods(st.moods), st.moods, ctx.state.libraries[profile.id] ?? library)) },
        'Find books')),
      resultRow(ctx, profile, st.results.vibe, card, 'Nothing new with that mix — try fewer moods.'));
  } else {
    panel = h('div', {},
      h('div', { class: 'award-grid' }, AWARD_LISTS.map((l) => h('button', {
        class: 'award-card', type: 'button', 'aria-pressed': String(st.list === l.id),
        onclick: () => {
          st.list = l.id;
          run('awards', async () => {
            const list = await ctx.actions.fetchList(l.id);
            // Hardcover keeps these lists in date order; the most read come first here.
            return (list?.books ?? [])
              .sort((x, y) => (y.usersCount ?? 0) - (x.usersCount ?? 0))
              .map((b) => ({ book: b, match: null, reasons: [[l.name, b.releaseYear].filter(Boolean).join(' · ')] }));
          }, (items) => {
            const have = onShelfIds(ctx.state.libraries[profile.id]);
            const n = items.filter((s) => have.has(String(s.book.id))).length;
            return `Most read first.${n ? ` ${profile.name} has ${n} of these already, so they are left out.` : ''}`;
          });
        },
      }, h('span', { class: 'award-medal', 'aria-hidden': 'true' }), h('strong', { text: l.name }), h('span', { text: l.blurb })))),
      resultRow(ctx, profile, st.results.awards, card, 'Every book on this list is already on the shelf.'));
  }

  return h('section', { class: 'section find' },
    h('div', { class: 'section-head' }, h('h2', { text: 'Find a new book' })),
    h('div', { class: 'seg find-tabs', role: 'tablist', 'aria-label': 'How to look' }, TABS.map(([id, label]) => h('button', {
      class: 'seg-btn', type: 'button', role: 'tab', 'aria-selected': String(st.tab === id),
      onclick: () => { st.tab = id; redraw(); },
    }, label))),
    panel);
}
