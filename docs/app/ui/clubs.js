/**
 * Book clubs: the place for reading with other people.
 *
 *   #/clubs        your book clubs (left) and your friends (right) - with
 *                  member search, requests and invitations
 *   #/with/<id>    you and one friend: taste match and why, the books you
 *                  have both read and where your ratings part ways, and a
 *                  buddy read
 *   #/club/<id>    a club: its read of the moment with everyone's progress,
 *                  a discussion that hides what you have not reached yet, a
 *                  vote on the next read, its shelf of past reads, the
 *                  members' feed and the group's taste match
 */

import { h, fill, toast, coverEl, fmtAgo, fmtDate, starsEl, authorNames } from './dom.js';
import * as storage from './storage.js';
import { sigilEl, iconSvg, SIGILS, SIGIL_NAMES, SIGIL_COLOURS } from './sigil.js';
import { tasteMatch, readTogether, matchPairs, activity } from '../core/together.js';
import { readingEstimate, today } from '../core/model.js';
import { openCard } from './card.js';
import { emptyArt } from './art.js';

const page = (title, sub, ...actions) => h('div', { class: 'page-head' },
  h('div', {}, h('h1', { text: title }), sub ? h('div', { class: 'sub', text: sub }) : null), h('div', { class: 'spacer' }), actions);

const call = async (path, body, method = 'POST') => {
  try { return await storage.api(path, { method, body }); } catch (err) { toast(err.message, true); return null; }
};

/** An inline book search: type, pick a result. */
function bookSearch(ctx, placeholder, onPick) {
  const input = h('input', { type: 'search', placeholder, 'aria-label': placeholder, class: 'find-input' });
  const results = h('div', { class: 'bs-results' });
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) return fill(results);
      try {
        const hits = await ctx.actions.searchBooks(q, 6);
        fill(results, hits.map((b) => h('button', { class: 'bs-hit', type: 'button', onclick: () => {
          fill(results); input.value = '';
          onPick({ id: b.id, hardcoverId: String(b.id), title: b.title, author: authorNames(b), image: b.image, cover: b.image, pages: b.pages });
        } }, coverEl({ cover: b.image }), h('span', {}, h('strong', { text: b.title }), h('span', { class: 'count', text: ` ${authorNames(b)}` })))));
      } catch (err) { fill(results, h('p', { class: 'hint error', text: err.message })); }
    }, 300);
  });
  return h('div', { class: 'book-search' }, input, results);
}

/** How far someone is through a book: 100 if read, their page if reading, else null. */
function progressIn(library, hardcoverId) {
  const b = (library?.books ?? []).find((x) => String(x.hardcoverId) === String(hardcoverId));
  if (!b) return null;
  if (b.status === 'read') return 100;
  if (b.status === 'reading') return readingEstimate(b, today()).percent ?? 0;
  return 0;
}

const progressRow = (person, pct) => h('div', { class: 'cl-progress' },
  sigilEl(person, { size: 'sm' }), h('span', { class: 'cl-pname', text: person.name }),
  h('span', { class: 'cl-bar' }, h('i', { style: `width:${pct ?? 0}%` })),
  h('span', { class: 'count', text: pct == null ? 'not started' : pct >= 100 ? 'finished' : `${pct}%` }));

/* ================================================================ hub */

