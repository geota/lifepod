'use strict';

const storageKey = 'lifepod-game';
const android = window.LifePodAndroid;
const ios = window.webkit?.messageHandlers;
const board = document.querySelector('#board');
const playerTemplate = document.querySelector('#player-template');
const wakeInput = document.querySelector('#keep-awake');
const boardControls = document.querySelector('#board-controls');
const setupButton = document.querySelector('#setup-button');
const diceButton = document.querySelector('#dice-button');
const diceDialog = document.querySelector('#dice');
const diceStage = document.querySelector('#dice-stage');
const dicePicker = document.querySelector('#dice-picker');
const diceRoll = document.querySelector('#dice-roll');
const diceResult = document.querySelector('#dice-result');
const rotateSeatsButton = document.querySelector('#rotate-seats');
const tileColoursButton = document.querySelector('#tile-colours');
const damageButton = document.querySelector('#damage-button');
const countersButton = document.querySelector('#counters-button');
const roundButton = document.querySelector('#round-button');
const roundBackButton = document.querySelector('#round-back');
const manaButton = document.querySelector('#mana-button');
const shuffleButton = document.querySelector('#shuffle-button');
const undoButton = document.querySelector('#undo-button');
const saveButton = document.querySelector('#save-button');
const cancelButton = document.querySelector('#cancel-button');
const discardDialog = document.querySelector('#discard');
const settings = document.querySelector('#settings');
const settingsForm = document.querySelector('#settings-form');
const settingsBody = document.querySelector('#settings-body');
const settingsContent = document.querySelector('#settings-content');
const settingsHead = settings.querySelector('.fs-head');
const settingsCue = settings.querySelector('.scroll-cue');
const settingsFlip = document.querySelector('#settings-flip');
const settingsDone = document.querySelector('#save-setup');
const settingsPending = document.querySelector('#settings-pending');
const restartButton = document.querySelector('#restart-button');
const playerChoices = document.querySelector('#player-choices');
const lifePresets = document.querySelector('#life-presets');
const lifeEdit = document.querySelector('#life-edit');
const lifeValue = document.querySelector('#life-value');
const lifeEditor = document.querySelector('#life-editor');
const lifeInput = document.querySelector('#life-input');
const manaSwitch = document.querySelector('#mana-switch');
const autoEmptySwitch = document.querySelector('#auto-empty-switch');
const autoEmptyRow = document.querySelector('#auto-empty-row');
const turnChoices = document.querySelector('#turn-choices');
const identityNote = document.querySelector('#identity-note');
const identityShowSwitches = document.querySelectorAll('#identity-show input');
const identityBackgroundChoices = document.querySelector('#identity-background');
const chooseIdentitiesButton = document.querySelector('#choose-identities');
const restart = document.querySelector('#restart');
const announcer = document.querySelector('#announcer');
const portraitQuery = window.matchMedia('(orientation: portrait)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const clockwiseEdges = ['bottom', 'left', 'top', 'right'];
const quarterTurns = [0, 90, 180, 270];
// Landscape rows list seats by facing edge and player number. Repeated seats span cells.
const seatLayouts = {
  2: ['left-1 right-2'],
  3: ['top-1 right-3', 'bottom-2 right-3'],
  4: ['top-1 top-2', 'bottom-3 bottom-4'],
  5: ['top-1 top-2 right-5', 'bottom-3 bottom-4 right-5'],
  6: ['top-1 top-2 top-5', 'bottom-3 bottom-4 bottom-6'],
};
const playerCounts = Object.keys(seatLayouts).map(Number);
// Tile colours, in order. Players 1–6 default to the first six. Each has a lighter top-row and a darker
// bottom-row version in styles.css: players 1, 2 and 5 use the top row, so neighbours differ in lightness too.
// New swatches only ever join the end, so saved choices keep their colour. The ids are Classic's names; each tile set
// below names them for itself.
const swatches = ['sage', 'sky', 'coral', 'violet', 'amber', 'teal', 'rose', 'indigo', 'slate', 'copper', 'olive', 'orchid'].map(id => ({ id }));
const topRowPlayers = [0, 1, 4];
// Tile colour sets (design/polish/TILES.md), in the Tile colours slider's order: the same twelve swatch ids in each, so a
// player's colour carries over, with each set's own names for screen readers. Classic is the original twelve; Clear,
// the default, keeps tiles apart for colour-blind players. styles.css holds each set's palettes under data-tiles.
const tileSets = {
  classic: { label: 'Classic', names: ['Sage', 'Sky', 'Coral', 'Violet', 'Amber', 'Teal', 'Rose', 'Indigo', 'Slate', 'Copper', 'Olive', 'Orchid'] },
  soft: { label: 'Soft', names: ['Coral', 'Copper', 'Olive', 'Lime', 'Jade', 'Teal', 'Sky', 'Azure', 'Violet', 'Orchid', 'Plum', 'Slate'] },
  jewel: { label: 'Jewel', names: ['Sage', 'Sky', 'Coral', 'Violet', 'Amber', 'Teal', 'Rose', 'Indigo', 'Slate', 'Copper', 'Olive', 'Orchid'] },
  clear: { label: 'Clear', names: ['Coral', 'Copper', 'Olive', 'Lime', 'Jade', 'Cyan', 'Sky', 'Indigo', 'Violet', 'Orchid', 'Pale plum', 'Deep plum'] },
};
const tileSetOrder = Object.keys(tileSets);
const defaultTileSet = 'clear';
// The centre button's label while a board mode that ends with the single check mark is open.
const doneLabels = { rotate: 'Done rotating seats', colours: 'Done choosing colours', identity: 'Done choosing identities' };
// Modes whose changes can be undone, saved with the check mark, or discarded with ✕.
const editingModes = ['damage', 'counters', 'mana'];
const discardMessages = {
  damage: 'Commander damage and life go back to how they were when you opened commander damage.',
  counters: 'Every counter goes back to how it was when you opened counters.',
  mana: 'Every mana pool goes back to how it was when you opened mana.',
};
// Player counters (design/polish/SPEC.md §6), in the order they appear everywhere: counters mode, the near badge row,
// the Track sheet and its summary. Each is one count per player in game[kind], shown while its Track switch is on.
// Commander tax counts casts and comes with the Commander switch. phrase names one counter for screen readers.
const counterKinds = [
  { kind: 'poison', tracker: 'poison', phrase: 'poison counter' },
  { kind: 'casts', tracker: 'commander', phrase: 'commander cast' },
  { kind: 'energy', tracker: 'energy', phrase: 'energy counter' },
  { kind: 'experience', tracker: 'experience', phrase: 'experience counter' },
  { kind: 'rad', tracker: 'rad', phrase: 'rad counter' },
];
const countKinds = counterKinds.map(counter => counter.kind);
// The Track switches, in the sheet's order. Each is saved in game.counters.
const trackers = ['commander', 'poison', 'energy', 'experience', 'rad'];
// Losing amounts (CR 903.10a and 704.5c), and where the warning starts.
const commanderLethal = 21;
const commanderWarning = 15;
const poisonLethal = 10;
const poisonWarning = 7;
// Colour identity (design/polish/SPEC.md §2): any combination of the five colours, in W U B R G order. A colourless
// commander has none. Each of the 31 identities has a name and a symbol. styles.css draws the symbols from the Mana
// font: each colour's mana symbol, the ten Ravnica guilds, the five Khans clans, the five Streets of New Capenna
// families for the shards, and the colour pie for all five. Four colours have no official symbol, so they get the
// colour pie with the missing colour as a ghost.
const identityNames = {
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
const identityParts = ['indicator', 'symbol', 'name'];
const identityBackgrounds = ['symbol', 'default', 'off'];
// The identity settings' save format. Saves without it are from when Background was Symbol · Indicator · Off and
// Off meant the rings: their Off loads as Default and their Indicator as Symbol, so only a save of this version
// can mean the new Off.
const identitySettingsVersion = 2;
const identityColours = [
  { id: 'W', name: 'white' }, { id: 'U', name: 'blue' }, { id: 'B', name: 'black' },
  { id: 'R', name: 'red' }, { id: 'G', name: 'green' },
];
// Floating mana (design/polish/SPEC.md §9): one count per colour in each player's pool, in W U B R G C order.
const manaColours = [...identityColours, { id: 'C', name: 'colourless' }];
// Turns (design/polish/SPEC.md §8): off, rounds (the first player's flag counts rounds) or turn by turn.
const turnModes = ['off', 'rounds', 'turns'];
// Play order is clockwise on screen, which is passing to the left. Seat rotation doesn't change it.
const playOrders = { 2: [0, 1], 3: [0, 2, 1], 4: [0, 1, 3, 2], 5: [0, 1, 4, 3, 2], 6: [0, 1, 4, 5, 3, 2] };
const maxRound = 999;
// How long a hold takes to register on the turn chip and the pill's round button, and how long "Undo clear" stays.
const holdDelay = 500;
const undoClearTime = 5000;
// "Who goes first?": the shuffle lights tiles in turn for about 0.8s, and the chosen tile shows "Goes first" for a beat.
const shuffleTick = 90;
const shuffleTicks = 9;
const firstBeat = 700;
// Player counters, commander damage and mana stop at this, which keeps every tile readable.
const maxCount = 99;
// The custom starting life stepper's range.
const maxStartingLife = 999;
// Auto-drop (design/polish/SPEC.md §3.2): what gives way, first to go first, when a badge row is wider than its
// tile. A drop step hides something on every tile (CSS reads its token from #board's data-drop); a floor step
// shrinks the type, but no smaller than the floor; wrap lets the row take a second line, growing toward the total.
// On the near row the identity's name and the turn chip's word "Turn" go first, leaving the untap symbol and "T" with the
// round, then the identity's symbol where the indicator also shows (one colour mark is enough).
const dropSteps = {
  near: [
    { drop: 'name', selector: '.ci-chip .id-name, .turn-chip .turn-word' }, { drop: 'symbol', selector: '.ci-chip .ci ~ .id-symbol' }, { floor: 11 },
    { drop: 'identity', selector: '.ci-chip' }, { floor: 9 }, { drop: 'wrap', wrap: true },
  ],
  far: [{ drop: 'sword', selector: '.sword' }, { floor: 11 }, { floor: 9 }, { drop: 'wrap-far', wrap: true }],
  // The mana strip never covers the life total, the − and + glyphs or the near row. Its type shrinks first, then it
  // wraps upward if there's room above it. Each strip then takes the first place that fits (fitStrips): its own line
  // above the near row, or the end of the near row's line, or, folded, one chip in the near row that shows the pool and
  // opens mana mode. Only the strips that need it fold, so a short pool elsewhere keeps its spend buttons.
  strip: [{ floor: 11 }, { drop: 'strip-wrap', wrap: true }],
};
// A dropped item comes back only when every row would fit it with this much to spare, so counts ticking up and
// down by one can't make it blink.
const dropSlack = 1.15;
const faceAngles = { bottom: 0, left: 90, top: 180, right: 270 };
// A tile face's edges, clockwise from the far edge (its top, toward the table).
const faceEdges = ['far', 'end', 'near', 'start'];
// Colours mode's grids for its twelve 44px swatches on narrow or short boards, in the order a face takes the first that
// fits: 4 × 3, 3 × 4, 6 × 2 and 2 × 6, with 3px gaps.
const swatchColumns = [4, 3, 6, 2];
// Phosphor Icons (MIT, phosphoricons.com), Bold weight, for controls drawn by this script. Experience's graduation
// cap is Fill weight, so it holds up at badge size.
const iconPaths = {
  minus: 'M228,128a12,12,0,0,1-12,12H40a12,12,0,0,1,0-24H216A12,12,0,0,1,228,128Z',
  plus: 'M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z',
  crown: 'M232.63,70a19.82,19.82,0,0,0-23.55,4.71l-29.52,31.82L146.22,31.76l-.06-.14a20,20,0,0,0-36.32,0l-.06.14L76.44,106.52,46.92,74.7a20,20,0,0,0-34.6,16.81c0,.16.06.31.09.47L35.07,195.76A20,20,0,0,0,54.71,212H201.29a20,20,0,0,0,19.64-16.24L243.59,92c0-.16.07-.31.09-.47A19.82,19.82,0,0,0,232.63,70ZM198.06,188H57.94L39.06,101.51,71.2,136.16A12,12,0,0,0,91,132.89l37-83.07,37,83.07a12,12,0,0,0,19.76,3.27l32.14-34.65Z',
  'graduation-cap': 'M176,207.24a119,119,0,0,0,16-7.73V240a8,8,0,0,1-16,0Zm11.76-88.43-56-29.87a8,8,0,0,0-7.52,14.12L171,128l17-9.06Zm64-29.87-120-64a8,8,0,0,0-7.52,0l-120,64a8,8,0,0,0,0,14.12L32,117.87v48.42a15.91,15.91,0,0,0,4.06,10.65C49.16,191.53,78.51,216,128,216a130,130,0,0,0,48-8.76V130.67L171,128l-43,22.93L43.83,106l0,0L25,96,128,41.07,231,96l-18.78,10-.06,0L188,118.94a8,8,0,0,1,4,6.93v73.64a115.63,115.63,0,0,0,27.94-22.57A15.91,15.91,0,0,0,224,166.29V117.87l27.76-14.81a8,8,0,0,0,0-14.12Z',
  sword: 'M216,28H152a12,12,0,0,0-9.33,4.45L79.5,110.51l-4.66-4.65a20,20,0,0,0-28.29,0L29.86,122.55a20,20,0,0,0,0,28.29h0L45,166,23.86,187.17a20,20,0,0,0,0,28.28l16.69,16.69a20,20,0,0,0,28.28,0L90,211l15.17,15.16a20,20,0,0,0,28.29,0l16.69-16.69a20,20,0,0,0,0-28.3l-4.65-4.65,78.06-63.17A12,12,0,0,0,228,104V40A12,12,0,0,0,216,28ZM54.69,212.34l-11-11L62,183l11,11Zm64.61-6L49.65,136.7l11.05-11,69.65,69.65ZM204,98.27l-75.58,61.17L121,152l47.51-47.5a12,12,0,0,0-17-17L104,135l-7.45-7.44L157.73,52H204Z',
  // Fill weight, like the Track icon.
  flag: 'M232,56V176a8,8,0,0,1-2.76,6c-15.28,13.23-29.89,18-43.82,18-18.91,0-36.57-8.74-53-16.85C105.87,170,82.79,158.61,56,179.77V224a8,8,0,0,1-16,0V56a8,8,0,0,1,2.77-6h0c36-31.18,68.31-15.21,96.79-1.12C167,62.46,190.79,74.2,218.76,50A8,8,0,0,1,232,56Z',
  'hand-tap': 'M228,156v36c0,13.85-1.63,26.52-4.58,35.68a12,12,0,1,1-22.84-7.36c2.14-6.65,3.42-17.24,3.42-28.32V156a8,8,0,0,0-16,0v4a12,12,0,0,1-24,0V140a8,8,0,0,0-16,0v12a12,12,0,0,1-24,0V84a8,8,0,0,0-16,0V192a12,12,0,0,1-22.18,6.34l-18.68-30-.21-.34A8,8,0,0,0,53,175.92L78.27,217.8a12,12,0,0,1-20.56,12.39l-25.31-42-.12-.2A32,32,0,0,1,84,150.83V84a32,32,0,0,1,64,0v25a32,32,0,0,1,36.78,17A32,32,0,0,1,228,156ZM56,96A12,12,0,0,0,68,84a48,48,0,0,1,96,0,12,12,0,0,0,24,0A72,72,0,0,0,44,84,12,12,0,0,0,56,96Z',
  eraser: 'M216,204H141l86.84-86.84a28,28,0,0,0,0-39.6L186.43,36.19a28,28,0,0,0-39.6,0L28.19,154.82a28,28,0,0,0,0,39.6l30.06,30.07A12,12,0,0,0,66.74,228H216a12,12,0,0,0,0-24ZM163.8,53.16a4,4,0,0,1,5.66,0l41.38,41.38a4,4,0,0,1,0,5.65L160,151l-47-47ZM71.71,204,45.16,177.45a4,4,0,0,1,0-5.65L96,121l47,47-36,36Z',
  undo: 'M228,128a100,100,0,0,1-98.66,100H128a99.39,99.39,0,0,1-68.62-27.29,12,12,0,0,1,16.48-17.45,76,76,0,1,0-1.57-109c-.13.13-.25.25-.39.37L54.89,92H72a12,12,0,0,1,0,24H24a12,12,0,0,1-12-12V56a12,12,0,0,1,24,0V76.72L57.48,57.06A100,100,0,0,1,228,128Z',
  check: 'M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z',
  'caret-right': 'M184.49,136.49l-80,80a12,12,0,0,1-17-17L159,128,87.51,56.49a12,12,0,1,1,17-17l80,80A12,12,0,0,1,184.49,136.49Z',
  play: 'M234.49,111.07,90.41,22.94A20,20,0,0,0,60,39.87V216.13a20,20,0,0,0,30.41,16.93l144.08-88.13a19.82,19.82,0,0,0,0-33.86ZM84,208.85V47.15L216.16,128Z',
};

let game = loadGame();
let selectedPlayerCount = game.scores.length;
let lock;
let requestingLock = false;
// The open board mode: 'rotate', 'colours', 'identity', 'damage', 'counters', 'mana' or 'first' ("Who goes first?"),
// or null at rest.
let boardMode = null;
// While an editing mode is open: every change made in it, newest last, so it can be undone or discarded,
// and the life totals when it opened.
let edits = null;
let editStartScores = [];
let announceTimer;
const pendingAnnouncements = new Map();
// How many auto-drop steps each badge row has taken, board-wide. A new game starts again from none.
let dropLevels = { near: 0, far: 0, strip: 0 };
let fitQueued = false;
// The pill's buttons now and at rest, as last measured.
let pillShape = '';
// Settings' starting life, before Done applies it. selectedPlayerCount above is the same for players.
let selectedLife = game.startingLife;
let diceSides = 20;
let die;
let stopRoll;
// Every held counter button, so several players can hold buttons at the same time.
const activePresses = new Set();
// Turn steps, newest last, so holding the turn chip or the pill steps back exactly, restoring any pools the step
// emptied. Not saved: after a relaunch, a hold steps back by the play order instead.
let turnSteps = [];
// "Who goes first?" waits until settings has closed, then opens.
let askFirst = false;
let shuffleTimer;
// Pools cleared with the eraser in the last 5 seconds, by player, so "Undo clear" can put them back. Not saved.
const clearedPools = new Map();

// Read the size directly. Media queries can lag a resize in WebKit.
function isPortraitWindow() {
  return window.innerHeight > window.innerWidth;
}

function normalizeAngle(angle) {
  return ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
}

// The angle the OS has turned the screen clockwise from the device's natural orientation.
function readScreen() {
  const orientation = window.screen.orientation;
  if (orientation && Number.isFinite(orientation.angle) && typeof orientation.type === 'string') {
    return { angle: normalizeAngle(orientation.angle), landscape: orientation.type.startsWith('landscape') };
  }
  if (Number.isFinite(window.orientation)) {
    const angle = normalizeAngle(window.orientation);
    return { angle, landscape: angle % 180 !== 0 };
  }
  // Without an orientation API, treat the window's shape as the screen's.
  return isPortraitWindow() ? { angle: 0, landscape: false } : { angle: 90, landscape: true };
}

// The screen angle that shows the board upright in landscape, so the seats can stay fixed to the device.
function currentLandscapeAngle() {
  const { angle, landscape } = readScreen();
  return landscape ? angle : (angle + 90) % 360;
}

function boardTurn() {
  let turn = (game.landscapeAngle - readScreen().angle + 360) % 360;
  // Keep the board landscape when the window shape differs from the screen, as in split screen.
  if ((turn % 180 !== 0) !== isPortraitWindow()) turn = (turn + 90) % 360;
  return turn;
}

function syncBoardTurn() {
  document.querySelector('.app').dataset.boardTurn = String(boardTurn());
  measureBoard();
  if (settings.open) {
    placeSettingsSections();
    syncSettingsCue();
    keepLifeEditorInView();
  }
}

// One size per board (design/polish/SPEC.md §3.1): every tile draws its content at the size that fits the smallest
// tile. --ui and --ub are the smallest tile face's width and height, and CSS sizes tile content from them instead of
// from each tile's own size. The flags set the board-wide thresholds that hide mode hints and pick layouts.
//
// The centre pill never covers a total, a glyph or a badge (design/polish/FINAL-REVIEW.md #1 and #2). It sits on a seam
// that the tiles' far rows face: upright along the middle seam with 2 players, and otherwise on the horizontal seam
// through the middle of the board, kept to the columns whose seats are split into two rows. Any face edge it still
// reaches past, such as a rotated seat's near row or one end, gets the far row's clearance, and --ui and --ub are what
// each face has left inside its clearances, so tile content is sized to fit them.
function measureBoard() {
  const faces = [...board.querySelectorAll('.player-face')];
  // A new player count is measured once its tiles are drawn.
  if (faces.length !== game.scores.length || !board.clientWidth || !board.clientHeight) return;
  const size = Math.max(...[...boardControls.querySelectorAll('.pill-button')].map(button => button.offsetWidth));
  const pill = placePill(size);
  // The far row already keeps this clear of the board's middle.
  const farClear = size / 2 + 2;
  const usable = faces.map((face) => {
    const player = face.parentElement;
    const clear = centreClearance(player, face, pill, farClear);
    for (const edge of faceEdges) {
      if (clear[edge]) player.style.setProperty(`--clear-${edge}`, `${clear[edge]}px`);
      else player.style.removeProperty(`--clear-${edge}`);
    }
    return { player, face, clear, width: face.offsetWidth - clear.start - clear.end, height: face.offsetHeight - clear.near - Math.max(0, clear.far - farClear) };
  });
  const width = Math.min(...usable.map(face => face.width));
  const height = Math.min(...usable.map(face => face.height));
  if (!(width > 0) || !(height > 0)) return;
  board.style.setProperty('--ui', `${width}px`);
  board.style.setProperty('--ub', `${height}px`);
  board.toggleAttribute('data-narrow', width < 240);
  board.toggleAttribute('data-short', height < 200);
  board.toggleAttribute('data-wide', width >= 264);
  sizeMapSeats(usable, size, width < 240 || height < 200);
  fitModeGrids(usable, { width, height, size, tight: width < 240 || height < 200 });
  syncBoardDigits();
  requestFit();
}

// styles.css's --grow in pixels: 1 on phones, up to 2 on tablets.
function growPixel() {
  return Math.min(2, Math.max(1, Math.min(window.innerWidth, window.innerHeight) / 430));
}

// How many buttons the pill holds at rest: the round, commander damage, counters and mana when they're on, then dice
// and setup.
function restPillButtons() {
  return 2 + Number(game.turns !== 'off') + Number(game.counters.commander) + Number(shownCounters().length > 0) + Number(game.manaPool);
}

// Places the pill and returns the box its buttons cover now, in the board's own coordinates. The place is chosen for
// the pill at its widest, so it doesn't move when a mode opens with fewer buttons.
function placePill(size) {
  const shown = [...boardControls.querySelectorAll('.pill-button')].filter(button => !button.hidden).length;
  const width = board.clientWidth;
  const height = board.clientHeight;
  const vertical = game.scores.length === 2;
  const widest = Math.max(shown, restPillButtons()) * size;
  let x = width / 2;
  const y = height / 2;
  if (!vertical) {
    const [top, bottom] = seatLayouts[game.scores.length].map(row => row.split(' '));
    const split = top.filter((seat, column) => seat !== bottom[column]).map(seat => board.children[Number(seat.split('-')[1]) - 1]);
    const start = Math.min(...split.map(tile => tile.offsetLeft - board.offsetLeft));
    const end = Math.max(...split.map(tile => tile.offsetLeft - board.offsetLeft + tile.offsetWidth));
    // At the board's centre where that's on the seam and the pill fits there, otherwise centred on the seam (3 players).
    x = x > start + 1 && x < end - 1 && end - start >= widest ? Math.min(Math.max(x, start + widest / 2), end - widest / 2) : (start + end) / 2;
    x = Math.min(Math.max(x, widest / 2), width - widest / 2);
  }
  boardControls.style.left = `${board.offsetLeft + x}px`;
  boardControls.style.top = `${board.offsetTop + y}px`;
  boardControls.toggleAttribute('data-vertical', vertical);
  const along = shown * size / 2;
  const across = size / 2;
  return vertical ? { left: x - across, right: x + across, top: y - along, bottom: y + along }
    : { left: x - along, right: x + along, top: y - across, bottom: y + across };
}

// The clearance a face needs from the pill on each of its edges. Where the pill reaches into a tile past two edges (at
// a corner), clearing the edge it reaches least far past is enough, and the far edge already has its clearance.
function centreClearance(player, face, pill, farClear) {
  const clear = { far: 0, end: 0, near: 0, start: 0 };
  const tile = { left: player.offsetLeft - board.offsetLeft, top: player.offsetTop - board.offsetTop };
  tile.right = tile.left + player.offsetWidth;
  tile.bottom = tile.top + player.offsetHeight;
  const left = Math.max(tile.left, pill.left);
  const right = Math.min(tile.right, pill.right);
  const top = Math.max(tile.top, pill.top);
  const bottom = Math.min(tile.bottom, pill.bottom);
  if (right - left < 0.5 || bottom - top < 0.5) return clear;
  // The tile's edges clockwise from its top, with how far the pill reaches past each one it crosses.
  const depths = [
    top <= tile.top + 0.5 ? bottom - tile.top : null,
    right >= tile.right - 0.5 ? tile.right - left : null,
    bottom >= tile.bottom - 0.5 ? tile.bottom - top : null,
    left <= tile.left + 0.5 ? right - tile.left : null,
  ];
  const turn = faceAngles[player.dataset.edge] / 90;
  let best = null;
  depths.forEach((depth, side) => {
    if (depth === null) return;
    const edge = faceEdges[(side - turn + 4) % 4];
    const need = Math.ceil(depth + 2);
    // The share of the face it costs, across that edge.
    const across = edge === 'far' || edge === 'near' ? face.offsetHeight : face.offsetWidth;
    const cost = (edge === 'far' ? Math.max(0, need - farClear) : need) / across;
    if (!best || cost < best.cost) best = { edge, need, cost };
  });
  if (best) clear[best.edge] = best.need;
  return clear;
}

// The mode grids are one size on every tile, and each face lays its grid out with as many columns as fit inside its
// mode layer, which keeps clear of the pill on the edges the pill reaches: a narrow rotated seat gets fewer, taller
// columns. Colours: on narrow or short boards, the first of 4 × 3, 3 × 4, 6 × 2 and 2 × 6 that fits (the layer keeps
// 6px less than the clearance there, and 1px from other edges); elsewhere 4 × 3 always fits. Counter and mana cells:
// three to a row, or two. Identity toggles: five in a row where every tile has room (ui ≥ 264), otherwise three, or two.
// The cell and toggle sizes follow styles.css (.counter-cells, .identity).
function fitModeGrids(faces, { width: ui, height: ub, size, tight }) {
  const grow = growPixel();
  const cell = Math.min(Math.max(44, Math.min((ui - 20) / 3, (ub - 10 - size) / 2)), 92 * grow);
  const toggle = Math.min(Math.max(44, 12 * ui / 100), 72 * grow);
  const swatchSpan = count => count * 44 + (count - 1) * 3;
  for (const { player, face, clear } of faces) {
    const swatchPad = edge => Math.max(1, clear[edge] - 6);
    const swatchWidth = face.offsetWidth - swatchPad('start') - swatchPad('end');
    const swatchHeight = face.offsetHeight - swatchPad('far') - swatchPad('near');
    const swatches = tight ? swatchColumns.find(count => swatchSpan(count) <= swatchWidth + 0.5 && swatchSpan(12 / count) <= swatchHeight + 0.5) ?? 4 : 4;
    player.style.setProperty('--swatch-columns', swatches);
    // The width the face leaves inside its clearances. The grids may reach into the layers' small default padding.
    const room = face.offsetWidth - clear.start - clear.end + 0.5;
    player.style.setProperty('--cell-columns', 3 * cell + 20 <= room ? 3 : 2);
    const toggles = [ui >= 264 ? 5 : 3, 3, 2].find(count => count * toggle + (count - 1) * 4 <= room) ?? 2;
    player.style.setProperty('--toggle-columns', toggles);
  }
}

// Commander damage map seats are one size on every tile (design/polish/FINAL-REVIEW.md #13), the largest that fits every
// face, whichever way its map is turned: a sideways face draws the table's rows as its columns.
function sizeMapSeats(faces, size, tight) {
  const { rows, columns } = seatGrid();
  const grow = growPixel();
  const gap = 4;
  let seatWidth = Infinity;
  let seatHeight = Infinity;
  for (const { player, width, height } of faces) {
    const sideways = faceAngles[player.dataset.edge] % 180 !== 0;
    const across = sideways ? rows : columns;
    const down = sideways ? columns : rows;
    // The map keeps 12px from the face's ends, and its layer's padding and the hint above it.
    const room = { width: Math.min(width - 12, across * 120 * grow), height: Math.min(height - 6 - size / 2 - (tight ? 0 : 24), down * 80 * grow) };
    seatWidth = Math.min(seatWidth, (room.width - gap * (across - 1)) / across);
    seatHeight = Math.min(seatHeight, (room.height - gap * (down - 1)) / down);
  }
  board.style.setProperty('--seat-width', `${Math.max(44, Math.floor(seatWidth * 10) / 10)}px`);
  board.style.setProperty('--seat-height', `${Math.max(44, Math.floor(seatHeight * 10) / 10)}px`);
}

// The most digits in any total, at least 2. A three-digit total shrinks every total together.
function syncBoardDigits() {
  const digits = String(Math.max(2, ...game.scores.map(score => String(score).length)));
  if (board.style.getPropertyValue('--board-digits') !== digits) board.style.setProperty('--board-digits', digits);
}

// Badge rows are fitted once whatever changed them has finished, so a loop over the tiles fits only the end result.
function requestFit() {
  if (fitQueued) return;
  fitQueued = true;
  queueMicrotask(fitBadgeRows);
}

// The near rows are fitted first, then each mana strip takes the first place that fits. A strip folded onto the end of
// its near row's line takes room from that row, so the near rows are fitted again around it.
function fitBadgeRows() {
  fitQueued = false;
  for (const player of board.children) {
    if (player.querySelector('.mana-strip').hidden) delete player.dataset.strip;
    else player.dataset.strip = 'above';
  }
  fitBadgeSide('near');
  fitBadgeSide('far');
  if (fitStrips()) fitBadgeSide('near');
}

function syncDropTokens(levels) {
  const tokens = Object.keys(dropSteps).flatMap(side => dropTokens(side, levels[side]));
  if (tokens.length) board.dataset.drop = tokens.join(' ');
  else delete board.dataset.drop;
}

// The drop tokens a side has at a level. A step that would hide nothing on the board is skipped.
function dropTokens(side, level, rows = badgeRows(side)) {
  return dropSteps[side].slice(0, level)
    .filter(step => step.drop && (!step.selector || rows.some(row => row.querySelector(step.selector))))
    .map(step => step.drop);
}

function badgeRows(side) {
  return [...board.querySelectorAll(side === 'strip' ? '.mana-strip' : `.badges.${side}`)].filter(row => !row.hidden && row.offsetParent !== null && row.childElementCount);
}

// The chips' width at the row's current type, from the first chip shown to the last, gaps included.
function chipsWidth(row) {
  const chips = [...row.children].filter(chip => chip.offsetWidth);
  if (!chips.length) return 0;
  const last = chips.at(-1);
  return last.offsetLeft + last.offsetWidth - chips[0].offsetLeft;
}

// Takes the fewest steps that make every row on one side of the board fit at the same type size. The busiest
// tile decides for every tile, so the board stays uniform. A step already taken is only undone when the rows
// would fit without it with 15% to spare.
function fitBadgeSide(side) {
  const rows = badgeRows(side);
  const property = `--${side}-badge-size`;
  board.style.removeProperty(property);
  if (!rows.length) {
    syncDropTokens(dropLevels);
    return;
  }
  const steps = dropSteps[side];
  const base = parseFloat(getComputedStyle(rows[0]).fontSize);
  const measure = (level) => {
    syncDropTokens({ ...dropLevels, [side]: level });
    const taken = steps.slice(0, level);
    const floors = taken.filter(step => step.floor).map(step => step.floor);
    return {
      // A pixel to spare absorbs the rounding of each chip's width.
      ratio: Math.min(...rows.map(row => (row.clientWidth - 1) / Math.max(1, chipsWidth(row)))),
      floor: floors.length ? Math.min(...floors) : null,
      wrap: taken.some(step => step.wrap),
    };
  };
  const fits = (state, slack) => state.wrap || state.ratio >= slack || (state.floor !== null && base * state.ratio / slack >= state.floor);
  let needed = 0;
  let state = measure(0);
  while (!fits(state, 1) && needed < steps.length) state = measure(++needed);
  let level = needed;
  const current = dropLevels[side];
  if (needed < current) {
    const kept = dropTokens(side, current, rows).length;
    level = current;
    for (let candidate = needed; candidate < current; candidate++) {
      if (dropTokens(side, candidate, rows).length === kept || fits(measure(candidate), dropSlack)) {
        level = candidate;
        break;
      }
    }
  }
  dropLevels = { ...dropLevels, [side]: level };
  state = measure(level);
  // A wrapped row keeps its full type, since it has a second line to use.
  if (!state.wrap && state.ratio < 1 && state.floor !== null) {
    board.style.setProperty(property, `${Math.max(state.floor, Math.floor(base * state.ratio * 10) / 10)}px`);
  }
}

// Whether two boxes overlap by more than a rounding error.
function overlaps(a, b) {
  return a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
}

// The mana strips never cover a life total, its − and + glyphs, the "Out" tag, the far row, the near row or the pill,
// and the near rows always stay (design/polish/FINAL-REVIEW.md #3). Each strip takes the first of these that fits:
//   'above': its own line between the total and the near row;
//   'inline': at the end of the near row's line, where the near row leaves room;
//   'fold': folded into one chip that shows the pool and opens mana mode, on its own line above the near row;
//   'fold-inline': that chip at the end of the near row, which wraps around it like any other chip.
// The type steps (shrink, then wrap) are board-wide like the badge rows: the fewest that fold the fewest strips, with
// the same 15% to spare before a step is undone. Returns whether a chip took room on a near row's line.
function fitStrips() {
  const strips = [...board.querySelectorAll('.mana-strip')].filter(strip => !strip.hidden && strip.parentElement.offsetParent !== null);
  board.style.removeProperty('--strip-size');
  if (!strips.length) {
    syncDropTokens(dropLevels);
    return false;
  }
  const steps = dropSteps.strip;
  const controls = boardControls.getBoundingClientRect();
  const inset = controls.height > controls.width ? controls.width / 8 : controls.height / 8;
  const pill = { left: controls.left + inset, right: controls.right - inset, top: controls.top + inset, bottom: controls.bottom - inset };
  const tileOf = strip => strip.closest('.player');
  // One line's width, even where the strips may wrap.
  const lineWidth = (strip) => {
    strip.style.flexWrap = 'nowrap';
    const width = strip.scrollWidth;
    strip.style.removeProperty('flex-wrap');
    return width;
  };
  const clear = (strip) => {
    const box = strip.getBoundingClientRect();
    const face = strip.closest('.player-face');
    const blockers = [face.querySelector('.score'), face.querySelector('.out-tag'), ...face.querySelectorAll('.controls button, .badges.far > *')];
    return !overlaps(box, pill) && !blockers.some(blocker => blocker.offsetWidth && overlaps(box, blocker.getBoundingClientRect()));
  };
  // Where one strip goes at the current type, with slack to spare across the line, and what that costs: a folded strip
  // costs one, and one on the near row's line two.
  const place = (strip, slack, wrap) => {
    const player = tileOf(strip);
    const room = strip.parentElement.clientWidth;
    const near = player.querySelector('.badges.near');
    const nearWidth = near.hidden ? 0 : chipsWidth(near);
    const besideNear = width => nearWidth + (nearWidth ? 4 : 0) + width <= room + 1;
    player.dataset.strip = 'above';
    if ((wrap || lineWidth(strip) * slack <= room + 1) && clear(strip)) return 0;
    player.dataset.strip = 'inline';
    if (besideNear(lineWidth(strip) * slack) && clear(strip)) return 0;
    player.dataset.strip = 'fold';
    if (strip.offsetWidth * slack <= room + 1 && clear(strip)) return 1;
    player.dataset.strip = 'fold-inline';
    return 2;
  };
  const base = parseFloat(getComputedStyle(strips[0]).fontSize);
  // What the strips' places cost at a level.
  const measure = (level, slack) => {
    syncDropTokens({ ...dropLevels, strip: level });
    board.style.removeProperty('--strip-size');
    const taken = steps.slice(0, level);
    const floors = taken.filter(step => step.floor).map(step => step.floor);
    const wrap = taken.some(step => step.wrap);
    if (floors.length) {
      // Each strip shrinks toward the line it can have: its own line where that's clear of the total, otherwise what the
      // near row leaves on its line.
      const ratio = Math.min(...strips.map((strip) => {
        const player = tileOf(strip);
        const near = player.querySelector('.badges.near');
        player.dataset.strip = 'above';
        const room = strip.parentElement.clientWidth - (clear(strip) || near.hidden ? 0 : chipsWidth(near) + 4);
        return room / (lineWidth(strip) * slack);
      }));
      if (ratio < 1) board.style.setProperty('--strip-size', `${Math.max(Math.min(...floors), Math.floor(base * ratio * 10) / 10)}px`);
    }
    return strips.reduce((cost, strip) => cost + place(strip, slack, wrap), 0);
  };
  const folds = steps.map((_, level) => measure(level, 1)).concat(measure(steps.length, 1));
  const needed = folds.indexOf(Math.min(...folds));
  let level = needed;
  const current = dropLevels.strip;
  if (needed < current) {
    level = current;
    for (let candidate = needed; candidate < current; candidate++) {
      if (measure(candidate, dropSlack) <= folds[current]) {
        level = candidate;
        break;
      }
    }
  }
  dropLevels = { ...dropLevels, strip: level };
  measure(level, 1);
  return strips.some(strip => tileOf(strip).dataset.strip === 'fold-inline');
}

function seatRow(index) {
  return topRowPlayers.includes(index) ? 'top' : 'bottom';
}

// One distinct swatch per player. Valid saved choices are kept in seat order. A seat with no choice, or with
// one already taken, gets its default if that's free and otherwise the first free swatch.
function fitColors(saved, count) {
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
function fitCounts(saved, count) {
  return Array.from({ length: count }, (_, index) => {
    const value = Array.isArray(saved) ? saved[index] : undefined;
    return Number.isInteger(value) && value >= 0 && value <= maxCount ? value : 0;
  });
}

// Colour identity as letters in W U B R G order. Anything else, including colourless ('C') from saves made
// before it was removed, means no identity.
function normalizeIdentity(value) {
  if (typeof value !== 'string' || !/^[WUBRG]*$/.test(value)) return '';
  return identityColours.map(colour => colour.id).filter(id => value.includes(id)).join('');
}

// Commander damage taken, by defender then attacker. A player never damages themselves.
function fitDamage(saved, count) {
  return Array.from({ length: count }, (_, defender) => Array.from({ length: count }, (_, attacker) => {
    const value = Array.isArray(saved?.[defender]) ? saved[defender][attacker] : undefined;
    return defender !== attacker && Number.isInteger(value) && value >= 0 && value <= maxCount ? value : 0;
  }));
}

function fitIdentities(saved, count) {
  return Array.from({ length: count }, (_, index) => normalizeIdentity(Array.isArray(saved) ? saved[index] : undefined));
}

// What tiles show of each identity: the chip's parts (default: indicator and name) and the background behind the
// total (default: the symbol). Anything that isn't a valid choice falls back to its default.
function fitIdentitySettings(saved) {
  const defaults = { indicator: true, symbol: false, name: true };
  const show = Object.fromEntries(identityParts.map(part =>
    [part, typeof saved?.show?.[part] === 'boolean' ? saved.show[part] : defaults[part]]));
  return { show, background: fitIdentityBackground(saved), version: identitySettingsVersion };
}

function fitIdentityBackground(saved) {
  if (saved?.version === identitySettingsVersion) {
    return identityBackgrounds.includes(saved.background) ? saved.background : 'symbol';
  }
  return saved?.background === 'off' ? 'default' : 'symbol';
}

// Each player's pool: one count per colour, W U B R G C. Anything that isn't a whole number from 0 to the maximum is 0.
function fitPools(saved, count) {
  return Array.from({ length: count }, (_, index) => fitCounts(Array.isArray(saved) ? saved[index] : undefined, manaColours.length));
}

// Who went first, whose turn it is and the round. A seat that isn't on the board means nobody.
function fitTurn(saved, count) {
  const seat = value => (Number.isInteger(value) && value >= 0 && value < count ? value : null);
  const round = saved?.round;
  return {
    first: seat(saved?.first), active: seat(saved?.active),
    round: Number.isInteger(round) && round >= 1 && round <= maxRound ? round : 1,
  };
}

// Which trackers are on. Each is off unless it was saved as exactly true.
function fitTrackers(saved) {
  return Object.fromEntries(trackers.map(tracker => [tracker, saved?.[tracker] === true]));
}

function loadGame() {
  const defaults = {
    startingLife: 40, scores: [40, 40, 40, 40], rotations: [0, 0, 0, 0], keepAwake: true,
    landscapeAngle: currentLandscapeAngle(), colors: fitColors([], 4),
    counters: fitTrackers(), ...Object.fromEntries(countKinds.map(kind => [kind, fitCounts([], 4)])),
    identities: fitIdentities([], 4), identity: fitIdentitySettings(), commanderDamage: fitDamage([], 4),
    manaPool: false, autoEmpty: true, pools: fitPools([], 4), turns: 'off', turn: fitTurn(null, 4), tileColours: defaultTileSet,
  };
  try {
    const snapshot = android ? android.readGame() : ios ? window.initialGame : localStorage.getItem(storageKey);
    const saved = JSON.parse(snapshot);
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
      ...Object.fromEntries(countKinds.map(kind => [kind, fitCounts(saved[kind], saved.scores.length)])),
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
    };
  } catch {
    return defaults;
  }
}

function saveGame() {
  const snapshot = JSON.stringify(game);
  if (android) android.writeGame(snapshot);
  else if (ios) ios.game.postMessage(snapshot);
  else {
    try { localStorage.setItem(storageKey, snapshot); }
    catch { /* The current game still works if browser storage is disabled. */ }
  }
}

async function syncWakeLock() {
  if (android) {
    android.keepAwake(game.keepAwake);
    return;
  }
  if (ios) {
    ios.keepAwake.postMessage(game.keepAwake);
    return;
  }
  if (!game.keepAwake || document.hidden) {
    if (lock) await lock.release();
    return;
  }
  if (lock || requestingLock || !navigator.wakeLock) return;
  try {
    requestingLock = true;
    const acquired = await navigator.wakeLock.request('screen');
    if (game.keepAwake && !document.hidden) {
      lock = acquired;
      acquired.addEventListener('release', () => { lock = undefined; }, { once: true });
    } else {
      await acquired.release();
    }
  } catch {
    // A browser or device may decline a screen wake lock.
  } finally {
    requestingLock = false;
  }
}

function cancelPresses() {
  for (const press of [...activePresses]) press.end();
}

// A press counts on pointerdown (or, for map seats and turn steps, when it ends), so the click that follows is skipped.
// Presses often redraw what's under the finger, such as a mana strip that shrinks or a turn chip that moves to the
// next player, and that click can land on a different button. So the window that skips it is shared by every
// button, not kept per button. Keyboard clicks have no detail and always count.
let ignoreClicksUntil = 0;

// A press counts the moment a finger lands, so a tap can't be lost to a finger drifting off the button
// or to Android cancelling touches when several fingers land at once. Holding repeats after a pause.
// Clicks still handle keyboards and assistive technology.
// adjust gets how long the press has been held, in milliseconds (0 for a tap or a click).
function bindCounter(button, adjust, label) {
  button.setAttribute('aria-label', label);
  const tile = button.closest('.player') ?? button;
  let press;
  // The last pointer that pressed this button. A press that ended when the finger left the tile still owns the click
  // that follows its pointerup.
  let pressPointer;

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    pressPointer = event.pointerId;
    // A new touch ends any earlier press on this button, even if that press never got its pointerup.
    press?.end();
    const current = {
      pointerId: event.pointerId,
      start: performance.now(),
      end() {
        clearTimeout(current.timer);
        activePresses.delete(current);
        if (press !== current) return;
        press = undefined;
        delete button.dataset.pressed;
      },
    };
    function repeat() {
      adjust(performance.now() - current.start);
      current.timer = setTimeout(repeat, 100);
    }
    press = current;
    activePresses.add(current);
    button.dataset.pressed = '';
    ignoreClicksUntil = performance.now() + 800;
    adjust(0);
    current.timer = setTimeout(repeat, 500);
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone. The press still counted, and the next touch ends it.
    }
  });
  // A hold stops when the finger leaves the player's tile.
  button.addEventListener('pointermove', (event) => {
    if (event.pointerId !== press?.pointerId) return;
    const bounds = tile.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) {
      press.end();
    }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, (event) => {
      if (event.pointerId === pressPointer) ignoreClicksUntil = performance.now() + 800;
      if (event.pointerId !== press?.pointerId) return;
      press.end();
    });
  }
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  // Skip the click that follows a press already counted on pointerdown. Keyboard clicks have no detail.
  button.addEventListener('click', (event) => {
    if (event.detail === 0 || performance.now() >= ignoreClicksUntil) adjust(0);
  });
}

