import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { test } from './helpers.mjs';
import { indexCards } from '../web/js/logic/cards.js';
import { runQuery } from '../web/js/logic/cardfilter.js';
import { parseQuery } from '../web/js/logic/cardquery.js';
import { compareCosts, compareSets, readCost } from '../web/js/logic/cardterms.js';

// Card lookup's query evaluator (design/polish/SCRYFALL-SYNTAX-SPEC.md §3, §9.2) over data/cards.json: a row per keyword,
// and the algebra any query obeys.

const opts = { numRuns: Math.min(200, Number(process.env.PBT_RUNS ?? 100)) };
const data = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const index = indexCards(data.cards);
const run = query => runQuery(index, parseQuery(query), query);
const names = query => run(query).hits.map(at => data.cards[at].n);
const has = (query, name) => names(query).includes(name);
const set = query => new Set(run(query).hits);

test('node: each keyword finds what it says', () => {
  assert.ok(has('c:rg', 'Ghor-Clan Rampager') && !has('c:rg', 'Lightning Bolt'), 'c: at least these colours');
  assert.ok(has('id<=wu', 'Sol Ring') && !has('id<=wu', 'Lightning Bolt'), 'id<= within these colours');
  assert.ok(has('id:c t:land', 'Ancient Tomb'), 'colourless identity');
  assert.ok(has('c:azorius t:creature', 'Lavinia, Azorius Renegade'), 'a guild name');
  assert.ok(has('c=2 t:creature mv=2', 'Watchwolf'), 'exactly two colours');
  assert.ok(has('t:legend t:merfolk', 'Kumena, Tyrant of Orazca'), 't: starts a word');
  assert.ok(!has('t:fish', 'Jellyfish'), 't:fish isn\'t a word in Jellyfish');
  assert.ok(has('o:"draw a card" t:instant mv=1 c:u', 'Opt'), 'o: rules text');
  assert.ok(!has('o:"attach to target creature you control"', '+2 Mace') && has('fo:"attach to target creature you control"', '+2 Mace'),
    'o: leaves out reminder text, fo: keeps it');
  assert.ok(has('kw:flying t:creature mv=1 c:w', 'Suntail Hawk'), 'kw:');
  assert.ok(has('m:1 t:artifact', 'Mind Stone'), 'm: counts the generic number as a number');
  assert.ok(has('m=2WW', 'Wrath of God') && !has('m=2WW', 'Serra Angel'), 'm= the same multiset');
  assert.ok(!has('m:{R/P}', 'Dismember') && has('m:{B/P}', 'Dismember'), 'm: with a Phyrexian symbol');
  assert.ok(has('mv=0.5', 'Little Girl'), 'mv: half a mana');
  assert.ok(has('pow>tou t:creature c:w mv=1', 'Dauntless Bodyguard') && !has('pow>tou t:creature c:w mv=1', 'Suntail Hawk'),
    'pow>tou compares a card\'s own stats');
  assert.ok(has('t:planeswalker loy=3', 'Jace, the Mind Sculptor'), 'loy=');
  assert.ok(has('f:pauper t:instant c:r mv=1', 'Lightning Bolt'), 'f: legal in a format');
  assert.ok(has('banned:legacy', 'Black Lotus') && has('restricted:vintage', 'Black Lotus'), 'banned: and restricted:');
  assert.ok(has('f:edh t:artifact mv=1', 'Sol Ring'), 'edh is commander');
  assert.ok(has('is:split', 'Fire // Ice') && has('is:transform', 'Delver of Secrets // Insectile Aberration'), 'layouts');
  assert.ok(has('is:reserved t:land', 'Underground Sea') && has('is:gamechanger', 'Ancient Tomb'), 'flags');
  assert.ok(has('!fire', 'Fire // Ice') && has('!"sift through sands"', 'Sift Through Sands'), 'exact names');
  assert.ok(has('rebol', 'Firebolt') && has('limduls', 'Lim-Dûl\'s Vault'), 'a bare word\'s letters anywhere in the name');
  assert.deepEqual(names('name:"fire //"'), ['Fire // Ice'], 'a quoted name keeps punctuation');
});

