/**
 * The bookshelf: each profile's landing page.
 *
 * Every book standing in a wooden case, arranged the way a person would shelve
 * them (core/arrange.js): a series together and in order, an author's books
 * together, authors gathered by genre - each genre opening with an engraved
 * bookend. Spines are coloured per series, so a set reads as a
 * set. Books being read stand proud with a ribbon; books not yet read are
 * crisp and new.
 *
 * Books drop onto the shelves on arrival, lift on hover with a peek at the
 * cover, and open on click.
 *
 * The order on the shelves is a list of keys (core/arrange.js). Someone can
 * rearrange it by hand - books, ornaments and trophies - and that order is
 * saved with their shelf; new books still slot in beside their series. Under
 * the shelves, a glass cabinet holds a trophy for every finished series.
 * Around the case, the room (room.js) follows the time of day.
 */

import { h, fill, coverEl, authorNames, seriesLabel, starsEl, countUp, toast } from './dom.js';
import { arrangeShelf, shelfOrder, MORE, mergeLayout, placeTrophies, shelvable, keyOfShelf } from '../core/arrange.js';
import { readOnOf, cleanTags, isAudiobook, audioHours, today, lookOf, seasonOf, isFavourite } from '../core/model.js';
import { earnedBadges } from '../core/badges.js';
import { badgeStamp } from './badges.js';
import { sigilMark } from './sigil.js';
import { completedSeries } from '../core/watch.js';
import { shelfPalette, emptyArt, ornament, ORNAMENT_CHOICES, trinketFor, trinketArt } from './art.js';
import { avatar } from './together.js';
import { roomBox, roomFront, cornerPlant, fitRoom, sceneSwitch, hangingBasket, lightRoom } from './room.js';
import { playRoom } from './sound.js';
import { enableDrag, readShelves, readTop } from './shelfdrag.js';
import { THEMES_ON } from './themes.js';

const FILTERS = [['all', 'Everything'], ['read', 'Read'], ['reading', 'Reading'], ['tbr', 'To read']];
const ARRANGE = [['shelf', 'By genre'], ['author', 'By author'], ['rainbow', 'Rainbow']];
const prefs = { filter: 'all', arrange: 'shelf' };
try { Object.assign(prefs, JSON.parse(sessionStorage.getItem('bookshelf.library') ?? '{}')); } catch { /* private mode */ }
const savePrefs = () => { try { sessionStorage.setItem('bookshelf.library', JSON.stringify(prefs)); } catch { /* ignore */ } };

const paletteKey = (b) => (b.series?.id ? `series:${b.series.id}`
  : `author:${b.authors?.[0]?.id ?? b.authors?.[0]?.name ?? b.title}`);

