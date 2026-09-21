import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveWatchlist, unionWatchlists } from '../docs/app/core/model.js';

const book = (id, { status = 'read', rating = null, series = 'S1', author = 'a1' } = {}) => ({
  id, title: id, status, rating, note: '', added: '2026-01-01',
  authors: author ? [{ id: author, name: 'Author' }] : [],
  series: series ? { id: series, name: 'A Series', position: 1 } : null,
});

const lib = (books) => ({ books, watch: { series: {}, authors: {} } });
const watching = (l) => Boolean(deriveWatchlist(l).series.S1);

test('a dislike drops the series regardless of book order', () => {
  // Regression: this used to depend on which book happened to be added first.
  const liked = book('liked', { rating: 5 });
  const hated = book('hated', { rating: 1 });
  assert.equal(watching(lib([liked, hated])), false);
  assert.equal(watching(lib([hated, liked])), false, 'order must not change the answer');
});

test('abandoning a book drops the series regardless of order', () => {
  const reading = book('r', { status: 'reading', rating: null });
  const quit = book('q', { status: 'abandoned' });
  assert.equal(watching(lib([reading, quit])), false);
  assert.equal(watching(lib([quit, reading])), false);
});

test('reading a book in a series starts watching it', () => {
  assert.equal(watching(lib([book('r', { status: 'reading' })])), true);
});

test('a book merely on the to-read pile does not start a watch', () => {
  assert.equal(watching(lib([book('t', { status: 'tbr' })])), false);
});

test('rating 4+ watches the author; a later dud does not unwatch them', () => {
  const l = lib([book('good', { rating: 5, series: null }), book('bad', { rating: 1, series: null })]);
  assert.ok(deriveWatchlist(l).authors.a1, 'one loved book is reason enough to follow an author');
});

test('an explicit watch overrides the automatic veto', () => {
  const l = lib([book('hated', { rating: 1 })]);
  l.watch.series.S1 = { watching: true, name: 'A Series' };
  assert.equal(watching(l), true);
});

test('an explicit unwatch overrides an automatic watch', () => {
  const l = lib([book('r', { status: 'reading' })]);
  l.watch.series.S1 = { watching: false, name: 'A Series' };
  assert.equal(watching(l), false);
});

test('a series two people follow is fetched once and attributed to both', () => {
  const { series } = unionWatchlists({
    gabriel: lib([book('a', { status: 'reading' })]),
    stephanie: lib([book('b', { status: 'read', rating: 4 })]),
  });
  assert.equal(series.length, 1, 'one fetch, not two');
  assert.deepEqual(series[0].watchers.sort(), ['gabriel', 'stephanie']);
});

test('one person dropping a series does not silence it for the other', () => {
  const { series } = unionWatchlists({
    gabriel: lib([book('a', { status: 'reading' })]),
    stephanie: lib([book('b', { status: 'abandoned' })]),
  });
  assert.deepEqual(series.map((s) => s.watchers), [['gabriel']]);
});