test('node: notes say what was left out, and a query of only cut keywords lists nothing', () => {
  const war = run('e:war t:elf');
  assert.ok(war.hits.length > 100, 'the elves still list');
  assert.deepEqual(war.notes.map(note => note.kind), ['cut']);
  assert.match(war.notes[0].text, /^Sets and printings aren’t in the offline data\. Showing results without e:war\.$/);
  assert.deepEqual(war.notes[0].terms, ['e:war']);
  const only = run('e:war');
  assert.equal(only.hits.length, 0);
  assert.match(only.notes[0].text, /and nothing else in this search is/);
  assert.deepEqual(run('c:purple t:elf').notes.map(note => note.text), ['purple isn’t a colour.']);
  assert.deepEqual(run('f:foo').notes.map(note => note.text), ['foo isn’t a format card lookup knows.']);
  assert.deepEqual(run('mv>=x t:elf').notes.map(note => note.text), ['Mana value needs a number, even or odd.']);
  assert.match(run('is:banana t:elf').notes[0].text, /is:banana isn’t a search keyword/);
  assert.equal(run('is:foil t:elf').notes[0].kind, 'cut', 'a printing value is a cut keyword');
  assert.match(run('r:mythic t:dragon').notes[0].text, /^Rarity is from one printing/);
  assert.match(run('foo:bar t:elf').notes.at(-1)?.text ?? '', /No card names contain foo:bar, and foo: isn’t a search keyword/);
});

test('node: a card whose name is the whole query comes first, though "or" is the operator', () => {
  const found = names('death or glory');
  assert.equal(found[0], 'Death or Glory');
  assert.ok(found.length > 100);
  assert.equal(names('sol t:artifact')[0], 'Sol Ring', 'name words rank the rest');
});

// A pool of terms the properties combine.
const terms = ['c:r', 'c:g', 'id<=wu', 't:creature', 't:instant', 'mv<=2', 'mv>=4', 'pow>=3', 'f:modern', 'kw:flying', 'o:draw', 'is:split', 'r:common', 'm:{G}', 'goblin'];
const term = fc.constantFrom(...terms);
test('node: x and -x split the cards; or is the union, and the intersection; De Morgan holds', () => {
  const all = index.cards.length;
  fc.assert(fc.property(term, term, (a, b) => {
    const first = set(a);
    const second = set(b);
    assert.equal(first.size + set(`-${a}`).size, all, `${a} and -${a}`);
    assert.deepEqual(set(`${a} or ${b}`), new Set([...first, ...second].sort((x, y) => x - y)));
    const both = set(`${a} ${b}`);
    assert.deepEqual(both, new Set([...first].filter(at => second.has(at))));
    assert.deepEqual(set(`-(${a} or ${b})`), set(`-${a} -${b}`));
    assert.ok([...both].every(at => first.has(at)), 'adding a term never adds cards');
  }), opts);
});

test('node: c: means at least, id: means within, and mv:even and mv:odd split whole mana values', () => {
  for (const colours of ['r', 'rg', 'wub', 'c']) {
    assert.deepEqual(set(`c:${colours}`), colours === 'c' ? set('c=c') : set(`c>=${colours}`), `c:${colours}`);
    assert.deepEqual(set(`id:${colours}`), set(`id<=${colours}`), `id:${colours}`);
  }
  const whole = index.cards.map((card, at) => [card, at]).filter(([card]) => Number.isInteger(card.v ?? 0)).map(([, at]) => at);
  const even = set('mv:even');
  const odd = set('mv:odd');
  for (const at of whole) assert.ok(even.has(at) !== odd.has(at), index.cards[at].n);
});

// The comparisons most likely to go wrong without a test noticing, checked against their definitions.
test('node: colour sets and mana costs compare as subsets and supersets', () => {
  const masks = fc.integer({ min: 0, max: 31 });
  fc.assert(fc.property(masks, masks, (have, want) => {
    assert.equal(compareSets(have, want, '>='), (have | want) === have);
    assert.equal(compareSets(have, want, '<='), (have | want) === want);
    assert.equal(compareSets(have, want, '='), have === want);
    assert.equal(compareSets(have, want, '>'), (have | want) === have && have !== want);
    assert.equal(compareSets(have, want, '<'), (have | want) === want && have !== want);
  }), { numRuns: 1000 });
  assert.ok(compareCosts(readCost('{3}{W}{U}{B}'), readCost('3WU'), '>'), 'a strict superset');
  assert.ok(!compareCosts(readCost('{3}{W}{U}'), readCost('3WU'), '>'), 'not strict');
  assert.ok(compareCosts(readCost('{2}'), readCost('1'), ':'), 'm:1 matches {2}');
  assert.ok(compareCosts(readCost('{U/W}'), readCost('{W/U}'), '='), 'hybrid halves in either order');
});

