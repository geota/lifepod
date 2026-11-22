import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { chromium, webkit } from 'playwright-core';
import { app, button, mockAndroid, mockIos } from './helpers.mjs';

// The Style setting (design/polish/STYLE.md, SETTINGS-SPEC.md §9): Material (direction A) or Glass (direction B) for the
// whole app. iOS starts on Glass and Android and browsers on Material until the player picks; the pick is saved and wins.
// Glass is tinted glass on the floating chrome only (design/polish/GLASS.md), with solid fallbacks.

const engines = { chromium, webkit };
const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

async function openPage(t, engine, { mock, viewport = { width: 952, height: 427 }, media } = {}) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ isMobile: engine === chromium, hasTouch: true, viewport });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no script errors'));
  if (media) await page.emulateMedia(media);
  if (mock) await mock(page);
  await page.goto(app);
  return page;
}

// Where each platform keeps the game: the Android stand-in's and the iOS stand-in's session storage, or local storage.
const storage = { android: 'android-game', ios: 'ios-game', web: null };
async function seed(page, platform, game) {
  await page.evaluate(([key, saved]) => (key ? sessionStorage.setItem(key, saved) : localStorage.setItem('lifepod-game', saved)), [storage[platform], JSON.stringify(game)]);
  await page.reload();
}
const saved = (page, platform) => page.evaluate(key => JSON.parse(key ? sessionStorage.getItem(key) : localStorage.getItem('lifepod-game')), storage[platform]);
const style = page => page.evaluate(() => document.documentElement.dataset.style);
const styleChoice = page => page.locator('#style-choices button[aria-pressed="true"]').textContent();

// ---- The platform default, and the player's pick ----------------------------------------------------------------

const platforms = [
  ['chromium', 'web', 'the web browser', undefined, 'material'],
  ['webkit', 'web', 'the web browser', undefined, 'material'],
  ['chromium', 'android', 'Android', mockAndroid, 'material'],
  ['webkit', 'ios', 'iOS', mockIos, 'glass'],
];
for (const [engine, platform, name, mock, expected] of platforms) {
  const other = expected === 'glass' ? 'material' : 'glass';
  const label = { material: 'Material', glass: 'Glass' };
  test(`${engine}: ${name} starts on ${label[expected]}, and a pick of ${label[other]} is saved and wins`, async (t) => {
    const page = await openPage(t, engines[engine], { mock });
    assert.equal(await style(page), expected, `a fresh install on ${name} starts on ${label[expected]}`);
    // A save from before the setting, or with an unknown style, gets the platform's default.
    await seed(page, platform, { startingLife: 40, scores: [40, 40, 40, 40] });
    assert.equal(await style(page), expected, 'a save from before the setting gets the default');
    await seed(page, platform, { startingLife: 40, scores: [40, 40, 40, 40], style: 'neon' });
    assert.equal(await style(page), expected, 'an unknown style gets the default');

    await button(page, 'Settings').tap();
    assert.equal(await styleChoice(page), label[expected], 'Settings shows the style in use');
    assert.deepEqual(await page.locator('#settings-table #style-choices button').allTextContents(), ['Material', 'Glass'], 'Style is in Table');
    await button(page, label[other]).tap();
    assert.equal(await style(page), other, 'the pick applies at once, with settings still open');
    assert.equal(await styleChoice(page), label[other]);
    assert.equal((await saved(page, platform)).style, other, 'and is saved at once');
    assert.equal(await page.locator('#save-setup').textContent(), 'Done', 'a style is not a new game');
    await button(page, 'Done').tap();
    await page.reload();
    assert.equal(await style(page), other, `the pick of ${label[other]} wins over the default after a reload`);

    // Picking the default back is a pick too: it's saved, not left to the default.
    await button(page, 'Settings').tap();
    await button(page, label[expected]).tap();
    assert.equal((await saved(page, platform)).style, expected);
    await page.reload();
    assert.equal(await style(page), expected);
  });
}

// ---- Glass on the key surfaces ------------------------------------------------------------------------------------

