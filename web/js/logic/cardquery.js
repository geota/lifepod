// Card lookup's query language: Scryfall's search syntax, parsed into a tree with notes (design/polish/
// SCRYFALL-SYNTAX-SPEC.md §2). No DOM and no state, and it never throws: an unclosed quote, bracket or pattern closes at
// the end of the query, a stray ) is skipped, and each with a note. logic/cardfilter.js evaluates the tree.

/**
 * A note about the query, shown under the search field: an error (the term was mended or dropped), a cut keyword (data
 * card lookup doesn't have), a hint, or a caveat about the results. `at` and `end` are where it is in the query.
 * @typedef {{ kind: 'error' | 'cut' | 'hint' | 'caveat', at: number, end: number, text: string, group?: string }} QueryNote
 */
/**
 * @typedef {{ k: 'and' | 'or', items: QueryNode[] }
 *   | { k: 'not', item: QueryNode }
 *   | { k: 'name', value: string, quoted?: boolean, exact?: boolean, at: number, end: number }
 *   | { k: 'term', key: string, keyword: string, op: string, value: string, quoted?: boolean, regex?: boolean, at: number, end: number }
 * } QueryNode
 */
/**
 * @typedef {object} ParsedQuery
 * @property {QueryNode | null} ast
 * @property {QueryNote[]} notes
 * @property {boolean} syntax Whether the query uses any syntax; a query without it is a plain name search.
 * @property {string | null} order
 * @property {string | null} direction
 */

// Every keyword card lookup answers, by alias, with its canonical name.
/** @type {Record<string, string>} */
export const keywords = {
  c: 'c', color: 'c', colour: 'c', colors: 'c', colours: 'c',
  id: 'id', identity: 'id', ci: 'id', cid: 'id', commander: 'id',
  t: 't', type: 't',
  o: 'o', oracle: 'o', fo: 'fo', fulloracle: 'fo',
  kw: 'kw', keyword: 'kw', keywords: 'kw',
  m: 'm', mana: 'm',
  mv: 'mv', manavalue: 'mv', cmc: 'mv',
  devotion: 'devotion', produces: 'produces',
  pow: 'pow', power: 'pow', tou: 'tou', toughness: 'tou', pt: 'pt', powtou: 'pt', loy: 'loy', loyalty: 'loy',
  is: 'is', not: 'not', has: 'has',
  f: 'f', format: 'f', legal: 'f', banned: 'banned', restricted: 'restricted',
  r: 'r', rarity: 'r',
  edhrec: 'edhrec', edhrecrank: 'edhrec',
  name: 'name',
  order: 'order', sort: 'order', direction: 'direction', dir: 'direction',
  otag: 'otag', function: 'otag', oracletag: 'otag',
};
// The keywords that take a /pattern/.
const patternKeys = new Set(['t', 'o', 'fo', 'name']);
// The keywords whose values are words, which take only `:` (and `=`, read as `:`).
export const wordKeys = new Set(['t', 'o', 'fo', 'kw', 'name', 'f', 'banned', 'restricted', 'is', 'not', 'has', 'order', 'direction', 'otag']);

