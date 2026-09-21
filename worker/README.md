# The write proxy

GitHub Pages is a static host: anything the page knows, the public knows. So the
page cannot hold a token that lets it commit. This Worker holds it instead.

The page sends a change here with a shared key; the Worker checks the key and
commits on its behalf. That is what makes the editing link work on any device
with nothing to paste.

## What a leaked key can and cannot do

The key travels in a URL, and URLs get forwarded, logged and screenshotted. So
the Worker assumes the key *will* leak eventually and limits the damage:

- **Writes are confined to `profiles.json` and `profiles/<id>/library.json`.**
  Nothing else. A leaked key cannot touch the workflow, the page's JavaScript, or
  anything else in the repo.
- Content must be valid JSON under 512 KB, so a bad write cannot break the site.
- Every change is a commit, so anything unwanted is one `git revert` away.

Worst case is someone adding junk books to a shelf. If that happens, rotate the
key (`wrangler secret put WRITE_KEY`) and the old link stops working.

## Deploying

```bash
cd worker
npx wrangler login              # once, opens a browser
npx wrangler deploy             # prints your worker URL

npx wrangler secret put GITHUB_TOKEN   # fine-grained, Contents: read+write, this repo only
npx wrangler secret put WRITE_KEY      # any phrase; it becomes the ?k= in the link
```

Then put the Worker's URL into `docs/site.json` and commit, so the page can find
it:

```json
{ "workerUrl": "https://bookshelf-write.<your-subdomain>.workers.dev" }
```

The secrets are never written to this repo — `wrangler secret put` stores them
with Cloudflare.

## Running the tests

```bash
node --test ../test/worker.test.js
```

They cover the key check, the path whitelist (including traversal attempts),
JSON and size validation, CORS, and the case where no key has been configured —
which must refuse everything rather than default to open.
