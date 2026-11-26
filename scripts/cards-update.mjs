// `npm run cards:update`: downloads Scryfall's latest Oracle cards bulk file and writes card lookup's data: data/cards.json,
// one card per line for readable diffs, which isn't shipped, and web/data/cards.json.gz, the same file gzipped, which
// the page fetches and unpacks (docs/DEVELOPING.md, "Card data"). Run it before a release (RELEASING.md). It writes the
// rulings the same way, from Scryfall's rulings file: data/rulings/, and web/data/rulings/ gzipped (scripts/cards-rulings.mjs).
//
//   npm run cards:update                  download the latest bulk file, keep it in the cache, write the data
//   npm run cards:update -- --offline     rebuild from the cached bulk file, with no network
//
// It also writes the bulk file's date into the credits in web/index.html and the README.
//
// The cache is node_modules/.cache/lifepod-cards/: the bulk file as downloaded and its Scryfall metadata. The same
// bulk file always gives the same output, byte for byte (tests/cards-data.test.mjs checks it).
//
// Scryfall asks every client for a User-Agent naming the app and an Accept header, and answers 403 without them. This
// one sends `LifePod/<package.json version>` and nothing about who runs it.
import { createReadStream, createWriteStream, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import { constants, createGunzip, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { fold } from '../web/js/logic/cards.js';
import { formats, landNicknames, writeLegalities } from '../web/js/logic/cardterms.js';
import { buildRulings, readRulings, shardName, shardOf } from './cards-rulings.mjs';

const root = new URL('../', import.meta.url);
const output = new URL('data/cards.json', root);
const shipped = new URL('web/data/cards.json.gz', root);
const cache = new URL('node_modules/.cache/lifepod-cards/', root);
const bulkFile = new URL('oracle-cards.jsonl.gz', cache);
const metaFile = new URL('oracle-cards.json', cache);
const nicknameFile = new URL('land-nicknames.json', cache);
const tagsBulkFile = new URL('oracle-tags.jsonl.gz', cache);
// Every English printing (Scryfall's default_cards, about 80 MB gzipped), read only for the rarities each card was
// printed at; nothing else from it ships.
const printingsFile = new URL('default-cards.jsonl.gz', cache);
const printingsMetaFile = new URL('default-cards.json', cache);
const tagsMetaFile = new URL('oracle-tags.json', cache);
const tagsOutput = new URL('data/tags.json', root);
const tagsShipped = new URL('web/data/tags.json.gz', root);
const rulingsBulkFile = new URL('rulings.jsonl.gz', cache);
const rulingsMetaFile = new URL('rulings.json', cache);
const rulingsOutput = new URL('data/rulings/', root);
const rulingsShipped = new URL('web/data/rulings/', root);
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const headers = { 'User-Agent': `LifePod/${version}`, Accept: 'application/json' };

// What isn't a card a player looks up mid-game: art cards, tokens, emblems, Planechase planes, Archenemy schemes,
// Vanguard avatars, Jumpstart's theme cards, helper cards (type line "Card", such as Poison Counter), the cards Scryfall
// hides by default (memorabilia and playtest cards), and cards only for MTG Arena or Magic Online. The predefined
// artifact tokens that rules text names without explaining (Treasure, Food, Clue and the rest) are kept.
//
// A card is on paper if the printing the Oracle file holds is, or if a paper format lists it as legal, banned or
// restricted: for 1,062 real paper cards the file's printing is an MTGO one (Masters Edition, Tempest Remastered,
// Vintage Masters), among them the ten original dual lands, Mox Diamond and Palinchron
// (design/polish/SCRYFALL-SYNTAX-SPEC.md §5.1).
const skippedLayouts = new Set(['art_series', 'token', 'double_faced_token', 'emblem', 'planar', 'scheme', 'vanguard', 'front_card']);
const paperFormats = ['standard', 'future', 'pioneer', 'modern', 'legacy', 'pauper', 'vintage', 'commander', 'oathbreaker',
  'paupercommander', 'duel', 'oldschool', 'premodern', 'predh'];
const keptTokens = new Set(['Blood', 'Clue', 'Food', 'Gold', 'Junk', 'Lander', 'Map', 'Mutagen', 'Powerstone', 'Treasure']);
// Layouts whose faces each have their own rules text: double-faced, split, adventure, flip and prepare cards.
const facedLayouts = new Set(['transform', 'modal_dfc', 'split', 'adventure', 'flip', 'prepare']);
// Scryfall writes some in lower case after the first word ("Choose a background"), so the match ignores case.
const pairing = /^(?:Partner|Friends forever|Choose a Background|Doctor's companion)/i;
const colourOrder = 'WUBRG';
const inColourOrder = colours => [...new Set(colours)].sort((a, b) => colourOrder.indexOf(a) - colourOrder.indexOf(b)).join('');
// Rarity as one letter. The Oracle file holds one printing of each card, so `r` is that printing's rarity; `rp` and `ri`
// are the rarities of all its printings (printedRarities()), in this order.
const rarities = { common: 'c', uncommon: 'u', rare: 'r', special: 's', mythic: 'm', bonus: 'b' };
const rarityLetters = Object.values(rarities).join('');
// A card's Oracle id; a reversible card has it on each face instead.
const oracleId = card => card.oracle_id ?? card.card_faces?.[0]?.oracle_id;

// Printings in these sets aren't the card for rarity: art cards, gold-bordered copies, and the token sets that reprint a
// card as its token (tmh2's Timeless Dragon is a common).
const notPrintings = new Set(['memorabilia', 'token']);
// in: also leaves out promo sets (a prerelease promo in a main set counts) and special products: Secret Lair,
// Masterpieces, From the Vault.
const notInSets = new Set(['promo', 'box', 'masterpiece', 'from_the_vault']);
/**
 * The rarities each card was printed at, by Oracle id, as letters in Scryfall's order (`cu`), from the default_cards
 * bulk file. `r` is what r: matches on Scryfall: every printing, digital ones too, but those in notPrintings. `in` is
 * what in: matches, which leaves out promos and special products as well. Checked against Scryfall's results in
 * tests/fixtures/scryfall-results.json ("formats and rarity").
 * @param {AsyncIterable<string> | Iterable<string>} lines
 * @returns {Promise<Map<string, { r: string, in: string }>>}
 */
export async function printedRarities(lines) {
  /** @type {Map<string, { r: Set<string>, in: Set<string> }>} */
  const found = new Map();
  for await (const line of lines) {
    const text = line.trim().replace(/,$/, '');
    if (!text.startsWith('{')) continue;
    const card = JSON.parse(text);
    const id = oracleId(card);
    const letter = rarities[card.rarity];
    if (!id || !letter || notPrintings.has(card.set_type)) continue;
    if (!found.has(id)) found.set(id, { r: new Set(), in: new Set() });
    found.get(id).r.add(letter);
    if (!notInSets.has(card.set_type)) found.get(id).in.add(letter);
  }
  const inOrder = (/** @type {Set<string>} */ letters) => [...rarityLetters].filter(letter => letters.has(letter)).join('');
  return new Map([...found].map(([id, sets]) => [id, { r: inOrder(sets.r), in: inOrder(sets.in) }]));
}
// The EDHREC rank, 1 the most played: exact up to this rank, then rounded to two significant figures. The owner chose
// exact ranks for every card (+93 KB gzipped, and most lines change at each update as ranks drift); 1000 here would
// round past the top thousand instead (+47 KB, and far fewer changed lines).
export const exactRanks = Infinity;
/** @param {number} rank */
export function roundRank(rank) {
  if (rank <= exactRanks) return rank;
  const step = 10 ** (Math.floor(Math.log10(rank)) - 1);
  return Math.round(rank / step) * step;
}

/** Drops the fields that are undefined or empty, so the file only holds what a card has. */
const compact = record => Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== ''));

function face(source) {
  return compact({
    n: source.name,
    m: source.mana_cost,
    t: source.type_line ?? '',
    o: source.oracle_text,
    p: source.power !== undefined ? `${source.power}/${source.toughness}` : undefined,
    l: source.loyalty,
    d: source.defense,
  });
}

/** Whether Scryfall's card belongs in the lookup. */
export function keepCard(card) {
  if (card.type_line === 'Card' || card.set_type === 'memorabilia' || card.promo_types?.includes('playtest')) return false;
  const paper = card.games?.includes('paper')
    || paperFormats.some(format => ['legal', 'banned', 'restricted'].includes(card.legalities?.[format]));
  if (!paper) return false;
  if (card.layout === 'token') return keptTokens.has(card.name);
  return !skippedLayouts.has(card.layout);
}

/** One card in the data file's format (the Card typedef in web/js/logic/cards.js). */
export function toCard(card) {
  const faced = facedLayouts.has(card.layout) && card.card_faces?.length > 1;
  const front = faced ? card.card_faces[0] : card;
  const frontType = front.type_line ?? card.type_line;
  const keywords = [...(card.keywords ?? [])].sort();
  const colours = card.colors ?? (card.card_faces ?? []).flatMap(side => side.colors ?? []);
  const record = faced
    ? { n: card.name, m: card.mana_cost || front.mana_cost, t: card.type_line }
    : face(card);
  // The key stays even when it folds to nothing, as "_____" does.
  return { ...compact(record), k: fold(card.name), ...compact({
    c: inColourOrder(card.color_identity ?? []),
    // The card's colours, only where they differ from its identity (a card with colourless mana symbols in its text,
    // say, or a colourless artifact with coloured activations). None written means the same as `c`.
    co: inColourOrder(colours) !== inColourOrder(card.color_identity ?? []) ? inColourOrder(colours) || '-' : undefined,
    v: card.cmc ? card.cmc : undefined,
    r: rarities[card.rarity],
    f: faced ? card.card_faces.map(face) : undefined,
    lead: /\bLegendary\b/.test(frontType) && /\bCreature\b/.test(frontType)
      || /can be your commander/.test(front.oracle_text ?? '') ? 1 : undefined,
    kw: keywords.length ? keywords : undefined,
    pair: keywords.some(keyword => pairing.test(keyword)) ? 1 : undefined,
    er: card.edhrec_rank ? roundRank(card.edhrec_rank) : undefined,
    // For the query language (design/polish/SCRYFALL-SYNTAX-SPEC.md §5.2): the legalities, one letter per format in
    // cardterms.js's order; the colours of mana it can make; the layout when it isn't normal; a meld result; Game
    // Changer, Reserved List, a colour indicator and a funny set as flags.
    lg: card.layout === 'token' ? undefined : writeLegalities(card.legalities),
    pm: inColourOrder(card.produced_mana ?? []).replace(/[^WUBRG]/g, '') + ((card.produced_mana ?? []).includes('C') ? 'C' : ''),
    ly: card.layout !== 'normal' ? card.layout : undefined,
    mr: card.all_parts?.some(part => part.component === 'meld_result' && part.id === card.id) ? 1 : undefined,
    gc: card.game_changer ? 1 : undefined,
    rs: card.reserved ? 1 : undefined,
    ci: card.color_indicator || card.card_faces?.some(side => side.color_indicator) ? 1 : undefined,
    fun: card.set_type === 'funny' ? 1 : undefined,
  }) };
}

/**
 * Builds the data file's text from the bulk file's lines (JSON Lines, or a JSON array with one card per line).
 * @param {AsyncIterable<string> | Iterable<string>} lines
 * @param {string} updated The bulk file's `updated_at`.
 * @param {Record<string, string[]>} [nicknames] Each land nickname's card names, from Scryfall's search (`lc`).
 */
export async function buildCards(lines, updated, nicknames = {}, printed = new Map(), rulings = new Map()) {
  return (await buildData(lines, updated, nicknames, printed, rulings)).text;
}
/**
 * The data file's text, and each card's place in it by Oracle id, which the tags file points at.
 * @param {AsyncIterable<string> | Iterable<string>} lines
 * @param {string} updated
 * @param {Record<string, string[]>} [nicknames]
 * @param {Map<string, { r: string, in: string }>} [printed] Each card's printed rarities (printedRarities()), for `rp`
 *   and `ri`.
 * @param {Map<string, import('./cards-rulings.mjs').Ruling[]>} [rulings] Each card's rulings (readRulings()), for `ru`.
 * @returns {Promise<{ text: string, places: Map<string, number>, kept: { id: string | undefined, name: string }[] }>}
 *   `kept` is every card in the file's order, with the Oracle id its rulings are under.
 */
export async function buildData(lines, updated, nicknames = {}, printed = new Map(), rulings = new Map()) {
  /** @type {Map<string, string[]>} */
  const cycles = new Map();
  for (const nickname of landNicknames) {
    for (const name of nicknames[nickname] ?? []) cycles.set(name, [...(cycles.get(name) ?? []), nickname]);
  }
  const cards = [];
  for await (const line of lines) {
    const text = line.trim().replace(/,$/, '');
    if (!text.startsWith('{')) continue;
    const card = JSON.parse(text);
    if (!keepCard(card)) continue;
    const record = toCard(card);
    if (cycles.has(card.name)) record.lc = cycles.get(card.name);
    // Written only where they differ: `rp` from `r`, `ri` from `rp` (or `r`), `-` for none.
    const letters = printed.get(oracleId(card));
    if (letters && letters.r !== record.r) record.rp = letters.r;
    if (letters && letters.in !== letters.r) record.ri = letters.in || '-';
    // How many rulings the card has, and the shard they're in (scripts/cards-rulings.mjs).
    const ruled = rulings.get(oracleId(card));
    if (ruled?.length) record.ru = [ruled.length, shardOf(oracleId(card))];
    cards.push({ record, id: card.oracle_id, ruledBy: oracleId(card) });
  }
  const rows = cards.map(({ record, id, ruledBy }) => ({ card: record, id, ruledBy, json: JSON.stringify(record) }));
  rows.sort((a, b) => (a.card.k < b.card.k ? -1 : a.card.k > b.card.k ? 1 : a.json < b.json ? -1 : a.json > b.json ? 1 : 0));
  const about = { source: 'Scryfall Oracle cards bulk data, scryfall.com', updated, count: rows.length, formats };
  const text = `{"about":${JSON.stringify(about)},\n"cards":[\n${rows.map(row => row.json).join(',\n')}\n]}\n`;
  return { text, places: new Map(rows.map((row, at) => [row.id, at])), kept: rows.map(row => ({ id: row.ruledBy, name: row.card.n })) };
}

/**
 * The tags file (design/polish/SCRYFALL-SYNTAX-SPEC.md §5.4): Scryfall's Oracle tags, one per line, sorted by slug, each
 * with its parents' slugs, its aliases, and its cards' places in data/cards.json as gaps (each place less the one before).
 * Its places are only valid with the cards.json written in the same run; `about.cards` is that file's card count.
 * @param {AsyncIterable<string> | Iterable<string>} lines Scryfall's oracle_tags bulk file
 * @param {string} updated
 * @param {Map<string, number>} places
 * @param {number} cardCount
 */
export async function buildTags(lines, updated, places, cardCount) {
  const tags = [];
  for await (const line of lines) {
    const text = line.trim().replace(/,$/, '');
    if (text.startsWith('{')) tags.push(JSON.parse(text));
  }
  const slugs = new Map(tags.map(tag => [tag.id, tag.slug]));
  const rows = [];
  for (const tag of tags) {
    const at = [...new Set((tag.taggings ?? []).map(tagging => places.get(tagging.oracle_id)).filter(place => place !== undefined))].sort((a, b) => a - b);
    if (!at.length && !(tag.child_ids ?? []).length) continue;
    const parents = (tag.parent_ids ?? []).map(id => slugs.get(id)).filter(Boolean).sort();
    const aliases = [...(tag.aliases ?? [])].sort();
    rows.push(compact({ s: tag.slug, p: parents.length ? parents : undefined, a: aliases.length ? aliases : undefined, c: at.length ? at.map((place, i) => (i ? place - at[i - 1] : place)) : undefined }));
  }
  rows.sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
  const about = { source: 'Scryfall Oracle tags bulk data, scryfall.com', updated, cards: cardCount, count: rows.length };
  return `{"about":${JSON.stringify(about)},\n"tags":[\n${rows.map(row => JSON.stringify(row)).join(',\n')}\n]}\n`;
}
/** The cached Oracle tags file, or null. */
export function cachedTags() {
  try {
    return { path: fileURLToPath(tagsBulkFile), ...JSON.parse(readFileSync(tagsMetaFile, 'utf8')) };
  } catch {
    return null;
  }
}

/** The lines of a bulk file on disk, gzipped or not. */
export function readBulk(path) {
  const gzipped = readFileSync(path).subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]));
  const stream = createReadStream(path);
  return createInterface({ input: gzipped ? stream.pipe(createGunzip()) : stream, crlfDelay: Infinity });
}

