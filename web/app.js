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
const setup = document.querySelector('#setup');
const setupForm = document.querySelector('#setup-form');
const playerChoices = document.querySelector('#player-choices');
const lifePresets = document.querySelector('#life-presets');
const customLifeButton = document.querySelector('#custom-life');
const lifeStepper = document.querySelector('#life-stepper');
const lifeValue = document.querySelector('#life-value');
const trackButton = document.querySelector('#track-button');
const trackSummary = document.querySelector('#track-summary');
const trackDialog = document.querySelector('#track');
const manaSwitch = document.querySelector('#mana-switch');
const autoEmptySwitch = document.querySelector('#auto-empty-switch');
const autoEmptyRow = document.querySelector('#auto-empty-row');
const turnChoices = document.querySelector('#turn-choices');
const identityNav = document.querySelector('#identity-nav');
const identityDialog = document.querySelector('#identity-sheet');
const identityShowChoices = document.querySelector('#identity-show');
const identityBackgroundChoices = document.querySelector('#identity-background');
const chooseIdentitiesButton = document.querySelector('#choose-identities');
const restart = document.querySelector('#restart');
const privacy = document.querySelector('#privacy');
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
// New swatches only ever join the end, so saved choices keep their colour.
const swatches = [
  { id: 'sage', name: 'Sage' }, { id: 'sky', name: 'Sky' }, { id: 'coral', name: 'Coral' },
  { id: 'violet', name: 'Violet' }, { id: 'amber', name: 'Amber' }, { id: 'teal', name: 'Teal' },
  { id: 'rose', name: 'Rose' }, { id: 'indigo', name: 'Indigo' }, { id: 'slate', name: 'Slate' },
  { id: 'copper', name: 'Copper' }, { id: 'olive', name: 'Olive' }, { id: 'orchid', name: 'Orchid' },
];
const topRowPlayers = [0, 1, 4];
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
// What a tile's identity chip can show, in the chip's order, and what can sit behind its life total.
const identityParts = ['indicator', 'symbol', 'name'];
const identityBackgrounds = ['symbol', 'indicator', 'off'];
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
// On the near row the identity's name and the turn chip's word "Turn" go first, leaving the untap symbol and the round,
// then the identity's symbol where the indicator also shows (one colour mark is enough).
const dropSteps = {
  near: [
    { drop: 'name', selector: '.ci-chip .id-name, .turn-chip .turn-word' }, { drop: 'symbol', selector: '.ci-chip .ci ~ .id-symbol' }, { floor: 11 },
    { drop: 'identity', selector: '.ci-chip' }, { floor: 9 }, { drop: 'wrap', wrap: true },
  ],
  far: [{ drop: 'sword', selector: '.sword' }, { floor: 11 }, { floor: 9 }, { drop: 'wrap-far', wrap: true }],
  // The mana strip never covers the life total or the − and + glyphs. The turn chips leave it first (the pill's round
  // button does the same and stays), then the type shrinks, then it wraps upward if there's room above it. Where even
  // that would cover the total, a strip folds into one button that shows the pool and opens mana mode. Only the strips
  // that need it fold, so a short pool elsewhere keeps its spend buttons.
  strip: [
    { drop: 'strip-turn', selector: '.mana-strip > .chip' }, { floor: 11 }, { drop: 'strip-wrap', wrap: true }, { fold: true },
  ],
};
// A dropped item comes back only when every row would fit it with this much to spare, so counts ticking up and
// down by one can't make it blink.
const dropSlack = 1.15;
const faceAngles = { bottom: 0, left: 90, top: 180, right: 270 };
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
// Setup's starting life, before Done applies it, and whether Custom is chosen.
let selectedLife = game.startingLife;
let customLife = false;
let diceSides = 20;
let die;
let stopRoll;
// Every held counter button, so several players can hold buttons at the same time.
const activePresses = new Set();
// Turn steps, newest last, so holding the turn chip or the pill steps back exactly, restoring any pools the step
// emptied. Not saved: after a relaunch, a hold steps back by the play order instead.
let turnSteps = [];
// "Who goes first?" waits until setup and its sheets have closed, then opens.
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
}

