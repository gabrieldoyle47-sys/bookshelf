import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseInvite } from '../docs/app/core/calendar.js';
import { seriesProgress, snapshotSeries } from '../docs/app/core/watch.js';
import worker from '../worker/index.js';

const NOW = '2026-09-24';

/* ---------------------------------------------------------- calendar */

test('a release invite is an all-day event on the day, with a 9am reminder', () => {
  const ics = releaseInvite({
    id: '430559', title: 'A Court of Splintered Harmony', date: '2026-10-27',
    by: 'Sarah J. Maas', series: 'A Court of Thorns and Roses #6', link: 'https://hardcover.app/books/x',
  }, new Date('2026-09-24T12:00:00Z'));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261027\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20261028\r\n/, 'all-day events end the next day');
  assert.match(ics, /UID:release-430559@bookshelf/, 'a stable id, so re-adding updates rather than duplicates');
  assert.match(ics, /TRIGGER:PT9H/);
  assert.match(ics, /DTSTAMP:20260924T120000Z/);
  assert.ok(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75), 'lines are folded at 75 octets');
});

test('text is escaped and a month-end release rolls into the next month', () => {
  const ics = releaseInvite({ id: '1', title: 'Blood; Sweat, and Tears', date: '2027-12-31' });
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('SUMMARY:📚 Blood\\; Sweat\\, and Tears is out'), 'semicolons and commas are escaped');
  assert.match(ics, /DTEND;VALUE=DATE:20280101/);
});

test('an invite needs a full date and a title', () => {
  assert.throws(() => releaseInvite({ id: '1', title: 'X', date: '2027' }), /full date/);
  assert.throws(() => releaseInvite({ id: '1', title: '', date: '2027-01-01' }), /title/);
});

test('the Worker serves the invite as text/calendar and only links to known sites', async () => {
  const res = await worker.fetch(new Request(
    'https://w.dev/ics?id=9&title=Horneater&date=2026-12-01&by=Brandon%20Sanderson&link=https://evil.example/x'), {});
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /text\/calendar/);
  assert.match(res.headers.get('Content-Disposition'), /Horneater\.ics/);
  const body = await res.text();
  assert.match(body, /DTSTART;VALUE=DATE:20261201/);
  assert.doesNotMatch(body, /evil\.example/);
  assert.equal((await worker.fetch(new Request('https://w.dev/ics?title=X&date=someday'), {})).status, 400);
});

/* --------------------------------------------------- series progress */

const state = { 1: snapshotSeries({ id: '1', name: 'Red Rising Saga', books: [
  { bookId: '10', position: 1, title: 'Red Rising', releaseDate: '2014-01-28' },
  { bookId: '20', position: 2, title: 'Golden Son', releaseDate: '2015-01-06' },
  { bookId: '25', position: 2.5, title: 'A novella', releaseDate: '2016-01-01' },
  { bookId: '30', position: 3, title: 'Morning Star', releaseDate: '2016-02-09' },
  { bookId: '40', position: 4, title: 'Iron Gold', releaseDate: '2018-01-16' },
  { bookId: '70', position: 7, title: 'Red God', releaseDate: '2027-05-01' },
] }, NOW) };

const shelf = (id, pos, status, extra = {}) => ({
  id: `hc:${id}`, hardcoverId: id, title: `B${pos}`, status,
  series: { id: '1', name: 'Red Rising Saga', position: pos }, ...extra,
});

test('series progress: one slot per main book, novellas left out, upcoming shown', () => {
  const lib = { books: [shelf('10', 1, 'read'), shelf('20', 2, 'reading'), shelf('30', 3, 'tbr')] };
  const [s] = seriesProgress(state, lib, NOW);
  assert.deepEqual(s.slots.map((x) => [x.position, x.state]),
    [[1, 'read'], [2, 'reading'], [3, 'tbr'], [4, 'missing'], [7, 'upcoming']]);
  assert.equal(s.read, 1);
  assert.equal(s.released, 4);
  assert.equal(s.nextDue.title, 'Red God');
  assert.equal(s.complete, false);
});

test('a different edition on the shelf still fills its slot, and skipped books are gaps', () => {
  // Book 2 was never read; book 3 is read from a different edition id.
  const lib = { books: [shelf('10', 1, 'read'), shelf('999', 3, 'read')] };
  const [s] = seriesProgress(state, lib, NOW);
  assert.equal(s.slots.find((x) => x.position === 3).state, 'read');
  assert.deepEqual(s.gaps.map((g) => g.position), [2]);
});

test('a series with every released book read is complete, and waits on the next', () => {
  const lib = { books: [1, 2, 3, 4].map((p) => shelf(String(p * 10), p, 'read')) };
  const [s] = seriesProgress(state, lib, NOW);
  assert.equal(s.complete, true);
  assert.equal(s.nextDue.position, 7);
});

test('series you have only on the to-read pile are not listed', () => {
  assert.deepEqual(seriesProgress(state, { books: [shelf('10', 1, 'tbr')] }, NOW), []);
});
