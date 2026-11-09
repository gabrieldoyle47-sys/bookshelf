/**
 * Bookshelf API: accounts, shelves and friends, on Cloudflare D1.
 *
 * The site (GitHub Pages) is static and public; everything personal lives in
 * the database behind this Worker, and only a signed-in member can read it.
 * Each person can change only their own shelf. Friends can react to each
 * other's ratings and send each other books, through routes made for just
 * that. The nightly release check (GitHub Actions) reads and writes through
 * /service with a private key, so no shelf is ever committed to the repo.
 *
 * Bindings (wrangler.toml): DB (D1).
 * Secrets: HARDCOVER_TOKEN, SERVICE_KEY.
 */

import {
  createClient, booksByIds, booksByTag, authorPage, seriesPage, listBooks, AWARD_LISTS,
} from '../docs/app/core/hardcover.js';
import { today, addReaction, addRecommendation, REACTIONS } from '../docs/app/core/model.js';
import { releaseInvite } from '../docs/app/core/calendar.js';
import { runReleaseCheck } from '../docs/app/core/check.js';
import {
  hashPassword, verifyPassword, sha256, newToken, newCode,
  checkUsername, checkDisplayName, checkPassword, checkEmail, shelfIdFor,
} from './auth.js';

const MAX_BYTES = 512 * 1024;
const PER_MINUTE = 40;         // Hardcover calls one person can make a minute
const PURGE_AFTER_DAYS = 30;   // a deleted account can be restored until then
const STATE_FILES = ['series-state.json', 'authors.json', 'books-state.json', 'events.jsonl'];
const LIBRARY = /^profiles\/([a-z0-9_-]{1,40})\/library\.json$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
});
const fail = (status, error) => json({ error }, status);
const nowIso = () => new Date().toISOString();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* ---------------------------------------------------------------- data */

const one = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results ?? [];
const run = (db, sql, ...args) => db.prepare(sql).bind(...args).run();

async function readFile(db, path) {
  return one(db, 'SELECT content, version FROM files WHERE path = ?', path);
}

/** Write a document, refusing if it moved on since `version` was read. */
async function writeFile(db, path, content, version = null) {
  const at = nowIso();
  if (version == null) {
    await run(db, `INSERT INTO files (path, content, version, updated) VALUES (?, ?, 1, ?)
      ON CONFLICT(path) DO UPDATE SET content = excluded.content, version = files.version + 1, updated = excluded.updated`, path, content, at);
  } else {
    const res = await run(db, 'UPDATE files SET content = ?, version = version + 1, updated = ? WHERE path = ? AND version = ?',
      content, at, path, Number(version));
    if (!res.meta.changes) {
      const exists = await readFile(db, path);
      if (exists) throw new HttpError(409, 'conflict');
      await run(db, 'INSERT INTO files (path, content, version, updated) VALUES (?, ?, 1, ?)', path, content, at);
    }
  }
  return (await readFile(db, path)).version;
}

