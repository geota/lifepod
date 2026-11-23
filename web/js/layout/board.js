// Laying out the board (design/polish/SPEC.md §3.1): which way it's turned, the seats' grid areas and facing edges,
// where the centre pill sits and what each face keeps clear of it, and the one size every tile draws its content at,
// with the mode grids and map seats sized to fit. Measuring ends by queueing a fit of the badge rows (fit.js).

import { clockwiseEdges, faceAngles, faceEdges, seatLayouts } from '../logic/data.js';
import { restPillButtons, seatGrid, shownCounters, trackedDesignations } from '../logic/rules.js';
import { isPortraitWindow, readScreen } from '../state/platform.js';
import { game } from '../state/state.js';
import { board, boardControls } from '../ui/dom.js';
import { growPixel, layoutStats, requestFit } from './fit.js';
import { keepLifeEditorInView, placeSettingsSections, settings, syncSettingsCue } from './settings.js';

// Colours mode's grids for its twelve 44px swatches on narrow or short boards, in the order a face takes the first that
// fits: 4 × 3, 3 × 4, 6 × 2 and 2 × 6, with 3px gaps.
const swatchColumns = [4, 3, 6, 2];

function boardTurn() {
  let turn = (game.landscapeAngle - readScreen().angle + 360) % 360;
  // Keep the board landscape when the window shape differs from the screen, as in split screen.
  if ((turn % 180 !== 0) !== isPortraitWindow()) turn = (turn + 90) % 360;
  return turn;
}

export function syncBoardTurn() {
  document.querySelector('.app').dataset.boardTurn = String(boardTurn());
  measureBoard();
  if (settings.open) {
    placeSettingsSections();
    syncSettingsCue();
    keepLifeEditorInView();
  }
}

// One size per board (design/polish/SPEC.md §3.1): every tile draws its content at the size that fits the smallest
// tile. --ui and --ub are the smallest tile face's width and height, and CSS sizes tile content from them instead of
// from each tile's own size. The flags set the board-wide thresholds that hide mode hints and pick layouts.
//
// The centre pill never covers a total, a glyph or a badge (design/polish/FINAL-REVIEW.md #1 and #2). It sits on a seam
// that the tiles' far rows face: upright along the middle seam with 2 players, and otherwise on the horizontal seam
// through the middle of the board, kept to the columns whose seats are split into two rows. Only the face edges it
// actually reaches past get a clearance (--clear-far and so on), and a face the pill doesn't reach, such as the end seat
// at 3 or 5 players, keeps none: its rows and mode layers are centred in the whole face. --ui and --ub are what each
// face has left inside its clearances, so tile content is sized to fit them.
//
// Everything is read before anything is written, so a measure lays the board out once rather than once per tile, and a
// measure whose readings match the last one's writes nothing and fits nothing: a resize answered by the
// ResizeObserver, the resize event and the orientation change measures once (docs/review/PERFORMANCE.md F7).
/** @typedef {{ player: HTMLElement, face: HTMLElement, edge: string, left: number, top: number, right: number, bottom: number, faceWidth: number, faceHeight: number }} Tile */
let measured = '';
export function measureBoard() {
  const faces = /** @type {HTMLElement[]} */ ([...board.querySelectorAll('.player-face')]);
  // A new player count is measured once its tiles are drawn.
  if (faces.length !== game.scores.length || !board.clientWidth || !board.clientHeight) return;
  const buttons = /** @type {HTMLElement[]} */ ([...boardControls.querySelectorAll('.pill-button')]);
  const size = Math.max(...buttons.map(button => button.offsetWidth));
  const shown = buttons.filter(button => !button.hidden).length;
  const area = { width: board.clientWidth, height: board.clientHeight, left: board.offsetLeft, top: board.offsetTop };
  /** @type {Tile[]} */
  const tiles = faces.map((face) => {
    const player = /** @type {HTMLElement} */ (face.parentElement);
    const left = player.offsetLeft - area.left;
    const top = player.offsetTop - area.top;
    return {
      player, face, edge: player.dataset.edge ?? '', left, top, right: left + player.offsetWidth, bottom: top + player.offsetHeight,
      faceWidth: face.offsetWidth, faceHeight: face.offsetHeight,
    };
  });
  const grow = growPixel();
  syncBoardDigits();
  const readings = JSON.stringify([area, size, shown, restPillButtons(game), grow, game.reminders.gestures,
    shownCounters(game).length + trackedDesignations(game).length, tiles.map(tile => [tile.edge, tile.left, tile.top, tile.right, tile.bottom, tile.faceWidth, tile.faceHeight])]);
  if (readings === measured) return;
  measured = readings;
  layoutStats.measures++;
  const pill = placePill(size, shown, area, tiles);
  // Tile content is sized as if every far edge kept this much clear, the pill's half and 2px, so a far edge the pill
  // reaches costs only what it reaches past that.
  const farClear = size / 2 + 2;
  const usable = tiles.map((tile) => {
    const clear = centreClearance(tile, pill, farClear);
    return { ...tile, clear, width: tile.faceWidth - clear.start - clear.end, height: tile.faceHeight - clear.near - Math.max(0, clear.far - farClear) };
  });
  for (const { player, clear } of usable) {
    for (const edge of faceEdges) {
      if (clear[edge]) player.style.setProperty(`--clear-${edge}`, `${clear[edge]}px`);
      else player.style.removeProperty(`--clear-${edge}`);
    }
  }
  const width = Math.min(...usable.map(face => face.width));
  const height = Math.min(...usable.map(face => face.height));
  if (!(width > 0) || !(height > 0)) return;
  board.style.setProperty('--ui', `${width}px`);
  board.style.setProperty('--ub', `${height}px`);
  board.toggleAttribute('data-narrow', width < 240);
  board.toggleAttribute('data-short', height < 200);
  board.toggleAttribute('data-wide', width >= 264);
  sizeMapSeats(usable, size, width < 240 || height < 200, grow);
  fitModeGrids(usable, { width, height, size, grow, tight: width < 240 || height < 200 });
  requestFit();
}

