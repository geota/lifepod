// The `is:` values card lookup answers (design/polish/SCRYFALL-SYNTAX-SPEC.md §3.5), each derived from the card data and
// the columns in logic/cardcolumns.js. No DOM and no state.

import { columnsOf, costText, facesOf, frontTypes, fullText, keywordLists, legalities, oracleText, reminderText, typeLines } from './cardcolumns.js';
import { formatAt, landNicknames, nicknameAliases } from './cardterms.js';

/** @typedef {import('./cards.js').Card} Card */
/** @typedef {import('./cards.js').CardIndex} CardIndex */
/** @typedef {(card: Card, at: number, index: CardIndex) => boolean} Kind */

const party = /\b(?:cleric|rogue|warrior|wizard)\b/;
const outlaw = /\b(?:assassin|mercenary|pirate|rogue|warlock)\b/;
const permanentTypes = /\b(?:artifact|creature|enchantment|land|planeswalker|battle)\b/;
const pairings = /^(?:partner|partner with|friends forever|choose a background|doctor's companion)/;
/** @param {CardIndex} index @param {number} at @param {string} format */
const legalIn = (index, at, format) => 'lr'.includes(legalities(index)[at][formatAt(format)]);
/** @type {Kind} */
const commander = (card, at, index) => {
  const front = frontTypes(index)[at];
  return /\blegendary\b/.test(front) && (/\bcreature\b/.test(front) || (/\b(?:vehicle|spacecraft)\b/.test(front) && facesOf(card)[0].p !== undefined)
    || /\bbackground\b/.test(front)) || /can be your commander/.test(fullText(index)[at]);
};
/** @type {Kind} */
const frenchVanilla = (_, at, index) => {
  const keywords = keywordLists(index)[at];
  const text = oracleText(index)[at].trim();
  if (!/\bcreature\b/.test(frontTypes(index)[at]) || !text || !keywords.length) return false;
  return text.split('\n').every(line => !/[.:—]/.test(line.replace(/\{[^}]*\}/g, ''))
    && line.split(/[,;] /).every(part => keywords.some(keyword => part.trim().startsWith(keyword))));
};

/** @type {Record<string, Kind>} */
export const kinds = {
  // Layouts and flags.
  split: card => card.ly === 'split',
  flip: card => card.ly === 'flip',
  transform: card => card.ly === 'transform',
  tdfc: card => card.ly === 'transform',
  mdfc: card => card.ly === 'modal_dfc',
  dfc: card => card.ly === 'transform' || card.ly === 'modal_dfc' || card.ly === 'meld',
  meld: card => card.ly === 'meld',
  meldpart: card => card.ly === 'meld' && !card.mr,
  meldresult: card => Boolean(card.mr),
  leveler: card => card.ly === 'leveler',
  adventure: card => card.ly === 'adventure',
  gamechanger: card => Boolean(card.gc),
  reserved: card => Boolean(card.rs),
  funny: card => Boolean(card.fun),
  hybrid: (_, at, index) => /\{[^}/]+\/[^}P]+\}/i.test(costText(index)[at]),
  phyrexian: (_, at, index) => /\/p\}/i.test(costText(index)[at]) || /\/p\}/.test(fullText(index)[at]),
  // Kinds of card.
  vanilla: card => facesOf(card).some(face => /\bcreature\b/i.test(face.t ?? card.t) && !(face.o ?? '').replace(reminderText, '').trim()),
  frenchvanilla: frenchVanilla,
  bear: (_, at, index) => {
    const columns = columnsOf(index);
    return /\bcreature\b/.test(frontTypes(index)[at]) && columns.mv[at] === 2 && columns.power[0][at] === 2 && columns.toughness[0][at] === 2;
  },
  spell: (_, at, index) => !/\b(?:land|attraction|contraption|sticker)\b/.test(frontTypes(index)[at]),
  permanent: (_, at, index) => permanentTypes.test(frontTypes(index)[at]),
  historic: (_, at, index) => /\b(?:legendary|artifact|saga)\b/.test(typeLines(index)[at]),
  party: (_, at, index) => /\bcreature\b/.test(typeLines(index)[at]) && (party.test(typeLines(index)[at]) || keywordLists(index)[at].includes('changeling')),
  outlaw: (_, at, index) => /\bcreature\b/.test(typeLines(index)[at]) && (outlaw.test(typeLines(index)[at]) || keywordLists(index)[at].includes('changeling')),
  modal: (_, at, index) => /^(?:•|\{p\} —)/m.test(fullText(index)[at]) || keywordLists(index)[at].some(keyword => keyword === 'spree' || keyword === 'escalate'),
  commander,
  brawler: (card, at, index) => (commander(card, at, index) || /\blegendary\b.*\bplaneswalker\b/.test(frontTypes(index)[at])) && legalIn(index, at, 'brawl'),
  duelcommander: (card, at, index) => commander(card, at, index) && legalIn(index, at, 'duel'),
  oathbreaker: (_, at, index) => /\bplaneswalker\b/.test(frontTypes(index)[at]),
  partner: (_, at, index) => {
    const front = frontTypes(index)[at];
    return /\blegendary\b/.test(front) && (/\b(?:background|time lord doctor)\b/.test(front) || keywordLists(index)[at].some(keyword => pairings.test(keyword))
      || /^partner—/m.test(fullText(index)[at]));
  },
  companion: (_, at, index) => keywordLists(index)[at].includes('companion'),
};
// The land nicknames, from each card's `lc`, which Scryfall's own lists fill at update time.
for (const nickname of landNicknames) kinds[nickname] = card => Boolean(card.lc?.includes(nickname));
/** @param {string} value @returns {Kind | undefined} */
export const kindOf = value => kinds[nicknameAliases[value] ?? value];
