import assert from 'node:assert/strict';
import { button, engines, openPage, seedGame, stripProblems, test, tileProblems } from './helpers.mjs';

// The size checks, run once per style (the Style setting, design/polish/STYLE.md) and split by concern, so each file is
// short and the files run side by side: sizes-fit, sizes-settings and sizes-pill run them in Material, and the -glass
// files in Glass. Each check seeds its games with the style.

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
// The board fit runs in two files: phones, and the larger screens with the largest phone that tablets are compared with.
const fitScreens = {
  phones: ['target (Pixel 11 Pro)', 'stress test (iPhone SE, 1st gen)', 'smallest real phone (small Android)', 'iPhone SE'],
  large: ['foldable, cover screen', 'foldable, inner screen', 'largest phone', ...tablets],
};

// A busy game: every counter on, colour identities set, commander damage from most opponents, Turn by turn with Player 2
// active and Player 1 first, and mana floating in Player 1's pool, so the pill holds every button at rest. Every chip is
// on: Player 2, the active player, is the monarch, and the initiative is held by a player who is out and hasn't passed
// it on (Player 5, at −3 life, or Player 4, out on poison, with four), so their row shows the "Pass it on" hint.
function busyGame(count, style) {
  return {
    style,
    startingLife: 40, scores: Array.from({ length: count }, (_, i) => [40, 33, 112, 5, -3, 19][i]),
    rotations: Array(count).fill(0), keepAwake: true, landscapeAngle: 90, colors: Array(count).fill(null),
    counters: { commander: true, poison: true, energy: true, experience: true, rad: true, monarch: true, initiative: true },
    monarch: 1, initiative: count >= 5 ? 4 : count === 4 ? 3 : 0,
    poison: Array.from({ length: count }, (_, i) => [0, 1, 7, 10, 2, 9][i]),
    casts: Array.from({ length: count }, (_, i) => [1, 2, 0, 5, 1, 3][i]),
    energy: Array.from({ length: count }, (_, i) => [12, 2, 0, 8, 1, 3][i]),
    experience: Array.from({ length: count }, (_, i) => [10, 0, 1, 0, 3, 1][i]),
    rad: Array.from({ length: count }, (_, i) => [14, 0, 0, 2, 0, 6][i]),
    identities: ['WUBRG', 'UB', 'R', 'BG', 'WUR', 'RG'].slice(0, count),
    commanderDamage: Array.from({ length: count }, (_, defender) => Array.from({ length: count }, (_, attacker) =>
      (defender === attacker ? 0 : [21, 16, 12, 8, 3][(defender + attacker) % 5]))),
    turns: 'turns', turn: { first: 0, active: 1, round: 3 },
    manaPool: true, pools: Array.from({ length: count }, (_, i) => (i === 0 ? [0, 0, 0, 3, 0, 1] : [0, 0, 0, 0, 0, 0])),
  };
}

async function openBoard(t, engine, [width, height], count, portrait, style) {
  return openPage(t, engine, {
    viewport: portrait ? { width: height, height: width } : { width, height }, orientation: portrait ? 0 : 90, game: busyGame(count, style),
  });
}

