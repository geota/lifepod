// What the board modes change: an editing mode's edits (commander damage, counters, designations and mana), each
// applied, shown and saved at once and kept for Undo and ✕, and the choices that Colours and Identity save at once.

import { countKinds, maxCount } from '../logic/data.js';
import { applyEdit, editPlayers, leavingTransfers, outPlayers, trackedDesignations } from '../logic/rules.js';
import { normalizeIdentity } from '../logic/save.js';
import { announce, announceDesignation, announceLife, announcePool } from '../render/announce.js';
import { renderBadges } from '../render/badges.js';
import { syncAllSwatches, syncCounterCells, syncIdentity, syncManaCells, syncSeatMap } from '../render/modes.js';
import { syncPill } from '../render/pill.js';
import { paintColours, renderScore } from '../render/tile.js';
import { haptic } from '../state/platform.js';
import { edits, game, saveGame } from '../state/state.js';

/** @typedef {import('../logic/rules.js').Edit} Edit */

// Colours mode saves each choice at once.
export function chooseColour(index, colour) {
  if (game.colors.includes(colour)) return;
  game.colors[index] = colour;
  paintColours();
  syncAllSwatches();
  haptic();
  saveGame();
}

// Identity mode saves each change at once, like Colours.
export function toggleIdentity(index, id) {
  const identity = game.identities[index];
  game.identities[index] = identity.includes(id) ? identity.replace(id, '') : normalizeIdentity(identity + id);
  syncIdentity();
  renderBadges(index);
  haptic();
  saveGame();
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
  for (const player of editPlayers(edit)) {
    syncCounterCells(player);
    syncManaCells(player);
    renderScore(player);
    renderBadges(player);
  }
  syncPill();
  haptic();
  saveGame();
}

// An edit made in a mode. Anyone it puts out of the game hands on what they hold (CR 726.4 and 727.4), in the same edit.
/**
 * @param {Edit} edit
 */
function commitEdit(edit) {
  const out = outPlayers(game);
  applyEdit(game, edit, 1);
  const handoffs = leavingTransfers(game, out);
  if (handoffs.length) {
    edit.transfers = [...(edit.transfers ?? []), ...handoffs];
    for (const transfer of handoffs) game[transfer.kind] = transfer.to;
  }
  /** @type {Edit[]} */ (edits).push(edit);
  showEdit(edit);
}

export function undoEdit() {
  const edit = edits?.pop();
  if (!edit) return;
  applyEdit(game, edit, -1);
  showEdit(edit);
}

// Commander damage is combat damage: adding it to the monarch makes the attacker the monarch (CR 726.3), and adding it
// to the player with the initiative gives the attacker the initiative (CR 727.3). Taking damage away moves nothing.
export function stepDamage(defender, attacker, delta) {
  const next = game.commanderDamage[defender][attacker] + delta;
  if (next < 0 || next > maxCount) return;
  const transfers = delta > 0 ? trackedDesignations(game).filter(({ kind }) => game[kind] === defender)
    .map(({ kind }) => ({ kind, from: defender, to: attacker })) : [];
  commitEdit({ kind: 'damage', index: defender, attacker, delta, transfers });
}

// Counters mode's designation cells: a tap gives it to that player, taking it from whoever had it, and a tap on the
// holder's own cell clears it.
export function toggleDesignation(kind, index) {
  const from = game[kind];
  commitEdit({ kind: 'designation', index, transfers: [{ kind, from, to: from === index ? null : index }] });
}

export function stepCount(kind, index, delta) {
  const next = game[kind][index] + delta;
  if (next >= 0 && next <= maxCount) commitEdit({ kind, index, delta });
}

// Mana mode's edit: one colour in one player's pool, one up or down.
export function stepMana(index, colour, delta) {
  const next = game.pools[index][colour] + delta;
  if (next >= 0 && next <= maxCount) commitEdit({ kind: 'mana', index, colour, delta });
}
