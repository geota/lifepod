import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { chromium, webkit } from 'playwright-core';
import { app, button, seedGame, setSwitches, stripProblems } from './helpers.mjs';

// Floating mana (design/polish/SPEC.md §9): the Mana pool switch, mana mode, the strip at rest (spend, clear, undo
// clear) and emptying pools when the turn passes.

function savedGame(count, extra = {}) {
  return {
    startingLife: 40, scores: Array(count).fill(40), rotations: Array(count).fill(0), keepAwake: true, landscapeAngle: 90, ...extra,
  };
}

async function openPage(t, engine, { game, android = false, clock = false, viewport = { width: 952, height: 427 } } = {}) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ isMobile: true, hasTouch: true, viewport });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no script errors'));
  if (clock) await page.clock.install();
  if (android) {
    await page.addInitScript(() => {
      window.backHandling = [];
      window.LifePodAndroid = {
        readGame: () => sessionStorage.getItem('game'),
        writeGame: (game) => sessionStorage.setItem('game', game),
        keepAwake() {},
        haptic() {},
        setBackHandling: (enabled) => window.backHandling.push(enabled),
      };
    });
  }
  await page.goto(app);
  if (game) await seedGame(page, game, { android });
  return page;
}

async function eventually(read, expected, message, timeout = 3000) {
  const deadline = Date.now() + timeout;
  let value = await read();
  while (!isDeepStrictEqual(value, expected) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
    value = await read();
  }
  assert.deepEqual(value, expected, message);
}

const saved = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('game') ?? localStorage.getItem('lifepod-game')));
const mode = page => page.locator('#board').getAttribute('data-mode');
const tile = (page, number) => page.locator(`.player:nth-child(${number})`);
const cell = (page, number, colour) => tile(page, number).locator(`.mana-cell[data-colour="${colour}"]`);
const amount = (page, number, colour) => cell(page, number, colour).locator('b').textContent();
const isOpen = (page, id) => page.locator(`#${id}`).evaluate(dialog => dialog.open);
// Each tile's strip as it reads: 'R3 C1 clear', 'undo', or '' with no strip. The folded chip, which shows only where
// the strip can't fit, is left out.
const strips = page => page.locator('.mana-strip').evaluateAll(rows => rows.map(row => (row.hidden ? '' : [...row.children]
  .filter(item => !item.matches('.chip') && item.checkVisibility())
  .map(item => (item.matches('.strip-clear') ? 'clear' : item.matches('.strip-undo') ? 'undo' : `${item.dataset.colour}${item.textContent}`)).join(' '))));
// Whether each tile's near row shows anything.
const nearShown = page => page.locator('.badges.near').evaluateAll(rows => rows.map(row => !row.hidden && [...row.children].some(chip => chip.checkVisibility() && chip.offsetWidth > 0)));
const floating = page => page.locator('#mana-button').evaluate(node => node.hasAttribute('data-floating'));

