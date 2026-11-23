import {
  chooseColour, stepCount, stepDamage, stepMana, toggleDesignation, toggleIdentity, undoEdit,
} from './js/actions/edits.js';
import { clearPool, endUndoClears, spendMana, undoClear } from './js/actions/mana.js';
import {
  askFirst, cancelEditing, chooseFirst, discardEdits, leaveBoardMode, maybeAskFirst, setAskFirst, setBoardMode,
  shuffleFirst,
} from './js/actions/mode.js';
import { clearReminders, dismissReminder, remind } from './js/actions/reminders.js';
import { startTurn, stepBack, stepTurn } from './js/actions/turns.js';
import { layoutBoard, measureBoard, syncBoardTurn } from './js/layout/board.js';
import { requestFit, resetDrops } from './js/layout/fit.js';
import {
  compactGroups, fitCompactSwitches, keepLifeEditorInView, lifeEditor, placeSettingsSections, settings, settingsBody,
  syncSettingsCue,
} from './js/layout/settings.js';
import {
  badgeSizeOrder, badgeSizes, clockwiseEdges, countKinds, maxStartingLife, playerCounts, tileSetOrder, tileSets,
  trackers,
} from './js/logic/data.js';
import { isOut, leavingTransfers, outPlayers, trackedDesignations } from './js/logic/rules.js';
import { fitColors, fitCounts, fitDamage, fitIdentities, fitPools, fitTurn } from './js/logic/save.js';
import { announceDesignation, announceLife, clearAnnouncements } from './js/render/announce.js';
import { applyBadgeSize, applyStyle, applyTileColours, currentStyle } from './js/render/appearance.js';
import { renderBadges, renderPassHints, setBadgeActions } from './js/render/badges.js';
import { setModeActions } from './js/render/modes.js';
import { syncPill } from './js/render/pill.js';
import { paintColours, renderScore } from './js/render/tile.js';
import {
  android, currentLandscapeAngle, haptic, ios, portraitQuery, reducedMotion, setReduceTransparency, syncWakeLock,
} from './js/state/platform.js';
import {
  boardMode, clearedPools, editStartHolders, game, saveGame, syncBackHandling, turnSteps,
} from './js/state/state.js';
import {
  board, cancelButton, countersButton, damageButton, diceButton, discardDialog, element, icon, manaButton,
  playerTemplate, roundBackButton, roundButton, saveButton, setupButton, shuffleButton, undoButton,
} from './js/ui/dom.js';
import { bindCounter, bindStep, bindTap, cancelPresses } from './js/ui/press.js';

/** @typedef {import('./js/logic/data.js').IdentityPart} IdentityPart */
/** @typedef {import('./js/logic/data.js').Reminders} Reminders */
/** @typedef {import('./js/logic/data.js').Style} Style */
/** @typedef {import('./js/logic/data.js').TurnMode} TurnMode */

const wakeInput = /** @type {HTMLInputElement} */ (document.querySelector('#keep-awake'));
const diceDialog = /** @type {HTMLDialogElement} */ (document.querySelector('#dice'));
const diceStage = /** @type {HTMLDivElement} */ (document.querySelector('#dice-stage'));
const dicePicker = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#dice-picker'));
const diceRoll = /** @type {HTMLButtonElement} */ (document.querySelector('#dice-roll'));
const diceResult = /** @type {HTMLParagraphElement} */ (document.querySelector('#dice-result'));
const rotateSeatsButton = /** @type {HTMLButtonElement} */ (document.querySelector('#rotate-seats'));
const tileColoursButton = /** @type {HTMLButtonElement} */ (document.querySelector('#tile-colours'));
const settingsForm = /** @type {HTMLFormElement} */ (document.querySelector('#settings-form'));
const settingsFlip = /** @type {HTMLButtonElement} */ (document.querySelector('#settings-flip'));
const settingsDone = /** @type {HTMLButtonElement} */ (document.querySelector('#save-setup'));
const settingsPending = /** @type {HTMLParagraphElement} */ (document.querySelector('#settings-pending'));
const restartButton = /** @type {HTMLButtonElement} */ (document.querySelector('#restart-button'));
const playerChoices = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#player-choices'));
const lifePresets = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#life-presets'));
const lifeEdit = /** @type {HTMLButtonElement} */ (document.querySelector('#life-edit'));
const lifeValue = /** @type {HTMLSpanElement} */ (document.querySelector('#life-value'));
const lifeInput = /** @type {HTMLInputElement} */ (document.querySelector('#life-input'));
const manaSwitch = /** @type {HTMLInputElement} */ (document.querySelector('#mana-switch'));
const autoEmptySwitch = /** @type {HTMLInputElement} */ (document.querySelector('#auto-empty-switch'));
const autoEmptyRow = /** @type {HTMLLabelElement} */ (document.querySelector('#auto-empty-row'));
const turnChoices = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#turn-choices'));
const identityNote = /** @type {HTMLParagraphElement} */ (document.querySelector('#identity-note'));
const identityShowSwitches = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('#identity-show input'));
const identityBackgroundChoices = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#identity-background'));
const chooseIdentitiesButton = /** @type {HTMLButtonElement} */ (document.querySelector('#choose-identities'));
const restart = /** @type {HTMLDialogElement} */ (document.querySelector('#restart'));
let selectedPlayerCount = game.scores.length;
// Settings' starting life, before Done applies it. selectedPlayerCount above is the same for players.
let selectedLife = game.startingLife;
let diceSides = 20;
let die;
let stopRoll;

