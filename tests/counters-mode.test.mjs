import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { chromium, webkit } from 'playwright-core';
import { app, button, fakeScreenOrientation, setSwitches, startGame, turnScreen } from './helpers.mjs';

const tile = (page, number) => page.locator(`.player:nth-child(${number})`);
const cell = (page, number, kind) => tile(page, number).locator(`.counter-cell[data-kind="${kind}"]`);
const count = (page, number, kind) => cell(page, number, kind).locator('b').textContent();
// The visually hidden button beside each cell takes one away for keyboards and screen readers.
const removeOne = (page, name) => page.getByRole('button', { name, exact: true }).evaluate(remove => remove.click());
const nearBadges = (page, number) => tile(page, number).locator('.badges.near')
  .evaluate(row => (row.hidden ? '' : [...row.children].map(chip => chip.textContent).join(' | ')));
const mode = page => page.locator('#board').getAttribute('data-mode');

// A dialog's close event runs after the click that closes it, so results that follow it are polled.
async function eventually(read, expected, message) {
  const deadline = Date.now() + 2000;
  let value = await read();
  while (!isDeepStrictEqual(value, expected) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
    value = await read();
  }
  assert.deepEqual(value, expected, message);
}
const isOpen = (page, id) => page.locator(`#${id}`).evaluate(dialog => dialog.open);

async function openPage(t, engine, options = {}) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ isMobile: true, hasTouch: true, viewport: { width: 852, height: 393 }, ...options });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no script errors'));
  return page;
}

// Chromium writes page storage in the background, so give a write a moment to land before a reload.
async function reload(page) {
  await page.waitForTimeout(500);
  await page.reload();
}

