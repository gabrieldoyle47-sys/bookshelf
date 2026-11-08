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

test('trophies go into the cabinet at the bottom, and come down if a series reopens', async () => {
  const { placeTrophies } = await import('../docs/app/core/arrange.js');
  const base = { shelves: [{ title: 'Romance', kind: 'genre', keys: ['e:Romance', 'b:hc:1', 't:old'] }], ornaments: {} };
  const out = placeTrophies(base, ['x', 'y']);
  assert.deepEqual(out.shelves.map((s) => s.kind), ['genre', 'cabinet']);
  assert.deepEqual(out.shelves[0].keys, ['e:Romance', 'b:hc:1'], 'a series no longer finished loses its trophy');
  assert.deepEqual(out.shelves[1].keys, ['t:x', 't:y']);
  const moved = { shelves: [{ title: 'Romance', kind: 'genre', keys: ['e:Romance', 't:y'] }, out.shelves[1]], ornaments: {} };
  assert.deepEqual(placeTrophies(moved, ['x', 'y']).shelves[0].keys, ['e:Romance', 't:y'], 'a moved trophy stays put');
});

test('a new book never lands in the trophy cabinet', () => {
  const saved = { shelves: [
    { title: 'Romance', kind: 'genre', keys: ['e:Romance'] },
    { title: 'To read', kind: 'pile', keys: ['e:To read'] },
    { title: 'Trophies', kind: 'cabinet', keys: [] },
  ], ornaments: {} };
  const merged = mergeLayout(saved, [book(7, { genres: ['Horror'], authors: [{ id: 'q', name: 'Q' }] })]);
  assert.deepEqual(merged.shelves[0].keys, ['e:Romance', 'b:hc:7']);
  assert.deepEqual(merged.shelves[2].keys, []);
});

test('a recap keeps the story and drops the publisher puff', async () => {
  const { storySentences, earlierBooks } = await import('../docs/app/core/memory.js');
  const text = '#1 New York Times bestselling author returns! Kaladin has been dragged from his home. He fights to save his men. Then more happens.';
  assert.equal(storySentences(text), 'Kaladin has been dragged from his home. He fights to save his men.');
  assert.equal(storySentences(''), '');
  const lib = { books: [
    book(1, { series: { id: '9', position: 1 } }), book(2, { series: { id: '9', position: 2 } }),
    book(3, { series: { id: '9', position: 1.5 }, status: 'tbr' }), book(4, { series: { id: '9', position: 3 } }),
  ] };
  assert.deepEqual(earlierBooks(lib, '9', 3).map((b) => b.id), ['hc:1', 'hc:2']);
});

test('because you loved: shared distinctive genres and the same author lead; the seed series is left out', async () => {
  const { becauseYouLoved, vibeMatches } = await import('../docs/app/core/suggest.js');
  const seed = { id: 'hc:1', hardcoverId: '1', authors: [{ id: 'a', name: 'A' }], series: { id: 's' },
    genres: ['Fantasy', 'Epic', 'Military'], moods: ['tense', 'dark'] };
  const lib = { books: [seed] };
  const cand = [
    { id: '2', title: 'Same series', series: { id: 's', position: 2 }, genres: ['Epic'], authors: [{ id: 'a', name: 'A' }] },
    { id: '3', title: 'Epic military', genres: ['Epic', 'Military'], moods: ['tense'], authors: [{ id: 'b', name: 'B' }], usersCount: 10 },
    { id: '4', title: 'Only broad', genres: ['Fantasy'], authors: [{ id: 'c', name: 'C' }], usersCount: 100000 },
    { id: '5', title: 'Romance', genres: ['Romance'], authors: [{ id: 'd', name: 'D' }] },
    { id: '6', title: 'Same author', genres: ['Science Fiction'], authors: [{ id: 'a', name: 'A' }] },
  ];
  const out = becauseYouLoved(seed, cand, lib);
  assert.deepEqual(out.map((s) => s.book.id).slice(0, 1), ['3']);
  assert.ok(!out.some((s) => ['2', '5'].includes(s.book.id)));
  assert.equal(out.find((s) => s.book.id === '6').reasons[0], 'Also by A');
  const v = vibeMatches([{ id: '7', moods: ['Dark', 'tense'] }, { id: '8', moods: ['dark'] }, { id: '9', moods: ['funny'] }], ['dark', 'tense'], lib);
  assert.deepEqual(v.map((s) => s.book.id), ['7', '8']);
});
