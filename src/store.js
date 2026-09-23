/**
 * File I/O for the data directory. Node-only — the browser reaches the same
 * files through the GitHub Contents API instead.
 *
 * Everything lives under docs/ so GitHub Pages serves it and the web app can
 * read it with a relative fetch.
 */

import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..');
export const DATA = join(ROOT, 'docs', 'data');

const paths = {
  profiles: join(DATA, 'profiles.json'),
  seriesState: join(DATA, 'series-state.json'),
  authors: join(DATA, 'authors.json'),
  books: join(DATA, 'books-state.json'),
  events: join(DATA, 'events.jsonl'),
  library: (id) => join(DATA, 'profiles', id, 'library.json'),
};
export { paths };

async function readJSON(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    throw new Error(`${file} is not valid JSON (${err.message}). Fix or delete it.`);
  }
}

async function writeJSON(file, value) {
  await mkdir(dirname(file), { recursive: true });
  // Trailing newline and stable 2-space indent keep git diffs readable, which
  // is half the reason the data lives in git at all.
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

/* --------------------------------------------------------------- profiles */

export async function loadProfiles() {
  return readJSON(paths.profiles, { profiles: [] });
}

export async function saveProfiles(value) {
  await writeJSON(paths.profiles, value);
}

export async function loadLibrary(profileId) {
  return readJSON(paths.library(profileId), { books: [], watch: { series: {}, authors: {} } });
}

export async function saveLibrary(profileId, library) {
  await writeJSON(paths.library(profileId), library);
}

/** Every profile's library, keyed by id — what the watcher unions over. */
export async function loadAllLibraries() {
  const { profiles } = await loadProfiles();
  const out = {};
  for (const p of profiles) out[p.id] = await loadLibrary(p.id);
  return out;
}

/* ------------------------------------------------------------- watch state */

export async function loadSeriesState() {
  return readJSON(paths.seriesState, {});
}
export async function saveSeriesState(value) {
  await writeJSON(paths.seriesState, value);
}
export async function loadAuthorState() {
  return readJSON(paths.authors, {});
}
export async function saveAuthorState(value) {
  await writeJSON(paths.authors, value);
}
export async function loadBookState() {
  return readJSON(paths.books, {});
}
export async function saveBookState(value) {
  await writeJSON(paths.books, value);
}

/* ------------------------------------------------------------------ events */

/**
 * Event keys already logged. The watcher uses this to guarantee that a book
 * stuck at the same release date doesn't re-alert on every daily run.
 */
export async function loadEventKeys() {
  if (!existsSync(paths.events)) return new Set();
  const text = await readFile(paths.events, 'utf8');
  const keys = new Set();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const key = JSON.parse(line).key;
      if (key) keys.add(key);
    } catch {
      // A single corrupt line shouldn't stop the watcher; worst case we
      // re-announce one event rather than lose the whole log.
    }
  }
  return keys;
}

export async function loadEvents() {
  if (!existsSync(paths.events)) return [];
  const text = await readFile(paths.events, 'utf8');
  return text.split('\n').filter((l) => l.trim()).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}

export async function appendEvents(events) {
  if (!events.length) return;
  await mkdir(dirname(paths.events), { recursive: true });
  await appendFile(paths.events, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
}

/* ------------------------------------------------------------------ secrets */

/** Minimal .env reader — avoids a dependency for one file of KEY=value. */
export async function loadToken() {
  if (process.env.HARDCOVER_API_TOKEN) return process.env.HARDCOVER_API_TOKEN;
  const envFile = join(ROOT, '.env');
  if (!existsSync(envFile)) return null;
  for (const line of (await readFile(envFile, 'utf8')).split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?HARDCOVER_API_TOKEN\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^['"]|['"]$/g, '').trim();
  }
  return null;
}
