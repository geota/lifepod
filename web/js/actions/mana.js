// Floating mana at rest (design/polish/SPEC.md §9): spending from the strip, the eraser, emptying the pools as the turn
// passes, and using a Treasure from its chip. Each is an undo step (MANA-UNDO-SPEC §6.2). Mana mode's own edits are in edits.js.

import { manaColours, stripHoldTime } from '../logic/data.js';
import { hasMana, turnPassPools } from '../logic/rules.js';
import { fitCounts } from '../logic/save.js';
import { announce, announcePool, announceTreasure } from '../render/announce.js';
import { renderBadges } from '../render/badges.js';
import { haptic } from '../state/platform.js';
import { game, stripHolds, tokenHolds } from '../state/state.js';
import { commit } from './commit.js';

// Empties the pools when the turn passes, if that's switched on, except those their players keep (MANA-SPEC-v2 §4.3),
// and returns what it emptied, a pool per player (empty for one it left alone), so a step back puts back only that, and
// who kept mana, for the announcement.
export function autoEmptyPools() {
  const { emptied, kept } = turnPassPools(game);
  if (!emptied.length) return { emptied: null, kept };
  const pools = game.pools.map((pool, index) => (emptied.includes(index) ? [...pool] : fitCounts([], manaColours.length)));
  for (const index of emptied) game.pools[index] = fitCounts([], manaColours.length);
  return { emptied: pools, kept };
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

// Ends every strip's and Treasure chip's hold at once, for a new game.
export function endStripHolds() {
  for (const { timer } of stripHolds.values()) clearTimeout(timer);
  stripHolds.clear();
  for (const timer of tokenHolds.values()) clearTimeout(timer);
  tokenHolds.clear();
}

// A tap on a Treasure chip keeps it in place, dimmed at 0, until nobody has tapped it for stripHoldTime, as a strip does.
function holdToken(index) {
  clearTimeout(tokenHolds.get(index));
  tokenHolds.set(index, setTimeout(() => {
    tokenHolds.delete(index);
    renderBadges(index);
  }, stripHoldTime));
}

// A tap on a Treasure chip at rest uses one (MANA-SPEC-v2 §1.2): the count goes down, with no colour to pick, since a
// Treasure's mana is spent as it's made. Quick uses merge into one undo step, as spends do, under the same key as mana
// mode's Treasure cell.
export function useTreasure(index) {
  holdToken(index);
  if (game.treasure[index] === 0) return;
  game.treasure[index] -= 1;
  commit({ badges: [index], step: { key: `token:${index}:treasure` } });
  haptic();
  announceTreasure(index);
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