async function checkCountersMode(t, engine) {
  const page = await openPage(t, engine);
  await page.goto(app);

  // Nothing new shows until a counter is switched on. The switches are saved.
  assert.ok(!(await button(page, 'Counters').isVisible()), 'no counters button with both switches off');
  await setSwitches(page, { Poison: true });
  assert.ok(await button(page, 'Counters').isVisible(), 'Poison shows the counters button');
  await reload(page);
  assert.ok(await button(page, 'Counters').isVisible(), 'the switch is saved');

  // With only Poison on, each tile has one circle: the poison count under its icon.
  await button(page, 'Counters').tap();
  assert.equal(await mode(page), 'counters');
  assert.equal(await page.locator('.counter-cell').count(), 4);
  assert.equal(await cell(page, 1, 'poison').locator('.mana-icon[data-glyph="infect"]').count(), 1, 'the infect symbol over the count');
  assert.equal(await cell(page, 1, 'poison').evaluate(node => getComputedStyle(node).borderRadius), '50%', 'cells are circles');
  assert.equal(await count(page, 1, 'poison'), '0');
  assert.ok(await button(page, 'Undo').isDisabled(), 'Undo is dimmed until something changes');
  assert.ok(!(await button(page, 'Roll dice').isVisible()) && !(await button(page, 'Settings').isVisible()));
  await button(page, 'Cancel').tap();
  assert.equal(await mode(page), null, '✕ with no changes closes straight away');
  assert.ok(!(await isOpen(page, 'discard')));

  // Commander adds a tax circle after poison. A tap on a cell adds one: one cast is +2 tax.
  await setSwitches(page, { Commander: true });
  await button(page, 'Counters').tap();
  assert.equal(await page.locator('.counter-cell').count(), 8);
  assert.deepEqual(await tile(page, 1).locator('.counter-cell').evaluateAll(cells => cells.map(node => node.dataset.kind)), ['poison', 'casts']);
  await cell(page, 3, 'poison').tap();
  await cell(page, 3, 'poison').tap();
  await cell(page, 1, 'casts').tap();
  await cell(page, 1, 'casts').tap();
  assert.equal(await count(page, 3, 'poison'), '2');
  assert.equal(await count(page, 1, 'casts'), '+4');
  assert.equal(await cell(page, 3, 'poison').getAttribute('aria-label'), 'Player 3 poison, 2. Add one');
  assert.equal(await cell(page, 1, 'casts').getAttribute('aria-label'), 'Player 1 commander tax, 4, 2 casts. Add one cast');
  // Taking one away at 0 does nothing and isn't a change.
  await removeOne(page, 'Remove one poison counter from Player 2');
  assert.equal(await count(page, 2, 'poison'), '0');

  // Undo steps back one change at a time.
  assert.ok(!(await button(page, 'Undo').isDisabled()));
  await button(page, 'Undo').tap();
  assert.equal(await count(page, 1, 'casts'), '+2');
  assert.equal(await count(page, 3, 'poison'), '2');

  // ✕ with changes asks first. Keep editing is the default and keeps everything.
  await button(page, 'Cancel').tap();
  assert.ok(await isOpen(page, 'discard'));
  assert.equal(await page.locator('#discard-title').textContent(), 'Discard 3 changes?');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Keep editing');
  await button(page, 'Keep editing').tap();
  await eventually(() => isOpen(page, 'discard'), false);
  assert.equal(await mode(page), 'counters');
  assert.equal(await count(page, 3, 'poison'), '2');

  // Discard puts every count back to how it was when the mode opened.
  await button(page, 'Cancel').tap();
  await button(page, 'Discard').tap();
  await eventually(() => mode(page), null, 'Discard closes the mode');
  assert.equal(await nearBadges(page, 3), '', 'discarded poison leaves no badge');
  await reload(page);
  await button(page, 'Counters').tap();
  assert.equal(await count(page, 3, 'poison'), '0', 'the discard is saved');

  // Holding a cell takes one away once the hold registers, then repeats; a hold never adds.
  for (let tap = 0; tap < 9; tap++) await cell(page, 4, 'poison').tap();
  assert.equal(await count(page, 4, 'poison'), '9');
  const box = await cell(page, 4, 'poison').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  assert.equal(await count(page, 4, 'poison'), '9', 'nothing changes before the hold registers');
  assert.ok(await cell(page, 4, 'poison').evaluate(node => node.hasAttribute('data-pressed')), 'a held cell looks pressed');
  await page.waitForTimeout(650);
  await page.mouse.up();
  const held = Number(await count(page, 4, 'poison'));
  // A slow machine can run the hold long enough to reach 0, which is fine: counts stop there.
  assert.ok(held <= 7, `a hold takes one away and repeats: ${held}`);
  await page.waitForTimeout(300);
  assert.equal(Number(await count(page, 4, 'poison')), held, 'lifting ends the hold without adding');
  await cell(page, 2, 'casts').tap();

  // The check mark saves. The near row shows poison and tax, only where they're above zero.
  await button(page, 'Save').tap();
  assert.equal(await mode(page), null);
  assert.equal(await nearBadges(page, 4), `${held} poison`);
  assert.equal(await nearBadges(page, 2), 'Commander tax +2');
  assert.equal(await nearBadges(page, 1), '');
  assert.equal(await tile(page, 4).locator('.badges.near .mana-icon[data-glyph="infect"]').count(), 1, 'poison shows the infect symbol');
  await reload(page);
  assert.equal(await nearBadges(page, 4), `${held} poison`, 'saved counts survive a reload');

  // Turning a switch off hides its badges.
  await setSwitches(page, { Poison: false });
  assert.equal(await nearBadges(page, 4), '');
  await setSwitches(page, { Poison: true });
  assert.equal(await nearBadges(page, 4), `${held} poison`);
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: counters mode edits poison and tax with undo, save and discard`, { timeout: 60000 }, t => checkCountersMode(t, engine));
}

// A hold on a cell stops when the finger leaves the player's tile, and a finger that moves never throws
// (docs/review/ARCHITECTURE.md B1: cells are bound before they join their tile).
async function checkHoldLeavesTile(t, engine) {
  const page = await openPage(t, engine);
  await page.goto(app);
  await page.evaluate(() => localStorage.setItem('lifepod-game', JSON.stringify({
    startingLife: 40, scores: [40, 40, 40, 40], counters: { poison: true }, poison: [0, 0, 0, 30],
  })));
  await page.reload();
  await button(page, 'Counters').tap();
  const box = await cell(page, 4, 'poison').boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // A finger jitters while it holds. Within the tile, the hold goes on.
  await page.mouse.move(x + 2, y + 1);
  await eventually(async () => Number(await count(page, 4, 'poison')) < 30, true, 'the hold registers');
  // Off the tile, onto another player's, the hold stops at once.
  const elsewhere = await tile(page, 1).boundingBox();
  await page.mouse.move(elsewhere.x + elsewhere.width / 2, elsewhere.y + elsewhere.height / 2);
  const left = Number(await count(page, 4, 'poison'));
  await page.waitForTimeout(600);
  assert.equal(Number(await count(page, 4, 'poison')), left, 'nothing more is taken away once the finger leaves the tile');
  await page.mouse.up();
  await page.waitForTimeout(100);
  assert.equal(Number(await count(page, 4, 'poison')), left, 'lifting off the tile adds nothing');
  assert.ok(!(await cell(page, 4, 'poison').evaluate(node => node.hasAttribute('data-pressed'))), 'the cell no longer looks pressed');
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: a hold on a cell stops when the finger leaves the tile`, { timeout: 60000 }, t => checkHoldLeavesTile(t, engine));
}

