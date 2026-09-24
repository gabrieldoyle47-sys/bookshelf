/**
 * Recommendations: two sources of "read this next", side by side.
 *
 * Left, the books already out in series you read that are nowhere on your
 * shelf - the watcher knew about them all along but only ever talked about
 * the future. Right, books the other person sent you, with their note.
 */

import { h, fmtAgo, fmtRelease, authorNames, coverEl, starsEl, indigoLink } from './dom.js';
import { onShelfIds, today } from '../core/model.js';
import { nextInSeries } from '../core/watch.js';
import { frag, pageHead, plural } from './views.js';
import { openRelease } from './upcoming.js';

/** New recommendations waiting for an answer - the tab's badge. */
export const newRecCount = (library) =>
  (library?.recommendations ?? []).filter((r) => r.status === 'new').length;

export function recsView(ctx, profile) {
  const library = ctx.state.libraries[profile.id] ?? { books: [] };
  const others = ctx.state.profiles.filter((p) => p.id !== profile.id);
  const canWrite = ctx.state.canWrite;

  const sendBtn = others.length ? h('button', {
    class: 'btn', type: 'button', disabled: !canWrite,
    onclick: () => ctx.actions.openRecommend(profile),
  }, others.length === 1 ? `Recommend a book to ${others[0].name}` : 'Recommend a book') : null;

  return frag(
    pageHead(`Recommendations · ${profile.name}`, 'What to read next', sendBtn),
    h('div', { class: 'recs-columns' },
      seriesColumn(ctx, profile, library),
      sentToYouColumn(ctx, profile, library, others)));
}

/* ---------------------------------------------------- next in your series */

function seriesColumn(ctx, profile, library) {
  const groups = nextInSeries(ctx.state.seriesState, library, today());
  const total = groups.reduce((n, g) => n + g.books.length, 0);

  const head = h('div', { class: 'col-head' },
    h('h2', { text: 'Next in your series' }),
    h('span', { class: 'count', text: String(total) }));

  if (!groups.length) {
    return h('section', { class: 'recs-col' }, head,
      h('p', { class: 'col-sub', text: 'Books already out in series you read, that are not on your shelf.' }),
      h('p', { class: 'col-empty', text: Object.keys(ctx.state.seriesState).length
        ? 'You are caught up on every series you read.'
        : 'Nothing checked yet — press “Check for new releases” on the Upcoming tab.' }));
  }

  return h('section', { class: 'recs-col' }, head,
    h('p', { class: 'col-sub', text: 'Already out, in series you read, and not on your shelf yet.' }),
    h('div', { class: 'series-recs' }, groups.map((g) => {
      const main = g.books.filter((b) => !b.extra);
      const extras = g.books.filter((b) => b.extra);
      return h('div', { class: 'series-rec' },
        h('div', { class: 'series-rec-head' },
          h('strong', { text: g.name }),
          g.reached ? h('span', { class: 'count', text: `you’re at book ${g.reached}` }) : null,
          g.queued ? h('span', { class: 'count', text: `· book ${g.queued.position} is on your pile` }) : null),
        main.length ? h('div', { class: 'rec-rows' }, main.map((b) => seriesRow(ctx, profile, b, b === g.next, g.queued))) : null,
        extras.length ? h('details', { class: 'extras' },
          h('summary', { text: `${plural(extras.length, 'extra')} — novellas and companions` }),
          h('div', { class: 'rec-rows' }, extras.map((b) => seriesRow(ctx, profile, b, false)))) : null);
    })));
}

function seriesRow(ctx, profile, b, isNext, queued = null) {
  const year = b.releaseDate ? fmtRelease(b.releaseDate).date.replace('Sometime in ', '') : '';
  // The book itself opens the same panel as Upcoming, with its description.
  const open = () => openRelease(ctx, {
    bookId: b.bookId, title: b.title, image: b.image, releaseDate: b.releaseDate,
    seriesName: b.seriesName, position: b.position,
  }, null, { preview: true });
  return h('div', { class: `rec-row${isNext ? ' next' : ''}` },
    h('button', { class: 'rec-open', type: 'button', onclick: open, title: `About ${b.title}` },
      coverEl({ cover: b.image }),
      h('div', { class: 'book-main' },
        h('div', { class: 'book-title', text: b.title }),
        h('div', { class: 'book-meta', text: [
          b.position != null ? `Book ${b.position}` : null, year ? `out ${year}` : null,
        ].filter(Boolean).join(' · ') }),
        // With an earlier book already waiting on the pile, this one is not
        // what to read next - it is what to get once that one is done.
        isNext ? h('span', { class: 'pill soon', text: queued ? `after ${queued.title}` : 'read next' }) : null)),
    h('div', { class: 'rec-actions' },
      indigoLink({ title: b.title, authorName: b.authorName ?? seriesAuthorOf(ctx, b.seriesId) }, { className: 'shop-link compact' }),
      ctx.state.canWrite ? h('button', {
        class: 'btn small', type: 'button',
        onclick: async (e) => {
          e.currentTarget.disabled = true;
          if (!(await ctx.actions.addById(profile, b.bookId, b.title))) e.currentTarget.disabled = false;
        },
      }, '+ Want to read') : null,
      ctx.state.canWrite ? h('button', {
        class: 'icon-btn', type: 'button', title: 'Not interested',
        'aria-label': `Not interested in ${b.title}`,
        onclick: () => ctx.actions.hide(profile, b.bookId, b.title),
      }, '✕') : null));
}

