/**
 * Bookshelf backend.
 *
 * GitHub Pages is a static host, so the page cannot hold the GitHub or
 * Hardcover tokens — a token committed to a public repo is auto-revoked by
 * GitHub's secret scanning within minutes, so it simply wouldn't keep working.
 * This Worker holds both instead, which is what lets the site be a single link
 * that anyone can open and use with nothing to set up.
 *
 * Secrets (wrangler secret put):
 *   GITHUB_TOKEN     fine-grained, Contents: read and write, this repo
 *   HARDCOVER_TOKEN  for book search
 *
 * Vars (wrangler.toml):
 *   REPO             "owner/name"
 */

// Confined to the data files: not as a defence, but so a bug or a stray
// request can't scribble over the site's own code and break it for everyone.
import { createClient, booksByIds } from '../docs/app/core/hardcover.js';
import { today } from '../docs/app/core/model.js';
import { runReleaseCheck } from '../docs/app/core/check.js';

const WRITABLE = /^(profiles\.json|profiles\/[a-z0-9_-]{1,40}\/library\.json)$/i;
const READABLE = /^(profiles\.json|series-state\.json|authors\.json|books-state\.json|events\.jsonl|profiles\/[a-z0-9_-]{1,40}\/library\.json)$/i;
const MAX_BYTES = 512 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const json = (body, statusCode = 200) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
  });

/**
 * Base64 <-> text, via bytes.
 *
 * atob() hands back a *binary* string: one character per byte. A multi-byte
 * UTF-8 sequence therefore arrives as several Latin-1 characters, and saving
 * that back re-encodes each of them — so a zero-width space (E2 80 8B) grows
 * into six bytes, then twelve. Going through TextDecoder keeps text as text.
 */
const decodeBase64 = (b64) => {
  const binary = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
};

const encodeBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};

