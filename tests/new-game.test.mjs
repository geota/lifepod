import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { button, engines, eventually, openPage, reload, saved, savedGame, seedGame, test } from './helpers.mjs';

// New game (design/polish/SPEC.md §10.2): what it resets and what it keeps, and Settings → Table → Shuffle tile colours
// each game, which deals each player a random, distinct colour, one per colour family, from crypto.getRandomValues.

const sets = JSON.parse(readFileSync(new URL('../design/polish/tiles7.json', import.meta.url), 'utf8'));
const families = { classic: sets.today.families, soft: sets.soft.families, jewel: sets.jewel.families, clear: sets.clear.families };
const openDialogs = page => page.evaluate(() => [...document.querySelectorAll('dialog[open]')].map(dialog => dialog.id));

// Settings → New game → Start new game, then waits for both dialogs to close.
async function newGame(page) {
  await button(page, 'Settings').tap();
  await button(page, 'New game').tap();
  await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  await eventually(() => openDialogs(page), [], 'the new game starts');
}

// A seeded stand-in for crypto.getRandomValues (mulberry32), counting its draws, so a run of shuffles is the same
// every time for one seed and different for another.
const seededRandom = seed => page => page.addInitScript((seed) => {
  let state = seed >>> 0;
  window.randomDraws = 0;
  crypto.getRandomValues = (array) => {
    window.randomDraws += 1;
    for (let at = 0; at < array.length; at++) {
      state = (state + 0x6d2b79f5) >>> 0;
      let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
      mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
      array[at] = (mixed ^ (mixed >>> 14)) >>> 0;
    }
    return array;
  };
  Math.random = () => {
    throw new Error('the shuffle must not use Math.random');
  };
}, seed);