// Mana mode: six circles per tile, W U B R G and colourless, each a mana symbol over its amount. Tap +1, hold −1, and
// Undo, ✓ and ✕ as in counters mode.
async function checkManaMode(t, engine) {
  const page = await openPage(t, engine);
  assert.ok(await page.locator('#mana-button').isHidden(), 'no mana button with Mana pool off');
  await setSwitches(page, { 'Mana pool': true });
  assert.ok(await button(page, 'Mana pool').isVisible(), 'Mana pool shows the tap symbol in the pill');
  assert.equal(await page.locator('#mana-button .mana-icon').getAttribute('data-glyph'), 'tap');
  assert.equal(await floating(page), false, 'no dot while every pool is empty');
  assert.equal((await saved(page)).manaPool, true, 'the switch saves at once');

  await button(page, 'Mana pool').tap();
  assert.equal(await mode(page), 'mana');
  assert.deepEqual(await tile(page, 1).locator('.mana-cell').evaluateAll(cells => cells.map(node => node.dataset.colour)), ['W', 'U', 'B', 'R', 'G', 'C']);
  assert.equal(await page.locator('.mana-cell').count(), 24);
  // Each colour's own mana symbol, in cost style. Colourless is Mana's \e904.
  assert.deepEqual(await tile(page, 1).locator('.mana-cell .pip').evaluateAll(pips => pips.map(pip => getComputedStyle(pip, '::before').content)),
    ['""', '""', '""', '""', '""', '""']);
  assert.equal(await cell(page, 1, 'C').evaluate(node => getComputedStyle(node).borderRadius), '50%', 'cells are circles');
  assert.ok(await button(page, 'Undo').isDisabled());

  // P1 adds W W U, P3 R R R C.
  for (const [number, colour] of [[1, 'W'], [1, 'W'], [1, 'U'], [3, 'R'], [3, 'R'], [3, 'R'], [3, 'C']]) await cell(page, number, colour).tap();
  assert.deepEqual([await amount(page, 1, 'W'), await amount(page, 1, 'U'), await amount(page, 3, 'R'), await amount(page, 3, 'C')], ['2', '1', '3', '1']);
  assert.equal(await cell(page, 3, 'R').getAttribute('aria-label'), 'Player 3 red mana, 3. Add one');
  // A hold takes one away; the hidden button does too.
  const box = await cell(page, 3, 'R').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(560);
  await page.mouse.up();
  assert.ok(Number(await amount(page, 3, 'R')) < 3, 'a hold takes red away');
  await page.getByRole('button', { name: 'Remove one colourless mana from Player 3', exact: true }).evaluate(remove => remove.click());
  assert.equal(await amount(page, 3, 'C'), '0');
  // Undo steps back, so P3 has its colourless again.
  await button(page, 'Undo').tap();
  assert.equal(await amount(page, 3, 'C'), '1');

  // ✕ asks, then Discard puts every pool back.
  await button(page, 'Cancel').tap();
  assert.ok(await isOpen(page, 'discard'));
  assert.equal(await page.locator('#discard-message').textContent(), 'Every mana pool goes back to how it was when you opened mana.');
  await button(page, 'Discard').tap();
  await eventually(() => mode(page), null);
  assert.deepEqual((await saved(page)).pools, Array(4).fill([0, 0, 0, 0, 0, 0]), 'the discard is saved');
  assert.deepEqual(await strips(page), ['', '', '', '']);

  // The check mark saves. Only tiles with mana show a strip, holding only the colours they have, and every near row
  // stays (design/polish/FINAL-REVIEW.md #3); the pill's tap symbol gets a dot.
  await setSwitches(page, { Poison: true, Commander: true });
  await button(page, 'Counters').tap();
  await tile(page, 2).locator('.counter-cell[data-kind="poison"]').tap();
  await tile(page, 3).locator('.counter-cell[data-kind="poison"]').tap();
  await button(page, 'Save').tap();
  await button(page, 'Mana pool').tap();
  for (const [number, colour] of [[1, 'W'], [1, 'W'], [1, 'U'], [3, 'R'], [3, 'R'], [3, 'R'], [3, 'C']]) await cell(page, number, colour).tap();
  await button(page, 'Save').tap();
  assert.equal(await mode(page), null);
  assert.deepEqual(await strips(page), ['W2 U1 clear', '', 'R3 C1 clear', '']);
  assert.deepEqual(await nearShown(page), [false, true, true, false], 'Player 3’s poison stays beside its strip');
  assert.equal(await floating(page), true, 'the pill’s tap symbol has a dot');
  assert.deepEqual((await saved(page)).pools, [[2, 1, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 3, 0, 1], [0, 0, 0, 0, 0, 0]]);
  // Every strip item is a 44px target inside its tile.
  const targets = await page.locator('.player').evaluateAll(players => players.flatMap((player, index) => {
    const bounds = player.getBoundingClientRect();
    return [...player.querySelectorAll('.mana-strip button')].filter(item => item.checkVisibility()).map((item) => {
      const box = item.getBoundingClientRect();
      const inside = box.left >= bounds.left - 0.5 && box.right <= bounds.right + 0.5 && box.top >= bounds.top - 0.5 && box.bottom <= bounds.bottom + 0.5;
      return box.width >= 43.5 && box.height >= 43.5 && inside ? '' : `P${index + 1} ${item.getAttribute('aria-label')} ${box.width}×${box.height}`;
    }).filter(Boolean);
  }));
  assert.deepEqual(targets, []);

  // Turning Mana pool off hides the strips and the button, and keeps the pools.
  await setSwitches(page, { 'Mana pool': false });
  assert.deepEqual(await strips(page), ['', '', '', '']);
  assert.deepEqual(await nearShown(page), [false, true, true, false]);
  assert.ok(await page.locator('#mana-button').isHidden());
  await setSwitches(page, { 'Mana pool': true });
  assert.deepEqual(await strips(page), ['W2 U1 clear', '', 'R3 C1 clear', '']);
}

