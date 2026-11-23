// Fitting the badge rows and the mana strips (design/polish/SPEC.md §3.2 and §9): auto-drop's steps, taken board-wide
// so every tile matches, the last resorts (wrapping, then shrinking the type), the strips' places, the life totals'
// size and place around them, and where a turn reminder sits. requestFit queues one fit for whatever just changed the rows, and a fit whose inputs match the last
// one's is skipped (docs/review/PERFORMANCE.md P3).

import { trackedDesignations } from '../logic/rules.js';
import { game, shownReminders } from '../state/state.js';
import { board, boardControls } from '../ui/dom.js';

// Auto-drop (design/polish/SPEC.md §3.2): what gives way, first to go first, when a badge row is wider than its
// tile. Each row first drops words and marks: on the near row the identity's name, the turn chip's word "Turn" and the
// hint's "Pass it on" (leaving the untap symbol and "T" with the round), then the identity's symbol where the indicator
// also shows. The indicator always stays and the identity chip never goes: a chip that shows only the name keeps it. On
// the far row, the sword. A drop hides something on every tile (CSS reads its token from data-drop on each tile's edge,
// and #board's data-drop lists them all once a fit is done). Then come
// the row's last resorts (lastResorts): wrapping onto a second line, growing toward the total, then shrinking the type,
// no smaller than typeFloor. A side whose second line would cover a total or its glyphs shrinks first and wraps last.
// Counts, the monarch's crown and the initiative's castle never give way.
const dropSteps = {
  near: [
    { drop: 'name', selector: '.ci-chip :is(.ci, .id-symbol) ~ .id-name, .turn-chip .turn-word, .pass-chip .pass-word' },
    { drop: 'symbol', selector: '.ci-chip .ci ~ .id-symbol' },
  ],
  far: [{ drop: 'sword', selector: '.sword' }],
};
// The mana strip has no steps of its own: it has a row to itself, and its type never shrinks (fitStrips).

// A badge row's wrap token, and the smallest type a row shrinks to, which keeps a count legible.
const wrapTokens = { near: 'wrap', far: 'wrap-far' };
const typeFloor = 9;
// A dropped item comes back only when every row would fit it with this much to spare, so counts ticking up and
// down by one can't make it blink.
const dropSlack = 1.15;
// How many auto-drop steps each badge row has taken, board-wide. A new game starts again from none. Past its drops, a
// row's level counts its last resorts; wrapFirst says, for each side, whether wrapping comes before shrinking.
let dropLevels = { near: 0, far: 0 };
let wrapFirst = { near: true, far: true };
let fitQueued = false;
// What the last fit fitted (fitInputs), so a fit of the same board can be skipped.
let fitted = '';
// How many times the board was measured and its rows fitted, and how many fits were skipped, for the tests and the
// design scripts, which read it from this module (await import('/js/layout/fit.js') in the page).
export const layoutStats = { measures: 0, fits: 0, skippedFits: 0 };

// A new game, a new Badge size or a font that has arrived fits the rows again from full size.
export function resetDrops() {
  dropLevels = { near: 0, far: 0 };
  fitted = '';
}

// How many faces the page has loaded so far. A face that arrives changes the text's widths, so it's part of a fit's
// inputs, and app.js refits on a font event only when this has grown. Faces are counted by what they are, not by
// their status now: Chromium makes its @font-face faces again on a resize, unloaded for a moment, and that isn't a
// new font.
const seenFaces = new Set();
export function loadedFaces() {
  for (const face of document.fonts ?? []) {
    if (face.status === 'loaded') seenFaces.add(`${face.family} ${face.weight} ${face.style} ${face.stretch} ${face.unicodeRange}`);
  }
  return seenFaces.size;
}

