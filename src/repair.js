#!/usr/bin/env node
/**
 * One-off repair for text that was corrupted before the encoding fix.
 *
 * The Worker's read path used to hand back base64 as a binary string, so any
 * multi-byte UTF-8 character came through as several Latin-1 characters and
 * grew again on every save. This walks every profile, repairs and cleans the
 * affected fields, and reports what changed.
 *
 *   node src/repair.js            # show what would change
 *   node src/repair.js --write    # apply it
 */

import { cleanText } from '../docs/app/core/model.js';

const WORKER = process.env.WORKER_URL ?? 'https://bookshelf-write.doyle-bookshelf.workers.dev';
const APPLY = process.argv.includes('--write');

const read = async (path) => {
  const res = await fetch(`${WORKER}/read?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`read ${path}: ${res.status}`);
  return JSON.parse((await res.json()).content);
};

const write = async (path, value, message) => {
  const res = await fetch(`${WORKER}/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content: `${JSON.stringify(value, null, 2)}\n`, message }),
  });
  if (!res.ok) throw new Error(`write ${path}: ${res.status} ${await res.text()}`);
};

/** Clean every human-readable string on a book, reporting each change. */
function repairBook(book, changes) {
  const note = (field, before, after) => {
    if (before !== after) changes.push({ field, before, after });
  };

  const title = cleanText(book.title);
  note('title', book.title, title);
  book.title = title;

  if (book.note) {
    const cleaned = cleanText(book.note);
    note('note', book.note, cleaned);
    book.note = cleaned;
  }

  for (const author of book.authors ?? []) {
    const name = cleanText(author.name);
    note('author', author.name, name);
    author.name = name;
  }

  if (book.series?.name) {
    const name = cleanText(book.series.name);
    note('series', book.series.name, name);
    book.series.name = name;
  }
  return book;
}

const { profiles } = await read('profiles.json');
let total = 0;

for (const profile of profiles) {
  const path = `profiles/${profile.id}/library.json`;
  const library = await read(path);
  const changes = [];

  for (const book of library.books) repairBook(book, changes);

  if (!changes.length) {
    console.log(`  ${profile.name}: nothing to repair (${library.books.length} books)`);
    continue;
  }

  console.log(`\n  ${profile.name}: ${changes.length} field(s) to repair`);
  for (const c of changes) {
    console.log(`    ${c.field}: ${JSON.stringify(c.before)}`);
    console.log(`         -> ${JSON.stringify(c.after)}`);
  }
  total += changes.length;

  if (APPLY) {
    await write(path, library, `Repair mis-encoded text for ${profile.name}`);
    console.log('    written');
  }
}

console.log(`\n${total} field(s) ${APPLY ? 'repaired' : 'would be repaired (run with --write)'}`);