export function clubsView(ctx) {
  const left = h('section', { class: 'clubs-col' }, h('p', { class: 'hint', text: 'Loading your clubs…' }));
  const right = h('section', { class: 'friends-col' });
  const root = h('div', { class: 'clubs-page' },
    page('Book clubs', 'Read with your friends — one to one, or in a club.'),
    h('div', { class: 'clubs-columns' }, left, right));

  async function paintClubs() {
    const clubs = await storage.api('/clubs').catch(() => []);
    const mine = clubs.filter((c) => c.status === 'member');
    const invites = clubs.filter((c) => c.status === 'invited');
    fill(left,
      h('div', { class: 'section-head' }, h('h2', { text: 'Your clubs' }),
        h('button', { class: 'btn small', type: 'button', onclick: () => newClub(ctx) }, '+ New club')),
      invites.map((c) => h('div', { class: 'club-invite' }, clubBadge(c),
        h('span', {}, h('strong', { text: c.name }), h('span', { class: 'count', text: ' — you’re invited' })),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', onclick: async () => { if (await call('/club/respond', { id: c.id, accept: true })) { await ctx.actions.reloadFriends(); location.hash = `#/club/${c.id}`; } } }, 'Join'),
          h('button', { class: 'btn secondary small', type: 'button', onclick: async () => { if (await call('/club/respond', { id: c.id, accept: false })) paintClubs(); } }, 'Decline')))),
      mine.length ? h('div', { class: 'club-cards' }, mine.map((c) => h('a', { class: 'club-card', href: `#/club/${c.id}`, style: `--club:${c.colour}` },
        clubBadge(c),
        h('div', {}, h('strong', { text: c.name }),
          h('div', { class: 'count', text: `${c.members.length} member${c.members.length === 1 ? '' : 's'}${c.current?.book ? ` · reading ${c.current.book.title}` : ''}` }),
          c.description ? h('div', { class: 'hint', text: c.description }) : null))))
        : emptyArt('together', 'No clubs yet. Start one and invite your friends.'));
  }

  async function paintFriends() {
    const f = await storage.api('/friends').catch(() => ({ friends: [], incoming: [], outgoing: [] }));
    const me = ctx.state.libraries[ctx.state.me.id]?.books ?? [];
    const results = h('div', { class: 'people-list' });
    const search = h('input', { type: 'search', placeholder: 'Find people by name or username', 'aria-label': 'Find people', class: 'find-input' });
    let timer = null;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = search.value.trim();
        if (!q) return fill(results);
        const people = await storage.api(`/members?q=${encodeURIComponent(q)}`).catch(() => []);
        fill(results, people.length ? people.map((p) => personRow(p, {
          none: h('button', { class: 'btn small', type: 'button', onclick: async (e) => { e.currentTarget.disabled = true; if (await call('/friends/request', { id: p.id })) e.currentTarget.textContent = 'Sent'; } }, 'Add friend'),
          sent: h('span', { class: 'pill', text: 'Request sent' }),
          received: h('button', { class: 'btn small', type: 'button', onclick: async () => { await call('/friends/respond', { id: p.id, accept: true }); await ctx.actions.reloadFriends(); } }, 'Accept'),
          friend: h('span', { class: 'pill', text: 'Friends' }),
        }[p.relation])) : h('p', { class: 'hint', text: 'No members match that.' }));
      }, 250);
    });
    const personRow = (p, actions) => h('div', { class: 'person-row' },
      h('button', { class: 'person-main', type: 'button', onclick: () => { location.hash = `#/p/${p.id}`; } }, sigilEl(p), h('span', {}, h('strong', { text: p.name }), h('span', { class: 'count', text: ` @${p.username}` }))),
      h('div', { class: 'row person-actions' }, actions));
    fill(right,
      h('div', { class: 'section-head' }, h('h2', { text: `Friends${f.friends.length ? ` · ${f.friends.length}` : ''}` })),
      f.incoming.length ? h('div', { class: 'requests' }, h('div', { class: 'k', text: 'Friend requests' }),
        f.incoming.map((p) => personRow(p, [
          h('button', { class: 'btn small', type: 'button', onclick: async () => { await call('/friends/respond', { id: p.id, accept: true }); await ctx.actions.reloadFriends(); } }, 'Accept'),
          h('button', { class: 'btn secondary small', type: 'button', onclick: async () => { await call('/friends/respond', { id: p.id, accept: false }); paintFriends(); } }, 'Decline')]))) : null,
      f.friends.length ? h('div', { class: 'friend-cards' }, f.friends.map((p) => {
        const m = tasteMatch(me, ctx.state.libraries[p.id]?.books ?? []);
        return h('a', { class: 'friend-card', href: `#/with/${p.id}` }, sigilEl(p, { size: 'lg' }),
          h('div', {}, h('strong', { text: p.name }), h('div', { class: 'count', text: `@${p.username}` })),
          h('div', { class: 'fc-match' }, h('strong', { text: `${m.score}%` }), h('span', { text: 'taste match' })));
      })) : h('p', { class: 'hint', text: 'No friends yet — find someone below.' }),
      f.outgoing.length ? h('div', { class: 'requests' }, h('div', { class: 'k', text: 'Waiting for an answer' }),
        f.outgoing.map((p) => personRow(p, h('span', { class: 'pill', text: 'Request sent' })))) : null,
      h('div', { class: 'find-people' }, h('div', { class: 'k', text: 'Find people' }), search, results));
  }

  paintClubs();
  paintFriends();
  return root;
}