// Hands on whatever a change at rest (a life total, or a Track switch) took out of the game with its holder, announces
// it, and reminds a new initiative holder to venture.
function handOnLeavers(wasOut) {
  const transfers = leavingTransfers(game, wasOut);
  for (const transfer of transfers) {
    game[transfer.kind] = transfer.to;
    for (const player of [transfer.from, transfer.to]) if (player !== null) renderBadges(player);
    announceDesignation(transfer.kind);
    if (transfer.kind === 'initiative') remind(transfer.to, 'initiative');
  }
  if (transfers.length) saveGame();
}

function renderBoard() {
  cancelPresses();
  clearAnnouncements();
  const players = game.scores.map((_, index) => {
    const player = /** @type {HTMLElement} */ (/** @type {Element} */ (playerTemplate.content.firstElementChild).cloneNode(true));
    const name = `Player ${index + 1}`;
    player.setAttribute('aria-label', name);
    const score = player.querySelector('.score');

    function changeLife(delta) {
      const next = game.scores[index] + delta;
      if (!Number.isSafeInteger(next)) return;
      const out = outPlayers(game);
      game.scores[index] = next;
      renderScore(index);
      // A player who is out has no chip to start a turn, and hands on the monarch and the initiative.
      if (isOut(game, index) !== out.has(index)) {
        renderBadges(index);
        handOnLeavers(out);
        renderPassHints();
      }
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

/**
 * @param {number} playerCount
 * @param {number} startingLife
 */
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
  // Nobody is the monarch or has the initiative until an effect says so.
  game.monarch = null;
  game.initiative = null;
  clearReminders();
  turnSteps.length = 0;
  for (const { timer } of clearedPools.values()) clearTimeout(timer);
  clearedPools.clear();
  game.startingLife = startingLife;
  game.scores = Array(playerCount).fill(startingLife);
  // A new game takes the screen's current landscape as upright.
  game.landscapeAngle = currentLandscapeAngle();
  // A new game starts with every badge at full size.
  resetDrops();
  saveGame();
  syncBoardTurn();
  renderBoard();
  syncPill();
  setAskFirst(game.turns !== 'off');
  maybeAskFirst();
}

// Settings (design/polish/SETTINGS-SPEC.md). Players and starting life wait for Done: a change to either is a pending
// new game (P1), which Done, renamed "Start new game", or a board action starts. ✕, Escape and Android back drop it.
function settingsChangeGame() {
  return selectedPlayerCount !== game.scores.length || selectedLife !== game.startingLife;
}

// Track's own state: the switches, the Turns choice, and the auto-empty switch, which only shows while it applies.
function renderTrackSheet() {
  for (const tracker of trackers) /** @type {HTMLInputElement} */ (document.querySelector(`#${tracker}-switch`)).checked = game.counters[tracker];
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
  // left to the page, which scrolls (touch-action: pan-y), so the slider never traps a scroll; and where the browser
  // doesn't take the swipe over, it still isn't a tap. A tap on a stop is left to the stop's own click.
  let pointer;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let swiping = false;
  let onStop = false;
  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || pointer !== undefined) return;
    pointer = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dragging = false;
    swiping = false;
    onStop = event.target.closest('.k-stop') !== null;
  });
  root.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointer || swiping) return;
    const across = Math.abs(event.clientX - startX);
    const down = Math.abs(event.clientY - startY);
    if (!dragging) {
      if (across < 6 && down < 6) return;
      if (down > across) {
        swiping = true;
        return;
      }
      dragging = true;
      root.setPointerCapture?.(event.pointerId);
    }
    change(valueAt(event.clientX));
  });
  const end = (event, lifted) => {
    if (event.pointerId !== pointer) return;
    if (lifted && !dragging && !swiping && !onStop) change(valueAt(event.clientX));
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
  choice.value = String(count);
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
const tileSetChoices = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#tile-set-choices'));
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

// Badge size: saved the moment it changes, like Tile colours. The rows are fitted again from full size, as at a new game.
const badgeSizeChoices = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#badge-size-choices'));
function setBadgeSize(size) {
  if (size === game.badgeSize) return;
  game.badgeSize = size;
  saveGame();
  applyBadgeSize();
  resetDrops();
  requestFit();
  renderBadgeSizeSetting();
}
const badgeSizeSlider = notchedSlider({
  root: document.querySelector('#badge-size-slider'), min: 0, max: 2, snap: 1, step: 1, page: 1, lowest: 0, highest: 2,
  get: () => badgeSizeOrder.indexOf(game.badgeSize),
  set: at => setBadgeSize(badgeSizeOrder[at]),
  describe: at => `${badgeSizes[badgeSizeOrder[at]]} badges`,
});
for (const choice of badgeSizeChoices.children) choice.addEventListener('click', () => setBadgeSize(choice.dataset.size));
function renderBadgeSizeSetting() {
  for (const choice of badgeSizeChoices.children) choice.setAttribute('aria-pressed', String(choice.dataset.size === game.badgeSize));
  badgeSizeSlider.render();
}
// The compact switch groups are checked whenever the settings body changes size (fitCompactSwitches).
new ResizeObserver(() => compactGroups.forEach(fitCompactSwitches)).observe(settingsBody);

// Style: saved the moment it's picked, after which it wins over the platform's default.
const styleChoices = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#style-choices'));
function renderStyleSetting() {
  for (const choice of styleChoices.children) choice.setAttribute('aria-pressed', String(choice.dataset.choice === currentStyle()));
}
for (const choice of styleChoices.children) {
  choice.addEventListener('click', () => {
    if (choice.dataset.choice === game.style) return;
    game.style = /** @type {Style} */ (choice.dataset.choice);
    saveGame();
    applyStyle();
    renderStyleSetting();
    compactGroups.forEach(fitCompactSwitches);
  });
}
// The iOS app passes Reduce Transparency in before the page loads, and calls this whenever it changes.
window.setReduceTransparency = setReduceTransparency;
setReduceTransparency(window.initialReduceTransparency);

function renderSettings() {
  for (const choice of playerChoices.children) choice.setAttribute('aria-pressed', String(Number(choice.value) === selectedPlayerCount));
  for (const preset of lifePresets.children) preset.setAttribute('aria-pressed', String(Number(preset.dataset.life) === selectedLife));
  playersSlider.render();
  lifeSlider.render();
  lifeValue.textContent = String(selectedLife);
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
  if (!lifeEditor.contains(/** @type {Node | null} */ (event.relatedTarget))) closeLifeEditor(true, false);
});
window.visualViewport?.addEventListener('resize', keepLifeEditorInView);
settingsBody.addEventListener('scroll', syncSettingsCue, { passive: true });

