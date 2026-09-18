import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diffSeries, diffAuthor, dedupe, eventKey, daysBetween,
  snapshotSeries, upcomingFrom,
} from '../docs/app/core/watch.js';

const NOW = '2026-09-18';
const P = 'gabriel';

/** A fetched series, as hardcover.seriesById() would return it. */
const series = (books) => ({ id: '987', name: 'Dungeon Crawler Carl', books });
const book = (bookId, position, releaseDate, title = `Book ${position}`) =>
  ({ bookId, position, title, releaseDate, releaseYear: null });

const types = (evs) => evs.map((e) => e.type).sort();

test('a series never seen before emits nothing', () => {
  const fresh = series([book('1', 1, '2020-07-21'), book('8', 8, '2026-10-14')]);
  assert.deepEqual(diffSeries(null, fresh, P, NOW), []);
});

test('a book appearing for the first time emits exactly one new_book', () => {
  const prev = snapshotSeries(series([book('1', 1, '2020-07-21')]), NOW);
  const fresh = series([book('1', 1, '2020-07-21'), book('8', 8, '2026-10-14')]);
  const evs = diffSeries(prev, fresh, P, NOW);
  assert.deepEqual(types(evs), ['new_book']);
  assert.equal(evs[0].bookId, '8');
  assert.equal(evs[0].releaseDate, '2026-10-14');
});

test('a newly announced book due in 20 days does not also fire preorder', () => {
  const prev = snapshotSeries(series([book('1', 1, '2020-07-21')]), NOW);
  const fresh = series([book('1', 1, '2020-07-21'), book('8', 8, '2026-10-05')]);
  assert.deepEqual(types(diffSeries(prev, fresh, P, NOW)), ['new_book']);
});

test('a back-catalogue book added late is not announced as released', () => {
  const prev = snapshotSeries(series([book('1', 1, '2020-07-21')]), NOW);
  const fresh = series([book('1', 1, '2020-07-21'), book('0', 0, '2019-01-01', 'Prequel')]);
  assert.deepEqual(types(diffSeries(prev, fresh, P, NOW)), ['new_book']);
});

test('a date appearing on a known book emits date_set', () => {
  const prev = snapshotSeries(series([book('8', 8, null)]), NOW);
  const fresh = series([book('8', 8, '2027-03-01')]);
  assert.deepEqual(types(diffSeries(prev, fresh, P, NOW)), ['date_set']);
});

test('a slipping date emits date_moved carrying the old date', () => {
  const prev = snapshotSeries(series([book('8', 8, '2026-10-14')]), NOW);
  const fresh = series([book('8', 8, '2027-02-10')]);
  const evs = diffSeries(prev, fresh, P, NOW);
  assert.deepEqual(types(evs), ['date_moved']);
  assert.equal(evs[0].previousDate, '2026-10-14');
});

test('release day emits released', () => {
  const prev = snapshotSeries(series([book('8', 8, '2026-09-18')]), '2026-09-01');
  const fresh = series([book('8', 8, '2026-09-18')]);
  assert.deepEqual(types(diffSeries(prev, fresh, P, NOW)), ['released']);
});

test('a book inside the 30-day window emits preorder with a day count', () => {
  const prev = snapshotSeries(series([book('8', 8, '2026-10-14')]), '2026-09-01');
  const fresh = series([book('8', 8, '2026-10-14')]);
  const evs = diffSeries(prev, fresh, P, NOW);
  assert.deepEqual(types(evs), ['preorder']);
  assert.equal(evs[0].daysUntil, 26);
});

test('a book far in the future stays quiet', () => {
  const prev = snapshotSeries(series([book('8', 8, '2028-01-01')]), '2026-09-01');
  const fresh = series([book('8', 8, '2028-01-01')]);
  assert.deepEqual(diffSeries(prev, fresh, P, NOW), []);
});

test('running the watcher twice produces no second alert', () => {
  const prev = snapshotSeries(series([book('1', 1, '2020-07-21')]), NOW);
  const fresh = series([book('1', 1, '2020-07-21'), book('8', 8, '2026-10-14')]);
  const seen = new Set();
  assert.equal(dedupe(diffSeries(prev, fresh, P, NOW), seen).length, 1);
  assert.equal(dedupe(diffSeries(prev, fresh, P, NOW), seen).length, 0);
});