function clubBadge(c, size = '') {
  const svg = iconSvg(SIGILS[c.icon] ? c.icon : 'book');
  return h('span', { class: `club-badge ${size}`, style: `--club:${c.colour ?? '#a2461f'}`, 'aria-hidden': 'true' }, svg);
}

/** Start a club, or (with `club`) change its name, look and description. */
function newClub(ctx, club = null) {
  let icon = club?.icon ?? 'book';
  let colour = club?.colour ?? SIGIL_COLOURS[0];
  const name = h('input', { type: 'text', maxlength: '40', required: true, value: club?.name ?? '', placeholder: 'Fantasy Fridays' });
  const desc = h('textarea', { maxlength: '300', rows: '2', placeholder: 'What the club is about (optional)' }, club?.description ?? '');
  const icons = h('div', { class: 'sp-icons' });
  const colours = h('div', { class: 'swatches' });
  const paint = () => {
    fill(icons, Object.entries(SIGIL_NAMES).map(([id, label]) => h('button', { class: 'sp-icon', type: 'button', title: label, 'aria-checked': String(id === icon),
      onclick: () => { icon = id; paint(); } }, clubBadge({ icon: id, colour }, 'sm'))));
    fill(colours, SIGIL_COLOURS.map((c) => h('button', { class: 'swatch', type: 'button', style: `background:${c}`, 'aria-checked': String(c === colour),
      onclick: () => { colour = c; paint(); } })));
  };
  paint();
  const dialog = h('dialog', { class: 'dialog' });
  dialog.append(h('div', { class: 'dialog-head' }, h('h2', { text: club ? 'Edit club' : 'New book club' }),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => dialog.close() }, '✕')),
  h('form', { class: 'dialog-body card-form', onsubmit: async (e) => {
    e.preventDefault();
    const body = { name: name.value, description: desc.value, icon, colour };
    const res = club ? await call('/club/update', { id: club.id, ...body }) : await call('/clubs', body);
    if (!res) return;
    dialog.close();
    location.hash = `#/club/${club?.id ?? res.id}`;
    ctx.actions.rerender();
  } },
    h('label', { class: 'field' }, h('span', { text: 'Name' }), name),
    h('label', { class: 'field' }, h('span', { text: 'About' }), desc),
    h('div', { class: 'field' }, h('span', { text: 'Emblem' }), icons, colours),
    h('div', { class: 'row end' }, h('button', { class: 'btn', type: 'submit' }, club ? 'Save' : 'Start the club'))));
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
  name.focus();
}

/* ======================================================= you & a friend */

