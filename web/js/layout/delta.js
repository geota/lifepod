// Where a life burst's running delta sits (MANA-UNDO-SPEC §6.2b, moved in alpha.20), in the face's own coordinates, so it
// faces the player on every seat. It takes no room, so nothing refits for it; this only sets its place and, where room is
// short, its type.
//   1. Directly above the total, centred on it: `gap` above the digits' tops, as the font draws them, and 2px below
//      whatever is above the total (the far row, the folded mana chip under it, and the far edge itself, which keeps
//      clear of the pill through --far-offset). Where that room is short, its type first shrinks toward its 14px floor.
//   2. Where even that doesn't fit, beside the total, `gap` from the digits: at their vertical centre, or as near it as
//      is 2px clear of the − and + glyphs, the rows, the face's edges and the pill (on a short tile, above or below the
//      glyph), no further than its own height past the digits' top or bottom; on the side away from the pill where it
//      fits, else the other; at full type, then shrinking toward the floor, and on the tightest tiles below it, to 10px,
//      rather than cover the digits.
//   3. Only if nothing fits even then, the last resort: above, coming down over the digits' tops as far as it must.

import { board } from '../ui/dom.js';

const gap = 2;
const clearance = 2;
// The capsule's smallest type (css/tile.css draws it at 0.3 of the total, never under this).
const minimumSize = 14;
// The smallest it may go where nothing off the digits fits at the floor: still a legible figure.
const smallestSize = 10;
/** @type {CanvasRenderingContext2D | null} */
let context = null;

/** @typedef {{ left: number, top: number, right: number, bottom: number }} Box */

// Where a total's digits start and end below the top of its box: the line box's half-leading plus the font's ascent
// gives the baseline (digits have no descenders), less the digits' own ascent their top, measured in the total's font.
/** @param {HTMLOutputElement} score */
function digitsInset(score) {
  const style = getComputedStyle(score);
  const size = parseFloat(style.fontSize);
  context ??= document.createElement('canvas').getContext('2d');
  if (!context) return { top: 0, bottom: size };
  context.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
  // Every digit, not just the total's own: the tallest sets the top, so the delta doesn't shift as the number changes
  // (and it's measured before the total redraws).
  const metrics = context.measureText('0123456789');
  const line = parseFloat(style.lineHeight) || size;
  const ascent = metrics.fontBoundingBoxAscent ?? size * 0.8;
  const descent = metrics.fontBoundingBoxDescent ?? size * 0.2;
  const baseline = (line - ascent - descent) / 2 + ascent;
  return { top: Math.max(0, baseline - metrics.actualBoundingBoxAscent), bottom: Math.min(line, baseline) };
}

/** @param {Box} a @param {Box} b */
const overlaps = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

