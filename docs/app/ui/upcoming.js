/**
 * Upcoming: what is coming out, for one person or for everyone.
 *
 * Two columns, because they answer different questions. The left is what you
 * are definitely waiting for - the next book in a series you read, or a book
 * you asked to track. The right is a suggestion: forthcoming books by authors
 * you read, outside any series you already follow. Keeping them apart stops
 * a speculative 2031 title crowding out the book you are counting down to.
 *
 * Every card opens a panel with everything known about the book so far, and
 * can be hidden if you do not care about it.
 */

import {
  h, clear, fill, fmtDate, fmtRelease, fmtAgo, authorNames, coverEl, toast, isPlaceholderDate,
} from './dom.js';
import { deriveWatchlist, hiddenIds, onShelfIds, today } from '../core/model.js';
import { upcomingFrom, authorUpcoming, trackedUpcoming } from '../core/watch.js';
import { frag, pageHead, plural } from './views.js';

const seriesCount = (n) => `${n} series`;

/* ------------------------------------------------------------ gathering */

/** Everything one person is waiting for, split into the two columns. */
export function upcomingFor(ctx, profile) {
  const { seriesState, authorState, bookState } = ctx.state;
  const library = ctx.state.libraries[profile.id] ?? { books: [] };
  const hidden = hiddenIds(library);
  const have = onShelfIds(library);
  const now = today();

  const series = upcomingFrom(seriesState, Object.keys(deriveWatchlist(library).series), now)
    .filter((b) => !hidden.has(b.bookId) && !have.has(b.bookId))
    .map((b) => ({ ...b, authorName: seriesAuthor(ctx, b.seriesId) }));

  // Tracked books stay listed a fortnight past release, so "it's out" is seen
  // rather than the book silently vanishing on the day.
  const tracked = trackedUpcoming(bookState, library, now)
    .filter((b) => b.daysUntil == null || b.daysUntil >= -14)
    .filter((b) => !have.has(b.bookId));

  const inSeries = new Set(series.map((b) => b.bookId));
  const waiting = [...series, ...tracked.filter((b) => !inSeries.has(b.bookId))]
    .sort(byDate);

  const authors = authorUpcoming(authorState, library, seriesState, now);

  const hiddenList = Object.entries(library.hidden ?? {})
    .map(([bookId, v]) => ({ bookId, title: v.title, at: v.at }));

  return { waiting, authors, hiddenList };
}

const byDate = (a, b) => (a.daysUntil ?? 1e9) - (b.daysUntil ?? 1e9);

/** The next release with a real date - a countdown to "sometime in 2027" is no countdown. */
const soonest = (items) => items.find((b) => b.daysUntil != null && b.daysUntil >= 0 && !isPlaceholderDate(b.releaseDate)) ?? null;

/** The author a series belongs to, from whoever's shelf has a book in it. */
function seriesAuthor(ctx, seriesId) {
  for (const lib of Object.values(ctx.state.libraries)) {
    const book = (lib.books ?? []).find((b) => b.series?.id === seriesId);
    if (book) return authorNames(book);
  }
  return '';
}

/* ------------------------------------------------------------------ view */

export function upcomingView(ctx, profile) {
  const library = ctx.state.libraries[profile.id] ?? { books: [] };
  const watched = Object.values(deriveWatchlist(library).series);
  const { waiting, authors, hiddenList } = upcomingFor(ctx, profile);

  const unchecked = watched.filter((s) => !ctx.state.seriesState[s.id]).length;

  const refresh = h('button', {
    class: 'btn secondary', type: 'button', id: 'refresh-btn',
    disabled: !ctx.state.canWrite,
    onclick: (e) => ctx.actions.checkNow(e.currentTarget),
  }, 'Check for new releases');

  const sub = [
    seriesCount(watched.length),
    (library.tracked ?? []).length ? `${library.tracked.length} tracked` : null,
    'checked daily',
  ].filter(Boolean).join(' · ');

  const card = (item) => releaseCard(item, ctx, profile);

  return frag(
    pageHead(`Upcoming · ${profile.name}`, sub, refresh),
    trackSearch(ctx, profile),
    unchecked > 0 ? h('p', { class: 'notice',
      text: `${unchecked} of your series ${unchecked === 1 ? 'has' : 'have'} not been checked yet — press “Check for new releases”.` }) : null,
    nextUp(soonest(waiting), ctx, profile),
    h('div', { class: 'up-columns' },
      upColumn('Waiting for', 'Your series and books you track', waiting, card,
        watched.length
          ? 'Nothing dated yet. Announced dates appear here as soon as the daily check finds them.'
          : 'Start or finish a book in a series and its next book shows up here.'),
      upColumn('From authors you read', 'Outside the series you follow', authors, card,
        'Nothing announced by the authors you read — this fills in after the next check.')),
    hiddenList.length ? h('details', { class: 'optional' },
      h('summary', { text: `${plural(hiddenList.length, 'hidden book')}` }),
      h('div', { class: 'hidden-list' }, hiddenList.map((x) => h('div', { class: 'hidden-row' },
        h('span', { text: x.title ?? 'Untitled' }),
        h('button', {
          class: 'btn secondary small', type: 'button', disabled: !ctx.state.canWrite,
          onclick: () => ctx.actions.unhide(profile, x.bookId, x.title),
        }, 'Show again'))))) : null,
    watched.length ? h('details', { class: 'optional' },
      h('summary', { text: `Watching ${seriesCount(watched.length)}` }),
      h('ul', {}, watched.map((s) => h('li', { text: s.name })))) : null);
}

