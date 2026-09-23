import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTags, tagCounts, matchesQuery, matchesRating } from '../docs/app/core/model.js';

const book = (over = {}) => ({
  title: 'Throne of Glass',
  authors: [{ id: 'a1', name: 'Sarah J. Maas' }],
  series: { id: 's1', name: 'Throne of Glass', position: 1 },
  rating: 5,
  genres: ['Fantasy', 'Romance'],
  ...over,
});

/* ------------------------------------------------------------------ search */

test('an empty query matches everything', () => {
  assert.ok(matchesQuery(book(), ''));
  assert.ok(matchesQuery(book(), '   '));
});

test('title, author and series are all searchable', () => {
  assert.ok(matchesQuery(book(), 'throne'));
  assert.ok(matchesQuery(book(), 'maas'));
  assert.ok(matchesQuery(book(), 'glass'));
});

test('search is case-insensitive', () => {
  assert.ok(matchesQuery(book(), 'MAAS'));
  assert.ok(matchesQuery(book(), 'ThRoNe'));
});

test('every word must match, so extra words narrow the results', () => {
  // The behaviour people expect from a search box: typing more finds less.
  assert.ok(matchesQuery(book(), 'maas throne'), 'both words present');
  assert.ok(!matchesQuery(book(), 'maas mistborn'), 'second word matches nothing');
});

test('words can match different fields', () => {
  assert.ok(matchesQuery(book({ title: 'Heir of Fire' }), 'maas heir'));
});

test('a standalone with no series still searches cleanly', () => {
  const b = book({ title: 'Piranesi', series: null, authors: [{ name: 'Susanna Clarke' }] });
  assert.ok(matchesQuery(b, 'clarke'));
  assert.ok(!matchesQuery(b, 'glass'));
});

/* ------------------------------------------------------------------ rating */

test('rating filters select the right books', () => {
  assert.ok(matchesRating(book({ rating: 5 }), '4plus'));
  assert.ok(matchesRating(book({ rating: 4 }), '4plus'));
  assert.ok(!matchesRating(book({ rating: 3 }), '4plus'));
  assert.ok(!matchesRating(book({ rating: null }), '4plus'));

  assert.ok(matchesRating(book({ rating: null }), 'unrated'));
  assert.ok(!matchesRating(book({ rating: 5 }), 'unrated'));

  assert.ok(matchesRating(book({ rating: null }), 'all'));
  assert.ok(matchesRating(book({ rating: 2 }), 'all'));
});

/* -------------------------------------------------------------------- tags */

test('shelf names and formats are not genres', () => {
  const cleaned = cleanTags(['Fantasy', 'did-not-finish', 'audiobook', 'Kindle', 'Romance']);
  assert.deepEqual(cleaned, ['Fantasy', 'Romance']);
});

test('semicolon-joined entries are split apart', () => {
  // Hardcover really does return these as one string.
  const cleaned = cleanTags(['Coming of Age; Epic; Action & Adventure']);
  assert.deepEqual(cleaned, ['Coming of Age', 'Epic', 'Action & Adventure']);
});

test('duplicates are removed case-insensitively', () => {
  assert.deepEqual(cleanTags(['Fantasy', 'fantasy', 'FANTASY']), ['Fantasy']);
});

test('the limit is respected', () => {
  const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  assert.equal(cleanTags(many, 3).length, 3);
});

test('missing or empty tag lists are safe', () => {
  assert.deepEqual(cleanTags(undefined), []);
  assert.deepEqual(cleanTags([]), []);
  assert.deepEqual(cleanTags(['', '   ', ';;']), []);
});

test('absurdly long tags are dropped rather than breaking the layout', () => {
  assert.deepEqual(cleanTags(['Fantasy', 'x'.repeat(80)]), ['Fantasy']);
});

test('tag counts rank by frequency then alphabetically', () => {
  const books = [
    { genres: ['Fantasy', 'Romance'] },
    { genres: ['Fantasy', 'Adventure'] },
    { genres: ['Fantasy'] },
  ];
  assert.deepEqual(tagCounts(books), [
    { tag: 'Fantasy', count: 3 },
    { tag: 'Adventure', count: 1 },
    { tag: 'Romance', count: 1 },
  ]);
});

test('books without genres do not break the count', () => {
  assert.deepEqual(tagCounts([{}, { genres: null }, { genres: ['Fantasy'] }]), [
    { tag: 'Fantasy', count: 1 },
  ]);
});
