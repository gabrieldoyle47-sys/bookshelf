import test from 'node:test';
import assert from 'node:assert/strict';
import { setStatus, applyStatusDates, bookFromHardcover } from '../docs/app/core/model.js';

const TODAY = '2026-09-22';
const LATER = '2026-11-03';

const book = (over = {}) => ({
  id: 'b1', title: 'A Book', authors: [], series: null,
  status: 'tbr', rating: null, note: '',
  added: '2026-01-01', readOn: null, started: null, finished: null,
  ...over,
});

test('moving a book to reading records the start date', () => {
  const b = setStatus(book(), 'reading', { now: TODAY });
  assert.equal(b.started, TODAY);
  assert.equal(b.finished, null, 'not finished yet');
});

test('the start date survives into the finished record', () => {
  const b = book();
  setStatus(b, 'reading', { now: TODAY });
  setStatus(b, 'read', { now: LATER });
  assert.equal(b.started, TODAY, 'the original start date must be kept');
  assert.equal(b.finished, LATER);
  assert.equal(b.readOn, LATER, 'the simplified read date follows the finish date');
});

test('a book marked read without ever being started gets only a finish date', () => {
  // We genuinely do not know when it was started; guessing would be worse.
  const b = setStatus(book(), 'read', { now: TODAY });
  assert.equal(b.started, null);
  assert.equal(b.finished, TODAY);
  assert.equal(b.readOn, TODAY);
});

test('a start date already recorded is never overwritten', () => {
  const b = book({ status: 'tbr', started: '2019-04-01' });
  setStatus(b, 'reading', { now: TODAY });
  assert.equal(b.started, '2019-04-01', 'a hand-entered date outranks an inferred one');
});

test('re-opening a finished book keeps the original start date', () => {
  const b = book({ status: 'read', started: '2019-04-01', finished: '2019-05-01' });
  setStatus(b, 'reading', { now: TODAY });
  assert.equal(b.started, '2019-04-01', 'a re-read must not reset when you first started it');
});

test('a coarse read date set by hand is not clobbered by the finish date', () => {
  const b = book({ status: 'reading', started: TODAY, readOn: '2019' });
  setStatus(b, 'read', { now: LATER });
  assert.equal(b.readOn, '2019', 'an explicit "I read this in 2019" wins');
  assert.equal(b.finished, LATER);
});

test('a finish date already recorded is kept', () => {
  const b = book({ status: 'reading', finished: '2020-01-01' });
  setStatus(b, 'read', { now: TODAY });
  assert.equal(b.finished, '2020-01-01');
});

test('re-saving without changing status records nothing new', () => {
  const b = book({ status: 'reading', started: null });
  applyStatusDates(b, 'reading', TODAY);
  assert.equal(b.started, null, 'only a change of status implies a date');
});

test('abandoning a book records no dates', () => {
  const b = book({ status: 'reading', started: TODAY });
  setStatus(b, 'abandoned', { now: LATER });
  assert.equal(b.started, TODAY, 'kept');
  assert.equal(b.finished, null, 'giving up is not finishing');
  assert.equal(b.readOn, null);
});

test('moving back to the to-read pile keeps what was already recorded', () => {
  const b = book({ status: 'reading', started: TODAY });
  setStatus(b, 'tbr', { now: LATER });
  assert.equal(b.started, TODAY, 'losing the date would destroy real information');
});

/* ------------------------------------------------- adding a book directly */

const hit = { id: 99, title: 'New Book', authors: [], series: null };

test('adding straight to reading records the start date', () => {
  const b = bookFromHardcover(hit, { status: 'reading' });
  assert.ok(b.started, 'should have a start date');
  assert.equal(b.finished, null);
});

test('adding straight to finished records a finish date but no start', () => {
  const b = bookFromHardcover(hit, { status: 'read' });
  assert.equal(b.started, null);
  assert.ok(b.finished);
  assert.equal(b.readOn, b.finished);
});

test('adding to the to-read pile records no dates at all', () => {
  const b = bookFromHardcover(hit, { status: 'tbr' });
  assert.equal(b.started, null);
  assert.equal(b.finished, null);
  assert.equal(b.readOn, null);
});

test('the full journey: add to read-later, start it, finish it', () => {
  const b = bookFromHardcover(hit, { status: 'tbr' });
  assert.equal(b.started, null);

  setStatus(b, 'reading', { now: '2026-09-22' });
  assert.equal(b.started, '2026-09-22');

  setStatus(b, 'read', { now: '2026-10-15', rating: 5 });
  assert.deepEqual(
    { started: b.started, finished: b.finished, readOn: b.readOn, rating: b.rating },
    { started: '2026-09-22', finished: '2026-10-15', readOn: '2026-10-15', rating: 5 },
  );
});