// At rest: tap a symbol to spend one, and the strip shrinks as colours run out. The eraser clears the pool and leaves
// "Undo clear" for 5 seconds. Playwright's clock drives the 5 seconds.
async function checkStrip(t, engine) {
  const pools = [[2, 1, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 3, 0, 1], [0, 0, 0, 0, 0, 0]];
  const page = await openPage(t, engine, { clock: true, game: savedGame(4, { manaPool: true, pools, counters: { poison: true }, poison: [1, 1, 1, 1] }) });
  assert.deepEqual(await strips(page), ['W2 U1 clear', '', 'R3 C1 clear', '']);
  assert.equal(await tile(page, 1).locator('.strip-spend[data-colour="U"]').getAttribute('aria-label'), 'Player 1, 1 blue mana. Spend one');

  // Every near row stays while its pool has mana.
  assert.deepEqual(await nearShown(page), [true, true, true, true], 'every near row stays beside its strip');
  // Spending saves at once. A colour at 0 leaves the strip, and an empty pool hides it.
  await tile(page, 1).locator('.strip-spend[data-colour="U"]').tap();
  assert.deepEqual(await strips(page), ['W2 clear', '', 'R3 C1 clear', '']);
  assert.deepEqual((await saved(page)).pools[0], [2, 0, 0, 0, 0, 0]);
  await tile(page, 1).locator('.strip-spend[data-colour="W"]').tap();
  await tile(page, 1).locator('.strip-spend[data-colour="W"]').tap();
  assert.deepEqual(await strips(page), ['', '', 'R3 C1 clear', '']);
  assert.deepEqual(await nearShown(page), [true, true, true, true], 'the near rows stay as pools empty');
  assert.equal(await floating(page), true);

  // The eraser clears P3's pool and leaves "Undo clear"; a tap puts the pool back.
  await tile(page, 3).locator('.strip-clear').tap();
  assert.deepEqual(await strips(page), ['', '', 'undo', '']);
  assert.deepEqual((await saved(page)).pools[2], [0, 0, 0, 0, 0, 0], 'the clear saves at once');
  assert.equal(await floating(page), false, 'no dot once every pool is empty');
  await page.clock.runFor(4000);
  await tile(page, 3).locator('.strip-undo').tap();
  assert.deepEqual(await strips(page), ['', '', 'R3 C1 clear', '']);
  assert.deepEqual((await saved(page)).pools[2], [0, 0, 0, 3, 0, 1], 'Undo clear restores the pool');

  // "Undo clear" lasts 5 seconds, then the strip goes and the pool stays empty.
  await tile(page, 3).locator('.strip-clear').tap();
  await page.clock.runFor(4900);
  assert.deepEqual(await strips(page), ['', '', 'undo', ''], 'still there just before 5 seconds');
  await page.clock.runFor(200);
  assert.deepEqual(await strips(page), ['', '', '', ''], 'gone after 5 seconds');
  assert.deepEqual(await nearShown(page), [true, true, true, true]);
  assert.deepEqual((await saved(page)).pools[2], [0, 0, 0, 0, 0, 0]);
}

