/**
 * App shell: boot, routing, sidebar, dialogs, and the single save path that
 * every mutation goes through.
 */

import { h, clear, fmtDate, fmtReadOn, authorNames, coverEl, seriesLabel, toast } from './dom.js';
import * as storage from './storage.js';
import { createClient, searchBooks, searchViaProxy } from '../core/hardcover.js';
import { bookFromHardcover, deriveWatchlist, applyStatusDates, STATUSES, readOnOf, isValidReadOn, today as todayISO } from '../core/model.js';
import { shelfView, upcomingView, whatsNewView, allUpcomingView, sharedView } from './views.js';
import { statsView } from './stats.js';

const state = {
  profiles: [], libraries: {}, seriesState: {}, events: [],
  route: { view: 'profile', profileId: null, tab: 'shelf' },
  canWrite: false,
};

const ctx = { state, actions: {} };

// Views call this when a display-only preference changes (grouping, say) and
// the data itself is untouched.
ctx.actions.rerender = () => render();

const PROFILE_TABS = [
  ['shelf', 'Shelf'], ['upcoming', 'Upcoming'], ['new', "What's new"], ['stats', 'Stats'],
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
    const { profiles } = await storage.loadJSON('profiles.json', { profiles: [] });
    state.profiles = profiles;
    state.seriesState = await storage.loadJSON('series-state.json', {});
    state.events = await storage.loadEvents();

    for (const p of profiles) {
      state.libraries[p.id] = await storage.loadJSON(
        `profiles/${p.id}/library.json`, { books: [], watch: { series: {}, authors: {} } });
    }
  } catch (err) {
    document.getElementById('main').replaceChildren(
      h('div', { class: 'card' },
        h('h2', { text: 'Could not load your data' }),
        h('p', { text: err.message })));
    return;
  }

  window.addEventListener('hashchange', () => { readRoute(); render(); });
  document.getElementById('open-settings').addEventListener('click', openSettings);
  document.getElementById('menu-toggle').addEventListener('click', toggleMenu);
  wireAddDialog();

  readRoute();
  render();
}

function toggleMenu() {
  const bar = document.getElementById('sidebar');
  const btn = document.getElementById('menu-toggle');
  const open = bar.classList.toggle('open');
  btn.setAttribute('aria-expanded', String(open));
}

/* ----------------------------------------------------------------- routing */

function readRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);

  if (parts[0] === 'upcoming') state.route = { view: 'all-upcoming' };
  else if (parts[0] === 'shared') state.route = { view: 'shared' };
  else if (parts[0] === 'p' && parts[1]) {
    state.route = { view: 'profile', profileId: parts[1], tab: parts[2] ?? 'shelf' };
  } else {
    state.route = { view: 'profile', profileId: state.profiles[0]?.id ?? null, tab: 'shelf' };
  }
}

const go = (hash) => { location.hash = hash; };

/* ------------------------------------------------------------------ render */

function render() {
  renderSidebar();
  const main = clear(document.getElementById('main'));
  document.getElementById('sidebar').classList.remove('open');

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
  main.append(profileTabs(profile, tab));

  const views = {
    shelf: shelfView, upcoming: upcomingView, new: whatsNewView, stats: statsView,
  };
  main.append((views[tab] ?? shelfView)(ctx, profile));
}

function profileTabs(profile, current) {
  return h('div', { class: 'tabs' }, PROFILE_TABS.map(([id, label]) =>
    h('button', {
      class: 'tab', type: 'button', role: 'tab',
      'aria-selected': String(id === current),
      onclick: () => go(`#/p/${profile.id}/${id}`),
    }, label)));
}

function unseenCount(profile) {
  const since = profile.lastSeen;
  return state.events.filter((e) =>
    e.profile === profile.id && (!since || String(e.detectedAt) > since)).length;
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
      h('span', { class: 'dot', style: `background:${p.colour ?? 'var(--accent)'}` }),
      p.name,
      n ? h('span', { class: 'badge', text: String(n) }) : null));
  }
  nav.append(people);

  nav.append(h('div', { class: 'nav-group' },
    h('div', { class: 'nav-label', text: 'Together' }),
    h('button', {
      class: 'nav-item', type: 'button',
      'aria-current': view === 'all-upcoming' ? 'page' : null,
      onclick: () => go('#/upcoming'),
    }, h('span', { text: '📅' }), 'All upcoming'),
    h('button', {
      class: 'nav-item', type: 'button',
      'aria-current': view === 'shared' ? 'page' : null,
      onclick: () => go('#/shared'),
    }, h('span', { text: '👥' }), 'Both of us')));

  const sync = document.getElementById('sync-state');
  sync.textContent = {
    local: 'local · saving to disk',
    live: 'saving',
    token: 'synced to GitHub',
    'read-only': 'read-only',
  }[storage.writeMode()];
}

/* ------------------------------------------------------------------ saving */

