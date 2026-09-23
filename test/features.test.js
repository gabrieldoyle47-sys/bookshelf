import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseRating, readAuthors, hideBook, unhideBook, hiddenIds, trackBook, untrackBook,
  addRecommendation, answerRecommendation, setGoal, goalProgress, unionWatchlists,
} from '../docs/app/core/model.js';
import {
  nextInSeries, authorUpcoming, trackedUpcoming, diffTracked, snapshotTracked, snapshotSeries,
} from '../docs/app/core/watch.js';
import { yearInBooks, recapYears } from '../docs/app/core/recap.js';
import { runReleaseCheck } from '../docs/app/core/check.js';

const NOW = '2026-09-23';
const sanderson = { id: '204214', name: 'Brandon Sanderson' };

const book = (id, extra = {}) => ({
  id: `hc:${id}`, hardcoverId: String(id), title: `Book ${id}`,
  authors: [sanderson], series: null, status: 'read', rating: null, ...extra,
});

/* ----------------------------------------------------------- half stars */

test('ratings snap to the nearest half star and stay within 0.5-5', () => {
  assert.equal(normaliseRating(3.5), 3.5);
  assert.equal(normaliseRating('4'), 4);
  assert.equal(normaliseRating(3.26), 3.5);
  assert.equal(normaliseRating(3.2), 3);
  assert.equal(normaliseRating(9), 5);
  assert.equal(normaliseRating(0.1), 0.5);
  assert.equal(normaliseRating(0), null);
  assert.equal(normaliseRating(''), null);
  assert.equal(normaliseRating('nope'), null);
});

/* ------------------------------------------------------ authors you read */

test('authors you read include every finished or current book, not just 4-star ones', () => {
  const lib = { books: [
    book(1, { rating: 3 }),
    book(2, { authors: [{ id: '9', name: 'Pierce Brown' }], status: 'reading' }),
    book(3, { authors: [{ id: '7', name: 'Nobody Yet' }], status: 'tbr' }),
  ] };
  assert.deepEqual(Object.keys(readAuthors(lib)).sort(), ['204214', '9']);
});

test('an explicit author unwatch removes them from the authors you read too', () => {
  const lib = { books: [book(1)], watch: { series: {}, authors: { 204214: { watching: false } } } };
  assert.deepEqual(readAuthors(lib), {});
});

test('the union separates authors fetched for display from authors that make news', () => {
  const u = unionWatchlists({ gabriel: { books: [book(1, { rating: 3 })] } });
  assert.equal(u.authors.length, 0, 'a 3-star read does not put the author on the news watchlist');
  assert.equal(u.readAuthors.length, 1, 'but the author is still fetched for the Upcoming page');
});

/* -------------------------------------------------- hidden and tracked */

test('hiding and unhiding a book', () => {
  const lib = { books: [] };
  hideBook(lib, 42, 'Horneater', NOW);
  assert.ok(hiddenIds(lib).has('42'));
  unhideBook(lib, '42');
  assert.equal(hiddenIds(lib).size, 0);
});

test('tracking a book twice keeps one entry, and tracking un-hides it', () => {
  const lib = { books: [] };
  hideBook(lib, 5, 'Five');
  trackBook(lib, { id: 5, title: 'Five', authors: [sanderson], releaseDate: '2027-01-01' }, NOW);
  trackBook(lib, { id: 5, title: 'Five' }, NOW);
  assert.equal(lib.tracked.length, 1);
  assert.equal(hiddenIds(lib).size, 0);
  untrackBook(lib, 5);
  assert.equal(lib.tracked.length, 0);
});

/* ---------------------------------------------------- recommendations */

test('a recommendation lands in the recipient library and can be accepted onto the pile', () => {
  const steph = { books: [] };
  const record = book(77, { title: 'Mistborn', status: 'read', rating: 5, note: 'mine', finished: '2026-01-01' });
  addRecommendation(steph, { book: record, from: 'gabriel', note: 'You will love Vin', now: NOW });
  const [rec] = steph.recommendations;
  assert.equal(rec.status, 'new');
  assert.equal(rec.book.rating, null, "the sender's rating and dates do not travel with it");
  assert.equal(rec.book.finished, null);

  answerRecommendation(steph, rec.id, 'added', NOW);
  assert.equal(steph.books.length, 1);
  assert.equal(steph.books[0].status, 'tbr');
  assert.equal(steph.books[0].recommendedBy, 'gabriel');
});

test('recommending a book already on their shelf, or twice, is refused', () => {
  const steph = { books: [book(1)] };
  assert.throws(() => addRecommendation(steph, { book: book(1), from: 'gabriel' }), /already on their shelf/);
  addRecommendation(steph, { book: book(2), from: 'gabriel' });
  assert.throws(() => addRecommendation(steph, { book: book(2), from: 'gabriel' }), /already recommended/);
});

