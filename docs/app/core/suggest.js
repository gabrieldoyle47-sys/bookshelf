/**
 * "Suggest a book": what to read that is not already in any of your lists.
 *
 * Two halves. tasteProfile() reads a shelf - genres and moods weighted by how
 * much each book was liked, favourite authors, usual length. scoreSuggestions()
 * ranks candidates from Hardcover (popular, well-rated books in the reader's
 * top genres) against that profile, and says why each one was picked, the
 * way Spotify's "Because you listened to…" and Goodreads' recommendations do.
 *
 * Pure: no network, so every rule here is tested.
 */

import { cleanTags, onShelfIds, hiddenIds } from './model.js';

/** How much a finished book says about taste: a 5-star counts most, a dud counts against. */
function weightOf(book) {
  if (book.status === 'abandoned') return -1;
  if (book.status === 'reading') return 1;
  if (book.status !== 'read') return 0;
  const r = book.rating;
  if (typeof r !== 'number' || r <= 0) return 1;
  if (r >= 4.5) return 2.5;
  if (r >= 4) return 2;
  if (r >= 3) return 1;
  return -0.5;
}

export function tasteProfile(library) {
  const genres = new Map();
  const moods = new Map();
  const genreBooks = new Map();
  const authors = new Map();
  const pages = [];
  let count = 0;

  for (const b of library.books ?? []) {
    const w = weightOf(b);
    if (!w) continue;
    if (w > 0) count++;
    for (const g of b.genres ?? []) {
      genres.set(g, (genres.get(g) ?? 0) + w);
      if (w > 0) genreBooks.set(g, (genreBooks.get(g) ?? 0) + 1);
    }
    for (const m of b.moods ?? []) moods.set(m.toLowerCase(), (moods.get(m.toLowerCase()) ?? 0) + w);
    if (b.status === 'read' && b.pages) pages.push(b.pages);
    if (typeof b.rating === 'number' && b.rating >= 4) {
      for (const a of b.authors ?? []) {
        if (!a.id) continue;
        const e = authors.get(a.id) ?? { name: a.name, count: 0, example: b.title };
        e.count++;
        authors.set(a.id, e);
      }
    }
  }
  pages.sort((a, b) => a - b);
  const topGenres = [...genres.entries()].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).map(([g]) => g);
  return {
    genres, moods, genreBooks, authors, count, topGenres,
    medianPages: pages.length ? pages[Math.floor(pages.length / 2)] : null,
  };
}

/**
 * Similarity of a candidate's tags to a weighted taste: cosine, 0 to 1.
 * `rarity` scales each tag by how much it says about a taste: nearly every
 * candidate is "Fantasy", so sharing it says little, while sharing
 * "Romantasy" says a lot.
 */
function similarity(taste, tags, rarity = () => 1) {
  if (!tags.length) return null;
  let dot = 0;
  let norm = 0;
  for (const [t, w] of taste) if (w > 0) norm += (w * rarity(t)) ** 2;
  // Rarity boosts the genres you share; an unshared tag counts the same
  // however niche it is. (Weighting those too buried books with quirky tags
  // like "dual identity" under ones with only common, vague genres.)
  for (const t of tags) {
    const w = taste.get(t) ?? 0;
    if (w > 0) dot += (w * rarity(t)) * rarity(t);
  }
  const tagNorm = Math.sqrt(tags.length) * Math.sqrt([...tags].reduce((m, t) => m + rarity(t) ** 2, 0) / tags.length);
  return norm && tagNorm ? Math.min(1, dot / (Math.sqrt(norm) * tagNorm)) : 0;
}

/** Genres too broad to steer a search on their own. */
const BROAD = new Set(['fantasy', 'science fiction & fantasy', 'fiction', 'young adult', 'adult', 'literature & fiction',
  'adventure', 'action & adventure', 'teen & young adult', 'young adult fiction', 'science fiction']);

/**
 * Rank candidates for one reader.
 *
 * Left out: anything on the shelf, hidden, or already recommended to them;
 * books in a series they are already reading (Next in your series covers
 * those); and later books of a series they have not started - nobody should
 * be told to begin at book four.
 */
