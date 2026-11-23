// Turn reminders (Settings → Reminders → Turn reminders): "Monarch: draw a card" and "Initiative: venture into
// Undercity" on their player's tile for a few seconds, in Turn by turn only.

import { reminderText, reminderTime } from '../logic/data.js';
import { announce } from '../render/announce.js';
import { renderBadges } from '../render/badges.js';
import { game, shownReminders } from '../state/state.js';

/** @typedef {import('../logic/data.js').DesignationKind} DesignationKind */

// A turn has just started: its player ventures into Undercity if they have the initiative.
export function turnStarted() {
  if (game.turns === 'turns' && game.initiative !== null && game.initiative === game.turn.active) remind(game.initiative, 'initiative');
}

// A turn reminder (Settings → Reminders → Turn reminders), only in Turn by turn and once someone's turn has started:
// "Monarch: draw a card" or "Initiative: venture into Undercity" on that player's tile, facing them, for 3 seconds or
// until it's tapped. Screen readers hear it too. Before any turn, taking the initiative waits for its holder's turn to
// start (SPEC §13).
/**
 * @param {number | null} index
 * @param {DesignationKind} kind
 */
export function remind(index, kind) {
  if (index === null || game.turns !== 'turns' || game.turn.active === null || !game.reminders.turns || !game.counters[kind]) return;
  const shown = shownReminders.get(index) ?? new Map();
  clearTimeout(shown.get(kind));
  shown.set(kind, setTimeout(() => dismissReminder(index, kind), reminderTime));
  shownReminders.set(index, shown);
  renderBadges(index);
  announce(index, `remind ${kind}`, () => `Player ${index + 1}, ${reminderText[kind]}`);
}

export function dismissReminder(index, kind) {
  const shown = shownReminders.get(index);
  if (!shown?.has(kind)) return;
  clearTimeout(shown.get(kind));
  shown.delete(kind);
  if (!shown.size) shownReminders.delete(index);
  renderBadges(index);
}

export function clearReminders() {
  for (const shown of shownReminders.values()) for (const timer of shown.values()) clearTimeout(timer);
  shownReminders.clear();
}