test('dismissing a recommendation leaves the shelf alone', () => {
  const lib = { books: [] };
  addRecommendation(lib, { book: book(3), from: 'stephanie' });
  answerRecommendation(lib, lib.recommendations[0].id, 'dismissed');
  assert.equal(lib.books.length, 0);
  assert.equal(lib.recommendations[0].status, 'dismissed');
});

/* ------------------------------------------------------------- goals */

test('goal progress compares books read with a steady pace', () => {
  const lib = { books: [
    ...Array.from({ length: 20 }, (_, i) => book(i, { readOn: '2026-03' })),
    book(99, { readOn: '2025' }),
  ] };
  setGoal(lib, 2026, 24);
  const g = goalProgress(lib, 2026, '2026-07-02'); // almost exactly halfway
  assert.equal(g.done, 20);
  assert.equal(g.target, 24);
  assert.equal(g.ahead, 8);
  assert.equal(g.met, false);
});

test('removing a goal and past years', () => {
  const lib = { books: [book(1, { readOn: '2025-05' })] };
  setGoal(lib, 2025, 1);
  assert.equal(goalProgress(lib, 2025, NOW).met, true);
  setGoal(lib, 2025, 0);
  assert.equal(goalProgress(lib, 2025, NOW).target, null);
});

/* --------------------------------------------------- next in series */

const stormlight = snapshotSeries({ id: '997', name: 'The Stormlight Archive', books: [
  { bookId: '1', position: 1, title: 'The Way of Kings', releaseDate: '2010-01-01' },
  { bookId: '2', position: 2, title: 'Words of Radiance', releaseDate: '2014-03-04' },
  { bookId: '25', position: 2.5, title: 'Edgedancer', releaseDate: '2016-11-08' },
  { bookId: '3', position: 3, title: 'Oathbringer', releaseDate: '2017-01-01' },
  { bookId: '6', position: 6, title: 'Untitled Stormlight Archive #6', releaseDate: '2031-12-01' },
  { bookId: '7', position: 7, title: 'Future one', releaseDate: '2027-01-01' },
] }, NOW);

test('next in series lists released books you do not have, extras flagged, future ones left out', () => {
  const lib = { books: [
    book(1, { series: { id: '997', name: 'The Stormlight Archive', position: 1 } }),
  ] };
  const [group] = nextInSeries({ 997: stormlight }, lib, NOW);
  assert.deepEqual(group.books.map((b) => b.bookId), ['2', '25', '3']);
  assert.equal(group.books.find((b) => b.bookId === '25').extra, true);
  assert.equal(group.next.bookId, '2', 'the next main book after the one you are on');
});

test('next in series skips hidden books and series you dropped', () => {
  const lib = { books: [
    book(1, { series: { id: '997', name: 'The Stormlight Archive', position: 1 } }),
  ] };
  hideBook(lib, '2', 'Words of Radiance');
  assert.equal(nextInSeries({ 997: stormlight }, lib, NOW)[0].next.bookId, '3');
  lib.books[0].rating = 1;
  assert.deepEqual(nextInSeries({ 997: stormlight }, lib, NOW), []);
});

/* ------------------------------------------------ authors' upcoming */

test('author upcoming skips books in series you already watch, and hidden ones', () => {
  const lib = { books: [book(1, { series: { id: '997', name: 'Stormlight', position: 1 } })] };
  const authorState = { 204214: { forthcoming: [
    { bookId: '6', title: 'Untitled #6', releaseDate: '2031-12-01', series: { id: '997', name: 'Stormlight' } },
    { bookId: '50', title: 'Chasmfriends', releaseDate: '2026-12-01', series: { id: '5', name: 'Hoid' } },
    { bookId: '51', title: 'Book of Nails', releaseDate: '2027-12-31', series: null },
  ] } };
  let up = authorUpcoming(authorState, lib, { 997: stormlight }, NOW);
  assert.deepEqual(up.map((b) => b.bookId), ['50', '51']);
  hideBook(lib, '51', 'Book of Nails');
  up = authorUpcoming(authorState, lib, { 997: stormlight }, NOW);
  assert.deepEqual(up.map((b) => b.bookId), ['50']);
  assert.equal(up[0].authorName, 'Brandon Sanderson');
});

/* ---------------------------------------------------- tracked books */

test('a tracked book prefers the watcher’s fresher date', () => {
  const lib = { books: [] };
  trackBook(lib, { id: 9, title: 'Nine', releaseDate: '2027-01-01' }, NOW);
  const [t] = trackedUpcoming({ 9: { releaseDate: '2027-03-01' } }, lib, NOW);
  assert.equal(t.releaseDate, '2027-03-01');
  assert.equal(t.source, 'tracked');
});

