// The vocabulary card lookup's query language reads (design/polish/SCRYFALL-SYNTAX-SPEC.md §3): colour names, the
// formats and their order (scripts/cards-update.mjs writes each card's legalities in this order), the rarity order,
// mana costs as multisets of symbols, and Scryfall's regular expressions translated for JavaScript. No DOM and no state.

import { fold } from './cards.js';

// ---- Colours ----------------------------------------------------------------------------------------------------------

export const W = 1;
export const U = 2;
export const B = 4;
export const R = 8;
export const G = 16;
/** @type {Record<string, number>} */
const colourLetters = { w: W, u: U, b: B, r: R, g: G };
// Guilds, shards, wedges, Strixhaven's colleges, the four-colour names and Ikoria's triomes, as Scryfall reads them.
/** @type {Record<string, number>} */
export const colourNames = {
  white: W, blue: U, black: B, red: R, green: G,
  azorius: W | U, dimir: U | B, rakdos: B | R, gruul: R | G, selesnya: G | W,
  orzhov: W | B, izzet: U | R, golgari: B | G, boros: R | W, simic: G | U,
  bant: G | W | U, esper: W | U | B, grixis: U | B | R, jund: B | R | G, naya: R | G | W,
  abzan: W | B | G, jeskai: U | R | W, sultai: B | G | U, mardu: R | W | B, temur: G | U | R,
  silverquill: W | B, prismari: U | R, witherbloom: B | G, lorehold: R | W, quandrix: G | U,
  ruric: R | G | W, ketria: G | U | R, indatha: W | B | G, raugrin: U | R | W, zagoth: B | G | U, savai: R | W | B,
  chaos: U | B | R | G, aggression: W | B | R | G, altruism: W | U | R | G, growth: W | U | B | G, artifice: W | U | B | R,
  wubrg: 31, rainbow: 31,
};
/**
 * A colour value: letters (`wubrg`, `c`), a colour or guild name, colourless, multicolour, or a number of colours.
 * @param {string} raw
 * @returns {{ mask?: number, count?: number, multi?: boolean, colourless?: boolean } | null}
 */
export function readColours(raw) {
  const value = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^\d+$/.test(value)) return { count: Number(value) };
  if (value === 'c' || value === 'colorless' || value === 'colourless') return { mask: 0, colourless: true };
  if (value === 'm' || value === 'multicolor' || value === 'multicolour' || value === 'gold') return { multi: true };
  if (Object.hasOwn(colourNames, value)) return { mask: colourNames[value] };
  if (/^[wubrgc]+$/.test(value)) {
    let mask = 0;
    for (const letter of value) mask |= colourLetters[letter] ?? 0;
    return { mask };
  }
  return null;
}
/** @param {number} mask */
export function colourCount(mask) {
  let count = 0;
  for (let rest = mask & 31; rest; rest &= rest - 1) count++;
  return count;
}
// Two sets of colours (or produced mana) as Scryfall compares them: `=` the same, `<=` a subset, `>=` a superset.
/** @param {number} have @param {number} want @param {string} op */
export function compareSets(have, want, op) {
  const subset = (have & want) === have;
  const superset = (have & want) === want;
  switch (op) {
    case '=': return have === want;
    case '!=': return have !== want;
    case '<': return subset && have !== want;
    case '<=': return subset;
    case '>': return superset && have !== want;
    default: return superset;
  }
}
/** @param {number} a @param {number} b @param {string} op */
export function compareNumbers(a, b, op) {
  switch (op) {
    case '=': case ':': return a === b;
    case '!=': return a !== b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    default: return a >= b;
  }
}

// ---- Formats and rarity -------------------------------------------------------------------------------------------------

// Every format in Scryfall's legalities, in the order of each card's `lg` letters: `a` is standard, `w` is tlr.
export const formats = ['standard', 'future', 'historic', 'timeless', 'gladiator', 'pioneer', 'modern', 'legacy', 'pauper', 'vintage',
  'penny', 'commander', 'oathbreaker', 'standardbrawl', 'brawl', 'competitivebrawl', 'alchemy', 'paupercommander', 'duel', 'oldschool',
  'premodern', 'predh', 'tlr'];
