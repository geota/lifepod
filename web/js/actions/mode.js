// Opening and leaving the board modes (setBoardMode), ✕ and its Discard question, and "Who goes first?", which opens
// as a mode once nothing else is open and shuffles or takes a tap to pick.

import { requestFit } from '../layout/fit.js';
import {
  designations, discardMessages, doneLabels, editingModes, firstBeat, shuffleTick, shuffleTicks,
} from '../logic/data.js';
import { applyEdit, isOut, playOrder, randomBelow } from '../logic/rules.js';
import { announceMode, announceModeEnd, clearAnnouncements, seatName } from '../render/announce.js';
import { renderBadges } from '../render/badges.js';
import { renderModeLayer } from '../render/modes.js';
import { syncPill } from '../render/pill.js';
import { renderScore } from '../render/tile.js';
import { haptic, reducedMotion } from '../state/platform.js';
import {
  boardMode, editStartHolders, edits, game, openBoardMode, saveGame, showDialog, syncBackHandling, turnSteps,
} from '../state/state.js';
import { board, boardControls, discardDialog, icon, setupButton } from '../ui/dom.js';
import { cancelPresses } from '../ui/press.js';
import { endUndoClears } from './mana.js';
import { turnStarted } from './reminders.js';

/** @typedef {import('../logic/data.js').BoardMode} BoardMode */
/** @typedef {import('../logic/rules.js').Edit} Edit */

// "Who goes first?" waits until settings has closed, then opens.
export let askFirst = false;
/** @param {boolean} ask */
export function setAskFirst(ask) {
  askFirst = ask;
}
let shuffleTimer;
// What had focus when the board left rest for a mode, so leaving it can give focus back there.
/** @type {Element | null} */
let modeOpener = null;

// "Who goes first?" opens once nothing else is open: after a new game while Turns is on, and when Turns goes from Off
// to on in a game with no first player.
export function maybeAskFirst() {
  if (!askFirst || game.turns === 'off' || boardMode !== null || document.querySelector('dialog[open]')) return;
  askFirst = false;
  setBoardMode('first');
}

// The chosen player goes first and, turn by turn, takes the first turn. Their tile shows "Goes first" for a beat.
export function chooseFirst(index) {
  if (boardMode !== 'first' || board.hasAttribute('data-picked')) return;
  clearTimeout(shuffleTimer);
  game.turn.first = index;
  game.turn.active = index;
  turnSteps.length = 0;
  saveGame();
  haptic();
  board.dataset.picked = '';
  [...board.children].forEach((player, seat) => player.toggleAttribute('data-lit', seat === index));
  const go = board.children[index].querySelector('.first-go');
  go.replaceChildren(icon('flag'), 'Goes first');
  /** @type {Element} */ (go.nextElementSibling).textContent = game.turns === 'rounds' ? 'Tap the flag to start each round' : 'Tap Turn when your turn ends';
  announceModeEnd(`${seatName(index)}, goes first`);
  // Their turn starts once the board is back, where its reminder can show.
  shuffleTimer = setTimeout(() => {
    setBoardMode(null);
    turnStarted();
  }, reducedMotion.matches ? 0 : firstBeat);
}

// The centre shuffle picks a random player who isn't out, lighting tiles around the table before landing on them.
export function shuffleFirst() {
  if (boardMode !== 'first' || board.hasAttribute('data-shuffling') || board.hasAttribute('data-picked')) return;
  const order = playOrder(game);
  const live = order.filter(player => !isOut(game, player));
  const candidates = live.length ? live : order;
  const pick = candidates[randomBelow(candidates.length)];
  if (reducedMotion.matches) {
    chooseFirst(pick);
    return;
  }
  board.dataset.shuffling = '';
  // A run around the table in play order that ends on the pick.
  const end = order.indexOf(pick) + order.length * shuffleTicks;
  const lights = Array.from({ length: shuffleTicks }, (_, step) => order[(end - shuffleTicks + 1 + step) % order.length]);
  const tick = () => {
    const player = lights.shift();
    if (!lights.length) {
      delete board.dataset.shuffling;
      chooseFirst(player);
      return;
    }
    [...board.children].forEach((tile, seat) => tile.toggleAttribute('data-lit', seat === player));
    shuffleTimer = setTimeout(tick, shuffleTick);
  };
  tick();
}