const gh = (env, path, options = {}) =>
  fetch(`https://api.github.com/repos/${env.REPO}/contents/docs/data/${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'bookshelf-worker',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

/* ----------------------------------------------------------- the watcher */

/** Read a data file, or a fallback when it does not exist yet. */
async function readData(env, path, fallback) {
  const res = await gh(env, path);
  if (!res.ok) return fallback;
  try {
    return JSON.parse(decodeBase64((await res.json()).content));
  } catch {
    return fallback;
  }
}

/** Write a data file, fetching its sha first so we update rather than clobber. */
async function writeData(env, path, text, message) {
  const current = await gh(env, path);
  const sha = current.ok ? (await current.json()).sha : undefined;
  const res = await gh(env, path, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: encodeBase64(text),
      ...(sha ? { sha } : {}),
    }),
  });
  return res.ok;
}

const asJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * Run the release check now, rather than waiting for the nightly job.
 *
 * Identical logic to the scheduled run - both call core/check.js - so
 * pressing the button and waiting until tomorrow cannot disagree.
 */
async function runCheck(env) {
  const gql = createClient(env.HARDCOVER_TOKEN);
  const now = today();

  const { profiles } = await readData(env, 'profiles.json', { profiles: [] });
  const libraries = {};
  for (const p of profiles) {
    libraries[p.id] = await readData(env, `profiles/${p.id}/library.json`, { books: [] });
  }

  const seriesState = await readData(env, 'series-state.json', {});
  const authorState = await readData(env, 'authors.json', {});
  const bookState = await readData(env, 'books-state.json', {});

  const eventsRes = await gh(env, 'events.jsonl');
  const eventsText = eventsRes.ok ? decodeBase64((await eventsRes.json()).content) : '';
  const seen = new Set();
  for (const line of eventsText.split('\n')) {
    if (!line.trim()) continue;
    try { const k = JSON.parse(line).key; if (k) seen.add(k); } catch { /* skip */ }
  }

  const result = await runReleaseCheck({ gql, libraries, seriesState, authorState, bookState, seen, now });
  const fresh = result.events;

  const stamped = new Date().toISOString();
  await writeData(env, 'series-state.json', asJson(seriesState), `Release check ${now}`);
  await writeData(env, 'authors.json', asJson(authorState), `Release check ${now}`);
  if (result.checkedTracked || Object.keys(bookState).length) {
    await writeData(env, 'books-state.json', asJson(bookState), `Release check ${now}`);
  }
  if (fresh.length) {
    const lines = fresh.map((e) => JSON.stringify({ ...e, at: stamped })).join('\n');
    await writeData(env, 'events.jsonl', `${eventsText}${eventsText && !eventsText.endsWith('\n') ? '\n' : ''}${lines}\n`, `Release events ${now}`);
  }

  return {
    ok: true,
    checkedSeries: result.checkedSeries,
    checkedAuthors: result.checkedAuthors,
    checkedTracked: result.checkedTracked,
    newSeries: result.newSeries,
    upcoming: result.upcoming,
    events: fresh.length,
    failures: result.failures,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    /* ---- book search, so no one has to paste a Hardcover token ---- */
    if (request.method === 'GET' && url.pathname === '/search') {
      const q = url.searchParams.get('q') ?? '';
      const perPage = Math.min(Number(url.searchParams.get('n')) || 8, 25);
      if (q.trim().length < 2) return json({ error: 'query too short' }, 400);

      const res = await fetch('https://api.hardcover.app/v1/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.HARDCOVER_TOKEN}` },
        body: JSON.stringify({
          query: `query Search($q: String!, $perPage: Int!) {
            search(query: $q, query_type: "Book", per_page: $perPage, page: 1) { results }
          }`,
          variables: { q, perPage },
        }),
      });
      if (!res.ok) return json({ error: `hardcover ${res.status}` }, 502);
      const body = await res.json();
      if (body.errors?.length) return json({ error: body.errors[0].message }, 502);
      return json(body.data);
    }

    /* ---- full details for up to 20 books, for panels and one-click adds ---- */
    if (request.method === 'GET' && url.pathname === '/book') {
      const ids = (url.searchParams.get('ids') ?? url.searchParams.get('id') ?? '')
        .split(',').map((x) => x.trim()).filter((x) => /^\d{1,10}$/.test(x)).slice(0, 20);
      if (!ids.length) return json({ error: 'no book ids' }, 400);
      try {
        return json({ books: await booksByIds(createClient(env.HARDCOVER_TOKEN), ids) });
      } catch (err) {
        return json({ error: err.message }, 502);
      }
    }

    /* ---- reads: through here so they're never a stale Pages cache ---- */
    if (request.method === 'GET' && url.pathname === '/read') {
      const path = url.searchParams.get('path') ?? '';
      if (!READABLE.test(path)) return json({ error: 'unknown file' }, 400);

      const res = await gh(env, path);
      if (res.status === 404) return json({ error: 'not found' }, 404);
      if (!res.ok) return json({ error: `github ${res.status}` }, 502);
      const body = await res.json();
      return json({ content: decodeBase64(body.content), sha: body.sha });
    }

    /* ---- run the release check on demand ---- */
    if (request.method === 'POST' && url.pathname === '/check') {
      try {
        return json(await runCheck(env));
      } catch (err) {
        return json({ error: err.message }, 502);
      }
    }

    /* ---- writes: open, by design ---- */
    if (request.method === 'POST' && url.pathname === '/write') {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ error: 'body must be JSON' }, 400);
      }

      if (!WRITABLE.test(payload.path ?? '')) return json({ error: 'unknown file' }, 400);
      if (typeof payload.content !== 'string' || payload.content.length > MAX_BYTES) {
        return json({ error: 'content missing or too large' }, 400);
      }
      // Never commit something that would break the site on load.
      try {
        JSON.parse(payload.content);
      } catch {
        return json({ error: 'content is not valid JSON' }, 400);
      }

      const current = await gh(env, payload.path);
      const sha = current.ok ? (await current.json()).sha : undefined;

      const put = await gh(env, payload.path, {
        method: 'PUT',
        body: JSON.stringify({
          message: payload.message ?? `Update ${payload.path}`,
          content: encodeBase64(payload.content),
          ...(sha ? { sha } : {}),
        }),
      });

      if (put.status === 409 || put.status === 422) return json({ error: 'conflict', retry: true }, 409);
      if (!put.ok) return json({ error: `github ${put.status}` }, 502);

      const body = await put.json();
      return json({ ok: true, sha: body.content?.sha });
    }

    return json({ error: 'not found' }, 404);
  },
};
