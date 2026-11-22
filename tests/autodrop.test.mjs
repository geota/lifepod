import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, webkit } from 'playwright-core';
import { app, button } from './helpers.mjs';

// Auto-drop (design/polish/SPEC.md §3.2): when a badge row runs out of room, parts give way in a fixed order on
// every tile at once, and no count is ever hidden. Today's rows hold the colour identity chip, poison and tax
// (near) and commander damage led by a sword (far); the turn chip comes later.

const seats = [0, 1, 2, 3, 4, 5];
// Long names, a four-colour pie and a shard symbol, so the identity chips are as wide as they get.
const longIdentities = ['WURG', 'UBRG', 'WBR', 'WUBG', 'WUBRG', 'R'];
const allParts = { indicator: true, symbol: true, name: true };

// Every counter on with two-digit counts, an identity on every tile and commander damage from every opponent.
// The chip shows the indicator, symbol and name unless told otherwise.
function worstGame(count, { damage = () => 19, show = allParts, poison = () => 19, identities = longIdentities } = {}) {
  return {
    startingLife: 40, scores: Array(count).fill(40), rotations: Array(count).fill(0), keepAwake: true, landscapeAngle: 90,
    colors: [], counters: { commander: true, poison: true },
    poison: seats.slice(0, count).map(poison), casts: Array(count).fill(49), identities: identities.slice(0, count),
    identity: { show, background: 'symbol' },
    commanderDamage: seats.slice(0, count).map(defender => seats.slice(0, count).map(attacker =>
      (defender === attacker ? 0 : damage(defender, attacker)))),
  };
}

async function openBoard(t, engine, game, { width, height }) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ isMobile: true, hasTouch: true, viewport: { width, height } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no script errors'));
  await page.addInitScript((saved) => {
    if (!sessionStorage.getItem('test-seeded')) {
      localStorage.setItem('lifepod-game', saved);
      sessionStorage.setItem('test-seeded', '1');
    }
  }, JSON.stringify(game));
  await page.goto(app);
  // Identity symbols are Mana glyphs, and the rows are fitted again once the font has loaded.
  await page.evaluate(() => document.fonts.ready);
  return page;
}

// Resizes the window and waits until the board has measured its new size, which also fits the badge rows.
async function resize(page, width, height = Math.round(width * 0.5625)) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(() => {
    const faces = [...document.querySelectorAll('.player-face')];
    return document.querySelector('#board').style.getPropertyValue('--ui') === `${Math.min(...faces.map(face => face.offsetWidth))}px`;
  });
}

// The board's drop tokens and badge sizes, and anything wrong: a count that's hidden, a chip outside its tile, or
// type under the 9px hard floor.
function readDrops(page) {
  return page.evaluate(() => {
    const board = document.querySelector('#board');
    const problems = [];
    for (const player of document.querySelectorAll('.player')) {
      const tile = player.getBoundingClientRect();
      for (const chip of player.querySelectorAll('.badges:not([hidden]) .chip')) {
        const shown = chip.checkVisibility() && chip.offsetWidth > 0;
        const count = !chip.matches('.sword, .ci-chip');
        if (count && !shown) problems.push(`hidden count: ${chip.textContent}`);
        if (!shown) continue;
        const box = chip.getBoundingClientRect();
        if (box.left < tile.left - 0.5 || box.right > tile.right + 0.5 || box.top < tile.top - 0.5 || box.bottom > tile.bottom + 0.5) {
          problems.push(`outside its tile: ${chip.textContent}`);
        }
      }
      for (const row of player.querySelectorAll('.badges:not([hidden])')) {
        if (parseFloat(getComputedStyle(row).fontSize) < 9) problems.push(`type under 9px: ${getComputedStyle(row).fontSize}`);
      }
    }
    return {
      drop: board.dataset.drop ?? '',
      near: board.style.getPropertyValue('--near-badge-size'),
      far: board.style.getPropertyValue('--far-badge-size'),
      problems,
    };
  });
}

// How far the near row has gone through its steps (design/polish/SPEC.md §3.2), as the number of the last step taken.
function nearStep({ drop, near }) {
  const tokens = drop.split(' ');
  if (tokens.includes('wrap')) return 6;
  if (tokens.includes('identity')) return parseFloat(near) < 11 ? 5 : 4;
  if (near) return 3;
  if (tokens.includes('symbol')) return 2;
  return tokens.includes('name') ? 1 : 0;
}

