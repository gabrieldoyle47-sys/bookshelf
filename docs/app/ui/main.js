/**
 * App shell: boot, routing, sidebar, dialogs, and the single save path that
 * every mutation goes through.
 */

import { h, clear, fill, fmtDate, fmtReadOn, fmtRating, authorNames, coverEl, seriesLabel, toast } from './dom.js';
import * as storage from './storage.js';
import { createClient, searchBooks, searchViaProxy, booksByIds, booksViaProxy } from '../core/hardcover.js';
import {
  bookFromHardcover, deriveWatchlist, applyStatusDates, STATUSES, readOnOf, isValidReadOn, today as todayISO,
  normaliseRating, hideBook, unhideBook, trackBook, untrackBook, addRecommendation, answerRecommendation, setGoal,
  reopenRecommendation, restoreBook, datesProblem,
} from '../core/model.js';
import { unseenEvents } from '../core/watch.js';
import { shelfView, whatsNewView, sharedView } from './views.js';
import { upcomingView, allUpcomingView, openRelease, loadDetails } from './upcoming.js';
import { recsView, newRecCount } from './recs.js';
import { statsView } from './stats.js';

const state = {
  profiles: [], libraries: {}, seriesState: {}, authorState: {}, bookState: {}, events: [],
  route: { view: 'profile', profileId: null, tab: 'shelf' },
  canWrite: false,
};

const ctx = { state, actions: {} };

// Views call this when a display-only preference changes (grouping, say) and
// the data itself is untouched.
ctx.actions.rerender = () => render();

const PROFILE_TABS = [
  ['shelf', 'Shelf'], ['recs', 'Recommendations'], ['upcoming', 'Upcoming'], ['new', "What's new"], ['stats', 'Stats'],
];

/* ------------------------------------------------------------------- boot */

async function boot() {
  const site = await storage.loadSiteConfig();
  // If this browser is running code older than what is deployed, reload past
  // the cache before rendering anything misleading.
  if (await storage.ensureFresh(site)) return;
  await storage.adoptLocalConfig();
  state.canWrite = storage.canWrite();
  try {
    // Every file is a round trip to GitHub through the Worker, so fetch them
    // side by side: the page used to wait for each shelf in turn, after the
    // release data, before drawing anything.
    const loadProfiles = storage.loadJSON('profiles.json', { profiles: [] }).then(async ({ profiles }) => {
      const libs = await Promise.all(profiles.map((p) => storage.loadJSON(
        `profiles/${p.id}/library.json`, { books: [], watch: { series: {}, authors: {} } })));
      state.profiles = profiles;
      profiles.forEach((p, i) => { state.libraries[p.id] = libs[i]; });
    });
    await Promise.all([loadProfiles, loadWatchState()]);
  } catch (err) {
    document.getElementById('main').replaceChildren(
      h('div', { class: 'card' },
        h('h2', { text: 'Could not load your data' }),
        h('p', { text: friendlyError(err, { saving: false }) }),
        h('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, 'Try again')));
    return;
  }

  window.addEventListener('hashchange', () => {
    // Going to another page (a link, or the browser's back button) should not
    // leave the last page's panel open on top of the new one.
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    readRoute();
    render();
  });
  document.getElementById('open-settings').addEventListener('click', openSettings);
  document.getElementById('menu-toggle').addEventListener('click', toggleMenu);
  // On a phone the menu is a drawer: tapping outside it or pressing Escape closes it.
  document.getElementById('nav-scrim').addEventListener('click', () => toggleMenu(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('sidebar').classList.contains('open')) toggleMenu(false);
  });
  wireAddDialog();
  wireDialogs();
  document.addEventListener('keydown', tablistKeys);

  readRoute();
  render();
}

/** Everything the release check writes; reloaded after "check now". */
async function loadWatchState() {
  [state.seriesState, state.authorState, state.bookState, state.events] = await Promise.all([
    storage.loadJSON('series-state.json', {}),
    storage.loadJSON('authors.json', {}),
    storage.loadJSON('books-state.json', {}),
    storage.loadEvents(),
  ]);
}

/**
 * Behaviour every dialog shares.
 *
 * Tapping the backdrop closes a dialog - on a phone the bottom sheets look
 * dismissable, and before this only the ✕ or Escape worked. A dialog holding
 * unsaved edits (it sets isDirty) asks first instead, however it is being
 * closed: the book dialog used to throw away a rating and note without a word
 * if Escape was pressed.
 */
function wireDialogs() {
  const discardOk = (dialog) => !dialog.isDirty?.() || confirm('Discard your unsaved changes?');
  for (const dialog of document.querySelectorAll('dialog.dialog')) {
    // A press that starts inside and ends on the backdrop (selecting text in
    // a field, say) is not a tap outside.
    let downOnBackdrop = false;
    dialog.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === dialog; });
    dialog.addEventListener('click', (e) => {
      if (e.target !== dialog || !downOnBackdrop) return;
      // The dialog box itself also counts as the target when its padding is
      // clicked, so check the point really is outside it.
      const r = dialog.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside && discardOk(dialog)) dialog.close();
    });
    dialog.addEventListener('cancel', (e) => { if (!discardOk(dialog)) e.preventDefault(); });
    dialog.querySelector('.dialog-head .icon-btn')?.addEventListener('click', (e) => {
      if (!discardOk(dialog)) e.preventDefault();
    });
    dialog.addEventListener('close', () => { dialog.isDirty = null; });
  }
}

/**
 * Arrow keys, Home and End move along any tab strip or segmented control,
 * as they do in every native tab bar. Each control already selects on click,
 * so moving is focusing and clicking the neighbour.
 */
function tablistKeys(e) {
  const tab = e.target.closest?.('[role="tab"]');
  const list = tab?.closest('[role="tablist"]');
  if (!list || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const i = tabs.indexOf(tab);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1
    : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  e.preventDefault();
  tabs[next].focus();
  // The profile tabs change the route, and render() puts focus back on the
  // redrawn strip.
  tabs[next].click();
}

function toggleMenu(force) {
  const bar = document.getElementById('sidebar');
  const btn = document.getElementById('menu-toggle');
  const open = bar.classList.toggle('open', typeof force === 'boolean' ? force : undefined);
  btn.setAttribute('aria-expanded', String(open));
}

/* ----------------------------------------------------------------- routing */

function readRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);

  if (parts[0] === 'upcoming') state.route = { view: 'all-upcoming' };
  else if (parts[0] === 'shared') state.route = { view: 'shared' };
  else if (parts[0] === 'p' && parts[1]) {
    // An old bookmark or a typo lands on a real page, and the sidebar and
    // tabs then highlight what is actually showing.
    const profileId = state.profiles.some((p) => p.id === parts[1]) ? parts[1] : state.profiles[0]?.id ?? null;
    const tab = PROFILE_TABS.some(([id]) => id === parts[2]) ? parts[2] : 'shelf';
    state.route = { view: 'profile', profileId, tab };
  } else {
    state.route = { view: 'profile', profileId: state.profiles[0]?.id ?? null, tab: 'shelf' };
  }
}

