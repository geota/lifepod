// The centre pill: which of its buttons show at rest, in a mode and while editing, their labels, and measuring the
// board again when its length changes.

import { measureBoard } from '../layout/board.js';
import { editingModes } from '../logic/data.js';
import { stepText } from '../logic/history.js';
import { hasCountersMode, restPillButtons } from '../logic/rules.js';
import { boardMode, edits, game } from '../state/state.js';
import {
  boardControls, cancelButton, countersButton, damageButton, diceButton, manaButton, redoButton, roundBackButton,
  roundButton, saveButton, setupButton, shuffleButton, undoButton,
} from '../ui/dom.js';

// The pill's buttons now and at rest, as last measured.
let pillShape = '';

// The centre pill: commander damage (when Commander is on), counters (when a counter is on), Undo, dice and setup
// at rest; Undo, save and ✕ while editing.
export function syncPill() {
  const editing = editingModes.includes(boardMode);
  const first = boardMode === 'first';
  roundButton.hidden = boardMode !== null || game.turns === 'off';
  roundBackButton.hidden = roundButton.hidden;
  damageButton.hidden = boardMode !== null || !game.counters.commander;
  countersButton.hidden = boardMode !== null || !hasCountersMode(game);
  manaButton.hidden = boardMode !== null || !game.manaPool;
  diceButton.hidden = boardMode !== null;
  setupButton.hidden = editing || first;
  shuffleButton.hidden = !first;
  undoButton.hidden = boardMode !== null && !editing;
  saveButton.hidden = !editing;
  cancelButton.hidden = !editing && !first;
  cancelButton.setAttribute('aria-label', first ? 'Skip' : 'Cancel');
  syncUndo();
  // The round, printed twice like a card index so both sides of the table can read it.
  const { round, active } = game.turn;
  for (const number of roundButton.querySelectorAll('.round > span')) number.textContent = String(round);
  roundButton.setAttribute('aria-label', game.turns === 'rounds' ? `Round ${round}. Next round`
    : active === null ? `Round ${round}. Choose who goes first` : `Round ${round}, Player ${active + 1}'s turn. Pass the turn`);
  roundBackButton.setAttribute('aria-label', game.turns === 'rounds' ? 'Back one round' : 'Back one turn');
  // The tap symbol's pip gets a dot while any pool has mana, and the button's name says how much (MANA-UNDO-SPEC §5).
  const floating = game.pools.reduce((sum, pool) => sum + pool.reduce((total, amount) => total + amount, 0), 0);
  manaButton.toggleAttribute('data-floating', floating > 0);
  manaButton.setAttribute('aria-label', floating ? `Mana pool, ${floating} mana floating` : 'Mana pool');
  // The pill's length decides which face edges it reaches, so the board is measured again when it changes.
  const shape = `${[...boardControls.querySelectorAll('.pill-button')].filter(button => !button.hidden).length} ${restPillButtons(game)}`;
  if (shape !== pillShape) {
    pillShape = shape;
    measureBoard();
  }
}

// Undo and its hidden Redo. At rest they step through the game's history (MANA-UNDO-SPEC §6.6): Undo always shows, so the
// pill never changes length, and is dimmed with nothing to undo, but not disabled, so a hold still opens History; its
// name says what it would undo. While editing, Undo takes back the mode's own edits and is disabled once they're gone.
export function syncUndo() {
  const editing = editingModes.includes(boardMode);
  redoButton.hidden = boardMode !== null;
  if (editing) {
    undoButton.disabled = !edits?.length;
    undoButton.removeAttribute('aria-disabled');
    undoButton.setAttribute('aria-label', 'Undo');
    return;
  }
  undoButton.disabled = false;
  const { at, steps } = game.history;
  const back = at > 0 ? steps[at - 1] : null;
  const ahead = at < steps.length ? steps[at] : null;
  for (const [button, step, verb, nothing] of /** @type {const} */ ([[undoButton, back, 'Undo', 'nothing to undo'], [redoButton, ahead, 'Redo', 'nothing to redo']])) {
    if (step) button.removeAttribute('aria-disabled');
    else button.setAttribute('aria-disabled', 'true');
    button.setAttribute('aria-label', step ? `${verb}: ${stepText(step, game)}` : `${verb}, ${nothing}`);
  }
}
