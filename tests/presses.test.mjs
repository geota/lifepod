import assert from 'node:assert/strict';
import { appUrl, engines, openPage, savedGame, test } from './helpers.mjs';

// A press and the board redrawing under it (docs/review/DEEP-DIVE.md D1–D3): an extra tap on the mana strip, a Turn
// press that a redraw lands in the middle of, and a hold that a dialog opens over. Each press keeps acting on what the
// finger is on, or stops, but never acts on something that moved under it.

const tile = (page, number) => page.locator(`.player:nth-child(${number})`);
const debugGame = page => page.evaluate(() => window.lifePodDebug.game);

// D3: a hold stops when a dialog opens over it. In counters mode, P1 holds their poison cell, which takes one away every
// 100ms; ✕ (here Android back) opens "Discard 10 changes?", and the count stays at what the question says.
async function checkHoldUnderDialog(t, engine) {
  const page = await openPage(t, engine, { clock: true, url: `${await appUrl()}?debug`, game: savedGame(4, { counters: { poison: true } }) });
  await page.getByRole('button', { name: 'Counters', exact: true }).tap();
  const poison = tile(page, 1).locator('.counter-cell[data-kind="poison"]');
  for (let tap = 0; tap < 8; tap++) await poison.tap();
  const box = await poison.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(650);
  // The hold took away two: one at 500ms and one at 600ms.
  assert.equal(await poison.locator('b').textContent(), '6');
  await page.evaluate(() => window.closeOpenDialog());
  assert.equal(await page.locator('#discard-title').textContent(), 'Discard 10 changes?');
  await page.clock.runFor(400);
  assert.equal(await poison.locator('b').textContent(), '6', 'the hold stops under the dialog');
  await page.mouse.up();
  assert.equal(await page.locator('#discard-title').textContent(), 'Discard 10 changes?');

  // The same for a life hold when settings opens over it.
  await page.getByRole('button', { name: 'Discard', exact: true }).tap();
  const add = tile(page, 2).locator('.add');
  const plus = await add.boundingBox();
  await page.mouse.move(plus.x + plus.width / 2, plus.y + plus.height / 2);
  await page.mouse.down();
  await page.clock.runFor(650);
  const held = (await debugGame(page)).scores[1];
  assert.equal(held, 43, 'a tap and two repeats');
  await page.locator('#setup-button').evaluate(setup => setup.click());
  await page.clock.runFor(400);
  await page.mouse.up();
  assert.equal((await debugGame(page)).scores[1], 43, 'the hold stops when settings opens');
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: a hold stops when a dialog opens over it`, t => checkHoldUnderDialog(t, engine));
}