// A light tick for each counted change. Phones follow their own system haptics settings.
function haptic() {
  if (android) android.haptic?.();
  else if (ios) ios.haptic?.postMessage(null);
  else navigator.vibrate?.(8);
}

// Announce totals once a burst of changes settles, instead of on every step of a hold. Each player's news is
// read in seat order, and describe() runs when it's read, so it gives the settled value.
function announce(index, kind, describe) {
  pendingAnnouncements.set(`${index} ${kind}`, { index, describe });
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    announcer.textContent = [...pendingAnnouncements.values()].sort((a, b) => a.index - b.index)
      .map(item => item.describe()).join('. ');
    pendingAnnouncements.clear();
  }, 700);
}

function announceLife(index) {
  announce(index, 'life', () => `Player ${index + 1}, ${game.scores[index]} life`);
}

// How a screen reader hears an identity, such as "Selesnya, colour identity white, green", whatever the chip shows.
function identityText(identity) {
  if (!identity) return 'no colour identity';
  return `${identityNames[identity]}, colour identity ${[...identity].map(id => identityColours.find(colour => colour.id === id).name).join(', ')}`;
}

// Android's back gesture only needs the page while a dialog or board mode is open.
function syncBackHandling() {
  android?.setBackHandling?.(boardMode !== null || document.querySelector('dialog[open]') !== null);
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 256 256');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.dataset.icon = name;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', iconPaths[name]);
  svg.append(path);
  return svg;
}

