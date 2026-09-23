/**
 * Year in books: what a year of reading adds up to.
 *
 * Pure, so it can be tested without a browser. It only ever counts books
 * with a read date in the year, and says how many finished books it could
 * not place - a recap that quietly ignored a third of the shelf would look
 * like a thin year rather than a partly-dated one.
 */

import { readOnOf, readYearOf, tagCounts } from './model.js';

/** Years that have at least one dated finished book, newest first. */
export function recapYears(library) {
  const years = new Set();
  for (const b of library.books ?? []) {
    if (b.status === 'read' && readYearOf(b)) years.add(readYearOf(b));
  }
  return [...years].sort((a, b) => b - a);
}

export function yearInBooks(library, year) {
  const all = library.books ?? [];
  const books = all
    .filter((b) => b.status === 'read' && readYearOf(b) === Number(year))
    .sort((a, b) => String(readOnOf(a)).localeCompare(String(readOnOf(b))));
  const undated = all.filter((b) => b.status === 'read' && !readOnOf(b)).length;

  const withPages = books.filter((b) => b.pages);
  const rated = books.filter((b) => typeof b.rating === 'number' && b.rating > 0);
  const byLength = [...withPages].sort((a, b) => b.pages - a.pages);

  // Top author by books read; ties go to the higher average rating.
  const authors = new Map();
  for (const b of books) {
    for (const a of b.authors ?? []) {
      const entry = authors.get(a.name) ?? { name: a.name, count: 0, ratings: [] };
      entry.count++;
      if (typeof b.rating === 'number') entry.ratings.push(b.rating);
      authors.set(a.name, entry);
    }
  }
  const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const topAuthor = [...authors.values()]
    .sort((a, b) => b.count - a.count || avg(b.ratings) - avg(a.ratings))[0] ?? null;

  const series = new Map();
  for (const b of books) {
    if (!b.series?.id) continue;
    const entry = series.get(b.series.id) ?? { name: b.series.name, count: 0 };
    entry.count++;
    series.set(b.series.id, entry);
  }
  const topSeries = [...series.values()].sort((a, b) => b.count - a.count)[0] ?? null;

  // Only books dated to a month can say anything about the shape of the year.
  const monthly = books.filter((b) => String(readOnOf(b)).length >= 7);
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    count: monthly.filter((b) => Number(String(readOnOf(b)).slice(5, 7)) === i + 1).length,
  }));
  // Ties are common with a handful of books a month, and naming only the
  // first of three equal months would be a small lie.
  const peak = Math.max(0, ...months.map((m) => m.count));
  const busiest = monthly.length >= 3 && peak > 1
    ? { count: peak, months: months.filter((m) => m.count === peak).map((m) => m.month) }
    : null;

  const topRating = rated.length ? Math.max(...rated.map((b) => b.rating)) : null;

  return {
    year: Number(year),
    books,
    count: books.length,
    undated,
    pages: withPages.reduce((s, b) => s + b.pages, 0),
    pagesKnown: withPages.length,
    averageRating: rated.length ? avg(rated.map((b) => b.rating)) : null,
    rated: rated.length,
    longest: byLength[0] ?? null,
    shortest: byLength.length > 1 ? byLength[byLength.length - 1] : null,
    favourites: topRating ? rated.filter((b) => b.rating === topRating) : [],
    topRating,
    topAuthor: topAuthor && topAuthor.count > 1 ? topAuthor : null,
    topSeries: topSeries && topSeries.count > 1 ? topSeries : null,
    genres: tagCounts(books, 'genres').slice(0, 3),
    months: monthly.length >= 3 ? months : null,
    busiest,
    // First and last only mean something when the dates are precise enough to
    // order them - two books both dated just "2026" have no first.
    first: monthly.length >= 2 ? monthly[0] : null,
    last: monthly.length >= 2 ? monthly[monthly.length - 1] : null,
  };
}
