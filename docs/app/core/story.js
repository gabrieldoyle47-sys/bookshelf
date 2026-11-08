/**
 * The numbers behind the year story (ui/story.js): which days had a book
 * open, how taste moved through the year, personal records, and where the
 * authors come from.
 *
 * Pure, so it is tested. Like the recap, it only claims what the dates
 * support: a book with only a finish date counts that one day, not a guess at
 * when it was begun.
 */

import { readOnOf, readYearOf, cleanTags, audioHours } from './model.js';

const DAY = 864e5;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const exact = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.slice(0, 10)) ? v.slice(0, 10) : null);

/** Books finished in a year, in the order they were finished. */
export const finishedIn = (library, year) => (library?.books ?? [])
  .filter((b) => b.status === 'read' && readYearOf(b) === Number(year))
  .sort((a, b) => String(readOnOf(a)).localeCompare(String(readOnOf(b))));

/**
 * Every day of the year with a book open: from its start date to its finish
 * date where both are known, otherwise just the day it was finished. Also
 * counts a book still being read, from its start to today.
 */
export function readingDays(library, year, now = new Date().toISOString().slice(0, 10)) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const days = new Map();
  const mark = (a, b) => {
    const start = Math.max(Date.parse(a), Date.parse(from));
    const end = Math.min(Date.parse(b), Date.parse(to));
    for (let t = start; t <= end; t += DAY) days.set(iso(t), (days.get(iso(t)) ?? 0) + 1);
  };
  for (const b of library?.books ?? []) {
    const started = exact(b.started);
    const finished = b.status === 'read' ? exact(b.finished) ?? exact(readOnOf(b)) : null;
    if (started && finished && finished >= started) mark(started, finished);
    else if (finished) mark(finished, finished);
    else if (b.status === 'reading' && started) mark(started, now);
  }
  return days;
}

/** The longest run of consecutive days in a set of ISO dates. */
export function longestStreak(days) {
  const sorted = [...days.keys()].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of sorted) {
    run = prev && Date.parse(d) - Date.parse(prev) === DAY ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

// Tags too broad to say anything about a change in taste.
const UMBRELLA = /^(fiction|fantasy|young adult|adult|science fiction & fantasy|literature & fiction|adventure|action & adventure|teen & young adult|young adult fiction)$/i;

/** Each month's leading genre among the books finished in it (months with a known month only). */
export function tasteByMonth(books) {
  return Array.from({ length: 12 }, (_, i) => {
    const inMonth = books.filter((b) => Number(String(readOnOf(b) ?? '').slice(5, 7)) === i + 1);
    const counts = new Map();
    for (const b of inMonth) for (const g of cleanTags(b.genres, 6).filter((x) => !UMBRELLA.test(x)).slice(0, 2)) counts.set(g, (counts.get(g) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return { month: i + 1, count: inMonth.length, genre: top?.[0] ?? null };
  });
}

/** Personal bests for the year: fastest read, longest book, best month, listening. */
export function records(books) {
  const timed = books
    .filter((b) => exact(b.started) && exact(b.finished) && b.pages && b.finished >= b.started)
    .map((b) => ({ book: b, days: Math.round((Date.parse(b.finished) - Date.parse(b.started)) / DAY) + 1 }))
    .map((x) => ({ ...x, perDay: Math.round(x.book.pages / x.days) }));
  const fastest = [...timed].sort((a, b) => b.perDay - a.perDay)[0] ?? null;
  const longest = [...books].filter((b) => b.pages).sort((a, b) => b.pages - a.pages)[0] ?? null;
  const months = tasteByMonth(books);
  const peak = Math.max(0, ...months.map((m) => m.count));
  const bestMonth = peak > 1 ? months.find((m) => m.count === peak) : null;
  const listening = books.reduce((n, b) => n + audioHours(b), 0);
  return { fastest, longest, bestMonth, listening: Math.round(listening * 10) / 10 };
}

/* ---------------------------------------------------------------- passport */

const ALIASES = new Map(Object.entries({
  usa: 'United States', us: 'United States', 'u.s.': 'United States', 'u.s.a.': 'United States', 'united states of america': 'United States', america: 'United States',
  uk: 'United Kingdom', 'u.k.': 'United Kingdom', england: 'United Kingdom', scotland: 'United Kingdom', wales: 'United Kingdom', 'great britain': 'United Kingdom', britain: 'United Kingdom', 'northern ireland': 'United Kingdom',
  québec: 'Canada', quebec: 'Canada', ontario: 'Canada', 'british columbia': 'Canada', alberta: 'Canada',
}));
// US states, so "Lincoln, Nebraska" still lands in the right country.
const STATES = new Set(['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia',
  'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan',
  'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york',
  'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota',
  'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming']);

/** The country in a free-text author location ("Utah, USA" → "United States"), or null. */
export function countryOf(location) {
  if (!location) return null;
  const parts = String(location).split(/[,/]/).map((p) => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last) return null;
  const key = last.toLowerCase().replace(/\s+/g, ' ');
  if (ALIASES.has(key)) return ALIASES.get(key);
  if (STATES.has(key)) return 'United States';
  return last.length > 1 && last.length < 40 ? last.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
}

/** Stamps: one per country, with the authors from it. */
export function passport(authors) {
  const byCountry = new Map();
  for (const a of authors) {
    const c = countryOf(a.location);
    if (!c) continue;
    if (!byCountry.has(c)) byCountry.set(c, []);
    byCountry.get(c).push(a.name);
  }
  return [...byCountry.entries()].map(([country, names]) => ({ country, authors: names }))
    .sort((a, b) => b.authors.length - a.authors.length || a.country.localeCompare(b.country));
}
