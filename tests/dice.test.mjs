import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { animationsDone, button, clockStart, engines, eventually, openPage, reload, saved, savedGame, seedGame, test } from './helpers.mjs';

const faceCounts = { 4: 4, 6: 5, 8: 4, 10: 5, 12: 6, 20: 10 };
// The ledger's rows as they read: the die, the result and when, newest first.
const ledger = page => page.locator('#dice-rolls .dice-row').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('span')].map(span => span.textContent).join(' · ')));
// The undo history's length, from the page's live game.
const historySteps = page => page.evaluate(async () => (await import('/js/state/state.js')).game.history.steps.length);
// Roll, by its label. The die on the stage is a button with the same name, so this finds Roll itself.
const rollButton = (page, name) => page.locator('#dice-roll').filter({ hasText: new RegExp(`^${name}$`) });
// Rolls with the reduced-motion fade and returns the announcement once the result has landed.
async function rollOnce(page, name) {
  await rollButton(page, name).click();
  await page.clock.runFor(reducedRoll);
  return result(page);
}
// A roll's timers in web/dice.js. With reduced motion the result shows after the old number's 90ms fade, and the roll
// is done at 250ms. With motion the die lands at 78% of its 720ms tumble.
const fadeOut = 90;
const reducedRoll = 250;
const tumble = 720;
const landsAt = Math.ceil(tumble * 0.78);

const result = page => page.locator('#dice-result').textContent();
const shownNumber = page => page.locator('.die-number').textContent();
// The result's second copy on the stage's far edge, for the other side of the table.
async function echo(page) {
  const [far, near] = await page.locator('#dice-stage .dice-echo').allTextContents();
  assert.equal(near, far, 'both long edges print the same');
  return far;
}

