// The columns card lookup's query language reads (design/polish/SCRYFALL-SYNTAX-SPEC.md §6.3): typed arrays of colours,
// mana values and stats, built the first time a syntax query runs, and text columns (type lines, rules text, the
// tilde text, costs and the rest) built the first time a term needs each one. They're kept per CardIndex. No DOM.

import { colourMask, faceStats, fold } from './cards.js';
import { readCost, readLegalities } from './cardterms.js';

/** @typedef {import('./cards.js').Card} Card */
/** @typedef {import('./cards.js').CardFace} CardFace */
/** @typedef {import('./cards.js').CardIndex} CardIndex */
/**
 * @typedef {object} Columns
 * @property {Uint8Array} colours
 * @property {Uint8Array} identity
 * @property {Uint8Array} produces The mana a card makes, W to G as for colours and 32 for colourless.
 * @property {Float32Array} mv
 * @property {Float32Array[]} power Two faces' power, NaN for none; likewise toughness and loyalty.
 * @property {Float32Array[]} toughness
 * @property {Float32Array[]} loyalty
 * @property {Map<string, any>} lazy The columns built at first use.
 * @property {Map<string, Uint8Array>} cache The last terms' matches, by the term (logic/cardfilter.js).
 */

/** @type {WeakMap<CardIndex, Columns>} */
const built = new WeakMap();

/** @param {Card} card @returns {CardFace[]} */
export const facesOf = card => card.f ?? [card];

/** @param {CardIndex} index @returns {Columns} */
export function columnsOf(index) {
  const known = built.get(index);
  if (known) return known;
  const { cards } = index;
  const count = cards.length;
  const nan = () => new Float32Array(count).fill(NaN);
  /** @type {Columns} */
  const columns = {
    colours: new Uint8Array(count), identity: new Uint8Array(count), produces: new Uint8Array(count), mv: new Float32Array(count),
    power: [nan(), nan()], toughness: [nan(), nan()], loyalty: [nan(), nan()], lazy: new Map(), cache: new Map(),
  };
  cards.forEach((card, at) => {
    columns.identity[at] = colourMask(card.c);
    columns.colours[at] = card.co === '-' ? 0 : colourMask(card.co ?? card.c);
    columns.produces[at] = colourMask(card.pm) | (card.pm?.includes('C') ? 32 : 0);
    columns.mv[at] = card.v ?? 0;
    facesOf(card).slice(0, 2).forEach((face, side) => {
      const stats = faceStats(face);
      if (stats.power !== null) columns.power[side][at] = stats.power;
      if (stats.toughness !== null) columns.toughness[side][at] = stats.toughness;
      if (stats.loyalty !== null) columns.loyalty[side][at] = stats.loyalty;
    });
  });
  built.set(index, columns);
  return columns;
}

// Reminder text, in parentheses, which o: leaves out and fo: keeps.
export const reminderText = /\s*\([^()]*\)/g;
// Lower case with accents folded but punctuation kept, for quoted names.
/** @param {string} text */
export const lowerName = text => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
// The phrases Oracle text has used since 2024 where it used to print the card's name.
const selfPhrases = /\bthis (?:spell|card|permanent|token|creature|land|artifact|enchantment|planeswalker|battle|aura|equipment|vehicle|saga|class|case|siege|room|spacecraft|attraction|contraption)\b/g;

// How each text column is made, by name, in the order they're built ahead of need (warmColumns). A maker takes the
// index, so a column can read another, and returns the value for one card.
/** @type {Record<string, (index: CardIndex) => (card: Card, at: number) => any>} */
const makers = {
  types: () => card => [card.t, ...(card.f ?? []).map(face => face.t)].join('\n').toLowerCase(),
  front: () => card => (card.f ? card.f[0].t : card.t).toLowerCase(),
  keywords: () => card => (card.kw ?? []).map(keyword => keyword.toLowerCase()),
  squashed: () => card => card.k.replace(/ /g, ''),
  lower: () => card => lowerName(card.n),
  faceKeys: () => card => (card.f ?? []).map(face => fold(face.n)),
  costText: () => card => facesOf(card).map(face => face.m ?? '').join(' ') + (card.m ?? ''),
  full: () => card => facesOf(card).map(face => face.o ?? '').join('\n').toLowerCase(),
  oracle: () => card => facesOf(card).map(face => (face.o ?? '').replace(reminderText, '')).join('\n').toLowerCase(),
  costs: () => card => (card.f ? card.f.filter(face => face.m) : [card]).map(face => readCost(face.m)),
  pips: () => card => [...(facesOf(card)[0].m ?? card.m ?? '').matchAll(/\{([^}]+)\}/g)].map(match => match[1].toUpperCase().split('/')),
  legal: () => card => readLegalities(card.lg),
  // The tilde text (§2.5): rules text with the card's own name as ~: the full name, each face's, a legendary card's
  // short name before the comma, and "this creature" and the like.
  'tilde-o': index => tilde(oracleText(index)),
  'tilde-fo': index => tilde(fullText(index)),
};
/** @param {string[]} texts @returns {(card: Card, at: number) => string} */
function tilde(texts) {
  return (card, at) => {
    const names = new Set([card.n.toLowerCase()]);
    for (const face of facesOf(card)) {
      names.add(face.n.toLowerCase());
      const short = face.n.split(',')[0];
      if (short !== face.n && /legendary/i.test(face.t ?? card.t)) names.add(short.toLowerCase());
    }
    let text = texts[at];
    for (const name of [...names].sort((a, b) => b.length - a.length)) if (name) text = text.split(name).join('~');
    return text.replace(selfPhrases, '~');
  };
}

