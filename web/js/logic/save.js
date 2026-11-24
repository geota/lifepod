// The saved game's format and its checks (AGENTS.md: old saves must keep loading). loadGame parses a save and fits
// every field to what the board can show, falling back to that field's default, and the fit* helpers also start the
// fields of a new game. Pure: no DOM and no state, so it can be tested without a browser.

import {
  badgeSizeOrder, clockwiseEdges, countKinds, defaultTileSet, identityBackgrounds, identityColours, identityParts,
  identitySettingsVersion, manaColours, maxCount, maxRound, maxStartingLife, playerCounts, quarterTurns, reminderKinds,
  styleOrder, swatches, tileSetOrder, trackers, trackTabKinds, turnModes,
} from './data.js';
import { emptyHistory, fitHistory } from './history.js';

/** @typedef {import('./data.js').BadgeSize} BadgeSize */
/** @typedef {import('./data.js').CountKind} CountKind */
/** @typedef {import('./data.js').IdentityPart} IdentityPart */
/** @typedef {import('./data.js').QuarterTurn} QuarterTurn */
/** @typedef {import('./data.js').Reminders} Reminders */
/** @typedef {import('./data.js').Style} Style */
/** @typedef {import('./data.js').TileSet} TileSet */
/** @typedef {import('./data.js').Trackers} Trackers */
/** @typedef {import('./data.js').TrackTab} TrackTab */
/** @typedef {import('./data.js').TurnMode} TurnMode */
/** @typedef {import('./history.js').History} History */

// One distinct swatch per player. Valid saved choices are kept in seat order. A seat with no choice, or with
// one already taken, gets its default if that's free and otherwise the first free swatch.
/**
 * @param {any} saved
 * @param {number} count
 * @returns {number[]}
 */
export function fitColors(saved, count) {
  /** @type {(number | null)[]} */
  const colors = [];
  for (let index = 0; index < count; index++) {
    const colour = Array.isArray(saved) ? saved[index] : undefined;
    /** @type {boolean} */
    const valid = Number.isInteger(colour) && colour >= 0 && colour < swatches.length && !colors.includes(colour);
    colors.push(valid ? colour : null);
  }
  for (let index = 0; index < count; index++) {
    if (colors[index] !== null) continue;
    colors[index] = /** @type {number} */ ([index, ...swatches.keys()].find(colour => !colors.includes(colour)));
  }
  return /** @type {number[]} */ (colors);
}

// One count per player. Anything that isn't a whole number from 0 to the maximum starts at 0.
/**
 * @param {any} saved
 * @param {number} count
 * @returns {number[]}
 */
export function fitCounts(saved, count) {
  return Array.from({ length: count }, (_, index) => {
    const value = Array.isArray(saved) ? saved[index] : undefined;
    return Number.isInteger(value) && value >= 0 && value <= maxCount ? value : 0;
  });
}

// Colour identity as letters in W U B R G order. Anything else, including colourless ('C') from saves made
// before it was removed, means no identity.
/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeIdentity(value) {
  if (typeof value !== 'string' || !/^[WUBRG]*$/.test(value)) return '';
  return identityColours.map(colour => colour.id).filter(id => value.includes(id)).join('');
}

// Commander damage taken, by defender then attacker. A player never damages themselves.
/**
 * @param {any} saved
 * @param {number} count
 * @returns {number[][]}
 */
export function fitDamage(saved, count) {
  return Array.from({ length: count }, (_, defender) => Array.from({ length: count }, (_, attacker) => {
    const value = Array.isArray(saved?.[defender]) ? saved[defender][attacker] : undefined;
    return defender !== attacker && Number.isInteger(value) && value >= 0 && value <= maxCount ? value : 0;
  }));
}

/**
 * @param {any} saved
 * @param {number} count
 * @returns {string[]}
 */
export function fitIdentities(saved, count) {
  return Array.from({ length: count }, (_, index) => normalizeIdentity(Array.isArray(saved) ? saved[index] : undefined));
}

// What tiles show of each identity: the chip's parts (default: indicator and name) and the background behind the
// total (default: the symbol). Anything that isn't a valid choice falls back to its default.
/**
 * @param {any} [saved]
 * @returns {IdentitySettings}
 */
function fitIdentitySettings(saved) {
  /** @type {Record<IdentityPart, boolean>} */
  const defaults = { indicator: true, symbol: false, name: true };
  const show = /** @type {IdentitySettings['show']} */ (Object.fromEntries(identityParts.map(part =>
    [part, typeof saved?.show?.[part] === 'boolean' ? saved.show[part] : defaults[part]])));
  return { show, background: fitIdentityBackground(saved), version: identitySettingsVersion };
}

/**
 * @param {any} saved
 * @returns {IdentitySettings['background']}
 */