// Places the pill and returns the box its buttons cover now, in the board's own coordinates. The place is chosen for
// the pill at its widest, so it doesn't move when a mode opens with fewer buttons.
/**
 * @param {number} size
 * @param {number} shown
 * @param {{ width: number, height: number, left: number, top: number }} area
 * @param {Tile[]} tiles
 */
function placePill(size, shown, area, tiles) {
  const { width, height } = area;
  const vertical = game.scores.length === 2;
  const widest = Math.max(shown, restPillButtons(game)) * size;
  let x = width / 2;
  const y = height / 2;
  if (!vertical) {
    const [top, bottom] = seatLayouts[game.scores.length].map(row => row.split(' '));
    const split = top.filter((seat, column) => seat !== bottom[column]).map(seat => tiles[Number(seat.split('-')[1]) - 1]);
    const start = Math.min(...split.map(tile => tile.left));
    const end = Math.max(...split.map(tile => tile.right));
    // At the board's centre where that's on the seam and the pill fits there, otherwise centred on the seam (3 players).
    x = x > start + 1 && x < end - 1 && end - start >= widest ? Math.min(Math.max(x, start + widest / 2), end - widest / 2) : (start + end) / 2;
    x = Math.min(Math.max(x, widest / 2), width - widest / 2);
  }
  boardControls.style.left = `${area.left + x}px`;
  boardControls.style.top = `${area.top + y}px`;
  boardControls.toggleAttribute('data-vertical', vertical);
  const along = shown * size / 2;
  const across = size / 2;
  return vertical ? { left: x - across, right: x + across, top: y - along, bottom: y + along }
    : { left: x - along, right: x + along, top: y - across, bottom: y + across };
}

// The clearance a face needs from the pill on each of its edges. Where the pill reaches into a tile past two edges (at
// a corner), clearing the edge it reaches least far past is enough, and the far edge costs least (measureBoard).
/**
 * @param {Tile} tile
 * @param {{ left: number, right: number, top: number, bottom: number }} pill
 * @param {number} farClear
 */