// One size per board (design/polish/SPEC.md §3.1): every tile draws its content at the size that fits the smallest
// tile. --ui and --ub are the smallest tile face's width and height, and CSS sizes tile content from them instead of
// from each tile's own size. The flags set the board-wide thresholds that hide mode hints and pick layouts.
function measureBoard() {
  const faces = [...board.querySelectorAll('.player-face')];
  if (!faces.length) return;
  const width = Math.min(...faces.map(face => face.offsetWidth));
  const height = Math.min(...faces.map(face => face.offsetHeight));
  if (!width || !height) return;
  board.style.setProperty('--ui', `${width}px`);
  board.style.setProperty('--ub', `${height}px`);
  board.toggleAttribute('data-narrow', width < 240);
  board.toggleAttribute('data-short', height < 200);
  board.toggleAttribute('data-wide', width >= 264);
  syncBoardDigits();
  requestFit();
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

function fitBadgeRows() {
  fitQueued = false;
  fitBadgeSide('near');
  fitBadgeSide('far');
  fitStrips();
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

// The mana strips take the fewest steps that keep every strip on one line, inside its tile and clear of its life
// total and − and + glyphs, board-wide like the badge rows, with the same 15% to spare before a step is undone.
function fitStrips() {
  const strips = badgeRows('strip');
  board.style.removeProperty('--strip-size');
  if (!strips.length) {
    syncDropTokens(dropLevels);
    return;
  }
  const steps = dropSteps.strip;
  const base = parseFloat(getComputedStyle(strips[0]).fontSize);
  const measure = (level, slack) => {
    syncDropTokens({ ...dropLevels, strip: level });
    board.style.removeProperty('--strip-size');
    const taken = steps.slice(0, level);
    const floors = taken.filter(step => step.floor).map(step => step.floor);
    const wrap = taken.some(step => step.wrap);
    const fold = taken.some(step => step.fold);
    for (const strip of strips) delete strip.dataset.fold;
    // Room for one line: the tile's width, less the strip's inset.
    const room = strip => strip.parentElement.clientWidth - 8;
    // One line's width, even where the strips may wrap.
    const lineWidth = (strip) => {
      strip.style.flexWrap = 'nowrap';
      const width = strip.scrollWidth;
      strip.style.removeProperty('flex-wrap');
      return width;
    };
    if (floors.length) {
      const ratio = Math.min(...strips.map(strip => room(strip) / (lineWidth(strip) * slack)));
      if (ratio < 1) board.style.setProperty('--strip-size', `${Math.max(Math.min(...floors), Math.floor(base * ratio * 10) / 10)}px`);
    }
    const clear = (strip) => {
      const box = strip.getBoundingClientRect();
      const face = strip.parentElement;
      return ![face.querySelector('.score'), ...face.querySelectorAll('.controls button')]
        .some(blocker => overlaps(box, blocker.getBoundingClientRect()));
    };
    const fits = strip => (wrap || strip.scrollWidth * slack <= room(strip) + 1) && clear(strip);
    if (fold) for (const strip of strips) if (!fits(strip)) strip.dataset.fold = '';
    return strips.every(strip => ('fold' in strip.dataset ? clear(strip) : fits(strip)));
  };
  let needed = 0;
  while (needed < steps.length && !measure(needed, 1)) needed++;
  let level = needed;
  const current = dropLevels.strip;
  if (needed < current) {
    const kept = dropTokens('strip', current, strips).length;
    level = current;
    for (let candidate = needed; candidate < current; candidate++) {
      if (dropTokens('strip', candidate, strips).length === kept || measure(candidate, dropSlack)) {
        level = candidate;
        break;
      }
    }
  }
  dropLevels = { ...dropLevels, strip: level };
  measure(level, 1);
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
  return { show, background: identityBackgrounds.includes(saved?.background) ? saved.background : 'symbol' };
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
    manaPool: false, autoEmpty: true, pools: fitPools([], 4), turns: 'off', turn: fitTurn(null, 4),
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

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
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
      if (event.pointerId !== press?.pointerId) return;
      ignoreClicksUntil = performance.now() + 800;
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
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || button.disabled) return;
    ignoreClicksUntil = performance.now() + 800;
    action();
  });
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
  const tile = button.closest('.player');
  let press;

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
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
  button.addEventListener('pointermove', (event) => {
    if (event.pointerId !== press?.pointerId) return;
    const bounds = tile.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) {
      press.finish();
    }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, (event) => {
      if (event.pointerId !== press?.pointerId) return;
      ignoreClicksUntil = performance.now() + 800;
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
        const tap = press === current && !current.held;
        current.end();
        if (tap) forward();
      },
    };
    press = current;
    activePresses.add(current);
    button.dataset.pressed = '';
    ignoreClicksUntil = performance.now() + 800;
    current.timer = setTimeout(() => {
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
    const name = swatches[colour].name;
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

// Five toggles for one player's colour identity: the mana symbols in W U B R G order. Any combination can be on.
function buildIdentity(index) {
  const group = element('div', 'identity');
  group.dataset.player = index;
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', `Colour identity for Player ${index + 1}`);
  for (const colour of identityColours) {
    const pip = element('span', 'pip');
    pip.dataset.pip = colour.id;
    const toggle = element('button', 'identity-toggle', pip);
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

// The background behind a tile's total: its identity's symbol, faintly, like a card's watermark, or its colour
// indicator, or the rings. A tile with no identity always has the rings.
function renderWatermark(index) {
  const player = board.children[index];
  const identity = game.identities[index];
  const background = identity ? game.identity.background : 'off';
  const mark = player.querySelector('.watermark');
  if (background === 'off') {
    delete player.dataset.background;
    mark.replaceChildren();
    return;
  }
  player.dataset.background = background;
  mark.replaceChildren(background === 'symbol' ? identitySymbol(identity) : colourIndicator(identity));
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
    layer.append(buildIdentityPreview(index), buildIdentity(index));
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
  return game.scores[index] <= 0 ||
    (game.counters.commander && game.commanderDamage[index].some(damage => damage >= commanderLethal)) ||
    (game.counters.poison && game.poison[index] >= poisonLethal);
}

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
  saveGame();
  haptic();
  game.scores.forEach((_, index) => renderBadges(index));
  syncPill();
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

// The turn chips that lead a tile's near row (or its mana strip). Rounds: the first player's flag carries the round
// and steps it. Turn by turn: the active player's chip passes the turn, and the first player keeps a small flag; with
// nobody's turn yet, every player who isn't out has a chip to start theirs.
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
      const chip = element('button', `chip turn-chip ${active === index ? 'active-chip' : 'start-chip'}`, manaIcon('untap'),
        element('span', 'turn-word', 'Turn'), String(round));
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
    return [undo];
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
  // Folded, where the strip can't fit clear of the total: one button that shows the pool and opens mana mode.
  const summary = element('button', 'strip-summary', ...manaColours.flatMap((colour, at) => {
    const amount = game.pools[index][at];
    if (!amount) return [];
    const pip = element('span', 'pip');
    pip.dataset.pip = colour.id;
    return [element('span', 'summary-item', pip, String(amount))];
  }));
  summary.type = 'button';
  summary.setAttribute('aria-label', `Player ${index + 1}, mana pool ${poolText(index)}. Open mana`);
  bindTap(summary, () => setBoardMode('mana'));
  const eraser = element('button', 'strip-clear', icon('eraser'));
  eraser.type = 'button';
  eraser.setAttribute('aria-label', `Clear Player ${index + 1}'s mana pool`);
  bindTap(eraser, () => clearPool(index));
  return [...items, eraser, summary];
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
  const turns = turnChips(index);
  player.toggleAttribute('data-active', game.turns === 'turns' && game.turn.active === index);
  // While a pool has mana, or for 5 seconds after the eraser, its strip takes the near row's place. The turn chips
  // come along, since they're controls and never give way.
  const strip = player.querySelector('.mana-strip');
  const hadFocus = strip.contains(document.activeElement) ? document.activeElement.dataset.colour ?? '' : null;
  if (game.manaPool && (hasMana(index) || clearedPools.has(index))) {
    strip.replaceChildren(...turns, ...stripItems(index));
    strip.hidden = false;
    near.replaceChildren();
    near.hidden = true;
    // Keep keyboard focus in the strip as items come and go.
    if (hadFocus !== null) (strip.querySelector(`[data-colour="${hadFocus}"]`) ?? strip.querySelector('.strip-spend, .strip-clear, .strip-undo'))?.focus();
    requestFit();
    return;
  }
  strip.replaceChildren();
  strip.hidden = true;
  if (hadFocus !== null) setupButton.focus();
  const chips = [...turns];
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
  for (const chip of chips) if (chip.tagName !== 'BUTTON') chip.setAttribute('role', 'listitem');
  near.replaceChildren(...chips);
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
  setupButton.setAttribute('aria-label', mode ? doneLabels[mode] ?? 'Game setup' : 'Game setup');
  setupButton.setAttribute('aria-haspopup', mode ? 'false' : 'dialog');
  setupButton.querySelector('.setup-icon').hidden = mode !== null;
  setupButton.querySelector('.rotation-done').hidden = mode === null;
  syncPill();
  const focusTarget = mode === 'rotate' ? board.querySelector('.rotate-seat')
    : mode === 'colours' ? board.querySelector('.swatch[aria-pressed="true"]')
    : mode ? board.querySelector('.mode-layer button') : setupButton;
  focusTarget?.focus();
  syncBackHandling();
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
  score.setAttribute('aria-label', `${game.scores[index]} life`);
  syncBoardDigits();
  score.toggleAttribute('data-out', isOut(index));
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

function setupChangesGame() {
  return selectedPlayerCount !== game.scores.length || selectedLife !== game.startingLife;
}

// Track's summary: the icon of each tracker that's on, then the mana pool and turns.
function renderTrackSummary() {
  trackSummary.replaceChildren(...trackers.filter(tracker => game.counters[tracker])
    .map(tracker => (tracker === 'commander' ? icon('sword') : counterIcon(tracker))),
  ...(game.manaPool ? [manaIcon('tap')] : []),
  ...(game.turns === 'rounds' ? [icon('flag')] : game.turns === 'turns' ? [manaIcon('untap')] : []));
}

// Track's own state: the switches, the Turns choice, and the auto-empty switch, which only shows while it applies.
function renderTrackSheet() {
  for (const tracker of trackers) document.querySelector(`#${tracker}-switch`).checked = game.counters[tracker];
  manaSwitch.checked = game.manaPool;
  autoEmptySwitch.checked = game.autoEmpty;
  autoEmptyRow.hidden = !game.manaPool || game.turns === 'off';
  for (const choice of turnChoices.children) choice.setAttribute('aria-pressed', String(choice.dataset.turns === game.turns));
}

function renderAllBadges() {
  game.scores.forEach((_, index) => {
    renderScore(index);
    renderBadges(index);
  });
  syncPill();
}

function renderSetup() {
  for (const choice of playerChoices.children) {
    choice.setAttribute('aria-pressed', String(Number(choice.value) === selectedPlayerCount));
  }
  // Custom is chosen when the player picks it, or when the life isn't one of the presets, such as an old save at 25.
  const presets = [...lifePresets.querySelectorAll('[data-life]')];
  const custom = customLife || !presets.some(preset => Number(preset.dataset.life) === selectedLife);
  for (const preset of presets) preset.setAttribute('aria-pressed', String(!custom && Number(preset.dataset.life) === selectedLife));
  customLifeButton.hidden = custom;
  lifeStepper.hidden = !custom;
  lifeValue.textContent = selectedLife;
  const changesGame = setupChangesGame();
  document.querySelector('#save-setup').textContent = changesGame ? 'Start new game' : 'Done';
  document.querySelector('#restart-button').hidden = changesGame;
  rotateSeatsButton.hidden = changesGame;
  tileColoursButton.hidden = changesGame;
  renderTrackSummary();
}

for (const count of playerCounts) {
  const choice = document.createElement('button');
  choice.type = 'button';
  choice.value = count;
  choice.textContent = count;
  choice.setAttribute('aria-label', `${count} players`);
  choice.addEventListener('click', () => {
    selectedPlayerCount = count;
    renderSetup();
  });
  playerChoices.append(choice);
}

for (const preset of lifePresets.querySelectorAll('[data-life]')) {
  preset.addEventListener('click', () => {
    selectedLife = Number(preset.dataset.life);
    customLife = false;
    renderSetup();
  });
}
// Custom becomes the stepper, starting at the current value.
customLifeButton.addEventListener('click', () => {
  customLife = true;
  renderSetup();
  document.querySelector('#life-up').focus();
});
// The stepper counts 1 to 999. Holding repeats ten times a second, in steps of 5 once held for a second.
function stepStartingLife(direction, held) {
  const next = Math.min(maxStartingLife, Math.max(1, selectedLife + direction * (held >= 1000 ? 5 : 1)));
  if (next === selectedLife) return;
  selectedLife = next;
  renderSetup();
}
bindCounter(document.querySelector('#life-down'), held => stepStartingLife(-1, held), 'Less starting life');
bindCounter(document.querySelector('#life-up'), held => stepStartingLife(1, held), 'More starting life');

setupButton.addEventListener('click', () => {
  if (boardMode) {
    setBoardMode(null);
    return;
  }
  selectedPlayerCount = game.scores.length;
  selectedLife = game.startingLife;
  customLife = false;
  wakeInput.checked = game.keepAwake;
  renderSetup();
  setup.showModal();
  syncBackHandling();
});
setup.querySelector('[data-close]').addEventListener('click', () => setup.close());
// About (the privacy summary and credits) opens from setup and returns to it. The apps can't open web pages, so it's shown here.
document.querySelector('#privacy-button').addEventListener('click', () => {
  setup.close();
  privacy.showModal();
  syncBackHandling();
});
privacy.addEventListener('close', () => {
  setup.showModal();
  syncBackHandling();
});
// Track and Identity replace setup, keeping setup's unsaved choices. ‹, Escape and Android back return to setup;
// ✕ closes both. Choose identities closes both and starts identity mode.
function openSubSheet(dialog) {
  dialog.returnValue = '';
  setup.close();
  dialog.showModal();
  syncBackHandling();
}
for (const [dialog, opener] of [[trackDialog, trackButton], [identityDialog, identityNav]]) {
  dialog.querySelector('[data-back]').addEventListener('click', () => dialog.close('back'));
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close('close'));
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'close') {
      setupButton.focus();
    } else if (dialog.returnValue !== 'choose') {
      renderSetup();
      setup.showModal();
      opener.focus();
    }
    syncBackHandling();
  });
}
trackButton.addEventListener('click', () => {
  renderTrackSheet();
  openSubSheet(trackDialog);
});
// Turns saves the moment it changes. Off hides everything about turns but keeps the state. Going from Off to on in a
// game with no first player asks "Who goes first?" once setup closes; Rounds and Turn by turn switch without asking.
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

