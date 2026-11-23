// Settings' sections that save the moment they change (design/polish/SETTINGS-SPEC.md): Track's switches, Turns and
// mana, Reminders, Identity, and Table's keep awake, tile colours and their shuffle, badge size and style, with what each
// redraws on the board. Importing this module wires them; settings.js renders them as settings opens.

import { handOnLeavers } from '../actions/board.js';
import { endUndoClears } from '../actions/mana.js';
import { askFirst, setAskFirst } from '../actions/mode.js';
import { clearReminders } from '../actions/reminders.js';
import { measureBoard } from '../layout/board.js';
import { requestFit, resetDrops } from '../layout/fit.js';
import { compactGroups, fitCompactSwitches, settingsBody, syncSettingsCue } from '../layout/settings.js';
import { badgeSizeOrder, badgeSizes, trackers } from '../logic/data.js';
import { outPlayers, trackedDesignations } from '../logic/rules.js';
import { applyBadgeSize, applyStyle, applyTileColours, currentStyle } from '../render/appearance.js';
import { renderBadges, renderPassHints } from '../render/badges.js';
import { syncPill } from '../render/pill.js';
import { paintColours, renderScore } from '../render/tile.js';
import { syncWakeLock } from '../state/platform.js';
import { game, saveGame, turnSteps } from '../state/state.js';
import { notchedSlider } from './slider.js';

/** @typedef {import('../logic/data.js').IdentityPart} IdentityPart */
/** @typedef {import('../logic/data.js').Reminders} Reminders */
/** @typedef {import('../logic/data.js').Style} Style */
/** @typedef {import('../logic/data.js').TurnMode} TurnMode */

export const wakeInput = /** @type {HTMLInputElement} */ (document.querySelector('#keep-awake'));
const manaSwitch = /** @type {HTMLInputElement} */ (document.querySelector('#mana-switch'));
const autoEmptySwitch = /** @type {HTMLInputElement} */ (document.querySelector('#auto-empty-switch'));
const autoEmptyRow = /** @type {HTMLLabelElement} */ (document.querySelector('#auto-empty-row'));
const turnChoices = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#turn-choices'));
const identityNote = /** @type {HTMLParagraphElement} */ (document.querySelector('#identity-note'));
const identityShowSwitches = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('#identity-show input'));
const identityBackgroundChoices = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#identity-background'));

// Track's own state: the switches, the Turns choice, and the auto-empty switch, which only shows while it applies.
export function renderTrackSheet() {
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

// Tile colours: a segmented choice, saved the moment it changes, like the switches. Swatch ids stay, so every player
// keeps their colour. Each segment's strip shows its set's colours for players 1–4 (styles.css, from tiles7.mjs).
const tileSetChoices = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#tile-set-choices'));
const shuffleColoursSwitch = /** @type {HTMLInputElement} */ (document.querySelector('#shuffle-colours-switch'));
function setTileColours(set) {
  if (set === game.tileColours) return;
  game.tileColours = set;
  saveGame();
  applyTileColours();
  // Each set names its colours for itself, and the tiles' regions are named for their colour.
  paintColours();
  renderTileSetting();
}
for (const choice of tileSetChoices.children) choice.addEventListener('click', () => setTileColours(choice.dataset.set));
// Shuffle tile colours each game: saved at once, and used by the next new game (startGame).
shuffleColoursSwitch.addEventListener('change', () => {
  game.shuffleColours = shuffleColoursSwitch.checked;
  saveGame();
});
export function renderTileSetting() {
  for (const choice of tileSetChoices.children) choice.setAttribute('aria-pressed', String(choice.dataset.set === game.tileColours));
  shuffleColoursSwitch.checked = game.shuffleColours;
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
export function renderBadgeSizeSetting() {
  for (const choice of badgeSizeChoices.children) choice.setAttribute('aria-pressed', String(choice.dataset.size === game.badgeSize));
  badgeSizeSlider.render();
}
// The compact switch groups are checked whenever the settings body changes size (fitCompactSwitches).
new ResizeObserver(() => compactGroups.forEach(fitCompactSwitches)).observe(settingsBody);

// Style: saved the moment it's picked, after which it wins over the platform's default.
const styleChoices = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#style-choices'));
export function renderStyleSetting() {
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
export function renderRemindersSection() {
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
export function renderIdentitySheet() {
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
