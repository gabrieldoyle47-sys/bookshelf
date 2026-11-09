import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword, verifyPassword, newToken, newCode, checkUsername, checkDisplayName, checkEmail, checkPassword, shelfIdFor,
} from '../api/auth.js';

test('a password checks against its own hash only, and the hash is not the password', async () => {
  const pw = await hashPassword('correct horse');
  assert.notEqual(pw.hash, 'correct horse');
  assert.equal(pw.salt.length, 32);
  const row = { pw_hash: pw.hash, pw_salt: pw.salt, pw_iter: pw.iterations };
  assert.equal(await verifyPassword('correct horse', row), true);
  assert.equal(await verifyPassword('correct horsf', row), false);
  const again = await hashPassword('correct horse');
  assert.notEqual(again.hash, pw.hash, 'a fresh salt each time');
});

test('usernames: simple, lower-case, not reserved', () => {
  assert.deepEqual(checkUsername('  Gabriel.Doyle '), { username: 'gabriel.doyle' });
  assert.ok(checkUsername('ab').error);
  assert.ok(checkUsername('has space').error);
  assert.ok(checkUsername('.dot').error);
  assert.ok(checkUsername('admin').error);
  assert.equal(shelfIdFor('gabriel.doyle'), 'gabriel-doyle');
});

test('names, emails and passwords', () => {
  assert.deepEqual(checkDisplayName('  Steph   K '), { name: 'Steph K' });
  assert.ok(checkDisplayName('').error);
  assert.ok(checkDisplayName('x'.repeat(31)).error);
  assert.deepEqual(checkEmail(' A@B.co '), { email: 'a@b.co' });
  assert.ok(checkEmail('nope').error);
  assert.ok(checkEmail('').error);
  assert.deepEqual(checkPassword('a'), { password: 'a' }, 'no rules yet beyond not empty');
  assert.ok(checkPassword('').error);
});

test('tokens and codes are random and readable', () => {
  assert.notEqual(newToken(), newToken());
  assert.match(newToken(), /^[A-Za-z0-9_-]{40,}$/);
  assert.match(newCode(), /^[a-hj-km-np-z2-9]{10}$/);
});
