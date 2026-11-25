import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from './helpers.mjs';
import { gunzipSync } from 'node:zlib';
import { buildCards, cachedBulk, cachedNicknames, packCards, readBulk, shownDate } from '../scripts/cards-update.mjs';
import {
  colourMask, costText, faceStats, fold, indexCards, rankResults, readSymbol, searchCards, searchNames, searchText, splitSymbols,
} from '../web/js/logic/cards.js';

// Card lookup's data and search, with no browser: the shape of data/cards.json and the gzipped copy the page loads,
// scripts/cards-update.mjs building them the same way every time, the ranking, folding and the mana symbols (web/js/logic/cards.js).

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dataText = read('data/cards.json');
const data = JSON.parse(dataText);
const index = indexCards(data.cards);
const names = (query, options) => searchCards(index, query, options).results.map(at => data.cards[at].n);

const faceKeys = new Set(['n', 'm', 't', 'o', 'p', 'l', 'd']);
const cardKeys = new Set([...faceKeys, 'k', 'c', 'co', 'v', 'r', 'f', 'lead', 'kw', 'pair', 'er', 'lg', 'pm', 'ly', 'mr', 'gc', 'rs', 'ci', 'fun', 'lc']);
const inColourOrder = /^W?U?B?R?G?$/;

test('node: the card data file has one card per line, in order, with only the fields the lookup reads', () => {
  const lines = dataText.split('\n');
  assert.match(lines[0], /^\{"about":\{"source":"Scryfall[^"]*","updated":"\d{4}-\d\d-\d\dT[^"]+","count":\d+,"formats":\["standard"[^\]]*\]\},$/);
  assert.equal(lines[1], '"cards":[');
  assert.equal(lines.at(-2), ']}');
  assert.equal(lines.length - 4, data.cards.length, 'one card per line, for readable diffs');
  assert.equal(data.about.count, data.cards.length);
  assert.ok(data.cards.length > 30000, `every paper card: ${data.cards.length}`);
  const face = (card, where) => {
    for (const key of Object.keys(card)) assert.ok(where === 'card' ? cardKeys.has(key) : faceKeys.has(key), `${card.n}: ${key}`);
    assert.equal(typeof card.n, 'string');
    assert.equal(typeof card.t, 'string');
    for (const key of ['m', 'o', 'p', 'l', 'd']) if (key in card) assert.ok(typeof card[key] === 'string' && card[key] !== '', `${card.n}: ${key}`);
    if (card.p) assert.match(card.p, /^[^/]*\/[^/]*$/, `${card.n}: power/toughness`);
  };
  let previous = '';
  for (const card of data.cards) {
    face(card, 'card');
    assert.equal(card.k, fold(card.n), `${card.n}: the search key is the folded name`);
    assert.ok(card.k >= previous, `sorted by key: ${previous} then ${card.k}`);
    previous = card.k;
    if (card.c !== undefined) assert.ok(card.c && inColourOrder.test(card.c), `${card.n}: identity ${card.c} in W U B R G order`);
    if (card.co !== undefined) assert.ok(card.co === '-' || inColourOrder.test(card.co), `${card.n}: colours ${card.co}`);
    if (card.v !== undefined) assert.ok(typeof card.v === 'number' && card.v > 0, `${card.n}: mana value`);
    if (card.r !== undefined) assert.match(card.r, /^[curmsb]$/, `${card.n}: rarity`);
    if (card.lg !== undefined) assert.match(card.lg, /^(\+?[a-wA-W])+$/, `${card.n}: legalities`);
    if (card.pm !== undefined) assert.match(card.pm, /^W?U?B?R?G?C?$/, `${card.n}: produced mana`);
    if (card.kw) assert.deepEqual(card.kw, [...card.kw].sort(), `${card.n}: keywords sorted`);
    if (card.f) {
      assert.ok(card.f.length >= 2, `${card.n}: a card with faces has two or more`);
      for (const side of card.f) face(side, 'face');
      assert.equal(card.n, card.f.map(side => side.n).join(' // '), `${card.n}: its name joins its faces'`);
      assert.ok(!('o' in card), `${card.n}: the text is on its faces`);
    }
  }
  // A few cards the lookup must have, as Scryfall prints them.
  const card = name => data.cards.find(entry => entry.n === name);
  assert.deepEqual(card('Sol Ring'), { n: 'Sol Ring', m: '{1}', t: 'Artifact', o: '{T}: Add {C}{C}.', k: 'sol ring', v: 1, r: 'u', er: 1, lg: 'H+jlMSvW', pm: 'C' });
  assert.equal(card('Treasure').t, 'Token Artifact — Treasure', 'the predefined tokens are kept');
  assert.equal(card('Soldier'), undefined, 'other tokens are not');
  // Paper cards whose Oracle printing is an MTGO one are kept, because paper formats list them; the cards Scryfall hides
  // by default are not (design/polish/SCRYFALL-SYNTAX-SPEC.md §5.1).
  for (const name of ['Underground Sea', 'Badlands', 'Mox Diamond', 'Palinchron']) assert.ok(card(name), `${name} is in the data`);
  assert.equal(card('Phyrexian Broodstar'), undefined, 'a playtest card is not');
  assert.equal(card('Alora, Merry Thief').pair, 1, '"Choose a background", in Scryfall\'s lower case, is a pairing keyword');
  assert.equal(card('Delver of Secrets // Insectile Aberration').f[1].p, '3/2');
});

