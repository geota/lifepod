// The centre pill: which of its buttons show at rest, in a mode and while editing, their labels, and measuring the
// board again when its length changes.

import { measureBoard } from '../layout/board.js';
import { editingModes } from '../logic/data.js';
import { hasCountersMode, hasMana, restPillButtons } from '../logic/rules.js';
import { boardMode, edits, game } from '../state/state.js';
import {
  boardControls, cancelButton, countersButton, damageButton, diceButton, manaButton, roundBackButton, roundButton,
  saveButton, setupButton, shuffleButton, undoButton,
} from '../ui/dom.js';

// The pill's buttons now and at rest, as last measured.
let pillShape = '';

// The centre pill: commander damage (when Commander is on), counters (when a counter is on), dice and setup
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
  for (const button of [undoButton, saveButton]) button.hidden = !editing;
  cancelButton.hidden = !editing && !first;
  cancelButton.setAttribute('aria-label', first ? 'Skip' : 'Cancel');
  undoButton.disabled = !edits?.length;
  // The round, printed twice like a card index so both sides of the table can read it.
  const { round, active } = game.turn;
  for (const number of roundButton.querySelectorAll('.round > span')) number.textContent = String(round);
  roundButton.setAttribute('aria-label', game.turns === 'rounds' ? `Round ${round}. Next round`
    : active === null ? `Round ${round}. Choose who goes first` : `Round ${round}, Player ${active + 1}'s turn. Pass the turn`);
  roundBackButton.setAttribute('aria-label', game.turns === 'rounds' ? 'Back one round' : 'Back one turn');
  // The tap symbol gets a dot while any pool has mana.
  manaButton.toggleAttribute('data-floating', game.pools.some((_, index) => hasMana(game, index)));
  // The pill's length decides which face edges it reaches, so the board is measured again when it changes.
  const shape = `${[...boardControls.querySelectorAll('.pill-button')].filter(button => !button.hidden).length} ${restPillButtons(game)}`;
  if (shape !== pillShape) {
    pillShape = shape;
    measureBoard();
  }
}
