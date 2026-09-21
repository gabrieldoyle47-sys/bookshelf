import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

// A stub GitHub that records calls instead of making them.
let calls = [];
const origFetch = globalThis.fetch;
function stubGitHub() {
  calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method ?? 'GET' });
    if ((options.method ?? 'GET') === 'GET') {
      return new Response(JSON.stringify({ sha: 'abc', content: btoa('{"books":[]}') }), { status: 200 });
    }
    return new Response(JSON.stringify({ content: { sha: 'def' }, commit: { sha: 'c1' } }), { status: 200 });
  };
}
const restore = () => { globalThis.fetch = origFetch; };

const ENV = {
  REPO: 'owner/repo', GITHUB_TOKEN: 'gh_test', WRITE_KEY: 'correct-horse',
  ALLOWED_ORIGIN: 'https://example.github.io',
};

const write = (body) => worker.fetch(
  new Request('https://w.dev/write', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), ENV);

const good = { key: 'correct-horse', path: 'profiles/gabriel/library.json', content: '{"books":[]}' };

test('a correct key writes the data file', async () => {
  stubGitHub();
  const res = await write(good);
  assert.equal(res.status, 200);
  assert.ok(calls.some((c) => c.method === 'PUT'), 'should have committed');
  restore();
});

test('a wrong key is refused and never touches GitHub', async () => {
  stubGitHub();
  const res = await write({ ...good, key: 'wrong' });
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0, 'must not reach GitHub at all');
  restore();
});

test('a missing key is refused', async () => {
  stubGitHub();
  assert.equal((await write({ ...good, key: undefined })).status, 403);
  assert.equal(calls.length, 0);
  restore();
});

// The whole point of the whitelist: a leaked key must not be able to change
// the site's code or its scheduled workflow.
for (const evil of [
  '../../.github/workflows/check.yml',
  '../../index.html',
  '../app/ui/main.js',
  '../../../README.md',
  'profiles/../../.github/workflows/check.yml',
  'events.jsonl',
  'profiles/gabriel/../../evil.json',
]) {
  test(`refuses to write outside the data files: ${evil}`, async () => {
    stubGitHub();
    const res = await write({ ...good, path: evil });
    assert.equal(res.status, 400, `${evil} must be rejected`);
    assert.equal(calls.length, 0, 'must not reach GitHub');
    restore();
  });
}

test('accepts the two legitimate write paths', async () => {
  for (const path of ['profiles.json', 'profiles/stephanie/library.json']) {
    stubGitHub();
    assert.equal((await write({ ...good, path })).status, 200, path);
    restore();
  }
});

test('refuses content that is not valid JSON', async () => {
  stubGitHub();
  const res = await write({ ...good, content: 'not json{' });
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0, 'never commit something that breaks the site');
  restore();
});

test('refuses oversized content', async () => {
  stubGitHub();
  const res = await write({ ...good, content: JSON.stringify({ x: 'a'.repeat(600 * 1024) }) });
  assert.equal(res.status, 400);
  restore();
});

test('reads are confined to the data directory too', async () => {
  stubGitHub();
  const bad = await worker.fetch(new Request('https://w.dev/read?path=../../index.html'), ENV);
  assert.equal(bad.status, 400);
  assert.equal(calls.length, 0);
  const ok = await worker.fetch(new Request('https://w.dev/read?path=profiles.json'), ENV);
  assert.equal(ok.status, 200);
  restore();
});

test('reads need no key but writes do', async () => {
  stubGitHub();
  const res = await worker.fetch(new Request('https://w.dev/read?path=series-state.json'), ENV);
  assert.equal(res.status, 200, 'the site is publicly readable anyway');
  restore();
});

test('unknown routes and methods are refused', async () => {
  stubGitHub();
  assert.equal((await worker.fetch(new Request('https://w.dev/'), ENV)).status, 404);
  assert.equal((await worker.fetch(new Request('https://w.dev/write'), ENV)).status, 404);
  restore();
});

test('CORS preflight is answered for the allowed origin', async () => {
  const res = await worker.fetch(new Request('https://w.dev/write', { method: 'OPTIONS' }), ENV);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ENV.ALLOWED_ORIGIN);
});

test('a worker with no key configured refuses every write', async () => {
  stubGitHub();
  const res = await worker.fetch(
    new Request('https://w.dev/write', { method: 'POST', body: JSON.stringify(good) }),
    { ...ENV, WRITE_KEY: '' });
  assert.equal(res.status, 403, 'an unconfigured worker must be closed, not open');
  restore();
});
