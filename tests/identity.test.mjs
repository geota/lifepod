import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { chromium, webkit } from 'playwright-core';
import { app, button, fakeScreenOrientation, startGame, turnScreen } from './helpers.mjs';

// Colour identity (design/polish/SPEC.md §2): its own sheet in setup, a chip on each tile showing any of the colour
// indicator, the symbol and the name, a background behind the total, and identity mode, where every player sets
// their own. None of it depends on the Commander switch.

const colours = ['W', 'U', 'B', 'R', 'G'];
// All 31 identities, in W U B R G order.
const identities = Array.from({ length: 31 }, (_, index) => colours.filter((_, bit) => (index + 1) & (1 << bit)).join(''));
const names = {
  W: 'Mono-white', U: 'Mono-blue', B: 'Mono-black', R: 'Mono-red', G: 'Mono-green',
  WU: 'Azorius', UB: 'Dimir', BR: 'Rakdos', RG: 'Gruul', WG: 'Selesnya', WB: 'Orzhov', UR: 'Izzet', BG: 'Golgari', WR: 'Boros', UG: 'Simic',
  WUG: 'Bant', WUB: 'Esper', UBR: 'Grixis', BRG: 'Jund', WRG: 'Naya', WBG: 'Abzan', WUR: 'Jeskai', UBG: 'Sultai', WBR: 'Mardu', URG: 'Temur',
  UBRG: 'Glint-Eye', WBRG: 'Dune-Brood', WURG: 'Ink-Treader', WUBG: 'Witch-Maw', WUBR: 'Yore-Tiller', WUBRG: 'WUBRG',
};
// Each identity's symbol in the Mana font: mana symbols, Ravnica guilds, Khans clans, Streets of New Capenna
// families and the colour pie.
const mana = { W: 'e600', U: 'e601', B: 'e602', R: 'e603', G: 'e604' };
const glyphs = {
  ...mana,
  WU: 'e90c', WR: 'e90d', UB: 'e90e', BG: 'e90f', RG: 'e910', UR: 'e911', WB: 'e912', BR: 'e913', WG: 'e914', UG: 'e915',
  WBG: 'e916', WUR: 'e917', WBR: 'e918', UBG: 'e919', URG: 'e91a',
  WUG: 'ea0d', WRG: 'ea0e', UBR: 'ea0f', WUB: 'ea10', BRG: 'ea11',
  WUBRG: 'e9f0',
};
// Four colours are the colour pie drawn from the five mana symbols, with the missing colour at 25%.
const symbol = identity => (identity.length === 4
  ? colours.map(colour => `${colour}:${mana[colour]}${identity.includes(colour) ? '' : '@0.25'}`).join(' ')
  : glyphs[identity]);
const colourNames = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
const spoken = identity => `${names[identity]}, colour identity ${[...identity].map(colour => colourNames[colour]).join(', ')}`;
// Every combination of what the chip shows, including none.
const combinations = Array.from({ length: 8 }, (_, index) => ({ indicator: Boolean(index & 1), symbol: Boolean(index & 2), name: Boolean(index & 4) }));

const tile = (page, number) => page.locator(`.player:nth-child(${number})`);
const mode = page => page.locator('#board').getAttribute('data-mode');
const openDialogs = page => page.evaluate(() => [...document.querySelectorAll('dialog[open]')].map(dialog => dialog.id));
const pressed = (page, group) => page.locator(group).evaluate(node => [...node.querySelectorAll('[aria-pressed="true"]')].map(choice => choice.textContent));
const saved = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('game') ?? localStorage.getItem('lifepod-game')));

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

async function openPage(t, engine, { android = false, viewport = { width: 952, height: 427 } } = {}) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ isMobile: true, hasTouch: true, viewport });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no script errors'));
  if (android) {
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
  }
  return page;
}

