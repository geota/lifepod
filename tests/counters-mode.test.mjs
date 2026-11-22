import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { chromium, webkit } from 'playwright-core';
import { app, button, fakeScreenOrientation, startGame, turnScreen } from './helpers.mjs';

const tile = (page, number) => page.locator(`.player:nth-child(${number})`);
const count = (page, number, kind) => tile(page, number).locator(`.counter-value[data-kind="${kind}"] b`).textContent();
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

async function setSwitches(page, wanted) {
  await button(page, 'Game setup').tap();
  for (const [name, on] of Object.entries(wanted)) {
    const input = page.getByRole('switch', { name, exact: true });
    if ((await input.isChecked()) !== on) await page.locator('#setup label', { has: input }).tap();
  }
  await button(page, 'Close setup').tap();
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

  // With only Poison on, each tile has a poison row and the colour button.
  await button(page, 'Counters').tap();
  assert.equal(await mode(page), 'counters');
  assert.equal(await page.locator('.counter-row').count(), 4);
  assert.equal(await count(page, 1, 'poison'), '0');
  assert.ok(await button(page, 'Undo').isDisabled(), 'Undo is dimmed until something changes');
  assert.ok(!(await button(page, 'Roll dice').isVisible()) && !(await button(page, 'Game setup').isVisible()));
  await button(page, 'Cancel').tap();
  assert.equal(await mode(page), null, '✕ with no changes closes straight away');
  assert.ok(!(await isOpen(page, 'discard')));

  // Commander adds a tax row. Tax + adds one cast, shown as 2 × casts.
  await setSwitches(page, { Commander: true });
  await button(page, 'Counters').tap();
  assert.equal(await page.locator('.counter-row').count(), 8);
  await button(page, 'Add one poison counter to Player 3').tap();
  await button(page, 'Add one poison counter to Player 3').tap();
  await button(page, 'Add one commander cast for Player 1').tap();
  await button(page, 'Add one commander cast for Player 1').tap();
  assert.equal(await count(page, 3, 'poison'), '2');
  assert.equal(await count(page, 1, 'casts'), '+4');
  // − at 0 does nothing and isn't a change.
  await button(page, 'Remove one poison counter from Player 2').tap();
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

  // Holding + repeats, like the life buttons.
  const plus = await button(page, 'Add one poison counter to Player 4').boundingBox();
  await page.mouse.move(plus.x + plus.width / 2, plus.y + plus.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  const held = Number(await count(page, 4, 'poison'));
  assert.ok(held >= 4, `a hold repeats: ${held}`);
  await button(page, 'Add one commander cast for Player 2').tap();

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

// Colour identity is set in Setup → Colours, beside the swatches, each player facing their own seat. Counters
// mode only holds poison and tax.
async function checkIdentity(t, engine) {
  const page = await openPage(t, engine);
  await fakeScreenOrientation(page);
  await page.goto(app);
  await turnScreen(page, 852, 393, 90);
  const openColours = async () => {
    await button(page, 'Game setup').tap();
    await button(page, 'Colours').tap();
  };
  const pressed = (scope) => scope.locator('.identity-toggle[aria-pressed="true"]').evaluateAll(toggles => toggles.map(toggle => toggle.value).join(''));

  // With Commander off, Colours shows only the swatches, and counters mode has no colour button.
  await setSwitches(page, { Poison: true });
  await openColours(page);
  assert.equal(await page.locator('.player .swatch').count(), 36);
  assert.equal(await page.locator('.player :is(.identity, .identity-button)').count(), 0, 'no identity without Commander');
  await button(page, 'Done choosing colours').tap();
  await button(page, 'Counters').tap();
  assert.equal(await page.locator('.mode-layer button').count(), 8, 'only the poison steppers');
  assert.equal(await page.locator('.palette-button, .mode-layer .swatch, .mode-layer .identity-toggle').count(), 0, 'no colour button in counters mode');
  await button(page, 'Cancel').tap();

  // With Commander on, a 4-player tile has room for the five toggles beside its swatches.
  await setSwitches(page, { Commander: true });
  await button(page, 'Counters').tap();
  assert.equal(await page.locator('.mode-layer button').count(), 16, 'poison and tax steppers only');
  await button(page, 'Cancel').tap();
  await openColours(page);
  const group = page.getByRole('group', { name: 'Colour identity for Player 3' });
  assert.ok(await group.isVisible(), 'the toggles sit on the tile');
  assert.equal(await page.locator('.identity-button:visible').count(), 0);
  assert.deepEqual(await group.getByRole('button').evaluateAll(toggles => toggles.map(toggle => toggle.getAttribute('aria-label'))),
    ['White', 'Blue', 'Black', 'Red', 'Green'], 'five colours, no colourless');
  // Every pip is that colour's mana symbol from the bundled Mana font, at full colour even when unchosen.
  await page.evaluate(() => document.fonts.ready);
  const pips = await group.locator('.pip').evaluateAll(nodes => nodes.map(pip => {
    const symbol = getComputedStyle(pip, '::before');
    return `${getComputedStyle(pip).opacity} ${symbol.fontFamily} ${symbol.content.codePointAt(1).toString(16)} ${getComputedStyle(pip).backgroundColor}`;
  }));
  // Each symbol sits on the colour it's printed with.
  assert.deepEqual(pips, ['1 Mana e600 rgb(253, 251, 206)', '1 Mana e601 rgb(188, 218, 247)', '1 Mana e602 rgb(167, 153, 158)',
    '1 Mana e603 rgb(241, 155, 121)', '1 Mana e604 rgb(159, 203, 166)'], `pips: ${pips}`);
  assert.ok(await page.evaluate(() => document.fonts.check('16px Mana', '\ue600')), 'the Mana font loads from the app');
  // Each tile's toggles face its player, like the swatches.
  const facing = await page.locator('.player .identity').evaluateAll(groups => groups.map(node => Math.round(new DOMMatrixReadOnly(getComputedStyle(node.closest('.player-face')).transform).a)));
  assert.deepEqual(facing, [-1, -1, 1, 1]);
  for (const name of ['Black', 'Blue', 'Red', 'Green', 'White']) await group.getByRole('button', { name }).tap();
  assert.equal(await pressed(group), 'WUBRG', 'all five can be chosen');
  for (const name of ['Blue', 'Black', 'Red']) await group.getByRole('button', { name }).tap();
  assert.equal(await pressed(group), 'WG');
  assert.equal(await pressed(page.getByRole('group', { name: 'Colour identity for Player 1' })), '', 'only that player changes');
  // A choice is saved at once, like a colour, and the check mark ends the mode.
  await reload(page);
  await turnScreen(page, 852, 393, 90);
  assert.equal(await nearBadges(page, 3), 'colour identity white, green', 'saved, and shown in W U B R G order');
  // At rest the identity is the colour indicator printed on cards, split two ways.
  assert.deepEqual(await tile(page, 3).locator('.badges.near .chip.ci-chip .ci').evaluate(node => [node.dataset.ci, getComputedStyle(node, '::before').content]),
    ['WG', '"\ue98b"']);
  // White-green is Selesnya, so the guild's symbol shows faintly behind the tile in place of the rings.
  assert.deepEqual(await tile(page, 3).evaluate(player => [player.dataset.watermark, getComputedStyle(player.querySelector('.player-face'), '::before').content]),
    ['WG', '"\ue914"']);
  assert.equal(await tile(page, 1).getAttribute('data-watermark'), null, 'no identity keeps the rings');

  // Six players on the smallest phone: the tiles are too small for the toggles, so a 44px identity button beside
  // the swatches opens the player sheet, facing that player, with identity only.
  await turnScreen(page, 320, 568, 0);
  await startGame(page, 6);
  await openColours(page);
  assert.equal(await page.locator('.player .identity:visible').count(), 0);
  assert.equal(await page.locator('.identity-button:visible').count(), 6);
  const identityButton = button(page, 'Colour identity for Player 3: white, green');
  await identityButton.tap();
  assert.ok(await isOpen(page, 'player-sheet'));
  const sheet = page.locator('#player-sheet');
  assert.equal(await sheet.locator('.swatch').count(), 0, 'the sheet holds identity only');
  assert.equal(await pressed(sheet), 'WG');
  await sheet.getByRole('button', { name: 'Black' }).tap();
  assert.equal(await pressed(sheet), 'WBG');
  await sheet.getByRole('button', { name: 'Done' }).tap();
  assert.ok(!(await isOpen(page, 'player-sheet')));
  assert.ok(await button(page, 'Colour identity for Player 3: white, black, green').isVisible(), 'the button shows the new identity');
  // The button shows the identity as a colour indicator, split three ways.
  assert.deepEqual(await page.locator('.identity-button[data-player="2"] .ci').evaluate(node => [node.dataset.ci, node.dataset.count, getComputedStyle(node, '::before').content]),
    ['WBG', '3', '"\ue98c"']);
  assert.equal(await page.locator('.identity-button[data-player="5"] .ci').getAttribute('data-ci'), '', 'an empty ring with no identity');
  // Each sheet fits whichever way it faces, and Android back closes it before the mode.
  for (const number of [1, 3, 5]) {
    await page.locator(`.identity-button[data-player="${number - 1}"]`).tap();
    const box = await sheet.boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 320 && box.y + box.height <= 568, `player ${number}’s sheet fits: ${JSON.stringify(box)}`);
    assert.equal(await page.evaluate(() => window.closeOpenDialog()), true);
    assert.ok(!(await isOpen(page, 'player-sheet')));
    assert.equal(await mode(page), 'colours');
  }
  await button(page, 'Done choosing colours').tap();
  await reload(page);
  await turnScreen(page, 320, 568, 0);
  assert.equal(await nearBadges(page, 3), 'colour identity white, black, green', 'a sheet choice is saved at once too');

  // A new game resets the counts and keeps the switches, colours and identities.
  await button(page, 'Counters').tap();
  await button(page, 'Add one poison counter to Player 3').tap();
  await button(page, 'Save').tap();
  await button(page, 'Game setup').tap();
  await button(page, 'New game').tap();
  await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  await eventually(() => nearBadges(page, 3), 'colour identity white, black, green', 'a new game resets poison and keeps the identity');
  await button(page, 'Counters').tap();
  assert.equal(await count(page, 3, 'poison'), '0');
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: colour identity is set beside the swatches in Colours`, { timeout: 60000 }, t => checkIdentity(t, engine));
}

// Every swatch, toggle and identity button is a whole 44px target inside its tile and clear of the check mark,
// at every player count on the smallest phone and on a common landscape one.
test('chromium: Colours with identity fits every player count', { timeout: 60000 }, async (t) => {
  const page = await openPage(t, chromium);
  await fakeScreenOrientation(page);
  await page.goto(app);
  await setSwitches(page, { Commander: true });
  for (const [width, height, angle] of [[320, 568, 0], [852, 393, 90]]) {
    await turnScreen(page, width, height, angle);
    for (const players of [2, 3, 4, 5, 6]) {
      await startGame(page, players);
      await button(page, 'Game setup').tap();
      await button(page, 'Colours').tap();
      const problems = await page.evaluate(() => {
        const controls = document.querySelector('#board-controls').getBoundingClientRect();
        const disc = { left: controls.left + 6, right: controls.right - 6, top: controls.top + 6, bottom: controls.bottom - 6 };
        const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        return [...document.querySelectorAll('.player')].flatMap((player, index) => {
          const bounds = player.getBoundingClientRect();
          const targets = [...player.querySelectorAll('.mode-layer button')].filter(target => target.offsetParent);
          const issues = targets.map((target) => {
            const box = target.getBoundingClientRect();
            const found = [];
            if (Math.min(box.width, box.height) < 43.5) found.push(`${Math.round(box.width)}×${Math.round(box.height)}`);
            if (box.left < bounds.left - 0.5 || box.right > bounds.right + 0.5 || box.top < bounds.top - 0.5 || box.bottom > bounds.bottom + 0.5) found.push('outside its tile');
            if (overlaps(box, disc)) found.push('under the check mark');
            return found.length ? `P${index + 1} ${target.getAttribute('aria-label')}: ${found.join(', ')}` : '';
          }).filter(Boolean);
          // Nine swatches, and either five toggles or the identity button.
          if (targets.length !== 14 && targets.length !== 10) issues.push(`P${index + 1} has ${targets.length} targets`);
          return issues;
        });
      });
      assert.deepEqual(problems, [], `${players} players, ${width} × ${height}`);
      await button(page, 'Done choosing colours').tap();
    }
  }
});

test('chromium: counters mode fits six players on the smallest phone', { timeout: 60000 }, async (t) => {
  const page = await openPage(t, chromium, { viewport: { width: 852, height: 393 } });
  await fakeScreenOrientation(page);
  await page.goto(app);
  await setSwitches(page, { Commander: true, Poison: true });
  await turnScreen(page, 320, 568, 0);
  await startGame(page, 6);
  await button(page, 'Counters').tap();
  const problems = await page.evaluate(() => {
    const controls = document.querySelector('#board-controls').getBoundingClientRect();
    const pill = { left: controls.left + 6, right: controls.right - 6, top: controls.top + 6, bottom: controls.bottom - 6 };
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return [...document.querySelectorAll('.player')].flatMap((player, index) => {
      const bounds = player.getBoundingClientRect();
      return [...player.querySelectorAll('.mode-layer button')].map((target) => {
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
  assert.equal(await page.locator('.mode-layer button').count(), 24, 'two rows of steppers per tile');

  // Setup with the Counters group still fits the smallest landscape phone.
  await button(page, 'Cancel').tap();
  await turnScreen(page, 568, 320, 90);
  await button(page, 'Game setup').tap();
  const setupBox = await page.locator('#setup').boundingBox();
  assert.ok(setupBox.y >= 0 && setupBox.y + setupBox.height <= 320, `setup fits: ${JSON.stringify(setupBox)}`);
});

// Game setup fits landscape phones without scrolling, from the smallest to a Pixel 10 Pro, with both Counters
// switches, New game and Done on screen.
async function checkSetupFits(t, engine) {
  const page = await openPage(t, engine);
  await fakeScreenOrientation(page);
  await page.goto(app);
  for (const [width, height] of [[952, 427], [852, 393], [568, 320]]) {
    await turnScreen(page, width, height, 90);
    await button(page, 'Game setup').tap();
    const problems = await page.locator('#setup').evaluate((dialog) => {
      const found = [];
      if (dialog.scrollHeight > dialog.clientHeight + 0.5) found.push(`scrolls ${dialog.scrollHeight} > ${dialog.clientHeight}`);
      const sheet = dialog.getBoundingClientRect();
      if (sheet.top < 0 || sheet.bottom > window.innerHeight) found.push(`sheet ${sheet.top}–${sheet.bottom}`);
      for (const selector of ['label:has(#commander-switch)', 'label:has(#poison-switch)', '#restart-button', '#save-setup']) {
        const box = dialog.querySelector(selector).getBoundingClientRect();
        if (box.top < sheet.top || box.bottom > sheet.bottom || box.left < sheet.left || box.right > sheet.right) found.push(`${selector} off the sheet`);
      }
      return found;
    });
    assert.deepEqual(problems, [], `${width} × ${height}`);
    await button(page, 'Close setup').tap();
  }
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: game setup fits landscape phones without scrolling`, { timeout: 60000 }, t => checkSetupFits(t, engine));
}

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
  await button(page, 'Add one poison counter to Player 2').tap();
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
      const near = [...document.querySelectorAll('.badges.near')]
        .map(row => (row.hidden ? '' : [...row.children].map(chip => chip.textContent).join(' | ')));
      return { counters: !document.querySelector('#counters-button').hidden, near };
    });
  };
  const game = { startingLife: 40, scores: [40, 40, 40, 40], rotations: [0, 0, 0, 0], keepAwake: true, landscapeAngle: 90 };
  assert.deepEqual(await load(game), { counters: false, near: ['', '', '', ''] }, 'a save from before counters loads with them off');
  assert.deepEqual(await load({
    ...game, counters: { commander: true, poison: 'yes' }, poison: [3, -1, 1.5, 100], casts: [2, 'x'], identities: ['BU', 'CW', 7, 'Q'],
  }), { counters: true, near: ['colour identity blue, black | Commander tax +4', '', '', ''] },
  'bad counts start at 0, bad identities are cleared, and only a true switch is on');
  // Colourless was removed: a saved 'C', or anything with C in it, loads as no identity.
  assert.deepEqual((await load({ ...game, counters: { commander: true }, identities: ['C', 'GRBUW', 'UC', 'WW'] })).near,
    ['', 'colour identity white, blue, black, red, green', '', 'colour identity white']);
  assert.deepEqual((await load({ ...game, counters: { poison: true }, poison: [3, 0, 0, 99] })).near, ['3 poison', '', '', '99 poison']);
});
