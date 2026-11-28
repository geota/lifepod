// The settings page (design/polish/SETTINGS-SPEC.md): opening and closing it, the Game section's players and starting
// life, which wait for Done as a pending new game, the life field, the flip, the header's New game, and the buttons that
// leave for a board mode. Importing this module wires it and the pill's setup button.

import { startGame } from '../actions/board.js';
import { showDialog } from '../actions/dialog.js';
import { setBoardMode } from '../actions/mode.js';
import {
  keepLifeEditorInView, lifeEditor, placeSettingsSections, settingsBody, settingsDialog, syncSettingsCue,
} from '../layout/settings.js';
import { maxStartingLife, playerCounts } from '../logic/data.js';
import { boardMode, game, syncBackHandling } from '../state/state.js';
import { element, icon, setupButton } from '../ui/dom.js';
import { renderOptions } from './options.js';
import { notchedSlider } from './slider.js';

const rotateSeatsButton = /** @type {HTMLButtonElement} */ (document.querySelector('#rotate-seats'));
const tileColoursButton = /** @type {HTMLButtonElement} */ (document.querySelector('#tile-colours'));
const settingsForm = /** @type {HTMLFormElement} */ (document.querySelector('#settings-form'));
const settingsFlip = /** @type {HTMLButtonElement} */ (document.querySelector('#settings-flip'));
const settingsDone = /** @type {HTMLButtonElement} */ (document.querySelector('#save-setup'));
const settingsPending = /** @type {HTMLParagraphElement} */ (document.querySelector('#settings-pending'));
const settingsStatus = /** @type {HTMLParagraphElement} */ (document.querySelector('#settings-status'));
const restartButton = /** @type {HTMLButtonElement} */ (document.querySelector('#restart-button'));
const playerChoices = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#player-choices'));
const lifePresets = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#life-presets'));
const lifeEdit = /** @type {HTMLButtonElement} */ (document.querySelector('#life-edit'));
const lifeValue = /** @type {HTMLSpanElement} */ (document.querySelector('#life-value'));
const lifeInput = /** @type {HTMLInputElement} */ (document.querySelector('#life-input'));
const chooseIdentitiesButton = /** @type {HTMLButtonElement} */ (document.querySelector('#choose-identities'));
const restart = /** @type {HTMLDialogElement} */ (document.querySelector('#restart'));
let selectedPlayerCount = game.scores.length;
// Settings' starting life, before Done applies it. selectedPlayerCount above is the same for players.
let selectedLife = game.startingLife;

// Settings (design/polish/SETTINGS-SPEC.md). Players and starting life wait for Done: a change to either is a pending
// new game (P1), which Done, renamed "Start new game", or a board action starts. ✕, Escape and Android back drop it.
function settingsChangeGame() {
  return selectedPlayerCount !== game.scores.length || selectedLife !== game.startingLife;
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
  // The slider is named "Starting life" already, so its value is just the number.
  describe: life => `${life} life`,
});

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
  // The pending line says what Done will do. ✕, Escape and back keep the current game.
  const words = pending ? `Starts a new game with ${selectedPlayerCount} players at ${selectedLife} life when you press Start new game.` : '';
  if (settingsPending.textContent !== words) settingsPending.replaceChildren(...(pending ? [icon('play'), element('span', '', words)] : []));
  settingsPending.toggleAttribute('data-empty', !pending);
  // Screen readers hear it once the slider settles, rather than with every step's value.
  sayLater(pending ? `${words} Close keeps the current game.` : '');
  syncSettingsCue();
}