function fitIdentityBackground(saved) {
  if (saved?.version === identitySettingsVersion) {
    return identityBackgrounds.includes(saved.background) ? saved.background : 'symbol';
  }
  return saved?.background === 'off' ? 'default' : 'symbol';
}

// Each player's pool: one count per colour, W U B R G C. Anything that isn't a whole number from 0 to the maximum is 0.
/**
 * @param {any} saved
 * @param {number} count
 * @returns {number[][]}
 */
export function fitPools(saved, count) {
  return Array.from({ length: count }, (_, index) => fitCounts(Array.isArray(saved) ? saved[index] : undefined, manaColours.length));
}

// A seat index on a board of count players, or null for nobody, which is also what anything else means.
/**
 * @param {any} value
 * @param {number} count
 * @returns {number | null}
 */
function fitSeat(value, count) {
  return Number.isInteger(value) && value >= 0 && value < count ? value : null;
}

// Who went first, whose turn it is and the round. A seat that isn't on the board means nobody.
/**
 * @param {any} saved
 * @param {number} count
 * @returns {Turn}
 */
export function fitTurn(saved, count) {
  const round = saved?.round;
  return {
    first: fitSeat(saved?.first, count), active: fitSeat(saved?.active, count),
    round: Number.isInteger(round) && round >= 1 && round <= maxRound ? round : 1,
  };
}

// Which trackers are on. Each is off unless it was saved as exactly true.
/**
 * @param {any} [saved]
 * @returns {Trackers}
 */
function fitTrackers(saved) {
  return /** @type {Trackers} */ (Object.fromEntries(trackers.map(tracker => [tracker, saved?.[tracker] === true])));
}

// Which reminders are on. Each is on unless it was saved as exactly false.
/**
 * @param {any} [saved]
 * @returns {Reminders}
 */
function fitReminders(saved) {
  return /** @type {Reminders} */ (Object.fromEntries(reminderKinds.map(kind => [kind, saved?.[kind] !== false])));
}

/**
 * The saved game: what loadGame returns, saveGame writes as JSON and every render reads. loadGame checks each field of
 * a save and falls back to its default, so a field added here needs a fit* check there too (AGENTS.md).
 * Arrays indexed by player have one entry per seat, in seat order, and scores.length is the player count.
 *
 * @typedef {object} Game
 * @property {number} startingLife A whole number from 1 to maxStartingLife.
 * @property {number[]} scores Each player's life total.
 * @property {number[]} rotations Each seat's quarter turns, 0 to 3, an index into clockwiseEdges.
 * @property {boolean} keepAwake
 * @property {QuarterTurn} landscapeAngle How the board is turned in landscape.
 * @property {number[]} colors Each player's tile colour, an index into swatches, all distinct.
 * @property {Trackers} counters Which Track switches are on.
 * @property {number[]} poison Each player's poison counters, 0 to maxCount; likewise casts, energy, experience and rad.
 * @property {number[]} casts Commander casts, for commander tax.
 * @property {number[]} energy
 * @property {number[]} experience
 * @property {number[]} rad
 * @property {string[]} identities Each player's colour identity, as letters in W U B R G order; '' for none.
 * @property {IdentitySettings} identity
 * @property {number[][]} commanderDamage Damage taken, by defender then attacker; 0 where they're the same player.
 * @property {boolean} manaPool Whether the Mana pool switch is on.
 * @property {boolean} autoEmpty Whether pools empty as the turn passes.
 * @property {number[][]} pools Each player's floating mana, one count per colour in W U B R G C order.
 * @property {TurnMode} turns
 * @property {Turn} turn
 * @property {TileSet} tileColours
 * @property {boolean} shuffleColours Whether each new game deals every player a random tile colour.
 * @property {BadgeSize} badgeSize The badge rows' and the mana strip's size.
 * @property {Style | null} style null until the player picks one, so the platform's default applies.
 * @property {number | null} monarch The monarch's seat, or null for nobody.
 * @property {number | null} initiative The initiative holder's seat, or null for nobody.
 * @property {Reminders} reminders
 * @property {TrackTab} trackTab The tab Track last showed, where the pill has one Track button (PILL-SPEC.md §3.2).
 * @property {History} history The undo history (logic/history.js): its steps, oldest first, and how many are applied.
 */
/**
 * @typedef {object} IdentitySettings
 * @property {Record<IdentityPart, boolean>} show What the identity chip shows.
 * @property {'symbol' | 'default' | 'off'} background What sits behind the life total.
 * @property {number} version identitySettingsVersion when saved; older saves mean something else by background.
 */
/**
 * @typedef {object} Turn
 * @property {number | null} first Who went first, as a seat, or null.
 * @property {number | null} active Whose turn it is, as a seat, or null.
 * @property {number} round From 1 to maxRound.
 */