// What each tile shows of its identity: the chip's parts in order, what a screen reader hears, and the background.
function readTiles(page) {
  return page.locator('.player').evaluateAll(players => players.map((player) => {
    const glyph = node => getComputedStyle(node, '::before').content.codePointAt(1).toString(16);
    const symbol = node => (node.classList.contains('pie')
      ? [...node.children].map(part => `${part.dataset.at}:${glyph(part)}${getComputedStyle(part).opacity === '1' ? '' : `@${getComputedStyle(part).opacity}`}`).join(' ')
      : glyph(node));
    const part = node => (node.matches('.ci') ? `indicator ${node.dataset.ci}` : node.matches('.id-symbol') ? `symbol ${symbol(node)}` : `name ${node.textContent}`);
    const chip = player.querySelector('.badges.near .ci-chip');
    const mark = player.querySelector('.watermark');
    const face = player.querySelector('.player-face');
    let background = 'rings';
    if (getComputedStyle(face, '::before').content === 'none') {
      const shown = mark.firstElementChild;
      background = `${shown.matches('.ci') ? `indicator ${shown.dataset.ci}` : `symbol ${symbol(shown)}`} @${getComputedStyle(mark).opacity}`;
    }
    return {
      chip: chip && [...chip.children].filter(node => !node.matches('.visually-hidden')).map(part),
      spoken: chip?.querySelector('.visually-hidden').textContent ?? null,
      background,
    };
  }));
}

// Every identity, in every chip combination and with every background. Six tiles at a time, so each identity is
// seen with each background: the backgrounds take turns across the combinations.
test('chromium: every identity shows its indicator, symbol and name in every combination and background', { timeout: 120000 }, async (t) => {
  const page = await openPage(t, chromium);
  await page.goto(app);
  await page.evaluate(() => document.fonts.load('16px Mana', ''));
  const backgrounds = ['symbol', 'indicator', 'off'];
  for (const [index, show] of combinations.entries()) {
    const background = backgrounds[index % 3];
    for (let start = 0; start < identities.length; start += 6) {
      const batch = Array.from({ length: 6 }, (_, seat) => identities[start + seat] ?? '');
      await page.evaluate(game => localStorage.setItem('lifepod-game', JSON.stringify(game)), {
        startingLife: 40, scores: Array(6).fill(40), rotations: Array(6).fill(0), keepAwake: true, landscapeAngle: 90,
        identities: batch, identity: { show, background },
      });
      await page.reload();
      await page.evaluate(() => document.fonts.ready);
      const view = `${JSON.stringify(show)}, ${background}`;
      const expected = batch.map((identity) => {
        if (!identity) return { chip: null, spoken: null, background: 'rings' };
        const parts = [];
        if (show.indicator) parts.push(`indicator ${identity}`);
        if (show.symbol) parts.push(`symbol ${symbol(identity)}`);
        if (show.name) parts.push(`name ${names[identity]}`);
        return {
          chip: parts.length ? parts : null,
          spoken: parts.length ? spoken(identity) : null,
          background: background === 'symbol' ? `symbol ${symbol(identity)} @0.07` : background === 'indicator' ? `indicator ${identity} @0.1` : 'rings',
        };
      });
      assert.deepEqual(await readTiles(page), expected, `${view}: ${batch.join(' ')}`);
    }
  }
});

// A chip with only the indicator or only the symbol is round; with the name it's a capsule.
test('chromium: a lone indicator or symbol is a round chip, and a name makes a capsule', async (t) => {
  const page = await openPage(t, chromium);
  await page.goto(app);
  const shapes = {};
  for (const [label, show] of Object.entries({
    indicator: { indicator: true, symbol: false, name: false }, symbol: { indicator: false, symbol: true, name: false },
    name: { indicator: false, symbol: false, name: true }, both: { indicator: true, symbol: true, name: false },
  })) {
    await page.evaluate(game => localStorage.setItem('lifepod-game', JSON.stringify(game)), {
      startingLife: 40, scores: [40, 40, 40, 40], identities: ['WUB', 'R', 'UG', 'WBRG'], identity: { show, background: 'symbol' },
    });
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    shapes[label] = await page.locator('.badges.near .ci-chip').evaluateAll(chips => chips.map(chip => Math.round(chip.offsetWidth / chip.offsetHeight * 10) / 10));
  }
  for (const label of ['indicator', 'symbol']) {
    for (const ratio of shapes[label]) assert.ok(ratio >= 0.95 && ratio <= 1.1, `${label} alone is round: ${shapes[label]}`);
  }
  for (const ratio of shapes.name) assert.ok(ratio > 1.5, `a name makes a capsule: ${shapes.name}`);
  for (const ratio of shapes.both) assert.ok(ratio > 1.4, `indicator and symbol together make a capsule: ${shapes.both}`);
});