// Each round step or turn pass empties every pool when auto-empty is on (the default), and holding back that step
// restores what it emptied. With auto-empty off, pools survive a pass.
async function checkAutoEmpty(t, engine) {
  const pools = [[2, 1, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 3, 0, 1], [0, 0, 0, 0, 0, 0]];
  const page = await openPage(t, engine, { game: savedGame(4, { manaPool: true, pools, turns: 'turns', turn: { first: 0, active: 0, round: 1 } }) });
  // The active player's turn chip stays in their near row beside the strip, since it never gives way.
  assert.equal(await tile(page, 1).locator('.badges.near .turn-chip.active-chip').count(), 1, 'the turn chip stays in the near row');
  assert.ok(await tile(page, 1).locator('.badges.near .turn-chip.active-chip').isVisible(), 'and shows');
  assert.equal(await page.locator('.mana-strip .turn-chip').count(), 0, 'no turn chip moves into a strip');
  await tile(page, 1).locator('.turn-chip').tap();
  assert.deepEqual(await strips(page), ['', '', '', ''], 'a pass empties every pool');
  assert.deepEqual((await saved(page)).pools, Array(4).fill([0, 0, 0, 0, 0, 0]));
  assert.equal(await floating(page), false);
  // Mana added after the pass stays when the step is held back, and the emptied pools come back on top.
  await button(page, 'Mana pool').tap();
  await cell(page, 2, 'G').tap();
  await cell(page, 3, 'R').tap();
  await button(page, 'Save').tap();
  const box = await page.locator('#round-button').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  assert.deepEqual((await saved(page)).turn, { first: 0, active: 0, round: 1 }, 'the hold steps back to P1');
  assert.deepEqual((await saved(page)).pools, [[2, 1, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0], [0, 0, 0, 4, 0, 1], [0, 0, 0, 0, 0, 0]], 'and restores what the pass emptied');
  assert.deepEqual(await strips(page), ['W2 U1 clear', 'G1 clear', 'R4 C1 clear', '']);

  // A pass also ends any "Undo clear": the pool would have emptied anyway.
  await tile(page, 3).locator('.strip-clear').tap();
  assert.deepEqual(await strips(page), ['W2 U1 clear', 'G1 clear', 'undo', '']);
  await page.locator('#round-button').tap();
  assert.deepEqual(await strips(page), ['', '', '', '']);
  await page.locator('#round-button').tap();
  await page.locator('#round-button').tap();
  assert.equal((await saved(page)).turn.active, 2, 'P3’s turn');

  // Auto-empty shows only while Mana pool is on and Turns isn't Off. Off, pools survive a pass.
  await button(page, 'Settings').tap();
  const autoEmpty = page.getByRole('switch', { name: 'Empty mana pools when the turn passes', exact: true });
  assert.equal(await autoEmpty.isChecked(), true, 'on by default');
  await page.locator('#auto-empty-row').tap();
  assert.equal((await saved(page)).autoEmpty, false, 'the switch saves at once');
  await page.locator('#turn-choices').getByRole('button', { name: 'Off', exact: true }).tap();
  assert.ok(await page.locator('#auto-empty-row').isHidden(), 'hidden with Turns off');
  await page.locator('#turn-choices').getByRole('button', { name: 'Rounds', exact: true }).tap();
  assert.ok(await page.locator('#auto-empty-row').isVisible());
  await page.locator('#settings label', { has: page.getByRole('switch', { name: 'Mana pool', exact: true }) }).tap();
  assert.ok(await page.locator('#auto-empty-row').isHidden(), 'hidden with Mana pool off');
  await page.locator('#settings label', { has: page.getByRole('switch', { name: 'Mana pool', exact: true }) }).tap();
  await button(page, 'Close settings').tap();
  await button(page, 'Mana pool').tap();
  await cell(page, 4, 'B').tap();
  await button(page, 'Save').tap();
  await page.locator('#round-button').tap();
  assert.deepEqual(await strips(page), ['', '', '', 'B1 clear'], 'with auto-empty off, pools survive a round step');

  // Rounds steps empty pools too, with auto-empty on again.
  await button(page, 'Settings').tap();
  await page.locator('#auto-empty-row').tap();
  await button(page, 'Close settings').tap();
  await tile(page, 1).locator('.round-chip').tap();
  assert.deepEqual(await strips(page), ['', '', '', ''], 'a round step empties every pool');
  await page.waitForTimeout(400);
  const before = (await saved(page)).turn.round;
  const flag = await tile(page, 1).locator('.round-chip').boundingBox();
  await page.mouse.move(flag.x + flag.width / 2, flag.y + flag.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  assert.equal((await saved(page)).turn.round, before - 1);
  assert.deepEqual(await strips(page), ['', '', '', 'B1 clear'], 'holding back the round restores the pool');

  // A new game empties every pool and keeps the settings.
  await button(page, 'Settings').tap();
  await button(page, 'New game').tap();
  await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  await eventually(() => mode(page), 'first');
  await button(page, 'Skip').tap();
  const fresh = await saved(page);
  assert.deepEqual([fresh.pools, fresh.manaPool, fresh.autoEmpty, fresh.turns], [Array(4).fill([0, 0, 0, 0, 0, 0]), true, true, 'rounds']);
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: mana mode adds mana with undo, save and discard`, { timeout: 90000 }, t => checkManaMode(t, engine));
  test(`${name}: the mana strip spends, clears and undoes a clear for 5 seconds`, { timeout: 60000 }, t => checkStrip(t, engine));
  test(`${name}: passing the turn empties pools, and stepping back restores them`, { timeout: 90000 }, t => checkAutoEmpty(t, engine));
}

test('chromium: mana mode fits six players on the smallest phone', async (t) => {
  const pools = Array.from({ length: 6 }, () => [1, 2, 3, 4, 5, 6]);
  const page = await openPage(t, chromium, { viewport: { width: 568, height: 320 }, game: savedGame(6, { manaPool: true, pools }) });
  const problems = () => page.evaluate(() => {
    const controls = document.querySelector('#board-controls').getBoundingClientRect();
    const pill = { left: controls.left + 6, right: controls.right - 6, top: controls.top + 6, bottom: controls.bottom - 6 };
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return [...document.querySelectorAll('.player')].flatMap((player, index) => {
      const bounds = player.getBoundingClientRect();
      return [...player.querySelectorAll('.mode-layer .mana-cell, .mana-strip button')].filter(node => node.offsetWidth).map((target) => {
        const box = target.getBoundingClientRect();
        const issues = [];
        // A folded strip's chip is a target through its 64 × 44 touch area, like the turn chip.
        const touch = getComputedStyle(target, '::after');
        const size = target.matches('.chip') ? [parseFloat(touch.width), parseFloat(touch.height)] : [box.width, box.height];
        if (Math.min(...size) < 43.5) issues.push(`${Math.round(size[0])}×${Math.round(size[1])}`);
        if (box.left < bounds.left - 0.5 || box.right > bounds.right + 0.5 || box.top < bounds.top - 0.5 || box.bottom > bounds.bottom + 0.5) issues.push('outside its tile');
        if (overlaps(box, pill)) issues.push('under the centre controls');
        return issues.length ? `P${index + 1} ${target.getAttribute('aria-label')}: ${issues.join(', ')}` : '';
      }).filter(Boolean);
    });
  });
  // Every colour held: each strip folds into its chip, which stays inside the tile.
  assert.deepEqual(await problems(), [], 'the strips fit');
  await button(page, 'Mana pool').tap();
  assert.equal(await page.locator('.mana-cell').count(), 36);
  assert.deepEqual(await problems(), [], 'the mana cells fit');
});

// The strip never covers a life total, its − and + glyphs or the near row, and the near row and its counts always show
// (design/polish/FINAL-REVIEW.md #3). With three or all six colours on every tile, with and without the active player's
// turn chip, on the target, the smallest real phone and the stress size: a strip sits on its own line above the near
// row, or at the end of the near row's line, and one that can't fit either folds into a chip with a caret that opens
// mana mode, on its own line or at the end of the near row. The turn chip never leaves the near row.
async function checkStripClear(t, engine) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const three = [0, 2, 0, 3, 0, 1];
  const six = [2, 1, 3, 4, 5, 6];
  for (const [width, height] of [[952, 427], [640, 360], [568, 320]]) {
    for (const count of [4, 6]) {
      for (const [colours, pool] of [['three colours', three], ['six colours', six]]) {
        for (const turn of [false, true]) {
          const view = `${width} × ${height}, ${count} players, ${colours}${turn ? ', turn chip' : ''}`;
          const page = await browser.newPage({ isMobile: true, hasTouch: true, viewport: { width, height } });
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          const game = savedGame(count, {
            manaPool: true, pools: Array(count).fill(pool), counters: { commander: true, poison: true }, poison: Array(count).fill(9),
            ...(turn ? { turns: 'turns', turn: { first: 0, active: 0, round: 12 } } : {}),
          });
          await page.addInitScript(saved => localStorage.setItem('lifepod-game', saved), JSON.stringify(game));
          await page.goto(app);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(100);
          assert.deepEqual(await stripProblems(page), [], `${view}: every strip is clear of the totals, glyphs and near rows`);
          const state = await page.evaluate(() => {
            const shown = node => node.checkVisibility() && node.offsetWidth > 0;
            const players = [...document.querySelectorAll('.player')];
            return {
              places: players.map(player => player.dataset.strip ?? ''),
              // A strip shows its spend buttons, or its folded chip shows.
              shown: players.filter(player => [...player.querySelectorAll('.mana-strip .strip-spend, .strip-chip')].some(shown)).length,
              poison: players.filter(player => [...player.querySelectorAll('.badges.near .chip[data-kind="poison"]')].some(shown)).length,
              turnChip: [...document.querySelectorAll('.badges.near .turn-chip')].some(shown),
              chips: [...document.querySelectorAll('.strip-chip')].filter(shown).map(chip => ({
                caret: Boolean(chip.querySelector('.icon[data-icon="caret-right"]')), label: chip.getAttribute('aria-label'),
              })),
            };
          });
          assert.equal(state.shown, count, `${view}: every tile with mana shows its strip or its folded chip (${state.places})`);
          assert.equal(state.poison, count, `${view}: every near row keeps its poison count`);
          if (turn) assert.ok(state.turnChip, `${view}: the turn chip stays in the near row`);
          const folded = state.places.filter(place => place.startsWith('fold')).length;
          assert.equal(state.chips.length, folded, `${view}: each folded strip shows its chip`);
          for (const chip of state.chips) {
            assert.ok(chip.caret, `${view}: a folded chip has a caret`);
            assert.match(chip.label, /^Player \d, mana pool .+\. Open mana$/);
          }
          if (folded) {
            await page.locator('.strip-chip').filter({ visible: true }).first().tap();
            assert.equal(await mode(page), 'mana', `${view}: a folded strip opens mana mode`);
          }
          // On the target, a strip beside a near row of just the poison count never folds, with three colours at 4 or 6
          // players or six colours at 4. Only the active tile, whose near row also has the turn chip and the flag, may run
          // out of room for its 44px targets.
          if (width === 952 && (colours === 'three colours' || count === 4)) {
            const folds = state.places.flatMap((place, index) => (place.startsWith('fold') && !(turn && index === 0) ? [`P${index + 1}`] : []));
            assert.deepEqual(folds, [], `${view}: on the target only the tile with the turn chip may fold`);
          }
          assert.deepEqual(errors, [], `${view}: no script errors`);
          await page.close();
        }
      }
    }
  }
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: the mana strip never covers a life total or its glyphs`, { timeout: 120000 }, t => checkStripClear(t, engine));
}

