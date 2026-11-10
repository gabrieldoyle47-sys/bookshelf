/**
 * The library card: a member's profile, as a card that opens over the page
 * when their name or sigil is clicked.
 *
 * Banner along the top, their sigil pressed into it, their name and bio;
 * then the card itself - ruled like an old lending card, with "date due"
 * stamps of their last returns down one side, their numbers, favourite genre,
 * what they are reading, their favourites, badges and trophies - and their
 * sigil as a faint seal in the background. From it: their bookshelf, your
 * page with them, or a friend request.
 */

import { h, fill, toast, coverEl, fmtReadOnShort } from './dom.js';
import * as storage from './storage.js';
import { sigilEl, sigilMark, sigilPicker } from './sigil.js';
import { badgeById, badgeStamp } from './badges.js';
import { cssArt } from './shelfhero.js';
import { lookOf } from '../core/model.js';

import { BANNERS, bannerArt, bannerId } from './banners.js';

let layer = null;
const close = () => { layer?.remove(); layer = null; document.removeEventListener('keydown', onKey); };
const onKey = (e) => { if (e.key === 'Escape') close(); };

/** Open someone's library card over the page. */
export async function openCard(ctx, id) {
  close();
  const card = h('div', { class: 'lcard loading', role: 'dialog', 'aria-label': 'Library card' }, h('p', { class: 'hint', text: 'Fetching their card…' }));
  layer = h('div', { class: 'lcard-layer', onclick: (e) => { if (e.target === layer) close(); } }, card);
  document.body.append(layer);
  document.addEventListener('keydown', onKey);
  try {
    const m = await storage.api(`/member?id=${encodeURIComponent(id)}`);
    if (!layer) return;
    fill(card, cardContent(ctx, m));
    card.classList.remove('loading');
    card.querySelector('.lc-actions .btn')?.focus();
  } catch (err) {
    fill(card, h('p', { class: 'hint error', text: err.message }), h('button', { class: 'btn secondary small', type: 'button', onclick: close }, 'Close'));
  }
}

function bannerEl(m) {
  const b = m.banner ?? { kind: 'pattern', pattern: 'flow' };
  const colour = m.sigil?.bg ?? m.colour ?? '#a2461f';
  if (b.kind === 'cover' && b.cover) {
    return h('div', { class: 'lc-banner cover', style: `${cssArt(b.cover)};--sg:${colour}` }, h('div', { class: 'hero-wash' }));
  }
  return h('div', { class: 'lc-banner art', style: `--sg:${colour}` }, bannerArt(b.pattern, colour));
}

