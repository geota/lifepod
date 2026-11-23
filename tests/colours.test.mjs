import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import {
  backHandling, button, engines, eventually, openPage, reload, saved, savedGame, seedGame, startGame, test, tileProblems, token, turnScreen,
} from './helpers.mjs';

// A swatch's palette as styles.css sets it for the page's tile set: players 1, 2 and 5 sit in the top row and use
// its lighter version, and players 3, 4 and 6 the darker bottom-row one.
const palette = (page, colour, row, part = 'panel') => token(page, `--${colour}-${row}-${part}`);
// Today's six seat panels, which stay the defaults: Sage, Sky, Coral, Violet, Amber and Teal.
const defaultPanels = page => Promise.all([['sage', 'top'], ['sky', 'top'], ['coral', 'bottom'], ['violet', 'bottom'], ['amber', 'top'], ['teal', 'bottom']]
  .map(([colour, row]) => palette(page, colour, row)));

const tile = (page, number) => page.locator(`.player:nth-child(${number})`);
const swatch = (page, number, name) => tile(page, number).getByRole('button', { name, exact: true });
const panels = page => page.locator('.player').evaluateAll(players => players.map(player => getComputedStyle(player).backgroundColor));
const colours = page => page.locator('.player').evaluateAll(players => players.map(player => player.dataset.colour));

function openClassic(t, engine, options = {}) {
  // These checks are written against Classic's palettes and names.
  return openPage(t, engine, { orientation: true, tiles: 'classic', ...options });
}

async function openColours(page) {
  await button(page, 'Settings').tap();
  await button(page, 'Choose tile colours on the board').tap();
}

