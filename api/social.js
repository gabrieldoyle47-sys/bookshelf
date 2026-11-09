/**
 * The social side of the API: library cards (a member's public summary),
 * privacy, award lookups, book clubs and buddy reads.
 *
 * Everything here is reached through index.js, which has already checked
 * who is signed in; each route checks what that person may see or do.
 */

import { createClient, listBooks, AWARD_LISTS } from '../docs/app/core/hardcover.js';
import { earnedBadges } from '../docs/app/core/badges.js';
import { completedSeries } from '../docs/app/core/watch.js';
import { readOnOf, readYearOf, cleanTags, today } from '../docs/app/core/model.js';
import { newCode } from './auth.js';

export class SocialError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const no = (status, message) => { throw new SocialError(status, message); };

const one = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results ?? [];
const run = (db, sql, ...args) => db.prepare(sql).bind(...args).run();
const nowIso = () => new Date().toISOString();
const parse = (text, fallback = null) => { try { return text ? JSON.parse(text) : fallback; } catch { return fallback; } };
const clean = (text, max) => String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/* -------------------------------------------------------------- privacy */

export const DEFAULT_PRIVACY = { shelf: 'members', notes: 'everyone', ratings: 'everyone' };
export const privacyOf = (u) => ({ ...DEFAULT_PRIVACY, ...parse(u?.privacy, {}) });

/** May the viewer see this part of the owner's shelf? */
export function allowed(level, { self, friend }) {
  if (self) return true;
  if (level === 'me') return false;
  if (level === 'friends') return friend;
  return true;
}

/** A shelf as a particular viewer may see it: notes and ratings removed if the owner keeps them. */
export function shelfFor(library, owner, rel) {
  if (rel.self) return library;
  const p = privacyOf(owner);
  if (!allowed(p.shelf === 'friends' ? 'friends' : 'everyone', rel)) no(403, `${owner.display_name} keeps their shelf for friends.`);
  const notes = allowed(p.notes, rel);
  const ratings = allowed(p.ratings, rel);
  if (notes && ratings) return library;
  return {
    ...library,
    books: (library.books ?? []).map((b) => ({ ...b, ...(notes ? {} : { note: '' }), ...(ratings ? {} : { rating: null }) })),
  };
}

/* --------------------------------------------------------------- awards */

/**
 * The Hardcover ids of books on the award lists, for the award badges.
 * Fetched at most once a week (six calls) and kept in the database.
 */
