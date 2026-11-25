import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { test } from './helpers.mjs';
import { fold } from '../web/js/logic/cards.js';
import { allowedEdits, buildTypoIndex, closeNames, distance, typoBuilder, typoMinimum } from '../web/js/logic/cardtypos.js';

// Close spellings for card lookup's plain name search (design/polish/SCRYFALL-SYNTAX-SPEC.md §6.6, web/js/logic/cardtypos.js).

const opts = { numRuns: Number(process.env.PBT_RUNS ?? 500) };
const data = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const keys = data.cards.map(card => card.k);
const index = buildTypoIndex(keys);
const rank = at => data.cards[at].er ?? Infinity;
const close = query => closeNames(index, fold(query), { rank }).map(at => data.cards[at].n);

// Real misspellings of popular cards, each with the card it should find first.
const misspellings = {
  'lightnig bolt': 'Lightning Bolt', 'sol rign': 'Sol Ring', cultivat: 'Cultivate', 'thassas oracle': 'Thassa\'s Oracle',
  'rhystic studdy': 'Rhystic Study', 'smothering tihte': 'Smothering Tithe', 'teferis protectoin': 'Teferi\'s Protection',
  'craterhoof behemot': 'Craterhoof Behemoth', 'esper sentinal': 'Esper Sentinel', 'dockside extortionst': 'Dockside Extortionist',
  'swords to plowshare': 'Swords to Plowshares', 'demonic tudor': 'Demonic Tutor', counterspel: 'Counterspell',
  'llanowar elfs': 'Llanowar Elves', 'birds of paradice': 'Birds of Paradise', brainstrom: 'Brainstorm',
  'atraxa praetors vocie': 'Atraxa, Praetors\' Voice', 'ulamog the ceasless': 'Ulamog, the Ceaseless Hunger',
  'jeweled lotos': 'Jeweled Lotus', 'kenrith the returnd': 'Kenrith, the Returned King', 'cyclonic rift': 'Cyclonic Rift',
  'arcane signit': 'Arcane Signet', 'eternal witnes': 'Eternal Witness', farseak: 'Farseek', 'mana crpyt': 'Mana Crypt',
};

test('node: every test misspelling finds the card meant, first', () => {
  const misses = Object.entries(misspellings).filter(([query, card]) => close(query)[0] !== card)
    .map(([query, card]) => `${query}: ${close(query).slice(0, 3).join(' | ')} (wanted ${card})`);
  assert.deepEqual(misses, []);
});

test('node: a correctly spelled name is its own closest spelling, and short queries get none', () => {
  for (const name of ['Sol Ring', 'Lightning Bolt', 'Cultivate', 'Atraxa, Praetors\' Voice']) assert.equal(close(name)[0], name);
  assert.equal(typoMinimum, 4);
  assert.deepEqual(close('sol'), [], 'three letters are too few to guess at');
  assert.equal(allowedEdits(3), 0);
  assert.equal(allowedEdits(4), 1);
  assert.equal(allowedEdits(7), 1);
  assert.equal(allowedEdits(8), 2);
  assert.equal(allowedEdits(12), 3);
  assert.deepEqual(close('zzzzzzzzzzzz'), [], 'nothing close to nonsense');
  // Cards already listed as matches aren't listed again.
  const sol = data.cards.findIndex(card => card.n === 'Sol Ring');
  assert.ok(!closeNames(index, 'sol rign', { rank, skip: new Set([sol]) }).includes(sol));
});

test('node: the index built in small steps is the index built at once', () => {
  const builder = typoBuilder(keys, 2000);
  let steps = 1;
  let stepped = builder.step();
  while (!stepped) {
    stepped = builder.step();
    steps++;
  }
  assert.ok(steps >= 2 * Math.ceil(keys.length / 2000), `${steps} steps of 2,000 names, counting then filling`);
  assert.deepEqual(stepped.offsets, index.offsets);
  assert.deepEqual(stepped.places, index.places);
});

// The edit distance against a plain reference: Damerau-Levenshtein with adjacent swaps (optimal string alignment).
function reference(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
test('node: the edit distance agrees with a reference, and stops past its limit', () => {
  const word = fc.stringOf(fc.constantFrom(...'abcde '), { maxLength: 12 });
  fc.assert(fc.property(word, word, fc.integer({ min: 0, max: 5 }), (a, b, limit) => {
    const exact = reference(a, b);
    const found = distance(a, b, limit);
    if (exact <= limit) assert.equal(found, exact);
    else assert.equal(found, limit + 1);
  }), opts);
  assert.equal(distance('ab', 'ba', 3), 1, 'a swap is one edit');
});
