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
  async function press(id, name) {
    const box = await button(page, name).boundingBox();
    fingers.set(id, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await touch('touchStart');
  }
  async function lift(id) {
    fingers.delete(id);
    await touch(fingers.size ? 'touchMove' : 'touchEnd');
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
  await touch('touchEnd');
  fingers.clear();
  await wait(200);
  let [p1, p2, p3, p4] = await changes(before);
  assert.ok(p1 <= -4 && p2 >= 4 && p3 <= -4, `three simultaneous holds all repeat: ${[p1, p2, p3]}`);
  assert.equal(p4, 0);

  // Three players tap together. Each total changes by exactly one.
  before = await scores(page);
  await press(1, 'Add one life to Player 1');
  await press(2, 'Subtract one life from Player 2');
  await press(3, 'Add one life to Player 3');
  await wait(60);
  await lift(2);
  await lift(1);
  await lift(3);
  await wait(200);
  assert.deepEqual(await changes(before), [1, -1, 1, 0], 'three simultaneous taps');

  // A tap during another player's hold still counts once.
  before = await scores(page);
  await press(1, 'Subtract one life from Player 1');
  await wait(600);
  await press(4, 'Add one life to Player 4');
  await wait(60);
  await lift(4);
  await wait(300);
  await lift(1);
  await wait(200);
  [p1, , , p4] = await changes(before);
  assert.ok(p1 <= -3, `the hold kept repeating: ${p1}`);
  assert.equal(p4, 1, 'the tap during a hold counts once');

  // Sliding off a button before lifting cancels the tap.
  before = await scores(page);
  await press(1, 'Add one life to Player 1');
  fingers.set(1, { x: 5, y: 5 });
  await touch('touchMove');
  await lift(1);
  await wait(200);
  assert.deepEqual(await changes(before), [0, 0, 0, 0], 'sliding off cancels');

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
