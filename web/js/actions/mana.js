// Floating mana at rest (design/polish/SPEC.md §9): spending from the strip, the eraser and its "Undo clear", and
// emptying every pool as the turn passes. Mana mode's own edits are in edits.js.

import { manaColours, maxCount, stripHoldTime, undoClearTime } from '../logic/data.js';
import { hasMana } from '../logic/rules.js';
import { fitCounts, fitPools } from '../logic/save.js';
import { announce, announcePool } from '../render/announce.js';
import { renderBadges } from '../render/badges.js';
import { haptic } from '../state/platform.js';
import { clearedPools, game, stripHolds } from '../state/state.js';
import { commit } from './commit.js';

// Empties every pool when the turn passes, if that's switched on, and returns what it emptied so a step back can put
// it back. The turn passing also ends any "Undo clear": the pool would have emptied anyway.
export function autoEmptyPools() {
  if (!game.manaPool || !game.autoEmpty) return null;
  endUndoClears();
  if (!game.pools.some((_, index) => hasMana(game, index))) return null;
  const emptied = game.pools.map(pool => [...pool]);
  game.pools = fitPools([], game.scores.length);
  return emptied;
}

// A tap on a strip keeps its buttons in place until nobody has tapped it for stripHoldTime: a colour spent to 0 stays as a
// 0, an empty pool keeps its strip over the life total, and "Undo clear" ignores taps (render/badges.js), so a quick
// extra tap can't land on whatever would have slid under the finger (docs/review/DEEP-DIVE.md D1). The life buttons
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

// Spending from the strip saves at once and has no undo: add it back in mana mode.
export function spendMana(index, colour) {
  holdStrip(index);
  if (game.pools[index][colour] === 0) return;
  game.pools[index][colour] -= 1;
  commit({ badges: [index], pill: true });
  haptic();
  announcePool(index);
}

// The eraser empties the pool and leaves "Undo clear" in the strip's place for 5 seconds.
export function clearPool(index) {
  if (!hasMana(game, index)) return;
  holdStrip(index);
  // "Undo clear" takes the strip's place, so no colour keeps one.
  /** @type {{ colours: Set<string> }} */ (stripHolds.get(index)).colours.clear();
  endUndoClear(index);
  const pool = game.pools[index];
  game.pools[index] = fitCounts([], manaColours.length);
  clearedPools.set(index, { pool, timer: setTimeout(() => endUndoClear(index), undoClearTime) });
  commit({ badges: [index], pill: true });
  haptic();
  announce(index, 'mana', () => `Player ${index + 1}, mana pool cleared`);
}

export function undoClear(index) {
  const cleared = clearedPools.get(index);
  if (!cleared) return;
  clearTimeout(cleared.timer);
  clearedPools.delete(index);
  cleared.pool.forEach((amount, colour) => {
    game.pools[index][colour] = Math.min(maxCount, game.pools[index][colour] + amount);
  });
  commit({ badges: [index], pill: true });
  haptic();
  announcePool(index);
}

function endUndoClear(index) {
  const cleared = clearedPools.get(index);
  if (!cleared) return;
  clearTimeout(cleared.timer);
  clearedPools.delete(index);
  renderBadges(index);
}

export function endUndoClears() {
  for (const index of [...clearedPools.keys()]) endUndoClear(index);
}
