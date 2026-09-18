#!/usr/bin/env node
/**
 * Bookshelf CLI — the fast path for adding and updating books.
 *
 * Writes exactly the same files the web app does, so the two are
 * interchangeable; use whichever is closer to hand.
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createClient, searchBooks } from '../docs/app/core/hardcover.js';
import {
  bookFromHardcover, findBook, matchBooks, setStatus,
  deriveWatchlist, setWatchOverride, today, STATUSES,
} from '../docs/app/core/model.js';
import { upcomingFrom } from '../docs/app/core/watch.js';
import * as store from './store.js';

/* ------------------------------------------------------------- arg parsing */

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [key, inline] = a.slice(2).split('=');
      if (inline !== undefined) flags[key] = inline;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[key] = argv[++i];
      else flags[key] = true;
    } else positional.push(a);
  }
  return { flags, positional };
}

/* ------------------------------------------------------------------ output */

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

const stars = (n) => (typeof n === 'number' ? '★'.repeat(n) + '☆'.repeat(5 - n) : c.dim('unrated'));

function describe(hit) {
  const who = hit.authors?.map((a) => (typeof a === 'string' ? a : a.name)).join(', ') || 'unknown';
  const year = hit.releaseYear ? ` (${hit.releaseYear})` : '';
  const series = hit.series?.name
    ? c.dim(`  ${hit.series.name}${hit.series.position != null ? ` #${hit.series.position}` : ''}`)
    : '';
  return `${c.bold(hit.title)} — ${who}${year}${series}`;
}

/* ------------------------------------------------------------------ picker */

/**
 * Show candidates and let the user choose. Non-interactive callers (and
 * --yes) take the top match, since there's no TTY to prompt on.
 */
async function pick(hits, { auto = false } = {}) {
  if (!hits.length) return null;
  if (auto || !stdin.isTTY) return hits[0];
  if (hits.length === 1) return hits[0];

  console.log();
  hits.forEach((h, i) => console.log(`  ${c.bold(String(i + 1))}. ${describe(h)}`));
  console.log(`  ${c.dim('0. none of these')}`);

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question(`\nWhich one? ${c.dim('[1]')} `)).trim();
    if (answer === '0') return null;
    const idx = answer === '' ? 0 : Number(answer) - 1;
    return Number.isInteger(idx) && hits[idx] ? hits[idx] : null;
  } finally {
    rl.close();
  }
}

async function ask(question, fallback = '') {
  if (!stdin.isTTY) return fallback;
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim() || fallback;
  } finally {
    rl.close();
  }
}

/* ----------------------------------------------------------------- profile */

async function resolveProfile(flags) {
  const { profiles } = await store.loadProfiles();
  if (!profiles.length) {
    throw new Error('No profiles yet. Create one with:  books profile add <id> "<Display Name>"');
  }
  const wanted = flags.profile ?? process.env.BOOKSHELF_PROFILE ?? profiles[0].id;
  const found = profiles.find((p) => p.id === wanted);
  if (!found) {
    throw new Error(`No such profile "${wanted}". Known: ${profiles.map((p) => p.id).join(', ')}`);
  }
  return found;
}

/** Resolve a title the user typed to a book already on their shelf. */
function resolveOwned(library, query) {
  const matches = matchBooks(library, query);
  if (!matches.length) throw new Error(`Nothing on your shelf matches "${query}".`);
  if (matches.length > 1) {
    const list = matches.map((b) => `  - ${b.title}`).join('\n');
    throw new Error(`"${query}" matches ${matches.length} books:\n${list}\nBe more specific.`);
  }
  return matches[0];
}

/* ---------------------------------------------------------------- commands */

async function cmdAdd(args, flags, status) {
  const query = args.join(' ');
  if (!query) throw new Error(`Usage: books ${status === 'tbr' ? 'add' : status} "<title>"`);

  const token = await store.loadToken();
  if (!token) throw new Error('No Hardcover token. Put HARDCOVER_API_TOKEN=... in .env');

  const gql = createClient(token);
  const profile = await resolveProfile(flags);

  process.stdout.write(c.dim(`Searching Hardcover for "${query}"…\n`));
  const hits = await searchBooks(gql, query);
  if (!hits.length) throw new Error(`Hardcover has no match for "${query}".`);

  const chosen = await pick(hits, { auto: flags.yes === true });
  if (!chosen) return console.log(c.dim('Nothing added.'));

  // The search index already carries the exact release date, series id and
  // author ids, so no follow-up request is needed. That matters: the API
  // allows a burst of only 10 calls.
  const library = await store.loadLibrary(profile.id);
  if (findBook(library, `hc:${chosen.id}`)) {
    return console.log(c.yellow(`Already on ${profile.name}'s shelf: ${chosen.title}`));
  }

  const rating = flags.rating != null && flags.rating !== true ? Number(flags.rating) : null;
  const book = bookFromHardcover(chosen, {
    status,
    rating,
    note: typeof flags.note === 'string' ? flags.note : '',
  });
  library.books.push(book);
  await store.saveLibrary(profile.id, library);

  console.log(`\n${c.green('✓')} ${describe(book)}`);
  console.log(`  ${c.dim(`status: ${status} · profile: ${profile.name}`)}`);
  reportWatch(library, book);
}