export function allUpcomingView(ctx) {
  // One card per book, tagged with everyone waiting for it.
  const merge = (lists) => {
    const byBook = new Map();
    for (const [profile, items] of lists) {
      for (const item of items) {
        if (!byBook.has(item.bookId)) byBook.set(item.bookId, { ...item, who: [] });
        byBook.get(item.bookId).who.push(profile);
      }
    }
    return [...byBook.values()].sort(byDate);
  };

  const per = ctx.state.profiles.map((p) => [p, upcomingFor(ctx, p)]);
  const waiting = merge(per.map(([p, u]) => [p, u.waiting]));
  const waitingIds = new Set(waiting.map((b) => b.bookId));
  // A book one person waits for is not a "suggestion" for the other.
  const authors = merge(per.map(([p, u]) => [p, u.authors])).filter((b) => !waitingIds.has(b.bookId));

  const card = (item) => releaseCard(item, ctx, null);

  return frag(
    pageHead('All upcoming', 'Everyone’s series, tracked books and favourite authors'),
    nextUp(soonest(waiting), ctx, null),
    h('div', { class: 'up-columns' },
      upColumn('Waiting for', 'Series and tracked books', waiting, card, 'Nothing dated yet across any profile.'),
      upColumn('From authors you read', 'Outside the series you follow', authors, card, 'Nothing announced yet.')));
}

/* -------------------------------------------------------------- columns */

/**
 * A column split into time bands. "Later" folds away when it is long - five
 * placeholder Stormlight titles a decade out should not bury next month.
 */
function upColumn(title, sub, items, card, emptyText) {
  // A year-only date ("2027") could mean any month of it, so it never claims
  // a place in the near bands.
  const known = (i) => i.daysUntil != null && !isPlaceholderDate(i.releaseDate);
  const bands = [
    ['Next 30 days', (i) => known(i) && i.daysUntil <= 30],
    ['Next six months', (i) => known(i) && i.daysUntil > 30 && i.daysUntil <= 183],
    ['Later', (i) => !known(i) || i.daysUntil > 183],
  ];
  const head = h('div', { class: 'col-head' },
    h('h2', { text: title }),
    h('span', { class: 'count', text: String(items.length) }));

  if (!items.length) {
    return h('section', { class: 'up-col' }, head, h('p', { class: 'col-sub', text: sub }),
      h('p', { class: 'col-empty', text: emptyText }));
  }

  const body = bands.map(([label, test]) => {
    const inBand = items.filter(test);
    if (!inBand.length) return null;
    const list = h('div', { class: 'rcards' }, inBand.map(card));
    if (label === 'Later' && inBand.length > 4) {
      return h('details', { class: 'band' },
        h('summary', { class: 'band-head' }, label, h('span', { class: 'count', text: ` ${inBand.length}` })),
        list);
    }
    return h('div', { class: 'band' },
      h('div', { class: 'band-head' }, label, h('span', { class: 'count', text: ` ${inBand.length}` })),
      list);
  });

  return h('section', { class: 'up-col' }, head, h('p', { class: 'col-sub', text: sub }), body);
}

