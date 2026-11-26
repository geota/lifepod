import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { button, cpuSlowdown, engines, eventually, openPage, saved, savedGame, test } from './helpers.mjs';

// A card's rulings in card lookup (js/sheets/cardrulings.js, js/render/card.js rulingsSection): "Rulings (n)" under a
// card that has them, closed, from the count in the card data; opening the card fetches its one shard (and the shared
// file with the first), the last few shards stay, and they go with the cards when card lookup lets go.

const cards = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8')).cards;
const card = name => cards.find(entry => entry.n === name);
const shardPath = shard => `/data/rulings/${String(shard).padStart(2, '0')}.json.gz`;
// Five cards in five shards, and one in the same shard as the first.
const ruled = ['Swords to Plowshares', 'Doubling Season', 'Humility', 'Cultivate', 'Path to Exile'];
const sameShard = 'Rude Awakening';
const evictDelay = 2 * 60 * 1000;
const toggle = page => page.locator('#card-rulings-toggle');

async function openCards(page) {
  await button(page, 'Card lookup').click();
  await eventually(() => page.locator('#cards').getAttribute('data-cards'), 'loaded', 'the cards load');
}
// Opens a card by its exact name, from the list.
async function openCard(page, name) {
  if (await page.locator('#card-back').isVisible()) await page.locator('#card-back').click();
  await page.locator('#card-query').fill(`!"${name}"`);
  await eventually(() => page.locator('#card-results .card-row-name').first().textContent(), name, `"${name}" is listed`);
  await page.locator('#card-results [role="option"]').first().click();
  await eventually(() => page.locator('#card-name').textContent(), name, `${name} opens`);
}
// Escape closes the sheet, and its close event, a task of its own, starts the two minutes; a message posted now runs
// after it.
async function closeSheet(page) {
  await page.keyboard.press('Escape');
  await eventually(() => page.locator('#cards').evaluate(dialog => dialog.open), false, 'the sheet closes');
  await page.evaluate(() => new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve(undefined);
    channel.port2.postMessage(0);
  }));
}
const rulingsLoaded = page => eventually(() => page.locator('.card-rulings').getAttribute('data-state'), 'loaded', 'the rulings load');
function watchShards(page) {
  const fetched = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/data/rulings/')) fetched.push(path);
  });
  return fetched;
}

async function checkShown(t, engine) {
  const page = await openPage(t, engine, { viewport: { width: 852, height: 393 } });
  await openCards(page);

  // A card with no rulings shows nothing for them, and fetches nothing.
  const fetched = watchShards(page);
  await openCard(page, 'Sol Ring');
  assert.equal(card('Sol Ring').ru, undefined);
  assert.equal(await page.locator('#card-sheet .card-rulings').count(), 0, 'no rulings section');
  assert.deepEqual(fetched, []);

  // A card with rulings: a heading with the count, before anything loads, and the list closed.
  await openCard(page, sameShard);
  const [count] = card(sameShard).ru;
  const heading = page.getByRole('heading', { name: `Rulings (${count})`, level: 4 });
  assert.equal(await heading.count(), 1, 'a heading that names the count');
  assert.equal(await toggle(page).getAttribute('aria-expanded'), 'false', 'closed to begin with');
  assert.equal(await toggle(page).getAttribute('aria-controls'), 'card-rulings');
  assert.equal(await page.locator('#card-rulings').isVisible(), false);
  assert.equal((await page.getByRole('button', { name: `Rulings (${count})` }).count()), 1, 'the button\'s name says the count');
  await rulingsLoaded(page);

  // Opened: every ruling, oldest first, each with its date, the symbols drawn and card names as plain text.
  await toggle(page).click();
  assert.equal(await toggle(page).getAttribute('aria-expanded'), 'true');
  const items = page.locator('#card-rulings li.card-ruling');
  assert.equal(await items.count(), count);
  const dates = await page.locator('#card-rulings time').evaluateAll(times => times.map(time => [time.dateTime, time.textContent]));
  assert.deepEqual(dates.map(([iso]) => iso), dates.map(([iso]) => iso).sort(), 'oldest first');
  assert.ok(new Set(dates.map(([iso]) => iso)).size > 1, 'the rulings have different dates');
  assert.deepEqual(dates[0], ['2008-08-01', '1 August 2008'], 'a readable date');
  assert.ok(await page.locator('#card-rulings .pip[data-pip="T"]').count() > 0, '{T} is the tap symbol');
  assert.equal(await page.locator('#card-rulings a').count(), 0, 'no links');
  assert.equal(await page.locator('#card-rulings ol').getAttribute('class'), 'card-rulings-list');
  await toggle(page).click();
  assert.equal(await page.locator('#card-rulings').isVisible(), false, 'closes again');

  // Another card starts closed again.
  await openCard(page, 'Doubling Season');
  assert.equal(await toggle(page).getAttribute('aria-expanded'), 'false');
}

