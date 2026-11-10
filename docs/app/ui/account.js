/**
 * Accounts on the page: signing in and joining, account settings, the
 * Friends page (search members, requests, friends), and the admin page.
 *
 * Everything here goes through storage.api(); the API decides what anyone
 * may do, so these screens only ever offer what it would allow.
 */

import { h, fill, toast } from './dom.js';
import * as storage from './storage.js';
import { avatar } from './together.js';

/* --------------------------------------------------------- sign in / join */

/**
 * The whole page while no one is signed in: sign in, or create an account
 * (with a code, if someone is claiming a shelf from before accounts, or if
 * joining needs an invite).
 */
export function signInScreen(onSignedIn) {
  let mode = 'signin';
  let signupMode = 'open';
  const box = h('div', { class: 'auth-card' });
  const page = h('div', { class: 'auth-page' },
    h('div', { class: 'auth-brand' },
      // The same book mark as the sidebar's (index.html); it was an empty square here.
      document.querySelector('.brand .brand-mark')?.cloneNode(true) ?? h('span', { class: 'brand-mark' }), h('span', { text: 'Bookshelf' })),
    box,
    h('p', { class: 'auth-foot hint', text: 'A small reading club’s shelves. Your books are only visible to signed-in members.' }));
  storage.api('/auth/mode').then((m) => { signupMode = m.signupMode; if (mode === 'signup') paint(); }).catch(() => {});

  const field = (label, input, hint = null) => h('label', { class: 'field' }, h('span', { text: label }), input, hint ? h('span', { class: 'hint', text: hint }) : null);

  function paint() {
    const error = h('p', { class: 'hint error', role: 'alert' });
    const submit = h('button', { class: 'btn auth-submit', type: 'submit' }, mode === 'signin' ? 'Sign in' : 'Create account');
    const tabs = h('div', { class: 'seg auth-tabs', role: 'tablist' },
      [['signin', 'Sign in'], ['signup', 'Create an account']].map(([id, label]) => h('button', {
        class: 'seg-btn', type: 'button', role: 'tab', 'aria-selected': String(id === mode), onclick: () => { mode = id; paint(); },
      }, label)));

    if (mode === 'signin') {
      const username = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
      const password = h('input', { type: 'password', autocomplete: 'current-password', required: true });
      fill(box, tabs, h('form', { class: 'auth-form', onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        error.textContent = '';
        try {
          const { token, user } = await storage.api('/auth/signin', { method: 'POST', body: { username: username.value, password: password.value }, signedOut: false });
          storage.setSession(token);
          onSignedIn(user);
        } catch (err) {
          error.textContent = err.message;
          submit.disabled = false;
        }
      } },
        field('Username', username), field('Password', password), error, submit,
        h('p', { class: 'hint', text: 'Forgot your password? Ask the site admin to reset it.' })));
      username.focus();
      return;
    }

    const username = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true, maxlength: '20' });
    const name = h('input', { type: 'text', autocomplete: 'nickname', required: true, maxlength: '30' });
    const email = h('input', { type: 'email', autocomplete: 'email', required: true });
    const password = h('input', { type: 'password', autocomplete: 'new-password', required: true });
    const invite = h('input', { type: 'text', autocapitalize: 'none', spellcheck: 'false' });
    const claim = h('input', { type: 'text', autocapitalize: 'none', spellcheck: 'false' });
    fill(box, tabs, h('form', { class: 'auth-form', onsubmit: async (e) => {
      e.preventDefault();
      submit.disabled = true;
      error.textContent = '';
      try {
        const { token, user } = await storage.api('/auth/signup', { method: 'POST', signedOut: false, body: {
          username: username.value, displayName: name.value, email: email.value, password: password.value,
          invite: invite.value || undefined, claim: claim.value || undefined,
        } });
        storage.setSession(token);
        onSignedIn(user, { isNew: true });
      } catch (err) {
        error.textContent = err.message;
        submit.disabled = false;
      }
    } },
      field('Username', username, 'For signing in and so friends can find you. 3–20 letters, numbers, dots or underscores; it can’t be changed.'),
      field('Display name', name, 'What everyone sees, like “Gabriel”. You can change it later.'),
      field('Email', email, 'Only for getting back into your account (and, later, updates you choose). Never shown to anyone.'),
      field('Password', password),
      signupMode === 'invite' ? field('Invite code', invite, 'From a member: joining is by invitation right now.') : null,
      h('details', { class: 'optional' }, h('summary', { text: 'I have a code for a shelf from before accounts' }),
        field('Claim code', claim, 'Your shelf, with all its books, becomes this account’s.')),
      error, submit));
    username.focus();
  }

  paint();
  return page;
}