function cardContent(ctx, m) {
  const s = m.summary ?? {};
  const joined = m.joined ? new Date(m.joined).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null;
  const stat = (n, label) => (n == null ? null : h('div', { class: 'lc-stat' }, h('strong', { text: typeof n === 'number' ? n.toLocaleString() : n }), h('span', { text: label })));
  const go = (hash) => { close(); location.hash = hash; };

  const relation = {
    me: h('button', { class: 'btn secondary', type: 'button', onclick: () => editCard(ctx, m) }, 'Edit card'),
    friend: h('button', { class: 'btn secondary', type: 'button', onclick: () => go(`#/with/${m.id}`) }, 'You & them'),
    none: h('button', { class: 'btn secondary', type: 'button', onclick: async (e) => {
      e.currentTarget.disabled = true;
      try { await storage.api('/friends/request', { method: 'POST', body: { id: m.id } }); e.currentTarget.textContent = 'Request sent'; } catch (err) { toast(err.message, true); }
    } }, 'Add friend'),
    sent: h('span', { class: 'pill', text: 'Friend request sent' }),
    received: h('button', { class: 'btn secondary', type: 'button', onclick: async () => {
      await storage.api('/friends/respond', { method: 'POST', body: { id: m.id, accept: true } }).catch((err) => toast(err.message, true));
      await ctx.actions.reloadFriends();
      openCard(ctx, m.id);
    } }, 'Accept friend request'),
  }[m.relation];

  return [
    h('button', { class: 'lc-close', type: 'button', 'aria-label': 'Close', onclick: close }, '✕'),
    bannerEl(m),
    h('div', { class: 'lc-head' },
      sigilEl(m, { size: 'xxl' }),
      h('div', { class: 'lc-name' },
        h('h2', { text: m.name }),
        h('div', { class: 'lc-handle', text: `@${m.username}${joined ? ` · member since ${joined}` : ''}${m.friends ? ` · ${m.friends} friend${m.friends === 1 ? '' : 's'}` : ''}` }))),
    m.bio ? h('p', { class: 'lc-bio', text: m.bio }) : null,
    // The card proper: ruled, stamped, sealed.
    h('div', { class: 'lc-body', style: `--sg:${m.sigil?.bg ?? m.colour ?? '#a2461f'}` },
      h('div', { class: 'lc-seal', 'aria-hidden': 'true' }, sigilMark(m)),
      h('div', { class: 'lc-title' }, h('span', { text: 'LIBRARY CARD' }), h('span', { text: `No. ${String(m.id).toUpperCase().slice(0, 10)}` })),
      h('div', { class: 'lc-grid' },
        h('div', { class: 'lc-left' },
          h('div', { class: 'lc-stats' },
            stat(s.read, 'books read'), stat(s.thisYear, `in ${new Date().getFullYear()}`),
            stat(s.pages, 'pages'), s.averageRating != null ? stat(s.averageRating.toFixed(1), 'avg rating') : null),
          s.topGenre ? h('div', { class: 'lc-line' }, h('span', { class: 'k', text: 'Favourite genre' }), h('span', { class: 'lc-tag', text: s.topGenre })) : null,
          s.reading?.length ? h('div', { class: 'lc-line' }, h('span', { class: 'k', text: 'Now reading' }),
            ...s.reading.slice(0, 2).map((b) => h('span', { class: 'lc-now' }, coverEl(b), h('span', { text: b.title })))) : null),
        h('div', { class: 'lc-due' }, h('div', { class: 'lc-due-head', text: 'DATE DUE' }),
          (s.recent ?? []).map((r, i) => h('div', { class: 'lc-due-row' },
            h('span', { class: 'lc-stamp', style: `--r:${(i * 37) % 9 - 4}deg`, text: fmtReadOnShort(r.date) }),
            h('span', { class: 'lc-due-title', text: r.title }))),
          !(s.recent ?? []).length ? h('div', { class: 'lc-due-row' }, h('span', { class: 'hint', text: 'Nothing returned yet' })) : null))),
    s.favourites?.length ? h('div', { class: 'lc-section' }, h('div', { class: 'k', text: 'Favourites' }),
      h('div', { class: 'lc-favs' }, s.favourites.map((b) => h('figure', { title: `${b.title}${b.author ? ` — ${b.author}` : ''}` }, coverEl(b))))) : null,
    s.badges?.length || s.trophies?.length ? h('div', { class: 'lc-section' }, h('div', { class: 'k', text: `Badges${s.trophies?.length ? ' & trophies' : ''}` }),
      h('div', { class: 'lc-badges' }, s.badges.map((id) => badgeById(id)).filter(Boolean).map((b) => badgeStamp(b)),
        s.trophies?.length ? h('span', { class: 'lc-trophies', text: `🏆 ${s.trophies.length} series finished` }) : null)) : null,
    h('div', { class: 'lc-actions' },
      m.shelfVisible ? h('button', { class: 'btn', type: 'button', onclick: () => go(`#/p/${m.id}`) }, m.me ? 'Open my bookshelf' : 'Open their bookshelf')
        : h('span', { class: 'hint', text: `${m.name} keeps their shelf for friends.` }),
      relation),
    // Your own card is also your menu.
    m.me ? h('div', { class: 'lc-menu' },
      h('button', { class: 'link-btn', type: 'button', onclick: () => { close(); ctx.actions.openDecorate(ctx.state.profiles.find((p) => p.id === m.id) ?? m); } }, 'Decorate'),
      h('button', { class: 'link-btn', type: 'button', onclick: () => { close(); ctx.actions.openSettings(); } }, 'Account settings'),
      ctx.state.me.role === 'admin' ? h('button', { class: 'link-btn', type: 'button', onclick: () => go('#/admin') }, 'Admin') : null,
      h('button', { class: 'link-btn', type: 'button', onclick: () => { close(); ctx.actions.signOut(); } }, 'Sign out')) : null,
  ];
}

/* ----------------------------------------------------------- edit card */

