import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, webkit } from 'playwright-core';

const app = new URL('../web/index.html', import.meta.url).href;
const layouts = [
  { count: 2, portrait: ['1↑', '2↓'], landscape: ['1← 2→'] },
  { count: 3, portrait: ['1↑ 2↑', '3↓ 3↓'], landscape: ['1↑ 3→', '2↓ 3→'] },
  { count: 4, portrait: ['1← 3→', '2← 4→'], landscape: ['1↑ 2↑', '3↓ 4↓'] },
  { count: 5, portrait: ['1↑ 2↑', '3↓ 4↓', '5↓ 5↓'], landscape: ['1↑ 2↑ 5→', '3↓ 4↓ 5→'] },
  { count: 6, portrait: ['1← 3→', '2← 4→', '5← 6→'], landscape: ['1↑ 2↑ 5↑', '3↓ 4↓ 6↓'] },
];
// The bottom of the life total points toward the player reading it.
const down = { '↓': [0, 1], '↑': [0, -1], '←': [-1, 0], '→': [1, 0] };

function readTiles(page) {
  return page.locator('.player').evaluateAll(players => players.map(player => {
    const face = player.querySelector('.player-face');
    const { c, d } = new DOMMatrixReadOnly(getComputedStyle(face).transform);
    const score = face.querySelector('.score');
    const center = element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return [x + width / 2, y + height / 2];
    };
    return {
      bounds: player.getBoundingClientRect().toJSON(),
      down: [c, d].map(value => Math.round(value * 1000) / 1000 || 0),
      score: score.value,
      center: center(score),
      minus: center(face.querySelector('.subtract')),
      plus: center(face.querySelector('.add')),
    };
  }));
}

async function checkLayouts(t, engine) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ isMobile: true, hasTouch: true });
  await page.goto(app);
  const button = name => page.getByRole('button', { name, exact: true });

  for (const [short, long] of [[320, 568], [393, 852], [768, 1024]]) {
    for (const [orientation, width, height] of [['portrait', short, long], ['landscape', long, short]]) {
      await page.setViewportSize({ width, height });
      for (const layout of layouts) {
        const { count } = layout;
        const view = `${count} players, ${orientation}, ${width}×${height}`;
        await button('Game setup').tap();
        await button(`${count} players`).tap();
        await page.locator('#save-setup').tap();
        const tiles = await readTiles(page);
        assert.equal(tiles.length, count, view);
        const rows = layout[orientation].map(row => row.split(' '));
        rows.forEach((row, y) => row.forEach(([number, arrow], x) => {
          const tile = tiles[Number(number) - 1];
          const seat = `${view}, seat ${number}`;
          const cellX = (x + 0.5) * width / row.length;
          const cellY = (y + 0.5) * height / rows.length;
          const { left, right, top, bottom } = tile.bounds;
          assert.ok(cellX > left && cellX < right && cellY > top && cellY < bottom, `${seat} occupies its cell`);
          assert.deepEqual(tile.down, down[arrow], `${seat} faces ${arrow}`);
          assert.equal(tile.score, '40', `${seat} starts at 40`);
          const [dx, dy] = down[arrow];
          const across = ([px, py]) => px * dy - py * dx;
          assert.ok(across(tile.minus) < across(tile.center) && across(tile.plus) > across(tile.center), `${seat} reads − 40 +`);
        }));
        const covered = tiles.reduce((area, { bounds }) => area + bounds.width * bounds.height, 0);
        assert.ok(covered >= width * height * 0.99, `${view} fills the screen`);
      }
    }
  }

  // The last game is six players. Rotate one seat, then turn the screen and reload.
  await page.setViewportSize({ width: 852, height: 393 });
  await button('Game setup').tap();
  await button('Rotate seats').tap();
  await button('Rotate Player 6 clockwise').tap();
  assert.deepEqual((await readTiles(page))[5].down, down['←']);
  await button('Done rotating seats').tap();
  await page.setViewportSize({ width: 393, height: 852 });
  await page.waitForFunction(() => {
    const face = document.querySelector('.player:last-child .player-face');
    return new DOMMatrixReadOnly(getComputedStyle(face).transform).d === 1;
  });
  await button('Add one life to Player 6').tap();
  await page.reload();
  const tiles = await readTiles(page);
  assert.deepEqual(tiles[5].down, down['↓']);
  assert.equal(tiles[5].score, '41');
  assert.deepEqual(tiles[4].down, down['←']);
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: every seat faces its player in portrait and landscape`, { timeout: 60000 }, t => checkLayouts(t, engine));
}
