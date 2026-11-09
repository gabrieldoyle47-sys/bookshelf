import test from 'node:test';
import assert from 'node:assert/strict';
import { earnedBadges, newBadges } from '../docs/app/core/badges.js';

const b = (n, extra = {}) => ({ id: `hc:${n}`, hardcoverId: String(n), status: 'read', title: `B${n}`, pages: 300,
  authors: [{ id: 'a', name: 'Ann' }], genres: ['Fantasy'], readOn: `2026-01-${String(n).padStart(2, '0')}`, ...extra });

test('milestones, devoted reader and award badges from the shelf', () => {
  const lib = { books: [b(1), b(2), b(3, { pages: 1100 }), b(4, { status: 'tbr' })] };
  const ids = earnedBadges(lib, new Set(['2'])).map((x) => x.id);
  assert.deepEqual(ids, ['first-book', 'doorstopper', 'author-3', 'award-1']);
});

test('explorer: genres, audiobook and a five-star in a new genre', () => {
  const genres = ['Romance', 'Horror', 'Mystery', 'History', 'Poetry'];
  const lib = { books: [b(1), ...genres.map((g, i) => b(i + 2, { genres: [g], authors: [{ name: `x${i}` }], rating: i === 4 ? 5 : 3 })),
    b(9, { format: 'audiobook', authors: [{ name: 'y' }] })] };
  const ids = earnedBadges(lib).map((x) => x.id);
  for (const id of ['genres-5', 'audiobook', 'new-love']) assert.ok(ids.includes(id), id);
});

test('only badges not yet shown are new', () => {
  const lib = { books: [b(1)], badgesSeen: ['first-book'] };
  assert.deepEqual(newBadges(lib).map((x) => x.id), []);
  lib.books.push(b(2), b(3));
  assert.deepEqual(newBadges(lib).map((x) => x.id), ['author-3']);
});

test('favourites: five at most, toggled, only books on the shelf; announcements remembered', async () => {
  const { toggleFavourite, isFavourite, markAnnounced, lookOf } = await import('../docs/app/core/model.js');
  const lib = { books: [1, 2, 3, 4, 5, 6].map((n) => b(n)) };
  for (const n of [1, 2, 3, 4, 5]) toggleFavourite(lib, `hc:${n}`);
  assert.throws(() => toggleFavourite(lib, 'hc:6'), /5 favourites/);
  toggleFavourite(lib, 'hc:1');
  assert.equal(isFavourite(lib, 'hc:1'), false);
  assert.throws(() => toggleFavourite(lib, 'hc:99'), /not on this shelf/);
  markAnnounced(lib, { badges: ['first-book'], trophies: [12] });
  markAnnounced(lib, { badges: ['first-book', 'books-10'] });
  assert.deepEqual(lib.badgesSeen, ['first-book', 'books-10']);
  assert.deepEqual(lib.trophiesSeen, ['12']);
  assert.equal(lookOf({}).stamp, true);
  assert.equal(lookOf({ look: { stamp: false } }).stamp, false);
});
