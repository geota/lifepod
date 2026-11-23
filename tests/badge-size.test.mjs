import assert from 'node:assert/strict';
import { button, engines, openPage, reload, saved, savedGame, seedGame, stripProblems, test, tileProblems } from './helpers.mjs';

// Settings → Table → Badge size (design/polish/SETTINGS-SPEC.md §10): Default · Large · Larger scales the near and far
// badge rows and the mana strip, their chips, counts, icons and the colour indicator, and nothing else. A row grows no
// taller than fits between its edge and the total, and the overflow order (design/polish/SPEC.md §3.2) holds at every
// size.

const { chromium } = engines;
const sizes = ['default', 'large', 'larger'];
const seats = [0, 1, 2, 3, 4, 5];

// Commander damage from every opponent, poison, energy and tax, an identity with all three parts, and mana floating in
// every pool.
function busyGame(count, badgeSize, extra = {}) {
  return savedGame(count, {
    badgeSize,
    counters: { commander: true, poison: true, energy: true },
    poison: Array(count).fill(3), energy: Array(count).fill(12), casts: Array(count).fill(1),
    identities: ['WUB', 'RG', 'WURG', 'B', 'WUBRG', 'UG'].slice(0, count),
    identity: { show: { indicator: true, symbol: true, name: true }, background: 'symbol' },
    commanderDamage: seats.slice(0, count).map(defender => seats.slice(0, count).map(attacker => (defender === attacker ? 0 : 4))),
    manaPool: true, pools: Array(count).fill([0, 2, 0, 3, 0, 0]),
    ...extra,
  });
}

// What a size draws on the first tile: the rows' type, the strip's type, an indicator's width, a damage chip's height,
// and a counter cell in counters mode.
async function readSizes(page) {
  return page.evaluate(() => {
    const first = document.querySelector('.player');
    const font = selector => parseFloat(getComputedStyle(first.querySelector(selector)).fontSize);
    return {
      near: font('.badges.near'), far: font('.badges.far'), strip: font('.mana-strip'),
      indicator: first.querySelector('.badges.near .ci').getBoundingClientRect().width,
      chip: first.querySelector('.badges.far .chip.damage').offsetHeight,
      drop: document.querySelector('#board').dataset.drop ?? '',
    };
  });
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: Badge size is a notched slider in Table that saves at once and isn't a new game`, async (t) => {
    const page = await openPage(t, engine, { game: savedGame(4) });
    await button(page, 'Settings').tap();
    const track = page.locator('#badge-size-track');
    assert.deepEqual(await page.locator('#badge-size-choices .k-stop').allTextContents(), ['Default', 'Large', 'Larger']);
    assert.equal(await page.locator('#settings-table #badge-size-row').count(), 1, 'it sits in Table');
    assert.equal(await track.getAttribute('aria-valuetext'), 'Default badges');
    const stop = label => page.locator(`#badge-size-choices .k-stop[data-size="${label.toLowerCase()}"]`);
    await stop('Large').tap();
    assert.equal((await saved(page)).badgeSize, 'large', 'saved the moment it changes');
    assert.equal(await page.locator('#board').getAttribute('data-badge-size'), 'large');
    await track.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal((await saved(page)).badgeSize, 'larger');
    assert.deepEqual([await track.getAttribute('aria-valuenow'), await track.getAttribute('aria-valuetext')], ['2', 'Larger badges']);
    assert.equal(await page.locator('#badge-size-choices .k-stop[aria-pressed="true"]').textContent(), 'Larger');
    assert.equal(await page.locator('#save-setup').textContent(), 'Done', 'a size is not a new game');
    // Every stop is a whole 44px target.
    const stops = await page.locator('#badge-size-choices .k-stop').evaluateAll(stops => stops.map(stop => [stop.offsetWidth, stop.offsetHeight]));
    for (const [width, height] of stops) assert.ok(width >= 44 && height >= 44, `a stop is ${width} × ${height}`);
    await button(page, 'Close settings').tap();
    await reload(page);
    assert.equal(await page.locator('#board').getAttribute('data-badge-size'), 'larger', 'the size survives a reload');
    await button(page, 'Settings').tap();
    await stop('Default').tap();
    assert.equal(await page.locator('#board').getAttribute('data-badge-size'), null, 'Default sets nothing');
  });
}

