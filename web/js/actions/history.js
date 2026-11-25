// Undo and Redo through the game's history (MANA-UNDO-SPEC §6): a step back or forward is one commit that records
// nothing, redrawing only what the step touched, then a toast on each tile it changed and one announcement. The history
// itself is in state/history.js, and its rules in logic/history.js.

import { syncBoardTurn } from '../layout/board.js';
import { resetDrops } from '../layout/fit.js';
import { countKinds, editingModes, toastTime } from '../logic/data.js';
import { describeStep, stepText } from '../logic/history.js';
import { announce, clearAnnouncements, seatName } from '../render/announce.js';
import { renderBadges, renderPassHints } from '../render/badges.js';
import { syncCounterCells, syncManaCells, syncSeatMap } from '../render/modes.js';
import { paintColours } from '../render/tile.js';
import { bringForward, clearToasts, dismissToast, setToasts, takeBack } from '../state/history.js';
import { haptic } from '../state/platform.js';
import { boardMode, editStart, game, turnSteps } from '../state/state.js';
import { cancelPresses } from '../ui/press.js';
import { renderBoard } from './board.js';
import { commit } from './commit.js';
import { endStripHolds } from './mana.js';
import { showUndoneTab } from './mode.js';
import { clearReminders } from './reminders.js';

/** @typedef {import('../logic/history.js').Step} Step */
/** @typedef {import('../logic/history.js').Changes} Changes */

const perPlayer = ['scores', 'rotations', 'colors', ...countKinds, 'identities', 'commanderDamage', 'pools'];

// What redrawing steps takes, from the fields they changed: per-player fields redraw that seat's total and rows, the
// turn and whole values every row, the pools and the turn the pill, tile colours the paint, rotations the seats, and a
// change of player count (a new game's) the whole board.
/** @param {Changes[]} changes */
function dirtyFrom(changes) {
  /** @type {Set<number>} */
  const tiles = new Set();
  let all = false;
  let board = false;
  /** @type {Set<number | null>} */
  const holders = new Set();
  const fields = new Set(changes.flatMap(Object.keys));
  for (const [field, delta] of changes.flatMap(Object.entries)) {
    const whole = Array.isArray(delta);
    if (whole && perPlayer.includes(field) && delta[0].length !== delta[1].length) board = true;
    if (field === 'monarch' || field === 'initiative') for (const holder of delta) holders.add(holder);
    else if (field === 'turn' || whole) all = true;
    else for (const index of Object.keys(delta)) tiles.add(Number(index));
  }
  for (const holder of holders) if (holder !== null) tiles.add(holder);
  return {
    board, tiles: all ? /** @type {'all'} */ ('all') : [...tiles], paint: fields.has('colors'), layout: fields.has('rotations'),
    pill: fields.has('pools') || fields.has('turn'), turn: fields.has('turn'),
  };
}

// Redraws what steps changed, saving the game and its history in the same commit, which records nothing.
/** @param {Changes[]} changes */
function redraw(changes) {
  const dirty = dirtyFrom(changes);
  // The hold-back buffer is about turns as they were; after an undo of one, a hold steps back by the play order.
  if (dirty.turn) turnSteps.length = 0;
  if (dirty.board) {
    // A different player count: the board is drawn again, as at a new game, and what isn't saved goes with it.
    clearReminders();
    endStripHolds();
    turnSteps.length = 0;
    resetDrops();
    syncBoardTurn();
    renderBoard();
    commit({ pill: true, step: false });
    return;
  }
  if (dirty.paint) paintColours();
  commit({ scores: dirty.tiles, badges: dirty.tiles, pill: dirty.pill, layout: dirty.layout, step: false });
  // Who is out, and so who must pass the monarch or the initiative on, may have changed.
  renderPassHints();
  // In an editing mode, its cells show the counts too.
  if (editingModes.includes(boardMode)) {
    for (const index of game.scores.keys()) {
      syncCounterCells(index);
      syncManaCells(index);
      syncSeatMap(index);
    }
  }
}

// The turn as players hear it after a step: "Player 1, Sky's turn, round 3" or "Round 3".
function turnNow() {
  const { active, round } = game.turn;
  return game.turns === 'turns' && active !== null ? `${seatName(active)}'s turn, round ${round}` : `Round ${round}`;
}

