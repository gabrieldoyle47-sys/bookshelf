#!/usr/bin/env node
/**
 * Local development server.
 *
 * Serves docs/ and, unlike GitHub Pages, accepts writes — so the web app is
 * fully usable on this machine before any GitHub repo exists. The browser app
 * detects localhost and posts here; in production it commits through the
 * GitHub Contents API instead. Same UI, same data files, either way.
 */

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { DATA, ROOT, loadToken } from './store.js';

const DOCS = join(ROOT, 'docs');
const PORT = Number(process.env.PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const send = (res, code, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  // Block traversal before the path is ever joined to a real directory.
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');

  if (req.method === 'PUT' && rel.startsWith('/data/')) {
    const target = join(DATA, rel.slice('/data/'.length));
    if (!target.startsWith(DATA)) return send(res, 403, 'Refused: path escapes the data directory');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    try {
      if (target.endsWith('.json')) JSON.parse(body); // never persist broken JSON
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, body);
      return send(res, 200, JSON.stringify({ ok: true }), TYPES['.json']);
    } catch (err) {
      return send(res, 400, `Rejected: ${err.message}`);
    }
  }

  // Running locally, the Hardcover token is already in .env — handing it to the
  // app means localhost works with no setup at all. This endpoint exists only
  // on the dev server; on GitHub Pages each person pastes their own token.
  if (req.method === 'GET' && rel === '/api/config') {
    return send(res, 200, JSON.stringify({ hardcover: (await loadToken()) ?? '' }), TYPES['.json']);
  }

  if (req.method !== 'GET') return send(res, 405, 'Method not allowed');

  const file = join(DOCS, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(DOCS)) return send(res, 403, 'Forbidden');
  if (!existsSync(file)) return send(res, 404, `Not found: ${rel}`);

  try {
    send(res, 200, await readFile(file), TYPES[extname(file)] ?? 'application/octet-stream');
  } catch (err) {
    send(res, 500, err.message);
  }
});

server.listen(PORT, () => {
  console.log(`\n  Bookshelf running at http://localhost:${PORT}\n`);
  console.log('  Writes go straight to docs/data/ — no GitHub needed yet.\n');
});