// Everything a fit reads, as one string: the window, the loaded faces, the drop levels, the page's, board's and pill's
// attributes (the board's style carries --ui, --ub and --board-digits, the pill's its place), and each tile's attributes
// and rows (the far edge, the mana strip and the near row). A row's chips are read with every digit as 0, since chips
// use tabular figures: 3 → 2 changes no width, while 9 → 10 or a chip that comes or goes does. ARIA attributes change
// no width either. The last fit's own results (drop tokens, type sizes, the strips' places, the totals' size and lift)
// are part of it too, so a board left as fitted reads the same.
function fitInputs() {
  const attributes = (node, skip = []) => [...node.attributes].filter(({ name }) => !skip.includes(name)).map(({ name, value }) => `${name}=${value}`).join(' ');
  const rows = html => html.replace(/\saria-[\w-]+="[^"]*"/g, '').replace(/\d/g, '0');
  const pill = [...boardControls.querySelectorAll('.pill-button')].map(button => (button.hidden ? 0 : 1)).join('');
  const tiles = [.../** @type {HTMLCollectionOf<HTMLElement>} */ (board.children)].map((player) => {
    const part = selector => /** @type {HTMLElement} */ (player.querySelector(selector));
    return `${attributes(player, ['data-reminder', 'aria-label'])} ${attributes(part('.controls'))}\n${rows(part('.far-edge').outerHTML)}\n${rows(part('.mana-strip').outerHTML)}\n${rows(part('.badges.near').outerHTML)}`;
  });
  return [window.innerWidth, window.innerHeight, loadedFaces(), JSON.stringify(dropLevels), JSON.stringify(wrapFirst), remindersCanShow(),
    attributes(document.documentElement), attributes(board), attributes(boardControls), pill, ...tiles].join('\n');
}

// css/tokens.css's --grow in pixels: 1 on phones, up to 2 on tablets.
export function growPixel() {
  return Math.min(2, Math.max(1, Math.min(window.innerWidth, window.innerHeight) / 430));
}

// Badge rows are fitted once whatever changed them has finished, so a loop over the tiles fits only the end result.
export function requestFit() {
  if (fitQueued) return;
  fitQueued = true;
  queueMicrotask(fitBadgeRows);
}

// The badge rows are fitted first around totals at their own size, with every mana strip on its own row, then each strip
// takes the first place that fits and the totals make room for it (fitStrips).
function fitBadgeRows() {
  fitQueued = false;
  if (fitInputs() === fitted) {
    layoutStats.skippedFits++;
    return;
  }
  layoutStats.fits++;
  resetScore();
  measureBadgeRoom();
  for (const player of /** @type {HTMLCollectionOf<HTMLElement>} */ (board.children)) {
    if (/** @type {HTMLElement} */ (player.querySelector('.mana-strip')).hidden) delete player.dataset.strip;
    else player.dataset.strip = 'row';
  }
  fitBadgeSide('near');
  fitBadgeSide('far');
  fitStrips();
  // A turn reminder's place depends on how tall the near edge came out.
  for (const index of shownReminders.keys()) placeReminders(board.children[index]);
  syncBoardDrops();
  fitted = fitInputs();
}

// How large a badge row may grow at a larger Badge size (css/tile.css): one row, 1.7em tall, between each edge and the
// total, its − and + glyphs and the "Out" tag, on every tile, measured in each face's own coordinates.
function measureBadgeRoom() {
  const edge = 8 * growPixel();
  let far = Infinity;
  let near = Infinity;
  for (const player of /** @type {HTMLCollectionOf<HTMLElement>} */ (board.children)) {
    const face = /** @type {HTMLElement} */ (player.querySelector('.player-face'));
    const parts = [.../** @type {NodeListOf<HTMLElement>} */ (face.querySelectorAll('.score, .out-tag, .controls button'))].filter(part => part.offsetWidth);
    if (!parts.length) continue;
    const clear = side => parseFloat(player.style.getPropertyValue(`--clear-${side}`)) || 0;
    // The far row sits at its tile's --far-offset (measureBoard), which is at least its own clearance.
    const farOffset = parseFloat(player.style.getPropertyValue('--far-offset')) || 0;
    far = Math.min(far, Math.min(...parts.map(part => part.offsetTop)) - Math.max(edge, farOffset) - 2);
    near = Math.min(near, face.offsetHeight - Math.max(edge, clear('near')) - Math.max(...parts.map(part => part.offsetTop + part.offsetHeight)) - 2);
  }
  const set = (property, room) => {
    const value = `${Math.max(0, Math.floor(room / 1.7 * 10) / 10)}px`;
    if (Number.isFinite(room) && board.style.getPropertyValue(property) !== value) board.style.setProperty(property, value);
  };
  set('--far-room', far);
  set('--near-room', near);
}