// Setup → Identity: what tiles show and the background, each saved the moment it changes. ‹, Escape and Android
// back go to setup; ✕ closes everything.
async function checkSheet(t, engine) {
  const android = engine === chromium;
  const page = await openPage(t, engine, { android });
  await page.goto(app);
  await page.evaluate(() => localStorage.setItem('lifepod-game', JSON.stringify({
    startingLife: 40, scores: [40, 40, 40, 40], identities: ['WUB', '', 'UG', 'UBRG'],
  })));
  if (android) await page.evaluate(() => sessionStorage.setItem('game', localStorage.getItem('lifepod-game')));
  await page.reload();
  await page.evaluate(() => document.fonts.ready);

  // Identity shows without Commander, as the indicator and the name by default, with the symbol behind the total.
  assert.deepEqual((await readTiles(page)).map(read => read.chip), [['indicator WUB', 'name Esper'], null, ['indicator UG', 'name Simic'], ['indicator UBRG', 'name Glint-Eye']]);
  assert.equal((await readTiles(page))[0].background, `symbol ${symbol('WUB')} @0.07`);

  await button(page, 'Game setup').tap();
  await button(page, 'Identity').tap();
  await eventually(() => openDialogs(page), ['identity-sheet']);
  assert.deepEqual(await pressed(page, '#identity-show'), ['Indicator', 'Name']);
  assert.deepEqual(await pressed(page, '#identity-background'), ['Symbol']);

  // Show on tiles is any combination, saved at once, and the tiles behind the sheet follow.
  const show = page.locator('#identity-show');
  await show.getByRole('button', { name: 'Symbol' }).tap();
  assert.deepEqual((await saved(page)).identity.show, { indicator: true, symbol: true, name: true }, 'saved before the sheet closes');
  assert.deepEqual((await readTiles(page))[0].chip, ['indicator WUB', `symbol ${symbol('WUB')}`, 'name Esper']);
  await show.getByRole('button', { name: 'Indicator' }).tap();
  await show.getByRole('button', { name: 'Name' }).tap();
  assert.deepEqual(await pressed(page, '#identity-show'), ['Symbol']);
  assert.deepEqual((await readTiles(page))[3].chip, [`symbol ${symbol('UBRG')}`]);
  await show.getByRole('button', { name: 'Symbol' }).tap();
  assert.deepEqual(await pressed(page, '#identity-show'), [], 'everything can be off');
  assert.deepEqual((await readTiles(page)).map(read => read.chip), [null, null, null, null], 'with nothing to show, no chip');
  assert.equal((await readTiles(page))[2].background, `symbol ${glyphs.UG} @0.07`, 'the background is a setting of its own');

  // The background: the colour indicator, faintly, or the rings.
  const background = page.locator('#identity-background');
  await background.getByRole('button', { name: 'Indicator' }).tap();
  assert.equal((await saved(page)).identity.background, 'indicator');
  assert.deepEqual((await readTiles(page)).map(read => read.background), ['indicator WUB @0.1', 'rings', 'indicator UG @0.1', 'indicator UBRG @0.1']);
  await background.getByRole('button', { name: 'Off' }).tap();
  assert.deepEqual(await pressed(page, '#identity-background'), ['Off']);
  assert.deepEqual((await readTiles(page)).map(read => read.background), ['rings', 'rings', 'rings', 'rings']);
  // Both off is identity off, and every player keeps their pick.
  assert.deepEqual((await saved(page)).identities, ['WUB', '', 'UG', 'UBRG']);

  // ‹ returns to setup, with focus on Identity.
  await button(page, 'Back to setup').tap();
  await eventually(() => openDialogs(page), ['setup'], '‹ returns to setup');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'identity-nav');
  // Escape returns to setup too.
  await button(page, 'Identity').tap();
  await page.keyboard.press('Escape');
  await eventually(() => openDialogs(page), ['setup'], 'Escape returns to setup');

  // While setup would start a new game, Choose identities keeps its place but can't be used.
  await button(page, '6 players').tap();
  await button(page, 'Identity').tap();
  assert.ok(!(await button(page, 'Choose identities').isVisible()), 'no Choose identities while setup would start a new game');
  await button(page, 'Back to setup').tap();
  await eventually(() => openDialogs(page), ['setup']);
  assert.equal(await page.locator('#save-setup').textContent(), 'Start new game', 'setup keeps its unsaved choices');
  await button(page, '4 players').tap();

  // ✕ closes everything.
  await button(page, 'Identity').tap();
  assert.ok(await button(page, 'Choose identities').isVisible());
  await button(page, 'Close setup').tap();
  await eventually(() => openDialogs(page), [], '✕ closes setup and Identity');

  if (android) {
    // Android back goes from Identity to setup, then closes setup.
    const back = () => page.evaluate(() => window.closeOpenDialog());
    await button(page, 'Game setup').tap();
    await button(page, 'Identity').tap();
    await eventually(() => openDialogs(page), ['identity-sheet']);
    assert.equal(await back(), true);
    await eventually(() => openDialogs(page), ['setup'], 'back returns from Identity to setup');
    assert.equal(await back(), true);
    await eventually(() => openDialogs(page), []);
    await eventually(() => page.evaluate(() => window.backHandling.at(-1)), false, 'back goes to the system at rest');
  } else {
    // The settings survive a reload.
    await page.waitForTimeout(500);
    await page.reload();
    await button(page, 'Game setup').tap();
    await button(page, 'Identity').tap();
    assert.deepEqual([await pressed(page, '#identity-show'), await pressed(page, '#identity-background')], [[], ['Off']]);
  }
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: the Identity sheet sets what tiles show and saves at once`, { timeout: 60000 }, t => checkSheet(t, engine));
}

// Identity mode: every tile previews everything its identity can show over five mana-symbol toggles, facing its
// player. Each change saves at once, and the check mark, Escape or Android back end the mode.
async function checkMode(t, engine) {
  const android = engine === chromium;
  const page = await openPage(t, engine, { android, viewport: { width: 852, height: 393 } });
  await fakeScreenOrientation(page);
  await page.goto(app);
  await turnScreen(page, 852, 393, 90);
  await page.evaluate(() => document.fonts.ready);
  const toggles = number => page.getByRole('group', { name: `Colour identity for Player ${number}` });
  const on = number => toggles(number).locator('[aria-pressed="true"]').evaluateAll(nodes => nodes.map(node => node.value).join(''));
  const preview = number => tile(page, number).locator('.identity-preview').evaluate(node => {
    const glyph = part => getComputedStyle(part, '::before').content.codePointAt(1).toString(16);
    const chip = node.firstElementChild;
    return [...chip.children].filter(part => !part.matches('.visually-hidden')).map(part => (part.matches('.ci') ? `indicator ${part.dataset.ci}`
      : part.matches('.id-symbol') ? `symbol ${part.classList.contains('pie') ? 'pie' : glyph(part)}` : part.textContent || chip.textContent))
      .concat(chip.childElementCount ? [] : [chip.textContent]);
  });

  // A fresh install has no tracker on: identity works without Commander.
  await button(page, 'Game setup').tap();
  await button(page, 'Identity').tap();
  await button(page, 'Choose identities').tap();
  await eventually(() => openDialogs(page), [], 'Choose identities closes the sheets');
  assert.equal(await mode(page), 'identity');
  assert.ok(await button(page, 'Done choosing identities').isVisible());
  assert.ok(!(await button(page, 'Roll dice').isVisible()), 'only the check mark stays in the centre');
  if (android) assert.equal(await page.evaluate(() => window.backHandling.at(-1)), true, 'back is handled while the mode is open');
  assert.ok(!(await tile(page, 1).locator('.subtract').isVisible()), 'the life controls make way for the toggles');
  assert.equal(await page.locator('.mode-layer .swatch').count(), 0, 'no swatches in identity mode');
  assert.deepEqual(await toggles(3).getByRole('button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))),
    ['White', 'Blue', 'Black', 'Red', 'Green'], 'five colours, no colourless');
  // Each toggle is that colour's mana symbol, on the colour it's printed with.
  const pips = await toggles(3).locator('.pip').evaluateAll(nodes => nodes.map(pip => {
    const glyph = getComputedStyle(pip, '::before');
    return `${glyph.fontFamily} ${glyph.content.codePointAt(1).toString(16)} ${getComputedStyle(pip).backgroundColor}`;
  }));
  assert.deepEqual(pips, ['Mana e600 rgb(253, 251, 206)', 'Mana e601 rgb(188, 218, 247)', 'Mana e602 rgb(167, 153, 158)',
    'Mana e603 rgb(241, 155, 121)', 'Mana e604 rgb(159, 203, 166)']);
  assert.deepEqual(await preview(1), ['No identity'], 'an empty identity previews as No identity');
  // Each tile's toggles face its player.
  const facing = await page.locator('.player .identity').evaluateAll(groups => groups.map(node => Math.round(new DOMMatrixReadOnly(getComputedStyle(node.closest('.player-face')).transform).a)));
  assert.deepEqual(facing, [-1, -1, 1, 1]);

  // Any combination can be on, kept in W U B R G order, and each change is saved at once.
  for (const name of ['Green', 'Black', 'White']) await toggles(3).getByRole('button', { name }).tap();
  assert.equal(await on(3), 'WBG');
  assert.deepEqual((await saved(page)).identities, ['', '', 'WBG', ''], 'saved at once');
  // The preview shows all three, whatever the tiles show.
  assert.deepEqual(await preview(3), ['indicator WBG', `symbol ${glyphs.WBG}`, 'Abzan']);
  await toggles(3).getByRole('button', { name: 'Black' }).tap();
  assert.deepEqual(await preview(3), ['indicator WG', `symbol ${glyphs.WG}`, 'Selesnya']);
  for (const name of ['Blue', 'Black', 'Red', 'Green']) await toggles(1).getByRole('button', { name }).tap();
  assert.deepEqual(await preview(1), ['indicator UBRG', 'symbol pie', 'Glint-Eye']);
  assert.equal(await on(2), '', 'only that player changes');

  // The check mark ends the mode, and the tiles show the identities.
  await button(page, 'Done choosing identities').tap();
  assert.equal(await mode(page), null);
  assert.deepEqual((await readTiles(page)).map(read => read.chip), [['indicator UBRG', 'name Glint-Eye'], null, ['indicator WG', 'name Selesnya'], null]);

  // Escape ends it too, keeping changes.
  const reopen = async () => {
    await button(page, 'Game setup').tap();
    await button(page, 'Identity').tap();
    await button(page, 'Choose identities').tap();
    await eventually(() => mode(page), 'identity');
  };
  await reopen();
  await toggles(2).getByRole('button', { name: 'Red' }).tap();
  await page.keyboard.press('Escape');
  assert.equal(await mode(page), null, 'Escape ends identity mode');
  assert.equal((await saved(page)).identities[1], 'R');

  if (android) {
    await reopen();
    await toggles(4).getByRole('button', { name: 'Blue' }).tap();
    assert.equal(await page.evaluate(() => window.closeOpenDialog()), true);
    assert.equal(await mode(page), null, 'back ends identity mode');
    assert.equal(await page.evaluate(() => window.backHandling.at(-1)), false);
    assert.equal((await saved(page)).identities[3], 'U', 'and keeps the change');
  }

  // A new game keeps every identity.
  await button(page, 'Game setup').tap();
  await button(page, 'New game').tap();
  await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  await page.waitForFunction(() => !document.querySelector('#restart').open);
  await eventually(async () => (await saved(page)).identities, ['UBRG', 'R', 'WG', android ? 'U' : ''], 'a new game keeps the identities');
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: identity mode sets each player's identity and saves at once`, { timeout: 60000 }, t => checkMode(t, engine));
}

