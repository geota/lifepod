import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import {
  backHandling, button, engines, eventually, hold, openPage, reload, saved, savedGame, seedGame, startGame, test, tileProblems, token,
  turnScreen,
} from './helpers.mjs';

// Colour identity (design/polish/SPEC.md §2): its own section in settings, a chip on each tile showing any of the colour
// indicator, the symbol and the name, a background behind the total (the symbol, the rings or nothing), and identity
// mode, where every player sets their own. None of it depends on the Commander switch.

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
// The Show on tiles switches that are on, by label.
const switchedOn = page => page.locator('#identity-show [role="switch"]').evaluateAll(inputs => inputs.filter(input => input.checked).map(input => input.closest('label').textContent.trim()));
const showSwitch = (page, name) => page.locator('#identity-show label', { has: page.getByRole('switch', { name, exact: true }) });
// The save format of the identity settings: without it, a saved background is from before Default (see the load test).
const settingsVersion = 2;
// A dialog's close event runs after the click that closes it, so results that follow it are polled (eventually).

// What each tile shows of its identity: the chip's parts in order, what a screen reader hears, and the background:
// the symbol at its opacity, the rings, or "plain" for neither.
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
      background = shown && mark.checkVisibility() ? `symbol ${symbol(shown)} @${getComputedStyle(mark).opacity}` : 'plain';
    }
    return {
      chip: chip && [...chip.children].filter(node => !node.matches('.visually-hidden')).map(part),
      spoken: chip?.querySelector('.visually-hidden').textContent ?? null,
      background,
    };
  }));
}

// Every identity, in every chip combination and with every background. Six tiles at a time, so each identity is
// seen with each background: the backgrounds take turns across the combinations. Symbol is the identity's symbol
// behind a set identity and the rings elsewhere, Default is the rings everywhere, and Off is a plain tile.
test('chromium: every identity shows its indicator, symbol and name in every combination and background', { timeout: 120000 }, async (t) => {
  const page = await openPage(t, chromium);
  const backgrounds = ['symbol', 'default', 'off'];
  for (const [index, show] of combinations.entries()) {
    const background = backgrounds[index % 3];
    for (let start = 0; start < identities.length; start += 6) {
      const batch = Array.from({ length: 6 }, (_, seat) => identities[start + seat] ?? '');
      await seedGame(page, savedGame(6, { identities: batch, identity: { show, background, version: settingsVersion } }));
      const view = `${JSON.stringify(show)}, ${background}`;
      const expected = batch.map((identity) => {
        if (!identity) return { chip: null, spoken: null, background: background === 'off' ? 'plain' : 'rings' };
        const parts = [];
        if (show.indicator) parts.push(`indicator ${identity}`);
        if (show.symbol) parts.push(`symbol ${symbol(identity)}`);
        if (show.name) parts.push(`name ${names[identity]}`);
        return {
          chip: parts.length ? parts : null,
          spoken: parts.length ? spoken(identity) : null,
          background: { symbol: `symbol ${symbol(identity)} @0.07`, default: 'rings', off: 'plain' }[background],
        };
      });
      assert.deepEqual(await readTiles(page), expected, `${view}: ${batch.join(' ')}`);
    }
  }
});

