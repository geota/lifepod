// The centre pill: which of its buttons show at rest, in a mode and while editing, their labels, Track's face and tabs,
// and measuring the board again when its length changes.

import { measureBoard, pillCollapsed, settlePillForm } from '../layout/board.js';
import { editingModes, trackTabInfo } from '../logic/data.js';
import { stepText } from '../logic/history.js';
import {
  hasCountersMode, openingTab, restPillButtons, trackTabs,
} from '../logic/rules.js';
import { boardMode, editStart, game } from '../state/state.js';
import {
  boardControls, cancelButton, countersButton, damageButton, diceButton, manaButton, redoButton, roundBackButton,
  roundButton, saveButton, setupButton, shuffleButton, trackButton, trackTabButtons, trackTabList, undoButton,
} from '../ui/dom.js';

/** @typedef {import('../logic/data.js').TrackTab} TrackTab */

// The pill's buttons now and at rest, as last measured.
let pillShape = '';

// Whether commander damage, counters and mana show as one Track button now: where the board wants it
// (pillCollapsed in layout/board.js) and two or more of them are on. With one on, Track would be that one's button.
export function trackShown() {
  return pillCollapsed && trackTabs(game).length > 1;
}

// The centre pill: the round, commander damage, counters and mana (or Track), Undo, dice and setup at rest; Track's
// tabs, Undo, save and ✕ while editing.
export function syncPill() {
  // A form the board asked for while a mode was open is taken now that the board is at rest.
  settlePillForm();
  const editing = editingModes.includes(boardMode);
  const first = boardMode === 'first';
  const track = trackShown();
  roundButton.hidden = boardMode !== null || game.turns === 'off';
  roundBackButton.hidden = roundButton.hidden;
  damageButton.hidden = boardMode !== null || track || !game.counters.commander;
  countersButton.hidden = boardMode !== null || track || !hasCountersMode(game);
  manaButton.hidden = boardMode !== null || track || !game.manaPool;
  trackButton.hidden = boardMode !== null || !track;
  trackTabList.hidden = !editing || !track;
  // Each tab hides with its list, so the pill counts only the buttons it shows.
  for (const tab of trackTabButtons) tab.hidden = trackTabList.hidden || !trackTabs(game).includes(/** @type {TrackTab} */ (tab.dataset.tab));
  diceButton.hidden = boardMode !== null;
  setupButton.hidden = editing || first;
  shuffleButton.hidden = !first;
  undoButton.hidden = boardMode !== null && !editing;
  saveButton.hidden = !editing;
  cancelButton.hidden = !editing && !first;
  cancelButton.setAttribute('aria-label', first ? 'Skip' : 'Cancel');
  syncUndo();
  // The round, printed twice like a card index so both sides of the table can read it.
  const { round, active } = game.turn;
  for (const number of roundButton.querySelectorAll('.round > span')) number.textContent = String(round);
  roundButton.setAttribute('aria-label', game.turns === 'rounds' ? `Round ${round}. Next round`
    : active === null ? `Round ${round}. Choose who goes first` : `Round ${round}, Player ${active + 1}'s turn. Pass the turn`);
  roundBackButton.setAttribute('aria-label', game.turns === 'rounds' ? 'Back one round' : 'Back one turn');
  // The tap symbol's pip gets a dot while any pool has mana, and the button's name says how much (MANA-UNDO-SPEC §5).
  const floating = game.pools.reduce((sum, pool) => sum + pool.reduce((total, amount) => total + amount, 0), 0);
  const manaWords = floating ? `, ${floating} mana floating` : '';
  manaButton.toggleAttribute('data-floating', floating > 0);
  manaButton.setAttribute('aria-label', `Mana pool${manaWords}`);
  if (track) syncTrack(floating, manaWords);
  // The pill's length decides which face edges it reaches, so the board is measured again when it changes.
  const shape = `${[...boardControls.querySelectorAll('.pill-button')].filter(button => !button.hidden).length} ${restPillButtons(game, { collapsed: pillCollapsed })} ${pillCollapsed}`;
  if (shape !== pillShape) {
    pillShape = shape;
    measureBoard();
  }
}

// Track at rest and its tabs in its mode (PILL-SPEC.md §3.1, §3.5). At rest its face is the tab it will open, with a dot
// for each tab, that one lit, and its name lists what it tracks. In its mode the open tab is selected, and only it is in
// the Tab order.
/**
 * @param {number} floating
 * @param {string} manaWords
 */
function syncTrack(floating, manaWords) {
  const tabs = trackTabs(game);
  const face = openingTab(game);
  for (const part of trackButton.querySelectorAll('[data-face]')) part.toggleAttribute('hidden', /** @type {HTMLElement} */ (part).dataset.face !== face);
  for (const dot of /** @type {NodeListOf<HTMLElement>} */ (trackButton.querySelectorAll('.track-dots > i'))) {
    const tab = /** @type {TrackTab} */ (dot.dataset.tab);
    dot.hidden = !tabs.includes(tab);
    dot.toggleAttribute('data-on', tab === face);
  }
  trackButton.toggleAttribute('data-floating', face === 'mana' && floating > 0);
  trackButton.setAttribute('aria-label', `Track: ${tabs.map(tab => trackTabInfo[tab].words).join(', ')}${tabs.includes('mana') ? manaWords : ''}`);
  for (const tab of trackTabButtons) {
    const kind = /** @type {TrackTab} */ (tab.dataset.tab);
    const open = kind === boardMode;
    tab.setAttribute('aria-selected', String(open));
    tab.tabIndex = open ? 0 : -1;
    if (kind === 'mana') {
      tab.toggleAttribute('data-floating', floating > 0);
      tab.setAttribute('aria-label', `${trackTabInfo.mana.name}${manaWords}`);
    }
  }
  trackTabList.setAttribute('aria-orientation', boardControls.hasAttribute('data-vertical') ? 'vertical' : 'horizontal');
}

// Undo and its hidden Redo. At rest they step through the game's history (MANA-UNDO-SPEC §6.6): Undo always shows, so the
// pill never changes length, and is dimmed with nothing to undo, but not disabled, so a hold still opens History; its
// name says what it would undo. While editing, Undo goes back through the steps taken in the mode, and is disabled once
// they're all undone (MANA-UNDO-SPEC §6.5).
export function syncUndo() {
  const editing = editingModes.includes(boardMode);
  redoButton.hidden = boardMode !== null;
  if (editing) {
    undoButton.disabled = game.history.at <= editStart;
    undoButton.removeAttribute('aria-disabled');
    undoButton.setAttribute('aria-label', 'Undo');
    return;
  }
  undoButton.disabled = false;
  const { at, steps } = game.history;
  const back = at > 0 ? steps[at - 1] : null;
  const ahead = at < steps.length ? steps[at] : null;
  for (const [button, step, verb, nothing] of /** @type {const} */ ([[undoButton, back, 'Undo', 'nothing to undo'], [redoButton, ahead, 'Redo', 'nothing to redo']])) {
    if (step) button.removeAttribute('aria-disabled');
    else button.setAttribute('aria-disabled', 'true');
    button.setAttribute('aria-label', step ? `${verb}: ${stepText(step, game)}` : `${verb}, ${nothing}`);
  }
}