// The settings page's live region (#settings-status): a message 700ms after the last change, like the board's
// announcer, and only when it says something new. say() speaks at once, for the life field's error.
let statusTimer;
let lastSaid = '';
/** @param {string} words */
function say(words) {
  clearTimeout(statusTimer);
  lastSaid = words;
  settingsStatus.textContent = words;
}
/** @param {string} words */
function sayLater(words) {
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    if (words !== lastSaid) say(words);
  }, 700);
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
  const valid = /^\d{1,3}$/.test(typed) && Number(typed) >= 1;
  // Enter or ✓ with something that isn't a life keeps the field open and says why (WCAG 3.3.1). Leaving the field, or
  // settings, puts the last value back.
  if (commit && refocus && !valid) {
    lifeInput.setAttribute('aria-invalid', 'true');
    say('Starting life is a whole number from 1 to 999');
    lifeInput.focus();
    lifeInput.select();
    return;
  }
  lifeInput.removeAttribute('aria-invalid');
  // Hidden first: hiding the field blurs it, and its focusout calls back in.
  lifeEditor.hidden = true;
  lifeEdit.hidden = false;
  if (commit && valid) selectedLife = Number(typed);
  settingsDialog.style.removeProperty('--keyboard');
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
  settingsDialog.removeAttribute('data-flipped');
  settingsFlip.setAttribute('aria-pressed', 'false');
  renderSettings();
  renderOptions();
  placeSettingsSections();
  showDialog(settingsDialog);
  // Settings always open at the top.
  settingsBody.scrollTop = 0;
  syncSettingsCue();
}
setupButton.addEventListener('click', () => {
  if (boardMode) {
    setBoardMode(null);
    return;
  }
  openSettings();
});
document.querySelector('#settings-close').addEventListener('click', () => settingsDialog.close());
// The flip (O1): the page faces the phone, and this turns it to face a player across the table. Opening settings
// resets it.
settingsFlip.addEventListener('click', () => {
  const flipped = !settingsDialog.hasAttribute('data-flipped');
  settingsDialog.toggleAttribute('data-flipped', flipped);
  settingsFlip.setAttribute('aria-pressed', String(flipped));
});
settingsDialog.addEventListener('close', () => {
  closeLifeEditor(false, false);
  say('');
  settingsDialog.removeAttribute('data-flipped');
  syncBackHandling();
});

// Choose identities, Colours and Rotate seats close settings and start their board mode, starting a pending new game
// first. The mode's check mark returns to the board.
/** @param {'identity' | 'rotate' | 'colours'} mode */
function leaveSettingsFor(mode) {
  closeLifeEditor(true, false);
  if (settingsChangeGame()) startGame(selectedPlayerCount, selectedLife);
  settingsDialog.close();
  setBoardMode(mode);
}
chooseIdentitiesButton.addEventListener('click', () => leaveSettingsFor('identity'));
rotateSeatsButton.addEventListener('click', () => leaveSettingsFor('rotate'));
tileColoursButton.addEventListener('click', () => leaveSettingsFor('colours'));
settingsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  closeLifeEditor(true, false);
  if (settingsChangeGame()) startGame(selectedPlayerCount, selectedLife);
  settingsDialog.close();
});

// New game, in the header, opens its confirmation over settings. It lists what resets and what stays (SPEC §10.2),
// naming only what this game shows. Confirming starts a new game with the same players and life and closes both;
// Cancel, the default, returns to settings. It's hidden while a new game is pending, when Done starts it.
/** @returns {string[]} */
function resetList() {
  const { counters } = game;
  const counts = ['poison', 'energy', 'experience', 'rad'].some(kind => counters[kind]);
  const designations = [counters.monarch && 'monarch', counters.initiative && 'initiative'].filter(Boolean);
  return [
    `Life totals, back to ${game.startingLife}`,
    counts ? (counters.commander ? 'Counters and commander tax' : 'Counters') : counters.commander && 'Commander tax',
    counters.commander && 'Commander damage',
    game.manaPool && 'Floating mana and Treasure',
    game.turns !== 'off' && 'Turns, back to round 1',
    designations.length > 0 && `The ${designations.join(' and the ')}`,
    'Colour identities',
    game.dice.rolls.length > 0 && 'Dice rolls',
    game.shuffleColours && 'Tile colours, shuffled',
  ].filter(item => typeof item === 'string');
}
restartButton.addEventListener('click', () => {
  document.querySelector('#restart-message').textContent = `For ${game.scores.length} players. This resets:`;
  document.querySelector('#restart-resets').replaceChildren(...resetList().map(item => element('li', '', item)));
  // A new game empties the undo history (SPEC §10.2), so this confirmation is the only guard, and says so.
  document.querySelector('#restart-keeps').textContent = `${game.shuffleColours ? 'Settings and seats stay.' : 'Settings, seats and tile colours stay.'} You can't undo a new game.`;
  restart.returnValue = 'cancel';
  showDialog(restart);
});
restart.addEventListener('close', () => {
  if (restart.returnValue === 'restart') {
    startGame(game.scores.length, game.startingLife);
    settingsDialog.close();
  }
  syncBackHandling();
});
