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

/**
 * Where to buy a book: a search at each store, rather than a product page,
 * because Hardcover carries no ISBN for most unreleased books and none of these
 * stores has product URLs you could build from a title.
 *
 * Indigo for the big chain; Les Libraires (Quebec's independents, together),
 * Renaud-Bray and indiebookstores.ca (independents across Canada) for the rest.
 * Showing only the stores with stock was tried and is not possible from here:
 * Indigo and Renaud-Bray refuse requests that are not from a browser, and the
 * other two fill their results in with private APIs.
 */
export const STORES = [
  { id: 'indigo', name: 'Indigo', url: (q) => `https://www.indigo.ca/en-ca/search?q=${q}` },
  { id: 'leslibraires', name: 'Les Libraires', url: (q) => `https://www.leslibraires.ca/catalogue?s=${q}` },
  { id: 'renaudbray', name: 'Renaud-Bray', url: (q) => `https://www.renaud-bray.com/Recherche.aspx?words=${q}` },
  { id: 'indie', name: 'Indie stores', url: (q) => `https://www.indiebookstores.ca/books?term=${q}` },
];

/**
 * Borrowing it instead: a search of the reader's own Libby library. Libby
 * says whether it's there, and how long the wait is; nothing about it can be
 * checked from here.
 */
export function libbyUrl(book, library) {
  if (!library) return null;
  const author = (book.authorName ?? authorNames(book)).split(',')[0].trim();
  const q = encodeURIComponent([book.title, author].filter(Boolean).join(' '));
  return `https://libbyapp.com/search/${encodeURIComponent(library)}/search/query-${q}/page-1`;
}

export function storeUrls(book) {
  const author = (book.authorName ?? authorNames(book)).split(',')[0].trim();
  const q = encodeURIComponent([book.title, author].filter(Boolean).join(' '));
  return STORES.map((s) => ({ ...s, href: s.url(q) }));
}

/**
 * The stores as a row of small buttons, or - where a card has no room -
 * one "Buy" button that opens them as a menu.
 */
export function buyLinks(book, { released = true, compact = false } = {}) {
  const verb = released ? 'Buy' : 'Pre-order';
  const links = storeUrls(book).map((s) => h('a', {
    class: 'buy-store', href: s.href, target: '_blank', rel: 'noopener',
    title: `${verb} ${book.title} at ${s.name}`,
  }, s.name, h('span', { class: 'buy-arrow', 'aria-hidden': 'true', text: '↗' })));
  if (!compact) return h('div', { class: 'buy-row' }, h('span', { class: 'buy-label', text: `${verb} at` }), links);
  const summary = h('summary', { title: `${verb} ${book.title}` }, verb, h('span', { class: 'buy-caret', 'aria-hidden': 'true', text: '▾' }));
  const pop = h('div', { class: 'buy-pop' }, links);
  const menu = h('details', { class: 'buy-menu' }, summary, pop);
  // Fixed to the viewport, because these sit in carousels that would clip a
  // menu hanging out of the card. Below the button, or above it near the
  // bottom of the screen. One open at a time; a click elsewhere or a scroll
  // closes it.
  menu.addEventListener('toggle', () => {
    if (!menu.open) return;
    for (const other of document.querySelectorAll('details.buy-menu[open]')) if (other !== menu) other.open = false;
    const r = summary.getBoundingClientRect();
    const below = r.bottom + 190 < innerHeight;
    pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 168))}px`;
    pop.style.top = below ? `${r.bottom + 4}px` : '';
    pop.style.bottom = below ? '' : `${innerHeight - r.top + 4}px`;
    const close = (e) => {
      if (e.type === 'pointerdown' && menu.contains(e.target)) return;
      menu.open = false;
      document.removeEventListener('pointerdown', close, true);
      removeEventListener('scroll', close, true);
    };
    document.addEventListener('pointerdown', close, true);
    addEventListener('scroll', close, { capture: true, once: true });
  });
  return menu;
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

/**
 * A cover at the size it is shown, not the size Hardcover stores it.
 *
 * Hardcover's covers are full-size JPEGs (often 200-300 KB each) and a shelf
 * page shows dozens. wsrv.nl is a free, open image proxy that resizes them to
 * WebP on the fly (a 230 KB cover comes back at about 12 KB) and allows them
 * to be drawn on a canvas, which the year poster and Wrapped need. Only the
 * cover's public URL is sent. If it ever fails, the original is used.
 */
export function coverSrc(url, width = 160) {
  if (!url || !/^https:\/\/[^/]*hardcover\.app\//.test(url)) return url;
  const w = Math.round(width * Math.min(2, globalThis.devicePixelRatio || 1));
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${w}&output=webp&q=78`;
}

