// Card lookup's data and search, with no DOM: the card format in web/data/cards.json, folding names for search, the
// ranking, and reading the mana symbols in a cost or in rules text. scripts/cards-update.mjs imports fold() from here,
// so the keys it writes and the queries the page folds always match.

/**
 * One face of a card, or the whole card when it has one face. Text keeps Scryfall's symbols, such as `{T}` and `{2/W}`.
 * @typedef {object} CardFace
 * @property {string} n The name.
 * @property {string} [m] The mana cost, such as `{2}{W}{W}`. None for lands and most back faces.
 * @property {string} t The type line.
 * @property {string} [o] The rules (Oracle) text, lines split by `\n`.
 * @property {string} [p] Power and toughness, such as `3/3` or `*\/1+*`, as printed.
 * @property {string} [l] Loyalty.
 * @property {string} [d] Defense.
 */
/**
 * A card in web/data/cards.json. A card with faces (double-faced, split, adventure, flip and prepare cards) has its
 * rules text, stats and each face's cost in `f`, and the whole card's name and type line, joined by ` // `, at the top.
 * - `k`: the folded name that search matches (fold()).
 * - `c`: the colour identity in W U B R G order; none is colourless. `co`: the card's colours, only where they differ
 *   from its identity (`-` for colourless).
 * - `v`: the mana value; none is 0. `r`: the rarity of the printing Scryfall's Oracle file holds (c, u, r, m, s or b).
 * - `kw`: Scryfall's keywords, sorted; `pair` marks a pairing keyword (Partner, Friends forever, Choose a Background,
 *   Doctor's companion).
 * - `lead` marks a card that can be a commander.
 * - `lg`: the legalities, one letter per format in `about.formats` (cardterms.js `formats`): lower case legal, upper
 *   case banned, `+x` restricted, absent not legal. `pm`: the mana it can make, in W U B R G C order. `ly`: the layout
 *   when it isn't normal. `mr` a meld result; `gc` a Game Changer; `rs` on the Reserved List; `ci` a colour indicator;
 *   `fun` from a funny set. `lc`: the land cycles Scryfall names it in, such as `shockland` (cardterms.js `landNicknames`).
 * - `er`: the EDHREC rank, 1 the most played, exact (`exactRanks` in scripts/cards-update.mjs can round it); none for a
 *   card EDHREC doesn't rank.
 * These fields are there for a structured query (`c:r t:creature o:treasure mv<=3`) to be built on the matching below.
 * @typedef {CardFace & {
 *   k: string,
 *   c?: string,
 *   co?: string,
 *   v?: number,
 *   r?: string,
 *   f?: CardFace[],
 *   lead?: number,
 *   kw?: string[],
 *   pair?: number,
 *   er?: number,
 *   lg?: string,
 *   pm?: string,
 *   ly?: string,
 *   mr?: number,
 *   gc?: number,
 *   rs?: number,
 *   ci?: number,
 *   fun?: number,
 *   lc?: string[],
 * }} Card
 */
/**
 * @typedef {object} CardData
 * @property {{ source: string, updated: string, count: number, formats: string[] }} about Where the data is from, the
 *   bulk file's date, and the formats in `lg`'s order.
 * @property {Card[]} cards Sorted by `k`, then by the rest of the card, so the file's order is stable between updates.
 */