async function cmdStatus(args, flags, status) {
  const query = args.join(' ');
  if (!query) throw new Error(`Usage: books ${status} "<title>"`);

  const profile = await resolveProfile(flags);
  const library = await store.loadLibrary(profile.id);
  const book = resolveOwned(library, query);

  let rating = flags.rating != null && flags.rating !== true ? Number(flags.rating) : undefined;
  let note = typeof flags.note === 'string' ? flags.note : undefined;

  // Finishing is the one moment worth asking a question — and only about the
  // two things we can't derive. Dates are never asked for.
  if (status === 'read' && rating === undefined && stdin.isTTY && !flags.yes) {
    const answer = await ask(`Rating for ${c.bold(book.title)} 1-5 ${c.dim('(enter to skip)')} `);
    if (answer) rating = Number(answer);
    if (note === undefined) {
      const n = await ask(`A note? ${c.dim('(enter to skip)')} `);
      if (n) note = n;
    }
  }

  setStatus(book, status, { rating, note });
  await store.saveLibrary(profile.id, library);

  console.log(`${c.green('✓')} ${c.bold(book.title)} → ${status}${rating ? `  ${stars(rating)}` : ''}`);
  reportWatch(library, book);
}

/** Explain any watchlist consequence, so the automation is never a mystery. */
function reportWatch(library, book) {
  const watch = deriveWatchlist(library);
  if (book.series?.id) {
    const watching = Boolean(watch.series[book.series.id]);
    console.log(c.dim(`  series "${book.series.name}" ${watching ? 'is being watched' : 'is not watched'}`));
  }
  const authors = (book.authors ?? []).filter((a) => a.id && watch.authors[a.id]);
  if (authors.length) console.log(c.dim(`  also watching author: ${authors.map((a) => a.name).join(', ')}`));
}

async function cmdDates(args, flags) {
  const query = args.join(' ');
  const profile = await resolveProfile(flags);
  const library = await store.loadLibrary(profile.id);
  const book = resolveOwned(library, query);

  if (flags.started) book.started = flags.started === true ? today() : flags.started;
  if (flags.finished) book.finished = flags.finished === true ? today() : flags.finished;
  if (flags.clear) book.started = book.finished = null;

  await store.saveLibrary(profile.id, library);
  console.log(`${c.green('✓')} ${book.title}: started ${book.started ?? c.dim('—')}, finished ${book.finished ?? c.dim('—')}`);
}

async function cmdList(args, flags) {
  const profile = await resolveProfile(flags);
  const library = await store.loadLibrary(profile.id);
  const wanted = typeof flags.status === 'string' ? flags.status : null;
  const books = library.books.filter((b) => !wanted || b.status === wanted);

  if (!books.length) return console.log(c.dim('Nothing here yet.'));
  console.log(c.bold(`\n${profile.name} — ${books.length} book${books.length === 1 ? '' : 's'}\n`));

  for (const status of STATUSES) {
    const group = books.filter((b) => b.status === status);
    if (!group.length) continue;
    console.log(c.bold(`  ${status}`));
    for (const b of group) {
      const rating = b.rating ? `  ${stars(b.rating)}` : '';
      console.log(`    ${b.title}${c.dim(` — ${b.authors.map((a) => a.name).join(', ')}`)}${rating}`);
    }
    console.log();
  }
}

async function cmdUpcoming(args, flags) {
  const profile = await resolveProfile(flags);
  const library = await store.loadLibrary(profile.id);
  const state = await store.loadSeriesState();
  const watch = deriveWatchlist(library);
  const up = upcomingFrom(state, Object.keys(watch.series));

  if (!up.length) {
    return console.log(c.dim('Nothing upcoming yet — run `books check` to fetch series state.'));
  }
  console.log(c.bold(`\nUpcoming for ${profile.name}\n`));
  for (const b of up) {
    const when = b.daysUntil === 0 ? c.green('today') : c.yellow(`${b.daysUntil}d`);
    console.log(`  ${b.releaseDate}  ${when.padEnd(14)} ${c.bold(b.title)} ${c.dim(b.seriesName)}`);
  }
  console.log();
}

async function cmdNext(args, flags) {
  const profile = await resolveProfile(flags);
  const library = await store.loadLibrary(profile.id);
  const tbr = library.books.filter((b) => b.status === 'tbr');
  if (!tbr.length) return console.log(c.dim('TBR is empty.'));

  // A book that continues a series you're already invested in beats a
  // standalone you added on a whim, so surface those first.
  const seriesInProgress = new Set(
    library.books.filter((b) => b.status === 'read' || b.status === 'reading')
      .map((b) => b.series?.id).filter(Boolean));

  const scored = tbr.map((b) => ({
    book: b,
    continues: b.series?.id && seriesInProgress.has(b.series.id),
  })).sort((a, x) => Number(x.continues) - Number(a.continues));

  console.log(c.bold(`\nNext up for ${profile.name}\n`));
  for (const { book, continues } of scored.slice(0, 10)) {
    console.log(`  ${c.bold(book.title)}${continues ? c.green('  ← continues a series you\'re reading') : ''}`);
  }
  console.log();
}