function openSettings() {
  selectedPlayerCount = game.scores.length;
  selectedLife = game.startingLife;
  wakeInput.checked = game.keepAwake;
  settings.removeAttribute('data-flipped');
  settingsFlip.setAttribute('aria-pressed', 'false');
  renderSettings();
  renderTrackSheet();
  renderRemindersSection();
  renderIdentitySheet();
  renderTileSetting();
  renderBadgeSizeSetting();
  renderStyleSetting();
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
    const mode = /** @type {TurnMode} */ (choice.dataset.turns);
    const was = game.turns;
    if (mode === was) return;
    game.turns = mode;
    turnSteps.length = 0;
    if (was !== 'off' && mode !== 'off') game.turn.active = null;
    // Turn reminders are only for Turn by turn.
    if (mode !== 'turns') clearReminders();
    setAskFirst(was === 'off' && mode !== 'off' ? game.turn.first === null : askFirst && mode !== 'off');
    saveGame();
    renderTrackSheet();
    renderRemindersSection();
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

// Reminders: each switch saves the moment it changes. Turn reminders shows only while the monarch or the initiative is on
// and Turns is Turn by turn, and Pass-it-on hints while either is on; Gesture hints always shows.
const reminderSwitches = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('#settings-reminders input[data-reminder]'));
function renderRemindersSection() {
  const designated = trackedDesignations(game).length > 0;
  for (const input of reminderSwitches) {
    input.checked = game.reminders[/** @type {keyof Reminders} */ (input.dataset.reminder)];
    const row = input.closest('.switch-row');
    row.hidden = input.dataset.reminder === 'turns' ? !designated || game.turns !== 'turns'
      : input.dataset.reminder === 'passOn' ? !designated : false;
  }
  syncSettingsCue();
}
for (const input of reminderSwitches) {
  input.addEventListener('change', () => {
    game.reminders[/** @type {keyof Reminders} */ (input.dataset.reminder)] = input.checked;
    saveGame();
    if (input.dataset.reminder === 'turns' && !input.checked) {
      clearReminders();
      game.scores.forEach((_, index) => renderBadges(index));
    }
    if (input.dataset.reminder === 'passOn') renderPassHints();
    // Without the hints, the map's seats have their room.
    if (input.dataset.reminder === 'gestures') measureBoard();
  });
}

