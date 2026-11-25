// Evaluates a parsed card query (logic/cardquery.js) over the cards (design/polish/SCRYFALL-SYNTAX-SPEC.md §6.3, §6.4).
// No DOM; the only state is on the CardIndex (logic/cardcolumns.js): the columns it reads and the last few terms'
// matches. Each term's matches are a Uint8Array over the cards; AND runs its cheapest terms first and gives the slow ones
// only the cards still in, OR joins, NOT inverts. It never throws: a term it can't read becomes a note and is left out.

import { fold, searchNames } from './cards.js';
import {
  columnsOf, costs, facesOf, faceKeys, fullText, joined, keywordLists, legalities, lowerName, lowerNames, oracleText, pips, scan,
  squashedNames, tildeText, typeLines,
} from './cardcolumns.js';
import { kindOf } from './cardkinds.js';
import { cutGroups, leaves, printingValues } from './cardquery.js';
import {
  colourCount, compareCosts, compareNumbers, compareSets, formatAt, rarityOrder, readColours, readCost, readPattern, squash,
} from './cardterms.js';

/** @typedef {import('./cards.js').Card} Card */
/** @typedef {import('./cards.js').CardIndex} CardIndex */
/** @typedef {import('./cardquery.js').QueryNode} QueryNode */
/** @typedef {import('./cardquery.js').QueryNote} QueryNote */
/** @typedef {import('./cardquery.js').ParsedQuery} ParsedQuery */
/**
 * A note as the sheet shows it: its kind, its text, the query terms it names (set in monospace), and a short form for
 * the compact layout.
 * @typedef {{ kind: QueryNote['kind'], text: string, terms: string[], short: string }} ShownNote
 */
/**
 * A term ready to run: its cost (cheap terms run first in an AND), a test for one card, and optionally a way to find
 * every match at once that's faster than testing each card.
 * @typedef {{ cost: number, test: (at: number) => boolean, all?: () => Uint8Array }} Compiled
 */

// How many terms' matches are kept, so that typing a third term doesn't recompute the first two.
const cacheSize = 16;
// The sorts card lookup can do (§3.8): the field, its default direction, and how the status line says it.
/** @type {Record<string, { by: string, descending: boolean }>} */
export const sorts = {
  name: { by: 'name', descending: false }, cmc: { by: 'mana value', descending: false }, mv: { by: 'mana value', descending: false },
  power: { by: 'power', descending: false }, pow: { by: 'power', descending: false }, toughness: { by: 'toughness', descending: false },
  tou: { by: 'toughness', descending: false }, rarity: { by: 'rarity', descending: true }, color: { by: 'colour', descending: false },
  colour: { by: 'colour', descending: false }, edhrec: { by: 'EDHREC rank', descending: false },
};
// A query whose terms take long enough to wait for typing to pause (§6.5): rules text of three letters or more, any
// pattern, the card's own name (~), and French vanilla.
/** @param {ParsedQuery} parsed */
export function slowQuery(parsed) {
  return leaves(parsed.ast).some(node => node.k === 'term' && (node.regex || node.value.includes('~')
    || ((node.key === 'o' || node.key === 'fo') && node.value.length >= 3) || (node.key === 'is' && node.value.toLowerCase() === 'frenchvanilla')));
}

// ---- Terms ----------------------------------------------------------------------------------------------------------------

/**
 * @param {CardIndex} index
 * @param {QueryNode & { k: 'term' }} node
 * @param {(kind: QueryNote['kind'], text: string, group?: string) => void} note
 * @returns {Compiled | null}
 */