// Board-wide modes. Seat rotation, tile colours and identities end with the check mark that replaces the setup button.
// Counters mode ends with save or ✕, and keeps a list of its edits until then.
/** @param {BoardMode} mode */
export function setBoardMode(mode) {
  const closed = boardMode;
  // A pick of who goes first is announced already, and the mode closes a beat after it. An editing mode's end is
  // announced by what ended it: Save, Discard, or ✕ with no changes (cancelEditing).
  const quietly = board.hasAttribute('data-picked') || editingModes.includes(closed);
  if (closed === null && mode !== null) modeOpener = document.activeElement;
  cancelPresses();
  clearTimeout(shuffleTimer);
  for (const flag of ['data-picked', 'data-shuffling']) board.removeAttribute(flag);
  for (const player of board.children) player.removeAttribute('data-lit');
  // Opening mana mode settles any "Undo clear": the cleared pool stays empty.
  if (mode === 'mana') endUndoClears();
  openBoardMode(mode);
  [...board.children].forEach((player, index) => {
    player.querySelector('.controls').inert = mode !== null;
    // Rotate seats covers each tile with its rotate button, so nothing else on the tile can take focus or a press.
    player.querySelector('.player-face').inert = mode === 'rotate';
    player.querySelector('.rotate-seat').hidden = mode !== 'rotate';
    renderModeLayer(player, index);
    renderBadges(index);
  });
  for (const node of [board, boardControls]) {
    if (mode) node.dataset.mode = mode;
    else delete node.dataset.mode;
  }
  // The badges were hidden while the mode was open, so they're measured now that they show again.
  requestFit();
  setupButton.setAttribute('aria-label', mode ? doneLabels[mode] ?? 'Settings' : 'Settings');
  setupButton.setAttribute('aria-haspopup', mode ? 'false' : 'dialog');
  setupButton.querySelector('.setup-icon').hidden = mode !== null;
  setupButton.querySelector('.rotation-done').hidden = mode === null;
  syncPill();
  const focusTarget = mode === 'rotate' ? board.querySelector('.rotate-seat')
    : mode === 'colours' ? board.querySelector('.swatch[aria-pressed="true"]')
    : mode ? board.querySelector('.mode-layer button') : restingFocus();
  focusTarget?.focus();
  announceMode(mode, quietly ? null : closed);
  syncBackHandling();
  // A mode opened from settings, such as Rotate seats, was still open when settings' close event looked, so the question
  // waits for the mode to end.
  if (mode === null) maybeAskFirst();
}

// Back at rest, focus returns to what opened the mode, such as the pill's Commander damage, if it still shows; otherwise
// to Settings.
function restingFocus() {
  const opener = modeOpener;
  modeOpener = null;
  const usable = opener instanceof HTMLElement && opener !== document.body && opener.isConnected
    && !opener.closest('[inert], [hidden], dialog') && opener.checkVisibility?.() !== false;
  return usable ? opener : setupButton;
}

// ✕ in an editing mode: with no changes it just closes; otherwise it asks first, and Keep editing is the default.
export function cancelEditing() {
  const changes = /** @type {Edit[]} */ (edits).length;
  if (!changes) {
    const closed = boardMode;
    setBoardMode(null);
    announceMode(null, closed);
    return;
  }
  document.querySelector('#discard-title').textContent = `Discard ${changes} ${changes === 1 ? 'change' : 'changes'}?`;
  // Commander damage can pass the monarch and the initiative, and counters mode sets them.
  const moved = designations.filter(({ kind }) => game[kind] !== editStartHolders[kind]).map(({ name }) => name);
  document.querySelector('#discard-message').textContent = discardMessages[boardMode]
    + (moved.length ? ` So ${moved.length > 1 ? 'do' : 'does'} ${moved.join(' and ')}.` : '');
  discardDialog.returnValue = 'keep';
  showDialog(discardDialog);
}

export function discardEdits() {
  const changes = /** @type {Edit[]} */ (edits);
  while (changes.length) applyEdit(game, /** @type {Edit} */ (changes.pop()), -1);
  game.scores.forEach((_, index) => renderScore(index));
  saveGame();
  setBoardMode(null);
  // What the discarded changes said is no longer true.
  clearAnnouncements();
  announceModeEnd('Changes discarded');
}

// Leaves the open board mode the way ✕ or the check mark would without saving anything new.
export function leaveBoardMode() {
  if (editingModes.includes(boardMode)) cancelEditing();
  else setBoardMode(null);
}
