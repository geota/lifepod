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

let game = loadGame();
let selectedPlayerCount = game.scores.length;
let lock;
let requestingLock = false;
let rotatingSeats = false;
let announceTimer;
const pendingAnnouncements = new Set();
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
}

function loadGame() {
  const defaults = {
    startingLife: 40, scores: [40, 40, 40, 40], rotations: [0, 0, 0, 0], keepAwake: true,
    landscapeAngle: currentLandscapeAngle(),
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

// Announce totals once a burst of changes settles, instead of on every step of a hold.
function announceLife(index) {
  pendingAnnouncements.add(index);
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    announcer.textContent = [...pendingAnnouncements].sort((a, b) => a - b)
      .map(player => `Player ${player + 1}, ${game.scores[player]} life`).join('. ');
    pendingAnnouncements.clear();
  }, 700);
}

// Android's back gesture only needs the page while a dialog or seat rotation is open.
function syncBackHandling() {
  android?.setBackHandling?.(rotatingSeats || document.querySelector('dialog[open]') !== null);
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
}

function setRotationMode(enabled) {
  rotatingSeats = enabled;
  cancelPresses();
  for (const player of board.children) {
    player.querySelector('.controls').inert = enabled;
    player.querySelector('.rotate-seat').hidden = !enabled;
  }
  board.toggleAttribute('data-rotating', enabled);
  boardControls.toggleAttribute('data-rotating', enabled);
  setupButton.setAttribute('aria-label', enabled ? 'Done rotating seats' : 'Game setup');
  setupButton.setAttribute('aria-haspopup', enabled ? 'false' : 'dialog');
  setupButton.querySelector('.setup-icon').hidden = enabled;
  setupButton.querySelector('.rotation-done').hidden = !enabled;
  (enabled ? board.querySelector('.rotate-seat') : setupButton).focus();
  syncBackHandling();
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

    function renderScore() {
      const value = String(game.scores[index]).replace('-', '−');
      score.value = value;
      score.setAttribute('aria-label', `${game.scores[index]} life`);
      score.style.setProperty('--digits', value.length);
      score.toggleAttribute('data-out', game.scores[index] <= 0);
    }
    function changeLife(delta) {
      const next = game.scores[index] + delta;
      if (!Number.isSafeInteger(next)) return;
      game.scores[index] = next;
      renderScore();
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
    renderScore();
    return player;
  });
  board.replaceChildren(...players);
  layoutBoard();
}

function startGame(playerCount, startingLife) {
  if (playerCount !== game.scores.length) game.rotations = Array(playerCount).fill(0);
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
  if (rotatingSeats) {
    setRotationMode(false);
    return;
  }
  selectedPlayerCount = game.scores.length;
  startingLifeInput.value = game.startingLife;
  wakeInput.checked = game.keepAwake;
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
  setRotationMode(true);
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

window.closeOpenDialog = () => {
  if (rotatingSeats) {
    setRotationMode(false);
    return true;
  }
  const openDialog = document.querySelector('dialog[open]');
  if (!openDialog) return false;
  openDialog.close('cancel');
  return true;
};
document.addEventListener('keydown', (event) => {
  if (rotatingSeats && event.key === 'Escape') setRotationMode(false);
});

wakeInput.addEventListener('change', () => {
  game.keepAwake = wakeInput.checked;
  saveGame();
  syncWakeLock();
});
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
syncWakeLock();
syncBackHandling();
