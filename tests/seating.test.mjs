import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, webkit } from 'playwright-core';

const app = new URL('../web/index.html', import.meta.url).href;
const layouts = {
  2: ['1← 2→'],
  3: ['1↑ 3→', '2↓ 3→'],
  4: ['1↑ 2↑', '3↓ 4↓'],
  5: ['1↑ 2↑ 5→', '3↓ 4↓ 5→'],
  6: ['1↑ 2↑ 5↑', '3↓ 4↓ 6↓'],
};
// The bottom of the life total points toward the player reading it.
const down = { '↓': [0, 1], '↑': [0, -1], '←': [-1, 0], '→': [1, 0] };

function readTiles(page) {
  return page.locator('.player').evaluateAll(players => {
    const transform = element => {
      const value = getComputedStyle(element).transform;
      return new DOMMatrixReadOnly(value === 'none' ? undefined : value);
    };
    const appTransform = transform(document.querySelector('.app'));
    const center = element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return [x + width / 2, y + height / 2];
    };
    return players.map(player => {
      const face = player.querySelector('.player-face');
      const { c, d } = appTransform.multiply(transform(face));
      const score = face.querySelector('.score');
      return {
        bounds: player.getBoundingClientRect().toJSON(),
        down: [c, d].map(value => Math.round(value * 1000) / 1000 || 0),
        score: score.value,
        center: center(score),
        minus: center(face.querySelector('.subtract')),
        plus: center(face.querySelector('.add')),
      };
    });
  });
}

async function checkLayouts(t, engine) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ isMobile: true, hasTouch: true });
  await page.goto(app);
  const button = name => page.getByRole('button', { name, exact: true });

  for (const [short, long] of [[320, 568], [393, 852], [768, 1024]]) {
    for (const [width, height] of [[short, long], [long, short]]) {
      const portraitWindow = width < height;
      await page.setViewportSize({ width, height });
      for (const [count, layout] of Object.entries(layouts)) {
        const view = `${count} players, ${width}×${height}`;
        await button('Game setup').tap();
        await button(`${count} players`).tap();
        await page.locator('#save-setup').tap();
        const tiles = await readTiles(page);
        assert.equal(tiles.length, Number(count), view);
        const rows = layout.map(row => row.split(' '));
        rows.forEach((row, y) => row.forEach(([number, arrow], x) => {
          const tile = tiles[Number(number) - 1];
          const seat = `${view}, seat ${number}`;
          const landscapeX = (x + 0.5) * long / row.length;
          const landscapeY = (y + 0.5) * short / rows.length;
          const [cellX, cellY] = portraitWindow ? [landscapeY, long - landscapeX] : [landscapeX, landscapeY];
          const { left, right, top, bottom } = tile.bounds;
          assert.ok(cellX > left && cellX < right && cellY > top && cellY < bottom, `${seat} occupies its cell`);
          const [edgeX, edgeY] = down[arrow];
          const facing = portraitWindow ? [edgeY, -edgeX || 0] : down[arrow];
          assert.deepEqual(tile.down, facing, `${seat} faces ${arrow} relative to the landscape board`);
          assert.equal(tile.score, '40', `${seat} starts at 40`);
          const [dx, dy] = facing;
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
  assert.deepEqual((await readTiles(page))[5].down, down['↓']);
  await button('Add one life to Player 6').tap();
  await page.reload();
  const tiles = await readTiles(page);
  assert.deepEqual(tiles[5].down, down['↓']);
  assert.equal(tiles[5].score, '41');
  assert.deepEqual(tiles[4].down, down['←']);
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: the landscape seats stay in place as the window rotates`, { timeout: 60000 }, t => checkLayouts(t, engine));
}