export function scoreSuggestions(candidates, library, { limit = 12, perAuthor = 2 } = {}) {
  const profile = tasteProfile(library);
  const have = onShelfIds(library);
  const hidden = hiddenIds(library);
  const pending = new Set((library.recommendations ?? []).filter((r) => r.status === 'new').map((r) => r.bookId));
  const mySeries = new Set((library.books ?? []).map((b) => b.series?.id).filter(Boolean));
  // The same book can come back from several genre searches.
  const unique = [...new Map(candidates.map((c) => [String(c.id), c])).values()];
  const maxUsers = Math.max(1, ...unique.map((c) => c.usersCount ?? 0));
  // Broad umbrella genres say little about a particular taste. A fixed list
  // rather than counting within the candidates: those come from this
  // reader's own searches, which made their least typical genres look rare.
  const rarity = (g) => (BROAD.has(g.toLowerCase()) ? 0.35 : 1);

  const scored = [];
  for (const c of unique) {
    const id = String(c.id);
    if (have.has(id) || hidden.has(id) || pending.has(id)) continue;
    if (c.series?.id && mySeries.has(c.series.id)) continue;
    if (c.series?.position != null && c.series.position > 1) continue;

    // Hardcover lists the most agreed-on tags first; the tail is noise.
    const genres = cleanTags(c.genres, 6);
    const moods = cleanTags(c.moods, 6).map((m) => m.toLowerCase());
    const genre = similarity(profile.genres, genres, rarity) ?? 0;
    const mood = similarity(profile.moods, moods);
    const popularity = Math.log10((c.usersCount ?? 0) + 1) / Math.log10(maxUsers + 1);
    // Shrink a rating built on few votes towards neutral.
    const votes = c.ratingsCount ?? 0;
    const rawQuality = c.rating ? Math.max(0, Math.min(1, (c.rating - 3.5) / 1.2)) : 0.4;
    const quality = votes >= 50 ? rawQuality : 0.4 + (rawQuality - 0.4) * (votes / 50);
    const length = profile.medianPages && c.pages
      ? 1 - Math.min(1, Math.abs(Math.log(c.pages / profile.medianPages)) / Math.log(3)) : 0.5;
    const loved = (c.authors ?? []).map((a) => profile.authors.get(a.id)).find(Boolean) ?? null;

    // Mood data is patchy on Hardcover; when a book has none, its weight
    // goes to genre rather than counting as a mismatch.
    // Fit leads; popularity only breaks ties between similar fits, or every
    // reader is told to read A Game of Thrones.
    const score = (mood == null ? 0.62 * genre : 0.47 * genre + 0.15 * mood)
      + 0.12 * popularity + 0.14 * quality + 0.08 * length + (loved ? 0.1 : 0);

    // The reason names the most telling genre you share, not the most common.
    const shared = genres.filter((g) => (profile.genreBooks.get(g) ?? 0) > 0)
      .sort((a, b) => (profile.genreBooks.get(b) ?? 0) * rarity(b) - (profile.genreBooks.get(a) ?? 0) * rarity(a));
    const reasons = [];
    if (loved) reasons.push(`By ${loved.name}, whose ${loved.example} you rated highly`);
    if (shared.length) {
      const g = shared[0];
      reasons.push(`Because you’ve read ${profile.genreBooks.get(g)} ${g} book${profile.genreBooks.get(g) === 1 ? '' : 's'}`);
    }
    if ((c.usersCount ?? 0) >= 1000) reasons.push(`${Math.round(c.usersCount / 100) / 10}k readers on Hardcover`);
    if (c.series?.position === 1) reasons.push(`Starts ${c.series.name}`);

    scored.push({
      book: c, score, match: Math.min(99, Math.round(score * 100)),
      parts: { genre, mood, popularity, quality, length, loved: Boolean(loved) },
      reasons, sharedGenres: shared.slice(0, 3),
    });
  }

  // Best first, but no more than a couple from any one author - a list of
  // eight Sanderson books is one suggestion, not eight.
  scored.sort((a, b) => b.score - a.score);
  const perAuthorCount = new Map();
  const out = [];
  for (const s of scored) {
    const author = s.book.authors?.[0]?.id ?? s.book.authors?.[0]?.name ?? s.book.id;
    const n = perAuthorCount.get(author) ?? 0;
    if (n >= perAuthor) continue;
    perAuthorCount.set(author, n + 1);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/** Which genres to look in: the reader's strongest few. */
export function discoveryGenres(library, n = 4) {
  // Distinctive genres first; the broad ones only fill in. Searching
  // "Fantasy" alone returns the same famous books for everyone.
  const top = tasteProfile(library).topGenres;
  const specific = top.filter((g) => !BROAD.has(g.toLowerCase()));
  return [...specific, ...top.filter((g) => BROAD.has(g.toLowerCase()))].slice(0, n);
}