/** An <img> for a cover, falling back to the full-size original, then to a made cover. */
export function coverImg(book, { cls = 'cover', width = 160, fallback } = {}) {
  let tried = false;
  return h('img', {
    class: cls, src: coverSrc(book.cover, width), alt: '', loading: 'lazy', decoding: 'async',
    onerror: (e) => {
      if (!tried && e.target.src !== book.cover) { tried = true; e.target.src = book.cover; return; }
      e.target.replaceWith(fallback ? fallback() : madeCover(book));
    },
  });
}

// Cloth colours for made covers, picked by the series (or title) so every book
// in a series gets the same one.
const MADE = ['#7b2d26', '#2f4858', '#5b3a6b', '#2d5a3d', '#8a5a1c', '#344e7a', '#6b2f4a', '#3f5f5a'];
const hashOf = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/**
 * A cover for a book that has none yet - most unreleased books. Typeset like
 * a plain cloth edition: the title, a rule, the author, on the series colour.
 * Its text scales with the cover (container units), so it works from a
 * 36-pixel thumbnail to the big "Next up" card.
 */
export function madeCover(book, cls = 'cover') {
  const author = (book.authorName ?? book.author ?? authorNames(book) ?? '').split(',')[0].trim();
  const cloth = MADE[hashOf(book.series?.name ?? book.seriesName ?? book.title ?? '') % MADE.length];
  // The words sit in an inner box: container units only measure against an ancestor.
  return h('div', { class: `${cls} made`, style: `--cloth:${cloth}`, role: 'img', 'aria-label': `${book.title ?? 'Book'} (no cover yet)` },
    h('span', { class: 'made-in' },
      h('span', { class: 'made-title', text: book.title ?? '' }),
      h('span', { class: 'made-rule', 'aria-hidden': 'true' }),
      author ? h('span', { class: 'made-author', text: author }) : null));
}

export function coverEl(book, { width = 160 } = {}) {
  if (book.cover) return coverImg(book, { width });
  return madeCover(book);
}

/** Series line such as "The Broken Earth #2", or null for a standalone. */
export function seriesLabel(book) {
  if (!book.series?.name) return null;
  return book.series.position != null
    ? `${book.series.name} #${book.series.position}`
    : book.series.name;
}

/**
 * A short message at the bottom of the screen, optionally with one action
 * ("Undo", "Rate it").
 *
 * The toast is a popover where the browser supports it. A modal dialog lives
 * in the top layer, above every z-index, so a plain fixed element shown while
 * a dialog was open - "Could not save", say - sat hidden under the dialog's
 * backdrop exactly when it mattered. Showing a popover after the dialog puts
 * it on top.
 */
/**
 * Count a number up from zero, the way Strava reveals a run's stats. Used
 * only on arriving at a page - not on every save - and skipped entirely for
 * reduced motion, where the final number is simply shown.
 */
export function countUp(el, to, { duration = 700 } = {}) {
  const target = Number(to);
  const format = (n) => Math.round(n).toLocaleString();
  if (!Number.isFinite(target) || target <= 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = format(target || 0);
    return el;
  }
  const start = performance.now();
  el.textContent = '0';
  (function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = format(target * (1 - (1 - t) ** 3));
    if (t < 1) requestAnimationFrame(frame);
  })(start);
  return el;
}

export function toast(message, isError = false, action = null) {
  const el = document.getElementById('toast');
  const popover = typeof el.showPopover === 'function';
  const isOpen = () => { try { return el.matches(':popover-open'); } catch { return false; } };

  function hide() {
    el.className = 'toast';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { if (popover && isOpen()) el.hidePopover(); }, 300);
  }

  fill(el, h('span', { text: message }), action ? h('button', {
    class: 'toast-action', type: 'button',
    onclick: () => { hide(); action.run(); },
  }, action.label) : null);
  el.className = `toast show${isError ? ' error' : ''}`;
  // Errors interrupt; everything else waits its turn.
  el.setAttribute('role', isError ? 'alert' : 'status');
  if (popover) {
    // Re-opening moves it above any dialog opened since it was last shown.
    if (isOpen()) el.hidePopover();
    el.showPopover();
  }
  clearTimeout(toast._timer);
  // Long enough to reach an action button, short enough not to linger.
  toast._timer = setTimeout(hide, action ? 7000 : isError ? 5200 : 2600);
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