async function checkDice(t, engine) {
  const page = await openPage(t, engine, { viewport: { width: 852, height: 393 }, clock: true });

  // One tap on the board opens the dice, ready to roll from the keyboard.
  await button(page, 'Roll dice').click();
  assert.ok(await page.locator('#dice').evaluate(dialog => dialog.open));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'dice-roll', 'Roll has focus');
  assert.equal(await page.locator('#dice-picker [aria-pressed="true"]').textContent(), 'd20', 'a d20 to start');

  const fronts = new Set();
  for (const [sides, faces] of Object.entries(faceCounts)) {
    await button(page, `d${sides}`).click();
    assert.equal(await page.locator('#dice-stage .die-face').count(), faces, `d${sides} draws its faces`);
    // The front face is filled with that die's own --die-front.
    const [fill, front] = await page.locator('#dice-stage .die-body').evaluate((die) => {
      const probe = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      probe.style.color = 'var(--die-front)';
      die.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return [getComputedStyle(die.querySelector('.tone-0')).fill, colour];
    });
    assert.equal(fill, front, `d${sides}'s front is its --die-front`);
    fronts.add(fill);
    assert.equal(await shownNumber(page), `d${sides}`, `d${sides} names itself before a roll`);
    assert.equal(await echo(page), '', 'no second copy before a roll');
    for (let roll = 0; roll < 3; roll++) {
      await rollButton(page, `Roll d${sides}`).click();
      await page.clock.runFor(fadeOut - 1);
      assert.equal(await result(page), '', 'no result while the old number fades');
      await page.clock.runFor(1);
      const [, value, die] = (await result(page)).match(/^Rolled (\d+) on a d(\d+)$/);
      assert.equal(die, sides);
      assert.ok(Number(value) >= 1 && Number(value) <= Number(sides), `d${sides} rolled ${value}`);
      assert.equal(await shownNumber(page), value, 'the die shows the announced result');
      assert.equal(await echo(page), value, 'and the far edge prints it again');
      // Once the roll is done, the next tap rolls again.
      await page.clock.runFor(reducedRoll - fadeOut);
      assert.equal(await shownNumber(page), value, 'the die still shows it when the roll is done');
    }
  }
  assert.equal(fronts.size, 6, `every die has its own colour: ${[...fronts]}`);
  assert.deepEqual(await page.locator('#dice-picker button').allTextContents(), ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'Coin'], 'the six dice, then the coin');
  assert.deepEqual(await page.evaluate(async () => {
    const { diceSides, coinSides } = await import('/js/logic/data.js');
    return [diceSides, coinSides];
  }), await page.evaluate(() => [window.lifePodDice.sides, window.lifePodDice.coin]), 'the saved format offers what dice.js draws');

  // The result is printed at both long edges: turned 180° above the die for the far side, upright below it for the near
  // side. Screen readers hear it once.
  const copies = await page.locator('#dice-stage .dice-echo').evaluateAll(nodes => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    const die = node.parentElement.querySelector('.die-body').getBoundingClientRect();
    return { transform: getComputedStyle(node).transform, hidden: node.getAttribute('aria-hidden'), above: box.bottom <= die.top + 1, below: box.top >= die.bottom - 1 };
  }));
  assert.deepEqual(copies, [
    { transform: 'matrix(-1, 0, 0, -1, 0, 0)', hidden: 'true', above: true, below: false },
    { transform: 'none', hidden: 'true', above: false, below: true },
  ]);
  // A new roll clears it until the result lands.
  await rollButton(page, 'Roll d20').click();
  assert.equal(await echo(page), '', 'cleared while the roll is in the air');
  await page.clock.runFor(reducedRoll);

  // Tapping the die rolls it too: the stage is a button named for the roll, and it takes Enter and Space.
  assert.equal(await page.locator('#dice-stage').evaluate(stage => [stage.tagName, stage.getAttribute('aria-label')].join(' ')), 'BUTTON Roll d20');
  await page.locator('#dice-stage').focus();
  for (const key of ['Enter', ' ']) {
    await page.keyboard.press(key);
    await page.clock.runFor(reducedRoll);
    assert.match(await result(page), /^Rolled \d+ on a d20$/, `${key === ' ' ? 'Space' : key} on the die rolls it`);
  }
  await page.locator('#dice-stage').click();
  await page.clock.runFor(fadeOut);
  assert.match(await result(page), /^Rolled \d+ on a d20$/);

  // Closing clears the result, and the chosen die stays for next time.
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#dice').evaluate(dialog => dialog.open), false, 'Escape closes the dice');
  await button(page, 'Roll dice').click();
  assert.equal(await shownNumber(page), 'd20');
  assert.equal(await page.evaluate(() => window.closeOpenDialog()), true, 'Android back closes the dice');

  // Seat rotation leaves only its Done button on the board.
  await button(page, 'Settings').click();
  await button(page, 'Rotate seats on the board').click();
  assert.equal(await button(page, 'Roll dice').isVisible(), false, 'no dice while rotating seats');
  await button(page, 'Done rotating seats').click();
  assert.ok(await button(page, 'Roll dice').isVisible());
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: the dice roll every die, from Roll or a tap on the die`, t => checkDice(t, engine));
}

test('chromium: rolls come from the cryptographic generator without favouring any face', async (t) => {
  const page = await openPage(t, chromium, { viewport: { width: 852, height: 393 } });
  // Every face of every die turns up, and nothing falls outside it.
  const counts = await page.evaluate(() => {
    const seen = {};
    for (const sides of window.lifePodDice.sides) {
      seen[sides] = Array(sides + 2).fill(0);
      for (let i = 0; i < sides * 200; i++) seen[sides][window.lifePodDice.randomFace(sides)]++;
    }
    return seen;
  });
  for (const [sides, seen] of Object.entries(counts)) {
    assert.equal(seen[0] + seen[Number(sides) + 1], 0, `d${sides} stays in range`);
    assert.ok(seen.slice(1, -1).every(count => count > 100), `every d${sides} face turns up: ${seen}`);
  }

  // A 32-bit value past the last whole multiple of 6 is drawn again rather than wrapping onto a low face.
  const faces = await page.evaluate(() => {
    const queue = [0xffffffff, 0xfffffffc, 5, 0];
    const draws = [];
    crypto.getRandomValues = (array) => {
      array[0] = queue.shift();
      draws.push(array[0]);
      return array;
    };
    Math.random = () => { throw new Error('rolls must not use Math.random'); };
    return { first: window.lifePodDice.randomFace(6), second: window.lifePodDice.randomFace(6), draws: draws.length };
  });
  assert.deepEqual(faces, { first: 6, second: 1, draws: 4 }, 'the two values at the top of the range were drawn again');
});

// The tumble is a Web Animation, which runs on real time rather than the page's clock, so on a slow machine it can be
// over before the test looks. Each element.animate call is recorded instead, with the properties it moves.
const recordAnimations = page => page.addInitScript(() => {
  const animate = Element.prototype.animate;
  window.testAnimated = [];
  window.testMoved = [];
  Element.prototype.animate = function (...args) {
    window.testAnimated.push(this.className.baseVal ?? this.className);
    const frames = Array.isArray(args[0]) ? args[0] : [args[0]];
    // The stage's animations, not the dialog's guard against a stray tap as it opens (actions/dialog.js).
    if (this.closest?.('#dice-stage')) window.testMoved.push(...frames.flatMap(frame => Object.keys(frame)).filter(key => !['offset', 'easing'].includes(key)));
    return animate.apply(this, args);
  };
});
const tumbled = page => page.evaluate(() => window.testAnimated.some(name => name.split(' ').includes('die-body')));

test('chromium: the roll animates, then settles on one result', async (t) => {
  const page = await openPage(t, chromium, { viewport: { width: 852, height: 393 }, clock: true, motion: 'no-preference', before: recordAnimations });
  await button(page, 'Roll dice').click();
  await rollButton(page, 'Roll d20').click();
  assert.ok(await tumbled(page), 'the die tumbles');
  // Taps while the die is in the air don't start another roll.
  await page.clock.runFor(100);
  await rollButton(page, 'Roll d20').click();
  await page.locator('#dice-stage').click();
  await button(page, 'd6').click();
  assert.equal(await page.locator('#dice-picker [aria-pressed="true"]').textContent(), 'd20', 'the die stays while rolling');
  await page.clock.runFor(landsAt - 1 - 100);
  assert.equal(await result(page), '', 'no result while the die is in the air');
  await page.clock.runFor(1);
  const [, value] = (await result(page)).match(/^Rolled (\d+) on a d20$/);
  assert.equal(await shownNumber(page), value);
  await page.clock.runFor(tumble - landsAt);
  await animationsDone(page.locator('#dice-stage'));
  assert.equal(await page.locator('.die-body').evaluate(die => die.getAnimations().length), 0, 'the die has settled');
  await page.clock.runFor(300);
  assert.equal(await shownNumber(page), value, 'nothing changes the result after it lands');
});

test('chromium: the coin flips end over end, landing on its result, and only fades under reduced motion', async (t) => {
  const page = await openPage(t, chromium, { viewport: { width: 852, height: 393 }, clock: true, motion: 'no-preference', before: recordAnimations });
  await button(page, 'Roll dice').click();
  await button(page, 'Coin').click();
  await rollButton(page, 'Flip coin').click();
  assert.ok(await tumbled(page), 'the coin flips');
  assert.deepEqual([...new Set(await page.evaluate(() => window.testMoved))].sort(), ['opacity', 'transform'], 'moving only transforms and opacity');
  // In the air its face turns from one side to the other.
  const faces = new Set();
  for (let at = 0; at < landsAt - 10; at += 10) {
    await page.clock.runFor(10);
    faces.add(await shownNumber(page));
  }
  assert.ok(faces.has('Heads') && faces.has('Tails'), `both faces show in the air: ${[...faces]}`);
  assert.equal(await result(page), '', 'no result while it is in the air');
  await page.clock.runFor(landsAt - Math.floor((landsAt - 10) / 10) * 10 - 10);
  const [, side] = (await result(page)).match(/^Coin: (Heads|Tails)$/);
  assert.equal(await shownNumber(page), side);
  await page.clock.runFor(tumble - landsAt);
  await animationsDone(page.locator('#dice-stage'));
  await page.clock.runFor(300);
  assert.equal(await shownNumber(page), side, 'nothing changes the side after it lands');

  // Reduced motion: the word fades out and the result fades in, with nothing moving.
  const still = await openPage(t, chromium, { viewport: { width: 852, height: 393 }, clock: true, before: recordAnimations });
  await button(still, 'Roll dice').click();
  await button(still, 'Coin').click();
  await rollOnce(still, 'Flip coin');
  assert.equal(await tumbled(still), false, 'the coin stays put');
  assert.deepEqual([...new Set(await still.evaluate(() => window.testMoved))], ['opacity']);
  assert.match(await result(still), /^Coin: (Heads|Tails)$/);
});

// The coin: a seventh choice, flipped with the same generator, Heads or Tails for both sides of the table.
async function checkCoin(t, engine) {
  const page = await openPage(t, engine, { viewport: { width: 852, height: 393 }, clock: true });
  await button(page, 'Roll dice').click();
  await button(page, 'Coin').click();
  assert.equal(await page.locator('#dice-roll').textContent(), 'Flip coin');
  assert.equal(await shownNumber(page), 'Coin', 'the coin names itself before a flip');
  assert.equal(await page.locator('#dice-stage .die-body').getAttribute('data-sides'), '2');
  const seen = new Set();
  for (let flip = 0; flip < 12; flip++) {
    const said = await rollOnce(page, 'Flip coin');
    const [, side] = said.match(/^Coin: (Heads|Tails)$/);
    seen.add(side);
    assert.equal(await shownNumber(page), side, 'the coin shows the announced side');
    assert.equal(await echo(page), side, 'and the far edge prints it again');
    assert.equal((await ledger(page))[0], `Coin · ${side} · just now`);
    assert.equal(await page.locator('#dice-rolls .dice-row').first().getAttribute('aria-label'), `Coin: ${side}, just now`);
  }
  // Twelve flips all one way is a 1 in 2048 chance; the generator's own test covers its fairness.
  assert.deepEqual([...seen].sort(), ['Heads', 'Tails'], 'both sides turn up');
  // It's saved as a roll of a two-sided die: 1 is Heads and 2 is Tails.
  const { dice } = await saved(page);
  assert.ok(dice.rolls.every(roll => roll.d === 2 && (roll.r === 1 || roll.r === 2)));
  assert.deepEqual(dice.rolls.map(roll => ['Heads', 'Tails'][roll.r - 1]).toReversed(), (await ledger(page)).map(row => row.split(' · ')[1]));
  const sides = await page.evaluate(() => {
    const queue = [0, 1];
    crypto.getRandomValues = (array) => {
      array[0] = queue.shift();
      return array;
    };
    return [window.lifePodDice.randomFace(2), window.lifePodDice.randomFace(2)].map(face => window.lifePodDice.label(2, face));
  });
  assert.deepEqual(sides, ['Heads', 'Tails'], 'an even draw is Heads and an odd one Tails');
}

// The ledger: a roll joins it when the die lands, newest first, and it's saved with the game, kept to 50 and emptied by a
// new game. Rolls are never undo steps, and the page opens on the last die picked.
async function checkLedger(t, engine) {
  const page = await openPage(t, engine, { viewport: { width: 952, height: 427 }, clock: true, game: savedGame(4, { scores: [40, 33, 27, 38] }) });
  const steps = await historySteps(page);
  await button(page, 'Roll dice').click();
  assert.equal(await page.locator('#dice-empty').isVisible(), true, 'an empty ledger says so');
  assert.equal(await page.locator('#dice-rolls').isVisible(), false);
  assert.equal(await page.locator('#dice-count').textContent(), '');

  await rollButton(page, 'Roll d20').click();
  await page.clock.runFor(fadeOut - 1);
  assert.deepEqual(await ledger(page), [], 'nothing joins the ledger before the die lands');
  await page.clock.runFor(1);
  const [, first] = (await result(page)).match(/^Rolled (\d+) on a d20$/);
  assert.deepEqual(await ledger(page), [`d20 · ${first} · just now`], 'the roll joins as it lands');
  assert.equal(await page.locator('#dice-empty').isVisible(), false);
  await page.clock.runFor(reducedRoll - fadeOut);
  await button(page, 'd6').click();
  const [, second] = (await rollOnce(page, 'Roll d6')).match(/^Rolled (\d+) on a d6$/);
  assert.deepEqual(await ledger(page), [`d6 · ${second} · just now`, `d20 · ${first} · just now`], 'newest first');
  assert.equal(await page.locator('#dice-count').textContent(), '2');
  assert.equal(await page.locator('#dice-rolls .dice-row').first().getAttribute('aria-label'), `${second} on a d6, just now`);
  assert.equal(await page.locator('#dice-rolls .dice-row[data-latest]').count(), 1, 'only the newest is raised');
  assert.equal(await historySteps(page), steps, 'rolls make no undo step');

  // The times move on while the page is open.
  await page.clock.runFor(2 * 60000);
  assert.deepEqual((await ledger(page)).map(row => row.split(' · ')[2]), ['2 min ago', '2 min ago']);
  assert.equal(await page.locator('#dice-rolls .dice-row').first().getAttribute('aria-label'), `${second} on a d6, 2 minutes ago`);

  // Saved with the game: a reload opens on the d6, the last die picked, with both rolls.
  const now = Math.round(clockStart / 1000) + 60;
  assert.deepEqual((await saved(page)).dice, { sides: 6, rolls: [{ d: 20, r: Number(first), t: now }, { d: 6, r: Number(second), t: now }] });
  await reload(page);
  await button(page, 'Roll dice').click();
  assert.equal(await page.locator('#dice-picker [aria-pressed="true"]').textContent(), 'd6', 'the page opens on the last die');
  assert.equal(await page.locator('#dice-roll').textContent(), 'Roll d6');
  assert.equal((await ledger(page)).length, 2, 'the rolls are still there');
  await button(page, 'Coin').click();
  await button(page, 'Close dice').click();
  assert.equal(await page.locator('#dice').evaluate(dialog => dialog.open), false, '✕ closes the page');
  assert.equal((await saved(page)).dice.sides, 2, 'the coin is remembered too');
  await reload(page);
  await button(page, 'Roll dice').click();
  assert.equal(await page.locator('#dice-picker [aria-pressed="true"]').textContent(), 'Coin');
  await page.keyboard.press('Escape');

  // 50 are kept: the 51st drops the oldest.
  const later = await page.evaluate(() => Math.round(Date.now() / 1000));
  const full = Array.from({ length: 50 }, (_, index) => ({ d: 12, r: (index % 12) + 1, t: later - 3000 + index }));
  await page.evaluate(async (rolls) => {
    const { game, saveGame } = await import('/js/state/state.js');
    game.dice.rolls = rolls;
    saveGame();
  }, full);
  await button(page, 'Roll dice').click();
  assert.equal((await ledger(page)).length, 50);
  await rollOnce(page, 'Flip coin');
  const rows = await ledger(page);
  assert.equal(rows.length, 50, 'still 50');
  assert.match(rows[0], /^Coin · (Heads|Tails) · just now$/);
  assert.equal(rows.at(-1), 'd12 · 2 · 49 min ago', 'the oldest roll is gone');
  assert.deepEqual((await saved(page)).dice.rolls.slice(0, -1), full.slice(1), 'and the save keeps the newest 50');
  assert.equal(await historySteps(page), steps, 'still no undo step');
  await page.keyboard.press('Escape');

  // A new game empties the ledger, and its confirmation says so. It also empties the undo history, so Undo can't
  // bring them back either.
  await button(page, 'Settings').click();
  await button(page, 'New game').click();
  assert.ok((await page.locator('#restart-resets li').allTextContents()).includes('Dice rolls'));
  await page.locator('#restart').getByRole('button', { name: 'Start new game' }).click();
  await eventually(() => page.evaluate(() => document.querySelectorAll('dialog[open]').length), 0, 'the new game starts');
  assert.deepEqual((await saved(page)).dice, { sides: 2, rolls: [] }, 'the rolls go and the coin stays');
  assert.equal(await historySteps(page), 0, 'the new game emptied the history');
  await button(page, 'Roll dice').click();
  assert.deepEqual(await ledger(page), []);
  assert.equal(await page.locator('#dice-empty').isVisible(), true);
  await page.keyboard.press('Escape');
  await button(page, 'Settings').click();
  await button(page, 'New game').click();
  assert.equal((await page.locator('#restart-resets li').allTextContents()).includes('Dice rolls'), false, 'only while there are rolls');
}

// The flip turns the page for a player across the table, and opening it again faces the phone.
async function checkFlip(t, engine) {
  const page = await openPage(t, engine, { viewport: { width: 952, height: 427 }, clock: true });
  await button(page, 'Roll dice').click();
  const flip = button(page, 'Turn dice to face the other side');
  const turned = () => page.locator('#dice').evaluate(dialog => getComputedStyle(dialog).transform);
  assert.equal(await flip.getAttribute('aria-pressed'), 'false');
  await flip.click();
  assert.equal(await flip.getAttribute('aria-pressed'), 'true');
  assert.equal(await turned(), 'matrix(-1, 0, 0, -1, 0, 0)');
  await flip.click();
  assert.equal(await turned(), 'none');
  await flip.click();
  assert.equal(await page.evaluate(() => window.closeOpenDialog()), true, 'back closes the page');
  await button(page, 'Roll dice').click();
  assert.equal(await flip.getAttribute('aria-pressed'), 'false', 'it opens facing the phone');
  assert.equal(await turned(), 'none');
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: the coin flips Heads or Tails, announced and printed for both sides`, t => checkCoin(t, engine));
  test(`${name}: a roll joins the saved ledger when it lands, kept to 50, emptied by a new game, never an undo step`, t => checkLedger(t, engine));
  test(`${name}: the dice page flips for the other side of the table`, t => checkFlip(t, engine));
}

