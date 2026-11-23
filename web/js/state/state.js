// What the page holds while it runs: the game, which is what's saved, and the state that isn't saved (SPEC §10.1): the
// open board mode and its edits, the turn steps a hold steps back through, the turn reminders showing and the pools
// that "Undo clear" can put back. Module-level lets are read live by importers; only this module writes them.

import { designationKinds, editingModes } from '../logic/data.js';
import { loadGame } from '../logic/save.js';
import { currentLandscapeAngle, readSavedGame, setBackHandling, writeSavedGame } from './platform.js';

/** @typedef {import('../logic/data.js').BoardMode} BoardMode */
/** @typedef {import('../logic/rules.js').Edit} Edit */

// The game: loaded once and changed in place, so every module sees the same object. saveGame writes it.
export const game = loadGame(readSavedGame, currentLandscapeAngle());
// The open board mode (BoardMode in js/logic/data.js), or null at rest. Only openBoardMode changes it, for
// setBoardMode.
/** @type {BoardMode} */
export let boardMode = null;
// While an editing mode is open: every change made in it, newest last, so it can be undone or discarded,
// and the life totals when it opened.
export let edits = /** @type {Edit[] | null} */ (null);
export let editStartScores = [];
// Who held each designation when an editing mode opened, so saving it can remind a new initiative holder to venture.
export let editStartHolders = {};

// Records a board mode opening (or, with null, closing): its edits start empty, from the totals and holders now.
/** @param {BoardMode} mode */
export function openBoardMode(mode) {
  boardMode = mode;
  edits = editingModes.includes(mode) ? [] : null;
  editStartScores = [...game.scores];
  editStartHolders = Object.fromEntries(designationKinds.map(kind => [kind, game[kind]]));
}

// Turn steps, newest last, so holding the turn chip or the pill steps back exactly, restoring any pools the step
// emptied. Not saved: after a relaunch, a hold steps back by the play order instead. Cleared in place.
export const turnSteps = [];
// Turn reminders showing on each tile, by player: designation kind → its timer. Not saved.
export const reminders = new Map();
// Pools cleared with the eraser in the last 5 seconds, by player, so "Undo clear" can put them back. Not saved.
export const clearedPools = new Map();

export function saveGame() {
  writeSavedGame(JSON.stringify(game));
}

// Android's back gesture only needs the page while a dialog or board mode is open.
export function syncBackHandling() {
  setBackHandling(boardMode !== null || document.querySelector('dialog[open]') !== null);
}