async function cmdStats(args, flags) {
  const profile = await resolveProfile(flags);
  const library = await store.loadLibrary(profile.id);
  const read = library.books.filter((b) => b.status === 'read');
  const rated = read.filter((b) => typeof b.rating === 'number');
  const dated = read.filter((b) => b.finished);
  const pages = read.reduce((sum, b) => sum + (b.pages ?? 0), 0);

  console.log(c.bold(`\n${profile.name}\n`));
  console.log(`  finished      ${read.length}`);
  console.log(`  pages         ${pages.toLocaleString()}`);
  console.log(`  average rating ${rated.length ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(2) : c.dim('—')}`);
  // Dates are optional, so anything derived from them says how thin the data is
  // rather than quietly implying the number covers everything.
  console.log(c.dim(`  ${dated.length} of ${read.length} finished books have dates recorded`));
  console.log();
}

async function cmdWatch(args, flags, watching) {
  const name = args.join(' ');
  const profile = await resolveProfile(flags);
  const library = await store.loadLibrary(profile.id);

  const match = library.books.find((b) => b.series?.name?.toLowerCase().includes(name.toLowerCase()));
  if (!match?.series?.id) throw new Error(`No series on your shelf matches "${name}".`);

  setWatchOverride(library, 'series', match.series.id, match.series.name, watching);
  await store.saveLibrary(profile.id, library);
  console.log(`${c.green('✓')} ${watching ? 'watching' : 'no longer watching'} ${c.bold(match.series.name)}`);
}

async function cmdProfile(args, flags) {
  const [sub, id, ...rest] = args;
  const data = await store.loadProfiles();

  if (sub === 'add') {
    if (!id) throw new Error('Usage: books profile add <id> "<Display Name>" [--colour "#hex"]');
    if (data.profiles.some((p) => p.id === id)) throw new Error(`Profile "${id}" already exists.`);
    const palette = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b'];
    data.profiles.push({
      id,
      name: rest.join(' ') || id,
      colour: typeof flags.colour === 'string' ? flags.colour : palette[data.profiles.length % palette.length],
      lastSeen: null,
    });
    await store.saveProfiles(data);
    await store.saveLibrary(id, { books: [], watch: { series: {}, authors: {} } });
    return console.log(`${c.green('✓')} created profile ${c.bold(id)}`);
  }

  if (!data.profiles.length) return console.log(c.dim('No profiles yet.'));
  for (const p of data.profiles) console.log(`  ${c.bold(p.id.padEnd(12))} ${p.name}  ${c.dim(p.colour)}`);
}

/* -------------------------------------------------------------------- main */

const COMMANDS = {
  add: (a, f) => cmdAdd(a, f, 'tbr'),
  reading: (a, f) => cmdAdd(a, f, 'reading'),
  tbr: (a, f) => cmdAdd(a, f, 'tbr'),
  finish: (a, f) => cmdStatus(a, f, 'read'),
  read: (a, f) => cmdStatus(a, f, 'read'),
  start: (a, f) => cmdStatus(a, f, 'reading'),
  abandon: (a, f) => cmdStatus(a, f, 'abandoned'),
  dates: cmdDates,
  list: cmdList,
  upcoming: cmdUpcoming,
  next: cmdNext,
  stats: cmdStats,
  watch: (a, f) => cmdWatch(a, f, true),
  unwatch: (a, f) => cmdWatch(a, f, false),
  profile: cmdProfile,
};

const HELP = `
${c.bold('bookshelf')}

  books add "<title>"          add to the to-read pile
  books reading "<title>"      add and mark as currently reading
  books start|finish "<t>"     move a book you already have
  books abandon "<title>"
  books dates "<t>" --started 2026-01-02 --finished 2026-01-14    ${c.dim('(optional)')}

  books list [--status read]   books next        books upcoming    books stats
  books watch|unwatch "<series>"
  books profile [add <id> "<Name>"]

  ${c.dim('--profile <id>   act as another profile')}
  ${c.dim('--yes            take the top search match without asking')}
`;

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const [command, ...rest] = positional;

  if (!command || flags.help || command === 'help') return console.log(HELP);
  const handler = COMMANDS[command];
  if (!handler) {
    console.error(c.red(`Unknown command "${command}".`));
    console.log(HELP);
    process.exitCode = 1;
    return;
  }
  await handler(rest, flags);
}

main().catch((err) => {
  console.error(`\n${c.red('✗')} ${err.message}\n`);
  process.exitCode = 1;
});
