// Card lookup's query language against Scryfall's own results (design/polish/SCRYFALL-SYNTAX-SPEC.md §9.3).
//
//   node scripts/cards-conformance.mjs             compare the saved results with ours, by family
//   node scripts/cards-conformance.mjs --fetch     fetch the queries not saved yet from api.scryfall.com
//   node scripts/cards-conformance.mjs --fetch --all   fetch every query again
//
// The queries are tests/fixtures/scryfall-queries.txt; the results go to tests/fixtures/scryfall-results.json, and
// tests/cards-conformance.test.mjs compares them in `npm test`, offline. Fetching is by hand, after `npm run
// cards:update`: it waits 600 ms between requests (Scryfall allows about 2 a second, and answered 429 at 150 ms), stops
// on a 429 keeping what it has, reads up to 10 pages (1,750 cards) per query, and sends `LifePod/<version>` and nothing
// about who runs it.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { indexCards } from '../web/js/logic/cards.js';
import { setTags, tagsOf } from '../web/js/logic/cardcolumns.js';
import { runQuery } from '../web/js/logic/cardfilter.js';
import { parseQuery } from '../web/js/logic/cardquery.js';

const root = new URL('../', import.meta.url);
const queriesFile = new URL('tests/fixtures/scryfall-queries.txt', root);
const resultsFile = new URL('tests/fixtures/scryfall-results.json', root);
export const defaultTolerance = 0.97;
export const meanTolerance = 0.98;

/** The queries, with their family and tolerance. */
export function readQueries() {
  const queries = [];
  let family = '';
  for (const line of readFileSync(queriesFile, 'utf8').split('\n')) {
    const text = line.trim();
    if (text.startsWith('## ')) family = text.slice(3);
    if (!text || text.startsWith('#')) continue;
    const [query, comment] = text.split(/\s+# /);
    const tolerance = /tolerance ([\d.]+)/.exec(comment ?? '')?.[1];
    queries.push({ query: query.trim(), family, tolerance: tolerance ? Number(tolerance) : defaultTolerance });
  }
  return queries;
}
export const readResults = () => JSON.parse(readFileSync(resultsFile, 'utf8'));

/**
 * Compares one query's results in the shared card set: Scryfall's names that are in our data, and ours without tokens.
 * A partial Scryfall result is compared only up to its last name. An `order:` query compares the first names in order.
 * @param {ReturnType<typeof indexCards>} index
 * @param {string} query
 * @param {{ names: string[], complete: boolean }} saved
 */
export function compare(index, query, saved) {
  if (!tagsOf(index)) setTags(index, JSON.parse(readFileSync(new URL('data/tags.json', root), 'utf8')));
  const universe = new Set(index.cards.filter(card => !card.t.startsWith('Token')).map(card => card.n));
  const { hits, notes } = runQuery(index, parseQuery(query), query);
  const theirs = saved.names.filter(name => universe.has(name));
  let ours = hits.map(at => index.cards[at].n).filter(name => universe.has(name));
  if (!saved.complete) ours = ours.filter(name => name <= saved.names.at(-1));
  const theirSet = new Set(theirs);
  const ourSet = new Set(ours);
  const missing = [...theirSet].filter(name => !ourSet.has(name));
  const extra = [...ourSet].filter(name => !theirSet.has(name));
  const union = new Set([...theirSet, ...ourSet]).size;
  const jaccard = union ? (union - missing.length - extra.length) / union : 1;
  // Sorted queries: the share of the first 20 that are in the same place.
  const sorted = /\border:/i.test(query);
  const first = Math.min(20, theirs.length, ours.length);
  const order = sorted && first ? theirs.slice(0, first).filter((name, at) => ours[at] === name).length / first : null;
  return { theirs: theirSet.size, ours: ourSet.size, missing, extra, jaccard, order, notes };
}

async function fetchAll(refetch) {
  const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  const headers = { 'User-Agent': `LifePod/${version}`, Accept: 'application/json' };
  const data = JSON.parse(readFileSync(new URL('data/cards.json', root), 'utf8'));
  let saved;
  try {
    saved = readResults();
  } catch {
    saved = { queries: {} };
  }
  const pause = () => new Promise(resolve => setTimeout(resolve, 600));
  for (const { query } of readQueries()) {
    if (saved.queries[query] && !refetch) continue;
    let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`;
    const names = [];
    let total = 0;
    let complete = true;
    let status = 0;
    let warnings;
    for (let page = 0; url; page++) {
      if (page === 10) {
        complete = false;
        break;
      }
      await pause();
      const response = await fetch(url, { headers });
      status = response.status;
      if (status === 429) {
        console.error('Scryfall asked us to slow down (429); stopping with what we have.');
        writeFileSync(resultsFile, `${JSON.stringify(saved, null, 1)}\n`);
        process.exit(1);
      }
      const body = await response.json();
      if (status !== 200) break;
      total = body.total_cards;
      warnings = body.warnings;
      names.push(...body.data.map(card => card.name));
      url = body.has_more ? body.next_page : null;
    }
    saved.queries[query] = { total, complete, status, ...(warnings ? { warnings } : {}), names };
    saved.fetched = new Date().toISOString().slice(0, 10);
    saved.data = data.about.updated;
    console.log(`${status} ${String(total).padStart(5)}${complete ? '' : ' (partial)'}  ${query}`);
    writeFileSync(resultsFile, `${JSON.stringify(saved, null, 1)}\n`);
  }
}

function report() {
  const data = JSON.parse(readFileSync(new URL('data/cards.json', root), 'utf8'));
  const index = indexCards(data.cards);
  const { queries } = readResults();
  /** @type {Map<string, { count: number, exact: number, sum: number, low: number }>} */
  const families = new Map();
  for (const { query, family } of readQueries()) {
    const saved = queries[query];
    if (!saved) continue;
    const result = compare(index, query, saved);
    const row = families.get(family) ?? { count: 0, exact: 0, sum: 0, low: 1 };
    row.count++;
    row.sum += result.jaccard;
    row.low = Math.min(row.low, result.jaccard);
    if (!result.missing.length && !result.extra.length) row.exact++;
    families.set(family, row);
    if (process.argv.includes('--show') && result.jaccard < 1) {
      console.log(`${result.jaccard.toFixed(3)}  ${query}  missing ${result.missing.slice(0, 5).join(' | ')}  extra ${result.extra.slice(0, 5).join(' | ')}`);
    }
  }
  console.table(Object.fromEntries([...families].map(([family, row]) => [family, {
    queries: row.count, exact: row.exact, mean: Number((row.sum / row.count).toFixed(3)), lowest: Number(row.low.toFixed(3)),
  }])));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--fetch')) await fetchAll(process.argv.includes('--all'));
  else report();
}
