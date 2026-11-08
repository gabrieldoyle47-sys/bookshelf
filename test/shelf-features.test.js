import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addReaction, reactionSummary, setAudiobook, audioHours, upsertSeriesPerson, whosWho,
  addProfile, setProfileTheme,
} from '../docs/app/core/model.js';
import { autoShelves, mergeLayout } from '../docs/app/core/arrange.js';
import { completedSeries, snapshotSeries } from '../docs/app/core/watch.js';

const book = (id, extra = {}) => ({
  id: `hc:${id}`, hardcoverId: String(id), title: `Book ${id}`, status: 'read',
  authors: [{ id: 'a', name: 'A' }], genres: ['Romance'], ...extra,
});
const ser = (id, position) => ({ series: { id, name: `S${id}`, position } });

test('reactions are anonymous now, counted per emoji, with room for a name later', () => {
  const lib = { books: [] };
  addReaction(lib, 'hc:1', 'rating', '🔥');
  addReaction(lib, 'hc:1', 'rating', '🔥');
  addReaction(lib, 'hc:1', 'finished', '👏');
  assert.deepEqual(reactionSummary(lib, 'hc:1', 'rating'), [{ emoji: '🔥', count: 2 }]);
  assert.equal(lib.reactions['hc:1'][0].by, null, 'no reactor until accounts exist');
  assert.throws(() => addReaction(lib, 'hc:1', 'rating', '💩'), /Unknown reaction/);
});

test('audiobooks keep their length and narrators, and can be unmarked', () => {
  const b = book(1);
  setAudiobook(b, { seconds: 36000, narrators: ['Kate Reading'] });
  assert.equal(audioHours(b), 10);
  setAudiobook(b, false);
  assert.equal(b.format, undefined);
  assert.equal(audioHours(b), 0);
});

test("who's who hides people from books the reader hasn't reached", () => {
  const lib = { books: [] };
  upsertSeriesPerson(lib, 's1', { name: 'Kaladin', note: 'Bridgeman', from: 1 });
  upsertSeriesPerson(lib, 's1', { name: 'Lift', note: 'Edgedancer', from: 3 });
  const w = whosWho(lib, 's1', 2);
  assert.deepEqual(w.shown.map((p) => p.name), ['Kaladin']);
  assert.equal(w.hidden, 1);
  assert.throws(() => upsertSeriesPerson(lib, 's1', { name: ' ' }), /name/);
});

test('a profile gets a theme when made and can change it', () => {
  const doc = { profiles: [] };
  const p = addProfile(doc, { name: 'Sam', theme: 'forest' });
  assert.equal(p.theme, 'forest');
  assert.equal(addProfile(doc, { name: 'Jo', theme: 'nope' }).theme, 'classic');
  setProfileTheme(doc, 'sam', 'midnight');
  assert.equal(doc.profiles[0].theme, 'midnight');
  assert.throws(() => setProfileTheme(doc, 'sam', 'neon'), /Unknown theme/);
});

test('the automatic shelves: genres, then a to-read shelf, bookends and ornaments in place', () => {
  const { shelves, ornaments } = autoShelves([
    book(1, ser('x', 1)), book(2, ser('x', 2)), book(3, { status: 'tbr' }),
  ]);
  assert.deepEqual(shelves.map((s) => s.kind), ['genre', 'pile']);
  assert.equal(shelves[0].keys[0], 'e:Romance');
  assert.deepEqual(shelves[0].keys.filter((k) => k.startsWith('b:')), ['b:hc:1', 'b:hc:2']);
  assert.ok(shelves[1].keys.includes('b:hc:3'));
  assert.ok(Object.keys(ornaments).length >= 2);
});

test('a saved arrangement keeps hand-placed order and slots new books beside their series', () => {
  const books = [book(1, ser('x', 1)), book(2, ser('x', 2)), book(9, { authors: [{ id: 'z', name: 'Z' }] })];
  const saved = { shelves: [
    { title: 'Romance', kind: 'genre', keys: ['b:hc:9', 'o:1', 'b:hc:2', 'b:hc:1', 'e:Romance'] },
    { title: 'To read', kind: 'pile', keys: ['e:To read'] },
  ], ornaments: { 1: 'cat' } };
  const merged = mergeLayout(saved, [...books, book(3, ser('x', 3)), book(4, { status: 'tbr' })]);
  assert.deepEqual(merged.shelves[0].keys, ['b:hc:9', 'o:1', 'b:hc:2', 'b:hc:1', 'b:hc:3', 'e:Romance'],
    'hand order kept; book 3 goes after the last of its series');
  assert.deepEqual(merged.shelves[1].keys, ['e:To read', 'b:hc:4'], 'a new to-read book goes to the pile');
  assert.equal(merged.ornaments[1], 'cat');
});

test('a book that leaves the pile is re-placed, and a removed book disappears', () => {
  const saved = { shelves: [
    { title: 'Romance', kind: 'genre', keys: ['e:Romance', 'b:hc:1'] },
    { title: 'To read', kind: 'pile', keys: ['e:To read', 'b:hc:2', 'b:hc:5'] },
  ], ornaments: {} };
  const merged = mergeLayout(saved, [book(1, ser('x', 1)), book(2, ser('x', 2))]); // 2 now read, 5 removed
  assert.deepEqual(merged.shelves[0].keys, ['e:Romance', 'b:hc:1', 'b:hc:2']);
  assert.deepEqual(merged.shelves[1].keys, ['e:To read']);
});

test('only a fully finished series with nothing more announced is complete', () => {
  const NOW = '2026-11-07';
  const state = {
    done: snapshotSeries({ id: 'done', name: 'Trilogy', books: [
      { bookId: '1', position: 1, title: 'A', releaseDate: '2010-01-01' },
      { bookId: '2', position: 2, title: 'B', releaseDate: '2011-01-01' },
    ] }, NOW),
    open: snapshotSeries({ id: 'open', name: 'Ongoing', books: [
      { bookId: '5', position: 1, title: 'C', releaseDate: '2010-01-01' },
      { bookId: '6', position: 2, title: 'D', releaseDate: '2031-01-01' },
    ] }, NOW),
  };
  const lib = { books: [
    book(1, { series: { id: 'done', name: 'Trilogy', position: 1 } }),
    book(2, { series: { id: 'done', name: 'Trilogy', position: 2 } }),
    book(5, { series: { id: 'open', name: 'Ongoing', position: 1 } }),
  ] };
  assert.deepEqual(completedSeries(state, lib, NOW).map((s) => s.id), ['done']);
});
