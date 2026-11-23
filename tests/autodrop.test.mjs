import assert from 'node:assert/strict';
import { button, engines, openPage, saved, test } from './helpers.mjs';

// Auto-drop (design/polish/SPEC.md §3.2): when a badge row runs out of room, parts give way in a fixed order on
// every tile at once, and no count is ever hidden. Today's rows hold the colour identity chip, poison, tax, energy,
// experience and rad (near), led by the turn chip when Turns is on, and commander damage led by a sword (far). The near
// row drops the identity names, then the symbol (the indicator and the chip always stay); the far row drops the sword.
// Then a row wraps onto a second line, and only then shrinks its type, down to 9px; a side whose second line would
// cover a total or its glyphs shrinks first and wraps last.

const seats = [0, 1, 2, 3, 4, 5];
// Long names, a four-colour pie and a shard symbol, so the identity chips are as wide as they get.
const longIdentities = ['WURG', 'UBRG', 'WBR', 'WUBG', 'WUBRG', 'R'];
const allParts = { indicator: true, symbol: true, name: true };

// Every counter on with two-digit counts, an identity on every tile and commander damage from every opponent.
// The chip shows the indicator, symbol and name unless told otherwise. everyCounter: false leaves energy, experience
// and rad off, for the checks that walk one row's steps with only poison and tax. turns puts the board in Turn by turn
// at round 12 with Player 1 active, so their near row leads with the turn chip; first says who went first and keeps
// the small flag.
function worstGame(count, { damage = () => 19, show = allParts, poison = () => 19, identities = longIdentities, everyCounter = true, turns = false, first = 1, badgeSize } = {}) {
  return {
    ...(badgeSize ? { badgeSize } : {}),
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

// A page of its own for each board, in the file's browser. A test closes each board when it's done with it.
function openBoard(t, engine, game, { width, height }) {
  return openPage(t, engine, { viewport: { width, height }, game });
}

// Resizes the window and waits until the board has measured its new size, which also fits the badge rows.
async function resize(page, width, height = Math.round(width * 0.5625)) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(() => {
    const faces = [...document.querySelectorAll('.player-face')];
    return document.querySelector('#board').style.getPropertyValue('--ui') === `${Math.min(...faces.map(face => face.offsetWidth))}px`;
  });
}

// The board's drop tokens and badge sizes, the most lines any near and far row takes, whether a row on two lines
// covers a total or its glyphs, and anything wrong: a count that's hidden, a chip outside its tile, type under the 9px
// floor, or an identity chip (or, where it's shown, its indicator) that's gone.
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
      const identity = player.querySelector('.badges.near .ci-chip');
      if (identity && !(identity.checkVisibility() && identity.offsetWidth)) problems.push('an identity chip is gone');
      const indicator = identity?.querySelector('.ci');
      if (indicator && !indicator.checkVisibility()) problems.push('an indicator is gone');
    }
    const lines = row => new Set([...row.children].filter(chip => chip.offsetWidth).map(chip => chip.offsetTop)).size;
    const rows = side => [...document.querySelectorAll(`.badges.${side}:not([hidden])`)];
    return {
      drop: board.dataset.drop ?? '',
      // The fit writes its type sizes on each tile's edges, the same on every tile (web/js/layout/fit.js).
      near: document.querySelector('.near-edge').style.getPropertyValue('--near-badge-size'),
      far: document.querySelector('.far-edge').style.getPropertyValue('--far-badge-size'),
      lines: { near: Math.max(0, ...rows('near').map(lines)), far: Math.max(0, ...rows('far').map(lines)) },
      covers: { near: rows('near').some(row => lines(row) > 1 && window.coversTotal(row)), far: rows('far').some(row => lines(row) > 1 && window.coversTotal(row)) },
      problems,
    };
  });
}

// Installs window.coversTotal(row) in the page: whether any chip in the row overlaps its tile's life total, − and +
// glyphs or "Out" tag.
async function addCoverCheck(page) {
  await page.evaluate(() => {
    window.coversTotal = (row) => {
      const face = row.closest('.player-face');
      const blockers = [face.querySelector('.score'), face.querySelector('.out-tag'), ...face.querySelectorAll('.controls button')]
        .filter(blocker => blocker.offsetWidth).map(blocker => blocker.getBoundingClientRect());
      return [...row.children].filter(chip => chip.offsetWidth).some((chip) => {
        const box = chip.getBoundingClientRect();
        return blockers.some(blocker => box.left < blocker.right - 0.5 && blocker.left < box.right - 0.5 && box.top < blocker.bottom - 0.5 && blocker.top < box.bottom - 0.5);
      });
    };
  });
}