/** The cached rulings file, or null. */
export function cachedRulings() {
  try {
    return { path: fileURLToPath(rulingsBulkFile), ...JSON.parse(readFileSync(rulingsMetaFile, 'utf8')) };
  } catch {
    return null;
  }
}

/** The cached default_cards file, or null. */
export function cachedPrintings() {
  try {
    return { path: fileURLToPath(printingsFile), ...JSON.parse(readFileSync(printingsMetaFile, 'utf8')) };
  } catch {
    return null;
  }
}

/** The cached bulk file's metadata, or null before the first download. */
export function cachedBulk() {
  try {
    return { path: fileURLToPath(bulkFile), ...JSON.parse(readFileSync(metaFile, 'utf8')) };
  } catch {
    return null;
  }
}

// Scryfall's API, which LIFEPOD_SCRYFALL_API can point elsewhere, such as an address nothing answers on, to try the
// release build's fallback (scripts/cards-release.mjs).
const api = process.env.LIFEPOD_SCRYFALL_API ?? 'https://api.scryfall.com';
// A slow or failing request is tried three times in all, 5 and 15 seconds apart, each within its time limit. Only a
// failed request is repeated, so a run downloads the bulk file once (Scryfall's guidance).
const retryDelays = [5000, 15000];
async function fetchWithRetries(url, init, timeout) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
      if (response.ok) return response;
      if (response.status < 500 && response.status !== 429) throw Object.assign(new Error(`${url}: HTTP ${response.status}`), { final: true });
      throw new Error(`${url}: HTTP ${response.status}`);
    } catch (error) {
      if (error.final || attempt >= retryDelays.length) throw error;
      console.warn(`${error.message}; trying again in ${retryDelays[attempt] / 1000}s`);
      await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
    }
  }
}

