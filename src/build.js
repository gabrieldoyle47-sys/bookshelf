#!/usr/bin/env node
/**
 * Bundle the site's modules into one minified file, docs/app/bundle.js.
 *
 * The site is written as ~50 small ES modules, which a browser fetches one
 * import at a time - a chain of round trips before the first shelf appears.
 * The live site loads this single bundle instead (index.html picks it);
 * on localhost the modules load as they are, so editing needs no build.
 *
 * Run by `node src/stamp.js` before every publish.
 */
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './store.js';

const out = join(ROOT, 'docs', 'app', 'bundle.js');
execFileSync('npx', ['--yes', 'esbuild@0.24.2', join(ROOT, 'docs', 'app', 'ui', 'main.js'),
  '--bundle', '--format=esm', '--minify', '--target=es2022', '--sourcemap', '--legal-comments=none', `--outfile=${out}`],
{ stdio: ['ignore', 'inherit', 'inherit'] });
console.log(`bundle.js -> ${Math.round(statSync(out).size / 1024)} KB`);