// Identity: what tiles show of each identity, saved the moment it changes.
function renderIdentitySheet() {
  for (const toggle of identityShowSwitches) toggle.checked = game.identity.show[/** @type {IdentityPart} */ (toggle.dataset.show)];
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
    identity.show[/** @type {IdentityPart} */ (toggle.dataset.show)] = toggle.checked;
  }));
}
for (const choice of identityBackgroundChoices.children) {
  choice.addEventListener('click', () => changeIdentitySettings((identity) => {
    identity.background = choice.dataset.background;
  }));
}

// Choose identities, Colours and Rotate seats close settings and start their board mode, starting a pending new game
// first. The mode's check mark returns to the board.
/** @param {'identity' | 'rotate' | 'colours'} mode */
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
  choice.value = String(sides);
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
  // Whoever took the initiative in the mode, by commander damage or a tap, ventures into Undercity.
  const taker = game.initiative !== editStartHolders.initiative ? game.initiative : null;
  setBoardMode(null);
  remind(taker, 'initiative');
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
  const openDialog = [.../** @type {NodeListOf<HTMLDialogElement>} */ (document.querySelectorAll('dialog[open]'))].at(-1);
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
  syncWakeLock(() => game.keepAwake);
});
// The counter switches are saved at once and stay on across launches and new games.
for (const tracker of trackers) {
  const input = /** @type {HTMLInputElement} */ (document.querySelector(`#${tracker}-switch`));
  input.addEventListener('change', () => {
    // Poison and Commander decide who is out, so switching one on can put a holder out of the game.
    const out = outPlayers(game);
    game.counters[tracker] = input.checked;
    saveGame();
    game.scores.forEach((_, index) => {
      renderScore(index);
      renderBadges(index);
    });
    handOnLeavers(out);
    syncPill();
    // Seven counter cells need a wider grid.
    measureBoard();
    renderRemindersSection();
  });
}
// "Who goes first?" waits for settings and the new game dialog to close. These listeners run after each dialog's own.
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('close', maybeAskFirst);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelPresses();
  else if (!android && !ios) syncWakeLock(() => game.keepAwake);
});
window.screen.orientation.addEventListener('change', syncBoardTurn);
window.addEventListener('resize', syncBoardTurn);
portraitQuery.addEventListener('change', syncBoardTurn);
// The board's size can also change without a resize event, such as when a browser's toolbar slides away.
if (window.ResizeObserver) new ResizeObserver(measureBoard).observe(board);
// Identity symbols come from the Mana font. Rows fitted before it loaded were measured with another font's glyphs,
// so they're fitted again from full size once it has. The board is turned and measured again first: a font can
// finish loading in the middle of a resize or a rotation, before the board has caught up with the window.
document.fonts?.addEventListener?.('loadingdone', () => {
  resetDrops();
  syncBoardTurn();
  compactGroups.forEach(fitCompactSwitches);
});
// WebKit can fire `loading` and never `loadingdone`, so each load also fits the board again once document.fonts.ready
// settles, keeping the drops it has (the hysteresis decides): a face that arrives late can't leave a mana strip or a
// badge row placed by another font's measurements, over a total.
document.fonts?.addEventListener?.('loading', () => document.fonts.ready.then(() => {
  syncBoardTurn();
  compactGroups.forEach(fitCompactSwitches);
}));
// A module's names aren't page globals, so the design scripts (design/polish/final-review.mjs) reach the few internals they
// drive through ?debug in the URL. The apps never load the page with it.
if (new URLSearchParams(location.search).has('debug')) window.lifePodDebug = { game, remind };
// The renderers' buttons call these actions, which sit above them.
setBadgeActions({ stepTurn, stepBack, startTurn, spendMana, clearPool, undoClear, dismissReminder, setBoardMode });
setModeActions({ stepDamage, chooseColour, toggleIdentity, stepCount, toggleDesignation, stepMana, chooseFirst });
applyTileColours();
applyBadgeSize();
applyStyle();
syncBoardTurn();
renderBoard();
syncPill();
syncWakeLock(() => game.keepAwake);
syncBackHandling();
