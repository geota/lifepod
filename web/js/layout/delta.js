// Where a life burst's running delta sits (MANA-UNDO-SPEC §6.2b, moved in alpha.20): directly above its total, centred
// on it, in the face's own coordinates, so it faces the player on every seat. CSS centres it (css/tile.css); this sets
// how high it sits. It rests `gap` above the digits' tops, as the font draws them, and keeps 2px below whatever is above
// the total: the far row, the folded mana chip under it, and the far edge itself, which keeps clear of the pill
// (--far-offset). Where the room between them is shorter than the delta, its type shrinks toward its 14px floor; where
// even that doesn't fit, it keeps those 2px and comes down over the digits' tops only as far as it must, like a badge on
// the number. It takes no room, so nothing refits for it.

import { board } from '../ui/dom.js';

const gap = 2;
const clearance = 2;
// The capsule's smallest type (css/tile.css draws it at 0.3 of the total, never under this).
const minimumSize = 14;
/** @type {CanvasRenderingContext2D | null} */
let context = null;

// How far below the top of its box a total's digits start: the line box's half-leading plus the font's ascent, less the
// digits' own ascent, measured in the total's font.
/** @param {HTMLOutputElement} score */
function digitsInset(score) {
  const style = getComputedStyle(score);
  const size = parseFloat(style.fontSize);
  context ??= document.createElement('canvas').getContext('2d');
  if (!context) return 0;
  context.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
  const metrics = context.measureText(score.value || '0');
  const line = parseFloat(style.lineHeight) || size;
  const ascent = metrics.fontBoundingBoxAscent ?? size * 0.8;
  const descent = metrics.fontBoundingBoxDescent ?? size * 0.2;
  return Math.max(0, (line - ascent - descent) / 2 + ascent - metrics.actualBoundingBoxAscent);
}

/** @param {Element} player */
export function placeLifeDelta(player) {
  const delta = /** @type {HTMLElement | null} */ (player.querySelector('.life-delta'));
  const value = /** @type {HTMLElement | null} */ (delta?.firstElementChild);
  if (!delta || !value || delta.hidden) return;
  const face = /** @type {HTMLElement} */ (player.querySelector('.player-face'));
  /** @param {HTMLElement} node */
  const top = (node) => {
    let at = /** @type {HTMLElement | null} */ (node);
    let y = 0;
    for (; at && at !== face; at = /** @type {HTMLElement | null} */ (at.offsetParent)) y += at.offsetTop;
    return y;
  };
  const score = /** @type {HTMLOutputElement} */ (player.querySelector('.score'));
  const line = parseFloat(getComputedStyle(score).lineHeight) || score.offsetHeight;
  const digits = top(score) + (score.offsetHeight - line) / 2 + digitsInset(score);
  const above = [.../** @type {NodeListOf<HTMLElement>} */ (face.querySelectorAll('.badges.far > *, .mana-far > *'))].filter(node => node.offsetWidth);
  const ceiling = Math.max(top(/** @type {HTMLElement} */ (face.querySelector('.far-edge'))), ...above.map(node => top(node) + node.offsetHeight)) + clearance;
  // Where the room is short, the capsule first shrinks toward its 14px floor, then comes down over the digits' tops.
  value.style.removeProperty('font-size');
  const room = digits - gap - ceiling;
  if (value.offsetHeight > room) {
    const size = parseFloat(getComputedStyle(value).fontSize);
    const fitted = Math.max(minimumSize, Math.floor(size * Math.max(0, room) / value.offsetHeight * 10) / 10);
    if (fitted < size - 0.05) value.style.setProperty('font-size', `${fitted}px`);
  }
  const wanted = Math.max(ceiling, digits - gap - value.offsetHeight);
  const offset = `${Math.round((wanted - top(delta)) * 10) / 10}px`;
  if (value.style.getPropertyValue('top') !== offset) value.style.setProperty('top', offset);
}

// Every delta that's showing, after a fit has moved or resized the totals.
export function placeLifeDeltas() {
  for (const player of board.querySelectorAll('.player:has(.life-delta:not([hidden]))')) placeLifeDelta(player);
}