/** @param {Element} player */
export function placeLifeDelta(player) {
  const delta = /** @type {HTMLElement | null} */ (player.querySelector('.life-delta'));
  const value = /** @type {HTMLElement | null} */ (delta?.firstElementChild);
  if (!delta || !value || delta.hidden) return;
  const face = /** @type {HTMLElement} */ (player.querySelector('.player-face'));
  /** @param {HTMLElement} node @returns {Box} */
  const box = (node) => {
    let at = /** @type {HTMLElement | null} */ (node);
    let x = 0;
    let y = 0;
    for (; at && at !== face; at = /** @type {HTMLElement | null} */ (at.offsetParent)) {
      x += at.offsetLeft;
      y += at.offsetTop;
    }
    return { left: x, top: y, right: x + node.offsetWidth, bottom: y + node.offsetHeight };
  };
  const score = /** @type {HTMLOutputElement} */ (player.querySelector('.score'));
  const scoreBox = box(score);
  const line = parseFloat(getComputedStyle(score).lineHeight) || score.offsetHeight;
  const inset = digitsInset(score);
  const digits = { left: scoreBox.left, right: scoreBox.right, top: scoreBox.top + (score.offsetHeight - line) / 2 + inset.top, bottom: scoreBox.top + (score.offsetHeight - line) / 2 + inset.bottom };
  const rows = [.../** @type {NodeListOf<HTMLElement>} */ (face.querySelectorAll('.badges.far > *, .mana-far > *, .mana-strip, .badges.near > *'))].filter(node => node.offsetWidth).map(box);
  const above = [.../** @type {NodeListOf<HTMLElement>} */ (face.querySelectorAll('.badges.far > *, .mana-far > *'))].filter(node => node.offsetWidth);
  const ceiling = Math.max(box(/** @type {HTMLElement} */ (face.querySelector('.far-edge'))).top, ...above.map(node => box(node).bottom)) + clearance;
  const anchor = box(delta);
  value.style.removeProperty('font-size');
  const natural = parseFloat(getComputedStyle(value).fontSize);
  /** @param {number} size */
  const setSize = (size) => {
    if (size < natural - 0.05) value.style.setProperty('font-size', `${size}px`);
    else value.style.removeProperty('font-size');
  };
  // The type that fits `room` px, from what the capsule measures at full type, no smaller than the floor.
  /** @param {number} room @param {number} measured */
  const shrunk = (room, measured) => Math.max(minimumSize, Math.floor(natural * Math.max(0, room) / measured * 10) / 10);
  /** @param {number | null} x the capsule's centre, or null for centred on the total (by CSS, exactly) @param {number} y its top */
  const place = (x, y) => {
    const left = x === null ? '0px' : `${Math.round((x - (anchor.left + anchor.right) / 2) * 10) / 10}px`;
    const top = `${Math.round((y - anchor.top) * 10) / 10}px`;
    if (value.style.getPropertyValue('left') !== left) value.style.setProperty('left', left);
    if (value.style.getPropertyValue('top') !== top) value.style.setProperty('top', top);
  };

  // 1. Above, at full type or shrunk toward the floor.
  const room = digits.top - gap - ceiling;
  if (value.offsetHeight > room) setSize(shrunk(room, value.offsetHeight));
  if (value.offsetHeight <= room + 0.5) {
    place(null, digits.top - gap - value.offsetHeight);
    return;
  }

  // 2. Beside the total, away from the pill first. Each side's room runs from the digits to its glyph, 2px from each.
  const glyphs = /** @type {HTMLElement[]} */ ([...face.querySelectorAll('.controls .subtract, .controls .add')]).filter(node => node.offsetWidth).map((button) => {
    const own = box(button);
    const icon = button.querySelector('.icon');
    const size = icon ? icon.getBoundingClientRect().width : 0;
    const middle = { x: (own.left + own.right) / 2, y: (own.top + own.bottom) / 2 };
    const screen = button.getBoundingClientRect();
    return { box: { left: middle.x - size / 2, right: middle.x + size / 2, top: middle.y - size / 2, bottom: middle.y + size / 2 }, screen };
  });
  const pill = document.querySelector('#board-controls')?.getBoundingClientRect();
  const distance = (/** @type {DOMRect} */ rect) => (pill ? Math.hypot((rect.left + rect.right - pill.left - pill.right) / 2, (rect.top + rect.bottom - pill.top - pill.bottom) / 2) : 0);
  const sides = glyphs.map(glyph => ({ glyph, before: glyph.box.right <= digits.left, far: distance(glyph.screen) }))
    .sort((a, b) => b.far - a.far);
  // At the digits' height where that's clear of the glyph and the rows; otherwise as near it as is clear, up toward the
  // far row or down toward the near one, which a short tile's glyph leaves room for above or below it.
  const middle = (digits.top + digits.bottom) / 2;
  const blockers = [...rows, ...glyphs.map(glyph => glyph.box)].map(item => ({ left: item.left - clearance, right: item.right + clearance, top: item.top - clearance, bottom: item.bottom + clearance }));
  const clearOfPill = () => {
    const own = value.getBoundingClientRect();
    return !pill || !overlaps(own, pill);
  };
  /** @param {number | 'span'} wanted @param {{ glyph: { box: Box }, before: boolean }} side */
  const beside = (wanted, { glyph, before }) => {
    const span = before ? digits.left - gap - (glyph.box.right + clearance) : glyph.box.left - clearance - (digits.right + gap);
    setSize(wanted === 'span' ? shrunk(span, value.offsetWidth * natural / parseFloat(getComputedStyle(value).fontSize)) : wanted);
    const width = value.offsetWidth;
    const height = value.offsetHeight;
    const x = before ? digits.left - gap - width / 2 : digits.right + gap + width / 2;
    if (x - width / 2 < 0 || x + width / 2 > face.offsetWidth) return false;
    const centred = middle - height / 2;
    // The tops worth trying, nearest the centred one first: it, and each place where the capsule just meets the ceiling
    // or a blocker's edge, since a clear spot that isn't centred always rests against one of those.
    const tops = [centred, ceiling, ...blockers.flatMap(item => [item.bottom, item.top - height])]
      .filter(y => y >= ceiling && y + height >= digits.top - height && y <= digits.bottom + height && y + height <= face.offsetHeight)
      .sort((a, b) => Math.abs(a - centred) - Math.abs(b - centred));
    for (const y of tops) {
      const spot = { left: x - width / 2, right: x + width / 2, top: y, bottom: y + height };
      if (blockers.some(item => overlaps(spot, item))) continue;
      place(x, y);
      if (clearOfPill()) return true;
    }
    return false;
  };
  // At full type, then shrunk toward the floor; on the tightest tiles (5 and 6 players at 568 x 320 with mana floating,
  // say) only a smaller capsule fits anywhere off the digits, so it goes on down to smallestSize.
  const sizes = [natural, 'span', ...Array.from({ length: minimumSize - smallestSize }, (_, at) => minimumSize - 1 - at)];
  for (const wanted of /** @type {(number | 'span')[]} */ (sizes)) {
    if (sides.some(side => beside(wanted, side))) return;
  }

  // 3. The last resort, which no board in the sweep reaches: above, over the digits' tops as little as it must.
  setSize(shrunk(room, value.offsetHeight));
  place(null, Math.max(ceiling, digits.top - gap - value.offsetHeight));
}

// Every delta that's showing, after a fit has moved or resized the totals.
export function placeLifeDeltas() {
  for (const player of board.querySelectorAll('.player:has(.life-delta:not([hidden]))')) placeLifeDelta(player);
}
