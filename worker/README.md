# The backend

GitHub Pages is a static host, so the page can't hold the GitHub or Hardcover
tokens. (Not mainly a privacy matter: GitHub's secret scanning auto-revokes any
token committed to a public repo, so it would stop working within minutes.)

This Worker holds both tokens instead. That's what makes the site a single link
anyone can open and use — no tokens, no settings, nothing to paste.

It does three things:

| Route | Purpose |
|---|---|
| `GET /search?q=` | proxies Hardcover, so book search needs no token in the browser |
| `GET /read?path=` | reads a data file fresh, bypassing the Pages cache |
| `POST /write` | commits a shelf back to the repo |

Writes are **open** — that's deliberate. Anyone with the link can add books.

The one restriction is that writes only land in `profiles.json` and
`profiles/<id>/library.json`, and must be valid JSON under 512 KB. That's not a
security boundary; it's so a bug or a stray request can't scribble over the
site's own code and break it for everyone. Every change is a commit, so anything
unwanted is one `git revert` away.

## Deploying

```bash
cd worker
npx wrangler login                        # once, opens a browser
npx wrangler deploy                       # prints the worker URL
npx wrangler secret put GITHUB_TOKEN      # fine-grained, Contents: read+write, this repo
npx wrangler secret put HARDCOVER_TOKEN
```

Then put the URL in `docs/site.json` and commit:

```json
{ "workerUrl": "https://bookshelf-write.<subdomain>.workers.dev" }
```

The secrets are stored by Cloudflare and never written to this repo.

## Tests

```bash
node --test ../test/worker.test.js
```

Covers the search proxy, the read and write paths, path handling, JSON and size
limits, conflict reporting and CORS.