// Writes each side's drop tokens on the tiles' edges: the near row's on .near-edge, the far row's on .far-edge. Written
// there rather than on #board, a fit's trial steps restyle only the rows (PERFORMANCE.md F1).
function syncDropTokens(levels) {
  const near = dropTokens('near', levels.near).join(' ');
  const far = dropTokens('far', levels.far).join(' ');
  for (const [selector, tokens] of /** @type {const} */ ([['.near-edge', near], ['.far-edge', far]])) {
    for (const edge of /** @type {NodeListOf<HTMLElement>} */ (board.querySelectorAll(selector))) {
      if (tokens === (edge.dataset.drop ?? '')) continue;
      if (tokens) edge.dataset.drop = tokens;
      else delete edge.dataset.drop;
    }
  }
}

// #board's data-drop lists every token the fit took, for the tests and the design scripts; nothing styles from it.
function syncBoardDrops() {
  const tokens = Object.keys(dropSteps).flatMap(side => dropTokens(side, dropLevels[side])).join(' ');
  if (tokens === (board.dataset.drop ?? '')) return;
  if (tokens) board.dataset.drop = tokens;
  else delete board.dataset.drop;
}

// The drop tokens a side has at a level. A step that would hide nothing on the board is skipped.
function dropTokens(side, level, rows = badgeRows(side)) {
  const tokens = dropSteps[side].slice(0, level)
    .filter(step => step.drop && (!step.selector || rows.some(row => row.querySelector(step.selector))))
    .map(step => step.drop);
  if (lastResorts(side, level).wrap) tokens.push(wrapTokens[side]);
  return tokens;
}

// Which of a badge row's last resorts a level has taken: its first level past the drops wraps the row (or shrinks its
// type, where wrapping would cover the total), and the next does both.
function lastResorts(side, level) {
  const past = level - dropSteps[side].length;
  return { wrap: past >= (wrapFirst[side] ? 1 : 2), shrink: past >= (wrapFirst[side] ? 2 : 1) };
}

// Whether any chip in a row covers its tile's life total, the − and + glyphs or the "Out" tag.
function rowCovers(row) {
  const face = row.closest('.player-face');
  const blockers = [face.querySelector('.score'), face.querySelector('.out-tag'), ...face.querySelectorAll('.controls button')]
    .filter(blocker => blocker.offsetWidth).map(blocker => blocker.getBoundingClientRect());
  return [...row.children].some(chip => chip.offsetWidth && blockers.some(blocker => overlaps(chip.getBoundingClientRect(), blocker)));
}

// How many lines a row's chips take as it's laid out.
function rowLines(row) {
  return new Set([...row.children].filter(chip => chip.offsetWidth).map(chip => chip.offsetTop)).size;
}

// Whether a row fits at its current type: on one line, or, where it may wrap, on two lines that leave the total and the
// glyphs clear. With slack, the chips must fit with that much to spare. A pixel to spare absorbs each chip's rounding.
function rowFits(row, wrap, slack = 1) {
  const room = row.clientWidth - 1;
  if (!wrap) return chipsWidth(row) * slack <= room;
  const chips = [...row.children].filter(chip => chip.offsetWidth);
  let lines = rowLines(row);
  if (slack > 1) {
    // The lines the chips would take with slack to spare, packed as a wrapping flex row packs them.
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    let used = 0;
    lines = 1;
    for (const chip of chips) {
      const width = chip.offsetWidth * slack;
      if (used && used + gap + width > room) {
        lines += 1;
        used = width;
      } else used += (used ? gap : 0) + width;
    }
  }
  return lines <= 2 && chips.every(chip => chip.offsetWidth <= room + 1) && (lines < 2 || !rowCovers(row));
}

// The fit's type sizes go on each tile's edges, the near row's on .near-edge and the far row's on .far-edge, not on
// #board: a size written on the board restyles every element on it, and the fit writes one at every step it tries
// (docs/review/PERFORMANCE.md P10). Every tile gets the same size, so the board stays uniform. The totals' size goes on
// each tile's .controls for the same reason (fitScore).
const sizeEdges = { near: '.near-edge', far: '.far-edge' };
// A row's full type, where it starts from a smaller Badge size's (fitBadgeSide), goes there too, under its own name, so
// --near-badge-size and --far-badge-size still mean only that the type shrank.
const sizeProperties = { near: '--near-badge-size', far: '--far-badge-size' };
const fullProperties = { near: '--near-full-size', far: '--far-full-size' };
/**
 * @param {'near' | 'far'} side
 * @param {number | null} size null for full type
 */
