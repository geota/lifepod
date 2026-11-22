import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, webkit } from 'playwright-core';
import { app, button, fakeScreenOrientation, startGame, turnScreen } from './helpers.mjs';

// Today's six seat panels, which stay the defaults: Sage, Sky, Coral, Violet, Amber and Teal.
const defaultPanels = ['rgb(47, 67, 47)', 'rgb(44, 67, 82)', 'rgb(67, 42, 39)', 'rgb(52, 43, 65)', 'rgb(74, 64, 36)', 'rgb(29, 58, 54)'];
const rosePanels = { top: 'rgb(87, 49, 71)', bottom: 'rgb(72, 35, 57)' };
const orchidTopPanel = 'rgb(80, 50, 87)';

const tile = (page, number) => page.locator(`.player:nth-child(${number})`);
const swatch = (page, number, name) => tile(page, number).getByRole('button', { name, exact: true });
const panels = page => page.locator('.player').evaluateAll(players => players.map(player => getComputedStyle(player).backgroundColor));
const colours = page => page.locator('.player').evaluateAll(players => players.map(player => player.dataset.colour));

async function openPage(t, engine) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no script errors'));
  await fakeScreenOrientation(page);
  await page.goto(app);
  return page;
}

async function openColours(page) {
  await button(page, 'Game setup').tap();
  await button(page, 'Colours').tap();
}

// Chromium writes page storage in the background, so give a write a moment to land before a reload.
async function reload(page) {
  await page.waitForTimeout(500);
  await page.reload();
}