/** A temporary password (after an admin reset) must be replaced before anything else. */
export function forcePasswordChange(onDone) {
  const dialog = h('dialog', { class: 'dialog' });
  const next = h('input', { type: 'password', autocomplete: 'new-password', required: true });
  const error = h('p', { class: 'hint error', role: 'alert' });
  dialog.append(h('div', { class: 'dialog-head' }, h('h2', { text: 'Choose a new password' })),
    h('form', { class: 'dialog-body auth-form', onsubmit: async (e) => {
      e.preventDefault();
      try {
        await storage.api('/me/password', { method: 'POST', body: { next: next.value } });
        dialog.close();
        dialog.remove();
        toast('Password changed');
        onDone();
      } catch (err) { error.textContent = err.message; }
    } },
      h('p', { text: 'You signed in with a temporary password. Pick your own to carry on.' }),
      h('label', { class: 'field' }, h('span', { text: 'New password' }), next), error,
      h('div', { class: 'row end' }, h('button', { class: 'btn', type: 'submit' }, 'Save'))));
  dialog.addEventListener('cancel', (e) => e.preventDefault());
  document.body.append(dialog);
  dialog.showModal();
  next.focus();
}

/* ------------------------------------------------------------- account */

/** Account settings, for the Settings dialog. */
export function accountSection(ctx, me, { onChanged, onSignedOut }) {
  const box = h('div', { class: 'account' });
  const msg = (el, text, bad = false) => { el.textContent = text; el.classList.toggle('error', bad); };

  const nameInput = h('input', { type: 'text', value: me.name, maxlength: '30' });

  const profileMsg = h('span', { class: 'hint' });

  const current = h('input', { type: 'password', autocomplete: 'current-password' });
  const next = h('input', { type: 'password', autocomplete: 'new-password' });
  const pwMsg = h('span', { class: 'hint' });

  const email = h('input', { type: 'email', value: me.email ?? '' });
  const emailPw = h('input', { type: 'password', autocomplete: 'current-password' });
  const emailMsg = h('span', { class: 'hint' });

  const run = async (button, el, work, done) => {
    button.disabled = true;
    try { await work(); msg(el, done); } catch (err) { msg(el, err.message, true); }
    button.disabled = false;
  };

  fill(box,
    h('section', { class: 'acct-section' },
      h('h3', { text: 'You' }),
      h('p', { class: 'hint', text: `Signed in as @${me.username}${me.role === 'admin' ? ' · admin' : ''}` }),
      h('label', { class: 'field' }, h('span', { text: 'Display name' }), nameInput),
      // Your colour is your sigil's, chosen on your library card.
      h('p', { class: 'hint', text: 'Your colour, sigil, banner and bio are on your library card — the round button at the top right, then Edit card.' }),
      h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: (e) => run(e.currentTarget, profileMsg, async () => {
        await storage.api('/me', { method: 'PATCH', body: { displayName: nameInput.value } });
        onChanged();
      }, 'Saved') }, 'Save'), profileMsg)),
    h('section', { class: 'acct-section' },
      h('h3', { text: 'Password' }),
      h('label', { class: 'field' }, h('span', { text: 'Current password' }), current),
      h('label', { class: 'field' }, h('span', { text: 'New password' }), next),
      h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: (e) => run(e.currentTarget, pwMsg, async () => {
        await storage.api('/me/password', { method: 'POST', body: { current: current.value, next: next.value } });
        current.value = ''; next.value = '';
      }, 'Changed — other devices will need to sign in again') }, 'Change password'), pwMsg)),
    h('section', { class: 'acct-section' },
      h('h3', { text: 'Email' }),
      h('p', { class: 'hint', text: 'For getting back into your account. Never shown to anyone.' }),
      h('label', { class: 'field' }, h('span', { text: 'Email' }), email),
      h('label', { class: 'field' }, h('span', { text: 'Your password, to confirm' }), emailPw),
      h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: (e) => run(e.currentTarget, emailMsg, async () => {
        await storage.api('/me/email', { method: 'POST', body: { email: email.value, password: emailPw.value } });
        emailPw.value = '';
      }, 'Saved') }, 'Save email'), emailMsg)),
    h('section', { class: 'acct-section' },
      h('h3', { text: 'Signing out' }),
      h('div', { class: 'row' },
        h('button', { class: 'btn secondary small', type: 'button', onclick: async () => {
          await storage.api('/auth/signout', { method: 'POST' }).catch(() => {});
          storage.setSession(null);
          onSignedOut();
        } }, 'Sign out'),
        h('button', { class: 'btn secondary small', type: 'button', onclick: async () => {
          if (!confirm('Sign out on every device, including this one?')) return;
          await storage.api('/auth/signout-all', { method: 'POST' }).catch(() => {});
          storage.setSession(null);
          onSignedOut();
        } }, 'Sign out everywhere'))),
    h('section', { class: 'acct-section danger-zone' },
      h('h3', { text: 'Delete your account' }),
      h('p', { class: 'hint', text: 'Your shelf disappears for everyone straight away. The admin can bring it back within 30 days; after that it is gone for good.' }),
      h('button', { class: 'btn danger small', type: 'button', onclick: () => deleteAccount(me, onSignedOut) }, 'Delete my account…')));
  return box;
}