/** @type {Record<string, string>} */
const formatAliases = { edh: 'commander', pennydreadful: 'penny', duelcommander: 'duel', pdh: 'paupercommander', historicbrawl: 'brawl' };
/** @param {string} value @returns {number} the format's place, or -1 */
export function formatAt(value) {
  const name = value.toLowerCase();
  return formats.indexOf(formatAliases[name] ?? name);
}
// A card's `lg` as one letter per format: l (legal), b (banned), r (restricted) or n (not legal).
/** @param {string | undefined} lg */
export function readLegalities(lg) {
  const found = Array(formats.length).fill('n');
  for (const match of (lg ?? '').matchAll(/(\+?)([a-zA-Z])/g)) {
    const at = match[2].toLowerCase().charCodeAt(0) - 97;
    if (at < 0 || at >= formats.length) continue;
    found[at] = match[1] ? 'r' : match[2] === match[2].toUpperCase() ? 'b' : 'l';
  }
  return found.join('');
}
// Writes a card's legalities as `lg` (scripts/cards-update.mjs): lower case legal, upper case banned, +x restricted.
/** @param {Record<string, string>} legalities */
export function writeLegalities(legalities) {
  let lg = '';
  formats.forEach((format, at) => {
    const letter = String.fromCharCode(97 + at);
    const state = legalities?.[format];
    if (state === 'legal') lg += letter;
    else if (state === 'banned') lg += letter.toUpperCase();
    else if (state === 'restricted') lg += `+${letter}`;
  });
  return lg;
}
// Rarity, in Scryfall's order: common < uncommon < rare < special < mythic < bonus.
/** @type {Record<string, number>} */
export const rarityOrder = { c: 0, common: 0, u: 1, uncommon: 1, r: 2, rare: 2, s: 3, special: 3, m: 4, mythic: 4, b: 5, bonus: 5 };
const rarityLetters = 'cursmb';
// What in: takes as a rarity (in:rare); anything else after in: is a set or a language.
export const rarityWords = new Set(['common', 'uncommon', 'rare', 'special', 'mythic', 'bonus']);
/**
 * Every rarity a card has been printed at, as letters (scripts/cards-update.mjs printedRarities()): for r:, or for in:,
 * which leaves out promos and special products.
 * @param {import('./cards.js').Card} card
 * @param {boolean} [forIn]
 */
export function printedRarities(card, forIn = false) {
  const all = card.rp ?? card.r ?? '';
  return forIn && card.ri !== undefined ? card.ri.replace('-', '') : all;
}

/** @typedef {import('./cardquery.js').QueryNode} QueryNode */
/**
 * Scryfall matches r: against each printing, then lists each card that has a printing that matched, so
 * `r:common r:rare` finds nothing and `-r:common` finds every card with a printing that isn't common. Each card here
 * keeps the set of rarities it was printed at, so the rarity terms that share a printing are joined into one before
 * the query runs: an AND's r: terms (and -r: terms) become one term that some printed rarity must meet in full, and a
 * lone -r: term becomes "some printed rarity isn't". The joined term is an `r` term whose value lists its parts and
 * ends in a space, such as `>=r !:m `, which readRarityParts() reads. A term that isn't a rarity stays as it was, for
 * its own error. in: is about the card, not a printing, so it isn't joined.
 * @param {QueryNode | null} node
 * @returns {QueryNode | null}
 */