test('node: the page ships the data gzipped, the same cards byte for byte, with a header that doesn\'t vary', () => {
  const shipped = readFileSync(new URL('../web/data/cards.json.gz', import.meta.url));
  assert.equal(gunzipSync(shipped).toString('utf8'), dataText, 'web/data/cards.json.gz unpacks to data/cards.json');
  assert.deepEqual([...shipped.subarray(0, 10)], [0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 2, 255], 'no time, best compression, OS unknown');
  const packed = packCards('{"cards":[]}');
  assert.deepEqual(packCards('{"cards":[]}'), packed, 'the same text packs the same way');
  assert.ok(!existsSync(new URL('../web/data/cards.json', import.meta.url)), 'the readable file stays out of the apps');
});

test('node: the credits print the data\'s date', () => {
  const date = shownDate(data.about.updated);
  assert.match(date, /^\d{1,2} [A-Z][a-z]+ \d{4}$/);
  for (const path of ['web/index.html', 'README.md']) {
    const dates = [...read(path).matchAll(/<span data-cards-date>([^<]*)<\/span>/g)].map(match => match[1]);
    assert.ok(dates.length > 0, `${path} credits Scryfall with a date`);
    for (const shown of dates) assert.equal(shown, date, `${path} shows the data's date`);
  }
});