function deleteAccount(me, onSignedOut) {
  const username = prompt(`To delete your account, type your username (${me.username}):`);
  if (username == null) return;
  const password = prompt('And your password:');
  if (password == null) return;
  storage.api('/me/delete', { method: 'POST', body: { username, password } })
    .then(() => { storage.setSession(null); toast('Your account was deleted.'); onSignedOut(); })
    .catch((err) => toast(err.message, true));
}

/* --------------------------------------------------------------- friends */

/**
 * The Friends page: find members by username or name, answer requests,
 * and see (or remove) friends.
 */
export function friendsView(ctx) {
  const root = h('div', { class: 'friends-page' });
  const results = h('div', { class: 'people-list' });
  const lists = h('div', { class: 'friends-lists' });
  const search = h('input', { type: 'search', placeholder: 'Search by name or username', 'aria-label': 'Search members', class: 'find-input' });
  let timer = null;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(find, 250); });

  const personRow = (p, actions) => h('div', { class: 'person-row' },
    h('a', { class: 'person-main', href: `#/p/${p.id}` }, avatar(p), h('span', {}, h('strong', { text: p.name }), h('span', { class: 'count', text: ` @${p.username}` }))),
    h('div', { class: 'row person-actions' }, actions));

  const act = (label, path, body, cls = 'btn small') => h('button', { class: cls, type: 'button', onclick: async (e) => {
    e.currentTarget.disabled = true;
    try { await storage.api(path, { method: 'POST', body }); await ctx.actions.reloadFriends(); refresh(); } catch (err) { toast(err.message, true); e.currentTarget.disabled = false; }
  } }, label);

  async function find() {
    const q = search.value.trim();
    if (!q) return fill(results);
    try {
      const people = await storage.api(`/members?q=${encodeURIComponent(q)}`);
      fill(results, people.length ? people.map((p) => personRow(p, {
        none: act('Add friend', '/friends/request', { id: p.id }),
        sent: h('span', { class: 'pill', text: 'Request sent' }),
        received: act('Accept', '/friends/respond', { id: p.id, accept: true }),
        friend: h('span', { class: 'pill', text: 'Friends' }),
      }[p.relation])) : h('p', { class: 'hint', text: 'No members match that.' }));
    } catch (err) { fill(results, h('p', { class: 'hint error', text: err.message })); }
  }

  async function refresh() {
    try {
      const f = await storage.api('/friends');
      fill(lists,
        f.incoming.length ? h('section', { class: 'section' }, h('h2', { text: 'Friend requests' }),
          f.incoming.map((p) => personRow(p, [act('Accept', '/friends/respond', { id: p.id, accept: true }),
            act('Decline', '/friends/respond', { id: p.id, accept: false }, 'btn secondary small')]))) : null,
        h('section', { class: 'section' }, h('h2', { text: `Friends${f.friends.length ? ` · ${f.friends.length}` : ''}` }),
          f.friends.length ? f.friends.map((p) => personRow(p, [h('a', { class: 'btn secondary small', href: `#/p/${p.id}` }, 'Open shelf'),
            h('button', { class: 'link-btn', type: 'button', onclick: async (e) => {
              if (!confirm(`Remove ${p.name} from your friends?`)) return;
              e.currentTarget.disabled = true;
              await storage.api('/friends/remove', { method: 'POST', body: { id: p.id } }).catch((err) => toast(err.message, true));
              await ctx.actions.reloadFriends();
              refresh();
            } }, 'Remove')]))
            : h('p', { class: 'hint', text: 'No friends yet — search for someone above.' })),
        f.outgoing.length ? h('section', { class: 'section' }, h('h2', { text: 'Waiting for an answer' }),
          f.outgoing.map((p) => personRow(p, h('span', { class: 'pill', text: 'Request sent' })))) : null);
    } catch (err) { fill(lists, h('p', { class: 'hint error', text: err.message })); }
    if (search.value.trim()) find();
  }

  root.append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: 'Friends' }),
      h('div', { class: 'sub', text: 'Friends see each other in the sidebar, can react to each other’s ratings and send each other books.' }))),
    h('section', { class: 'section' }, h('h2', { text: 'Find people' }), search, results),
    lists);
  refresh();
  return root;
}

/* ----------------------------------------------------------------- admin */

