/**
 * Badges: little stamps earned by reading, pressed into the wood of the
 * trophy mantel and shown on the library card.
 *
 * Four families: milestones (how much), explorer (how widely), devoted
 * reader (how many by one author), and award shelf (books that won a prize).
 * Each is worked out from the shelf as it is, so nothing has to be stored to
 * know what someone has earned - only which ones they have already been
 * shown, so a new one can be announced (library.badgesSeen).
 *
 * Pure, so it is tested.
 */

import { cleanTags, readOnOf, isAudiobook } from './model.js';

const read = (lib) => (lib?.books ?? []).filter((b) => b.status === 'read');
const pages = (lib) => read(lib).reduce((n, b) => n + (b.pages ?? 0), 0);
const genresOf = (books) => new Set(books.flatMap((b) => cleanTags(b.genres, 3)));
const byAuthor = (lib) => {
  const counts = new Map();
  for (const b of read(lib)) {
    const a = b.authors?.[0];
    if (a) counts.set(a.name, (counts.get(a.name) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
};
const awardCount = (lib, awards) => (awards ? read(lib).filter((b) => awards.has(String(b.hardcoverId))).length : 0);

/**
 * A five-star book in a genre the reader had not finished anything in
 * before it - the "new favourite genre" moment.
 */
function newGenreLove(lib) {
  const done = read(lib).sort((a, b) => String(readOnOf(a) ?? a.added ?? '').localeCompare(String(readOnOf(b) ?? b.added ?? '')));
  const seen = new Set();
  for (const b of done) {
    const g = cleanTags(b.genres, 2);
    if (b.rating >= 5 && seen.size && g.length && g.every((x) => !seen.has(x))) return true;
    for (const x of g) seen.add(x);
  }
  return false;
}

/** Every badge, in the order the mantel shows them. `icon` names a stamp motif (ui/badges.js). */
export const BADGES = [
  // Milestones
  { id: 'first-book', family: 'Milestones', name: 'First chapter', desc: 'Finished a first book', icon: 'book', test: (l) => read(l).length >= 1 },
  { id: 'books-10', family: 'Milestones', name: 'Ten down', desc: 'Finished 10 books', icon: 'ten', test: (l) => read(l).length >= 10 },
  { id: 'books-25', family: 'Milestones', name: 'Quarter century', desc: 'Finished 25 books', icon: 'stack', test: (l) => read(l).length >= 25 },
  { id: 'books-50', family: 'Milestones', name: 'Half a hundred', desc: 'Finished 50 books', icon: 'shelf', test: (l) => read(l).length >= 50 },
  { id: 'books-100', family: 'Milestones', name: 'Centurion', desc: 'Finished 100 books', icon: 'laurel', test: (l) => read(l).length >= 100 },
  { id: 'pages-10k', family: 'Milestones', name: 'Ten thousand pages', desc: 'Read 10,000 pages', icon: 'pages', test: (l) => pages(l) >= 10000 },
  { id: 'pages-50k', family: 'Milestones', name: 'Page mountain', desc: 'Read 50,000 pages', icon: 'mountain', test: (l) => pages(l) >= 50000 },
  { id: 'doorstopper', family: 'Milestones', name: 'Doorstopper', desc: 'Finished a book of 1,000 pages or more', icon: 'door', test: (l) => read(l).some((b) => b.pages >= 1000) },
  // Explorer
  { id: 'genres-5', family: 'Explorer', name: 'Wanderer', desc: 'Read across 5 genres', icon: 'compass', test: (l) => genresOf(read(l)).size >= 5 },
  { id: 'genres-10', family: 'Explorer', name: 'Cartographer', desc: 'Read across 10 genres', icon: 'map', test: (l) => genresOf(read(l)).size >= 10 },
  { id: 'audiobook', family: 'Explorer', name: 'All ears', desc: 'Finished an audiobook', icon: 'headphones', test: (l) => read(l).some(isAudiobook) },
  { id: 'new-love', family: 'Explorer', name: 'New love', desc: 'Gave five stars in a genre new to you', icon: 'heart', test: newGenreLove },
  // Devoted reader
  { id: 'author-3', family: 'Devoted reader', name: 'Getting acquainted', desc: 'Read 3 books by one author', icon: 'quill', test: (l) => byAuthor(l) >= 3 },
  { id: 'author-5', family: 'Devoted reader', name: 'Loyal reader', desc: 'Read 5 books by one author', icon: 'quills', test: (l) => byAuthor(l) >= 5 },
  { id: 'author-10', family: 'Devoted reader', name: 'Devoted', desc: 'Read 10 books by one author', icon: 'crown', test: (l) => byAuthor(l) >= 10 },
  // Award shelf
  { id: 'award-1', family: 'Award shelf', name: 'Prize reader', desc: 'Read a book that won or was shortlisted for a major award', icon: 'medal', test: (l, a) => awardCount(l, a) >= 1 },
  { id: 'award-5', family: 'Award shelf', name: 'Prize collector', desc: 'Read 5 award-winning or shortlisted books', icon: 'medals', test: (l, a) => awardCount(l, a) >= 5 },
];

/** The badges a shelf has earned, in mantel order. `awards` is a Set of Hardcover ids on the award lists. */
export const earnedBadges = (library, awards = null) => BADGES.filter((b) => b.test(library, awards));

/** Earned but not yet announced. */
export function newBadges(library, awards = null) {
  const seen = new Set(library?.badgesSeen ?? []);
  return earnedBadges(library, awards).filter((b) => !seen.has(b.id));
}
