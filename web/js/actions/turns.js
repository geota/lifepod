// Turns (design/polish/SPEC.md §8): stepping forward and back, by round or turn by turn, starting a player's turn, and
// the steps kept so a hold steps back exactly. Each is an undo step too (MANA-UNDO-SPEC §6.5): Undo is the general tool,
// and the hold stays because it's about the turn alone.

import { maxCount } from '../logic/data.js';
import { turnBack, turnForward } from '../logic/rules.js';
import { announce, seatName } from '../render/announce.js';
import { haptic } from '../state/platform.js';
import { game, turnSteps } from '../state/state.js';
import { commit } from './commit.js';
import { autoEmptyPools } from './mana.js';
import { maybeAskFirst, setAskFirst } from './mode.js';
import { remind, turnStarted } from './reminders.js';

// Shows a turn step on every tile and the pill, saves it at once as one undo step, with any pools it emptied
// (MANA-UNDO-SPEC §6.2), and announces it. A turn chip passed from the keyboard is gone, and focus follows the turn to
// the chip that has it now (render/badges.js).
/** @param {import('../logic/data.js').StepKind} kind */
function showTurn(kind) {
  commit({ badges: 'all', pill: true, step: { kind } });
  haptic();
  const { active, round } = game.turn;
  announce(-1, 'turn', () => (game.turns === 'turns' && active !== null ? `${seatName(active)}'s turn, round ${round}` : `Round ${round}`));
}

function recordStep(before, emptied) {
  turnSteps.push({ turn: before, emptied });
  if (turnSteps.length > 200) turnSteps.shift();
}

// The next step forward (turnForward in rules.js). Rounds: the next round. Turn by turn: the next player in play order
// who isn't out, and the round goes up when play passes the first player's seat. With nobody's turn yet, the pill asks
// who goes first. In the last round (maxRound) play holds rather than start another, and nothing is recorded, so a step
// back always undoes exactly one step.
export function stepTurn() {
  if (game.turns === 'off') return;
  if (game.turns === 'turns' && game.turn.active === null) {
    setAskFirst(true);
    maybeAskFirst();
    return;
  }
  const before = { ...game.turn };
  const next = turnForward(game);
  if (!next) return;
  game.turn = next;
  recordStep(before, autoEmptyPools());
  showTurn('turn');
  if (game.turns === 'turns') {
    // The monarch draws at the beginning of their end step, so passing the turn reminds them, and the initiative's
    // holder ventures at the beginning of their upkeep, so their turn starting reminds them.
    if (game.monarch === before.active) remind(before.active, 'monarch');
    turnStarted();
  }
}

// Turn by turn with nobody's turn yet: a tile's turn chip starts that player's turn, and they go first if nobody has.
export function startTurn(index) {
  const before = { ...game.turn };
  game.turn.active = index;
  game.turn.first ??= index;
  recordStep(before, null);
  showTurn('start');
  turnStarted();
}

// One step back: the last step taken, with any pools it emptied, or after a relaunch the previous player in play
// order or the previous round (turnBack in rules.js). The round never goes below 1.
export function stepBack() {
  if (game.turns === 'off') return;
  const step = turnSteps.pop();
  if (step) {
    game.turn = step.turn;
    step.emptied?.forEach((pool, index) => pool.forEach((amount, colour) => {
      game.pools[index][colour] = Math.min(maxCount, game.pools[index][colour] + amount);
    }));
  } else {
    const back = turnBack(game);
    if (!back) return;
    game.turn = back;
  }
  // The hold steps back through the turn only, and is a step of its own, so Undo can take it back too.
  showTurn('turnBack');
}