function setRowSize(side, size) {
  setEdges(side, sizeProperties[side], size === null ? '' : `${size}px`);
}
/**
 * @param {'near' | 'far'} side
 * @param {number | string | null} size null for the Badge size's own full type, or a CSS length
 */
function setRowFull(side, size) {
  setEdges(side, fullProperties[side], size === null ? '' : typeof size === 'number' ? `${size}px` : size);
}
function setEdges(side, property, value) {
  for (const edge of /** @type {NodeListOf<HTMLElement>} */ (board.querySelectorAll(sizeEdges[side]))) {
    if (edge.style.getPropertyValue(property) === value) continue;
    if (value) edge.style.setProperty(property, value);
    else edge.style.removeProperty(property);
  }
}

function badgeRows(side) {
  return [...board.querySelectorAll(`.badges.${side}`)].filter(row => !row.hidden && row.offsetParent !== null && row.childElementCount);
}

// The chips' width on one line at the row's current type, wherever they wrap: each chip shown and the gaps between.
function chipsLineWidth(row) {
  const chips = [...row.children].filter(chip => chip.offsetWidth);
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  return chips.reduce((sum, chip) => sum + chip.offsetWidth, 0) + gap * Math.max(0, chips.length - 1);
}

// The chips' width at the row's current type, from the first chip shown to the last, gaps included.
function chipsWidth(row) {
  const chips = [...row.children].filter(chip => chip.offsetWidth);
  if (!chips.length) return 0;
  const last = chips.at(-1);
  return last.offsetLeft + last.offsetWidth - chips[0].offsetLeft;
}

// The scales of the Badge sizes below Larger (css/tile.css's --badge-scale): Large and Default.
const smallerScales = [1.2, 1];

// Fits one side of the board's badge rows, and keeps Badge size monotonic: a larger size never draws a row smaller than
// a smaller size would on the same board. A row at a larger size has taller chips, so its second line can reach the
// total where a smaller size's doesn't; it then shrinks on one line instead of wrapping, and can come out below the
// smaller size's full type. So when the rows have to shrink, the fit tries again from each smaller size's full type,
// as long as that's larger than what it has, and keeps whichever draws the largest type (the larger size on a tie).
function fitBadgeSide(side) {
  const rows = badgeRows(side);
  setRowSize(side, null);
  setRowFull(side, null);
  if (!rows.length) {
    syncDropTokens(dropLevels);
    return;
  }
  const current = dropLevels[side];
  let best = fitSideFrom(side, rows, null, current);
  if (best.size !== null) {
    for (const full of smallerFullSizes(side, rows[0])) {
      if (best.drawn >= full - 0.01) break;
      const next = fitSideFrom(side, rows, full, current);
      if (next.drawn > best.drawn + 0.01) best = next;
      if (next.size === null) break;
    }
  }
  dropLevels = { ...dropLevels, [side]: best.level };
  wrapFirst = { ...wrapFirst, [side]: best.wrapFirst };
  syncDropTokens(dropLevels);
  setRowFull(side, best.full);
  setRowSize(side, best.size);
}

// Each smaller Badge size's full type on a side, largest first and below this Badge size's full type: the default
// badge size times its scale, capped by the side's room (measureBadgeRoom) and never below the default.
function smallerFullSizes(side, row) {
  setRowSize(side, null);
  setRowFull(side, null);
  const full = parseFloat(getComputedStyle(row).fontSize);
  setRowFull(side, 'var(--badge-size)');
  const badgeSize = parseFloat(getComputedStyle(row).fontSize);
  const measured = parseFloat(board.style.getPropertyValue(`--${side}-room`));
  const room = Number.isNaN(measured) ? Infinity : measured;
  return smallerScales.map(scale => Math.max(badgeSize, Math.min(badgeSize * scale, room)))
    .filter(size => size < full - 0.01);
}

// Takes the fewest steps that make every row on one side of the board fit at the same type size, from a full type
// (null for the Badge size's own), without keeping the result: it returns the level, the wrap order, the shrunk size
// (null if the type stays full) and the type that draws. The busiest tile decides for every tile, so the board stays
// uniform. A step already taken (current) is only undone when the rows would fit without it with 15% to spare.
/**
 * @param {'near' | 'far'} side
 * @param {HTMLElement[]} rows
 * @param {number | null} full
 * @param {number} current
 */
