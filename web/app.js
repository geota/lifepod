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
const undoButton = document.querySelector('#undo-button');
const saveButton = document.querySelector('#save-button');
const cancelButton = document.querySelector('#cancel-button');
const commanderSwitch = document.querySelector('#commander-switch');
const poisonSwitch = document.querySelector('#poison-switch');
const playerSheet = document.querySelector('#player-sheet');
const identityToggles = document.querySelector('#identity-toggles');
const discardDialog = document.querySelector('#discard');
const setup = document.querySelector('#setup');
const setupForm = document.querySelector('#setup-form');
const playerChoices = document.querySelector('#player-choices');
const startingLifeInput = document.querySelector('#starting-life');
const lifePresets = document.querySelector('#life-presets');
const lifeError = document.querySelector('#life-error');
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
const swatches = [
  { id: 'sage', name: 'Sage' }, { id: 'sky', name: 'Sky' }, { id: 'coral', name: 'Coral' },
  { id: 'violet', name: 'Violet' }, { id: 'amber', name: 'Amber' }, { id: 'teal', name: 'Teal' },
  { id: 'rose', name: 'Rose' }, { id: 'indigo', name: 'Indigo' }, { id: 'slate', name: 'Slate' },
];
const topRowPlayers = [0, 1, 4];
// The centre button's label while a board mode that ends with the single check mark is open.
const doneLabels = { rotate: 'Done rotating seats', colours: 'Done choosing colours' };
// Modes whose changes can be undone, saved with the check mark, or discarded with ✕.
const editingModes = ['damage', 'counters'];
const discardMessages = {
  damage: 'Commander damage and life go back to how they were when you opened commander damage.',
  counters: 'Counts, tile colours and colour identities go back to how they were when you opened counters.',
};
// Losing amounts (CR 903.10a and 704.5c), and where the warning starts.
const commanderLethal = 21;
const commanderWarning = 15;
const poisonLethal = 10;
const poisonWarning = 7;
// Colour identity in W U B R G order, then colourless, which goes alone.
const identityColours = [
  { id: 'W', name: 'white' }, { id: 'U', name: 'blue' }, { id: 'B', name: 'black' },
  { id: 'R', name: 'red' }, { id: 'G', name: 'green' }, { id: 'C', name: 'colourless' },
];
// Poison, casts and commander damage stop at this, which keeps every tile readable.
const maxCount = 99;
const faceAngles = { bottom: 0, left: 90, top: 180, right: 270 };
// Phosphor Icons (MIT, phosphoricons.com), Bold weight, for controls drawn by this script.
const iconPaths = {
  minus: 'M228,128a12,12,0,0,1-12,12H40a12,12,0,0,1,0-24H216A12,12,0,0,1,228,128Z',
  plus: 'M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z',
  flask: 'M225.15,197.71,164,95.81V44h4a12,12,0,0,0,0-24H88a12,12,0,0,0,0,24h4V95.81L30.85,197.71A20,20,0,0,0,48,228H208a20,20,0,0,0,17.15-30.29ZM140,44V99.14a12,12,0,0,0,1.71,6.17l35.13,58.54c-10.79.86-25.15-1.31-43.42-10.56-14-7.08-27.46-11.33-40.27-12.76l21.14-35.22A12,12,0,0,0,116,99.14V44ZM55.06,204,79,164.19c13-1.11,27.62,2.42,43.62,10.52,19.61,9.92,36.25,13.31,49.85,13.31A75.44,75.44,0,0,0,190.11,186l10.83,18Z',
  crown: 'M232.63,70a19.82,19.82,0,0,0-23.55,4.71l-29.52,31.82L146.22,31.76l-.06-.14a20,20,0,0,0-36.32,0l-.06.14L76.44,106.52,46.92,74.7a20,20,0,0,0-34.6,16.81c0,.16.06.31.09.47L35.07,195.76A20,20,0,0,0,54.71,212H201.29a20,20,0,0,0,19.64-16.24L243.59,92c0-.16.07-.31.09-.47A19.82,19.82,0,0,0,232.63,70ZM198.06,188H57.94L39.06,101.51,71.2,136.16A12,12,0,0,0,91,132.89l37-83.07,37,83.07a12,12,0,0,0,19.76,3.27l32.14-34.65Z',
  palette: 'M203.57,51A107.9,107.9,0,0,0,20,128c0,44.72,27.6,82.25,72,97.94A36,36,0,0,0,140,192a12,12,0,0,1,12-12h46.21a35.79,35.79,0,0,0,35.1-28A108.6,108.6,0,0,0,236,127.09,107.23,107.23,0,0,0,203.57,51Zm6.34,95.67a11.91,11.91,0,0,1-11.7,9.3H152a36,36,0,0,0-36,36,12,12,0,0,1-16,11.3c-16.65-5.88-30.65-15.76-40.48-28.56A76,76,0,0,1,44,128a84,84,0,0,1,83.13-84H128a84.35,84.35,0,0,1,84,83.29A84.72,84.72,0,0,1,209.91,146.71ZM144,76a16,16,0,1,1-16-16A16,16,0,0,1,144,76Zm-44,24A16,16,0,1,1,84,84,16,16,0,0,1,100,100Zm0,56a16,16,0,1,1-16-16A16,16,0,0,1,100,156Zm88-56a16,16,0,1,1-16-16A16,16,0,0,1,188,100Z',
};

