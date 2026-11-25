// What screen readers hear about the board (#announcer, or an open dialog's own live region): changes are announced
// once a burst of them settles, each player's news in seat order, rather than on every step of a hold.

import { designations, tileSets, trackTabInfo } from '../logic/data.js';
import { poolText, trackTabs } from '../logic/rules.js';
import { game } from '../state/state.js';
import { announcer } from '../ui/dom.js';

/** @typedef {import('../logic/data.js').BoardMode} BoardMode */
/** @typedef {import('../logic/data.js').Designation} Designation */
/** @typedef {import('../logic/data.js').TrackTab} TrackTab */

// A seat as a screen reader hears it: its number and its tile colour, such as "Player 3, Sky". Nothing on screen shows
// the number, so the colour, which the players can see, ties the voice to a tile. Each tile set names its own colours.
/** @param {number} index */
export function seatName(index) {
  return `Player ${index + 1}, ${tileSets[game.tileColours].names[game.colors[index]]}`;
}

// What a board mode is and how to use it, read as it opens: its on-screen hints are only for sighted players.
/** @type {Record<Exclude<BoardMode, null>, string>} */
const modeIntros = {
  damage: 'Commander damage. Press a commander on a tile to add one damage. Undo goes back one step. Save or Cancel in the centre',
  counters: 'Counters. Press a counter to add one. Undo goes back one step. Save or Cancel in the centre',
  mana: 'Mana pool. Press a colour to add one mana. Undo goes back one step. Save or Cancel in the centre',
  colours: 'Tile colours. Choose a colour on each tile, then Done in the centre',
  identity: 'Identities. Choose each player\'s colours, then Done in the centre',
  rotate: 'Rotate seats. Press a tile to turn it clockwise, then Done in the centre',
  first: 'Who goes first? Press Me first on a tile, or Pick at random in the centre',
};
/** @type {Record<Exclude<BoardMode, null>, string>} */
const modeNames = {
  damage: 'Commander damage', counters: 'Counters', mana: 'Mana pool', colours: 'Tile colours', identity: 'Identities',
  rotate: 'Rotate seats', first: 'Who goes first?',
};

// How to use each of Track's tabs, and where it is among them (design/polish/PILL-SPEC.md §3.5).
/** @type {Record<TrackTab, string>} */
const tabHowTo = {
  damage: 'Press a commander on a tile to add one damage', counters: 'Press a counter to add one', mana: 'Press a colour to add one mana',
};
/** @param {TrackTab} tab */
function tabPlace(tab) {
  const tabs = trackTabs(game);
  return `tab ${tabs.indexOf(tab) + 1} of ${tabs.length}`;
}

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
  announceTimer = setTimeout(flushAnnouncements, 700);
}

// While a dialog is open, everything outside it is out of the accessibility tree, #announcer included, so the board's
// news goes to the topmost open dialog's own live region instead (data-announcer in index.html; docs/review/FINAL.md
// B2): a Track switch in settings that passes the monarch on is heard while settings is still open.
function liveRegion() {
  const open = [...document.querySelectorAll('dialog[open]')].at(-1);
  return open?.querySelector('[data-announcer]') ?? announcer;
}

function flushAnnouncements() {
  clearTimeout(announceTimer);
  liveRegion().textContent = [...pendingAnnouncements.values()].sort((a, b) => a.index - b.index)
    .map(item => item.describe()).join('. ');
  pendingAnnouncements.clear();
}

// Says something about the whole board at once, after anything still waiting, such as a mode opening.
/** @param {string} words */
function announceNow(words) {
  pendingAnnouncements.set('-1 now', { index: -1, describe: () => words });
  flushAnnouncements();
}

export function announceLife(index) {
  announce(index, 'life', () => `${seatName(index)}, ${game.scores[index]} life`);
}

// A board mode opening, or closing with nothing else to say: at once, since focus moves with it. Saving, discarding and
// a pick of who goes first say so in its place (announceModeEnd).
/**
 * @param {BoardMode} mode The mode opening, or null when one closes.
 * @param {BoardMode} closed The mode that closed.
 * @param {boolean} [track] Whether the mode is, or was, a tab of Track's, with the others beside it.
 */
export function announceMode(mode, closed, track = false) {
  if (mode && track && mode in tabHowTo) {
    const tab = /** @type {TrackTab} */ (mode);
    announceNow(`Track, ${trackTabInfo[tab].words}, ${tabPlace(tab)}. ${tabHowTo[tab]}. Switch tabs, Undo, Save or Cancel in the centre`);
  } else if (mode) announceNow(modeIntros[mode]);
  else if (closed) announceNow(`${track && closed in tabHowTo ? 'Track' : modeNames[closed]} closed`);
}

// Another of Track's tabs opening, from its tab or an undo of a step on it.
/** @param {TrackTab} tab */
export function announceTrackTab(tab) {
  announceNow(`${trackTabInfo[tab].name}, ${tabPlace(tab)}. ${tabHowTo[tab]}`);
}

/** @param {string} words Such as "Saved" or "Changes discarded". */
export function announceModeEnd(words) {
  announceNow(words);
}

// Says who holds a designation now, once a burst of changes settles.
export function announceDesignation(kind) {
  const { name, role } = /** @type {Designation} */ (designations.find(designation => designation.kind === kind));
  announce(-1, kind, () => (game[kind] === null ? `Nobody has ${name}` : `${seatName(game[kind])}, ${role}`));
}

export function announcePool(index) {
  announce(index, 'mana', () => `${seatName(index)}, mana pool ${poolText(game, index)}`);
}

// A new board drops whatever was still waiting to be read.
export function clearAnnouncements() {
  clearTimeout(announceTimer);
  pendingAnnouncements.clear();
}