export function withView(ctx, friendId) {
  const friend = ctx.state.profiles.find((p) => p.id === friendId);
  const me = ctx.state.profiles.find((p) => p.id === ctx.state.me.id);
  if (!friend || friend.id === me.id) return emptyArt('together', 'This page is for you and a friend.');
  const libs = ctx.state.libraries;
  const mine = libs[me.id]?.books ?? [];
  const theirs = libs[friend.id]?.books ?? [];
  const m = tasteMatch(mine, theirs);
  const common = readTogether(libs, [me.id, friend.id]);
  const debates = common.filter((c) => c.spread >= 1.5).sort((a, b) => b.spread - a.spread).slice(0, 6);
  const agree = common.filter((c) => c.spread === 0 && c.average >= 4).slice(0, 6);

  const genreList = (books) => {
    const counts = new Map();
    for (const b of books.filter((x) => x.status === 'read')) for (const g of (b.genres ?? []).slice(0, 3)) counts.set(g, (counts.get(g) ?? 0) + 1);
    return counts;
  };
  const gm = genreList(mine);
  const gt = genreList(theirs);
  const onlyMe = [...gm.keys()].filter((g) => !gt.has(g)).slice(0, 3);
  const onlyThem = [...gt.keys()].filter((g) => !gm.has(g)).slice(0, 3);
  const authorsOf = (books) => new Set(books.filter((b) => b.status === 'read').map((b) => b.authors?.[0]?.name).filter(Boolean));
  const am = authorsOf(mine);
  const sharedAuthors = [...authorsOf(theirs)].filter((a) => am.has(a)).slice(0, 4);

  const why = [
    m.sharedGenres.length ? `You both read a lot of ${m.sharedGenres.join(', ')}.` : null,
    sharedAuthors.length ? `You both read ${sharedAuthors.join(', ')}.` : null,
    m.bothRead ? `${m.bothRead} book${m.bothRead === 1 ? '' : 's'} read by both of you${m.agreement != null ? `, rated ${m.agreement}% alike` : ''}.` : 'No books in common yet.',
    onlyMe.length ? `Only you: ${onlyMe.join(', ')}.` : null,
    onlyThem.length ? `Only ${friend.name}: ${onlyThem.join(', ')}.` : null,
  ].filter(Boolean);

  const ratingRow = (c) => h('div', { class: 'cmp-row' }, coverEl(c.book),
    h('div', { class: 'book-main' }, h('div', { class: 'book-title', text: c.book.title }), h('div', { class: 'book-meta', text: authorNames(c.book) })),
    h('div', { class: 'cmp-ratings' }, c.readers.map((r) => h('span', { class: 'cmp-rating' }, sigilEl(r.id === me.id ? me : friend, { size: 'sm' }), starsEl(r.rating, { empty: '—' })))));

  const buddy = h('section', { class: 'section buddy' }, h('p', { class: 'hint', text: 'Loading…' }));
  const paintBuddy = async () => {
    const b = await storage.api(`/buddy?friend=${encodeURIComponent(friend.id)}`).catch(() => null);
    if (!b) {
      return fill(buddy, h('div', { class: 'section-head' }, h('h2', { text: 'Buddy read' })),
        h('p', { class: 'hint', text: `Pick a book to read with ${friend.name}; you’ll both see each other’s progress here.` }),
        bookSearch(ctx, 'Search for a book to read together', async (book) => {
          if (await call('/buddy', { friend: friend.id, book })) paintBuddy();
        }));
    }
    fill(buddy,
      h('div', { class: 'section-head' }, h('h2', { text: 'Buddy read' }), h('span', { class: 'count', text: `since ${fmtDate(b.started)}` }),
        h('div', { class: 'spacer' }),
        h('button', { class: 'link-btn', type: 'button', onclick: async () => { if (confirm('End this buddy read?') && await call('/buddy/end', { friend: friend.id })) paintBuddy(); } }, 'End')),
      h('div', { class: 'cl-read' }, coverEl({ cover: b.book.cover }),
        h('div', { class: 'cl-read-main' }, h('strong', { text: b.book.title }), b.book.author ? h('div', { class: 'count', text: b.book.author }) : null,
          progressRow(me, progressIn(libs[me.id], b.book.hardcoverId)),
          progressRow(friend, progressIn(libs[friend.id], b.book.hardcoverId)),
          progressIn(libs[me.id], b.book.hardcoverId) == null ? h('p', { class: 'hint', text: 'Add it to your shelf (Reading) and your progress shows up here.' }) : null)));
  };
  paintBuddy();

  return h('div', { class: 'with-page' },
    h('div', { class: 'with-head' },
      h('div', { class: 'with-sigils' }, sigilEl(me, { size: 'xl' }), sigilEl(friend, { size: 'xl' })),
      h('div', {}, h('div', { class: 'eyebrow', text: 'Book clubs' }), h('h1', { text: `You & ${friend.name}` })),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn secondary', type: 'button', onclick: () => openCard(ctx, friend.id) }, 'Their card')),
    h('section', { class: 'section match-big' },
      h('div', { class: 'mb-score' }, h('strong', { text: `${m.score}%` }), h('span', { text: 'taste match' })),
      h('ul', { class: 'mb-why' }, why.map((w) => h('li', { text: w })))),
    buddy,
    h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', { text: 'Where you disagree' }), h('span', { class: 'count', text: 'biggest rating gaps' })),
      debates.length ? debates.map(ratingRow) : h('p', { class: 'hint', text: 'No big disagreements yet.' })),
    agree.length ? h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', { text: 'You both loved' })), agree.map(ratingRow)) : null,
    h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', { text: 'Read by both of you' }), h('span', { class: 'count', text: String(common.length) })),
      common.length ? common.map(ratingRow) : h('p', { class: 'hint', text: 'Nothing in common yet.' })));
}