/** The browser tab and history say which page this is, not just "Bookshelf". */
function pageTitle() {
  const { view, profileId, tab } = state.route;
  if (view === 'all-upcoming') return 'All upcoming';
  if (view === 'shared') return 'Both of us';
  const name = state.profiles.find((p) => p.id === profileId)?.name;
  const label = PROFILE_TABS.find(([id]) => id === tab)?.[1] ?? 'Shelf';
  return name ? `${label} · ${name}` : null;
}

const go = (hash) => { location.hash = hash; };

/* ------------------------------------------------------------------ render */

function render() {
  // Keyboard focus on the tab strip survives the redraw, so arrowing through
  // the tabs does not drop focus back to the top of the page.
  const tabFocused = Boolean(document.activeElement?.closest?.('.tabs'));
  renderSidebar();
  const main = clear(document.getElementById('main'));
  toggleMenu(false);
  const title = pageTitle();
  document.title = title ? `${title} — Bookshelf` : 'Bookshelf';

  if (!state.profiles.length) {
    main.append(h('div', { class: 'card' },
      h('h2', { text: 'No profiles yet' }),
      h('p', { text: 'Create one from the terminal:  node src/cli.js profile add gabriel "Gabriel"' })));
    return;
  }

  const { view, profileId, tab } = state.route;

  if (view === 'all-upcoming') return void main.append(allUpcomingView(ctx));
  if (view === 'shared') return void main.append(sharedView(ctx));

  const profile = state.profiles.find((p) => p.id === profileId) ?? state.profiles[0];
  ctx.currentProfile = profile;
  const tabs = main.appendChild(profileTabs(profile, tab));
  // On a phone the tab strip scrolls sideways; keep the current tab in view.
  const selected = tabs.querySelector('[aria-selected="true"]');
  selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (tabFocused) selected?.focus();

  const views = {
    shelf: shelfView, recs: recsView, upcoming: upcomingView, new: whatsNewView, stats: statsView,
  };
  main.append((views[tab] ?? shelfView)(ctx, profile));
}

function profileTabs(profile, current) {
  // Each tab carries its own share of the sidebar badge, so the number there
  // can be traced to where the news actually is.
  const counts = {
    recs: newRecCount(state.libraries[profile.id]),
    new: unseenNews(profile),
  };
  return h('div', { class: 'tabs', role: 'tablist', 'aria-label': `${profile.name}'s pages` }, PROFILE_TABS.map(([id, label]) =>
    h('button', {
      class: 'tab', type: 'button', role: 'tab',
      'aria-selected': String(id === current),
      onclick: () => go(`#/p/${profile.id}/${id}`),
    }, label, counts[id] ? h('span', { class: 'badge', text: String(counts[id]), 'aria-label': `${counts[id]} new` }) : null)));
}

const unseenNews = (profile) => unseenEvents(state.events, profile, state.libraries[profile.id]).length;

/** The sidebar badge: unread release news plus unanswered recommendations. */
function unseenCount(profile) {
  return unseenNews(profile) + newRecCount(state.libraries[profile.id]);
}

function renderSidebar() {
  const nav = clear(document.getElementById('nav'));
  const { view, profileId } = state.route;

  const people = h('div', { class: 'nav-group' }, h('div', { class: 'nav-label', text: 'People' }));
  for (const p of state.profiles) {
    const n = unseenCount(p);
    people.append(h('button', {
      class: 'nav-item', type: 'button',
      'aria-current': view === 'profile' && p.id === profileId ? 'page' : null,
      onclick: () => go(`#/p/${p.id}`),
    },
      h('span', { class: 'dot avatar', 'aria-hidden': 'true', style: `background:${p.colour ?? 'var(--accent)'}`, text: (p.name ?? '?').slice(0, 1).toUpperCase() }),
      p.name,
      n ? h('span', { class: 'badge', text: String(n), 'aria-label': `${n} new` }) : null));
  }
  nav.append(people);

  nav.append(h('div', { class: 'nav-group' },
    h('div', { class: 'nav-label', text: 'Together' }),
    h('button', {
      class: 'nav-item', type: 'button',
      'aria-current': view === 'all-upcoming' ? 'page' : null,
      onclick: () => go('#/upcoming'),
    }, h('span', { class: 'ico ico-calendar', 'aria-hidden': 'true' }), 'All upcoming'),
    h('button', {
      class: 'nav-item', type: 'button',
      'aria-current': view === 'shared' ? 'page' : null,
      onclick: () => go('#/shared'),
    }, h('span', { class: 'ico ico-people', 'aria-hidden': 'true' }), 'Both of us')));

  paintSync();
}

/**
 * The status line under Settings. It used to read "saving" permanently on the
 * live site, which looked like a save stuck in progress; now it says so only
 * while one actually is.
 */
function paintSync() {
  const sync = document.getElementById('sync-state');
  sync.classList.toggle('busy', pending > 0);
  sync.textContent = pending > 0 ? 'Saving…' : {
    local: 'local · saving to disk',
    live: 'All changes saved',
    token: 'synced to GitHub',
    'read-only': 'read-only',
  }[storage.writeMode()];
}

/* ------------------------------------------------------------------ saving */

let pending = 0;
let queue = Promise.resolve();

/**
 * Network failures surface as "Failed to fetch" or "Load failed", which says
 * nothing about whether the change was kept.
 */
function friendlyError(err, { saving = true } = {}) {
  if (err instanceof TypeError && /fetch|load failed|network/i.test(err.message)) {
    return `Could not reach the server — check your connection.${saving ? ' Nothing was saved.' : ''}`;
  }
  return err.message;
}

/**
 * The single write path. Everything that changes a library comes through here.
 *
 * Saves run one at a time. Each is a read-modify-commit round trip of a
 * second or two, and two overlapping ones on the same shelf - a quick rating
 * then a hide, or a double-click - raced each other through the Worker, where
 * the later commit could silently drop the earlier change.
 */