test('chromium: Android back cancels mana mode the way ✕ does', async (t) => {
  const page = await openPage(t, chromium, { android: true, game: savedGame(4, { manaPool: true }) });
  const back = () => page.evaluate(() => window.closeOpenDialog());
  await button(page, 'Mana pool').tap();
  assert.equal(await page.evaluate(() => window.backHandling.at(-1)), true);
  assert.equal(await back(), true);
  assert.equal(await mode(page), null, 'back with no changes closes the mode');
  await button(page, 'Mana pool').tap();
  await cell(page, 2, 'G').tap();
  assert.equal(await back(), true);
  assert.ok(await isOpen(page, 'discard'), 'back with changes asks first');
  assert.equal(await back(), true);
  assert.equal(await mode(page), 'mana', 'back again keeps editing');
  await back();
  await button(page, 'Discard').tap();
  await eventually(() => mode(page), null);
  assert.deepEqual((await saved(page)).pools[1], [0, 0, 0, 0, 0, 0], 'the discard is saved');
  assert.equal(await page.evaluate(() => window.backHandling.at(-1)), false);
});

test('chromium: saved pools are checked when a game loads', async (t) => {
  const page = await openPage(t, chromium);
  const load = async (game) => {
    await page.evaluate(next => localStorage.setItem('lifepod-game', JSON.stringify(next)), game);
    await page.reload();
    return { strips: await strips(page), button: await page.locator('#mana-button').isVisible() };
  };
  const base = savedGame(4);
  assert.deepEqual(await load(base), { strips: ['', '', '', ''], button: false }, 'an old save loads with Mana pool off');
  assert.deepEqual(await load({ ...base, manaPool: 'yes', pools: [[1, 0, 0, 0, 0, 0]] }), { strips: ['', '', '', ''], button: false },
    'only a true switch is on');
  assert.deepEqual(await load({ ...base, manaPool: true, pools: [[1, -1, 2.5, 100, 'x', 99], 'pool', [0, 0, 0, 0, 0, 3, 7], null] }),
    { strips: ['W1 C99 clear', '', 'C3 clear', ''], button: true }, 'bad amounts are 0, and each pool has six colours');
  // Auto-empty is on unless saved as false.
  await page.evaluate(() => localStorage.setItem('lifepod-game', JSON.stringify({ startingLife: 40, scores: [40, 40], manaPool: true, turns: 'rounds', autoEmpty: 0 })));
  await page.reload();
  await button(page, 'Settings').tap();
  assert.equal(await page.getByRole('switch', { name: 'Empty mana pools when the turn passes', exact: true }).isChecked(), true);
});