/** The soonest thing anyone is waiting for, given room to breathe. */
function nextUp(item, ctx, profile) {
  if (!item) return null;
  const when = fmtRelease(item.releaseDate);
  return h('button', {
    class: 'next-up', type: 'button',
    onclick: () => openRelease(ctx, item, profile),
  },
    coverEl({ cover: item.image }),
    h('div', { class: 'next-up-main' },
      h('div', { class: 'eyebrow', text: 'Next up' }),
      h('div', { class: 'next-up-title', text: item.title }),
      h('div', { class: 'book-meta', text: subline(item) }),
      item.who ? people(item.who) : null),
    h('div', { class: 'next-up-when' },
      h('strong', { text: when.countdown ?? when.date }),
      when.countdown ? h('span', { text: when.date }) : null));
}

const subline = (item) => [
  item.seriesName ? `${item.seriesName}${item.position != null ? ` #${item.position}` : ''}` : null,
  item.authorName || null,
].filter(Boolean).join(' · ');

const people = (who) => h('div', { class: 'row who' }, who.map((p) =>
  h('span', { class: 'pill person', style: `--who:${p.colour}`, text: p.name })));

/** One release. The hide button is its own control, not nested in the card's. */
function releaseCard(item, ctx, profile) {
  const when = fmtRelease(item.releaseDate);
  const soon = item.daysUntil != null && item.daysUntil <= 30;
  const tag = item.source === 'tracked' ? 'tracked'
    : item.position != null && !Number.isInteger(item.position) ? 'novella' : null;

  return h('div', { class: `rcard${soon ? ' soon' : ''}` },
    h('button', {
      class: 'rcard-main', type: 'button',
      onclick: () => openRelease(ctx, item, profile),
    },
      coverEl({ cover: item.image }),
      h('div', { class: 'book-main' },
        h('div', { class: 'book-title', text: item.title }),
        h('div', { class: 'book-meta', text: subline(item) }),
        h('div', { class: 'rcard-when' },
          h('span', { text: when.date }),
          when.countdown ? h('span', { class: `pill ${item.daysUntil <= 0 ? 'today' : soon ? 'soon' : ''}`, text: when.countdown }) : null,
          tag ? h('span', { class: 'pill', text: tag }) : null),
        item.who ? people(item.who) : null)),
    profile && ctx.state.canWrite ? h('button', {
      class: 'rcard-hide', type: 'button',
      title: item.source === 'tracked' ? 'Stop tracking' : 'Hide from upcoming',
      'aria-label': `${item.source === 'tracked' ? 'Stop tracking' : 'Hide'} ${item.title}`,
      onclick: () => (item.source === 'tracked'
        ? ctx.actions.untrack(profile, item.bookId, item.title)
        : ctx.actions.hide(profile, item.bookId, item.title)),
    }, '✕') : null);
}

/* --------------------------------------------------------- track search */

/**
 * Follow a release that nothing on your shelf would ever lead to - a new
 * author, a friend's recommendation. Results say whether a book is already
 * out, since tracking something published in 2019 would wait forever.
 */
function trackSearch(ctx, profile) {
  if (!ctx.state.canWrite) return null;
  const library = ctx.state.libraries[profile.id] ?? { books: [] };
  const tracked = new Set((library.tracked ?? []).map((t) => String(t.bookId)));
  const have = onShelfIds(library);

  const results = h('div', { class: 'track-results' });
  const hint = h('p', { class: 'hint track-hint' });
  let timer = null;
  let seq = 0;

  const run = async (query) => {
    clear(results);
    if (query.length < 3) { hint.textContent = ''; return; }
    const mine = ++seq;
    hint.textContent = 'Searching…';
    try {
      const hits = await ctx.actions.searchBooks(query, 8);
      if (mine !== seq) return;
      hint.textContent = hits.length ? '' : `Hardcover has nothing for “${query}”.`;
      const now = today();
      // Forthcoming first: that is what someone searching here is after.
      hits.sort((a, b) => Number(isOut(a, now)) - Number(isOut(b, now)));
      for (const hit of hits) {
        const out = isOut(hit, now);
        const when = hit.releaseDate ? fmtRelease(hit.releaseDate) : null;
        const state = have.has(hit.id) ? 'On your shelf'
          : tracked.has(hit.id) ? 'Tracking' : null;
        results.append(h('div', { class: 'track-hit' },
          coverEl({ cover: hit.image }),
          h('div', { class: 'book-main' },
            h('div', { class: 'book-title', text: hit.title }),
            h('div', { class: 'book-meta', text: [authorNames(hit), hit.series?.name].filter(Boolean).join(' · ') }),
            h('div', { class: 'book-meta', text: out
              ? `Already out${hit.releaseYear ? ` · ${hit.releaseYear}` : ''}`
              : when ? `${when.date}${when.countdown ? ` · ${when.countdown}` : ''}` : 'No date announced yet' })),
          state
            ? h('span', { class: 'pill', text: state })
            : out
              ? h('button', { class: 'btn secondary small', type: 'button',
                  onclick: () => ctx.actions.addHit(profile, hit) }, 'Want to read')
              : h('button', { class: 'btn small', type: 'button',
                  onclick: () => ctx.actions.track(profile, hit) }, 'Track')));
      }
    } catch (err) {
      if (mine === seq) hint.textContent = err.message;
    }
  };

  const input = h('input', {
    type: 'search', class: 'track-input',
    placeholder: 'Track any upcoming book — search by title or author…',
    'aria-label': 'Search for a book to track', autocomplete: 'off', spellcheck: 'false',
    oninput: (e) => {
      clearTimeout(timer);
      // Hardcover's burst limit is 10 calls, so wait for a pause in typing.
      timer = setTimeout(() => run(e.target.value.trim()), 350);
    },
  });

  return h('div', { class: 'track' }, input, hint, results);
}