// A symbol from the bundled Mana font, sized and coloured like the Phosphor icons.
function manaIcon(name) {
  const glyph = element('span', 'icon mana-icon');
  glyph.dataset.glyph = name;
  glyph.setAttribute('aria-hidden', 'true');
  return glyph;
}

function element(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

function visuallyHidden(text) {
  return element('span', 'visually-hidden', text);
}

// For buttons that act once per press: a press counts the moment a finger lands, as on the life buttons.
function bindTap(button, action) {
  let pointerId;
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || button.disabled) return;
    pointerId = event.pointerId;
    ignoreClicksUntil = performance.now() + 800;
    action();
  });
  // However long the press, the click that follows it is skipped.
  for (const type of ['pointerup', 'pointercancel']) {
    button.addEventListener(type, (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = undefined;
      ignoreClicksUntil = performance.now() + 800;
    });
  }
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  button.addEventListener('click', (event) => {
    if (event.detail === 0 || performance.now() >= ignoreClicksUntil) action();
  });
}

function layoutBoard() {
  const rows = seatLayouts[game.scores.length];
  board.style.gridTemplateAreas = rows.map(row => `"${row}"`).join(' ');
  for (const seat of new Set(rows.join(' ').split(' '))) {
    const [edge, number] = seat.split('-');
    const index = Number(number) - 1;
    const player = board.children[index];
    const turn = (clockwiseEdges.indexOf(edge) + game.rotations[index]) % clockwiseEdges.length;
    player.style.gridArea = seat;
    player.dataset.edge = clockwiseEdges[turn];
  }
  // A rotated seat changes its tile's size, and the board's size follows the smallest tile.
  measureBoard();
}

