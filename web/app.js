import { layoutBoard, measureBoard, syncBoardTurn } from './js/layout/board.js';
import { placeReminders, requestFit, resetDrops } from './js/layout/fit.js';
import {
  compactGroups, fitCompactSwitches, keepLifeEditorInView, lifeEditor, placeSettingsSections, settings, settingsBody,
  syncSettingsCue,
} from './js/layout/settings.js';
import {
  badgeSizeOrder, badgeSizes, clockwiseEdges, commanderLethal, commanderWarning, countKinds, designationKinds,
  designations, discardMessages, doneLabels, editingModes, faceAngles, firstBeat, identityColours, manaColours,
  maxCount, maxRound, maxStartingLife, playerCounts, poisonLethal, poisonWarning, reminderText, reminderTime,
  shuffleTick, shuffleTicks, swatches, tileSetOrder, tileSets, trackers, undoClearTime,
} from './js/logic/data.js';
import {
  applyEdit, dangerLevel, editPlayers, hasCountersMode, hasMana, isOut, leavingTransfers, needsPassing, nextTurn,
  outPlayers, playOrder, poolText, previousTurn, randomBelow, restPillButtons, seatGrid, seatRow, shownCounters, toFace,
  trackedDesignations,
} from './js/logic/rules.js';
import {
  fitColors, fitCounts, fitDamage, fitIdentities, fitPools, fitTurn, normalizeIdentity,
} from './js/logic/save.js';
import { announce, announceDesignation, announceLife, announcePool, clearAnnouncements } from './js/render/announce.js';
import {
  counterIcon, designationIcon, identityChip, inColourOf, paintColours, renderScore, renderWatermark,
} from './js/render/tile.js';
import {
  android, currentLandscapeAngle, defaultStyle, haptic, ios, portraitQuery, reducedMotion, setReduceTransparency,
  syncWakeLock,
} from './js/state/platform.js';
import {
  boardMode, clearedPools, editStartHolders, editStartScores, edits, game, openBoardMode, reminders, saveGame,
  syncBackHandling, turnSteps,
} from './js/state/state.js';
import {
  announcer, board, boardControls, cancelButton, countersButton, damageButton, diceButton, discardDialog, element, icon,
  manaButton, manaIcon, playerTemplate, roundBackButton, roundButton, saveButton, setupButton, shuffleButton,
  undoButton, visuallyHidden,
} from './js/ui/dom.js';
import { bindCounter, bindSeat, bindStep, bindTap, cancelPresses } from './js/ui/press.js';

/** @typedef {import('./js/logic/data.js').BoardMode} BoardMode */
/** @typedef {import('./js/logic/data.js').CountKind} CountKind */
/** @typedef {import('./js/logic/data.js').DesignationKind} DesignationKind */
/** @typedef {import('./js/logic/rules.js').Edit} Edit */
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
// The pill's buttons now and at rest, as last measured.
let pillShape = '';
// Settings' starting life, before Done applies it. selectedPlayerCount above is the same for players.
let selectedLife = game.startingLife;
let diceSides = 20;
let die;
let stopRoll;
// "Who goes first?" waits until settings has closed, then opens.
let askFirst = false;
let shuffleTimer;

// Commander damage mode: a map of the table on every tile, in board coordinates. Each opponent's seat shows
// the damage their commander has dealt this player; the player's own seat shows their life and its change.
function buildSeatMap(index) {
  const { rows, columns, areas } = seatGrid(game.scores.length);
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
    cell.textContent = String(damage);
    cell.toggleAttribute('data-zero', damage === 0);
    cell.toggleAttribute('data-changed', Boolean(edits?.some(edit => edit.kind === 'damage' && edit.index === index && edit.attacker === attacker)));
    cell.setAttribute('aria-label', `Player ${attacker + 1}'s commander, ${damage} damage. Add one`);
  }
  const self = map.querySelector('.self');
  const life = game.scores[index];
  const change = life - (editStartScores[index] ?? life);
  self.querySelector('strong').textContent = String(life).replace('-', '−');
  self.querySelector('strong').toggleAttribute('data-out', isOut(game, index));
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
    button.value = String(colour);
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
    for (const toggle of /** @type {NodeListOf<HTMLButtonElement>} */ (group.querySelectorAll('.identity-toggle'))) {
      toggle.setAttribute('aria-pressed', String(identity.includes(toggle.value)));
    }
  }
  for (const preview of board.querySelectorAll('.identity-preview')) {
    const identity = game.identities[Number(preview.dataset.player)];
    preview.replaceChildren(identityChip(identity, { indicator: true, symbol: true, name: true }) ?? element('span', 'chip', 'No identity'));
  }
}

