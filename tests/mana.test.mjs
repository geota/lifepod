import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import {
  backHandling, button, engines, eventually, faceBoxes, hold, openPage, saved, savedGame, seedGame, setSwitches, stripProblems, test, tileProblems,
} from './helpers.mjs';

// Floating mana (design/polish/SPEC.md §9): the Mana pool switch, mana mode, the strip at rest (spend, clear, undo
// clear) and emptying pools when the turn passes.

// Timers in web/js/logic/data.js. A mana cell held for holdDelay takes one away, then one more every 100ms; a turn chip
// or the round button held for holdDelay steps back once. "Undo clear" lasts undoClearTime. A strip keeps its buttons in
// place for stripHoldTime after its last tap, then reflows (tests/presses.test.mjs). Tests that tap or hold
// these pause the page's clock, so a tap can't become a hold and each happens only when the test runs the clock.
const holdDelay = 500;
const undoClearTime = 5000;
const stripHoldTime = 800;

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
  const page = await openPage(t, engine, { clock: true });
  assert.ok(await page.locator('#mana-button').isHidden(), 'no mana button with Mana pool off');
  await setSwitches(page, { 'Mana pool': true });
  assert.ok(await button(page, 'Mana pool').isVisible(), 'Mana pool shows the tap symbol in the pill');
  assert.equal(await page.locator('#mana-button .mana-icon').getAttribute('data-glyph'), 'tap');
  assert.equal(await floating(page), false, 'no dot while every pool is empty');
  assert.equal((await saved(page)).manaPool, true, 'the switch saves at once');

  await page.locator('#mana-button').tap();
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
  // A hold takes one away; the hidden button does too. A 560ms hold takes one at 500ms and stops before the next.
  await hold(page, cell(page, 3, 'R'), holdDelay + 60);
  assert.equal(await amount(page, 3, 'R'), '2', 'a hold takes red away');
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
  await page.locator('#mana-button').tap();
  for (const [number, colour] of [[1, 'W'], [1, 'W'], [1, 'U'], [3, 'R'], [3, 'R'], [3, 'R'], [3, 'C']]) await cell(page, number, colour).tap();
  await button(page, 'Save').tap();
  assert.equal(await mode(page), null);
  assert.deepEqual(await strips(page), ['W2 U1 clear', '', 'R3 C1 clear', '']);
  assert.deepEqual(await nearShown(page), [false, true, true, false], 'Player 3’s poison stays beside its strip');
  assert.equal(await floating(page), true, 'the pill’s tap symbol has a dot');
  assert.deepEqual((await saved(page)).pools, [[2, 1, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 3, 0, 1], [0, 0, 0, 0, 0, 0]]);
  // Every strip item is a 44px target inside its tile, clear of the pill.
  assert.deepEqual(await tileProblems(page, { targets: '.mana-strip button' }), []);

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
  // Spending saves at once. A colour at 0 leaves the strip once the taps stop, and an empty pool hides it.
  await tile(page, 1).locator('.strip-spend[data-colour="U"]').tap();
  assert.deepEqual(await strips(page), ['W2 U0 clear', '', 'R3 C1 clear', '']);
  await page.clock.runFor(stripHoldTime);
  assert.deepEqual(await strips(page), ['W2 clear', '', 'R3 C1 clear', '']);
  assert.deepEqual((await saved(page)).pools[0], [2, 0, 0, 0, 0, 0]);
  await tile(page, 1).locator('.strip-spend[data-colour="W"]').tap();
  await tile(page, 1).locator('.strip-spend[data-colour="W"]').tap();
  await page.clock.runFor(stripHoldTime);
  assert.deepEqual(await strips(page), ['', '', 'R3 C1 clear', '']);
  assert.deepEqual(await nearShown(page), [true, true, true, true], 'the near rows stay as pools empty');
  assert.equal(await floating(page), true);

  // The eraser clears P3's pool and leaves "Undo clear"; a tap puts the pool back.
  await tile(page, 3).locator('.strip-clear').tap();
  assert.deepEqual(await strips(page), ['', '', 'undo', '']);
  assert.deepEqual((await saved(page)).pools[2], [0, 0, 0, 0, 0, 0], 'the clear saves at once');
  assert.equal(await floating(page), false, 'no dot once every pool is empty');
  // A second before it ends.
  await page.clock.runFor(undoClearTime - 1000);
  await tile(page, 3).locator('.strip-undo').tap();
  assert.deepEqual(await strips(page), ['', '', 'R3 C1 clear', '']);
  assert.deepEqual((await saved(page)).pools[2], [0, 0, 0, 3, 0, 1], 'Undo clear restores the pool');

  // "Undo clear" lasts 5 seconds, then the strip goes and the pool stays empty.
  await tile(page, 3).locator('.strip-clear').tap();
  await page.clock.runFor(undoClearTime - 1);
  assert.deepEqual(await strips(page), ['', '', 'undo', ''], 'still there just before 5 seconds');
  await page.clock.runFor(1);
  assert.deepEqual(await strips(page), ['', '', '', ''], 'gone after 5 seconds');
  assert.deepEqual(await nearShown(page), [true, true, true, true]);
  assert.deepEqual((await saved(page)).pools[2], [0, 0, 0, 0, 0, 0]);
}