export async function awardIds(db, env) {
  const cached = parse((await one(db, "SELECT value FROM settings WHERE key = 'award_ids'"))?.value, null);
  if (cached && Date.now() - Date.parse(cached.at) < 7 * 864e5) return new Set(cached.ids);
  try {
    const gql = createClient(env.HARDCOVER_TOKEN);
    const lists = await Promise.all(AWARD_LISTS.map((l) => listBooks(gql, l.id, 400).catch(() => null)));
    const ids = [...new Set(lists.flatMap((l) => (l?.books ?? []).map((b) => String(b.id))))];
    if (ids.length) {
      await run(db, "INSERT INTO settings (key, value) VALUES ('award_ids', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        JSON.stringify({ at: nowIso(), ids }));
      return new Set(ids);
    }
  } catch { /* fall back to the old list, or none */ }
  return new Set(cached?.ids ?? []);
}

/* -------------------------------------------------------- library cards */

/**
 * What a member's library card shows, worked out from their shelf: counts,
 * the stamps of recent returns, what they are reading, their favourites,
 * their badges and trophies. Ratings are left out where the owner hides them.
 */
export function cardSummary(library, owner, rel, { awards, seriesState }) {
  const books = library?.books ?? [];
  const read = books.filter((b) => b.status === 'read');
  const year = Number(today().slice(0, 4));
  const p = privacyOf(owner);
  const ratingsOk = allowed(p.ratings, rel);
  const rated = read.filter((b) => b.rating > 0);
  const genreCounts = new Map();
  for (const b of read) for (const g of cleanTags(b.genres, 2)) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
  const recent = read.filter((b) => readOnOf(b)).sort((a, b) => String(readOnOf(b)).localeCompare(String(readOnOf(a)))).slice(0, 5);
  const favourites = (library?.favourites ?? []).map((id) => books.find((b) => b.id === id)).filter(Boolean);
  const cover = (b) => ({ id: b.id, title: b.title, cover: b.cover ?? null, author: b.authors?.[0]?.name ?? '' });
  return {
    read: read.length,
    thisYear: read.filter((b) => readYearOf(b) === year).length,
    pages: read.reduce((n, b) => n + (b.pages ?? 0), 0),
    toRead: books.filter((b) => b.status === 'tbr').length,
    averageRating: ratingsOk && rated.length ? Math.round((rated.reduce((n, b) => n + b.rating, 0) / rated.length) * 10) / 10 : null,
    topGenre: [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    reading: books.filter((b) => b.status === 'reading').map(cover),
    recent: recent.map((b) => ({ title: b.title, date: readOnOf(b) })),
    favourites: favourites.map(cover),
    badges: earnedBadges(library, awards).map((b) => b.id),
    trophies: completedSeries(seriesState ?? {}, library ?? { books: [] }).map((s) => s.name),
  };
}

/* ---------------------------------------------------------- book clubs */

const CLUB_COLOUR = /^#[0-9a-f]{6}$/i;
const clubIcon = (icon) => clean(icon, 20) || 'book';

async function membership(db, clubId, userId) {
  return one(db, 'SELECT * FROM club_members WHERE club_id = ? AND user_id = ?', clubId, userId);
}

async function needMember(db, clubId, me) {
  const club = await one(db, 'SELECT * FROM clubs WHERE id = ?', clubId);
  if (!club) no(404, 'There is no such club.');
  const m = await membership(db, clubId, me.id);
  if (!m || m.status !== 'member') no(403, 'Only members of the club can do that.');
  return club;
}

async function needHost(db, clubId, me) {
  const club = await needMember(db, clubId, me);
  if (club.host !== me.id) no(403, 'Only the club’s host can do that.');
  return club;
}

/** A book as clubs keep it: just what is needed to show and find it. */
function clubBook(book) {
  if (!book?.title) no(400, 'Which book?');
  return {
    hardcoverId: String(book.hardcoverId ?? book.id ?? '').replace(/^hc:/, ''),
    title: clean(book.title, 200),
    author: clean(book.author ?? book.authors?.[0]?.name ?? '', 120),
    cover: typeof book.cover === 'string' ? book.cover : typeof book.image === 'string' ? book.image : null,
    pages: Number(book.pages) || null,
  };
}

export async function myClubs(db, me) {
  const rows = await all(db, `SELECT c.*, m.status AS my_status, m.invited_by FROM clubs c JOIN club_members m ON m.club_id = c.id
    WHERE m.user_id = ? ORDER BY c.created`, me.id);
  const out = [];
  for (const c of rows) {
    const members = await all(db, "SELECT user_id FROM club_members WHERE club_id = ? AND status = 'member'", c.id);
    out.push({
      id: c.id, name: c.name, description: c.description, icon: c.icon, colour: c.colour, host: c.host,
      current: parse(c.current), members: members.map((m) => m.user_id), status: c.my_status, invitedBy: c.invited_by,
    });
  }
  return out;
}

export async function createClub(db, me, input) {
  const name = clean(input.name, 40);
  if (!name) no(400, 'Give the club a name.');
  const id = newCode(8);
  await run(db, 'INSERT INTO clubs (id, name, description, icon, colour, host, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, name, clean(input.description, 300), clubIcon(input.icon), CLUB_COLOUR.test(input.colour ?? '') ? input.colour : '#a2461f', me.id, nowIso());
  await run(db, "INSERT INTO club_members (club_id, user_id, status, joined) VALUES (?, ?, 'member', ?)", id, me.id, nowIso());
  return { id };
}

export async function clubDetail(db, me, clubId) {
  const club = await one(db, 'SELECT * FROM clubs WHERE id = ?', clubId);
  if (!club) no(404, 'There is no such club.');
  const mine = await membership(db, clubId, me.id);
  if (!mine) no(403, 'You are not in this club.');
  const members = await all(db, `SELECT m.user_id, m.status, m.joined, u.display_name, u.username, u.colour, u.sigil
    FROM club_members m JOIN users u ON u.id = m.user_id WHERE m.club_id = ? AND u.status = 'active'`, clubId);
  const base = {
    id: club.id, name: club.name, description: club.description, icon: club.icon, colour: club.colour, host: club.host,
    created: club.created, myStatus: mine.status,
    members: members.map((m) => ({ id: m.user_id, name: m.display_name, username: m.username, colour: m.colour, sigil: parse(m.sigil), status: m.status, joined: m.joined })),
  };
  // An invitation shows who is in it, nothing more, until it is accepted.
  if (mine.status !== 'member') return base;
  const suggestions = await all(db, 'SELECT * FROM club_suggestions WHERE club_id = ? ORDER BY created', clubId);
  const votes = suggestions.length ? await all(db, `SELECT * FROM club_votes WHERE suggestion_id IN (${suggestions.map(() => '?').join(',')})`, ...suggestions.map((s) => s.id)) : [];
  return {
    ...base,
    current: parse(club.current),
    history: (await all(db, 'SELECT * FROM club_reads WHERE club_id = ? ORDER BY finished DESC', clubId)).map((r) => ({ ...parse(r.book, {}), started: r.started, finished: r.finished })),
    suggestions: suggestions.map((s) => ({ id: s.id, book: parse(s.book, {}), by: s.by, created: s.created,
      votes: votes.filter((v) => v.suggestion_id === s.id).map((v) => v.user_id) })),
    posts: (await all(db, 'SELECT * FROM club_posts WHERE club_id = ? ORDER BY created DESC LIMIT 200', clubId))
      .map((p) => ({ id: p.id, by: p.user_id, bookId: p.book_id, progress: p.progress, text: p.text, created: p.created })),
  };
}

export async function clubAction(db, me, action, input, areFriends) {
  const id = String(input.id ?? '');
  const at = nowIso();
  switch (action) {
    case 'invite': {
      await needMember(db, id, me);
      const who = String(input.user ?? '');
      if (!await areFriends(me.id, who)) no(403, 'You can invite your friends.');
      if (await membership(db, id, who)) return { ok: true };
      await run(db, "INSERT INTO club_members (club_id, user_id, status, invited_by) VALUES (?, ?, 'invited', ?)", id, who, me.id);
      return { ok: true };
    }
    case 'respond': {
      const m = await membership(db, id, me.id);
      if (!m || m.status !== 'invited') no(404, 'There is no invitation.');
      if (input.accept) await run(db, "UPDATE club_members SET status = 'member', joined = ? WHERE club_id = ? AND user_id = ?", at, id, me.id);
      else await run(db, 'DELETE FROM club_members WHERE club_id = ? AND user_id = ?', id, me.id);
      return { ok: true };
    }
    case 'leave': {
      const club = await needMember(db, id, me);
      const others = await all(db, "SELECT user_id FROM club_members WHERE club_id = ? AND status = 'member' AND user_id != ? ORDER BY joined", id, me.id);
      await run(db, 'DELETE FROM club_members WHERE club_id = ? AND user_id = ?', id, me.id);
      // The host leaving hands the club to whoever joined first; the last
      // member leaving closes it.
      if (!others.length) await deleteClub(db, id);
      else if (club.host === me.id) await run(db, 'UPDATE clubs SET host = ? WHERE id = ?', others[0].user_id, id);
      return { ok: true };
    }
    case 'remove': {
      await needHost(db, id, me);
      if (input.user === me.id) no(400, 'Use Leave to leave your own club.');
      await run(db, 'DELETE FROM club_members WHERE club_id = ? AND user_id = ?', id, String(input.user ?? ''));
      return { ok: true };
    }
    case 'host': {
      await needHost(db, id, me);
      const m = await membership(db, id, String(input.user ?? ''));
      if (!m || m.status !== 'member') no(400, 'The new host has to be a member.');
      await run(db, 'UPDATE clubs SET host = ? WHERE id = ?', input.user, id);
      return { ok: true };
    }
    case 'update': {
      await needHost(db, id, me);
      const name = clean(input.name, 40);
      if (!name) no(400, 'Give the club a name.');
      await run(db, 'UPDATE clubs SET name = ?, description = ?, icon = ?, colour = ? WHERE id = ?',
        name, clean(input.description, 300), clubIcon(input.icon), CLUB_COLOUR.test(input.colour ?? '') ? input.colour : '#a2461f', id);
      return { ok: true };
    }
    case 'read': {
      const club = await needHost(db, id, me);
      await finishCurrent(db, club);
      const target = /^\d{4}-\d{2}-\d{2}$/.test(input.target ?? '') ? input.target : null;
      await run(db, 'UPDATE clubs SET current = ? WHERE id = ?', JSON.stringify({ book: clubBook(input.book), target, started: today() }), id);
      return { ok: true };
    }
    case 'finish': {
      const club = await needHost(db, id, me);
      await finishCurrent(db, club);
      await run(db, 'UPDATE clubs SET current = NULL WHERE id = ?', id);
      return { ok: true };
    }
    case 'suggest': {
      await needMember(db, id, me);
      const book = clubBook(input.book);
      const existing = await all(db, 'SELECT book FROM club_suggestions WHERE club_id = ?', id);
      if (existing.some((s) => parse(s.book, {}).hardcoverId === book.hardcoverId)) no(400, 'That book is already suggested.');
      const sid = newCode(10);
      await run(db, 'INSERT INTO club_suggestions (id, club_id, book, by, created) VALUES (?, ?, ?, ?, ?)', sid, id, JSON.stringify(book), me.id, at);
      await run(db, 'INSERT INTO club_votes (suggestion_id, user_id) VALUES (?, ?)', sid, me.id);
      return { ok: true };
    }
    case 'vote': {
      await needMember(db, id, me);
      const s = await one(db, 'SELECT id FROM club_suggestions WHERE id = ? AND club_id = ?', String(input.suggestion ?? ''), id);
      if (!s) no(404, 'That suggestion is gone.');
      const had = await one(db, 'SELECT 1 AS x FROM club_votes WHERE suggestion_id = ? AND user_id = ?', s.id, me.id);
      if (had) await run(db, 'DELETE FROM club_votes WHERE suggestion_id = ? AND user_id = ?', s.id, me.id);
      else await run(db, 'INSERT INTO club_votes (suggestion_id, user_id) VALUES (?, ?)', s.id, me.id);
      return { ok: true };
    }
    case 'pick': {
      const club = await needHost(db, id, me);
      const s = await one(db, 'SELECT * FROM club_suggestions WHERE id = ? AND club_id = ?', String(input.suggestion ?? ''), id);
      if (!s) no(404, 'That suggestion is gone.');
      await finishCurrent(db, club);
      const target = /^\d{4}-\d{2}-\d{2}$/.test(input.target ?? '') ? input.target : null;
      await run(db, 'UPDATE clubs SET current = ? WHERE id = ?', JSON.stringify({ book: parse(s.book, {}), target, started: today() }), id);
      await run(db, 'DELETE FROM club_votes WHERE suggestion_id = ?', s.id);
      await run(db, 'DELETE FROM club_suggestions WHERE id = ?', s.id);
      return { ok: true };
    }
    case 'post': {
      const club = await needMember(db, id, me);
      const text = clean(input.text, 1000);
      if (!text) no(400, 'Write something first.');
      const current = parse(club.current);
      const progress = Math.max(0, Math.min(100, Math.round(Number(input.progress) || 0)));
      await run(db, 'INSERT INTO club_posts (id, club_id, user_id, book_id, progress, text, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
        newCode(12), id, me.id, current?.book?.hardcoverId ?? null, progress, text, at);
      return { ok: true };
    }
    case 'unpost': {
      const club = await needMember(db, id, me);
      const post = await one(db, 'SELECT * FROM club_posts WHERE id = ? AND club_id = ?', String(input.post ?? ''), id);
      if (!post) return { ok: true };
      if (post.user_id !== me.id && club.host !== me.id) no(403, 'Only the poster or the host can remove that.');
      await run(db, 'DELETE FROM club_posts WHERE id = ?', post.id);
      return { ok: true };
    }
    default: no(404, 'not found');
  }
  return { ok: true };
}

async function finishCurrent(db, club) {
  const current = parse(club.current);
  if (!current?.book) return;
  await run(db, 'INSERT INTO club_reads (club_id, book, started, finished) VALUES (?, ?, ?, ?)',
    club.id, JSON.stringify(current.book), current.started ?? null, today());
}

async function deleteClub(db, id) {
  const sugg = await all(db, 'SELECT id FROM club_suggestions WHERE club_id = ?', id);
  for (const s of sugg) await run(db, 'DELETE FROM club_votes WHERE suggestion_id = ?', s.id);
  for (const t of ['club_suggestions', 'club_posts', 'club_reads', 'club_members']) await run(db, `DELETE FROM ${t} WHERE club_id = ?`, id);
  await run(db, 'DELETE FROM clubs WHERE id = ?', id);
}

/* ---------------------------------------------------------- buddy reads */

const pair = (x, y) => (x < y ? [x, y] : [y, x]);

export async function buddyRead(db, me, friendId) {
  const [a, b] = pair(me.id, friendId);
  const row = await one(db, 'SELECT * FROM buddy_reads WHERE a = ? AND b = ?', a, b);
  return row ? { book: parse(row.book, {}), started: row.started } : null;
}

export async function startBuddyRead(db, me, friendId, book) {
  const [a, b] = pair(me.id, friendId);
  await run(db, `INSERT INTO buddy_reads (a, b, book, started) VALUES (?, ?, ?, ?)
    ON CONFLICT(a, b) DO UPDATE SET book = excluded.book, started = excluded.started`, a, b, JSON.stringify(clubBook(book)), today());
  return { ok: true };
}

export async function endBuddyRead(db, me, friendId) {
  const [a, b] = pair(me.id, friendId);
  await run(db, 'DELETE FROM buddy_reads WHERE a = ? AND b = ?', a, b);
  return { ok: true };
}

/** Clubs and buddy reads go when an account is purged. */
export async function forgetUser(db, id) {
  await run(db, 'DELETE FROM club_members WHERE user_id = ?', id);
  await run(db, 'DELETE FROM club_votes WHERE user_id = ?', id);
  await run(db, 'DELETE FROM buddy_reads WHERE a = ? OR b = ?', id, id);
}