const isOut = (hit, now) =>
  hit.releaseDate ? hit.releaseDate <= now : Boolean(hit.releaseYear && hit.releaseYear < Number(now.slice(0, 4)));

/* --------------------------------------------------------- detail panel */

const detailCache = new Map();

/**
 * Hardcover's full record for one book, fetched once per page load. Shared
 * by the detail panel and the recommend dialog, so opening a book in one and
 * then the other costs a single request.
 */
export function loadDetails(ctx, bookId) {
  const id = String(bookId).replace(/^hc:/, '');
  if (!detailCache.has(id)) {
    const pending = ctx.actions.fetchBooks([id]).then(([d]) => d ?? null);
    // A failed request should be retried next time, not remembered.
    pending.catch(() => detailCache.delete(id));
    detailCache.set(id, pending);
  }
  return detailCache.get(id);
}

/**
 * Everything known about a forthcoming book.
 *
 * Opens at once with what the watcher already has, then fills in the
 * description and the rest from Hardcover - a panel that waited on the
 * network before showing anything would feel broken on a phone.
 */
export function openRelease(ctx, item, profile, { preview = false } = {}) {
  const dialog = document.getElementById('release-dialog');
  document.getElementById('release-title').textContent = item.title;
  const body = clear(document.getElementById('release-body'));
  const library = profile ? ctx.state.libraries[profile.id] ?? { books: [] } : null;

  const extra = h('div', { class: 'release-extra' }, h('p', { class: 'hint', text: 'Loading details from Hardcover…' }));
  const coverSlot = h('div', { class: 'release-cover' }, coverEl({ cover: item.image }));
  const metaSlot = h('div', { class: 'book-main' });
  const when = fmtRelease(item.releaseDate);

  const paintMeta = (d = {}) => fill(metaSlot,
    h('div', { class: 'book-meta', text: authorNames(d.authors ? d : { authors: [] }) || item.authorName || '' }),
    item.seriesName || d.series?.name ? h('div', { class: 'book-meta', text:
      `${d.series?.name ?? item.seriesName}${(d.series?.position ?? item.position) != null ? ` · book ${d.series?.position ?? item.position}` : ''}` }) : null,
    d.publisher ? h('div', { class: 'book-meta', text: d.publisher }) : null,
    d.pages ? h('div', { class: 'book-meta', text: `${d.pages} pages` }) : null,
    h('div', { class: 'release-date' },
      h('strong', { text: when.date }),
      when.countdown && !preview ? h('span', { class: `pill ${item.daysUntil != null && item.daysUntil <= 30 ? 'soon' : ''}`, text: when.countdown }) : null),
    isPlaceholderDate(item.releaseDate)
      ? h('div', { class: 'hint', text: 'Hardcover only knows the year so far.' }) : null);
  paintMeta();

  const actions = h('div', { class: 'row end release-actions' });
  if (profile && ctx.state.canWrite && !preview) {
    const onShelf = onShelfIds(library).has(item.bookId);
    const isTracked = (library.tracked ?? []).some((t) => String(t.bookId) === item.bookId);
    const isHidden = hiddenIds(library).has(item.bookId);
    fill(actions,
      isTracked ? h('button', { class: 'btn secondary', type: 'button',
        onclick: () => { dialog.close(); ctx.actions.untrack(profile, item.bookId, item.title); } }, 'Stop tracking') : null,
      isHidden
        ? h('button', { class: 'btn secondary', type: 'button',
            onclick: () => { dialog.close(); ctx.actions.unhide(profile, item.bookId, item.title); } }, 'Show in upcoming again')
        : !isTracked ? h('button', { class: 'btn secondary', type: 'button',
            onclick: () => { dialog.close(); ctx.actions.hide(profile, item.bookId, item.title); } }, 'Hide from upcoming') : null,
      onShelf
        ? h('span', { class: 'pill', text: `On ${profile.name}'s shelf` })
        : h('button', { class: 'btn', type: 'button',
            onclick: async (e) => {
              e.currentTarget.disabled = true;
              if (await ctx.actions.addById(profile, item.bookId, item.title)) dialog.close();
              else e.currentTarget.disabled = false;
            } }, 'Add to want to read'));
  }

  fill(body,
    h('div', { class: 'release-top' }, coverSlot, metaSlot),
    preview ? null : history(ctx, item, profile),
    extra,
    actions);
  dialog.showModal();

  const showDetails = (d) => {
    if (!d) { clear(extra).append(h('p', { class: 'hint', text: 'Hardcover has no more detail on this one yet.' })); return; }
    if (d.image && !item.image) clear(coverSlot).append(coverEl({ cover: d.image }));
    paintMeta(d);
    const desc = d.description ? h('p', { class: 'release-desc clamp', text: d.description }) : null;
    fill(extra,
      d.genres?.length ? h('div', { class: 'row' }, d.genres.slice(0, 5).map((g) => h('span', { class: 'pill', text: g }))) : null,
      desc ?? h('p', { class: 'hint', text: preview || (item.daysUntil ?? 1) <= 0
        ? 'Hardcover has no description for this book.'
        : 'No description yet — that usually comes nearer release.' }),
      desc ? h('button', { class: 'link-btn more', type: 'button', onclick: (e) => {
        desc.classList.toggle('clamp');
        e.currentTarget.textContent = desc.classList.contains('clamp') ? 'Show more' : 'Show less';
      } }, 'Show more') : null,
      d.usersCount ? h('p', { class: 'hint', text: `${d.usersCount.toLocaleString()} ${d.usersCount === 1 ? 'reader has' : 'readers have'} it on Hardcover` }) : null,
      d.slug ? h('a', { href: `https://hardcover.app/books/${d.slug}`, target: '_blank', rel: 'noopener', class: 'hint' }, 'View on Hardcover ↗') : null);
  };

  loadDetails(ctx, item.bookId)
    .then((d) => { if (dialog.open) showDetails(d); })
    .catch((err) => clear(extra).append(h('p', { class: 'hint error', text: err.message })));
}