// Everything a new game resets, set to something, with every setting away from its default.
const busy = savedGame(4, {
  startingLife: 30, scores: [12, 25, 3, 30], rotations: [1, 0, 2, 3], colors: [6, 1, 9, 3],
  counters: { commander: true, poison: true, energy: true, experience: true, rad: true, monarch: true, initiative: true },
  poison: [1, 2, 3, 4], casts: [2, 0, 1, 0], energy: [5, 0, 0, 1], experience: [0, 3, 0, 0], rad: [0, 0, 7, 0],
  commanderDamage: [[0, 4, 0, 0], [0, 0, 9, 0], [1, 0, 0, 0], [0, 0, 0, 0]],
  identities: ['WU', 'B', '', 'WUBRG'], identity: { show: { indicator: false, symbol: true, name: true }, background: 'default', version: 2 },
  manaPool: true, autoEmpty: false, pools: [[1, 0, 0, 0, 0, 2], [0, 0, 0, 0, 0, 0], [0, 3, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0]],
  turns: 'turns', turn: { first: 1, active: 2, round: 7 }, monarch: 2, initiative: 0,
  tileColours: 'jewel', badgeSize: 'large', style: 'glass', keepAwake: false, reminders: { turns: false, passOn: true, gestures: false },
});

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: a new game resets the game and keeps every setting, the seats and the tile colours`, async (t) => {
    const page = await openPage(t, engine, { game: busy });
    await newGame(page);
    const game = await saved(page);
    const zero = [0, 0, 0, 0];
    // Reset: life, every counter, commander damage, pools, turns, the monarch and the initiative, and identities.
    assert.deepEqual(game.scores, [30, 30, 30, 30], 'life goes back to the starting life');
    for (const kind of ['poison', 'casts', 'energy', 'experience', 'rad']) assert.deepEqual(game[kind], zero, `${kind} resets`);
    assert.deepEqual(game.commanderDamage, [zero, zero, zero, zero], 'commander damage resets');
    assert.deepEqual(game.pools, Array(4).fill([0, 0, 0, 0, 0, 0]), 'every pool empties');
    assert.deepEqual(game.turn, { first: null, active: null, round: 1 }, 'round 1, with nobody first');
    assert.deepEqual([game.monarch, game.initiative], [null, null], 'nobody holds the monarch or the initiative');
    assert.deepEqual(game.identities, ['', '', '', ''], 'colour identities clear');
    // "Who goes first?" opens, since Turns is on.
    await eventually(() => page.locator('#board').getAttribute('data-mode'), 'first', 'Who goes first? opens again');
    // Kept: every setting, the players and starting life, the rotations and the tile colours.
    assert.deepEqual(game.counters, busy.counters, 'the Track switches stay');
    assert.deepEqual([game.manaPool, game.autoEmpty, game.turns, game.keepAwake], [true, false, 'turns', false]);
    assert.deepEqual(game.identity, busy.identity, 'what tiles show of identities stays');
    assert.deepEqual(game.reminders, busy.reminders, 'the reminders stay');
    assert.deepEqual([game.tileColours, game.badgeSize, game.style, game.shuffleColours], ['jewel', 'large', 'glass', false]);
    assert.deepEqual([game.startingLife, game.scores.length], [30, 4]);
    assert.deepEqual(game.rotations, [1, 0, 2, 3], 'the seats keep their rotations');
    assert.deepEqual(game.colors, [6, 1, 9, 3], 'the tile colours stay with the shuffle off');
  });
}

// Shuffle tile colours each game: a switch in Table, off by default, saved, and checked when a game loads.
test('chromium: Shuffle tile colours each game is off by default, saved, and checked as a game loads', async (t) => {
  const page = await openPage(t, chromium, { before: seededRandom(1) });
  await button(page, 'Settings').tap();
  const toggle = page.getByRole('switch', { name: 'Shuffle tile colours each game', exact: true });
  assert.equal(await toggle.isChecked(), false, 'off on a fresh install');
  assert.ok(await page.locator('#settings-table #shuffle-colours-row').isVisible(), 'in Table');
  await button(page, 'Close settings').tap();
  // Off, a new game keeps the colours and draws nothing.
  await newGame(page);
  assert.deepEqual((await saved(page)).colors, [0, 1, 2, 3]);
  assert.equal((await saved(page)).shuffleColours, false);
  assert.equal(await page.evaluate(() => window.randomDraws), 0, 'no random draws with the shuffle off');
  // It saves at once and survives a reload.
  await button(page, 'Settings').tap();
  await page.locator('#shuffle-colours-row').tap();
  assert.equal((await saved(page)).shuffleColours, true);
  await reload(page);
  await button(page, 'Settings').tap();
  assert.equal(await toggle.isChecked(), true, 'on after a reload');
  // Only exactly true means on.
  for (const [value, on] of [[true, true], ['true', false], [1, false], [null, false]]) {
    await seedGame(page, savedGame(4, { shuffleColours: value }));
    await button(page, 'Settings').tap();
    assert.equal(await toggle.isChecked(), on, `${JSON.stringify(value)} loads as ${on}`);
    await button(page, 'Close settings').tap();
  }
});

// With the shuffle on, each new game gives every player a random, distinct swatch from the active set, each from a
// different colour family (six per set, so up to six players get one each), from crypto.getRandomValues: with a seeded
// stand-in, one seed always deals the same run, another deals a different one, and the run varies game to game.
// About 60 new games through the UI, each opening two dialogs behind their 350ms tap guard, so it gets a long timeout.
test('chromium: shuffled colours are unique, one per family, random, and from the crypto RNG', { timeout: 180000 }, async (t) => {
  const deal = async (seed, tiles, players, games) => {
    const page = await openPage(t, chromium, { before: seededRandom(seed), game: savedGame(players, { shuffleColours: true, tileColours: tiles }) });
    const dealt = [];
    for (let at = 0; at < games; at++) {
      await newGame(page);
      const { colors } = await saved(page);
      const shown = await page.locator('.player').evaluateAll(tiles => tiles.map(tile => tile.dataset.colour));
      assert.equal(shown.length, players);
      dealt.push(colors);
    }
    assert.ok((await page.evaluate(() => window.randomDraws)) > 0, 'the shuffle draws from crypto.getRandomValues');
    return dealt;
  };
  for (const tiles of ['clear', 'classic', 'soft']) {
    const dealt = await deal(7, tiles, 6, 6);
    for (const colors of dealt) {
      assert.equal(colors.length, 6);
      assert.ok(colors.every(id => Number.isInteger(id) && id >= 0 && id < 12), `${colors}: every id is a swatch`);
      assert.equal(new Set(colors).size, 6, `${tiles} ${colors}: no two players share a colour`);
      assert.equal(new Set(colors.map(id => families[tiles][id])).size, 6, `${tiles} ${colors}: six players get six families`);
    }
    assert.ok(new Set(dealt.map(String)).size >= 5, `${tiles}: the deal changes from game to game`);
  }
  // Fewer players than families: still every seat a different family.
  for (const colors of await deal(3, 'clear', 4, 4)) {
    assert.equal(new Set(colors.map(id => families.clear[id])).size, 4, `${colors}: four players get four families`);
  }
  // The same seed deals the same run; another seed deals another.
  assert.deepEqual(await deal(11, 'clear', 5, 3), await deal(11, 'clear', 5, 3), 'one seed, one run');
  assert.notDeepEqual(await deal(11, 'clear', 5, 3), await deal(12, 'clear', 5, 3), 'another seed, another run');
  // Over many games every swatch turns up for player 1, so no colour is left out.
  const first = new Set((await deal(5, 'classic', 2, 30)).map(colors => colors[0]));
  assert.equal(first.size, 12, `player 1 got ${[...first].sort((a, b) => a - b)}`);
});