async function saveLibrary(profileId, mutate, message) {
  if (!state.canWrite) {
    toast('Read-only — add a GitHub token in Settings to make changes.', true);
    return false;
  }
  const path = `profiles/${profileId}/library.json`;
  pending++;
  paintSync();
  const run = queue.then(async () => {
    try {
      const next = await storage.mutateJSON(
        path, { books: [], watch: { series: {}, authors: {} } }, mutate, message);
      state.libraries[profileId] = next;
      return true;
    } catch (err) {
      toast(friendlyError(err), true);
      return false;
    }
  });
  queue = run;
  const ok = await run;
  pending--;
  // Redraw either way: on failure that re-enables whatever button started it.
  render();
  return ok;
}

/**
 * Disable a button while its save is in flight, so a second tap cannot send
 * the same change twice.
 */
async function busy(button, work) {
  if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
  try {
    return await work();
  } finally {
    if (button?.isConnected) { button.disabled = false; button.removeAttribute('aria-busy'); }
  }
}

/* -------------------------------------------------------- talking to Hardcover */

/** Search, through the Worker on the live site or directly on localhost. */
ctx.actions.searchBooks = async (query, n = 8) => {
  const { hardcover, worker } = storage.getConfig();
  if (worker) return searchViaProxy(worker, query, n);
  if (hardcover) return searchBooks(createClient(hardcover), query, n);
  throw new Error('This site is not connected to its backend yet.');
};

/** Full details for some books, in the same shape as a search hit. */
ctx.actions.fetchBooks = async (ids) => {
  const { hardcover, worker } = storage.getConfig();
  if (worker) return booksViaProxy(worker, ids);
  if (hardcover) return booksByIds(createClient(hardcover), ids);
  throw new Error('This site is not connected to its backend yet.');
};

/* ------------------------------------------------ adding from suggestions */

/** Put a search hit (or a fetched book) on someone's to-read pile. */
ctx.actions.addHit = async (profile, hit) => {
  const book = bookFromHardcover(hit, { status: 'tbr' });
  const ok = await saveLibrary(profile.id, (lib) => {
    if (lib.books.some((b) => b.id === book.id)) throw new Error('That book is already on this shelf.');
    lib.books.push(book);
    // Something you mean to read is no longer something you are waiting for.
    untrackBook(lib, hit.id);
    return lib;
  }, `Add ${book.title} for ${profile.name}`);
  if (ok) toast(`Added ${book.title} to ${profile.name}'s want-to-read pile`);
  return ok;
};

/**
 * Add a book known only by its Hardcover id - a next-in-series suggestion or
 * an upcoming release. The watcher's snapshot is too thin to shelve (no
 * authors, genres or page count), so fetch the real record first.
 */
ctx.actions.addById = async (profile, bookId, title) => {
  try {
    const [hit] = await ctx.actions.fetchBooks([bookId]);
    if (!hit) throw new Error(`Hardcover could not find “${title}”.`);
    return await ctx.actions.addHit(profile, hit);
  } catch (err) {
    toast(friendlyError(err), true);
    return false;
  }
};

ctx.actions.hide = async (profile, bookId, title) => {
  const ok = await saveLibrary(profile.id, (lib) => hideBook(lib, bookId, title), `Hide ${title} for ${profile.name}`);
  // One tap on a small ✕ is easy to hit by mistake; undo is right there
  // rather than a trip to the bottom of Upcoming.
  if (ok) toast(`Hidden “${title}”`, false, { label: 'Undo', run: () => ctx.actions.unhide(profile, bookId, title) });
};

ctx.actions.unhide = async (profile, bookId, title) => {
  const ok = await saveLibrary(profile.id, (lib) => unhideBook(lib, bookId), `Show ${title} again for ${profile.name}`);
  if (ok) toast(`“${title}” is back`);
};

ctx.actions.track = async (profile, hit) => {
  const ok = await saveLibrary(profile.id, (lib) => trackBook(lib, hit), `Track ${hit.title} for ${profile.name}`);
  if (ok) toast(`Tracking ${hit.title} — date changes will show in What's new`);
};

ctx.actions.untrack = async (profile, bookId, title) => {
  const ok = await saveLibrary(profile.id, (lib) => untrackBook(lib, bookId), `Stop tracking ${title} for ${profile.name}`);
  if (ok) toast(`Stopped tracking ${title}`);
};

ctx.actions.setGoal = async (profile, year, target) => {
  const n = Number(target);
  if (n !== 0 && (!Number.isFinite(n) || n < 1)) return toast('A goal needs to be at least one book.', true);
  const ok = await saveLibrary(profile.id, (lib) => setGoal(lib, year, n), `Set ${profile.name}'s ${year} reading goal`);
  if (ok) toast(n ? `Goal set: ${n} books in ${year}` : `Removed the ${year} goal`);
};

/** A read-only look at a book that is not on this shelf yet. */
ctx.actions.openBookPreview = (book) => openRelease(ctx, {
  bookId: String(book.hardcoverId ?? book.id).replace(/^hc:/, ''),
  title: book.title,
  image: book.cover ?? book.image ?? null,
  seriesName: book.series?.name ?? null,
  position: book.series?.position ?? null,
  authorName: authorNames(book),
  releaseDate: book.released ?? book.releaseDate ?? null,
}, null, { preview: true });

/* ---------------------------------------------------------- recommendations */

ctx.actions.answerRec = async (profile, rec, answer) => {
  const ok = await saveLibrary(profile.id, (lib) => answerRecommendation(lib, rec.id, answer),
    `${answer === 'added' ? 'Accept' : 'Pass on'} ${rec.book.title} for ${profile.name}`);
  if (!ok) return;
  if (answer === 'added') toast(`Added ${rec.book.title} to your want-to-read pile`);
  else toast('Passed — it moves to Earlier', false, { label: 'Undo', run: () => ctx.actions.reopenRec(profile, rec) });
};

/** Take back a "No thanks", putting the recommendation back in the queue. */
ctx.actions.reopenRec = async (profile, rec) => {
  await saveLibrary(profile.id, (lib) => reopenRecommendation(lib, rec.id),
    `Reopen ${rec.book.title} for ${profile.name}`);
};

/** The book panel from Upcoming, for anywhere else that lists a release. */
ctx.actions.openRelease = (item, profile) => openRelease(ctx, item, profile);

