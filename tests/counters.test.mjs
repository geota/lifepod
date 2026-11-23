import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright-core';
import { button, hold, openPage, scores, test, token } from './helpers.mjs';

// Life holds count once when the finger lands, wait 500ms, then repeat every 100ms (bindCounter in web/js/ui/press.js).
// The page's clock is paused, so a hold of a given length gives an exact count.
const repeats = ms => (ms < 500 ? 0 : Math.floor((ms - 500) / 100) + 1);

// Chromium is the only engine Playwright can drive with several simultaneous touches.
test('chromium: several players can tap and hold their totals at the same time', async (t) => {
  const page = await openPage(t, chromium, { viewport: { width: 852, height: 393 }, orientation: 90, clock: true });
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
  const wait = ms => page.clock.runFor(ms);
  const changes = async (before) => (await scores(page)).map((score, i) => score - before[i]);
  const announced = () => page.locator('#announcer').textContent();

  // Three players hold buttons together. Each total keeps changing in its own direction, by one on landing and one
  // per repeat: Player 1 holds for 1280ms, Player 2 for 1240ms and Player 3 for 1200ms.
  let before = await scores(page);
  const quiet = await announced();
  await press(1, 'Subtract one life from Player 1');
  await wait(40);
  await press(2, 'Add one life to Player 2');
  await wait(40);
  await press(3, 'Subtract one life from Player 3');
  await wait(1200);
  await liftAll();
  assert.deepEqual(await changes(before), [-1 - repeats(1280), 1 + repeats(1240), -1 - repeats(1200), 0], 'three simultaneous holds all repeat');
  // Screen readers hear nothing while the totals move.
  assert.equal(await announced(), quiet, 'nothing is announced during the holds');
  await wait(200);

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
  assert.deepEqual(await changes(before), [-1 - repeats(1060), 0, 0, 1], 'the hold kept repeating, and the tap during it counted once');

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
  assert.deepEqual(afterSlide, [1 + repeats(700), 0, 0, 0], 'the hold repeated before sliding off');
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
  const settled = await announced();
  before = await scores(page);
  await button(page, 'Add one life to Player 2').tap();
  await button(page, 'Add one life to Player 2').click();
  await button(page, 'Add one life to Player 2').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await wait(200);
  assert.deepEqual(await changes(before), [0, 4, 0, 0], 'tap, click, Enter and Space');

  // Screen readers hear the settled totals once, 700ms after the last change, not every step of a hold.
  await wait(400);
  assert.equal(await announced(), settled, 'nothing is announced before the totals settle');
  await wait(100);
  assert.equal(await announced(), `Player 2, ${(await scores(page))[1]} life`);

  // Pinch and double-tap zoom are off across the board.
  assert.equal(await page.locator('.app').evaluate(element => getComputedStyle(element).touchAction), 'none');
});

test('chromium: a life total at 0 or below turns red', async (t) => {
  const page = await openPage(t, chromium, { game: { startingLife: 1, scores: [1, 1, 1, 1] } });
  const red = await token(page, '--life-out');
  const score = page.locator('.player:nth-child(1) .score');
  const color = () => score.evaluate(output => getComputedStyle(output).color);
  const normal = await color();
  assert.notEqual(normal, red, 'a total above 0 is not red');
  const subtract = button(page, 'Subtract one life from Player 1');
  const add = button(page, 'Add one life to Player 1');
  await subtract.click();
  assert.equal(await score.evaluate(output => output.value), '0');
  assert.equal(await color(), red, 'zero is red');
  await subtract.click();
  assert.equal(await score.evaluate(output => output.value), '−1');
  assert.equal(await color(), red, 'below zero is red');
  await add.click();
  await add.click();
  assert.equal(await color(), normal, 'back above zero is the usual colour');
  assert.equal(await page.locator('.score[data-out]').count(), 0, 'no other total is red');
});

// Style B: the life halves have no button chrome. A press washes the pressed half in the seat colour, rounded on
// its inner corners, and lights its glyph, only while the finger is down.
async function checkWash(t, engine) {
  const page = await openPage(t, engine);
  const look = (name) => button(page, name).evaluate((half) => {
    const wash = getComputedStyle(half, '::after');
    return {
      chrome: `${getComputedStyle(half).borderTopWidth} ${getComputedStyle(half).backgroundColor}`,
      wash: wash.backgroundColor, radius: wash.borderRadius, glyph: getComputedStyle(half).color,
    };
  });
  const clear = await token(page, 'transparent');
  const add = await look('Add one life to Player 3');
  assert.equal(add.chrome, `0px ${clear}`, 'no button chrome');
  assert.equal(add.wash, clear, 'no wash at rest');
  await button(page, 'Add one life to Player 3').dispatchEvent('pointerdown', { button: 0, pointerId: 7, isPrimary: true });
  const pressed = await look('Add one life to Player 3');
  assert.notEqual(pressed.wash, clear, 'pointerdown washes the half');
  assert.equal(pressed.radius, '28px 0px 0px 28px', 'the + half is rounded on its inner corners');
  assert.equal(pressed.glyph, await token(page, '--text'), 'the glyph turns the text colour');
  await button(page, 'Add one life to Player 3').dispatchEvent('pointerup', { button: 0, pointerId: 7, isPrimary: true });
  assert.equal((await look('Add one life to Player 3')).wash, clear, 'the wash goes when the finger lifts');
  await button(page, 'Subtract one life from Player 3').dispatchEvent('pointerdown', { button: 0, pointerId: 8, isPrimary: true });
  assert.equal((await look('Subtract one life from Player 3')).radius, '0px 28px 28px 0px', 'the − half is rounded on its inner corners');
}

