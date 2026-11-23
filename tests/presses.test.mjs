import assert from 'node:assert/strict';
import { appUrl, engines, openPage, saved, savedGame, test } from './helpers.mjs';

// A press and the board redrawing under it (docs/review/DEEP-DIVE.md D1–D3): an extra tap on the mana strip, a Turn
// press that a redraw lands in the middle of, and a hold that a dialog opens over. Each press keeps acting on what the
// finger is on, or stops, but never acts on something that moved under it.

// Timers in web/js/logic/data.js: a strip keeps its buttons in place for stripHoldTime after its last tap, a turn chip
// held for holdDelay steps back, and "Undo clear" lasts undoClearTime.
const stripHoldTime = 800;
const holdDelay = 500;
const undoClearTime = 5000;

const tile = (page, number) => page.locator(`.player:nth-child(${number})`);
const debugGame = page => page.evaluate(() => window.lifePodDebug.game);
// Each tile's strip as it reads: 'R3 C1 clear', 'undo', or '' with no strip.
const strips = page => page.locator('.mana-strip').evaluateAll(rows => rows.map(row => (row.hidden ? '' : [...row.children]
  .filter(item => !item.matches('.chip') && item.checkVisibility())
  .map(item => (item.matches('.strip-clear') ? 'clear' : item.matches('.strip-undo') ? 'undo' : `${item.dataset.colour}${item.textContent}`)).join(' '))));

// D1: P1 taps their blue (3) four times, one more than they have, at the same spot. Nothing slides under the finger: the
// fourth tap lands on a spent blue, not on the next colour, the eraser or the life total under the strip. The strip
// reflows once nobody has tapped it for a moment.
async function checkStripBurst(t, engine) {
  const cases = [
    { pool: [0, 3, 0, 0, 0, 0], after: '', what: 'an empty pool doesn’t uncover the life total' },
    { pool: [0, 3, 0, 2, 0, 0], after: 'R2 clear', what: 'the next colour doesn’t slide under the finger' },
    { pool: [2, 3, 0, 0, 0, 0], after: 'W2 clear', what: 'the eraser doesn’t slide under the finger' },
  ];
  for (const { pool, after, what } of cases) {
    const pools = [pool, ...Array(3).fill([0, 0, 0, 0, 0, 0])];
    const page = await openPage(t, engine, { clock: true, game: savedGame(4, { manaPool: true, pools }) });
    const blue = await tile(page, 1).locator('.strip-spend[data-colour="U"]').boundingBox();
    for (let tap = 0; tap < 4; tap++) await page.touchscreen.tap(blue.x + blue.width / 2, blue.y + blue.height / 2);
    const game = await saved(page);
    assert.deepEqual(game.pools[0], pool.map((amount, colour) => (colour === 1 ? 0 : amount)), `${what}: only blue is spent`);
    assert.equal(game.scores[0], 40, `${what}: no life is taken`);
    assert.deepEqual((await strips(page))[0], pool.map((amount, colour) => (colour === 1 ? 'U0' : amount ? `${'WUBRGC'[colour]}${amount}` : '')).filter(Boolean).concat('clear').join(' '),
      `${what}: the strip keeps its buttons in place while it's being tapped`);
    assert.equal(await tile(page, 1).locator('.strip-spend[data-colour="U"]').getAttribute('aria-disabled'), 'true', 'the spent colour says it can’t be spent');
    await page.clock.runFor(stripHoldTime - 1);
    assert.match((await strips(page))[0], /U0/, 'still in place just before the strip reflows');
    await page.clock.runFor(1);
    assert.equal((await strips(page))[0], after, `${what}: the strip reflows once the taps stop`);
    // Taps resume as normal once it has reflowed.
    await page.touchscreen.tap(blue.x + blue.width / 2, blue.y + blue.height / 2);
    await page.close();
  }
}

// D1: a double tap on the eraser clears the pool once: "Undo clear" takes the eraser's place, and the second tap
// doesn't undo the clear it just made.
async function checkEraserDoubleTap(t, engine) {
  const page = await openPage(t, engine, { clock: true, game: savedGame(4, { manaPool: true, pools: [[2, 0, 0, 0, 0, 0], ...Array(3).fill([0, 0, 0, 0, 0, 0])] }) });
  const eraser = await tile(page, 1).locator('.strip-clear').boundingBox();
  // "Undo clear" is wider than the eraser, so it lies under wherever the eraser was.
  for (let tap = 0; tap < 2; tap++) await page.touchscreen.tap(eraser.x + eraser.width / 2, eraser.y + eraser.height / 2);
  assert.deepEqual((await saved(page)).pools[0], [0, 0, 0, 0, 0, 0], 'the pool stays cleared');
  assert.equal((await strips(page))[0], 'undo');
  await page.clock.runFor(stripHoldTime);
  await tile(page, 1).locator('.strip-undo').tap();
  assert.deepEqual((await saved(page)).pools[0], [2, 0, 0, 0, 0, 0], 'a later tap on Undo clear still undoes it');
}

