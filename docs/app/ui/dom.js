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

export const stars = (n) =>
  typeof n === 'number' && n > 0 ? '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n)) : '';

/** A Jan-1 date in Hardcover usually means "we know the year, not the day". */
export const isPlaceholderDate = (d) => typeof d === 'string' && d.endsWith('-01-01');

export function fmtDate(iso) {
  if (!iso) return '';
  if (isPlaceholderDate(iso)) return iso.slice(0, 4);
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
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
