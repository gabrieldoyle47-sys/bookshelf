import test from 'node:test';
import assert from 'node:assert/strict';
import { tasteProfile, scoreSuggestions, discoveryGenres } from '../docs/app/core/suggest.js';

const mine = (id, extra = {}) => ({
  id: `hc:${id}`, hardcoverId: String(id), title: `Mine ${id}`, status: 'read',
  authors: [{ id: 'a1', name: 'Sarah J. Maas' }], genres: ['Fantasy', 'Romantasy'], moods: ['emotional'], pages: 450, ...extra,
});
const cand = (id, extra = {}) => ({
  id: String(id), title: `Cand ${id}`, authors: [{ id: `x${id}`, name: `Author ${id}` }],
  genres: ['Fantasy', 'Romantasy'], moods: ['emotional'], usersCount: 2000, rating: 4.2, ratingsCount: 400, pages: 420,
  series: null, ...extra,
});

test('taste weights loved books up and duds down', () => {
  const p = tasteProfile({ books: [
    mine(1, { rating: 5 }), mine(2, { rating: 5 }),
    mine(3, { rating: 1, genres: ['Horror'] }),
    mine(4, { status: 'tbr', genres: ['Western'] }),
  ] });
  assert.deepEqual(p.topGenres.slice(0, 2), ['Fantasy', 'Romantasy']);
  assert.ok(!p.topGenres.includes('Horror'), 'a 1-star read counts against its genre');
  assert.ok(!p.topGenres.includes('Western'), 'the to-read pile is aspiration, not taste');
  assert.equal(p.authors.get('a1').count, 2);
});

test('matching genres and popularity rank higher; mismatches sink', () => {
  const lib = { books: [mine(1, { rating: 5 }), mine(2, { rating: 4 })] };
  const out = scoreSuggestions([
    cand(10, { genres: ['Horror'], moods: ['dark'], usersCount: 9000 }),
    cand(11),
    cand(12, { usersCount: 50, ratingsCount: 3 }),
  ], lib);
  assert.equal(out[0].book.id, '11');
  assert.equal(out.at(-1).book.id, '10');
  assert.ok(out[0].reasons.some((r) => /Fantasy|Romantasy/.test(r)));
});

test('nothing on the shelf, hidden, pending, mid-series or in a series being read', () => {
  const lib = {
    books: [mine(1, { rating: 5, series: { id: 's1', name: 'ACOTAR', position: 1 } })],
    hidden: { 21: { title: 'x' } },
    recommendations: [{ bookId: '22', status: 'new' }],
  };
  const out = scoreSuggestions([
    cand(1), cand(21), cand(22),
    cand(23, { series: { id: 's2', name: 'Other', position: 3 } }),
    cand(24, { series: { id: 's1', name: 'ACOTAR', position: 2 } }),
    cand(25, { series: { id: 's3', name: 'New series', position: 1 } }),
  ], lib);
  assert.deepEqual(out.map((s) => s.book.id), ['25']);
  assert.ok(out[0].reasons.includes('Starts New series'));
});

test('a loved author is called out, and no author fills the list', () => {
  const lib = { books: [mine(1, { rating: 5 })] };
  const sjm = { id: 'a1', name: 'Sarah J. Maas' };
  const out = scoreSuggestions([cand(30, { authors: [sjm] }), cand(31, { authors: [sjm] }), cand(32, { authors: [sjm] }), cand(33)], lib);
  assert.equal(out.filter((s) => s.book.authors[0].id === 'a1').length, 2);
  assert.match(out[0].reasons[0], /By Sarah J\. Maas, whose Mine 1 you rated highly/);
});

test('discovery looks in the reader’s strongest genres', () => {
  // The distinctive genre leads; the broad "Fantasy" only fills in.
  assert.deepEqual(discoveryGenres({ books: [mine(1, { rating: 5 })] }), ['Romantasy', 'Fantasy']);
});