// A small bulk file in Scryfall's shape: what's kept, what's dropped, and how faces come out.
const bulk = [
  { name: 'Grizzly Bears', layout: 'normal', games: ['paper', 'mtgo'], mana_cost: '{1}{G}', cmc: 2, type_line: 'Creature — Bear', oracle_text: '', power: '2', toughness: '2', colors: ['G'], color_identity: ['G'], keywords: [], rarity: 'common', legalities: { commander: 'legal' } },
  { name: 'Delver of Secrets // Insectile Aberration', layout: 'transform', games: ['paper'], cmc: 1, type_line: 'Creature — Human Wizard // Creature — Human Insect', color_identity: ['U'], keywords: ['Transform', 'Flying'], rarity: 'common', legalities: { commander: 'legal' },
    card_faces: [
      { name: 'Delver of Secrets', mana_cost: '{U}', type_line: 'Creature — Human Wizard', oracle_text: 'At the beginning of your upkeep, look at the top card of your library.', power: '1', toughness: '1', colors: ['U'] },
      { name: 'Insectile Aberration', mana_cost: '', type_line: 'Creature — Human Insect', oracle_text: 'Flying', power: '3', toughness: '2', colors: ['U'] },
    ] },
  { name: 'Lim-Dûl\'s Vault', layout: 'normal', games: ['paper'], mana_cost: '{U}{B}', cmc: 2, type_line: 'Instant', oracle_text: 'Look at the top five cards of your library.', colors: ['U', 'B'], color_identity: ['B', 'U'], keywords: [], rarity: 'uncommon', legalities: { commander: 'legal' } },
  { name: 'Partner Pal', layout: 'normal', games: ['paper'], mana_cost: '{2}{W}', cmc: 3, type_line: 'Legendary Creature — Human', oracle_text: 'Partner', power: '2', toughness: '3', colors: ['W'], color_identity: ['W'], keywords: ['Partner'], rarity: 'rare', legalities: { commander: 'banned' } },
  { name: 'Treasure', layout: 'token', games: ['paper'], mana_cost: '', cmc: 0, type_line: 'Token Artifact — Treasure', oracle_text: '{T}, Sacrifice this token: Add one mana of any color.', colors: [], color_identity: [], keywords: [], rarity: 'common', legalities: { commander: 'not_legal' } },
  { name: 'Soldier', layout: 'token', games: ['paper'], type_line: 'Token Creature — Soldier', colors: ['W'], color_identity: ['W'], keywords: [], rarity: 'common', legalities: {} },
  { name: 'Grizzly Bears', layout: 'art_series', games: ['paper'], type_line: 'Card // Card', color_identity: [], keywords: [], rarity: 'common', legalities: {} },
  { name: 'Arena Only', layout: 'normal', games: ['arena'], type_line: 'Instant', color_identity: [], keywords: [], rarity: 'rare', legalities: {} },
  { name: 'Poison Counter', layout: 'normal', games: ['paper'], type_line: 'Card', color_identity: [], keywords: [], rarity: 'common', legalities: {} },
  { name: 'Badlands', layout: 'normal', games: ['mtgo'], mana_cost: '', cmc: 0, type_line: 'Land — Swamp Mountain', oracle_text: '({T}: Add {B} or {R}.)', colors: [], color_identity: ['B', 'R'], keywords: [], rarity: 'rare', legalities: { legacy: 'legal', commander: 'legal', historic: 'not_legal' } },
  { name: 'Playtest Pal', layout: 'normal', games: ['paper'], promo_types: ['playtest'], type_line: 'Creature — Test', color_identity: [], keywords: [], rarity: 'rare', legalities: {} },
  { name: 'Oversized Memento', layout: 'normal', games: ['paper'], set_type: 'memorabilia', type_line: 'Artifact', color_identity: [], keywords: [], rarity: 'rare', legalities: {} },
  { name: 'Background Buddy', layout: 'normal', games: ['paper'], mana_cost: '{1}{U}', cmc: 2, type_line: 'Legendary Creature — Halfling', oracle_text: 'Choose a background', colors: ['U'], color_identity: ['U'], keywords: ['Choose a background'], rarity: 'uncommon', legalities: { commander: 'legal' } },
];
const expected = `{"about":{"source":"Scryfall Oracle cards bulk data, scryfall.com","updated":"2026-11-23T22:02:34.594+00:00","count":7,"formats":["standard","future","historic","timeless","gladiator","pioneer","modern","legacy","pauper","vintage","penny","commander","oathbreaker","standardbrawl","brawl","competitivebrawl","alchemy","paupercommander","duel","oldschool","premodern","predh","tlr"]},
"cards":[
{"n":"Background Buddy","m":"{1}{U}","t":"Legendary Creature — Halfling","o":"Choose a background","k":"background buddy","c":"U","v":2,"r":"u","lead":1,"kw":["Choose a background"],"pair":1,"lg":"l"},
{"n":"Badlands","t":"Land — Swamp Mountain","o":"({T}: Add {B} or {R}.)","k":"badlands","c":"BR","co":"-","r":"r","lg":"hl"},
{"n":"Delver of Secrets // Insectile Aberration","m":"{U}","t":"Creature — Human Wizard // Creature — Human Insect","k":"delver of secrets insectile aberration","c":"U","v":1,"r":"c","f":[{"n":"Delver of Secrets","m":"{U}","t":"Creature — Human Wizard","o":"At the beginning of your upkeep, look at the top card of your library.","p":"1/1"},{"n":"Insectile Aberration","t":"Creature — Human Insect","o":"Flying","p":"3/2"}],"kw":["Flying","Transform"],"lg":"l","ly":"transform"},
{"n":"Grizzly Bears","m":"{1}{G}","t":"Creature — Bear","p":"2/2","k":"grizzly bears","c":"G","v":2,"r":"c","lg":"l"},
{"n":"Lim-Dûl's Vault","m":"{U}{B}","t":"Instant","o":"Look at the top five cards of your library.","k":"lim duls vault","c":"UB","v":2,"r":"u","lg":"l"},
{"n":"Partner Pal","m":"{2}{W}","t":"Legendary Creature — Human","o":"Partner","p":"2/3","k":"partner pal","c":"W","v":3,"r":"r","lead":1,"kw":["Partner"],"pair":1,"lg":"L"},
{"n":"Treasure","t":"Token Artifact — Treasure","o":"{T}, Sacrifice this token: Add one mana of any color.","k":"treasure","r":"c","ly":"token"}
]}
`;