// The busiest game today, with the identity chip showing all three parts, stays at full size on the target phone
// and the smallest real phone, and at the stress size nothing is hidden or clipped whatever the platform's font.
async function checkWorstCase(t, engine) {
  for (const count of [4, 6]) {
    const page = await openBoard(t, engine, worstGame(count), { width: 952, height: 427 });
    for (const [width, height, full] of [[952, 427, true], [640, 360, true], [568, 320, false]]) {
      await resize(page, width, height);
      const view = `${count} players, ${width} × ${height}`;
      const drops = await readDrops(page);
      assert.deepEqual(drops.problems, [], `${view}: every count shows inside its tile`);
      if (full) assert.deepEqual([drops.drop, drops.near, drops.far], ['', '', ''], `${view}: full size, nothing dropped`);
    }
  }
}

// On windows narrower than any phone, today's rows do run out of room. The steps come in the spec's order, every
// count stays, and the board stays uniform. A sword dropped for a count of 10 doesn't come back at 9, and a new
// game starts at full size again. The identity chips show only the indicator here, so the near row has nothing to
// drop before its type shrinks.
async function checkSteps(t, engine) {
  // Player 1's far row is the busiest: 10 from Player 2's commander, 9 from everyone else.
  const indicator = { indicator: true, symbol: false, name: false };
  const game = worstGame(6, { show: indicator, damage: (defender, attacker) => (defender === 0 && attacker === 1 ? 10 : 9) });
  const page = await openBoard(t, engine, game, { width: 640, height: 360 });
  await resize(page, 640);
  assert.equal((await readDrops(page)).drop, '', 'full size at 640 × 360');

  // Narrow the window until the far row gives way: the sword goes first, before any type shrinks.
  let width = 640;
  let drops;
  do {
    width -= 2;
    await resize(page, width);
    drops = await readDrops(page);
    assert.deepEqual(drops.problems, [], `${width}px: every count shows inside its tile`);
  } while (!drops.drop.includes('sword') && width > 300);
  assert.deepEqual([drops.drop, drops.far], ['sword', ''], `${width}px: the sword is the first thing to go`);

  // One count down: the row would fit with the sword again, but not with 15% to spare, so it stays away.
  await button(page, 'Commander damage').tap();
  await page.locator('.player:nth-child(1)').getByRole('button', { name: "Remove one commander damage from Player 2's commander", exact: true })
    .evaluate(remove => remove.click());
  await button(page, 'Save').tap();
  assert.equal((await readDrops(page)).drop, 'sword', 'a count of 9 doesn’t bring the sword back');
  // A board opened fresh at this size with the same counts has room for it, so it was kept away on purpose.
  const saved = await page.evaluate(() => localStorage.getItem('lifepod-game'));
  const fresh = await openBoard(t, engine, JSON.parse(saved), { width, height: Math.round(width * 0.5625) });
  await resize(fresh, width);
  assert.equal((await readDrops(fresh)).drop, '', 'a fresh board at the same size shows the sword');
  // With plenty of room, it comes back.
  await resize(page, 952);
  assert.equal((await readDrops(page)).drop, '', 'room to spare brings the sword back');

  // With every count at 19, narrower windows take every far step: the sword goes, the type shrinks, never under
  // 9px, then the row wraps at full size. The near row shrinks its type before the identity chip goes. Every tile
  // uses the same steps and sizes throughout.
  const busy = await openBoard(t, engine, worstGame(6, { show: indicator }), { width: 560, height: 315 });
  const order = ['sword', 'far type', 'wrap-far'];
  let reached = -1;
  for (width = 560; width >= 300 && reached < 2; width -= 10) {
    await resize(busy, width);
    drops = await readDrops(busy);
    const view = `${width}px`;
    assert.deepEqual(drops.problems, [], `${view}: every count shows inside its tile`);
    const step = drops.drop.includes('wrap-far') ? 2 : drops.far ? 1 : drops.drop.includes('sword') ? 0 : -1;
    assert.ok(step >= reached, `${view}: steps only move forward as the window narrows (${order[step] ?? 'none'} after ${order[reached]})`);
    reached = step;
    if (drops.far) assert.ok(parseFloat(drops.far) >= 9 && parseFloat(drops.far) < 12.5, `${view}: far type ${drops.far} shrinks, never under 9px`);
    if (drops.drop.includes('wrap-far')) assert.equal(drops.far, '', `${view}: a wrapped row keeps its full type`);
    if (drops.drop.includes('identity')) assert.ok(drops.near, `${view}: the near row shrank before the identity chip went`);
    const sizes = await busy.locator('.badges').evaluateAll(rows => rows.map(row => `${row.classList[1]} ${getComputedStyle(row).fontSize}`));
    assert.equal(new Set(sizes).size, 2, `${view}: every near row and every far row is the same size (${[...new Set(sizes)]})`);
  }
  assert.equal(reached, 2, 'the far row wraps on the narrowest windows');

  // A new game resets the counts and starts at full size.
  await button(busy, 'Game setup').tap();
  await button(busy, 'New game').tap();
  await busy.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  await busy.waitForFunction(() => [...document.querySelectorAll('.badges.far')].every(row => row.hidden), null, { timeout: 2000 });
  drops = await readDrops(busy);
  assert.deepEqual([drops.drop, drops.near, drops.far], ['', '', ''], 'a new game is at full size');
}