function paintColours() {
  [...board.children].forEach((player, index) => {
    player.dataset.colour = swatches[game.colors[index]].id;
    player.dataset.row = seatRow(index);
  });
  // Map seats and badge dots in another player's colour.
  for (const node of board.querySelectorAll('[data-player-colour]')) {
    const player = Number(node.dataset.playerColour);
    node.dataset.colour = swatches[game.colors[player]].id;
    node.dataset.row = seatRow(player);
  }
}

function inColourOf(node, player) {
  node.dataset.playerColour = player;
  node.dataset.colour = swatches[game.colors[player]].id;
  node.dataset.row = seatRow(player);
  return node;
}

// The board's seats as rows and columns of the landscape grid, with the cells each seat spans.
function seatGrid() {
  const rows = seatLayouts[game.scores.length].map(row => row.split(' ').map(seat => Number(seat.split('-')[1]) - 1));
  const areas = new Map();
  rows.forEach((row, y) => row.forEach((player, x) => {
    const area = areas.get(player) ?? { top: y, bottom: y, left: x, right: x };
    areas.set(player, {
      top: Math.min(area.top, y), bottom: Math.max(area.bottom, y), left: Math.min(area.left, x), right: Math.max(area.right, x),
    });
  }));
  return { rows: rows.length, columns: rows[0].length, areas };
}

// Where a board cell lands in a tile's own frame, which is turned clockwise by angle. Drawing the map there
// makes it match the table from every seat.
function toFace(angle, rows, columns, row, column) {
  if (angle === 90) return [columns - 1 - column, row];
  if (angle === 180) return [rows - 1 - row, columns - 1 - column];
  if (angle === 270) return [column, rows - 1 - row];
  return [row, column];
}

// A map seat: a tap adds one. Holding takes one away once the hold registers, then repeats on the same timing
// as the life buttons. Whether a press is a tap is only known when it ends, so a tap counts then, however
// the press ends, and a hold never adds.
function bindSeat(button, add, remove) {
  let press;
  // As in bindCounter: a press that ended when the finger left the tile still owns the click after its pointerup.
  let pressPointer;

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    pressPointer = event.pointerId;
    press?.finish();
    const current = {
      pointerId: event.pointerId,
      held: false,
      end() {
        clearTimeout(current.timer);
        activePresses.delete(current);
        if (press !== current) return;
        press = undefined;
        delete button.dataset.pressed;
      },
      finish() {
        const tap = press === current && !current.held;
        current.end();
        if (tap) add();
      },
    };
    function repeat() {
      current.held = true;
      remove();
      current.timer = setTimeout(repeat, 100);
    }
    press = current;
    activePresses.add(current);
    button.dataset.pressed = '';
    ignoreClicksUntil = performance.now() + 800;
    current.timer = setTimeout(repeat, 500);
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone. The next touch ends this press.
    }
  });
  // A hold stops when the finger leaves the player's tile. Cells are bound before they join their tile, so the tile
  // is looked up here.
  button.addEventListener('pointermove', (event) => {
    if (event.pointerId !== press?.pointerId) return;
    const bounds = (button.closest('.player') ?? button).getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) {
      press.finish();
    }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, (event) => {
      if (event.pointerId === pressPointer) ignoreClicksUntil = performance.now() + 800;
      if (event.pointerId !== press?.pointerId) return;
      press.finish();
    });
  }
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  button.addEventListener('click', (event) => {
    if (event.detail === 0 || performance.now() >= ignoreClicksUntil) add();
  });
}

// The turn chip and the pill's round button: a tap steps forward when the finger lifts, and a hold steps back once
// when it registers. A hold never repeats, so a long press can't rewind several turns.
function bindStep(button, forward, back) {
  let press;
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    press?.end();
    const current = {
      pointerId: event.pointerId,
      held: false,
      end() {
        clearTimeout(current.timer);
        activePresses.delete(current);
        if (press !== current) return;
        press = undefined;
        delete button.dataset.pressed;
      },
      finish() {
        const tap = press === current && !current.held && button.isConnected;
        current.end();
        if (tap) forward();
      },
    };
    press = current;
    activePresses.add(current);
    button.dataset.pressed = '';
    ignoreClicksUntil = performance.now() + 800;
    current.timer = setTimeout(() => {
      // A turn chip is rebuilt when someone else steps the turn, and then its pointerup never arrives. Its press
      // is over: stepping back now would undo their step.
      if (!button.isConnected) {
        current.end();
        return;
      }
      current.held = true;
      delete button.dataset.pressed;
      back();
    }, holdDelay);
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone. The next touch ends this press.
    }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, (event) => {
      if (event.pointerId !== press?.pointerId) return;
      ignoreClicksUntil = performance.now() + 800;
      // A cancelled touch is no tap.
      if (type === 'pointerup') press.finish();
      else press.end();
    });
  }
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  button.addEventListener('click', (event) => {
    if (event.detail === 0 || performance.now() >= ignoreClicksUntil) forward();
  });
}