// The saved game that read() returns, as JSON, checked field by field; or the defaults, with the board upright at
// landscapeAngle, when there's no save or read() throws. read is the platform's (state/platform.js).
//
// Each field falls back on its own (AGENTS.md: never reset the game). A starting life outside 1 to maxStartingLife is
// 40, and a score that isn't a safe integer is the starting life. Only scores whose length isn't a player count leave no
// board to fit the per-player fields to: they start the default 4-player board, and the settings are still kept.
/**
 * @param {() => string | null | undefined} read
 * @param {QuarterTurn} landscapeAngle
 * @returns {Game}
 */
export function loadGame(read, landscapeAngle) {
  /** @type {Game} */
  const defaults = {
    startingLife: 40, scores: [40, 40, 40, 40], rotations: [0, 0, 0, 0], keepAwake: true,
    landscapeAngle, colors: fitColors([], 4),
    counters: fitTrackers(), .../** @type {Record<CountKind, number[]>} */ (Object.fromEntries(countKinds.map(kind => [kind, fitCounts([], 4)]))),
    identities: fitIdentities([], 4), identity: fitIdentitySettings(), commanderDamage: fitDamage([], 4),
    manaPool: false, autoEmpty: true, pools: fitPools([], 4), turns: 'off', turn: fitTurn(null, 4), tileColours: defaultTileSet, shuffleColours: false,
    badgeSize: 'default', style: null, monarch: null, initiative: null, reminders: fitReminders(), trackTab: 'damage',
    history: emptyHistory(),
  };
  try {
    const snapshot = read();
    // With no save, this parses null as null or throws on undefined, and both mean the defaults.
    const saved = JSON.parse(/** @type {string} */ (snapshot));
    if (!saved || typeof saved !== 'object') return defaults;
    const startingLife = Number.isSafeInteger(saved.startingLife) && saved.startingLife >= 1 && saved.startingLife <= maxStartingLife
      ? saved.startingLife : defaults.startingLife;
    // The per-player fields, read only when the scores say how many players they were saved for.
    const board = Array.isArray(saved.scores) && playerCounts.includes(saved.scores.length) ? saved : {};
    const count = board.scores?.length ?? defaults.scores.length;
    const scores = Array.from({ length: count }, (_, index) => {
      const score = board.scores?.[index];
      return Number.isSafeInteger(score) ? score : startingLife;
    });
    const rotations = scores.map((_, index) => {
      const turn = board.rotations?.[index];
      return Number.isInteger(turn) && turn >= 0 && turn < clockwiseEdges.length ? turn : 0;
    });
    return {
      startingLife, scores, rotations, keepAwake: saved.keepAwake !== false,
      landscapeAngle: quarterTurns.includes(saved.landscapeAngle) ? saved.landscapeAngle : defaults.landscapeAngle,
      colors: fitColors(board.colors, count),
      counters: fitTrackers(saved.counters),
      .../** @type {Record<CountKind, number[]>} */ (Object.fromEntries(countKinds.map(kind => [kind, fitCounts(board[kind], count)]))),
      identities: fitIdentities(board.identities, count),
      identity: fitIdentitySettings(saved.identity),
      commanderDamage: fitDamage(board.commanderDamage, count),
      manaPool: saved.manaPool === true,
      autoEmpty: saved.autoEmpty !== false,
      pools: fitPools(board.pools, count),
      turns: turnModes.includes(saved.turns) ? saved.turns : 'off',
      turn: fitTurn(board.turn, count),
      // A save from before the setting, or with an unknown set, gets the default.
      tileColours: tileSetOrder.includes(saved.tileColours) ? saved.tileColours : defaultTileSet,
      // Off unless it was saved as exactly true, so a save from before the setting keeps its colours.
      shuffleColours: saved.shuffleColours === true,
      // A save from before the setting, or with an unknown size, gets the default.
      badgeSize: badgeSizeOrder.includes(saved.badgeSize) ? saved.badgeSize : 'default',
      // null until the player picks a style, so the platform's default applies; a save from before the setting, or with an
      // unknown style, gets it too.
      style: styleOrder.includes(saved.style) ? saved.style : null,
      // A seat that isn't on the board, or anything that isn't a seat, means nobody holds it.
      monarch: fitSeat(board.monarch, count),
      initiative: fitSeat(board.initiative, count),
      reminders: fitReminders(saved.reminders),
      // A save from before Track, or with an unknown tab, opens Track on its first tab that's on (openingTab in rules.js).
      trackTab: trackTabKinds.includes(saved.trackTab) ? saved.trackTab : defaults.trackTab,
      // A save from before Undo, or a history that's corrupt, gets an empty one; the game itself is never touched
      // (fitHistory in history.js).
      history: fitHistory(saved.history, count),
    };
  } catch {
    return defaults;
  }
}