// Each round step or turn pass empties every pool when auto-empty is on (the default), and holding back that step
// restores what it emptied. With auto-empty off, pools survive a pass.
async function checkAutoEmpty(t, engine) {
  const pools = [[2, 1, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 3, 0, 1], [0, 0, 0, 0, 0, 0]];
  const page = await openPage(t, engine, { clock: true, game: savedGame(4, { manaPool: true, pools, turns: 'turns', turn: { first: 0, active: 0, round: 1 } }) });
  // The active player's turn chip stays in their near row beside the strip, since it never gives way.
  assert.equal(await tile(page, 1).locator('.badges.near .turn-chip.active-chip').count(), 1, 'the turn chip stays in the near row');
  assert.ok(await tile(page, 1).locator('.badges.near .turn-chip.active-chip').isVisible(), 'and shows');
  assert.equal(await page.locator('.mana-strip .turn-chip').count(), 0, 'no turn chip moves into a strip');
  await tile(page, 1).locator('.turn-chip').tap();
  assert.deepEqual(await strips(page), ['', '', '', ''], 'a pass empties every pool');
  assert.deepEqual((await saved(page)).pools, Array(4).fill([0, 0, 0, 0, 0, 0]));
  assert.equal(await floating(page), false);
  // Mana added after the pass stays when the step is held back, and the emptied pools come back on top.
  await page.locator('#mana-button').tap();
  await cell(page, 2, 'G').tap();
  await cell(page, 3, 'R').tap();
  await button(page, 'Save').tap();
  await hold(page, page.locator('#round-button'), holdDelay);
  assert.deepEqual((await saved(page)).turn, { first: 0, active: 0, round: 1 }, 'the hold steps back to P1');
  assert.deepEqual((await saved(page)).pools, [[2, 1, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0], [0, 0, 0, 4, 0, 1], [0, 0, 0, 0, 0, 0]], 'and restores what the pass emptied');
  assert.deepEqual(await strips(page), ['W2 U1 clear', 'G1 clear', 'R4 C1 clear', '']);

  // A pass also ends any "Undo clear": the pool would have emptied anyway.
  await tile(page, 3).locator('.strip-clear').tap();
  assert.deepEqual(await strips(page), ['W2 U1 clear', 'G1 clear', 'undo', '']);
  await page.locator('#round-button').tap();
  assert.deepEqual(await strips(page), ['', '', 'clear', ''], 'P3’s strip keeps its place while it’s being tapped');
  await page.clock.runFor(stripHoldTime);
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
  await page.locator('#mana-button').tap();
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
  const before = (await saved(page)).turn.round;
  await hold(page, tile(page, 1).locator('.round-chip'), holdDelay);
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

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: mana mode adds mana with undo, save and discard`, t => checkManaMode(t, engine));
  test(`${name}: the mana strip spends, clears and undoes a clear for 5 seconds`, t => checkStrip(t, engine));
  test(`${name}: passing the turn empties pools, and stepping back restores them`, t => checkAutoEmpty(t, engine));
}

test('chromium: mana mode fits six players on the smallest phone', async (t) => {
  const pools = Array.from({ length: 6 }, () => [1, 2, 3, 4, 5, 6]);
  const page = await openPage(t, chromium, { viewport: { width: 568, height: 320 }, game: savedGame(6, { manaPool: true, pools }) });
  // A folded strip's chip is a target through its 64 × 44 touch area, like the turn chip.
  const problems = () => tileProblems(page, { targets: '.mode-layer .mana-cell, .mana-strip button' });
  // Every colour held: each strip folds into its chip, which stays inside the tile.
  assert.deepEqual(await problems(), [], 'the strips fit');
  await page.locator('#mana-button').tap();
  assert.equal(await page.locator('.mana-cell').count(), 36);
  assert.deepEqual(await problems(), [], 'the mana cells fit');
});

// Each tile's mana as it sits, in its face's own coordinates (faceBoxes): its place, its total's size and its size
// before any fit shrank it, the commander damage row, the strip's spend buttons and folded chip, the chip under the far
// row or at the end of the near row, the near row's other chips, and the total.
function manaFaces(page) {
  return Promise.all([
    page.locator('.player').evaluateAll(players => players.map((player) => {
      const score = player.querySelector('.score');
      const controls = score.parentElement;
      const fitted = controls.style.getPropertyValue('--score-size');
      controls.style.removeProperty('--score-size');
      const natural = parseFloat(getComputedStyle(score).fontSize);
      if (fitted) controls.style.setProperty('--score-size', fitted);
      return { place: player.dataset.strip ?? '', total: parseFloat(getComputedStyle(score).fontSize), natural };
    })),
    faceBoxes(page, {
      far: '.badges.far > .chip', strip: '.mana-strip > button:not(.chip)', folded: '.mana-strip > .strip-chip', farChip: '.mana-far > .strip-chip',
      nearChip: '.badges.near > .strip-chip', near: '.badges.near > :not(.strip-chip)', score: '.score',
    }),
    // Every chip of each row, one box apiece, so a check can see what shares a line with what.
    page.locator('.player').evaluateAll(players => players.map(player => ['.badges.near > :not(.strip-chip)', '.badges.far > *'].map(selector => [...player.querySelectorAll(selector)]
      .filter(chip => chip.checkVisibility() && chip.offsetWidth).map((chip) => {
        let top = 0;
        for (let node = chip; node && !node.matches('.player-face'); node = node.offsetParent) top += node.offsetTop;
        return { top, bottom: top + chip.offsetHeight };
      })))),
  ]);
}

// Each mana target and part, for tileProblems: a whole 44px target inside its tile and clear of the pill.
const manaTargets = '.mana-strip button:not(.chip), .strip-chip';

// A busy board with mana floating on every tile: Turn by turn with P1's turn chip, the identity chip with its name,
// poison, tax and energy, the monarch on P2, and commander damage from every opponent.
function busyManaGame(count, pool, extra = {}) {
  const zero = Array(count).fill(0);
  return savedGame(count, {
    scores: [31, 24, 27, 38, 19, 35].slice(0, count), counters: { commander: true, poison: true, energy: true, monarch: true },
    poison: zero.map((_, i) => (i % 2 ? 3 : 7)), casts: zero.map(() => 2), energy: zero.map((_, i) => i + 1),
    identities: ['WUB', 'UG', 'RW', 'BRG', 'WUBRG', 'BG'].slice(0, count),
    identity: { show: { indicator: true, symbol: false, name: true }, background: 'symbol' },
    turns: 'turns', turn: { first: 0, active: 0, round: 6 }, monarch: 1,
    commanderDamage: Array.from({ length: count }, (_, defender) => Array.from({ length: count }, (_, attacker) => (defender === attacker ? 0 : [16, 12, 8, 5, 3, 1][attacker]))),
    manaPool: true, pools: Array(count).fill(pool), ...extra,
  });
}

// The owner's rules for floating mana (design/polish/SPEC.md §9), on one board: mana has a row of its own, directly
// above the near row, and never shares a line with another badge; commander damage owns the far row, centred; every
// mana target is a whole 44px; the strip's pips are never shrunk; and every total is clear of every row and the mana,
// the same size on every tile and never below two thirds of its own size. `places` lists the places a tile may take.
async function checkManaBoard(page, view, places = ['row', 'fold']) {
  assert.deepEqual(await stripProblems(page), [], `${view}: every strip is clear of the totals, glyphs and rows, and every spend button a whole 44px target`);
  assert.deepEqual(await tileProblems(page, { targets: manaTargets }), [], `${view}: every mana target is a whole 44px target inside its tile, clear of the pill`);
  const [tiles, faces, chips] = await manaFaces(page);
  assert.equal(new Set(tiles.map(tile => tile.total)).size, 1, `${view}: every total is the same size (${tiles.map(tile => tile.total)})`);
  faces.forEach((face, index) => {
    const { place, total, natural } = tiles[index];
    const seat = `${view}, P${index + 1} (${place})`;
    assert.ok(places.includes(place), `${seat}: takes one of ${places.join(', ')}`);
    const mana = [face.strip, face.folded, face.farChip, face.nearChip].filter(Boolean);
    assert.equal(mana.length, 1, `${seat}: shows its strip or one folded chip`);
    const [box] = mana;
    // Never on a line with another badge: no chip of either row shares any of its height.
    const [nearChips, farChips] = chips[index];
    if (place !== 'near') {
      for (const chip of [...nearChips, ...farChips]) assert.ok(chip.bottom <= box.top + 0.5 || chip.top >= box.bottom - 0.5, `${seat}: mana shares no line with a badge (${chip.top}–${chip.bottom} against ${box.top}–${box.bottom})`);
    }
    if (place === 'row' || place === 'fold') {
      assert.ok(face.near && box.bottom <= face.near.top + 0.5 && face.near.top - box.bottom <= 3, `${seat}: mana sits directly above the near row (${box.bottom} against ${face.near?.top})`);
    }
    if (place === 'far') assert.ok(face.far && box.top >= face.far.bottom - 0.5 && box.top - face.far.bottom <= 3, `${seat}: a chip under the far row sits just under it`);
    // Commander damage owns the far row: nothing on its line, and the row centred in the room the pill leaves.
    assert.ok(box.top >= face.far.bottom - 0.5, `${seat}: mana sits below the commander damage row`);
    const off = (face.far.left + face.far.right) / 2 - (face.room.left + face.room.right) / 2;
    assert.ok(Math.abs(off) <= 1.5, `${seat}: the commander damage row is centred, not pushed aside (${off.toFixed(1)}px)`);
    // The total is clear of both rows and the mana, and never below its floor.
    for (const [name, part] of Object.entries({ far: face.far, near: face.near, mana: box })) {
      if (part) assert.ok(part.bottom <= face.score.top + 0.5 || part.top >= face.score.bottom - 0.5, `${seat}: the total is clear of the ${name} ${name === 'mana' ? '' : 'row'} (${part.top}–${part.bottom} against ${face.score.top}–${face.score.bottom})`);
    }
    assert.ok(total >= natural * 2 / 3 - 0.1 && total <= natural + 0.01, `${seat}: the total is ${total}px, no less than two thirds of its ${natural}px`);
  });
  // Pips are never shrunk: a strip's spend buttons keep the strip's full type, and a folded chip the row's full type.
  // (The last resort's chip at the end of the near row gives way with that row, as every chip there does.)
  const pips = await page.locator('.mana-strip .pip, .mana-strip .strip-chip .pip, .mana-far .strip-chip .pip').evaluateAll(nodes => nodes.filter(pip => pip.checkVisibility())
    .map(pip => ({ width: pip.getBoundingClientRect().width, chip: Boolean(pip.closest('.strip-chip')), strip: getComputedStyle(pip.closest('.mana-strip, .mana-far, .badges')).fontSize })));
  for (const pip of pips) {
    if (pip.chip) assert.ok(pip.width >= 14.3, `${view}: a folded chip's pip is at least 14.3px (${pip.width.toFixed(1)}px)`);
    else {
      assert.ok(pip.width >= 18.5, `${view}: a strip's pip is at least 18.5px (${pip.width.toFixed(1)}px)`);
      assert.ok(parseFloat(pip.strip) >= 15, `${view}: a strip's type is never shrunk below 15px (${pip.strip})`);
    }
  }
}