// Whether wrapping one side's rows at full type, with the drops taken now, would put a second line over a total or its
// glyphs: the reason a side shrinks before it wraps. The board is put back at once, before anything can refit it.
function wrapWouldCover(page, side) {
  return page.evaluate((side) => {
    const board = document.querySelector('#board');
    const drop = board.dataset.drop ?? '';
    const edges = [...document.querySelectorAll(`.${side}-edge`)];
    const size = edges[0].style.getPropertyValue(`--${side}-badge-size`);
    board.dataset.drop = `${drop} ${side === 'near' ? 'wrap' : 'wrap-far'}`.trim();
    for (const edge of edges) edge.style.removeProperty(`--${side}-badge-size`);
    const covers = [...document.querySelectorAll(`.badges.${side}:not([hidden])`)]
      .some(row => new Set([...row.children].filter(chip => chip.offsetWidth).map(chip => chip.offsetTop)).size > 1 && window.coversTotal(row));
    if (drop) board.dataset.drop = drop;
    else delete board.dataset.drop;
    if (size) for (const edge of edges) edge.style.setProperty(`--${side}-badge-size`, size);
    return covers;
  }, side);
}

// A side's last resorts as taken: wrapped onto a second line, the type shrunk, or both.
function lastResorts(drops, side) {
  return { wrap: drops.drop.split(' ').includes(side === 'near' ? 'wrap' : 'wrap-far'), shrink: Boolean(drops[side]) };
}

// Checks the order of a side's last resorts at one width: a row shrinks without wrapping only where wrapping would have
// covered a total, a row on two lines never covers one above the floor, and the type never goes under 9px.
async function checkLastResorts(page, drops, side, view) {
  const { wrap, shrink } = lastResorts(drops, side);
  if (shrink && !wrap) assert.ok(await wrapWouldCover(page, side), `${view}: the ${side} row shrank before wrapping only because two lines would cover the total`);
  if (drops.lines[side] > 1 && parseFloat(drops[side] || '99') > 9) assert.ok(!drops.covers[side], `${view}: two ${side} lines leave the totals clear`);
  if (shrink) assert.ok(parseFloat(drops[side]) >= 9, `${view}: ${side} type ${drops[side]} stays at 9px or more`);
}

