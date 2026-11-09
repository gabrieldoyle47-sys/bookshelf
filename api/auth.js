/**
 * Accounts: checking what people type, hashing passwords, making session
 * tokens. Pure Web Crypto, so it runs the same in the Worker and in tests.
 */

// Slow on purpose, so a stolen hash is slow to guess at. Kept within the free
// Workers plan's CPU budget (about 6ms here). Stored with each hash, so it
// can be raised later without breaking anyone's password.
export const PBKDF2_ITERATIONS = 50000;

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));

export async function hashPassword(password, { salt = null, iterations = PBKDF2_ITERATIONS } = {}) {
  const saltBytes = salt ? fromHex(salt) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations }, key, 256);
  return { hash: toHex(bits), salt: toHex(saltBytes), iterations };
}

/** Compare in constant time, so the time taken says nothing about the hash. */
export async function verifyPassword(password, { pw_hash: hash, pw_salt: salt, pw_iter: iterations }) {
  const { hash: candidate } = await hashPassword(password, { salt, iterations });
  if (candidate.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export const sha256 = async (text) => toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));

/** A random token, URL-safe: what a signed-in device holds. */
export function newToken(bytes = 32) {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A short code people can read out or type: invites, claims, temporary passwords. */
export function newCode(length = 10) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // no l/1/o/0 to confuse
  const raw = crypto.getRandomValues(new Uint8Array(length));
  return [...raw].map((b) => alphabet[b % alphabet.length]).join('');
}

/* ------------------------------------------------------------- checking */

const RESERVED = new Set(['admin', 'administrator', 'root', 'me', 'friends', 'shared', 'upcoming', 'api', 'null', 'undefined']);

/** Usernames: 3-20 of a-z, 0-9, dot, underscore; compared without case. */
export function checkUsername(raw) {
  const username = String(raw ?? '').trim().toLowerCase();
  if (!/^[a-z0-9._]{3,20}$/.test(username)) return { error: 'A username is 3 to 20 letters, numbers, dots or underscores.' };
  if (/^[._]|[._]$|\.\./.test(username)) return { error: 'A username cannot start or end with a dot or underscore.' };
  if (RESERVED.has(username)) return { error: 'That username is not available.' };
  return { username };
}

export function checkDisplayName(raw) {
  const name = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!name) return { error: 'Give a name to show on the site.' };
  if (name.length > 30) return { error: 'A display name is 30 characters at most.' };
  return { name };
}

/** No rules for now beyond not being empty (to be tightened later). */
export function checkPassword(raw) {
  const password = String(raw ?? '');
  if (!password) return { error: 'Choose a password.' };
  if (password.length > 200) return { error: 'That password is too long.' };
  return { password };
}

export function checkEmail(raw) {
  const email = String(raw ?? '').trim().toLowerCase();
  if (!email) return { error: 'An email is needed, for recovering the account.' };
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'That email address does not look right.' };
  return { email };
}

/** The shelf id for a new account: the username, made safe for a path. */
export const shelfIdFor = (username) => username.replace(/\./g, '-');