/**
 * Recommend a book to someone else. Given a book it goes straight to the
 * note; without one it starts with a search.
 */
ctx.actions.openRecommend = (from, book = null) => {
  const others = state.profiles.filter((p) => p.id !== from.id);
  if (!others.length) return toast('There is nobody else to recommend to yet.', true);
  const dialog = document.getElementById('rec-dialog');
  const body = clear(document.getElementById('rec-body'));
  const title = document.getElementById('rec-title');
  let to = others[0];
  title.textContent = others.length === 1 ? `Recommend a book to ${to.name}` : 'Recommend a book';

  const compose = (record) => {
    clear(body);
    const theirs = () => (state.libraries[to.id]?.books ?? []).find((b) => b.hardcoverId === record.hardcoverId);
    const warn = h('p', { class: 'hint error' });
    let note = '';
    const send = h('button', { class: 'btn', type: 'button', onclick: async () => {
      send.disabled = true;
      const ok = await saveLibrary(to.id,
        (lib) => addRecommendation(lib, { book: record, from: from.id, note }),
        `${from.name} recommends ${record.title} to ${to.name}`);
      if (ok) { dialog.close(); toast(`Sent ${record.title} to ${to.name}`); } else send.disabled = false;
    } });
    // Recommending something they already have is a wasted message - say so
    // before it is sent rather than after.
    const check = () => {
      const t = theirs();
      warn.textContent = t
        ? `Already on ${to.name}'s shelf${t.status === 'read' ? ` — finished${t.rating ? `, ${fmtRating(t.rating)}★` : ''}` : ''}.`
        : '';
      send.disabled = Boolean(t);
      send.textContent = `Send to ${to.name}`;
    };
    const about = aboutPanel(record);
    fill(body,
      h('button', {
        class: 'rec-pick', type: 'button', 'aria-expanded': 'false',
        onclick: (e) => e.currentTarget.setAttribute('aria-expanded', String(about.toggle())),
      },
        coverEl(record),
        h('div', { class: 'book-main' },
          h('div', { class: 'book-title', text: record.title }),
          h('div', { class: 'book-meta', text: [authorNames(record), seriesLabel(record)].filter(Boolean).join(' · ') }),
          h('span', { class: 'rec-pick-more', text: 'About this book' }))),
      about.el,
      others.length > 1 ? h('label', { class: 'field' }, h('span', { text: 'To' }),
        h('select', { onchange: (e) => { to = others.find((p) => p.id === e.target.value); check(); } },
          others.map((p) => h('option', { value: p.id }, p.name)))) : null,
      h('label', { class: 'field' }, h('span', { text: 'Why they’d like it (optional)' }),
        h('textarea', { maxlength: '400', placeholder: 'What made you think of them?',
          oninput: (e) => { note = e.target.value; } })),
      warn,
      h('div', { class: 'row end' }, send));
    check();
  };

  if (book) {
    compose(book);
  } else {
    const results = h('div', { class: 'results' });
    const hint = h('p', { class: 'hint', text: 'Search for the book you want to recommend.' });
    let timer = null;
    let seq = 0;
    const input = h('input', {
      type: 'search', placeholder: 'Start typing a title…', autocomplete: 'off', spellcheck: 'false',
      oninput: (e) => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const q = e.target.value.trim();
          clear(results);
          if (q.length < 3) { hint.textContent = 'Keep typing…'; return; }
          const mine = ++seq;
          hint.textContent = 'Searching…';
          try {
            const hits = await ctx.actions.searchBooks(q, 8);
            if (mine !== seq) return;
            hint.textContent = hits.length ? 'Pick the right book.' : `Hardcover has nothing for “${q}”.`;
            for (const hit of hits) {
              results.append(h('button', {
                class: 'result', type: 'button',
                onclick: () => compose(bookFromHardcover(hit, { status: 'tbr' })),
              },
                coverEl({ cover: hit.image }),
                h('div', { class: 'book-main' },
                  h('div', { class: 'book-title', text: hit.title }),
                  h('div', { class: 'book-meta', text: [authorNames(hit), seriesLabel(hit), hit.releaseYear].filter(Boolean).join(' · ') }))));
            }
          } catch (err) {
            if (mine === seq) hint.textContent = err.message;
          }
        }, 350);
      },
    });
    body.append(h('label', { class: 'field' }, h('span', { text: 'Title' }), input), hint, results);
    setTimeout(() => input.focus(), 0);
  }
  dialog.showModal();
};

/**
 * The description of a book being recommended, opened by clicking the book.
 * Loaded on first open - most people already know the book they are sending,
 * so there is no point spending a request on it up front.
 */
function aboutPanel(record) {
  const el = h('div', { class: 'rec-about', hidden: true });
  let loaded = false;
  const load = async () => {
    loaded = true;
    fill(el, h('p', { class: 'hint', text: 'Loading the description…' }));
    try {
      const d = await loadDetails(ctx, record.hardcoverId ?? record.id);
      const desc = d?.description ? h('p', { class: 'release-desc clamp', text: d.description }) : null;
      fill(el,
        d?.genres?.length ? h('div', { class: 'row' }, d.genres.slice(0, 5).map((g) => h('span', { class: 'pill', text: g }))) : null,
        desc ?? h('p', { class: 'hint', text: 'Hardcover has no description for this book.' }),
        desc ? h('button', { class: 'link-btn more', type: 'button', onclick: (e) => {
          desc.classList.toggle('clamp');
          e.currentTarget.textContent = desc.classList.contains('clamp') ? 'Show more' : 'Show less';
        } }, 'Show more') : null,
        [d?.pages ? `${d.pages} pages` : null, d?.publisher].filter(Boolean).length
          ? h('p', { class: 'hint', text: [d.pages ? `${d.pages} pages` : null, d.publisher].filter(Boolean).join(' · ') }) : null);
    } catch (err) {
      loaded = false;
      fill(el, h('p', { class: 'hint error', text: err.message }));
    }
  };
  return {
    el,
    toggle() {
      el.hidden = !el.hidden;
      if (!el.hidden && !loaded) load();
      return !el.hidden;
    },
  };
}

/* -------------------------------------------------------------- add dialog */

let searchTimer = null;
let searchSeq = 0;
let addProfile = null;

function wireAddDialog() {
  const input = document.getElementById('add-query');
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    // Hardcover allows 60 calls a minute with a burst of only 10, so
    // search-as-you-type must wait for a pause rather than fire per keystroke.
    searchTimer = setTimeout(runSearch, 350);
  });
}