export function adminView(ctx) {
  const root = h('div', { class: 'admin-page' });
  const users = h('div', { class: 'people-list' });
  const settings = h('div');
  const usage = h('div');

  const call = async (path, body) => {
    try { return await storage.api(path, { method: 'POST', body }); } catch (err) { toast(err.message, true); return null; }
  };

  async function load() {
    const [list, mode, use, invites] = await Promise.all([
      storage.api('/admin/users'), storage.api('/admin/settings'), storage.api('/admin/usage'), storage.api('/admin/invites'),
    ]).catch((err) => { fill(root, h('p', { class: 'hint error', text: err.message })); return []; });
    if (!list) return;
    fill(users, list.map((u) => h('div', { class: `person-row ${u.status}` },
      h('div', { class: 'person-main' }, avatar(u), h('span', {}, h('strong', { text: u.name }),
        h('span', { class: 'count', text: ` @${u.username}${u.role === 'admin' ? ' · admin' : ''} · ${u.status}${u.deletedAt ? ` (${u.deletedAt.slice(0, 10)})` : ''}` }),
        h('div', { class: 'hint', text: u.email ?? '' }))),
      h('div', { class: 'row person-actions' },
        u.status === 'active' && u.role !== 'admin' ? h('button', { class: 'btn secondary small', type: 'button', onclick: async () => {
          if (confirm(`Suspend ${u.name}? They are signed out and cannot sign in until you lift it.`) && await call(`/admin/users/${u.id}/suspend`)) load();
        } }, 'Suspend') : null,
        u.status === 'suspended' ? h('button', { class: 'btn secondary small', type: 'button', onclick: async () => { if (await call(`/admin/users/${u.id}/unsuspend`)) load(); } }, 'Lift suspension') : null,
        u.status === 'deleted' ? h('button', { class: 'btn secondary small', type: 'button', onclick: async () => { if (await call(`/admin/users/${u.id}/restore`)) load(); } }, 'Restore') : null,
        h('button', { class: 'btn secondary small', type: 'button', onclick: async () => {
          if (!confirm(`Give ${u.name} a temporary password? They will choose a new one when they sign in.`)) return;
          const r = await call(`/admin/users/${u.id}/reset-password`);
          if (r) prompt(`Temporary password for ${u.name} — send it to them:`, r.temporaryPassword);
        } }, 'Reset password'),
        u.status !== 'deleted' && u.role !== 'admin' ? h('button', { class: 'btn danger small', type: 'button', onclick: async () => {
          if (confirm(`Delete ${u.name}'s account? It can be restored here for 30 days.`) && await call(`/admin/users/${u.id}/delete`)) load();
        } }, 'Delete') : null))));

    fill(settings,
      h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Who can join' }, [['open', 'Anyone can join'], ['invite', 'Invite codes only']].map(([id, label]) => h('button', {
        class: 'seg-btn', type: 'button', role: 'radio', 'aria-selected': String(mode.signupMode === id),
        onclick: async () => { if (await call('/admin/settings', { signupMode: id })) load(); },
      }, label))),
      h('div', { class: 'row', style: 'margin-top:.8rem' }, h('button', { class: 'btn small', type: 'button', onclick: async () => {
        const r = await call('/admin/invites');
        if (r) { prompt('Invite code — send it to them:', r.code); load(); }
      } }, 'New invite code')),
      invites.length ? h('ul', { class: 'invite-list' }, invites.slice(0, 10).map((i) => h('li', {},
        h('code', { text: i.code }), h('span', { class: 'count', text: i.used_by ? ` used by ${i.used_by}` : ' unused' })))) : null);

    fill(usage,
      use.lastCheck ? h('p', { text: `Last nightly check: ${use.lastCheck.at.slice(0, 16).replace('T', ' ')} UTC — ${use.lastCheck.people} shelves, ${use.lastCheck.series} series, ${use.lastCheck.authors} authors, ${use.lastCheck.calls} calls, ${use.lastCheck.events} new, ${use.lastCheck.failures} problems.` })
        : h('p', { class: 'hint', text: 'No nightly check recorded yet.' }),
      h('table', { class: 'usage-table' }, h('tr', {}, h('th', { text: 'Day' }), h('th', { text: 'Hardcover calls' })),
        use.days.map((d) => h('tr', {}, h('td', { text: d.day }), h('td', { text: String(d.calls) })))),
      h('p', { class: 'hint', text: 'Hardcover allows 60 calls a minute. Each person is held to 40 a minute, and the nightly check gives each shelf a minute of its own.' }));
  }

  root.append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: 'Admin' }), h('div', { class: 'sub', text: 'Members, joining, and how much of Hardcover the site is using.' }))),
    h('section', { class: 'section' }, h('h2', { text: 'Members' }), users),
    h('section', { class: 'section' }, h('h2', { text: 'Joining' }), settings),
    h('section', { class: 'section' }, h('h2', { text: 'Usage' }), usage));
  load();
  return root;
}
