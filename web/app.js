// LifePod's entry point, the page's one module script (index.html). It loads the modules under js/ (AGENTS.md, "Modules"),
// whose dependencies run one way: logic → state → layout → render → actions → sheets → here. Importing the sheets wires
// the settings page and the dice sheet; this file wires the pill's other buttons, back and Escape, the window and the
// fonts, passes the renderers the actions their buttons call, and draws the board.

import { renderBoard } from './js/actions/board.js';
import { commit } from './js/actions/commit.js';
import {
  chooseColour, stepCount, stepDamage, stepMana, toggleDesignation, toggleIdentity, undoEdit,
} from './js/actions/edits.js';
import { dismissUndoToast, openHistory, redo, undo } from './js/actions/history.js';
import { clearPool, spendMana } from './js/actions/mana.js';
import {
  cancelEditing, chooseFirst, discardEdits, leaveBoardMode, maybeAskFirst, setBoardMode, shuffleFirst, skipFirst,
} from './js/actions/mode.js';
import { dismissReminder, remind } from './js/actions/reminders.js';
import { startTurn, stepBack, stepTurn } from './js/actions/turns.js';
import { measureBoard, syncBoardTurn } from './js/layout/board.js';
import { editingModes } from './js/logic/data.js';
import { loadedFaces, requestFit, resetDrops } from './js/layout/fit.js';
import { fitAllCompactSwitches } from './js/layout/settings.js';
import { announceModeEnd } from './js/render/announce.js';
import { applyBadgeSize, applyStyle, applyTileColours } from './js/render/appearance.js';
import { setBadgeActions } from './js/render/badges.js';
import { renderLifeDelta } from './js/render/history.js';
import { setModeActions } from './js/render/modes.js';
import { syncPill } from './js/render/pill.js';
import {
  android, ios, portraitQuery, setReduceTransparency, setTextScale, syncWakeLock, systemTextScale,
} from './js/state/platform.js';
import { onBurstChange } from './js/state/history.js';
import { boardMode, editStartHolders, game, syncBackHandling } from './js/state/state.js';
import {
  board, cancelButton, countersButton, damageButton, discardDialog, manaButton, redoButton, resetZoom, roundBackButton,
  roundButton, saveButton, shuffleButton, undoButton,
} from './js/ui/dom.js';
import { bindRelease, bindStep, cancelPresses } from './js/ui/press.js';

import './js/sheets/settings.js';
import './js/sheets/dice.js';

// The iOS app passes Reduce Transparency in before the page loads, and calls this whenever it changes.
window.setReduceTransparency = setReduceTransparency;
setReduceTransparency(window.initialReduceTransparency);
// The system text size: read at launch, and the iOS app calls this when it changes. The badge rows are fitted again
// from full size, and settings' compact switches again, as when a font loads.
setTextScale(systemTextScale());
window.setTextScale = (scale) => {
  setTextScale(scale);
  resetDrops();
  syncBoardTurn();
  fitAllCompactSwitches();
};

// The pill's buttons (the setup button is settings.js's, and the dice button dice.js's).
damageButton.addEventListener('click', () => setBoardMode('damage'));
countersButton.addEventListener('click', () => setBoardMode('counters'));
manaButton.addEventListener('click', () => setBoardMode('mana'));
bindStep(roundButton, stepTurn, stepBack);
roundBackButton.addEventListener('click', stepBack);
bindRelease(shuffleButton, shuffleFirst);
// Undo: at rest, back one step through the game, and a hold opens History (MANA-UNDO-SPEC §6.6); in an editing mode, the
// mode's last edit, held or not. The hidden button beside it redoes, for keyboards and screen readers.
const editing = () => editingModes.includes(boardMode);
bindStep(undoButton, () => (editing() ? undoEdit() : undo()), () => (editing() ? undoEdit() : openHistory()));
redoButton.addEventListener('click', redo);
saveButton.addEventListener('click', () => {
  commit();
  // Whoever took the initiative in the mode, by commander damage or a tap, ventures into Undercity.
  const taker = game.initiative !== editStartHolders.initiative ? game.initiative : null;
  setBoardMode(null);
  announceModeEnd('Saved');
  remind(taker, 'initiative');
});
cancelButton.addEventListener('click', () => {
  if (boardMode === 'first') skipFirst();
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
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('close', maybeAskFirst);
  dialog.addEventListener('close', resetZoom);
}
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
// finish loading in the middle of a resize or a rotation, before the board has caught up with the window. Chromium
// fires `loading` and `loadingdone` on every resize without loading anything, so only an event after which more faces
// have loaded counts (docs/review/PERFORMANCE.md F2); the rest would throw away the drops and refit for nothing.
let faces = loadedFaces();
function fontsArrived() {
  const now = loadedFaces();
  if (now === faces) return false;
  faces = now;
  return true;
}
document.fonts?.addEventListener?.('loadingdone', () => {
  if (!fontsArrived()) return;
  resetDrops();
  syncBoardTurn();
  requestFit();
  fitAllCompactSwitches();
});
// WebKit can fire `loading` and never `loadingdone`, so each load also fits the board again once document.fonts.ready
// settles, keeping the drops it has (the hysteresis decides): a face that arrives late can't leave a mana strip or a
// badge row placed by another font's measurements, over a total.
document.fonts?.addEventListener?.('loading', () => document.fonts.ready.then(() => {
  if (!fontsArrived()) return;
  syncBoardTurn();
  requestFit();
  fitAllCompactSwitches();
}));

// Boot. The renderers' buttons call these actions, which sit above them, so they're passed in before the first draw.
setBadgeActions({ stepTurn, stepBack, startTurn, spendMana, clearPool, dismissReminder, setBoardMode, redo, dismissUndoToast });
// A total's running delta follows its burst of quick taps (MANA-UNDO-SPEC §6.2b).
onBurstChange(renderLifeDelta);
setModeActions({ stepDamage, chooseColour, toggleIdentity, stepCount, toggleDesignation, stepMana, chooseFirst });
applyTileColours();
applyBadgeSize();
applyStyle();
syncBoardTurn();
renderBoard();
syncPill();
syncWakeLock(() => game.keepAwake);
syncBackHandling();
