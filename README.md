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

**On the website.** Open the link, pick your name in the sidebar, and press *Add a
book*. Search, pick the right edition, choose a shelf. That's the whole
interaction — on a laptop or a phone, for anyone you share the link with.

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
- Hide a book → it stops appearing in Upcoming, Recommendations and What's new.
- Rate a book 4 or 5 → that author is watched too, which catches standalones and new
  series before they exist as a series on Hardcover.

You can override any of it with `books watch` / `books unwatch`.

## What else it does

- **Recommendations.** One tab, two columns. On the left, books that are already
  out in series you read but aren't anywhere on your shelf, with the next one to
  read marked and novellas folded away. On the right, books the other person sent
  you with a note; add one to your pile in a click, or pass. Send one from any
  book on your shelf (*Recommend to …*) or by searching.
- **Upcoming.** What you're waiting for (your series, plus any book you track) and,
  separately, forthcoming books by every author you read, outside the series you
  already follow. Click any of them for everything known so far: description,
  publisher, how many Hardcover readers want it, and every date change the watcher
  has seen. Hide anything you don't care about; bring it back from the bottom of
  the page. Search there to track a book nothing on your shelf would lead to.
- **Goals and Year in books.** An optional yearly target on Stats, with where a
  steady pace would have you today, and a recap of each year: covers, longest,
  shortest, favourites, most-read author and series, and busiest month.
- **Half stars.** Click the left half of a star for .5.

## Reading dates

Move a book to **Reading now** and the day you started is recorded for you. That date
survives into the finished record, so a book you actually tracked ends up with both
ends of the read without you typing a date. A book marked finished without ever
passing through *Reading now* gets a finish date only — nobody knows when it was
started, and guessing would be worse than leaving it blank.

Nothing inferred ever overwrites something you set by hand, and re-reading a book
keeps the original start date rather than resetting it.

For everything else there's **"When did you read it?"** on each book, which takes
whatever precision you actually have — a year on its own is a complete answer, and
so is a month. Exact `started`/`finished` live in the *Reading dates* panel below it.
Anything derived from dates — reading pace, books per year — says how much of your
shelf it actually covers rather than implying it knows the whole picture.

## Setup

1. **Hardcover token** — sign up, then Settings → API. Put it in `.env`:
   ```
   HARDCOVER_API_TOKEN=hc_pat_…
   ```
   `.env` is gitignored. **This repo is public — never commit a token to it.**

2. **GitHub Pages** — Settings → Pages → source `main`, folder `/docs`.

3. **Actions secret** — Settings → Secrets → Actions → `HARDCOVER_API_TOKEN`.

4. **The backend** — deploy the Worker in `worker/` and put its URL in
   `docs/site.json`. It holds the GitHub and Hardcover tokens, which a static
   site can't, and that's what makes the link work with nothing to set up.

That's it. After that there is **one link**, it works on any device, and anyone
you give it to can add books — no accounts, no tokens, no settings. Writes are
open on purpose; every change is a commit, so anything unwanted is one
`git revert` away.

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
node --test test/*.test.js
```

The diff engine decides what you get told about, so it's the part worth testing. The
tests cover each event type, the first-sighting case, back-catalogue books, repeated
runs, and two people watching the same series.