// A column: built in full the first time a term needs it, or finished then if warmColumns had started it.
/** @param {CardIndex} index @param {string} name @returns {any[]} */
function lazy(index, name) {
  const entry = slot(index, name);
  const make = makers[name](index);
  for (; entry.next < index.cards.length; entry.next++) entry.values[entry.next] = make(index.cards[entry.next], entry.next);
  return entry.values;
}
/** @param {CardIndex} index @param {string} name @returns {{ values: any[], next: number }} */
function slot(index, name) {
  const { lazy: store } = columnsOf(index);
  if (!store.has(name)) store.set(name, { values: new Array(index.cards.length), next: 0 });
  return store.get(name);
}
// Builds the columns ahead of the first syntax query, one slice of `chunk` cards per call, so no task takes long (a
// whole column at once took up to 120 ms on a phone-speed CPU). Returns true once every column is built.
/** @param {CardIndex} index @param {number} [chunk] */
export function warmColumns(index, chunk = 4000) {
  columnsOf(index);
  for (const name of Object.keys(makers)) {
    const entry = slot(index, name);
    if (entry.next >= index.cards.length) continue;
    const make = makers[name](index);
    const end = Math.min(index.cards.length, entry.next + chunk);
    for (; entry.next < end; entry.next++) entry.values[entry.next] = make(index.cards[entry.next], entry.next);
    return false;
  }
  return true;
}

/** @param {CardIndex} index @returns {string[]} every face's type line, one per line, in lower case */
export const typeLines = index => lazy(index, 'types');
/** @param {CardIndex} index @returns {string[]} the front face's type line, in lower case */
export const frontTypes = index => lazy(index, 'front');
/** @param {CardIndex} index @returns {string[]} */
export const fullText = index => lazy(index, 'full');
/** @param {CardIndex} index @returns {string[]} */
export const oracleText = index => lazy(index, 'oracle');
/** @param {CardIndex} index @returns {string[]} */
export const squashedNames = index => lazy(index, 'squashed');
/** @param {CardIndex} index @returns {string[]} */
export const lowerNames = index => lazy(index, 'lower');
/** @param {CardIndex} index @returns {string[][]} */
export const faceKeys = index => lazy(index, 'faceKeys');
/** @param {CardIndex} index @returns {string[][]} */
export const keywordLists = index => lazy(index, 'keywords');
/** @param {CardIndex} index @returns {string[]} every face's cost, then the card's */
export const costText = index => lazy(index, 'costText');
/** @param {CardIndex} index @returns {import('./cardterms.js').Cost[][]} each face's cost as a multiset */
export const costs = index => lazy(index, 'costs');
/** @param {CardIndex} index @returns {string[][][]} the front face's mana symbols, each split at its slashes */
export const pips = index => lazy(index, 'pips');
/** @param {CardIndex} index @returns {string[]} one letter per format: l, b, r or n */
export const legalities = index => lazy(index, 'legal');
/** @param {CardIndex} index @param {'o' | 'fo'} key @returns {string[]} */
export const tildeText = (index, key) => lazy(index, `tilde-${key}`);

// Text joined into one string with each card's start, which indexOf searches faster than 33,000 short strings.
/** @param {CardIndex} index @param {string} name @param {string[]} texts @returns {{ text: string, starts: Int32Array }} */
export function joined(index, name, texts) {
  const { lazy: store } = columnsOf(index);
  if (!store.has(name)) {
    const starts = new Int32Array(texts.length + 1);
    for (let at = 0; at < texts.length; at++) starts[at + 1] = starts[at] + texts[at].length + 1;
    store.set(name, { text: texts.join('\u0001'), starts });
  }
  return store.get(name);
}
// Marks every card whose joined text contains the needle.
/** @param {{ text: string, starts: Int32Array }} source @param {string} needle @param {Uint8Array} mask */
export function scan(source, needle, mask) {
  const { text, starts } = source;
  let found = text.indexOf(needle);
  let card = 0;
  while (found >= 0) {
    let low = card;
    let high = starts.length - 2;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle] <= found) low = middle;
      else high = middle - 1;
    }
    card = low;
    mask[card] = 1;
    found = text.indexOf(needle, starts[card + 1]);
  }
  return mask;
}