// D2: P1 has the turn and clears their pool, so "Undo clear" shows for 5 seconds. P1 presses Turn just before it ends
// and lifts just after: the end of "Undo clear" redraws P1's rows, and the turn still passes.
async function checkTurnSurvivesRedraw(t, engine) {
  const page = await openPage(t, engine, {
    clock: true, url: `${await appUrl()}?debug`,
    game: savedGame(4, { turns: 'turns', turn: { first: 0, active: 0, round: 1 }, manaPool: true, pools: [[2, 0, 0, 0, 0, 0], ...Array(3).fill([0, 0, 0, 0, 0, 0])] }),
  });
  await tile(page, 1).locator('.strip-clear').tap();
  await page.clock.runFor(undoClearTime - 50);
  const chip = tile(page, 1).locator('.active-chip');
  const before = await chip.elementHandle();
  const box = await chip.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(100);
  assert.equal((await strips(page))[0], '', '"Undo clear" ended during the press');
  assert.ok(await before.evaluate(node => node.isConnected), 'the chip is the same element after the redraw');
  await page.mouse.up();
  assert.equal((await debugGame(page)).turn.active, 1, 'the turn passed to P2');
  await page.clock.runFor(holdDelay);
  assert.equal((await debugGame(page)).turn.active, 1, 'and nothing stepped it back');
}

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

// ---- Keyboard focus through redraws (docs/review/ACCESSIBILITY.md M4) ------------------------------------------------

// Where focus is: 'P1 strip-undo', or the element's tag outside the tiles.
const focused = page => page.evaluate(() => {
  const node = /** @type {HTMLElement} */ (document.activeElement);
  const player = node.closest('.player');
  return player ? `P${[...player.parentElement.children].indexOf(player) + 1} ${node.classList[node.classList.length - 1]}` : node.id || node.tagName;
});

// A chip that stays through a redraw keeps focus. One that goes hands focus to a control nearby in the same tile: the
// next in its row, or another of the tile's badge controls, or its subtract button, never <body> or the pill.
async function checkFocusThroughRedraws(t, engine) {
  const page = await openPage(t, engine, {
    clock: true, url: `${await appUrl()}?debug`,
    game: savedGame(4, {
      turns: 'turns', turn: { first: 1, active: 0, round: 1 }, counters: { initiative: true }, initiative: 0,
      manaPool: true, pools: [[2, 1, 0, 0, 0, 0], ...Array(3).fill([0, 0, 0, 0, 0, 0])],
    }),
  });
  // On this short tile a reminder covers the near row, so focus on the turn chip moves to the reminder in its place,
  // and back to the turn chip when the reminder ends.
  await tile(page, 1).locator('.active-chip').focus();
  await page.evaluate(() => window.lifePodDebug.remind(0, 'initiative'));
  assert.equal(await tile(page, 1).getAttribute('data-reminder'), 'over');
  assert.equal(await focused(page), 'P1 reminder-chip', 'a reminder covering the focused turn chip takes focus');
  await page.clock.runFor(3000);
  assert.equal(await focused(page), 'P1 active-chip', 'a focused reminder that ends hands focus to the turn chip under it');
  // The turn chip keeps focus, as the same element, while another player's finger spends from the strip and redraws
  // the tile's rows.
  const chip = await tile(page, 1).locator('.active-chip').elementHandle();
  await page.evaluate(() => document.querySelector('.player:nth-child(1) .strip-spend[data-colour="W"]')
    .dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 5, isPrimary: true, bubbles: true })));
  assert.deepEqual((await saved(page)).pools[0], [1, 1, 0, 0, 0, 0]);
  assert.ok(await chip.evaluate(node => node === document.activeElement), 'the turn chip keeps focus through the redraw');

  // The eraser goes as it clears, and focus moves to "Undo clear", which takes its place in the strip.
  await tile(page, 1).locator('.strip-clear').focus();
  await page.keyboard.press('Enter');
  assert.equal(await focused(page), 'P1 strip-undo');
  // "Undo clear" runs out: focus moves to the next control on the tile, the turn chip.
  await page.clock.runFor(undoClearTime);
  assert.equal(await focused(page), 'P1 active-chip', '"Undo clear" running out hands focus to the turn chip');
}

// Spending the last mana from the keyboard: focus stays on the spent colour while the strip holds still, then moves to
// the tile's subtract button when the strip goes, not to the pill.
async function checkLastManaFocus(t, engine) {
  const page = await openPage(t, engine, { clock: true, game: savedGame(4, { manaPool: true, pools: [[0, 1, 0, 0, 0, 0], ...Array(3).fill([0, 0, 0, 0, 0, 0])] }) });
  await tile(page, 1).locator('.strip-spend[data-colour="U"]').focus();
  await page.keyboard.press('Enter');
  assert.deepEqual((await saved(page)).pools[0], [0, 0, 0, 0, 0, 0]);
  assert.equal(await focused(page), 'P1 strip-spend', 'focus stays on the spent colour while the strip holds still');
  await page.clock.runFor(stripHoldTime);
  assert.equal((await strips(page))[0], '');
  assert.equal(await focused(page), 'P1 subtract', 'the strip going hands focus to the tile, not the pill');
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: an extra tap on the mana strip spends nothing else and takes no life`, t => checkStripBurst(t, engine));
  test(`${name}: a double tap on the eraser doesn't undo the clear`, t => checkEraserDoubleTap(t, engine));
  test(`${name}: a Turn press survives its row redrawing`, t => checkTurnSurvivesRedraw(t, engine));
  test(`${name}: a hold stops when a dialog opens over it`, t => checkHoldUnderDialog(t, engine));
  test(`${name}: keyboard focus stays on chips that survive a redraw, and moves nearby from ones that go`, t => checkFocusThroughRedraws(t, engine));
  test(`${name}: spending the last mana from the keyboard keeps focus on the tile`, t => checkLastManaFocus(t, engine));
}
