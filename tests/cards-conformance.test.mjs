import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from './helpers.mjs';
import { compare, meanTolerance, readQueries, readResults } from '../scripts/cards-conformance.mjs';
import { indexCards } from '../web/js/logic/cards.js';
import { leaves, parseQuery } from '../web/js/logic/cardquery.js';

// Card lookup's query language against Scryfall's saved results (design/polish/SCRYFALL-SYNTAX-SPEC.md §9.3), offline:
// every query in tests/fixtures/scryfall-queries.txt, compared in the cards both have. Each query must reach its
// tolerance (Jaccard 0.97 unless its comment says otherwise) and the mean 0.98. Refresh the saved results with
// `node scripts/cards-conformance.mjs --fetch`.

const data = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const index = indexCards(data.cards);
const results = readResults();

// What isn't built yet: queries that use it wait for their milestone.
const pendingKeys = new Set(['devotion', 'produces', 'edhrec']);
const pendingIs = new Set(['vanilla', 'frenchvanilla', 'bear', 'spell', 'permanent', 'historic', 'party', 'outlaw', 'modal', 'commander',
  'partner', 'companion', 'brawler', 'duelcommander', 'oathbreaker', 'manland', 'dual', 'fetchland', 'shockland', 'painland', 'checkland',
  'triome', 'bounceland', 'storageland', 'filterland', 'canopyland']);
/** @param {string} query */
function built(query) {
  const parsed = parseQuery(query);
  if (parsed.order || parsed.notes.some(note => note.group === 'tags')) return false;
  return leaves(parsed.ast).every(node => node.k !== 'term'
    || (!pendingKeys.has(node.key) && !node.regex && !node.value.includes('~') && !(node.key === 'is' && pendingIs.has(node.value.toLowerCase()))));
}

test('node: card lookup agrees with Scryfall on every saved query it answers', (t) => {
  if (results.data !== data.about.updated) t.diagnostic(`The saved results are for data from ${results.data}; the data is from ${data.about.updated}.`);
  const low = [];
  const scores = [];
  for (const { query, family, tolerance } of readQueries()) {
    const saved = results.queries[query];
    if (!saved || !built(query)) continue;
    const { jaccard, missing, extra } = compare(index, query, saved);
    scores.push(jaccard);
    if (jaccard < tolerance) low.push(`${family}: ${query} ${jaccard.toFixed(3)} < ${tolerance}; missing ${missing.slice(0, 4).join(' | ')}; extra ${extra.slice(0, 4).join(' | ')}`);
  }
  assert.ok(scores.length >= 40, `${scores.length} queries compared`);
  assert.deepEqual(low, []);
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  assert.ok(mean >= meanTolerance, `mean ${mean.toFixed(3)}`);
  t.diagnostic(`${scores.length} queries, mean Jaccard ${mean.toFixed(3)}`);
});

test('node: quotation marks keep "or" as text, and "or" outside them is the operator', () => {
  const one = name => compare(index, name, results.queries[name]);
  assert.equal(one('"death or glory"').ours, 1, '"death or glory" is the one card');
  assert.equal(one('"sol ring" or "mana crypt"').ours, 2, 'two phrases, either one');
  assert.equal(one('o:"draw or discard"').ours, 0, 'a literal phrase in rules text');
  assert.ok(one('death or glory').jaccard >= 0.97, 'death or glory: either word, as on Scryfall');
});