export function libraryView(ctx, profile) {
  const library = ctx.state.libraries[profile.id] ?? { books: [] };
  const all = shelvable(library.books);
  const byId = new Map(all.map((b) => [b.id, b]));
  const canWrite = ctx.state.canWrite;
  const animate = ctx.state.navigated && !matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Only on your own shelf; a friend's is to look at.
  const addBtn = canWrite ? h('button', { class: 'btn', type: 'button',
    onclick: () => ctx.actions.openAdd(profile) }, '+ Add a book') : null;
  const booksBtn = h('button', { class: 'btn secondary', type: 'button',
    title: 'The same books as a list', onclick: () => { location.hash = `#/p/${profile.id}/shelf`; } }, 'List view');

  // Which books, how they are arranged, the room, and moving them by hand:
  // all behind one button, so the controls take no room from the books.
  const menuBadge = h('span', { class: 'arrange-badge' });
  const rearrangeBtn = h('button', {
    class: 'btn secondary rearrange-btn', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
    title: 'Which books, how they stand, the room', onclick: (e) => { e.stopPropagation(); toggleMenu(); },
  }, h('span', { class: 'ico ico-move', 'aria-hidden': 'true' }), 'Arrange', menuBadge);
  const menu = h('div', { class: 'arrange-menu', role: 'dialog', 'aria-label': 'Arrange the shelf', hidden: true });
  const menuWrap = h('div', { class: 'arrange-wrap' }, rearrangeBtn, menu);
  function toggleMenu(open = menu.hidden) {
    menu.hidden = !open;
    rearrangeBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      paintMenu();
      const away = (e) => {
        if (menuWrap.contains(e.target)) return;
        toggleMenu(false);
        document.removeEventListener('pointerdown', away, true);
      };
      setTimeout(() => document.addEventListener('pointerdown', away, true));
    }
  }

  const n = (k) => all.filter((b) => b.status === k).length;
  const stat = (value, label) => {
    const num = h('strong', { text: String(value) });
    if (animate) countUp(num, value);
    return h('span', { class: 'lib-stat' }, num, ` ${label}`);
  };

  const head = h('header', { class: 'lib-head', style: `--who:${profile.colour ?? 'var(--accent)'}` },
    avatar(profile, { size: 'xl' }),
    h('div', { class: 'lib-title' },
      h('div', { class: 'eyebrow', text: 'The bookshelf' }),
      h('h1', { text: `${profile.name}’s shelf` }),
      h('div', { class: 'lib-stats' }, stat(all.length, all.length === 1 ? 'book' : 'books'),
        stat(n('read'), 'read'), stat(n('reading'), 'reading'), stat(n('tbr'), 'to read'))),
    h('div', { class: 'spacer' }),
    h('div', { class: 'lib-actions' },
      // Colours, type, the room and the seasons (decorate.js).
      canWrite && THEMES_ON ? h('button', { class: 'btn secondary lib-decorate', type: 'button',
        title: `Change ${profile.name}’s colours, type and room`, onclick: () => ctx.actions.openDecorate(profile) },
      h('span', { class: 'ico ico-palette', 'aria-hidden': 'true' }), 'Decorate') : null,
      menuWrap, booksBtn, addBtn));

  if (!all.length) {
    return h('div', { class: 'library' }, head,
      emptyArt('books', `${profile.name}’s shelf is empty. Add the book you are reading now and it will be the first one here.`));
  }

  // One palette for the whole shelf, so no two series share a colour.
  const colourOf = shelfPalette(all);

  // Trophies: one per series where every book is out and read.
  // The trinket follows the shelf the series stands on ("Epic Fantasy"), then
  // its books' own tags - Hardcover tags plenty of fantasy as science fiction too.
  const shelfGenre = new Map();
  for (const section of arrangeShelf(all.filter((b) => b.status !== 'tbr'))) {
    for (const b of shelfOrder([section])) shelfGenre.set(b.id, section.genre);
  }
  const trophies = new Map(completedSeries(ctx.state.seriesState ?? {}, library, today()).map((s) => {
    const books = all.filter((b) => b.series?.id === s.id);
    const onShelf = books.map((b) => shelfGenre.get(b.id)).filter((g) => g && g !== MORE);
    return [String(s.id), { id: s.id, name: s.name.split(':')[0].trim(), fullName: s.name, count: s.slots.length,
      kind: trinketFor(onShelf.length ? onShelf : books.flatMap((b) => cleanTags(b.genres, 6))),
      colour: colourOf(books[0] ?? { series: { id: s.id } }).cloth }];
  }));

  // Each arrangement - by genre, by author - keeps its own saved layout.
  const mode = () => (prefs.arrange === 'author' ? 'author' : 'genre');
  const savedLayout = () => (mode() === 'author' ? library.shelfLayoutAuthor : library.shelfLayout);
  /** The shelves as they stand: the saved arrangement brought up to date, or the automatic one. */
  const currentLayout = () => placeTrophies(mergeLayout(savedLayout(), all, mode()), [...trophies.keys()]);

  let editing = null; // a working copy of the layout while rearranging
  const caseBox = h('div', { class: 'bookcase' });
  const tools = h('div', { class: 'lib-tools' });
  // The owner's room and its options (their look), or a preview of one
  // being decorated. The switch above it changes the owner's room.
  activeLook = ctx.state.lookPreview?.[profile.id] ?? lookOf(profile);
  activeBadges = earnedBadges(library, ctx.state.awards);
  playRoom(activeLook.room);
  const scenes = sceneSwitch(activeLook.room, (id) => {
    activeLook = { ...activeLook, room: id };
    playRoom(id);
    redrawRoom();
    if (canWrite && !ctx.state.lookPreview?.[profile.id]) ctx.actions.saveLook(profile, { room: id }, { quiet: true });
  });
  const root = h('div', { class: 'library' }, head, tools, caseBox, legend());
  const relight = lightRoom(root);

  const chips = (items, current, set, label) => h('div', { class: 'seg', role: 'tablist', 'aria-label': label },
    items.map(([id, text]) => h('button', {
      class: 'seg-btn', type: 'button', role: 'tab', 'aria-selected': String(id === current()),
      onclick: (e) => {
        set(id);
        for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-selected', String(b === e.currentTarget));
        savePrefs();
        paintTools();
        paintMenu();
        paint(true);
      },
    }, text)));

  function paintMenu() {
    const section = (label, ...content) => h('div', { class: 'am-section' }, h('div', { class: 'am-label', text: label }), content);
    fill(menu,
      section('Show', chips(FILTERS, () => prefs.filter, (v) => { prefs.filter = v; }, 'Which books')),
      section('Arrange by', chips(ARRANGE, () => prefs.arrange, (v) => { prefs.arrange = v; }, 'How to arrange them')),
      section('Room', scenes),
      canWrite ? h('button', { class: 'btn small am-move', type: 'button', onclick: () => { toggleMenu(false); startEditing(); } },
        h('span', { class: 'ico ico-move', 'aria-hidden': 'true' }), 'Move books by hand') : null);
  }

  function paintTools() {
    // The Arrange button is hidden while moving books by hand.
    menuWrap.hidden = Boolean(editing);
    // Off the default view, the button says so.
    menuBadge.textContent = prefs.filter !== 'all' ? ` · ${FILTERS.find(([id]) => id === prefs.filter)[1]}` : '';
    if (editing) {
      fill(tools,
        h('p', { class: 'edit-hint' }, h('strong', { text: 'Rearranging. ' }),
          'Drag books, ornaments and trophies anywhere — up to two ornaments can go on top of the case. Rename, move or remove a shelf from the bar above it. Double-click an ornament to swap it.'),
        h('div', { class: 'spacer' }),
        h('div', { class: 'row edit-actions' },
          h('button', { class: 'btn secondary small', type: 'button', onclick: addShelf }, '+ Shelf'),
          h('button', { class: 'btn secondary small', type: 'button', onclick: addOrnament }, '+ Ornament'),
          h('button', { class: 'btn secondary small', type: 'button', onclick: resetLayout,
            title: 'Put everything back in the automatic order' }, 'Reset'),
          h('button', { class: 'btn secondary small', type: 'button', onclick: () => stopEditing() }, 'Cancel'),
          h('button', { class: 'btn small', type: 'button', onclick: saveEditing }, 'Save shelf')));
      return;
    }
    fill(tools);
  }

  /* ------------------------------------------------------------ rearranging */

  function startEditing() {
    // A rainbow cannot be rearranged; go back to the shelves first.
    if (prefs.arrange === 'rainbow') { prefs.arrange = 'shelf'; savePrefs(); }
    editing = currentLayout();
    root.classList.add('editing');
    paintTools();
    paint(false);
  }
  function stopEditing() {
    editing = null;
    root.classList.remove('editing');
    paintTools();
    paint(false);
  }
  async function saveEditing(e) {
    const button = e.currentTarget;
    button.disabled = true;
    if (await ctx.actions.saveShelfLayout(profile, editing, mode())) toast('Shelf saved — new books will slot in beside their series.');
    else button.disabled = false;
  }
  async function resetLayout() {
    if (!confirm('Put every book, ornament and shelf back in the automatic order?')) return;
    if (savedLayout()) await ctx.actions.saveShelfLayout(profile, null, mode());
    else stopEditing();
  }
  function addOrnament() {
    const id = nextOrnamentId(editing);
    editing.ornaments[id] = 'plant';
    const first = editing.shelves.find((s) => s.kind !== 'cabinet');
    first.keys.splice(1, 0, `o:${id}`);
    paint(false);
    toast('A plant is on the first shelf — drag it where you like, or double-click it to change it.');
  }

  /** Swap an ornament for another kind, or take it off the shelf. */
  async function changeOrnament(id, kind) {
    if (editing) {
      if (kind) editing.ornaments[id] = kind;
      else removeOrnament(editing, id);
      paint(false);
      return;
    }
    const layout = currentLayout();
    if (kind) layout.ornaments[id] = kind;
    else removeOrnament(layout, id);
    await ctx.actions.saveShelfLayout(profile, layout, mode());
  }

  /* -- shelves themselves: add, rename, move, remove (while rearranging) -- */

  /** The order on screen first, so a shelf change never undoes a drag. */
  const syncFromScreen = () => {
    const wrap = caseBox.querySelector('.case-wrap');
    if (wrap) editing = { ...editing, shelves: readShelves(wrap, editing.shelves), top: readTop(wrap) };
  };
  function addShelf() {
    syncFromScreen();
    const at = Math.max(0, editing.shelves.findIndex((sh) => sh.kind === 'pile'));
    editing.shelves.splice(at, 0, { title: 'New shelf', kind: 'genre', key: `own:${Date.now().toString(36)}`, keys: ['e:New shelf'] });
    paint(false);
    toast('A new shelf is above the to-read pile — rename it from the bar above it, and drag books onto it.');
  }
  function renameShelf(n, title) {
    syncFromScreen();
    const clean = String(title ?? '').trim().slice(0, 40);
    if (!clean) return;
    const shelf = editing.shelves[n];
    // The shelf keeps its key, so it goes on gathering the books it was made for.
    editing.shelves[n] = { ...shelf, key: shelf.key ?? keyOfShelf(shelf), title: clean,
      keys: shelf.keys.map((k) => (k.startsWith('e:') ? `e:${clean}` : k)) };
    paint(false);
  }
  function moveShelf(n, by) {
    syncFromScreen();
    const to = n + by;
    const target = editing.shelves[to];
    if (!target || target.kind === 'cabinet') return;
    const list = [...editing.shelves];
    [list[n], list[to]] = [list[to], list[n]];
    editing = { ...editing, shelves: list };
    paint(false);
  }
  function removeShelf(n) {
    syncFromScreen();
    const shelf = editing.shelves[n];
    const keep = shelf.keys.filter((k) => !k.startsWith('e:'));
    // Whatever was on it moves to the shelf above (or below, for the first).
    const into = editing.shelves[n - 1] && editing.shelves[n - 1].kind !== 'cabinet' ? n - 1 : n + 1;
    const list = editing.shelves.map((sh, k) => (k === into ? { ...sh, keys: [...sh.keys, ...keep] } : sh)).filter((_, k) => k !== n);
    editing = { ...editing, shelves: list };
    paint(false);
    if (keep.some((k) => k.startsWith('b:'))) toast(`Removed “${shelf.title}” — its books moved to the next shelf.`);
  }

  /* ---------------------------------------------------------------- drawing */

  function paint(withMotion) {
    const filter = editing ? 'all' : prefs.filter;
    const visible = (b) => b && (filter === 'all' || b.status === filter);
    let i = 0;
    const spine = (b) => spineEl(ctx, profile, b, colourOf(b), withMotion ? i++ : null, Boolean(editing));
    const layout = editing ?? currentLayout();
    const ornamentEl = (id) => {
      const el = ornament(layout.ornaments[id] ?? 'plant');
      el.dataset.key = `o:${id}`;
      if (canWrite) {
        el.title = 'Double-click to change';
        el.addEventListener('dblclick', (e) => {
          e.preventDefault();
          ornamentMenu(el, layout.ornaments[id], (kind) => changeOrnament(id, kind));
        });
      }
      return el;
    };

    if (prefs.arrange === 'rainbow' && !editing) {
      const books = all.filter(visible);
      if (!books.length) { fill(caseBox, bookcase([emptyBlock()], relight)); requestAnimationFrame(() => fitRoom(caseBox.querySelector('.room'))); return relight(); }
      // Sorted by spine colour: a shelf you'd photograph.
      const sorted = [...books].sort((a, b) => hue(colourOf(a).cloth) - hue(colourOf(b).cloth));
      fill(caseBox, bookcase([shelfBlock('Rainbow', sorted.length,
        [h('div', { class: 'shelf-group' }, sorted.map(spine))], [ornament('plant')])], relight));
      requestAnimationFrame(() => fitRoom(caseBox.querySelector('.room')));
      return relight();
    }

    const blocks = layout.shelves.map((shelf, n) => {
      const books = shelf.keys.filter((k) => k.startsWith('b:')).map((k) => byId.get(k.slice(2))).filter(visible);
      if (shelf.kind === 'cabinet') return filter === 'all' ? cabinetBlock(shelf, n) : null;
      if (!books.length && filter !== 'all' && !editing) return null;

      const items = [];
      let run = null; // consecutive books of one series (or one author's standalones) stand as a group
      const flush = () => {
        if (!run) return;
        const g = run;
        run = null;
        const first = g.books[0];
        items.push(h('div', { class: 'shelf-group', title: first.series?.name ?? `${authorNames(first)} — standalones` },
          g.books.map(spine),
          // A label on the plank under a series - only where it can be read.
          first.series?.name && g.books.length >= 3 ? h('span', { class: 'shelf-mark', text: first.series.name }) : null));
      };
      for (const key of shelf.keys) {
        if (key.startsWith('e:')) continue;
        if (key.startsWith('b:')) {
          const b = byId.get(key.slice(2));
          if (!visible(b)) continue;
          // Rearranging: every book is its own item to pick up.
          if (editing) { items.push(spine(b)); continue; }
          if (run && run.key === paletteKey(b)) run.books.push(b);
          else { flush(); run = { key: paletteKey(b), books: [b] }; }
          continue;
        }
        flush();
        if (key.startsWith('o:')) items.push(ornamentEl(key.slice(2)));
        else if (key.startsWith('t:') && trophies.has(key.slice(2))) items.push(trophyEl(trophies.get(key.slice(2))));
      }
      flush();

      if (shelf.kind === 'pile' && !books.length && !editing) {
        items.unshift(h('div', { class: 'pile-empty' },
          h('span', { text: 'Nothing on the pile yet.' }),
          h('button', { class: 'btn secondary small', type: 'button', onclick: () => ctx.actions.goSuggest(profile) },
            h('span', { class: 'ico ico-sparkle', 'aria-hidden': 'true' }), 'Suggest a book')));
      }
      const block = shelfBlock(shelf.title, books.length, items, null, shelf.kind, n);
      if (editing) block.prepend(shelfBar(shelf, n));
      return block;
    }).filter(Boolean);

    // The trophy cabinet hangs under the case rather than standing in it.
    const cabinet = blocks.find((b) => b.classList.contains('cabinet')) ?? null;
    const shelves = blocks.filter((b) => b !== cabinet);
    // Up to two ornaments on top of the case.
    const top = h('div', { class: 'case-top', dataset: { zone: 'top', accept: 'o', max: '2' } },
      (layout.top ?? []).map((k) => ornamentEl(k.slice(2))));
    fill(caseBox, bookcase(shelves.length ? shelves : [emptyBlock()], relight, cabinet, top));
    relight();
    requestAnimationFrame(() => { tidyLines(caseBox, Boolean(editing)); fitRoom(caseBox.querySelector('.room')); });
    if (editing) {
      const wrap = caseBox.querySelector('.case-wrap');
      enableDrag(wrap, { onDrop: () => { editing = { ...editing, shelves: readShelves(wrap, editing.shelves), top: readTop(wrap) }; } });
    }
  }

  /** The glass-fronted cabinet under the shelves, where finished series earn a trophy. */
  function cabinetBlock(shelf, n) {
    const items = shelf.keys.filter((k) => k.startsWith('t:') && trophies.has(k.slice(2)))
      .map((k) => trophyEl(trophies.get(k.slice(2))));
    const placedElsewhere = trophies.size > items.length;
    return h('section', { class: 'shelf-block cabinet', dataset: { shelf: String(n) }, 'aria-label': 'Trophies' },
      items.length ? items : h('p', { class: 'cabinet-empty', text: placedElsewhere
        ? 'The trophies are out on the shelves.'
        : 'Finish every book in a series and its trophy stands up here.' }));
  }

  function trophyEl(t) {
    return h('button', {
      class: `trophy ${t.kind}`, type: 'button', dataset: { key: `t:${t.id}` },
      title: `Finished ${t.fullName} — all ${t.count} books`,
      'aria-label': `Trophy: finished ${t.fullName}`,
      onclick: () => { if (!editing) location.hash = `#/series/${t.id}`; },
    }, trinketArt(t.kind, t.colour), h('span', { class: 'trophy-plaque' }, h('span', { text: t.name })));
  }

  /** The bar over a shelf while rearranging: its name to edit, and move up, move down, remove. */
  function shelfBar(shelf, n) {
    const shelvesNow = editing.shelves;
    const name = h('input', { type: 'text', class: 'shelf-name', value: shelf.title, maxlength: '40', 'aria-label': 'Shelf name',
      onchange: (e) => renameShelf(n, e.target.value),
      onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } });
    const canUp = n > 0;
    const canDown = shelvesNow[n + 1] && shelvesNow[n + 1].kind !== 'cabinet';
    return h('div', { class: 'shelf-bar', dataset: { bar: '1' } },
      name,
      h('button', { class: 'bar-btn', type: 'button', title: 'Move this shelf up', 'aria-label': 'Move shelf up', disabled: !canUp, onclick: () => moveShelf(n, -1) }, '↑'),
      h('button', { class: 'bar-btn', type: 'button', title: 'Move this shelf down', 'aria-label': 'Move shelf down', disabled: !canDown, onclick: () => moveShelf(n, 1) }, '↓'),
      shelf.kind === 'pile' ? null : h('button', { class: 'bar-btn danger', type: 'button', title: 'Remove this shelf', 'aria-label': 'Remove shelf',
        onclick: () => removeShelf(n) }, '✕'));
  }

  // Another room picked: redraw what is around the case, not the case.
  function redrawRoom() {
    const room = caseBox.querySelector('.room');
    if (!room) return;
    roomData(room, activeLook);
    room.querySelector('.room-box')?.replaceWith(roomBox(activeLook.room, roomOpts(activeLook)));
    room.querySelector('.room-front')?.replaceWith(roomFront(activeLook.room, relight, roomOpts(activeLook)));
    fitRoom(room);
    relight();
  }

  const emptyBlock = () => h('div', { class: 'shelf-block' }, h('p', { class: 'lib-empty', text: 'No books on this part of the shelf.' }));

  paintTools();
  paint(animate);
  const onResize = () => {
    if (!root.isConnected) return removeEventListener('resize', onResize);
    tidyLines(caseBox, Boolean(editing));
    fitRoom(caseBox.querySelector('.room'));
  };
  addEventListener('resize', onResize);
  return root;
}