function fitSideFrom(side, rows, full, current) {
  const drops = dropSteps[side].length;
  const highest = drops + 2;
  setRowSize(side, null);
  setRowFull(side, full);
  const base = parseFloat(getComputedStyle(rows[0]).fontSize);
  const floor = Math.min(typeFloor, base);
  // Sets a level and a type size (null for full type), and says whether every row then fits.
  const fitsAt = (level, size, slack = 1) => {
    syncDropTokens({ ...dropLevels, [side]: level });
    setRowSize(side, size);
    return rows.every(row => rowFits(row, lastResorts(side, level).wrap, slack));
  };
  // A level that shrinks the type fits if its rows fit at the floor.
  const fits = (level, slack = 1) => fitsAt(level, lastResorts(side, level).shrink ? floor : null, slack);
  // Wrapping comes before shrinking, unless a second line would cover a total or its glyphs.
  wrapFirst = { ...wrapFirst, [side]: true };
  fitsAt(drops + 1, null);
  wrapFirst = { ...wrapFirst, [side]: !rows.some(row => rowLines(row) > 1 && rowCovers(row)) };
  let needed = 0;
  while (needed < highest && !fits(needed)) needed++;
  let level = needed;
  const taken = Math.min(current, highest);
  if (needed < taken) {
    const kept = dropTokens(side, taken, rows).length;
    level = taken;
    for (let candidate = needed; candidate < taken; candidate++) {
      if (dropTokens(side, candidate, rows).length === kept || fits(candidate, dropSlack)) {
        level = candidate;
        break;
      }
    }
  }
  const result = { level, wrapFirst: wrapFirst[side], full, size: /** @type {number | null} */ (null), drawn: base };
  if (!lastResorts(side, level).shrink) return result;
  // The type shrinks from an estimate, then steps down, measured again after each step, until every row fits or it
  // reaches the floor. Text doesn't shrink exactly in proportion (gaps, padding and rounding don't), so the estimate
  // alone can leave a row a few pixels too wide.
  fitsAt(level, null);
  const lines = lastResorts(side, level).wrap ? 2 : 1;
  const estimate = Math.min(...rows.map((row) => {
    const width = chipsLineWidth(row);
    return width > 0 ? base * Math.min(1, (lines * (row.clientWidth - 1)) / width) : base;
  }));
  let size = Math.max(floor, Math.floor(estimate * 10) / 10);
  while (!fitsAt(level, size) && size > floor) size = Math.max(floor, Math.round((size - 0.25) * 100) / 100);
  return { ...result, size, drawn: size };
}

// Whether two boxes overlap by more than a rounding error.
function overlaps(a, b) {
  return a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
}

// Floating mana has a row of its own, directly above the near row (design/polish/SPEC.md §9): it never shares a line with
// another badge, and commander damage keeps the far row. Each tile's strip takes the first of these places that fits:
//   'row': the strip on that row, where it fits across it at full type;
//   'fold': folded into one chip that shows the pool and opens mana mode, on that row;
//   'far': that chip under the far row, where the totals can't make room for the row without going below their floor;
//   'near': that chip at the end of the near row, the last resort, where even that can't fit.
// The strip's type never shrinks, so its symbols stay legible and every spend button a 44px target. What gives way first
// is the life total (fitScore).
const manaPlaces = ['row', 'fold', 'far', 'near'];
function fitStrips() {
  const strips = /** @type {HTMLElement[]} */ ([...board.querySelectorAll('.mana-strip')]).filter(strip => !strip.hidden && /** @type {HTMLElement} */ (strip.parentElement).offsetParent !== null);
  if (!strips.length) return;
  // Every strip is on its row (fitBadgeRows), and one wider than the row folds. Each is read, then each written, so
  // the board lays out once rather than once per strip (PERFORMANCE.md P8).
  const players = strips.map(strip => /** @type {HTMLElement} */ (strip.closest('.player')));
  const wide = strips.map(strip => strip.scrollWidth > /** @type {HTMLElement} */ (strip.parentElement).clientWidth + 1);
  players.forEach((player, index) => {
    if (wide[index]) player.dataset.strip = 'fold';
  });
  // Each round lays the board out once more: the totals fit around the mana rows, and the tile whose mana would take
  // them below their floor, or that a total would still cover, takes its next place. A chip that ends its near row
  // takes room from that row, so the near rows are fitted again around it.
  for (let round = 0; round < players.length * manaPlaces.length; round++) {
    const short = fitScore();
    if (!short) break;
    const place = manaPlaces[manaPlaces.indexOf(short.dataset.strip ?? '') + 1];
    short.dataset.strip = place;
    if (place === 'near') fitBadgeSide('near');
  }
}