test('node: patterns, the card\'s own name, devotion, produced mana, EDHREC rank and sorting', () => {
  assert.ok(has('t:creature o:/^{T}:/ c:g mv=1', 'Llanowar Elves'), 'a pattern with a literal {T}');
  assert.ok(has('t:instant o:/\\spp/ c:w mv=1', 'Gods Willing') === false && has('t:instant o:/\\spp/ c:w', 'Brute Force') === false, 'shorthands read');
  assert.ok(has('name:/\\bizzet\\b/', 'Izzet Charm') && !has('name:/\\bizzet\\b/', 'Izzetisdead'), 'a name pattern');
  assert.ok(has('o:"~ enters tapped" t:land', 'Azorius Chancery'), '~ is the card\'s name, or "this land"');
  assert.ok(has('devotion:{u/b}{u/b}{u/b}', 'Arcanis the Omnipotent'), 'a {U} counts toward {u/b}');
  assert.ok(has('produces=wu', 'Azorius Chancery') && !has('produces=wu', 'Command Tower'), 'produces= exactly');
  assert.ok(has('edhrec<=10', 'Sol Ring') && !has('edhrec<=10', 'Storm Crow'), 'EDHREC rank');
  assert.deepEqual(names('t:dragon c:r mv>=9 order:cmc direction:desc').slice(0, 1).map(name => run(`!"${name}"`).hits.length > 0), [true]);
  const byPower = run('t:goblin c:r pow>=4 order:power');
  assert.equal(byPower.sort, 'power');
  const powers = byPower.hits.map(at => Number.parseFloat(data.cards[at].p ?? data.cards[at].f?.[0].p ?? 'NaN'));
  assert.deepEqual(powers, [...powers].sort((a, b) => a - b), 'lowest power first, as on Scryfall');
  assert.match(run('t:elf order:usd').notes[0].text, /^Prices aren’t in the offline data/);
  assert.match(run('t:elf order:set').notes[0].text, /^order:set isn’t available offline\. Sorted by name instead\./);
});

test('node: the kinds of card and the land nicknames', () => {
  assert.ok(has('is:vanilla t:bear mv=2', 'Grizzly Bears') && has('is:bear c:g', 'Grizzly Bears'), 'vanilla and bear');
  assert.ok(has('is:commander c:w mv=3', 'Thalia\'s Lieutenant') === false && has('is:commander t:human c:w', 'Thalia, Guardian of Thraben'), 'commander');
  assert.ok(has('is:partner', 'Abdel Adrian, Gorion\'s Ward'), '"Choose a background" in lower case');
  assert.ok(has('is:companion', 'Lurrus of the Dream-Den'), 'companion');
  assert.ok(has('is:modal t:instant', 'Abzan Charm'), 'modal');
  assert.ok(has('is:historic t:artifact mv=0', 'Ornithopter') && has('is:spell t:artifact mv=0', 'Ornithopter') && !has('is:spell', 'Forest'), 'historic and spell');
  assert.deepEqual(names('is:dual').sort(), ['Badlands', 'Bayou', 'Plateau', 'Savannah', 'Scrubland', 'Taiga', 'Tropical Island', 'Tundra', 'Underground Sea', 'Volcanic Island']);
  assert.ok(has('is:triome', 'Ketria Triome') && has('is:tricycleland', 'Ketria Triome'), 'an alias');
  assert.ok(has('is:shockland', 'Breeding Pool') && has('is:fetchland', 'Misty Rainforest'), 'shock and fetch lands');
});

test('node: a pattern that would take too long, or uses a back-reference, is left out with a note', () => {
  assert.deepEqual(run('o:/(a+)+b/ t:elf').notes.map(note => note.text), ['This pattern could take too long. Try it without a repeated group.']);
  assert.deepEqual(run('o:/(draw)\\1/ t:elf').notes.map(note => note.text), ['Back-references aren’t supported.']);
  assert.match(run('o:/(draw/ t:elf').notes[0].text, /^Invalid pattern/);
  assert.ok(run('o:/(a+)+b/ t:elf').hits.length > 600, 'the rest of the query still runs');
});