async function checkColours(t, engine) {
  const page = await openClassic(t, engine);
  await turnScreen(page, 852, 393, 90);
  await startGame(page, 6);
  assert.deepEqual(await panels(page), await defaultPanels(page), 'the six seat palettes are the defaults');

  // Every tile shows the twelve swatches facing its player, and Colours holds nothing else. Another player's colour
  // is taken.
  await openColours(page);
  assert.equal(await page.locator('#board').getAttribute('data-mode'), 'colours');
  assert.ok(await button(page, 'Done choosing colours').isVisible());
  assert.ok(!(await button(page, 'Roll dice').isVisible()), 'only the check mark stays in the centre');
  assert.equal(await page.locator('.player .swatch').count(), 72);
  assert.equal(await page.locator('.mode-layer button:not(.swatch)').count(), 0, 'no identity toggles in Colours');
  assert.deepEqual(await tile(page, 1).locator('.swatch').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label').replace(/^P\d, /, '').split(',')[0])),
    ['Sage', 'Sky', 'Coral', 'Violet', 'Amber', 'Teal', 'Rose', 'Indigo', 'Slate', 'Copper', 'Olive', 'Orchid']);
  assert.equal(await swatch(page, 1, 'Sage').getAttribute('aria-pressed'), 'true');
  assert.ok(await swatch(page, 2, 'P1, Sage, taken by Player 1').isDisabled(), 'player 1’s colour is taken for player 2');
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
  assert.deepEqual(await looks('P1, Sage, taken by Player 1'), {
    text: 'P1', opacity: '1', background: await palette(page, 'sage', 'top'), dot: 'none', strike: 'none',
    tag: { color: await palette(page, 'sage', 'top', 'seat'), opacity: '1', hidden: 'true' },
  });
  assert.deepEqual(await looks('Rose'), { text: '', opacity: '1', background: await palette(page, 'rose', 'top'), dot: '""', strike: 'none', tag: null });
  assert.ok(!(await tile(page, 1).locator('.subtract').isVisible()), 'the life controls make way for the swatches');

  // Player 1 picks Rose. Sage frees up and Rose is taken for everyone else.
  await swatch(page, 1, 'Rose').tap();
  assert.equal((await panels(page))[0], await palette(page, 'rose', 'top'));
  assert.equal(await swatch(page, 1, 'Rose').getAttribute('aria-pressed'), 'true');
  assert.ok(await swatch(page, 4, 'P1, Rose, taken by Player 1').isDisabled());
  assert.ok(!(await swatch(page, 4, 'Sage').isDisabled()), 'sage is free again');
  assert.equal(await swatch(page, 4, 'Sage').textContent(), '', 'a freed swatch drops its owner');
  assert.equal(await swatch(page, 4, 'P1, Rose, taken by Player 1').textContent(), 'P1');

  // A press on a taken swatch changes nothing, even if it reaches the button.
  await swatch(page, 4, 'P1, Rose, taken by Player 1').evaluate(taken => {
    taken.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, button: 0 }));
    taken.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  assert.deepEqual(await colours(page), ['rose', 'sky', 'coral', 'violet', 'amber', 'teal'], 'no two players share a colour');

  // Player 3, in the bottom row, takes Sage in its darker version.
  await swatch(page, 3, 'Sage').tap();
  assert.equal((await panels(page))[2], await palette(page, 'sage', 'bottom'));

  // The new hues work like the rest: Orchid is taken for everyone else while Player 5 has it.
  await swatch(page, 5, 'Orchid').tap();
  assert.equal((await panels(page))[4], await palette(page, 'orchid', 'top'));
  assert.ok(await swatch(page, 6, 'P5, Orchid, taken by Player 5').isDisabled());
  assert.equal(await tile(page, 6).locator('.swatch:not(:disabled)').count(), 7, 'seven of twelve are free with six players');
  await swatch(page, 5, 'Amber').tap();
  assert.deepEqual(await colours(page), ['rose', 'sky', 'sage', 'violet', 'amber', 'teal'], 'no two players share a colour');

  // The swatches fit the smallest phone at six players: whole 44px targets inside each tile, clear of the check mark.
  await turnScreen(page, 320, 568, 0);
  assert.equal(await page.locator('.player .swatch:visible').count(), 72, 'every swatch still shows');
  assert.deepEqual(await tileProblems(page, { targets: '.swatch' }), [], 'every swatch fits at 320 × 568');

  // The check mark ends the mode, and the choices are saved.
  await button(page, 'Done choosing colours').tap();
  assert.equal(await page.locator('#board').getAttribute('data-mode'), null);
  assert.ok(await tile(page, 1).locator('.subtract').isVisible());
  await reload(page);
  await turnScreen(page, 852, 393, 90);
  assert.deepEqual(await colours(page), ['rose', 'sky', 'sage', 'violet', 'amber', 'teal'], 'colours survive a reload');

  // A new game keeps the colours.
  await button(page, 'Settings').tap();
  await button(page, 'New game').tap();
  await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  // The restart dialog's close event, which starts the game and then closes settings, runs after the tap.
  await eventually(() => page.evaluate(() => document.querySelector('dialog[open]')?.id ?? null), null, 'the new game starts');
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

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: each player picks a tile colour no one else has`, { timeout: 60000 }, t => checkColours(t, engine));
}

test('chromium: saved colours are checked when a game loads', async (t) => {
  const page = await openPage(t, chromium);
  const load = async (game) => {
    await seedGame(page, game);
    return colours(page);
  };
  const game = savedGame(4);
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
  const page = await openClassic(t, chromium);
  for (const [width, height, angle] of [[952, 427, 90], [852, 393, 90], [640, 360, 90], [568, 320, 90], [320, 568, 0]]) {
    await turnScreen(page, width, height, angle);
    for (const players of [2, 3, 4, 5, 6]) {
      await startGame(page, players);
      await openColours(page);
      const view = `${players} players, ${width} × ${height}`;
      const targets = await page.locator('.player').evaluateAll(tiles => tiles.map(player =>
        [...player.querySelectorAll('.mode-layer button')].filter(target => target.offsetParent).length));
      assert.deepEqual(targets, Array(players).fill(12), `${view}: twelve targets on every tile`);
      assert.deepEqual(await tileProblems(page, { targets: '.mode-layer button', parts: '.layer-hint' }), [], view);
      await button(page, 'Done choosing colours').tap();
    }
  }
});

test('chromium: Android back closes the colours mode', async (t) => {
  const page = await openClassic(t, chromium, { viewport: { width: 852, height: 393 }, orientation: false, native: 'android' });
  const back = () => page.evaluate(() => window.closeOpenDialog());
  assert.deepEqual(await backHandling(page), [false], 'back leaves the app at rest');
  await openColours(page);
  // Opening settings turns back handling on, and so do the mode and then settings' close event, which runs after the tap.
  await eventually(() => backHandling(page), [false, true], 'back is handled while settings and then the mode are open');
  await swatch(page, 2, 'Slate').tap();
  assert.equal(await back(), true);
  assert.equal(await page.locator('#board').getAttribute('data-mode'), null, 'back closes the mode');
  assert.deepEqual(await backHandling(page), [false, true, false]);
  assert.equal(await back(), false, 'back at rest leaves the app');
  assert.equal((await saved(page)).colors[1], 8, 'the choice is kept');
});

// Rotated seats on short phones (design/polish/FINAL-REVIEW.md #5): a sideways face narrower than four swatches lays
// them out 3 wide × 4 tall, and every swatch and owner label stays inside its tile, clear of the check mark.
async function checkRotatedColours(t, engine) {
  const page = await openClassic(t, engine);
  for (const [width, height, angle] of [[640, 360, 90], [568, 320, 90], [320, 568, 0]]) {
    await turnScreen(page, width, height, angle);
    for (const players of [3, 4, 5, 6]) {
      for (const rotations of [[1, 2, 3, 0, 1, 3], [1, 1, 1, 1, 1, 1], [3, 3, 3, 3, 3, 3]]) {
        const view = `${players} players, ${width} × ${height}, seats ${rotations.slice(0, players).join('')}`;
        await seedGame(page, {
          startingLife: 40, scores: Array(players).fill(40), rotations: rotations.slice(0, players), landscapeAngle: 90,
        });
        await openColours(page);
        assert.equal(await page.locator('.player .swatch:visible').count(), players * 12, `${view}: every swatch shows`);
        assert.deepEqual(await tileProblems(page, { targets: '.swatch', parts: '.swatch .owner' }), [], view);
        const columns = await page.locator('.player').evaluateAll(tiles => tiles.flatMap((player, index) => {
          const face = player.querySelector('.player-face');
          const columns = getComputedStyle(player.querySelector('.swatches')).gridTemplateColumns.split(' ').length;
          return face.offsetWidth < 4 * 44 + 3 * 3 + 2 && columns !== 3 ? [`P${index + 1}'s face is ${face.offsetWidth}px wide but its swatches are ${columns} wide`] : [];
        }));
        assert.deepEqual(columns, [], view);
        await button(page, 'Done choosing colours').tap();
      }
    }
  }
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: Colours fits rotated seats on short phones`, { timeout: 120000 }, t => checkRotatedColours(t, engine));
}
