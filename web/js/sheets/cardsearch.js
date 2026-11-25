// Card lookup's search, between the field and the list (design/polish/SCRYFALL-SYNTAX-SPEC.md §6.5): a plain query
// takes the name ranking, with rules text behind the toggle and close spellings when it finds little; a query with any
// syntax is parsed and evaluated. sheets/cards.js draws what this finds; this module holds no DOM.

import { fold, foldText, rankResults, searchNames, searchText, textMinimum } from '../logic/cards.js';
import { runQuery } from '../logic/cardfilter.js';
import { parseQuery } from '../logic/cardquery.js';
import { closeNames, typoBelow, typoBuilder, typoMinimum } from '../logic/cardtypos.js';

/** @typedef {import('../logic/cards.js').CardIndex} CardIndex */
/** @typedef {import('../logic/cardtypos.js').TypoIndex} TypoIndex */
/** @typedef {import('../logic/cardfilter.js').ShownNote} ShownNote */
/**
 * What a search found: how many cards match, a page of them in order, the close spellings that follow them, the notes
 * to show, and whether a slow search is still to come (the list keeps its last results meanwhile).
 * @typedef {object} Found
 * @property {string} query
 * @property {boolean} syntax
 * @property {number} count
 * @property {(limit: number) => number[]} page
 * @property {number[]} close
 * @property {ShownNote[]} notes
 */

/** @type {CardIndex | null} */
let index = null;
/** @type {TypoIndex | null} */
let typos = null;
/** @type {(found: Found) => void} */
let listener = () => {};
let textTimer = 0;
/** @type {Found | null} */
let last = null;

/** @param {(found: Found) => void} show */
export function onFound(show) {
  listener = show;
}

// The cards, once loaded. The close-spellings index is built in steps of 2,000 names, one task each, so the sheet stays
// responsive (about 230 ms in all on a phone-speed CPU); a query that wanted close spellings before it was ready runs
// again when it is.
/** @param {CardIndex} cards @param {() => void} again */
export function setCards(cards, again) {
  index = cards;
  typos = null;
  const builder = typoBuilder(cards.keys);
  const step = () => {
    if (cards !== index) return;
    const ready = builder.step();
    if (!ready) {
      setTimeout(step, 0);
      return;
    }
    typos = ready;
    if (last && !last.syntax && !last.close.length && wantsTypos(last.query, last.count)) again();
  };
  setTimeout(step, 0);
}

/** @param {string} query @param {number} count */
const wantsTypos = (query, count) => count < typoBelow && fold(query).length >= typoMinimum;

// Searches, and calls the listener with what it found: at once, and again when rules text comes in.
/** @param {string} query @param {boolean} withText */
export function search(query, withText) {
  clearTimeout(textTimer);
  if (!index) return;
  const parsed = parseQuery(query);
  if (parsed.syntax) {
    const { hits, notes } = runQuery(index, parsed, query);
    show({ query, syntax: true, count: hits.length, page: limit => hits.slice(0, limit), close: [], notes });
    return;
  }
  // A plain query: names at once; rules text, the slower search, in its own task just after, so neither keeps a
  // keystroke waiting longer than a frame (docs/DEVELOPING.md, "Card data").
  const names = searchNames(index, query);
  show(plainFound(query, names, []));
  if (withText && foldText(query).length >= textMinimum) {
    const searched = index;
    textTimer = setTimeout(() => {
      if (searched !== index) return;
      show(plainFound(query, names, searchText(searched, query)));
    }, 0);
  }
}

/** @param {Found} found */
function show(found) {
  last = found;
  listener(found);
}

/** @param {string} query @param {number[][]} names @param {number[]} texts @returns {Found} */
function plainFound(query, names, texts) {
  const cards = /** @type {CardIndex} */ (index);
  const count = rankResults(cards, names, texts, 0).count;
  /** @type {number[]} */
  let close = [];
  if (typos && wantsTypos(query, count)) {
    const skip = new Set([...names.flat(), ...texts]);
    close = closeNames(typos, fold(query), { limit: 25, skip, rank: at => cards.cards[at].er ?? Infinity });
  }
  return { query, syntax: false, count, page: limit => rankResults(cards, names, texts, limit).results, close, notes: [] };
}