// Folds a name or a query for search: no case, accents or apostrophes, so "Lim-Dûl's" and "lim duls" match, and
// anything else that isn't a letter or digit is one space. "+" stays, as in "+2 Mace".
/** @param {string} text */
export function fold(text) {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ø/g, 'o').replace(/ß/g, 'ss')
    .replace(/['’‘".,!?:]/g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
}

// A face's stats as numbers, for comparing: `*` and the like count as 0, as the rules do outside the battlefield.
/** @param {string | undefined} value */
const statNumber = value => (value === undefined ? null : Number.parseFloat(value) || 0);
/** @param {CardFace} face */
export function faceStats(face) {
  const [power, toughness] = face.p ? face.p.split('/') : [];
  return { power: statNumber(power), toughness: statNumber(toughness), loyalty: statNumber(face.l), defense: statNumber(face.d) };
}
// A colour identity or colours as a five-bit mask, W = 1 to G = 16, for subset tests such as "fits a Golgari deck".
/** @param {string | undefined} colours */
export function colourMask(colours) {
  let mask = 0;
  for (const colour of colours ?? '') mask |= 1 << 'WUBRG'.indexOf(colour);
  return mask & 31;
}

// Rules text as search reads it: every face's text in lower case.
/** @param {Card} card */
export function textKey(card) {
  return (card.f ? card.f.map(face => face.o ?? '').join('\n') : card.o ?? '').toLowerCase();
}
// A rules-text query: lower case, curly apostrophes made straight (Oracle text uses straight ones; phone keyboards
// type curly ones), runs of spaces as one.
/** @param {string} query */
export function foldText(query) {
  return query.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

/**
 * The search index: each card's folded name and, built the first time text search runs, every card's rules text in one
 * string with where each card's starts. One long string searches faster than 33,000 short ones (docs/DEVELOPING.md,
 * "Card data", has the measurements). `last` is the previous text search: a longer query that contains it only checks
 * its matches.
 * @typedef {{ joined: string, starts: Int32Array }} TextIndex
 * @typedef {{ cards: Card[], keys: string[], text: TextIndex | null, last: { query: string, hits: number[] } | null }} CardIndex
 */
/** @param {Card[]} cards @returns {CardIndex} */
export function indexCards(cards) {
  return { cards, keys: cards.map(card => card.k), text: null, last: null };
}
/** @param {CardIndex} index @returns {TextIndex} */
function textIndex(index) {
  if (index.text) return index.text;
  const texts = index.cards.map(textKey);
  const starts = new Int32Array(texts.length + 1);
  for (let at = 0; at < texts.length; at++) starts[at + 1] = starts[at] + texts[at].length + 1;
  index.text = { joined: texts.join('\u0001'), starts };
  return index.text;
}

// How a card matches a query, best first: the whole name; a name that starts with the query as a whole word, as
// "Sol Ring" for "sol"; a name that starts with it, as "Soliton"; every word of the query starting a word of the name;
// the name containing every word; and, with rules text on, the rules text containing the query.
export const matchRanks = ['exact', 'word prefix', 'prefix', 'word starts', 'contains', 'text'];
// Rules text is searched from three characters: shorter queries match most cards.
export const textMinimum = 3;

/**
 * The cards whose names match, in one list per name rank (matchRanks 0 to 4), each in the file's order.
 * @param {CardIndex} index
 * @param {string} query
 * @returns {number[][]}
 */
export function searchNames(index, query) {
  /** @type {number[][]} */
  const buckets = [[], [], [], [], []];
  const folded = fold(query);
  if (!folded) return buckets;
  const words = folded.split(' ');
  const starts = words.map(word => ` ${word}`);
  const { keys } = index;
  const size = folded.length;
  for (let at = 0; at < keys.length; at++) {
    const key = keys[at];
    if (key.startsWith(folded)) {
      buckets[key.length === size ? 0 : key.charCodeAt(size) === 32 ? 1 : 2].push(at);
      continue;
    }
    let wordStarts = true;
    let contains = true;
    for (let word = 0; word < words.length; word++) {
      if (!key.includes(words[word])) {
        contains = false;
        break;
      }
      if (wordStarts && !key.startsWith(words[word]) && !key.includes(starts[word])) wordStarts = false;
    }
    if (contains) buckets[wordStarts ? 3 : 4].push(at);
  }
  return buckets;
}

/**
 * The cards whose rules text contains the query, in the file's order. A query that contains the last one only checks
 * the last one's matches.
 * @param {CardIndex} index
 * @param {string} query
 * @returns {number[]}
 */
export function searchText(index, query) {
  const folded = foldText(query);
  if (folded.length < textMinimum) return [];
  const { joined, starts } = textIndex(index);
  /** @type {number[]} */
  const hits = [];
  const last = index.last;
  if (last && folded.includes(last.query)) {
    for (const at of last.hits) if (joined.slice(starts[at], starts[at + 1] - 1).includes(folded)) hits.push(at);
  } else {
    let found = joined.indexOf(folded);
    let card = 0;
    while (found >= 0) {
      // The card this match is in: the last start at or before it.
      let low = card;
      let high = starts.length - 2;
      while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (starts[middle] <= found) low = middle;
        else high = middle - 1;
      }
      card = low;
      hits.push(card);
      found = joined.indexOf(folded, starts[card + 1]);
    }
  }
  index.last = { query: folded, hits };
  return hits;
}

/**
 * Puts name and text matches in order: by rank, shorter names first within a name rank, then in the file's
 * (alphabetical) order. A card whose name matches isn't listed again for its text. Only the first `limit` are sorted
 * and returned; `count` is every match.
 * @param {CardIndex} index
 * @param {number[][]} names searchNames()
 * @param {number[]} [texts] searchText()
 * @param {number} [limit]
 * @returns {{ results: number[], ranks: number[], count: number }}
 */
export function rankResults(index, names, texts = [], limit = 50) {
  const { keys } = index;
  const named = texts.length ? new Set(names.flat()) : null;
  const buckets = [...names, named ? texts.filter(at => !named.has(at)) : []];
  /** @type {number[]} */
  const results = [];
  /** @type {number[]} */
  const ranks = [];
  let count = 0;
  for (let rank = 0; rank < buckets.length; rank++) {
    const bucket = buckets[rank];
    count += bucket.length;
    if (results.length >= limit) continue;
    // Array.prototype.sort is stable, so names of the same length keep the file's order.
    if (rank > 0 && rank < 5) bucket.sort((a, b) => keys[a].length - keys[b].length);
    for (const at of bucket) {
      if (results.length >= limit) break;
      results.push(at);
      ranks.push(rank);
    }
  }
  return { results, ranks, count };
}

/**
 * Searches names and, with `text`, rules text, in one call.
 * @param {CardIndex} index
 * @param {string} query
 * @param {{ text?: boolean, limit?: number }} [options]
 */
export function searchCards(index, query, { text = false, limit = 50 } = {}) {
  return rankResults(index, searchNames(index, query), text ? searchText(index, query) : [], limit);
}

// ---- Mana symbols ----------------------------------------------------------------------------------------------------

// The symbols LifePod draws from the Mana font, and how a screen reader says each. css/cards.css maps each to its glyph
// (data-pip on a disc, data-sym without one). Coloured mana and the generic numbers are discs, as printed; so are tap,
// untap, snow, X and the rest of the cost symbols. Energy, tickets, acorns and the like are bare glyphs. Card text uses
// the modern tap symbol (U+E61A), the one printed on cards since Eighth Edition, not the old-school T (U+E61C).
/** @type {Record<string, string>} */
const colourWords = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green', C: 'colourless' };
/** @type {Record<string, string>} */
export const discSymbols = {
  ...colourWords,
  X: 'X', Y: 'Y', Z: 'Z', S: 'snow', T: 'tap', Q: 'untap', H: 'Phyrexian', '½': 'one half', '∞': 'infinity',
  ...Object.fromEntries([...Array(21).keys(), 100, 1000000].map(number => [String(number), String(number)])),
};
/** @type {Record<string, string>} */
export const bareSymbols = { E: 'energy', TK: 'ticket', A: 'acorn', CHAOS: 'chaos', P: 'paw print', L: 'legendary', D: 'land drop' };

/**
 * One symbol of a cost or rules text, as the page draws it: a disc in one fill (`pip`), a hybrid split in two (`pip`
 * and `second`), Phyrexian (the phi glyph on the colour's fill), a bare glyph (`sym`) or, for a symbol the font
 * lacks, the text as printed (`text`).
 * @typedef {{ pip?: string, second?: string, phyrexian?: boolean, sym?: string, text?: string, say: string }} ManaSymbol
 */
/** @param {string} code The symbol without braces, such as `W`, `2/W`, `G/U/P` or `T`. @returns {ManaSymbol} */
export function readSymbol(code) {
  const upper = code.toUpperCase();
  if (Object.hasOwn(bareSymbols, upper)) return { sym: upper, say: bareSymbols[upper] };
  if (Object.hasOwn(discSymbols, upper)) return { pip: upper, say: discSymbols[upper] };
  const parts = upper.split('/');
  const phyrexian = parts.at(-1) === 'P';
  if (phyrexian) parts.pop();
  const known = parts.every(id => Object.hasOwn(colourWords, id) || id === '2');
  if (known && parts.length === 1 && phyrexian && parts[0] !== '2') {
    return { pip: parts[0], phyrexian, say: `Phyrexian ${colourWords[parts[0]]}` };
  }
  if (known && parts.length === 2 && parts[1] !== '2') {
    const say = parts.map(id => colourWords[id] ?? id).join(' or ');
    return { pip: parts[0], second: parts[1], phyrexian, say: phyrexian ? `Phyrexian ${say}` : say };
  }
  return { text: `{${code}}`, say: code };
}

// Splits a cost or rules text into plain runs and symbols, in order.
/** @param {string} text @returns {(string | ManaSymbol)[]} */
export function splitSymbols(text) {
  /** @type {(string | ManaSymbol)[]} */
  const runs = [];
  let last = 0;
  for (const match of text.matchAll(/\{([^{}]+)\}/g)) {
    if (match.index > last) runs.push(text.slice(last, match.index));
    runs.push(readSymbol(match[1]));
    last = match.index + match[0].length;
  }
  if (last < text.length) runs.push(text.slice(last));
  return runs;
}

// How a screen reader hears a mana cost, such as "2, white, white". A split card's halves are joined by "or".
/** @param {string} cost */
export function costText(cost) {
  return cost.split(' // ').map(half => splitSymbols(half).map(run => (typeof run === 'string' ? run.trim() : run.say))
    .filter(Boolean).join(', ')).join(', or ');
}