// The Identity sheet: what tiles show of each identity, saved the moment it changes. Choose identities keeps its
// place but can't be used while setup would start a new game, like Colours and Rotate seats.
function renderIdentitySheet() {
  for (const choice of identityShowChoices.children) {
    choice.setAttribute('aria-pressed', String(game.identity.show[choice.dataset.show]));
  }
  for (const choice of identityBackgroundChoices.children) {
    choice.setAttribute('aria-pressed', String(game.identity.background === choice.dataset.background));
  }
  chooseIdentitiesButton.hidden = setupChangesGame();
}

function changeIdentitySettings(change) {
  change(game.identity);
  saveGame();
  renderIdentitySheet();
  game.scores.forEach((_, index) => renderBadges(index));
}

identityNav.addEventListener('click', () => {
  renderIdentitySheet();
  openSubSheet(identityDialog);
});
for (const choice of identityShowChoices.children) {
  choice.addEventListener('click', () => changeIdentitySettings((settings) => {
    settings.show[choice.dataset.show] = !settings.show[choice.dataset.show];
  }));
}
for (const choice of identityBackgroundChoices.children) {
  choice.addEventListener('click', () => changeIdentitySettings((settings) => {
    settings.background = choice.dataset.background;
  }));
}
chooseIdentitiesButton.addEventListener('click', () => {
  identityDialog.close('choose');
  setBoardMode('identity');
});
rotateSeatsButton.addEventListener('click', () => {
  setup.close();
  setBoardMode('rotate');
});
tileColoursButton.addEventListener('click', () => {
  setup.close();
  setBoardMode('colours');
});
setupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (setupChangesGame()) startGame(selectedPlayerCount, selectedLife);
  setup.close();
});

document.querySelector('#restart-button').addEventListener('click', () => {
  document.querySelector('#restart-message').textContent = `All players will go back to ${game.startingLife} life.`;
  restart.returnValue = 'cancel';
  setup.close();
  restart.showModal();
  syncBackHandling();
});
setup.addEventListener('close', syncBackHandling);
restart.addEventListener('close', () => {
  syncBackHandling();
  if (restart.returnValue === 'restart') startGame(game.scores.length, game.startingLife);
  if (!boardMode) setupButton.focus();
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
  const openDialog = document.querySelector('dialog[open]');
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
// "Who goes first?" waits for setup, its sheets and the new game dialog to close. These listeners run after each
// dialog's own, so a sheet going back to setup still counts as open.
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
syncBoardTurn();
renderBoard();
syncPill();
syncWakeLock();
syncBackHandling();