/* ================================================================ club */

export function clubView(ctx, clubId) {
  const root = h('div', { class: 'club-page' }, h('p', { class: 'hint', text: 'Opening the club…' }));
  const meId = ctx.state.me.id;
  const libs = {};

  async function load() {
    const club = await storage.api(`/club?id=${encodeURIComponent(clubId)}`).catch((err) => { fill(root, emptyArt('together', err.message)); return null; });
    if (!club) return;
    const members = club.members.filter((x) => x.status === 'member');
    // Members' shelves, as far as each one's privacy allows.
    await Promise.all(members.map(async (x) => {
      libs[x.id] = ctx.state.libraries[x.id] ?? await storage.loadJSON(`profiles/${x.id}/library.json`, { books: [] }).catch(() => ({ books: [] }));
    }));
    paint(club, members);
  }

  function paint(club, members) {
    const isHost = club.host === meId;
    const byId = Object.fromEntries(club.members.map((x) => [x.id, x]));
    if (club.myStatus !== 'member') {
      return fill(root, page(club.name, club.description),
        h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: async () => { if (await call('/club/respond', { id: club.id, accept: true })) load(); } }, 'Join the club'),
          h('button', { class: 'btn secondary', type: 'button', onclick: async () => { if (await call('/club/respond', { id: club.id, accept: false })) location.hash = '#/clubs'; } }, 'Decline')));
    }
    const ids = members.map((x) => x.id);
    const pairs = matchPairs(libs, ids);
    const groupMatch = pairs.length ? Math.round(pairs.reduce((n, p) => n + p.score, 0) / pairs.length) : null;
    const myPct = club.current ? progressIn(libs[meId], club.current.book.hardcoverId) ?? 0 : 100;

    // Read of the moment.
    const current = club.current ? h('section', { class: 'section cl-current' },
      h('div', { class: 'section-head' }, h('h2', { text: 'Reading now' }),
        club.current.target ? h('span', { class: 'pill', text: `finish by ${fmtDate(club.current.target)}` }) : null,
        h('div', { class: 'spacer' }),
        isHost ? h('button', { class: 'btn secondary small', type: 'button', onclick: async () => { if (confirm('Mark this read finished? It goes on the club shelf.') && await call('/club/finish', { id: club.id })) load(); } }, 'Finished — to the shelf') : null),
      h('div', { class: 'cl-read' }, coverEl({ cover: club.current.book.cover }),
        h('div', { class: 'cl-read-main' }, h('strong', { class: 'cl-read-title', text: club.current.book.title }),
          club.current.book.author ? h('div', { class: 'count', text: club.current.book.author }) : null,
          members.map((x) => progressRow(x, progressIn(libs[x.id], club.current.book.hardcoverId))))))
      : h('section', { class: 'section cl-current' }, h('div', { class: 'section-head' }, h('h2', { text: 'Reading now' })),
        h('p', { class: 'hint', text: isHost ? 'Set the club’s read below, or pick a winner from the vote.' : 'Nothing set yet — suggest a book and vote below.' }),
        isHost ? bookSearch(ctx, 'Set the club read: search for a book', async (book) => {
          const target = prompt('Finish by (YYYY-MM-DD, optional):', '') ?? '';
          if (await call('/club/read', { id: club.id, book, target: target.trim() })) load();
        }) : null);

    // Discussion: posts from further ahead than you are, blurred.
    const text = h('textarea', { rows: '2', maxlength: '1000', placeholder: club.current ? `Say something about ${club.current.book.title}…` : 'Say something to the club…' });
    const discussion = h('section', { class: 'section cl-talk' },
      h('div', { class: 'section-head' }, h('h2', { text: 'Discussion' }), club.current ? h('span', { class: 'count', text: `you’re ${myPct}% in — posts further on are hidden until you click` }) : null),
      h('form', { class: 'cl-compose', onsubmit: async (e) => {
        e.preventDefault();
        if (!text.value.trim()) return;
        if (await call('/club/post', { id: club.id, text: text.value, progress: myPct })) load();
      } }, text, h('button', { class: 'btn small', type: 'submit' }, 'Post')),
      club.posts.length ? club.posts.map((p) => {
        const ahead = club.current && p.bookId === club.current.book.hardcoverId && p.progress > myPct && p.by !== meId;
        const who = byId[p.by] ?? { name: 'A former member' };
        const body = h('p', { class: `cl-post-text${ahead ? ' blurred' : ''}`, text: p.text, title: ahead ? 'Click to read — this is from further on than you are' : null,
          onclick: (e) => e.currentTarget.classList.remove('blurred') });
        return h('div', { class: 'cl-post' }, sigilEl(who, { size: 'sm' }),
          h('div', { class: 'cl-post-main' },
            h('div', { class: 'cl-post-head' }, h('strong', { text: who.name }),
              h('span', { class: 'count', text: `${p.progress != null && p.bookId ? `at ${p.progress}% · ` : ''}${fmtAgo(p.created)}` }),
              p.by === meId || isHost ? h('button', { class: 'link-btn', type: 'button', onclick: async () => { if (confirm('Remove this post?') && await call('/club/unpost', { id: club.id, post: p.id })) load(); } }, 'Remove') : null),
            body));
      }) : h('p', { class: 'hint', text: 'No posts yet.' }));

    // The vote on the next read.
    const vote = h('section', { class: 'section cl-vote' },
      h('div', { class: 'section-head' }, h('h2', { text: 'Vote on the next read' })),
      [...club.suggestions].sort((a, b) => b.votes.length - a.votes.length).map((s) => h('div', { class: 'cl-sugg' },
        coverEl({ cover: s.book.cover }),
        h('div', { class: 'book-main' }, h('div', { class: 'book-title', text: s.book.title }),
          h('div', { class: 'book-meta', text: `${s.book.author ? `${s.book.author} · ` : ''}suggested by ${byId[s.by]?.name ?? 'a member'}` })),
        h('button', { class: `btn ${s.votes.includes(meId) ? '' : 'secondary'} small`, type: 'button', 'aria-pressed': String(s.votes.includes(meId)),
          onclick: async () => { if (await call('/club/vote', { id: club.id, suggestion: s.id })) load(); } }, `▲ ${s.votes.length}`),
        isHost ? h('button', { class: 'btn secondary small', type: 'button', onclick: async () => {
          const target = prompt('Make this the club read. Finish by (YYYY-MM-DD, optional):', '');
          if (target != null && await call('/club/pick', { id: club.id, suggestion: s.id, target: target.trim() })) load();
        } }, 'Pick') : null)),
      bookSearch(ctx, 'Suggest a book', async (book) => { if (await call('/club/suggest', { id: club.id, book })) load(); }));

    // The club's shelf.
    const shelf = h('section', { class: 'section cl-shelf' },
      h('div', { class: 'section-head' }, h('h2', { text: 'Club shelf' }), h('span', { class: 'count', text: `${club.history.length} read together` })),
      club.history.length ? club.history.map((b) => h('div', { class: 'cmp-row' }, coverEl({ cover: b.cover }),
        h('div', { class: 'book-main' }, h('div', { class: 'book-title', text: b.title }), h('div', { class: 'book-meta', text: `finished ${fmtDate(b.finished)}` })),
        h('div', { class: 'cmp-ratings' }, members.map((x) => {
          const mine = (libs[x.id]?.books ?? []).find((y) => String(y.hardcoverId) === String(b.hardcoverId));
          return h('span', { class: 'cmp-rating' }, sigilEl(x, { size: 'sm' }), starsEl(mine?.rating, { empty: '—' }));
        })))) : h('p', { class: 'hint', text: 'Finished club reads gather here, with everyone’s rating.' }));

    // Members, feed, group match.
    const feed = activity(libs, ids, { limit: 8 });
    const side = h('aside', { class: 'cl-side' },
      groupMatch != null ? h('div', { class: 'match-big small' }, h('div', { class: 'mb-score' }, h('strong', { text: `${groupMatch}%` }), h('span', { text: 'group taste match' }))) : null,
      h('div', { class: 'k', text: `Members · ${members.length}` }),
      members.map((x) => h('div', { class: 'cl-member' },
        h('button', { class: 'person-main', type: 'button', onclick: () => { location.hash = `#/p/${x.id}`; } }, sigilEl(x, { size: 'sm' }), h('span', { text: x.name })),
        x.id === club.host ? h('span', { class: 'pill', text: 'host' }) : null,
        isHost && x.id !== meId ? h('span', { class: 'row' },
          h('button', { class: 'link-btn', type: 'button', onclick: async () => { if (confirm(`Make ${x.name} the host?`) && await call('/club/host', { id: club.id, user: x.id })) load(); } }, 'Make host'),
          h('button', { class: 'link-btn', type: 'button', onclick: async () => { if (confirm(`Remove ${x.name} from the club?`) && await call('/club/remove', { id: club.id, user: x.id })) load(); } }, 'Remove')) : null)),
      club.members.some((x) => x.status === 'invited') ? h('div', { class: 'count', text: `Invited: ${club.members.filter((x) => x.status === 'invited').map((x) => x.name).join(', ')}` }) : null,
      inviteBox(ctx, club, load),
      h('div', { class: 'k', text: 'Lately' }),
      feed.length ? h('ol', { class: 'feed small' }, feed.map((it) => h('li', { class: 'cl-feed-item' },
        sigilEl(byId[it.id] ?? {}, { size: 'sm' }),
        h('span', {}, h('strong', { text: byId[it.id]?.name ?? '' }), ` ${{ finished: 'finished', started: 'started', added: 'wants to read', recommended: 'recommended' }[it.type]} `, h('em', { text: it.book.title })),
        h('span', { class: 'count', text: fmtAgo(it.at) })))) : h('p', { class: 'hint', text: 'Nothing yet.' }),
      h('div', { class: 'row cl-side-actions' },
        isHost ? h('button', { class: 'btn secondary small', type: 'button', onclick: () => newClub(ctx, club) }, 'Edit club') : null,
        h('button', { class: 'link-btn danger', type: 'button', onclick: async () => {
          if (confirm(isHost ? 'Leave the club? The longest-standing member becomes host.' : 'Leave the club?') && await call('/club/leave', { id: club.id })) location.hash = '#/clubs';
        } }, 'Leave club')));

    fill(root,
      h('div', { class: 'club-head', style: `--club:${club.colour}` }, clubBadge(club, 'xl'),
        h('div', {}, h('div', { class: 'eyebrow', text: 'Book club' }), h('h1', { text: club.name }), club.description ? h('div', { class: 'sub', text: club.description }) : null)),
      h('div', { class: 'club-columns' }, h('div', { class: 'club-main' }, current, discussion, vote, shelf), side));
  }

  load();
  return root;
}

function inviteBox(ctx, club, reload) {
  const inClub = new Set(club.members.map((x) => x.id));
  const friends = ctx.state.profiles.filter((p) => p.id !== ctx.state.me.id && !inClub.has(p.id));
  if (!friends.length) return null;
  return h('details', { class: 'cl-invite' }, h('summary', { text: 'Invite friends' }),
    friends.map((p) => h('div', { class: 'cl-member' }, sigilEl(p, { size: 'sm' }), h('span', { text: p.name }),
      h('button', { class: 'btn secondary small', type: 'button', onclick: async (e) => {
        e.currentTarget.disabled = true;
        if (await call('/club/invite', { id: club.id, user: p.id })) reload();
      } }, 'Invite'))));
}