const alpha = colour => (colour.startsWith('rgba(') ? Number(colour.slice(5, -1).split(',')[3]) : colour.startsWith('rgb(') ? 1 : Number(colour.match(/\/\s*([\d.]+)/)?.[1] ?? 1));
// The floating chrome (pill, settings header, dice dialog), the content under it (a card, a row, a switch, a segmented
// choice, the slider thumb) and the tiles.
async function readSurfaces(page) {
  const board = await page.evaluate(() => {
    const pill = getComputedStyle(document.querySelector('#board-controls'), '::before');
    const tile = getComputedStyle(document.querySelector('.player'));
    const half = getComputedStyle(document.querySelector('.player .add'));
    return {
      pill: { filter: pill.webkitBackdropFilter ?? pill.backdropFilter, background: pill.backgroundColor, edge: pill.borderTopWidth, edgeColour: pill.borderTopColor },
      tile: { background: tile.backgroundColor, half: [half.color, half.fontSize, half.width] },
    };
  });
  await button(page, 'Roll dice').tap();
  const dice = await page.evaluate(() => {
    const dialog = getComputedStyle(document.querySelector('#dice'));
    const chosen = getComputedStyle(document.querySelector('#dice-picker button[aria-pressed="true"]'));
    return { filter: dialog.webkitBackdropFilter ?? dialog.backdropFilter, background: dialog.backgroundColor, edge: dialog.borderTopWidth, edgeColour: dialog.borderTopColor, chosen: chosen.backgroundColor };
  });
  await button(page, 'Close dice').tap();
  await button(page, 'Settings').tap();
  const settings = await page.evaluate(() => {
    const read = (selector, pseudo) => getComputedStyle(document.querySelector(selector), pseudo);
    const head = read('.fs-head');
    const body = document.querySelector('#settings-body').getBoundingClientRect();
    const headBox = document.querySelector('.fs-head').getBoundingClientRect();
    const row = read('#settings-track .switch-row');
    const sw = read('#settings-track .switch');
    const segments = read('#turn-choices');
    const chosen = read('#turn-choices button[aria-pressed="true"]');
    const thumb = read('#players-track .k-thumb');
    return {
      head: { filter: head.webkitBackdropFilter ?? head.backdropFilter, background: head.backgroundColor, radius: head.borderTopLeftRadius, overBody: body.top < headBox.bottom - 1 },
      card: read('#settings-game').backgroundColor,
      row: { background: row.backgroundColor, divider: row.boxShadow, radius: row.borderTopLeftRadius },
      switch: [sw.width, sw.height],
      segments: { track: segments.backgroundColor, chosen: chosen.backgroundColor, ink: chosen.color },
      thumb: [thumb.width, thumb.height, thumb.borderTopLeftRadius, thumb.backgroundColor],
    };
  });
  await button(page, 'Close settings').tap();
  return { ...board, dice, settings };
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: Glass draws the floating chrome as tinted glass over solid content, and leaves the tiles alone`, async (t) => {
    const page = await openPage(t, engine);
    const game = { startingLife: 40, scores: [40, 33, 27, 38], counters: { poison: true }, turns: 'rounds' };
    await seed(page, 'web', { ...game, style: 'material' });
    const material = await readSurfaces(page);
    await seed(page, 'web', { ...game, style: 'glass' });
    const glass = await readSurfaces(page);

    // Material: solid chrome, no blur, filled rows and segments, the accent on the chosen segment and die.
    assert.equal(material.pill.filter, 'none');
    assert.equal(alpha(material.pill.background), 1);
    assert.equal(material.dice.filter, 'none');
    assert.equal(material.settings.head.filter, 'none');
    assert.equal(material.settings.head.overBody, false, 'the Material header is its own row');
    assert.equal(material.settings.segments.chosen, 'rgb(217, 240, 138)', 'the chosen segment is the lime accent');
    assert.deepEqual(material.settings.switch, ['36px', '20px']);

    // Glass: the pill, the dice dialog and the settings header are the surface at 68% over an 18px blur, with a light edge.
    for (const [part, surface] of [['pill', glass.pill], ['dice dialog', glass.dice], ['settings header', glass.settings.head]]) {
      assert.equal(surface.filter, 'blur(18px) saturate(1.3)', `the ${part} is frosted`);
      assert.ok(Math.abs(alpha(surface.background) - 0.68) < 0.01, `the ${part} is tinted at 68% (${surface.background})`);
    }
    assert.equal(glass.pill.edge, '1px', 'the pill has a light edge');
    assert.equal(glass.dice.edge, '1px', 'the dialog has a light edge');
    assert.equal(glass.settings.head.overBody, true, 'the settings header floats over the body, which scrolls under it');
    assert.equal(glass.settings.head.radius, '22px');
    // Content stays solid: cards are opaque; rows share their card, split by hairlines.
    assert.equal(alpha(glass.settings.card), 1, 'cards are solid');
    assert.equal(alpha(glass.settings.row.background), 0, 'rows share their card');
    assert.match(glass.settings.row.divider, /inset/, 'rows are split by hairlines');
    assert.equal(glass.settings.row.radius, '0px');
    // iOS controls: a 40 × 24 switch; a segmented track with a neutral thumb, not the accent; a round white slider thumb.
    assert.deepEqual(glass.settings.switch, ['40px', '24px']);
    assert.equal(glass.settings.segments.track, 'rgb(36, 37, 40)', 'the segments sit in one track');
    assert.equal(glass.settings.segments.chosen, 'rgb(112, 115, 121)', 'the chosen segment is a neutral thumb');
    assert.equal(glass.settings.segments.ink, 'rgb(255, 255, 255)');
    assert.equal(glass.dice.chosen, 'rgb(112, 115, 121)', 'so is the chosen die');
    assert.deepEqual(glass.settings.thumb, ['28px', '28px', '50%', 'rgb(255, 255, 255)']);
    // The tiles and the life halves are the same in both styles.
    assert.deepEqual(glass.tile, material.tile, 'tiles and life halves don’t change');
  });
}

// ---- Fallbacks ----------------------------------------------------------------------------------------------------

// The pill, the dice dialog and the settings header: their backdrop filter, whether their fill is opaque, and their edge.
async function readChrome(page) {
  const pill = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('#board-controls'), '::before');
    return { filter: s.webkitBackdropFilter ?? s.backdropFilter, opaque: !s.backgroundColor.startsWith('rgba'), edge: `${s.borderTopWidth} ${s.borderTopColor}` };
  });
  await button(page, 'Roll dice').tap();
  const dice = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('#dice'));
    return { filter: s.webkitBackdropFilter ?? s.backdropFilter, opaque: !s.backgroundColor.startsWith('rgba'), edge: `${s.borderTopWidth} ${s.borderTopColor}` };
  });
  await button(page, 'Close dice').tap();
  await button(page, 'Settings').tap();
  const head = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.fs-head'));
    return { filter: s.webkitBackdropFilter ?? s.backdropFilter, opaque: !s.backgroundColor.startsWith('rgba'), edge: s.boxShadow.match(/0px 0px 0px (\d+px) inset/)?.[1] ?? 'none' };
  });
  await button(page, 'Close settings').tap();
  return { pill, dice, head };
}
const glassGame = { startingLife: 40, scores: [40, 40, 40, 40], style: 'glass' };
const solid = { filter: 'none', opaque: true };

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: Glass goes solid with a 2px outline under prefers-contrast: more`, async (t) => {
    const page = await openPage(t, engine, { media: { contrast: 'more' } });
    await seed(page, 'web', glassGame);
    const chrome = await readChrome(page);
    // The outline is the 3:1 control border (#8b8f97).
    assert.deepEqual(chrome.pill, { ...solid, edge: '2px rgb(139, 143, 151)' });
    assert.deepEqual(chrome.dice, { ...solid, edge: '2px rgb(139, 143, 151)' });
    assert.deepEqual(chrome.head, { ...solid, edge: '2px' });
  });

  test(`${name}: Glass goes solid where backdrop-filter isn't supported`, async (t) => {
    const page = await openPage(t, engine);
    await seed(page, 'web', glassGame);
    // The @supports block applies only where neither backdrop-filter nor -webkit-backdrop-filter works, so in a browser
    // that has them it's dormant. Its rules are applied as an engine without them would, as a constructed sheet (the CSP
    // allows no inline styles).
    const block = css.match(/@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{\n([\s\S]+?)\n\}/);
    assert.ok(block, 'styles.css has the @supports fallback');
    assert.equal(await page.evaluate(() => CSS.supports('(backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))')), true, 'this browser draws the blur');
    assert.equal((await readChrome(page)).pill.filter, 'blur(18px) saturate(1.3)', 'so Glass is frosted here');
    await page.evaluate((rules) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(rules);
      document.adoptedStyleSheets = [sheet];
    }, block[1]);
    const chrome = await readChrome(page);
    for (const part of ['pill', 'dice', 'head']) assert.deepEqual({ filter: chrome[part].filter, opaque: chrome[part].opaque }, solid, `without the blur, the ${part} is solid`);
  });
}

