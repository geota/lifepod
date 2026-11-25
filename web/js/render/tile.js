// A tile's own parts: its colour, its life total and what's out, the watermark behind the total, and the pieces both
// the badge rows and the board modes draw, such as an identity chip or a counter's icon.

import { syncBoardDigits } from '../layout/board.js';
import { identityColours, identityNames, outLabels, swatches } from '../logic/data.js';
import { identityText, outReason, seatRow } from '../logic/rules.js';
import { seatName } from './announce.js';
import { game } from '../state/state.js';
import { board, element, icon, manaIcon, visuallyHidden } from '../ui/dom.js';

/** @typedef {import('../logic/data.js').CountKind} CountKind */
/** @typedef {import('../logic/data.js').DesignationKind} DesignationKind */
/** @typedef {import('../logic/save.js').IdentitySettings} IdentitySettings */
/** @typedef {import('../ui/dom.js').ManaGlyph} ManaGlyph */

export function paintColours() {
  [...board.children].forEach((player, index) => {
    // The tile's region is named for its seat and colour, which change together here.
    player.setAttribute('aria-label', seatName(index));
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

export function inColourOf(node, player) {
  node.dataset.playerColour = player;
  node.dataset.colour = swatches[game.colors[player]].id;
  node.dataset.row = seatRow(player);
  return node;
}

// The colour indicator printed on cards: one disc split into the identity's colours.
export function colourIndicator(identity) {
  const indicator = element('span', 'ci');
  indicator.dataset.ci = identity;
  indicator.dataset.count = identity.length;
  indicator.setAttribute('aria-hidden', 'true');
  return indicator;
}

// The identity's symbol. css/tile.css picks the glyph from data-symbol. Four colours are the colour pie drawn from
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
/**
 * @param {string} identity
 * @param {IdentitySettings['show']} show
 * @returns {HTMLElement | null}
 */
export function identityChip(identity, show) {
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

// The background behind a tile's total (design/polish/SPEC.md §2.3). Symbol puts a set identity's symbol there,
// faintly, like a card's watermark, and other tiles keep the rings. Default is the rings on every tile, and Off is
// a plain tile. data-background is set whenever the rings are gone.
export function renderWatermark(index) {
  const player = board.children[index];
  const identity = game.identities[index];
  const { background } = game.identity;
  const shown = background === 'off' || (background === 'symbol' && identity) ? background : null;
  if (shown) player.dataset.background = shown;
  else delete player.dataset.background;
  player.querySelector('.watermark').replaceChildren(...(shown === 'symbol' ? [identitySymbol(identity)] : []));
}

// Each counter's icon: Mana's infect, commander, energy and rad symbols, and Phosphor's graduation cap for experience.
/**
 * @param {CountKind} kind
 */
export function counterIcon(kind) {
  if (kind === 'experience') return icon('graduation-cap');
  return manaIcon(/** @type {ManaGlyph} */ ({ poison: 'infect', casts: 'commander' }[kind] ?? kind));
}

// The monarch's crown and the initiative's castle turret, both Phosphor.
/**
 * @param {DesignationKind} kind
 */
export function designationIcon(kind) {
  return icon(kind === 'monarch' ? 'crown' : 'castle-turret');
}

export function renderScore(index) {
  const score = /** @type {HTMLOutputElement} */ (board.children[index].querySelector('.score'));
  const value = String(game.scores[index]).replace('-', '−');
  score.value = value;
  // A player who is out says so under the total, and their other badges dim.
  const out = outReason(game, index);
  score.setAttribute('aria-label', `${game.scores[index]} life${out ? `, ${outLabels[out]}` : ''}`);
  syncBoardDigits();
  score.toggleAttribute('data-out', out !== null);
  board.children[index].toggleAttribute('data-out', out !== null);
}
