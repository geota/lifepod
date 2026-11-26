// Card rulings for card lookup, from Scryfall's `rulings` bulk file: the dated clarifications Wizards of the Coast
// publishes for a card (and a few of Scryfall's own notes), which scripts/cards-update.mjs downloads with the cards and
// writes here (docs/DEVELOPING.md, "Card data").
//
// A card's rulings are in one of `shardCount` shard files, picked by a hash of its Oracle id, so a card stays in the
// same shard whatever other cards come and go; the card's place in data/cards.json would move with every card added
// before it. cards.json carries each card's count and shard (`ru`), so the card shows "Rulings (n)" without loading
// anything, and opening it fetches that one shard. Texts that more than one card has, such as a keyword's rulings, are
// written once, in the shared file, which loads with the first shard; a shard holds the rest of its cards' texts, each
// once, and its cards point at both.
//
//   data/rulings/shared.json   {"about":{…},"rulings":[["2004-10-04","…"],…]}
//   data/rulings/00.json …     {"about":{…},"rulings":[…],"cards":[{"n":"Card name","r":[0,-3,1]},…]}
//
// One ruling per line, then one card per line, for readable diffs; web/data/rulings/ ships each file gzipped. A ruling is
// [date, text], or [date, text, "scryfall"] for Scryfall's own notes. In a card's `r`, 0 and up are this shard's
// rulings and -1 and down the shared file's (-1 the first), in Scryfall's order: oldest first. `i` tells apart cards
// with the same name (Unstable's variants), counting from 0 in data/cards.json's order; it's left out when 0. The
// tables are sorted by date, then text, so a new ruling, which has the newest date, adds a line at the end and moves no
// index.

// The number of shards: about 70 KB gzipped each for 80,000 rulings, so opening a card fetches little. Changing it moves
// almost every card to another shard.
export const shardCount = 32;

/**
 * The shard a card's rulings are in: FNV-1a over its Oracle id, modulo the shard count. It reads nothing but the id,
 * so it never changes for a card.
 * @param {string} oracleId
 */
export function shardOf(oracleId) {
  let hash = 0x811c9dc5;
  for (let at = 0; at < oracleId.length; at++) {
    hash ^= oracleId.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % shardCount;
}
/** A shard's file name, without the folder or extension: 00 to 31, or `shared`. @param {number | 'shared'} shard */
export const shardName = shard => (shard === 'shared' ? 'shared' : String(shard).padStart(2, '0'));

/** @typedef {[string, string] | [string, string, 'scryfall']} Ruling [date, text] or [date, text, "scryfall"] */

/**
 * Each card's rulings, by Oracle id, from the bulk file's lines (JSON Lines, or a JSON array with one ruling per line),
 * oldest first and otherwise in Scryfall's order, each once.
 * @param {AsyncIterable<string> | Iterable<string>} lines
 * @returns {Promise<Map<string, Ruling[]>>}
 */
export async function readRulings(lines) {
  /** @type {Map<string, Map<string, Ruling>>} */
  const found = new Map();
  for await (const line of lines) {
    const text = line.trim().replace(/,$/, '');
    if (!text.startsWith('{')) continue;
    const entry = JSON.parse(text);
    const comment = typeof entry.comment === 'string' ? entry.comment.trim() : '';
    if (!entry.oracle_id || !comment || !/^\d{4}-\d\d-\d\d$/.test(entry.published_at)) continue;
    /** @type {Ruling} */
    const ruling = entry.source === 'scryfall' ? [entry.published_at, comment, 'scryfall'] : [entry.published_at, comment];
    if (!found.has(entry.oracle_id)) found.set(entry.oracle_id, new Map());
    const own = found.get(entry.oracle_id);
    const key = JSON.stringify(ruling);
    if (!own.has(key)) own.set(key, ruling);
  }
  // Array.prototype.sort is stable, so rulings of the same date keep Scryfall's order.
  return new Map([...found].map(([id, own]) => [id, [...own.values()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))]));
}

const compare = (/** @type {string} */ a, /** @type {string} */ b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The shared file's text and each shard's, from the rulings and the cards kept in data/cards.json, in that file's order.
 * Cards that aren't kept (tokens, digital cards) are left out, and so are their rulings.
 * @param {Map<string, Ruling[]>} rulings readRulings()
 * @param {{ id: string | undefined, name: string }[]} cards
 * @param {string} updated The rulings bulk file's `updated_at`.
 * @returns {{ shared: string, shards: string[] }}
 */
export function buildRulings(rulings, cards, updated) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  /** @type {{ name: string, i: number, shard: number, keys: string[] }[]} */
  const entries = [];
  for (const { id, name } of cards) {
    const i = seen.get(name) ?? 0;
    seen.set(name, i + 1);
    const own = id ? rulings.get(id) : undefined;
    if (own?.length) entries.push({ name, i, shard: shardOf(/** @type {string} */ (id)), keys: own.map(ruling => JSON.stringify(ruling)) });
  }
  /** @type {Map<string, number>} */
  const users = new Map();
  for (const entry of entries) for (const key of entry.keys) users.set(key, (users.get(key) ?? 0) + 1);
  /** @type {Map<string, Ruling>} */
  const parsed = new Map();
  for (const own of rulings.values()) for (const ruling of own) parsed.set(JSON.stringify(ruling), ruling);
  const byDate = (/** @type {string} */ a, /** @type {string} */ b) => {
    const left = /** @type {Ruling} */ (parsed.get(a));
    const right = /** @type {Ruling} */ (parsed.get(b));
    return compare(left[0], right[0]) || compare(left[1], right[1]) || compare(left[2] ?? '', right[2] ?? '');
  };
  const sharedKeys = [...users].filter(([, count]) => count > 1).map(([key]) => key).sort(byDate);
  const sharedAt = new Map(sharedKeys.map((key, at) => [key, at]));
  const about = (/** @type {object} */ more) => JSON.stringify({ source: 'Scryfall rulings bulk data, scryfall.com', updated, ...more });
  const table = (/** @type {string[]} */ keys) => (keys.length ? `\n${keys.join(',\n')}\n` : '');
  const shared = `{"about":${about({ count: sharedKeys.length })},\n"rulings":[${table(sharedKeys)}]}\n`;
  const shards = [];
  for (let shard = 0; shard < shardCount; shard++) {
    const mine = entries.filter(entry => entry.shard === shard)
      .sort((a, b) => compare(a.name, b.name) || a.i - b.i);
    const ownKeys = [...new Set(mine.flatMap(entry => entry.keys).filter(key => !sharedAt.has(key)))].sort(byDate);
    const ownAt = new Map(ownKeys.map((key, at) => [key, at]));
    const rows = mine.map(entry => JSON.stringify({
      n: entry.name,
      ...(entry.i ? { i: entry.i } : {}),
      r: entry.keys.map(key => (ownAt.has(key) ? /** @type {number} */ (ownAt.get(key)) : -1 - /** @type {number} */ (sharedAt.get(key)))),
    }));
    const count = mine.reduce((sum, entry) => sum + entry.keys.length, 0);
    shards.push(`{"about":${about({ shard, shards: shardCount, cards: mine.length, rulings: count })},\n"rulings":[${table(ownKeys)}],\n"cards":[${table(rows)}]}\n`);
  }
  return { shared, shards };
}