// Commander damage mode: a map of the table on every tile, in board coordinates. Each opponent's seat shows
// the damage their commander has dealt this player; the player's own seat shows their life and its change.
function buildSeatMap(index) {
  const { rows, columns, areas } = seatGrid();
  const angle = faceAngles[board.children[index].dataset.edge];
  const sideways = angle % 180 !== 0;
  const map = element('div', 'seat-map');
  map.style.setProperty('--rows', sideways ? columns : rows);
  map.style.setProperty('--columns', sideways ? rows : columns);
  for (const [player, area] of [...areas].sort(([a], [b]) => a - b)) {
    const [top, left] = toFace(angle, rows, columns, area.top, area.left);
    const [bottom, right] = toFace(angle, rows, columns, area.bottom, area.right);
    let cell;
    if (player === index) {
      cell = element('div', 'map-cell self', element('strong'), element('span', 'life-change'), visuallyHidden(''));
    } else {
      cell = inColourOf(element('button', 'map-cell'), player);
      cell.type = 'button';
      cell.dataset.attacker = player;
      const remove = element('button', 'visually-hidden map-remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove one commander damage from Player ${player + 1}'s commander`);
      remove.addEventListener('click', () => stepDamage(index, player, -1));
      bindSeat(cell, () => stepDamage(index, player, 1), () => stepDamage(index, player, -1));
      map.append(cell, remove);
    }
    cell.style.gridRow = `${Math.min(top, bottom) + 1} / ${Math.max(top, bottom) + 2}`;
    cell.style.gridColumn = `${Math.min(left, right) + 1} / ${Math.max(left, right) + 2}`;
    if (player === index) map.append(cell);
  }
  return map;
}

function syncSeatMap(index) {
  const map = board.children[index]?.querySelector('.seat-map');
  if (!map) return;
  for (const cell of map.querySelectorAll('.map-cell[data-attacker]')) {
    const attacker = Number(cell.dataset.attacker);
    const damage = game.commanderDamage[index][attacker];
    cell.textContent = damage;
    cell.toggleAttribute('data-zero', damage === 0);
    cell.toggleAttribute('data-changed', Boolean(edits?.some(edit => edit.kind === 'damage' && edit.index === index && edit.attacker === attacker)));
    cell.setAttribute('aria-label', `Player ${attacker + 1}'s commander, ${damage} damage. Add one`);
  }
  const self = map.querySelector('.self');
  const life = game.scores[index];
  const change = life - (editStartScores[index] ?? life);
  self.querySelector('strong').textContent = String(life).replace('-', '−');
  self.querySelector('strong').toggleAttribute('data-out', isOut(index));
  const changeText = self.querySelector('.life-change');
  changeText.textContent = change < 0 ? `−${-change}` : change > 0 ? `+${change}` : 'you';
  changeText.toggleAttribute('data-loss', change < 0);
  self.querySelector('.visually-hidden').textContent = `Your life, ${life}`;
}

// A grid of the twelve swatches for one player, in that player's row lightness.
function buildSwatches(index, choose) {
  const group = document.createElement('div');
  group.className = 'swatches';
  group.dataset.player = index;
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', `Tile colour for Player ${index + 1}`);
  swatches.forEach((swatch, colour) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.value = colour;
    button.dataset.colour = swatch.id;
    button.dataset.row = seatRow(index);
    bindTap(button, () => choose(colour));
    group.append(button);
  });
  syncSwatches(group);
  return group;
}

// Marks each swatch as chosen, free, or taken by another player. Taken swatches can't be chosen.
function syncSwatches(group) {
  const index = Number(group.dataset.player);
  for (const button of group.children) {
    const colour = Number(button.value);
    const owner = game.colors.indexOf(colour);
    const taken = owner !== -1 && owner !== index;
    button.disabled = taken;
    button.setAttribute('aria-pressed', String(owner === index));
    const name = tileSets[game.tileColours].names[colour];
    button.setAttribute('aria-label', taken ? `${name}, taken by Player ${owner + 1}` : name);
    // A free swatch shows the seat colour as a dot. A taken one shows its owner, such as "P2", in its place.
    const tag = taken ? `P${owner + 1}` : '';
    if (button.textContent !== tag) {
      button.replaceChildren(...(taken ? [element('span', 'owner', tag)] : []));
      button.firstChild?.setAttribute('aria-hidden', 'true');
    }
  }
}

function syncAllSwatches() {
  for (const group of document.querySelectorAll('.swatches')) syncSwatches(group);
}

// Colours mode saves each choice at once.
function chooseColour(index, colour) {
  if (game.colors.includes(colour)) return;
  game.colors[index] = colour;
  paintColours();
  syncAllSwatches();
  haptic();
  saveGame();
}

// Identity mode saves each change at once, like Colours.
function toggleIdentity(index, id) {
  const identity = game.identities[index];
  game.identities[index] = identity.includes(id) ? identity.replace(id, '') : normalizeIdentity(identity + id);
  syncIdentity();
  renderBadges(index);
  haptic();
  saveGame();
}

// Five toggles for one player's colour identity: the mana symbols in W U B R G order. Any combination can be on. An off
// toggle's symbol is muted, and an on one has a check.
function buildIdentity(index) {
  const group = element('div', 'identity');
  group.dataset.player = index;
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', `Colour identity for Player ${index + 1}`);
  for (const colour of identityColours) {
    const pip = element('span', 'pip');
    pip.dataset.pip = colour.id;
    const check = element('span', 'toggle-check', icon('check'));
    check.setAttribute('aria-hidden', 'true');
    const toggle = element('button', 'identity-toggle', pip, check);
    toggle.type = 'button';
    toggle.value = colour.id;
    toggle.setAttribute('aria-label', colour.name[0].toUpperCase() + colour.name.slice(1));
    bindTap(toggle, () => toggleIdentity(index, colour.id));
    group.append(toggle);
  }
  return group;
}

// The colour indicator printed on cards: one disc split into the identity's colours.
function colourIndicator(identity) {
  const indicator = element('span', 'ci');
  indicator.dataset.ci = identity;
  indicator.dataset.count = identity.length;
  indicator.setAttribute('aria-hidden', 'true');
  return indicator;
}

// The identity's symbol. styles.css picks the glyph from data-symbol. Four colours are the colour pie drawn from
// the five mana symbols, with the missing colour as a ghost.
function identitySymbol(identity) {
  const symbol = element('span', 'id-symbol');
  symbol.dataset.symbol = identity;
  symbol.setAttribute('aria-hidden', 'true');
  if (identity.length === 4) {
    symbol.classList.add('pie');
    for (const { id } of identityColours) {
      const part = element('span');
      part.dataset.at = id;
      if (!identity.includes(id)) part.dataset.ghost = '';
      symbol.append(part);
    }
  }
  return symbol;
}

// An identity chip: any of the indicator, the symbol and the name, in that order. With only the indicator or only
// the symbol it's round; with the name it's a capsule. No identity, or nothing to show, is no chip.
function identityChip(identity, show) {
  if (!identity) return null;
  const parts = [];
  if (show.indicator) parts.push(colourIndicator(identity));
  if (show.symbol) parts.push(identitySymbol(identity));
  if (show.name) {
    const name = element('span', 'id-name', identityNames[identity]);
    name.setAttribute('aria-hidden', 'true');
    parts.push(name);
  }
  if (!parts.length) return null;
  return element('span', 'chip ci-chip', ...parts, visuallyHidden(identityText(identity)));
}

// Identity mode: each tile previews everything its identity can show, whatever the tiles are set to display.
function buildIdentityPreview(index) {
  const preview = element('div', 'identity-preview');
  preview.dataset.player = index;
  return preview;
}

// Shows every player's identity on their toggles and preview.
function syncIdentity() {
  for (const group of board.querySelectorAll('.identity[data-player]')) {
    const identity = game.identities[Number(group.dataset.player)];
    for (const toggle of group.querySelectorAll('.identity-toggle')) {
      toggle.setAttribute('aria-pressed', String(identity.includes(toggle.value)));
    }
  }
  for (const preview of board.querySelectorAll('.identity-preview')) {
    const identity = game.identities[Number(preview.dataset.player)];
    preview.replaceChildren(identityChip(identity, { indicator: true, symbol: true, name: true }) ?? element('span', 'chip', 'No identity'));
  }
}

// The background behind a tile's total (design/polish/SPEC.md §2.3). Symbol puts a set identity's symbol there,
// faintly, like a card's watermark, and other tiles keep the rings. Default is the rings on every tile, and Off is
// a plain tile. data-background is set whenever the rings are gone.
function renderWatermark(index) {
  const player = board.children[index];
  const identity = game.identities[index];
  const { background } = game.identity;
  const shown = background === 'off' || (background === 'symbol' && identity) ? background : null;
  if (shown) player.dataset.background = shown;
  else delete player.dataset.background;
  player.querySelector('.watermark').replaceChildren(...(shown === 'symbol' ? [identitySymbol(identity)] : []));
}

// Applies an edit forwards (1) or takes it back (-1).
function applyEdit(edit, direction) {
  if (countKinds.includes(edit.kind)) game[edit.kind][edit.index] += edit.delta * direction;
  else if (edit.kind === 'mana') game.pools[edit.index][edit.colour] += edit.delta * direction;
  else if (edit.kind === 'damage') {
    // Commander damage is damage, so the defender loses the same life in the same save.
    game.commanderDamage[edit.index][edit.attacker] += edit.delta * direction;
    game.scores[edit.index] -= edit.delta * direction;
  }
}

// Shows an edit everywhere it appears, and saves it, so nothing is lost if the app is closed mid-mode.
function showEdit(edit) {
  const { index } = edit;
  if (edit.kind === 'casts') {
    announce(index, 'casts', () => `Player ${index + 1}, commander tax ${game.casts[index] * 2}`);
  } else if (countKinds.includes(edit.kind)) {
    announce(index, edit.kind, () => `Player ${index + 1}, ${game[edit.kind][index]} ${edit.kind}`);
  } else if (edit.kind === 'damage') {
    const { attacker } = edit;
    announce(index, `damage ${attacker}`, () =>
      `Player ${attacker + 1}'s commander, ${game.commanderDamage[index][attacker]} damage to Player ${index + 1}`);
    announceLife(index);
    syncSeatMap(index);
  } else if (edit.kind === 'mana') {
    announcePool(index);
  }
  syncCounterCells(index);
  syncManaCells(index);
  renderScore(index);
  renderBadges(index);
  syncPill();
  haptic();
  saveGame();
}

function commitEdit(edit) {
  applyEdit(edit, 1);
  edits.push(edit);
  showEdit(edit);
}

function undoEdit() {
  const edit = edits?.pop();
  if (!edit) return;
  applyEdit(edit, -1);
  showEdit(edit);
}

function stepDamage(defender, attacker, delta) {
  const next = game.commanderDamage[defender][attacker] + delta;
  if (next >= 0 && next <= maxCount) commitEdit({ kind: 'damage', index: defender, attacker, delta });
}

function stepCount(kind, index, delta) {
  const next = game[kind][index] + delta;
  if (next >= 0 && next <= maxCount) commitEdit({ kind, index, delta });
}

// Each counter's icon: Mana's infect, energy and rad symbols, Phosphor's crown for tax and its graduation cap for
// experience.
function counterIcon(kind) {
  if (kind === 'casts') return icon('crown');
  if (kind === 'experience') return icon('graduation-cap');
  return manaIcon(kind === 'poison' ? 'infect' : kind);
}

// The counters that are on, in order.
function shownCounters() {
  return counterKinds.filter(counter => game.counters[counter.tracker]);
}

// A counter cell: a circle with the counter's icon over its count. A tap adds one, and holding takes one away
// with repeats, as on the commander damage map. A visually hidden button beside it takes one away for keyboards
// and screen readers.
function buildCounterCell({ kind, phrase }, index) {
  const name = `Player ${index + 1}`;
  const cell = element('button', 'counter-cell', counterIcon(kind), element('b'));
  cell.type = 'button';
  cell.dataset.kind = kind;
  const remove = element('button', 'visually-hidden counter-remove');
  remove.type = 'button';
  remove.setAttribute('aria-label', `Remove one ${phrase} from ${name}`);
  remove.addEventListener('click', () => stepCount(kind, index, -1));
  bindSeat(cell, () => stepCount(kind, index, 1), () => stepCount(kind, index, -1));
  return [cell, remove];
}

function syncCounterCells(index) {
  const layer = board.children[index]?.querySelector('.counter-cells');
  if (!layer) return;
  for (const cell of layer.querySelectorAll('.counter-cell[data-kind]')) {
    const name = `Player ${index + 1}`;
    const { kind } = cell.dataset;
    const value = game[kind][index];
    cell.querySelector('b').textContent = kind === 'casts' ? `+${value * 2}` : value;
    cell.toggleAttribute('data-zero', value === 0);
    cell.setAttribute('aria-label', kind === 'casts'
      ? `${name} commander tax, ${value * 2}, ${value} ${value === 1 ? 'cast' : 'casts'}. Add one cast`
      : `${name} ${kind}, ${value}. Add one`);
  }
}

// Each tile's layer for the open mode, facing its player.
function renderModeLayer(player, index) {
  const layer = player.querySelector('.mode-layer');
  layer.replaceChildren();
  if (boardMode === 'colours') {
    const hint = element('p', 'layer-hint', 'Your tile colour');
    hint.setAttribute('aria-hidden', 'true');
    layer.append(hint, element('div', 'colour-picker', buildSwatches(index, colour => chooseColour(index, colour))));
  } else if (boardMode === 'identity') {
    const hint = element('p', 'layer-hint', 'Tap your colours');
    hint.setAttribute('aria-hidden', 'true');
    layer.append(hint, buildIdentityPreview(index), buildIdentity(index));
  } else if (boardMode === 'damage') {
    const hint = element('p', 'layer-hint', 'Tap +1 · hold −1');
    hint.setAttribute('aria-hidden', 'true');
    layer.append(hint, buildSeatMap(index));
  } else if (boardMode === 'counters') {
    // One circle per counter that's on, three to a row, in the order poison, tax, energy, experience, rad.
    const hint = element('p', 'layer-hint', 'Tap +1 · hold −1');
    hint.setAttribute('aria-hidden', 'true');
    const cells = element('div', 'counter-cells');
    for (const counter of shownCounters()) cells.append(...buildCounterCell(counter, index));
    layer.append(hint, cells);
  } else if (boardMode === 'mana') {
    // Six circles, W U B R G over colourless, three to a row.
    const hint = element('p', 'layer-hint', 'Tap +1 · hold −1');
    hint.setAttribute('aria-hidden', 'true');
    const cells = element('div', 'counter-cells mana-cells');
    manaColours.forEach((colour, at) => cells.append(...buildManaCell(colour, at, index)));
    layer.append(hint, cells);
  } else if (boardMode === 'first') {
    layer.append(buildFirstPicker(index));
  }
  layer.hidden = layer.childElementCount === 0;
  syncIdentity();
  syncCounterCells(index);
  syncManaCells(index);
  syncSeatMap(index);
}

// Close to losing: a warning from 15 commander damage or 7 poison, and out at 21 or 10.
function dangerLevel(value, warning, lethal) {
  return value >= lethal ? 'out' : value >= warning ? 'warn' : '';
}

function isOut(index) {
  return outReason(index) !== null;
}

// Why a player is out: 'life' at 0 or below, then 'poison' at 10, then 'commander' at 21 commander damage, or null.
function outReason(index) {
  if (game.scores[index] <= 0) return 'life';
  if (game.counters.poison && game.poison[index] >= poisonLethal) return 'poison';
  if (game.counters.commander && game.commanderDamage[index].some(damage => damage >= commanderLethal)) return 'commander';
  return null;
}
const outLabels = { life: 'out', poison: 'out on poison', commander: 'out on commander damage' };

// A random whole number below count, from the same crypto RNG as the dice, without modulo bias.
function randomBelow(count) {
  const limit = Math.floor(0x100000000 / count) * count;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= limit);
  return value[0] % count;
}

function playOrder() {
  return playOrders[game.scores.length];
}

function hasMana(index) {
  return game.pools[index].some(amount => amount > 0);
}

// Empties every pool when the turn passes, if that's switched on, and returns what it emptied so a step back can put
// it back. The turn passing also ends any "Undo clear": the pool would have emptied anyway.
function autoEmptyPools() {
  if (!game.manaPool || !game.autoEmpty) return null;
  endUndoClears();
  if (!game.pools.some((_, index) => hasMana(index))) return null;
  const emptied = game.pools.map(pool => [...pool]);
  game.pools = fitPools([], game.scores.length);
  return emptied;
}

// Shows a turn step on every tile and the pill, saves it at once and announces it.
function showTurn() {
  const turnFocus = document.activeElement?.matches('.turn-chip');
  saveGame();
  haptic();
  game.scores.forEach((_, index) => renderBadges(index));
  syncPill();
  // A turn chip passed from the keyboard is gone, so focus moves to the chip that now has the turn.
  if (turnFocus && !document.activeElement?.matches('.turn-chip')) board.querySelector('.active-chip, .turn-chip')?.focus();
  const { active, round } = game.turn;
  announce(-1, 'turn', () => (game.turns === 'turns' && active !== null ? `Player ${active + 1}'s turn, round ${round}` : `Round ${round}`));
}

function recordStep(before, emptied) {
  turnSteps.push({ turn: before, emptied });
  if (turnSteps.length > 200) turnSteps.shift();
}

// The next step forward. Rounds: the next round. Turn by turn: the next player in play order who isn't out, and the
// round goes up when play passes the first player's seat. With nobody's turn yet, the pill asks who goes first.
function stepTurn() {
  if (game.turns === 'off') return;
  const before = { ...game.turn };
  if (game.turns === 'rounds') {
    game.turn.round = Math.min(maxRound, game.turn.round + 1);
  } else {
    const { active, first } = game.turn;
    if (active === null) {
      askFirst = true;
      maybeAskFirst();
      return;
    }
    const order = playOrder();
    const position = order.indexOf(active);
    let next = active;
    let crossed = false;
    for (let step = 1; step <= order.length; step++) {
      const player = order[(position + step) % order.length];
      if (player === first) crossed = true;
      if (!isOut(player) || step === order.length) {
        next = player;
        break;
      }
    }
    game.turn.active = next;
    if (crossed) game.turn.round = Math.min(maxRound, game.turn.round + 1);
  }
  recordStep(before, autoEmptyPools());
  showTurn();
}

// Turn by turn with nobody's turn yet: a tile's turn chip starts that player's turn, and they go first if nobody has.
function startTurn(index) {
  const before = { ...game.turn };
  game.turn.active = index;
  game.turn.first ??= index;
  recordStep(before, null);
  showTurn();
}

// One step back: the last step taken, with any pools it emptied, or after a relaunch the previous player in play
// order (or the previous round). The round never goes below 1.
function stepBack() {
  if (game.turns === 'off') return;
  const step = turnSteps.pop();
  if (step) {
    game.turn = step.turn;
    step.emptied?.forEach((pool, index) => pool.forEach((amount, colour) => {
      game.pools[index][colour] = Math.min(maxCount, game.pools[index][colour] + amount);
    }));
  } else if (game.turns === 'rounds') {
    if (game.turn.round === 1) return;
    game.turn.round -= 1;
  } else {
    const { active, first } = game.turn;
    if (active === null) return;
    const order = playOrder();
    const position = order.indexOf(active);
    let previous = active;
    let crossed = false;
    for (let step = 1; step <= order.length; step++) {
      if (order[(position - step + 1 + order.length) % order.length] === first) crossed = true;
      const player = order[(position - step + order.length) % order.length];
      if (!isOut(player) || step === order.length) {
        previous = player;
        break;
      }
    }
    if (crossed && game.turn.round === 1) return;
    game.turn.active = previous;
    if (crossed) game.turn.round -= 1;
  }
  showTurn();
}

// "Who goes first?" opens once nothing else is open: after a new game while Turns is on, and when Turns goes from Off
// to on in a game with no first player.
function maybeAskFirst() {
  if (!askFirst || game.turns === 'off' || boardMode !== null || document.querySelector('dialog[open]')) return;
  askFirst = false;
  setBoardMode('first');
}