export function joinRarities(node) {
  if (!node) return node;
  /** @param {QueryNode} item @returns {{ part: string, at: number, end: number } | null} */
  const partOf = (item) => {
    const negated = item.k === 'not';
    const term = item.k === 'not' ? item.item : item;
    if (term.k !== 'term' || term.key !== 'r' || term.regex) return null;
    const want = rarityOrder[term.value.toLowerCase()];
    if (want === undefined) return null;
    return { part: `${negated ? '!' : ''}${term.op === '=' ? ':' : term.op}${rarityLetters[want]}`, at: term.at, end: term.end };
  };
  /** @param {{ part: string, at: number, end: number }[]} parts @returns {QueryNode} */
  const joined = parts => ({ k: 'term', key: 'r', keyword: 'r', op: ':', value: `${parts.map(part => part.part).join(' ')} `,
    at: Math.min(...parts.map(part => part.at)), end: Math.max(...parts.map(part => part.end)) });
  if (node.k === 'not') {
    const part = partOf(node);
    return part ? joined([part]) : { k: 'not', item: /** @type {QueryNode} */ (joinRarities(node.item)) };
  }
  if (node.k === 'or') return { k: 'or', items: node.items.map(item => /** @type {QueryNode} */ (joinRarities(item))) };
  if (node.k !== 'and') return node;
  const parts = [];
  /** @type {QueryNode[]} */
  const rest = [];
  for (const item of node.items) {
    const part = partOf(item);
    if (part) parts.push(part);
    else rest.push(/** @type {QueryNode} */ (joinRarities(item)));
  }
  return parts.length ? { k: 'and', items: [joined(parts), ...rest] } : node;
}
/**
 * The parts of a joined rarity term (joinRarities()), or null for a plain r: value.
 * @param {string} value
 * @returns {{ negated: boolean, op: string, want: number }[] | null}
 */
export function readRarityParts(value) {
  if (!value.endsWith(' ')) return null;
  return value.trim().split(' ').map((part) => {
    const negated = part.startsWith('!');
    const body = negated ? part.slice(1) : part;
    return { negated, op: body.slice(0, -1), want: rarityOrder[body.slice(-1)] };
  });
}
/** @param {number} order */
export const rarityLetter = order => rarityLetters[order];

// ---- Mana costs -----------------------------------------------------------------------------------------------------------

/** @typedef {{ generic: number, symbols: Map<string, number> }} Cost */
// A symbol in a standard spelling: upper case, hybrid halves in W U B R G C order, Phyrexian last, so {U/W} = {W/U}.
/** @param {string} symbol */
function canonical(symbol) {
  const parts = symbol.toUpperCase().split('/');
  const phyrexian = parts.at(-1) === 'P' && parts.length > 1 ? parts.pop() : null;
  const order = 'WUBRGC';
  const place = (/** @type {string} */ part) => (order.includes(part) ? order.indexOf(part) : -1);
  parts.sort((a, b) => place(a) - place(b));
  return `${parts.join('/')}${phyrexian ? '/P' : ''}`;
}
// A mana cost as a multiset: the generic number, and a count for each other symbol. A query may write plain symbols
// without braces (`2WW`); split and hybrid symbols need them (`{R/P}`).
/** @param {string | undefined} text @returns {Cost} */
export function readCost(text) {
  /** @type {Cost} */
  const cost = { generic: 0, symbols: new Map() };
  const add = (/** @type {string} */ symbol) => cost.symbols.set(symbol, (cost.symbols.get(symbol) ?? 0) + 1);
  for (const match of (text ?? '').matchAll(/\{([^}]+)\}|(\d+)|([a-z])/gi)) {
    if (match[1] !== undefined) {
      if (/^\d+$/.test(match[1])) cost.generic += Number(match[1]);
      else add(canonical(match[1]));
    } else if (match[2] !== undefined) cost.generic += Number(match[2]);
    else add(match[3].toUpperCase());
  }
  return cost;
}
/** @param {Cost} a @param {Cost} b whether a ⊆ b */
function within(a, b) {
  if (a.generic > b.generic) return false;
  for (const [symbol, count] of a.symbols) if ((b.symbols.get(symbol) ?? 0) < count) return false;
  return true;
}
/** @param {Cost} have @param {Cost} want @param {string} op */
export function compareCosts(have, want, op) {
  const same = within(have, want) && within(want, have);
  switch (op) {
    case '=': return same;
    case '!=': return !same;
    case '<': return within(have, want) && !same;
    case '<=': return within(have, want);
    case '>': return within(want, have) && !same;
    default: return within(want, have);
  }
}

// ---- Names and text -------------------------------------------------------------------------------------------------------

