/**
 * Tests for the fixes from the end-to-end audit: the unread count, "read
 * next" with a book already on the pile, date sanity, the undo helpers, and
 * the Worker's handling of concurrent saves and a half-finished check.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  datesProblem, reopenRecommendation, restoreBook, addRecommendation, answerRecommendation,
} from '../docs/app/core/model.js';
import {
  unseenEvents, visibleEvents, eventStamp, nextInSeries, snapshotSeries,
} from '../docs/app/core/watch.js';
import { rankHits } from '../docs/app/core/hardcover.js';
import worker from '../worker/index.js';

const NOW = '2026-09-23';

/* ------------------------------------------------------ unread events */

test('an event found later on the day the feed was marked read still counts as unread', () => {
  const profile = { id: 'gabriel', lastSeen: '2026-09-22T09:00:00.000Z' };
  const events = [
    // Logged that afternoon: only the full timestamp can tell it is newer.
    { profile: 'gabriel', bookId: '1', type: 'released', detectedAt: '2026-09-22', at: '2026-09-22T13:10:00.000Z' },
    // Logged that morning, before the feed was read.
    { profile: 'gabriel', bookId: '2', type: 'released', detectedAt: '2026-09-22', at: '2026-09-22T04:00:00.000Z' },
    // Someone else's news.
    { profile: 'stephanie', bookId: '3', type: 'released', detectedAt: '2026-09-23', at: '2026-09-23T04:00:00.000Z' },
  ];
  assert.deepEqual(unseenEvents(events, profile, { books: [] }).map((e) => e.bookId), ['1']);
});

test('events without a timestamp fall back to the day, and hidden books drop out of the feed', () => {
  const e = { profile: 'gabriel', bookId: '9', type: 'date_set', detectedAt: '2026-09-20' };
  assert.equal(eventStamp(e), '2026-09-20');
  assert.equal(eventStamp({ at: '2026-09-20T01:00:00Z', detectedAt: '2026-09-20' }), '2026-09-20T01:00:00Z');
  const lib = { books: [], hidden: { 9: { title: 'x' } } };
  assert.deepEqual(visibleEvents([e], { id: 'gabriel' }, lib), []);
  assert.equal(unseenEvents([e], { id: 'gabriel', lastSeen: null }, { books: [] }).length, 1, 'never looked: everything is new');
});

/* ------------------------------------------------- read next, with a pile */

const redRising = snapshotSeries({ id: '50', name: 'Red Rising Saga', books: [
  { bookId: '1', position: 1, title: 'Red Rising', releaseDate: '2014-01-28' },
  { bookId: '2', position: 2, title: 'Golden Son', releaseDate: '2015-01-06' },
  { bookId: '3', position: 3, title: 'Morning Star', releaseDate: '2016-02-09' },
  { bookId: '4', position: 4, title: 'Iron Gold', releaseDate: '2018-01-16' },
] }, NOW);

const rr = (id, position, status) => ({
  id: `hc:${id}`, hardcoverId: String(id), title: ['', 'Red Rising', 'Golden Son', 'Morning Star', 'Iron Gold'][id],
  series: { id: '50', name: 'Red Rising Saga', position }, status, authors: [],
});

test('a book already waiting on the pile comes before the next one to get', () => {
  const lib = { books: [rr(1, 1, 'read'), rr(2, 2, 'reading'), rr(3, 3, 'tbr')] };
  const [group] = nextInSeries({ 50: redRising }, lib, NOW);
  assert.equal(group.next.bookId, '4', 'Iron Gold is still the next one you do not have');
  assert.deepEqual(group.queued, { title: 'Morning Star', position: 3 });
});

test('nothing is queued when the pile holds nothing earlier', () => {
  const lib = { books: [rr(1, 1, 'read'), rr(2, 2, 'read')] };
  const [group] = nextInSeries({ 50: redRising }, lib, NOW);
  assert.equal(group.next.bookId, '3');
  assert.equal(group.queued, null);
});

/* ---------------------------------------------------------- date sanity */