// How far the near row has gone through its steps (design/polish/SPEC.md §3.2): 1 for the names, 2 for the symbol,
// 3 for the first last resort (a second line, or smaller type where two lines would cover the total) and 4 for both.
function nearStep(drops) {
  const tokens = drops.drop.split(' ');
  const { wrap, shrink } = lastResorts(drops, 'near');
  if (wrap || shrink) return 2 + Number(wrap) + Number(shrink);
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
    await addCoverCheck(page);
    for (const [width, height, far, nearLimit] of [[952, 427, true, 1], [640, 360, true, 4], [568, 320, false, 4]]) {
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
    await page.close();
    // With the flag on the active tile too, that row is one chip longer: at 6 players the target also drops the symbol
    // (step 2), and nothing is hidden or clipped.
    const together = await openBoard(t, engine, worstGame(count, { turns: true, first: 0 }), { width: 952, height: 427 });
    await addCoverCheck(together);
    await resize(together, 952, 427);
    const busiest = await readDrops(together);
    assert.deepEqual(busiest.problems, [], `${count} players, flag and turn chip together: every count shows inside its tile`);
    assert.ok(nearStep(busiest) <= 2, `${count} players, flag and turn chip together: near row at step ${nearStep(busiest)}, at most 2`);
    await together.close();
    const twoCounters = await openBoard(t, engine, worstGame(count, { everyCounter: false }), { width: 952, height: 427 });
    await addCoverCheck(twoCounters);
    for (const [width, height] of [[952, 427], [640, 360]]) {
      await resize(twoCounters, width, height);
      const drops = await readDrops(twoCounters);
      assert.deepEqual([drops.drop, drops.near, drops.far, drops.problems], ['', '', '', []],
        `${count} players, ${width} × ${height}, poison and tax only: full size, nothing dropped`);
    }
    await twoCounters.close();
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
  await addCoverCheck(page);
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
// drop before its last resorts.
async function checkSteps(t, engine) {
  // Player 1's far row is the busiest: 10 from Player 2's commander, 9 from everyone else.
  const indicator = { indicator: true, symbol: false, name: false };
  const game = worstGame(6, { show: indicator, everyCounter: false, damage: (defender, attacker) => (defender === 0 && attacker === 1 ? 10 : 9) });
  const page = await openBoard(t, engine, game, { width: 640, height: 360 });
  await addCoverCheck(page);
  await resize(page, 640);
  assert.equal((await readDrops(page)).drop, '', 'full size at 640 × 360');

  // Narrow the window until the far row gives way: the sword goes first, before the row wraps or its type shrinks.
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
  const fresh = await openBoard(t, engine, await saved(page), { width, height: Math.round(width * 0.5625) });
  await resize(fresh, width);
  assert.equal((await readDrops(fresh)).drop, '', 'a fresh board at the same size shows the sword');
  await fresh.close();
  // With plenty of room, it comes back.
  await resize(page, 952);
  assert.equal((await readDrops(page)).drop, '', 'room to spare brings the sword back');
  await page.close();

  // With every count at 19, narrower windows take every far step: the sword goes, then the row's last resorts, a second
  // line and smaller type, in that order unless two lines would cover the totals. The type never goes under 9px, and
  // every tile uses the same steps and sizes throughout.
  const busy = await openBoard(t, engine, worstGame(6, { show: indicator, everyCounter: false }), { width: 560, height: 315 });
  await addCoverCheck(busy);
  let reached = -1;
  for (width = 560; width >= 300 && reached < 2; width -= 10) {
    await resize(busy, width);
    drops = await readDrops(busy);
    const view = `${width}px`;
    assert.deepEqual(drops.problems, [], `${view}: every count shows inside its tile`);
    const { wrap, shrink } = lastResorts(drops, 'far');
    if (wrap || shrink) assert.ok(drops.drop.includes('sword'), `${view}: the sword went before any last resort`);
    const step = Number(wrap) + Number(shrink) + (drops.drop.includes('sword') ? 0 : -1);
    assert.ok(step >= reached, `${view}: steps only move forward as the window narrows (step ${step} after ${reached})`);
    reached = step;
    await checkLastResorts(busy, drops, 'far', view);
    await checkLastResorts(busy, drops, 'near', view);
    const sizes = await busy.locator('.badges').evaluateAll(rows => rows.map(row => `${row.classList[1]} ${getComputedStyle(row).fontSize}`));
    assert.equal(new Set(sizes).size, 2, `${view}: every near row and every far row is the same size (${[...new Set(sizes)]})`);
  }
  assert.equal(reached, 2, 'the far row both wraps and shrinks on the narrowest windows');

  // A new game resets the counts and starts at full size.
  await button(busy, 'Settings').tap();
  await button(busy, 'New game').tap();
  await busy.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  await busy.waitForFunction(() => [...document.querySelectorAll('.badges.far')].every(row => row.hidden), null, { timeout: 2000 });
  drops = await readDrops(busy);
  assert.deepEqual([drops.drop, drops.near, drops.far], ['', '', ''], 'a new game is at full size');
}

// The near row gives way in the spec's order as the window narrows: the identity names, then the symbol (one colour
// mark is enough beside the indicator), then a second line, then smaller type, down to 9px (or the type first, where
// two lines would cover the totals). The identity chip never goes, and nor does its indicator. Without the indicator
// the symbol is the chip's only colour mark, so it stays; a chip that shows only the name keeps it. The order holds
// with only poison and tax on, from the smallest real phone down, and with every counter on, from the target phone
// down, and with two players, whose tall tiles leave room for a second line.
async function checkNearSteps(t, engine) {
  const symbolName = { indicator: false, symbol: true, name: true };
  const nameOnly = { indicator: false, symbol: false, name: true };
  const passes = [
    [6, allParts, 'all three parts', false, 640, 10], [6, symbolName, 'symbol and name', false, 640, 10], [6, nameOnly, 'name only', false, 640, 10],
    [6, allParts, 'every counter, all three parts', true, 952, 8], [6, symbolName, 'every counter, symbol and name', true, 952, 8],
    [2, allParts, 'two players, every counter, all three parts', true, 952, 16],
  ];
  for (const [count, show, label, everyCounter, start, step] of passes) {
    const page = await openBoard(t, engine, worstGame(count, { show, everyCounter, turns: true }), { width: start, height: Math.round(start * 0.5625) });
    await addCoverCheck(page);
    let reached = 0;
    const seen = new Set();
    for (let width = start; width >= 290; width -= step) {
      await resize(page, width);
      const drops = await readDrops(page);
      const view = `${label}, ${width}px`;
      assert.deepEqual(drops.problems, [], `${view}: every count, identity chip and indicator shows inside its tile`);
      const step = nearStep(drops);
      assert.ok(step >= reached, `${view}: steps only move forward as the window narrows (step ${step} after ${reached})`);
      reached = step;
      seen.add(step);
      const tokens = drops.drop.split(' ');
      if (show.indicator) {
        if (tokens.includes('symbol')) assert.ok(tokens.includes('name'), `${view}: the names go before the symbol`);
      } else assert.ok(!tokens.includes('symbol') || !(await page.locator('.badges.near .ci-chip .id-symbol').count()), `${view}: a symbol with no indicator beside it stays`);
      const { wrap, shrink } = lastResorts(drops, 'near');
      if (wrap || shrink) assert.ok(tokens.includes('name'), `${view}: the names go before the last resorts`);
      await checkLastResorts(page, drops, 'near', view);
      const names = await page.locator('.badges.near .id-name').evaluateAll(nodes => nodes.filter(node => node.offsetWidth).length);
      if (tokens.includes('name') && show.name && (show.indicator || show.symbol)) assert.equal(names, 0, `${view}: a dropped name is gone from every tile`);
      if (show.name && !show.indicator && !show.symbol) assert.equal(names, count, `${view}: a chip that shows only the name keeps it`);
      if (!show.indicator && show.symbol) {
        const symbols = await page.locator('.badges.near .id-symbol').evaluateAll(nodes => nodes.filter(node => node.offsetWidth).length);
        assert.equal(symbols, count, `${view}: with no indicator, every symbol stays`);
      }
    }
    // A chip that shows only the name keeps it, so there only the turn chip's word goes at step 1, and may not take a
    // width of its own.
    if (show.indicator || show.symbol) assert.ok(seen.has(1), `${label}: the names go on their own first`);
    if (show.indicator) assert.ok(seen.has(2), `${label}: then the symbol`);
    assert.ok(reached >= 3, `${label}: the narrowest windows take a last resort (reached step ${reached})`);
    await page.close();
  }
}

// The same order at every Badge size (Settings → Table): the names, then the symbol, then a second line, then smaller
// type, or the type first where two lines would cover the totals. The identity chip and its indicator always stay and
// every count shows inside its tile. Six players, from the target down, mostly shrink first; two players, whose tall
// tiles leave room, wrap first: at each size there's a width where the near row has wrapped and its type hasn't shrunk.
async function checkOrderAtEachSize(t, engine) {
  for (const badgeSize of ['default', 'large', 'larger']) {
    for (const [count, start, step] of [[6, 952, 16], [2, 952, 24]]) {
      const page = await openBoard(t, engine, worstGame(count, { turns: true, badgeSize }), { width: start, height: Math.round(start * 0.5625) });
      await addCoverCheck(page);
      let reached = 0;
      let wrappedFirst = false;
      for (let width = start; width >= 400; width -= step) {
        await resize(page, width);
        const drops = await readDrops(page);
        const view = `${badgeSize}, ${count} players, ${width}px`;
        assert.deepEqual(drops.problems, [], `${view}: every count, identity chip and indicator shows inside its tile`);
        const step = nearStep(drops);
        assert.ok(step >= reached, `${view}: steps only move forward as the window narrows (step ${step} after ${reached})`);
        reached = step;
        const tokens = drops.drop.split(' ');
        if (tokens.includes('symbol')) assert.ok(tokens.includes('name'), `${view}: the names go before the symbol`);
        const { wrap, shrink } = lastResorts(drops, 'near');
        if (wrap || shrink) assert.ok(tokens.includes('symbol'), `${view}: the symbol goes before the last resorts`);
        if (wrap && !shrink && drops.lines.near > 1) wrappedFirst = true;
        await checkLastResorts(page, drops, 'near', view);
        await checkLastResorts(page, drops, 'far', view);
      }
      assert.ok(reached >= 3, `${badgeSize}, ${count} players: the narrowest windows take a last resort (reached step ${reached})`);
      if (count === 2) assert.ok(wrappedFirst, `${badgeSize}, two players: the near row wraps before its type shrinks`);
      await page.close();
    }
  }
}

// A name dropped for a count of 10 doesn't come back at 9, as with the sword.
async function checkNameHysteresis(t, engine) {
  // Player 1's near row is the busiest: poison 10 against 9 everywhere else, with the same long name on every tile.
  const game = worstGame(6, { poison: index => (index === 0 ? 10 : 9), identities: Array(6).fill('WURG'), everyCounter: false });
  const page = await openBoard(t, engine, game, { width: 640, height: 360 });
  await addCoverCheck(page);
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
  const fresh = await openBoard(t, engine, await saved(page), { width, height: Math.round(width * 0.5625) });
  await resize(fresh, width);
  assert.equal((await readDrops(fresh)).drop, '', 'a fresh board at the same size shows the names');
  await fresh.close();
  await resize(page, 952);
  assert.equal((await readDrops(page)).drop, '', 'room to spare brings the names back');
}

// "Turn" goes at step 1 even when no identity name shows, before any type shrinks.
async function checkTurnWord(t, engine) {
  const indicator = { indicator: true, symbol: false, name: false };
  const page = await openBoard(t, engine, worstGame(6, { show: indicator, turns: true }), { width: 952, height: 427 });
  await addCoverCheck(page);
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
  // The round keeps a "T" (T12), so the untap symbol doesn't read as a letter (design/polish/FINAL-REVIEW.md #17).
  assert.equal(await page.locator('.turn-chip .turn-round').evaluate(round => getComputedStyle(round, '::before').content), '"T"');
}

// Text doesn't shrink exactly in proportion to its type (gaps, padding and rounding don't), and in WebKit a busy row
// shrunk by that estimate alone came out 2–4px wider than its tile. The type is measured again after each step down,
// so at every width where a row shrinks it fits: its chips span no more than the row, and stay inside their tile.
async function checkShrunkRowsFit(t, engine) {
  for (const count of [4, 6]) {
    const page = await openBoard(t, engine, worstGame(count, { turns: true, first: 0 }), { width: 760, height: 428 });
    await addCoverCheck(page);
    let shrunk = 0;
    for (let width = 760; width >= 480; width -= 4) {
      await resize(page, width);
      const found = await page.evaluate(() => {
        const shrinking = ['near', 'far'].filter(side => document.querySelector(`.${side}-edge`).style.getPropertyValue(`--${side}-badge-size`));
        const wide = [...document.querySelectorAll(shrinking.map(side => `.badges.${side}:not([hidden])`).join(', ') || ':not(*)')].flatMap((row) => {
          const chips = [...row.children].filter(chip => chip.offsetWidth);
          if (new Set(chips.map(chip => chip.offsetTop)).size > 1 || !chips.length) return [];
          const span = chips.at(-1).offsetLeft + chips.at(-1).offsetWidth - chips[0].offsetLeft;
          return span > row.clientWidth + 0.5 ? [`${row.classList[1]} row ${span}px in ${row.clientWidth}px`] : [];
        });
        return { shrinking: shrinking.length > 0, wide };
      });
      if (found.shrinking) shrunk += 1;
      assert.deepEqual(found.wide, [], `${count} players, ${width}px: every shrunk row fits its width`);
      assert.deepEqual((await readDrops(page)).problems, [], `${count} players, ${width}px: every count shows inside its tile`);
    }
    assert.ok(shrunk > 5, `${count} players: rows shrank at ${shrunk} widths`);
    await page.close();
  }
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: a shrunk badge row is measured again until it fits`, { timeout: 120000 }, t => checkShrunkRowsFit(t, engine));
  test(`${name}: the overflow order holds at every badge size`, { timeout: 240000 }, t => checkOrderAtEachSize(t, engine));
  test(`${name}: the word "Turn" goes first, with or without identity names`, { timeout: 60000 }, t => checkTurnWord(t, engine));
  test(`${name}: the busiest board today stays within the drop table on phones`, { timeout: 60000 }, t => checkWorstCase(t, engine));
  test(`${name}: badge rows give way in order, board-wide, without blinking`, { timeout: 120000 }, t => checkSteps(t, engine));
  test(`${name}: the near row drops names, then the symbol, then wraps before its type shrinks`, { timeout: 240000 }, t => checkNearSteps(t, engine));
  test(`${name}: a dropped name doesn't blink back when a count ticks down`, { timeout: 60000 }, t => checkNameHysteresis(t, engine));
  test(`${name}: every counter's badge shows in order and fits six players at 640 × 360`, { timeout: 60000 }, t => checkCounterRow(t, engine));
}
