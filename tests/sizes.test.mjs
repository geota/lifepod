import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, webkit } from 'playwright-core';
import { app, button, fakeScreenOrientation, turnScreen } from './helpers.mjs';

// Screens the board is checked on, by CSS size in landscape. 320 × 568 is a stress test: no phone people still
// use is that small, but if it fits there it fits everywhere. 360 × 640 is the smallest real phone, so design
// trade-offs such as chip spacing are judged there. Foldables have a very narrow cover screen and a nearly
// square inner screen. Tablets must scale up, not just leave phone-sized controls in bigger tiles.
const screens = {
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
    const shrunk = [...player.querySelectorAll('.badges')].filter(row => !row.hidden && row.style.fontSize).length;
    return { outside, small, shrunk };
  }), [targets, content]);
}

function checkTiles(tiles, view) {
  tiles.forEach(({ outside, small }, index) => {
    assert.deepEqual(outside, [], `${view}, player ${index + 1}: nothing is clipped by the tile`);
    assert.deepEqual(small, [], `${view}, player ${index + 1}: every target is at least 44px`);
  });
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
      for (const count of [2, 4, 6]) {
        const view = `${count} players, ${name}, ${portrait ? 'portrait' : 'landscape'}`;
        const { page, errors } = await openBoard(browser, size, count, portrait);
        const tiles = await readTiles(page, '.controls button', `${life}, .badges .chip`);
        checkTiles(tiles, view);
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
          assert.deepEqual(tiles.map(tile => tile.shrunk), Array(count).fill(0), `${view}: badge rows fit without shrinking`);
        }
        if (count === 4 && !portrait) scale[name] = await readScale(page);

        if (count === 4) {
          await button(page, 'Commander damage').tap();
          checkTiles(await readTiles(page, '.map-cell[data-attacker]', '.map-cell'), `${view}, commander damage`);
          if (!portrait) scale[name].mapCell = await readModeScale(page, '.map-cell[data-attacker]');
          await button(page, 'Cancel').tap();

          await button(page, 'Counters').tap();
          checkTiles(await readTiles(page, '.counter-row button', '.counter-value'), `${view}, counters`);
          if (!portrait) scale[name].counterButton = await readModeScale(page, '.counter-row button');
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
