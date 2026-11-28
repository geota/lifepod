import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import {
  backHandling, button, engines, eventually, hold, openPage, savedGame, scores, test,
} from './helpers.mjs';

// The History sheet (MANA-UNDO-SPEC §6.8): a hold on Undo or Settings → Game → History opens it; rows newest first,
// with Now between the steps ahead and the steps taken; a new game empties it; a row jumps there; Back and Forward;
// a short screen puts them in the header; back and Escape close it, and focus returns to what opened it.

const mergeWindow = 1500;
const holdDelay = 500;
const tile = (page, number) => page.locator(`.player:nth-child(${number})`);
const subtract = (page, number) => tile(page, number).locator('.subtract');
const isOpen = page => page.locator('#history').evaluate(dialog => dialog.open);
// The sheet's list as it reads: each row's text, ahead rows marked, Now as 'Now'.
const rows = page => page.locator('#history-list > li').evaluateAll(items => items.map((item) => {
  if (item.matches('.history-now')) return item.textContent;
  const row = item.querySelector('button');
  const what = row.querySelector('.history-what').textContent;
  const who = row.querySelector('.history-who')?.textContent;
  return `${row.hasAttribute('data-ahead') ? 'ahead ' : ''}${who ? `${who}: ` : ''}${what}`;
}));

// Three life steps on three tiles, a second apart and more, so none merge.
async function play(page) {
  for (const number of [1, 2, 3]) {
    await subtract(page, number).tap();
    await page.clock.runFor(mergeWindow + 1);
  }
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: a hold on Undo opens History, whose rows jump through the game, with Now, Back and Forward`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: savedGame(4) });
    await hold(page, page.locator('#undo-button'), holdDelay);
    assert.equal(await isOpen(page), true, 'a hold on Undo opens History, even with nothing to undo');
    assert.ok(await page.locator('#history-empty').isVisible(), 'and says there\'s nothing yet');
    assert.ok(await page.locator('#history-back').isDisabled());
    await page.keyboard.press('Escape');
    await eventually(() => isOpen(page), false);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'undo-button', 'focus returns to Undo');

    await play(page);
    await hold(page, page.locator('#undo-button'), holdDelay);
    assert.deepEqual(await rows(page), ['Now', 'Player 3 · Coral: life 40 → 39', 'Player 2 · Sky: life 40 → 39', 'Player 1 · Jade: life 40 → 39']);
    const heights = await page.locator('.history-row').evaluateAll(buttons => buttons.map(button => button.offsetHeight));
    assert.ok(heights.every(height => height >= 44), `every row is a 44px target (${heights})`);

    // A row goes to just after its step: back two steps, as one announcement.
    await page.locator('.history-row').last().tap();
    assert.deepEqual(await scores(page), [39, 40, 40, 40]);
    assert.deepEqual(await rows(page), ['ahead Player 3 · Coral: life 40 → 39', 'ahead Player 2 · Sky: life 40 → 39', 'Now', 'Player 1 · Jade: life 40 → 39'], 'steps ahead are struck through above Now');
    await page.clock.runFor(700);
    assert.equal(await page.locator('#history [data-announcer]').textContent(), 'Back 2 steps, to Player 2, Sky, life 40 → 39', 'one announcement, in the sheet');

    // Back and Forward step one at a time.
    await page.locator('#history-back').tap();
    assert.deepEqual(await scores(page), [40, 40, 40, 40]);
    assert.equal(await rows(page).then(list => list.at(-1)), 'Now: the start');
    assert.ok(await page.locator('#history-back').isDisabled(), 'Back stops at the start');
    await page.locator('#history-forward').tap();
    await page.locator('#history-forward').tap();
    assert.deepEqual(await scores(page), [39, 39, 40, 40]);
    await page.locator('.history-row').first().tap();
    assert.deepEqual(await scores(page), [39, 39, 39, 40], 'the newest row goes forward to the end');
    assert.ok(await page.locator('#history-forward').isDisabled());
  });

  // A new game empties History (SPEC §10.2): the old game's rows go, and the new game's steps are the only rows.
  test(`${name}: a new game empties History, which then lists only the new game's steps`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: savedGame(4) });
    await subtract(page, 1).tap();
    await page.clock.runFor(mergeWindow + 1);
    await button(page, 'Settings').tap();
    await button(page, '2 players').tap();
    await page.locator('#save-setup').tap();
    await eventually(() => page.locator('.player').count(), 2);
    await hold(page, page.locator('#undo-button'), holdDelay);
    assert.equal(await isOpen(page), true);
    assert.deepEqual(await rows(page), [], 'no rows from the old game');
    assert.ok(await page.locator('#history-empty').isVisible(), 'and it says there\'s nothing yet');
    assert.ok(await page.locator('#history-back').isDisabled());
    assert.ok(await page.locator('#history-forward').isDisabled());
    await page.keyboard.press('Escape');
    await eventually(() => isOpen(page), false);
    await subtract(page, 2).tap();
    await button(page, 'Settings').tap();
    await button(page, 'History').tap();
    assert.equal(await isOpen(page), true, 'Settings → Game → History opens it');
    assert.deepEqual(await rows(page), ['Now', 'Player 2 · Sky: life 40 → 39'], 'only the new game\'s step');
    await page.locator('#history-back').tap();
    assert.deepEqual(await scores(page), [40, 40]);
    assert.ok(await page.locator('#history-back').isDisabled(), 'Back stops at the new game\'s start');
    assert.equal(await page.locator('.player').count(), 2);
    await page.keyboard.press('Escape');
    await eventually(() => isOpen(page), false);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'settings-history', 'focus returns to the History row in Settings');
  });

  // Under 360px tall, Back and Forward move into the header so the list keeps its rows; the flip turns the sheet.
  test(`${name}: on a short screen History's Back and Forward sit in the header, and the flip turns it`, async (t) => {
    const page = await openPage(t, engine, { clock: true, viewport: { width: 568, height: 320 }, orientation: 90, game: savedGame(4) });
    await play(page);
    await hold(page, page.locator('#undo-button'), holdDelay);
    const layout = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const dialog = box('#history');
      return { header: box('#history .sheet-header'), steps: box('#history .history-steps'), list: box('#history-list'), inside: dialog.bottom <= innerHeight && dialog.top >= 0 };
    });
    assert.ok(Math.abs(layout.steps.top - layout.header.top) < layout.header.height, 'Back and Forward share the header\'s line');
    assert.ok(layout.list.height >= 3 * 44, `the list keeps at least three rows (${layout.list.height}px)`);
    assert.ok(layout.inside, 'the sheet fits the screen');
    await page.locator('#history-flip').tap();
    assert.equal(await page.locator('#history').getAttribute('data-flipped'), '');
    assert.equal(await page.locator('#history-flip').getAttribute('aria-pressed'), 'true');
  });
}

// Android's back gesture closes History first, like any dialog.
test('chromium: Android back closes History', async (t) => {
  const page = await openPage(t, chromium, { clock: true, native: 'android', game: savedGame(4) });
  await hold(page, page.locator('#undo-button'), holdDelay);
  assert.equal(await isOpen(page), true);
  assert.equal((await backHandling(page)).at(-1), true, 'back comes to the page while it\'s open');
  assert.equal(await page.evaluate(() => window.closeOpenDialog()), true);
  await eventually(() => isOpen(page), false);
  await eventually(async () => (await backHandling(page)).at(-1), false, 'its close event hands back to the system');
});
