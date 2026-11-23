// What screen readers hear about the board (#announcer): changes are announced once a burst of them settles, each
// player's news in seat order, rather than on every step of a hold.

import { designations } from '../logic/data.js';
import { poolText } from '../logic/rules.js';
import { game } from '../state/state.js';
import { announcer } from '../ui/dom.js';

/** @typedef {import('../logic/data.js').Designation} Designation */

let announceTimer;
const pendingAnnouncements = new Map();

// Announce totals once a burst of changes settles, instead of on every step of a hold. Each player's news is
// read in seat order, and describe() runs when it's read, so it gives the settled value.
/**
 * @param {number} index The player, or -1 for the whole table.
 * @param {string} kind
 * @param {() => string} describe
 */
export function announce(index, kind, describe) {
  pendingAnnouncements.set(`${index} ${kind}`, { index, describe });
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    announcer.textContent = [...pendingAnnouncements.values()].sort((a, b) => a.index - b.index)
      .map(item => item.describe()).join('. ');
    pendingAnnouncements.clear();
  }, 700);
}

export function announceLife(index) {
  announce(index, 'life', () => `Player ${index + 1}, ${game.scores[index]} life`);
}

// Says who holds a designation now, once a burst of changes settles.
export function announceDesignation(kind) {
  const { name, role } = /** @type {Designation} */ (designations.find(designation => designation.kind === kind));
  announce(-1, kind, () => (game[kind] === null ? `Nobody has ${name}` : `Player ${game[kind] + 1} ${role}`));
}

export function announcePool(index) {
  announce(index, 'mana', () => `Player ${index + 1}, mana pool ${poolText(game, index)}`);
}

// A new board drops whatever was still waiting to be read.
export function clearAnnouncements() {
  clearTimeout(announceTimer);
  pendingAnnouncements.clear();
}