// Every toggle is a whole 44px target inside its tile and clear of the check mark, and so is the preview, at every
// player count from the target phone to the stress size. Five toggles make one row where every tile has room (ui ≥
// 264), otherwise three over two.
test('chromium: identity mode fits every player count', { timeout: 120000 }, async (t) => {
  const page = await openPage(t, chromium);
  await fakeScreenOrientation(page);
  await page.goto(app);
  await page.evaluate(() => localStorage.setItem('lifepod-game', JSON.stringify({
    startingLife: 40, scores: [40, 40, 40, 40], identities: ['WURG', 'UBRG', 'WBR', 'WUBG'],
  })));
  await page.reload();
  for (const [width, height, angle] of [[952, 427, 90], [852, 393, 90], [640, 360, 90], [568, 320, 90], [320, 568, 0]]) {
    await turnScreen(page, width, height, angle);
    for (const players of [2, 3, 4, 5, 6]) {
      await startGame(page, players);
      await button(page, 'Game setup').tap();
      await button(page, 'Identity').tap();
      await button(page, 'Choose identities').tap();
      await eventually(() => mode(page), 'identity');
      const problems = await page.evaluate(() => {
        const controls = document.querySelector('#board-controls').getBoundingClientRect();
        const disc = { left: controls.left + 6, right: controls.right - 6, top: controls.top + 6, bottom: controls.bottom - 6 };
        const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const wide = document.querySelector('#board').hasAttribute('data-wide');
        return [...document.querySelectorAll('.player')].flatMap((player, index) => {
          const bounds = player.getBoundingClientRect();
          const toggles = [...player.querySelectorAll('.identity-toggle')];
          const issues = [...toggles, player.querySelector('.identity-preview .chip')].map((node) => {
            const box = node.getBoundingClientRect();
            const found = [];
            if (node.matches('button') && Math.min(box.width, box.height) < 43.5) found.push(`${Math.round(box.width)}×${Math.round(box.height)}`);
            if (box.left < bounds.left - 0.5 || box.right > bounds.right + 0.5 || box.top < bounds.top - 0.5 || box.bottom > bounds.bottom + 0.5) found.push('outside its tile');
            if (overlaps(box, disc)) found.push('under the check mark');
            return found.length ? `P${index + 1} ${node.getAttribute('aria-label') ?? node.textContent}: ${found.join(', ')}` : '';
          }).filter(Boolean);
          // Rows along the player's reading direction: the toggles' faces share their tile's turn.
          const rows = new Set(toggles.map(node => node.offsetTop)).size;
          if (toggles.length !== 5) issues.push(`P${index + 1} has ${toggles.length} toggles`);
          if (rows !== (wide ? 1 : 2)) issues.push(`P${index + 1} has ${rows} rows of toggles (${wide ? 'wide' : 'narrow'} board)`);
          return issues;
        });
      });
      assert.deepEqual(problems, [], `${players} players, ${width} × ${height}`);
      await button(page, 'Done choosing identities').tap();
    }
  }
});