/**
 * On a narrow screen a full shelf pushes its plant or cat onto a line of its
 * own, which reads as an empty shelf with a pot on it. Any line made only of
 * ornaments is hidden - except while rearranging, when they must stay
 * reachable.
 */
function tidyLines(box, editing) {
  for (const block of box.querySelectorAll('.shelf-block:not(.cabinet)')) {
    const items = [...block.children];
    for (const el of items) el.classList.remove('wrapped-alone');
    if (editing) continue;
    const lines = new Map();
    for (const el of items) {
      // Everything on a line stands on the same plank, whatever its height.
      const top = Math.round((el.offsetTop + el.offsetHeight) / 40);
      if (!lines.has(top)) lines.set(top, []);
      lines.get(top).push(el);
    }
    for (const line of lines.values()) {
      if (line.every((el) => el.classList.contains('ornament'))) for (const el of line) el.classList.add('wrapped-alone');
    }
  }
}

const nextOrnamentId = (layout) => String(Math.max(0, ...Object.keys(layout.ornaments).map(Number).filter(Number.isFinite)) + 1);

function removeOrnament(layout, id) {
  delete layout.ornaments[id];
  for (const s of layout.shelves) s.keys = s.keys.filter((k) => k !== `o:${id}`);
  layout.top = (layout.top ?? []).filter((k) => k !== `o:${id}`);
}

