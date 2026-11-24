// One call after a change to the game: it records the change as an undo step, saves the game and its history together,
// and redraws what the change touched, so no action saves without redrawing, or redraws without saving
// (docs/review/DEEP-DIVE.md §2.1), and no game action escapes the history (UNDO-ARCHITECTURE.md §6). It runs
// synchronously, so whatever follows it, such as moving focus or reading the board in a test, sees the board already
// redrawn.

import { layoutBoard, measureBoard } from '../layout/board.js';
import { renderBadges } from '../render/badges.js';
import { syncPill, syncUndo } from '../render/pill.js';
import { renderScore } from '../render/tile.js';
import { recordCommit } from '../state/history.js';
import { game, saveGame } from '../state/state.js';

/** @typedef {import('../state/history.js').StepOptions} StepOptions */

/**
 * What a change touched, beyond the save: the tiles whose total and whose badge rows to redraw (a list of seats, or
 * 'all'), whether the pill's buttons may have changed, and whether the seats (layout) or the board's measurements
 * (measure) need doing again. step says what the history records (state/history.js): nothing given is one step, a
 * key merges quick taps on one tile and count, a kind labels the step, and false records nothing, for what isn't a
 * game step (settings, seat rotation, tile colours, identities) and for an undo itself.
 *
 * @typedef {object} Dirty
 * @property {number[] | 'all'} [scores]
 * @property {number[] | 'all'} [badges]
 * @property {boolean} [pill]
 * @property {boolean} [layout]
 * @property {boolean} [measure]
 * @property {StepOptions} [step]
 */

/** @param {number[] | 'all'} tiles */
const seats = tiles => (tiles === 'all' ? game.scores.map((_, index) => index) : tiles);

/** @param {Dirty} [dirty] */
export function commit({ scores = [], badges = [], pill = false, layout = false, measure = false, step = {} } = {}) {
  recordCommit(step);
  saveGame();
  for (const index of seats(scores)) renderScore(index);
  for (const index of new Set(seats(badges))) renderBadges(index);
  if (pill) syncPill();
  else syncUndo();
  if (layout) layoutBoard();
  else if (measure) measureBoard();
}
