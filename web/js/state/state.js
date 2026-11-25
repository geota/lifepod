// What the page holds while it runs: the game, which is what's saved, with its undo history, and the state that isn't
// saved (SPEC §10.1): the open board mode and where its edits began, the turn steps a hold steps back through, the turn reminders
// showing and the strips being tapped. The history's own unsaved state is in history.js. Module-level lets are read live by importers; only this module writes them.

import { designationKinds } from '../logic/data.js';
import { loadGame } from '../logic/save.js';
import { currentLandscapeAngle, readSavedGame, setBackHandling, writeSavedGame } from './platform.js';

/** @typedef {import('../logic/data.js').BoardMode} BoardMode */

// The game: loaded once and changed in place, so every module sees the same object. saveGame writes it.
export const game = loadGame(readSavedGame, currentLandscapeAngle());
// The open board mode (BoardMode in js/logic/data.js), or null at rest. Only openBoardMode changes it, for
// setBoardMode.
/** @type {BoardMode} */
export let boardMode = null;
// While an editing mode is open: where the history stood when it opened, so the mode's Undo stops there and ✕ takes
// back its steps (MANA-UNDO-SPEC §6.5), and the totals then, which the damage map compares with.
export let editStart = 0;
/** @type {number[]} */
export let editStartScores = [];
// Who held each designation when an editing mode opened, so saving it can remind a new initiative holder to venture.
export let editStartHolders = {};

// Records a board mode opening (or, with null, closing), from the history, totals and holders now.
/** @param {BoardMode} mode */
export function openBoardMode(mode) {
  boardMode = mode;
  editStart = game.history.at;
  editStartScores = [...game.scores];
  editStartHolders = Object.fromEntries(designationKinds.map(kind => [kind, game[kind]]));
}

// Moves an open Track visit to another of its tabs (another editing mode), keeping where its edits began, so its Undo,
// ✓ and ✕ cover the whole visit (PILL-SPEC.md §3.2).
/** @param {BoardMode} mode */
export function switchBoardMode(mode) {
  boardMode = mode;
}

// Turn steps, newest last, so holding the turn chip or the pill steps back exactly, restoring any pools the step
// emptied. Not saved: after a relaunch, a hold steps back by the play order instead. Cleared in place.
export const turnSteps = [];
// Turn reminders showing on each tile, by player: designation kind → its timer. Not saved.
export const shownReminders = new Map();
// Strips being tapped, by player: the colours the strip showed when the taps began, which keep their places (at 0 once
// spent) until stripHoldTime after the last tap, and that timer. Not saved.
/** @type {Map<number, { colours: Set<string>, timer: ReturnType<typeof setTimeout> }>} */
export const stripHolds = new Map();

export function saveGame() {
  writeSavedGame(JSON.stringify(game));
}

// Android's back gesture only needs the page while a dialog or board mode is open.
export function syncBackHandling() {
  setBackHandling(boardMode !== null || document.querySelector('dialog[open]') !== null);
}
