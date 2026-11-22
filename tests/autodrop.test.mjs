import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, webkit } from 'playwright-core';
import { app, button } from './helpers.mjs';

// Auto-drop (design/polish/SPEC.md §3.2): when a badge row runs out of room, parts give way in a fixed order on
// every tile at once, and no count is ever hidden. Today's rows hold the colour identity chip, poison, tax, energy,
// experience and rad (near), led by the turn chip when Turns is on, and commander damage led by a sword (far).

const seats = [0, 1, 2, 3, 4, 5];
// Long names, a four-colour pie and a shard symbol, so the identity chips are as wide as they get.
const longIdentities = ['WURG', 'UBRG', 'WBR', 'WUBG', 'WUBRG', 'R'];
const allParts = { indicator: true, symbol: true, name: true };

// Every counter on with two-digit counts, an identity on every tile and commander damage from every opponent.
// The chip shows the indicator, symbol and name unless told otherwise. everyCounter: false leaves energy, experience
// and rad off, for the checks that walk one row's steps with only poison and tax. turns puts the board in Turn by turn
// at round 12 with Player 1 active, so their near row leads with the turn chip; first says who went first and keeps
// the small flag.
function worstGame(count, { damage = () => 19, show = allParts, poison = () => 19, identities = longIdentities, everyCounter = true, turns = false, first = 1 } = {}) {
  return {
    ...(turns ? { turns: 'turns', turn: { first, active: 0, round: 12 } } : {}),
    startingLife: 40, scores: Array(count).fill(40), rotations: Array(count).fill(0), keepAwake: true, landscapeAngle: 90,
    colors: [], counters: { commander: true, poison: true, energy: everyCounter, experience: everyCounter, rad: everyCounter },
    poison: seats.slice(0, count).map(poison), casts: Array(count).fill(49), identities: identities.slice(0, count),
    energy: Array(count).fill(19), experience: Array(count).fill(19), rad: Array(count).fill(19),
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

// The busiest game today, with every counter on and the identity chip showing all three parts. The far row stays
// at full size on the target phone and the smallest real phone, and the near row goes no further than the worst
// case in design/polish/SPEC.md §3.2: the names (step 1) on the target. At the stress size nothing is hidden or
// clipped whatever the platform's font. With only poison and tax on, both rows stay at full size on phones.
async function checkWorstCase(t, engine) {
  for (const count of [4, 6]) {
    const page = await openBoard(t, engine, worstGame(count, { turns: true }), { width: 952, height: 427 });
    for (const [width, height, far, nearLimit] of [[952, 427, true, 1], [640, 360, true, 6], [568, 320, false, 6]]) {
      await resize(page, width, height);
      const view = `${count} players, ${width} × ${height}`;
      const drops = await readDrops(page);
      assert.deepEqual(drops.problems, [], `${view}: every count shows inside its tile`);
      // "Turn" goes with the names at step 1, leaving the untap symbol and the round. The chip itself never goes.
      const turn = await page.locator('.turn-chip').evaluate(chip => ({
        shown: chip.checkVisibility() && chip.offsetWidth > 0, word: chip.querySelector('.turn-word').checkVisibility(), text: chip.textContent,
      }));
      assert.deepEqual(turn, { shown: true, word: !drops.drop.split(' ').includes('name'), text: 'Turn12' }, `${view}: the turn chip`);
      if (far) assert.deepEqual([drops.drop.includes('sword'), drops.far], [false, ''], `${view}: the far row is at full size`);
      assert.ok(nearStep(drops) <= nearLimit, `${view}: near row at step ${nearStep(drops)}, at most ${nearLimit} (${drops.drop} ${drops.near})`);
    }
    // With the flag on the active tile too, that row is one chip longer: at 6 players the target also drops the symbol
    // (step 2), and nothing is hidden or clipped.
    const together = await openBoard(t, engine, worstGame(count, { turns: true, first: 0 }), { width: 952, height: 427 });
    await resize(together, 952, 427);
    const busiest = await readDrops(together);
    assert.deepEqual(busiest.problems, [], `${count} players, flag and turn chip together: every count shows inside its tile`);
    assert.ok(nearStep(busiest) <= 2, `${count} players, flag and turn chip together: near row at step ${nearStep(busiest)}, at most 2`);
    const twoCounters = await openBoard(t, engine, worstGame(count, { everyCounter: false }), { width: 952, height: 427 });
    for (const [width, height] of [[952, 427], [640, 360]]) {
      await resize(twoCounters, width, height);
      const drops = await readDrops(twoCounters);
      assert.deepEqual([drops.drop, drops.near, drops.far, drops.problems], ['', '', '', []],
        `${count} players, ${width} × ${height}, poison and tax only: full size, nothing dropped`);
    }
  }
}

// What each tile's near row holds, in order: 'identity' for the identity chip, then each counter's kind.
function nearOrder(page) {
  return page.locator('.badges.near').evaluateAll(rows => rows.map(row => [...row.children].map(chip => (chip.matches('.ci-chip') ? 'identity'
    : chip.dataset.kind))));
}

// Six players on the smallest real phone with every counter at two digits: each near row is the identity chip, then
// poison, tax, energy, experience and rad. Every count shows inside its tile, clear of the life total, and the far
// row keeps its full size.
async function checkCounterRow(t, engine) {
  const page = await openBoard(t, engine, worstGame(6), { width: 640, height: 360 });
  await resize(page, 640, 360);
  assert.deepEqual(await nearOrder(page), Array(6).fill(['identity', 'poison', 'casts', 'energy', 'experience', 'rad']));
  assert.deepEqual(await page.locator('.badges.near').evaluateAll(rows => rows.map(row => [...row.children].slice(1).map(chip => chip.textContent).join(' '))),
    Array(6).fill('19 poison Commander tax +98 19 energy 19 experience 19 rad'), 'two-digit counts show in full');
  const drops = await readDrops(page);
  assert.deepEqual(drops.problems, [], 'every count shows inside its tile');
  assert.deepEqual([drops.drop.includes('sword'), drops.far], [false, ''], 'the far row is at full size');
  const overlaps = await page.locator('.player').evaluateAll(players => players.flatMap((player, index) => {
    const score = player.querySelector('.score').getBoundingClientRect();
    return [...player.querySelectorAll('.badges.near .chip')].filter(chip => chip.offsetWidth).filter((chip) => {
      const box = chip.getBoundingClientRect();
      return box.left < score.right && score.left < box.right && box.top < score.bottom && score.top < box.bottom;
    }).map(chip => `P${index + 1} ${chip.textContent}`);
  }));
  assert.deepEqual(overlaps, [], 'no badge covers a life total');
}

// On windows narrower than any phone, today's rows do run out of room. The steps come in the spec's order, every
// count stays, and the board stays uniform. A sword dropped for a count of 10 doesn't come back at 9, and a new
// game starts at full size again. The identity chips show only the indicator here, so the near row has nothing to
// drop before its type shrinks.
async function checkSteps(t, engine) {
  // Player 1's far row is the busiest: 10 from Player 2's commander, 9 from everyone else.
  const indicator = { indicator: true, symbol: false, name: false };
  const game = worstGame(6, { show: indicator, everyCounter: false, damage: (defender, attacker) => (defender === 0 && attacker === 1 ? 10 : 9) });
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
  const busy = await openBoard(t, engine, worstGame(6, { show: indicator, everyCounter: false }), { width: 560, height: 315 });
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
// whole chip goes. The order holds with only poison and tax on, from the smallest real phone down, and with every
// counter on, from the target phone down.
async function checkNearSteps(t, engine) {
  const passes = [
    [allParts, 'all three parts', false, 640, 10], [{ indicator: false, symbol: true, name: true }, 'symbol and name', false, 640, 10],
    [allParts, 'every counter, all three parts', true, 952, 8], [{ indicator: false, symbol: true, name: true }, 'every counter, symbol and name', true, 952, 8],
  ];
  for (const [show, label, everyCounter, start, step] of passes) {
    const page = await openBoard(t, engine, worstGame(6, { show, everyCounter }), { width: start, height: Math.round(start * 0.5625) });
    let reached = 0;
    const seen = new Set();
    for (let width = start; width >= 300; width -= step) {
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
  const game = worstGame(6, { poison: index => (index === 0 ? 10 : 9), identities: Array(6).fill('WURG'), everyCounter: false });
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

// "Turn" goes at step 1 even when no identity name shows, before any type shrinks.
async function checkTurnWord(t, engine) {
  const indicator = { indicator: true, symbol: false, name: false };
  const page = await openBoard(t, engine, worstGame(6, { show: indicator, turns: true }), { width: 952, height: 427 });
  let width = 952;
  let drops = await readDrops(page);
  while (!drops.drop && !drops.near && width > 300) {
    width -= 8;
    await resize(page, width);
    drops = await readDrops(page);
  }
  assert.deepEqual([drops.drop, drops.near, drops.problems], ['name', '', []], `${width}px: the word "Turn" is the first thing to go`);
  assert.equal(await page.locator('.turn-word').evaluate(word => word.checkVisibility()), false);
  assert.equal(await page.locator('.turn-chip').textContent(), 'Turn12', 'the chip keeps the untap symbol and the round');
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: the word "Turn" goes first, with or without identity names`, { timeout: 60000 }, t => checkTurnWord(t, engine));
  test(`${name}: the busiest board today stays within the drop table on phones`, { timeout: 60000 }, t => checkWorstCase(t, engine));
  test(`${name}: badge rows give way in order, board-wide, without blinking`, { timeout: 120000 }, t => checkSteps(t, engine));
  test(`${name}: the near row drops names, then the symbol, before its type shrinks`, { timeout: 240000 }, t => checkNearSteps(t, engine));
  test(`${name}: a dropped name doesn't blink back when a count ticks down`, { timeout: 60000 }, t => checkNameHysteresis(t, engine));
  test(`${name}: every counter's badge shows in order and fits six players at 640 × 360`, { timeout: 60000 }, t => checkCounterRow(t, engine));
}
