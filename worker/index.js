/**
 * Bookshelf write proxy.
 *
 * GitHub Pages is a static host, so the page cannot hold a credential without
 * publishing it. This Worker holds the GitHub token instead and commits on the
 * page's behalf, so anyone with the link can add books without pasting a token
 * on every device.
 *
 * Secrets (set with `wrangler secret put`):
 *   GITHUB_TOKEN  a fine-grained token, Contents: read and write, this repo only
 *   WRITE_KEY     the shared key that rides in the ?k= link
 *
 * Vars (wrangler.toml):
 *   REPO          "owner/name"
 *   ALLOWED_ORIGIN  the Pages origin allowed to call this
 */

// The token can write anywhere in the repo, and the key travels in a URL that
// may be forwarded or logged. Restricting writes to the data files means the
// worst a leaked key can do is add junk books — not rewrite the workflow, and
// not inject JavaScript into the page everyone loads.
const WRITABLE = /^(profiles\.json|profiles\/[a-z0-9_-]{1,40}\/library\.json)$/i;
// Reads are broader but still confined to the data directory.
const READABLE = /^(profiles\.json|series-state\.json|authors\.json|events\.jsonl|profiles\/[a-z0-9_-]{1,40}\/library\.json)$/i;

const MAX_BYTES = 512 * 1024;

const cors = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});

const json = (body, statusCode, origin) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(origin) },
  });

/** Compare without leaking length or position through timing. */
function safeEqual(a = '', b = '') {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

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
    const origin = env.ALLOWED_ORIGIN || '*';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    // Reads go through here too, not through the static site: Pages caches for
    // up to a minute after a commit, so a viewer could otherwise add a book and
    // immediately reload into a version that predates it.
    if (request.method === 'GET' && url.pathname === '/read') {
      const path = url.searchParams.get('path') ?? '';
      if (!READABLE.test(path)) return json({ error: 'path not readable' }, 400, origin);

      const res = await gh(env, path);
      if (res.status === 404) return json({ error: 'not found' }, 404, origin);
      if (!res.ok) return json({ error: `github ${res.status}` }, 502, origin);

      const body = await res.json();
      return json({ content: atob(body.content.replace(/\s/g, '')), sha: body.sha }, 200, origin);
    }

    if (request.method !== 'POST' || url.pathname !== '/write') {
      return json({ error: 'not found' }, 404, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'body must be JSON' }, 400, origin);
    }

    if (!env.WRITE_KEY || !safeEqual(payload.key, env.WRITE_KEY)) {
      return json({ error: 'wrong or missing key' }, 403, origin);
    }
    if (!WRITABLE.test(payload.path ?? '')) {
      return json({ error: 'that path is not writable' }, 400, origin);
    }
    if (typeof payload.content !== 'string' || payload.content.length > MAX_BYTES) {
      return json({ error: 'content missing or too large' }, 400, origin);
    }
    // Never commit something that would break the site for everyone.
    try {
      JSON.parse(payload.content);
    } catch {
      return json({ error: 'content is not valid JSON' }, 400, origin);
    }

    // Read the current blob for its sha, so we update rather than clobber.
    const current = await gh(env, payload.path);
    const sha = current.ok ? (await current.json()).sha : undefined;

    const put = await gh(env, payload.path, {
      method: 'PUT',
      body: JSON.stringify({
        message: payload.message ?? `Update ${payload.path}`,
        content: btoa(unescape(encodeURIComponent(payload.content))),
        ...(sha ? { sha } : {}),
      }),
    });

    if (put.status === 409 || put.status === 422) {
      return json({ error: 'conflict', retry: true }, 409, origin);
    }
    if (!put.ok) {
      return json({ error: `github ${put.status}`, detail: (await put.text()).slice(0, 200) }, 502, origin);
    }

    const body = await put.json();
    return json({ ok: true, sha: body.content?.sha, commit: body.commit?.sha }, 200, origin);
  },
};
