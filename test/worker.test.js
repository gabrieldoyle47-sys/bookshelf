import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

let calls = [];
const origFetch = globalThis.fetch;

function stub({ hardcover } = {}) {
  calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    calls.push({ url: u, method: options.method ?? 'GET' });
    if (u.includes('hardcover')) {
      return new Response(JSON.stringify(hardcover ?? {
        data: { search: { results: { hits: [{ document: { id: 1, title: 'Piranesi' } }] } } },
      }), { status: 200 });
    }
    if ((options.method ?? 'GET') === 'GET') {
      return new Response(JSON.stringify({ sha: 'abc', content: btoa('{"books":[]}') }), { status: 200 });
    }
    return new Response(JSON.stringify({ content: { sha: 'def' } }), { status: 200 });
  };
}
const restore = () => { globalThis.fetch = origFetch; };

const ENV = { REPO: 'owner/repo', GITHUB_TOKEN: 'gh', HARDCOVER_TOKEN: 'hc' };

const write = (body) => worker.fetch(
  new Request('https://w.dev/write', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), ENV);

const good = { path: 'profiles/gabriel/library.json', content: '{"books":[]}' };

test('anyone can write a shelf — no key, by design', async () => {
  stub();
  const res = await write(good);
  assert.equal(res.status, 200);
  assert.ok(calls.some((c) => c.method === 'PUT'), 'should have committed');
  restore();
});

test('both legitimate write paths are accepted', async () => {
  for (const path of ['profiles.json', 'profiles/stephanie/library.json']) {
    stub();
    assert.equal((await write({ ...good, path })).status, 200, path);
    restore();
  }
});

// Not a security boundary — a guard so a bug or stray request can't scribble
// over the site's own code and break it for everyone.
for (const evil of [
  '../../.github/workflows/check.yml',
  '../../index.html',
  '../app/ui/main.js',
  'profiles/../../.github/workflows/check.yml',
  'profiles/gabriel/../../evil.json',
]) {
  test(`will not write outside the data files: ${evil}`, async () => {
    stub();
    assert.equal((await write({ ...good, path: evil })).status, 400);
    assert.equal(calls.length, 0, 'must not reach GitHub');
    restore();
  });
}

test('refuses content that is not valid JSON', async () => {
  stub();
  assert.equal((await write({ ...good, content: 'nope{' })).status, 400);
  assert.equal(calls.length, 0, 'never commit something that breaks the site');
  restore();
});

test('refuses oversized content', async () => {
  stub();
  assert.equal((await write({ ...good, content: JSON.stringify({ x: 'a'.repeat(600 * 1024) }) })).status, 400);
  restore();
});

test('a GitHub conflict is reported as retryable', async () => {
  stub();
  globalThis.fetch = async (url, options = {}) => {
    if ((options.method ?? 'GET') === 'GET') {
      return new Response(JSON.stringify({ sha: 'abc', content: btoa('{}') }), { status: 200 });
    }
    return new Response('{}', { status: 409 });
  };
  const res = await write(good);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).retry, true);
  restore();
});

test('search proxies Hardcover so no token is needed in the browser', async () => {
  stub();
  const res = await worker.fetch(new Request('https://w.dev/search?q=piranesi'), ENV);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.search.results.hits[0].document.title, 'Piranesi');
  assert.ok(calls.some((c) => c.url.includes('hardcover')), 'should have called Hardcover');
  restore();
});

test('a too-short search is refused before spending an API call', async () => {
  stub();
  assert.equal((await worker.fetch(new Request('https://w.dev/search?q=a'), ENV)).status, 400);
  assert.equal(calls.length, 0, 'Hardcover allows a burst of only 10');
  restore();
});

test('a Hardcover error surfaces rather than looking like no results', async () => {
  stub({ hardcover: { errors: [{ message: 'rate limited' }] } });
  const res = await worker.fetch(new Request('https://w.dev/search?q=piranesi'), ENV);
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /rate limited/);
  restore();
});

test('reads are confined to the data directory', async () => {
  stub();
  assert.equal((await worker.fetch(new Request('https://w.dev/read?path=../../index.html'), ENV)).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await worker.fetch(new Request('https://w.dev/read?path=profiles.json'), ENV)).status, 200);
  restore();
});

test('unknown routes are refused', async () => {
  stub();
  assert.equal((await worker.fetch(new Request('https://w.dev/'), ENV)).status, 404);
  assert.equal((await worker.fetch(new Request('https://w.dev/write'), ENV)).status, 404);
  restore();
});

test('CORS preflight is answered', async () => {
  const res = await worker.fetch(new Request('https://w.dev/write', { method: 'OPTIONS' }), ENV);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
});