/** Change a shelf on the server (a reaction, a recommendation), retrying on a conflict. */
async function mutateLibrary(db, id, mutate) {
  const path = `profiles/${id}/library.json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await readFile(db, path);
    const lib = row ? JSON.parse(row.content) : { books: [] };
    mutate(lib);
    try {
      await writeFile(db, path, `${JSON.stringify(lib, null, 2)}\n`, row?.version ?? null);
      return lib;
    } catch (err) {
      if (!(err instanceof HttpError && err.status === 409) || attempt === 2) throw err;
    }
  }
  return null;
}

const setting = async (db, key, fallback) => (await one(db, 'SELECT value FROM settings WHERE key = ?', key))?.value ?? fallback;

/* ---------------------------------------------------------------- people */

/** How a person appears to others: never their email, hash or status details. */
function publicProfile(u, extra = {}) {
  let look = null;
  try { look = u.look ? JSON.parse(u.look) : null; } catch { /* ignore */ }
  return { id: u.id, username: u.username, name: u.display_name, colour: u.colour, look, lastSeen: u.last_seen, ...extra };
}

/** What a person knows about themselves. */
const selfProfile = (u) => publicProfile(u, { email: u.email, role: u.role, mustChangePassword: Boolean(u.must_change_pw) });

const pairKey = (x, y) => (x < y ? [x, y] : [y, x]);

async function friendship(db, x, y) {
  const [a, b] = pairKey(x, y);
  return one(db, 'SELECT * FROM friendships WHERE a = ? AND b = ?', a, b);
}

async function areFriends(db, x, y) {
  return x === y || (await friendship(db, x, y))?.status === 'accepted';
}

async function friendIds(db, id) {
  const rows = await all(db, "SELECT a, b FROM friendships WHERE status = 'accepted' AND (a = ? OR b = ?)", id, id);
  return rows.map((r) => (r.a === id ? r.b : r.a));
}

/** The signed-in person, from the Authorization header, or null. */
async function sessionUser(request, db) {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const hash = await sha256(token);
  const row = await one(db, `SELECT u.*, s.last_used AS session_used FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?`, hash);
  if (!row || row.status !== 'active') return null;
  // Noted at most every few minutes, so reads are not all writes too.
  if (!row.session_used || Date.now() - Date.parse(row.session_used) > 5 * 60 * 1000) {
    const at = nowIso();
    await run(db, 'UPDATE sessions SET last_used = ? WHERE token_hash = ?', at, hash);
    await run(db, 'UPDATE users SET last_seen = ? WHERE id = ?', at, row.id);
  }
  return row;
}

async function startSession(db, userId) {
  const token = newToken();
  await run(db, 'INSERT INTO sessions (token_hash, user_id, created, last_used) VALUES (?, ?, ?, ?)', await sha256(token), userId, nowIso(), nowIso());
  return token;
}

/** One person at a time can only spend so much of the shared Hardcover allowance. */
async function countHardcover(db, userId, calls = 1) {
  const minute = nowIso().slice(0, 16);
  const mine = await one(db, `INSERT INTO usage (bucket, count) VALUES (?, ?)
    ON CONFLICT(bucket) DO UPDATE SET count = count + excluded.count RETURNING count`, `u:${userId}:${minute}`, calls);
  await run(db, `INSERT INTO usage (bucket, count) VALUES (?, ?)
    ON CONFLICT(bucket) DO UPDATE SET count = count + excluded.count`, `day:${today()}`, calls);
  if (mine.count > PER_MINUTE) throw new HttpError(429, 'Slow down a little — too many book lookups in a minute. Try again shortly.');
}

/** Sign-in attempts per username per 15 minutes, against guessing. */
async function countSignIn(db, username) {
  const slot = Math.floor(Date.now() / (15 * 60 * 1000));
  const row = await one(db, `INSERT INTO usage (bucket, count) VALUES (?, 1)
    ON CONFLICT(bucket) DO UPDATE SET count = count + 1 RETURNING count`, `login:${username}:${slot}`);
  if (row.count > 10) throw new HttpError(429, 'Too many tries. Wait a few minutes and try again.');
}

/* ------------------------------------------------------------- routes */

async function body(request) {
  try { return await request.json(); } catch { throw new HttpError(400, 'body must be JSON'); }
}

const need = (check, value) => {
  const out = check(value);
  if (out.error) throw new HttpError(400, out.error);
  return out;
};

async function signUp(db, input) {
  const { username } = need(checkUsername, input.username);
  const { name } = need(checkDisplayName, input.displayName);
  const { password } = need(checkPassword, input.password);
  const { email } = need(checkEmail, input.email);

  // A claim code hands over a shelf from before accounts.
  let claim = null;
  if (input.claim) {
    claim = await one(db, 'SELECT * FROM claims WHERE code = ? AND used_by IS NULL', String(input.claim).trim().toLowerCase());
    if (!claim) throw new HttpError(400, 'That claim code is not valid, or has been used.');
  }
  const mode = await setting(db, 'signup_mode', 'open');
  let invite = null;
  if (mode === 'invite' && !claim) {
    invite = await one(db, 'SELECT * FROM invites WHERE code = ? AND used_by IS NULL', String(input.invite ?? '').trim().toLowerCase());
    if (!invite) throw new HttpError(403, 'Joining needs an invite code from a member.');
  }
  if (await one(db, 'SELECT id FROM users WHERE username = ?', username)) throw new HttpError(409, 'That username is taken.');

  let id = claim ? claim.legacy_id : shelfIdFor(username);
  if (!claim && (await one(db, 'SELECT id FROM users WHERE id = ?', id)
    || await one(db, 'SELECT code FROM claims WHERE legacy_id = ? AND used_by IS NULL', id))) {
    id = `${id}-${newCode(4)}`;
  }
  const legacy = claim ? JSON.parse(claim.profile) : {};
  const pw = await hashPassword(password);
  const at = nowIso();
  await run(db, `INSERT INTO users (id, username, display_name, email, pw_hash, pw_salt, pw_iter, role, colour, look, created, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  id, username, name, email, pw.hash, pw.salt, pw.iterations, legacy.role === 'admin' ? 'admin' : 'member',
  legacy.colour ?? input.colour ?? null, legacy.look ? JSON.stringify(legacy.look) : null, at, at);
  if (claim) await run(db, 'UPDATE claims SET used_by = ?, used_at = ? WHERE code = ?', id, at, claim.code);
  if (invite) await run(db, 'UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?', id, at, invite.code);
  if (!await readFile(db, `profiles/${id}/library.json`)) {
    await writeFile(db, `profiles/${id}/library.json`, `${JSON.stringify({ books: [], watch: { series: {}, authors: {} } }, null, 2)}\n`);
  }
  const user = await one(db, 'SELECT * FROM users WHERE id = ?', id);
  return { token: await startSession(db, id), user: selfProfile(user) };
}

