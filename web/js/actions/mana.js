// Floating mana at rest (design/polish/SPEC.md §9): spending from the strip, the eraser, and emptying every pool as the
// turn passes. Each is an undo step (MANA-UNDO-SPEC §6.2). Mana mode's own edits are in edits.js.

import { manaColours, stripHoldTime } from '../logic/data.js';
import { hasMana } from '../logic/rules.js';
import { fitCounts, fitPools } from '../logic/save.js';
import { announce, announcePool } from '../render/announce.js';
import { renderBadges } from '../render/badges.js';
import { haptic } from '../state/platform.js';
import { game, stripHolds } from '../state/state.js';
import { commit } from './commit.js';

// Empties every pool when the turn passes, if that's switched on, and returns what it emptied so a step back can put
// it back.
export function autoEmptyPools() {
  if (!game.manaPool || !game.autoEmpty) return null;
  if (!game.pools.some((_, index) => hasMana(game, index))) return null;
  const emptied = game.pools.map(pool => [...pool]);
  game.pools = fitPools([], game.scores.length);
  return emptied;
}

// A tap on a strip keeps its buttons in place until nobody has tapped it for stripHoldTime: a colour spent to 0 stays as a
// 0 and an empty pool keeps its strip over the life total (render/badges.js), so a quick extra tap can't land on whatever would have slid under the finger (docs/review/DEEP-DIVE.md D1). The life buttons
// under the strip ignore touches for the same time (actions/board.js). Then the strip reflows.
function holdStrip(index) {
  const held = stripHolds.get(index);
  clearTimeout(held?.timer);
  const colours = held?.colours ?? new Set(manaColours.filter((_, at) => game.pools[index][at] > 0).map(({ id }) => id));
  stripHolds.set(index, {
    colours,
    timer: setTimeout(() => {
      stripHolds.delete(index);
      renderBadges(index);
    }, stripHoldTime),
  });
}

// Ends every strip's hold at once, for a new game.
export function endStripHolds() {
  for (const { timer } of stripHolds.values()) clearTimeout(timer);
  stripHolds.clear();
}

// Spending from the strip saves at once. Quick spends of one colour merge into one undo step (MANA-UNDO-SPEC §6.2a).
export function spendMana(index, colour) {
  holdStrip(index);
  if (game.pools[index][colour] === 0) return;
  game.pools[index][colour] -= 1;
  commit({ badges: [index], pill: true, step: { key: `spend:${index}:${colour}` } });
  haptic();
  announcePool(index);
}

// The eraser empties the pool, as one step Undo can take back (it replaced "Undo clear"). The strip holds its place, its
// colours at 0, for stripHoldTime, so a second tap lands on the eraser again, which then does nothing.
export function clearPool(index) {
  if (!hasMana(game, index)) return;
  holdStrip(index);
  game.pools[index] = fitCounts([], manaColours.length);
  commit({ badges: [index], pill: true, step: { kind: 'eraser' } });
  haptic();
  announce(index, 'mana', () => `Player ${index + 1}, mana pool cleared`);
}
