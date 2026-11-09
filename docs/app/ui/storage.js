/**
 * Talking to the API: who is signed in, and reading and writing their data.
 *
 * Everything goes through the accounts API (api/index.js), carrying the
 * signed-in session. Paths are the same ones the site always used
 * ("profiles/gabriel/library.json"); the API decides who may read or change
 * each. A session the API no longer accepts signs this browser out.
 */

import { proxy } from '../core/hardcover.js';

const CONFIG_KEY = 'bookshelf.config';

export const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

/* ------------------------------------------------------------------ config */

/**
 * localStorage can throw outright (Safari private mode, blocked site data), so
 * every access is guarded — a missing config must degrade to read-only, never
 * to a blank page.
 */
const EMPTY = { repo: '', token: '', hardcover: '', worker: '' };

export function getConfig() {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}') };
  } catch {
    return { ...EMPTY };
  }
}

export function setConfig(patch) {
  const next = { ...getConfig(), ...patch };
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  } catch {
    // Non-fatal: the app still works for this session, it just won't remember.
  }
  return next;
}

/**
 * On the dev server the Hardcover token already exists in .env, so pull it in
 * rather than making someone paste a token they have already configured.
 * Anything explicitly set in this browser wins.
 */
export async function adoptLocalConfig() {
  if (!isLocal) return;
  try {
    const res = await fetch('./api/config');
    if (!res.ok) return;
    const { hardcover, worker } = await res.json();
    if (hardcover && !getConfig().hardcover) setConfig({ hardcover });
    if (worker) setConfig({ worker: worker.replace(/\/$/, '') });
  } catch {
    // The dev server may not be the thing serving these files; harmless.
  }
}

/* ----------------------------------------------------------------- session */

const SESSION_KEY = 'bookshelf.session';

export function getSession() {
  try { return localStorage.getItem(SESSION_KEY) || null; } catch { return null; }
}

export function setSession(token) {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token); else localStorage.removeItem(SESSION_KEY);
  } catch { /* private mode: signed in for this visit only */ }
  memorySession = token || null;
}

// Private mode can refuse localStorage; the session still lasts the visit.
let memorySession = null;
const session = () => getSession() ?? memorySession;
const authHeaders = () => (session() ? { Authorization: `Bearer ${session()}` } : {});
proxy.headers = authHeaders;

/** Signed in? Then their own shelf can be changed. */
export const canWrite = () => Boolean(session());

/** For wording the UI honestly. */
export const writeMode = () => (session() ? 'live' : 'signed-out');

/**
 * A call to the API. A refused session (401) means signed out: the token is
 * dropped and the page is told, so it can show the sign-in screen.
 */