async function signIn(db, input) {
  const username = String(input.username ?? '').trim().toLowerCase();
  await countSignIn(db, username);
  const user = await one(db, 'SELECT * FROM users WHERE username = ?', username);
  // The same answer for a wrong name and a wrong password.
  if (!user || !(await verifyPassword(String(input.password ?? ''), user))) throw new HttpError(401, 'That username and password do not match.');
  if (user.status === 'suspended') throw new HttpError(403, 'This account is suspended. Ask the site admin.');
  if (user.status === 'deleted') throw new HttpError(403, 'This account was deleted. Ask the site admin to restore it.');
  return { token: await startSession(db, user.id), user: selfProfile(user) };
}

/** profiles.json, made for whoever asks: themselves and their friends. */
async function profilesFor(db, me) {
  const ids = [me.id, ...await friendIds(db, me.id)];
  const rows = await all(db, `SELECT * FROM users WHERE status = 'active' AND id IN (${ids.map(() => '?').join(',')})`, ...ids);
  const byId = new Map(rows.map((u) => [u.id, u]));
  return { profiles: ids.filter((id) => byId.has(id)).map((id) => publicProfile(byId.get(id), id === me.id ? { me: true } : { friend: true })) };
}

async function readRoute(db, me, path) {
  if (path === 'profiles.json') return { content: `${JSON.stringify(await profilesFor(db, me), null, 2)}\n`, sha: 'live' };
  const lib = path.match(LIBRARY);
  if (lib) {
    const owner = await one(db, 'SELECT status FROM users WHERE id = ?', lib[1]);
    if (!owner || (owner.status !== 'active' && lib[1] !== me.id)) throw new HttpError(404, 'not found');
  } else if (!STATE_FILES.includes(path)) {
    throw new HttpError(400, 'unknown file');
  }
  const row = await readFile(db, path);
  if (!row) throw new HttpError(404, 'not found');
  return { content: row.content, sha: String(row.version) };
}

async function writeRoute(db, me, input) {
  const path = String(input.path ?? '');
  const lib = path.match(LIBRARY);
  if (!lib) throw new HttpError(403, 'Only your own shelf can be changed from here.');
  if (lib[1] !== me.id) throw new HttpError(403, 'That is someone else’s shelf.');
  if (typeof input.content !== 'string' || input.content.length > MAX_BYTES) throw new HttpError(400, 'content missing or too large');
  try { JSON.parse(input.content); } catch { throw new HttpError(400, 'content is not valid JSON'); }
  const version = /^\d+$/.test(String(input.sha ?? '')) ? Number(input.sha) : null;
  const next = await writeFile(db, path, input.content, version);
  return { ok: true, sha: String(next) };
}

/* -------------------------------------------------------------- friends */

async function friendsOf(db, me) {
  const rows = await all(db, 'SELECT * FROM friendships WHERE a = ? OR b = ?', me.id, me.id);
  const otherIds = rows.map((r) => (r.a === me.id ? r.b : r.a));
  const users = otherIds.length
    ? await all(db, `SELECT * FROM users WHERE status = 'active' AND id IN (${otherIds.map(() => '?').join(',')})`, ...otherIds) : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const out = { friends: [], incoming: [], outgoing: [] };
  for (const r of rows) {
    const other = byId.get(r.a === me.id ? r.b : r.a);
    if (!other) continue;
    const p = publicProfile(other, { since: r.created });
    if (r.status === 'accepted') out.friends.push(p);
    else if (r.requested_by === me.id) out.outgoing.push(p);
    else out.incoming.push(p);
  }
  return out;
}

