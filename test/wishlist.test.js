import test from 'node:test';
import assert from 'node:assert/strict';
import { bookFromShelf, setStatus, STATUSES, onPile, deriveWatchlist } from '../docs/app/core/model.js';
import { mergeLayout } from '../docs/app/core/arrange.js';
import { seriesProgress } from '../docs/app/core/watch.js';
import { earnedBadges } from '../docs/app/core/badges.js';

const b = (n, extra = {}) => ({ id: `hc:${n}`, hardcoverId: String(n), status: 'read', title: `B${n}`, pages: 300,
  authors: [{ id: 'a', name: 'Ann' }], genres: ['Fantasy'], series: { id: 's1', name: 'Saga', position: n }, ...extra });

test('wishlist is a status of its own, on the to-read side of the shelf', () => {
  assert.ok(STATUSES.includes('wish'));
  assert.ok(onPile({ status: 'wish' }) && onPile({ status: 'tbr' }) && !onPile({ status: 'read' }));
  const layout = mergeLayout(null, [b(1), b(2, { status: 'tbr' }), b(3, { status: 'wish' })]);
  const pile = layout.shelves.find((s) => s.kind === 'pile');
  assert.ok(pile.keys.includes('b:hc:2') && pile.keys.includes('b:hc:3'));
  // Bought: wish -> tbr stays where it stands on the pile.
  const again = mergeLayout(layout, [b(1), b(2, { status: 'tbr' }), b(3, { status: 'tbr' })]);
  assert.deepEqual(again.shelves.find((s) => s.kind === 'pile').keys, pile.keys);
});

test('a copy from a friend’s shelf keeps the book, not what they did with it', () => {
  const theirs = b(7, { rating: 5, note: 'loved it', readOn: '2025', finished: '2025-02-01', reactions: [{ emoji: '❤️' }] });
  const mine = bookFromShelf(theirs);
  assert.equal(mine.status, 'wish');
  assert.equal(mine.title, 'B7');
  assert.equal(mine.series.id, 's1');
  assert.equal(mine.rating, null);
  assert.equal(mine.note, '');
  assert.equal(mine.finished, null);
  assert.equal(mine.reactions, undefined);
  setStatus(mine, 'tbr');
  assert.equal(mine.status, 'tbr');
});

test('wishes don’t count as reading, owning a series slot, or badges', () => {
  const lib = { books: [b(1), b(2, { status: 'wish' })] };
  const state = { s1: { name: 'Saga', books: { 1: { position: 1, releaseDate: '2020-01-01' }, 2: { position: 2, releaseDate: '2020-01-01' } } } };
  const [p] = seriesProgress(state, lib, '2026-01-01');
  assert.equal(p.slots[1].state, 'missing');
  assert.equal(earnedBadges({ books: [b(1, { status: 'wish' })] }).length, 0);
  assert.deepEqual(Object.keys(deriveWatchlist({ books: [b(1, { status: 'wish' })] }).series), []);
});
