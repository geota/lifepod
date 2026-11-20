import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, webkit } from 'playwright-core';
import { app, button } from './helpers.mjs';

const faceCounts = { 4: 4, 6: 5, 8: 4, 10: 5, 12: 6, 20: 10 };

async function openPage(t, engine, options = {}) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 852, height: 393 }, ...options });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no script errors'));
  await page.goto(app);
  return page;
}

const result = page => page.locator('#dice-result').textContent();
const shownNumber = page => page.locator('.die-number').textContent();

async function checkDice(t, engine) {
  const page = await openPage(t, engine, { reducedMotion: 'reduce' });

  // One tap on the board opens the dice, ready to roll from the keyboard.
  await button(page, 'Roll dice').click();
  assert.ok(await page.locator('#dice').evaluate(dialog => dialog.open));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'dice-roll', 'Roll has focus');
  assert.equal(await page.locator('#dice-picker [aria-pressed="true"]').textContent(), 'd20', 'a d20 to start');

  const fronts = new Set();
  for (const [sides, faces] of Object.entries(faceCounts)) {
    await button(page, `d${sides}`).click();
    assert.equal(await page.locator('#dice-stage .die-face').count(), faces, `d${sides} draws its faces`);
    fronts.add(await page.locator('#dice-stage .tone-0').evaluate(face => getComputedStyle(face).fill));
    assert.equal(await shownNumber(page), `d${sides}`, `d${sides} names itself before a roll`);
    for (let roll = 0; roll < 3; roll++) {
      await button(page, `Roll d${sides}`).click();
      await page.waitForFunction(() => document.querySelector('#dice-result').textContent !== '');
      const [, value, die] = (await result(page)).match(/^Rolled (\d+) on a d(\d+)$/);
      assert.equal(die, sides);
      assert.ok(Number(value) >= 1 && Number(value) <= Number(sides), `d${sides} rolled ${value}`);
      await page.waitForTimeout(200);
      assert.equal(await shownNumber(page), value, 'the die shows the announced result');
    }
  }
  assert.equal(fronts.size, 6, `every die has its own colour: ${[...fronts]}`);

  // Tapping the die rolls it too.
  await page.locator('#dice-stage').click();
  await page.waitForFunction(() => document.querySelector('#dice-result').textContent !== '');

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
  await button(page, 'Game setup').click();
  await button(page, 'Rotate seats').click();
  assert.equal(await button(page, 'Roll dice').isVisible(), false, 'no dice while rotating seats');
  await button(page, 'Done rotating seats').click();
  assert.ok(await button(page, 'Roll dice').isVisible());
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: the dice roll every die and fit small screens`, { timeout: 60000 }, t => checkDice(t, engine));
}

test('rolls come from the cryptographic generator without favouring any face', async (t) => {
  const page = await openPage(t, chromium);
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
  const page = await openPage(t, chromium);
  await button(page, 'Roll dice').click();
  await button(page, 'Roll d20').click();
  // Taps while the die is in the air don't start another roll.
  await page.waitForTimeout(100);
  assert.ok(await page.locator('.die-body').evaluate(die => die.getAnimations().length > 0), 'the die tumbles');
  await button(page, 'Roll d20').click();
  await page.locator('#dice-stage').click();
  await button(page, 'd6').click();
  assert.equal(await page.locator('#dice-picker [aria-pressed="true"]').textContent(), 'd20', 'the die stays while rolling');
  await page.waitForTimeout(900);
  const [, value] = (await result(page)).match(/^Rolled (\d+) on a d20$/);
  assert.equal(await shownNumber(page), value);
  assert.equal(await page.locator('.die-body').evaluate(die => die.getAnimations().length), 0, 'the die has settled');
  await page.waitForTimeout(300);
  assert.equal(await shownNumber(page), value, 'nothing changes the result after it lands');
});