test('tracked books: first sighting silent, then a slip is news', () => {
  const fresh = { id: '9', title: 'Nine', releaseDate: '2027-01-10' };
  assert.deepEqual(diffTracked(null, fresh, 'gabriel', NOW), []);
  const prev = snapshotTracked(fresh, '2026-09-01');
  const moved = diffTracked(prev, { ...fresh, releaseDate: '2027-02-10' }, 'gabriel', NOW);
  assert.deepEqual(moved.map((e) => e.type), ['date_moved']);
  assert.equal(moved[0].previousDate, '2027-01-10');
});

/* ------------------------------------------------------ year in books */

test('year in books counts only books dated in that year and says what it missed', () => {
  const lib = { books: [
    book(1, { readOn: '2026-01-10', pages: 300, rating: 4, series: { id: 's', name: 'S' } }),
    book(2, { readOn: '2026-03', pages: 1200, rating: 5, series: { id: 's', name: 'S' } }),
    book(3, { readOn: '2026', pages: 150, rating: 4.5 }),
    book(4, { readOn: '2025-06', pages: 999 }),
    book(5, { readOn: null }),
    book(6, { status: 'tbr', readOn: '2026' }),
  ] };
  const r = yearInBooks(lib, 2026);
  assert.equal(r.count, 3);
  assert.equal(r.pages, 1650);
  assert.equal(r.undated, 1);
  assert.equal(r.longest.hardcoverId, '2');
  assert.equal(r.shortest.hardcoverId, '3');
  assert.deepEqual(r.favourites.map((b) => b.hardcoverId), ['2']);
  assert.equal(r.topAuthor.name, 'Brandon Sanderson');
  assert.equal(r.topSeries.name, 'S');
  assert.equal(r.first.hardcoverId, '1');
  assert.deepEqual(recapYears(lib), [2026, 2025]);
});

/* -------------------------------------------------- the whole check */

test('a check fetches read authors and tracked books, and only watched authors make news', async () => {
  const calls = [];
  const gql = async (query, vars) => {
    if (query.includes('SeriesById')) { calls.push('series'); return { series: [] }; }
    if (query.includes('AuthorBooks')) {
      calls.push(`author:${vars.id}`);
      return { authors: [{ id: vars.id, name: 'A', contributions: [
        { book: { id: 500, title: 'Brand new', release_date: '2026-10-01' } },
      ], forthcoming: [
        { contribution: 'Author', book: { id: 500, title: 'Brand new', release_date: '2026-10-01', book_series: [] } },
      ] }] };
    }
    if (query.includes('BooksByIds')) {
      calls.push(`books:${vars.ids.join(',')}`);
      return { books: [{ id: 9, title: 'Nine', release_date: '2027-01-01', contributions: [], book_series: [] }] };
    }
    throw new Error(`unexpected query ${query.slice(0, 40)}`);
  };

  const libraries = {
    gabriel: { books: [book(1, { rating: 3 })], tracked: [{ bookId: '9', title: 'Nine' }] },
  };
  const authorState = { 204214: { id: '204214', checkedAt: '2026-09-01', books: {}, forthcoming: [] } };
  const bookState = {};
  const result = await runReleaseCheck({
    gql, libraries, seriesState: {}, authorState, bookState, seen: new Set(), now: NOW, paced: (fn) => fn(),
  });

  assert.deepEqual(calls, ['author:204214', 'books:9']);
  assert.equal(result.events.length, 0, 'a 3-star author is shown, not announced');
  assert.equal(authorState['204214'].forthcoming[0].title, 'Brand new');
  assert.equal(bookState['9'].releaseDate, '2027-01-01');
});

test('a book waiting on the to-read pile does not count as progress through a series', () => {
  const lib = { books: [
    book(1, { series: { id: '997', name: 'The Stormlight Archive', position: 1 } }),
    book(3, { status: 'tbr', series: { id: '997', name: 'The Stormlight Archive', position: 3 } }),
  ] };
  const [group] = nextInSeries({ 997: stormlight }, lib, NOW);
  assert.equal(group.reached, 1);
  assert.equal(group.next.bookId, '2');
});

test('tied busiest months are all named', () => {
  const lib = { books: [
    book(1, { readOn: '2026-01' }), book(2, { readOn: '2026-01' }),
    book(3, { readOn: '2026-03' }), book(4, { readOn: '2026-03' }),
  ] };
  assert.deepEqual(yearInBooks(lib, 2026).busiest, { count: 2, months: [1, 3] });
});