// Downloads a bulk file into the cache unless the cached one is the latest, streamed to disk (default_cards is about
// 80 MB) and kept gzipped, as Scryfall sends it. Each file is downloaded at most once a run.
async function downloadBulk(entry, file, meta, cached, timeout = 180000) {
  const uri = entry?.jsonl_download_uri ?? entry?.download_uri;
  if (!uri) throw new Error(`Scryfall lists no ${entry?.type ?? 'bulk'} file`);
  if (cached?.updated_at === entry.updated_at) return;
  console.log(`Downloading ${uri}`);
  mkdirSync(cache, { recursive: true });
  const partial = new URL(`${file.pathname.split('/').pop()}.part`, cache);
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetchWithRetries(uri, { headers: { ...headers, Accept: '*/*' } }, timeout);
      await pipeline(Readable.fromWeb(/** @type {any} */ (response.body)), createWriteStream(partial));
      break;
    } catch (error) {
      if (attempt >= retryDelays.length) throw error;
      console.warn(`${error.message}; trying again in ${retryDelays[attempt] / 1000}s`);
      await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
    }
  }
  renameSync(partial, file);
  writeFileSync(meta, `${JSON.stringify({ updated_at: entry.updated_at, uri }, null, 2)}\n`);
}

async function download() {
  const response = await fetchWithRetries(`${api}/bulk-data`, { headers }, 30000);
  const list = (await response.json()).data;
  await downloadBulk(list.find(item => item.type === 'oracle_tags'), tagsBulkFile, tagsMetaFile, cachedTags());
  await downloadBulk(list.find(item => item.type === 'rulings'), rulingsBulkFile, rulingsMetaFile, cachedRulings());
  await downloadBulk(list.find(item => item.type === 'default_cards'), printingsFile, printingsMetaFile, cachedPrintings(), 300000);
  const entry = list.find(item => item.type === 'oracle_cards');
  const uri = entry?.jsonl_download_uri ?? entry?.download_uri;
  if (!uri) throw new Error('Scryfall lists no oracle_cards file');
  const cached = cachedBulk();
  if (cached?.updated_at === entry.updated_at) {
    console.log(`The cached bulk file is the latest, from ${entry.updated_at}`);
    return cached;
  }
  console.log(`Downloading ${uri}`);
  const file = await fetchWithRetries(uri, { headers: { ...headers, Accept: '*/*' } }, 180000);
  const bytes = Buffer.from(await file.arrayBuffer());
  mkdirSync(cache, { recursive: true });
  writeFileSync(bulkFile, bytes);
  writeFileSync(metaFile, `${JSON.stringify({ updated_at: entry.updated_at, uri }, null, 2)}\n`);
  return cachedBulk();
}