// The rules across both styles, every size the design sweep checks (design/polish/final-review.mjs), 3 to 6 players
// and one, three and all six colours, on a busy board: every tile's mana takes a row of its own above the near row.
const sweepSizes = [[952, 427], [852, 393], [640, 360], [568, 320], [375, 667], [320, 568], [841, 701], [1366, 1024]];
async function checkManaRows(t, engine) {
  const pools = { one: [0, 4, 0, 0, 0, 0], three: [2, 0, 3, 0, 1, 0], six: [2, 3, 1, 4, 2, 1] };
  for (const [width, height] of sweepSizes) {
    const page = await openPage(t, engine, { viewport: { width, height }, orientation: width > height ? 90 : 0, mobile: width < 1000 });
    for (const style of ['material', 'glass']) {
      for (const count of [3, 4, 5, 6]) {
        for (const [colours, pool] of Object.entries(pools)) {
          await seedGame(page, busyManaGame(count, pool, { style }));
          await checkManaBoard(page, `${style}, ${width} × ${height}, ${count} players, ${colours}`);
        }
      }
    }
    await page.close();
  }
}

// Where even the totals at their floor can't make room for a row of its own, the chip sits under the far row (a
// Larger Badge size on an 852 × 393 phone at 4 players), and where even that can't fit, it ends the near row, the last
// resort: every counter on, the monarch, the initiative and the turn chip at 5 or 6 players on 568 × 320.
async function checkManaFallbacks(t, engine) {
  const page = await openPage(t, engine, { viewport: { width: 852, height: 393 } });
  await seedGame(page, busyManaGame(4, [2, 3, 1, 4, 2, 1], { badgeSize: 'larger' }));
  await checkManaBoard(page, '852 × 393, 4 players, Larger badges', ['far']);
  await page.locator('.mana-far .strip-chip').filter({ visible: true }).first().tap();
  assert.equal(await mode(page), 'mana', 'the chip under the far row opens mana mode');
  await page.setViewportSize({ width: 568, height: 320 });
  for (const count of [5, 6]) {
    await seedGame(page, busyManaGame(count, [1, 0, 2, 3, 0, 1], {
      counters: { commander: true, poison: true, energy: true, experience: true, rad: true, monarch: true, initiative: true },
      experience: Array(count).fill(10), rad: Array(count).fill(14), initiative: 0,
    }));
    await checkManaBoard(page, `568 × 320, ${count} players, every counter`, ['near', 'row']);
  }
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: mana has a row of its own above the near row, and the totals make room for it`, { timeout: 600000 }, t => checkManaRows(t, engine));
  test(`${name}: where a tile can't make room for its mana row, the chip goes under the far row, then ends the near row`, t => checkManaFallbacks(t, engine));
}

