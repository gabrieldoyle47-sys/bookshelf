/**
 * Library data model, status rules, and watchlist derivation.
 *
 * Shared between the browser app and the Node watcher — keep it free of
 * anything platform-specific.
 */

export const STATUSES = ['tbr', 'reading', 'read', 'abandoned'];

/** Ratings at or below this drop the series off the watchlist. */
export const DISLIKE_AT_OR_BELOW = 2;
/** Ratings at or above this start watching the author, not just the series. */
export const AUTHOR_WATCH_AT_OR_ABOVE = 4;

/* --------------------------------------------------------------- text --- */

// Zero-width and formatting characters that carry no meaning in a title but
// survive round-trips and break string comparison. Hardcover's records contain
// them - "A Court of Silver Flames" has a zero-width space after the "A".
const INVISIBLE = /[\u200B-\u200F\u2028\u2029\u2060\uFEFF\u00AD]/g;
// C0 and C1 control characters, never legitimate in a title.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/**
 * Undo Latin-1/UTF-8 double-encoding ("mojibake").
 *
 * Text that has been through a byte-as-character round trip comes back as
 * a run of accented capitals. Re-reading those characters as bytes and
 * decoding them as UTF-8 reverses one layer; repeat until it settles.
 * Decoding strictly (fatal) means only a genuinely valid UTF-8 reading is
 * accepted, so legitimately accented text is left alone.
 */
export function repairMojibake(text) {
  let current = String(text ?? '');
  for (let pass = 0; pass < 4; pass++) {
    // Only characters that could have come from a single byte can be re-read.
    if (!/[\u00C2-\u00C3\u00E2]/.test(current)) break;
    let bytes;
    try {
      bytes = Uint8Array.from(current, (ch) => {
        const code = ch.charCodeAt(0);
        if (code > 0xff) throw new Error('not byte-sized');
        return code;
      });
    } catch {
      break;
    }
    let decoded;
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      break; // not double-encoded after all
    }
    if (decoded === current) break;
    current = decoded;
  }
  return current;
}

/**
 * Normalise text coming from an external source: repair double-encoding, drop
 * invisible and control characters, put accents into one canonical form so two
 * spellings of a title compare equal, and collapse stray whitespace.
 */
