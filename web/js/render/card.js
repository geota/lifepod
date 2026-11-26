// Card lookup's drawing, from the card data (js/logic/cards.js): mana symbols in a cost or in rules text, a row in the
// results, the card itself, as text with no art, and its rulings. css/cards.css styles them.

import { costText, rulingDate, splitSymbols } from '../logic/cards.js';
import { formatAt, readLegalities } from '../logic/cardterms.js';
import { identityNames } from '../logic/data.js';
import { identityText } from '../logic/rules.js';
import { element, icon, visuallyHidden } from '../ui/dom.js';
import { colourIndicator } from './tile.js';

/** @typedef {import('../logic/cards.js').Card} Card */
/** @typedef {import('../logic/cards.js').CardFace} CardFace */
/** @typedef {import('../logic/cards.js').ManaSymbol} ManaSymbol */
/** @typedef {import('../logic/cards.js').Ruling} Ruling */

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
  const commander = card.t.startsWith('Token') ? 'l' : readLegalities(card.lg)[formatAt('commander')];
  if (commander !== 'l') facts.append(element('span', 'card-banned', commander === 'b' ? 'Banned in Commander' : 'Not legal in Commander'));
  return [head, ...faces, facts];
}

// A card's rulings, under the rest of it: a heading that is a button, "Rulings (n)", which opens and closes the list
// under it, closed to begin with. The count is the card data's, so it shows before the rulings load; sheets/cards.js
// fills the list (rulingNodes) and wires the button.
/** @param {number} count */
export function rulingsSection(count) {
  const toggle = element('button', 'secondary card-rulings-toggle', icon('caret-right'), element('span', '', 'Rulings'),
    element('span', 'card-rulings-count', `(${count})`));
  toggle.type = 'button';
  toggle.id = 'card-rulings-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'card-rulings');
  const body = element('div', 'card-rulings-body', element('p', 'card-rulings-status', 'Loading rulings…'));
  body.id = 'card-rulings';
  body.hidden = true;
  body.setAttribute('aria-busy', 'true');
  return element('section', 'card-rulings', element('h4', 'card-rulings-head', toggle), body);
}
// The rulings as a list, oldest first, each with its date under it as Scryfall prints them, and Scryfall's own notes
// marked as theirs. Mana symbols are drawn as in rules text; parentheses are just text here, and card names stay plain.
/** @param {Ruling[]} rulings */
export function rulingNodes(rulings) {
  const list = element('ol', 'card-rulings-list');
  for (const ruling of rulings) {
    const text = element('p', 'card-ruling-text');
    for (const run of splitSymbols(ruling.text)) {
      if (typeof run === 'string') text.append(run);
      else text.append(...symbolNodes(run, true));
    }
    const date = element('time', '', rulingDate(ruling.date));
    date.dateTime = ruling.date;
    const by = ruling.scryfall ? [' · Scryfall note'] : [];
    list.append(element('li', 'card-ruling', text, element('p', 'card-ruling-date', date, ...by)));
  }
  return list;
}

// Close spellings, after a plain query's matches: a group of rows under a small heading, which a screen reader hears
// as the group's name when it arrows into it.
/** @param {HTMLElement[]} rows */
export function closeGroup(rows) {
  const heading = element('div', 'card-close-head', 'Close spellings');
  heading.setAttribute('aria-hidden', 'true');
  const group = element('div', 'card-close', heading, ...rows);
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Close spellings');
  return group;
}

/** @typedef {import('../logic/cardfilter.js').ShownNote} ShownNote */
// One note under the search field: an info circle for a cut keyword, hint or caveat, a warning for an error, and the
// query terms it names in monospace. The short form is for the compact layout, which shows one line.
/** @param {ShownNote} note */
function noteNode(note) {
  const line = element('p', 'card-note', icon(note.kind === 'error' ? 'warning' : 'info'));
  line.dataset.kind = note.kind;
  const text = element('span', 'card-note-text');
  let rest = note.text;
  for (const term of note.terms) {
    const at = rest.indexOf(term);
    if (at < 0) continue;
    text.append(rest.slice(0, at), element('code', '', term));
    rest = rest.slice(at + term.length);
  }
  text.append(rest);
  line.append(text, element('span', 'card-note-short', note.short));
  return line;
}
// The notes for a query: the first two, and a button for the rest, which shows them in its place.
/** @param {ShownNote[]} notes */
export function noteNodes(notes) {
  const lines = notes.map(noteNode);
  if (lines.length <= 2) return lines;
  const rest = lines.slice(2);
  const more = element('button', 'card-notes-more', `${rest.length} more ${rest.length === 1 ? 'note' : 'notes'}`);
  more.type = 'button';
  more.addEventListener('click', () => more.replaceWith(...rest));
  return [...lines.slice(0, 2), more];
}