ctx.actions.openAdd = (profile) => {
  addProfile = profile;
  const dialog = document.getElementById('add-dialog');
  document.getElementById('add-title').textContent = `Add a book for ${profile.name}`;
  const input = document.getElementById('add-query');
  input.value = '';
  clear(document.getElementById('add-results'));
  setHint('Search for the book you mean.');
  dialog.showModal();
  input.focus();
};

function setHint(text, isError = false) {
  const hint = document.getElementById('add-hint');
  hint.textContent = text;
  hint.className = `hint${isError ? ' error' : ''}`;
}

async function runSearch() {
  const query = document.getElementById('add-query').value.trim();
  clear(document.getElementById('add-results'));
  if (query.length < 3) return setHint('Keep typing…');

  // Responses can land out of order — a slow "harry" arriving after a fast
  // "potter" would repaint stale results. Only the newest request may draw.
  const seq = ++searchSeq;
  setHint('Searching…');

  try {
    const hits = await ctx.actions.searchBooks(query, 8);
    if (seq !== searchSeq) return;
    if (!hits.length) return setHint(`Hardcover has nothing for “${query}”.`, true);
    showHits(hits);
  } catch (err) {
    if (seq === searchSeq) setHint(friendlyError(err, { saving: false }), true);
  }
}

function showHits(hits) {
  const results = clear(document.getElementById('add-results'));
  setHint('Pick the right edition — everything else is filled in for you.');
  // Say up front which results are already on the shelf. Before, picking one
  // walked through the shelf choice only to fail with an error at the end.
  const shelf = new Map((state.libraries[addProfile.id]?.books ?? []).map((b) => [String(b.hardcoverId), b]));
  for (const hit of hits) {
    const bits = [authorNames(hit), seriesLabel(hit), hit.releaseYear].filter(Boolean);
    const have = shelf.get(String(hit.id));
    results.append(h('button', {
      class: `result${have ? ' owned' : ''}`, type: 'button',
      onclick: () => {
        if (!have) return chooseStatus(hit, hits);
        // Already there: go straight to it instead.
        document.getElementById('add-dialog').close();
        ctx.actions.openBook(have, addProfile);
      },
    },
      coverEl({ cover: hit.image }),
      h('div', { class: 'book-main' },
        h('div', { class: 'book-title', text: hit.title }),
        h('div', { class: 'book-meta', text: bits.join(' · ') })),
      have ? h('span', { class: 'pill', text: `On shelf · ${SHELF_LABEL[have.status] ?? have.status}` }) : null));
  }
}

/** Second step of adding: which shelf does it go on? */
function chooseStatus(hit, hits) {
  const results = clear(document.getElementById('add-results'));
  setHint(`Where does “${hit.title}” go?`);
  const profile = addProfile;

  const add = async (status, button) => {
    const book = bookFromHardcover(hit, { status });
    // Every button goes quiet while the save runs; a second tap used to add
    // the book twice, or fail with "already on this shelf".
    choices.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    button.setAttribute('aria-busy', 'true');
    const ok = await saveLibrary(profile.id, (lib) => {
      if (lib.books.some((b) => b.id === book.id)) throw new Error('That book is already on this shelf.');
      lib.books.push(book);
      untrackBook(lib, hit.id);
      return lib;
    }, `Add ${book.title} for ${profile.name}`);

    if (!ok) {
      choices.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      button.removeAttribute('aria-busy');
      return;
    }
    document.getElementById('add-dialog').close();
    const watching = book.series?.id && deriveWatchlist(state.libraries[profile.id]).series[book.series.id];
    const started = status === 'reading' ? ' · started today' : '';
    const message = watching ? `Added${started} · now watching ${book.series.name}` : `Added ${book.title}${started}`;
    // A book you have already read is usually added in order to rate it.
    toast(message, false, status === 'read' ? {
      label: 'Rate it',
      run: () => { const saved = findBookIn(profile.id, book.id); if (saved) ctx.actions.openBook(saved, profile); },
    } : null);
  };

  const choices = h('div', { class: 'row' },
    h('button', { class: 'btn', type: 'button', onclick: (e) => add('reading', e.currentTarget) }, 'Reading now'),
    h('button', { class: 'btn secondary', type: 'button', onclick: (e) => add('tbr', e.currentTarget) }, 'Want to read'),
    h('button', { class: 'btn secondary', type: 'button', onclick: (e) => add('read', e.currentTarget) }, 'Already read'));

  results.append(
    h('div', { class: 'result picked' },
      coverEl({ cover: hit.image }),
      h('div', { class: 'book-main' },
        h('div', { class: 'book-title', text: hit.title }),
        h('div', { class: 'book-meta', text: [authorNames(hit), seriesLabel(hit), hit.releaseYear].filter(Boolean).join(' · ') }))),
    choices,
    // Picking the wrong edition was a dead end: the only way back was to
    // retype the search.
    h('button', { class: 'link-btn back', type: 'button', onclick: () => showHits(hits) }, '← Back to results'));
  choices.querySelector('button').focus();
}

/* ------------------------------------------------------------- book dialog */

