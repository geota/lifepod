import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { button, engines, eventually, openPage, saved, savedGame, test } from './helpers.mjs';

// Card lookup lets go of its cards (about 55 MB of heap) two minutes after the sheet closes, and at once when the app goes
// to the background with the sheet closed (js/sheets/cards.js `evictCards`); with it open, everything stays. The next
// open loads them again, keeping the query. It never touches the game or History.

const evictDelay = 2 * 60 * 1000;
const statusText = page => page.locator('#card-status').textContent();
const cardsState = page => page.locator('#cards').getAttribute('data-cards');
const rowCount = page => page.locator('#card-results [role="option"]').count();
// window.setTestHidden(true or false) sends the page to the background and back.
async function hideable(page) {
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    window.setTestHidden = (next) => {
      hidden = next;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
  await page.reload();
}
// Escape closes the sheet, and its close event starts the two minutes.
async function closeSheet(page) {
  await page.keyboard.press('Escape');
  await eventually(() => page.locator('#cards').evaluate(dialog => dialog.open), false, 'the sheet closes');
  // The close event is a task of its own, queued as the dialog closed; a message posted now runs after it.
  await page.evaluate(() => new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve(undefined);
    channel.port2.postMessage(0);
  }));
}
async function openWith(page, query) {
  await button(page, 'Card lookup').click();
  await eventually(() => cardsState(page), 'loaded', 'the cards load');
  await page.locator('#card-query').fill(query);
  await eventually(async () => (await rowCount(page)) > 0, true, `"${query}" lists cards`);
}
async function reopened(page, query) {
  await button(page, 'Card lookup').click();
  await eventually(() => cardsState(page), 'loaded', 'the cards load again');
  await eventually(async () => (await rowCount(page)) > 0, true, 'the last query runs again');
  assert.equal(await page.locator('#card-query').inputValue(), query, 'the query stays');
}

