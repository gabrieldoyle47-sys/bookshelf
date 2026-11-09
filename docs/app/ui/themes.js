/**
 * A person's look, worn by their pages: a colour palette that tints the
 * background, surfaces, buttons and tabs (Classic is the site's own look,
 * untouched), a heading typeface, and the wood of their bookcase. The room
 * itself - which room, its walls, rug, lamps and the seasons - is drawn by
 * the bookshelf page from the same look (library.js, room.js).
 *
 * The palette and wood are CSS (style.css, "Profile themes"); this sets which
 * are on, and draws the wallpaper, which needs the accent baked into it.
 */

import { PROFILE_THEMES, PROFILE_FONTS, lookOf } from '../core/model.js';

/** Themes are on: each profile's pages wear its owner's look. */
export const THEMES_ON = true;

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

/** The palette in a profile's look. */
export const themeOf = (profile) => PROFILE_THEMES.find((t) => t.id === lookOf(profile).palette) ?? PROFILE_THEMES[0];

/**
 * Put a look on the page, or (with null) the site's own. Applies to <html>,
 * so every page of that profile wears it until another profile is shown.
 */
export function applyLook(look) {
  const root = document.documentElement;
  const theme = look ? PROFILE_THEMES.find((t) => t.id === look.palette) : null;
  const font = look ? PROFILE_FONTS.find((f) => f.id === look.font) : null;

  if (font && font.id !== 'classic') root.dataset.font = font.id; else delete root.dataset.font;
  if (look && look.wood !== 'room' && look.wood !== 'walnut') root.dataset.wood = look.wood; else delete root.dataset.wood;

  if (!theme || theme.id === 'classic') {
    delete root.dataset.ptheme;
    root.style.removeProperty('--wallpaper');
    root.style.removeProperty('--p-accent');
    root.style.removeProperty('--p-accent-2');
    return;
  }
  root.dataset.ptheme = theme.id;
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

/** Kept for callers that think in palettes: a palette alone, everything else default. */
export const applyTheme = (theme) => applyLook(theme ? { ...lookOf({}), palette: theme.id } : null);
