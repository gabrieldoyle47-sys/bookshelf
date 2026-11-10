/**
 * The bell: what's happened since you last looked.
 *
 * Friends starting and finishing books, reactions to your ratings and
 * finishes, books recommended to you, and release news come from what the
 * site already has (the shelves it loaded). Club posts, reads, suggestions,
 * meetings and invitations, reservations on your wishlist and friend
 * requests come from the API (/notifications).
 *
 * "Seen" is a time kept on your own shelf (notifSeen), so it follows you
 * from phone to laptop. Invitations and friend requests stay in the list
 * until they're answered, but only count as new once.
 */

import { h, fill, fmtAgo, toast } from './dom.js';
import * as storage from './storage.js';
import { sigilEl } from './sigil.js';
import { activity } from '../core/together.js';

let items = [];
let fetched = 0;
let panel = null;

const dayAt = (d) => (String(d).length === 10 ? `${d}T12:00:00.000Z` : String(d));

/** Everything worth telling, newest first. */
function gather(ctx, remote) {
  const { state } = ctx;
  const me = state.me;
  const byId = Object.fromEntries((state.profiles ?? []).map((p) => [p.id, p]));
  const mine = state.libraries[me.id] ?? { books: [] };
  const friendIds = (state.profiles ?? []).map((p) => p.id).filter((id) => id !== me.id);
  const out = [];
  for (const a of activity(state.libraries, friendIds, { limit: 40 })) {
    if (a.type !== 'finished' && a.type !== 'started') continue;
    out.push({ key: `${a.type}:${a.id}:${a.book.id}`, at: dayAt(a.at), by: byId[a.id], icon: a.type === 'finished' ? 'star' : 'book',
      text: [byId[a.id]?.name, a.type === 'finished' ? ' finished ' : ' started ', em(a.book.title), a.rating ? ` · ${a.rating}★` : ''],
      go: `#/p/${a.id}` });
  }
  for (const [bookId, list] of Object.entries(mine.reactions ?? {})) {
    const book = mine.books.find((b) => b.id === bookId);
    for (const r of list) {
      if (!r.by || r.by === me.id) continue;
      out.push({ key: `react:${bookId}:${r.at}`, at: r.at, by: byId[r.by], icon: 'heart',
        text: [byId[r.by]?.name ?? 'Someone', ` reacted ${r.emoji} to ${r.on === 'rating' ? 'your rating of ' : 'you finishing '}`, em(book?.title ?? 'a book')],
        go: `#/p/${me.id}` });
    }
  }
  for (const r of mine.recommendations ?? []) {
    if (r.status !== 'new') continue;
    out.push({ key: `rec:${r.id}`, at: dayAt(r.at), by: byId[r.from], icon: 'bookmark',
      text: [byId[r.from]?.name ?? 'A friend', ' recommended ', em(r.book?.title ?? 'a book')], go: `#/p/${me.id}/recs` });
  }
  const news = ctx.actions.unseenReleases?.() ?? 0;
  if (news) out.push({ key: `news:${news}`, at: new Date().toISOString(), icon: 'lantern', sticky: true,
    text: [`${news} release update${news === 1 ? '' : 's'} — new books and moved dates`], go: `#/p/${me.id}/releases` });
  for (const n of remote) {
    const c = n.club;
    const base = { key: `${n.kind}:${c?.id ?? ''}:${n.at}`, at: n.at, by: n.by, club: c };
    const title = n.book?.title;
    const text = {
      'club-read': [c?.name, ' is reading ', em(title)],
      'club-post': [n.by?.name, ` posted in ${c?.name}`, n.progress ? ` (at ${n.progress}%)` : ''],
      'club-suggest': [n.by?.name, ' suggested ', em(title), ` for ${c?.name}`],
      'club-meet': [n.by?.name, ` offered meeting times for ${c?.name} — say which you can make`],
      'club-meet-set': [`${c?.name} meets `, n.when ? new Date(n.when).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'soon'],
      'club-invite': [n.by?.name ?? 'Someone', ` invited you to ${c?.name}`],
      reserved: [n.by?.name, ' is buying you ', em(mine.books.find((b) => b.id === n.bookId)?.title ?? 'a book on your wishlist')],
      'friend-request': [n.by?.name, ' wants to be friends'],
    }[n.kind];
    if (!text) continue;
    out.push({ ...base, text, sticky: n.kind === 'club-invite' || n.kind === 'friend-request',
      key: n.kind === 'club-invite' ? `invite:${c?.id}` : n.kind === 'friend-request' ? `friend:${n.by?.id}` : base.key,
      icon: { 'club-read': 'book', 'club-post': 'quill', 'club-suggest': 'bookmark', 'club-meet': 'candle', 'club-meet-set': 'candle', 'club-invite': 'key', reserved: 'heart', 'friend-request': 'owl' }[n.kind],
      go: n.kind === 'reserved' ? `#/p/${me.id}` : n.kind === 'friend-request' ? '#/clubs' : `#/club/${c?.id}` });
  }
  return out.filter((x) => x.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 60);
}

