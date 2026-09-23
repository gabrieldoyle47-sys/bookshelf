/**
 * Hardcover GraphQL client.
 *
 * Shared verbatim between the browser app and the Node watcher — it uses only
 * `fetch`, which both provide. Do not import anything Node-specific here.
 *
 * API docs: https://docs.hardcover.app/api/getting-started/
 */

const ENDPOINT = 'https://api.hardcover.app/v1/graphql';

/** Last seen rate-limit state, for callers that want to back off politely. */
export const rateLimit = { remaining: null, dailyRemaining: null, resetAt: null };

/**
 * @param {string} token Hardcover API token (from Settings on hardcover.app)
 * @returns {(query: string, variables?: object) => Promise<any>}
 */
export function createClient(token) {
  if (!token) throw new Error('Hardcover API token is required');

  return async function gql(query, variables = {}) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Hardcover tokens are handed out already prefixed with "Bearer ";
        // tolerate both forms so a copy-paste either way works.
        Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    rateLimit.remaining = res.headers.get('x-ratelimit-remaining');
    rateLimit.dailyRemaining = res.headers.get('x-ratelimit-daily-remaining');
    rateLimit.resetAt = res.headers.get('x-ratelimit-reset');

    if (res.status === 429) {
      const retry = res.headers.get('retry-after') || '?';
      throw new Error(`Hardcover rate limit hit; retry after ${retry}s`);
    }
    if (!res.ok) {
      throw new Error(`Hardcover HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    const body = await res.json();
    // GraphQL reports failures in a 200 response, so this check is not optional.
    if (body.errors?.length) {
      throw new Error(`Hardcover GraphQL: ${body.errors.map((e) => e.message).join('; ')}`);
    }
    return body.data;
  };
}

/* ------------------------------------------------------------------ search */

const SEARCH = `
  query Search($q: String!, $perPage: Int!) {
    search(query: $q, query_type: "Book", per_page: $perPage, page: 1) {
      results
    }
  }
`;

/**
 * Search books by title. One round-trip gives us everything the picker shows
 * *and* everything we store, because Hardcover's Typesense index carries
 * series membership and position inline.
 *
 * @returns {Promise<Array<object>>} normalised candidates, best match first
 */
export async function searchBooks(gql, query, perPage = 8) {
  const data = await gql(SEARCH, { q: query, perPage });
  const hits = data?.search?.results?.hits ?? [];
  return hits.map((hit) => normaliseHit(hit.document));
}

/**
 * Search through the Worker, which holds the Hardcover token server-side.
 * Same results as searchBooks, no token needed in the browser.
 */
export async function searchViaProxy(workerUrl, query, perPage = 8) {
  const res = await fetch(`${workerUrl}/search?q=${encodeURIComponent(query)}&n=${perPage}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Search failed (${res.status})`);
  }
  const data = await res.json();
  return (data?.search?.results?.hits ?? []).map((hit) => normaliseHit(hit.document));
}

/**
 * Flatten a Typesense book document into our own shape.
 *
 * The search index is richer than it looks: it carries the exact release date,
 * series membership *and* author ids inline. That means adding a book costs one
 * request rather than three, which matters — the API allows 60 calls a minute
 * with a burst of only 10.
 */
function normaliseHit(d) {
  // `featured_series` is `{}` (not null) for standalones, so test the nested id
  // rather than the object.
  const fs = d.featured_series;
  const series = fs?.series?.id
    ? {
        id: String(fs.series.id),
        name: fs.series.name ?? d.series_names?.[0] ?? null,
        position: fs.position ?? (d.featured_series_position ?? null),
        booksCount: fs.series.books_count ?? null,
      }
    : null;

  const authors = [];
  const seen = new Set();
  for (const c of d.contributions ?? []) {
    // Cover artists and narrators are contributors too; only actual authors
    // should end up on the author watchlist.
    if (c.contribution && c.contribution !== 'Author') continue;
    const a = c.author;
    if (!a?.id || seen.has(String(a.id))) continue;
    seen.add(String(a.id));
    authors.push({ id: String(a.id), name: a.name });
  }
  // Fall back to the plain name list if contributions were unhelpful, so a book
  // is never author-less on screen just because we can't watch that author.
  if (!authors.length) {
    for (const name of d.author_names ?? []) authors.push({ id: null, name });
  }

  return {
    id: String(d.id),
    title: d.title ?? '(untitled)',
    subtitle: d.subtitle ?? null,
    authors,
    series,
    pages: d.pages ?? null,
    releaseDate: normaliseDate(d.release_date),
    releaseYear: d.release_year ?? null,
    image: d.image?.url ?? null,
    slug: d.slug ?? null,
    rating: d.rating ?? null,
    usersCount: d.users_count ?? 0,
    description: d.description ?? null,
    // Crowd-sourced and messy; model.cleanTags() does the filtering.
    genres: d.genres ?? [],
    moods: d.moods ?? [],
  };
}

/**
 * Hardcover frequently stores "we know the year but not the day" as January 1st.
 * Keep the value (it is still the best guess available) but flag it, so the UI
 * can show "2021" rather than confidently claiming the 1st of January.
 */
export function isPlaceholderDate(date) {
  return typeof date === 'string' && date.endsWith('-01-01');
}

function normaliseDate(value) {
  if (!value || typeof value !== 'string') return null;
  return value.slice(0, 10);
}

/* -------------------------------------------------------------- book detail */

const BOOK_BY_ID = `
  query BookById($id: Int!) {
    books(where: { id: { _eq: $id } }, limit: 1) {
      id
      title
      pages
      release_date
      release_year
      contributions { author { id name } }
      book_series { position series { id name } }
    }
  }
`;

/**
 * Exact detail for one book, including the precise `release_date` that the
 * search index only exposes as a year.
 */
export async function bookById(gql, id) {
  const data = await gql(BOOK_BY_ID, { id: Number(id) });
  const b = data?.books?.[0];
  if (!b) return null;

  const primarySeries = b.book_series?.[0] ?? null;
  return {
    id: String(b.id),
    title: b.title,
    pages: b.pages ?? null,
    releaseDate: b.release_date ?? null,
    releaseYear: b.release_year ?? null,
    authors: (b.contributions ?? [])
      .map((c) => c.author)
      .filter(Boolean)
      .map((a) => ({ id: String(a.id), name: a.name })),
    series: primarySeries?.series
      ? {
          id: String(primarySeries.series.id),
          name: primarySeries.series.name,
          position: primarySeries.position == null ? null : Number(primarySeries.position),
        }
      : null,
  };
}

/* ------------------------------------------------------------------ series */

/**
 * Every book in a series, de-duplicated.
 *
 * The filters here are load-bearing, not defensive tidying. Hardcover's data is
 * librarian-maintained and genuinely contains duplicate and partial records; a
 * naive query returns the same book at the same position more than once, which
 * the watcher would then report as "a new book appeared!" every single day.
 * Per Hardcover's own guidance we keep, for each position, only the
 * most-read non-merged, non-partial, non-compilation edition.
 *
 * https://github.com/hardcoverapp/hardcover-docs/blob/main/src/content/docs/api/guides/GettingBooksInSeries.mdx
 */
const SERIES_BY_ID = `
  query SeriesById($id: Int!) {
    series(where: { id: { _eq: $id } }, limit: 1) {
      id
      name
      books_count
      author { id name }
      book_series(
        distinct_on: position
        order_by: [{ position: asc }, { book: { users_count: desc } }]
        where: {
          book: { canonical_id: { _is_null: true }, is_partial_book: { _eq: false } }
          compilation: { _eq: false }
        }
      ) {
        position
        book { id title release_date release_year image { url } }
      }
    }
  }
`;

/**
 * @returns {Promise<{id:string,name:string,author:object|null,books:Array}|null>}
 */
export async function seriesById(gql, id) {
  const data = await gql(SERIES_BY_ID, { id: Number(id) });
  const s = data?.series?.[0];
  if (!s) return null;

  return {
    id: String(s.id),
    name: s.name,
    author: s.author ? { id: String(s.author.id), name: s.author.name } : null,
    books: (s.book_series ?? [])
      .filter((bs) => bs.book)
      .map((bs) => ({
        bookId: String(bs.book.id),
        position: bs.position == null ? null : Number(bs.position),
        title: bs.book.title,
        releaseDate: bs.book.release_date ?? null,
        releaseYear: bs.book.release_year ?? null,
        image: bs.book.image?.url ?? null,
      })),
  };
}

/* ------------------------------------------------------------------ author */

const AUTHOR_BOOKS = `
  query AuthorBooks($id: Int!, $today: date!) {
    authors(where: { id: { _eq: $id } }, limit: 1) {
      id
      name
      contributions(
        order_by: { book: { users_count: desc } }
        limit: 200
        where: { book: { canonical_id: { _is_null: true } } }
      ) {
        book { id title release_date release_year }
      }
      forthcoming: contributions(
        order_by: { book: { release_date: asc } }
        limit: 40
        where: {
          book: {
            canonical_id: { _is_null: true }
            release_date: { _gt: $today }
            compilation: { _eq: false }
            is_partial_book: { _eq: false }
          }
        }
      ) {
        contribution
        book {
          id title release_date release_year users_count
          image { url }
          book_series { position series { id name } }
        }
      }
    }
  }
`;

/**
 * Everything we know an author has written. This is the hedge against
 * Hardcover not having slotted a new title into its series yet — new books
 * typically show up on the author before the series is updated.
 */
export async function authorBooks(gql, id, today = new Date().toISOString().slice(0, 10)) {
  const data = await gql(AUTHOR_BOOKS, { id: Number(id), today });
  const a = data?.authors?.[0];
  if (!a) return null;

  const seen = new Set();
  const books = [];
  for (const c of a.contributions ?? []) {
    if (!c.book || seen.has(String(c.book.id))) continue;
    seen.add(String(c.book.id));
    books.push({
      bookId: String(c.book.id),
      title: c.book.title,
      releaseDate: c.book.release_date ?? null,
      releaseYear: c.book.release_year ?? null,
    });
  }

  // Forthcoming titles are queried separately rather than picked out of the
  // list above: that list is ordered by popularity and capped, and a book
  // announced last week has almost no readers yet, so it would fall off the
  // end for anyone as prolific as Sanderson.
  const forthcoming = [];
  const seenSoon = new Set();
  for (const c of a.forthcoming ?? []) {
    // Narrators and illustrators are contributors too.
    if (c.contribution && c.contribution !== 'Author') continue;
    if (!c.book || seenSoon.has(String(c.book.id))) continue;
    seenSoon.add(String(c.book.id));
    const bs = c.book.book_series?.[0];
    forthcoming.push({
      bookId: String(c.book.id),
      title: c.book.title,
      releaseDate: c.book.release_date ?? null,
      releaseYear: c.book.release_year ?? null,
      image: c.book.image?.url ?? null,
      usersCount: c.book.users_count ?? 0,
      series: bs?.series
        ? { id: String(bs.series.id), name: bs.series.name, position: bs.position == null ? null : Number(bs.position) }
        : null,
    });
  }
  return { id: String(a.id), name: a.name, books, forthcoming };
}

/* ---------------------------------------------------------- book details */

const BOOKS_BY_IDS = `
  query BooksByIds($ids: [Int!]) {
    books(where: { id: { _in: $ids } }) {
      id title subtitle description pages release_date release_year slug
      users_count rating ratings_count cached_tags
      image { url }
      contributions { contribution author { id name } }
      book_series { position series { id name books_count } }
      default_physical_edition { publisher { name } }
    }
  }
`;

/**
 * Everything Hardcover knows about some books, in the same shape as a search
 * hit - so the result can go straight into bookFromHardcover() - plus the
 * extras a detail panel wants (description, publisher, how many are waiting).
 *
 * Takes a list because tracked books are refreshed together in one call.
 */
export async function booksByIds(gql, ids) {
  const wanted = [...new Set(ids.map(Number).filter(Number.isFinite))];
  if (!wanted.length) return [];
  const data = await gql(BOOKS_BY_IDS, { ids: wanted });
  return (data?.books ?? []).map(normaliseDetail);
}

function normaliseDetail(b) {
  const bs = b.book_series?.[0];
  const tags = (kind) => (b.cached_tags?.[kind] ?? []).map((t) => t.tag).filter(Boolean);
  const authors = [];
  const seen = new Set();
  for (const c of b.contributions ?? []) {
    if (c.contribution && c.contribution !== 'Author') continue;
    if (!c.author?.id || seen.has(String(c.author.id))) continue;
    seen.add(String(c.author.id));
    authors.push({ id: String(c.author.id), name: c.author.name });
  }
  return {
    id: String(b.id),
    title: b.title ?? '(untitled)',
    subtitle: b.subtitle ?? null,
    authors,
    series: bs?.series
      ? {
          id: String(bs.series.id),
          name: bs.series.name,
          position: bs.position == null ? null : Number(bs.position),
          booksCount: bs.series.books_count ?? null,
        }
      : null,
    pages: b.pages ?? null,
    releaseDate: normaliseDate(b.release_date),
    releaseYear: b.release_year ?? null,
    image: b.image?.url ?? null,
    slug: b.slug ?? null,
    rating: b.rating ?? null,
    ratingsCount: b.ratings_count ?? 0,
    usersCount: b.users_count ?? 0,
    description: b.description ?? null,
    publisher: b.default_physical_edition?.publisher?.name ?? null,
    genres: tags('Genre'),
    moods: tags('Mood'),
  };
}

/** Book details through the Worker, which holds the Hardcover token. */
export async function booksViaProxy(workerUrl, ids) {
  const res = await fetch(`${workerUrl}/book?ids=${encodeURIComponent(ids.join(','))}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Could not load book details (${res.status})`);
  }
  return (await res.json()).books ?? [];
}