// How far the life total gives way, as shares of its own size: to three quarters to keep a strip's spend buttons on the
// mana row, and to two thirds, its floor, for the folded chip there or under the far row. Never below the 2rem that's
// the smallest total CSS draws, or its own size.
const scoreFloor = { row: 0.75, chip: 2 / 3, least: 32 };
// The totals' own size this fit, read once before any shrinks them.
let naturalScore = 0;

// Every total back at its own size, centred on its tile, before the rows are fitted around it.
function resetScore() {
  naturalScore = 0;
  for (const controls of /** @type {NodeListOf<HTMLElement>} */ (board.querySelectorAll('.controls'))) {
    setStyle(controls, '--score-size', '');
    setStyle(controls, '--score-lift', '');
  }
}

/**
 * @param {HTMLElement} node
 * @param {string} property
 * @param {string} value '' to remove it
 */
function setStyle(node, property, value) {
  if (node.style.getPropertyValue(property) === value) return;
  if (value) node.style.setProperty(property, value);
  else node.style.removeProperty(property);
}

// Where a tile's total, and its − and + buttons, may sit between its rows, as bounds on its lift: how far the controls
// move from the face's middle toward its far edge (--score-lift). In the face's own coordinates, with its far edge at 0:
// the total keeps `gap` from every chip and strip above and below it (and its "Out" tag from those below), and the
// buttons from those beside them. For a size S, the lift must be at least low + S/2 and buttonLow, and at most
// high − S/2 and buttonHigh.
/** @param {HTMLElement} player */
function scoreRoom(player) {
  const face = /** @type {HTMLElement} */ (player.querySelector('.player-face'));
  /** @param {HTMLElement} node */
  const box = (node) => {
    let top = 0;
    let left = 0;
    for (let at = /** @type {HTMLElement | null} */ (node); at && at !== face; at = /** @type {HTMLElement | null} */ (at.offsetParent)) {
      top += at.offsetTop;
      left += at.offsetLeft;
    }
    return { top, left, bottom: top + node.offsetHeight, right: left + node.offsetWidth };
  };
  /** @param {string} selector */
  const boxes = selector => [.../** @type {NodeListOf<HTMLElement>} */ (face.querySelectorAll(selector))].filter(node => node.offsetWidth).map(box);
  const mana = ['row', 'fold', 'far'].includes(player.dataset.strip ?? '');
  const gap = mana ? 2 : 0;
  const buttons = boxes('.controls button');
  const beside = (/** @type {{ left: number, right: number }} */ item) => buttons.some(button => item.left < button.right && button.left < item.right);
  const farEdge = /** @type {HTMLElement} */ (face.querySelector('.far-edge'));
  const nearEdge = /** @type {HTMLElement} */ (face.querySelector('.near-edge'));
  const far = boxes('.badges.far > *, .mana-far > *');
  const near = boxes('.near-edge > .mana-strip, .badges.near > *');
  // Where turn reminders can show, the room one takes over the near edge on a short tile (placeReminders), its whole
  // width: a reminder lasts only seconds, so the totals keep clear of it rather than move for it.
  if (remindersCanShow()) {
    const top = nearEdge.offsetTop + nearEdge.offsetHeight - parseFloat(getComputedStyle(/** @type {HTMLElement} */ (face.querySelector('.reminders'))).fontSize) * 1.9;
    near.push({ top, left: 0, bottom: top, right: face.offsetWidth });
  }
  const lowest = (/** @type {{ bottom: number }[]} */ items) => Math.max(farEdge.offsetTop, ...items.map(item => item.bottom)) + gap;
  const highest = (/** @type {{ top: number }[]} */ items) => Math.min(nearEdge.offsetTop + nearEdge.offsetHeight, ...items.map(item => item.top)) - gap;
  const out = /** @type {HTMLElement} */ (face.querySelector('.out-tag'));
  const hang = out.offsetWidth ? box(out).bottom - box(/** @type {HTMLElement} */ (face.querySelector('.controls'))).bottom : 0;
  const middle = face.offsetHeight / 2;
  const half = Math.max(0, ...buttons.map(button => button.bottom - button.top)) / 2;
  return {
    player, mana, low: middle - highest(near) + hang, high: middle - lowest(far),
    buttonLow: middle - Math.min(highest(near.filter(beside)), highest(near) - hang) + half, buttonHigh: middle - lowest(far.filter(beside)) - half,
  };
}

