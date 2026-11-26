import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { test } from './helpers.mjs';
import { buildRulings, readRulings, shardCount, shardName, shardOf } from '../scripts/cards-rulings.mjs';
import { buildData, cachedBulk, cachedNicknames, cachedPrintings, cachedRulings, printedRarities, readBulk } from '../scripts/cards-update.mjs';

// Card rulings (scripts/cards-rulings.mjs), with no browser: the shards each card's rulings are in, the builder writing
// the same files every time, and the shape of data/rulings/ and the gzipped copies in web/data/rulings/.

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const cardsText = read('data/cards.json');
const cards = JSON.parse(cardsText).cards;
const names = ['shared', ...Array.from({ length: shardCount }, (_, shard) => shardName(shard))];
const sharedText = read('data/rulings/shared.json');
const shared = JSON.parse(sharedText);
const shardTexts = names.slice(1).map(name => read(`data/rulings/${name}.json`));
const shards = shardTexts.map(text => JSON.parse(text));

const ruling = (oracle_id, published_at, comment, source = 'wotc') => JSON.stringify({ object: 'ruling', oracle_id, source, published_at, comment });

test('node: a card\'s shard is a hash of its Oracle id alone, so other cards coming and going never move it', async () => {
  // Fixed for good: changing the hash or the count moves almost every card.
  assert.equal(shardCount, 32);
  assert.deepEqual(['00037840-6089-42ec-8c5c-281f9f474504', 'a8f6a8a9-63a2-4b94-8f4e-a8c1a7b7f6d6', ''].map(shardOf), [25, 27, 5]);
  for (let at = 0; at < 2000; at++) {
    const id = `${at.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
    assert.equal(shardOf(id), shardOf(id));
    assert.ok(shardOf(id) >= 0 && shardOf(id) < shardCount);
  }
  // The shards fill evenly: every one within a third of the mean, for the committed data.
  const mean = shards.reduce((sum, shard) => sum + shard.about.cards, 0) / shardCount;
  for (const shard of shards) assert.ok(Math.abs(shard.about.cards - mean) < mean / 3, `shard ${shard.about.shard}: ${shard.about.cards} cards`);

  // Building again with cards added before and after, and one taken away, leaves the other cards' shards and lines as
  // they were.
  const oracle = (id, name) => JSON.stringify({ oracle_id: id, name, layout: 'normal', games: ['paper'], type_line: 'Instant', color_identity: [], keywords: [], rarity: 'common', legalities: {} });
  const ids = Array.from({ length: 40 }, (_, at) => `${(at * 7919).toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`);
  const lines = ids.map((id, at) => oracle(id, `Card ${String(at).padStart(2, '0')}`));
  const bulk = ids.map((id, at) => ruling(id, '2020-01-01', `Ruling for card ${at}.`));
  const build = async (oracleLines) => {
    const rulings = await readRulings(bulk);
    const { text, kept } = await buildData(oracleLines, '2026-11-26T10:00:00.000+00:00', {}, new Map(), rulings);
    return { cards: JSON.parse(text).cards, files: buildRulings(rulings, kept, '2026-11-26T10:00:00.000+00:00').shards };
  };
  const before = await build(lines);
  const after = await build([oracle('0aaaaaaa-1111-4111-8111-111111111111', 'Aaa First'), ...lines.slice(1), oracle('0bbbbbbb-1111-4111-8111-111111111111', 'Zzz Last')]);
  const shardsOf = list => Object.fromEntries(list.filter(card => card.ru).map(card => [card.n, card.ru[1]]));
  const { 'Card 00': gone, ...kept } = shardsOf(before.cards);
  assert.equal(gone, shardOf(ids[0]));
  assert.deepEqual(shardsOf(after.cards), kept, 'the same shard for every card still there');
  for (const [name, shard] of Object.entries(kept)) {
    const line = files => files[shard].split('\n').find(row => row.startsWith(`{"n":"${name}"`));
    assert.equal(line(after.files), line(before.files), `${name}: its line is unchanged`);
  }
});

test('node: rulings come out oldest first, each once, in Scryfall\'s order within a date', async () => {
  const rulings = await readRulings([
    '[',
    `${ruling('one', '2021-03-19', 'Second of its day.')},`,
    `${ruling('one', '2004-10-04', 'The oldest.')},`,
    `${ruling('one', '2021-03-19', 'Second of its day.')},`,
    `${ruling('one', '2021-03-19', 'Third of its day.')},`,
    `${ruling('two', '2019-05-03', 'Scryfall\'s own note.', 'scryfall')},`,
    ruling('two', 'someday', 'No date, so left out.'),
    ruling('two', '2019-05-03', '   '),
    ']',
  ]);
  assert.deepEqual(rulings.get('one'), [['2004-10-04', 'The oldest.'], ['2021-03-19', 'Second of its day.'], ['2021-03-19', 'Third of its day.']]);
  assert.deepEqual(rulings.get('two'), [['2019-05-03', 'Scryfall\'s own note.', 'scryfall']]);
});

// A small bulk file: a keyword ruling two cards share, a card's own, two cards with the same name, and a card that isn't
// kept.
const sample = [
  ruling('aaaa', '2024-02-02', 'Both cards have this one.'),
  ruling('aaaa', '2023-01-01', 'Only the first card has this.'),
  ruling('bbbb', '2024-02-02', 'Both cards have this one.'),
  ruling('cccc', '2022-06-06', 'The second Twin, with {T} in it.'),
  ruling('dddd', '2020-01-01', 'A token\'s ruling.'),
];
const sampleCards = [{ id: 'aaaa', name: 'Alpha' }, { id: 'bbbb', name: 'Beta' }, { id: 'eeee', name: 'Twin' }, { id: 'cccc', name: 'Twin' }];
const updated = '2026-11-26T10:00:32.195+00:00';
const about = '"source":"Scryfall rulings bulk data, scryfall.com","updated":"2026-11-26T10:00:32.195+00:00"';

test('node: the shard builder writes the same files from the same bulk file, every time', async () => {
  const first = buildRulings(await readRulings(sample), sampleCards, updated);
  assert.equal(first.shared, `{"about":{${about},"count":1},\n"rulings":[\n["2024-02-02","Both cards have this one."]\n]}\n`);
  const at = { aaaa: shardOf('aaaa'), bbbb: shardOf('bbbb'), cccc: shardOf('cccc') };
  assert.deepEqual(at, { aaaa: 25, bbbb: 5, cccc: 25 }, 'the sample lands in two shards');
  assert.equal(first.shards[25], `{"about":{${about},"shard":25,"shards":32,"cards":2,"rulings":3},
"rulings":[
["2022-06-06","The second Twin, with {T} in it."],
["2023-01-01","Only the first card has this."]
],
"cards":[
{"n":"Alpha","r":[1,-1]},
{"n":"Twin","i":1,"r":[0]}
]}
`);
  assert.equal(first.shards[5], `{"about":{${about},"shard":5,"shards":32,"cards":1,"rulings":1},\n"rulings":[],\n"cards":[\n{"n":"Beta","r":[-1]}\n]}\n`);
  assert.equal(first.shards[0], `{"about":{${about},"shard":0,"shards":32,"cards":0,"rulings":0},\n"rulings":[],\n"cards":[]}\n`);
  assert.equal(first.shards.length, shardCount);
  // The bulk file's order doesn't matter.
  const second = buildRulings(await readRulings([...sample].reverse()), sampleCards, updated);
  assert.deepEqual(second, first);
});

test('node: the committed rulings are one per line, each once, and every card points at its own', () => {
  const lines = sharedText.split('\n');
  assert.match(lines[0], /^\{"about":\{"source":"Scryfall rulings bulk data, scryfall\.com","updated":"\d{4}-\d\d-\d\dT[^"]+","count":\d+\},$/);
  assert.equal(lines[1], '"rulings":[');
  assert.equal(lines.length - 4, shared.rulings.length, 'one ruling per line');
  assert.equal(shared.about.count, shared.rulings.length);
  const key = entry => JSON.stringify(entry);
  const inOrder = (list, where) => {
    for (const [at, entry] of list.entries()) {
      assert.ok(/^\d{4}-\d\d-\d\d$/.test(entry[0]) && typeof entry[1] === 'string' && entry[1].trim() === entry[1] && entry[1], `${where} ${at}: [date, text]`);
      assert.ok(entry.length === 2 || (entry.length === 3 && entry[2] === 'scryfall'), `${where} ${at}: the source`);
      if (at) assert.ok(list[at - 1][0] < entry[0] || (list[at - 1][0] === entry[0] && list[at - 1][1] <= entry[1]), `${where}: sorted by date, then text, at ${at}`);
    }
  };
  inOrder(shared.rulings, 'shared');
  const everywhere = new Set(shared.rulings.map(key));
  assert.equal(everywhere.size, shared.rulings.length);

  const byName = new Map();
  for (const [at, card] of cards.entries()) {
    const variant = at > 0 && cards[at - 1].n === card.n ? byName.get(`${card.n}#${cards[at - 1].variant}`)?.variant + 1 : 0;
    card.variant = variant;
    byName.set(`${card.n}#${variant}`, card);
  }
  const uses = new Map(shared.rulings.map(entry => [key(entry), 0]));
  let total = 0;
  let found = 0;
  for (const [number, shard] of shards.entries()) {
    const text = shardTexts[number];
    const shardLines = text.split('\n');
    assert.equal(shardLines[0], `{"about":${JSON.stringify(shard.about)},`);
    assert.deepEqual(Object.keys(shard.about), ['source', 'updated', 'shard', 'shards', 'cards', 'rulings']);
    assert.equal(shard.about.updated, shared.about.updated);
    assert.deepEqual([shard.about.shard, shard.about.shards], [number, shardCount]);
    assert.equal(shardLines.length, shard.rulings.length + shard.cards.length + 6, `shard ${number}: one ruling, then one card, per line`);
    inOrder(shard.rulings, `shard ${number}`);
    for (const entry of shard.rulings) {
      assert.ok(!everywhere.has(key(entry)), `shard ${number}: each ruling in one file`);
      everywhere.add(key(entry));
    }
    const ownUses = shard.rulings.map(() => 0);
    let previous = null;
    for (const entry of shard.cards) {
      assert.deepEqual(Object.keys(entry).filter(field => !['n', 'i', 'r'].includes(field)), [], `${entry.n}: only n, i and r`);
      const name = `${entry.n}#${entry.i ?? 0}`;
      assert.ok(entry.i === undefined || entry.i > 0, `${entry.n}: i only past the first`);
      assert.ok(!previous || previous.n < entry.n || (previous.n === entry.n && (previous.i ?? 0) < entry.i), `shard ${number}: sorted by name, ${previous?.n} then ${name}`);
      previous = entry;
      const card = byName.get(name);
      assert.ok(card, `${name} is in data/cards.json`);
      assert.deepEqual(card.ru, [entry.r.length, number], `${name}: cards.json has its count and shard`);
      const seen = new Set();
      for (const at of entry.r) {
        const rulingOf = at < 0 ? shared.rulings[-1 - at] : shard.rulings[at];
        assert.ok(rulingOf, `${name}: ruling ${at} is there`);
        if (at < 0) uses.set(key(rulingOf), uses.get(key(rulingOf)) + 1);
        else ownUses[at]++;
        assert.ok(!seen.has(at), `${name}: each ruling once`);
        seen.add(at);
      }
      const dates = entry.r.map(at => (at < 0 ? shared.rulings[-1 - at] : shard.rulings[at])[0]);
      assert.deepEqual(dates, [...dates].sort(), `${name}: oldest first`);
      total += entry.r.length;
      found++;
    }
    assert.deepEqual([shard.about.cards, shard.about.rulings], [shard.cards.length, shard.cards.reduce((sum, entry) => sum + entry.r.length, 0)]);
    assert.ok(ownUses.every(count => count === 1), `shard ${number}: every ruling of its own belongs to one card`);
  }
  assert.ok([...uses.values()].every(count => count >= 2), 'the shared file holds only rulings two or more cards have');
  assert.equal(found, cards.filter(card => card.ru).length, 'every card with a count is in its shard');
  assert.ok(total > 70000 && found > 18000, `${total} rulings on ${found} cards`);
});

test('node: the page ships each rulings file gzipped, the same text byte for byte, and nothing else in the folder', () => {
  const folder = new URL('../web/data/rulings/', import.meta.url);
  assert.deepEqual(readdirSync(folder).sort(), names.map(name => `${name}.json.gz`).sort());
  assert.deepEqual(readdirSync(new URL('../data/rulings/', import.meta.url)).sort(), names.map(name => `${name}.json`).sort());
  for (const name of names) {
    const packed = readFileSync(new URL(`${name}.json.gz`, folder));
    assert.equal(gunzipSync(packed).toString('utf8'), read(`data/rulings/${name}.json`), `${name}.json.gz unpacks to data/rulings/${name}.json`);
    assert.deepEqual([...packed.subarray(0, 10)], [0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 2, 255], `${name}: no time, best compression, OS unknown`);
    if (name !== 'shared') assert.ok(packed.length > 50 * 1024 && packed.length < 120 * 1024, `shard ${name}: ${(packed.length / 1024).toFixed(0)} KB, within 50 to 120 KB`);
  }
});

test('node: the committed rulings are what the cached bulk files build', async (t) => {
  const bulk = cachedBulk();
  const printings = cachedPrintings();
  const rulingsBulk = cachedRulings();
  if (![bulk, printings, rulingsBulk].every(file => file && existsSync(file.path))) {
    t.skip('no cached bulk files: run npm run cards:update once');
    return;
  }
  if (rulingsBulk.updated_at !== shared.about.updated || bulk.updated_at !== JSON.parse(cardsText).about.updated) {
    t.skip(`the cache is from ${rulingsBulk.updated_at} and ${bulk.updated_at}, the data from ${shared.about.updated}`);
    return;
  }
  // One file read at a time: a bulk file's lines start as soon as it's opened.
  const rulings = await readRulings(readBulk(rulingsBulk.path));
  const printed = await printedRarities(readBulk(printings.path));
  const { text, kept } = await buildData(readBulk(bulk.path), bulk.updated_at, cachedNicknames()?.lists ?? {}, printed, rulings);
  // Compared as a whole rather than diffed: a diff of 11 MB of text takes minutes.
  assert.ok(text === cardsText, 'data/cards.json is what the cached files build');
  const built = buildRulings(rulings, kept, rulingsBulk.updated_at);
  assert.ok(built.shared === sharedText, 'data/rulings/shared.json is what the cached files build');
  for (const [shard, shardText] of built.shards.entries()) assert.ok(shardText === shardTexts[shard], `data/rulings/${shardName(shard)}.json is what the cached files build`);
});

test('node: a release ships fresh rulings only when they look right', async () => {
  const { checkRulings, knownRulings, releaseFiles } = await import('../scripts/cards-release.mjs');
  assert.deepEqual(checkRulings(cardsText, sharedText, shardTexts, shardTexts), [], 'the committed rulings pass');
  assert.ok(cards.find(card => card.n === knownRulings)?.ru, `${knownRulings} has rulings`);
  // A tenth of the rulings gone.
  const thinned = shards.map(shard => JSON.stringify({ ...shard, about: { ...shard.about, rulings: Math.floor(shard.about.rulings * 0.9) } }));
  assert.match(checkRulings(cardsText, sharedText, thinned, shardTexts).join(), /more than 5% from the committed/);
  // The known card missing from its shard, or the shard missing.
  const [, home] = cards.find(card => card.n === knownRulings).ru;
  const without = shards.map((shard, at) => JSON.stringify(at === home ? { ...shard, cards: shard.cards.filter(entry => entry.n !== knownRulings) } : shard));
  assert.deepEqual(checkRulings(cardsText, sharedText, without, shardTexts), [`${knownRulings}'s rulings are missing`]);
  assert.match(checkRulings(cardsText, sharedText, shardTexts.slice(1), shardTexts).join(), /31 ruling shards, not 32/);
  assert.match(checkRulings(cardsText, '<html>503</html>', shardTexts, shardTexts).join(), /aren't JSON/);
  // Every rulings file is kept, and put back, with the cards.
  for (const name of names) {
    assert.ok(releaseFiles.includes(`data/rulings/${name}.json`) && releaseFiles.includes(`web/data/rulings/${name}.json.gz`), name);
  }
});