// Shows an edit everywhere it appears, and saves it, so nothing is lost if the app is closed mid-mode.
/**
 * @param {Edit} edit
 */
function showEdit(edit) {
  const { index } = edit;
  // Whoever holds the monarch and the initiative now, after a tap, commander damage or a player going out.
  for (const { kind } of edit.transfers ?? []) announceDesignation(kind);
  if (edit.kind === 'casts') {
    announce(index, 'casts', () => `Player ${index + 1}, commander tax ${game.casts[index] * 2}`);
  } else if (countKinds.includes(edit.kind)) {
    announce(index, edit.kind, () => `Player ${index + 1}, ${game[edit.kind][index]} ${edit.kind}`);
  } else if (edit.kind === 'damage') {
    const attacker = /** @type {number} */ (edit.attacker);
    announce(index, `damage ${attacker}`, () =>
      `Player ${attacker + 1}'s commander, ${game.commanderDamage[index][attacker]} damage to Player ${index + 1}`);
    announceLife(index);
    syncSeatMap(index);
  } else if (edit.kind === 'mana') {
    announcePool(index);
  }
  for (const player of editPlayers(edit)) {
    syncCounterCells(player);
    syncManaCells(player);
    renderScore(player);
    renderBadges(player);
  }
  syncPill();
  haptic();
  saveGame();
}

// An edit made in a mode. Anyone it puts out of the game hands on what they hold (CR 726.4 and 727.4), in the same edit.
/**
 * @param {Edit} edit
 */
function commitEdit(edit) {
  const out = outPlayers(game);
  applyEdit(game, edit, 1);
  const handoffs = leavingTransfers(game, out);
  if (handoffs.length) {
    edit.transfers = [...(edit.transfers ?? []), ...handoffs];
    for (const transfer of handoffs) game[transfer.kind] = transfer.to;
  }
  /** @type {Edit[]} */ (edits).push(edit);
  showEdit(edit);
}

function undoEdit() {
  const edit = edits?.pop();
  if (!edit) return;
  applyEdit(game, edit, -1);
  showEdit(edit);
}

// Commander damage is combat damage: adding it to the monarch makes the attacker the monarch (CR 726.3), and adding it
// to the player with the initiative gives the attacker the initiative (CR 727.3). Taking damage away moves nothing.
function stepDamage(defender, attacker, delta) {
  const next = game.commanderDamage[defender][attacker] + delta;
  if (next < 0 || next > maxCount) return;
  const transfers = delta > 0 ? trackedDesignations(game).filter(({ kind }) => game[kind] === defender)
    .map(({ kind }) => ({ kind, from: defender, to: attacker })) : [];
  commitEdit({ kind: 'damage', index: defender, attacker, delta, transfers });
}

// Counters mode's designation cells: a tap gives it to that player, taking it from whoever had it, and a tap on the
// holder's own cell clears it.
function toggleDesignation(kind, index) {
  const from = game[kind];
  commitEdit({ kind: 'designation', index, transfers: [{ kind, from, to: from === index ? null : index }] });
}

function stepCount(kind, index, delta) {
  const next = game[kind][index] + delta;
  if (next >= 0 && next <= maxCount) commitEdit({ kind, index, delta });
}

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

