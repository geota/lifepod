// The undo history while the page runs (UNDO-ARCHITECTURE.md §6.2): the copy of the board as of the last commit, the
// bursts of quick taps still open, and record(), which commit() calls with what changed. The history itself is
// game.history, so it's saved with the game in one write and the two can't disagree. Taking a step back or forward
// is here too; actions/history.js redraws and announces it. Not saved: the baseline, the open bursts and the toasts.

import { mergeWindow } from '../logic/data.js';
import {
  applyStep, boardOf, diffBoard, mergeStep, overlaps, stepCells, trimHistory,
} from '../logic/history.js';
import { game } from './state.js';

/** @typedef {import('../logic/history.js').Changes} Changes */
/** @typedef {import('../logic/history.js').Step} Step */
/** @typedef {import('../logic/data.js').StepKind} StepKind */
/**
 * What a commit records (commit() in actions/commit.js): false for a change that isn't a game step (a setting, seat
 * rotation, tile colours, identities), or a key such as 'life:2' for a tap that merges with quick taps on the same
 * tile and count, and a kind for a step its cells don't describe alone.
 *
 * @typedef {false | { key?: string, kind?: StepKind }} StepOptions
 */
/**
 * A burst of quick taps on one tile and count, still open: its key, the step it has built (null once its net change
 * came back to nothing), how many taps, when the last came, the cells it touches and the timer that closes it.
 *
 * @typedef {object} Burst
 * @property {string} key
 * @property {Step | null} step
 * @property {number} n
 * @property {number} last
 * @property {Map<string, Set<string> | 'all'>} cells
 * @property {ReturnType<typeof setTimeout>} timer
 */

// The board as of the last commit, which the next commit's changes are measured against.
let baseline = boardOf(game);
// Each tile's open burst, by seat. Two players tapping at once each keep their own (MANA-UNDO-SPEC §6.2a).
/** @type {Map<number, Burst>} */
const bursts = new Map();
// Each step's size as JSON, for the cap, so a commit doesn't stringify 500 steps.
/** @type {WeakMap<Step, number>} */
const sizes = new WeakMap();
/** @param {Step} step */
const sizeOf = (step) => {
  let size = sizes.get(step);
  if (size === undefined) {
    size = JSON.stringify(step).length;
    sizes.set(step, size);
  }
  return size;
};

// Told when a tile's burst changes or closes, so the running delta on its total can follow (render/history.js).
/** @type {(tile: number) => void} */
let burstChanged = () => {};
/** @param {(tile: number) => void} listener */
export function onBurstChange(listener) {
  burstChanged = listener;
}

/** @param {number} tile @returns {Burst | undefined} */
export function openBurst(tile) {
  return bursts.get(tile);
}

/** @param {number} tile */
export function closeBurst(tile) {
  const burst = bursts.get(tile);
  if (!burst) return;
  clearTimeout(burst.timer);
  bursts.delete(tile);
  burstChanged(tile);
}

// Every open burst ends: at a step that isn't a merging tap, a board mode opening or closing, and Undo or Redo.
export function closeBursts() {
  for (const tile of [...bursts.keys()]) closeBurst(tile);
}

// The board as it is now becomes the baseline, without recording anything: after a setting that changed a board field
// (Turns clears whose turn it is), and after an undo.
export function rebase() {
  baseline = boardOf(game);
}

/** @param {Step} step */
function push(step) {
  game.history.steps.push(step);
}

/** @param {Step | null} step */
function remove(step) {
  if (!step) return;
  const at = game.history.steps.lastIndexOf(step);
  if (at >= 0) game.history.steps.splice(at, 1);
}

// Records what the commit changed since the last one, unless it's not a step, and makes the board the new baseline.
/** @param {StepOptions} [options] */
export function recordCommit(options = {}) {
  if (options !== false) {
    const d = diffBoard(baseline, game);
    if (Object.keys(d).length) record(d, options);
  }
  baseline = boardOf(game);
}