test('node: cards-update.mjs builds the same file from the same bulk file, every time', async () => {
  const lines = bulk.map(card => JSON.stringify(card));
  const first = await buildCards(lines, '2026-11-23T22:02:34.594+00:00');
  assert.equal(first, expected);
  // The bulk file's order doesn't matter, nor whether it's JSON Lines or a JSON array.
  const second = await buildCards(['[', ...[...lines].reverse().map(line => `${line},`), ']'], '2026-11-23T22:02:34.594+00:00');
  assert.equal(second, first);
});

test('node: the committed data file is what the cached bulk file builds', async (t) => {
  const cached = cachedBulk();
  if (!cached || !existsSync(cached.path)) {
    t.skip('no cached bulk file: run npm run cards:update once');
    return;
  }
  if (cached.updated_at !== data.about.updated) {
    t.skip(`the cache is from ${cached.updated_at}, the data from ${data.about.updated}`);
    return;
  }
  assert.equal(await buildCards(readBulk(cached.path), cached.updated_at, cachedNicknames()?.lists ?? {}), dataText);
});

test('node: search ranks the whole name, then a word prefix, a prefix, word starts and contains', () => {
  assert.equal(names('sol r')[0], 'Sol Ring', '"sol r" finds Sol Ring first');
  assert.equal(names('Sol Ring')[0], 'Sol Ring');
  const sol = names('sol', { limit: 1000 });
  assert.equal(sol[0], 'Sol Ring', 'the shortest name that starts with "sol" as a word');
  assert.ok(sol.indexOf('Sol Talisman') < sol.indexOf('Soliton'), 'a whole word before a longer one');
  assert.ok(sol.indexOf('Soliton') < sol.indexOf('Radiant Solar'), 'a prefix before a word inside the name');
  const ranked = searchCards(index, 'sol', { limit: 1000 });
  const rankOf = name => ranked.ranks[ranked.results.findIndex(at => data.cards[at].n === name)];
  assert.equal(rankOf('Radiant Solar'), 3, 'a word that starts with it');
  assert.equal(rankOf('Absolute Grace'), 4, 'then a match inside a word');
  assert.equal(names('ring sol')[0], 'Sol Ring', 'words in any order');
  assert.equal(names('lightning bolt')[0], 'Lightning Bolt', 'the exact name before longer ones');
  assert.deepEqual(names('xyzzyq'), []);
  assert.deepEqual(searchCards(index, '   '), { results: [], ranks: [], count: 0 });
  const { results, ranks, count } = searchCards(index, 's', { limit: 10 });
  assert.equal(results.length, 10);
  assert.ok(count > 10000, 'the count is every match, beyond the ones listed');
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'in rank order');
});

test('node: search ignores case, accents and punctuation', () => {
  for (const query of ['lim dul', 'LIM-DÛL', 'Lim-Dûl\'s Vault', 'lim duls vault', 'lim-dul’s']) {
    assert.ok(names(query).includes('Lim-Dûl\'s Vault'), `"${query}" finds Lim-Dûl's Vault`);
  }
  assert.ok(names('aether vial').includes('Aether Vial'));
  assert.equal(fold('Æther Vial'), 'aether vial');
  assert.equal(fold('Jötun Grunt'), 'jotun grunt');
  assert.equal(fold('Ach! Hans, Run!'), 'ach hans run');
  assert.equal(fold('+2 Mace'), '+2 mace');
  assert.equal(fold('Fire // Ice'), 'fire ice');
  assert.equal(names('urza’s saga')[0], 'Urza\'s Saga', 'a phone\'s curly apostrophe');
  assert.equal(names('fire ice')[0], 'Fire // Ice', 'a split card by both halves');
});

test('node: rules text search finds cards by what they do, after the names, and narrows as the query grows', () => {
  const text = names('treasure', { text: true, limit: 500 });
  assert.equal(text[0], 'Treasure', 'a name match first');
  assert.ok(text.includes('Dockside Extortionist'), 'then cards whose text makes a Treasure');
  assert.deepEqual(searchText(index, 'tr'), [], 'not from two letters');
  // Typing narrows the last match set; it finds exactly what a full scan does.
  const fresh = indexCards(data.cards);
  const typed = ['dra', 'draw', 'draw a', 'draw a card'].map(query => searchText(fresh, query));
  for (const [at, query] of ['dra', 'draw', 'draw a', 'draw a card'].entries()) {
    const scan = data.cards.map((card, place) => [card, place])
      .filter(([card]) => (card.f ? card.f.map(side => side.o ?? '').join('\n') : card.o ?? '').toLowerCase().includes(query)).map(([, place]) => place);
    assert.deepEqual(typed[at], scan, `"${query}" finds what a scan finds`);
  }
  // A card listed by name isn't listed again for its text.
  const { results } = rankResults(index, searchNames(index, 'treasure'), searchText(index, 'treasure'), 5000);
  assert.equal(new Set(results).size, results.length);
});

