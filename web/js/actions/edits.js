// What the board modes change: an editing mode's edits (commander damage, counters, designations and mana), each
// applied, shown and saved at once as a step of the game's history, where the mode's Undo and ✕ find them
// (MANA-UNDO-SPEC §6.5), and the choices that Colours and Identity save at once, which aren't steps.

import { countKinds, maxCount } from '../logic/data.js';
import {
  applyNewEdit, countEdit, damageEdit, designationEdit, editPlayers, manaEdit,
} from '../logic/rules.js';
import { normalizeIdentity } from '../logic/save.js';
import { announce, announceDesignation, announceLife, announcePool, announceTreasure } from '../render/announce.js';
import { syncAllSwatches, syncCounterCells, syncIdentity, syncManaCells, syncSeatMap } from '../render/modes.js';
import { paintColours } from '../render/tile.js';
import { haptic } from '../state/platform.js';
import { game } from '../state/state.js';
import { commit } from './commit.js';

/** @typedef {import('../logic/rules.js').Edit} Edit */

// Colours mode saves each choice at once. Like identities, it isn't a game step (MANA-UNDO-SPEC §6.3): picked at setup
// and toggled back, it would flood the history.
export function chooseColour(index, colour) {
  if (game.colors.includes(colour)) return;
  game.colors[index] = colour;
  paintColours();
  syncAllSwatches();
  commit({ step: false });
  haptic();
}

// Identity mode saves each change at once, like Colours.
export function toggleIdentity(index, id) {
  const identity = game.identities[index];
  game.identities[index] = identity.includes(id) ? identity.replace(id, '') : normalizeIdentity(identity + id);
  syncIdentity();
  commit({ badges: [index], step: false });
  haptic();
}

// Shows an edit everywhere it appears, and saves it as a step, so nothing is lost if the app is closed mid-mode. Quick
// taps on one cell merge, by key (the tile is the key's second part).
/**
 * @param {Edit} edit
 * @param {string} [key]
 */
function showEdit(edit, key) {
  const { index } = edit;
  // Whoever holds the monarch and the initiative now, after a tap, commander damage or a player going out.
  for (const { kind } of edit.transfers ?? []) announceDesignation(kind);
  if (edit.kind === 'casts') {
    announce(index, 'casts', () => `Player ${index + 1}, commander tax ${game.casts[index] * 2}`);
  } else if (countKinds.includes(edit.kind)) {
    announce(index, edit.kind, () => `Player ${index + 1}, ${game[edit.kind][index]} ${edit.kind}`);
  } else if (edit.kind === 'damage') {
    const attacker = /** @type {number} */ (edit.attacker);
    announce(index, `damage ${attacker}`, () =>
      `Player ${attacker + 1}'s commander, ${game.commanderDamage[index][attacker]} damage to Player ${index + 1}`);
    announceLife(index);
    syncSeatMap(index);
  } else if (edit.kind === 'mana') {
    announcePool(index);
  }
  const players = editPlayers(edit);
  for (const player of players) {
    syncCounterCells(player);
    syncManaCells(player);
  }
  commit({ scores: players, badges: players, pill: true, step: key ? { key } : {} });
  haptic();
}

// An edit made in a mode, or null for a tap that would take a count out of range, which does nothing. applyNewEdit
// applies it, and anyone it puts out of the game hands on what they hold (CR 726.4 and 727.4) in the same step.
/**
 * @param {Edit | null} edit
 * @param {string} [key]
 */
function commitEdit(edit, key) {
  if (!edit) return;
  showEdit(applyNewEdit(game, edit), key);
}

// The modes' taps. The edit each makes, and what it passes on, is in rules.js: commander damage to the monarch or the
// initiative's holder passes it to the attacker (damageEdit), and a designation cell gives it or clears it
// (designationEdit).
// (designationEdit), a moment of its own rather than a tap that merges.
export function stepDamage(defender, attacker, delta) {
  commitEdit(damageEdit(game, defender, attacker, delta), `damage:${defender}:${attacker}`);
}

export function toggleDesignation(kind, index) {
  commitEdit(designationEdit(game, kind, index));
}

export function stepCount(kind, index, delta) {
  commitEdit(countEdit(game, kind, index, delta), `count:${index}:${kind}`);
}

export function stepMana(index, colour, delta) {
  commitEdit(manaEdit(game, index, colour, delta), `mana:${index}:${colour}`);
}

// Mana mode's Treasure cell (MANA-SPEC-v2 §2.1): tap +1, hold −1, merging per tile under the key a chip's use at rest
// takes (opening and closing a mode closes every burst, so the two never merge).
export function stepTreasure(index, delta) {
  const next = game.treasure[index] + delta;
  if (next < 0 || next > maxCount) return;
  game.treasure[index] = next;
  syncManaCells(index);
  announceTreasure(index);
  commit({ badges: [index], step: { key: `token:${index}:treasure` } });
  haptic();
}

// Mana mode's Keep cell (MANA-SPEC-v2 §4): one player's "don't empty my pool when the turn passes", a toggle that's a
// step of its own, like a designation cell, so it closes every open burst.
export function toggleKeep(index) {
  game.keepMana[index] = !game.keepMana[index];
  syncManaCells(index);
  announce(index, 'keep', () => `Player ${index + 1}, keep mana ${game.keepMana[index] ? 'on' : 'off'}`);
  commit({ badges: [index] });
  haptic();
}