// Redraws the holders' near rows: whether an out holder's tile asks to pass it on depends on who else is still in.
function renderPassHints() {
  for (const kind of designationKinds) if (game[kind] !== null) renderBadges(game[kind]);
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

// A designation cell: the crown or castle in a circle like a counter's. A tap gives it to this player, or clears it
// from its holder. The holder's cell fills with their seat colour.
function buildDesignationCell({ kind }, index) {
  const cell = element('button', 'counter-cell designation-cell', designationIcon(kind));
  cell.type = 'button';
  cell.dataset.designation = kind;
  bindTap(cell, () => toggleDesignation(kind, index));
  return cell;
}

function syncCounterCells(index) {
  const layer = board.children[index]?.querySelector('.counter-cells');
  if (!layer) return;
  for (const cell of layer.querySelectorAll('.designation-cell')) {
    const kind = /** @type {DesignationKind} */ (cell.dataset.designation);
    const held = game[kind] === index;
    // A toggle: its name stays put and aria-pressed says whether this player holds it.
    cell.setAttribute('aria-pressed', String(held));
    cell.toggleAttribute('data-zero', !held);
    cell.setAttribute('aria-label', `Player ${index + 1} ${kind}`);
  }
  for (const cell of layer.querySelectorAll('.counter-cell[data-kind]')) {
    const name = `Player ${index + 1}`;
    const kind = /** @type {CountKind} */ (cell.dataset.kind);
    const value = game[kind][index];
    cell.querySelector('b').textContent = kind === 'casts' ? `+${value * 2}` : String(value);
    cell.toggleAttribute('data-zero', value === 0);
    cell.setAttribute('aria-label', kind === 'casts'
      ? `${name} commander tax, ${value * 2}, ${value} ${value === 1 ? 'cast' : 'casts'}. Add one cast`
      : `${name} ${kind}, ${value}. Add one`);
  }
}

// A mode's gesture hint, such as "Tap +1 · hold −1", unless Settings → Reminders has Gesture hints off.
function gestureHint(words) {
  if (!game.reminders.gestures) return [];
  const hint = element('p', 'layer-hint', words);
  hint.setAttribute('aria-hidden', 'true');
  return [hint];
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
    layer.append(...gestureHint('Tap your colours'), buildIdentityPreview(index), buildIdentity(index));
  } else if (boardMode === 'damage') {
    layer.append(...gestureHint('Tap +1 · hold −1'), buildSeatMap(index));
  } else if (boardMode === 'counters') {
    // One circle per counter that's on, in the order poison, tax, energy, experience, rad, then the monarch and the
    // initiative: three to a row, or four when there are seven.
    const cells = element('div', 'counter-cells');
    for (const counter of shownCounters(game)) cells.append(...buildCounterCell(counter, index));
    for (const designation of trackedDesignations(game)) cells.append(buildDesignationCell(designation, index));
    layer.append(...gestureHint('Tap +1 · hold −1'), cells);
  } else if (boardMode === 'mana') {
    // Six circles, W U B R G over colourless, three to a row.
    const cells = element('div', 'counter-cells mana-cells');
    manaColours.forEach((colour, at) => cells.append(...buildManaCell(colour, at, index)));
    layer.append(...gestureHint('Tap +1 · hold −1'), cells);
  } else if (boardMode === 'first') {
    layer.append(buildFirstPicker(index));
  }
  layer.hidden = layer.childElementCount === 0;
  syncIdentity();
  syncCounterCells(index);
  syncManaCells(index);
  syncSeatMap(index);
}

// Empties every pool when the turn passes, if that's switched on, and returns what it emptied so a step back can put
// it back. The turn passing also ends any "Undo clear": the pool would have emptied anyway.
function autoEmptyPools() {
  if (!game.manaPool || !game.autoEmpty) return null;
  endUndoClears();
  if (!game.pools.some((_, index) => hasMana(game, index))) return null;
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
    if (game.turn.active === null) {
      askFirst = true;
      maybeAskFirst();
      return;
    }
    const { next, crossed } = nextTurn(game);
    game.turn.active = next;
    if (crossed) game.turn.round = Math.min(maxRound, game.turn.round + 1);
  }
  recordStep(before, autoEmptyPools());
  showTurn();
  if (game.turns === 'turns') {
    // The monarch draws at the beginning of their end step, so passing the turn reminds them, and the initiative's
    // holder ventures at the beginning of their upkeep, so their turn starting reminds them.
    if (game.monarch === before.active) remind(before.active, 'monarch');
    turnStarted();
  }
}