// A chip with only the indicator or only the symbol is round; with the name it's a capsule.
test('chromium: a lone indicator or symbol is a round chip, and a name makes a capsule', async (t) => {
  const page = await openPage(t, chromium);
  const shapes = {};
  for (const [label, show] of Object.entries({
    indicator: { indicator: true, symbol: false, name: false }, symbol: { indicator: false, symbol: true, name: false },
    name: { indicator: false, symbol: false, name: true }, both: { indicator: true, symbol: true, name: false },
  })) {
    await seedGame(page, {
      startingLife: 40, scores: [40, 40, 40, 40], identities: ['WUB', 'R', 'UG', 'WBRG'], identity: { show, background: 'symbol' },
    });
    shapes[label] = await page.locator('.badges.near .ci-chip').evaluateAll(chips => chips.map(chip => Math.round(chip.offsetWidth / chip.offsetHeight * 10) / 10));
  }
  for (const label of ['indicator', 'symbol']) {
    for (const ratio of shapes[label]) assert.ok(ratio >= 0.95 && ratio <= 1.1, `${label} alone is round: ${shapes[label]}`);
  }
  for (const ratio of shapes.name) assert.ok(ratio > 1.5, `a name makes a capsule: ${shapes.name}`);
  for (const ratio of shapes.both) assert.ok(ratio > 1.4, `indicator and symbol together make a capsule: ${shapes.both}`);
});

