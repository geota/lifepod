// The game's fixed tables and limits, and the small types they define: seat layouts and play order, the swatches and
// tile sets, the counters, designations and reminders, colour identities and mana colours, and the timings. Pure data:
// no DOM, no state.

// The open board mode: 'rotate', 'colours', 'identity', 'damage', 'counters', 'mana' or 'first' ("Who goes first?"),
// or null at rest.
/** @typedef {null | 'rotate' | 'colours' | 'identity' | 'damage' | 'counters' | 'mana' | 'first'} BoardMode */
/** @typedef {0 | 90 | 180 | 270} QuarterTurn */
/** @typedef {'commander' | 'poison' | 'energy' | 'experience' | 'rad' | DesignationKind} Tracker */
/** @typedef {Record<Tracker, boolean>} Trackers */
/** @typedef {'poison' | 'casts' | 'energy' | 'experience' | 'rad'} CountKind */
/** @typedef {'monarch' | 'initiative'} DesignationKind */
/** @typedef {'indicator' | 'symbol' | 'name'} IdentityPart */
/** @typedef {'off' | 'rounds' | 'turns'} TurnMode */
/** @typedef {'classic' | 'soft' | 'jewel' | 'clear'} TileSet */
/** @typedef {'default' | 'large' | 'larger'} BadgeSize */
/** @typedef {'material' | 'glass'} Style */
/** @typedef {Record<'turns' | 'passOn' | 'gestures', boolean>} Reminders */
/** @typedef {'damage' | 'counters' | 'mana'} TrackTab */