ctx.actions.openBook = (book, owner) => {
  const profile = owner
    ?? state.profiles.find((p) => (state.libraries[p.id]?.books ?? []).some((b) => b.id === book.id));
  if (!profile) return toast('Could not tell whose shelf that book is on.', true);
  const dialog = document.getElementById('book-dialog');
  document.getElementById('book-title').textContent = book.title;
  const body = clear(document.getElementById('book-body'));

  const draft = {
    status: book.status, rating: book.rating ?? null, note: book.note ?? '',
    readOn: readOnOf(book), started: book.started ?? '', finished: book.finished ?? '',
  };
  // Closing with edits unsaved asks first (see wireDialogs).
  const initial = JSON.stringify(draft);
  dialog.isDirty = () => JSON.stringify(draft) !== initial;
  const problem = h('p', { class: 'hint error', role: 'alert' });

  body.append(
    h('div', { class: 'row book-hero' },
      coverEl(book),
      h('div', { class: 'book-main' },
        h('div', { class: 'book-meta', text: authorNames(book) }),
        seriesLabel(book) && h('div', { class: 'book-meta', text: seriesLabel(book) }),
        book.pages && h('div', { class: 'book-meta', text: `${book.pages} pages` }),
        book.released && h('div', { class: 'book-meta', text: `Published ${fmtDate(book.released)}` }))),

    // Named, because from Both of us or a recap this may be the other
    // person's copy of the book.
    h('label', { class: 'field' }, h('span', { text: `${profile.name}'s shelf` }),
      h('select', { onchange: (e) => { draft.status = e.target.value; } },
        STATUSES.map((s) => h('option', { value: s, selected: s === book.status }, SHELF_LABEL[s] ?? s)))),

    h('div', { class: 'field' }, h('span', { text: 'Rating' }), ratingPicker(draft)),

    h('div', { class: 'field' }, h('span', { text: 'When did you read it?' }), readOnPicker(draft)),

    h('label', { class: 'field' }, h('span', { text: 'Note' }),
      h('textarea', { placeholder: 'Optional', oninput: (e) => { draft.note = e.target.value; } }, book.note ?? '')),

    // Dates are deliberately tucked away: they are never required, and burying
    // them keeps the common case to two clicks.
    h('details', { class: 'optional' },
      h('summary', { text: 'Reading dates (optional)' }),
      h('div', { class: 'grid-2' },
        h('label', { class: 'field' }, h('span', { text: 'Started' }),
          h('input', { type: 'date', value: draft.started, onchange: (e) => { draft.started = e.target.value; } })),
        h('label', { class: 'field' }, h('span', { text: 'Finished' }),
          h('input', { type: 'date', value: draft.finished, onchange: (e) => { draft.finished = e.target.value; } })))),

    problem,

    h('div', { class: 'row end', style: 'margin-top:1rem' },
      book.recommendedBy ? h('span', { class: 'count rec-origin',
        text: `Recommended by ${state.profiles.find((p) => p.id === book.recommendedBy)?.name ?? book.recommendedBy}` }) : null,
      state.profiles.length > 1 && state.canWrite ? h('button', { class: 'btn secondary', type: 'button',
        onclick: () => { dialog.close(); ctx.actions.openRecommend(profile, book); } },
        state.profiles.length === 2 ? `Recommend to ${state.profiles.find((p) => p.id !== profile.id).name}` : 'Recommend…') : null,
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn danger', type: 'button', disabled: !state.canWrite,
        onclick: () => removeBook(profile, book) }, 'Remove'),
      h('button', { class: 'btn', type: 'button', disabled: !state.canWrite,
        onclick: (e) => {
          problem.textContent = datesProblem(draft) ?? '';
          if (problem.textContent) return;
          busy(e.currentTarget, () => applyEdit(profile, book, draft));
        } }, 'Save')));

  dialog.showModal();
};

