// Card lookup's search, between the field and the list (design/polish/SCRYFALL-SYNTAX-SPEC.md §6.5): a plain query
// takes the name ranking, with rules text behind the toggle and close spellings when it finds little; a query with any
// syntax is parsed and evaluated. sheets/cards.js draws what this finds; this module holds no DOM.

import { fold, foldText, rankResults, searchNames, searchText, textMinimum } from '../logic/cards.js';
import { setTags, warmColumns } from '../logic/cardcolumns.js';
import { runQuery, slowQuery } from '../logic/cardfilter.js';
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
 * @property {string | null} sort How a sorted syntax query is sorted, for the status line ("by mana value").
 */

// A slow syntax query (rules text, patterns, ~) waits this long after the last keystroke, so typing stays quick.
const slowDelay = 150;
// Scryfall's Oracle tags, gzipped, fetched the first time a query uses otag: (design/polish/SCRYFALL-SYNTAX-SPEC.md §5.4).
const tagsUrl = new URL('../../data/tags.json.gz', import.meta.url);
/** @type {Promise<void> | null} */
let tagsLoading = null;
/** @type {AbortController | null} */
let tagsAbort = null;

/** @type {CardIndex | null} */
let index = null;
/** @type {TypoIndex | null} */
let typos = null;
/** @type {(found: Found) => void} */
let listener = () => {};
/** @type {() => void} */
let waiting = () => {};
let textTimer = 0;
let slowTimer = 0;
/** @type {Found | null} */
let last = null;

/** @param {(found: Found) => void} show @param {() => void} wait called when a slow search will follow */
export function onFound(show, wait) {
  listener = show;
  waiting = wait;
}

// The cards, once loaded. The close-spellings index is built in steps of 2,000 names, one task each, so the sheet stays
// responsive (about 230 ms in all on a phone-speed CPU); a query that wanted close spellings before it was ready runs
// again when it is. Then the syntax search's columns are built the same way, a slice at a time, so a first syntax query
// finds them ready; one that comes sooner builds what it needs itself.
/** @param {CardIndex} cards @param {() => void} again */
export function setCards(cards, again) {
  index = cards;
  typos = null;
  const builder = typoBuilder(cards.keys);
  const warm = () => {
    if (cards === index && !warmColumns(cards)) setTimeout(warm, 0);
  };
  const step = () => {
    if (cards !== index) return;
    const ready = builder.step();
    if (!ready) {
      setTimeout(step, 0);
      return;
    }
    typos = ready;
    if (last && !last.syntax && !last.close.length && wantsTypos(last.query, last.count)) again();
    setTimeout(warm, 0);
  };
  setTimeout(step, 0);
}

// Lets go of the cards and everything built from them (sheets/cards.js evicts them a while after the sheet closes): the
// index's columns and tags hang off it in WeakMaps, so dropping it, the close-spellings index and the last results is
// enough. The steps still to come see the cards have changed and stop; a tags download in flight is cancelled.
export function dropCards() {
  clearTimeout(textTimer);
  clearTimeout(slowTimer);
  tagsAbort?.abort();
  tagsAbort = null;
  tagsLoading = null;
  index = null;
  typos = null;
  last = null;
}

/** @param {string} query @param {number} count */
const wantsTypos = (query, count) => count < typoBelow && fold(query).length >= typoMinimum;

// Searches, and calls the listener with what it found: at once, and again when rules text comes in.
/** @param {string} query @param {boolean} withText */
export function search(query, withText) {
  clearTimeout(textTimer);
  clearTimeout(slowTimer);
  if (!index) return;
  const parsed = parseQuery(query);
  if (parsed.syntax) {
    const cards = index;
    const run = () => {
      if (cards !== index) return;
      const { hits, notes, sort, needsTags } = runQuery(cards, parsed, query);
      show({ query, syntax: true, count: hits.length, page: limit => hits.slice(0, limit), close: [], notes, sort });
      if (needsTags) loadTags(cards).then(() => {
        if (cards === index && last?.query === query) search(query, withText);
      });
    };
    // A slow query waits for typing to pause; the list keeps its last results meanwhile.
    if (slowQuery(parsed)) {
      waiting();
      slowTimer = setTimeout(run, slowDelay);
    } else run();
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

// The tags load once; if they can't, otag: terms are left out with a note.
/** @param {CardIndex} cards */
function loadTags(cards) {
  if (tagsLoading) return tagsLoading;
  const abort = new AbortController();
  tagsAbort = abort;
  tagsLoading = fetch(tagsUrl, { signal: abort.signal })
    .then((response) => {
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
    })
    .then(data => setTags(cards, data))
    .catch(() => {
      if (!abort.signal.aborted) setTags(cards, null);
    });
  return tagsLoading;
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
  return { query, syntax: false, count, page: limit => rankResults(cards, names, texts, limit).results, close, notes: [], sort: null };
}