test('node: mana symbols read as discs, hybrids, Phyrexian mana, bare glyphs or text', () => {
  assert.deepEqual(readSymbol('W'), { pip: 'W', say: 'white' });
  assert.deepEqual(readSymbol('2'), { pip: '2', say: '2' });
  assert.deepEqual(readSymbol('T'), { pip: 'T', say: 'tap' });
  assert.deepEqual(readSymbol('G/W'), { pip: 'G', second: 'W', phyrexian: false, say: 'green or white' });
  assert.deepEqual(readSymbol('2/B'), { pip: '2', second: 'B', phyrexian: false, say: '2 or black' });
  assert.deepEqual(readSymbol('B/P'), { pip: 'B', phyrexian: true, say: 'Phyrexian black' });
  assert.deepEqual(readSymbol('G/U/P'), { pip: 'G', second: 'U', phyrexian: true, say: 'Phyrexian green or blue' });
  assert.deepEqual(readSymbol('E'), { sym: 'E', say: 'energy' });
  assert.deepEqual(readSymbol('HW'), { text: '{HW}', say: 'HW' });
  assert.deepEqual(splitSymbols('{T}: Add {C}{C}.'), [{ pip: 'T', say: 'tap' }, ': Add ', { pip: 'C', say: 'colourless' }, { pip: 'C', say: 'colourless' }, '.']);
  assert.equal(costText('{2}{W}{W}'), '2, white, white');
  assert.equal(costText('{R} // {1}{G}'), 'red, or 1, green');
  // Every symbol in the data draws as something: none falls back to text but the few the font lacks.
  const unknown = new Set();
  for (const card of data.cards) {
    for (const source of [card, ...(card.f ?? [])]) {
      for (const run of splitSymbols(`${source.m ?? ''}${source.o ?? ''}`)) if (typeof run !== 'string' && run.text) unknown.add(run.text);
    }
  }
  assert.ok(unknown.size <= 12, `symbols drawn as text: ${[...unknown].join(' ')}`);
});

test('node: the fields for a later structured query read as numbers and masks', () => {
  assert.deepEqual(faceStats({ n: '', t: '', p: '3/4' }), { power: 3, toughness: 4, loyalty: null, defense: null });
  assert.deepEqual(faceStats({ n: '', t: '', p: '*/1+*' }), { power: 0, toughness: 1, loyalty: null, defense: null });
  assert.deepEqual(faceStats({ n: '', t: '', l: '4' }), { power: null, toughness: null, loyalty: 4, defense: null });
  assert.equal(colourMask('WUBRG'), 31);
  assert.equal(colourMask('BG'), 4 | 16);
  assert.equal(colourMask(undefined), 0);
});

// A release build ships fresh data only if it passes these, and the committed data otherwise (scripts/cards-release.mjs).
test('node: a release refreshes the card data only when the new data looks right', async () => {
  const { checkRelease, knownCards } = await import('../scripts/cards-release.mjs');
  assert.deepEqual(checkRelease(dataText, dataText), [], 'the committed data passes');
  const shrunk = { ...data, cards: data.cards.slice(0, Math.floor(data.cards.length * 0.9)) };
  shrunk.about = { ...data.about, count: shrunk.cards.length };
  assert.match(checkRelease(JSON.stringify(shrunk), dataText).join(), /more than 5% from the committed/);
  const without = { ...data, cards: data.cards.filter(card => card.n !== 'Sol Ring') };
  without.about = { ...data.about, count: without.cards.length };
  assert.deepEqual(checkRelease(JSON.stringify(without), dataText), ['Sol Ring is missing']);
  assert.match(checkRelease('<html>503</html>', dataText).join(), /isn't JSON/);
  for (const name of knownCards) assert.ok(data.cards.some(card => card.n === name), `${name} is in the committed data`);
});
