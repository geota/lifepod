import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { app, button, fakeScreenOrientation, scores, turnScreen } from './helpers.mjs';

// Chromium is the only engine Playwright can drive with several simultaneous touches.
test('chromium: several players can tap and hold their totals at the same time', { timeout: 60000 }, async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ isMobile: true, hasTouch: true });
  await fakeScreenOrientation(page);
  await page.goto(app);
  await turnScreen(page, 852, 393, 90);
  const cdp = await page.context().newCDPSession(page);
  const fingers = new Map();
  async function touch(type) {
    const touchPoints = [...fingers].map(([id, point]) => ({ id, ...point }));
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : touchPoints });
  }
  async function center(name) {
    const box = await button(page, name).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  async function touchAt(id, point) {
    fingers.set(id, point);
    await touch('touchStart');
  }
  const press = async (id, name) => touchAt(id, await center(name));
  async function lift(id) {
    fingers.delete(id);
    await touch(fingers.size ? 'touchMove' : 'touchEnd');
  }
  async function liftAll() {
    fingers.clear();
    await touch('touchEnd');
  }
  const wait = ms => page.waitForTimeout(ms);
  const changes = async (before) => (await scores(page)).map((score, i) => score - before[i]);

  // Three players hold buttons together. Each total keeps changing in its own direction.
  let before = await scores(page);
  await press(1, 'Subtract one life from Player 1');
  await wait(40);
  await press(2, 'Add one life to Player 2');
  await wait(40);
  await press(3, 'Subtract one life from Player 3');
  await wait(1200);
  await liftAll();
  await wait(200);
  let [p1, p2, p3, p4] = await changes(before);
  assert.ok(p1 <= -4 && p2 >= 4 && p3 <= -4, `three simultaneous holds all repeat: ${[p1, p2, p3]}`);
  assert.equal(p4, 0);

  // Three players tap together. Each tap counts as soon as the finger lands, exactly once.
  before = await scores(page);
  await press(1, 'Add one life to Player 1');
  await press(2, 'Subtract one life from Player 2');
  await press(3, 'Add one life to Player 3');
  assert.deepEqual(await changes(before), [1, -1, 1, 0], 'taps count before the fingers lift');
  await wait(60);
  await lift(2);
  await lift(1);
  await lift(3);
  await wait(200);
  assert.deepEqual(await changes(before), [1, -1, 1, 0], 'three simultaneous taps count once each');

  // Every held button shows that it is pressed, not just the first finger's.
  await press(1, 'Subtract one life from Player 1');
  await press(4, 'Add one life to Player 4');
  assert.equal(await page.locator('.controls button[data-pressed]').count(), 2, 'both held buttons look pressed');
  await liftAll();
  assert.equal(await page.locator('.controls button[data-pressed]').count(), 0, 'no button looks pressed after lifting');
  await wait(600);

  // A tap during another player's hold still counts once.
  before = await scores(page);
  await press(1, 'Subtract one life from Player 1');
  await wait(700);
  await press(4, 'Add one life to Player 4');
  await wait(60);
  await lift(4);
  await wait(300);
  await lift(1);
  await wait(200);
  [p1, , , p4] = await changes(before);
  assert.ok(p1 <= -3, `the hold kept repeating: ${p1}`);
  assert.equal(p4, 1, 'the tap during a hold counts once');

  // Each half of a tile is a target: − on the reader's left, + on the right, including over the total.
  const minus = await center('Subtract one life from Player 2');
  const plus = await center('Add one life to Player 2');
  const length = Math.hypot(minus.x - plus.x, minus.y - plus.y);
  const beyond = (from, away, distance) => ({
    x: from.x + (from.x - away.x) / length * distance,
    y: from.y + (from.y - away.y) / length * distance,
  });
  const middle = { x: (minus.x + plus.x) / 2, y: (minus.y + plus.y) / 2 };
  before = await scores(page);
  for (const point of [beyond(minus, plus, 45), beyond(middle, plus, 20)]) {
    await touchAt(1, point);
    await liftAll();
  }
  for (const point of [beyond(plus, minus, 45), beyond(middle, minus, 20)]) {
    await touchAt(1, point);
    await liftAll();
  }
  await wait(200);
  assert.deepEqual(await changes(before), [0, 0, 0, 0], 'two taps on each half cancel out');
  await touchAt(1, beyond(minus, plus, 45));
  await liftAll();
  await touchAt(1, beyond(middle, plus, 20));
  await liftAll();
  assert.deepEqual(await changes(before), [0, -2, 0, 0], 'taps beside the − button and over the total subtract');

  // A hold stops when the finger slides off the tile.
  before = await scores(page);
  await press(1, 'Add one life to Player 1');
  await wait(700);
  fingers.set(1, { x: 5, y: 380 });
  await touch('touchMove');
  const afterSlide = await changes(before);
  await wait(500);
  await liftAll();
  assert.ok(afterSlide[0] >= 2, `the hold repeated before sliding off: ${afterSlide[0]}`);
  assert.deepEqual(await changes(before), afterSlide, 'the hold stopped once the finger left the tile');

  // If Android loses a finger's pointerup, the next tap on that button still counts and ends the old press.
  before = await scores(page);
  await page.locator('.player:nth-child(3) .add').evaluate(add => {
    add.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 999, isPrimary: false, bubbles: true }));
  });
  await press(1, 'Add one life to Player 3');
  await liftAll();
  await wait(800);
  assert.deepEqual(await changes(before), [0, 0, 2, 0], 'the stuck press counted once, then the new tap counted');

  // A single tap, a mouse click, and the keyboard each count exactly once.
  await wait(800);
  before = await scores(page);
  await button(page, 'Add one life to Player 2').tap();
  await button(page, 'Add one life to Player 2').click();
  await button(page, 'Add one life to Player 2').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await wait(200);
  assert.deepEqual(await changes(before), [0, 4, 0, 0], 'tap, click, Enter and Space');

  // Screen readers hear the settled totals once, not every step of a hold.
  await wait(800);
  assert.equal(await page.locator('#announcer').textContent(), `Player 2, ${(await scores(page))[1]} life`);

  // Pinch and double-tap zoom are off across the board.
  assert.equal(await page.locator('.app').evaluate(element => getComputedStyle(element).touchAction), 'none');
});