test('a second, different slip is reported even though the first was seen', () => {
  const seen = new Set();
  const first = diffSeries(
    snapshotSeries(series([book('8', 8, '2026-10-14')]), NOW),
    series([book('8', 8, '2027-02-10')]), P, NOW);
  const second = diffSeries(
    snapshotSeries(series([book('8', 8, '2027-02-10')]), NOW),
    series([book('8', 8, '2027-06-01')]), P, NOW);
  assert.equal(dedupe(first, seen).length, 1);
  assert.equal(dedupe(second, seen).length, 1, 'a fresh delay is fresh news');
});

test('the same event for two people is not collapsed into one', () => {
  const prev = snapshotSeries(series([book('1', 1, '2020-07-21')]), NOW);
  const fresh = series([book('1', 1, '2020-07-21'), book('8', 8, '2026-10-14')]);
  const seen = new Set();
  const mine = dedupe(diffSeries(prev, fresh, 'gabriel', NOW), seen);
  const hers = dedupe(diffSeries(prev, fresh, 'partner', NOW), seen);
  assert.equal(mine.length, 1);
  assert.equal(hers.length, 1, 'each watcher gets their own copy');
  assert.notEqual(eventKey(mine[0]), eventKey(hers[0]));
});

test('adding an author does not replay their backlist', () => {
  const prev = { id: '678', name: 'Matt Dinniman', books: { '1': { title: 'Carl', releaseDate: '2020-07-21' } } };
  const fresh = {
    id: '678', name: 'Matt Dinniman',
    books: [
      { bookId: '1', title: 'Carl', releaseDate: '2020-07-21' },
      { bookId: '99', title: 'Ancient Thing', releaseDate: '2011-05-05' },
      { bookId: '100', title: 'Brand New', releaseDate: '2026-11-01' },
    ],
  };
  const evs = diffAuthor(prev, fresh, P, NOW);
  assert.deepEqual(evs.map((e) => e.bookId), ['100'], 'only the forthcoming title is news');
});

test('daysBetween handles the boundaries', () => {
  assert.equal(daysBetween(NOW, NOW), 0);
  assert.equal(daysBetween(NOW, '2026-09-19'), 1);
  assert.equal(daysBetween(NOW, '2026-09-17'), -1);
  assert.equal(daysBetween(NOW, 'not-a-date'), null);
});

test('upcoming lists only future books, soonest first', () => {
  const state = {
    987: snapshotSeries(series([
      book('1', 1, '2020-07-21'), book('8', 8, '2026-10-14'), book('9', 9, '2026-09-25'),
    ]), NOW),
  };
  const up = upcomingFrom(state, ['987'], NOW);
  assert.deepEqual(up.map((b) => b.bookId), ['9', '8']);
  assert.equal(up[0].daysUntil, 7);
});

test('a long-published backlist book is never announced as newly released', () => {
  // Regression: the rule used to ask "is this date in the past?", which meant
  // the first diff of any series announced its entire backlist as "out now".
  const prev = snapshotSeries(
    series([book('1', 1, '2020-07-21'), book('2', 2, '2021-04-12')]), '2026-09-01');
  const fresh = series([book('1', 1, '2020-07-21'), book('2', 2, '2021-04-12')]);
  assert.deepEqual(diffSeries(prev, fresh, P, NOW), []);
});

test('a book released between two checks is announced exactly once', () => {
  const prev = snapshotSeries(series([book('8', 8, '2026-09-10')]), '2026-09-05');
  const fresh = series([book('8', 8, '2026-09-10')]);
  const seen = new Set();
  assert.deepEqual(types(dedupe(diffSeries(prev, fresh, P, NOW), seen)), ['released']);
  // Next day's run, snapshot now current: silence.
  const prev2 = snapshotSeries(fresh, NOW);
  assert.equal(dedupe(diffSeries(prev2, fresh, P, '2026-09-19'), seen).length, 0);
});