// Settings → Identity: what tiles show and the background, each saved the moment it changes. ✕, Escape and Android
// back close settings and keep what was saved.
async function checkSheet(t, engine) {
  const android = engine === chromium;
  const page = await openPage(t, engine, {
    native: android ? 'android' : undefined, game: { startingLife: 40, scores: [40, 40, 40, 40], identities: ['WUB', '', 'UG', 'UBRG'] },
  });

  // Identity shows without Commander, as the indicator and the name by default, with the symbol behind the total.
  assert.deepEqual((await readTiles(page)).map(read => read.chip), [['indicator WUB', 'name Esper'], null, ['indicator UG', 'name Simic'], ['indicator UBRG', 'name Glint-Eye']]);
  assert.equal((await readTiles(page))[0].background, `symbol ${symbol('WUB')} @0.07`);

  await button(page, 'Settings').tap();
  await eventually(() => openDialogs(page), ['settings']);
  assert.deepEqual(await switchedOn(page), ['Indicator', 'Name']);
  assert.deepEqual(await pressed(page, '#identity-background'), ['Symbol']);

  // Show on tiles is three switches, any combination, each saved at once, and the tiles behind settings follow.
  await showSwitch(page, 'Symbol').tap();
  assert.deepEqual((await saved(page)).identity.show, { indicator: true, symbol: true, name: true }, 'saved before settings closes');
  assert.deepEqual((await readTiles(page))[0].chip, ['indicator WUB', `symbol ${symbol('WUB')}`, 'name Esper']);
  await showSwitch(page, 'Indicator').tap();
  await showSwitch(page, 'Name').tap();
  assert.deepEqual(await switchedOn(page), ['Symbol']);
  assert.deepEqual((await readTiles(page))[3].chip, [`symbol ${symbol('UBRG')}`]);
  await showSwitch(page, 'Symbol').tap();
  assert.deepEqual(await switchedOn(page), [], 'everything can be off');
  assert.deepEqual((await readTiles(page)).map(read => read.chip), [null, null, null, null], 'with nothing to show, no chip');
  assert.equal((await readTiles(page))[2].background, `symbol ${glyphs.UG} @0.07`, 'the background is a setting of its own');
  // Symbol: a tile with no identity keeps the rings.
  assert.equal((await readTiles(page))[1].background, 'rings');

  // Default is the rings on every tile, with no symbol.
  const background = page.locator('#identity-background');
  await background.getByRole('button', { name: 'Default' }).tap();
  assert.equal((await saved(page)).identity.background, 'default');
  assert.deepEqual(await pressed(page, '#identity-background'), ['Default']);
  assert.deepEqual((await readTiles(page)).map(read => read.background), ['rings', 'rings', 'rings', 'rings']);
  // Off is no background at all: no rings and no symbol.
  await background.getByRole('button', { name: 'Off' }).tap();
  assert.deepEqual((await saved(page)).identity, { show: { indicator: false, symbol: false, name: false }, background: 'off', version: settingsVersion });
  assert.deepEqual(await pressed(page, '#identity-background'), ['Off']);
  assert.deepEqual((await readTiles(page)).map(read => read.background), ['plain', 'plain', 'plain', 'plain']);
  // Chip and background off is identity off, and every player keeps their pick.
  assert.deepEqual((await saved(page)).identities, ['WUB', '', 'UG', 'UBRG']);

  // Choose identities stays usable while a new game is pending (it starts that game first).
  await button(page, '6 players').tap();
  assert.ok(await button(page, 'Choose identities on the board').isVisible(), 'Choose identities shows while a new game is pending');
  await button(page, '4 players').tap();

  // ✕ closes settings and keeps what was saved.
  await button(page, 'Close settings').tap();
  await eventually(() => openDialogs(page), [], '✕ closes settings');
  assert.equal((await saved(page)).identity.background, 'off');

  if (android) {
    // Android back closes settings.
    const back = () => page.evaluate(() => window.closeOpenDialog());
    await button(page, 'Settings').tap();
    await eventually(() => openDialogs(page), ['settings']);
    assert.equal(await back(), true);
    await eventually(() => openDialogs(page), []);
    // Each time settings open back is handled, and each time their close event runs it goes to the system again.
    await eventually(() => backHandling(page), [false, true, false, true, false], 'back goes to the system at rest');
  } else {
    // The settings survive a reload.
    await reload(page);
    await button(page, 'Settings').tap();
    assert.deepEqual([await switchedOn(page), await pressed(page, '#identity-background')], [[], ['Off']]);
    assert.deepEqual((await readTiles(page)).map(read => read.background), ['plain', 'plain', 'plain', 'plain'], 'Off survives a reload');
  }
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: Identity in settings sets what tiles show and saves at once`, { timeout: 60000 }, t => checkSheet(t, engine));
}

// Identity mode: every tile previews everything its identity can show over five mana-symbol toggles, facing its
// player. Each change saves at once, and the check mark, Escape or Android back end the mode.
async function checkMode(t, engine) {
  const android = engine === chromium;
  const page = await openPage(t, engine, { viewport: { width: 852, height: 393 }, orientation: 90, native: android ? 'android' : undefined });
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
  await button(page, 'Settings').tap();
  await button(page, 'Choose identities on the board').tap();
  await eventually(() => openDialogs(page), [], 'Choose identities closes settings');
  assert.equal(await mode(page), 'identity');
  assert.ok(await button(page, 'Done choosing identities').isVisible());
  assert.ok(!(await button(page, 'Roll dice').isVisible()), 'only the check mark stays in the centre');
  // Settings, the mode and then settings' close event each hand back to the page.
  if (android) await eventually(() => backHandling(page), [false, true], 'back is handled while the mode is open');
  assert.ok(!(await tile(page, 1).locator('.subtract').isVisible()), 'the life controls make way for the toggles');
  assert.equal(await page.locator('.mode-layer .swatch').count(), 0, 'no swatches in identity mode');
  assert.deepEqual(await toggles(3).getByRole('button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))),
    ['White', 'Blue', 'Black', 'Red', 'Green'], 'five colours, no colourless');
  // Each toggle is that colour's mana symbol, on the colour it's printed with.
  const pips = await toggles(3).locator('.pip').evaluateAll(nodes => nodes.map(pip => {
    const glyph = getComputedStyle(pip, '::before');
    return `${glyph.fontFamily} ${glyph.content.codePointAt(1).toString(16)} ${getComputedStyle(pip).backgroundColor}`;
  }));
  const printed = await Promise.all(colours.map(async colour => `Mana ${mana[colour]} ${await token(page, `--pip-${colour.toLowerCase()}`)}`));
  assert.deepEqual(pips, printed);
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
    await button(page, 'Settings').tap();
    await button(page, 'Choose identities on the board').tap();
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
    // Opened and closed three times: by the check mark, Escape and now back.
    assert.deepEqual(await backHandling(page), [false, true, false, true, false, true, false]);
    assert.equal((await saved(page)).identities[3], 'U', 'and keeps the change');
  }

  // A new game keeps every identity.
  await button(page, 'Settings').tap();
  await button(page, 'New game').tap();
  await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  // The restart dialog's close event starts the game, then closes settings.
  await eventually(() => openDialogs(page), [], 'the new game starts');
  await eventually(async () => (await saved(page)).identities, ['UBRG', 'R', 'WG', android ? 'U' : ''], 'a new game keeps the identities');
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: identity mode sets each player's identity and saves at once`, { timeout: 60000 }, t => checkMode(t, engine));
}