// A turn has just started: its player ventures into Undercity if they have the initiative.
function turnStarted() {
  if (game.turns === 'turns' && game.initiative !== null && game.initiative === game.turn.active) remind(game.initiative, 'initiative');
}

// Turn by turn with nobody's turn yet: a tile's turn chip starts that player's turn, and they go first if nobody has.
function startTurn(index) {
  const before = { ...game.turn };
  game.turn.active = index;
  game.turn.first ??= index;
  recordStep(before, null);
  showTurn();
  turnStarted();
}

// A turn reminder (Settings → Reminders → Turn reminders), only in Turn by turn: "Monarch: draw a card" or "Initiative:
// venture into Undercity" on that player's tile, facing them, for 3 seconds or until it's tapped. Screen readers hear it
// too.
/**
 * @param {number | null} index
 * @param {DesignationKind} kind
 */
function remind(index, kind) {
  if (index === null || game.turns !== 'turns' || !game.reminders.turns || !game.counters[kind]) return;
  const shown = reminders.get(index) ?? new Map();
  clearTimeout(shown.get(kind));
  shown.set(kind, setTimeout(() => dismissReminder(index, kind), reminderTime));
  reminders.set(index, shown);
  renderBadges(index);
  announce(index, `remind ${kind}`, () => `Player ${index + 1}, ${reminderText[kind]}`);
}

function dismissReminder(index, kind) {
  const shown = reminders.get(index);
  if (!shown?.has(kind)) return;
  clearTimeout(shown.get(kind));
  shown.delete(kind);
  if (!shown.size) reminders.delete(index);
  renderBadges(index);
}

function clearReminders() {
  for (const shown of reminders.values()) for (const timer of shown.values()) clearTimeout(timer);
  reminders.clear();
}

// The reminders a tile shows, newest last: each a chip in the turn chip's style that a tap dismisses. A chip already
// showing stays the same element, so a redraw of the tile neither replays its entrance nor pulls it from under a finger.
function syncReminderChips(index, box) {
  const showing = new Map([...box.children].map(chip => [chip.dataset.designation, chip]));
  const chips = [...(reminders.get(index)?.keys() ?? [])].map(kind => showing.get(kind) ?? reminderChip(index, kind));
  if (chips.length !== box.childElementCount || chips.some((chip, at) => box.children[at] !== chip)) box.replaceChildren(...chips);
}

function reminderChip(index, kind) {
  const [label, words] = reminderText[kind].split(': ');
  const chip = element('button', 'chip reminder-chip', designationIcon(kind), element('span', 'reminder-words', element('b', 'reminder-label', `${label}: `), words));
  chip.type = 'button';
  chip.dataset.designation = kind;
  chip.setAttribute('aria-label', `${reminderText[kind]}. Dismiss`);
  bindTap(chip, () => dismissReminder(index, kind));
  return chip;
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
    if (game.turn.active === null) return;
    const { previous, crossed } = previousTurn(game);
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
  turnSteps.length = 0;
  saveGame();
  haptic();
  board.dataset.picked = '';
  [...board.children].forEach((player, seat) => player.toggleAttribute('data-lit', seat === index));
  const go = board.children[index].querySelector('.first-go');
  go.replaceChildren(icon('flag'), 'Goes first');
  /** @type {Element} */ (go.nextElementSibling).textContent = game.turns === 'rounds' ? 'Tap the flag to start each round' : 'Tap Turn when your turn ends';
  announcer.textContent = `Player ${index + 1} goes first`;
  // Their turn starts once the board is back, where its reminder can show.
  shuffleTimer = setTimeout(() => {
    setBoardMode(null);
    turnStarted();
  }, reducedMotion.matches ? 0 : firstBeat);
}