test('exact reading dates must be in order and not in the future', () => {
  assert.equal(datesProblem({ started: '', finished: '' }, NOW), null);
  assert.equal(datesProblem({ started: '2026-01-02', finished: '2026-01-09' }, NOW), null);
  assert.equal(datesProblem({ started: '2026-01-02', finished: '2026-01-02' }, NOW), null, 'a book read in a day');
  assert.match(datesProblem({ started: '2026-02-01', finished: '2026-01-09' }, NOW), /before the start/);
  assert.match(datesProblem({ started: null, finished: '2026-10-01' }, NOW), /future/);
  assert.match(datesProblem({ started: '2027-01-01', finished: null }, NOW), /future/);
});

/* ----------------------------------------------------------------- undo */

test('a pass can be taken back; an accepted recommendation is left alone', () => {
  const book = { id: 'hc:7', hardcoverId: '7', title: 'Piranesi', authors: [] };
  const lib = { books: [] };
  addRecommendation(lib, { book, from: 'stephanie', now: NOW });
  const recId = lib.recommendations[0].id;
  answerRecommendation(lib, recId, 'dismissed', NOW);
  reopenRecommendation(lib, recId);
  assert.equal(lib.recommendations[0].status, 'new');
  assert.equal(lib.recommendations[0].answeredAt, undefined);

  answerRecommendation(lib, recId, 'added', NOW);
  reopenRecommendation(lib, recId);
  assert.equal(lib.recommendations[0].status, 'added');
  assert.throws(() => reopenRecommendation(lib, 'nope'), /no longer there/);
});

test('undoing a removal restores the record exactly, but never over a re-added copy', () => {
  const removed = { id: 'hc:1', title: 'A', rating: 4.5, note: 'loved it', readOn: '2024' };
  const lib = restoreBook({ books: [] }, removed);
  assert.deepEqual(lib.books, [removed]);
  assert.notEqual(lib.books[0], removed, 'a copy, not the same object');

  const readded = { id: 'hc:1', title: 'A', rating: null };
  const lib2 = restoreBook({ books: [readded] }, removed);
  assert.deepEqual(lib2.books, [readded]);
});

/* ------------------------------------------------------ search ranking */

const hit = (title, author) => ({ title, authors: [{ name: author }] });

test('box sets, split dramatisations and borrowed-title summaries sink below the real book', () => {
  const ranked = rankHits([
    hit('The Empyrean Series, 3 Books Collection Set', 'Rebecca Yarros'),
    hit('Golden Son (1 of 2) [Dramatized Adaptation]', 'Pierce Brown'),
    hit('Piranesi by Susanna Clarke', 'William J. Collopy'),
    hit('Piranesi', 'Susanna Clarke'),
    hit('Fourth Wing', 'Rebecca Yarros'),
  ]).map((h) => h.title);
  assert.deepEqual(ranked.slice(0, 2), ['Piranesi', 'Fourth Wing']);
  assert.equal(ranked.length, 5, 'nothing is dropped');
});

test('a title that merely contains "by" is left where the search put it', () => {
  const hits = [hit('Stand by Me', 'Someone'), hit('Death by Chocolate Cake', 'Sarah Graves'), hit('Other', 'X')];
  assert.deepEqual(rankHits(hits).map((h) => h.title), ['Stand by Me', 'Death by Chocolate Cake', 'Other']);
  // Credited to its own author in the title: fine too.
  assert.equal(rankHits([hit('Dune by Frank Herbert', 'Frank Herbert'), hit('Dune', 'Frank Herbert')])[0].title, 'Dune by Frank Herbert');
});

/* ---------------------------------------------------------------- worker */

const ENV = { REPO: 'owner/repo', GITHUB_TOKEN: 'gh', HARDCOVER_TOKEN: 'hc' };
const origFetch = globalThis.fetch;
const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');

function github(files, { failRead = new Set(), putStatus = () => 200 } = {}) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    const method = options.method ?? 'GET';
    calls.push({ url: u, method, body: options.body ? JSON.parse(options.body) : null });
    if (u.includes('hardcover')) {
      // One watched series, whose second book has just been given a date.
      return new Response(JSON.stringify({ data: { series: [{
        id: 50, name: 'Red Rising Saga', books_count: 2, author: null,
        book_series: [
          { position: 1, book: { id: 1, title: 'Red Rising', release_date: '2014-01-28', release_year: 2014, image: null } },
          { position: 2, book: { id: 2, title: 'Golden Son', release_date: '2027-05-01', release_year: 2027, image: null } },
        ],
      }] } }), { status: 200 });
    }
    const path = u.split('/docs/data/')[1];
    if (method === 'GET') {
      if (failRead.has(path)) return new Response('{}', { status: 500 });
      if (!(path in files)) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify({ sha: `sha-${path}`, content: b64(files[path]) }), { status: 200 });
    }
    const status = putStatus(path);
    return new Response(JSON.stringify({ content: { sha: 'new' } }), { status });
  };
  return calls;
}

