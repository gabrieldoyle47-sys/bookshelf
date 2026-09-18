import { createClient, searchBooks, bookById, seriesById, authorBooks, rateLimit } from '../docs/app/core/hardcover.js';
import { loadToken } from '../src/store.js';

const gql = createClient(await loadToken());

console.log('=== 1. SEARCH: "dungeon crawler carl" ===');
const hits = await searchBooks(gql, 'dungeon crawler carl', 4);
for (const h of hits) {
  console.log(`  ${h.title} — ${h.authors.join(', ')} (${h.releaseYear}) | series=${h.series?.name ?? '—'} #${h.series?.position ?? '—'} id=${h.series?.id ?? '—'} | pages=${h.pages} | book=${h.id}`);
}

const top = hits[0];
console.log('\n=== 2. BOOK DETAIL (exact release_date + author ids) ===');
const detail = await bookById(gql, top.id);
console.log(' ', JSON.stringify(detail, null, 2).split('\n').slice(0,14).join('\n  '));

const seriesId = detail?.series?.id ?? top.series?.id;
console.log(`\n=== 3. SERIES ${seriesId} (dedup + future releases) ===`);
const s = await seriesById(gql, seriesId);
console.log(`  "${s.name}" by ${s.author?.name} — ${s.books.length} books`);
const positions = s.books.map(b => b.position);
console.log(`  duplicate positions: ${positions.length !== new Set(positions).size ? 'YES (dedup FAILED)' : 'none (dedup works)'}`);
for (const b of s.books) console.log(`    #${String(b.position).padEnd(4)} ${(b.releaseDate ?? '(no date)').padEnd(12)} ${b.title}`);
const future = s.books.filter(b => b.releaseDate && b.releaseDate > '2026-09-18');
console.log(`  >>> ${future.length} unreleased book(s) detected`);

console.log('\n=== 4. AUTHOR CATALOGUE ===');
const a = await authorBooks(gql, detail.authors[0].id);
console.log(`  ${a.name}: ${a.books.length} titles`);
for (const b of a.books.slice(0,5)) console.log(`    ${(b.releaseDate ?? '—').padEnd(12)} ${b.title}`);

console.log(`\nRate limit remaining: ${rateLimit.remaining} | daily: ${rateLimit.dailyRemaining}`);