// Every toggle is a whole 44px target inside its tile and clear of the check mark, and so is the preview, at every
// player count from the target phone to the stress size. Five toggles make one row where every tile has room (ui ≥
// 264), otherwise three over two.
test('chromium: identity mode fits every player count', { timeout: 120000 }, async (t) => {
  const page = await openPage(t, chromium, {
    orientation: true, game: { startingLife: 40, scores: [40, 40, 40, 40], identities: ['WURG', 'UBRG', 'WBR', 'WUBG'] },
  });
  for (const [width, height, angle] of [[952, 427, 90], [852, 393, 90], [640, 360, 90], [568, 320, 90], [320, 568, 0]]) {
    await turnScreen(page, width, height, angle);
    for (const players of [2, 3, 4, 5, 6]) {
      await startGame(page, players);
      await button(page, 'Settings').tap();
      await button(page, 'Choose identities on the board').tap();
      await eventually(() => mode(page), 'identity');
      const view = `${players} players, ${width} × ${height}`;
      assert.deepEqual(await tileProblems(page, { targets: '.identity-toggle', parts: '.identity-preview .chip' }), [], view);
      const problems = await page.evaluate(() => {
        const wide = document.querySelector('#board').hasAttribute('data-wide');
        return [...document.querySelectorAll('.player')].flatMap((player, index) => {
          const issues = [];
          const toggles = [...player.querySelectorAll('.identity-toggle')].filter(node => node.checkVisibility());
          if (!player.querySelector('.identity-preview .chip')?.checkVisibility()) issues.push(`P${index + 1} has no preview`);
          // Rows along the player's reading direction: the toggles' faces share their tile's turn.
          const rows = new Set(toggles.map(node => node.offsetTop)).size;
          if (toggles.length !== 5) issues.push(`P${index + 1} has ${toggles.length} toggles`);
          if (rows !== (wide ? 1 : 2)) issues.push(`P${index + 1} has ${rows} rows of toggles (${wide ? 'wide' : 'narrow'} board)`);
          return issues;
        });
      });
      assert.deepEqual(problems, [], view);
      await button(page, 'Done choosing identities').tap();
    }
  }
});

