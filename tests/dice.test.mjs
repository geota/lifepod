import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { animationsDone, button, engines, openPage, test } from './helpers.mjs';

const faceCounts = { 4: 4, 6: 5, 8: 4, 10: 5, 12: 6, 20: 10 };
// A roll's timers in web/dice.js. With reduced motion the result shows after the old number's 90ms fade, and the roll
// is done at 250ms. With motion the die lands at 78% of its 720ms tumble.
const fadeOut = 90;
const reducedRoll = 250;
const tumble = 720;
const landsAt = Math.ceil(tumble * 0.78);

const result = page => page.locator('#dice-result').textContent();
const shownNumber = page => page.locator('.die-number').textContent();
// The result's second copy on the stage's far edge, for the other side of the table.
const echo = page => page.locator('#dice-stage .dice-echo').textContent();

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
      await button(page, `Roll d${sides}`).click();
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

  // The second copy is turned to face across the table, above the die, and screen readers hear the result once.
  const copy = await page.locator('#dice-stage .dice-echo').evaluate((node) => {
    const box = node.getBoundingClientRect();
    const die = node.parentElement.querySelector('.die-body').getBoundingClientRect();
    return { transform: getComputedStyle(node).transform, hidden: node.getAttribute('aria-hidden'), clear: box.bottom <= die.top + 1 };
  });
  assert.deepEqual(copy, { transform: 'matrix(-1, 0, 0, -1, 0, 0)', hidden: 'true', clear: true });
  // A new roll clears it until the result lands.
  await button(page, 'Roll d20').click();
  assert.equal(await echo(page), '', 'cleared while the roll is in the air');
  await page.clock.runFor(reducedRoll);

  // Tapping the die rolls it too.
  await page.locator('#dice-stage').click();
  await page.clock.runFor(fadeOut);
  assert.match(await result(page), /^Rolled \d+ on a d20$/);

  // Closing clears the result, and the chosen die stays for next time.
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#dice').evaluate(dialog => dialog.open), false, 'Escape closes the dice');
  await button(page, 'Roll dice').click();
  assert.equal(await shownNumber(page), 'd20');
  assert.equal(await page.evaluate(() => window.closeOpenDialog()), true, 'Android back closes the dice');

  // The sheet fits the smallest phones both ways.
  for (const [width, height] of [[568, 320], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await button(page, 'Roll dice').click();
    for (const selector of ['#dice', '#dice-roll', '#dice-stage']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height,
        `${selector} fits ${width}×${height}: ${JSON.stringify(box)}`);
    }
    await page.keyboard.press('Escape');
  }

  // Seat rotation leaves only its Done button on the board.
  await button(page, 'Settings').click();
  await button(page, 'Rotate seats on the board').click();
  assert.equal(await button(page, 'Roll dice').isVisible(), false, 'no dice while rotating seats');
  await button(page, 'Done rotating seats').click();
  assert.ok(await button(page, 'Roll dice').isVisible());
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: the dice roll every die and fit small screens`, t => checkDice(t, engine));
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

test('chromium: the roll animates, then settles on one result', async (t) => {
  // The tumble is a Web Animation, which runs on real time rather than the page's clock, so on a slow machine it can be
  // over before the test looks. Each element.animate call is recorded instead.
  const recordAnimations = page => page.addInitScript(() => {
    const animate = Element.prototype.animate;
    window.testAnimated = [];
    Element.prototype.animate = function (...args) {
      window.testAnimated.push(this.className.baseVal ?? this.className);
      return animate.apply(this, args);
    };
  });
  const page = await openPage(t, chromium, { viewport: { width: 852, height: 393 }, clock: true, motion: 'no-preference', before: recordAnimations });
  await button(page, 'Roll dice').click();
  await button(page, 'Roll d20').click();
  assert.ok(await page.evaluate(() => window.testAnimated.some(name => name.split(' ').includes('die-body'))), 'the die tumbles');
  // Taps while the die is in the air don't start another roll.
  await page.clock.runFor(100);
  await button(page, 'Roll d20').click();
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