// The strip never covers a life total, its − and + glyphs, the far row, the near row or the pill, and both rows and
// their counts always show (design/polish/SPEC.md §9). With three or all six colours on every tile, with and without the
// active player's turn chip, on the target, the smallest real phone and the stress size: a strip sits on its own row
// above the near row, and one that can't fit there folds into a chip with a caret that opens mana mode, on that row (or,
// where there's no room for it, under the far row or at the end of the near row). The turn chip never leaves the near
// row.
async function checkStripClear(t, engine) {
  const three = [0, 2, 0, 3, 0, 1];
  const six = [2, 1, 3, 4, 5, 6];
  for (const [width, height] of [[952, 427], [640, 360], [568, 320]]) {
    for (const count of [4, 6]) {
      for (const [colours, pool] of [['three colours', three], ['six colours', six]]) {
        for (const turn of [false, true]) {
          const view = `${width} × ${height}, ${count} players, ${colours}${turn ? ', turn chip' : ''}`;
          const game = savedGame(count, {
            manaPool: true, pools: Array(count).fill(pool), counters: { commander: true, poison: true }, poison: Array(count).fill(9),
            ...(turn ? { turns: 'turns', turn: { first: 0, active: 0, round: 12 } } : {}),
          });
          const page = await openPage(t, engine, { viewport: { width, height }, game });
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
          const folded = state.places.filter(place => place !== 'row').length;
          assert.equal(state.chips.length, folded, `${view}: each folded strip shows its chip`);
          for (const chip of state.chips) {
            assert.ok(chip.caret, `${view}: a folded chip has a caret`);
            assert.match(chip.label, /^\d+ mana\. Player \d's pool: .+\. Open mana$/);
          }
          assert.deepEqual(await tileProblems(page, { targets: '.strip-chip' }), [], `${view}: a folded chip is a whole 64 × 44 target inside its tile`);
          if (folded) {
            await page.locator('.strip-chip').filter({ visible: true }).first().tap();
            assert.equal(await mode(page), 'mana', `${view}: a folded strip opens mana mode`);
          }
          await page.close();
        }
      }
    }
  }
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: the mana strip never covers a life total or its glyphs`, t => checkStripClear(t, engine));
}

test('chromium: Android back cancels mana mode the way ✕ does', async (t) => {
  const page = await openPage(t, chromium, { native: 'android', clock: true, game: savedGame(4, { manaPool: true }) });
  const back = () => page.evaluate(() => window.closeOpenDialog());
  await page.locator('#mana-button').tap();
  assert.deepEqual(await backHandling(page), [false, true], 'off on load, then on for mana mode');
  assert.equal(await back(), true);
  assert.equal(await mode(page), null, 'back with no changes closes the mode');
  assert.deepEqual(await backHandling(page), [false, true, false], 'then back goes to the system');
  await page.locator('#mana-button').tap();
  await cell(page, 2, 'G').tap();
  assert.equal(await back(), true);
  assert.ok(await isOpen(page, 'discard'), 'back with changes asks first');
  assert.equal(await back(), true);
  assert.equal(await mode(page), 'mana', 'back again keeps editing');
  await back();
  await button(page, 'Discard').tap();
  await eventually(() => mode(page), null);
  assert.deepEqual((await saved(page)).pools[1], [0, 0, 0, 0, 0, 0], 'the discard is saved');
  // On for mana mode, the discard question, editing again and the question again; on as the question closes, then off
  // once the discard ends the mode.
  assert.deepEqual(await backHandling(page), [false, true, false, true, false], 'back goes to the system once the mode ends');
});

test('chromium: saved pools are checked when a game loads', async (t) => {
  const page = await openPage(t, chromium);
  const load = async (game) => {
    await seedGame(page, game);
    return { strips: await strips(page), button: await page.locator('#mana-button').isVisible() };
  };
  const base = savedGame(4);
  assert.deepEqual(await load(base), { strips: ['', '', '', ''], button: false }, 'an old save loads with Mana pool off');
  assert.deepEqual(await load({ ...base, manaPool: 'yes', pools: [[1, 0, 0, 0, 0, 0]] }), { strips: ['', '', '', ''], button: false },
    'only a true switch is on');
  assert.deepEqual(await load({ ...base, manaPool: true, pools: [[1, -1, 2.5, 100, 'x', 99], 'pool', [0, 0, 0, 0, 0, 3, 7], null] }),
    { strips: ['W1 C99 clear', '', 'C3 clear', ''], button: true }, 'bad amounts are 0, and each pool has six colours');
  // Auto-empty is on unless saved as false.
  await seedGame(page, { startingLife: 40, scores: [40, 40], manaPool: true, turns: 'rounds', autoEmpty: 0 });
  await button(page, 'Settings').tap();
  assert.equal(await page.getByRole('switch', { name: 'Empty mana pools when the turn passes', exact: true }).isChecked(), true);
});
