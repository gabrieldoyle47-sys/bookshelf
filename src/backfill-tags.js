#!/usr/bin/env node
/**
 * Backfill genres and moods onto books added before those fields existed.
 *
 * Hardcover only exposes them through the search index, not by book id, so
 * each book costs one search. Paced against the 60-a-minute limit.
 *
 *   node src/backfill-tags.js            # report what would change
 *   node src/backfill-tags.js --write    # apply it
 */

import { createClient, searchBooks } from '../docs/app/core/hardcover.js';
import { cleanTags } from '../docs/app/core/model.js';
import * as store from './store.js';

const WORKER = process.env.WORKER_URL ?? 'https://bookshelf-write.doyle-bookshelf.workers.dev';
const APPLY = process.argv.includes('--write');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

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

const gql = createClient(await store.loadToken());
const { profiles } = await read('profiles.json');
let filled = 0;
let missed = 0;

for (const profile of profiles) {
  const path = `profiles/${profile.id}/library.json`;
  const library = await read(path);
  let changed = 0;

  console.log(`\n${profile.name}`);
  for (const book of library.books) {
    if (book.genres?.length) continue;

    try {
      // Match on id rather than trusting the first hit: a search for a common
      // title can easily return a different edition or another book entirely.
      const hits = await searchBooks(gql, book.title, 10);
      const match = hits.find((h) => String(h.id) === String(book.hardcoverId));
      if (!match) {
        console.log(`  ? ${book.title} — no matching id in search results`);
        missed++;
        continue;
      }

      book.genres = cleanTags(match.genres, 6);
      book.moods = cleanTags(match.moods, 5);
      changed++;
      filled++;
      console.log(`  + ${book.title}`);
      console.log(`      ${book.genres.join(' · ') || '(no genres)'}`);
    } catch (err) {
      console.log(`  ! ${book.title}: ${err.message}`);
      missed++;
      if (/rate limit/i.test(err.message)) await pause(3000);
    }
    await pause(1100); // 60 calls a minute, with room to spare
  }

  if (changed && APPLY) {
    await write(path, library, `Backfill genres for ${profile.name}`);
    console.log(`  written (${changed} books)`);
  }
}

console.log(`\n${filled} book(s) ${APPLY ? 'filled' : 'would be filled'}${missed ? `, ${missed} skipped` : ''}`);
if (!APPLY && filled) console.log('Run again with --write to apply.');
