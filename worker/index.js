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
const WRITABLE = /^(profiles\.json|profiles\/[a-z0-9_-]{1,40}\/library\.json)$/i;
const READABLE = /^(profiles\.json|series-state\.json|authors\.json|events\.jsonl|profiles\/[a-z0-9_-]{1,40}\/library\.json)$/i;
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