/**
 * The menu a double-click on an ornament opens: everything it could be
 * instead, each drawn small, and a way to take it off the shelf.
 */
function ornamentMenu(anchor, current, onPick) {
  document.querySelector('.ornament-menu')?.remove();
  const close = () => { menu.remove(); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc); };
  const away = (e) => { if (!menu.contains(e.target)) close(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const menu = h('div', { class: 'ornament-menu', role: 'menu', 'aria-label': 'Change this ornament' },
    h('div', { class: 'om-title', text: 'Swap for…' }),
    h('div', { class: 'om-grid' }, ORNAMENT_CHOICES.map(([kind, label]) => h('button', {
      class: 'om-opt', type: 'button', role: 'menuitemradio', 'aria-checked': String(kind === current), title: label,
      onclick: () => { close(); if (kind !== current) onPick(kind); },
    }, ornament(kind), h('span', { text: label })))),
    h('button', { class: 'om-remove', type: 'button', role: 'menuitem', onclick: () => { close(); onPick(null); } }, 'Take it off the shelf'));
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth;
  const hgt = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  menu.style.top = `${r.top - hgt - 10 > 8 ? r.top - hgt - 10 : Math.min(innerHeight - hgt - 8, r.bottom + 10)}px`;
  setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', esc); });
  menu.querySelector('[aria-checked="true"]')?.focus();
}

/**
 * The case, standing in its room (room.js): a carved top strung with fairy
 * lights and holding up to two ornaments, a basket of trailing ivy hung beside
 * it, the shelves and a plinth. Above it on the back wall, a
 * mantel shelf of trophies; around it, the room (room.js).
 */
function bookcase(blocks, relight, cabinet = null, top = null) {
  const bulbs = Array.from({ length: 14 }, (_, n) => h('span', { class: 'bulb', style: `--n:${n}` }));
  const motes = Array.from({ length: 9 }, (_, n) => h('i', { class: 'mote', style: `--n:${n}` }));
  const scene = activeLook.room;
  const room = h('div', { class: 'room' },
    roomBox(scene, roomOpts(activeLook)),
    roomFront(scene, relight, roomOpts(activeLook)),
    h('div', { class: 'case-wrap' },
      // The trophies stand on a mantel shelf high on the back wall.
      cabinet ? h('div', { class: 'trophy-mantel' }, cabinet,
        // Badges are stamps pressed into the front of the board.
        h('span', { class: 'mantel-board' }, activeBadges.map((b) => badgeStamp(b, { pressed: true }))),
        h('span', { class: 'corbel left', 'aria-hidden': 'true' }), h('span', { class: 'corbel right', 'aria-hidden': 'true' })) : null,
      h('div', { class: 'case' },
        cornerPlant(),
        h('div', { class: 'case-crown', 'aria-hidden': 'true' }, h('div', { class: 'fairy-lights' }, bulbs)),
        top,
        hangingBasket(),
        h('div', { class: 'case-shelves' }, blocks),
        // The light from the window, falling across to the right-hand side.
        h('div', { class: 'case-beam', 'aria-hidden': 'true' }, motes),
        h('div', { class: 'case-light', 'aria-hidden': 'true' }),
        h('div', { class: 'case-plinth', 'aria-hidden': 'true' }))));
  roomData(room, activeLook);
  return room;
}

/**
 * The look of the room being drawn: the owner's, or the one being previewed
 * in the Decorate panel. Set by libraryView before anything is drawn.
 */
let activeLook = lookOf({});

/** The room's options as attributes the CSS reads: walls, rug, seasons. */
function roomData(room, look) {
  room.dataset.scene = look.room;
  room.dataset.wall = look.wall;
  room.dataset.rug = look.rug;
  if (look.seasons) room.dataset.season = seasonOf(); else delete room.dataset.season;
}

/** The owner's badges, for the mantel. Set by libraryView with the look. */
let activeBadges = [];

/** What room.js needs to know beyond which room it is. */
const roomOpts = (look) => ({ lamp: look.lamp, season: look.seasons ? seasonOf() : null });

/** One stretch of shelving: a bookend with its name, the books, an ornament. */
function shelfBlock(title, count, items, decoration, kind = '', n = null) {
  return h('section', {
    class: `shelf-block ${kind}`, dataset: n != null ? { shelf: String(n) } : null,
    'aria-label': `${title}, ${count} book${count === 1 ? '' : 's'}`,
  }, bookend(title, count), items, decoration);
}

/** A bookend engraved with the name of the shelf that follows it. */
function bookend(title, count) {
  return h('div', { class: 'bookend', role: 'heading', 'aria-level': '2', 'aria-label': count ? `${title}, ${count} books` : title,
    dataset: { key: `e:${title}` } },
    h('span', { class: 'bookend-text', text: title }));
}

/** A spine for the bookshelf page: same family as the profile header's, with more to say. */
function spineEl(ctx, profile, b, style, order, editing = false) {
  const { cloth, finish } = style;
  const pages = Math.min(b.pages ?? 320, 1300);
  const t = Math.max(0, Math.min(1, (pages - 150) / 1000));
  const pos = b.series?.position;
  const fav = isFavourite(ctx.state.libraries[profile.id], b.id);
  const stamped = activeLook.stamp;
  const label = `${b.title}${seriesLabel(b) ? `, ${seriesLabel(b)}` : ''}${b.rating ? `, rated ${b.rating}` : ''}`
    + (b.status === 'reading' ? ', reading now' : b.status === 'tbr' ? ', to read' : '') + (fav ? ', a favourite' : '');
  const el = h('button', {
    class: `lspine ${finish} ${b.status}${b.rating >= 5 ? ' gilt' : ''}${isAudiobook(b) ? ' audio' : ''}${stamped ? ' stamped' : ''}${fav ? ' fav' : ''}`, type: 'button',
    style: `--h:${Math.round(86 + t * 30)}px;--w:${Math.round(19 + t * 13)}px;--cloth:${cloth}${order != null ? `;--i:${order}` : ''}`,
    'aria-label': label + (isAudiobook(b) ? ', audiobook' : ''),
    dataset: { key: `b:${b.id}` },
    onclick: () => { if (!editing) ctx.actions.openBook(b, profile); },
  },
    h('span', { class: 'lspine-title', text: b.title }),
    isAudiobook(b) ? h('span', { class: 'lspine-audio', 'aria-hidden': 'true', title: 'Audiobook' }) : null,
    pos != null && Number.isInteger(pos) ? h('span', { class: 'lspine-num', text: String(pos) }) : null,
    b.status === 'reading' ? h('span', { class: 'lspine-ribbon', 'aria-hidden': 'true' }) : null,
    // A favourite carries a gold bookmark; every book the owner's sigil, stamped at its foot.
    fav ? h('span', { class: 'lspine-fav', 'aria-hidden': 'true' }) : null,
    stamped ? h('span', { class: 'lspine-stamp', 'aria-hidden': 'true' }, sigilMark(profile)) : null);
  if (order != null) el.classList.add('drop');
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !editing) peek(el, b); });
  el.addEventListener('pointerleave', hidePeek);
  el.addEventListener('focus', () => peek(el, b));
  el.addEventListener('blur', hidePeek);
  return el;
}

