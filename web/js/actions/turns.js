// Turns (design/polish/SPEC.md §8): stepping forward and back, by round or turn by turn, starting a player's turn, and
// the steps kept so a hold steps back exactly.

import { maxCount, maxRound } from '../logic/data.js';
import { nextTurn, previousTurn } from '../logic/rules.js';
import { announce } from '../render/announce.js';
import { renderBadges } from '../render/badges.js';
import { syncPill } from '../render/pill.js';
import { haptic } from '../state/platform.js';
import { game, saveGame, turnSteps } from '../state/state.js';
import { board } from '../ui/dom.js';
import { autoEmptyPools } from './mana.js';
import { maybeAskFirst, setAskFirst } from './mode.js';
import { remind, turnStarted } from './reminders.js';

// Shows a turn step on every tile and the pill, saves it at once and announces it.
function showTurn() {
  const turnFocus = document.activeElement?.matches('.turn-chip');
  saveGame();
  haptic();
  game.scores.forEach((_, index) => renderBadges(index));
  syncPill();
  // A turn chip passed from the keyboard is gone, so focus moves to the chip that now has the turn.
  if (turnFocus && !document.activeElement?.matches('.turn-chip')) board.querySelector('.active-chip, .turn-chip')?.focus();
  const { active, round } = game.turn;
  announce(-1, 'turn', () => (game.turns === 'turns' && active !== null ? `Player ${active + 1}'s turn, round ${round}` : `Round ${round}`));
}

function recordStep(before, emptied) {
  turnSteps.push({ turn: before, emptied });
  if (turnSteps.length > 200) turnSteps.shift();
}

// The next step forward. Rounds: the next round. Turn by turn: the next player in play order who isn't out, and the
// round goes up when play passes the first player's seat. With nobody's turn yet, the pill asks who goes first.
export function stepTurn() {
  if (game.turns === 'off') return;
  const before = { ...game.turn };
  if (game.turns === 'rounds') {
    game.turn.round = Math.min(maxRound, game.turn.round + 1);
  } else {
    if (game.turn.active === null) {
      setAskFirst(true);
      maybeAskFirst();
      return;
    }
    const { next, crossed } = nextTurn(game);
    game.turn.active = next;
    if (crossed) game.turn.round = Math.min(maxRound, game.turn.round + 1);
  }
  recordStep(before, autoEmptyPools());
  showTurn();
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
  showTurn();
  turnStarted();
}

// One step back: the last step taken, with any pools it emptied, or after a relaunch the previous player in play
// order (or the previous round). The round never goes below 1.
export function stepBack() {
  if (game.turns === 'off') return;
  const step = turnSteps.pop();
  if (step) {
    game.turn = step.turn;
    step.emptied?.forEach((pool, index) => pool.forEach((amount, colour) => {
      game.pools[index][colour] = Math.min(maxCount, game.pools[index][colour] + amount);
    }));
  } else if (game.turns === 'rounds') {
    if (game.turn.round === 1) return;
    game.turn.round -= 1;
  } else {
    if (game.turn.active === null) return;
    const { previous, crossed } = previousTurn(game);
    if (crossed && game.turn.round === 1) return;
    game.turn.active = previous;
    if (crossed) game.turn.round -= 1;
  }
  showTurn();
}