let game = loadGame();
let selectedPlayerCount = game.scores.length;
let lock;
let requestingLock = false;
// The open board mode: 'rotate', 'colours', 'damage' or 'counters', or null at rest.
let boardMode = null;
// While an editing mode is open: every change made in it, newest last, so it can be undone or discarded,
// and the life totals when it opened.
let edits = null;
let editStartScores = [];
let sheetPlayer = null;
let sheetOpener = null;
let announceTimer;
const pendingAnnouncements = new Map();
let diceSides = 20;
let die;
let stopRoll;
// Every held counter button, so several players can hold buttons at the same time.
const activePresses = new Set();

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
  fitAllBadges();
}

// Keeps a badge row on one line whatever the font's width: a row wider than its tile shrinks its type, and
// with it the chips' padding, until every chip fits. Rows that aren't shown are fitted when they next are.
function fitBadgeRow(row) {
  row.style.removeProperty('font-size');
  if (row.hidden || row.offsetParent === null || row.childElementCount === 0) return;
  const room = row.clientWidth;
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  const width = () => [...row.children].reduce((sum, chip) => sum + chip.offsetWidth, 0) + gap * (row.childElementCount - 1);
  let size = parseFloat(getComputedStyle(row).fontSize);
  for (let step = 0; step < 10 && width() > room && size > 6; step++) {
    size = Math.max(6, Math.floor(size * Math.min(room / width(), 0.97) * 10) / 10);
    row.style.fontSize = `${size}px`;
  }
}