// What an undo or redo says, and the toasts it leaves at rest: one on each tile the step changed, facing its player; for
// a turn step, on the tile whose turn it is now; for a new game, "Game restored" on every tile.
/** @param {Step[]} steps The steps taken back or brought forward, in the order they were. @param {'Undid' | 'Redid'} verb */
function feedback(steps, verb) {
  haptic();
  const latest = /** @type {Step} */ (steps.at(-1));
  const { k, d } = latest;
  let text;
  if (k === 'newGame') {
    text = verb === 'Undid' ? `new game. ${game.scores.length} players restored` : `new game. ${game.scores.length} players at ${game.startingLife} life`;
  } else if (d.turn) {
    text = `${describeStep(latest, game).label ?? 'turn'}. ${turnNow()}`;
  } else text = stepText(latest, game);
  const lead = steps.length > 1 ? `${verb === 'Undid' ? 'Back' : 'Forward'} ${steps.length} steps, to ${text}` : `${verb}: ${text}`;
  // What the taps since said is no longer the news: the undo says where things stand.
  clearAnnouncements();
  announce(-1, 'history', () => lead);
  if (boardMode !== null) return;
  /** @type {Map<number, string>} */
  const words = new Map();
  // The step nearest where the history is now speaks for each tile it touched.
  for (const step of [...steps].reverse()) {
    if (step.k === 'newGame') {
      for (const [index] of game.scores.entries()) if (!words.has(index)) words.set(index, verb === 'Undid' ? 'game restored' : 'new game');
      continue;
    }
    const described = describeStep(step, game);
    if (step.d.turn) {
      const tile = game.turn.active ?? game.turn.first;
      if (tile !== null && !words.has(tile)) words.set(tile, described.label ?? described.table[0] ?? 'turn');
    }
    for (const { index, words: changed } of described.tiles) if (!words.has(index)) words.set(index, changed.join(', '));
  }
  for (const tile of setToasts(words, verb, toastTime, tiles => tiles.forEach(renderBadges))) renderBadges(tile);
}

// Back one step (Undo in the centre). Any press still held ends first, and every open burst closes, so an undo
// mid-burst takes back the whole burst so far (§6.9). In an editing mode, Undo stops at what was there when the mode
// opened (§6.5), and the cells change in place with no toast; other modes have no Undo. In Track, a step taken on another
// tab opens that tab first, so the change is seen (PILL-SPEC.md §3.2).
export function undo() {
  const editing = editingModes.includes(boardMode);
  if (boardMode !== null && !editing) return;
  if (editing && game.history.at <= editStart) return;
  cancelPresses();
  if (editing) showUndoneTab();
  const step = takeBack();
  if (!step) return;
  redraw([step.d]);
  feedback([step], 'Undid');
}

// Forward one step, after an undo: the toast's Redo, the hidden Redo beside Undo, or History.
export function redo() {
  if (boardMode !== null) return;
  cancelPresses();
  const step = bringForward();
  if (!step) return;
  redraw([step.d]);
  feedback([step], 'Redid');
}

// Goes back or forward to just after step `at` (History's rows): one patch at a time, then one redraw of everything
// they touched, one announcement and a toast on each tile.
/** @param {number} target */
export function jumpTo(target) {
  cancelPresses();
  const back = target < game.history.at;
  /** @type {Step[]} */
  const steps = [];
  while (game.history.at !== target) {
    const step = back ? takeBack() : bringForward();
    if (!step) break;
    steps.push(step);
  }
  if (!steps.length) return;
  redraw(steps.map(step => step.d));
  feedback(steps, back ? 'Undid' : 'Redid');
}

// A toast's own tap: it goes.
/** @param {number} tile */
export function dismissUndoToast(tile) {
  if (dismissToast(tile)) renderBadges(tile);
}

// Every toast goes, as a board mode opens.
export function endToasts() {
  for (const tile of clearToasts()) renderBadges(tile);
}

// Takes steps back to `target` without a word, for ✕'s Discard in an editing mode, which says so itself. They can be
// redone.
/** @param {number} target */
export function takeBackTo(target) {
  cancelPresses();
  /** @type {Step[]} */
  const steps = [];
  while (game.history.at > target) {
    const step = takeBack();
    if (!step) break;
    steps.push(step);
  }
  if (steps.length) redraw(steps.map(step => step.d));
}
