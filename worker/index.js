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
import { releaseInvite } from '../docs/app/core/calendar.js';
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

/**
 * Read a data file, or a fallback when it does not exist yet. Any other
 * failure stops the check: carrying on with an empty snapshot would make
 * every series look brand new (and so silently drop a moved date).
 */
async function readData(env, path, fallback) {
  const res = await gh(env, path);
  if (res.status === 404) return fallback;
  if (!res.ok) throw new Error(`could not read ${path} (github ${res.status})`);
  try {
    return JSON.parse(decodeBase64((await res.json()).content));
  } catch {
    return fallback;
  }
}

/**
 * Write a whole data file, fetching its sha first so we update rather than
 * clobber. A conflict (the nightly job committing at the same moment) is
 * retried once; these files are rebuilt in full by the check, so the fresh
 * result is the right one to keep.
 */
async function writeData(env, path, text, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await gh(env, path);
    const sha = current.ok ? (await current.json()).sha : undefined;
    const res = await gh(env, path, {
      method: 'PUT',
      body: JSON.stringify({ message, content: encodeBase64(text), ...(sha ? { sha } : {}) }),
    });
    if (res.ok) return true;
    if (res.status !== 409 && res.status !== 422) return false;
  }
  return false;
}

/**
 * The event log as text, plus its sha.
 *
 * Refuses rather than guessing. Treating an unreadable log as empty meant
 * every event looked unseen - so a GitHub hiccup re-announced everything -
 * and the append then replaced the whole history with just today's lines.
 * The Contents API also stops returning content for files over 1 MB.
 */
async function readEvents(env) {
  const res = await gh(env, 'events.jsonl');
  if (res.status === 404) return { text: '', sha: undefined };
  if (!res.ok) throw new Error(`could not read events.jsonl (github ${res.status})`);
  const body = await res.json();
  if (!body.content && body.size) throw new Error('events.jsonl is too large for the GitHub contents API');
  return { text: decodeBase64(body.content ?? ''), sha: body.sha };
}

/** Append lines to the event log, re-reading and retrying on a conflict. */
async function appendEvents(env, lines, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, sha } = await readEvents(env);
    const next = `${text}${text && !text.endsWith('\n') ? '\n' : ''}${lines}\n`;
    const res = await gh(env, 'events.jsonl', {
      method: 'PUT',
      body: JSON.stringify({ message, content: encodeBase64(next), ...(sha ? { sha } : {}) }),
    });
    if (res.ok) return;
    if (res.status !== 409 && res.status !== 422) throw new Error(`could not save events (github ${res.status})`);
  }
  throw new Error('events.jsonl kept changing; try again');
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

  const { text: eventsText } = await readEvents(env);
  const seen = new Set();
  for (const line of eventsText.split('\n')) {
    if (!line.trim()) continue;
    try { const k = JSON.parse(line).key; if (k) seen.add(k); } catch { /* skip */ }
  }

  const result = await runReleaseCheck({ gql, libraries, seriesState, authorState, bookState, seen, now });
  const fresh = result.events;

  const stamped = new Date().toISOString();
  // Events first. If the new snapshots were saved and the events were not,
  // the next check would compare against the new snapshots and the news
  // would be lost for good; this way round, a failure part-way through just
  // means the next check finds the same changes again, and the log's keys
  // stop them being announced twice.
  if (fresh.length) {
    const lines = fresh.map((e) => JSON.stringify({ ...e, at: stamped })).join('\n');
    await appendEvents(env, lines, `Release events ${now}`);
  }
  const unsaved = [];
  if (!await writeData(env, 'series-state.json', asJson(seriesState), `Release check ${now}`)) unsaved.push('series-state.json');
  if (!await writeData(env, 'authors.json', asJson(authorState), `Release check ${now}`)) unsaved.push('authors.json');
  if (result.checkedTracked || Object.keys(bookState).length) {
    if (!await writeData(env, 'books-state.json', asJson(bookState), `Release check ${now}`)) unsaved.push('books-state.json');
  }

  return {
    ok: true,
    checkedSeries: result.checkedSeries,
    checkedAuthors: result.checkedAuthors,
    checkedTracked: result.checkedTracked,
    newSeries: result.newSeries,
    upcoming: result.upcoming,
    events: fresh.length,
    // Said out loud rather than reporting success over a half-saved check.
    failures: [...result.failures, ...unsaved.map((f) => `could not save ${f}`)],
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

    /* ---- a release day as a calendar invite ---- */
    // Opened as a plain link, so an iPhone shows "Add to Calendar" and a Mac
    // opens Calendar. Everything comes from the query string; nothing is
    // stored and no token is used, so there is nothing here to protect.
    if (request.method === 'GET' && url.pathname === '/ics') {
      const q = (k, max) => (url.searchParams.get(k) ?? '').slice(0, max);
      const link = q('link', 300);
      try {
        const body = releaseInvite({
          id: q('id', 20),
          title: q('title', 200),
          date: q('date', 10),
          by: q('by', 200),
          series: q('series', 200),
          // Only ever a link to Hardcover or Indigo, never anything passed in.
          link: /^https:\/\/(hardcover\.app|www\.indigo\.ca)\//.test(link) ? link : '',
        });
        const file = (q('title', 60).replace(/[^\w -]/g, '').trim() || 'release').replace(/\s+/g, '-');
        return new Response(body, {
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': `inline; filename="${file}.ics"`,
            'Cache-Control': 'no-store',
            ...CORS,
          },
        });
      } catch (err) {
        return json({ error: err.message }, 400);
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

      // Optimistic concurrency. The page sends the sha of the copy it edited;
      // committing against that sha makes GitHub refuse (409) if someone else
      // saved in between, and the page re-reads and replays its change.
      // Fetching the latest sha here instead - still the fallback for pages
      // that do not send one - quietly overwrote the other person's save.
      let sha = typeof payload.sha === 'string' && /^[0-9a-f]{40}$/.test(payload.sha) ? payload.sha : undefined;
      if (!sha) {
        const current = await gh(env, payload.path);
        sha = current.ok ? (await current.json()).sha : undefined;
      }

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
