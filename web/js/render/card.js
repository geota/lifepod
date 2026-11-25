// Card lookup's drawing, from the card data (js/logic/cards.js): mana symbols in a cost or in rules text, a row in the
// results, and the card itself, as text with no art. css/cards.css styles all three.

import { costText, splitSymbols } from '../logic/cards.js';
import { identityNames } from '../logic/data.js';
import { identityText } from '../logic/rules.js';
import { element, visuallyHidden } from '../ui/dom.js';
import { colourIndicator } from './tile.js';

/** @typedef {import('../logic/cards.js').Card} Card */
/** @typedef {import('../logic/cards.js').CardFace} CardFace */
/** @typedef {import('../logic/cards.js').ManaSymbol} ManaSymbol */

// One symbol: a disc (.pip, as the mana strip draws its colours), a bare glyph (.sym), or the printed text for a symbol
// the font doesn't have. The glyph is hidden from screen readers, which hear `say` instead, unless the caller speaks
// for the whole run (a cost).
/** @param {ManaSymbol} symbol @param {boolean} speak */
function symbolNodes(symbol, speak) {
  if (symbol.text) return [element('span', 'sym-text', symbol.text)];
  const node = element('span', symbol.sym ? 'sym' : 'pip');
  if (symbol.sym) node.dataset.sym = symbol.sym;
  else node.dataset.pip = /** @type {string} */ (symbol.pip);
  if (symbol.second) node.dataset.second = symbol.second;
  if (symbol.phyrexian) node.dataset.phyrexian = '';
  node.setAttribute('aria-hidden', 'true');
  return speak ? [node, visuallyHidden(symbol.say)] : [node];
}

// A mana cost as discs, which screen readers hear as "mana cost 2, white, white". A split card's halves keep the //.
/** @param {string} cost */
export function costNode(cost) {
  const node = element('span', 'card-cost');
  for (const run of splitSymbols(cost)) {
    if (typeof run !== 'string') node.append(...symbolNodes(run, false));
    else if (run.trim()) {
      const divider = element('span', 'cost-divider', run.trim());
      divider.setAttribute('aria-hidden', 'true');
      node.append(divider);
    }
  }
  node.append(visuallyHidden(`, mana cost ${costText(cost)}`));
  return node;
}

// A line of rules text with its symbols drawn inline and reminder text, in parentheses, set apart in italics.
/** @param {string} line */
function textLine(line) {
  const paragraph = element('p');
  for (const part of line.split(/(\([^()]*\))/)) {
    if (!part) continue;
    const target = part.startsWith('(') ? element('i', 'reminder') : paragraph;
    for (const run of splitSymbols(part)) {
      if (typeof run === 'string') target.append(run);
      else target.append(...symbolNodes(run, true));
    }
    if (target !== paragraph) paragraph.append(target);
  }
  return paragraph;
}

/** @param {CardFace} face */
function statsText(face) {
  if (face.p) return [visuallyHidden('Power and toughness '), face.p];
  if (face.l) return [`Loyalty ${face.l}`];
  if (face.d) return [`Defense ${face.d}`];
  return null;
}

// A row in the results: the name and cost on top, the type line under them.
/** @param {Card} card @param {number} at The card's place in the data, which the row's id carries. */
export function resultRow(card, at) {
  const row = element('div', 'card-row', element('span', 'card-row-name', card.n));
  row.id = `card-${at}`;
  row.dataset.at = String(at);
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', 'false');
  if (card.m) row.append(costNode(card.m));
  row.append(element('span', 'card-row-type', visuallyHidden(', '), card.t));
  return row;
}

/** @param {CardFace} face @param {boolean} titled */
function faceNode(face, titled) {
  const section = element('section', 'card-face');
  if (titled) {
    const title = element('h4', 'card-face-name', face.n);
    section.append(element('div', 'card-face-head', title, ...(face.m ? [costNode(face.m)] : [])));
  }
  section.append(element('p', 'card-type', face.t));
  if (face.o) section.append(element('div', 'card-text', ...face.o.split('\n').map(textLine)));
  const stats = statsText(face);
  if (stats) section.append(element('p', 'card-stats', ...stats));
  return section;
}

// The whole card: its name and cost, then each face (a card with faces names each one), and what Commander players
// ask: its colour identity, with the indicator printed on cards, and whether it's banned.
/** @param {Card} card */
export function cardNodes(card) {
  const name = element('h3', 'card-name', card.n);
  name.id = 'card-name';
  name.tabIndex = -1;
  const head = element('div', 'card-head', name);
  if (card.m && !card.f) head.append(costNode(card.m));
  const faces = card.f ? card.f.map(face => faceNode(face, true)) : [faceNode(card, false)];
  const identity = card.c ?? '';
  const shown = element('span', '', identity ? identityNames[identity] : 'Colourless');
  shown.setAttribute('aria-hidden', 'true');
  const facts = element('p', 'card-facts', colourIndicator(identity), shown,
    visuallyHidden(identity ? identityText(identity) : 'Colourless, no colour identity'));
  if (card.edh) facts.append(element('span', 'card-banned', card.edh === 'banned' ? 'Banned in Commander' : 'Not legal in Commander'));
  return [head, ...faces, facts];
}
