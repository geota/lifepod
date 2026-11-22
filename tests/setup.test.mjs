import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { chromium, webkit } from 'playwright-core';
import { app, button, fakeScreenOrientation, scores, turnScreen } from './helpers.mjs';

// Game setup and its Track sheet (design/polish/SPEC.md §4): segmented choices, the custom life stepper,
// navigation rows, switch rows and the sheet buttons.

async function openPage(t, engine, android = false) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ isMobile: true, hasTouch: true, viewport: { width: 952, height: 427 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no script errors'));
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
  return page;
}

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

const openDialogs = page => page.evaluate(() => [...document.querySelectorAll('dialog[open]')].map(dialog => dialog.id));
const lifeChoice = page => page.locator('#life-presets').evaluate(group => ({
  pressed: [...group.querySelectorAll('[aria-pressed="true"]')].map(choice => choice.textContent),
  stepper: group.querySelector('#life-stepper').hidden ? null : Number(group.querySelector('#life-value').textContent),
}));

async function hold(page, name, ms) {
  const box = await button(page, name).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

async function checkStepper(t, engine) {
  const page = await openPage(t, engine);
  await page.goto(app);
  await button(page, 'Game setup').tap();

  // Starting life is a segmented choice with no text field, so no keyboard opens.
  assert.equal(await page.locator('#setup input:not([type="checkbox"])').count(), 0, 'no text input in setup');
  assert.deepEqual(await lifeChoice(page), { pressed: ['40'], stepper: null });

  // Custom turns into a − value + stepper in its place, starting at the current value.
  await button(page, 'Custom').tap();
  assert.deepEqual(await lifeChoice(page), { pressed: [], stepper: 40 });
  assert.ok(!(await button(page, 'Custom').isVisible()), 'the stepper takes the Custom segment’s place');
  await button(page, 'More starting life').tap();
  assert.equal((await lifeChoice(page)).stepper, 41);
  assert.equal(await page.locator('#save-setup').textContent(), 'Start new game', 'a new life starts a new game');
  await button(page, 'Less starting life').tap();
  await button(page, 'Less starting life').tap();
  assert.equal((await lifeChoice(page)).stepper, 39);

  // Holding repeats ten times a second, then in steps of 5 once held for a second.
  await hold(page, 'More starting life', 1700);
  const held = (await lifeChoice(page)).stepper;
  assert.ok(held - 39 >= 20, `a long hold speeds up to steps of 5: 39 → ${held}`);
  // The stepper stops at 1.
  await hold(page, 'Less starting life', 3500);
  assert.equal((await lifeChoice(page)).stepper, 1, 'never below 1');
  await button(page, 'Less starting life').tap();
  assert.equal((await lifeChoice(page)).stepper, 1);

  // A preset leaves the stepper, and Custom starts again from that preset.
  await button(page, '30').tap();
  assert.deepEqual(await lifeChoice(page), { pressed: ['30'], stepper: null });
  await button(page, 'Custom').tap();
  for (let step = 0; step < 3; step++) await button(page, 'More starting life').tap();
  assert.equal((await lifeChoice(page)).stepper, 33);
  await page.locator('#save-setup').tap();
  assert.deepEqual(await scores(page), [33, 33, 33, 33], 'the new game starts at the custom life');

  // A life that isn't a preset opens with Custom chosen.
  await button(page, 'Game setup').tap();
  assert.deepEqual(await lifeChoice(page), { pressed: [], stepper: 33 });
  assert.equal(await page.locator('#save-setup').textContent(), 'Done');
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: custom starting life is a stepper with no keyboard`, { timeout: 60000 }, t => checkStepper(t, engine));
}

test('chromium: an old save at 25 life opens setup with Custom chosen', async (t) => {
  const page = await openPage(t, chromium);
  await page.goto(app);
  await page.evaluate(() => localStorage.setItem('lifepod-game', JSON.stringify({ startingLife: 25, scores: [25, 18, 25, 25] })));
  await page.reload();
  await button(page, 'Game setup').tap();
  assert.deepEqual(await lifeChoice(page), { pressed: [], stepper: 25 });
  assert.equal(await page.locator('#save-setup').textContent(), 'Done', 'nothing has changed yet');
  assert.ok(await button(page, 'New game').isVisible());
});

async function checkTrack(t, engine) {
  const page = await openPage(t, engine, engine === chromium);
  await page.goto(app);
  const saved = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('game') ?? localStorage.getItem('lifepod-game')));
  const summary = () => page.locator('#track-summary').evaluate(node => [...node.children].map(icon => icon.dataset.glyph ?? icon.dataset.icon ?? icon.textContent));
  // Track sums up what's on in order: as many icons as fit, at most three, then "+N" for the rest.
  const sums = async (all) => {
    const shown = await summary();
    const icons = shown.filter(item => !item.startsWith('+'));
    return icons.length >= 1 && icons.length <= 3 && isDeepStrictEqual(icons, all.slice(0, icons.length))
      && isDeepStrictEqual(shown.slice(icons.length), icons.length < all.length ? [`+${all.length - icons.length}`] : []) ? all : shown;
  };

  // Setup's unsaved choices survive a trip to Track and back with ‹.
  await button(page, 'Game setup').tap();
  assert.deepEqual(await summary(), [], 'no trackers on');
  await button(page, '6 players').tap();
  await button(page, 'Track').tap();
  await eventually(() => openDialogs(page), ['track']);
  assert.equal(await page.locator('#track-title').textContent(), 'Track');
  await button(page, 'Back to setup').tap();
  await eventually(() => openDialogs(page), ['setup'], '‹ returns to setup');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'track-button', 'focus returns to Track');
  assert.equal(await button(page, '6 players').getAttribute('aria-pressed'), 'true', 'the player count is still chosen');
  assert.equal(await page.locator('#save-setup').textContent(), 'Start new game');
  await button(page, '4 players').tap();

  // Each switch saves the moment it changes, and the counters button appears at once.
  await button(page, 'Track').tap();
  await page.locator('#track label', { has: page.getByRole('switch', { name: 'Poison', exact: true }) }).tap();
  assert.equal((await saved()).counters.poison, true, 'Poison is saved before the sheet closes');
  assert.ok(!(await page.locator('#counters-button').evaluate(node => node.hidden)), 'the counters button shows');
  await page.locator('#track label', { has: page.getByRole('switch', { name: 'Commander', exact: true }) }).tap();
  assert.equal((await saved()).counters.commander, true);
  // The switches come in the order Commander, Poison, Energy, Experience, Rad, Mana pool, and each saves at once too.
  // Auto-empty follows them, shown only while Mana pool is on and Turns isn't Off.
  assert.deepEqual(await page.locator('#track [role="switch"]').evaluateAll(inputs => inputs.map(input => input.closest('label').textContent.trim())),
    ['Commander', 'Poison', 'Energy', 'Experience', 'Rad', 'Mana pool', 'Empty mana pools when the turn passes']);
  assert.ok(await page.locator('#auto-empty-row').isHidden(), 'auto-empty is hidden with Mana pool off');
  for (const name of ['Rad', 'Energy']) await page.locator('#track label', { has: page.getByRole('switch', { name, exact: true }) }).tap();
  assert.deepEqual((await saved()).counters, { commander: true, poison: true, energy: true, experience: false, rad: true });
  // Escape goes back to setup too, where Track sums up what's on, in the same order.
  await page.keyboard.press('Escape');
  await eventually(() => openDialogs(page), ['setup'], 'Escape returns to setup');
  assert.deepEqual(await sums(['sword', 'infect', 'energy', 'rad']), ['sword', 'infect', 'energy', 'rad'], 'Track shows the icons of the trackers that are on');
  await button(page, 'Track').tap();
  await page.locator('#track label', { has: page.getByRole('switch', { name: 'Experience', exact: true }) }).tap();
  await button(page, 'Back to setup').tap();
  await eventually(() => sums(['sword', 'infect', 'energy', 'graduation-cap', 'rad']), ['sword', 'infect', 'energy', 'graduation-cap', 'rad']);

  // ✕ in Track closes everything.
  await button(page, 'Track').tap();
  await button(page, 'Close setup').tap();
  await eventually(() => openDialogs(page), [], '✕ closes setup and Track');

  if (engine === chromium) {
    // Android back goes from Track to setup, then closes setup.
    const back = () => page.evaluate(() => window.closeOpenDialog());
    await button(page, 'Game setup').tap();
    await button(page, 'Track').tap();
    await eventually(() => openDialogs(page), ['track']);
    assert.equal(await back(), true);
    await eventually(() => openDialogs(page), ['setup'], 'back returns from Track to setup');
    assert.equal(await page.evaluate(() => window.backHandling.at(-1)), true, 'back is still handled by the page');
    assert.equal(await back(), true);
    await eventually(() => openDialogs(page), [], 'back again closes setup');
    await eventually(() => page.evaluate(() => window.backHandling.at(-1)), false, 'back goes to the system at rest');
  }
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: Track holds the tracker switches and returns to setup`, { timeout: 60000 }, t => checkTrack(t, engine));
}