async function searchMembers(db, me, q) {
  const term = `%${String(q ?? '').trim().toLowerCase().replace(/[%_]/g, '')}%`;
  const rows = await all(db, `SELECT * FROM users WHERE status = 'active' AND id != ?
    AND (username LIKE ? OR lower(display_name) LIKE ?) ORDER BY display_name LIMIT 30`, me.id, term, term);
  const rel = new Map((await all(db, 'SELECT * FROM friendships WHERE a = ? OR b = ?', me.id, me.id))
    .map((r) => [r.a === me.id ? r.b : r.a, r]));
  return rows.map((u) => {
    const r = rel.get(u.id);
    const state = !r ? 'none' : r.status === 'accepted' ? 'friend' : r.requested_by === me.id ? 'sent' : 'received';
    return publicProfile(u, { relation: state });
  });
}

async function requestFriend(db, me, otherId) {
  if (otherId === me.id) throw new HttpError(400, 'That is you.');
  const other = await one(db, "SELECT id FROM users WHERE id = ? AND status = 'active'", otherId);
  if (!other) throw new HttpError(404, 'No one by that name.');
  const existing = await friendship(db, me.id, otherId);
  const [a, b] = pairKey(me.id, otherId);
  if (existing?.status === 'accepted') return { status: 'friend' };
  // They had already asked you: asking back is accepting.
  if (existing && existing.requested_by !== me.id) {
    await run(db, "UPDATE friendships SET status = 'accepted' WHERE a = ? AND b = ?", a, b);
    return { status: 'friend' };
  }
  if (!existing) await run(db, "INSERT INTO friendships (a, b, status, requested_by, created) VALUES (?, ?, 'pending', ?, ?)", a, b, me.id, nowIso());
  return { status: 'sent' };
}

async function respondFriend(db, me, otherId, accept) {
  const existing = await friendship(db, me.id, otherId);
  if (!existing || existing.status !== 'pending' || existing.requested_by === me.id) throw new HttpError(404, 'There is no request from them.');
  const [a, b] = pairKey(me.id, otherId);
  if (accept) await run(db, "UPDATE friendships SET status = 'accepted' WHERE a = ? AND b = ?", a, b);
  else await run(db, 'DELETE FROM friendships WHERE a = ? AND b = ?', a, b);
  return { status: accept ? 'friend' : 'none' };
}

async function removeFriend(db, me, otherId) {
  const [a, b] = pairKey(me.id, otherId);
  await run(db, 'DELETE FROM friendships WHERE a = ? AND b = ?', a, b);
  return { status: 'none' };
}

/* ------------------------------------------------------- friends' shelves */

async function react(db, me, input) {
  const owner = String(input.owner ?? '');
  if (!await areFriends(db, me.id, owner)) throw new HttpError(403, 'Only friends can react.');
  if (!REACTIONS.includes(input.emoji)) throw new HttpError(400, 'Unknown reaction.');
  const lib = await mutateLibrary(db, owner, (l) => {
    if (!(l.books ?? []).some((b) => b.id === input.bookId)) throw new HttpError(404, 'That book is not on their shelf.');
    addReaction(l, input.bookId, input.on, input.emoji, { by: me.id });
  });
  return { ok: true, reactions: lib.reactions?.[input.bookId] ?? [] };
}

async function recommend(db, me, input) {
  const to = String(input.to ?? '');
  if (to === me.id || !await areFriends(db, me.id, to)) throw new HttpError(403, 'Books can be sent to friends.');
  if (!input.book?.title) throw new HttpError(400, 'Which book?');
  try {
    await mutateLibrary(db, to, (l) => addRecommendation(l, { book: input.book, from: me.id, note: String(input.note ?? '').slice(0, 500) }));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, err.message);
  }
  return { ok: true };
}

/* --------------------------------------------------------------- account */

