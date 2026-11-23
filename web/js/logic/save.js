// The saved game's format and its checks (AGENTS.md: old saves must keep loading). loadGame parses a save and fits
// every field to what the board can show, falling back to that field's default, and the fit* helpers also start the
// fields of a new game. Pure: no DOM and no state, so it can be tested without a browser.

import {
  badgeSizeOrder, clockwiseEdges, countKinds, defaultTileSet, identityBackgrounds, identityColours, identityParts,
  identitySettingsVersion, manaColours, maxCount, maxRound, playerCounts, quarterTurns, reminderKinds, styleOrder,
  swatches, tileSetOrder, trackers, turnModes,
} from './data.js';

/** @typedef {import('./data.js').BadgeSize} BadgeSize */
/** @typedef {import('./data.js').CountKind} CountKind */
/** @typedef {import('./data.js').IdentityPart} IdentityPart */
/** @typedef {import('./data.js').QuarterTurn} QuarterTurn */
/** @typedef {import('./data.js').Reminders} Reminders */
/** @typedef {import('./data.js').Style} Style */
/** @typedef {import('./data.js').TileSet} TileSet */
/** @typedef {import('./data.js').Trackers} Trackers */
/** @typedef {import('./data.js').TurnMode} TurnMode */

// One distinct swatch per player. Valid saved choices are kept in seat order. A seat with no choice, or with
// one already taken, gets its default if that's free and otherwise the first free swatch.
/**
 * @param {any} saved
 * @param {number} count
 * @returns {number[]}
 */
export function fitColors(saved, count) {
  const colors = [];
  for (let index = 0; index < count; index++) {
    const colour = Array.isArray(saved) ? saved[index] : undefined;
    const valid = Number.isInteger(colour) && colour >= 0 && colour < swatches.length && !colors.includes(colour);
    colors.push(valid ? colour : null);
  }
  for (let index = 0; index < count; index++) {
    if (colors[index] !== null) continue;
    colors[index] = [index, ...swatches.keys()].find(colour => !colors.includes(colour));
  }
  return colors;
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
 * @param {unknown} [saved]
 * @returns {Trackers}
 */
function fitTrackers(saved) {
  return /** @type {Trackers} */ (Object.fromEntries(trackers.map(tracker => [tracker, saved?.[tracker] === true])));
}

// Which reminders are on. Each is on unless it was saved as exactly false.
/**
 * @param {unknown} [saved]
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
 * @property {number} startingLife A whole number of at least 1.
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
 * @property {BadgeSize} badgeSize The badge rows' and the mana strip's size.
 * @property {Style | null} style null until the player picks one, so the platform's default applies.
 * @property {number | null} monarch The monarch's seat, or null for nobody.
 * @property {number | null} initiative The initiative holder's seat, or null for nobody.
 * @property {Reminders} reminders
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
    manaPool: false, autoEmpty: true, pools: fitPools([], 4), turns: 'off', turn: fitTurn(null, 4), tileColours: defaultTileSet, badgeSize: 'default',
    style: null, monarch: null, initiative: null, reminders: fitReminders(),
  };
  try {
    const snapshot = read();
    // With no save, this parses null as null or throws on undefined, and both mean the defaults.
    const saved = JSON.parse(/** @type {string} */ (snapshot));
    if (!saved || !Array.isArray(saved.scores) || !playerCounts.includes(saved.scores.length) ||
        !saved.scores.every(Number.isSafeInteger) || !Number.isSafeInteger(saved.startingLife) || saved.startingLife < 1) {
      return defaults;
    }
    const rotations = saved.scores.map((_, index) => {
      const turn = saved.rotations?.[index];
      return Number.isInteger(turn) && turn >= 0 && turn < clockwiseEdges.length ? turn : 0;
    });
    const landscapeAngle = quarterTurns.includes(saved.landscapeAngle) ? saved.landscapeAngle : defaults.landscapeAngle;
    return {
      startingLife: saved.startingLife, scores: saved.scores, rotations, keepAwake: saved.keepAwake !== false, landscapeAngle,
      colors: fitColors(saved.colors, saved.scores.length),
      counters: fitTrackers(saved.counters),
      .../** @type {Record<CountKind, number[]>} */ (Object.fromEntries(countKinds.map(kind => [kind, fitCounts(saved[kind], saved.scores.length)]))),
      identities: fitIdentities(saved.identities, saved.scores.length),
      identity: fitIdentitySettings(saved.identity),
      commanderDamage: fitDamage(saved.commanderDamage, saved.scores.length),
      manaPool: saved.manaPool === true,
      autoEmpty: saved.autoEmpty !== false,
      pools: fitPools(saved.pools, saved.scores.length),
      turns: turnModes.includes(saved.turns) ? saved.turns : 'off',
      turn: fitTurn(saved.turn, saved.scores.length),
      // A save from before the setting, or with an unknown set, gets the default.
      tileColours: tileSetOrder.includes(saved.tileColours) ? saved.tileColours : defaultTileSet,
      // A save from before the setting, or with an unknown size, gets the default.
      badgeSize: badgeSizeOrder.includes(saved.badgeSize) ? saved.badgeSize : 'default',
      // null until the player picks a style, so the platform's default applies; a save from before the setting, or with an
      // unknown style, gets it too.
      style: styleOrder.includes(saved.style) ? saved.style : null,
      // A seat that isn't on the board, or anything that isn't a seat, means nobody holds it.
      monarch: fitSeat(saved.monarch, saved.scores.length),
      initiative: fitSeat(saved.initiative, saved.scores.length),
      reminders: fitReminders(saved.reminders),
    };
  } catch {
    return defaults;
  }
}