function centreClearance(tile, pill, farClear) {
  const clear = { far: 0, end: 0, near: 0, start: 0 };
  const left = Math.max(tile.left, pill.left);
  const right = Math.min(tile.right, pill.right);
  const top = Math.max(tile.top, pill.top);
  const bottom = Math.min(tile.bottom, pill.bottom);
  if (right - left < 0.5 || bottom - top < 0.5) return clear;
  // The tile's edges clockwise from its top, with how far the pill reaches past each one it crosses.
  const depths = [
    top <= tile.top + 0.5 ? bottom - tile.top : null,
    right >= tile.right - 0.5 ? tile.right - left : null,
    bottom >= tile.bottom - 0.5 ? tile.bottom - top : null,
    left <= tile.left + 0.5 ? right - tile.left : null,
  ];
  const turn = faceAngles[tile.edge] / 90;
  let best = /** @type {{ edge: string, need: number, cost: number } | null} */ (null);
  depths.forEach((depth, side) => {
    if (depth === null) return;
    const edge = faceEdges[(side - turn + 4) % 4];
    const need = Math.ceil(depth + 2);
    // The share of the face it costs, across that edge.
    const across = edge === 'far' || edge === 'near' ? tile.faceHeight : tile.faceWidth;
    const cost = (edge === 'far' ? Math.max(0, need - farClear) : need) / across;
    if (!best || cost < best.cost) best = { edge, need, cost };
  });
  if (best) clear[best.edge] = best.need;
  return clear;
}

// The mode grids are one size on every tile, and each face lays its grid out with as many columns as fit inside its
// mode layer, which keeps clear of the pill on the edges the pill reaches: a narrow rotated seat gets fewer, taller
// columns. Colours: on narrow or short boards, the first of 4 × 3, 3 × 4, 6 × 2 and 2 × 6 that fits (the layer keeps
// 6px less than the clearance there, and 1px from other edges); elsewhere 4 × 3 always fits. Counter and mana cells:
// three to a row, or two; seven counter cells four to a row. Identity toggles: five in a row where every tile has room (ui ≥ 264), otherwise three, or two.
// The cell and toggle sizes follow styles.css (.counter-cells, .identity).
function fitModeGrids(faces, { width: ui, height: ub, size, grow, tight }) {
  const cell = Math.min(Math.max(44, Math.min((ui - 20) / 3, (ub - 10 - size) / 2)), 92 * grow);
  // Seven counter cells (every counter, the monarch and the initiative) take two rows of four, 6px in from the face's
  // sides, with gaps that close up to 2px (reaching into those 6px) before a cell goes under 44px.
  const wide = shownCounters(game).length + trackedDesignations(game).length > 6;
  const wideCell = Math.min(Math.max(44, Math.min((ui - 42) / 4, (ub - 10 - size) / 2)), 92 * grow);
  const wideGap = Math.min(10, Math.max(2, (ui - 12 - 4 * wideCell) / 3));
  if (wide) board.dataset.cellGrid = '4';
  else delete board.dataset.cellGrid;
  const toggle = Math.min(Math.max(44, 12 * ui / 100), 72 * grow);
  const swatchSpan = count => count * 44 + (count - 1) * 3;
  for (const { player, faceWidth, faceHeight, clear } of faces) {
    const swatchPad = edge => Math.max(1, clear[edge] - 6);
    const swatchWidth = faceWidth - swatchPad('start') - swatchPad('end');
    const swatchHeight = faceHeight - swatchPad('far') - swatchPad('near');
    const swatches = tight ? swatchColumns.find(count => swatchSpan(count) <= swatchWidth + 0.5 && swatchSpan(12 / count) <= swatchHeight + 0.5) ?? 4 : 4;
    player.style.setProperty('--swatch-columns', swatches);
    // The grid is centred in what the clearances leave, 1px in from each side, wherever it fits there; only along an axis
    // where it doesn't does it reach into the clearance.
    const pads = (low, high, span, size) => (span <= size - clear[low] - clear[high] - 2 + 0.5 ? [clear[low] + 1, clear[high] + 1] : [swatchPad(low), swatchPad(high)]);
    if (tight) {
      const [start, end] = pads('start', 'end', swatchSpan(swatches), faceWidth);
      const [far, near] = pads('far', 'near', swatchSpan(12 / swatches), faceHeight);
      player.style.setProperty('--swatch-pad', `${far}px ${end}px ${near}px ${start}px`);
    } else player.style.removeProperty('--swatch-pad');
    // The width the face leaves inside its clearances. The grids may reach into the layers' small default padding.
    const room = faceWidth - clear.start - clear.end + 0.5;
    player.style.setProperty('--cell-columns', 3 * cell + 20 <= room ? 3 : 2);
    if (wide) {
      // A face too narrow for four takes three, closing its gaps right up if it must, since three rows still fit.
      const columns = [4, 3].find(count => count * wideCell + (count - 1) * (count === 4 ? wideGap : 0) <= room) ?? 2;
      player.style.setProperty('--wide-columns', columns);
      player.style.setProperty('--wide-gap', `${columns === 4 ? wideGap : Math.max(0, Math.min(10, (room - 0.5 - columns * wideCell) / (columns - 1)))}px`);
    }
    const toggles = [ui >= 264 ? 5 : 3, 3, 2].find(count => count * toggle + (count - 1) * 4 <= room) ?? 2;
    player.style.setProperty('--toggle-columns', toggles);
  }
}

