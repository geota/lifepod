// The page-wide settings that only set an attribute for the CSS: the tile colour set, the badge size and the style.

import { defaultStyle } from '../state/platform.js';
import { game } from '../state/state.js';
import { board } from '../ui/dom.js';

// Settings → Table → Tile colours, on the page's root.
export function applyTileColours() {
  document.documentElement.dataset.tiles = game.tileColours;
}

// Settings → Table → Badge size, on the board.
export function applyBadgeSize() {
  if (game.badgeSize === 'default') delete board.dataset.badgeSize;
  else board.dataset.badgeSize = game.badgeSize;
}

// Settings → Table → Style: the player's pick, or the platform's default until there is one.
export const currentStyle = () => game.style ?? defaultStyle;
export function applyStyle() {
  document.documentElement.dataset.style = currentStyle();
}