// Saves from before identity settings load with the defaults, and anything invalid falls back to its default. Saves
// from before Default had Symbol · Indicator · Off, where Off was the rings: their Off loads as Default and their
// Indicator as Symbol. Only a save that carries the settings version can be the new Off.
test('chromium: saved identity settings are checked when a game loads', async (t) => {
  const page = await openPage(t, chromium);
  const load = async (identity) => {
    await seedGame(page, {
      startingLife: 40, scores: [40, 40, 40, 40], identities: ['WU', 'BRG', '', 'R'], ...(identity === undefined ? {} : { identity }),
    });
    await button(page, 'Settings').tap();
    const settings = [await switchedOn(page), await pressed(page, '#identity-background')];
    await button(page, 'Close settings').tap();
    return { settings, tiles: (await readTiles(page)).map(read => [read.chip, read.background.split(' ')[0]]) };
  };
  assert.deepEqual(await load(undefined), {
    settings: [['Indicator', 'Name'], ['Symbol']],
    tiles: [[['indicator WU', 'name Azorius'], 'symbol'], [['indicator BRG', 'name Jund'], 'symbol'], [null, 'rings'], [['indicator R', 'name Mono-red'], 'symbol']],
  }, 'a save from before identity settings gets the defaults');
  assert.deepEqual((await load({ show: { indicator: 'yes', symbol: true, name: 0 }, background: 'rings', version: settingsVersion })).settings,
    [['Indicator', 'Symbol', 'Name'], ['Symbol']], 'each invalid value falls back to its own default');
  assert.deepEqual((await load('symbol')).settings, [['Indicator', 'Name'], ['Symbol']]);
  assert.deepEqual(await load({ show: { indicator: false, symbol: false, name: false }, background: 'off', version: settingsVersion }), {
    settings: [[], ['Off']], tiles: [[null, 'plain'], [null, 'plain'], [null, 'plain'], [null, 'plain']],
  }, 'identity off loads as saved, with no background');
  assert.deepEqual(await load({ show: { indicator: false, symbol: false, name: false }, background: 'default', version: settingsVersion }), {
    settings: [[], ['Default']], tiles: [[null, 'rings'], [null, 'rings'], [null, 'rings'], [null, 'rings']],
  }, 'Default loads as saved');
  assert.deepEqual((await load({ show: { symbol: true }, background: 'symbol', version: settingsVersion })).settings, [['Indicator', 'Symbol', 'Name'], ['Symbol']],
    'missing parts get their defaults');

  // Saves from before Default.
  assert.deepEqual(await load({ show: { indicator: false, symbol: false, name: false }, background: 'off' }), {
    settings: [[], ['Default']], tiles: [[null, 'rings'], [null, 'rings'], [null, 'rings'], [null, 'rings']],
  }, 'the old Off was the rings, so it loads as Default');
  assert.deepEqual(await load({ show: { symbol: true }, background: 'indicator' }), {
    settings: [['Indicator', 'Symbol', 'Name'], ['Symbol']],
    tiles: [
      [['indicator WU', `symbol ${glyphs.WU}`, 'name Azorius'], 'symbol'], [['indicator BRG', `symbol ${glyphs.BRG}`, 'name Jund'], 'symbol'],
      [null, 'rings'], [['indicator R', `symbol ${glyphs.R}`, 'name Mono-red'], 'symbol'],
    ],
  }, 'the old Indicator background loads as Symbol');
  assert.deepEqual((await load({ background: 'symbol' })).settings, [['Indicator', 'Name'], ['Symbol']], 'the old Symbol stays Symbol');
  assert.deepEqual((await load({ background: 'rings' })).settings, [['Indicator', 'Name'], ['Symbol']], 'anything else is Symbol');
});

