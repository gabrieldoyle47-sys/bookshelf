import { createClient, searchBooks } from '../docs/app/core/hardcover.js';
import { loadToken } from '../src/store.js';
import { bookFromHardcover, deriveWatchlist } from '../docs/app/core/model.js';
const gql = createClient(await loadToken());
for (const q of ['dungeon crawler carl', 'project hail mary']) {
  const [h] = await searchBooks(gql, q, 1);
  console.log(`\n${h.title}`);
  console.log(`  authors : ${h.authors.map(a=>`${a.name}(${a.id})`).join(', ')}`);
  console.log(`  series  : ${h.series ? `${h.series.name} #${h.series.position} id=${h.series.id}` : 'standalone'}`);
  console.log(`  date    : ${h.releaseDate}   pages: ${h.pages}`);
}
// Prove the watchlist derives correctly from a one-request add.
const [carl] = await searchBooks(gql, 'dungeon crawler carl', 1);
const lib = { books: [bookFromHardcover(carl, { status: 'read', rating: 5 })], watch: {series:{},authors:{}} };
const w = deriveWatchlist(lib);
console.log('\nwatchlist from a 5-star read:');
console.log('  series :', Object.values(w.series).map(s=>s.name));
console.log('  authors:', Object.values(w.authors).map(a=>a.name));