// Every visible control, count and chip sits inside its own tile, and every target is a whole 44px target
// (tileProblems). The pill is checked on its own below.
async function checkTiles(page, targets, content, view) {
  assert.deepEqual(await tileProblems(page, { targets, parts: content, pill: false }), [], `${view}: every target is a whole 44px target and nothing is clipped by its tile`);
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

async function checkSizes(t, engine, style, names) {
  const life = '.controls button, .controls .score';
  const scale = {};

  for (const name of names) {
    const size = screens[name];
    for (const portrait of [false, true]) {
      // The board turns to landscape either way, so the odd player counts are only checked in landscape.
      for (const count of portrait ? [2, 4, 6] : [2, 3, 4, 5, 6]) {
        const view = `${count} players, ${name}, ${portrait ? 'portrait' : 'landscape'}`;
        const page = await openBoard(t, engine, size, count, portrait, style);
        await checkTiles(page, '.controls button, .mana-strip button:not(.chip)', `${life}, .badges .chip, .mana-strip`, view);
        // The mana strip never covers a life total or its glyphs.
        assert.deepEqual(await stripProblems(page), [], `${view}: the mana strip is clear of the total and glyphs`);
        // One size per board: every tile draws its total, glyphs and badges at the same size.
        checkUniform(await readUniform(page), view);
        // The centre pill's buttons are targets too.
        const pill = await page.locator('#board-controls .pill-button').evaluateAll(buttons => buttons.filter(button => !button.hidden)
          .filter(button => button.offsetWidth < 43.5 || button.offsetHeight < 43.5).map(button => button.getAttribute('aria-label')));
        assert.deepEqual(pill, [], `${view}: every pill button is at least 44px`);
        // No badge hides under the centre controls.
        assert.deepEqual(await tileProblems(page, { parts: '.badges .chip' }), [], `${view}: no badge under the centre controls`);
        if (Math.min(...size) >= smallestRealPhone) {
          const drops = await page.locator('#board').evaluate(node => [node.dataset.drop ?? '',
            node.querySelector('.near-edge').style.getPropertyValue('--near-badge-size'), node.querySelector('.far-edge').style.getPropertyValue('--far-badge-size'),
            [...node.querySelectorAll('.badges.near > .strip-chip')].some(chip => chip.checkVisibility())]);
          // With every counter on, the identity names may go on the smallest real phones (design/polish/SPEC.md §3.2,
          // a typical 6-player game at 640 × 360), and the near row may wrap where a folded mana strip ends it (commander
          // damage keeps the far row to itself, §9), but nothing else does and no type shrinks.
          const allowed = ['name', ...(drops[3] ? ['wrap'] : [])];
          assert.ok(drops[0].split(' ').filter(Boolean).every(token => allowed.includes(token)), `${view}: at most the identity names give way (${drops[0]})`);
          assert.deepEqual(drops.slice(1, 3), ['', ''], `${view}: badge rows keep their full type`);
        }
        if (count === 4 && !portrait) scale[name] = await readScale(page);

        if (count === 4) {
          await button(page, 'Commander damage').tap();
          await checkTiles(page, '.map-cell[data-attacker]', '.map-cell', `${view}, commander damage`);
          if (!portrait) scale[name].mapCell = await readModeScale(page, '.map-cell[data-attacker]');
          await button(page, 'Cancel').tap();

          await button(page, 'Counters').tap();
          await checkTiles(page, '.counter-cell', '.counter-cell', `${view}, counters`);
          if (!portrait) scale[name].counterCell = await readModeScale(page, '.counter-cell');
          await button(page, 'Cancel').tap();

          await button(page, 'Mana pool').tap();
          await checkTiles(page, '.mana-cell', '.mana-cell', `${view}, mana`);
          await button(page, 'Cancel').tap();

          await button(page, 'Settings').tap();
          await button(page, 'Choose tile colours on the board').tap();
          await checkTiles(page, '.swatch', '.layer-hint', `${view}, colours`);
          if (!portrait) scale[name].swatch = await readModeScale(page, '.swatch');
          await button(page, 'Done choosing colours').tap();

          await button(page, 'Settings').tap();
          await button(page, 'Choose identities on the board').tap();
          await checkTiles(page, '.identity-toggle', '.identity-preview .chip', `${view}, identity`);
          if (!portrait) scale[name].identityToggle = await readModeScale(page, '.identity-toggle');
        }
        await page.close();
      }
    }
  }

  // On a tablet, 4-player tiles keep about the proportions they have on a current phone instead of leaving
  // phone-sized controls in a much bigger tile. Each size is relative to the tile's reading width.
  const phone = scale['largest phone'];
  for (const name of tablets.filter(tablet => names.includes(tablet))) {
    for (const [part, value] of Object.entries(scale[name])) {
      assert.ok(value >= phone[part] * 0.8,
        `${name}: ${part} keeps its proportion of the tile (${value.toFixed(3)} against ${phone[part].toFixed(3)} on the largest phone)`);
    }
  }
}


// Settings is a full-screen page (design/polish/SETTINGS-SPEC.md §3) on every screen above, landscape and portrait: the
// header stays in view while the body scrolls, nothing is wider than the window, and every control is at least 44px
// and whole. Two columns from 620px wide, one below.
async function checkSettings(t, engine, style) {
  for (const [name, size] of Object.entries(screens)) {
    for (const portrait of [false, true]) {
      const view = `${name}, ${portrait ? 'portrait' : 'landscape'}`;
      const page = await openBoard(t, engine, size, 4, portrait, style);
      await button(page, 'Settings').tap();
      // A pending new game adds its line, the widest the page gets.
      await button(page, '6 players').tap();
      const read = () => page.evaluate(() => {
        const found = [];
        const dialog = document.querySelector('#settings');
        const body = document.querySelector('#settings-body');
        const head = dialog.querySelector('.fs-head').getBoundingClientRect();
        if (head.top < 0 || head.bottom > innerHeight / 2) found.push(`header ${head.top}–${head.bottom}`);
        if (body.scrollWidth > body.clientWidth + 0.5) found.push(`scrolls sideways ${body.scrollWidth} > ${body.clientWidth}`);
        const shown = node => node.checkVisibility({ visibilityProperty: true }) && node.offsetWidth > 0;
        for (const node of [...dialog.querySelectorAll('*')].filter(shown)) {
          const box = node.getBoundingClientRect();
          if (box.left < -0.5 || box.right > innerWidth + 0.5) found.push(`${node.id || node.className} runs off the side`);
        }
        for (const node of [...dialog.querySelectorAll('button, label, .k-slider')].filter(shown)) {
          if (node.offsetWidth < 43.5 || node.offsetHeight < 43.5) found.push(`${node.getAttribute('aria-label') ?? node.id ?? node.textContent.trim()} ${node.offsetWidth}×${node.offsetHeight}`);
        }
        for (const label of [...dialog.querySelectorAll('.nav-label, .setting-label, .k-stop')].filter(shown)) {
          if (label.scrollWidth > label.clientWidth + 0.5) found.push(`${label.textContent.trim()} is cut short`);
        }
        return { found, columns: document.querySelector('#settings-content').hasAttribute('data-columns'), scrolls: body.scrollHeight > body.clientHeight + 1 };
      });
      const top = await read();
      assert.deepEqual(top.found, [], `${view}: settings fits`);
      assert.equal(top.columns, page.viewportSize().width >= 620, `${view}: ${top.columns ? 'two columns' : 'one column'}`);
      if (top.scrolls) {
        const head = await page.locator('.fs-head').boundingBox();
        await page.locator('#settings-body').evaluate((body) => { body.scrollTop = body.scrollHeight; });
        assert.deepEqual(await page.locator('.fs-head').boundingBox(), head, `${view}: the header stays visible as the body scrolls`);
        assert.deepEqual((await read()).found, [], `${view}: settings fits, scrolled to the end`);
      }
      await page.close();
    }
  }
}


// The centre pill never covers a life total, a − or + glyph, a badge, a strip or the "Out" tag
// (design/polish/FINAL-REVIEW.md #1 and #2), at its widest (round, commander damage, counters, mana, dice and setup), at
// every player count, on phones from 952 × 427 down to 568 × 320 and 320 × 568, on the foldable and the tablet, with
// the seats as dealt and rotated every way. Board modes keep their targets clear of it too, inside their tiles.
// The screens come in three groups, each in its own file so none is slow: the larger landscape phones, the smaller ones
// and the rest.
const pillScreens = {
  phones: [[952, 427], [852, 393]],
  small: [[640, 360], [568, 320]],
  other: [[320, 568], [375, 667], [841, 701], [1366, 1024]],
};
const pillRotations = [null, [1, 2, 3, 0, 1, 3], [2, 2, 2, 2, 2, 2], [3, 1, 2, 3, 3, 1], [1, 1, 1, 1, 1, 1]];

// What a tile shows that sits under the pill, or outside its tile (tileProblems): display parts against the pill's whole
// box, and the strip's and the modes' targets against the pill as drawn.
function underPill(page) {
  return tileProblems(page, {
    targets: '.mana-strip button, .mode-layer button:not(.visually-hidden)',
    parts: '.score, .out-tag, .controls button .icon, .badges .chip, .rotate-badge, .mode-layer .identity-preview > *',
  });
}

function pillGame(count, rotations, style) {
  return { ...busyGame(count, style), rotations: rotations ? rotations.slice(0, count) : Array(count).fill(0) };
}

async function checkPill(t, engine, style, screens) {
  for (const [width, height] of screens) {
    const page = await openPage(t, engine, { viewport: { width, height }, orientation: height > width ? 0 : 90 });
    for (const count of [2, 3, 4, 5, 6]) {
      for (const rotations of pillRotations) {
        const view = `${width} × ${height}, ${count} players, seats ${rotations ? rotations.slice(0, count).join('') : 'as dealt'}`;
        await seedGame(page, pillGame(count, rotations, style));
        assert.equal(await page.locator('#board-controls .pill-button:not([hidden])').count(), 6, `${view}: the pill is at its widest`);
        assert.deepEqual(await underPill(page), [], `${view}: nothing is under the pill`);
        // The board modes, at the target and the stress size.
        if ((width === 952 || width === 568) && rotations !== pillRotations[2]) {
          for (const [open, close] of [['Commander damage', 'Cancel'], ['Counters', 'Cancel'], ['Mana pool', 'Cancel']]) {
            await button(page, open).tap();
            assert.deepEqual(await underPill(page), [], `${view}, ${open}: every target is clear of the pill and inside its tile`);
            await button(page, close).tap();
          }
          for (const [row, done] of [[['Choose tile colours on the board'], 'Done choosing colours'], [['Choose identities on the board'], 'Done choosing identities'], [['Rotate seats on the board'], 'Done rotating seats']]) {
            await button(page, 'Settings').tap();
            for (const name of row) await button(page, name).tap();
            assert.deepEqual(await underPill(page), [], `${view}, ${row.at(-1)}: every target is clear of the pill and inside its tile`);
            await button(page, done).tap();
          }
        }
      }
    }
    await page.close();
  }
}


// A rotated seat's edge that faces the pill gets the far row's clearance (design/polish/FINAL-REVIEW.md #2). With 2 players
// the pill stands along the middle seam. Player 1 turned upside down faces it with the start of its face (its − glyph),
// and Player 2 turned twice with its near row (its identity chip); both stay in full view beside the pill.
async function checkRotatedClearance(t, engine, style) {
  const game = {
    ...busyGame(2, style), rotations: [1, 2], counters: { commander: true }, turns: 'rounds', turn: { first: 0, active: 0, round: 9 },
    manaPool: false, identities: ['WR', 'UBRG'], identity: { show: { name: true }, background: 'default', version: 2 },
  };
  const page = await openPage(t, engine, { orientation: 90, game });
  const state = await page.evaluate(() => {
    const pill = document.querySelector('#board-controls');
    const box = pill.getBoundingClientRect();
    const players = [...document.querySelectorAll('.player')];
    const clearance = player => Object.fromEntries(['far', 'end', 'near', 'start'].map(edge => [edge, player.style.getPropertyValue(`--clear-${edge}`)]).filter(([, value]) => value));
    const gap = (element) => {
      const part = element.getBoundingClientRect();
      return Math.round(Math.max(box.left - part.right, part.left - box.right, box.top - part.bottom, part.top - box.bottom));
    };
    return {
      vertical: box.height > box.width && pill.hasAttribute('data-vertical'),
      clearance: players.map(clearance),
      glyph: gap(players[0].querySelector('.subtract .icon')),
      chip: gap(players[1].querySelector('.ci-chip')),
    };
  });
  assert.equal(state.vertical, true, 'with 2 players the pill stands along the middle seam');
  assert.deepEqual(state.clearance.map(Object.keys), [['start'], ['near']], 'each tile clears the edge it turns toward the pill');
  assert.ok(state.glyph >= 2, `Player 1's − glyph is beside the pill, not under it (${state.glyph}px)`);
  assert.ok(state.chip >= 2, `Player 2's identity chip is beside the pill, not under it (${state.chip}px)`);
}

// Registers one part of the size checks ('fit-phones', 'fit-large', 'settings', 'pill-phones', 'pill-small' or
// 'pill-other') for one style, in Chromium and WebKit, named for
// the style.
export function sizeTests(style, part) {
  const name = { material: 'Material', glass: 'Glass' }[style];
  for (const [engineName, engine] of Object.entries(engines)) {
    if (part === 'fit-phones') {
      test(`${engineName}: the board fits on small phones (${name})`, { timeout: 300000 }, t => checkSizes(t, engine, style, fitScreens.phones));
    } else if (part === 'fit-large') {
      test(`${engineName}: the board fits and scales on foldables, the largest phone and tablets (${name})`, { timeout: 300000 }, t => checkSizes(t, engine, style, fitScreens.large));
    } else if (part === 'settings') {
      test(`${engineName}: settings fills every screen with no sideways overflow and the header in view (${name})`, { timeout: 300000 }, t => checkSettings(t, engine, style));
    } else if (['pill-phones', 'pill-small', 'pill-other'].includes(part)) {
      const screens = pillScreens[part.slice('pill-'.length)];
      const sizes = screens.map(([width, height]) => `${width} × ${height}`).join(', ');
      test(`${engineName}: the centre pill never covers a total, a glyph or a badge, at any count or rotation, at ${sizes} (${name})`, { timeout: 300000 }, t => checkPill(t, engine, style, screens));
      if (part === 'pill-phones') test(`${engineName}: a rotated seat keeps the edge it turns toward the pill clear (${name})`, t => checkRotatedClearance(t, engine, style));
    } else throw new Error(`No size checks called ${part}`);
  }
}