// The chosen player goes first and, turn by turn, takes the first turn. Their tile shows "Goes first" for a beat.
function chooseFirst(index) {
  if (boardMode !== 'first' || board.hasAttribute('data-picked')) return;
  clearTimeout(shuffleTimer);
  game.turn.first = index;
  game.turn.active = index;
  turnSteps = [];
  saveGame();
  haptic();
  board.dataset.picked = '';
  [...board.children].forEach((player, seat) => player.toggleAttribute('data-lit', seat === index));
  const go = board.children[index].querySelector('.first-go');
  go.replaceChildren(icon('flag'), 'Goes first');
  go.nextElementSibling.textContent = game.turns === 'rounds' ? 'Tap the flag to start each round' : 'Tap Turn when your turn ends';
  announcer.textContent = `Player ${index + 1} goes first`;
  shuffleTimer = setTimeout(() => setBoardMode(null), reducedMotion.matches ? 0 : firstBeat);
}

// The centre shuffle picks a random player who isn't out, lighting tiles around the table before landing on them.
function shuffleFirst() {
  if (boardMode !== 'first' || board.hasAttribute('data-shuffling') || board.hasAttribute('data-picked')) return;
  const order = playOrder();
  const live = order.filter(player => !isOut(player));
  const candidates = live.length ? live : order;
  const pick = candidates[randomBelow(candidates.length)];
  if (reducedMotion.matches) {
    chooseFirst(pick);
    return;
  }
  board.dataset.shuffling = '';
  // A run around the table in play order that ends on the pick.
  const end = order.indexOf(pick) + order.length * shuffleTicks;
  const lights = Array.from({ length: shuffleTicks }, (_, step) => order[(end - shuffleTicks + 1 + step) % order.length]);
  const tick = () => {
    const player = lights.shift();
    if (!lights.length) {
      delete board.dataset.shuffling;
      chooseFirst(player);
      return;
    }
    [...board.children].forEach((tile, seat) => tile.toggleAttribute('data-lit', seat === player));
    shuffleTimer = setTimeout(tick, shuffleTick);
  };
  tick();
}

// "Who goes first?" on one tile: Me first, facing its player.
function buildFirstPicker(index) {
  const go = element('button', 'first-go', icon('hand-tap'), 'Me first');
  go.type = 'button';
  go.setAttribute('aria-label', `Player ${index + 1} goes first`);
  bindTap(go, () => chooseFirst(index));
  const hint = element('p', 'layer-hint', 'or the centre button picks at random');
  hint.setAttribute('aria-hidden', 'true');
  return element('div', 'first-picker', go, hint);
}

// The turn chips that lead a tile's near row. Rounds: the first player's flag carries the round and steps it. Turn by
// turn: the active player's chip says "Turn" and the round and passes the turn, and the first player keeps a small
// flag; with nobody's turn yet, every player who isn't out has a "Start" chip to start theirs.
function turnChips(index) {
  const { turns } = game;
  const { first, active, round } = game.turn;
  const chips = [];
  if (turns === 'rounds' && first === index) {
    const chip = element('button', 'chip turn-chip round-chip', icon('flag'), String(round));
    chip.setAttribute('aria-label', `Round ${round}. Next round`);
    bindStep(chip, stepTurn, stepBack);
    chips.push(chip);
  } else if (turns === 'turns') {
    if (active === index || (active === null && !isOut(index))) {
      // When the word "Turn" gives way, the round keeps a "T" so the untap symbol doesn't read as a letter.
      const chip = active === index
        ? element('button', 'chip turn-chip active-chip', manaIcon('untap'), element('span', 'turn-word', 'Turn'), element('span', 'turn-round', String(round)))
        : element('button', 'chip turn-chip start-chip', manaIcon('untap'), 'Start');
      chip.setAttribute('aria-label', active === index ? `Player ${index + 1}'s turn, round ${round}. Pass the turn`
        : `Start Player ${index + 1}'s turn`);
      if (active === index) bindStep(chip, stepTurn, stepBack);
      else bindTap(chip, () => startTurn(index));
      chips.push(chip);
    }
    if (first === index) {
      const flag = element('span', 'chip flag-chip', icon('flag'), visuallyHidden('Went first'));
      chips.push(flag);
    }
  }
  for (const chip of chips) {
    if (chip.tagName === 'BUTTON') chip.type = 'button';
    else chip.setAttribute('role', 'listitem');
  }
  return chips;
}

// Mana mode's edit: one colour in one player's pool, one up or down.
function stepMana(index, colour, delta) {
  const next = game.pools[index][colour] + delta;
  if (next >= 0 && next <= maxCount) commitEdit({ kind: 'mana', index, colour, delta });
}

function poolText(index) {
  const held = manaColours.map((colour, at) => ({ colour, amount: game.pools[index][at] })).filter(({ amount }) => amount > 0);
  return held.length ? held.map(({ colour, amount }) => `${amount} ${colour.name}`).join(', ') : 'empty';
}

function announcePool(index) {
  announce(index, 'mana', () => `Player ${index + 1}, mana pool ${poolText(index)}`);
}

// A mana cell: a circle with the colour's mana symbol over its amount, like a counter cell.
function buildManaCell(colour, at, index) {
  const pip = element('span', 'pip');
  pip.dataset.pip = colour.id;
  pip.setAttribute('aria-hidden', 'true');
  const cell = element('button', 'counter-cell mana-cell', pip, element('b'));
  cell.type = 'button';
  cell.dataset.colour = colour.id;
  const remove = element('button', 'visually-hidden counter-remove');
  remove.type = 'button';
  remove.setAttribute('aria-label', `Remove one ${colour.name} mana from Player ${index + 1}`);
  remove.addEventListener('click', () => stepMana(index, at, -1));
  bindSeat(cell, () => stepMana(index, at, 1), () => stepMana(index, at, -1));
  return [cell, remove];
}

function syncManaCells(index) {
  const layer = board.children[index]?.querySelector('.mana-cells');
  if (!layer) return;
  for (const cell of layer.querySelectorAll('.mana-cell')) {
    const at = manaColours.findIndex(colour => colour.id === cell.dataset.colour);
    const amount = game.pools[index][at];
    cell.querySelector('b').textContent = amount;
    cell.toggleAttribute('data-zero', amount === 0);
    cell.setAttribute('aria-label', `Player ${index + 1} ${manaColours[at].name} mana, ${amount}. Add one`);
  }
}

// Spending from the strip saves at once and has no undo: add it back in mana mode.
function spendMana(index, colour) {
  if (game.pools[index][colour] === 0) return;
  game.pools[index][colour] -= 1;
  saveGame();
  haptic();
  renderBadges(index);
  syncPill();
  announcePool(index);
}

// The eraser empties the pool and leaves "Undo clear" in the strip's place for 5 seconds.
function clearPool(index) {
  if (!hasMana(index)) return;
  endUndoClear(index);
  const pool = game.pools[index];
  game.pools[index] = fitCounts([], manaColours.length);
  clearedPools.set(index, { pool, timer: setTimeout(() => endUndoClear(index), undoClearTime) });
  saveGame();
  haptic();
  renderBadges(index);
  syncPill();
  announce(index, 'mana', () => `Player ${index + 1}, mana pool cleared`);
}

function undoClear(index) {
  const cleared = clearedPools.get(index);
  if (!cleared) return;
  clearTimeout(cleared.timer);
  clearedPools.delete(index);
  cleared.pool.forEach((amount, colour) => {
    game.pools[index][colour] = Math.min(maxCount, game.pools[index][colour] + amount);
  });
  saveGame();
  haptic();
  renderBadges(index);
  syncPill();
  announcePool(index);
}

function endUndoClear(index) {
  const cleared = clearedPools.get(index);
  if (!cleared) return;
  clearTimeout(cleared.timer);
  clearedPools.delete(index);
  renderBadges(index);
}

function endUndoClears() {
  for (const index of [...clearedPools.keys()]) endUndoClear(index);
}

// A tile's mana strip at rest: each colour its pool holds, with its amount (tap to spend one), then the eraser. Or
// "Undo clear" for 5 seconds after the eraser.
function stripItems(index) {
  if (clearedPools.has(index)) {
    const undo = element('button', 'strip-undo', icon('undo'), 'Undo clear');
    undo.type = 'button';
    undo.setAttribute('aria-label', `Undo clearing Player ${index + 1}'s mana pool`);
    bindTap(undo, () => undoClear(index));
    return [undo, stripChip(index)];
  }
  const items = manaColours.flatMap((colour, at) => {
    const amount = game.pools[index][at];
    if (!amount) return [];
    const pip = element('span', 'pip');
    pip.dataset.pip = colour.id;
    pip.setAttribute('aria-hidden', 'true');
    const spend = element('button', 'strip-spend', pip, String(amount));
    spend.type = 'button';
    spend.dataset.colour = colour.id;
    spend.setAttribute('aria-label', `Player ${index + 1}, ${amount} ${colour.name} mana. Spend one`);
    bindTap(spend, () => spendMana(index, at));
    return [spend];
  });
  const eraser = element('button', 'strip-clear', icon('eraser'));
  eraser.type = 'button';
  eraser.setAttribute('aria-label', `Clear Player ${index + 1}'s mana pool`);
  bindTap(eraser, () => clearPool(index));
  return [...items, eraser, stripChip(index)];
}

// The strip folded into one chip, where the strip can't fit: the pool's colours and amounts with a caret, which opens
// mana mode. Or, for 5 seconds after the eraser, "Undo".
function stripChip(index) {
  let chip;
  if (clearedPools.has(index)) {
    chip = element('button', 'chip strip-chip', icon('undo'), 'Undo');
    chip.setAttribute('aria-label', `Undo clearing Player ${index + 1}'s mana pool`);
    bindTap(chip, () => undoClear(index));
  } else {
    // One colour and its amount, or several colours' symbols stacked before the pool's total, so the chip stays short.
    const held = manaColours.map((colour, at) => ({ colour, amount: game.pools[index][at] })).filter(({ amount }) => amount > 0);
    const pip = (colour) => {
      const symbol = element('span', 'pip');
      symbol.dataset.pip = colour.id;
      return symbol;
    };
    const parts = held.length > 1
      ? [element('span', 'summary-item', ...held.map(({ colour }) => pip(colour)), String(held.reduce((sum, { amount }) => sum + amount, 0)))]
      : held.map(({ colour, amount }) => element('span', 'summary-item', pip(colour), String(amount)));
    chip = element('button', 'chip strip-chip', ...parts, icon('caret-right'));
    chip.setAttribute('aria-label', `Player ${index + 1}, mana pool ${poolText(index)}. Open mana`);
    bindTap(chip, () => setBoardMode('mana'));
  }
  chip.type = 'button';
  return chip;
}

// The badge rows, each only when it has something to show. The far edge, toward the table, holds commander
// damage: a sword, like the pill's, then one chip per opponent in their own tile colour, largest first. The near
// edge holds the colour identity chip, then poison, tax, energy, experience and rad, each only when it's set and its
// switch is on.
function renderBadges(index) {
  const player = board.children[index];
  if (!player) return;
  renderWatermark(index);
  const far = player.querySelector('.badges.far');
  const damage = game.counters.commander ? game.commanderDamage[index]
    .map((amount, attacker) => ({ amount, attacker })).filter(({ amount }) => amount > 0)
    .sort((a, b) => b.amount - a.amount || a.attacker - b.attacker) : [];
  // The sword only labels the row: each chip already says whose commander it counts.
  const sword = element('span', 'chip sword', icon('sword'));
  sword.setAttribute('aria-hidden', 'true');
  far.replaceChildren(...(damage.length ? [sword] : []), ...damage.map(({ amount, attacker }) => {
    const chip = inColourOf(element('span', 'chip damage', String(amount),
      visuallyHidden(` commander damage from Player ${attacker + 1}`)), attacker);
    chip.setAttribute('role', 'listitem');
    const level = dangerLevel(amount, commanderWarning, commanderLethal);
    if (level) chip.dataset.level = level;
    return chip;
  }));
  far.hidden = damage.length === 0;
  const near = player.querySelector('.badges.near');
  player.toggleAttribute('data-active', game.turns === 'turns' && game.turn.active === index);
  // While a pool has mana, or for 5 seconds after the eraser, its strip shows over the near row, which stays.
  const strip = player.querySelector('.mana-strip');
  const hadFocus = strip.contains(document.activeElement) ? document.activeElement.dataset.colour ?? '' : null;
  const floating = game.manaPool && (hasMana(index) || clearedPools.has(index));
  strip.replaceChildren(...(floating ? stripItems(index) : []));
  strip.hidden = !floating;
  if (floating) {
    // Keep keyboard focus in the strip as items come and go.
    if (hadFocus !== null) (strip.querySelector(`[data-colour="${hadFocus}"]`) ?? strip.querySelector('.strip-spend, .strip-clear, .strip-undo'))?.focus();
  } else {
    delete player.dataset.strip;
    if (hadFocus !== null) setupButton.focus();
  }
  const chips = [...turnChips(index)];
  const foldedChip = floating ? stripChip(index) : null;
  const identity = identityChip(game.identities[index], game.identity.show);
  if (identity) chips.push(identity);
  for (const { kind } of shownCounters()) {
    const value = game[kind][index];
    if (value === 0) continue;
    const chip = kind === 'casts' ? element('span', 'chip', visuallyHidden('Commander tax '), counterIcon(kind), `+${value * 2}`)
      : element('span', 'chip', counterIcon(kind), String(value), visuallyHidden(` ${kind}`));
    chip.dataset.kind = kind;
    const level = kind === 'poison' ? dangerLevel(value, poisonWarning, poisonLethal) : '';
    if (level) chip.dataset.level = level;
    chips.push(chip);
  }
  // The strip folded onto the near row, shown only when it can go nowhere else.
  if (foldedChip) chips.push(foldedChip);
  for (const chip of chips) if (chip.tagName !== 'BUTTON') chip.setAttribute('role', 'listitem');
  // Keep keyboard focus on a turn chip as the row is rebuilt. When the turn moves to another tile, showTurn follows it.
  const turnFocus = near.contains(document.activeElement) && document.activeElement.matches('.turn-chip');
  near.replaceChildren(...chips);
  if (turnFocus) near.querySelector('.turn-chip')?.focus();
  near.hidden = chips.length === 0;
  requestFit();
}

