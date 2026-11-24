// What the board modes change: an editing mode's edits (commander damage, counters, designations and mana), each
// applied, shown and saved at once and kept for Undo and ✕, and the choices that Colours and Identity save at once.

import { countKinds } from '../logic/data.js';
import {
  applyEdit, applyNewEdit, countEdit, damageEdit, designationEdit, editPlayers, manaEdit,
} from '../logic/rules.js';
import { normalizeIdentity } from '../logic/save.js';
import { announce, announceDesignation, announceLife, announcePool } from '../render/announce.js';
import { syncAllSwatches, syncCounterCells, syncIdentity, syncManaCells, syncSeatMap } from '../render/modes.js';
import { paintColours } from '../render/tile.js';
import { haptic } from '../state/platform.js';
import { edits, game } from '../state/state.js';
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

// Shows an edit everywhere it appears, and saves it, so nothing is lost if the app is closed mid-mode.
/**
 * @param {Edit} edit
 */
function showEdit(edit) {
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
  // A mode's edits stay on its own stack until the mode closes; the history doesn't record them yet.
  commit({ scores: players, badges: players, pill: true, step: false });
  haptic();
}

// An edit made in a mode, or null for a tap that would take a count out of range, which does nothing. applyNewEdit
// applies it, and anyone it puts out of the game hands on what they hold (CR 726.4 and 727.4) in the same edit.
/**
 * @param {Edit | null} edit
 */
function commitEdit(edit) {
  if (!edit) return;
  /** @type {Edit[]} */ (edits).push(applyNewEdit(game, edit));
  showEdit(edit);
}

export function undoEdit() {
  const edit = edits?.pop();
  if (!edit) return;
  applyEdit(game, edit, -1);
  showEdit(edit);
}

// The modes' taps. The edit each makes, and what it passes on, is in rules.js: commander damage to the monarch or the
// initiative's holder passes it to the attacker (damageEdit), and a designation cell gives it or clears it
// (designationEdit).
export function stepDamage(defender, attacker, delta) {
  commitEdit(damageEdit(game, defender, attacker, delta));
}

export function toggleDesignation(kind, index) {
  commitEdit(designationEdit(game, kind, index));
}

export function stepCount(kind, index, delta) {
  commitEdit(countEdit(game, kind, index, delta));
}

export function stepMana(index, colour, delta) {
  commitEdit(manaEdit(game, index, colour, delta));
}
