#!/usr/bin/env node
/**
 * Move the shelves from docs/data into the accounts database (D1), once.
 *
 * Writes a SQL file (outside the repo) that loads every shelf and the
 * watcher's state as documents, and makes a one-time claim code for each
 * profile, which hands that shelf to whoever signs up with it. The first
 * profile listed becomes the admin.
 *
 *   node tools/migrate-to-d1.mjs <out.sql>
 *   npx wrangler d1 execute bookshelf [--local|--remote] --file=<out.sql>
 *
 * The codes are printed once - keep them; they are not stored in the repo.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DATA = fileURLToPath(new URL('../docs/data/', import.meta.url));
const out = process.argv[2];
if (!out) { console.error('usage: node tools/migrate-to-d1.mjs <out.sql>'); process.exit(1); }

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const now = new Date().toISOString();
const sql = [];
const file = (path) => {
  const full = `${DATA}${path}`;
  if (!existsSync(full)) return;
  sql.push(`INSERT INTO files (path, content, version, updated) VALUES (${q(path)}, ${q(readFileSync(full, 'utf8'))}, 1, ${q(now)})
  ON CONFLICT(path) DO UPDATE SET content = excluded.content, version = files.version + 1, updated = excluded.updated;`);
};

for (const f of ['series-state.json', 'authors.json', 'books-state.json', 'events.jsonl']) file(f);

const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
const code = () => [...crypto.getRandomValues(new Uint8Array(10))].map((b) => alphabet[b % alphabet.length]).join('');
const { profiles } = JSON.parse(readFileSync(`${DATA}profiles.json`, 'utf8'));
const codes = [];
profiles.filter((p) => !p.removed).forEach((p, i) => {
  file(`profiles/${p.id}/library.json`);
  const c = code();
  const profile = { name: p.name, colour: p.colour ?? null, look: p.look ?? (p.theme ? { palette: p.theme } : null), role: i === 0 ? 'admin' : 'member' };
  sql.push(`INSERT INTO claims (code, legacy_id, profile) VALUES (${q(c)}, ${q(p.id)}, ${q(JSON.stringify(profile))});`);
  codes.push(`${p.name.padEnd(12)} ${c}${i === 0 ? '   (admin)' : ''}`);
});

writeFileSync(out, `${sql.join('\n')}\n`);
console.log(`Wrote ${sql.length} statements to ${out}\n\nClaim codes:\n${codes.join('\n')}`);
