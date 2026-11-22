import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, webkit } from 'playwright-core';
import { app, button, fakeScreenOrientation, turnScreen } from './helpers.mjs';

// Screens the board is checked on, by CSS size in landscape. The design target is a Pixel 11 Pro class phone at
// 952 × 427. 320 × 568 is a stress test: no phone people still use is that small, but if it fits there it fits
// everywhere. 360 × 640 is the smallest real phone, so design trade-offs such as chip spacing are judged there.
// Foldables have a very narrow cover screen and a nearly square inner screen. Tablets must scale up, not just
// leave phone-sized controls in bigger tiles.
const screens = {
  'target (Pixel 11 Pro)': [952, 427],
  'stress test (iPhone SE, 1st gen)': [568, 320],
  'smallest real phone (small Android)': [640, 360],
  'iPhone SE': [667, 375],
  'foldable, cover screen': [882, 344],
  'foldable, inner screen': [841, 701],
  'largest phone': [932, 430],
  'iPad': [1024, 768],
  'Android tablet': [1280, 800],
  'iPad Pro 13"': [1366, 1024],
};
const smallestRealPhone = 360;
const tablets = ['iPad', 'Android tablet', 'iPad Pro 13"'];

// A busy game: every counter on, colour identities set and commander damage from most opponents.
function busyGame(count) {
  return {
    startingLife: 40, scores: Array.from({ length: count }, (_, i) => [40, 33, 112, 5, -3, 19][i]),
    rotations: Array(count).fill(0), keepAwake: true, landscapeAngle: 90, colors: Array(count).fill(null),
    counters: { commander: true, poison: true },
    poison: Array.from({ length: count }, (_, i) => [0, 1, 7, 10, 2, 9][i]),
    casts: Array.from({ length: count }, (_, i) => [1, 2, 0, 5, 1, 3][i]),
    identities: ['WUBRG', 'UB', 'R', 'BG', 'WUR', 'RG'].slice(0, count),
    commanderDamage: Array.from({ length: count }, (_, defender) => Array.from({ length: count }, (_, attacker) =>
      (defender === attacker ? 0 : [21, 16, 12, 8, 3][(defender + attacker) % 5]))),
  };
}