// The near row gives way in the spec's order as the window narrows: the identity names, then the symbol (one colour
// mark is enough beside the indicator), then the type down to 11px, then the identity chip, then the type down to
// 9px, then a second line. Without the indicator the symbol is the chip's only colour mark, so it stays until the
// whole chip goes.
async function checkNearSteps(t, engine) {
  for (const [show, label] of [[allParts, 'all three parts'], [{ indicator: false, symbol: true, name: true }, 'symbol and name']]) {
    const page = await openBoard(t, engine, worstGame(6, { show }), { width: 640, height: 360 });
    let reached = 0;
    const seen = new Set();
    for (let width = 640; width >= 300; width -= 10) {
      await resize(page, width);
      const drops = await readDrops(page);
      const view = `${label}, ${width}px`;
      assert.deepEqual(drops.problems, [], `${view}: every count shows inside its tile`);
      const step = nearStep(drops);
      assert.ok(step >= reached, `${view}: steps only move forward as the window narrows (step ${step} after ${reached})`);
      reached = step;
      seen.add(step);
      const tokens = drops.drop.split(' ');
      if (show.indicator) {
        if (tokens.includes('symbol')) assert.ok(tokens.includes('name'), `${view}: the names go before the symbol`);
        if (tokens.includes('identity')) assert.ok(tokens.includes('symbol'), `${view}: the symbol goes before the chip`);
      } else {
        assert.ok(!tokens.includes('symbol'), `${view}: a symbol with no indicator beside it stays`);
        if (tokens.includes('identity')) assert.ok(tokens.includes('name'), `${view}: the names go before the chip`);
      }
      if (tokens.includes('name')) {
        const names = await page.locator('.badges.near .id-name').evaluateAll(nodes => nodes.filter(node => node.offsetWidth).length);
        assert.equal(names, 0, `${view}: a dropped name is gone from every tile`);
      }
    }
    assert.ok(seen.has(1), `${label}: the names go on their own first`);
    if (show.indicator) assert.ok(seen.has(2), `${label}: then the symbol`);
    assert.ok(reached >= 4, `${label}: the identity chip goes on the narrowest windows (reached step ${reached})`);
  }
}

// A name dropped for a count of 10 doesn't come back at 9, as with the sword.
async function checkNameHysteresis(t, engine) {
  // Player 1's near row is the busiest: poison 10 against 9 everywhere else, with the same long name on every tile.
  const game = worstGame(6, { poison: index => (index === 0 ? 10 : 9), identities: Array(6).fill('WURG') });
  const page = await openBoard(t, engine, game, { width: 640, height: 360 });
  await resize(page, 640);
  assert.equal((await readDrops(page)).drop, '', 'full size at 640 × 360');
  let width = 640;
  let drops;
  do {
    width -= 2;
    await resize(page, width);
    drops = await readDrops(page);
  } while (!drops.drop.includes('name') && width > 300);
  assert.deepEqual([drops.drop, drops.near], ['name', ''], `${width}px: the names are the first thing to go`);

  await button(page, 'Counters').tap();
  await page.locator('.player:nth-child(1)').getByRole('button', { name: 'Remove one poison counter from Player 1', exact: true })
    .evaluate(remove => remove.click());
  await button(page, 'Save').tap();
  assert.equal((await readDrops(page)).drop, 'name', 'a count of 9 doesn’t bring the names back');
  const saved = await page.evaluate(() => localStorage.getItem('lifepod-game'));
  const fresh = await openBoard(t, engine, JSON.parse(saved), { width, height: Math.round(width * 0.5625) });
  await resize(fresh, width);
  assert.equal((await readDrops(fresh)).drop, '', 'a fresh board at the same size shows the names');
  await resize(page, 952);
  assert.equal((await readDrops(page)).drop, '', 'room to spare brings the names back');
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: the busiest board today keeps every badge at full size on phones`, { timeout: 60000 }, t => checkWorstCase(t, engine));
  test(`${name}: badge rows give way in order, board-wide, without blinking`, { timeout: 120000 }, t => checkSteps(t, engine));
  test(`${name}: the near row drops names, then the symbol, before its type shrinks`, { timeout: 120000 }, t => checkNearSteps(t, engine));
  test(`${name}: a dropped name doesn't blink back when a count ticks down`, { timeout: 60000 }, t => checkNameHysteresis(t, engine));
}
