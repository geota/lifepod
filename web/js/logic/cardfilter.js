// Evaluates a parsed card query (logic/cardquery.js) over the cards (design/polish/SCRYFALL-SYNTAX-SPEC.md §6.3, §6.4).
// No DOM; the only state is what it builds on a CardIndex the first time it's needed, such as the columns it reads, and
// the last few terms' matches. Each term's matches are a Uint8Array over the cards; AND runs its cheapest terms first
// and gives the slow ones only the cards still in, OR joins, NOT inverts. It never throws: a term it can't read becomes
// a note and is left out.

import { colourMask, faceStats, fold, searchNames } from './cards.js';
import { cutGroups, leaves, printingValues } from './cardquery.js';
import {
  colourCount, compareCosts, compareNumbers, compareSets, formatAt, lowerName, rarityOrder, readColours, readCost,
  readLegalities, reminderText, squash,
} from './cardterms.js';

/** @typedef {import('./cards.js').Card} Card */
/** @typedef {import('./cards.js').CardIndex} CardIndex */
/** @typedef {import('./cardquery.js').QueryNode} QueryNode */
/** @typedef {import('./cardquery.js').QueryNote} QueryNote */
/** @typedef {import('./cardquery.js').ParsedQuery} ParsedQuery */
/** @typedef {import('./cardterms.js').Cost} Cost */
/**
 * A note as the sheet shows it: its kind, its text, the query terms it names (set in monospace), and a short form for
 * the compact layout.
 * @typedef {{ kind: QueryNote['kind'], text: string, terms: string[], short: string }} ShownNote
 */
/**
 * @typedef {object} Columns
 * @property {Uint8Array} colours
 * @property {Uint8Array} identity
 * @property {Float32Array} mv
 * @property {Float32Array[]} power Two faces' power, NaN for none; likewise toughness and loyalty.
 * @property {Float32Array[]} toughness
 * @property {Float32Array[]} loyalty
 * @property {Map<string, any>} lazy The columns built at first use: type lines, rules text, costs and the rest.
 * @property {Map<string, Uint8Array>} cache The last terms' matches, by the term.
 */

/** @type {WeakMap<CardIndex, Columns>} */
const built = new WeakMap();
// How many terms' matches are kept, so that typing a third term doesn't recompute the first two.
const cacheSize = 16;

/** @param {Card} card */
const facesOf = card => card.f ?? [card];

