#!/usr/bin/env node
/**
 * Stamp docs/site.json with the current commit, so a returning browser can
 * tell whether the code it is running is the code that is deployed.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './store.js';

const file = join(ROOT, 'docs', 'site.json');
const site = JSON.parse(await readFile(file, 'utf8'));
// A timestamp rather than a commit sha: stamping has to happen before the
// commit that carries it, so the sha would always be one release behind.
site.version = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
await writeFile(file, `${JSON.stringify(site, null, 2)}\n`);
console.log(`site.json version -> ${site.version}`);
