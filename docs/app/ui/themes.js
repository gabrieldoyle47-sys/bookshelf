/**
 * A person's theme: chosen when they are added, changed from their menu or
 * their bookshelf, and worn by their pages - two colours that tint the
 * background, surfaces, buttons and tabs, the wood of their bookcase, and a
 * faint wallpaper behind it all. Classic is the site's own look, untouched.
 *
 * The accent and wood are CSS (style.css, "Profile themes"); this sets which
 * one is on, and draws the wallpaper, which needs the accent baked into it.
 */

import { h } from './dom.js';

/**
 * Themes are switched off while the bookshelf's room and its scenes are
 * worked out - the two need designing together. Everything below still
 * works; set this to true to bring them back.
 */
export const THEMES_ON = false;
import { PROFILE_THEMES } from '../core/model.js';

// Small repeating motifs, one tile each. `C` is replaced by the theme's own
// accent - a fixed hex value from PROFILE_THEMES, never anything typed.
const PATTERNS = {
  plain: null,
  leaves: '<path d="M14 30c0-10 8-16 16-16-1 9-7 16-16 16z" fill="C"/><path d="M14 30l12-12" stroke="C" stroke-width="1"/><path d="M50 58c-8 0-13-6-13-13 7 0 13 6 13 13z" fill="C"/>',
  waves: '<path d="M0 20c8-6 16-6 24 0s16 6 24 0 16-6 24 0M0 52c8-6 16-6 24 0s16 6 24 0 16-6 24 0" stroke="C" stroke-width="2" fill="none"/>',
  florals: '<g fill="C"><circle cx="18" cy="14" r="3"/><circle cx="24" cy="18" r="3"/><circle cx="22" cy="25" r="3"/><circle cx="14" cy="25" r="3"/><circle cx="12" cy="18" r="3"/></g><circle cx="48" cy="48" r="2.4" fill="C"/>',
  stars: '<path d="M16 10l1.6 4.4L22 16l-4.4 1.6L16 22l-1.6-4.4L10 16l4.4-1.6z" fill="C"/><circle cx="46" cy="40" r="1.4" fill="C"/><circle cx="30" cy="54" r="1" fill="C"/><circle cx="56" cy="12" r="1" fill="C"/>',
  stripes: '<path d="M16 0v64M48 0v64" stroke="C" stroke-width="1.2"/>',
};

export const themeOf = (profile) => PROFILE_THEMES.find((t) => t.id === profile?.theme) ?? PROFILE_THEMES[0];

/** Put a theme on (null for the site's own look). */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (!theme || theme.id === 'classic') {
    delete root.dataset.ptheme;
    delete root.dataset.wood;
    root.style.removeProperty('--wallpaper');
    root.style.removeProperty('--p-accent');
    root.style.removeProperty('--p-accent-2');
    return;
  }
  root.dataset.ptheme = theme.id;
  root.dataset.wood = theme.wood;
  root.style.setProperty('--p-accent', theme.accent);
  root.style.setProperty('--p-accent-2', theme.accent2 ?? theme.accent);
  const tile = PATTERNS[theme.wallpaper];
  if (tile && /^#[0-9a-f]{6}$/i.test(theme.accent)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" opacity=".07">${tile.replaceAll('C', theme.accent)}</svg>`;
    root.style.setProperty('--wallpaper', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
  } else {
    root.style.removeProperty('--wallpaper');
  }
}

/** Theme cards to choose from: a swatch of the accent on a strip of the wood. */
export function themePicker(current, onPick) {
  const group = h('div', { class: 'theme-cards', role: 'radiogroup', 'aria-label': 'Theme' });
  const paint = (selected) => {
    for (const card of group.children) card.setAttribute('aria-checked', String(card.dataset.id === selected));
  };
  for (const t of PROFILE_THEMES) {
    group.append(h('button', {
      class: `theme-card wood-${t.wood}`, type: 'button', role: 'radio', dataset: { id: t.id },
      'aria-checked': String(t.id === current), title: t.name,
      onclick: () => { paint(t.id); onPick(t.id); },
    },
      // Classic is the site's own terracotta, whatever is showing now.
      h('span', { class: 'tc-swatch', style: `--c:${t.accent ?? '#a2461f'};--c2:${t.accent2 ?? t.accent ?? '#a2461f'}` }),
      h('span', { class: 'tc-wood', 'aria-hidden': 'true' }),
      h('span', { class: 'tc-name', text: t.name })));
  }
  return group;
}
