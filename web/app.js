import { renderBoard, startGame } from './js/actions/board.js';
import {
  chooseColour, stepCount, stepDamage, stepMana, toggleDesignation, toggleIdentity, undoEdit,
} from './js/actions/edits.js';
import { clearPool, spendMana, undoClear } from './js/actions/mana.js';
import {
  cancelEditing, chooseFirst, discardEdits, leaveBoardMode, maybeAskFirst, setBoardMode, shuffleFirst,
} from './js/actions/mode.js';
import { dismissReminder, remind } from './js/actions/reminders.js';
import { startTurn, stepBack, stepTurn } from './js/actions/turns.js';
import { measureBoard, syncBoardTurn } from './js/layout/board.js';
import { resetDrops } from './js/layout/fit.js';
import {
  compactGroups, fitCompactSwitches, keepLifeEditorInView, lifeEditor, placeSettingsSections, settings, settingsBody,
  syncSettingsCue,
} from './js/layout/settings.js';
import { maxStartingLife, playerCounts } from './js/logic/data.js';
import { applyBadgeSize, applyStyle, applyTileColours } from './js/render/appearance.js';
import { setBadgeActions } from './js/render/badges.js';
import { setModeActions } from './js/render/modes.js';
import { syncPill } from './js/render/pill.js';
import {
  renderBadgeSizeSetting, renderIdentitySheet, renderRemindersSection, renderStyleSetting, renderTileSetting,
  renderTrackSheet, wakeInput,
} from './js/sheets/options.js';
import { notchedSlider } from './js/sheets/slider.js';
import { android, ios, portraitQuery, setReduceTransparency, syncWakeLock } from './js/state/platform.js';
import { boardMode, editStartHolders, game, saveGame, syncBackHandling } from './js/state/state.js';
import {
  board, cancelButton, countersButton, damageButton, discardDialog, element, icon, manaButton, roundBackButton,
  roundButton, saveButton, setupButton, shuffleButton, undoButton,
} from './js/ui/dom.js';
import { bindStep, bindTap, cancelPresses } from './js/ui/press.js';

import './js/sheets/options.js';
import './js/sheets/dice.js';

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
  describe: life => `Starting life ${life}`,
});
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