async function checkFetches(t, engine) {
  const page = await openPage(t, engine, { clock: true });
  await openCards(page);
  const fetched = watchShards(page);
  const held = () => page.evaluate(async () => (await import('/js/sheets/cardrulings.js')).heldShards());
  // The first card fetches the shared file and its shard; each card after only its own shard.
  await openCard(page, ruled[0]);
  await rulingsLoaded(page);
  assert.deepEqual(fetched, ['/data/rulings/shared.json.gz', shardPath(card(ruled[0]).ru[1])]);
  for (const name of ruled.slice(1)) {
    const before = fetched.length;
    await openCard(page, name);
    await rulingsLoaded(page);
    assert.deepEqual(fetched.slice(before), [shardPath(card(name).ru[1])], `${name}: one shard`);
  }
  // Four shards stay: the last four. A card in one of them, or in its shard again, fetches nothing.
  assert.deepEqual(await held(), ruled.slice(1).map(name => card(name).ru[1]));
  const before = fetched.length;
  await openCard(page, ruled[2]);
  await rulingsLoaded(page);
  assert.deepEqual(fetched.slice(before), [], 'a held shard is not fetched again');
  // The first card's shard was let go, so it's fetched again; the card in the same shard then needs nothing.
  await openCard(page, ruled[0]);
  await rulingsLoaded(page);
  assert.deepEqual(fetched.slice(before), [shardPath(card(ruled[0]).ru[1])]);
  await openCard(page, sameShard);
  await rulingsLoaded(page);
  assert.equal(card(sameShard).ru[1], card(ruled[0]).ru[1]);
  assert.deepEqual(fetched.slice(before), [shardPath(card(ruled[0]).ru[1])], 'its shard is held');

  // Card lookup lets go of the shards with the cards, two minutes after it closes; the next card fetches again.
  await closeSheet(page);
  await page.clock.runFor(evictDelay + 1000);
  assert.equal(await page.locator('#cards').getAttribute('data-cards'), null, 'the cards are let go');
  assert.deepEqual(await held(), [], 'and the shards');
  const after = fetched.length;
  await openCards(page);
  await openCard(page, sameShard);
  await rulingsLoaded(page);
  assert.deepEqual(fetched.slice(after), ['/data/rulings/shared.json.gz', shardPath(card(sameShard).ru[1])], 'loaded again');
}

// Reading rulings is not a game step: no undo step, nothing saved.
async function checkNoHistory(t, engine) {
  const page = await openPage(t, engine, { clock: true, game: savedGame(4) });
  await page.locator('.player').first().locator('.subtract').tap();
  await page.clock.runFor(5000);
  const state = async () => ({
    history: await page.evaluate(async () => JSON.stringify((await import('/js/state/state.js')).game.history)),
    saved: JSON.stringify((await saved(page)).history),
    undo: await page.locator('#undo-button').isDisabled(),
  });
  const before = await state();
  await openCards(page);
  await openCard(page, 'Doubling Season');
  await rulingsLoaded(page);
  await toggle(page).click();
  await toggle(page).click();
  await toggle(page).press('Enter');
  await page.keyboard.press('Escape');
  await page.clock.runFor(5000);
  assert.deepEqual(await state(), before, 'no step recorded, nothing saved, Undo unchanged');
}