export const clockwiseEdges = ['bottom', 'left', 'top', 'right'];
export const quarterTurns = [0, 90, 180, 270];
// Landscape rows list seats by facing edge and player number. Repeated seats span cells.
/** @type {Record<number, string[]>} */
export const seatLayouts = {
  2: ['left-1 right-2'],
  3: ['top-1 right-3', 'bottom-2 right-3'],
  4: ['top-1 top-2', 'bottom-3 bottom-4'],
  5: ['top-1 top-2 right-5', 'bottom-3 bottom-4 right-5'],
  6: ['top-1 top-2 top-5', 'bottom-3 bottom-4 bottom-6'],
};
export const playerCounts = Object.keys(seatLayouts).map(Number);
// Tile colours, in order. Players 1–6 default to the first six. Each has a lighter top-row and a darker
// bottom-row version in css/tokens.css: players 1, 2 and 5 use the top row, so neighbours differ in lightness too.
// New swatches only ever join the end, so saved choices keep their colour. The ids are Classic's names; each tile set
// below names them for itself.
export const swatches = ['sage', 'sky', 'coral', 'violet', 'amber', 'teal', 'rose', 'indigo', 'slate', 'copper', 'olive', 'orchid'].map(id => ({ id }));
export const topRowPlayers = [0, 1, 4];
// Tile colour sets (design/polish/TILES.md), in the Tile colours control's order: the same twelve swatch ids in each, so
// a player's colour carries over, with each set's own names for screen readers. Classic is the original twelve; Clear,
// the default, keeps tiles apart for colour-blind players. css/tile.css holds each set's palettes under data-tiles. Each id
// keeps its colour family in every set (DESIGN-AUDIT M1), so the default seats, ids 0–5, are spread round the hue
// circle in each. families groups each set's swatches into six look-alike families (tiles7.mjs finds them), which a
// shuffled new game keeps apart.
/** @typedef {{ label: string, names: string[], families: number[] }} TileSetInfo */
/** @type {Record<TileSet, TileSetInfo>} */
export const tileSets = {
  classic: {
    label: 'Classic', names: ['Sage', 'Sky', 'Coral', 'Violet', 'Amber', 'Teal', 'Rose', 'Indigo', 'Slate', 'Copper', 'Olive', 'Orchid'],
    families: [0, 1, 2, 3, 2, 0, 4, 5, 1, 2, 0, 4],
  },
  soft: {
    label: 'Soft', names: ['Jade', 'Sky', 'Coral', 'Violet', 'Olive', 'Teal', 'Plum', 'Azure', 'Slate', 'Copper', 'Lime', 'Orchid'],
    families: [0, 1, 2, 1, 3, 0, 2, 1, 4, 3, 5, 1],
  },
  jewel: {
    label: 'Jewel', names: ['Sage', 'Sky', 'Coral', 'Violet', 'Amber', 'Teal', 'Rose', 'Indigo', 'Slate', 'Copper', 'Olive', 'Orchid'],
    families: [0, 1, 2, 3, 2, 0, 4, 5, 1, 2, 0, 4],
  },
  clear: {
    label: 'Clear', names: ['Jade', 'Sky', 'Coral', 'Violet', 'Olive', 'Cyan', 'Pale plum', 'Indigo', 'Deep plum', 'Copper', 'Lime', 'Orchid'],
    families: [0, 1, 2, 3, 4, 1, 3, 3, 3, 2, 5, 3],
  },
};
export const tileSetOrder = /** @type {TileSet[]} */ (Object.keys(tileSets));
/** @type {TileSet} */
export const defaultTileSet = 'clear';
// The Style setting (design/polish/STYLE.md): direction A, Material, or direction B, Glass. css/tokens.css holds each as
// tokens under data-style. Until the player picks one, the iOS app (its game message handler) starts on Glass, and
// Android and browsers on Material.
export const styleOrder = ['material', 'glass'];
// Settings → Table → Badge size, in the slider's order (css/tile.css scales the badge rows and the mana strip by it).
export const badgeSizes = { default: 'Default', large: 'Large', larger: 'Larger' };
export const badgeSizeOrder = /** @type {BadgeSize[]} */ (Object.keys(badgeSizes));
// The centre button's label while a board mode that ends with the single check mark is open.
export const doneLabels = { rotate: 'Done rotating seats', colours: 'Done choosing colours', identity: 'Done choosing identities' };
// Modes whose changes can be undone, saved with the check mark, or discarded with ✕.
/** @type {BoardMode[]} */
export const editingModes = ['damage', 'counters', 'mana'];
export const discardMessages = {
  damage: 'Commander damage and life go back to how they were when you opened commander damage.',
  counters: 'Every counter goes back to how it was when you opened counters.',
  mana: 'Every mana pool and Treasure count goes back to how it was when you opened mana.',
};
// Track (design/polish/PILL-SPEC.md, option A): where the pill can't hold commander damage, counters and mana as three
// buttons, they become one Track button whose mode has a tab for each, in this order. The editing modes are its tabs,
// so a tab is a BoardMode too. What ✕'s message names for the tabs a visit changed, and how each tab is named.
/** @type {TrackTab[]} */
export const trackTabKinds = ['damage', 'counters', 'mana'];
/** @type {Record<TrackTab, { name: string, words: string, discard: string[] }>} */
export const trackTabInfo = {
  damage: { name: 'Commander damage', words: 'commander damage', discard: ['Commander damage', 'life'] },
  counters: { name: 'Counters', words: 'counters', discard: ['counters'] },
  mana: { name: 'Mana pool', words: 'mana', discard: ['mana pools', 'Treasure'] },
};
// The pill's tools, the buttons after the modes that show at rest whatever is on: Undo, card lookup's magnifier, the
// dice and settings. The pill's fit (pillFit in logic/rules.js) follows the count.
export const pillTools = 4;
// The pill stands this far clear of each end of the seam it sits on.
export const pillMargin = 4;
// Player counters (design/polish/SPEC.md §6), in the order they appear everywhere: counters mode, the near badge row,
// the Track sheet and its summary. Each is one count per player in game[kind], shown while its Track switch is on.
// Commander tax counts casts and comes with the Commander switch. phrase names one counter for screen readers.
/** @type {{ kind: CountKind, tracker: Tracker, phrase: string }[]} */
export const counterKinds = [
  { kind: 'poison', tracker: 'poison', phrase: 'poison counter' },
  { kind: 'casts', tracker: 'commander', phrase: 'commander cast' },
  { kind: 'energy', tracker: 'energy', phrase: 'energy counter' },
  { kind: 'experience', tracker: 'experience', phrase: 'experience counter' },
  { kind: 'rad', tracker: 'rad', phrase: 'rad counter' },
];
// Typed as strings, so includes() can test any kind.
/** @type {string[]} */
export const countKinds = counterKinds.map(counter => counter.kind);
// The monarch (CR 726) and the initiative (CR 727): one player at most holds each, saved in game[kind] as a seat index
// or null. Nobody holds either until an effect gives it, so a new game clears both. Counters mode shows a cell for each
// after the counters, and the holder's near row a chip. The words are for screen readers.
/** @typedef {{ kind: DesignationKind, label: string, name: string, role: string, still: string }} Designation */
/** @type {Designation[]} */
export const designations = [
  { kind: 'monarch', label: 'Monarch', name: 'the monarch', role: 'is the monarch', still: 'is still the monarch' },
  { kind: 'initiative', label: 'Initiative', name: 'the initiative', role: 'has the initiative', still: 'still has the initiative' },
];
export const designationKinds = designations.map(designation => designation.kind);
// The Track switches, in the sheet's order. Each is saved in game.counters.
export const trackers = ['commander', 'poison', 'energy', 'experience', 'rad', ...designationKinds];
// Settings → Reminders: the monarch's draw and the initiative's venture as the turn passes, the hint on an out holder's
// tile, and the "Tap +1 · hold −1" lines in the board modes. Each is on unless it was saved as exactly false.
export const reminderKinds = ['turns', 'passOn', 'gestures'];
// What each turn reminder says, and how long it stays on its tile.
export const reminderText = { monarch: 'Monarch: draw a card', initiative: 'Initiative: venture into Undercity' };
export const reminderTime = 3000;
// Losing amounts (CR 903.10a and 704.5c), and where the warning starts.
export const commanderLethal = 21;
export const commanderWarning = 15;
export const poisonLethal = 10;
export const poisonWarning = 7;
// Colour identity (design/polish/SPEC.md §2): any combination of the five colours, in W U B R G order. A colourless
// commander has none. Each of the 31 identities has a name and a symbol. css/tile.css draws the symbols from the Mana
// font: each colour's mana symbol, the ten Ravnica guilds, the five Khans clans, the five Streets of New Capenna
// families for the shards, and the colour pie for all five. Four colours have no official symbol, so they get the
// colour pie with the missing colour as a ghost.
/** @type {Record<string, string>} */
export const identityNames = {
  W: 'Mono-white', U: 'Mono-blue', B: 'Mono-black', R: 'Mono-red', G: 'Mono-green',
  WU: 'Azorius', UB: 'Dimir', BR: 'Rakdos', RG: 'Gruul', WG: 'Selesnya',
  WB: 'Orzhov', UR: 'Izzet', BG: 'Golgari', WR: 'Boros', UG: 'Simic',
  WUG: 'Bant', WUB: 'Esper', UBR: 'Grixis', BRG: 'Jund', WRG: 'Naya',
  WBG: 'Abzan', WUR: 'Jeskai', UBG: 'Sultai', WBR: 'Mardu', URG: 'Temur',
  UBRG: 'Glint-Eye', WBRG: 'Dune-Brood', WURG: 'Ink-Treader', WUBG: 'Witch-Maw', WUBR: 'Yore-Tiller',
  WUBRG: 'WUBRG',
};
// What a tile's identity chip can show, in the chip's order, and what can sit behind its life total: the symbol on
// tiles with an identity, the rings on every tile (Default), or nothing (Off).
/** @type {IdentityPart[]} */
export const identityParts = ['indicator', 'symbol', 'name'];
export const identityBackgrounds = ['symbol', 'default', 'off'];
// The identity settings' save format. Saves without it are from when Background was Symbol · Indicator · Off and
// Off meant the rings: their Off loads as Default and their Indicator as Symbol, so only a save of this version
// can mean the new Off.
export const identitySettingsVersion = 2;
export const identityColours = [
  { id: 'W', name: 'white' }, { id: 'U', name: 'blue' }, { id: 'B', name: 'black' },
  { id: 'R', name: 'red' }, { id: 'G', name: 'green' },
];
// Floating mana (design/polish/SPEC.md §9): one count per colour in each player's pool, in W U B R G C order.
export const manaColours = [...identityColours, { id: 'C', name: 'colourless' }];
// Treasure (MANA-SPEC-v2 §1) is a count per player in game.treasure, 0 to maxCount, shown with the Mana and Treasure switch
// (game.manaPool). It lasts for turns, so nothing empties it but a new game: not the turn passing, the eraser or Keep.
// Each player's Keep (game.keepMana, §4) stops the turn passing from emptying their pool.
// Turns (design/polish/SPEC.md §8): off, rounds (the first player's flag counts rounds) or turn by turn.
export const turnModes = ['off', 'rounds', 'turns'];
// Play order is clockwise on screen, which is passing to the left. Seat rotation doesn't change it.
/** @type {Record<number, number[]>} */
export const playOrders = { 2: [0, 1], 3: [0, 2, 1], 4: [0, 1, 3, 2], 5: [0, 1, 4, 3, 2], 6: [0, 1, 4, 5, 3, 2] };
export const maxRound = 999;
// How long a hold takes to register on the turn chip, the pill's round button and Undo.
export const holdDelay = 500;
// A mana strip keeps its buttons where they are for this long after its last tap, so a quick extra tap lands on what it
// was aimed at (docs/review/DEEP-DIVE.md D1).
export const stripHoldTime = 800;
// A dialog or the settings page ignores pointer input for this long after it opens, so the second tap of a double tap
// on the button that opened it can't land on a control inside (docs/review/FINAL.md B1).
export const dialogOpenGuard = 350;
// "Who goes first?": the shuffle lights tiles in turn for about 0.8s, and the chosen tile shows "Goes first" for a beat.
export const shuffleTick = 90;
export const shuffleTicks = 9;
export const firstBeat = 700;
// Player counters, commander damage and mana stop at this, which keeps every tile readable.
export const maxCount = 99;
// The custom starting life stepper's range.
export const maxStartingLife = 999;
export const faceAngles = { bottom: 0, left: 90, top: 180, right: 270 };
// A tile face's edges, clockwise from the far edge (its top, toward the table).
export const faceEdges = ['far', 'end', 'near', 'start'];
export const outLabels = { life: 'out', poison: 'out on poison', commander: 'out on commander damage' };
// The undo history (MANA-UNDO-SPEC §6, UNDO-ARCHITECTURE.md). The board fields are what a step records and an undo
// restores; the settings fields never are (§6.3). Every field of a saved game is in exactly one of the two lists
// (tests/logic.test.mjs), so a new field can't be forgotten.
export const historyFields = [
  'startingLife', 'scores', 'rotations', 'colors', 'poison', 'casts', 'energy', 'experience', 'rad', 'identities',
  'commanderDamage', 'pools', 'treasure', 'keepMana', 'turn', 'monarch', 'initiative',
];
export const settingsFields = [
  'keepAwake', 'landscapeAngle', 'counters', 'identity', 'manaPool', 'autoEmpty', 'turns', 'tileColours',
  'shuffleColours', 'badgeSize', 'style', 'reminders', 'trackTab', 'history',
];
// The saved history's format, and its cap: the newest 500 steps, and at most 64 KB of them as JSON.
export const historyVersion = 1;
export const historyCap = 500;
export const historyBytes = 64 * 1024;
// Quick taps on one tile and count merge into one step while each comes within this of the last (§6.2a).
export const mergeWindow = 1500;
// The running delta on a total fades for this long once its burst ends (§6.2b), and an undo's toast stays this long.
export const deltaFade = 300;
export const toastTime = 4000;
// The labels a step can carry, where its cells alone don't say what it was.
/** @typedef {'newGame' | 'turn' | 'turnBack' | 'first' | 'start' | 'eraser'} StepKind */
/** @type {string[]} */
export const stepKinds = ['newGame', 'turn', 'turnBack', 'first', 'start', 'eraser'];