// Whether turn reminders can show (actions/reminders.js): Turn by turn, with Turn reminders on and the monarch or the
// initiative tracked.
function remindersCanShow() {
  return game.turns === 'turns' && game.reminders.turns && trackedDesignations(game).length > 0;
}

// The largest size, and a lift, that leave every tile in a group room, from their bounds (scoreRoom) combined.
/** @param {ReturnType<typeof scoreRoom>[]} rooms */
function sharedRoom(rooms) {
  const low = Math.max(...rooms.map(room => room.low));
  const high = Math.min(...rooms.map(room => room.high));
  const buttonLow = Math.max(...rooms.map(room => room.buttonLow));
  const buttonHigh = Math.min(...rooms.map(room => room.buttonHigh));
  const size = buttonLow > buttonHigh ? -Infinity : Math.min(high - low, 2 * (buttonHigh - low), 2 * (high - buttonLow));
  // The lift nearest the one wanted that fits a size (none by default: totals move only as far as they must), or null
  // if none does.
  const lift = (/** @type {number} */ size, wanted = 0) => {
    const least = Math.max(low + size / 2, buttonLow);
    const most = Math.min(high - size / 2, buttonHigh);
    return least > most + 0.05 ? null : Math.min(Math.max(wanted, least), most);
  };
  return { size, lift };
}

// The totals around the mana rows (design/polish/SPEC.md §9). Every total stays the same size (§3.1): the largest, up to
// its own, that leaves each tile's mana row and the rest of its rows clear, with each total and its − and + buttons moved
// toward the far row as little as that needs. Tiles whose far rows share a line move theirs alike, so a board row's
// totals stay in line, unless that alone would take the totals below their floor. Only tiles with mana on a row of its
// own, or under the far row, set the size; the others follow their line's lift as far as their own rows allow. Returns the
// tile with mana that would take the totals below their floor, or that a total would still cover, or null.
function fitScore() {
  const players = /** @type {HTMLElement[]} */ ([...board.children]).filter(player => player.offsetParent !== null);
  const scores = players.map(player => /** @type {HTMLElement} */ (player.querySelector('.score')));
  if (!naturalScore) naturalScore = parseFloat(getComputedStyle(scores[0]).fontSize);
  const rooms = players.map(scoreRoom);
  const own = new Map(rooms.map(room => [room, sharedRoom([room])]));
  // Where a tile's far edge is on the board, so tiles facing one line share a group (layout/board.js's farRowOffsets).
  const farLine = (/** @type {HTMLElement} */ player) => {
    const { offsetLeft: left, offsetTop: top } = player;
    const edge = player.dataset.edge ?? 'bottom';
    return `${edge} ${Math.round({ top: top + player.offsetHeight, left: left + player.offsetWidth, right: left }[edge] ?? top)}`;
  };
  /** @type {Map<string, ReturnType<typeof scoreRoom>[]>} */
  const groups = new Map();
  for (const room of rooms) groups.set(farLine(room.player), [...(groups.get(farLine(room.player)) ?? []), room]);
  // The smallest total a tile's mana place allows: a strip's spend buttons cost less of it than a chip may.
  const floor = (/** @type {ReturnType<typeof scoreRoom>} */ room) => Math.min(naturalScore, Math.max(scoreFloor.least, naturalScore * scoreFloor[room.player.dataset.strip === 'row' ? 'row' : 'chip']));
  const fits = (/** @type {ReturnType<typeof scoreRoom>} */ room) => /** @type {{ size: number }} */ (own.get(room)).size;
  let size = naturalScore;
  /** @type {Map<ReturnType<typeof scoreRoom>, ReturnType<typeof sharedRoom>['lift']>} */
  const lifts = new Map();
  for (const group of groups.values()) {
    const setters = group.filter(room => room.mana);
    if (!setters.length) continue;
    const shared = sharedRoom(setters);
    const alone = Math.min(...setters.map(fits));
    const apart = shared.size < alone - 0.05 && shared.size < Math.max(...setters.map(floor));
    size = Math.min(size, apart ? alone : shared.size);
    for (const room of group) lifts.set(room, apart ? /** @type {ReturnType<typeof sharedRoom>} */ (own.get(room)).lift : shared.lift);
  }
  size = Math.floor(Math.max(0, size) * 10) / 10;
  rooms.forEach((room, index) => {
    // A tile without mana follows its line's lift as far as its own rows let it, and otherwise stays put.
    const wanted = lifts.get(room)?.(size) ?? 0;
    const lift = room.mana ? wanted : own.get(room)?.lift(size, wanted) ?? 0;
    const controls = /** @type {HTMLElement} */ (scores[index].parentElement);
    setStyle(controls, '--score-size', size < naturalScore - 0.05 ? `${size}px` : '');
    setStyle(controls, '--score-lift', Math.abs(lift) >= 0.05 ? `${Math.round(lift * 10) / 10}px` : '');
  });
  // A tile whose mana alone would take the totals below what its place allows takes its next place, the tightest
  // first. A strip that the totals have shrunk for another tile's chip anyway keeps its spend buttons.
  const short = rooms.filter(room => room.mana && fits(room) < floor(room));
  if (short.length) return short.reduce((worst, room) => (fits(room) < fits(worst) ? room : worst)).player;
  const manaRooms = rooms.filter(room => room.mana);
  // Measured as drawn, in case the type's own metrics or rounding leave a strip on a total, its glyphs or the pill.
  const pill = pillBox();
  return manaRooms.find(({ player }) => {
    const mana = /** @type {HTMLElement} */ (player.querySelector(player.dataset.strip === 'far' ? '.mana-far' : '.mana-strip')).getBoundingClientRect();
    const blockers = [...player.querySelectorAll('.score, .out-tag, .controls button')].filter(blocker => /** @type {HTMLElement} */ (blocker).offsetWidth);
    return overlaps(mana, pill) || blockers.some(blocker => overlaps(mana, blocker.getBoundingClientRect()));
  })?.player ?? null;
}

