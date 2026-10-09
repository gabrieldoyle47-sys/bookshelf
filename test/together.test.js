import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tasteMatch, matchPairs, readTogether, picksFor, activity, genreGrid, yearBoard,
} from '../docs/app/core/together.js';
import {
  addProfile, removeProfile, restoreProfile, activeProfiles, profileId,
} from '../docs/app/core/model.js';

const b = (id, extra = {}) => ({
  id: `hc:${id}`, hardcoverId: String(id), title: `Book ${id}`, authors: [{ id: '1', name: 'A' }],
  status: 'read', rating: null, genres: [], ...extra,
});
const fantasy = { genres: ['Fantasy', 'Adventure'] };
const romance = { genres: ['Romance'] };

/* ---------------------------------------------------------- taste match */

test('identical tastes match fully; nothing in common matches not at all', () => {
  const g = [b(1, fantasy), b(2, fantasy)];
  assert.equal(tasteMatch(g, [b(3, fantasy)]).score, 100);
  assert.equal(tasteMatch(g, [b(4, romance)]).score, 0);
});

test('once three shared books are rated, agreeing on them counts', () => {
  const mine = [b(1, { ...fantasy, rating: 5 }), b(2, { ...fantasy, rating: 5 }), b(3, { ...fantasy, rating: 1 })];
  const agree = mine.map((x) => ({ ...x }));
  const disagree = [b(1, { ...fantasy, rating: 1 }), b(2, { ...fantasy, rating: 1 }), b(3, { ...fantasy, rating: 5 })];
  assert.equal(tasteMatch(mine, agree).score, 100);
  assert.ok(tasteMatch(mine, disagree).score < 75, 'same genres, opposite opinions');
  assert.equal(tasteMatch(mine, agree).bothRead, 3);
});

test('every pair in a group is scored, best first', () => {
  const libs = {
    a: { books: [b(1, fantasy)] }, b: { books: [b(2, fantasy)] }, c: { books: [b(3, romance)] },
  };
  const pairs = matchPairs(libs, ['a', 'b', 'c']);
  assert.equal(pairs.length, 3);
  assert.deepEqual([pairs[0].a, pairs[0].b], ['a', 'b']);
});

/* ------------------------------------------------------- books in common */

test('books read by two or more people carry everyone’s rating and the spread', () => {
  const libs = {
    a: { books: [b(1, { rating: 5 }), b(2)] },
    b: { books: [b(1, { rating: 2 }), b(3)] },
    c: { books: [b(1, { rating: 4 }), b(2, { status: 'tbr' })] },
  };
  const together = readTogether(libs, ['a', 'b', 'c']);
  assert.equal(together.length, 1, 'a book only on someone’s pile is not read together');
  assert.equal(together[0].readers.length, 3);
  assert.equal(together[0].spread, 3);
  assert.equal(readTogether(libs, ['a', 'c'])[0].spread, 1, 'only the selected people count');
});

test('picks for a viewer rank books loved by more people first', () => {
  const libs = {
    me: { books: [b(9)] },
    x: { books: [b(1, { rating: 5 }), b(2, { rating: 4 }), b(9, { rating: 5 }), b(3, { rating: 3 })] },
    y: { books: [b(2, { rating: 4.5 })] },
  };
  const picks = picksFor('me', libs, ['me', 'x', 'y']);
  assert.deepEqual(picks.map((p) => p.book.hardcoverId), ['2', '1'], 'two lovers beat one; 3★ and owned books are out');
  assert.equal(picks[0].lovers.length, 2);
});

/* ---------------------------------------------------------------- activity */

test('activity is newest first, from day-exact dates only, and credits recommendations to the sender', () => {
  const libs = {
    a: { books: [b(1, { finished: '2026-10-01', rating: 4 }), b(2, { readOn: '2019' })] },
    c: {
      books: [b(3, { status: 'reading', started: '2026-10-05' })],
      recommendations: [{ from: 'a', at: '2026-10-07', book: b(4), note: '' }],
    },
  };
  const feed = activity(libs, ['a', 'c']);
  assert.deepEqual(feed.map((x) => `${x.id}:${x.type}`), ['a:recommended', 'c:started', 'a:finished']);
  assert.equal(feed[0].to, 'c');
});

test('genre grid and year board cover only the group', () => {
  const libs = {
    a: { books: [b(1, { ...fantasy, readOn: '2026-02', pages: 300 }), b(2, { ...fantasy, readOn: '2025' })] },
    b: { books: [b(3, { ...romance, readOn: '2026-05', pages: 200 })] },
  };
  const grid = genreGrid(libs, ['a', 'b']);
  assert.deepEqual(grid.counts.a, grid.genres.map((g) => (g === 'Romance' ? 0 : 2)));
  const board = yearBoard(libs, ['a', 'b'], 2026);
  assert.deepEqual(board.map((r) => [r.id, r.books, r.pages]), [['a', 1, 300], ['b', 1, 200]]);
});

/* --------------------------------------------------------------- profiles */

test('a new profile gets a safe, unique id and a colour', () => {
  const doc = { profiles: [{ id: 'sam', name: 'Sam' }] };
  const p = addProfile(doc, { name: '  Zoë Smith ', colour: '#123456' }, 'now');
  assert.equal(p.id, 'zoe-smith');
  assert.equal(p.name, 'Zoë Smith');
  assert.equal(p.colour, '#123456');
  assert.equal(profileId('李'), 'reader');
  assert.equal(profileId('Sam', ['sam', 'sam-2']), 'sam-3');
});

test('names must be present, short and not already in use', () => {
  const doc = { profiles: [{ id: 'sam', name: 'Sam' }] };
  assert.throws(() => addProfile(doc, { name: '   ' }), /name/);
  assert.throws(() => addProfile(doc, { name: 'x'.repeat(31) }), /30/);
  assert.throws(() => addProfile(doc, { name: 'sam' }), /already someone called Sam/);
});

test('removing keeps the entry, hides it, never reuses its id, and can be undone', () => {
  const doc = { profiles: [{ id: 'gabriel', name: 'Gabriel' }, { id: 'sam', name: 'Sam' }] };
  removeProfile(doc, 'sam', 'when');
  assert.deepEqual(activeProfiles(doc).map((p) => p.id), ['gabriel']);
  assert.equal(doc.profiles.length, 2, 'their entry - and shelf - are kept');
  const again = addProfile(doc, { name: 'Sam' });
  assert.equal(again.id, 'sam-2', 'a new Sam never inherits the old shelf');
  assert.throws(() => restoreProfile(doc, 'sam'), /already here/);
  removeProfile(doc, 'sam-2');
  restoreProfile(doc, 'sam');
  assert.deepEqual(activeProfiles(doc).map((p) => p.id), ['gabriel', 'sam']);
});

test('the last profile cannot be removed', () => {
  const doc = { profiles: [{ id: 'gabriel', name: 'Gabriel' }] };
  assert.throws(() => removeProfile(doc, 'gabriel'), /last profile/);
});