/** @param {CardIndex} index @returns {Columns} */
export function columnsOf(index) {
  const known = built.get(index);
  if (known) return known;
  const { cards } = index;
  const count = cards.length;
  const nan = () => new Float32Array(count).fill(NaN);
  /** @type {Columns} */
  const columns = {
    colours: new Uint8Array(count), identity: new Uint8Array(count), mv: new Float32Array(count),
    power: [nan(), nan()], toughness: [nan(), nan()], loyalty: [nan(), nan()], lazy: new Map(), cache: new Map(),
  };
  cards.forEach((card, at) => {
    columns.identity[at] = colourMask(card.c);
    columns.colours[at] = card.co === '-' ? 0 : colourMask(card.co ?? card.c);
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

// A column built the first time a term needs it, then kept.
/** @template T @param {CardIndex} index @param {string} name @param {(card: Card) => T} make @returns {T[]} */
function lazy(index, name, make) {
  const { lazy: store } = columnsOf(index);
  if (!store.has(name)) store.set(name, index.cards.map(make));
  return store.get(name);
}
/** @param {CardIndex} index */
const typeLines = index => lazy(index, 'types', card => [card.t, ...(card.f ?? []).map(face => face.t)].join('\n').toLowerCase());
/** @param {CardIndex} index */
const fullText = index => lazy(index, 'full', card => facesOf(card).map(face => face.o ?? '').join('\n').toLowerCase());
/** @param {CardIndex} index */
const oracleText = index => lazy(index, 'oracle', card => facesOf(card).map(face => (face.o ?? '').replace(reminderText, '')).join('\n').toLowerCase());
/** @param {CardIndex} index */
const squashedNames = index => lazy(index, 'squashed', card => card.k.replace(/ /g, ''));
/** @param {CardIndex} index */
const lowerNames = index => lazy(index, 'lower', card => lowerName(card.n));
/** @param {CardIndex} index */
const faceKeys = index => lazy(index, 'faceKeys', card => (card.f ?? []).map(face => fold(face.n)));
/** @param {CardIndex} index */
const keywordLists = index => lazy(index, 'keywords', card => (card.kw ?? []).map(keyword => keyword.toLowerCase()));
/** @param {CardIndex} index */
const legalities = index => lazy(index, 'legal', card => readLegalities(card.lg));
/** @param {CardIndex} index */
const costs = index => lazy(index, 'costs', card => (card.f ? card.f.filter(face => face.m) : [card]).map(face => readCost(face.m)));
/** @param {CardIndex} index */
const costText = index => lazy(index, 'costText', card => facesOf(card).map(face => face.m ?? '').join(' ') + (card.m ?? ''));

// Text joined into one string with each card's start, which indexOf searches faster than 33,000 short strings.
/** @param {CardIndex} index @param {string} name @param {string[]} texts */
function joined(index, name, texts) {
  const { lazy: store } = columnsOf(index);
  if (!store.has(name)) {
    const starts = new Int32Array(texts.length + 1);
    for (let at = 0; at < texts.length; at++) starts[at + 1] = starts[at] + texts[at].length + 1;
    store.set(name, { text: texts.join('\u0001'), starts });
  }
  return /** @type {{ text: string, starts: Int32Array }} */ (store.get(name));
}
/** @param {{ text: string, starts: Int32Array }} source @param {string} needle @param {Uint8Array} mask */
function scan(source, needle, mask) {
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

// ---- Terms ----------------------------------------------------------------------------------------------------------------

/**
 * A term ready to run: its cost (cheap terms run first in an AND), a test for one card, and optionally a way to find
 * every match at once that's faster than testing each card.
 * @typedef {{ cost: number, test: (at: number) => boolean, all?: () => Uint8Array }} Compiled
 */
// The layout and flag values of is: that M2 answers, and has:indicator.
/** @type {Record<string, (card: Card, at: number, index: CardIndex) => boolean>} */
export const isValues = {
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
  hybrid: (_, at, index) => /\{[^}/]+\/[^}P]+\}/i.test(costText(index)[at]),
  phyrexian: (_, at, index) => /\/p\}/i.test(costText(index)[at]) || /\/p\}/.test(fullText(index)[at]),
  gamechanger: card => Boolean(card.gc),
  reserved: card => Boolean(card.rs),
  funny: card => Boolean(card.fun),
};

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
      const start = new RegExp(`(?:^|[^a-z0-9])${lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      return { cost: 2, test: at => start.test(types[at]) };
    }
    case 'o': case 'fo': {
      const texts = key === 'o' ? oracleText(index) : fullText(index);
      const needle = lower.replace(/\s+/g, ' ');
      return { cost: 5, test: at => texts[at].includes(needle), all: () => scan(joined(index, `${key}-joined`, texts), needle, new Uint8Array(cards.length)) };
    }
    case 'name': return nameTerm(index, { value, quoted: node.quoted });
    case 'kw': {
      const lists = keywordLists(index);
      return { cost: 2, test: at => lists[at].includes(lower) };
    }
    case 'm': {
      const want = readCost(value);
      const list = costs(index);
      return { cost: 3, test: at => (list[at].length ? list[at] : [readCost('')]).some(cost => compareCosts(cost, want, op)) };
    }
    case 'mv': {
      if (lower === 'even') return { cost: 1, test: at => columns.mv[at] % 2 === 0 };
      if (lower === 'odd') return { cost: 1, test: at => columns.mv[at] % 2 === 1 };
      const number = Number(lower);
      if (!lower || !Number.isFinite(number)) return fail('Mana value needs a number, even or odd.');
      return { cost: 1, test: at => compareNumbers(columns.mv[at], number, op) };
    }
    case 'pow': case 'tou': case 'pt': case 'loy': return statTerm(index, node, fail);
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
      const test = isValues[lower];
      if (test) return { cost: 2, test: at => test(cards[at], at, index) };
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
 * Runs a parsed query: the matching cards' places, in the order they're listed (§6.4), and the notes to show.
 * @param {CardIndex} index
 * @param {ParsedQuery} parsed
 * @param {string} query What was typed, for the exact-name boost.
 * @returns {{ hits: number[], notes: ShownNote[] }}
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
  const hits = orderHits(index, parsed, matches, query);
  const notes = shownNotes(raised, { empty: !mask, nothing: !hits.length, ast: parsed.ast });
  return { hits, notes };
}

// The order a syntax query lists its cards in (§6.4): a card whose name is the whole query first (so "Death or Glory"
// finds itself, though "or" is the operator); then, by the plain search's ranking of the query's name words, the cards
// those words find; then the rest in name order, which is the file's.
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
    for (const bucket of searchNames(index, words)) {
      [...bucket].sort((a, b) => keys[a].length - keys[b].length).forEach(take);
    }
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
    const allCut = empty && ast === null;
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
