// Opening and leaving the board modes (setBoardMode), ✕ and its Discard question, and "Who goes first?", which opens
// as a mode once nothing else is open and shuffles or takes a tap to pick.

import { requestFit } from '../layout/fit.js';
import {
  designations, discardMessages, doneLabels, editingModes, firstBeat, shuffleTick, shuffleTicks, trackTabInfo,
} from '../logic/data.js';
import { stepTab } from '../logic/history.js';
import {
  isOut, openingTab, playOrder, randomBelow, trackTabs,
} from '../logic/rules.js';
import { fitTurn } from '../logic/save.js';
import {
  announceMode, announceModeEnd, announceTrackTab, clearAnnouncements, seatName,
} from '../render/announce.js';
import { renderBadges } from '../render/badges.js';
import { renderModeLayer } from '../render/modes.js';
import { syncPill, trackShown } from '../render/pill.js';
import { clearToasts, closeBursts } from '../state/history.js';
import { haptic, reducedMotion } from '../state/platform.js';
import {
  boardMode, editStart, editStartHolders, game, openBoardMode, saveGame, switchBoardMode, syncBackHandling, turnSteps,
} from '../state/state.js';
import {
  board, boardControls, countersButton, damageButton, discardDialog, icon, manaButton, setupButton, trackButton,
} from '../ui/dom.js';
import { cancelPresses } from '../ui/press.js';
import { commit } from './commit.js';
import { showDialog } from './dialog.js';
import { turnStarted } from './reminders.js';

/** @typedef {import('../logic/data.js').BoardMode} BoardMode */
/** @typedef {import('../logic/data.js').TrackTab} TrackTab */

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
  commit({ step: { kind: 'first' } });
  haptic();
  board.dataset.picked = '';
  [...board.children].forEach((player, seat) => player.toggleAttribute('data-lit', seat === index));
  const go = board.children[index].querySelector('.first-go');
  go.replaceChildren(icon('flag'), 'Goes first');
  /** @type {Element} */ (go.nextElementSibling).textContent = game.turns === 'rounds' ? 'Tap the flag to start each round' : 'Tap Turn when your turn ends';
  announceModeEnd(`${seatName(index)}, goes first`);
  // Their turn starts once the board is back, where its reminder can show (setBoardMode).
  shuffleTimer = setTimeout(() => setBoardMode(null), reducedMotion.matches ? 0 : firstBeat);
}

