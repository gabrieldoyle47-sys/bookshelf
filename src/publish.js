#!/usr/bin/env node
/**
 * One-shot publisher: creates the GitHub repo, pushes, and turns on Pages.
 *
 * Usage:  GITHUB_TOKEN=ghp_xxx node src/publish.js [repo-name]
 *
 * The token needs the classic `repo` and `workflow` scopes (or a fine-grained
 * token with Administration + Contents + Workflows write on your account).
 * It is used for this run only and never written to disk.
 */

import { execFileSync } from 'node:child_process';
import { ROOT } from './store.js';

const token = process.env.GITHUB_TOKEN;
const name = process.argv[2] ?? 'bookshelf';

if (!token) {
  console.error('Set GITHUB_TOKEN first:  GITHUB_TOKEN=ghp_xxx node src/publish.js');
  process.exit(1);
}

const api = async (path, options = {}) => {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  return { ok: res.ok, status: res.status, body, text };
};

const git = (...args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const step = (msg) => console.log(`  ${msg}`);

const me = await api('/user');
if (!me.ok) {
  console.error(`Token rejected (${me.status}). Check it has the "repo" scope.`);
  process.exit(1);
}
const owner = me.body.login;
console.log(`\nPublishing as ${owner}\n`);

// 1. Create the repo, or reuse it if it already exists.
let repo = await api(`/repos/${owner}/${name}`);
if (repo.status === 404) {
  repo = await api('/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name,
      description: 'Shared reading tracker with automatic series-release watching',
      private: false, // GitHub Pages needs a public repo on the free plan
      has_issues: false,
      has_wiki: false,
    }),
  });
  if (!repo.ok) {
    console.error(`Could not create the repo (${repo.status}): ${repo.body?.message ?? repo.text}`);
    process.exit(1);
  }
  step(`created ${owner}/${name}`);
} else if (repo.ok) {
  step(`reusing existing ${owner}/${name}`);
} else {
  console.error(`Could not read the repo (${repo.status}): ${repo.body?.message ?? repo.text}`);
  process.exit(1);
}

// 2. Push. The token goes in the remote URL for this command only, never a commit.
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
try { git('remote', 'remove', 'origin'); } catch { /* no remote yet */ }
git('remote', 'add', 'origin', `https://${token}@github.com/${owner}/${name}.git`);
try {
  git('push', '-u', 'origin', `${branch}:main`);
  step(`pushed ${branch} to main`);
} finally {
  // Leave a clean remote so the credential is not sitting in .git/config.
  git('remote', 'set-url', 'origin', `https://github.com/${owner}/${name}.git`);
}

// 3. Turn on Pages, serving the docs/ directory.
let pages = await api(`/repos/${owner}/${name}/pages`, {
  method: 'POST',
  body: JSON.stringify({ source: { branch: 'main', path: '/docs' } }),
});
if (pages.status === 409) {
  pages = await api(`/repos/${owner}/${name}/pages`, {
    method: 'PUT',
    body: JSON.stringify({ source: { branch: 'main', path: '/docs' } }),
  });
  step('Pages was already on; pointed it at /docs');
} else if (pages.ok) {
  step('enabled GitHub Pages on main /docs');
} else {
  step(`could not enable Pages automatically (${pages.status}) — do it in Settings → Pages`);
}

const url = `https://${owner}.github.io/${name}/`;
console.log(`\n  Your link:  ${url}`);
console.log('  Pages takes a minute or two to build the first time.\n');
console.log('  Two things left, both in the browser:');
console.log(`    1. Add the Actions secret HARDCOVER_API_TOKEN`);
console.log(`       https://github.com/${owner}/${name}/settings/secrets/actions/new`);
console.log(`    2. To add books from the site, create a fine-grained token scoped to`);
console.log(`       this repo with Contents: read and write, then paste it into Settings`);
console.log(`       in the app along with "${owner}/${name}".\n`);