// The centre shuffle picks a random player who isn't out, lighting tiles around the table before landing on them.
function shuffleFirst() {
  if (boardMode !== 'first' || board.hasAttribute('data-shuffling') || board.hasAttribute('data-picked')) return;
  const order = playOrder(game);
  const live = order.filter(player => !isOut(game, player));
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
    if (active === index || (active === null && !isOut(game, index))) {
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
    cell.querySelector('b').textContent = String(amount);
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
  if (!hasMana(game, index)) return;
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
    chip.setAttribute('aria-label', `Player ${index + 1}, mana pool ${poolText(game, index)}. Open mana`);
    bindTap(chip, () => setBoardMode('mana'));
  }
  chip.type = 'button';
  return chip;
}

// The holder's chip at rest: the crown or the castle. A holder who is out and hasn't handed it on (no Turn by turn
// turn to start from) gets a "Pass it on" chip instead, which opens counters mode to give it to someone.
function designationChip({ kind, label, name, still }, index) {
  if (needsPassing(game, kind, index)) {
    const chip = element('button', 'chip pass-chip', designationIcon(kind), icon('arrow-bend-up-right'), element('span', 'pass-word', 'Pass it on'));
    chip.type = 'button';
    chip.dataset.designation = kind;
    chip.setAttribute('aria-label', `Player ${index + 1} is out and ${still}. Pass ${name} on in counters`);
    bindTap(chip, () => setBoardMode('counters'));
    return chip;
  }
  const chip = element('span', 'chip designation-chip', designationIcon(kind), visuallyHidden(label));
  chip.dataset.designation = kind;
  return chip;
}

// The badge rows, each only when it has something to show. The far edge, toward the table, holds commander
// damage: a sword, like the pill's, then one chip per opponent in their own tile colour, largest first, and under it
// the mana strip while the pool has mana. The near edge holds the colour identity chip, then poison, tax, energy,
// experience and rad, each only when it's set and its switch is on, then the monarch's crown and the initiative's castle
// on their holder's tile. A turn reminder shows above the near edge, or over it on a short tile.
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
  const foldedChip = game.manaPool && (hasMana(game, index) || clearedPools.has(index)) ? stripChip(index) : null;
  far.replaceChildren(...(damage.length ? [sword] : []), ...damage.map(({ amount, attacker }) => {
    const chip = inColourOf(element('span', 'chip damage', String(amount),
      visuallyHidden(` commander damage from Player ${attacker + 1}`)), attacker);
    chip.setAttribute('role', 'listitem');
    const level = dangerLevel(amount, commanderWarning, commanderLethal);
    if (level) chip.dataset.level = level;
    return chip;
  }), ...(foldedChip ? [foldedChip] : []));
  // The strip folded onto the end of the far row, shown only when it can go nowhere else.
  far.hidden = damage.length === 0;
  const near = player.querySelector('.badges.near');
  player.toggleAttribute('data-active', game.turns === 'turns' && game.turn.active === index);
  // While a pool has mana, or for 5 seconds after the eraser, its strip shows at the far edge, and both rows stay.
  const strip = player.querySelector('.mana-strip');
  const hadFocus = strip.contains(document.activeElement) ? /** @type {HTMLElement} */ (document.activeElement).dataset.colour ?? '' : null;
  const floating = game.manaPool && (hasMana(game, index) || clearedPools.has(index));
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
  const identity = identityChip(game.identities[index], game.identity.show);
  if (identity) chips.push(identity);
  for (const { kind } of shownCounters(game)) {
    const value = game[kind][index];
    if (value === 0) continue;
    const chip = kind === 'casts' ? element('span', 'chip', visuallyHidden('Commander tax '), counterIcon(kind), `+${value * 2}`)
      : element('span', 'chip', counterIcon(kind), String(value), visuallyHidden(` ${kind}`));
    chip.dataset.kind = kind;
    const level = kind === 'poison' ? dangerLevel(value, poisonWarning, poisonLethal) : '';
    if (level) chip.dataset.level = level;
    chips.push(chip);
  }
  for (const designation of trackedDesignations(game)) {
    if (game[designation.kind] === index) chips.push(designationChip(designation, index));
  }
  syncReminderChips(index, /** @type {HTMLElement} */ (near.parentElement).querySelector('.reminders'));
  placeReminders(player);
  for (const chip of chips) if (chip.tagName !== 'BUTTON') chip.setAttribute('role', 'listitem');
  // Keep keyboard focus on a turn chip as the row is rebuilt. When the turn moves to another tile, showTurn follows it.
  const turnFocus = near.contains(document.activeElement) && /** @type {Element} */ (document.activeElement).matches('.turn-chip');
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
  countersButton.hidden = boardMode !== null || !hasCountersMode(game);
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
  for (const number of roundButton.querySelectorAll('.round > span')) number.textContent = String(round);
  roundButton.setAttribute('aria-label', game.turns === 'rounds' ? `Round ${round}. Next round`
    : active === null ? `Round ${round}. Choose who goes first` : `Round ${round}, Player ${active + 1}'s turn. Pass the turn`);
  roundBackButton.setAttribute('aria-label', game.turns === 'rounds' ? 'Back one round' : 'Back one turn');
  // The tap symbol gets a dot while any pool has mana.
  manaButton.toggleAttribute('data-floating', game.pools.some((_, index) => hasMana(game, index)));
  // The pill's length decides which face edges it reaches, so the board is measured again when it changes.
  const shape = `${[...boardControls.querySelectorAll('.pill-button')].filter(button => !button.hidden).length} ${restPillButtons(game)}`;
  if (shape !== pillShape) {
    pillShape = shape;
    measureBoard();
  }
}