// The page lies the way the board does, with the die at the centre of the phone, every control a whole 44px target on
// the screen, and nothing to scroll but the ledger's list. Portrait windows turn it, as they turn the board.
const pageSizes = [[952, 427], [852, 393], [640, 360], [568, 320], [1366, 1024], [393, 852], [375, 667], [320, 568], [1024, 1366]];
async function pageProblems(page) {
  return page.evaluate(() => {
    const problems = [];
    const { innerWidth: width, innerHeight: height } = window;
    const inside = box => box.left >= -0.5 && box.top >= -0.5 && box.right <= width + 0.5 && box.bottom <= height + 0.5;
    for (const control of document.querySelectorAll('#dice button')) {
      const box = control.getBoundingClientRect();
      const name = control.getAttribute('aria-label') ?? control.textContent;
      if (box.width < 43.5 || box.height < 43.5) problems.push(`${name} is ${box.width.toFixed(1)} × ${box.height.toFixed(1)}`);
      if (!inside(box)) problems.push(`${name} is off the screen`);
    }
    const die = document.querySelector('#dice-stage .die-body').getBoundingClientRect();
    const off = Math.hypot(die.left + die.width / 2 - width / 2, die.top + die.height / 2 - height / 2);
    if (off > 1.5) problems.push(`the die is ${off.toFixed(1)}px from the centre`);
    for (const part of document.querySelectorAll('.dice-side, .dice-stage, .dice-ledger')) {
      if (!inside(part.getBoundingClientRect())) problems.push(`${part.className} is off the screen`);
    }
    // The controls stay inside their column: Roll's foot isn't pushed out by the picker.
    const side = document.querySelector('.dice-side');
    for (const child of side.children) {
      const box = child.getBoundingClientRect();
      const column = side.getBoundingClientRect();
      if (box.left < column.left - 0.5 || box.right > column.right + 0.5 || box.top < column.top - 0.5 || box.bottom > column.bottom + 0.5) problems.push(`${child.id || child.className} spills out of its column`);
    }
    for (const node of [document.querySelector('#dice'), document.querySelector('.dice-layout'), document.querySelector('.dice-ledger')]) {
      if (node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1) problems.push(`${node.id || node.className} scrolls`);
    }
    return problems;
  });
}
async function checkPage(t, engine) {
  for (const style of ['material', 'glass']) {
    const rolls = Array.from({ length: 50 }, (_, index) => ({ d: [20, 6, 2][index % 3], r: 1 + (index % 2), t: 1767268800 + index }));
    const page = await openPage(t, engine, { clock: true, game: savedGame(4, { style, dice: { sides: 2, rolls } }) });
    for (const players of [4, 2]) {
      if (players === 2) await seedGame(page, savedGame(2, { style, dice: { sides: 20, rolls } }));
      for (const [width, height] of pageSizes) {
        await page.setViewportSize({ width, height });
        await button(page, 'Roll dice').click();
        const where = `${style}, ${players} players, ${width} × ${height}`;
        assert.deepEqual(await pageProblems(page), [], where);
        const turn = await page.evaluate(() => [document.querySelector('#dice').dataset.turn, document.querySelector('.app').dataset.boardTurn]);
        assert.equal(turn[0], turn[1], `the page takes the board's turn: ${where}`);
        assert.equal(await page.locator('#dice').evaluate(dialog => dialog.hasAttribute('data-ends')), players === 2, where);
        assert.equal(await page.locator('#dice-picker button').count(), 7);
        await page.keyboard.press('Escape');
      }
    }
  }
}

// The picker is four over three: the dice d4 to d10, then d12, d20 and the coin, each row filling the column.
async function checkPicker(t, engine) {
  const page = await openPage(t, engine, { viewport: { width: 568, height: 320 } });
  await button(page, 'Roll dice').click();
  const rows = await page.locator('#dice-picker button').evaluateAll((choices) => {
    const lines = new Map();
    for (const choice of choices) {
      const { top } = choice.getBoundingClientRect();
      lines.set(Math.round(top), [...(lines.get(Math.round(top)) ?? []), choice.textContent]);
    }
    return [...lines.values()];
  });
  assert.deepEqual(rows, [['d4', 'd6', 'd8', 'd10'], ['d12', 'd20', 'Coin']]);
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: the dice page centres the die, keeps every target 44px and never scrolls, in both styles, at every size`, t => checkPage(t, engine));
  test(`${name}: the dice picker is four over three`, t => checkPicker(t, engine));
}