// Commander damage map seats are one size on every tile (design/polish/FINAL-REVIEW.md #13), the largest that fits every
// face, whichever way its map is turned: a sideways face draws the table's rows as its columns.
function sizeMapSeats(faces, size, tight, grow) {
  const { rows, columns } = seatGrid(game.scores.length);
  const gap = 4;
  let seatWidth = Infinity;
  let seatHeight = Infinity;
  for (const { edge, width, height } of faces) {
    const sideways = faceAngles[edge] % 180 !== 0;
    const across = sideways ? rows : columns;
    const down = sideways ? columns : rows;
    // The map keeps 12px from the face's ends, and its layer's padding and the hint above it, if there is one.
    const room = { width: Math.min(width - 12, across * 120 * grow), height: Math.min(height - 6 - size / 2 - (tight || !game.reminders.gestures ? 0 : 24), down * 80 * grow) };
    seatWidth = Math.min(seatWidth, (room.width - gap * (across - 1)) / across);
    seatHeight = Math.min(seatHeight, (room.height - gap * (down - 1)) / down);
  }
  board.style.setProperty('--seat-width', `${Math.max(44, Math.floor(seatWidth * 10) / 10)}px`);
  board.style.setProperty('--seat-height', `${Math.max(44, Math.floor(seatHeight * 10) / 10)}px`);
}

// The most digits in any total, at least 2. A three-digit total shrinks every total together, which changes the room
// between each edge and the total, so the badge rows are fitted again (docs/review/SPEC-COMPLIANCE.md B1).
export function syncBoardDigits() {
  const digits = String(Math.max(2, ...game.scores.map(score => String(score).length)));
  if (board.style.getPropertyValue('--board-digits') === digits) return;
  board.style.setProperty('--board-digits', digits);
  requestFit();
}

export function layoutBoard() {
  const rows = seatLayouts[game.scores.length];
  board.style.gridTemplateAreas = rows.map(row => `"${row}"`).join(' ');
  for (const seat of new Set(rows.join(' ').split(' '))) {
    const [edge, number] = seat.split('-');
    const index = Number(number) - 1;
    const player = board.children[index];
    const turn = (clockwiseEdges.indexOf(edge) + game.rotations[index]) % clockwiseEdges.length;
    player.style.gridArea = seat;
    player.dataset.edge = clockwiseEdges[turn];
  }
  // A rotated seat changes its tile's size, and the board's size follows the smallest tile.
  measureBoard();
}
