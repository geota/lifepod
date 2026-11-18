'use strict';

const storageKey = 'lifepod-game';
const legacyStorageKey = 'life-pad-game';
const android = window.LifePodAndroid;
const ios = window.webkit?.messageHandlers;
const board = document.querySelector('#board');
const playerTemplate = document.querySelector('#player-template');
const wakeInput = document.querySelector('#keep-awake');
const setupButton = document.querySelector('#setup-button');
const rotateSeatsButton = document.querySelector('#rotate-seats');
const setup = document.querySelector('#setup');
const setupForm = document.querySelector('#setup-form');
const playerChoices = document.querySelector('#player-choices');
const startingLifeInput = document.querySelector('#starting-life');
const lifePresets = document.querySelector('#life-presets');
const lifeError = document.querySelector('#life-error');
const restart = document.querySelector('#restart');
const landscape = matchMedia('(orientation: landscape)');
const clockwiseEdges = ['bottom', 'left', 'top', 'right'];
const seatEdges = {
  2: [['top', 'bottom'], ['left', 'right']],
  3: [['top', 'top', 'bottom'], ['top', 'bottom', 'right']],
  4: [['top', 'top', 'bottom', 'bottom'], ['top', 'top', 'bottom', 'bottom']],
  5: [['top', 'top', 'bottom', 'bottom', 'bottom'], ['top', 'top', 'bottom', 'bottom', 'right']],
  6: [['top', 'top', 'bottom', 'bottom', 'bottom', 'bottom'], ['top', 'top', 'top', 'bottom', 'bottom', 'bottom']],
  7: [['top', 'top', 'top', 'top', 'bottom', 'bottom', 'bottom'], ['top', 'top', 'top', 'bottom', 'bottom', 'bottom', 'right']],
  8: [['top', 'top', 'top', 'top', 'bottom', 'bottom', 'bottom', 'bottom'], ['top', 'top', 'top', 'top', 'bottom', 'bottom', 'bottom', 'bottom']],
};

let game = loadGame();
let selectedPlayerCount = game.scores.length;
let repeatTimer;
let repeatingPointer;
let lock;
let requestingLock = false;
let rotatingSeats = false;

function loadGame() {
  const defaults = { startingLife: 40, scores: [40, 40, 40, 40], rotations: [0, 0, 0, 0], keepAwake: true };
  try {
    const snapshot = android ? android.readGame() : ios ? window.initialGame :
      localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey);
    const saved = JSON.parse(snapshot);
    if (!saved || !Array.isArray(saved.scores) || saved.scores.length < 2 || saved.scores.length > 8 ||
        !saved.scores.every(Number.isSafeInteger) || !Number.isSafeInteger(saved.startingLife) || saved.startingLife < 1) {
      return defaults;
    }
    const rotations = saved.scores.map((_, index) => {
      const turn = saved.rotations?.[index];
      return Number.isInteger(turn) && turn >= 0 && turn < clockwiseEdges.length ? turn : 0;
    });
    return { startingLife: saved.startingLife, scores: saved.scores, rotations, keepAwake: saved.keepAwake !== false };
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

function stopRepeating() {
  clearTimeout(repeatTimer);
  repeatingPointer = undefined;
}

function bindCounter(button, adjust, label) {
  button.setAttribute('aria-label', label);
  let repeated = false;

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || repeatingPointer !== undefined) return;
    repeated = false;
    repeatingPointer = event.pointerId;
    button.setPointerCapture(event.pointerId);
    function repeat() {
      repeated = true;
      adjust();
      repeatTimer = setTimeout(repeat, 100);
    }
    repeatTimer = setTimeout(repeat, 420);
  });
  button.addEventListener('pointermove', (event) => {
    if (event.pointerId !== repeatingPointer || !button.hasPointerCapture(event.pointerId)) return;
    const bounds = button.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) {
      repeated = true;
      stopRepeating();
    }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, (event) => {
      if (event.pointerId === repeatingPointer) stopRepeating();
    });
  }
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  button.addEventListener('click', (event) => {
    if (!repeated || event.detail === 0) adjust();
    repeated = false;
  });
}

function orientBoard() {
  const [portraitEdges, landscapeEdges] = seatEdges[game.scores.length];
  const edges = landscape.matches ? landscapeEdges : portraitEdges;
  board.dataset.landscape = String(landscape.matches);
  for (const [index, player] of Array.from(board.children).entries()) {
    const turn = (clockwiseEdges.indexOf(edges[index]) + game.rotations[index]) % clockwiseEdges.length;
    player.dataset.edge = clockwiseEdges[turn];
  }
}

function setRotationMode(enabled) {
  rotatingSeats = enabled;
  stopRepeating();
  for (const player of board.children) {
    player.querySelector('.controls').inert = enabled;
    player.querySelector('.rotate-seat').hidden = !enabled;
  }
  setupButton.dataset.rotating = String(enabled);
  setupButton.setAttribute('aria-label', enabled ? 'Done rotating seats' : 'Game setup');
  setupButton.setAttribute('aria-haspopup', enabled ? 'false' : 'dialog');
  setupButton.querySelector('.setup-icon').hidden = enabled;
  setupButton.querySelector('.rotation-done').hidden = !enabled;
  (enabled ? board.querySelector('.rotate-seat') : setupButton).focus();
}

function renderBoard() {
  stopRepeating();
  board.dataset.count = game.scores.length;
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
    }
    function changeLife(delta) {
      const next = game.scores[index] + delta;
      if (!Number.isSafeInteger(next)) return;
      game.scores[index] = next;
      renderScore();
      saveGame();
    }

    bindCounter(player.querySelector('.subtract'), () => changeLife(-1), `Subtract one life from ${name}`);
    bindCounter(player.querySelector('.add'), () => changeLife(1), `Add one life to ${name}`);
    const rotateSeat = player.querySelector('.rotate-seat');
    rotateSeat.setAttribute('aria-label', `Rotate ${name} clockwise`);
    rotateSeat.addEventListener('click', () => {
      game.rotations[index] = (game.rotations[index] + 1) % clockwiseEdges.length;
      orientBoard();
      saveGame();
    });
    renderScore();
    return player;
  });
  board.replaceChildren(...players);
  orientBoard();
}

function startGame(playerCount, startingLife) {
  if (playerCount !== game.scores.length) game.rotations = Array(playerCount).fill(0);
  game.startingLife = startingLife;
  game.scores = Array(playerCount).fill(startingLife);
  saveGame();
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

for (let count = 2; count <= 8; count += 1) {
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
});
setup.querySelector('[data-close]').addEventListener('click', () => setup.close());
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
});
restart.addEventListener('close', () => {
  if (restart.returnValue === 'restart') startGame(game.scores.length, game.startingLife);
  setupButton.focus();
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
  if (document.hidden) stopRepeating();
  else if (!android && !ios) syncWakeLock();
});
landscape.addEventListener('change', orientBoard);

renderBoard();
syncWakeLock();
