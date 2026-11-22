import assert from 'node:assert/strict';
import { button, engines, openPage, reload, startGame, test, turnScreen } from './helpers.mjs';

const layouts = {
  2: ['1← 2→'],
  3: ['1↑ 3→', '2↓ 3→'],
  4: ['1↑ 2↑', '3↓ 4↓'],
  5: ['1↑ 2↑ 5→', '3↓ 4↓ 5→'],
  6: ['1↑ 2↑ 5↑', '3↓ 4↓ 6↓'],
};
// The bottom of the life total points toward the player reading it.
const down = { '↓': [0, 1], '↑': [0, -1], '←': [-1, 0], '→': [1, 0] };

// Where a point or direction on the landscape board lands on screen once the board turns clockwise.
function turnPoint(turn, long, short, [x, y]) {
  return { 0: [x, y], 90: [short - y, x], 180: [long - x, short - y], 270: [y, long - x] }[turn];
}
function turnDirection(turn, [x, y]) {
  return { 0: [x, y], 90: [-y, x], 180: [-x, -y], 270: [y, -x] }[turn].map(value => value || 0);
}

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

// Checks every seat against a landscape layout after the board has turned `turn` degrees clockwise.
async function checkBoard(page, layout, turn, view) {
  const { width, height } = page.viewportSize();
  const [long, short] = [Math.max(width, height), Math.min(width, height)];
  const tiles = await readTiles(page);
  const rendered = await page.locator('.app').getAttribute('data-board-turn');
  const rows = layout.map(row => row.split(' '));
  assert.equal(tiles.length, rows.flat().filter((seat, i, all) => all.indexOf(seat) === i).length, view);
  rows.forEach((row, y) => row.forEach(([number, arrow], x) => {
    const tile = tiles[Number(number) - 1];
    const seat = `${view}, seat ${number}`;
    const [cellX, cellY] = turnPoint(turn, long, short, [(x + 0.5) * long / row.length, (y + 0.5) * short / rows.length]);
    const { left, right, top, bottom } = tile.bounds;
    assert.ok(cellX > left && cellX < right && cellY > top && cellY < bottom,
      `${seat} occupies its cell: expected (${Math.round(cellX)}, ${Math.round(cellY)}) inside ${JSON.stringify(tile.bounds)} ` +
      `with the board turned ${turn}°, rendered ${rendered}° in a ${width}×${height} window`);
    const facing = turnDirection(turn, down[arrow]);
    assert.deepEqual(tile.down, facing, `${seat} faces ${arrow} relative to the landscape board`);
    const [dx, dy] = facing;
    const across = ([px, py]) => px * dy - py * dx;
    assert.ok(across(tile.minus) < across(tile.center) && across(tile.plus) > across(tile.center), `${seat} reads − total +`);
  }));
  const covered = tiles.reduce((area, { bounds }) => area + bounds.width * bounds.height, 0);
  // The 2px seams between tiles take up to about 1.2% of the smallest screens.
  assert.ok(covered >= width * height * 0.98, `${view} fills the screen`);
  return tiles;
}

async function checkLayouts(t, engine) {
  const page = await openPage(t, engine, { orientation: true });

  // A new game takes the current landscape as upright. In a portrait window it turns the board clockwise.
  for (const [short, long] of [[320, 568], [393, 852], [768, 1024]]) {
    for (const [width, height, angle] of [[short, long, 0], [long, short, 90]]) {
      await turnScreen(page, width, height, angle);
      for (const [count, layout] of Object.entries(layouts)) {
        const view = `${count} players, ${width}×${height}`;
        await startGame(page, count);
        const tiles = await checkBoard(page, layout, height > width ? 90 : 0, view);
        assert.ok(tiles.every(tile => tile.score === '40'), `${view} starts at 40`);
      }
    }
  }

  // The last game is six players with a landscape screen at 90°. Rotate one seat, then turn the phone around.
  await turnScreen(page, 852, 393, 90);
  await button(page, 'Settings').tap();
  await button(page, 'Rotate seats on the board').tap();
  await button(page, 'Rotate Player 6 clockwise').tap();
  await button(page, 'Done rotating seats').tap();
  const rotated = ['1↑ 2↑ 5↑', '3↓ 4↓ 6←'];
  await checkBoard(page, rotated, 0, 'upright landscape');
  await turnScreen(page, 852, 393, 270);
  await checkBoard(page, rotated, 180, 'phone turned end over end');
  await turnScreen(page, 393, 852, 0);
  await checkBoard(page, rotated, 90, 'portrait, turned one way');
  await turnScreen(page, 393, 852, 180);
  await checkBoard(page, rotated, 270, 'portrait, turned the other way');

  // The seats stay fixed to the device after a reload, which keeps the screen's angle as a real phone does. The
  // board's upright angle must come from the saved game.
  await button(page, 'Add one life to Player 6').tap();
  await reload(page);
  assert.equal(await page.evaluate(() => screen.orientation.angle), 180, 'the screen is still at 180°');
  const tiles = await checkBoard(page, rotated, 270, 'portrait after reload');
  assert.equal(tiles[5].score, '41');

  // In split screen the window can be portrait while the screen is landscape. The board still fits as landscape.
  await turnScreen(page, 393, 852, 90);
  await checkBoard(page, rotated, 90, 'portrait window on a landscape screen');

  // Settings fills the smallest landscape phone, with About inline.
  await turnScreen(page, 568, 320, 90);
  await button(page, 'Settings').tap();
  const settingsBox = await page.locator('#settings').boundingBox();
  assert.deepEqual(settingsBox, { x: 0, y: 0, width: 568, height: 320 }, 'settings fills the screen');
  assert.match(await page.locator('#settings-about').textContent(), /collects no data/);
  assert.match(await page.locator('#settings-about').textContent(), /unofficial Fan Content permitted under the Fan Content Policy/);
  await button(page, 'Close settings').tap();
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: the landscape seats stay fixed to the device as the screen turns`, { timeout: 90000 }, t => checkLayouts(t, engine));
}