const write = (body) => worker.fetch(new Request('https://w.dev/write', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), ENV);
const check = () => worker.fetch(new Request('https://w.dev/check', { method: 'POST' }), ENV);

test('a write carries the page’s sha, so a save made in between is refused, not overwritten', async () => {
  const sha = 'a'.repeat(40);
  const calls = github({ 'profiles/gabriel/library.json': '{"books":[]}' });
  const res = await write({ path: 'profiles/gabriel/library.json', content: '{"books":[]}', sha });
  assert.equal(res.status, 200);
  const put = calls.find((c) => c.method === 'PUT');
  assert.equal(put.body.sha, sha);
  assert.equal(calls.filter((c) => c.method === 'GET').length, 0, 'no need to look the sha up');
  globalThis.fetch = origFetch;
});

test('a write without a usable sha still works, against the latest copy', async () => {
  const calls = github({ 'profiles/gabriel/library.json': '{"books":[]}' });
  const res = await write({ path: 'profiles/gabriel/library.json', content: '{"books":[]}', sha: 'not a sha' });
  assert.equal(res.status, 200);
  assert.equal(calls.find((c) => c.method === 'PUT').body.sha, 'sha-profiles/gabriel/library.json');
  globalThis.fetch = origFetch;
});

const checkFiles = () => ({
  'profiles.json': JSON.stringify({ profiles: [{ id: 'gabriel', name: 'Gabriel' }] }),
  'profiles/gabriel/library.json': JSON.stringify({ books: [
    { id: 'hc:1', hardcoverId: '1', title: 'Red Rising', status: 'read', authors: [],
      series: { id: '50', name: 'Red Rising Saga', position: 1 } },
  ] }),
  'series-state.json': JSON.stringify({ 50: { id: '50', name: 'Red Rising Saga', checkedAt: '2026-01-01', books: {
    1: { position: 1, title: 'Red Rising', releaseDate: '2014-01-28' },
    2: { position: 2, title: 'Golden Son', releaseDate: null },
  } } }),
  'authors.json': '{}',
  'events.jsonl': '{"key":"old"}\n',
});

test('the check saves its events before the new snapshots, and keeps the old log', async () => {
  const calls = github(checkFiles());
  const res = await check();
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.events, 1, 'the new date is announced');
  const puts = calls.filter((c) => c.method === 'PUT').map((c) => c.url.split('/docs/data/')[1]);
  assert.equal(puts[0], 'events.jsonl', 'events first');
  assert.ok(puts.includes('series-state.json'));
  const log = Buffer.from(calls.find((c) => c.method === 'PUT' && c.url.endsWith('events.jsonl')).body.content, 'base64').toString();
  assert.match(log, /^\{"key":"old"\}\n\{.*"type":"date_set"/);
  globalThis.fetch = origFetch;
});

test('an unreadable event log stops the check instead of re-announcing everything', async () => {
  const calls = github(checkFiles(), { failRead: new Set(['events.jsonl']) });
  const res = await check();
  assert.equal(res.status, 502);
  assert.equal(calls.filter((c) => c.method === 'PUT').length, 0, 'nothing written');
  globalThis.fetch = origFetch;
});

test('if the events cannot be saved, the snapshots are not moved on either', async () => {
  const calls = github(checkFiles(), { putStatus: (path) => (path === 'events.jsonl' ? 500 : 200) });
  const res = await check();
  assert.equal(res.status, 502);
  assert.ok(!calls.some((c) => c.method === 'PUT' && c.url.endsWith('series-state.json')),
    'the next check must still see the change');
  globalThis.fetch = origFetch;
});

test('a state file that fails to save is reported, not hidden behind ok', async () => {
  github(checkFiles(), { putStatus: (path) => (path === 'authors.json' ? 500 : 200) });
  const body = await (await check()).json();
  assert.ok(body.failures.includes('could not save authors.json'));
  globalThis.fetch = origFetch;
});
