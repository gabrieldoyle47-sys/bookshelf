/**
 * Read/write adapter for the web app.
 *
 * Two backends, one interface:
 *   - local  — the dev server in src/serve.js accepts PUT and writes to disk.
 *   - github — commits through the Contents API, which is how the published
 *              site works, since GitHub Pages itself is read-only.
 *
 * Paths are given relative to the data directory ("profiles.json"), and each
 * backend maps them to the right place.
 */

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
  if (!isLocal || getConfig().hardcover) return;
  try {
    const res = await fetch('./api/config');
    if (!res.ok) return;
    const { hardcover } = await res.json();
    if (hardcover) setConfig({ hardcover });
  } catch {
    // The dev server may not be the thing serving these files; harmless.
  }
}

/**
 * Can we write? Locally always; on Pages through the Worker, which holds the
 * credentials so nobody has to paste anything.
 */
export function canWrite() {
  if (isLocal) return true;
  const { repo, token, worker } = getConfig();
  return Boolean(worker || (repo && token));
}

/** Which write path is in use — for wording the UI honestly. */
export function writeMode() {
  if (isLocal) return 'local';
  const { repo, token, worker } = getConfig();
  if (worker) return 'live';
  if (repo && token) return 'token';
  return 'read-only';
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
    if (site.workerUrl) setConfig({ worker: site.workerUrl.replace(/\/$/, '') });
    return site;
  } catch {
    // No site.json yet: the token path still works.
    return null;
  }
}

const VERSION_KEY = 'bookshelf.version';
const MODULES = [
  './app/ui/main.js', './app/ui/views.js', './app/ui/stats.js',
  './app/ui/storage.js', './app/ui/dom.js', './app/ui/style.css',
  './app/core/model.js', './app/core/watch.js', './app/core/hardcover.js',
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

/* ------------------------------------------------------------------ base64 */

// btoa() only handles latin-1, and book titles are full of accents and CJK.
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64) {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ------------------------------------------------------------------ github */

const shas = new Map(); // data path -> blob sha, needed to write without clobbering

function ghUrl(rel) {
  const { repo } = getConfig();
  return `https://api.github.com/repos/${repo}/contents/docs/data/${rel}`;
}

async function ghFetch(url, options = {}) {
  const { token } = getConfig();
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  return res;
}

/* -------------------------------------------------------------------- read */

/**
 * Read a JSON file.
 *
 * When a token is present we read through the Contents API rather than the
 * static file: Pages caches hard and lags a commit by up to a minute, so the
 * static copy can easily be older than something we wrote ten seconds ago.
 */
export async function loadJSON(rel, fallback) {
  const text = await loadText(rel);
  if (text === null) return structuredClone(fallback);
  try {
    return JSON.parse(text);
  } catch {
    console.warn(`${rel} is not valid JSON; using fallback`);
    return structuredClone(fallback);
  }
}

export async function loadText(rel) {
  const { repo, token, worker } = getConfig();

  // Pages serves a cached copy for up to a minute after a commit, so someone
  // could add a book and reload straight into a version that predates it.
  // Reading back through the proxy avoids that entirely.
  if (!isLocal && worker) {
    try {
      const res = await fetch(`${worker}/read?path=${encodeURIComponent(rel)}`);
      if (res.status === 404) return null;
      if (res.ok) {
        const body = await res.json();
        if (body.sha) shas.set(rel, body.sha);
        return body.content;
      }
    } catch {
      // Fall through to the static copy rather than showing nothing.
    }
  }

  if (!isLocal && repo && token) {
    const res = await ghFetch(ghUrl(rel));
    if (res.status === 404) return null;
    if (res.ok) {
      const body = await res.json();
      shas.set(rel, body.sha);
      return fromBase64(body.content ?? '');
    }
    // Fall through to the static copy rather than failing outright — a bad
    // token should degrade to read-only, not to a broken site.
    console.warn(`GitHub read failed for ${rel} (${res.status}); falling back to static copy`);
  }

  const res = await fetch(`./data/${rel}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.text();
}

/* ------------------------------------------------------------------- write */

export async function saveJSON(rel, value, message) {
  const text = `${JSON.stringify(value, null, 2)}\n`;

  if (isLocal) {
    const res = await fetch(`./data/${rel}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: text,
    });
    if (!res.ok) throw new Error(`Local save failed: ${await res.text()}`);
    return;
  }

  const { repo, token, worker } = getConfig();

  if (worker) {
    const res = await fetch(`${worker}/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: rel, content: text, message: message ?? `Update ${rel}` }),
    });
    if (res.status === 409) throw new ConflictError(`${rel} changed underneath us`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Could not save: ${body.error ?? res.status}`);
    }
    const body = await res.json();
    if (body.sha) shas.set(rel, body.sha);
    return;
  }

  if (!repo || !token) throw new Error('This site is not connected to its backend yet.');

  const res = await ghFetch(ghUrl(rel), {
    method: 'PUT',
    body: JSON.stringify({
      message: message ?? `Update ${rel}`,
      content: toBase64(text),
      ...(shas.has(rel) ? { sha: shas.get(rel) } : {}),
    }),
  });

  if (res.status === 409 || res.status === 422) {
    throw new ConflictError(`${rel} changed underneath us`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('GitHub rejected the token. Check it has Contents: read and write on this repo.');
  }
  if (!res.ok) throw new Error(`GitHub save failed (${res.status}): ${(await res.text()).slice(0, 200)}`);

  const body = await res.json();
  if (body.content?.sha) shas.set(rel, body.content.sha);
}

export class ConflictError extends Error {}

/**
 * Read-modify-write with one automatic retry.
 *
 * Two people editing at the same time is the whole reason this exists. Each
 * profile writes to its own file so collisions are rare, but a shared file
 * (profiles.json) can genuinely race — re-reading and replaying the change
 * beats silently overwriting whatever the other person just did.
 */
export async function mutateJSON(rel, fallback, mutate, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await loadJSON(rel, fallback);
    const next = mutate(structuredClone(current));
    try {
      await saveJSON(rel, next, message);
      return next;
    } catch (err) {
      if (err instanceof ConflictError && attempt === 0) {
        shas.delete(rel);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Could not save ${rel} — it kept changing underneath us. Reload and try again.`);
}

/** events.jsonl is append-only and written by the Action; the app only reads. */
export async function loadEvents() {
  const text = await loadText('events.jsonl');
  if (!text) return [];
  return text.split('\n').filter((l) => l.trim()).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}
