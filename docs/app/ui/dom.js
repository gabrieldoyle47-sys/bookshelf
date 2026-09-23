/**
 * Tiny DOM helpers.
 *
 * Everything builds real nodes and sets text through textContent rather than
 * innerHTML: titles, author names and personal notes are all user-supplied
 * text, and this way there is no escaping to get wrong.
 */

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'html') throw new Error('Refusing innerHTML; build nodes instead');
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset') Object.assign(el.dataset, value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const clear = (node) => { while (node.firstChild) node.firstChild.remove(); return node; };

/**
 * Replace a node's children. Unlike clear(node).append(...), empty slots are
 * skipped - append() would turn a null into the literal text "null".
 */
export const fill = (node, ...children) => {
  clear(node).append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return node;
};

/** "4½" - a rating as text, for labels and tight spots. */
export const fmtRating = (n) => {
  if (typeof n !== 'number' || n <= 0) return '';
  const whole = Math.floor(n);
  return `${whole || ''}${n % 1 ? '½' : ''}`;
};

/** Plain-text stars, for places that can only hold a string. */
export const stars = (n) => {
  if (typeof n !== 'number' || n <= 0) return '';
  const whole = Math.floor(n);
  const half = n % 1 >= 0.5;
  return '★'.repeat(whole) + (half ? '½' : '') + '☆'.repeat(Math.max(0, 5 - whole - (half ? 1 : 0)));
};

/**
 * Stars drawn as a filled strip over an empty one, so a half star is a real
 * half star rather than a "½" glyph that no font draws the same way.
 */
export function starsEl(n, { empty = '' } = {}) {
  if (typeof n !== 'number' || n <= 0) return empty ? h('span', { class: 'count', text: empty }) : null;
  return h('span', { class: 'stars-el', role: 'img', 'aria-label': `${n} out of 5 stars`, title: `${n} / 5` },
    h('span', { class: 'stars-base', 'aria-hidden': 'true', text: '★★★★★' }),
    h('span', { class: 'stars-fill', 'aria-hidden': 'true', style: `width:${(n / 5) * 100}%`, text: '★★★★★' }));
}

/** A Jan-1 date in Hardcover usually means "we know the year, not the day". */
export const isPlaceholderDate = (d) => typeof d === 'string' && d.endsWith('-01-01');

export function fmtDate(iso) {
  if (!iso) return '';
  if (isPlaceholderDate(iso)) return iso.slice(0, 4);
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Render a partial read date at whatever precision it carries.
 *
 * "2019" stays "2019" rather than becoming "1 January 2019" - the whole point
 * is not to claim a precision the reader never gave us.
 */
export function fmtReadOn(value) {
  if (!value) return '';
  const [y, m, d] = String(value).split('-');
  if (!m) return y;
  const month = new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString(undefined, { month: 'long' });
  return d ? `${Number(d)} ${month} ${y}` : `${month} ${y}`;
}

/** Short form for group headings and tight columns: "Mar 2019". */
export function fmtReadOnShort(value) {
  if (!value) return '';
  const [y, m, d] = String(value).split('-');
  if (!m) return y;
  const month = new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString(undefined, { month: 'short' });
  return d ? `${Number(d)} ${month} ${y}` : `${month} ${y}`;
}

/**
 * When a book comes out, in words. A Jan-1 placeholder only knows the year,
 * so it says "2032" rather than counting down to a day nobody announced.
 */
export function fmtRelease(iso) {
  if (!iso) return { date: 'Date not announced', countdown: null };
  if (isPlaceholderDate(iso)) return { date: `Sometime in ${iso.slice(0, 4)}`, countdown: null };
  const days = daysUntil(iso);
  return { date: fmtDate(iso), countdown: days == null ? null : days < 0 ? 'out now' : days === 0 ? 'out today' : `in ${fmtDays(days)}` };
}

/** "3 days ago" for anything recent, a date otherwise. */
export function fmtAgo(iso) {
  if (!iso) return '';
  const days = -daysUntil(String(iso).slice(0, 10));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return fmtDate(String(iso).slice(0, 10));
}

export function fmtDays(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 0) return `${-days}d ago`;
  if (days < 45) return `${days} days`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}

export const authorNames = (book) =>
  (book.authors ?? []).map((a) => (typeof a === 'string' ? a : a.name)).filter(Boolean).join(', ');

export function coverEl(book) {
  if (book.cover) {
    return h('img', {
      class: 'cover', src: book.cover, alt: '', loading: 'lazy',
      onerror: (e) => e.target.replaceWith(h('div', { class: 'cover placeholder', text: '📕' })),
    });
  }
  return h('div', { class: 'cover placeholder', text: '📕' });
}

/** Series line such as "The Broken Earth #2", or null for a standalone. */
export function seriesLabel(book) {
  if (!book.series?.name) return null;
  return book.series.position != null
    ? `${book.series.name} #${book.series.position}`
    : book.series.name;
}

export function toast(message, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { el.className = 'toast'; }, isError ? 5200 : 2600);
}

export const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const daysUntil = (iso) => {
  if (!iso) return null;
  const MS = 86_400_000;
  const a = Date.parse(`${todayISO()}T00:00:00Z`);
  const b = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(b) ? null : Math.round((b - a) / MS);
};
