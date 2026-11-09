# Bookshelf

A shared reading tracker that watches the series you read and tells you when a new
book is coming.

You add a book by typing its title. Everything else — the author, the series and your
position in it, the page count, the release date — is filled in from
[Hardcover](https://hardcover.app). From then on that series is watched automatically:
a daily job checks whether a new book has appeared, whether a release date has been
announced or moved, and whether something is out.

It's for a small club of readers (about twenty). Everyone has an account; your shelf
is yours to change, members can look at each other's, and friends can react to each
other's ratings and send each other books. The site itself is static (GitHub Pages);
accounts and shelves live in a small database behind a Cloudflare Worker, so nothing
personal is in this public repo.

## Using it

**On the website.** Open the link, create an account (or sign in), and press *Add a
book*. Search, pick the right edition, choose a shelf. That's the whole
interaction — on a laptop or a phone. *Find friends* in the sidebar finds people by
name; once they accept, their shelves sit under yours.

**On your own machine,** run the API and the site side by side:

```bash
cd api && npx wrangler dev --local --port 8787   # the API, with a local database
BOOKSHELF_API=http://localhost:8787 node src/serve.js   # then open http://localhost:4173
```

The local database starts empty: create it with
`npx wrangler d1 execute bookshelf --local --file=schema.sql` (in `api/`), and put
`HARDCOVER_TOKEN` and `SERVICE_KEY` in `api/.dev.vars`.

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
- **Releases.** One tab, two columns: on the left, what you're waiting for (your series, plus any book you track) and,
  separately, forthcoming books by every author you read, outside the series you
  already follow. Click any of them for everything known so far: description,
  publisher, how many Hardcover readers want it, and every date change the watcher
  has seen. Hide anything you don't care about; bring it back from the bottom of
  the page. Search there to track a book nothing on your shelf would lead to.
- **Goals and Year in books.** An optional yearly target on Stats, with where a
  steady pace would have you today, and a recap of each year: covers, longest,
  shortest, favourites, most-read author and series, and busiest month.
- **Half stars.** Click the left half of a star for .5.
- **Series progress** on Stats: a bar per series, one segment per main book —
  read, reading, on your pile, out but not on your shelf, or not out yet — with
  skipped books called out and the next release date.
- **Release days in your calendar.** *Add release to calendar* on any upcoming
  book opens a calendar invite (an all-day event with a 9am reminder); on an
  iPhone or Mac it goes straight into Apple Calendar.
- **The bookshelf.** Clicking a person opens their bookshelf: every book standing
  in a wooden case — a series together and in order, then each author's books
  together, then authors gathered by genre behind an engraved bookend. Each series
  has its own cloth colour; books being read carry a ribbon, audiobooks a small
  pair of headphones.
  Hover for a peek, click to open. Filter by read / reading / to read, or arrange
  as a rainbow. The list view is the *Books* tab.
- **Arranging.** The *Arrange* button holds everything about how the shelf looks:
  which books show, *By genre*, *By author* (a shelf for each author with two or
  more books, the rest together) or *Rainbow*, the room, and *Move books by hand*, which lets you drag books,
  ornaments and trophies anywhere (mouse or finger), put up to two ornaments on top
  of the case, and rename, move, add or remove shelves from the bar above each one —
  "Dystopian" can become "Sci-fi", and it still collects the same books. *Save shelf*
  keeps it with that person's shelf, separately for each arrangement; new books
  still slot in beside their series. Double-click any ornament to swap it for one of
  nineteen others, or take it off the shelf. *Reset* goes back to the automatic order.
- **Trophies.** Every series you have finished completely earns a trophy on the mantel
  above the case: a trinket for its genre, in the series' own spine colour, with its
  name on a brass plaque.
- **The room.** The bookshelf stands against the back wall of a small room drawn in
  real perspective, with its furniture drawn in the same perspective, lit from the
  window and the lamps, and casting shadows. Every room has a window on the left wall
  whose sky follows the time of day, and the trophies stand on a mantel shelf on the
  back wall above the case. The switch above it picks the room: *Library* (walls of
  bookcases, a rolling ladder, a desk with a banker's lamp, a globe), *Fireplace* (a
  chimney breast with a fire going, a leather wingback, a wine table), *Rainy* (a dark
  bedroom with a storm in the window, the bed under it, a bedside lamp) or *Café*
  (tiles, a chalkboard, pendant lights, a marble counter, bentwood chairs). With sound
  on, the room's sound plays too. The furniture is generated by tools/room-art.
- **Opening a book.** Click a book anywhere and it opens: the cover swings back and
  the details are on the pages — rating, note, start and finish dates, days taken,
  pace, listening hours and narrator — with *Edit* leading to the usual panel.
  Closing swings the cover shut.
- **Reactions.** Anyone can leave an emoji on someone's rating or finish, in the open
  book or the group feed. They are anonymous for now; each one already has room
  for a name for when accounts arrive.
- **Remembering a series.** *Previously on…* recaps the books you've read before the
  one you're opening, from each book's own description and your notes. *Who's who*
  keeps your notes on the characters, each tagged with the book they first appear
  in and hidden from anyone not there yet.
- **Author and series pages.** Author and series names lead to their own pages: an
  author's bio, where they are from, their best-known books and who has read which;
  a series in reading order with everyone's progress, what's next, the recap and
  who's who.
- **Audiobooks.** Mark a book as listened to and its length and narrator are filled
  in from Hardcover; listening hours count in Stats and the year story.
- **Your shelf, drawn.** Each shelf opens with a bookshelf of everything you've
  finished — taller, thicker spines for longer books, a gold band for 5★ — and a
  spotlight on what you're reading, with progress and a finish-date estimate.
  *Finished!* gets confetti; *Pick my next read* shakes a jar of paper slips — one
  per book on your pile, in its spine colour — and unfolds the one that comes out.
- **Suggest a book.** *Picked for you* on Recommendations (or *Suggest a book* on a
  shelf) finds popular, well-rated books in your most distinctive genres and ranks
  them against your taste — genres and moods weighted by how much you liked each
  book, favourite authors, usual length — saying why each was picked.
- **Because you loved…** A chip for each of your five-star books; pick one for a row
  of books like it.
- **Find a new book.** Search by title or author, browse by vibe (dark, hopeful,
  funny… up to three at once), or go through an award list — the Hugo, Booker,
  Pulitzer, Giller, International Booker or NPR's top 100 SFF.
- **Adding a book** now lets you rate it, date it and add a note before it's saved.
- **Auto / Light / Dark** switch in the sidebar, and a download of your own shelf
  (JSON or CSV) in Settings.
- **Both of us / Everyone.** The group page (you and your friends) works for any number of people:
  taste match for every pair, a shared activity feed, books read by more than
  one of you with everyone's rating, debates, picks for whoever is viewing, a
  genre map and a this-year leaderboard. With three or more, choose who to compare.
- **Where to buy.** Upcoming books, suggestions and recommendations link to a search
  at Indigo, Les Libraires, Renaud-Bray and indiebookstores.ca. Only the stores
  with stock would be nicer, but none of them allows checking from another site.
- **Play your year.** On Stats, a full-screen story of a year in books: pages and
  hours, a heatmap of the days you had a book open and your longest streak, how
  your taste moved month by month, personal records, a passport stamp for each
  country your authors come from, your favourites, and a card to save or copy.
- **Decorate.** *Decorate* on your shelf (or *Decorate…* on your name's menu) opens a
  panel to change your look, previewed live: colours for every page of their
  profile (eight palettes — Classic, Forest & olive, Ocean & teal, Rose & apricot,
  Midnight & violet, Sunset & gold, Monochrome ink, Lavender & sage), the heading
  typeface (Classic serif, Elegant, Storybook, Modern), their room and what is in it
  (walls, bookcase wood, rug, ceiling lamps), and *Follow the seasons*: blossom,
  summer light, falling leaves or snow at the window, and a slight seasonal tint to
  the pages. It's saved with your account, so everyone who visits sees it that way.
- **Sound, if you want it.** Off by default. The speaker in the sidebar turns all
  sound on or off — a few quiet effects (a page turning, a soft chime) and the room's
  background: the crackle of a fire, soft rain with distant thunder, or a café's soft murmur
  with the odd hiss of steam or ring of the counter bell; the library is silent — with a volume
  slider beside it.
- **A short tour** on a first visit and for each new person; Settings can show it
  again.
- **Undo.** Removing a book, hiding a release and passing on a recommendation
  each offer *Undo* for a few seconds.

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

## Accounts

- **Joining.** Anyone with the link can create an account — a username (for signing in
  and being found; fixed), a display name, an email (only for getting back in; never
  shown) and a password — unless the admin switches joining to invite codes only.
- **Who sees what.** Every signed-in member can look at every shelf unless its owner
  makes it friends-only; notes and ratings can each be hidden too (Edit card → Privacy).
  The API enforces this, not just the page. Only you can change your shelf. Friends (request, then accept) appear in your sidebar, share the group pages,
  and can react to each other's ratings and finishes and send each other books.
- **Account settings** (Settings): display name and colour, password, email, sign out,
  sign out everywhere, and deleting your account.
- **Admin** (the first account): suspend or delete members (deleted accounts can be
  restored for 30 days, then they're gone), give someone a temporary password, switch
  joining between open and invite-only and make invite codes, and see how much of
  Hardcover the site uses.
- **Passwords** are stored only as a salted PBKDF2 hash; sessions as a hash of a random
  token. Nobody — including the admin — can read a password.

## Profiles, badges and book clubs

- **Sigil.** Everyone picks a mark — a small icon (or their initial) on a colour. It's
  their avatar everywhere, an optional stamp at the foot of their spines, and the seal
  on their library card.
- **Library card.** Clicking a person opens their bookshelf; the sigil at the top of it
  (or your own button, top right) opens their card: a banner (one of nine flowing
  designs in their colour, or a wash from a book cover), bio, stats, favourite genre, what
  they're reading, recent finishes stamped like date-due slips, up to five favourites
  (gold bookmarks on the spines) and their badges and trophies. From the card: open
  their bookshelf, or "You & them".
- **Badges** — 17 in four families (Milestones, Explorer, Devoted reader, Award shelf),
  worked out from the shelf in `docs/app/core/badges.js`. They're pressed into the wood
  of the trophy mantel; hover or tap one to see what it's for. A new badge or trophy gets a moment in the middle of the screen
  with a sound.
- **Book clubs** (the tab): your clubs and your friends side by side. A friend's page
  ("You & them") shows a taste match and why, where you disagree, what you both loved,
  what you've both read, and a buddy read with both your progress. A club has a host,
  a read of the moment with a finish-by date and everyone's progress, a discussion where
  posts from further into the book stay blurred until you click, a vote on the next
  read, the club's shelf of finished reads, a group taste match and a feed.

## Wishlist

- **Owned vs wanted.** "Want to read" is a book you have and haven't read; **Wishlist**
  is one you'd like to buy. Add to the wishlist from the add-a-book search (the fourth
  shelf choice), "+ Wishlist" on suggestions and releases, or "+ My wishlist" when you
  open a book on someone else's shelf. Switch any book between shelves in Edit.
- **Ghost spines.** Wishlist books stand among your to-read books as see-through
  outlines in their series colour. Unreleased ones carry a small date tag. Arrange →
  Wishlist hides them. They don't count in your stats, badges or series progress.
- **Opened**, a wishlist book shows when it comes out and where to buy (or pre-order) it.
  The owner gets "I've got it — move to To read".
- **"I'll buy this for them."** Anyone who can see the shelf can reserve a wishlist book
  (one person per book). Their sigil goes on the foot of the ghost, so no one buys it
  twice; the owner sees it too. It clears when the book leaves the wishlist.

## Setup

1. **Hardcover token** — sign up, then Settings → API. Put it in `.env` as
   `HARDCOVER_API_TOKEN=…` (gitignored; **this repo is public — never commit a token**).
2. **GitHub Pages** — Settings → Pages → source `main`, folder `/docs`.
3. **The API** — in `api/`: `npx wrangler d1 create bookshelf` (put the id in
   `wrangler.toml`), `npx wrangler d1 execute bookshelf --remote --file=schema.sql` (an existing database
   from before profiles also needs `--file=migrate-002-profiles.sql` first),
   `npx wrangler secret put HARDCOVER_TOKEN`, `npx wrangler secret put SERVICE_KEY`,
   then `npx wrangler deploy`, and put its URL in `docs/site.json` as `apiUrl`.
4. **The nightly check** — repo Settings → Secrets and variables → Actions: secrets
   `HARDCOVER_API_TOKEN` and `SERVICE_KEY` (the same key as the API's), and a variable
   `BOOKSHELF_API` with the API's URL.

The nightly check (`src/run-check-api.js`) goes through the shelves one at a time,
each in a minute of its own, and fetches a series or author only on the first turn
that needs it that night — so twenty people never come near Hardcover's 60 calls a
minute. Each person is also held to 40 lookups a minute while using the site.

## Layout

```
docs/app/core/    shared by the browser, the API and the watcher — hardcover, model, diff engine
docs/app/ui/      the website
api/              the accounts API (Cloudflare Worker + D1): auth, shelves, friends, clubs, admin
src/              run-check-api.js (the nightly watcher), serve.js (local dev)
tools/            the shelf migration and the room-art generator
test/             tests
```

`docs/app/core/` is imported unchanged by the browser, the API and Node, which is why
the rules that decide what gets announced exist in exactly one place.

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