test('chromium: pressing a life half washes it in the seat colour', t => checkWash(t, chromium));
test('webkit: pressing a life half washes it in the seat colour', t => checkWash(t, webkit));

// A player who is out says so (design/polish/FINAL-REVIEW.md #11): an "Out" tag under the total, a label that says why,
// and dimmed badges, except the lethal chip that put them out.
async function checkOut(t, engine) {
  const page = await openPage(t, engine, {
    game: {
      startingLife: 40, scores: [-3, 27, 40, 40], counters: { commander: true, poison: true }, poison: [0, 10, 0, 2], casts: [0, 1, 0, 0],
      commanderDamage: [[0, 0, 0, 0], [0, 0, 0, 0], [21, 0, 0, 0], [0, 0, 0, 0]],
    },
  });
  const state = await page.locator('.player').evaluateAll(players => players.map((player) => {
    const score = player.querySelector('.score');
    const tag = player.querySelector('.out-tag');
    const shown = tag.checkVisibility() && tag.offsetWidth > 0;
    // Under the total in the tile's own frame (the top row's tiles are turned), and centred on it.
    const middle = node => node.offsetLeft + node.offsetWidth / 2;
    return {
      label: score.getAttribute('aria-label'),
      tag: shown ? tag.textContent : '',
      under: !shown || (tag.offsetTop > score.offsetTop + score.offsetHeight / 2 && Math.abs(middle(tag) - middle(score)) < 2),
      dimmed: [...player.querySelectorAll('.badges .chip:not(.sword)')].filter(chip => chip.offsetWidth).map(chip => `${chip.dataset.kind ?? 'damage'} ${Number(getComputedStyle(chip).opacity) < 1 ? 'dim' : 'full'}`),
    };
  }));
  assert.deepEqual(state, [
    { label: '-3 life, out', tag: 'Out', under: true, dimmed: [] },
    { label: '27 life, out on poison', tag: 'Out', under: true, dimmed: ['poison full', 'casts dim'] },
    { label: '40 life, out on commander damage', tag: 'Out', under: true, dimmed: ['damage full'] },
    { label: '40 life', tag: '', under: true, dimmed: ['poison full'] },
  ]);
  // Back above 0, Player 1 is in again.
  for (let step = 0; step < 4; step++) await button(page, 'Add one life to Player 1').click();
  assert.equal(await page.locator('.player:nth-child(1) .score').getAttribute('aria-label'), '1 life');
  assert.equal(await page.locator('.player:nth-child(1) .out-tag').isVisible(), false);
}

test('chromium: a player who is out says so under the total and in its label', t => checkOut(t, chromium));
test('webkit: a player who is out says so under the total and in its label', t => checkOut(t, webkit));

// A life hold stops when the finger leaves the tile, and lifting the finger there adds nothing: the click that
// follows a press is skipped however the press ended.
async function checkHoldLeavesTile(t, engine) {
  const page = await openPage(t, engine, { clock: true });
  const life = async () => (await scores(page))[3];
  const box = await button(page, 'Add one life to Player 4').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(600);
  assert.equal(await life(), 40 + 1 + repeats(600), 'the hold repeats');
  const elsewhere = await page.locator('.player:nth-child(1)').boundingBox();
  await page.mouse.move(elsewhere.x + elsewhere.width / 2, elsewhere.y + elsewhere.height / 2);
  const left = await life();
  // Long enough after the press began that the shared 800ms window has run out.
  await page.clock.runFor(900);
  assert.equal(await life(), left, 'the hold stops once the finger leaves the tile');
  await page.mouse.up();
  await page.clock.runFor(100);
  assert.equal(await life(), left, 'lifting off the tile adds nothing');
}

test('chromium: a life hold stops when the finger leaves the tile and adds nothing on release', t => checkHoldLeavesTile(t, chromium));
test('webkit: a life hold stops when the finger leaves the tile and adds nothing on release', t => checkHoldLeavesTile(t, webkit));

// A hold of a known length counts exactly: one on landing, then one every 100ms after the first 500ms. A slower or
// faster repeat changes the count.
async function checkHoldRate(t, engine) {
  const page = await openPage(t, engine, { clock: true });
  const add = button(page, 'Add one life to Player 2');
  for (const ms of [400, 500, 1200]) {
    const before = (await scores(page))[1];
    await hold(page, add, ms);
    assert.equal((await scores(page))[1] - before, 1 + repeats(ms), `a ${ms}ms hold`);
    await page.clock.runFor(1000);
  }
}

test('chromium: a life hold counts once, then every 100ms after half a second', t => checkHoldRate(t, chromium));
test('webkit: a life hold counts once, then every 100ms after half a second', t => checkHoldRate(t, webkit));