// "Rulings (n)" is a whole 44px target inside the sheet at every size, closed and open.
const screens = [[952, 427], [852, 393], [640, 360], [568, 320], [320, 568], [390, 844], [820, 1180], [1366, 1024], [952, 214], [568, 160]];
async function checkTargets(t, engine, style) {
  const page = await openPage(t, engine, { style });
  await openCards(page);
  await openCard(page, 'Doubling Season');
  await rulingsLoaded(page);
  const problems = [];
  for (const [width, height] of screens) {
    await page.setViewportSize({ width, height });
    for (const state of ['closed', 'open']) {
      if (state === 'open') await toggle(page).click();
      await toggle(page).scrollIntoViewIfNeeded();
      const found = await page.evaluate(() => {
        const box = document.querySelector('#card-rulings-toggle').getBoundingClientRect();
        const sheet = document.querySelector('#card-sheet').getBoundingClientRect();
        const issues = [];
        if (box.width < 43.5 || box.height < 43.5) issues.push(`the button is ${Math.round(box.width)}×${Math.round(box.height)}`);
        if (box.left < sheet.left - 0.5 || box.right > sheet.right + 0.5) issues.push('the button is wider than the card');
        if (box.top < sheet.top - 0.5 || box.bottom > sheet.bottom + 0.5) issues.push('the button can\'t scroll into view');
        return issues;
      });
      problems.push(...found.map(issue => `${width}×${height} ${state}: ${issue}`));
    }
    await toggle(page).click();
  }
  assert.deepEqual(problems, []);
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: a card with rulings shows "Rulings (n)", closed, then every ruling oldest first; a card without shows nothing`, t => checkShown(t, engine));
  test(`${name}: opening a card fetches only its shard, the last four stay, and they go with the cards`, { timeout: 60000 }, t => checkFetches(t, engine));
  test(`${name}: reading rulings takes no undo step`, t => checkNoHistory(t, engine));
  for (const style of ['material', 'glass']) {
    test(`${name}: "Rulings (n)" is a whole 44px target at every size (${style})`, { timeout: 60000 }, t => checkTargets(t, engine, style));
  }
}

// A shard loads well within a tap's wait at a phone's speed: fetching, unpacking and parsing it as the page does, the
// best of three, at 4× CPU slowdown (on a page without the fake clock, which stops performance.now).
test('chromium: a rulings shard loads within 50 ms at 4× CPU slowdown', async (t) => {
  const page = await openPage(t, chromium);
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown });
  const timings = await page.evaluate(async () => {
    const load = async (name) => {
      const response = await fetch(`/data/rulings/${name}`, { cache: 'no-store' });
      return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
    };
    const best = async (name) => {
      let fastest = Infinity;
      for (let attempt = 0; attempt < 3; attempt++) {
        const start = performance.now();
        await load(name);
        fastest = Math.min(fastest, performance.now() - start);
      }
      return fastest;
    };
    const shards = [];
    for (const shard of ['00', '07', '18', '31']) shards.push(await best(`${shard}.json.gz`));
    return { shard: Math.max(...shards), shared: await best('shared.json.gz') };
  });
  t.diagnostic(`at ${cpuSlowdown}× slowdown: the slowest of four shards ${timings.shard.toFixed(1)} ms, the shared file ${timings.shared.toFixed(1)} ms`);
  assert.ok(timings.shard < 50, `a shard in ${timings.shard.toFixed(1)} ms`);
  assert.ok(timings.shared < 100, `the shared file in ${timings.shared.toFixed(1)} ms`);
});

// The shards take little memory, and it comes back, with the cards', when card lookup lets go.
test('chromium: rulings shards take little heap and give it back on eviction', { timeout: 120000 }, async (t) => {
  const page = await openPage(t, chromium, { clock: true });
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const heap = async () => {
    for (let i = 0; i < 3; i++) await session.send('HeapProfiler.collectGarbage');
    const { metrics } = await session.send('Performance.getMetrics');
    return metrics.find(metric => metric.name === 'JSHeapUsedSize').value / 1024 / 1024;
  };
  const board = await heap();
  await openCards(page);
  await openCard(page, 'Sol Ring');
  await page.clock.runFor(5000);
  const cardsOnly = await heap();
  await openCard(page, ruled[0]);
  await rulingsLoaded(page);
  await toggle(page).click();
  await page.clock.runFor(5000);
  const one = await heap();
  for (const name of ruled.slice(1)) {
    await openCard(page, name);
    await rulingsLoaded(page);
  }
  await page.clock.runFor(5000);
  const four = await heap();
  await closeSheet(page);
  await page.clock.runFor(evictDelay + 1000);
  const evicted = await heap();
  const held = await page.evaluate(async () => (await import('/js/sheets/cardrulings.js')).heldShards().length);
  t.diagnostic(`heap: board ${board.toFixed(1)} MB, cards loaded ${cardsOnly.toFixed(1)} MB, + the shared file and one shard ${(one - cardsOnly).toFixed(1)} MB, + the shared file and four shards ${(four - cardsOnly).toFixed(1)} MB, evicted ${evicted.toFixed(1)} MB`);
  assert.ok(one - cardsOnly < 5, `the shared file and a shard take ${(one - cardsOnly).toFixed(1)} MB`);
  assert.ok(four - cardsOnly < 8, `the shared file and four shards take ${(four - cardsOnly).toFixed(1)} MB`);
  assert.equal(held, 0, 'no shard held');
  assert.ok(evicted - board < 4, `back within 4 MB of the board alone (${(evicted - board).toFixed(1)} MB more)`);
});