async function checkColours(t, engine) {
  const page = await openPage(t, engine);
  await turnScreen(page, 852, 393, 90);
  await startGame(page, 6);
  assert.deepEqual(await panels(page), defaultPanels, 'the six seat palettes are the defaults');

  // Every tile shows the twelve swatches facing its player, and Colours holds nothing else. Another player's colour
  // is taken.
  await openColours(page);
  assert.equal(await page.locator('#board').getAttribute('data-mode'), 'colours');
  assert.ok(await button(page, 'Done choosing colours').isVisible());
  assert.ok(!(await button(page, 'Roll dice').isVisible()), 'only the check mark stays in the centre');
  assert.equal(await page.locator('.player .swatch').count(), 72);
  assert.equal(await page.locator('.mode-layer button:not(.swatch)').count(), 0, 'no identity toggles in Colours');
  assert.deepEqual(await tile(page, 1).locator('.swatch').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label').split(',')[0])),
    ['Sage', 'Sky', 'Coral', 'Violet', 'Amber', 'Teal', 'Rose', 'Indigo', 'Slate', 'Copper', 'Olive', 'Orchid']);
  assert.equal(await swatch(page, 1, 'Sage').getAttribute('aria-pressed'), 'true');
  assert.ok(await swatch(page, 2, 'Sage, taken by Player 1').isDisabled(), 'player 1’s colour is taken for player 2');
  assert.equal(await tile(page, 1).locator('.swatch:disabled').count(), 5, 'five colours are taken by the others');
  // A taken swatch keeps its full colour, with no strike, and shows its owner in the seat colour in place of the dot.
  const looks = name => swatch(page, 2, name).evaluate((button) => {
    const style = getComputedStyle(button);
    const tag = button.querySelector('.owner');
    return {
      text: button.textContent, opacity: style.opacity, background: style.backgroundColor,
      dot: getComputedStyle(button, '::before').content, strike: getComputedStyle(button, '::after').content,
      tag: tag && { color: getComputedStyle(tag).color, opacity: getComputedStyle(tag).opacity, hidden: tag.getAttribute('aria-hidden') },
    };
  });
  assert.deepEqual(await looks('Sage, taken by Player 1'), {
    text: 'P1', opacity: '1', background: 'rgb(47, 67, 47)', dot: 'none', strike: 'none',
    tag: { color: 'rgb(211, 238, 170)', opacity: '1', hidden: 'true' },
  });
  assert.deepEqual(await looks('Rose'), { text: '', opacity: '1', background: rosePanels.top, dot: '""', strike: 'none', tag: null });
  assert.ok(!(await tile(page, 1).locator('.subtract').isVisible()), 'the life controls make way for the swatches');

  // Player 1 picks Rose. Sage frees up and Rose is taken for everyone else.
  await swatch(page, 1, 'Rose').tap();
  assert.equal((await panels(page))[0], rosePanels.top);
  assert.equal(await swatch(page, 1, 'Rose').getAttribute('aria-pressed'), 'true');
  assert.ok(await swatch(page, 4, 'Rose, taken by Player 1').isDisabled());
  assert.ok(!(await swatch(page, 4, 'Sage').isDisabled()), 'sage is free again');
  assert.equal(await swatch(page, 4, 'Sage').textContent(), '', 'a freed swatch drops its owner');
  assert.equal(await swatch(page, 4, 'Rose, taken by Player 1').textContent(), 'P1');

  // A press on a taken swatch changes nothing, even if it reaches the button.
  await swatch(page, 4, 'Rose, taken by Player 1').evaluate(taken => {
    taken.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, button: 0 }));
    taken.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  assert.deepEqual(await colours(page), ['rose', 'sky', 'coral', 'violet', 'amber', 'teal'], 'no two players share a colour');

  // Player 3, in the bottom row, takes Sage in its darker version.
  await swatch(page, 3, 'Sage').tap();
  assert.equal((await panels(page))[2], 'rgb(37, 55, 37)');

  // The new hues work like the rest: Orchid is taken for everyone else while Player 5 has it.
  await swatch(page, 5, 'Orchid').tap();
  assert.equal((await panels(page))[4], orchidTopPanel);
  assert.ok(await swatch(page, 6, 'Orchid, taken by Player 5').isDisabled());
  assert.equal(await tile(page, 6).locator('.swatch:not(:disabled)').count(), 7, 'seven of twelve are free with six players');
  await swatch(page, 5, 'Amber').tap();
  assert.deepEqual(await colours(page), ['rose', 'sky', 'sage', 'violet', 'amber', 'teal'], 'no two players share a colour');

  // The swatches fit the smallest phone at six players: whole 44px targets inside each tile, clear of the check mark.
  await turnScreen(page, 320, 568, 0);
  const fit = await page.evaluate(() => {
    const controls = document.querySelector('#board-controls').getBoundingClientRect();
    // The visible disc is inset 6px inside the 48px button.
    const disc = { left: controls.left + 6, right: controls.right - 6, top: controls.top + 6, bottom: controls.bottom - 6 };
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return [...document.querySelectorAll('.player')].flatMap((player, index) => {
      const bounds = player.getBoundingClientRect();
      return [...player.querySelectorAll('.swatch')].map(button => {
        const box = button.getBoundingClientRect();
        const problems = [];
        if (Math.min(box.width, box.height) < 43.5) problems.push(`${Math.round(box.width)}×${Math.round(box.height)}`);
        if (box.left < bounds.left - 0.5 || box.right > bounds.right + 0.5 || box.top < bounds.top - 0.5 || box.bottom > bounds.bottom + 0.5) {
          problems.push('outside its tile');
        }
        if (overlaps(box, disc)) problems.push('under the check mark');
        return problems.length ? `P${index + 1} ${button.getAttribute('aria-label')}: ${problems.join(', ')}` : '';
      }).filter(Boolean);
    });
  });
  assert.deepEqual(fit, [], 'every swatch fits at 320 × 568');

  // The check mark ends the mode, and the choices are saved.
  await button(page, 'Done choosing colours').tap();
  assert.equal(await page.locator('#board').getAttribute('data-mode'), null);
  assert.ok(await tile(page, 1).locator('.subtract').isVisible());
  await reload(page);
  await turnScreen(page, 852, 393, 90);
  assert.deepEqual(await colours(page), ['rose', 'sky', 'sage', 'violet', 'amber', 'teal'], 'colours survive a reload');

  // A new game keeps the colours.
  await button(page, 'Game setup').tap();
  await button(page, 'New game').tap();
  await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  // The restart dialog's close event, which starts the game, runs after the tap.
  await page.waitForFunction(() => !document.querySelector('#restart').open);
  await page.waitForTimeout(100);
  assert.deepEqual(await colours(page), ['rose', 'sky', 'sage', 'violet', 'amber', 'teal'], 'a new game keeps the colours');

  // Fewer players keep their colours. When a seat comes back and its default is taken, it gets the first free one.
  await startGame(page, 4);
  assert.deepEqual(await colours(page), ['rose', 'sky', 'sage', 'violet']);
  await openColours(page);
  await swatch(page, 1, 'Teal').tap();
  await button(page, 'Done choosing colours').tap();
  await startGame(page, 6);
  assert.deepEqual(await colours(page), ['teal', 'sky', 'sage', 'violet', 'amber', 'coral']);
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: each player picks a tile colour no one else has`, { timeout: 60000 }, t => checkColours(t, engine));
}

test('chromium: saved colours are checked when a game loads', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const load = async (saved) => {
    await page.evaluate(game => localStorage.setItem('lifepod-game', JSON.stringify(game)), saved);
    await page.reload();
    return colours(page);
  };
  await page.goto(app);
  const game = { startingLife: 40, scores: [40, 40, 40, 40], rotations: [0, 0, 0, 0], keepAwake: true, landscapeAngle: 90 };
  assert.deepEqual(await load(game), ['sage', 'sky', 'coral', 'violet'], 'a save from before colours loads the defaults');
  assert.deepEqual(await load({ ...game, colors: [5, 5, 'x', 99] }), ['teal', 'sky', 'coral', 'violet'],
    'duplicates and unknown values fall back to a free colour');
  assert.deepEqual(await load({ ...game, colors: [1, 0, 8, 7] }), ['sky', 'sage', 'slate', 'indigo']);
  assert.deepEqual(await load({ ...game, colors: 'rose' }), ['sage', 'sky', 'coral', 'violet']);
  assert.deepEqual(await load({ ...game, colors: [2] }), ['coral', 'sky', 'sage', 'violet'], 'a short list is filled in');
  assert.deepEqual(await load({ ...game, colors: [9, 10, 11, 0] }), ['copper', 'olive', 'orchid', 'sage'], 'the twelve swatches are 0–11');
  assert.deepEqual(await load({ ...game, colors: [12, 11, 11, 3] }), ['sage', 'orchid', 'coral', 'violet'], 'there is no thirteenth');
});

// Every swatch is a whole 44px target inside its tile and clear of the check mark, at every player count from the
// target phone to the stress size.
test('chromium: Colours fits every player count', { timeout: 60000 }, async (t) => {
  const page = await openPage(t, chromium);
  for (const [width, height, angle] of [[952, 427, 90], [852, 393, 90], [640, 360, 90], [568, 320, 90], [320, 568, 0]]) {
    await turnScreen(page, width, height, angle);
    for (const players of [2, 3, 4, 5, 6]) {
      await startGame(page, players);
      await openColours(page);
      const problems = await page.evaluate(() => {
        const controls = document.querySelector('#board-controls').getBoundingClientRect();
        const disc = { left: controls.left + 6, right: controls.right - 6, top: controls.top + 6, bottom: controls.bottom - 6 };
        const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        return [...document.querySelectorAll('.player')].flatMap((player, index) => {
          const bounds = player.getBoundingClientRect();
          const targets = [...player.querySelectorAll('.mode-layer button')].filter(target => target.offsetParent);
          const issues = [...targets, player.querySelector('.layer-hint')].filter(node => node?.offsetParent).map((node) => {
            const box = node.getBoundingClientRect();
            const found = [];
            if (node.matches('button') && Math.min(box.width, box.height) < 43.5) found.push(`${Math.round(box.width)}×${Math.round(box.height)}`);
            if (box.left < bounds.left - 0.5 || box.right > bounds.right + 0.5 || box.top < bounds.top - 0.5 || box.bottom > bounds.bottom + 0.5) found.push('outside its tile');
            if (overlaps(box, disc)) found.push('under the check mark');
            return found.length ? `P${index + 1} ${node.getAttribute('aria-label') ?? node.textContent}: ${found.join(', ')}` : '';
          }).filter(Boolean);
          if (targets.length !== 12) issues.push(`P${index + 1} has ${targets.length} targets`);
          return issues;
        });
      });
      assert.deepEqual(problems, [], `${players} players, ${width} × ${height}`);
      await button(page, 'Done choosing colours').tap();
    }
  }
});

test('chromium: Android back closes the colours mode', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ isMobile: true, hasTouch: true, viewport: { width: 852, height: 393 } });
  // A stand-in for the Android app's bridge. It keeps the game in session storage and records back handling.
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
  assert.equal(await handling(), false, 'back leaves the app at rest');
  await openColours(page);
  assert.equal(await handling(), true, 'back is handled while the mode is open');
  await swatch(page, 2, 'Slate').tap();
  assert.equal(await back(), true);
  assert.equal(await page.locator('#board').getAttribute('data-mode'), null, 'back closes the mode');
  assert.equal(await handling(), false);
  assert.equal(await back(), false, 'back at rest leaves the app');
  assert.equal(JSON.parse(await page.evaluate(() => sessionStorage.getItem('game'))).colors[1], 8, 'the choice is kept');
});