// Saves from before identity settings load with the defaults, and anything invalid falls back to its default.
test('chromium: saved identity settings are checked when a game loads', async (t) => {
  const page = await openPage(t, chromium);
  await page.goto(app);
  const load = async (identity) => {
    await page.evaluate(game => localStorage.setItem('lifepod-game', JSON.stringify(game)), {
      startingLife: 40, scores: [40, 40, 40, 40], identities: ['WU', 'BRG', '', 'R'], ...(identity === undefined ? {} : { identity }),
    });
    await page.reload();
    await button(page, 'Game setup').tap();
    await button(page, 'Identity').tap();
    const settings = [await pressed(page, '#identity-show'), await pressed(page, '#identity-background')];
    await button(page, 'Close setup').tap();
    return { settings, tiles: (await readTiles(page)).map(read => [read.chip, read.background.split(' ')[0]]) };
  };
  assert.deepEqual(await load(undefined), {
    settings: [['Indicator', 'Name'], ['Symbol']],
    tiles: [[['indicator WU', 'name Azorius'], 'symbol'], [['indicator BRG', 'name Jund'], 'symbol'], [null, 'rings'], [['indicator R', 'name Mono-red'], 'symbol']],
  }, 'a save from before identity settings gets the defaults');
  assert.deepEqual((await load({ show: { indicator: 'yes', symbol: true, name: 0 }, background: 'rings' })).settings,
    [['Indicator', 'Symbol', 'Name'], ['Symbol']], 'each invalid value falls back to its own default');
  assert.deepEqual((await load('symbol')).settings, [['Indicator', 'Name'], ['Symbol']]);
  assert.deepEqual(await load({ show: { indicator: false, symbol: false, name: false }, background: 'off' }), {
    settings: [[], ['Off']], tiles: [[null, 'rings'], [null, 'rings'], [null, 'rings'], [null, 'rings']],
  }, 'identity off loads as saved');
  assert.deepEqual((await load({ show: { symbol: true }, background: 'indicator' })).settings, [['Indicator', 'Symbol', 'Name'], ['Indicator']],
    'missing parts get their defaults');
});