// One step's changes into the history (MANA-UNDO-SPEC §6.2a): Forward goes, then a tap with a key merges into its
// tile's open burst for that key if it came within mergeWindow of the burst's last tap, moving the step to the top.
// A tap on another key closes its tile's burst and starts one; any other step closes every burst. A step that touches
// another tile's open burst's cells closes that burst, so a merge never moves a step past one it overlaps.
/** @param {Changes} d @param {{ key?: string, kind?: StepKind }} options */
function record(d, { key, kind }) {
  const history = game.history;
  const now = Date.now();
  history.steps.length = history.at;
  if (!history.steps.length) history.base = now;
  /** @type {Step} */
  const step = { t: Math.max(0, Math.round((now - history.base) / 1000)), ...(kind ? { k: kind } : {}), d };
  const cells = stepCells(d);
  if (key === undefined) {
    closeBursts();
    push(step);
  } else {
    const tile = Number(key.split(':')[1]);
    for (const [other, burst] of bursts) if (other !== tile && overlaps(burst.cells, cells)) closeBurst(other);
    const open = bursts.get(tile);
    const merging = open && open.key === key && now - open.last <= mergeWindow && (!open.step || history.steps.includes(open.step));
    if (open && merging) {
      remove(open.step);
      const merged = open.step ? mergeStep(open.step, step) : { ...step, n: open.n + 1 };
      open.step = merged;
      open.n += 1;
      open.last = now;
      open.cells = merged ? stepCells(merged.d) : new Map();
      if (merged) push(merged);
      clearTimeout(open.timer);
      open.timer = setTimeout(() => closeBurst(tile), mergeWindow);
    } else {
      if (open) closeBurst(tile);
      push(step);
      bursts.set(tile, { key, step, n: 1, last: now, cells, timer: setTimeout(() => closeBurst(tile), mergeWindow) });
    }
    burstChanged(tile);
  }
  history.at = history.steps.length;
  trimHistory(history, sizeOf);
}

// Back one step: its before-values go into the game, and the step it was is returned. null at the start.
/** @returns {Step | null} */
export function takeBack() {
  closeBursts();
  const history = game.history;
  if (!history.at) return null;
  const step = history.steps[history.at - 1];
  applyStep(game, step, 'b');
  history.at -= 1;
  return step;
}

// Forward one step, after an undo: its after-values go into the game. null with nothing ahead.
/** @returns {Step | null} */
export function bringForward() {
  closeBursts();
  const history = game.history;
  if (history.at >= history.steps.length) return null;
  const step = history.steps[history.at];
  applyStep(game, step, 'a');
  history.at += 1;
  return step;
}

// ---- Toasts ------------------------------------------------------------------------------------------------------

/**
 * The toast an undo or redo leaves on a tile it changed (MANA-UNDO-SPEC §6.7), facing its player: "Undid life 38 → 37",
 * with Redo after an undo. A new undo or redo replaces every toast.
 *
 * @typedef {object} Toast
 * @property {number} id Which undo or redo it's from, so a new one is a new chip.
 * @property {'Undid' | 'Redid'} verb
 * @property {string} words
 * @property {boolean} redo Whether it offers Redo.
 */
/** @type {Map<number, Toast>} */
export const toasts = new Map();
let toastCount = 0;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastTimer;

// Shows a toast on each tile given, in place of any before, until time has passed, then calls ended with the tiles that
// had one. Returns the tiles whose toasts changed.
/**
 * @param {Map<number, string>} words By tile.
 * @param {'Undid' | 'Redid'} verb
 * @param {number} time
 * @param {(tiles: number[]) => void} ended
 */
export function setToasts(words, verb, time, ended) {
  const changed = new Set([...toasts.keys(), ...words.keys()]);
  clearTimeout(toastTimer);
  toasts.clear();
  toastCount += 1;
  for (const [tile, text] of words) toasts.set(tile, { id: toastCount, verb, words: text, redo: verb === 'Undid' });
  if (words.size) {
    toastTimer = setTimeout(() => {
      const tiles = [...toasts.keys()];
      toasts.clear();
      ended(tiles);
    }, time);
  }
  return [...changed];
}

// Every toast goes at once, such as when a board mode opens or a new board is drawn. Returns the tiles that had one.
export function clearToasts() {
  clearTimeout(toastTimer);
  const tiles = [...toasts.keys()];
  toasts.clear();
  return tiles;
}

/** @param {number} tile */
export function dismissToast(tile) {
  return toasts.delete(tile);
}