const em = (t) => h('em', { text: t ?? '' });

/** Has this one been seen? Time for most; once-only keys for the ones that wait for an answer. */
function isNew(ctx, it) {
  const lib = ctx.state.libraries[ctx.state.me.id] ?? {};
  if (it.sticky) return !(lib.notifKeys ?? []).includes(it.key);
  return !lib.notifSeen || it.at > lib.notifSeen;
}

/** Fetch what the API knows (at most once a minute) and redraw the bell. */
export async function refreshNotifications(ctx, { force = false } = {}) {
  if (!ctx.state.me) return;
  if (!force && Date.now() - fetched < 60e3) return paintBell(ctx);
  fetched = Date.now();
  let remote = [];
  try { remote = await storage.api('/notifications'); } catch { /* the local ones still show */ }
  items = gather(ctx, remote);
  paintBell(ctx);
}

/** The bell button, in the top corner beside your sigil. */
export function paintBell(ctx) {
  if (!ctx.state.me) return;
  let bell = document.getElementById('bell-btn');
  if (!bell) {
    bell = h('button', { id: 'bell-btn', class: 'bell-btn', type: 'button', 'aria-haspopup': 'dialog', onclick: () => togglePanel(ctx) },
      h('span', { class: 'ico ico-bell', 'aria-hidden': 'true' }), h('span', { class: 'bell-count', hidden: true }));
    document.body.append(bell);
  }
  if (!items.length && ctx.state.libraries[ctx.state.me.id]) items = gather(ctx, []);
  const n = items.filter((it) => isNew(ctx, it)).length;
  const count = bell.querySelector('.bell-count');
  count.hidden = !n;
  count.textContent = n > 9 ? '9+' : String(n);
  bell.setAttribute('aria-label', n ? `Notifications, ${n} new` : 'Notifications');
  bell.title = n ? `${n} new` : 'Notifications';
}

function togglePanel(ctx) {
  if (panel) return closePanel();
  const fresh = new Set(items.filter((it) => isNew(ctx, it)).map((it) => it.key));
  panel = h('div', { class: 'notif-panel', role: 'dialog', 'aria-label': 'Notifications' },
    h('div', { class: 'notif-head' }, h('h2', { text: 'Notifications' })),
    items.length ? h('ol', { class: 'notif-list' }, items.map((it) => h('li', {},
      h('button', { class: `notif-item${fresh.has(it.key) ? ' new' : ''}`, type: 'button', onclick: () => { closePanel(); location.hash = it.go; } },
        it.by ? sigilEl(it.by, { size: 'sm' }) : h('span', { class: 'notif-icon', 'aria-hidden': 'true' }),
        h('span', { class: 'notif-text' }, h('span', {}, it.text), h('span', { class: 'count', text: it.sticky ? 'waiting for you' : fmtAgo(it.at.slice(0, 10)) })))))) :
      h('p', { class: 'hint notif-empty', text: 'Nothing new. When friends finish books, clubs post or someone buys you a book, it shows up here.' }));
  document.body.append(panel);
  const away = (e) => { if (!panel?.contains(e.target) && !e.target.closest('#bell-btn')) closePanel(); };
  setTimeout(() => document.addEventListener('pointerdown', away, true));
  panel.away = away;
  // Seen now: everything up to this moment, and the waiting ones once.
  if (fresh.size) {
    const keys = items.filter((it) => it.sticky).map((it) => it.key);
    ctx.actions.markNotificationsSeen?.(new Date().toISOString(), keys).then(() => paintBell(ctx)).catch(() => toast('Could not mark them read.', true));
  }
}

function closePanel() {
  if (!panel) return;
  document.removeEventListener('pointerdown', panel.away, true);
  panel.remove();
  panel = null;
}