/* ---------------------------------------------------------------- peek */

let peekEl = null;

/** A little card above the spine: the cover, the title, where it stands. */
function peek(anchor, b) {
  if (!peekEl) {
    peekEl = h('div', { class: 'spine-peek', 'aria-hidden': 'true' });
    document.body.append(peekEl);
    addEventListener('scroll', hidePeek, { passive: true, capture: true });
  }
  const when = b.status === 'read' && readOnOf(b) ? `Read ${String(readOnOf(b)).slice(0, 4)}` : null;
  fill(peekEl,
    coverEl(b),
    h('div', { class: 'peek-main' },
      h('div', { class: 'peek-title', text: b.title }),
      h('div', { class: 'peek-meta', text: [authorNames(b), seriesLabel(b)].filter(Boolean).join(' · ') }),
      b.rating ? starsEl(b.rating) : null,
      h('div', { class: 'peek-meta', text: [
        { read: 'Finished', reading: 'Reading now', tbr: 'On the to-read pile' }[b.status], when, b.pages ? `${b.pages} pages` : null,
      ].filter(Boolean).join(' · ') }),
      isAudiobook(b) ? h('div', { class: 'peek-meta', text: `🎧 Audiobook${audioHours(b) ? ` · ${audioHours(b)} h` : ''}` }) : null));
  const r = anchor.getBoundingClientRect();
  peekEl.classList.add('show');
  const w = peekEl.offsetWidth;
  const hgt = peekEl.offsetHeight;
  const left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const top = r.top - hgt - 12 > 8 ? r.top - hgt - 12 : r.bottom + 12;
  peekEl.style.left = `${left}px`;
  peekEl.style.top = `${top}px`;
}

function hidePeek() { peekEl?.classList.remove('show'); }

/* -------------------------------------------------------------- legend */

function legend() {
  return h('div', { class: 'lib-legend', 'aria-hidden': 'true' },
    h('span', {}, h('i', { class: 'key series' }), 'Same colour, same series'),
    h('span', {}, h('i', { class: 'key num' }, '3'), 'Number in the series'),
    h('span', {}, h('i', { class: 'key gilt' }), 'Gold bands: five stars'),
    h('span', {}, h('i', { class: 'key ribbon' }), 'Ribbon: reading now'),
    h('span', {}, h('i', { class: 'key tbr' }), 'Crisp and new: to read'),
    h('span', {}, h('i', { class: 'key audio' }), 'Headphones: audiobook'),
    h('span', {}, h('i', { class: 'key fav' }), 'Gold bookmark: a favourite'));
}

/** Hue of a #rrggbb colour, for the rainbow arrangement. */
function hue(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const hh = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (hh * 60 + 360) % 360;
}

