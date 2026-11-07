import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangeShelf, shelfOrder } from '../docs/app/core/arrange.js';

const book = (title, author, extra = {}) => ({
  id: `hc:${title}`, title, status: 'read', authors: [{ id: author, name: author }], genres: ['Fantasy'], ...extra,
});
const ser = (id, name, position) => ({ series: { id, name, position } });

test('a series stands together in reading order, inside its author', () => {
  const sections = arrangeShelf([
    book('Oathbringer', 'Sanderson', ser('sa', 'Stormlight', 3)),
    book('Warbreaker', 'Sanderson'),
    book('The Way of Kings', 'Sanderson', ser('sa', 'Stormlight', 1)),
    book('Mistborn', 'Sanderson', ser('mb', 'Mistborn', 1)),
    book('Words of Radiance', 'Sanderson', ser('sa', 'Stormlight', 2)),
  ]);
  assert.deepEqual(shelfOrder(sections).map((b) => b.title),
    ['The Way of Kings', 'Words of Radiance', 'Oathbringer', 'Mistborn', 'Warbreaker'],
    'biggest series first, then the next, then standalones');
});

test('authors are shelved by a shared distinctive genre, and never split', () => {
  const romantasy = { genres: ['Fantasy', 'Romance', 'Romantasy'] };
  const sections = arrangeShelf([
    book('ACOTAR', 'Maas', { ...romantasy, ...ser('ac', 'ACOTAR', 1) }),
    book('Throne of Glass', 'Maas', { ...romantasy, ...ser('tg', 'ToG', 1) }),
    book('Fourth Wing', 'Yarros', { ...romantasy, ...ser('em', 'Empyrean', 1) }),
    book('Red Rising', 'Brown', { genres: ['Science Fiction', 'Dystopian'] }),
    book('Odd one', 'Maas', { genres: ['Horror'] }),
  ]);
  const romance = sections.find((s) => s.genre === 'Romance' || s.genre === 'Romantasy');
  assert.ok(romance, 'Maas and Yarros share a section');
  assert.deepEqual(romance.authors.map((a) => a.name), ['Maas', 'Yarros']);
  assert.ok(romance.authors[0].books.some((b) => b.title === 'Odd one'), 'an author is never split across sections');
  assert.equal(sections[0], romance, 'the biggest section comes first');
});

test('books given up on are left off the shelf; to-read and reading stay', () => {
  const order = shelfOrder(arrangeShelf([
    book('A', 'X', { status: 'abandoned' }), book('B', 'X', { status: 'tbr' }), book('C', 'X', { status: 'reading' }),
  ])).map((b) => b.title);
  assert.deepEqual(order, ['B', 'C']);
});

test('one-book sections gather into "More books" at the end', () => {
  const sections = arrangeShelf([
    book('A1', 'A', { genres: ['Romance'] }), book('A2', 'A', { genres: ['Romance'] }),
    book('B1', 'B', { genres: ['Horror'] }), book('C1', 'C', { genres: [] }),
  ]);
  assert.deepEqual(sections.map((s) => s.genre), ['Romance', 'More books']);
  assert.deepEqual(sections[1].authors.map((a) => a.name).sort(), ['B', 'C']);
});
