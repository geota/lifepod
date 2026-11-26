// Card lookup's rulings, loaded as cards are opened: a card with rulings fetches its one shard, gzipped, and the shared
// file with the first, unpacked with DecompressionStream as the cards are (docs/DEVELOPING.md, "Card data"). The last
// few shards stay in memory, so going back and forth between cards fetches nothing; sheets/cards.js lets go of them all
// with the cards. This module holds no DOM.

import { cardRulings, shardFile } from '../logic/cards.js';

/** @typedef {import('../logic/cards.js').Card} Card */
/** @typedef {import('../logic/cards.js').Ruling} Ruling */
/** @typedef {import('../logic/cards.js').RulingShard} RulingShard */
/** @typedef {import('../logic/cards.js').RulingTable} RulingTable */

const folder = new URL('../../data/rulings/', import.meta.url);
// How many shards stay in memory: each is about 250 KB of text, well under 1 MB parsed.
export const keptShards = 4;

let abort = new AbortController();
/** @type {Promise<RulingTable> | null} */
let shared = null;
// The shards held, oldest use first.
/** @type {Map<number, Promise<RulingShard>>} */
const shards = new Map();

/** @param {string} name @param {AbortSignal} signal */
async function fetchPacked(name, signal) {
  const response = await fetch(new URL(name, folder), { signal });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
}

// A file that fails to load is dropped, so the next card that needs it tries again.
/** @param {number} shard @param {AbortSignal} signal @returns {Promise<RulingShard>} */
function loadShard(shard, signal) {
  const held = shards.get(shard);
  if (held) {
    shards.delete(shard);
    shards.set(shard, held);
    return held;
  }
  const loading = /** @type {Promise<RulingShard>} */ (fetchPacked(shardFile(shard), signal));
  shards.set(shard, loading);
  loading.catch(() => {
    if (shards.get(shard) === loading) shards.delete(shard);
  });
  while (shards.size > keptShards) shards.delete(/** @type {number} */ (shards.keys().next().value));
  return loading;
}
/** @param {AbortSignal} signal @returns {Promise<RulingTable>} */
function loadShared(signal) {
  if (shared) return shared;
  const loading = /** @type {Promise<RulingTable>} */ (fetchPacked('shared.json.gz', signal));
  shared = loading;
  loading.catch(() => {
    if (shared === loading) shared = null;
  });
  return loading;
}

/**
 * A card's rulings, oldest first, fetching its shard (and the shared file) if they aren't held. Rejects if a file
 * can't load, or when dropRulings() lets go mid-load.
 * @param {Card} card A card with `ru`.
 * @param {number} variant nameVariant()
 * @returns {Promise<Ruling[]>}
 */
export async function loadRulings(card, variant) {
  if (!card.ru) return [];
  const { signal } = abort;
  const [table, shard] = await Promise.all([loadShared(signal), loadShard(card.ru[1], signal)]);
  if (signal.aborted) throw new Error('let go');
  return cardRulings(shard, table, card.n, variant);
}

/** The shards held, by number, oldest use first. */
export const heldShards = () => [...shards.keys()];

// Lets go of every shard and the shared file, and cancels any still loading.
export function dropRulings() {
  abort.abort();
  abort = new AbortController();
  shared = null;
  shards.clear();
}