async function updateMe(db, me, input) {
  const sets = [];
  const args = [];
  if ('displayName' in input) { sets.push('display_name = ?'); args.push(need(checkDisplayName, input.displayName).name); }
  if ('colour' in input) {
    if (!/^#[0-9a-f]{6}$/i.test(String(input.colour))) throw new HttpError(400, 'That colour is not valid.');
    sets.push('colour = ?'); args.push(input.colour);
  }
  if ('look' in input) {
    const look = JSON.stringify(input.look ?? null);
    if (look.length > 2000) throw new HttpError(400, 'look too large');
    sets.push('look = ?'); args.push(look);
  }
  if (sets.length) await run(db, `UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...args, me.id);
  return selfProfile(await one(db, 'SELECT * FROM users WHERE id = ?', me.id));
}

async function changePassword(db, me, input, currentToken) {
  if (!me.must_change_pw && !(await verifyPassword(String(input.current ?? ''), me))) throw new HttpError(403, 'Your current password is not right.');
  const { password } = need(checkPassword, input.next);
  const pw = await hashPassword(password);
  await run(db, 'UPDATE users SET pw_hash = ?, pw_salt = ?, pw_iter = ?, must_change_pw = 0 WHERE id = ?', pw.hash, pw.salt, pw.iterations, me.id);
  // Every other device has to sign in again with the new password.
  await run(db, 'DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', me.id, await sha256(currentToken));
  return { ok: true };
}

async function changeEmail(db, me, input) {
  if (!(await verifyPassword(String(input.password ?? ''), me))) throw new HttpError(403, 'Your password is not right.');
  const { email } = need(checkEmail, input.email);
  await run(db, 'UPDATE users SET email = ? WHERE id = ?', email, me.id);
  return { ok: true, email };
}

async function deleteAccount(db, userId) {
  await run(db, "UPDATE users SET status = 'deleted', deleted_at = ? WHERE id = ?", nowIso(), userId);
  await run(db, 'DELETE FROM sessions WHERE user_id = ?', userId);
}

/* ----------------------------------------------------------------- admin */

async function adminRoute(db, me, request, url) {
  if (me.role !== 'admin') throw new HttpError(403, 'Admins only.');
  const path = url.pathname.replace(/^\/admin/, '');
  if (request.method === 'GET' && path === '/users') {
    const rows = await all(db, 'SELECT * FROM users ORDER BY created');
    return rows.map((u) => ({ ...selfProfile(u), status: u.status, created: u.created, deletedAt: u.deleted_at }));
  }
  const act = path.match(/^\/users\/([a-z0-9_-]+)\/(suspend|unsuspend|delete|restore|reset-password)$/);
  if (request.method === 'POST' && act) {
    const [, id, action] = act;
    if (id === me.id && action !== 'reset-password') throw new HttpError(400, 'That would lock you out of your own site.');
    const user = await one(db, 'SELECT * FROM users WHERE id = ?', id);
    if (!user) throw new HttpError(404, 'No such account.');
    if (action === 'suspend') { await run(db, "UPDATE users SET status = 'suspended' WHERE id = ?", id); await run(db, 'DELETE FROM sessions WHERE user_id = ?', id); }
    if (action === 'unsuspend' || action === 'restore') await run(db, "UPDATE users SET status = 'active', deleted_at = NULL WHERE id = ?", id);
    if (action === 'delete') await deleteAccount(db, id);
    if (action === 'reset-password') {
      const temp = newCode(10);
      const pw = await hashPassword(temp);
      await run(db, 'UPDATE users SET pw_hash = ?, pw_salt = ?, pw_iter = ?, must_change_pw = 1 WHERE id = ?', pw.hash, pw.salt, pw.iterations, id);
      await run(db, 'DELETE FROM sessions WHERE user_id = ?', id);
      return { ok: true, temporaryPassword: temp };
    }
    return { ok: true };
  }
  if (request.method === 'GET' && path === '/settings') return { signupMode: await setting(db, 'signup_mode', 'open') };
  if (request.method === 'POST' && path === '/settings') {
    const input = await body(request);
    if (!['open', 'invite'].includes(input.signupMode)) throw new HttpError(400, 'open or invite');
    await run(db, 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', 'signup_mode', input.signupMode);
    return { signupMode: input.signupMode };
  }
  if (request.method === 'GET' && path === '/invites') return all(db, 'SELECT * FROM invites ORDER BY created DESC LIMIT 50');
  if (request.method === 'POST' && path === '/invites') {
    const code = newCode(8);
    await run(db, 'INSERT INTO invites (code, created_by, created) VALUES (?, ?, ?)', code, me.id, nowIso());
    return { code };
  }
  if (request.method === 'GET' && path === '/usage') {
    const days = await all(db, "SELECT bucket, count FROM usage WHERE bucket LIKE 'day:%' ORDER BY bucket DESC LIMIT 14");
    const lastCheck = await setting(db, 'last_check', null);
    return { days: days.map((d) => ({ day: d.bucket.slice(4), calls: d.count })), lastCheck: lastCheck ? JSON.parse(lastCheck) : null };
  }
  throw new HttpError(404, 'not found');
}

/* -------------------------------------------------- the nightly check */

/** What the release check needs: every active shelf and the watcher's state. */
async function exportForCheck(db) {
  const users = await all(db, "SELECT id FROM users WHERE status = 'active'");
  const libraries = {};
  for (const u of users) {
    const row = await readFile(db, `profiles/${u.id}/library.json`);
    if (row) libraries[u.id] = JSON.parse(row.content);
  }
  const state = {};
  for (const f of STATE_FILES) state[f] = (await readFile(db, f))?.content ?? null;
  return { libraries, state };
}

/** Save what the check found: new snapshots, and events appended (never twice). */
async function importFromCheck(db, input) {
  for (const [file, value] of Object.entries({
    'series-state.json': input.seriesState, 'authors.json': input.authorState, 'books-state.json': input.bookState,
  })) {
    if (value && typeof value === 'object') await writeFile(db, file, `${JSON.stringify(value, null, 2)}\n`);
  }
  if (Array.isArray(input.events) && input.events.length) await appendEvents(db, input.events);
  if (input.summary) {
    await run(db, 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      'last_check', JSON.stringify({ ...input.summary, at: nowIso() }));
  }
  if (Number(input.calls) > 0) {
    await run(db, `INSERT INTO usage (bucket, count) VALUES (?, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + excluded.count`,
      `day:${today()}`, Number(input.calls));
  }
  return { ok: true };
}

async function appendEvents(db, events) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await readFile(db, 'events.jsonl');
    const text = row?.content ?? '';
    const seen = new Set(text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l).key; } catch { return null; } }));
    const fresh = events.filter((e) => e?.key && !seen.has(e.key));
    if (!fresh.length) return;
    const next = `${text}${text && !text.endsWith('\n') ? '\n' : ''}${fresh.map((e) => JSON.stringify(e)).join('\n')}\n`;
    try { await writeFile(db, 'events.jsonl', next, row?.version ?? null); return; } catch (err) {
      if (!(err instanceof HttpError && err.status === 409)) throw err;
    }
  }
}

/**
 * "Check now" on someone's Upcoming page: their own series and authors only,
 * so it stays inside the Worker's per-request limits.
 */
async function checkNow(db, env, me) {
  const row = await readFile(db, `profiles/${me.id}/library.json`);
  const libraries = { [me.id]: row ? JSON.parse(row.content) : { books: [] } };
  const read = async (f) => { try { return JSON.parse((await readFile(db, f))?.content ?? '{}'); } catch { return {}; } };
  const [seriesState, authorState, bookState] = await Promise.all([read('series-state.json'), read('authors.json'), read('books-state.json')]);
  const eventsText = (await readFile(db, 'events.jsonl'))?.content ?? '';
  const seen = new Set(eventsText.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l).key; } catch { return null; } }));
  const result = await runReleaseCheck({ gql: createClient(env.HARDCOVER_TOKEN), libraries, seriesState, authorState, bookState, seen, now: today() });
  await countHardcover(db, me.id, result.checkedSeries + result.checkedAuthors + result.checkedTracked).catch(() => {});
  const stamped = nowIso();
  await importFromCheck(db, { seriesState, authorState, bookState, events: result.events.map((e) => ({ ...e, at: stamped })) });
  return {
    ok: true, checkedSeries: result.checkedSeries, checkedAuthors: result.checkedAuthors, checkedTracked: result.checkedTracked,
    newSeries: result.newSeries, upcoming: result.upcoming, events: result.events.length, failures: result.failures,
  };
}

/* ---------------------------------------------------- Hardcover, proxied */

async function hardcoverRoute(env, url) {
  const gql = createClient(env.HARDCOVER_TOKEN);
  if (url.pathname === '/search') {
    const q = url.searchParams.get('q') ?? '';
    const perPage = Math.min(Number(url.searchParams.get('n')) || 8, 25);
    if (q.trim().length < 2) throw new HttpError(400, 'query too short');
    const data = await gql(`query Search($q: String!, $perPage: Int!) {
      search(query: $q, query_type: "Book", per_page: $perPage, page: 1) { results } }`, { q, perPage });
    return data;
  }
  if (url.pathname === '/book') {
    const ids = (url.searchParams.get('ids') ?? url.searchParams.get('id') ?? '')
      .split(',').map((x) => x.trim()).filter((x) => /^\d{1,10}$/.test(x)).slice(0, 20);
    if (!ids.length) throw new HttpError(400, 'no book ids');
    return { books: await booksByIds(gql, ids) };
  }
  if (url.pathname === '/discover') {
    const genres = [...new Set((url.searchParams.get('genres') ?? '').split('|').map((g) => g.trim()).filter((g) => g && g.length <= 40))].slice(0, 4);
    if (!genres.length) throw new HttpError(400, 'no genres');
    const category = url.searchParams.get('kind') === 'mood' ? 'Mood' : 'Genre';
    const lists = await Promise.all(genres.map((g) => booksByTag(gql, category, g)));
    const seen = new Set();
    return { books: lists.flat().filter((b) => !seen.has(b.id) && seen.add(b.id)) };
  }
  const id = url.searchParams.get('id') ?? '';
  if (!/^\d{1,10}$/.test(id)) throw new HttpError(400, 'bad id');
  if (url.pathname === '/list' && !AWARD_LISTS.some((l) => String(l.id) === id)) throw new HttpError(400, 'unknown list');
  const found = url.pathname === '/author' ? await authorPage(gql, id)
    : url.pathname === '/series' ? await seriesPage(gql, id) : await listBooks(gql, id);
  if (!found) throw new HttpError(404, 'not found');
  return found;
}

const HARDCOVER_ROUTES = ['/search', '/book', '/discover', '/author', '/series', '/list'];
const hardcoverCost = (url) => (url.pathname === '/discover'
  ? Math.max(1, (url.searchParams.get('genres') ?? '').split('|').filter(Boolean).length) : 1);

function icsRoute(url) {
  const q = (k, max) => (url.searchParams.get(k) ?? '').slice(0, max);
  const link = q('link', 300);
  const text = releaseInvite({
    id: q('id', 20), title: q('title', 200), date: q('date', 10), by: q('by', 200), series: q('series', 200),
    link: /^https:\/\/(hardcover\.app|www\.indigo\.ca)\//.test(link) ? link : '',
  });
  const file = (q('title', 60).replace(/[^\w -]/g, '').trim() || 'release').replace(/\s+/g, '-');
  return new Response(text, { headers: {
    'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `inline; filename="${file}.ics"`, 'Cache-Control': 'no-store', ...CORS,
  } });
}

/* ------------------------------------------------------------- the Worker */

async function route(request, env) {
  const url = new URL(request.url);
  const db = env.DB;
  const p = url.pathname;
  const m = request.method;

  if (m === 'GET' && p === '/ics') return icsRoute(url);
  if (m === 'GET' && p === '/health') return json({ ok: true });

  // The nightly job, with the private key.
  if (p.startsWith('/service/')) {
    const key = (request.headers.get('Authorization') ?? '').replace(/^Service\s+/, '');
    if (!env.SERVICE_KEY || key.length !== env.SERVICE_KEY.length || await sha256(key) !== await sha256(env.SERVICE_KEY)) {
      throw new HttpError(401, 'unauthorised');
    }
    if (m === 'GET' && p === '/service/export') return json(await exportForCheck(db));
    if (m === 'POST' && p === '/service/import') return json(await importFromCheck(db, await body(request)));
    throw new HttpError(404, 'not found');
  }

  if (m === 'POST' && p === '/auth/signup') return json(await signUp(db, await body(request)));
  if (m === 'POST' && p === '/auth/signin') return json(await signIn(db, await body(request)));
  if (m === 'GET' && p === '/auth/mode') return json({ signupMode: await setting(db, 'signup_mode', 'open') });

  // Everything below needs someone signed in.
  const me = await sessionUser(request, db);
  if (!me) throw new HttpError(401, 'Sign in to continue.');
  const token = (request.headers.get('Authorization') ?? '').slice(7).trim();

  if (HARDCOVER_ROUTES.includes(p) && m === 'GET') {
    await countHardcover(db, me.id, hardcoverCost(url));
    return json(await hardcoverRoute(env, url));
  }
  if (m === 'POST' && p === '/auth/signout') { await run(db, 'DELETE FROM sessions WHERE token_hash = ?', await sha256(token)); return json({ ok: true }); }
  if (m === 'POST' && p === '/auth/signout-all') { await run(db, 'DELETE FROM sessions WHERE user_id = ?', me.id); return json({ ok: true }); }

  if (m === 'GET' && p === '/me') return json(selfProfile(me));
  if (m === 'PATCH' && p === '/me') return json(await updateMe(db, me, await body(request)));
  if (m === 'POST' && p === '/me/password') return json(await changePassword(db, me, await body(request), token));
  if (m === 'POST' && p === '/me/email') return json(await changeEmail(db, me, await body(request)));
  if (m === 'POST' && p === '/me/delete') {
    const input = await body(request);
    if (String(input.username ?? '').toLowerCase() !== me.username) throw new HttpError(400, 'Type your username to confirm.');
    if (!(await verifyPassword(String(input.password ?? ''), me))) throw new HttpError(403, 'Your password is not right.');
    if (me.role === 'admin' && !(await one(db, "SELECT id FROM users WHERE role = 'admin' AND status = 'active' AND id != ?", me.id))) {
      throw new HttpError(400, 'You are the only admin; the site needs one.');
    }
    await deleteAccount(db, me.id);
    return json({ ok: true });
  }

  if (m === 'GET' && p === '/read') return json(await readRoute(db, me, url.searchParams.get('path') ?? ''));
  if (m === 'POST' && p === '/write') return json(await writeRoute(db, me, await body(request)));

  if (m === 'GET' && p === '/member') {
    const u = await one(db, "SELECT * FROM users WHERE id = ? AND status = 'active'", url.searchParams.get('id') ?? '');
    if (!u) throw new HttpError(404, 'No one by that name.');
    const f = await friendship(db, me.id, u.id);
    return json(publicProfile(u, { me: u.id === me.id, friend: f?.status === 'accepted',
      relation: u.id === me.id ? 'me' : !f ? 'none' : f.status === 'accepted' ? 'friend' : f.requested_by === me.id ? 'sent' : 'received' }));
  }
  if (m === 'GET' && p === '/members') return json(await searchMembers(db, me, url.searchParams.get('q')));
  if (m === 'GET' && p === '/friends') return json(await friendsOf(db, me));
  if (m === 'POST' && p === '/friends/request') return json(await requestFriend(db, me, String((await body(request)).id ?? '')));
  if (m === 'POST' && p === '/friends/respond') { const i = await body(request); return json(await respondFriend(db, me, String(i.id ?? ''), Boolean(i.accept))); }
  if (m === 'POST' && p === '/friends/remove') return json(await removeFriend(db, me, String((await body(request)).id ?? '')));

  if (m === 'POST' && p === '/react') return json(await react(db, me, await body(request)));
  if (m === 'POST' && p === '/recommend') return json(await recommend(db, me, await body(request)));
  if (m === 'POST' && p === '/check') return json(await checkNow(db, env, me));

  if (p.startsWith('/admin/')) return json(await adminRoute(db, me, request, url));

  throw new HttpError(404, 'not found');
}

/** Deleted accounts past their 30 days, and old counters, go for good. */
async function purge(db) {
  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 864e5).toISOString();
  const gone = await all(db, "SELECT id FROM users WHERE status = 'deleted' AND deleted_at < ?", cutoff);
  for (const { id } of gone) {
    await run(db, 'DELETE FROM files WHERE path = ?', `profiles/${id}/library.json`);
    await run(db, 'DELETE FROM friendships WHERE a = ? OR b = ?', id, id);
    await run(db, 'DELETE FROM sessions WHERE user_id = ?', id);
    await run(db, 'DELETE FROM users WHERE id = ?', id);
  }
  // Per-minute and sign-in counters only matter for minutes; daily totals
  // are kept for the admin page.
  await run(db, "DELETE FROM usage WHERE bucket LIKE 'u:%' OR bucket LIKE 'login:%'");
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      return await route(request, env);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message);
      return fail(502, err.message ?? 'Something went wrong.');
    }
  },
  async scheduled(event, env) {
    await purge(env.DB);
  },
};

// For tests.
export { route, purge, HttpError };