test('chromium: saved badge sizes are checked when a game loads', async (t) => {
  const page = await openPage(t, chromium, { game: savedGame(4) });
  for (const [value, expected] of [[undefined, null], ['huge', null], [2, null], ['large', 'large'], ['larger', 'larger']]) {
    await seedGame(page, savedGame(4, value === undefined ? {} : { badgeSize: value }));
    assert.equal(await page.locator('#board').getAttribute('data-badge-size'), expected, `a saved size of ${JSON.stringify(value)}`);
  }
  assert.equal((await saved(page)).badgeSize, 'larger');
});

// Each size scales the rows, the strip, the indicator and the chips together, by 1.2 and 1.4 where the tile has room,
// and leaves the mode cells as they are. On the target at 4 players there's room for both.
test('chromium: Large and Larger scale the badge rows and the mana strip, and nothing else', async (t) => {
  const page = await openPage(t, chromium, { game: busyGame(4, 'default') });
  const read = async () => {
    const drawn = await readSizes(page);
    await button(page, 'Counters').tap();
    drawn.cell = await page.locator('.counter-cell').first().evaluate(cell => cell.offsetWidth);
    await button(page, 'Cancel').tap();
    drawn.total = await page.locator('.score').first().evaluate(score => parseFloat(getComputedStyle(score).fontSize));
    return drawn;
  };
  const base = await read();
  for (const [size, scale] of [['large', 1.2], ['larger', 1.4]]) {
    await seedGame(page, busyGame(4, size));
    const drawn = await read();
    for (const part of ['near', 'far', 'strip', 'indicator']) {
      assert.ok(Math.abs(drawn[part] / base[part] - scale) < 0.03, `${size}: ${part} is ${scale}× (${drawn[part]} against ${base[part]})`);
    }
    assert.ok(Math.abs(drawn.chip / base.chip - scale) < 0.06, `${size}: a chip is ${scale}× as tall (${drawn.chip} against ${base.chip})`);
    assert.deepEqual([drawn.cell, drawn.total], [base.cell, base.total], `${size}: counter cells and totals keep their size`);
  }
});

// At every size, on the target and the stress size, at 2–6 players: every chip and strip target is inside its tile and
// clear of the pill, no strip covers anything, and no badge row covers a total or its glyphs. Where a row has no room
// to grow, it stays at the default size rather than reach the total.
async function checkFits(t, engine) {
  for (const [width, height] of [[952, 427], [568, 320]]) {
    for (const count of [2, 3, 4, 5, 6]) {
      for (const size of sizes) {
        const view = `${width} × ${height}, ${count} players, ${size}`;
        const page = await openPage(t, engine, { viewport: { width, height }, game: busyGame(count, size, { turns: 'turns', turn: { first: 0, active: 0, round: 12 } }) });
        assert.deepEqual(await tileProblems(page, { targets: '.mana-strip:not([hidden]) button:not(.chip), .badges .turn-chip', parts: '.badges .chip' }), [], `${view}: every chip and target fits its tile, clear of the pill`);
        assert.deepEqual(await stripProblems(page), [], `${view}: every strip is clear`);
        const covers = await page.evaluate(() => [...document.querySelectorAll('.player')].flatMap((player, index) => {
          const blockers = [...player.querySelectorAll('.score, .controls button')].map(blocker => blocker.getBoundingClientRect());
          return [...player.querySelectorAll('.badges .chip')].filter(chip => chip.checkVisibility() && chip.offsetWidth).filter((chip) => {
            const box = chip.getBoundingClientRect();
            return blockers.some(blocker => box.left < blocker.right - 1 && blocker.left < box.right - 1 && box.top < blocker.bottom - 1 && blocker.top < box.bottom - 1);
          }).map(chip => `P${index + 1} ${chip.textContent}`);
        }));
        assert.deepEqual(covers, [], `${view}: no badge covers a total or its glyphs`);
        await page.close();
      }
    }
  }
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: every badge size fits every board on the target and the stress size`, { timeout: 300000 }, t => checkFits(t, engine));
}