// The centre pill: commander damage (when Commander is on), counters (when a counter is on), dice and setup
// at rest; Undo, save and ✕ while editing.
function syncPill() {
  const editing = editingModes.includes(boardMode);
  const first = boardMode === 'first';
  roundButton.hidden = boardMode !== null || game.turns === 'off';
  roundBackButton.hidden = roundButton.hidden;
  damageButton.hidden = boardMode !== null || !game.counters.commander;
  countersButton.hidden = boardMode !== null || shownCounters().length === 0;
  manaButton.hidden = boardMode !== null || !game.manaPool;
  diceButton.hidden = boardMode !== null;
  setupButton.hidden = editing || first;
  shuffleButton.hidden = !first;
  for (const button of [undoButton, saveButton]) button.hidden = !editing;
  cancelButton.hidden = !editing && !first;
  cancelButton.setAttribute('aria-label', first ? 'Skip' : 'Cancel');
  undoButton.disabled = !edits?.length;
  // The round, printed twice like a card index so both sides of the table can read it.
  const { round, active } = game.turn;
  for (const number of roundButton.querySelectorAll('.round > span')) number.textContent = round;
  roundButton.setAttribute('aria-label', game.turns === 'rounds' ? `Round ${round}. Next round`
    : active === null ? `Round ${round}. Choose who goes first` : `Round ${round}, Player ${active + 1}'s turn. Pass the turn`);
  roundBackButton.setAttribute('aria-label', game.turns === 'rounds' ? 'Back one round' : 'Back one turn');
  // The tap symbol gets a dot while any pool has mana.
  manaButton.toggleAttribute('data-floating', game.pools.some((_, index) => hasMana(index)));
  // The pill's length decides which face edges it reaches, so the board is measured again when it changes.
  const shape = `${[...boardControls.querySelectorAll('.pill-button')].filter(button => !button.hidden).length} ${restPillButtons()}`;
  if (shape !== pillShape) {
    pillShape = shape;
    measureBoard();
  }
}

// Board-wide modes. Seat rotation, tile colours and identities end with the check mark that replaces the setup button.
// Counters mode ends with save or ✕, and keeps a list of its edits until then.
function setBoardMode(mode) {
  cancelPresses();
  clearTimeout(shuffleTimer);
  for (const flag of ['data-picked', 'data-shuffling']) board.removeAttribute(flag);
  for (const player of board.children) player.removeAttribute('data-lit');
  // Opening mana mode settles any "Undo clear": the cleared pool stays empty.
  if (mode === 'mana') endUndoClears();
  boardMode = mode;
  edits = editingModes.includes(mode) ? [] : null;
  editStartScores = [...game.scores];
  [...board.children].forEach((player, index) => {
    player.querySelector('.controls').inert = mode !== null;
    player.querySelector('.rotate-seat').hidden = mode !== 'rotate';
    renderModeLayer(player, index);
    renderBadges(index);
  });
  for (const node of [board, boardControls]) {
    if (mode) node.dataset.mode = mode;
    else delete node.dataset.mode;
  }
  // The badges were hidden while the mode was open, so they're measured now that they show again.
  requestFit();
  setupButton.setAttribute('aria-label', mode ? doneLabels[mode] ?? 'Settings' : 'Settings');
  setupButton.setAttribute('aria-haspopup', mode ? 'false' : 'dialog');
  setupButton.querySelector('.setup-icon').hidden = mode !== null;
  setupButton.querySelector('.rotation-done').hidden = mode === null;
  syncPill();
  const focusTarget = mode === 'rotate' ? board.querySelector('.rotate-seat')
    : mode === 'colours' ? board.querySelector('.swatch[aria-pressed="true"]')
    : mode ? board.querySelector('.mode-layer button') : setupButton;
  focusTarget?.focus();
  syncBackHandling();
  // A mode opened from settings, such as Rotate seats, was still open when settings' close event looked, so the question
  // waits for the mode to end.
  if (mode === null) maybeAskFirst();
}

// ✕ in an editing mode: with no changes it just closes; otherwise it asks first, and Keep editing is the default.
function cancelEditing() {
  if (!edits.length) {
    setBoardMode(null);
    return;
  }
  document.querySelector('#discard-title').textContent = `Discard ${edits.length} ${edits.length === 1 ? 'change' : 'changes'}?`;
  document.querySelector('#discard-message').textContent = discardMessages[boardMode];
  discardDialog.returnValue = 'keep';
  discardDialog.showModal();
  syncBackHandling();
}

function discardEdits() {
  while (edits.length) applyEdit(edits.pop(), -1);
  game.scores.forEach((_, index) => renderScore(index));
  saveGame();
  setBoardMode(null);
  announcer.textContent = 'Changes discarded';
}

// Leaves the open board mode the way ✕ or the check mark would without saving anything new.
function leaveBoardMode() {
  if (editingModes.includes(boardMode)) cancelEditing();
  else setBoardMode(null);
}

function renderScore(index) {
  const score = board.children[index].querySelector('.score');
  const value = String(game.scores[index]).replace('-', '−');
  score.value = value;
  // A player who is out says so under the total, and their other badges dim.
  const out = outReason(index);
  score.setAttribute('aria-label', `${game.scores[index]} life${out ? `, ${outLabels[out]}` : ''}`);
  syncBoardDigits();
  score.toggleAttribute('data-out', out !== null);
  board.children[index].toggleAttribute('data-out', out !== null);
}

function renderBoard() {
  cancelPresses();
  clearTimeout(announceTimer);
  pendingAnnouncements.clear();
  const players = game.scores.map((_, index) => {
    const player = playerTemplate.content.firstElementChild.cloneNode(true);
    const name = `Player ${index + 1}`;
    player.setAttribute('aria-label', name);
    const score = player.querySelector('.score');

    function changeLife(delta) {
      const next = game.scores[index] + delta;
      if (!Number.isSafeInteger(next)) return;
      const wasOut = isOut(index);
      game.scores[index] = next;
      renderScore(index);
      // A player who is out has no chip to start a turn.
      if (isOut(index) !== wasOut) renderBadges(index);
      if (!reducedMotion.matches) score.animate([{ transform: 'scale(1.08)' }, { transform: 'none' }], 160);
      haptic();
      announceLife(index);
      saveGame();
    }

    bindCounter(player.querySelector('.subtract'), () => changeLife(-1), `Subtract one life from ${name}`);
    bindCounter(player.querySelector('.add'), () => changeLife(1), `Add one life to ${name}`);
    const rotateSeat = player.querySelector('.rotate-seat');
    rotateSeat.setAttribute('aria-label', `Rotate ${name} clockwise`);
    rotateSeat.addEventListener('click', () => {
      game.rotations[index] = (game.rotations[index] + 1) % clockwiseEdges.length;
      layoutBoard();
      saveGame();
    });
    return player;
  });
  board.replaceChildren(...players);
  layoutBoard();
  paintColours();
  game.scores.forEach((_, index) => {
    renderScore(index);
    renderBadges(index);
  });
}

function startGame(playerCount, startingLife) {
  if (playerCount !== game.scores.length) game.rotations = Array(playerCount).fill(0);
  game.colors = fitColors(game.colors, playerCount);
  // A new game resets the counts and keeps the counter switches, colours and colour identities.
  for (const kind of countKinds) game[kind] = fitCounts([], playerCount);
  game.identities = fitIdentities(game.identities, playerCount);
  game.commanderDamage = fitDamage([], playerCount);
  // Pools empty, and the game starts at round 1 with nobody first, until "Who goes first?" picks someone.
  game.pools = fitPools([], playerCount);
  game.turn = fitTurn(null, playerCount);
  turnSteps = [];
  for (const { timer } of clearedPools.values()) clearTimeout(timer);
  clearedPools.clear();
  game.startingLife = startingLife;
  game.scores = Array(playerCount).fill(startingLife);
  // A new game takes the screen's current landscape as upright.
  game.landscapeAngle = currentLandscapeAngle();
  // A new game starts with every badge at full size.
  dropLevels = { near: 0, far: 0, strip: 0 };
  saveGame();
  syncBoardTurn();
  renderBoard();
  syncPill();
  askFirst = game.turns !== 'off';
  maybeAskFirst();
}

// Settings (design/polish/SETTINGS-SPEC.md). Players and starting life wait for Done: a change to either is a pending
// new game (P1), which Done, renamed "Start new game", or a board action starts. ✕, Escape and Android back drop it.
function settingsChangeGame() {
  return selectedPlayerCount !== game.scores.length || selectedLife !== game.startingLife;
}

// Track's own state: the switches, the Turns choice, and the auto-empty switch, which only shows while it applies.
function renderTrackSheet() {
  for (const tracker of trackers) document.querySelector(`#${tracker}-switch`).checked = game.counters[tracker];
  manaSwitch.checked = game.manaPool;
  autoEmptySwitch.checked = game.autoEmpty;
  autoEmptyRow.hidden = !game.manaPool || game.turns === 'off';
  for (const choice of turnChoices.children) choice.setAttribute('aria-pressed', String(choice.dataset.turns === game.turns));
  syncSettingsCue();
}

function renderAllBadges() {
  game.scores.forEach((_, index) => {
    renderScore(index);
    renderBadges(index);
  });
  syncPill();
}

// A notched slider (design/polish/STYLE.md §4): a track from min to max whose labelled stops are buttons, so a tap works
// as well as a drag (WCAG 2.5.7). A tap on the track or a drag snaps to multiples of snap. The arrow keys step by step
// and Page Up and Page Down by page, within lowest and highest, which may reach past the track: a value off the track,
// such as a starting life of 100, pins the thumb to that end and marks it (data-pinned).
function notchedSlider({ root, min, max, snap, step, page, lowest, highest, get, set, describe }) {
  const track = root.querySelector('.k-track');
  const clamp = value => Math.min(highest, Math.max(lowest, value));
  const at = value => `${((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100}%`;
  const change = (value) => {
    if (value !== get()) set(value);
  };
  // The value under a point on the track. Turned to face the other side, the page runs right to left on screen.
  const valueAt = (x) => {
    const box = track.getBoundingClientRect();
    let along = Math.min(1, Math.max(0, (x - box.left) / box.width));
    if (settings.hasAttribute('data-flipped')) along = 1 - along;
    return Math.min(max, Math.max(min, Math.round((min + along * (max - min)) / snap) * snap));
  };
  const stopValue = stop => Number(stop.dataset.value ?? (stop.value || stop.dataset.life));
  for (const stop of root.querySelectorAll('.k-stop')) stop.style.left = at(stopValue(stop));
  const ticks = root.querySelector('.k-ticks');
  for (let value = min; value <= max; value += snap) {
    const tick = element('span', 'k-tick');
    tick.style.left = at(value);
    tick.dataset.value = value;
    if ([...root.querySelectorAll('.k-stop')].some(stop => stopValue(stop) === value)) tick.dataset.stop = '';
    ticks.append(tick);
  }
  // A press only picks a value once it lifts without moving (a tap) or moves sideways (a drag). A vertical swipe is
  // left to the page, which scrolls (touch-action: pan-y), so the slider never traps a scroll. A tap on a stop is
  // left to the stop's own click.
  let pointer;
  let startX = 0;
  let dragging = false;
  let onStop = false;
  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || pointer !== undefined) return;
    pointer = event.pointerId;
    startX = event.clientX;
    dragging = false;
    onStop = event.target.closest('.k-stop') !== null;
  });
  root.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointer) return;
    if (!dragging && Math.abs(event.clientX - startX) < 6) return;
    if (!dragging) {
      dragging = true;
      root.setPointerCapture?.(event.pointerId);
    }
    change(valueAt(event.clientX));
  });
  const end = (event, lifted) => {
    if (event.pointerId !== pointer) return;
    if (lifted && !dragging && !onStop) change(valueAt(event.clientX));
    pointer = undefined;
  };
  root.addEventListener('pointerup', event => end(event, true));
  root.addEventListener('pointercancel', event => end(event, false));
  track.addEventListener('keydown', (event) => {
    const value = get();
    const next = {
      ArrowRight: value + step, ArrowUp: value + step, ArrowLeft: value - step, ArrowDown: value - step,
      PageUp: value + page, PageDown: value - page, Home: min, End: max,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    change(clamp(next));
  });
  return {
    render() {
      const value = get();
      track.style.setProperty('--p', at(value));
      track.setAttribute('aria-valuenow', String(value));
      track.setAttribute('aria-valuetext', describe(value));
      for (const tick of ticks.children) tick.toggleAttribute('data-filled', Number(tick.dataset.value) <= value);
      if (value < min || value > max) track.dataset.pinned = value < min ? 'low' : 'high';
      else delete track.dataset.pinned;
    },
  };
}

for (const count of playerCounts) {
  const choice = element('button', 'k-stop', String(count));
  choice.type = 'button';
  choice.value = count;
  choice.tabIndex = -1;
  choice.setAttribute('aria-label', `${count} players`);
  choice.addEventListener('click', () => {
    selectedPlayerCount = count;
    renderSettings();
  });
  playerChoices.append(choice);
}
for (const preset of lifePresets.children) {
  preset.addEventListener('click', () => {
    selectedLife = Number(preset.dataset.life);
    renderSettings();
  });
}
const playersSlider = notchedSlider({
  root: document.querySelector('#players-slider'), min: 2, max: 6, snap: 1, step: 1, page: 1, lowest: 2, highest: 6,
  get: () => selectedPlayerCount,
  set(count) {
    selectedPlayerCount = count;
    renderSettings();
  },
  describe: count => `${count} players`,
});
// Starting life: 10 to 60 on the track, in fives, and any whole number from 1 to 999 by keys or the field.
const lifeSlider = notchedSlider({
  root: document.querySelector('#life-slider'), min: 10, max: 60, snap: 5, step: 1, page: 5, lowest: 1, highest: maxStartingLife,
  get: () => selectedLife,
  set(life) {
    selectedLife = life;
    renderSettings();
  },
  describe: life => `Starting life ${life}`,
});

// Tile colours: saved the moment it changes, like the switches. Swatch ids stay, so every player keeps their colour.
const tileSetChoices = document.querySelector('#tile-set-choices');
function applyTileColours() {
  document.documentElement.dataset.tiles = game.tileColours;
}
function setTileColours(set) {
  if (set === game.tileColours) return;
  game.tileColours = set;
  saveGame();
  applyTileColours();
  renderTileSetting();
}
const tilesSlider = notchedSlider({
  root: document.querySelector('#tiles-slider'), min: 0, max: 3, snap: 1, step: 1, page: 1, lowest: 0, highest: 3,
  get: () => tileSetOrder.indexOf(game.tileColours),
  set: at => setTileColours(tileSetOrder[at]),
  describe: at => `${tileSets[tileSetOrder[at]].label} tile colours`,
});
for (const choice of tileSetChoices.children) choice.addEventListener('click', () => setTileColours(choice.dataset.set));
function renderTileSetting() {
  for (const choice of tileSetChoices.children) choice.setAttribute('aria-pressed', String(choice.dataset.set === game.tileColours));
  tilesSlider.render();
}