function compileTerm(index, node, note) {
  const { cards } = index;
  const columns = columnsOf(index);
  const { key, op, value } = node;
  const lower = value.toLowerCase();
  const fail = (/** @type {string} */ text) => {
    note('error', text);
    return null;
  };
  const pattern = () => {
    const read = readPattern(value);
    if ('error' in read) return fail(read.error);
    return read;
  };
  switch (key) {
    case 'c': case 'id': {
      const want = readColours(value);
      if (!want) return fail(`${value} isn’t a colour.`);
      const field = key === 'c' ? columns.colours : columns.identity;
      if (want.count !== undefined) return { cost: 1, test: at => compareNumbers(colourCount(field[at]), /** @type {number} */ (want.count), op) };
      if (want.multi) return { cost: 1, test: at => colourCount(field[at]) >= 2 };
      const mask = /** @type {number} */ (want.mask);
      if (want.colourless && op === ':') return { cost: 1, test: at => field[at] === 0 };
      const setOp = op === ':' ? (key === 'c' ? '>=' : '<=') : op;
      return { cost: 1, test: at => compareSets(field[at], mask, setOp) };
    }
    case 't': {
      const types = typeLines(index);
      if (node.regex) {
        const read = pattern();
        return read && { cost: 10, test: at => read.pattern.test(types[at]) };
      }
      const start = new RegExp(`(?:^|[^a-z0-9])${lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      return { cost: 2, test: at => start.test(types[at]) };
    }
    case 'o': case 'fo': {
      const plain = key === 'o' ? oracleText(index) : fullText(index);
      if (node.regex) {
        const read = pattern();
        if (!read) return null;
        const texts = read.tilde ? tildeText(index, key) : plain;
        return { cost: 10, test: at => read.pattern.test(texts[at]) };
      }
      const needle = lower.replace(/\s+/g, ' ');
      const texts = needle.includes('~') ? tildeText(index, key) : plain;
      return { cost: 5, test: at => texts[at].includes(needle), all: () => scan(joined(index, `${key}-${needle.includes('~') ? 'tilde' : 'joined'}`, texts), needle, new Uint8Array(cards.length)) };
    }
    case 'name': {
      if (node.regex) {
        const read = pattern();
        return read && { cost: 10, test: at => read.pattern.test(cards[at].n) };
      }
      return nameTerm(index, { value, quoted: node.quoted });
    }
    case 'kw': {
      const lists = keywordLists(index);
      return { cost: 2, test: at => lists[at].includes(lower) };
    }
    case 'm': {
      const want = readCost(value);
      const list = costs(index);
      const none = [readCost('')];
      return { cost: 3, test: at => (list[at].length ? list[at] : none).some(cost => compareCosts(cost, want, op)) };
    }
    case 'mv': {
      if (lower === 'even') return { cost: 1, test: at => columns.mv[at] % 2 === 0 };
      if (lower === 'odd') return { cost: 1, test: at => columns.mv[at] % 2 === 1 };
      const number = Number(lower);
      if (!lower || !Number.isFinite(number)) return fail('Mana value needs a number, even or odd.');
      return { cost: 1, test: at => compareNumbers(columns.mv[at], number, op) };
    }
    case 'pow': case 'tou': case 'pt': case 'loy': return statTerm(index, node, fail);
    case 'devotion': return devotionTerm(index, node, fail);
    case 'produces': {
      const want = readColours(value.replace(/c/gi, ''));
      if (!want || want.mask === undefined) return fail(`${value} isn’t a set of colours.`);
      const mask = want.mask | (/c/i.test(value) ? 32 : 0);
      return { cost: 1, test: at => columns.produces[at] !== 0 && compareSets(columns.produces[at], mask, op === ':' ? '>=' : op) };
    }
    case 'edhrec': {
      const number = Number(lower);
      if (!lower || !Number.isFinite(number)) return fail('EDHREC rank needs a number.');
      return { cost: 1, test: at => cards[at].er !== undefined && compareNumbers(/** @type {number} */ (cards[at].er), number, op) };
    }
    case 'f': case 'banned': case 'restricted': {
      const at = formatAt(lower);
      if (at < 0) return fail(`${value} isn’t a format card lookup knows.`);
      const want = key === 'f' ? 'lr' : key === 'banned' ? 'b' : 'r';
      const list = legalities(index);
      return { cost: 2, test: card => want.includes(list[card][at]) };
    }
    case 'r': {
      const want = rarityOrder[lower];
      if (want === undefined) return fail(`${value} isn’t a rarity.`);
      note('caveat', 'Rarity is from one printing of each card, so cards printed at other rarities may be missing.');
      return { cost: 1, test: at => cards[at].r !== undefined && compareNumbers(rarityOrder[/** @type {string} */ (cards[at].r)], want, op) };
    }
    case 'is': case 'has': {
      if (key === 'has') {
        if (lower === 'indicator') return { cost: 1, test: at => Boolean(cards[at].ci) };
        if (lower === 'watermark') {
          note('cut', `has:${value}`, 'art');
          return null;
        }
        return fail(`has:${value} isn’t a search keyword, so it’s left out.`);
      }
      const kind = kindOf(lower);
      if (kind) return { cost: lower === 'frenchvanilla' ? 8 : 2, test: at => kind(cards[at], at, index) };
      if (printingValues.has(lower)) {
        note('cut', `is:${value}`, 'printing');
        return null;
      }
      note('hint', `is:${value} isn’t a search keyword. Showing results without it.`);
      return null;
    }
    default: return fail(`${node.keyword}: isn’t available yet.`);
  }
}

/**
 * Power, toughness, power plus toughness and loyalty, on any face, against a number, `*`, or another of them.
 * @param {CardIndex} index
 * @param {QueryNode & { k: 'term' }} node
 * @param {(text: string) => null} fail
 * @returns {Compiled | null}
 */
function statTerm(index, node, fail) {
  const columns = columnsOf(index);
  const { cards } = index;
  /** @type {Record<string, (side: number, at: number) => number>} */
  const stats = {
    pow: (side, at) => columns.power[side][at],
    tou: (side, at) => columns.toughness[side][at],
    pt: (side, at) => columns.power[side][at] + columns.toughness[side][at],
    loy: (side, at) => columns.loyalty[side][at],
  };
  /** @type {Record<string, string>} */
  const names = { pow: 'pow', power: 'pow', tou: 'tou', toughness: 'tou', pt: 'pt', powtou: 'pt', loy: 'loy', loyalty: 'loy' };
  const mine = stats[node.key];
  const lower = node.value.toLowerCase();
  const other = stats[names[lower]];
  const op = node.op;
  if (other) {
    return { cost: 1, test: (at) => {
      for (const a of [0, 1]) {
        for (const b of [0, 1]) {
          const left = mine(a, at);
          const right = other(b, at);
          if (!Number.isNaN(left) && !Number.isNaN(right) && compareNumbers(left, right, op)) return true;
        }
      }
      return false;
    } };
  }
  if (lower === '*') {
    const part = node.key === 'tou' ? 1 : 0;
    return { cost: 1, test: at => facesOf(cards[at]).some(face => (node.key === 'loy' ? face.l : face.p?.split('/')[part])?.includes('*') ?? false) };
  }
  const number = Number(lower);
  if (!lower || !Number.isFinite(number)) return fail(`${node.keyword} needs a number or another stat.`);
  return { cost: 1, test: at => [0, 1].some(side => !Number.isNaN(mine(side, at)) && compareNumbers(mine(side, at), number, op)) };
}

// Devotion (§3.3): permanents only, counting the front face's mana symbols that hold any of the query's colours, so a
// {U} counts toward {u/b}. The value is one colour or one hybrid pair, repeated.
/** @param {CardIndex} index @param {QueryNode & { k: 'term' }} node @param {(text: string) => null} fail @returns {Compiled | null} */
function devotionTerm(index, node, fail) {
  const want = readCost(node.value);
  const symbols = [...want.symbols.keys()];
  if (symbols.length !== 1 || want.generic) return fail('Devotion takes one colour or one hybrid pair, such as {u/b}{u/b}.');
  const colours = new Set(symbols[0].split('/').filter(part => 'WUBRG'.includes(part)));
  const count = /** @type {number} */ (want.symbols.get(symbols[0]));
  const front = pips(index);
  const permanent = /** @type {(card: Card, at: number, index: CardIndex) => boolean} */ (kindOf('permanent'));
  const op = node.op === ':' ? '>=' : node.op;
  return { cost: 3, test: (at) => {
    if (!permanent(index.cards[at], at, index)) return false;
    let devotion = 0;
    for (const parts of front[at]) if (parts.some(part => colours.has(part))) devotion++;
    return compareNumbers(devotion, count, op);
  } };
}

// A name word, phrase or exact name (§2.5): a bare word's letters anywhere in the name's, with spaces and punctuation
// gone; a quoted phrase in the name in lower case; an exact name, the whole name or one face's.
/** @param {CardIndex} index @param {{ value: string, quoted?: boolean, exact?: boolean }} name @returns {Compiled | null} */
function nameTerm(index, { value, quoted, exact }) {
  if (exact) {
    const want = fold(value);
    const faces = faceKeys(index);
    return { cost: 1, test: at => index.keys[at] === want || faces[at].includes(want) };
  }
  if (quoted) {
    const want = lowerName(value);
    const names = lowerNames(index);
    return { cost: 1, test: at => names[at].includes(want) };
  }
  const want = squash(value);
  if (!want) return null;
  const names = squashedNames(index);
  return { cost: 1, test: at => names[at].includes(want) };
}

// ---- Evaluating ----------------------------------------------------------------------------------------------------------

/** @param {QueryNode} node */
const cacheKey = node => (node.k === 'name' ? `name ${node.exact ? '!' : ''}${node.quoted ? '"' : ''}${node.value}`
  : node.k === 'term' ? `${node.key}${node.op}${node.regex ? '/' : ''}${node.value}` : '');

/**
 * Runs a parsed query: the matching cards' places, in the order they're listed (§6.4), the notes to show, and the sort
 * for the status line ("by mana value"), if any.
 * @param {CardIndex} index
 * @param {ParsedQuery} parsed
 * @param {string} query What was typed, for the exact-name boost.
 * @returns {{ hits: number[], notes: ShownNote[], sort: string | null }}
 */
export function runQuery(index, parsed, query) {
  const columns = columnsOf(index);
  const count = index.cards.length;
  /** @type {QueryNote[]} */
  const raised = [...parsed.notes];
  /** @type {Map<QueryNode, Compiled | null>} */
  const compiled = new Map();
  for (const node of leaves(parsed.ast)) {
    const at = 'at' in node ? node.at : 0;
    const end = 'end' in node ? node.end : 0;
    /** @type {(kind: QueryNote['kind'], text: string, group?: string) => void} */
    const note = (kind, text, group) => raised.push({ kind, at, end, text, ...(group ? { group } : {}) });
    compiled.set(node, node.k === 'term' ? compileTerm(index, node, note) : node.k === 'name' ? nameTerm(index, node) : null);
  }
  /** @param {QueryNode} node @returns {number} */
  const costOf = node => (node.k === 'and' || node.k === 'or' ? Math.max(...node.items.map(costOf)) : node.k === 'not' ? costOf(node.item) : compiled.get(node)?.cost ?? 0);

  /** @param {QueryNode} node @param {Uint8Array | null} within @returns {Uint8Array | null} */
  function evaluate(node, within) {
    if (node.k === 'and') {
      let current = within;
      let any = false;
      for (const item of [...node.items].sort((a, b) => costOf(a) - costOf(b))) {
        const mask = evaluate(item, current);
        if (mask) {
          current = mask;
          any = true;
        }
      }
      return any ? current : null;
    }
    if (node.k === 'or') {
      const masks = node.items.map(item => evaluate(item, within)).filter(mask => mask !== null);
      if (!masks.length) return null;
      const union = new Uint8Array(count);
      for (const mask of masks) for (let at = 0; at < count; at++) union[at] |= mask[at];
      return union;
    }
    if (node.k === 'not') {
      const inner = evaluate(node.item, within);
      if (!inner) return null;
      const result = new Uint8Array(count);
      for (let at = 0; at < count; at++) result[at] = (within ? within[at] : 1) & (inner[at] ^ 1);
      return result;
    }
    const term = compiled.get(node);
    if (!term) return null;
    const key = cacheKey(node);
    let full = columns.cache.get(key);
    if (!full && (!within || term.cost < 5)) {
      full = term.all ? term.all() : new Uint8Array(count);
      if (!term.all) for (let at = 0; at < count; at++) full[at] = term.test(at) ? 1 : 0;
      columns.cache.delete(key);
      columns.cache.set(key, full);
      while (columns.cache.size > cacheSize) columns.cache.delete(/** @type {string} */ (columns.cache.keys().next().value));
    }
    const result = new Uint8Array(count);
    if (full) for (let at = 0; at < count; at++) result[at] = (within ? within[at] : 1) & full[at];
    else for (let at = 0; at < count; at++) result[at] = within && within[at] && term.test(at) ? 1 : 0;
    return result;
  }

  const mask = parsed.ast ? evaluate(parsed.ast, null) : null;
  /** @type {number[]} */
  const matches = [];
  if (mask) for (let at = 0; at < count; at++) if (mask[at]) matches.push(at);
  /** @type {string | null} */
  let sort = null;
  let hits;
  if (parsed.order) {
    const known = sorts[parsed.order];
    if (known) {
      hits = sortHits(index, matches, parsed.order, parsed.direction ? parsed.direction === 'desc' : known.descending);
      sort = known.by;
    } else {
      const group = /^(?:usd|eur|tix)$/.test(parsed.order) ? 'prices' : 'sort';
      raised.push({ kind: 'cut', at: 0, end: 0, text: `order:${parsed.order}`, group });
      hits = matches;
    }
  } else hits = orderHits(index, parsed, matches, query);
  const notes = shownNotes(raised, { empty: !mask, nothing: !hits.length, ast: parsed.ast });
  return { hits, notes, sort };
}

// Sorts by a field (§3.8), ties by name, which is the file's order; cards without the field go last either way.
/** @param {CardIndex} index @param {number[]} matches @param {string} order @param {boolean} descending */
function sortHits(index, matches, order, descending) {
  const columns = columnsOf(index);
  const { cards } = index;
  /** @type {Record<string, (at: number) => number>} */
  const fields = {
    name: at => at, cmc: at => columns.mv[at], mv: at => columns.mv[at],
    power: at => columns.power[0][at], pow: at => columns.power[0][at], toughness: at => columns.toughness[0][at], tou: at => columns.toughness[0][at],
    rarity: at => (cards[at].r === undefined ? NaN : rarityOrder[/** @type {string} */ (cards[at].r)]),
    color: at => colourPlace(columns.colours[at]), colour: at => colourPlace(columns.colours[at]),
    edhrec: at => cards[at].er ?? NaN,
  };
  const value = fields[order];
  const sign = descending ? -1 : 1;
  return [...matches].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (Number.isNaN(left) !== Number.isNaN(right)) return Number.isNaN(left) ? 1 : -1;
    return (Number.isNaN(left) ? 0 : sign * (left - right)) || a - b;
  });
}
// W U B R G alone, then multicolour, then colourless.
/** @param {number} mask */
const colourPlace = mask => (mask === 0 ? 6 : colourCount(mask) > 1 ? 5 : Math.log2(mask));

// The order a syntax query without order: lists its cards in (§6.4): a card whose name is the whole query first (so
// "Death or Glory" finds itself, though "or" is the operator); then, by the plain search's ranking of the query's name
// words, the cards those words find; then the rest in name order, which is the file's.
/** @param {CardIndex} index @param {ParsedQuery} parsed @param {number[]} matches @param {string} query */
function orderHits(index, parsed, matches, query) {
  const { keys } = index;
  const hit = new Uint8Array(index.cards.length);
  for (const at of matches) hit[at] = 1;
  /** @type {number[]} */
  const ordered = [];
  const take = (/** @type {number} */ at) => {
    if (hit[at] !== 1) return;
    hit[at] = 2;
    ordered.push(at);
  };
  const whole = fold(query);
  if (whole) matches.filter(at => keys[at] === whole).forEach(take);
  const words = positiveNames(parsed.ast).join(' ');
  if (words) {
    for (const bucket of searchNames(index, words)) [...bucket].sort((a, b) => keys[a].length - keys[b].length).forEach(take);
  }
  matches.forEach(take);
  return ordered;
}
// The bare name words a query asks for, not under a NOT.
/** @param {QueryNode | null} node @returns {string[]} */
function positiveNames(node) {
  if (!node) return [];
  if (node.k === 'and' || node.k === 'or') return node.items.flatMap(positiveNames);
  if (node.k === 'name' && !node.exact) return [node.value];
  return [];
}

// The notes in the order they're shown: errors, then one note per cut group naming its terms, then hints and caveats.
/** @param {QueryNote[]} raised @param {{ empty: boolean, nothing: boolean, ast: QueryNode | null }} state @returns {ShownNote[]} */
function shownNotes(raised, { empty, nothing, ast }) {
  /** @type {ShownNote[]} */
  const shown = [];
  const seen = new Set();
  const add = (/** @type {ShownNote} */ note) => {
    if (seen.has(note.text)) return;
    seen.add(note.text);
    shown.push(note);
  };
  for (const note of raised.filter(item => item.kind === 'error')) add({ kind: 'error', text: note.text, terms: [], short: note.text });
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const note of raised.filter(item => item.kind === 'cut')) {
    const group = note.group ?? 'printing';
    groups.set(group, [...(groups.get(group) ?? []), note.text]);
  }
  for (const [group, terms] of groups) {
    const { text, short } = cutGroups[group];
    const list = [...new Set(terms)].join(' and ');
    const allCut = empty && ast === null && group !== 'sort';
    const full = allCut && groups.size === 1 && !raised.some(item => item.kind === 'error')
      ? `${text.split('.')[0]}, and nothing else in this search is. Try a name, type or rules text.`
      : text.replace('{terms}', list);
    add({ kind: 'cut', text: full, terms: full.includes(list) ? [...new Set(terms)] : [], short: short.replace('{terms}', list) });
  }
  for (const note of raised.filter(item => item.kind === 'hint' || item.kind === 'caveat')) add({ kind: note.kind, text: note.text, terms: [], short: note.text });
  if (nothing) {
    for (const node of leaves(ast)) {
      if (node.k !== 'name' || node.quoted || node.exact) continue;
      const keyword = /^([a-z]+)[:=<>]/i.exec(node.value)?.[1];
      if (keyword) {
        const text = `No card names contain ${node.value}, and ${keyword}: isn’t a search keyword.`;
        add({ kind: 'hint', text, terms: [node.value], short: `${keyword}: isn’t a search keyword` });
      }
    }
  }
  return shown;
}