async function checkEviction(t, engine) {
  const page = await openPage(t, engine, { clock: true, game: savedGame(4) });
  await hideable(page);
  const fetched = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/data/cards.json.gz')) fetched.push(request.url());
  });
  await page.locator('.player').first().locator('.subtract').tap();
  await page.clock.runFor(5000);
  const history = async () => page.evaluate(async () => JSON.stringify((await import('/js/state/state.js')).game.history));
  const before = { history: await history(), saved: JSON.stringify((await saved(page)).history), undo: await page.locator('#undo-button').isDisabled() };

  // Reopened before the two minutes are up: the cards are still there, and nothing is fetched again.
  await openWith(page, 't:elf c:g mv=1');
  await button(page, 'Rules text').click();
  await closeSheet(page);
  await page.clock.runFor(evictDelay - 1000);
  assert.equal(await cardsState(page), 'loaded', 'kept until the time is up');
  await button(page, 'Card lookup').click();
  assert.ok((await rowCount(page)) > 0, 'the results are still drawn');
  assert.equal(fetched.length, 1);

  // Closed for two minutes: the cards, the rows and the card shown go, and the next open loads them again.
  await page.locator('#card-results [role="option"]').first().click();
  await closeSheet(page);
  await page.clock.runFor(evictDelay);
  assert.equal(await cardsState(page), null, 'the cards are let go');
  assert.deepEqual([await rowCount(page), await page.locator('#card-sheet > *').count()], [0, 0], 'no rows or card left');
  assert.equal(await page.locator('#card-text').getAttribute('aria-pressed'), 'true', 'the rules text toggle stays');
  await reopened(page, 't:elf c:g mv=1');
  assert.equal(fetched.length, 2, 'loaded again');

  // The background with the sheet closed lets go at once.
  await closeSheet(page);
  await page.evaluate(() => window.setTestHidden(true));
  assert.equal(await cardsState(page), null, 'closed: let go at once');
  await page.evaluate(() => window.setTestHidden(false));
  await reopened(page, 't:elf c:g mv=1');
  assert.equal(fetched.length, 3);

  // With the sheet open, the background keeps everything, the card shown too, however long; closing starts the two
  // minutes as usual, and closing while hidden lets go at once.
  await page.locator('#card-results [role="option"]').first().click();
  const shownCard = await page.locator('#card-name').textContent();
  await page.evaluate(() => window.setTestHidden(true));
  await page.clock.runFor(evictDelay * 2);
  await page.evaluate(() => window.setTestHidden(false));
  assert.equal(await cardsState(page), 'loaded', 'open: kept through the background');
  assert.equal(await page.locator('#card-name').textContent(), shownCard, 'the card shown stays');
  assert.ok((await rowCount(page)) > 0, 'the results stay');
  await closeSheet(page);
  await page.clock.runFor(evictDelay - 1000);
  assert.equal(await cardsState(page), 'loaded', 'closing starts the usual two minutes');
  await page.clock.runFor(1000);
  assert.equal(await cardsState(page), null);
  await reopened(page, 't:elf c:g mv=1');
  await page.evaluate(() => window.setTestHidden(true));
  await page.evaluate(() => document.querySelector('#cards').close());
  await eventually(() => cardsState(page), null, 'closed while hidden: let go at once, with no time passing');
  await page.evaluate(() => window.setTestHidden(false));
  assert.equal(fetched.length, 4);

  // A load cut short (the sheet closed and the app sent to the background as it loads) is cancelled cleanly, and the
  // next open loads again.
  await button(page, 'Card lookup').click();
  await page.evaluate(() => {
    document.querySelector('#cards').close();
    window.setTestHidden(true);
  });
  await page.evaluate(() => window.setTestHidden(false));
  assert.equal(await cardsState(page), null, 'the load is cancelled');
  await button(page, 'Card lookup').click();
  await eventually(async () => (await rowCount(page)) > 0, true, 'loaded after the cancelled load');
  assert.notEqual(await statusText(page), 'The cards couldn’t load. Close and open card lookup to try again.');

  // None of it touched the game.
  await closeSheet(page);
  await page.clock.runFor(evictDelay);
  assert.deepEqual({ history: await history(), saved: JSON.stringify((await saved(page)).history), undo: await page.locator('#undo-button').isDisabled() }, before,
    'no step recorded, nothing saved, Undo unchanged');
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: card lookup lets go of its cards after two minutes closed or in the background closed, and loads them again`, { timeout: 120000 }, t => checkEviction(t, engine));
}

// The memory comes back: nothing (a timer, a listener, a closure) keeps the cards after eviction.
test('chromium: card lookup gives its heap back when it lets go of the cards', { timeout: 120000 }, async (t) => {
  const page = await openPage(t, chromium, { clock: true });
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const heap = async () => {
    for (let i = 0; i < 3; i++) await session.send('HeapProfiler.collectGarbage');
    const { metrics } = await session.send('Performance.getMetrics');
    return metrics.find(metric => metric.name === 'JSHeapUsedSize').value / 1024 / 1024;
  };
  const board = await heap();
  await openWith(page, 'sol ring');
  // The close-spellings index and the search columns build a step at a time, on timers.
  for (const query of ['smothering tihte', 't:creature c:g mv<=3', 'o:/draw (a|two) cards?/', 'otag:removal c:w']) {
    await page.locator('#card-query').fill(query);
    await eventually(async () => {
      await page.clock.runFor(200);
      return (await rowCount(page)) > 0 && !/Loading|Searching/.test(`${await statusText(page)} ${await page.locator('#card-notes').textContent()}`);
    }, true, query);
  }
  await page.clock.runFor(5000);
  const loaded = await heap();
  await closeSheet(page);
  await page.clock.runFor(evictDelay);
  const evicted = await heap();
  t.diagnostic(`heap: board ${board.toFixed(1)} MB, loaded ${loaded.toFixed(1)} MB, evicted ${evicted.toFixed(1)} MB`);
  assert.ok(loaded - board > 30, 'the cards take their memory while loaded');
  assert.ok(evicted - board < 4, `back within 4 MB of the board alone (${(evicted - board).toFixed(1)} MB more)`);
});