/**
 * What the watcher has seen happen to this book: when it first appeared,
 * when a date was set, every time it moved. This is the part no bookshop
 * page shows you.
 */
function history(ctx, item, profile) {
  const LABEL = {
    new_book: 'Spotted in the series',
    author_new_book: 'Spotted on the author’s page',
    date_set: (e) => `Release date announced: ${fmtDate(e.releaseDate)}`,
    date_moved: (e) => `Moved from ${fmtDate(e.previousDate)} to ${fmtDate(e.releaseDate)}`,
    preorder: 'Entered the last month before release',
    released: 'Released',
  };
  const seen = new Set();
  const events = ctx.state.events
    .filter((e) => String(e.bookId) === item.bookId && (!profile || e.profile === profile.id))
    .filter((e) => {
      // Two people get one event each; the history only needs it once.
      const k = `${e.type}|${e.releaseDate}|${e.previousDate}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => String(a.detectedAt).localeCompare(String(b.detectedAt)));

  const rows = events.map((e) => {
    const label = LABEL[e.type];
    return [e.detectedAt, typeof label === 'function' ? label(e) : label ?? e.type];
  });
  if (item.source === 'tracked' && item.added) rows.unshift([item.added, 'You started tracking it']);

  const waiting = item.who ?? (profile ? [profile] : []);

  return h('div', { class: 'release-history' },
    h('div', { class: 'k', text: 'What we know so far' }),
    rows.length
      ? h('ul', { class: 'timeline' }, rows.map(([at, text]) => h('li', {},
          h('span', { class: 'when', text: fmtAgo(at) }), h('span', { text }))))
      : h('p', { class: 'hint', text: 'Nothing has changed since the watcher first saw it.' }),
    waiting.length ? h('p', { class: 'hint', text: `Waiting: ${waiting.map((p) => p.name).join(' and ')}${
      item.source === 'author' ? ` · suggested because of ${item.authorName}` : ''}` }) : null);
}