async function openBoard(browser, [width, height], count, portrait) {
  const page = await browser.newPage({ isMobile: true, hasTouch: true, viewport: portrait ? { width: height, height: width } : { width, height } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await fakeScreenOrientation(page);
  await page.addInitScript(game => {
    if (!sessionStorage.getItem('test-seeded')) {
      localStorage.setItem('lifepod-game', game);
      sessionStorage.setItem('test-seeded', '1');
    }
  }, JSON.stringify(busyGame(count)));
  await page.goto(app);
  await turnScreen(page, page.viewportSize().width, page.viewportSize().height, portrait ? 0 : 90);
  return { page, errors };
}

// Every visible control, count and chip sits inside its own tile, and every target is at least 44px.
function readTiles(page, targets, content) {
  return page.locator('.player').evaluateAll((players, [targets, content]) => players.map(player => {
    const tile = player.getBoundingClientRect();
    const visible = element => element.checkVisibility({ visibilityProperty: true }) && element.offsetWidth > 0;
    const outside = [...player.querySelectorAll(`${targets}, ${content}`)].filter(visible).filter(element => {
      const box = element.getBoundingClientRect();
      return box.left < tile.left - 0.5 || box.top < tile.top - 0.5 || box.right > tile.right + 0.5 || box.bottom > tile.bottom + 0.5;
    }).map(element => element.className || element.tagName);
    const small = [...player.querySelectorAll(targets)].filter(visible)
      .filter(element => element.offsetWidth < 43.5 || element.offsetHeight < 43.5)
      .map(element => `${element.className} ${element.offsetWidth}×${element.offsetHeight}`);
    return { outside, small };
  }), [targets, content]);
}

function checkTiles(tiles, view) {
  tiles.forEach(({ outside, small }, index) => {
    assert.deepEqual(outside, [], `${view}, player ${index + 1}: nothing is clipped by the tile`);
    assert.deepEqual(small, [], `${view}, player ${index + 1}: every target is at least 44px`);
  });
}

// What every tile draws: its total, its − and + glyphs, and the type of each badge row.
function readUniform(page) {
  return page.locator('.player').evaluateAll(players => players.map((player) => {
    const font = selector => parseFloat(getComputedStyle(player.querySelector(selector)).fontSize);
    return { total: font('.score'), glyph: font('.controls .add'), near: font('.badges.near'), far: font('.badges.far') };
  }));
}

function checkUniform(tiles, view) {
  for (const part of ['total', 'glyph', 'near', 'far']) {
    const sizes = tiles.map(tile => tile[part]);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 0.5, `${view}: every tile's ${part} is the same size (${sizes.join(', ')})`);
  }
}

// Sizes measured against the tile's reading width, in layout pixels, so turned tiles compare fairly.
function readScale(page) {
  return page.locator('.player-face').first().evaluate(face => {
    const width = face.offsetWidth;
    const size = selector => {
      const element = face.querySelector(selector);
      return element && element.offsetWidth ? element : null;
    };
    const font = selector => parseFloat(getComputedStyle(size(selector) ?? face.parentElement.querySelector(selector)).fontSize);
    return {
      score: font('.score') / width,
      lifeButton: size('.controls .add').offsetWidth / width,
      glyph: font('.controls .add') / width,
      badge: font('.badges') / width,
    };
  });
}
function readModeScale(page, selector) {
  return page.locator('.player-face').first().evaluate((face, selector) => {
    const element = [...face.parentElement.querySelectorAll(selector)].find(found => found.offsetWidth);
    return element.offsetWidth / face.offsetWidth;
  }, selector);
}

async function checkSizes(t, engine) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const life = '.controls button, .controls .score';
  const scale = {};

  for (const [name, size] of Object.entries(screens)) {
    for (const portrait of [false, true]) {
      // The board turns to landscape either way, so the odd player counts are only checked in landscape.
      for (const count of portrait ? [2, 4, 6] : [2, 3, 4, 5, 6]) {
        const view = `${count} players, ${name}, ${portrait ? 'portrait' : 'landscape'}`;
        const { page, errors } = await openBoard(browser, size, count, portrait);
        const tiles = await readTiles(page, '.controls button', `${life}, .badges .chip`);
        checkTiles(tiles, view);
        // One size per board: every tile draws its total, glyphs and badges at the same size.
        checkUniform(await readUniform(page), view);
        // The centre pill's buttons are targets too.
        const pill = await page.locator('#board-controls .pill-button').evaluateAll(buttons => buttons.filter(button => !button.hidden)
          .filter(button => button.offsetWidth < 43.5 || button.offsetHeight < 43.5).map(button => button.getAttribute('aria-label')));
        assert.deepEqual(pill, [], `${view}: every pill button is at least 44px`);
        // No badge hides under the centre controls.
        const covered = await page.evaluate(() => {
          const pill = document.querySelector('#board-controls').getBoundingClientRect();
          return [...document.querySelectorAll('.badges .chip')].filter(chip => chip.offsetWidth).filter(chip => {
            const box = chip.getBoundingClientRect();
            return box.left < pill.right && box.right > pill.left && box.top < pill.bottom && box.bottom > pill.top;
          }).map(chip => chip.textContent);
        });
        assert.deepEqual(covered, [], `${view}: no badge under the centre controls`);
        if (Math.min(...size) >= smallestRealPhone) {
          const drops = await page.locator('#board').evaluate(node => [node.dataset.drop ?? '',
            node.style.getPropertyValue('--near-badge-size'), node.style.getPropertyValue('--far-badge-size')]);
          assert.deepEqual(drops, ['', '', ''], `${view}: badge rows fit at full size with nothing dropped`);
        }
        if (count === 4 && !portrait) scale[name] = await readScale(page);

        if (count === 4) {
          await button(page, 'Commander damage').tap();
          checkTiles(await readTiles(page, '.map-cell[data-attacker]', '.map-cell'), `${view}, commander damage`);
          if (!portrait) scale[name].mapCell = await readModeScale(page, '.map-cell[data-attacker]');
          await button(page, 'Cancel').tap();

          await button(page, 'Counters').tap();
          checkTiles(await readTiles(page, '.counter-cell', '.counter-cell'), `${view}, counters`);
          if (!portrait) scale[name].counterCell = await readModeScale(page, '.counter-cell');
          await button(page, 'Cancel').tap();

          await button(page, 'Game setup').tap();
          await button(page, 'Colours').tap();
          checkTiles(await readTiles(page, '.swatch, .identity-toggle, .identity-button', '.layer-hint'), `${view}, colours`);
          if (!portrait) scale[name].swatch = await readModeScale(page, '.swatch');
        }
        await page.close();
        assert.deepEqual(errors, [], `${view}: no script errors`);
      }
    }
  }

  // On a tablet, 4-player tiles keep about the proportions they have on a current phone instead of leaving
  // phone-sized controls in a much bigger tile. Each size is relative to the tile's reading width.
  const phone = scale['largest phone'];
  for (const name of tablets) {
    for (const [part, value] of Object.entries(scale[name])) {
      assert.ok(value >= phone[part] * 0.8,
        `${name}: ${part} keeps its proportion of the tile (${value.toFixed(3)} against ${phone[part].toFixed(3)} on the largest phone)`);
    }
  }
}

