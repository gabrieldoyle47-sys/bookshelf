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

  const authors = (hit.authors ?? []).map((a) => (typeof a === 'string' ? { id: null, name: a } : a));

  return {
    id: `hc:${hit.id}`,
    hardcoverId: String(hit.id),
    title: hit.title,
    authors,
    series: hit.series ?? null,
    pages: hit.pages ?? null,
    released: hit.releaseDate ?? null,
    releaseYear: hit.releaseYear ?? null,
    cover: hit.image ?? null,
    slug: hit.slug ?? null,

    status,
    rating,
    note,

    added: today(),
    started: null,
    finished: null,
  };
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
export function setStatus(book, status, { rating, note } = {}) {
  if (!STATUSES.includes(status)) throw new Error(`Unknown status: ${status}`);
  book.status = status;
  if (rating !== undefined) book.rating = rating;
  if (note !== undefined) book.note = note;
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