/** The single write path. Everything that changes a library comes through here. */
async function saveLibrary(profileId, mutate, message) {
  if (!state.canWrite) {
    toast('Read-only — add a GitHub token in Settings to make changes.', true);
    return false;
  }
  const path = `profiles/${profileId}/library.json`;
  try {
    const next = await storage.mutateJSON(
      path, { books: [], watch: { series: {}, authors: {} } }, mutate, message);
    state.libraries[profileId] = next;
    render();
    return true;
  } catch (err) {
    toast(err.message, true);
    return false;
  }
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
  const results = clear(document.getElementById('add-results'));
  if (query.length < 3) return setHint('Keep typing…');

  const { hardcover, worker } = storage.getConfig();
  if (!worker && !hardcover) return setHint('This site is not connected to its backend yet.', true);

  // Responses can land out of order — a slow "harry" arriving after a fast
  // "potter" would repaint stale results. Only the newest request may draw.
  const seq = ++searchSeq;
  setHint('Searching…');

  try {
    const hits = worker
      ? await searchViaProxy(worker, query, 8)
      : await searchBooks(createClient(hardcover), query, 8);
    if (seq !== searchSeq) return;
    if (!hits.length) return setHint(`Hardcover has nothing for “${query}”.`, true);
    setHint('Pick the right edition — everything else is filled in for you.');

    for (const hit of hits) {
      const bits = [authorNames(hit), seriesLabel(hit), hit.releaseYear].filter(Boolean);
      results.append(h('button', {
        class: 'result', type: 'button',
        onclick: () => chooseStatus(hit),
      },
        coverEl({ cover: hit.image }),
        h('div', { class: 'book-main' },
          h('div', { class: 'book-title', text: hit.title }),
          h('div', { class: 'book-meta', text: bits.join(' · ') }))));
    }
  } catch (err) {
    if (seq === searchSeq) setHint(err.message, true);
  }
}

/** Second step of adding: which shelf does it go on? */
function chooseStatus(hit) {
  const results = clear(document.getElementById('add-results'));
  setHint(`Where does “${hit.title}” go?`);

  const add = async (status) => {
    const book = bookFromHardcover(hit, { status });
    const ok = await saveLibrary(addProfile.id, (lib) => {
      if (lib.books.some((b) => b.id === book.id)) throw new Error('That book is already on this shelf.');
      lib.books.push(book);
      return lib;
    }, `Add ${book.title} for ${addProfile.name}`);

    if (ok) {
      document.getElementById('add-dialog').close();
      const watching = book.series?.id && deriveWatchlist(state.libraries[addProfile.id]).series[book.series.id];
      const started = status === 'reading' ? ' · started today' : '';
      toast(watching
        ? `Added${started} · now watching ${book.series.name}`
        : `Added ${book.title}${started}`);
    }
  };

  results.append(h('div', { class: 'row' },
    h('button', { class: 'btn', type: 'button', onclick: () => add('reading') }, 'Reading now'),
    h('button', { class: 'btn secondary', type: 'button', onclick: () => add('tbr') }, 'Want to read'),
    h('button', { class: 'btn secondary', type: 'button', onclick: () => add('read') }, 'Already read')));
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

  body.append(
    h('div', { class: 'row' },
      coverEl(book),
      h('div', { class: 'book-main' },
        h('div', { class: 'book-meta', text: authorNames(book) }),
        seriesLabel(book) && h('div', { class: 'book-meta', text: seriesLabel(book) }),
        book.pages && h('div', { class: 'book-meta', text: `${book.pages} pages` }),
        book.released && h('div', { class: 'book-meta', text: `Published ${fmtDate(book.released)}` }))),

    h('label', { class: 'field' }, h('span', { text: 'Shelf' }),
      h('select', { onchange: (e) => { draft.status = e.target.value; } },
        STATUSES.map((s) => h('option', { value: s, selected: s === book.status }, s)))),

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

    h('div', { class: 'row end', style: 'margin-top:1rem' },
      h('button', { class: 'btn danger', type: 'button', disabled: !state.canWrite,
        onclick: () => removeBook(profile, book) }, 'Remove'),
      h('button', { class: 'btn', type: 'button', disabled: !state.canWrite,
        onclick: () => applyEdit(profile, book, draft) }, 'Save')));

  dialog.showModal();
};

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

function ratingPicker(draft) {
  const wrap = h('div', { class: 'rating-pick' });
  const paint = () => [...wrap.children].forEach((btn, i) =>
    btn.classList.toggle('on', draft.rating != null && i < draft.rating));
  for (let i = 1; i <= 5; i++) {
    wrap.append(h('button', {
      type: 'button', 'aria-label': `${i} stars`,
      onclick: () => { draft.rating = draft.rating === i ? null : i; paint(); },
    }, '★'));
  }
  paint();
  return wrap;
}

async function applyEdit(profile, book, draft) {
  const ok = await saveLibrary(profile.id, (lib) => {
    const target = lib.books.find((b) => b.id === book.id);
    if (!target) throw new Error('That book is no longer on this shelf.');
    const previous = target.status;
    Object.assign(target, {
      status: draft.status,
      rating: draft.rating,
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
  const ok = await saveLibrary(profile.id,
    (lib) => ({ ...lib, books: lib.books.filter((b) => b.id !== book.id) }),
    `Remove ${book.title}`);
  if (ok) {
    document.getElementById('book-dialog').close();
    toast(`Removed ${book.title}`);
  }
}

/* ------------------------------------------------------------- mark as seen */

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
    toast(err.message, true);
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

    h('label', { class: 'field' }, h('span', { text: 'Hardcover API token (for searching)' }),
      h('input', { type: 'text', value: cfg.hardcover, placeholder: 'hc_pat_…', autocomplete: 'off',
        oninput: (e) => { draft.hardcover = e.target.value.trim(); } })),

    !storage.isLocal && h('label', { class: 'field' }, h('span', { text: 'GitHub repo' }),
      h('input', { type: 'text', value: cfg.repo, placeholder: 'user/bookshelf', autocomplete: 'off',
        oninput: (e) => { draft.repo = e.target.value.trim(); } })),

    !storage.isLocal && h('label', { class: 'field' }, h('span', { text: 'GitHub token (Contents: read and write)' }),
      h('input', { type: 'text', value: cfg.token, placeholder: 'github_pat_…', autocomplete: 'off',
        oninput: (e) => { draft.token = e.target.value.trim(); } })),

    h('p', { class: 'hint', text: 'Anything entered here stays in this browser and is never committed to the repo — which is public.' }),

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