test('the board fits and scales on small phones, foldables and tablets in Chromium', t => checkSizes(t, chromium));
test('the board fits and scales on small phones, foldables and tablets in WebKit', t => checkSizes(t, webkit));

// Game setup fits without scrolling from a 952 × 427 phone down to the 568 × 320 stress test, where the header folds
// into the Players row. Every control is on the sheet and at least 44px, with Custom life's stepper too, and so
// does the Track sheet.
async function checkSetup(t, engine) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ isMobile: true, hasTouch: true, viewport: { width: 952, height: 427 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await fakeScreenOrientation(page);
  await page.goto(app);
  const check = dialog => page.locator(dialog).evaluate((sheet) => {
    const found = [];
    if (sheet.scrollHeight > sheet.clientHeight + 0.5) found.push(`scrolls ${sheet.scrollHeight} > ${sheet.clientHeight}`);
    const box = sheet.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight || box.left < 0 || box.right > window.innerWidth) found.push(`sheet ${JSON.stringify(box)}`);
    const shown = [...sheet.querySelectorAll('button, label')].filter(node => node.checkVisibility({ visibilityProperty: true }) && node.offsetWidth);
    for (const node of shown) {
      const target = node.getBoundingClientRect();
      const name = node.getAttribute('aria-label') ?? node.textContent.trim();
      if (target.width < 43.5 || target.height < 43.5) found.push(`${name} ${Math.round(target.width)}×${Math.round(target.height)}`);
      if (target.top < box.top || target.bottom > box.bottom || target.left < box.left || target.right > box.right) found.push(`${name} off the sheet`);
    }
    return { found, height: Math.round(box.height), count: shown.length };
  });
  for (const [width, height, angle] of [[952, 427, 90], [852, 393, 90], [640, 360, 90], [568, 320, 90], [320, 568, 0]]) {
    const view = `${width} × ${height}`;
    await turnScreen(page, width, height, angle);
    await button(page, 'Game setup').tap();
    const setup = await check('#setup');
    assert.deepEqual(setup.found, [], `${view}: setup`);
    // Header (About, ✕), five players, four life choices, Track, Colours, Rotate seats, Keep awake, New game and Done.
    assert.equal(setup.count, 17, `${view}: every setup control shows`);
    const folded = await page.evaluate(() => {
      const title = document.querySelector('#setup-title').getBoundingClientRect();
      const close = document.querySelector('#setup [data-close]').getBoundingClientRect();
      const players = document.querySelector('#player-choices').getBoundingClientRect();
      return { title: title.width > 1, sameRow: Math.abs((close.top + close.bottom) / 2 - (players.top + players.bottom) / 2) < 2 };
    });
    if (height < 360) assert.deepEqual(folded, { title: false, sameRow: true }, `${view}: the header folds into the Players row`);
    else assert.equal(folded.title, true, `${view}: the title shows`);
    await page.locator('#custom-life').tap();
    assert.deepEqual((await check('#setup')).found, [], `${view}: setup with the custom life stepper`);
    await button(page, 'Track').tap();
    assert.deepEqual((await check('#track')).found, [], `${view}: Track`);
    await button(page, 'Close setup').tap();
  }
  assert.deepEqual(errors, [], 'no script errors');
}

test('chromium: setup fits phones from 427 to 320 tall without scrolling', t => checkSetup(t, chromium));
test('webkit: setup fits phones from 427 to 320 tall without scrolling', t => checkSetup(t, webkit));