export function cleanText(text) {
  if (text == null) return text === undefined ? undefined : null;
  return repairMojibake(String(text))
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(CONTROL, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* --------------------------------------------------------------- tags --- */

/**
 * Hardcover's genre and mood lists are crowd-sourced, so they are a mix of
 * real genres, reading-shelf names ("did-not-finish"), formats ("audiobook")
 * and occasionally several genres joined with semicolons. Filter the noise out
 * rather than charting it.
 */
const TAG_NOISE = new Set([
  // shelf names people use as tags
  'did-not-finish', 'dnf', 'to-read', 'currently-reading', 'read', 'owned', 'own',
  'favorites', 'favourites', 'wishlist', 'wish-list', 'abandoned', 're-read', 'reread',
  'tbr', 'series', 'default', 'all', 'books', 'book',
  // formats
  'audiobook', 'audible', 'ebook', 'e-book', 'kindle', 'paperback', 'hardcover',
  'hardback', 'library', 'physical',
  // too broad to say anything
  'fiction', 'non-fiction', 'nonfiction', 'novel', 'novels', 'general', 'literature',
  'adult', 'books-i-own',
]);

/** Split, trim, de-duplicate and drop the noise. Order is preserved. */
export function cleanTags(list, limit = 6) {
  const out = [];
  const seen = new Set();
  for (const raw of list ?? []) {
    // A single entry is sometimes "Epic; Action & Adventure; Historical".
    for (const part of String(raw).split(/[;,]/)) {
      const value = cleanText(part);
      if (!value || value.length > 40) continue;
      const key = value.toLowerCase();
      if (TAG_NOISE.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(value);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Count tag frequency across books, most common first. */
export function tagCounts(books, field = 'genres') {
  const counts = new Map();
  for (const book of books) {
    for (const tag of book[field] ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** ISO date (YYYY-MM-DD) for "today", in local time rather than UTC. */
export function today(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Build a library record from a Hardcover search hit or book detail.
 *
 * Everything derived from Hardcover is filled in here; the only fields the
 * human ever supplies are `status`, `rating` and `note`. `started`/`finished`
 * are deliberately null — we never prompt for dates, they are opt-in extras
 * the user can fill later from the book's detail panel.
 */
export function bookFromHardcover(hit, { status = 'tbr', rating = null, note = '' } = {}) {
  if (!STATUSES.includes(status)) throw new Error(`Unknown status: ${status}`);

  // Everything from Hardcover goes through cleanText: their records contain
  // zero-width characters and occasional mis-encoded text, and left alone those
  // corrupt further on every save.
  const authors = (hit.authors ?? [])
    .map((a) => (typeof a === 'string' ? { id: null, name: a } : a))
    .map((a) => ({ ...a, name: cleanText(a.name) }));

  const book = {
    id: `hc:${hit.id}`,
    hardcoverId: String(hit.id),
    title: cleanText(hit.title),
    authors,
    series: hit.series ? { ...hit.series, name: cleanText(hit.series.name) } : null,
    pages: hit.pages ?? null,
    released: hit.releaseDate ?? null,
    releaseYear: hit.releaseYear ?? null,
    cover: hit.image ?? null,
    slug: hit.slug ?? null,
    genres: cleanTags(hit.genres, 6),
    moods: cleanTags(hit.moods, 5),

    status,
    rating,
    note,

    added: today(),
    // When it was read, at whatever precision the reader actually remembers:
    // "2026", "2026-03", or "2026-03-14". See readOn helpers below.
    readOn: null,
    started: null,
    finished: null,
  };

  // Adding a book straight onto "reading" or "finished" is a status change
  // like any other, so it gets the same dates.
  return applyStatusDates(book, null);
}

export function emptyLibrary() {
  return { books: [], watch: { series: {}, authors: {} } };
}

export function findBook(library, id) {
  return library.books.find((b) => b.id === id) ?? null;
}

/**
 * Fuzzy lookup by title, for the CLI where the user types a partial name.
 * Returns every match so the caller can disambiguate rather than guess.
 */
export function matchBooks(library, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact = library.books.filter((b) => b.title.toLowerCase() === q);
  if (exact.length) return exact;
  return library.books.filter((b) => b.title.toLowerCase().includes(q));
}

/**
 * Apply a status change, keeping the optional dates coherent without ever
 * demanding them: we only stamp a date if one is volunteered.
 */
export function setStatus(book, status, { rating, note, now } = {}) {
  if (!STATUSES.includes(status)) throw new Error(`Unknown status: ${status}`);
  const previous = book.status;
  book.status = status;
  if (rating !== undefined) book.rating = rating;
  if (note !== undefined) book.note = note;
  applyStatusDates(book, previous, now);
  return book;
}

/**
 * Record the dates a status change implies.
 *
 * Moving a book to "reading now" stamps the day you started it, and that date
 * survives into the finished record, so a book you actually tracked ends up
 * with both ends of the read without anyone typing a date.
 *
 * Nothing already recorded is ever overwritten: an explicit date the reader
 * set by hand outranks anything inferred, and re-opening a book you had
 * already started keeps the original start date rather than resetting it.
 *
 * A book marked read without ever passing through "reading" gets a finish date
 * only - we genuinely do not know when it was started, and guessing would be
 * worse than leaving it blank.
 */
export function applyStatusDates(book, previousStatus, now = today()) {
  if (book.status === previousStatus) return book;

  if (book.status === 'reading' && !book.started) {
    book.started = now;
  }

  if (book.status === 'read') {
    if (!book.finished) book.finished = now;
    // Keep the simplified read date in step, unless a coarser one was chosen
    // deliberately - "2019" must not be clobbered by today's date.
    if (!isValidReadOn(book.readOn)) book.readOn = book.finished;
  }

  return book;
}

/* ------------------------------------------------------- watchlist rules */

/**
 * Derive the watchlist from the library, then re-apply manual overrides.
 *
 * This is recomputed from scratch on every change rather than mutated
 * incrementally, so the rules can never drift out of sync with the shelf.
 *
 * Rules:
 *   - reading or finishing a book  → watch its series
 *   - rating <= 2, or abandoning   → drop that series
 *   - rating >= 4                  → also watch the author
 *   - explicit watch/unwatch always wins
 */
export function deriveWatchlist(library) {
  const series = new Map();
  const authors = new Map();

  // Two passes, because a single pass is order-dependent: whether a dislike
  // suppressed a series would depend on whether the disliked book happened to
  // sit before or after the liked one in the array. Collect the vetoes first,
  // then add only what survives them.
  const vetoed = new Set();
  for (const book of library.books) {
    if (!book.series?.id) continue;
    const disliked =
      book.status === 'abandoned' ||
      (typeof book.rating === 'number' && book.rating <= DISLIKE_AT_OR_BELOW);
    if (disliked) vetoed.add(book.series.id);
  }

  for (const book of library.books) {
    if (book.series?.id && !vetoed.has(book.series.id)) {
      const engaged = book.status === 'reading' || book.status === 'read';
      if (engaged && !series.has(book.series.id)) {
        series.set(book.series.id, { id: book.series.id, name: book.series.name, reason: 'auto' });
      }
    }

    // Author watching is deliberately not vetoed the same way. Giving up on one
    // book by someone whose other work you rated 5 says nothing about whether
    // you want to hear about their next one.
    const loved = typeof book.rating === 'number' && book.rating >= AUTHOR_WATCH_AT_OR_ABOVE;
    if (loved) {
      for (const a of book.authors ?? []) {
        if (a.id && !authors.has(a.id)) {
          authors.set(a.id, { id: a.id, name: a.name, reason: 'auto' });
        }
      }
    }
  }

  const overrides = library.watch ?? { series: {}, authors: {} };
  applyOverrides(series, overrides.series);
  applyOverrides(authors, overrides.authors);

  return {
    series: Object.fromEntries(series),
    authors: Object.fromEntries(authors),
  };
}

function applyOverrides(map, overrides = {}) {
  for (const [id, override] of Object.entries(overrides)) {
    if (override.watching === false) map.delete(id);
    else if (override.watching === true) {
      map.set(id, { id, name: override.name ?? map.get(id)?.name ?? id, reason: 'manual' });
    }
  }
}

/** Record an explicit watch/unwatch that survives recomputation. */
export function setWatchOverride(library, kind, id, name, watching) {
  library.watch ??= { series: {}, authors: {} };
  library.watch[kind] ??= {};
  library.watch[kind][id] = { watching, name };
  return library;
}

/* ------------------------------------------------------------------ misc */

/** Union of every profile's watchlist, so each series is fetched only once. */
export function unionWatchlists(profiles) {
  const series = new Map();
  const authors = new Map();
  for (const [profileId, library] of Object.entries(profiles)) {
    const w = deriveWatchlist(library);
    for (const [id, s] of Object.entries(w.series)) {
      if (!series.has(id)) series.set(id, { ...s, watchers: [] });
      series.get(id).watchers.push(profileId);
    }
    for (const [id, a] of Object.entries(w.authors)) {
      if (!authors.has(id)) authors.set(id, { ...a, watchers: [] });
      authors.get(id).watchers.push(profileId);
    }
  }
  return { series: [...series.values()], authors: [...authors.values()] };
}

/* ------------------------------------------------------------ read dates */

/**
 * When a book was read, at whatever precision is known.
 *
 * Stored as a partial ISO date: "2026", "2026-03" or "2026-03-14". Partial
 * ISO dates sort correctly as plain strings and never imply a precision the
 * reader did not actually claim — which matters, because most books were read
 * long before anyone thought to log them.
 */
export const READ_PRECISION = ['year', 'month', 'day'];

export function precisionOf(readOn) {
  if (!readOn) return null;
  const parts = String(readOn).split('-');
  return parts.length === 1 ? 'year' : parts.length === 2 ? 'month' : 'day';
}

export function isValidReadOn(readOn) {
  return typeof readOn === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(readOn);
}

/**
 * The best available answer for when a book was read. Falls back to the exact
 * finish date, so books logged before this field existed still group correctly.
 */
export function readOnOf(book) {
  if (isValidReadOn(book.readOn)) return book.readOn;
  if (book.finished) return String(book.finished).slice(0, 10);
  return null;
}

export function readYearOf(book) {
  const value = readOnOf(book);
  return value ? Number(value.slice(0, 4)) : null;
}

/** Narrow a readOn to a given precision, e.g. "2026-03-14" -> "2026-03". */
export function coarsen(readOn, precision) {
  if (!readOn) return null;
  const length = precision === 'year' ? 4 : precision === 'month' ? 7 : 10;
  return String(readOn).slice(0, length);
}