// Identity mode and the Identity section explain themselves (design/polish/FINAL-REVIEW.md #9 and #10). An off toggle's
// symbol is muted and an on one has a check, under the hint "Tap your colours". Each "Show on tiles" switch row has the
// mark it adds (the colour disc, the symbol, "Aa") and a switch that's on or off, and the note says what tiles show.
async function checkExplains(t, engine) {
  const page = await openPage(t, engine, {
    game: { startingLife: 40, scores: [40, 40, 40, 40, 40, 40], identities: ['WUBG', 'UB', '', 'G', 'WUBRG', 'R'], landscapeAngle: 90 },
  });
  await button(page, 'Settings').tap();
  const sheet = () => page.locator('#identity-show').evaluate(group => ({
    toggles: [...group.children].map(row => ({
      label: row.textContent.trim(),
      mark: Boolean(row.querySelector(':scope > :first-child:is(.ci, .mana-icon, svg)')),
      on: row.querySelector('[role="switch"]').checked,
    })),
    note: document.querySelector('#identity-note').textContent,
  }));
  assert.deepEqual(await sheet(), {
    toggles: [{ label: 'Indicator', mark: true, on: true }, { label: 'Symbol', mark: true, on: false }, { label: 'Name', mark: true, on: true }],
    note: "Tiles show the colour disc and name of each player's identity.",
  }, 'the default: the colour disc and the name are on');
  await showSwitch(page, 'Symbol').tap();
  assert.equal((await sheet()).note, "Tiles show the colour disc, symbol and name of each player's identity.");
  for (const part of ['Indicator', 'Symbol', 'Name']) await showSwitch(page, part).tap();
  const none = await sheet();
  assert.deepEqual(none.toggles.map(toggle => toggle.on), [false, false, false], 'every switch off');
  assert.equal(none.note, 'Identity is hidden on tiles. Players keep their picks.');
  await showSwitch(page, 'Name').tap();
  assert.equal((await sheet()).note, "Tiles show the name of each player's identity.");

  // Identity mode: Player 1 has W, U, B and G, so red is off.
  await button(page, 'Choose identities on the board').tap();
  const toggles = await tile(page, 1).locator('.identity-toggle').evaluateAll(buttons => buttons.map((toggle) => {
    const pip = getComputedStyle(toggle.querySelector('.pip'));
    return { colour: toggle.value, on: toggle.getAttribute('aria-pressed') === 'true', muted: pip.filter !== 'none' && Number(pip.opacity) < 1, check: toggle.querySelector('.toggle-check').checkVisibility() };
  }));
  assert.deepEqual(toggles, [
    { colour: 'W', on: true, muted: false, check: true }, { colour: 'U', on: true, muted: false, check: true },
    { colour: 'B', on: true, muted: false, check: true }, { colour: 'R', on: false, muted: true, check: false },
    { colour: 'G', on: true, muted: false, check: true },
  ], 'off is muted with no check; on is in full colour with a check');
  assert.equal(await tile(page, 1).locator('.layer-hint').textContent(), 'Tap your colours');
  assert.ok(await tile(page, 1).locator('.layer-hint').isVisible(), 'the hint shows on the target phone');
  await tile(page, 1).locator('.identity-toggle[value="R"]').tap();
  assert.equal(await tile(page, 1).locator('.identity-toggle[value="R"] .toggle-check').isVisible(), true, 'turning red on adds its check');
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: identity toggles and the Identity sheet say what's on`, { timeout: 60000 }, t => checkExplains(t, engine));
}

// A colour toggle counts once per press, however long the press: the click after a long press is skipped
// (docs/review/ARCHITECTURE.md B4). A mouse in both engines, and a real touch through CDP in Chromium. The page's clock
// is paused, so each press lasts exactly 1s: longer than the 800ms click-skip window its pointerdown opens, so only the
// window its pointerup opens can skip the click.
async function checkLongPressToggle(t, engine) {
  const page = await openPage(t, engine, { clock: true });
  await button(page, 'Settings').tap();
  await button(page, 'Choose identities on the board').tap();
  await eventually(() => mode(page), 'identity');
  const toggle = colour => page.getByRole('group', { name: 'Colour identity for Player 3' }).getByRole('button', { name: colour, exact: true });
  const identities = async () => (await saved(page)).identities;
  const centre = async (colour) => {
    const box = await toggle(colour).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  await hold(page, toggle('White'), 1000);
  await page.clock.runFor(100);
  assert.equal((await identities())[2], 'W', 'a 1s mouse press turns White on, once');

  if (engine === chromium) {
    const cdp = await page.context().newCDPSession(page);
    const blue = await centre('Blue');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...blue }] });
    await page.clock.runFor(1000);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.clock.runFor(100);
    assert.equal((await identities())[2], 'WU', 'a 1s touch turns Blue on, once');
  }
  // A short tap still toggles, and the keyboard still works.
  await toggle('White').tap();
  assert.equal((await identities())[2].includes('W'), false, 'a tap turns White off');
  await toggle('White').focus();
  await page.keyboard.press('Enter');
  assert.equal((await identities())[2].includes('W'), true, 'Enter turns White on');
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: a long press on a colour toggle counts once`, { timeout: 60000 }, t => checkLongPressToggle(t, engine));
}