// A name or word with its spaces and punctuation removed: "lim-dul's" and "limduls" are the same.
/** @param {string} text */
export const squash = text => fold(text).replace(/ /g, '');

// ---- Patterns -------------------------------------------------------------------------------------------------------------

// Scryfall's pattern shorthands (§2.3), longest first so \smr isn't read as \sm and an r.
const shorthands = [
  ['\\smr', '(?:\\{w\\}\\{w\\}|\\{u\\}\\{u\\}|\\{b\\}\\{b\\}|\\{r\\}\\{r\\}|\\{g\\}\\{g\\}|\\{c\\}\\{c\\})'],
  ['\\smh', '\\{[^}/]+\\/[^}]+\\}'],
  ['\\smp', '\\{(?:[^}]*\\/)?p\\}'],
  ['\\spt', '[-+]?(?:\\d+|\\*|x)\\/[-+]?(?:\\d+|\\*|x)'],
  ['\\spp', '\\+(?:\\d+|x)\\/\\+(?:\\d+|x)'],
  ['\\smm', '-(?:\\d+|x)\\/-(?:\\d+|x)'],
  ['\\sm', '\\{[^}]+\\}'],
  ['\\sc', '\\{(?:[wubrg](?:\\/[^}]+)?|[^}]*\\/[wubrg][^}]*)\\}'],
  ['\\ss', '\\{[^}]+\\}'],
];
/**
 * A Scryfall pattern as a JavaScript RegExp (flags `im`): its shorthands expanded, braces that aren't a {m,n}
 * quantifier taken literally (so `{T}` works), and back-references and nested quantifiers refused, since a pattern
 * can't be stopped once it runs.
 * @param {string} source
 * @returns {{ pattern: RegExp, tilde: boolean } | { error: string }}
 */
export function readPattern(source) {
  if (/\\[1-9]/.test(source)) return { error: 'Back-references aren’t supported.' };
  let out = '';
  for (let at = 0; at < source.length; at++) {
    const rest = source.slice(at);
    const shorthand = shorthands.find(([name]) => rest.startsWith(name));
    if (shorthand) {
      out += shorthand[1];
      at += shorthand[0].length - 1;
    } else if (rest[0] === '\\') {
      out += rest.slice(0, 2);
      at++;
    } else if (rest[0] === '{' && !/^\{\d+(,\d*)?\}/.test(rest)) out += '\\{';
    else if (rest[0] === '}' && !/\{\d+(,\d*)?$/.test(out)) out += '\\}';
    else out += rest[0];
  }
  // A quantified group that holds a quantifier, such as (a+)+, can backtrack for ever.
  if (/\((?:[^()\\]|\\.)*[*+}](?:[^()\\]|\\.)*\)[*+{]/.test(out)) return { error: 'This pattern could take too long. Try it without a repeated group.' };
  try {
    return { pattern: new RegExp(out, 'im'), tilde: source.includes('~') };
  } catch (error) {
    return { error: `Invalid pattern: ${String(/** @type {Error} */ (error).message).replace(/^Invalid regular expression: (\/.*\/[a-z]*: )?/, '')}` };
  }
}

// ---- Land nicknames ---------------------------------------------------------------------------------------------------------

// The land cycles Scryfall names (§3.7), as `is:` values, with their aliases. scripts/cards-update.mjs asks Scryfall for
// each one's cards and writes them into each card's `lc`.
export const landNicknames = ['bikeland', 'bondland', 'bounceland', 'canopyland', 'checkland', 'creatureland', 'dual', 'fastland',
  'fetchland', 'filterland', 'gainland', 'manland', 'painland', 'pathway', 'scryland', 'surveilland', 'shadowland', 'shockland',
  'slowland', 'storageland', 'tangoland', 'tricycleland', 'triland'];
/** @type {Record<string, string>} */
export const nicknameAliases = {
  cycleland: 'bikeland', bicycleland: 'bikeland', crowdland: 'bondland', bbdland: 'bondland', battlebondland: 'bondland', karoo: 'bounceland',
  canland: 'canopyland', snarl: 'shadowland', battleland: 'tangoland', trikeland: 'tricycleland', triome: 'tricycleland',
};