const kinds = (page, number) => tile(page, number).locator('.counter-cell').evaluateAll(cells => cells.map(node => node.dataset.kind));
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('lifepod-game')));
const everyTracker = { Commander: true, Poison: true, Energy: true, Experience: true, Rad: true };

// Energy, experience and rad (design/polish/SPEC.md §6 and §7): each has its own Track switch, a circle in counters
// mode and a badge at rest, always in the order poison, tax, energy, experience, rad.
async function checkNewCounters(t, engine) {
  const page = await openPage(t, engine);
  await page.goto(app);

  // Each new tracker on its own shows the counters button and only its own circle, with its icon.
  const icons = { energy: '.mana-icon[data-glyph="energy"]', experience: 'svg[data-icon="graduation-cap"]', rad: '.mana-icon[data-glyph="rad"]' };
  for (const [name, kind] of [['Energy', 'energy'], ['Experience', 'experience'], ['Rad', 'rad']]) {
    await setSwitches(page, { [name]: true });
    assert.ok(await button(page, 'Counters').isVisible(), `${name} shows the counters button`);
    await button(page, 'Counters').tap();
    assert.deepEqual(await kinds(page, 1), [kind], `${name} alone: one circle per tile`);
    assert.equal(await page.locator('.counter-cell').count(), 4);
    assert.equal(await cell(page, 1, kind).locator(icons[kind]).count(), 1, `${name}'s icon over its count`);
    assert.equal(await count(page, 1, kind), '0');
    await button(page, 'Cancel').tap();
    await setSwitches(page, { [name]: false });
    assert.ok(!(await button(page, 'Counters').isVisible()), `no counters button once ${name} is off again`);
  }

  // The switches are saved and stay on across launches.
  await setSwitches(page, everyTracker);
  await reload(page);
  assert.deepEqual((await saved(page)).counters, { commander: true, poison: true, energy: true, experience: true, rad: true, monarch: false, initiative: false });

  // Every counter on: five circles in order, three on the first row and the last two centred under them.
  await button(page, 'Counters').tap();
  assert.deepEqual(await kinds(page, 3), ['poison', 'casts', 'energy', 'experience', 'rad']);
  assert.equal(await page.locator('.counter-cell').count(), 20);
  const boxes = await tile(page, 3).locator('.counter-cell').evaluateAll(cells => cells.map((node) => {
    const box = node.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }));
  assert.ok(Math.abs(boxes[0].y - boxes[2].y) < 1 && boxes[3].y - boxes[0].y > 40 && Math.abs(boxes[3].y - boxes[4].y) < 1, 'three over two');
  assert.ok(Math.abs((boxes[3].x + boxes[4].x) / 2 - boxes[1].x) < 1, 'the last row is centred');

  // Taps add one, the hidden buttons take one away, and Undo steps back through the new kinds too.
  for (let tap = 0; tap < 3; tap++) await cell(page, 3, 'energy').tap();
  await cell(page, 1, 'experience').tap();
  await cell(page, 2, 'rad').tap();
  await cell(page, 2, 'rad').tap();
  await removeOne(page, 'Remove one rad counter from Player 2');
  assert.equal(await count(page, 3, 'energy'), '3');
  assert.equal(await count(page, 1, 'experience'), '1');
  assert.equal(await count(page, 2, 'rad'), '1');
  assert.equal(await cell(page, 3, 'energy').getAttribute('aria-label'), 'Player 3 energy, 3. Add one');
  assert.equal(await cell(page, 1, 'experience').getAttribute('aria-label'), 'Player 1 experience, 1. Add one');
  assert.equal(await cell(page, 2, 'rad').getAttribute('aria-label'), 'Player 2 rad, 1. Add one');
  await removeOne(page, 'Remove one experience counter from Player 1');
  await removeOne(page, 'Remove one energy counter from Player 3');
  assert.equal(await count(page, 1, 'experience'), '0');
  assert.equal(await count(page, 3, 'energy'), '2');
  await button(page, 'Undo').tap();
  await button(page, 'Undo').tap();
  await button(page, 'Undo').tap();
  assert.deepEqual([await count(page, 3, 'energy'), await count(page, 1, 'experience'), await count(page, 2, 'rad')], ['3', '1', '2'],
    'Undo puts back energy, experience and rad');

  // Discard takes every new kind back to how it was when the mode opened, and that's saved.
  await button(page, 'Cancel').tap();
  assert.equal(await page.locator('#discard-title').textContent(), 'Discard 6 changes?');
  assert.equal(await page.locator('#discard-message').textContent(), 'Every counter goes back to how it was when you opened counters.');
  await button(page, 'Discard').tap();
  await eventually(() => mode(page), null, 'Discard closes the mode');
  assert.deepEqual(await Promise.all([1, 2, 3, 4].map(number => nearBadges(page, number))), ['', '', '', '']);
  await reload(page);
  const discarded = await saved(page);
  assert.deepEqual([discarded.energy, discarded.experience, discarded.rad], [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 'the discard is saved');

  // The check mark saves. Badges follow the identity chip in the order poison, tax, energy, experience, rad, each
  // only where it's above zero, and two-digit counts show in full.
  await button(page, 'Counters').tap();
  for (let tap = 0; tap < 12; tap++) await cell(page, 3, 'energy').tap();
  for (let tap = 0; tap < 10; tap++) await cell(page, 1, 'experience').tap();
  for (const kind of ['rad', 'experience', 'energy', 'casts', 'poison']) await cell(page, 4, kind).tap();
  await cell(page, 2, 'rad').tap();
  await button(page, 'Save').tap();
  assert.equal(await mode(page), null);
  assert.equal(await nearBadges(page, 4), '1 poison | Commander tax +2 | 1 energy | 1 experience | 1 rad');
  assert.equal(await nearBadges(page, 3), '12 energy');
  assert.equal(await nearBadges(page, 1), '10 experience');
  assert.equal(await nearBadges(page, 2), '1 rad');
  assert.deepEqual(await tile(page, 4).locator('.badges.near .chip').evaluateAll(chips => chips.map(chip =>
    chip.querySelector('[data-glyph], [data-icon]')?.dataset.glyph ?? chip.querySelector('[data-icon]').dataset.icon)),
  ['infect', 'commander', 'energy', 'graduation-cap', 'rad'], 'each badge has its counter’s icon');
  await reload(page);
  assert.equal(await nearBadges(page, 3), '12 energy', 'saved counts survive a reload');

  // Turning a switch off hides its badges and circles, and keeps the count for when it comes back.
  await setSwitches(page, { Energy: false });
  assert.equal(await nearBadges(page, 3), '');
  assert.equal(await nearBadges(page, 4), '1 poison | Commander tax +2 | 1 experience | 1 rad');
  await button(page, 'Counters').tap();
  assert.deepEqual(await kinds(page, 4), ['poison', 'casts', 'experience', 'rad']);
  await button(page, 'Cancel').tap();
  await setSwitches(page, { Energy: true });
  assert.equal(await nearBadges(page, 3), '12 energy');

  // A new game resets every count and keeps the switches.
  await button(page, 'Settings').tap();
  await button(page, 'New game').tap();
  await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  await eventually(() => Promise.all([1, 2, 3, 4].map(number => nearBadges(page, number))), ['', '', '', ''], 'a new game clears the badges');
  const fresh = await saved(page);
  assert.deepEqual([fresh.poison, fresh.casts, fresh.energy, fresh.experience, fresh.rad], Array(5).fill([0, 0, 0, 0]), 'a new game resets every count');
  assert.deepEqual(fresh.counters, { commander: true, poison: true, energy: true, experience: true, rad: true, monarch: false, initiative: false }, 'and keeps every switch');
  assert.ok(await button(page, 'Counters').isVisible());
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: energy, experience and rad have switches, circles and badges in order`, { timeout: 90000 }, t => checkNewCounters(t, engine));
}

test('chromium: counters mode fits six players with every counter on the smallest phone', { timeout: 60000 }, async (t) => {
  const page = await openPage(t, chromium, { viewport: { width: 852, height: 393 } });
  await fakeScreenOrientation(page);
  await page.goto(app);
  await setSwitches(page, { Commander: true, Poison: true, Energy: true, Experience: true, Rad: true });
  await turnScreen(page, 320, 568, 0);
  await startGame(page, 6);
  await button(page, 'Counters').tap();
  const problems = await page.evaluate(() => {
    const controls = document.querySelector('#board-controls').getBoundingClientRect();
    const pill = { left: controls.left + 6, right: controls.right - 6, top: controls.top + 6, bottom: controls.bottom - 6 };
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return [...document.querySelectorAll('.player')].flatMap((player, index) => {
      const bounds = player.getBoundingClientRect();
      return [...player.querySelectorAll('.mode-layer .counter-cell')].map((target) => {
        const box = target.getBoundingClientRect();
        const issues = [];
        if (Math.min(box.width, box.height) < 43.5) issues.push(`${Math.round(box.width)}×${Math.round(box.height)}`);
        if (box.left < bounds.left - 0.5 || box.right > bounds.right + 0.5 || box.top < bounds.top - 0.5 || box.bottom > bounds.bottom + 0.5) {
          issues.push('outside its tile');
        }
        if (overlaps(box, pill)) issues.push('under the centre controls');
        return issues.length ? `P${index + 1} ${target.getAttribute('aria-label')}: ${issues.join(', ')}` : '';
      }).filter(Boolean);
    });
  });
  assert.deepEqual(problems, []);
  assert.equal(await page.locator('.mode-layer .counter-cell').count(), 30, 'five cells per tile');

  // Settings still fills the smallest landscape phone.
  await button(page, 'Cancel').tap();
  await turnScreen(page, 568, 320, 90);
  await button(page, 'Settings').tap();
  const settingsBox = await page.locator('#settings').boundingBox();
  assert.deepEqual(settingsBox, { x: 0, y: 0, width: 568, height: 320 }, `settings fills the screen: ${JSON.stringify(settingsBox)}`);
});

test('chromium: Android back cancels counters mode the way ✕ does', async (t) => {
  const page = await openPage(t, chromium);
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
  await page.goto(app);
  const back = () => page.evaluate(() => window.closeOpenDialog());
  const handling = () => page.evaluate(() => window.backHandling.at(-1));
  await setSwitches(page, { Poison: true });

  await button(page, 'Counters').tap();
  assert.equal(await handling(), true);
  assert.equal(await back(), true);
  assert.equal(await mode(page), null, 'back with no changes closes the mode');
  assert.equal(await handling(), false);

  await button(page, 'Counters').tap();
  await cell(page, 2, 'poison').tap();
  assert.equal(await back(), true);
  assert.ok(await isOpen(page, 'discard'), 'back with changes asks first');
  assert.equal(await page.locator('#discard-title').textContent(), 'Discard 1 change?');
  assert.equal(await back(), true);
  assert.ok(!(await isOpen(page, 'discard')), 'back again keeps editing');
  assert.equal(await mode(page), 'counters');
  assert.equal(await count(page, 2, 'poison'), '1');
  assert.equal(await handling(), true);
  await back();
  await button(page, 'Discard').tap();
  await eventually(() => mode(page), null);
  assert.equal(JSON.parse(await page.evaluate(() => sessionStorage.getItem('game'))).poison[1], 0, 'the discard is saved');
});

test('chromium: saved counters are checked when a game loads', async (t) => {
  const page = await openPage(t, chromium);
  await page.goto(app);
  const load = async (saved) => {
    await page.evaluate(game => localStorage.setItem('lifepod-game', JSON.stringify(game)), saved);
    await page.reload();
    return page.evaluate(() => {
      // What a screen reader hears from each chip: its text, leaving out the parts hidden from it.
      const spoken = node => [...node.childNodes].map(child => (child.nodeType === Node.TEXT_NODE ? child.textContent
        : child.getAttribute('aria-hidden') === 'true' ? '' : spoken(child))).join('');
      const near = [...document.querySelectorAll('.badges.near')]
        .map(row => (row.hidden ? '' : [...row.children].map(spoken).join(' | ')));
      return { counters: !document.querySelector('#counters-button').hidden, near };
    });
  };
  const game = { startingLife: 40, scores: [40, 40, 40, 40], rotations: [0, 0, 0, 0], keepAwake: true, landscapeAngle: 90 };
  assert.deepEqual(await load(game), { counters: false, near: ['', '', '', ''] }, 'a save from before counters loads with them off');
  assert.deepEqual(await load({
    ...game, counters: { commander: true, poison: 'yes' }, poison: [3, -1, 1.5, 100], casts: [2, 'x'], identities: ['BU', 'CW', 7, 'Q'],
  }), { counters: true, near: ['Dimir, colour identity blue, black | Commander tax +4', '', '', ''] },
  'bad counts start at 0, bad identities are cleared, and only a true switch is on');
  // Colourless was removed: a saved 'C', or anything with C in it, loads as no identity. Identity shows whether or
  // not Commander is on.
  assert.deepEqual((await load({ ...game, identities: ['C', 'GRBUW', 'UC', 'WW'] })).near,
    ['', 'WUBRG, colour identity white, blue, black, red, green', '', 'Mono-white, colour identity white']);
  assert.deepEqual((await load({ ...game, counters: { poison: true }, poison: [3, 0, 0, 99] })).near, ['3 poison', '', '', '99 poison']);
  // Energy, experience and rad: only a true switch is on, and a bad or missing count starts at 0.
  assert.deepEqual(await load({
    ...game, counters: { energy: true, experience: 1, rad: true }, energy: [5, -2, 'x', 99], experience: [4, 4, 4, 4], rad: [1.5, 100, 7],
  }), { counters: true, near: ['5 energy', '', '7 rad', '99 energy'] }, 'experience stays off, and bad counts start at 0');
});

// Counter icons stay legible on small boards (design/polish/FINAL-REVIEW.md #16): the icon is 0.42 of the cell and the
// count 0.3, at 568 × 320 with six players as on the target.
test('chromium: counter cells draw their icon at 0.42 of the cell and the count at 0.3', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  for (const viewport of [{ width: 568, height: 320 }, { width: 952, height: 427 }]) {
    const page = await browser.newPage({ isMobile: true, hasTouch: true, viewport });
    await page.goto(app);
    await page.evaluate(() => localStorage.setItem('lifepod-game', JSON.stringify({
      startingLife: 40, scores: Array(6).fill(40), landscapeAngle: 90,
      counters: { commander: true, poison: true, energy: true, experience: true, rad: true },
    })));
    await page.reload();
    await button(page, 'Counters').tap();
    const ratios = await page.locator('.player:nth-child(1) .counter-cell').evaluateAll(cells => cells.map((cell) => {
      const size = cell.offsetWidth;
      const icon = cell.querySelector('.icon, .mana-icon');
      return [Math.round(parseFloat(getComputedStyle(icon).fontSize) / size * 100) / 100, Math.round(parseFloat(getComputedStyle(cell.querySelector('b')).fontSize) / size * 100) / 100];
    }));
    assert.deepEqual(ratios, Array(5).fill([0.42, 0.3]), `${viewport.width} × ${viewport.height}`);
    await page.close();
  }
});
