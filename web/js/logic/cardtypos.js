// Close spellings for card lookup's plain name search (design/polish/SCRYFALL-SYNTAX-SPEC.md §6.6): a trigram index over
// the folded names picks the candidates, and an edit distance confirms them. No DOM and no state; sheets/cards.js
// builds the index in small steps after the data loads and asks for close names when a plain query finds fewer than 3.

// Folded names hold a-z, 0-9, "+" and spaces. Each is one of 38 codes, so a trigram is a number below 38³.
const alphabet = ' abcdefghijklmnopqrstuvwxyz0123456789+';
const codes = new Map([...alphabet].map((character, at) => [character, at]));
const other = alphabet.length;
const base = alphabet.length + 1;
const gramCount = base ** 3;
/** @param {string} character */
const codeOf = character => codes.get(character) ?? other;

// A key's distinct trigrams, padded as "  key " so a name's first letters count double, as in the prototype.
/** @param {string} key @returns {number[]} */
export function gramsOf(key) {
  const padded = `  ${key} `;
  const found = new Set();
  for (let at = 0; at + 3 <= padded.length; at++) {
    found.add((codeOf(padded[at]) * base + codeOf(padded[at + 1])) * base + codeOf(padded[at + 2]));
  }
  return [...found];
}

/**
 * The index: for each trigram, the places of the names that have it, as one Int32Array with offsets.
 * @typedef {{ keys: string[], offsets: Int32Array, places: Int32Array, sizes: Uint16Array, counts: Uint16Array }} TypoIndex
 */

/**
 * Builds the index in steps of `chunk` names, so the page can spread the work over several tasks: counting first, then
 * filling. `step()` returns the index once it's done, and null before.
 * @param {string[]} keys
 * @param {number} [chunk]
 */
export function typoBuilder(keys, chunk = 2000) {
  const offsets = new Int32Array(gramCount + 1);
  const sizes = new Uint16Array(keys.length);
  /** @type {number[][]} */
  const grams = new Array(keys.length);
  let places = new Int32Array(0);
  let phase = 0;
  let next = 0;
  /** @type {Int32Array | null} */
  let fill = null;
  return {
    /** @returns {TypoIndex | null} */
    step() {
      const end = Math.min(keys.length, next + chunk);
      if (phase === 0) {
        for (let at = next; at < end; at++) {
          grams[at] = gramsOf(keys[at]);
          sizes[at] = grams[at].length;
          for (const gram of grams[at]) offsets[gram + 1]++;
        }
        next = end;
        if (next === keys.length) {
          for (let gram = 0; gram < gramCount; gram++) offsets[gram + 1] += offsets[gram];
          places = new Int32Array(offsets[gramCount]);
          fill = offsets.slice(0, gramCount);
          phase = 1;
          next = 0;
        }
        return null;
      }
      const cursor = /** @type {Int32Array} */ (fill);
      for (let at = next; at < end; at++) for (const gram of grams[at]) places[cursor[gram]++] = at;
      next = end;
      if (next < keys.length) return null;
      return { keys, offsets, places, sizes, counts: new Uint16Array(keys.length) };
    },
  };
}
/** @param {string[]} keys @returns {TypoIndex} */
export function buildTypoIndex(keys) {
  const builder = typoBuilder(keys, keys.length || 1);
  let index = builder.step();
  while (!index) index = builder.step();
  return index;
}

// The optimal string alignment distance: Levenshtein with adjacent swaps counted as one edit. It stops as soon as every
// path is past `limit`, and then returns limit + 1.
/** @param {string} a @param {string} b @param {number} limit */
export function distance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  /** @type {number[] | null} */
  let before = null;
  let previous = Array.from({ length: b.length + 1 }, (_, at) => at);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let cost = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (before && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cost = Math.min(cost, before[j - 2] + 1);
      row.push(cost);
      if (cost < best) best = cost;
    }
    if (best > limit) return limit + 1;
    before = previous;
    previous = row;
  }
  return Math.min(previous[b.length], limit + 1);
}

// How many edits a query of this many characters may be off by: none under 4, 1 to 7, 2 to 11, then 3.
/** @param {number} length */
export const allowedEdits = length => (length < 4 ? 0 : length < 8 ? 1 : length < 12 ? 2 : 3);
// A plain query gets close spellings when it's this long and finds fewer than this many cards.
export const typoMinimum = 4;
export const typoBelow = 3;

/**
 * The names within the allowed edits of a folded query, closest first: fewer edits, then more shared trigrams, then
 * `rank` (lower first, such as the EDHREC rank), then the file's order. A name counts when the whole name, or its start
 * cut to the query's length (a name half typed), is close enough.
 * @param {TypoIndex} index
 * @param {string} folded fold() of the query
 * @param {{ limit?: number, rank?: (at: number) => number, skip?: Set<number> }} [options]
 * @returns {number[]}
 */
export function closeNames(index, folded, { limit = 25, rank = () => 0, skip } = {}) {
  const edits = allowedEdits(folded.length);
  if (!edits) return [];
  const { keys, offsets, places, sizes, counts } = index;
  const grams = gramsOf(folded);
  /** @type {number[]} */
  const touched = [];
  for (const gram of grams) {
    for (let at = offsets[gram]; at < offsets[gram + 1]; at++) if (counts[places[at]]++ === 0) touched.push(places[at]);
  }
  const need = Math.max(1, Math.floor(grams.length * 0.3));
  /** @type {{ at: number, score: number, edits: number, rank: number }[]} */
  const scored = [];
  for (const at of touched) {
    if (counts[at] >= need && !skip?.has(at)) scored.push({ at, score: (2 * counts[at]) / (grams.length + sizes[at]), edits: 0, rank: 0 });
    counts[at] = 0;
  }
  scored.sort((a, b) => b.score - a.score || a.at - b.at);
  const close = [];
  for (const candidate of scored.slice(0, 200)) {
    const key = keys[candidate.at];
    const off = Math.min(distance(folded, key, edits), distance(folded, key.slice(0, folded.length), edits));
    if (off > edits) continue;
    candidate.edits = off;
    candidate.rank = rank(candidate.at);
    close.push(candidate);
  }
  close.sort((a, b) => a.edits - b.edits || b.score - a.score || a.rank - b.rank || a.at - b.at);
  return close.slice(0, limit).map(candidate => candidate.at);
}