/** The author of a series, from whichever shelf has a book in it - for the Indigo search. */
function seriesAuthorOf(ctx, seriesId) {
  for (const lib of Object.values(ctx.state.libraries)) {
    const book = (lib.books ?? []).find((x) => x.series?.id === seriesId);
    if (book) return authorNames(book);
  }
  return '';
}

/* ------------------------------------------------------ sent to you */

function sentToYouColumn(ctx, profile, library, others) {
  const recs = [...(library.recommendations ?? [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const fresh = recs.filter((r) => r.status === 'new');
  const answered = recs.filter((r) => r.status !== 'new');
  const nameOf = (id) => ctx.state.profiles.find((p) => p.id === id)?.name ?? id;

  const sent = [];
  for (const other of others) {
    const theirs = ctx.state.libraries[other.id] ?? { books: [] };
    for (const r of theirs.recommendations ?? []) {
      if (r.from === profile.id) sent.push({ ...r, to: other, theirs });
    }
  }
  sent.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  return h('section', { class: 'recs-col' },
    h('div', { class: 'col-head' },
      h('h2', { text: 'Recommended to you' }),
      h('span', { class: 'count', text: fresh.length ? `${fresh.length} new` : '0' })),
    h('p', { class: 'col-sub', text: others.length
      ? `Books ${others.map((o) => o.name).join(' and ')} thought you’d like.`
      : 'Recommendations from the other people on this shelf.' }),

    fresh.length
      ? h('div', { class: 'rec-cards' }, fresh.map((r) => recCard(ctx, profile, r, nameOf(r.from))))
      : h('p', { class: 'col-empty', text: others.length
          ? `Nothing waiting. ${others[0].name} can send you one from their Recommendations tab, or from any book on their shelf.`
          : 'Nothing waiting.' }),

    answered.length ? h('details', { class: 'optional' },
      h('summary', { text: `Earlier (${answered.length})` }),
      h('div', { class: 'rec-rows' }, answered.map((r) => {
        const onShelf = library.books.find((b) => b.hardcoverId === r.bookId);
        return h('div', { class: 'rec-row' },
          coverEl(r.book),
          h('div', { class: 'book-main' },
            h('div', { class: 'book-title', text: r.book.title }),
            h('div', { class: 'book-meta', text: `from ${nameOf(r.from)} · ${outcome(r, onShelf)}` })),
          onShelf?.rating ? starsEl(onShelf.rating) : null);
      }))) : null,

    sent.length ? h('details', { class: 'optional' },
      h('summary', { text: `You sent (${sent.length})` }),
      h('div', { class: 'rec-rows' }, sent.map((r) => {
        const onShelf = r.theirs.books.find((b) => b.hardcoverId === r.bookId);
        return h('div', { class: 'rec-row' },
          coverEl(r.book),
          h('div', { class: 'book-main' },
            h('div', { class: 'book-title', text: r.book.title }),
            h('div', { class: 'book-meta', text: `to ${r.to.name} · ${outcome(r, onShelf, r.to.name)}` })),
          onShelf?.rating ? starsEl(onShelf.rating) : null);
      }))) : null);
}

/** Where a recommendation ended up, in words. */
function outcome(rec, onShelf, who = 'you') {
  if (rec.status === 'new') return `sent ${fmtAgo(rec.at)} · not answered yet`;
  if (rec.status === 'dismissed') return 'passed on it';
  if (!onShelf) return 'added, since removed';
  return {
    tbr: 'on the to-read pile', reading: `${who === 'you' ? 'reading it now' : `${who} is reading it`}`,
    read: 'finished', abandoned: 'gave up on it',
  }[onShelf.status] ?? 'added';
}

function recCard(ctx, profile, r, fromName) {
  const book = r.book;
  const have = onShelfIds(ctx.state.libraries[profile.id]).has(r.bookId);
  return h('div', { class: 'rec-card' },
    h('button', { class: 'rec-card-main', type: 'button', onclick: () => ctx.actions.openBookPreview(book) },
      coverEl(book),
      h('div', { class: 'book-main' },
        h('div', { class: 'book-title', text: book.title }),
        h('div', { class: 'book-meta', text: [authorNames(book), book.series?.name ? `${book.series.name}${book.series.position != null ? ` #${book.series.position}` : ''}` : null].filter(Boolean).join(' · ') }),
        h('div', { class: 'rec-from', text: `From ${fromName} · ${fmtAgo(r.at)}` }),
        r.note ? h('blockquote', { class: 'rec-note', text: r.note }) : null)),
    h('div', { class: 'row end' },
      indigoLink(book, { className: 'shop-link' }),
      // Added some other way since it was sent: a disabled button with no
      // reason was a puzzle, so say it and let "Got it" file it away.
      ctx.state.canWrite && have ? h('span', { class: 'count', text: 'Already on your shelf' }) : null,
      ctx.state.canWrite ? h('button', { class: 'btn secondary small', type: 'button',
        onclick: (e) => { e.currentTarget.disabled = true; ctx.actions.answerRec(profile, r, have ? 'added' : 'dismissed'); } },
        have ? 'Got it' : 'No thanks') : null,
      ctx.state.canWrite && !have ? h('button', { class: 'btn small', type: 'button',
        onclick: (e) => { e.currentTarget.disabled = true; ctx.actions.answerRec(profile, r, 'added'); } }, '+ Want to read') : null));
}