function renderSettings() {
  for (const choice of playerChoices.children) choice.setAttribute('aria-pressed', String(Number(choice.value) === selectedPlayerCount));
  for (const preset of lifePresets.children) preset.setAttribute('aria-pressed', String(Number(preset.dataset.life) === selectedLife));
  playersSlider.render();
  lifeSlider.render();
  lifeValue.textContent = selectedLife;
  lifeEdit.setAttribute('aria-label', `Starting life ${selectedLife}. Type a number`);
  const pending = settingsChangeGame();
  settingsDone.textContent = pending ? 'Start new game' : 'Done';
  restartButton.hidden = pending;
  // The pending line is a live region, so it's kept in the page (visually hidden while empty) and only rewritten when
  // its words change.
  const words = pending ? `Starts a new game with ${selectedPlayerCount} players at ${selectedLife} life when you leave settings.` : '';
  if (settingsPending.textContent !== words) settingsPending.replaceChildren(...(pending ? [icon('play'), element('span', '', words)] : []));
  settingsPending.toggleAttribute('data-empty', !pending);
  syncSettingsCue();
}

// The inline life editor: the number turns into a field with the numeric keyboard and a ✓. Enter (Android), ✓, Done in
// the iOS keyboard bar or leaving the field commits a whole number from 1 to 999; anything else keeps the last value.
// Escape cancels.
function openLifeEditor() {
  lifeInput.value = String(selectedLife);
  lifeEdit.hidden = true;
  lifeEditor.hidden = false;
  lifeInput.focus();
  lifeInput.select();
  keepLifeEditorInView();
}
function closeLifeEditor(commit, refocus) {
  if (lifeEditor.hidden) return;
  const typed = lifeInput.value.trim();
  // Hidden first: hiding the field blurs it, and its focusout calls back in.
  lifeEditor.hidden = true;
  lifeEdit.hidden = false;
  if (commit && /^\d{1,3}$/.test(typed) && Number(typed) >= 1) selectedLife = Number(typed);
  settings.style.removeProperty('--keyboard');
  renderSettings();
  placeSettingsSections();
  if (refocus) lifeEdit.focus();
}
lifeEdit.addEventListener('click', openLifeEditor);
lifeInput.addEventListener('input', () => {
  const digits = lifeInput.value.replace(/\D/g, '').slice(0, 3);
  if (digits !== lifeInput.value) lifeInput.value = digits;
});
lifeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    // Not the form's implicit submit, which would close settings.
    event.preventDefault();
    closeLifeEditor(true, true);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeLifeEditor(false, true);
  }
});
document.querySelector('#life-commit').addEventListener('click', () => closeLifeEditor(true, true));
lifeEditor.addEventListener('focusout', (event) => {
  if (!lifeEditor.contains(event.relatedTarget)) closeLifeEditor(true, false);
});

// Keeps the field clear of the keyboard and the header. Android's WebView shrinks the page for the keyboard; iOS shrinks
// only the visual viewport, so the body gets that much extra room (--keyboard) to scroll the field up into. Turned to
// face the other side, the header is at the bottom of the screen and scrolling moves the field the other way.
function keepLifeEditorInView() {
  if (lifeEditor.hidden || !settings.open) return;
  const view = window.visualViewport;
  const viewTop = view ? view.offsetTop : 0;
  const viewBottom = view ? view.offsetTop + view.height : window.innerHeight;
  const flipped = settings.hasAttribute('data-flipped');
  settings.style.setProperty('--keyboard', `${Math.max(0, Math.round(window.innerHeight - viewBottom))}px`);
  const head = settingsHead.getBoundingClientRect();
  const top = (flipped ? viewTop : Math.max(viewTop, head.bottom)) + 8;
  const bottom = (flipped ? Math.min(viewBottom, head.top) : viewBottom) - 8;
  const box = lifeEditor.getBoundingClientRect();
  const move = box.bottom > bottom ? bottom - box.bottom : box.top < top ? top - box.top : 0;
  if (move) settingsBody.scrollTop += flipped ? move : -move;
}
window.visualViewport?.addEventListener('resize', keepLifeEditorInView);

// Layout B: two columns from 620px wide, Game and Table then Track and Identity; one column below, in the order Game,
// Track, Identity, Table. The sections move rather than being reordered by CSS, so the reading and focus order always
// match what shows. They stay put while the life field is open, so a resize from the keyboard can't close it.
const settingsSections = ['game', 'table', 'track', 'identity'].map(name => document.querySelector(`#settings-${name}`));
function placeSettingsSections() {
  if (!lifeEditor.hidden) return;
  const columns = window.innerWidth >= 620;
  const [game, table, track, identity] = settingsSections;
  const [start, end] = settingsContent.querySelectorAll('.fs-col');
  const wanted = columns ? [[game, table], [track, identity]] : [[game, track, identity, table], []];
  settingsContent.toggleAttribute('data-columns', columns);
  if (wanted[0].every((section, index) => start.children[index] === section) && end.children.length === wanted[1].length) return;
  const focused = settings.contains(document.activeElement) ? document.activeElement : null;
  start.replaceChildren(...wanted[0]);
  end.replaceChildren(...wanted[1]);
  focused?.focus({ preventScroll: true });
}

// A fade along the bottom of the body while there's more below.
function syncSettingsCue() {
  settingsCue.toggleAttribute('data-more', settingsBody.scrollTop + settingsBody.clientHeight < settingsBody.scrollHeight - 1);
}
settingsBody.addEventListener('scroll', syncSettingsCue, { passive: true });

function openSettings() {
  selectedPlayerCount = game.scores.length;
  selectedLife = game.startingLife;
  wakeInput.checked = game.keepAwake;
  settings.removeAttribute('data-flipped');
  settingsFlip.setAttribute('aria-pressed', 'false');
  renderSettings();
  renderTrackSheet();
  renderIdentitySheet();
  renderTileSetting();
  placeSettingsSections();
  settings.showModal();
  // Settings always open at the top.
  settingsBody.scrollTop = 0;
  syncSettingsCue();
  syncBackHandling();
}
setupButton.addEventListener('click', () => {
  if (boardMode) {
    setBoardMode(null);
    return;
  }
  openSettings();
});
document.querySelector('#settings-close').addEventListener('click', () => settings.close());
// The flip (O1): the page faces the phone, and this turns it to face a player across the table. Opening settings
// resets it.
settingsFlip.addEventListener('click', () => {
  const flipped = !settings.hasAttribute('data-flipped');
  settings.toggleAttribute('data-flipped', flipped);
  settingsFlip.setAttribute('aria-pressed', String(flipped));
});
settings.addEventListener('close', () => {
  closeLifeEditor(false, false);
  settings.removeAttribute('data-flipped');
  syncBackHandling();
});

// Turns saves the moment it changes. Off hides everything about turns but keeps the state. Going from Off to on in a
// game with no first player asks "Who goes first?" once settings closes; Rounds and Turn by turn switch without asking.
// Rounds doesn't follow whose turn it is, so switching between them leaves nobody's turn until a player starts theirs.
for (const choice of turnChoices.children) {
  choice.addEventListener('click', () => {
    const mode = choice.dataset.turns;
    const was = game.turns;
    if (mode === was) return;
    game.turns = mode;
    turnSteps = [];
    if (was !== 'off' && mode !== 'off') game.turn.active = null;
    askFirst = was === 'off' && mode !== 'off' ? game.turn.first === null : askFirst && mode !== 'off';
    saveGame();
    renderTrackSheet();
    renderAllBadges();
  });
}
manaSwitch.addEventListener('change', () => {
  game.manaPool = manaSwitch.checked;
  if (!game.manaPool) endUndoClears();
  saveGame();
  renderTrackSheet();
  renderAllBadges();
});
autoEmptySwitch.addEventListener('change', () => {
  game.autoEmpty = autoEmptySwitch.checked;
  saveGame();
});

// Identity: what tiles show of each identity, saved the moment it changes.
function renderIdentitySheet() {
  for (const toggle of identityShowSwitches) toggle.checked = game.identity.show[toggle.dataset.show];
  for (const choice of identityBackgroundChoices.children) {
    choice.setAttribute('aria-pressed', String(game.identity.background === choice.dataset.background));
  }
  identityNote.textContent = identityNoteText(game.identity.show);
}

// Identity's note says what the tiles show: "Tiles show the colour disc and name", or that the chip is off.
function identityNoteText(show) {
  const parts = [['indicator', 'colour disc'], ['symbol', 'symbol'], ['name', 'name']].filter(([part]) => show[part]).map(([, words]) => words);
  if (!parts.length) return 'Identity is hidden on tiles. Players keep their picks.';
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  return `Tiles show the ${list} of each player's identity.`;
}

function changeIdentitySettings(change) {
  change(game.identity);
  saveGame();
  renderIdentitySheet();
  game.scores.forEach((_, index) => renderBadges(index));
}

for (const toggle of identityShowSwitches) {
  toggle.addEventListener('change', () => changeIdentitySettings((identity) => {
    identity.show[toggle.dataset.show] = toggle.checked;
  }));
}
for (const choice of identityBackgroundChoices.children) {
  choice.addEventListener('click', () => changeIdentitySettings((identity) => {
    identity.background = choice.dataset.background;
  }));
}

// Choose identities, Colours and Rotate seats close settings and start their board mode, starting a pending new game
// first. The mode's check mark returns to the board.
function leaveSettingsFor(mode) {
  closeLifeEditor(true, false);
  if (settingsChangeGame()) startGame(selectedPlayerCount, selectedLife);
  settings.close();
  setBoardMode(mode);
}
chooseIdentitiesButton.addEventListener('click', () => leaveSettingsFor('identity'));
rotateSeatsButton.addEventListener('click', () => leaveSettingsFor('rotate'));
tileColoursButton.addEventListener('click', () => leaveSettingsFor('colours'));
settingsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  closeLifeEditor(true, false);
  if (settingsChangeGame()) startGame(selectedPlayerCount, selectedLife);
  settings.close();
});

// New game opens its confirmation over settings. Confirming starts a new game with the same players and life and
// closes both; cancelling returns to settings. It's hidden while a new game is pending.
restartButton.addEventListener('click', () => {
  document.querySelector('#restart-message').textContent = `All players will go back to ${game.startingLife} life.`;
  restart.returnValue = 'cancel';
  restart.showModal();
  syncBackHandling();
});
restart.addEventListener('close', () => {
  if (restart.returnValue === 'restart') {
    startGame(game.scores.length, game.startingLife);
    settings.close();
  }
  syncBackHandling();
});

// Shows the chosen die without a result. A roll in progress stops.
function showDie(sides) {
  stopRoll?.();
  stopRoll = undefined;
  diceSides = sides;
  die = window.lifePodDice.stageDie(sides);
  die.showIdle();
  diceStage.replaceChildren(die.shadow, die.die);
  diceRoll.textContent = `Roll d${sides}`;
  diceResult.textContent = '';
  for (const choice of dicePicker.children) choice.setAttribute('aria-pressed', String(Number(choice.value) === sides));
}

// Taps during a roll are ignored, so every roll shows its result.
function rollDie() {
  if (stopRoll) return;
  diceResult.textContent = '';
  const sides = diceSides;
  stopRoll = window.lifePodDice.roll(die, {
    reducedMotion: reducedMotion.matches,
    onLand(result) {
      haptic();
      diceResult.textContent = `Rolled ${result} on a d${sides}`;
    },
    done() { stopRoll = undefined; },
  });
}

for (const sides of window.lifePodDice.sides) {
  const choice = document.createElement('button');
  choice.type = 'button';
  choice.value = sides;
  choice.append(window.lifePodDice.icon(sides), `d${sides}`);
  choice.addEventListener('click', () => {
    if (!stopRoll) showDie(sides);
  });
  dicePicker.append(choice);
}
diceButton.addEventListener('click', () => {
  showDie(diceSides);
  diceDialog.showModal();
  syncBackHandling();
});
diceStage.addEventListener('click', rollDie);
diceRoll.addEventListener('click', rollDie);
diceDialog.querySelector('[data-close]').addEventListener('click', () => diceDialog.close());
diceDialog.addEventListener('close', () => {
  showDie(diceSides);
  syncBackHandling();
});

damageButton.addEventListener('click', () => setBoardMode('damage'));
countersButton.addEventListener('click', () => setBoardMode('counters'));
manaButton.addEventListener('click', () => setBoardMode('mana'));
bindStep(roundButton, stepTurn, stepBack);
roundBackButton.addEventListener('click', stepBack);
bindTap(shuffleButton, shuffleFirst);
undoButton.addEventListener('click', undoEdit);
saveButton.addEventListener('click', () => {
  saveGame();
  setBoardMode(null);
});
cancelButton.addEventListener('click', () => {
  if (boardMode === 'first') setBoardMode(null);
  else cancelEditing();
});
discardDialog.addEventListener('close', () => {
  syncBackHandling();
  if (discardDialog.returnValue === 'discard') discardEdits();
  else cancelButton.focus();
});

// Android's back gesture closes the open dialog, then leaves the open board mode the way ✕ does.
window.closeOpenDialog = () => {
  const openDialog = [...document.querySelectorAll('dialog[open]')].at(-1);
  if (openDialog) {
    openDialog.close('cancel');
    return true;
  }
  if (!boardMode) return false;
  leaveBoardMode();
  return true;
};
document.addEventListener('keydown', (event) => {
  if (boardMode && event.key === 'Escape' && !document.querySelector('dialog[open]')) leaveBoardMode();
});

wakeInput.addEventListener('change', () => {
  game.keepAwake = wakeInput.checked;
  saveGame();
  syncWakeLock();
});
// The counter switches are saved at once and stay on across launches and new games.
for (const tracker of trackers) {
  const input = document.querySelector(`#${tracker}-switch`);
  input.addEventListener('change', () => {
    game.counters[tracker] = input.checked;
    saveGame();
    game.scores.forEach((_, index) => {
      renderScore(index);
      renderBadges(index);
    });
    syncPill();
  });
}
// "Who goes first?" waits for settings and the new game dialog to close. These listeners run after each dialog's own.
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('close', maybeAskFirst);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelPresses();
  else if (!android && !ios) syncWakeLock();
});
window.screen.orientation?.addEventListener?.('change', syncBoardTurn);
window.addEventListener('orientationchange', syncBoardTurn);
window.addEventListener('resize', syncBoardTurn);
portraitQuery.addEventListener('change', syncBoardTurn);
// The board's size can also change without a resize event, such as when a browser's toolbar slides away.
if (window.ResizeObserver) new ResizeObserver(measureBoard).observe(board);
// Identity symbols come from the Mana font. Rows fitted before it loaded were measured with another font's glyphs,
// so they're fitted again from full size once it has. The board is turned and measured again first: a font can
// finish loading in the middle of a resize or a rotation, before the board has caught up with the window.
document.fonts?.addEventListener?.('loadingdone', () => {
  dropLevels = { near: 0, far: 0, strip: 0 };
  syncBoardTurn();
});
applyTileColours();
syncBoardTurn();
renderBoard();
syncPill();
syncWakeLock();
syncBackHandling();