// Board-wide modes. Seat rotation, tile colours and identities end with the check mark that replaces the setup button.
// Counters mode ends with save or ✕, and keeps a list of its edits until then.
/** @param {BoardMode} mode */
function setBoardMode(mode) {
  cancelPresses();
  clearTimeout(shuffleTimer);
  for (const flag of ['data-picked', 'data-shuffling']) board.removeAttribute(flag);
  for (const player of board.children) player.removeAttribute('data-lit');
  // Opening mana mode settles any "Undo clear": the cleared pool stays empty.
  if (mode === 'mana') endUndoClears();
  openBoardMode(mode);
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
  const changes = /** @type {Edit[]} */ (edits).length;
  if (!changes) {
    setBoardMode(null);
    return;
  }
  document.querySelector('#discard-title').textContent = `Discard ${changes} ${changes === 1 ? 'change' : 'changes'}?`;
  // Commander damage can pass the monarch and the initiative, and counters mode sets them.
  const moved = designations.filter(({ kind }) => game[kind] !== editStartHolders[kind]).map(({ name }) => name);
  document.querySelector('#discard-message').textContent = discardMessages[boardMode]
    + (moved.length ? ` So ${moved.length > 1 ? 'do' : 'does'} ${moved.join(' and ')}.` : '');
  discardDialog.returnValue = 'keep';
  discardDialog.showModal();
  syncBackHandling();
}

function discardEdits() {
  const changes = /** @type {Edit[]} */ (edits);
  while (changes.length) applyEdit(game, /** @type {Edit} */ (changes.pop()), -1);
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

// Badge size: saved the moment it changes, like Tile colours. The rows are fitted again from full size, as at a new game.
const badgeSizeChoices = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#badge-size-choices'));
function applyBadgeSize() {
  if (game.badgeSize === 'default') delete board.dataset.badgeSize;
  else board.dataset.badgeSize = game.badgeSize;
}
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
const currentStyle = () => game.style ?? defaultStyle;
function applyStyle() {
  document.documentElement.dataset.style = currentStyle();
}
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
    askFirst = was === 'off' && mode !== 'off' ? game.turn.first === null : askFirst && mode !== 'off';
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
applyTileColours();
applyBadgeSize();
applyStyle();
syncBoardTurn();
renderBoard();
syncPill();
syncWakeLock(() => game.keepAwake);
syncBackHandling();
