// The board modes' layers on every tile, facing its player: the commander damage map, colours' swatches, identity's
// toggles and preview, the counter, designation and mana cells, and "Who goes first?". Their buttons call the actions
// above this module, which app.js passes in (setModeActions).

import { faceAngles, identityColours, manaColours, swatches, tileSets } from '../logic/data.js';
import { isOut, seatGrid, seatRow, shownCounters, toFace, trackedDesignations } from '../logic/rules.js';
import { boardMode, editStartScores, edits, game } from '../state/state.js';
import { board, element, icon, visuallyHidden } from '../ui/dom.js';
import { bindSeat, bindTap } from '../ui/press.js';
import { counterIcon, designationIcon, identityChip, inColourOf } from './tile.js';

/** @typedef {import('../logic/data.js').CountKind} CountKind */
/** @typedef {import('../logic/data.js').DesignationKind} DesignationKind */

/**
 * What the mode layers' buttons do: actions from above the renderers, passed in once by app.js.
 *
 * @typedef {object} ModeActions
 * @property {(defender: number, attacker: number, delta: number) => void} stepDamage
 * @property {(index: number, colour: number) => void} chooseColour
 * @property {(index: number, id: string) => void} toggleIdentity
 * @property {(kind: CountKind, index: number, delta: number) => void} stepCount
 * @property {(kind: DesignationKind, index: number) => void} toggleDesignation
 * @property {(index: number, colour: number, delta: number) => void} stepMana
 * @property {(index: number) => void} chooseFirst
 */
/** @type {ModeActions} */
let modeActions;
/** @param {ModeActions} handlers */
export function setModeActions(handlers) {
  modeActions = handlers;
}

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
      remove.addEventListener('click', () => modeActions.stepDamage(index, player, -1));
      bindSeat(cell, () => modeActions.stepDamage(index, player, 1), () => modeActions.stepDamage(index, player, -1));
      map.append(cell, remove);
    }
    cell.style.gridRow = `${Math.min(top, bottom) + 1} / ${Math.max(top, bottom) + 2}`;
    cell.style.gridColumn = `${Math.min(left, right) + 1} / ${Math.max(left, right) + 2}`;
    if (player === index) map.append(cell);
  }
  return map;
}

export function syncSeatMap(index) {
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

export function syncAllSwatches() {
  for (const group of document.querySelectorAll('.swatches')) syncSwatches(group);
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
    bindTap(toggle, () => modeActions.toggleIdentity(index, colour.id));
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
export function syncIdentity() {
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
  remove.addEventListener('click', () => modeActions.stepCount(kind, index, -1));
  bindSeat(cell, () => modeActions.stepCount(kind, index, 1), () => modeActions.stepCount(kind, index, -1));
  return [cell, remove];
}

// A designation cell: the crown or castle in a circle like a counter's. A tap gives it to this player, or clears it
// from its holder. The holder's cell fills with their seat colour and shows a check (styles.css).
function buildDesignationCell({ kind }, index) {
  const check = element('span', 'toggle-check', icon('check'));
  check.setAttribute('aria-hidden', 'true');
  const cell = element('button', 'counter-cell designation-cell', designationIcon(kind), check);
  cell.type = 'button';
  cell.dataset.designation = kind;
  bindTap(cell, () => modeActions.toggleDesignation(kind, index));
  return cell;
}

export function syncCounterCells(index) {
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
export function renderModeLayer(player, index) {
  const layer = player.querySelector('.mode-layer');
  layer.replaceChildren();
  if (boardMode === 'colours') {
    const hint = element('p', 'layer-hint', 'Your tile colour');
    hint.setAttribute('aria-hidden', 'true');
    layer.append(hint, element('div', 'colour-picker', buildSwatches(index, colour => modeActions.chooseColour(index, colour))));
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

// "Who goes first?" on one tile: Me first, facing its player.
function buildFirstPicker(index) {
  const go = element('button', 'first-go', icon('hand-tap'), 'Me first');
  go.type = 'button';
  go.setAttribute('aria-label', `Player ${index + 1} goes first`);
  bindTap(go, () => modeActions.chooseFirst(index));
  const hint = element('p', 'layer-hint', 'or the centre button picks at random');
  hint.setAttribute('aria-hidden', 'true');
  return element('div', 'first-picker', go, hint);
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
  remove.addEventListener('click', () => modeActions.stepMana(index, at, -1));
  bindSeat(cell, () => modeActions.stepMana(index, at, 1), () => modeActions.stepMana(index, at, -1));
  return [cell, remove];
}

export function syncManaCells(index) {
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
