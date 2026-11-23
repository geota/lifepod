// LifePod's entry point, the page's one module script (index.html). It loads the modules under js/ (AGENTS.md, "Modules"),
// whose dependencies run one way: logic → state → layout → render → actions → sheets → here. Importing the sheets wires
// the settings page and the dice sheet; this file wires the pill's other buttons, back and Escape, the window and the
// fonts, passes the renderers the actions their buttons call, and draws the board.

import { renderBoard } from './js/actions/board.js';
import {
  chooseColour, stepCount, stepDamage, stepMana, toggleDesignation, toggleIdentity, undoEdit,
} from './js/actions/edits.js';
import { clearPool, spendMana, undoClear } from './js/actions/mana.js';
import {
  cancelEditing, chooseFirst, discardEdits, leaveBoardMode, maybeAskFirst, setBoardMode, shuffleFirst,
} from './js/actions/mode.js';
import { dismissReminder, remind } from './js/actions/reminders.js';
import { startTurn, stepBack, stepTurn } from './js/actions/turns.js';
import { measureBoard, syncBoardTurn } from './js/layout/board.js';
import { resetDrops } from './js/layout/fit.js';
import { compactGroups, fitCompactSwitches } from './js/layout/settings.js';
import { announceModeEnd } from './js/render/announce.js';
import { applyBadgeSize, applyStyle, applyTileColours } from './js/render/appearance.js';
import { setBadgeActions } from './js/render/badges.js';
import { setModeActions } from './js/render/modes.js';
import { syncPill } from './js/render/pill.js';
import { android, ios, portraitQuery, setReduceTransparency, syncWakeLock } from './js/state/platform.js';
import { boardMode, editStartHolders, game, saveGame, syncBackHandling } from './js/state/state.js';
import {
  board, cancelButton, countersButton, damageButton, discardDialog, manaButton, roundBackButton, roundButton,
  saveButton, shuffleButton, undoButton,
} from './js/ui/dom.js';
import { bindRelease, bindStep, cancelPresses } from './js/ui/press.js';

import './js/sheets/options.js';
import './js/sheets/settings.js';
import './js/sheets/dice.js';

// The iOS app passes Reduce Transparency in before the page loads, and calls this whenever it changes.
window.setReduceTransparency = setReduceTransparency;
setReduceTransparency(window.initialReduceTransparency);

// The pill's buttons (the setup button is settings.js's, and the dice button dice.js's).
damageButton.addEventListener('click', () => setBoardMode('damage'));
countersButton.addEventListener('click', () => setBoardMode('counters'));
manaButton.addEventListener('click', () => setBoardMode('mana'));
bindStep(roundButton, stepTurn, stepBack);
roundBackButton.addEventListener('click', stepBack);
bindRelease(shuffleButton, shuffleFirst);
undoButton.addEventListener('click', undoEdit);
saveButton.addEventListener('click', () => {
  saveGame();
  // Whoever took the initiative in the mode, by commander damage or a tap, ventures into Undercity.
  const taker = game.initiative !== editStartHolders.initiative ? game.initiative : null;
  setBoardMode(null);
  announceModeEnd('Saved');
  remind(taker, 'initiative');
});
cancelButton.addEventListener('click', () => {
  if (boardMode === 'first') setBoardMode(null);
  else cancelEditing();
});
discardDialog.addEventListener('close', () => {
  syncBackHandling();
  if (discardDialog.returnValue === 'discard') discardEdits();
  // Keep editing: the dialog gives focus back to what had it, such as the cell Escape was pressed on, or ✕. Android's
  // back gesture can open it with nothing focused, and then ✕ takes it.
  else if (!document.activeElement || document.activeElement === document.body) cancelButton.focus();
});

// Android's back gesture closes the open dialog, then leaves the open board mode the way ✕ does.
window.closeOpenDialog = () => {
  const openDialog = [.../** @type {NodeListOf<HTMLDialogElement>} */ (document.querySelectorAll('dialog[open]'))].at(-1);
  if (openDialog) {
    openDialog.close('cancel');
    return true;
  }
  if (!boardMode) return false;
  leaveBoardMode();
  return true;
};
document.addEventListener('keydown', (event) => {
  if (!boardMode || event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
  // Escape's own default is a close request, which would go to the Discard dialog this opens and close it at once.
  event.preventDefault();
  leaveBoardMode();
});

// "Who goes first?" waits for settings and the new game dialog to close. These listeners run after each dialog's own.
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('close', maybeAskFirst);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelPresses();
  else if (!android && !ios) syncWakeLock(() => game.keepAwake);
});
window.screen.orientation.addEventListener('change', syncBoardTurn);
window.addEventListener('resize', syncBoardTurn);
portraitQuery.addEventListener('change', syncBoardTurn);
// The board's size can also change without a resize event, such as when a browser's toolbar slides away.
if (window.ResizeObserver) new ResizeObserver(measureBoard).observe(board);
// Identity symbols come from the Mana font. Rows fitted before it loaded were measured with another font's glyphs,
// so they're fitted again from full size once it has. The board is turned and measured again first: a font can
// finish loading in the middle of a resize or a rotation, before the board has caught up with the window.
document.fonts?.addEventListener?.('loadingdone', () => {
  resetDrops();
  syncBoardTurn();
  compactGroups.forEach(fitCompactSwitches);
});
// WebKit can fire `loading` and never `loadingdone`, so each load also fits the board again once document.fonts.ready
// settles, keeping the drops it has (the hysteresis decides): a face that arrives late can't leave a mana strip or a
// badge row placed by another font's measurements, over a total.
document.fonts?.addEventListener?.('loading', () => document.fonts.ready.then(() => {
  syncBoardTurn();
  compactGroups.forEach(fitCompactSwitches);
}));

// A module's names aren't page globals, so the design scripts (design/polish/final-review.mjs) reach the few internals they
// drive through ?debug in the URL. The apps never load the page with it.
if (new URLSearchParams(location.search).has('debug')) window.lifePodDebug = { game, remind };

// Boot. The renderers' buttons call these actions, which sit above them, so they're passed in before the first draw.
setBadgeActions({ stepTurn, stepBack, startTurn, spendMana, clearPool, undoClear, dismissReminder, setBoardMode });
setModeActions({ stepDamage, chooseColour, toggleIdentity, stepCount, toggleDesignation, stepMana, chooseFirst });
applyTileColours();
applyBadgeSize();
applyStyle();
syncBoardTurn();
renderBoard();
syncPill();
syncWakeLock(() => game.keepAwake);
syncBackHandling();