/** Shelf names as people say them; the stored values stay as they are. */
const SHELF_LABEL = { tbr: 'Want to read', reading: 'Reading now', read: 'Finished', abandoned: 'Gave up on' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const daysInMonth = (year, month) => new Date(Number(year), Number(month), 0).getDate();

/**
 * "When did you read it?" at whatever precision the reader actually has.
 *
 * Three dependent dropdowns rather than a date field, because most books were
 * read long before anyone started logging them: a date input would force a day
 * nobody remembers. Year alone is a complete, valid answer here; month and day
 * are there if you happen to know them.
 */
function readOnPicker(draft) {
  const current = draft.readOn ?? '';
  let [year = '', month = '', day = ''] = current.split('-');

  const wrap = h('div', { class: 'row readon' });

  const commit = () => {
    draft.readOn = !year ? null
      : !month ? year
      : !day ? `${year}-${month}`
      : `${year}-${month}-${day}`;
    paint();
  };

  const option = (value, label, selected) =>
    h('option', { value, ...(selected ? { selected: true } : {}) }, label);

  const yearSel = h('select', {
    'aria-label': 'Year read',
    onchange: (e) => { year = e.target.value; if (!year) { month = ''; day = ''; } commit(); },
  });
  const monthSel = h('select', {
    'aria-label': 'Month read',
    onchange: (e) => { month = e.target.value; if (!month) day = ''; commit(); },
  });
  const daySel = h('select', {
    'aria-label': 'Day read',
    onchange: (e) => { day = e.target.value; commit(); },
  });

  function paint() {
    const thisYear = new Date().getFullYear();
    clear(yearSel).append(option('', 'Year…', !year));
    for (let y = thisYear; y >= 1960; y--) yearSel.append(option(String(y), String(y), String(y) === year));

    clear(monthSel).append(option('', year ? 'Month (optional)' : '—', !month));
    MONTHS.forEach((name, i) => {
      const value = String(i + 1).padStart(2, '0');
      monthSel.append(option(value, name, value === month));
    });
    monthSel.disabled = !year;

    clear(daySel).append(option('', month ? 'Day (optional)' : '—', !day));
    const max = year && month ? daysInMonth(year, month) : 31;
    for (let d = 1; d <= max; d++) {
      const value = String(d).padStart(2, '0');
      daySel.append(option(value, String(d), value === day));
    }
    daySel.disabled = !month;

    summary.textContent = draft.readOn
      ? `Read ${fmtReadOn(draft.readOn)}`
      : 'Not recorded — a year on its own is fine';
  }

  const summary = h('span', { class: 'readon-summary' });

  const quick = h('button', {
    class: 'btn secondary small', type: 'button',
    onclick: () => {
      const iso = todayISO();
      [year, month, day] = iso.split('-');
      commit();
    },
  }, 'Today');

  const clearBtn = h('button', {
    class: 'btn secondary small', type: 'button',
    onclick: () => { year = month = day = ''; commit(); },
  }, 'Clear');

  paint();
  wrap.append(yearSel, monthSel, daySel, quick, clearBtn);
  return h('div', {}, wrap, summary);
}

/**
 * Five stars, each split into a left and a right half: a click on the left
 * of the fourth star is 3.5, on its right 4. Clicking the current rating
 * again clears it. Ten plain buttons rather than one clever control, so it
 * works by keyboard and screen reader like anything else.
 */
function ratingPicker(draft) {
  const wrap = h('div', { class: 'rating-pick', role: 'group', 'aria-label': 'Rating' });
  const label = h('span', { class: 'rating-label' });
  const slots = [];
  const paint = () => {
    const r = draft.rating ?? 0;
    slots.forEach((slot, i) => {
      slot.classList.toggle('full', r >= i + 1);
      slot.classList.toggle('half', r === i + 0.5);
      // A screen reader hears which of the ten buttons is the current rating.
      const [left, right] = slot.querySelectorAll('.star-half');
      left.setAttribute('aria-pressed', String(r === i + 0.5));
      right.setAttribute('aria-pressed', String(r === i + 1));
    });
    label.textContent = draft.rating ? `${fmtRating(draft.rating)} / 5` : 'Not rated';
  };
  for (let i = 1; i <= 5; i++) {
    const pick = (value) => { draft.rating = draft.rating === value ? null : normaliseRating(value); paint(); };
    const slot = h('span', { class: 'star-slot' },
      h('span', { class: 'star-base', 'aria-hidden': 'true', text: '★' }),
      h('span', { class: 'star-fill', 'aria-hidden': 'true', text: '★' }),
      h('button', { type: 'button', class: 'star-half left', 'aria-label': `${i - 0.5} stars`, onclick: () => pick(i - 0.5) }),
      h('button', { type: 'button', class: 'star-half right', 'aria-label': `${i} stars`, onclick: () => pick(i) }));
    slots.push(slot);
    wrap.append(slot);
  }
  paint();
  return h('div', { class: 'row rating-row' }, wrap, label);
}

async function applyEdit(profile, book, draft) {
  const ok = await saveLibrary(profile.id, (lib) => {
    const target = lib.books.find((b) => b.id === book.id);
    if (!target) throw new Error('That book is no longer on this shelf.');
    const previous = target.status;
    Object.assign(target, {
      status: draft.status,
      rating: normaliseRating(draft.rating),
      note: draft.note,
      readOn: isValidReadOn(draft.readOn) ? draft.readOn : null,
      started: draft.started || null,
      finished: draft.finished || null,
    });
    // Fill in whatever the status change implies, without touching anything
    // the reader set by hand in the dates panel.
    applyStatusDates(target, previous);
    return lib;
  }, `Update ${book.title}`);

  if (ok) {
    document.getElementById('book-dialog').close();
    const saved = findBookIn(profile.id, book.id);
    toast(datesMessage(book, saved) ?? `Saved ${book.title}`);
  }
}

const findBookIn = (profileId, id) =>
  (state.libraries[profileId]?.books ?? []).find((b) => b.id === id);

/** Say out loud when a date was recorded for you, so it is never a surprise. */
function datesMessage(before, after) {
  if (!after) return null;
  const gainedStart = !before.started && after.started;
  const gainedFinish = !before.finished && after.finished;
  if (gainedStart && gainedFinish) return `Saved — recorded start and finish as today`;
  if (gainedStart) return `Started ${after.title} — recorded today`;
  if (gainedFinish) return `Finished ${after.title} — recorded today`;
  return null;
}

async function removeBook(profile, book) {
  if (!confirm(`Remove “${book.title}” from ${profile.name}'s shelf?`)) return;
  // Keep the record exactly as it was on disk, rating, note and dates
  // included, so Undo really puts it back rather than re-adding a blank copy.
  let removed = null;
  const ok = await saveLibrary(profile.id, (lib) => {
    removed = lib.books.find((b) => b.id === book.id) ?? null;
    return { ...lib, books: lib.books.filter((b) => b.id !== book.id) };
  }, `Remove ${book.title}`);
  if (ok) {
    document.getElementById('book-dialog').close();
    toast(`Removed ${book.title}`, false, removed ? {
      label: 'Undo',
      run: async () => {
        if (await saveLibrary(profile.id, (lib) => restoreBook(lib, removed), `Put back ${book.title}`)) {
          toast(`${book.title} is back on ${profile.name}'s shelf`);
        }
      },
    } : null);
  }
}

/* ------------------------------------------------------ bulk read dates */

const YEAR_OPTIONS = (() => {
  const now = new Date().getFullYear();
  const years = [];
  for (let y = now; y >= 1990; y--) years.push(String(y));
  return years;
})();

/**
 * Set read dates for a whole shelf at once.
 *
 * Doing this one book at a time means opening, picking and saving thirty
 * times. Books are grouped by series because a series is usually read in a
 * burst, so one choice can cover eight books - which is the difference between
 * this being worth doing and not.
 */
ctx.actions.openDates = (profile) => {
  const library = state.libraries[profile.id] ?? { books: [] };
  const undated = library.books.filter(
    (b) => (b.status === 'read' || b.status === 'abandoned') && !readOnOf(b));

  const dialog = document.getElementById('dates-dialog');
  document.getElementById('dates-title').textContent =
    `When did ${profile.name} read these?`;
  const body = clear(document.getElementById('dates-body'));

  if (!undated.length) {
    body.append(h('p', { class: 'hint', text: 'Every finished book already has a read date.' }));
    dialog.showModal();
    return;
  }

  // book id -> chosen "YYYY" or "YYYY-MM"
  const picked = new Map();

  // Group by series; standalones last, as one pseudo-group.
  const groups = new Map();
  for (const b of undated) {
    const key = b.series?.id ?? '__standalone';
    if (!groups.has(key)) {
      groups.set(key, { name: b.series?.name ?? 'Standalones', books: [], standalone: !b.series?.id });
    }
    groups.get(key).books.push(b);
  }
  const ordered = [...groups.values()].sort((a, b) =>
    Number(a.standalone) - Number(b.standalone) || b.books.length - a.books.length);

  const rows = new Map(); // book id -> its two selects, so "set all" can update them

  const select = (options, placeholder, onChange) => {
    const el = h('select', { onchange: (e) => onChange(e.target.value) },
      h('option', { value: '' }, placeholder),
      options.map(([value, label]) => h('option', { value }, label)));
    return el;
  };

  const monthOptions = MONTHS.map((name, i) => [String(i + 1).padStart(2, '0'), name]);

  const setFor = (book, year, month) => {
    picked.set(book.id, !year ? null : month ? `${year}-${month}` : year);
    const pair = rows.get(book.id);
    if (pair) { pair.year.value = year ?? ''; pair.month.value = month ?? ''; }
    count();
  };

  body.append(h('p', { class: 'hint',
    text: `${undated.length} finished book${undated.length === 1 ? '' : 's'} with no read date. A year on its own is enough — set a whole series at once with the dropdown beside its name.` }));

  for (const group of ordered) {
    const applyAll = h('select', {
      'aria-label': `Set the year for all of ${group.name}`,
      onchange: (e) => {
        const year = e.target.value;
        for (const b of group.books) setFor(b, year || null, null);
        e.target.value = '';
      },
    },
      h('option', { value: '' }, 'Set all…'),
      YEAR_OPTIONS.map((y) => h('option', { value: y }, y)));

    const list = h('div', { class: 'date-rows' });
    for (const b of group.books) {
      let year = '';
      let month = '';
      const yearSel = select(YEAR_OPTIONS.map((y) => [y, y]), 'Year…', (v) => {
        year = v; if (!v) month = '';
        setFor(b, year || null, month || null);
      });
      const monthSel = select(monthOptions, 'Month', (v) => {
        month = v;
        setFor(b, year || null, month || null);
      });
      rows.set(b.id, { year: yearSel, month: monthSel });

      list.append(h('div', { class: 'date-row' },
        h('span', { class: 'date-title', title: b.title },
          b.title,
          b.series?.position != null ? h('span', { class: 'count', text: ` #${b.series.position}` }) : null),
        yearSel, monthSel));
    }

    body.append(h('div', { class: 'date-group' },
      h('div', { class: 'date-group-head' },
        h('strong', { text: group.name }),
        h('span', { class: 'count', text: String(group.books.length) }),
        h('div', { class: 'spacer' }),
        applyAll),
      list));
  }

  const status = h('span', { class: 'count' });
  const saveBtn = h('button', { class: 'btn', type: 'button', disabled: true,
    onclick: () => applyDates(profile, picked) }, 'Save dates');

  function count() {
    const n = [...picked.values()].filter(Boolean).length;
    status.textContent = n ? `${n} of ${undated.length} set` : 'nothing set yet';
    saveBtn.disabled = n === 0;
  }
  count();

  body.append(h('div', { class: 'row end dates-foot' }, status, saveBtn));
  dialog.showModal();
};

async function applyDates(profile, picked) {
  const chosen = [...picked.entries()].filter(([, v]) => v);
  if (!chosen.length) return;

  const ok = await saveLibrary(profile.id, (lib) => {
    for (const [id, readOn] of chosen) {
      const book = lib.books.find((b) => b.id === id);
      // Only fills the simplified read date; exact started/finished are left
      // alone, since this screen never claimed to know them.
      if (book) book.readOn = readOn;
    }
    return lib;
  }, `Set read dates for ${profile.name}`);

  if (ok) {
    document.getElementById('dates-dialog').close();
    toast(`Read ${chosen.length === 1 ? 'date' : 'dates'} saved for ${chosen.length} book${chosen.length === 1 ? '' : 's'}`);
  }
}

/* ------------------------------------------------------------- mark as seen */

/**
 * Run the release check on demand, then reload the data it rewrote.
 *
 * It walks every watched series, so it takes a few seconds - the button says
 * what it is doing rather than appearing to hang.
 */
ctx.actions.checkNow = async (button) => {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Checking…';
  try {
    const result = await storage.runCheckNow();

    // The check rewrote the watch state and the event log; pull them back in.
    await loadWatchState();
    render();

    // A first look at a series is deliberately silent (it would otherwise
    // announce the whole backlist), so "no events" is not the same as
    // "nothing happened" - say what was actually found.
    const checked = `${result.checkedSeries} series checked`;
    let message;
    if (result.events) {
      message = `${checked} — ${result.events} update${result.events === 1 ? '' : 's'}, see What's new`;
    } else if (result.newSeries) {
      message = `${checked} — ${result.newSeries} newly tracked, ${result.upcoming} release${result.upcoming === 1 ? '' : 's'} coming`;
    } else {
      message = `${checked} — nothing new since last time`;
    }
    toast(message);
    if (result.failures?.length) {
      console.warn('Series that could not be checked:', result.failures);
    }
  } catch (err) {
    toast(friendlyError(err, { saving: false }), true);
    button.disabled = false;
    button.textContent = original;
  }
};

ctx.actions.markSeen = async (profile) => {
  try {
    const next = await storage.mutateJSON('profiles.json', { profiles: [] }, (data) => {
      const p = data.profiles.find((x) => x.id === profile.id);
      if (p) p.lastSeen = new Date().toISOString();
      return data;
    }, `Mark ${profile.name}'s news as read`);
    state.profiles = next.profiles;
    render();
  } catch (err) {
    toast(friendlyError(err), true);
  }
};

/* ---------------------------------------------------------------- settings */

function openSettings() {
  const dialog = document.getElementById('settings-dialog');
  const body = clear(document.getElementById('settings-body'));
  const cfg = storage.getConfig();
  const draft = { ...cfg };

  body.append(
    h('p', { class: 'hint', text: {
      local: 'Running locally: changes are written straight to the files on disk.',
      live: 'Everything is set up — anyone with this link can add books. Nothing to configure.',
      token: 'Saving with a GitHub token stored in this browser.',
      'read-only': 'This site is not connected to its backend yet, so nothing can be saved.',
    }[storage.writeMode()] }),

    // With the backend connected there is genuinely nothing to set, and a
    // form of token fields made it look as if there was. They stay reachable
    // for running the site without the Worker.
    h('details', { class: 'optional', ...(['token', 'read-only'].includes(storage.writeMode()) ? { open: true } : {}) },
      h('summary', { text: 'Advanced: use your own tokens' }),
      h('label', { class: 'field' }, h('span', { text: 'Hardcover API token (for searching)' }),
        h('input', { type: 'text', value: cfg.hardcover, placeholder: 'hc_pat_…', autocomplete: 'off',
          oninput: (e) => { draft.hardcover = e.target.value.trim(); } })),

      !storage.isLocal && h('label', { class: 'field' }, h('span', { text: 'GitHub repo' }),
        h('input', { type: 'text', value: cfg.repo, placeholder: 'user/bookshelf', autocomplete: 'off',
          oninput: (e) => { draft.repo = e.target.value.trim(); } })),

      !storage.isLocal && h('label', { class: 'field' }, h('span', { text: 'GitHub token (Contents: read and write)' }),
        h('input', { type: 'text', value: cfg.token, placeholder: 'github_pat_…', autocomplete: 'off',
          oninput: (e) => { draft.token = e.target.value.trim(); } })),

      h('p', { class: 'hint', text: 'Anything entered here stays in this browser and is never committed to the repo — which is public.' })),

    h('div', { class: 'row end' },
      h('button', { class: 'btn', type: 'button', onclick: () => {
        storage.setConfig(draft);
        state.canWrite = storage.canWrite();
        dialog.close();
        toast('Settings saved');
        render();
      } }, 'Save')));

  dialog.showModal();
}

boot();
