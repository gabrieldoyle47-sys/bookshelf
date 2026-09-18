# Bookshelf

A shared reading tracker that watches the series you read and tells you when a new
book is coming.

You add a book by typing its title. Everything else — the author, the series and your
position in it, the page count, the release date — is filled in from
[Hardcover](https://hardcover.app). From then on that series is watched automatically:
a daily job checks whether a new book has appeared, whether a release date has been
announced or moved, and whether something is out.

There is no server and no database. The site is static, your books are JSON files in
this repo, and every change is a commit — so you can see exactly when a release date
slipped by reading the git history.

## Using it

**On the website.** Open it, pick your name in the sidebar, and press *Add a book*.
Search, pick the right edition, choose a shelf. That's the whole interaction.

**On your own machine,** if you'd rather use a terminal:

```bash
node src/serve.js       # then open http://localhost:4173
node src/cli.js --help  # or skip the browser entirely
```

Running locally, changes are written straight to the files on disk and the Hardcover
token is read from `.env` — nothing else to configure.

## The rules it follows on its own

- Start or finish a book in a series → that series is watched.
- Rate a book 2 stars or below, or give up on it → that series is dropped.
- Rate a book 4 or 5 → that author is watched too, which catches standalones and new
  series before they exist as a series on Hardcover.

You can override any of it with `books watch` / `books unwatch`.

## Reading dates are optional

`started` and `finished` are never asked for. If you want them, they're in the
*Reading dates* panel on a book. Anything derived from them — reading pace, books per
month — says how much of your shelf it actually covers rather than implying it knows
the whole picture.

## Setup

1. **Hardcover token** — sign up, then Settings → API. Put it in `.env`:
   ```
   HARDCOVER_API_TOKEN=hc_pat_…
   ```
   `.env` is gitignored. **This repo is public — never commit a token to it.**

2. **GitHub Pages** — Settings → Pages → source `main`, folder `/docs`.

3. **Actions secret** — Settings → Secrets → Actions → `HARDCOVER_API_TOKEN`.

4. **To save from the published site**, each person needs a fine-grained personal
   access token scoped to this repo alone with *Contents: read and write*, pasted into
   Settings in the app. It's kept in that browser and never committed.

   This is not a login. Anyone with that token can edit either profile — fine for two
   people who trust each other, but don't mistake it for security.

## Layout

```
docs/app/core/    shared by the browser and the watcher — hardcover, model, diff engine
docs/app/ui/      the website
docs/data/        your books; the source of truth
src/              cli.js, run-check.js (the daily watcher), serve.js (local dev)
test/             the diff engine's tests
```

`docs/app/core/` is imported unchanged by both the browser and Node, which is why the
rules that decide what gets announced exist in exactly one place.

## What it can't do

Hardcover's future-release data comes from its librarians and publisher feeds. A
long-rumoured sequel that nobody has catalogued yet doesn't exist as far as any tool is
concerned, and this one can't invent it. Watching authors as well as series is the
hedge, since a new title usually appears on its author first.

Hardcover also stores "we know the year but not the day" as January 1st, so a date
ending `-01-01` is displayed as just the year rather than pretending to a precision it
doesn't have.

## Running the tests

```bash
node --test test/watch.test.js
```

The diff engine decides what you get told about, so it's the part worth testing. The
tests cover each event type, the first-sighting case, back-catalogue books, repeated
runs, and two people watching the same series.