export async function api(path, { method = 'GET', body, signedOut = true } = {}) {
  const { worker } = getConfig();
  if (!worker) throw new Error('This site is not connected to its backend yet.');
  const res = await fetch(`${worker}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && signedOut && session()) {
    setSession(null);
    dispatchEvent(new CustomEvent('bookshelf:signedout'));
  }
  if (!res.ok) {
    const err = new Error(data.error ?? `Something went wrong (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * The Worker's address is not a secret, so it ships as a plain file rather
 * than something each person has to enter.
 */
export async function loadSiteConfig() {
  try {
    const res = await fetch(`./site.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const site = await res.json();
    // The accounts API, or (before it) the old Worker.
    const url = site.apiUrl ?? site.workerUrl;
    if (url && !(isLocal && getConfig().worker)) setConfig({ worker: url.replace(/\/$/, '') });
    return site;
  } catch {
    // No site.json yet: the token path still works.
    return null;
  }
}

const VERSION_KEY = 'bookshelf.version';
const MODULES = [
  './app/ui/main.js', './app/ui/views.js', './app/ui/stats.js', './app/ui/covers.js',
  './app/ui/upcoming.js', './app/ui/recs.js', './app/ui/recap.js', './app/ui/progress.js', './app/ui/together.js', './app/ui/art.js', './app/ui/shelfhero.js', './app/ui/carousel.js', './app/ui/library.js', './app/ui/room.js', './app/ui/shelfdrag.js', './app/ui/openbook.js', './app/ui/memory.js', './app/ui/pages.js', './app/ui/discover.js', './app/ui/story.js', './app/ui/themes.js', './app/ui/sound.js', './app/ui/tour.js', './app/ui/room-art.js', './app/ui/decorate.js',
  './app/ui/storage.js', './app/ui/dom.js', './app/ui/style.css',
  './app/core/model.js', './app/core/watch.js', './app/core/hardcover.js',
  './app/core/recap.js', './app/core/check.js', './app/core/together.js', './app/core/arrange.js', './app/core/memory.js', './app/core/story.js', './app/core/suggest.js',
];

/**
 * Force a refresh when the deployed version has moved on.
 *
 * GitHub Pages serves this app's JavaScript with `max-age=600`, so for ten
 * minutes after a deploy a returning browser keeps running the old code while
 * happily reading the new data — which looks exactly like a feature silently
 * not working. site.json is always fetched uncached, so it can be trusted to
 * say which version is current; when it disagrees with what this browser last
 * ran, we re-fetch the modules past the HTTP cache and reload once.
 */
export async function ensureFresh(site) {
  const version = site?.version;
  if (!version) return false;

  let seen = null;
  try { seen = localStorage.getItem(VERSION_KEY); } catch { /* private mode */ }
  if (seen === version) return false;

  // A reload that does not fix the mismatch must not loop.
  const attempted = sessionStorage.getItem('bookshelf.refreshing');
  try { localStorage.setItem(VERSION_KEY, version); } catch { /* ignore */ }
  if (attempted === version) return false;

  if (seen === null) return false; // first ever visit: nothing stale to clear

  try {
    sessionStorage.setItem('bookshelf.refreshing', version);
    await Promise.all(MODULES.map((url) => fetch(url, { cache: 'reload' }).catch(() => {})));
    location.reload();
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------- read */

const versions = new Map(); // data path -> version, so a save never clobbers

export async function loadJSON(rel, fallback, options = {}) {
  const text = await loadText(rel, options);
  if (text === null) return structuredClone(fallback);
  try {
    return JSON.parse(text);
  } catch {
    console.warn(`${rel} is not valid JSON; using fallback`);
    return structuredClone(fallback);
  }
}

/** A document as text, or null when there is none yet. */
export async function loadText(rel) {
  try {
    const body = await api(`/read?path=${encodeURIComponent(rel)}`);
    if (body.sha) versions.set(rel, body.sha);
    return body.content;
  } catch (err) {
    if (err.status === 404) return null;
    throw err instanceof TypeError ? new Error('Could not reach the server — check your connection.') : err;
  }
}

/* ------------------------------------------------------------------- write */

export async function saveJSON(rel, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  try {
    const body = await api('/write', { method: 'POST', body: { path: rel, content: text, ...(versions.has(rel) ? { sha: versions.get(rel) } : {}) } });
    if (body.sha) versions.set(rel, body.sha);
  } catch (err) {
    if (err.status === 409) throw new ConflictError(`${rel} changed underneath us`);
    throw err;
  }
}

export class ConflictError extends Error {}

/**
 * Read-modify-write, retried when someone else saved in between.
 *
 * Two people editing at the same time is the whole reason this exists. Each
 * profile writes to its own file so collisions are rare, but a shared file
 * (profiles.json) can genuinely race — re-reading and replaying the change
 * beats silently overwriting whatever the other person just did.
 */
export async function mutateJSON(rel, fallback, mutate, message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await loadJSON(rel, fallback);
    const next = mutate(structuredClone(current));
    try {
      await saveJSON(rel, next, message);
      return next;
    } catch (err) {
      if (err instanceof ConflictError && attempt < 2) {
        versions.delete(rel);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Could not save ${rel} — it kept changing underneath us. Reload and try again.`);
}

/** events.jsonl is written by the nightly check; the site only reads it. */
export async function loadEvents() {
  const text = await loadText('events.jsonl');
  if (!text) return [];
  return text.split('\n').filter((l) => l.trim()).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

/**
 * Ask the backend to check every watched series for new books and dates now,
 * instead of waiting for the nightly run.
 */
export const runCheckNow = () => api('/check', { method: 'POST' });