// ✕, Escape or Android back in "Who goes first?". With nobody picked, it's a skip, which leaves no first player: no
// flag, round 1 (SPEC §8), even when Turns went from Off to on in a game whose round had moved on. During the "Goes
// first" beat the pick stands, and the board just comes back sooner.
export function skipFirst() {
  if (game.turn.first === null) {
    game.turn = fitTurn(null, game.scores.length);
    turnSteps.length = 0;
    // Saved now; closing the mode redraws the tiles and the pill. A skip that changes nothing records nothing.
    commit({ step: { kind: 'first' } });
  }
  setBoardMode(null);
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
// Counters mode ends with save or ✕, and its Undo goes back through the steps taken since it opened.
/** @param {BoardMode} mode */
export function setBoardMode(mode) {
  const closed = boardMode;
  // A pick of who goes first is announced already, and the mode closes a beat after it. An editing mode's end is
  // announced by what ended it: Save, Discard, or ✕ with no changes (cancelEditing).
  const picked = board.hasAttribute('data-picked');
  const quietly = picked || editingModes.includes(closed);
  if (closed === null && mode !== null) modeOpener = document.activeElement;
  // An editing mode opening becomes the tab Track remembers, from the pill or a tile's chip, in either form of the pill.
  if (closed === null && editingModes.includes(mode)) rememberTab(/** @type {TrackTab} */ (mode));
  cancelPresses();
  clearTimeout(shuffleTimer);
  for (const flag of ['data-picked', 'data-shuffling']) board.removeAttribute(flag);
  for (const player of board.children) player.removeAttribute('data-lit');
  // A mode is a context of its own: opening or closing one ends every burst of quick taps (MANA-UNDO-SPEC §6.2a), and
  // an undo's toasts go.
  closeBursts();
  clearToasts();
  openBoardMode(mode);
  drawBoardMode(mode);
  const focusTarget = mode === 'rotate' ? board.querySelector('.rotate-seat')
    : mode === 'colours' ? board.querySelector('.swatch[aria-pressed="true"]')
    : mode ? board.querySelector('.mode-layer button') : restingFocus(closed);
  focusTarget?.focus();
  announceMode(mode, quietly ? null : closed, trackShown());
  syncBackHandling();
  // "Who goes first?" closing on a pick, after its beat or early by ✕, Escape or back: the first turn starts now that the
  // board is back, and its player's reminder can show (SPEC §13).
  if (picked) turnStarted();
  // A mode opened from settings, such as Rotate seats, was still open when settings' close event looked, so the question
  // waits for the mode to end.
  if (mode === null) maybeAskFirst();
}

// Each tile's layer, its badges, the pill and the setup button, for the mode now open (or none).
/** @param {BoardMode} mode */
function drawBoardMode(mode) {
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
}

// Back at rest, focus returns to what opened the mode, such as the pill's Commander damage, if it still shows; otherwise
// to Settings. Where the pill changed form as the mode closed, the closed mode's button takes Track's place, and the
// other way round.
/** @param {BoardMode} closed */
function restingFocus(closed) {
  let opener = modeOpener;
  modeOpener = null;
  const modeButtons = { damage: damageButton, counters: countersButton, mana: manaButton };
  if (opener === trackButton && trackButton.hidden) opener = modeButtons[closed] ?? null;
  else if (Object.values(modeButtons).includes(/** @type {HTMLButtonElement} */ (opener)) && !trackButton.hidden) opener = trackButton;
  const usable = opener instanceof HTMLElement && opener !== document.body && opener.isConnected
    && !opener.closest('[inert], [hidden], dialog') && opener.checkVisibility?.() !== false;
  return usable ? /** @type {HTMLElement} */ (opener) : setupButton;
}

// Track (design/polish/PILL-SPEC.md §3.2): opens on the tab it last showed, or the first that's still on.
export function openTrack() {
  setBoardMode(openingTab(game));
}

// The tab Track opens on next, saved with the game so it survives a relaunch. A tab isn't a game step.
/** @param {TrackTab} tab */
function rememberTab(tab) {
  if (game.trackTab === tab) return;
  game.trackTab = tab;
  saveGame();
}

// Another of Track's tabs, in the same visit: its edits, Undo's stop, ✓ and ✕ carry on across tabs. Switching isn't a
// step and saves no edit; it only changes the tiles' layers. Focus stays where it was, on the tab or on Undo.
/** @param {TrackTab} tab */
export function switchTrackTab(tab) {
  if (!editingModes.includes(boardMode) || !trackShown() || tab === boardMode || !trackTabs(game).includes(tab)) return;
  cancelPresses();
  closeBursts();
  rememberTab(tab);
  switchBoardMode(tab);
  drawBoardMode(tab);
  announceTrackTab(tab);
}

// Before Undo takes a step back in Track, the tab that step was taken on opens, so the change is seen.
export function showUndoneTab() {
  const step = game.history.steps[game.history.at - 1];
  if (step && game.history.at > editStart) switchTrackTab(stepTab(step));
}

// ✕ in an editing mode: with no changes it just closes; otherwise it asks first, and Keep editing is the default.
export function cancelEditing() {
  // The mode's changes are the history's steps since it opened, each tap or burst one.
  const changes = Math.max(0, game.history.at - editStart);
  const track = trackShown();
  if (!changes) {
    const closed = boardMode;
    setBoardMode(null);
    announceMode(null, closed, track);
    return;
  }
  document.querySelector('#discard-title').textContent = `Discard ${changes} ${changes === 1 ? 'change' : 'changes'}?`;
  // Commander damage can pass the monarch and the initiative, and counters mode sets them.
  const moved = designations.filter(({ kind }) => game[kind] !== editStartHolders[kind]).map(({ name }) => name);
  document.querySelector('#discard-message').textContent = (track ? trackDiscardMessage() : discardMessages[boardMode])
    + (moved.length ? ` So ${moved.length > 1 ? 'do' : 'does'} ${moved.join(' and ')}.` : '');
  discardDialog.returnValue = 'keep';
  showDialog(discardDialog);
}

// ✕'s message in Track names what the visit changed, across its tabs, such as "Commander damage, life and counters go
// back to how they were when you opened Track."
function trackDiscardMessage() {
  const changed = new Set(game.history.steps.slice(editStart, game.history.at).map(stepTab));
  const words = trackTabs(game).filter(tab => changed.has(tab)).flatMap(tab => trackTabInfo[tab].discard);
  const list = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0] ?? 'everything';
  return `${list[0].toUpperCase()}${list.slice(1)} go back to how they were when you opened Track.`;
}

// Discard, once the mode's steps are taken back through the history (takeBackTo in actions/history.js, which app.js
// calls first, since history.js draws the board and sits after this module), so Redo can bring them back
// (MANA-UNDO-SPEC §6.5): the mode closes.
export function discardEdits() {
  setBoardMode(null);
  // What the discarded changes said is no longer true.
  clearAnnouncements();
  announceModeEnd('Changes discarded');
}

// Leaves the open board mode the way ✕ or the check mark would without saving anything new.
export function leaveBoardMode() {
  if (editingModes.includes(boardMode)) cancelEditing();
  else if (boardMode === 'first') skipFirst();
  else setBoardMode(null);
}