// The pill as drawn, an eighth of its buttons in from its box.
function pillBox() {
  const controls = boardControls.getBoundingClientRect();
  const inset = controls.height > controls.width ? controls.width / 8 : controls.height / 8;
  return { left: controls.left + inset, right: controls.right - inset, top: controls.top + inset, bottom: controls.bottom - inset };
}

// A tile's reminders sit on their own line above the near edge where that's clear of the total, the − and + glyphs and
// the "Out" tag; otherwise, on a short tile, they take the near edge (its row and any mana strip) for their few seconds.
// Each stays on one line, dropping its "Monarch:" or "Initiative:" (the icon says it) and then wrapping, before it would
// leave the tile.
export function placeReminders(player) {
  const box = player?.querySelector('.reminders');
  if (!box) return;
  delete player.dataset.reminder;
  if (!box.childElementCount || box.offsetParent === null) return;
  for (const chip of box.children) {
    chip.removeAttribute('data-fit');
    if (chip.scrollWidth > chip.clientWidth + 0.5) chip.dataset.fit = 'compact';
    if (chip.scrollWidth > chip.clientWidth + 0.5) chip.dataset.fit = 'wrap';
  }
  const face = player.querySelector('.player-face');
  const blockers = [face.querySelector('.score'), face.querySelector('.out-tag'), ...face.querySelectorAll('.controls button')]
    .filter(blocker => blocker.offsetWidth).map(blocker => blocker.getBoundingClientRect());
  // With 4px to spare, so a reminder never sits hard against the total.
  const padded = (box) => ({ left: box.left - 4, right: box.right + 4, top: box.top - 4, bottom: box.bottom + 4 });
  if ([...box.children].some(chip => blockers.some(blocker => overlaps(padded(restingBox(chip)), blocker)))) player.dataset.reminder = 'over';
}

// A chip's box where it comes to rest, not where its entrance animation has it now: the entrance starts it lower, which
// can clear the total by a few pixels the chip then rises into. An important inline transform outranks the animation's
// without restarting it.
function restingBox(chip) {
  chip.style.setProperty('transform', 'none', 'important');
  const box = chip.getBoundingClientRect();
  chip.style.removeProperty('transform');
  return box;
}