function fitAllBadges() {
  for (const row of document.querySelectorAll('.badges')) fitBadgeRow(row);
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

// Colour identity as letters in W U B R G order, or 'C' alone for colourless.
function normalizeIdentity(value) {
  if (typeof value !== 'string' || !/^[WUBRGC]*$/.test(value)) return '';
  if (value.includes('C')) return value === 'C' ? 'C' : '';
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

function loadGame() {
  const defaults = {
    startingLife: 40, scores: [40, 40, 40, 40], rotations: [0, 0, 0, 0], keepAwake: true,
    landscapeAngle: currentLandscapeAngle(), colors: fitColors([], 4),
    counters: { commander: false, poison: false }, poison: fitCounts([], 4), casts: fitCounts([], 4),
    identities: fitIdentities([], 4), commanderDamage: fitDamage([], 4),
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
      counters: { commander: saved.counters?.commander === true, poison: saved.counters?.poison === true },
      poison: fitCounts(saved.poison, saved.scores.length),
      casts: fitCounts(saved.casts, saved.scores.length),
      identities: fitIdentities(saved.identities, saved.scores.length),
      commanderDamage: fitDamage(saved.commanderDamage, saved.scores.length),
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

// A press counts the moment a finger lands, so a tap can't be lost to a finger drifting off the button
// or to Android cancelling touches when several fingers land at once. Holding repeats after a pause.
// Clicks still handle keyboards and assistive technology.
function bindCounter(button, adjust, label) {
  button.setAttribute('aria-label', label);
  const tile = button.closest('.player');
  let press;
  let ignoreClicksUntil = 0;

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    // A new touch ends any earlier press on this button, even if that press never got its pointerup.
    press?.end();
    const current = {
      pointerId: event.pointerId,
      end() {
        clearTimeout(current.timer);
        activePresses.delete(current);
        if (press !== current) return;
        press = undefined;
        delete button.dataset.pressed;
      },
    };
    function repeat() {
      adjust();
      current.timer = setTimeout(repeat, 100);
    }
    press = current;
    activePresses.add(current);
    button.dataset.pressed = '';
    ignoreClicksUntil = performance.now() + 800;
    adjust();
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
    if (event.detail === 0 || performance.now() >= ignoreClicksUntil) adjust();
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

function identityText(identity) {
  if (!identity) return 'no colour identity';
  return `colour identity ${[...identity].map(id => identityColours.find(colour => colour.id === id).name).join(', ')}`;
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
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', iconPaths[name]);
  svg.append(path);
  return svg;
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
  let ignoreClicksUntil = 0;
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
  // A rotated seat changes its tile's width.
  fitAllBadges();
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
  let ignoreClicksUntil = 0;

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

// A grid of the nine swatches for one player, in that player's row lightness.
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
  }
}

function syncAllSwatches() {
  for (const group of document.querySelectorAll('.swatches')) syncSwatches(group);
}

// In colours mode a choice is saved at once. In counters mode it's an edit that can be undone or discarded.
function chooseColour(index, colour) {
  if (game.colors.includes(colour)) return;
  if (edits) {
    commitEdit({ kind: 'colour', index, from: game.colors[index], to: colour });
    return;
  }
  game.colors[index] = colour;
  paintColours();
  syncAllSwatches();
  haptic();
  saveGame();
}

function setIdentity(index, identity) {
  if (identity !== game.identities[index]) commitEdit({ kind: 'identity', index, from: game.identities[index], to: identity });
}

// Applies an edit forwards (1) or takes it back (-1).
function applyEdit(edit, direction) {
  if (edit.kind === 'poison' || edit.kind === 'casts') game[edit.kind][edit.index] += edit.delta * direction;
  else if (edit.kind === 'colour') game.colors[edit.index] = direction > 0 ? edit.to : edit.from;
  else if (edit.kind === 'identity') game.identities[edit.index] = direction > 0 ? edit.to : edit.from;
  else if (edit.kind === 'damage') {
    // Commander damage is damage, so the defender loses the same life in the same save.
    game.commanderDamage[edit.index][edit.attacker] += edit.delta * direction;
    game.scores[edit.index] -= edit.delta * direction;
  }
}

// Shows an edit everywhere it appears, and saves it, so nothing is lost if the app is closed mid-mode.
function showEdit(edit) {
  const { index } = edit;
  if (edit.kind === 'colour') {
    paintColours();
    syncAllSwatches();
    syncSheet();
    game.scores.forEach((_, player) => renderBadges(player));
    announce(index, 'colour', () => `Player ${index + 1}, ${swatches[game.colors[index]].name} tile`);
  } else if (edit.kind === 'identity') {
    syncSheet();
    announce(index, 'identity', () => `Player ${index + 1}, ${identityText(game.identities[index])}`);
  } else if (edit.kind === 'poison') {
    announce(index, 'poison', () => `Player ${index + 1}, ${game.poison[index]} poison`);
  } else if (edit.kind === 'casts') {
    announce(index, 'casts', () => `Player ${index + 1}, commander tax ${game.casts[index] * 2}`);
  } else if (edit.kind === 'damage') {
    const { attacker } = edit;
    announce(index, `damage ${attacker}`, () =>
      `Player ${attacker + 1}'s commander, ${game.commanderDamage[index][attacker]} damage to Player ${index + 1}`);
    announceLife(index);
    syncSeatMap(index);
  }
  syncCounterRows(index);
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

// A counter row laid out like the life controls: − on the reader's left, the count, + on the right.
function buildCounterRow(kind, index) {
  const name = `Player ${index + 1}`;
  const [subtract, add] = ['minus', 'plus'].map((glyph) => {
    const button = element('button', '', icon(glyph));
    button.type = 'button';
    return button;
  });
  const value = element('output', 'counter-value', icon(kind === 'poison' ? 'flask' : 'crown'), element('b'));
  value.dataset.kind = kind;
  const row = element('div', 'counter-row', subtract, value, add);
  if (kind === 'poison') {
    bindCounter(subtract, () => stepCount('poison', index, -1), `Remove one poison counter from ${name}`);
    bindCounter(add, () => stepCount('poison', index, 1), `Add one poison counter to ${name}`);
  } else {
    bindCounter(subtract, () => stepCount('casts', index, -1), `Remove one commander cast from ${name}`);
    bindCounter(add, () => stepCount('casts', index, 1), `Add one commander cast for ${name}`);
  }
  return row;
}

function syncCounterRows(index) {
  const layer = board.children[index]?.querySelector('.counter-rows');
  if (!layer) return;
  for (const value of layer.querySelectorAll('.counter-value')) {
    const poison = value.dataset.kind === 'poison';
    value.querySelector('b').textContent = poison ? game.poison[index] : `+${game.casts[index] * 2}`;
    value.setAttribute('aria-label', poison ? `${game.poison[index]} poison`
      : `Commander tax ${game.casts[index] * 2}, ${game.casts[index]} ${game.casts[index] === 1 ? 'cast' : 'casts'}`);
  }
}

// Each tile's layer for the open mode, facing its player.
function renderModeLayer(player, index) {
  const layer = player.querySelector('.mode-layer');
  layer.replaceChildren();
  if (boardMode === 'colours') {
    const hint = element('p', 'layer-hint', 'Your tile colour');
    hint.setAttribute('aria-hidden', 'true');
    layer.append(hint, buildSwatches(index, colour => chooseColour(index, colour)));
  } else if (boardMode === 'damage') {
    const hint = element('p', 'layer-hint', 'Tap +1 · hold −1');
    hint.setAttribute('aria-hidden', 'true');
    layer.append(hint, buildSeatMap(index));
  } else if (boardMode === 'counters') {
    const rows = element('div', 'counter-rows');
    if (game.counters.poison) rows.append(buildCounterRow('poison', index));
    if (game.counters.commander) rows.append(buildCounterRow('casts', index));
    const palette = element('button', 'palette-button', icon('palette'), element('span', 'word', 'Colour'));
    palette.type = 'button';
    palette.setAttribute('aria-label', game.counters.commander
      ? `Tile colour and colour identity for Player ${index + 1}` : `Tile colour for Player ${index + 1}`);
    palette.setAttribute('aria-haspopup', 'dialog');
    palette.addEventListener('click', () => openPlayerSheet(index, palette));
    rows.append(palette);
    layer.append(rows);
  }
  layer.hidden = layer.childElementCount === 0;
  syncCounterRows(index);
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

// The badge rows, each only when it has something to show. The far edge, toward the table, holds commander
// damage, one chip per opponent with a dot in their colour, largest first. The near edge holds colour
// identity, poison and tax, each only when it's set and its switch is on.
function renderBadges(index) {
  const player = board.children[index];
  if (!player) return;
  const far = player.querySelector('.badges.far');
  const damage = game.counters.commander ? game.commanderDamage[index]
    .map((amount, attacker) => ({ amount, attacker })).filter(({ amount }) => amount > 0)
    .sort((a, b) => b.amount - a.amount || a.attacker - b.attacker) : [];
  far.replaceChildren(...damage.map(({ amount, attacker }) => {
    const chip = element('span', 'chip', inColourOf(element('span', 'dot'), attacker), String(amount),
      visuallyHidden(` commander damage from Player ${attacker + 1}`));
    chip.setAttribute('role', 'listitem');
    const level = dangerLevel(amount, commanderWarning, commanderLethal);
    if (level) chip.dataset.level = level;
    return chip;
  }));
  far.hidden = damage.length === 0;
  fitBadgeRow(far);
  const near = player.querySelector('.badges.near');
  const chips = [];
  const identity = game.counters.commander ? game.identities[index] : '';
  if (identity) {
    const pips = [...identity].map((id) => {
      const pip = element('span', 'pip');
      pip.dataset.pip = id;
      return pip;
    });
    chips.push(element('span', 'chip pips', ...pips, visuallyHidden(identityText(identity))));
  }
  if (game.counters.poison && game.poison[index] > 0) {
    const chip = element('span', 'chip', icon('flask'), String(game.poison[index]), visuallyHidden(' poison'));
    const level = dangerLevel(game.poison[index], poisonWarning, poisonLethal);
    if (level) chip.dataset.level = level;
    chips.push(chip);
  }
  if (game.counters.commander && game.casts[index] > 0) {
    chips.push(element('span', 'chip', visuallyHidden('Commander tax '), icon('crown'), `+${game.casts[index] * 2}`));
  }
  for (const chip of chips) chip.setAttribute('role', 'listitem');
  near.replaceChildren(...chips);
  near.hidden = chips.length === 0;
  fitBadgeRow(near);
}

// The centre pill: commander damage (when Commander is on), counters (when a counter is on), dice and setup
// at rest; Undo, save and ✕ while editing.
function syncPill() {
  const editing = editingModes.includes(boardMode);
  damageButton.hidden = boardMode !== null || !game.counters.commander;
  countersButton.hidden = boardMode !== null || !(game.counters.commander || game.counters.poison);
  diceButton.hidden = boardMode !== null;
  setupButton.hidden = editing;
  for (const button of [undoButton, saveButton, cancelButton]) button.hidden = !editing;
  undoButton.disabled = !edits?.length;
}

// The player sheet: tile colour, and colour identity when Commander is on. It faces the player who opened it.
function openPlayerSheet(index, opener) {
  sheetPlayer = index;
  sheetOpener = opener;
  const player = board.children[index];
  const angle = (Number(document.querySelector('.app').dataset.boardTurn) + faceAngles[player.dataset.edge]) % 360;
  playerSheet.style.setProperty('--sheet-angle', `${angle}deg`);
  playerSheet.toggleAttribute('data-sideways', angle % 180 !== 0);
  playerSheet.dataset.colour = player.dataset.colour;
  playerSheet.dataset.row = player.dataset.row;
  document.querySelector('#player-sheet-name').textContent = `Player ${index + 1}`;
  document.querySelector('#sheet-swatches').replaceChildren(buildSwatches(index, colour => chooseColour(index, colour)));
  document.querySelector('#sheet-identity').hidden = !game.counters.commander;
  syncSheet();
  playerSheet.showModal();
  syncBackHandling();
}

// Keeps the open sheet's identity toggles and colour dot up to date.
function syncSheet() {
  if (sheetPlayer === null) return;
  const identity = game.identities[sheetPlayer];
  for (const toggle of identityToggles.children) toggle.setAttribute('aria-pressed', String(identity.includes(toggle.value)));
  playerSheet.dataset.colour = swatches[game.colors[sheetPlayer]].id;
}

for (const colour of identityColours) {
  const pip = element('span', 'pip');
  pip.dataset.pip = colour.id;
  const toggle = element('button', 'identity-toggle', pip, colour.id);
  toggle.type = 'button';
  toggle.value = colour.id;
  toggle.setAttribute('aria-label', colour.name[0].toUpperCase() + colour.name.slice(1));
  // Colourless can't be combined with a colour, so choosing one clears the other.
  toggle.addEventListener('click', () => {
    const identity = game.identities[sheetPlayer];
    let next;
    if (colour.id === 'C') next = identity === 'C' ? '' : 'C';
    else if (identity.includes(colour.id)) next = identity.replace(colour.id, '');
    else next = normalizeIdentity(identity.replace('C', '') + colour.id);
    setIdentity(sheetPlayer, next);
  });
  identityToggles.append(toggle);
}
playerSheet.querySelector('[data-close]').addEventListener('click', () => playerSheet.close());
playerSheet.addEventListener('close', () => {
  sheetPlayer = null;
  document.querySelector('#sheet-swatches').replaceChildren();
  syncBackHandling();
  if (sheetOpener?.isConnected) sheetOpener.focus();
  sheetOpener = null;
});

// Board-wide modes. Seat rotation and tile colours end with the check mark that replaces the setup button.
// Counters mode ends with save or ✕, and keeps a list of its edits until then.
function setBoardMode(mode) {
  cancelPresses();
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
  fitAllBadges();
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
  paintColours();
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
  score.style.setProperty('--digits', value.length);
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
      game.scores[index] = next;
      renderScore(index);
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
  game.poison = fitCounts([], playerCount);
  game.casts = fitCounts([], playerCount);
  game.identities = fitIdentities(game.identities, playerCount);
  game.commanderDamage = fitDamage([], playerCount);
  game.startingLife = startingLife;
  game.scores = Array(playerCount).fill(startingLife);
  // A new game takes the screen's current landscape as upright.
  game.landscapeAngle = currentLandscapeAngle();
  saveGame();
  syncBoardTurn();
  renderBoard();
}

function readStartingLife() {
  const value = startingLifeInput.value.trim();
  const number = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(number) && number > 0 ? number : null;
}

function setupChangesGame() {
  return selectedPlayerCount !== game.scores.length || readStartingLife() !== game.startingLife;
}

function renderSetup() {
  for (const choice of playerChoices.children) {
    choice.setAttribute('aria-pressed', String(Number(choice.value) === selectedPlayerCount));
  }
  for (const preset of lifePresets.children) {
    preset.setAttribute('aria-pressed', String(Number(preset.dataset.life) === readStartingLife()));
  }
  const changesGame = setupChangesGame();
  document.querySelector('#save-setup').textContent = changesGame ? 'Start new game' : 'Done';
  document.querySelector('#restart-button').hidden = changesGame;
  rotateSeatsButton.hidden = changesGame;
  tileColoursButton.hidden = changesGame;
  lifeError.hidden = true;
  startingLifeInput.removeAttribute('aria-invalid');
  startingLifeInput.removeAttribute('aria-describedby');
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

for (const preset of lifePresets.children) {
  preset.addEventListener('click', () => {
    startingLifeInput.value = preset.dataset.life;
    renderSetup();
  });
}

startingLifeInput.addEventListener('input', renderSetup);
setupButton.addEventListener('click', () => {
  if (boardMode) {
    setBoardMode(null);
    return;
  }
  selectedPlayerCount = game.scores.length;
  startingLifeInput.value = game.startingLife;
  wakeInput.checked = game.keepAwake;
  commanderSwitch.checked = game.counters.commander;
  poisonSwitch.checked = game.counters.poison;
  renderSetup();
  setup.showModal();
  syncBackHandling();
});
setup.querySelector('[data-close]').addEventListener('click', () => setup.close());
// The privacy summary opens from setup and returns to it. The apps can't open web pages, so it's shown here.
document.querySelector('#privacy-button').addEventListener('click', () => {
  setup.close();
  privacy.showModal();
  syncBackHandling();
});
privacy.addEventListener('close', () => {
  setup.showModal();
  syncBackHandling();
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
  const startingLife = readStartingLife();
  if (startingLife === null) {
    lifeError.hidden = false;
    startingLifeInput.setAttribute('aria-invalid', 'true');
    startingLifeInput.setAttribute('aria-describedby', 'life-error');
    startingLifeInput.focus();
    return;
  }
  if (setupChangesGame()) startGame(selectedPlayerCount, startingLife);
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
  setupButton.focus();
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
undoButton.addEventListener('click', undoEdit);
saveButton.addEventListener('click', () => {
  saveGame();
  setBoardMode(null);
});
cancelButton.addEventListener('click', cancelEditing);
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
for (const [input, key] of [[commanderSwitch, 'commander'], [poisonSwitch, 'poison']]) {
  input.addEventListener('change', () => {
    game.counters[key] = input.checked;
    saveGame();
    game.scores.forEach((_, index) => {
      renderScore(index);
      renderBadges(index);
    });
    syncPill();
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelPresses();
  else if (!android && !ios) syncWakeLock();
});
window.screen.orientation?.addEventListener?.('change', syncBoardTurn);
window.addEventListener('orientationchange', syncBoardTurn);
window.addEventListener('resize', syncBoardTurn);
portraitQuery.addEventListener('change', syncBoardTurn);
syncBoardTurn();
renderBoard();
syncPill();
syncWakeLock();
syncBackHandling();