// The Track row keeps its label whole and its caret inside the row, however many trackers are on
// (design/polish/FINAL-REVIEW.md #4): the summary shows as many icons as fit beside "Track", at most three, then "+N".
// Its icon is a checklist, not the flag that marks Rounds and the first player (#18).
async function checkTrackRow(t, engine) {
  const page = await openPage(t, engine);
  await fakeScreenOrientation(page);
  await page.goto(app);
  await page.evaluate(() => localStorage.setItem('lifepod-game', JSON.stringify({
    startingLife: 40, scores: [40, 40, 40, 40], manaPool: true, turns: 'rounds', turn: { first: 0, active: 0, round: 1 },
    counters: { commander: true, poison: true, energy: true, experience: true, rad: true },
  })));
  await page.reload();
  for (const [width, height, angle] of [[952, 427, 90], [852, 393, 90], [640, 360, 90], [568, 320, 90], [375, 667, 0]]) {
    await turnScreen(page, width, height, angle);
    await button(page, 'Game setup').tap();
    const row = await page.locator('#track-button').evaluate((track) => {
      const box = node => node.getBoundingClientRect();
      const inside = (node) => {
        const outer = box(track);
        const inner = box(node);
        return inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5;
      };
      const label = track.querySelector('.nav-label');
      const summary = track.querySelector('.nav-summary');
      const items = [...summary.children].filter(item => item.checkVisibility());
      // The label's text at its natural width.
      const range = document.createRange();
      range.selectNodeContents(label);
      return {
        label: label.textContent,
        whole: label.clientWidth >= Math.floor(range.getBoundingClientRect().width) && label.scrollWidth <= label.clientWidth,
        caret: inside(track.querySelector('.caret')),
        summary: summary.offsetWidth === 0 || (inside(summary) && summary.scrollWidth <= summary.clientWidth + 0.5),
        icons: items.filter(item => !item.matches('.more')).length,
        more: items.find(item => item.matches('.more'))?.textContent ?? '',
        flag: track.querySelector(':scope > svg path').getAttribute('d').startsWith('M232,56V176'),
      };
    });
    const view = `${width} × ${height}`;
    assert.deepEqual([row.label, row.whole, row.caret, row.summary, row.flag], ['Track', true, true, true, false],
      `${view}: "Track" shows whole, with the caret and the summary inside the row and a checklist icon`);
    if (width > 480) {
      assert.ok(row.icons >= 1 && row.icons <= 3, `${view}: one to three icons (${row.icons})`);
      assert.equal(row.more, `+${7 - row.icons}`, `${view}: "+N" counts the rest of the seven`);
    }
    await button(page, 'Close setup').tap();
  }
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: the Track row keeps its label and caret with every tracker on`, { timeout: 60000 }, t => checkTrackRow(t, engine));
}

// About scrolls on short screens, with a fade along the bottom while there's more below, gone once the end is reached
// (design/polish/FINAL-REVIEW.md #20).
async function checkAboutCue(t, engine) {
  const page = await openPage(t, engine);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(app);
  const cue = () => page.locator('#privacy').evaluate(dialog => ({
    scrolls: dialog.scrollHeight > dialog.clientHeight + 1,
    more: dialog.querySelector('.scroll-cue').hasAttribute('data-more'),
  }));
  await button(page, 'Game setup').tap();
  await button(page, 'About').tap();
  assert.deepEqual(await cue(), { scrolls: true, more: true }, 'at 952 × 427 About scrolls, and the fade says there is more');
  await page.locator('#privacy').evaluate((dialog) => { dialog.scrollTop = dialog.scrollHeight; });
  await page.waitForFunction(() => !document.querySelector('#privacy .scroll-cue').hasAttribute('data-more'));
  assert.deepEqual(await cue(), { scrolls: true, more: false }, 'at the end the fade goes');
  await page.locator('#privacy').evaluate((dialog) => { dialog.scrollTop = 0; });
  await page.waitForFunction(() => document.querySelector('#privacy .scroll-cue').hasAttribute('data-more'));
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: About shows a fade while there's more to read`, t => checkAboutCue(t, engine));
}