test('chromium: Glass goes solid under prefers-reduced-transparency: reduce', async (t) => {
  const page = await openPage(t, chromium);
  await seed(page, 'web', glassGame);
  // Playwright has no option for this query, so it's emulated through the DevTools protocol.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches), true);
  const chrome = await readChrome(page);
  for (const part of ['pill', 'dice', 'head']) assert.deepEqual({ filter: chrome[part].filter, opaque: chrome[part].opaque }, solid, `the ${part} is solid`);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'no-preference' }] });
  assert.equal((await readChrome(page)).pill.filter, 'blur(18px) saturate(1.3)', 'and frosted again without it');
});

// ---- Motion -------------------------------------------------------------------------------------------------------

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: Glass presses shrink to 96% with a spring, and neither moves under reduced motion`, async (t) => {
    const read = page => page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const done = getComputedStyle(document.querySelector('#dice-roll'));
      return { scale: root.getPropertyValue('--press-scale').trim(), motion: root.getPropertyValue('--motion').trim(), transition: done.transitionDuration };
    });
    const moving = await openPage(t, engine, { media: { reducedMotion: 'no-preference' } });
    await seed(moving, 'web', glassGame);
    assert.deepEqual(await read(moving), { scale: '.96', motion: '.25s', transition: '0.25s' });
    const still = await openPage(t, engine, { media: { reducedMotion: 'reduce' } });
    await seed(still, 'web', glassGame);
    assert.deepEqual(await read(still), { scale: '1', motion: '.25s', transition: '0s' }, 'no scaling and no transitions under reduced motion');
  });
}