// Keywords for data card lookup doesn't have (§4), by group, with the hint for each group. The terms are named where
// the {terms} are, joined with "and".
/** @type {Record<string, { keys: string[], text: string, short: string }>} */
export const cutGroups = {
  printing: {
    keys: ['s', 'e', 'set', 'edition', 'cn', 'number', 'b', 'block', 'g', 'group', 'st', 'in', 'new', 'year', 'date', 'prints', 'sets', 'paperprints', 'papersets', 'game'],
    text: 'Sets and printings aren’t in the offline data. Showing results without {terms}.',
    short: 'Without {terms} (sets)',
  },
  prices: { keys: ['usd', 'eur', 'tix', 'cheapest'], text: 'Prices aren’t in the offline data. Showing results without {terms}.', short: 'Without {terms} (prices)' },
  art: {
    keys: ['a', 'artist', 'artists', 'ft', 'flavor', 'wm', 'watermark', 'illustrations', 'border', 'frame', 'stamp', 'art', 'atag', 'arttag'],
    text: 'Artists, flavor text and print details aren’t in the offline data. Showing results without {terms}.',
    short: 'Without {terms} (print details)',
  },
  language: { keys: ['lang', 'language'], text: 'Card lookup has English cards only. Showing results without {terms}.', short: 'Without {terms} (English only)' },
  cube: { keys: ['cube'], text: 'Cube lists aren’t in the offline data. Showing results without {terms}.', short: 'Without {terms}' },
  display: { keys: ['unique', 'display', 'prefer'], text: 'Display options don’t apply here, so {terms} is ignored.', short: '{terms} ignored' },
  extras: { keys: ['include'], text: 'Tokens, planes and other extras aren’t in card lookup, so {terms} is ignored.', short: '{terms} ignored' },
  sort: { keys: [], text: '{terms} isn’t available offline. Sorted by name instead.', short: 'Sorted by name' },
  tags: { keys: [], text: 'Community tags couldn’t load. Showing results without {terms}.', short: 'Without {terms} (tags)' },
};
/** @type {Record<string, string>} */
const cutGroupOf = Object.fromEntries(Object.entries(cutGroups).flatMap(([group, { keys }]) => keys.map(key => [key, group])));
// Language codes, which `in:` takes as well as set codes.
const languages = new Set(['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'ru', 'zhs', 'zht', 'he', 'la', 'grc', 'ar', 'sa', 'ph', 'qya']);
// is: values that belong to a printing, not a card: the printing hint, not "isn't a search keyword".
export const printingValues = new Set(['foil', 'nonfoil', 'etched', 'glossy', 'promo', 'reprint', 'unique', 'digital', 'alchemy', 'full',
  'fullart', 'hires', 'booster', 'planeswalker_deck', 'league', 'buyabox', 'giftbox', 'intro_pack', 'gameday', 'prerelease', 'release',
  'fnm', 'judge_gift', 'arena_league', 'player_rewards', 'media_insert', 'instore', 'convention', 'set_promo', 'datestamped',
  'spotlight', 'scryfallpreview', 'masterpiece', 'colorshifted', 'universesbeyond', 'default', 'atypical', 'new', 'old', 'textless',
  'firstprint', 'showcase', 'extendedart', 'borderless', 'serialized', 'stamped']);

// What phone keyboards type: curly quotes and apostrophes become straight ones. One character for one, so a note's
// place in the normalised text is its place in what was typed.
/** @param {string} text */
export const normalise = text => text.replace(/[“”„]/g, '"').replace(/[‘’]/g, '\'');

/** @param {string} input @returns {ParsedQuery} */
export function parseQuery(input) {
  const text = normalise(String(input ?? ''));
  /** @type {QueryNote[]} */
  const notes = [];
  /** @type {(kind: QueryNote['kind'], at: number, end: number, message: string, group?: string) => void} */
  const note = (kind, at, end, message, group) => notes.push({ kind, at, end, text: message, ...(group ? { group } : {}) });
  let pos = 0;
  let syntax = false;
  /** @type {string | null} */
  let order = null;
  /** @type {string | null} */
  let direction = null;

  const space = () => {
    while (pos < text.length && /\s/.test(text[pos])) pos++;
  };
  // A bare run, up to whitespace or a closing bracket.
  const word = () => {
    const start = pos;
    while (pos < text.length && !/[\s)]/.test(text[pos])) pos++;
    return text.slice(start, pos);
  };
  // A quoted run: everything up to the closing quote is one literal value, "or", brackets and colons included. \" is a
  // quote and \\ a backslash; any other backslash is itself.
  const quoted = () => {
    const start = pos++;
    let value = '';
    while (pos < text.length && text[pos] !== '"') {
      if (text[pos] === '\\' && (text[pos + 1] === '"' || text[pos + 1] === '\\')) pos++;
      value += text[pos++];
    }
    if (pos >= text.length) note('error', start, pos, 'Missing closing quote: searching as if it were there.');
    else pos++;
    return value;
  };
  const pattern = () => {
    const start = pos++;
    let source = '';
    while (pos < text.length && text[pos] !== '/') {
      if (text[pos] === '\\') {
        // An escape, or a backslash typed last, which escapes nothing yet and is left out.
        if (pos + 1 < text.length) source += text[pos] + text[pos + 1];
        pos += 2;
        continue;
      }
      source += text[pos++];
    }
    pos = Math.min(pos, text.length);
    if (pos >= text.length) note('error', start, pos, 'Missing closing / in the pattern: searching as if it were there.');
    else pos++;
    return source;
  };

  /** @returns {QueryNode | null} */
  function term() {
    const at = pos;
    if (text[pos] === '!') {
      pos++;
      syntax = true;
      const value = text[pos] === '"' ? quoted() : word();
      return value ? { k: 'name', value, exact: true, at, end: pos } : null;
    }
    if (text[pos] === '"') {
      syntax = true;
      const value = quoted();
      return value ? { k: 'name', value, quoted: true, at, end: pos } : null;
    }
    const head = /^([a-z]+)(!=|<=|>=|:|=|<|>)/i.exec(text.slice(pos));
    const keyword = head?.[1].toLowerCase() ?? '';
    if (head && (Object.hasOwn(keywords, keyword) || Object.hasOwn(cutGroupOf, keyword))) {
      pos += head[0].length;
      const op = head[2];
      const key = keywords[keyword];
      let value = '';
      let isQuoted = false;
      let isPattern = false;
      if (text[pos] === '"') {
        value = quoted();
        isQuoted = true;
      } else if (text[pos] === '/' && patternKeys.has(key)) {
        value = pattern();
        isPattern = true;
      } else value = word();
      syntax = true;
      const end = pos;
      const source = text.slice(at, end);
      let group = cutGroupOf[keyword];
      if (keyword === 'in' && languages.has(value.toLowerCase())) group = 'language';
      if (group) {
        note('cut', at, end, source, group);
        return null;
      }
      if (!value && !isQuoted) {
        note('hint', at, end, `Add a value after ${head[0]}`);
        return null;
      }
      if (wordKeys.has(key) && op !== ':' && op !== '=') {
        note('error', at, end, `${keyword}: only takes :, so ${source} is left out.`);
        return null;
      }
      if (key === 'order') {
        order = value.toLowerCase();
        return null;
      }
      if (key === 'direction') {
        direction = value.toLowerCase();
        return null;
      }
      if (key === 'not') return { k: 'not', item: { k: 'term', key: 'is', keyword: 'is', op: ':', value, quoted: isQuoted, regex: false, at, end } };
      return { k: 'term', key, keyword, op: op === '=' && wordKeys.has(key) ? ':' : op, value, quoted: isQuoted, regex: isPattern, at, end };
    }
    const value = word();
    return value ? { k: 'name', value, at, end: pos } : null;
  }

  // unary := "-" unary | "(" or ")" | term
  /** @param {number} depth @returns {QueryNode | null} */
  function unary(depth) {
    space();
    if (pos >= text.length) return null;
    if (text[pos] === '-' && pos + 1 < text.length && !/[\s)]/.test(text[pos + 1])) {
      pos++;
      syntax = true;
      const item = unary(depth);
      if (!item) return null;
      return item.k === 'not' ? item.item : { k: 'not', item };
    }
    if (text[pos] === '(') {
      const at = pos++;
      syntax = true;
      const inner = or(depth + 1);
      space();
      if (text[pos] === ')') pos++;
      else note('error', at, Math.min(at + 1, text.length), 'Missing ): searching as if it closed at the end.');
      return inner;
    }
    return term();
  }
  // and := unary { [AND] unary }, ending at OR or a closing bracket.
  /** @param {number} depth @returns {QueryNode | null} */
  function and(depth) {
    /** @type {QueryNode[]} */
    const items = [];
    for (;;) {
      space();
      if (pos >= text.length) break;
      if (text[pos] === ')') {
        if (depth > 0) break;
        note('error', pos, pos + 1, 'This ) has no ( before it, so it’s ignored.');
        pos++;
        syntax = true;
        continue;
      }
      const joiner = /^(or|and)(?=\s|\(|$)/i.exec(text.slice(pos));
      if (joiner) {
        if (joiner[1].toLowerCase() === 'and') {
          pos += 3;
          continue;
        }
        if (items.length) break;
        // A leading or doubled OR is skipped.
        syntax = true;
        pos += 2;
        continue;
      }
      const start = pos;
      const item = unary(depth);
      // A bracketed AND inside an AND is the same AND: (a b) c is a b c.
      if (item?.k === 'and') items.push(...item.items);
      else if (item) items.push(item);
      else if (pos === start) pos++;
    }
    return items.length === 0 ? null : items.length === 1 ? items[0] : { k: 'and', items };
  }
  // or := and { OR and }. "or" is the operator in any case, as on Scryfall; inside quotes it's text.
  /** @param {number} depth @returns {QueryNode | null} */
  function or(depth) {
    /** @type {QueryNode[]} */
    const items = [];
    for (;;) {
      const item = and(depth);
      if (item?.k === 'or') items.push(...item.items);
      else if (item) items.push(item);
      space();
      if (!/^or(?=\s|\(|$)/i.test(text.slice(pos))) break;
      syntax = true;
      pos += 2;
    }
    return items.length === 0 ? null : items.length === 1 ? items[0] : { k: 'or', items };
  }

  /** @type {QueryNode | null} */
  let ast = null;
  while (pos < text.length) {
    const next = or(0);
    /** @type {QueryNode[]} */
    const parts = [ast, next].flatMap(part => (part?.k === 'and' ? part.items : part ? [part] : []));
    ast = parts.length > 1 ? { k: 'and', items: parts } : parts[0] ?? null;
    if (pos < text.length && text[pos] === ')') {
      note('error', pos, pos + 1, 'This ) has no ( before it, so it’s ignored.');
      syntax = true;
      pos++;
    } else if (!next && pos < text.length) pos++;
  }
  return { ast, notes, syntax, order, direction };
}

// The query printed back from its tree, for tests: parsing it again gives the same tree.
/** @param {QueryNode | null} node @returns {string} */
export function printQuery(node) {
  if (!node) return '';
  /** @param {string} value */
  const bare = value => /^[^\s)"(!/-][^\s)"]*$/.test(value) && !/^(or|and)(\(|$)/i.test(value) && !/^[a-z]+(!=|<=|>=|:|=|<|>)/i.test(value);
  /** @param {string} value */
  const quote = value => `"${value.replace(/[\\"]/g, '\\$&')}"`;
  switch (node.k) {
    case 'and': return node.items.map(item => (item.k === 'or' ? `(${printQuery(item)})` : printQuery(item))).join(' ');
    case 'or': return node.items.map(item => (item.k === 'or' ? `(${printQuery(item)})` : printQuery(item))).join(' or ');
    case 'not': return `-${node.item.k === 'and' || node.item.k === 'or' || node.item.k === 'not' ? `(${printQuery(node.item)})` : printQuery(node.item)}`;
    case 'name': return `${node.exact ? '!' : ''}${node.quoted || node.exact || !bare(node.value) ? quote(node.value) : node.value}`;
    default: {
      const value = node.regex ? `/${node.value}/` : node.quoted || !node.value || !/^[^\s)"/][^\s)"]*$/.test(node.value) ? quote(node.value) : node.value;
      return `${node.keyword}${node.op}${value}`;
    }
  }
}

// Every keyword in a tree, for the notes and the detection of slow terms.
/** @param {QueryNode | null} node @param {QueryNode[]} [found] @returns {QueryNode[]} */
export function leaves(node, found = []) {
  if (!node) return found;
  if (node.k === 'and' || node.k === 'or') node.items.forEach(item => leaves(item, found));
  else if (node.k === 'not') leaves(node.item, found);
  else found.push(node);
  return found;
}