function editCard(ctx, m) {
  close();
  const me = ctx.state.profiles.find((p) => p.id === m.id) ?? m;
  let sigil = m.sigil;
  let banner = m.banner ?? { kind: 'pattern', pattern: 'flow' };
  if (banner.kind === 'pattern') banner = { kind: 'pattern', pattern: bannerId(banner.pattern) };
  const privacy = { ...(ctx.state.me.privacy ?? { shelf: 'members', notes: 'everyone', ratings: 'everyone' }) };
  let stamp = lookOf(me).stamp;
  const bio = h('textarea', { maxlength: '160', rows: '3', placeholder: 'A line or two about you as a reader' }, m.bio ?? '');
  const count = h('span', { class: 'count' });
  const recount = () => { count.textContent = `${bio.value.length}/160`; };
  bio.addEventListener('input', recount);
  recount();

  const bannerChoices = h('div', { class: 'banner-choices', role: 'radiogroup', 'aria-label': 'Banner' });
  const paintBanners = () => {
    const favCovers = (m.summary?.favourites ?? []).filter((b) => b.cover);
    fill(bannerChoices,
      BANNERS.map(([id, name]) => h('button', {
        class: 'banner-choice art', type: 'button', role: 'radio', title: name,
        'aria-checked': String(banner.kind === 'pattern' && banner.pattern === id), onclick: () => { banner = { kind: 'pattern', pattern: id }; paintBanners(); },
      }, bannerArt(id, sigil?.bg ?? m.colour ?? '#a2461f'), h('span', { text: name }))),
      favCovers.map((b) => h('button', {
        class: 'banner-choice cover', type: 'button', role: 'radio', title: `Cover of ${b.title}`, style: cssArt(b.cover),
        'aria-checked': String(banner.kind === 'cover' && banner.cover === b.cover), onclick: () => { banner = { kind: 'cover', cover: b.cover }; paintBanners(); },
      }, h('span', { text: b.title }))),
      !favCovers.length ? h('p', { class: 'hint', text: 'Mark favourite books (from the open book) to use their covers here too.' }) : null);
  };
  paintBanners();

  const choice = (label, key, options) => h('label', { class: 'field' }, h('span', { text: label }),
    h('select', { onchange: (e) => { privacy[key] = e.target.value; } },
      options.map(([v, t]) => h('option', { value: v, selected: privacy[key] === v }, t))));

  const dialog = h('dialog', { class: 'dialog wide card-editor' });
  const save = h('button', { class: 'btn', type: 'submit' }, 'Save card');
  dialog.append(
    h('div', { class: 'dialog-head' }, h('h2', { text: 'Your library card' }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => { dialog.close(); dialog.remove(); } }, '✕')),
    h('form', { class: 'dialog-body card-form', onsubmit: async (e) => {
      e.preventDefault();
      save.disabled = true;
      try {
        await storage.api('/me', { method: 'PATCH', body: { bio: bio.value, sigil, banner, privacy } });
        if (stamp !== lookOf(me).stamp) await ctx.actions.saveLook(me, { stamp }, { quiet: true });
        ctx.state.me = await storage.api('/me');
        await ctx.actions.reloadFriends();
        dialog.close();
        dialog.remove();
        toast('Card saved');
        openCard(ctx, m.id);
      } catch (err) {
        toast(err.message, true);
        save.disabled = false;
      }
    } },
      h('section', { class: 'cf-section' }, h('h3', { text: 'Sigil' }),
        h('p', { class: 'hint', text: 'Your mark: your avatar everywhere, the stamp on your spines, the seal on your card.' }),
        sigilPicker(me, sigil, (next) => { sigil = next; paintBanners(); })),
      h('section', { class: 'cf-section' }, h('h3', { text: 'About you' }), bio, count),
      h('section', { class: 'cf-section' }, h('h3', { text: 'Banner' }), bannerChoices),
      h('section', { class: 'cf-section' }, h('h3', { text: 'On your spines' }),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: stamp, onchange: (e) => { stamp = e.target.checked; } }),
          ' Stamp my sigil on the foot of every spine')),
      h('section', { class: 'cf-section' }, h('h3', { text: 'Privacy' }),
        choice('Who can open your bookshelf', 'shelf', [['members', 'All members'], ['friends', 'Friends only']]),
        choice('Who can see your notes on books', 'notes', [['everyone', 'All members'], ['friends', 'Friends'], ['me', 'Only me']]),
        choice('Who can see your ratings', 'ratings', [['everyone', 'All members'], ['friends', 'Friends'], ['me', 'Only me']]),
        h('p', { class: 'hint', text: 'Your library card is always visible to members, so friends can find you.' })),
      h('div', { class: 'row end' }, save)));
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}