/**
 * The shipped file: the data gzipped at the highest level. The gzip header carries no time, and its OS byte is set to
 * "unknown" (255), so the same data gives the same bytes on a Mac and on Linux.
 */
export function packCards(text) {
  const packed = gzipSync(text, { level: constants.Z_BEST_COMPRESSION });
  packed[9] = 255;
  return packed;
}

/** The data's date as the page and README print it, such as "23 November 2026". */
export function shownDate(updated) {
  return new Date(updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// The date is printed where the credit is: Settings → About and under the card list (web/index.html), and the README.
// Each sits in a <span data-cards-date>, so it shows without loading the data.
const datedFiles = ['web/index.html', 'README.md'];
function writeDates(updated) {
  for (const path of datedFiles) {
    const file = new URL(path, root);
    const text = readFileSync(file, 'utf8');
    writeFileSync(file, text.replace(/(<span data-cards-date>)[^<]*(<\/span>)/g, `$1${shownDate(updated)}$2`));
  }
}

// The land cycles Scryfall names (`is:shockland` and the rest, design/polish/SCRYFALL-SYNTAX-SPEC.md §3.7): one search
// per nickname, 600 ms apart, as Scryfall asks, every page. Kept next to the bulk file, so --offline rebuilds them.
export function cachedNicknames() {
  try {
    return JSON.parse(readFileSync(nicknameFile, 'utf8'));
  } catch {
    return null;
  }
}
export async function fetchNicknames(updated) {
  const cached = cachedNicknames();
  if (cached?.updated_at === updated) return cached.lists;
  /** @type {Record<string, string[]>} */
  const lists = {};
  for (const nickname of landNicknames) {
    let url = `${api}/cards/search?q=${encodeURIComponent(`is:${nickname}`)}`;
    lists[nickname] = [];
    while (url) {
      await new Promise(resolve => setTimeout(resolve, 600));
      const body = await (await fetchWithRetries(url, { headers }, 30000)).json();
      lists[nickname].push(...body.data.map(card => card.name));
      url = body.has_more ? body.next_page : null;
    }
  }
  mkdirSync(cache, { recursive: true });
  writeFileSync(nicknameFile, `${JSON.stringify({ updated_at: updated, lists }, null, 1)}\n`);
  return lists;
}

async function main() {
  const offline = process.argv.includes('--offline');
  const bulk = offline ? cachedBulk() : await download();
  if (!bulk) throw new Error('No cached bulk file yet: run `npm run cards:update` once with a network connection');
  const nicknames = offline ? cachedNicknames()?.lists ?? {} : await fetchNicknames(bulk.updated_at);
  if (offline && !cachedNicknames()) console.warn('No cached land nicknames: is:shockland and the rest will find nothing until an online update.');
  const printings = cachedPrintings();
  if (!printings) throw new Error('No cached default_cards file yet: run `npm run cards:update` once with a network connection');
  const printed = await printedRarities(readBulk(printings.path));
  const rulingsBulk = cachedRulings();
  if (!rulingsBulk) throw new Error('No cached rulings file yet: run `npm run cards:update` once with a network connection');
  const rulings = await readRulings(readBulk(rulingsBulk.path));
  const { text, places, kept } = await buildData(readBulk(bulk.path), bulk.updated_at, nicknames, printed, rulings);
  mkdirSync(new URL('./', output), { recursive: true });
  mkdirSync(new URL('./', shipped), { recursive: true });
  writeFileSync(output, text);
  const { shared, shards } = buildRulings(rulings, kept, rulingsBulk.updated_at);
  const rulingSizes = writeRulings(shared, shards);
  const tagBulk = cachedTags();
  if (tagBulk) {
    const tags = await buildTags(readBulk(tagBulk.path), tagBulk.updated_at, places, places.size);
    writeFileSync(tagsOutput, tags);
    const packedTags = packCards(tags);
    writeFileSync(tagsShipped, packedTags);
    console.log(`web/data/tags.json.gz: ${JSON.parse(tags).about.count} tags, ${(packedTags.length / 1024).toFixed(0)} KB`);
  } else console.warn('No cached Oracle tags file: otag: keeps the last tags written.');
  const packed = packCards(text);
  writeFileSync(shipped, packed);
  writeDates(bulk.updated_at);
  const { count } = JSON.parse(text).about;
  const mb = bytes => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  console.log(`data/cards.json: ${count} cards from ${bulk.updated_at}, ${mb(Buffer.byteLength(text))}`);
  console.log(`web/data/cards.json.gz: ${mb(packed.length)}`);
  const kb = bytes => `${(bytes / 1024).toFixed(0)} KB`;
  const total = shards.reduce((sum, shard) => sum + JSON.parse(shard).about.rulings, 0);
  console.log(`web/data/rulings/: ${total} rulings from ${rulingsBulk.updated_at}, the shared file ${kb(rulingSizes.shared)}, `
    + `${shards.length} shards of ${kb(Math.min(...rulingSizes.shards))} to ${kb(Math.max(...rulingSizes.shards))}, `
    + `${mb(rulingSizes.shared + rulingSizes.shards.reduce((sum, size) => sum + size, 0))} in all`);
}

/** The rulings files: each one's text in data/rulings/, and gzipped in web/data/rulings/. Returns the gzipped sizes. */
function writeRulings(shared, shards) {
  mkdirSync(rulingsOutput, { recursive: true });
  mkdirSync(rulingsShipped, { recursive: true });
  const write = (name, text) => {
    writeFileSync(new URL(`${name}.json`, rulingsOutput), text);
    const packed = packCards(text);
    writeFileSync(new URL(`${name}.json.gz`, rulingsShipped), packed);
    return packed.length;
  };
  return { shared: write(shardName('shared'), shared), shards: shards.map((text, shard) => write(shardName(shard), text)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
