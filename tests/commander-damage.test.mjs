import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { chromium, webkit } from 'playwright-core';
import { app, button, fakeScreenOrientation, scores, setSwitches, startGame, turnScreen } from './helpers.mjs';

const tile = (page, number) => page.locator(`.player:nth-child(${number})`);
// The seat for an attacker on a defender's map.
const seat = (page, defender, attacker) => tile(page, defender).locator(`.map-cell[data-attacker="${attacker - 1}"]`);
const ownSeat = (page, number) => tile(page, number).locator('.map-cell.self').evaluate(cell =>
  [cell.querySelector('strong').textContent, cell.querySelector('.life-change').textContent]);
// The far row's chips, after the sword that leads it.
const farBadges = (page, number) => tile(page, number).locator('.badges.far')
  .evaluate(row => (row.hidden ? '' : [...row.querySelectorAll('[role="listitem"]')].map(chip => chip.textContent).join(' | ')));
// How each opponent's seat looks on a defender's map, and the contrast of its number.
const seatLooks = (page, defender) => tile(page, defender).locator('.map-cell[data-attacker]').evaluateAll(cells => {
  const rgba = value => value.match(/[\d.]+/g).map(Number);
  const luminance = ([r, g, b]) => [r, g, b].map(channel => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index], 0);
  return cells.map(cell => {
    const style = getComputedStyle(cell);
    const seat = getComputedStyle(cell).getPropertyValue('--seat').trim();
    const panel = getComputedStyle(cell).getPropertyValue('--panel').trim();
    const rim = getComputedStyle(cell).getPropertyValue('--rim').trim();
    const attacker = document.querySelectorAll('.player')[Number(cell.dataset.attacker)];
    const [text, fill] = [luminance(rgba(style.color)), luminance(rgba(style.backgroundColor))];
    return {
      attacker: Number(cell.dataset.attacker) + 1, zero: cell.hasAttribute('data-zero'), seat, panel, rim,
      tile: getComputedStyle(attacker).backgroundColor,
      color: style.color, background: style.backgroundColor, shadow: style.boxShadow, opacity: style.opacity,
      opaque: rgba(style.color)[3] ?? 1, solid: rgba(style.backgroundColor)[3] ?? 1,
      contrast: (Math.max(text, fill) + 0.05) / (Math.min(text, fill) + 0.05),
    };
  });
});
const hex = value => `rgb(${value.match(/\w\w/g).map(pair => parseInt(pair, 16)).join(', ')})`;
const mode = page => page.locator('#board').getAttribute('data-mode');
const damageTo = (page, number) => page.locator('.player').nth(number - 1).locator('.map-cell[data-attacker]')
  .evaluateAll(cells => cells.reduce((sum, cell) => sum + Number(cell.textContent), 0));

async function eventually(read, expected, message) {
  const deadline = Date.now() + 2000;
  let value = await read();
  while (!isDeepStrictEqual(value, expected) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
    value = await read();
  }
  assert.deepEqual(value, expected, message);
}

async function openPage(t, engine, options = {}) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ isMobile: true, hasTouch: true, viewport: { width: 852, height: 393 }, ...options });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no script errors'));
  return page;
}

async function turnOnCommander(page) {
  await setSwitches(page, { Commander: true });
}

// Chromium writes page storage in the background, so give a write a moment to land before a reload.
async function reload(page) {
  await page.waitForTimeout(500);
  await page.reload();
}

async function checkDamage(t, engine) {
  const page = await openPage(t, engine);
  await page.goto(app);
  assert.ok(!(await button(page, 'Commander damage').isVisible()), 'no sword with Commander off');
  await turnOnCommander(page);

  // The sword turns every tile into a map of the table. Undo is dimmed until something changes.
  await button(page, 'Commander damage').tap();
  assert.equal(await mode(page), 'damage');
  assert.equal(await page.locator('.map-cell[data-attacker]').count(), 12, 'three opponents on each of four maps');
  assert.equal(await page.locator('.map-cell.self').count(), 4);
  // The hint shows only where every tile has room for it (SPEC §3.2): 4-player tiles are 195px tall at 852 × 393,
  // and 212px on a 952 × 427 phone.
  assert.ok(!(await tile(page, 3).getByText('Tap +1 · hold −1').isVisible()), 'no hint on short tiles');
  await page.setViewportSize({ width: 952, height: 427 });
  await tile(page, 3).getByText('Tap +1 · hold −1').waitFor({ state: 'visible', timeout: 2000 });
  await page.setViewportSize({ width: 852, height: 393 });
  await tile(page, 3).getByText('Tap +1 · hold −1').waitFor({ state: 'hidden', timeout: 2000 });
  assert.ok(await button(page, 'Undo').isDisabled());
  assert.deepEqual(await ownSeat(page, 3), ['40', 'you']);

  // Every seat is filled with the attacker's tile colour, exactly what their tile looks like across the table,
  // with the number in their seat colour. At 0 it has a thin ring in their rim colour.
  // Nothing is transparent, and every number keeps at least 4.5:1.
  for (const looks of await seatLooks(page, 3)) {
    assert.ok(looks.zero, `P${looks.attacker} starts at 0`);
    assert.equal(looks.background, looks.tile, `P${looks.attacker}'s seat is the colour of their tile`);
    assert.equal(looks.color, hex(looks.seat), `P${looks.attacker}'s 0 is in their seat colour`);
    assert.equal(looks.shadow, `${hex(looks.rim)} 0px 0px 0px 1px inset`, `P${looks.attacker}'s ring at 0`);
    assert.deepEqual([looks.opacity, looks.opaque, looks.solid], ['1', 1, 1], 'no transparency');
    assert.ok(looks.contrast >= 4.5, `P${looks.attacker}'s 0 at ${looks.contrast.toFixed(2)}:1`);
  }
  assert.notEqual((await seatLooks(page, 3))[0].panel, (await seatLooks(page, 3))[1].panel, 'each seat is its own player’s panel');

  // Each tap on an opponent's seat adds 1 commander damage from them and takes 1 life, together.
  for (let tap = 0; tap < 6; tap++) await seat(page, 3, 2).tap();
  assert.equal(await seat(page, 3, 2).textContent(), '6');
  // With damage the seat keeps the attacker's tile colour, and its ring turns into a thicker one in their seat
  // colour. Changed seats add a ring outside, over the tile.
  const hit = (await seatLooks(page, 3)).find(looks => looks.attacker === 2);
  assert.equal(hit.background, hit.tile, 'a seat with damage is still the colour of the attacker’s tile');
  assert.ok(hit.shadow.startsWith(`${hex(hit.seat)} 0px 0px 0px 2px inset, `), `the damage ring: ${hit.shadow}`);
  assert.match(hit.shadow, /rgb\(243, 241, 229\) 0px 0px 0px 4px/, 'the changed ring');
  assert.deepEqual([hit.opacity, hit.opaque, hit.solid], ['1', 1, 1], 'no transparency');
  assert.ok(hit.contrast >= 4.5, `the 6 at ${hit.contrast.toFixed(2)}:1`);
  assert.deepEqual(await ownSeat(page, 3), ['34', '−6'], 'your own seat shows your life and the change');
  assert.equal((await scores(page))[2], 34);
  await eventually(() => page.locator('#announcer').textContent(), "Player 2's commander, 6 damage to Player 3. Player 3, 34 life");

  // Undo steps back one change.
  await button(page, 'Undo').tap();
  assert.equal(await seat(page, 3, 2).textContent(), '5');
  assert.deepEqual(await ownSeat(page, 3), ['35', '−5']);

  // Holding a seat takes 1 away once the hold registers, then repeats. It never adds.
  const box = await seat(page, 3, 2).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(350);
  assert.equal(await seat(page, 3, 2).textContent(), '5', 'nothing changes before the hold registers');
  await page.waitForTimeout(400);
  await page.mouse.up();
  const afterHold = Number(await seat(page, 3, 2).textContent());
  assert.ok(afterHold >= 1 && afterHold <= 4, `the hold took damage away: ${afterHold}`);
  assert.equal((await scores(page))[2] + (await damageTo(page, 3)), 40, 'damage and life move together');
  await page.waitForTimeout(300);
  assert.equal(Number(await seat(page, 3, 2).textContent()), afterHold, 'releasing a hold adds nothing');
  // A hold at 0 does nothing.
  const zero = await seat(page, 3, 4).boundingBox();
  await page.mouse.move(zero.x + zero.width / 2, zero.y + zero.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  assert.equal(await seat(page, 3, 4).textContent(), '0');

  // Keyboards and screen readers: the seat adds one, and a labelled button beside it removes one.
  await seat(page, 3, 4).focus();
  await page.keyboard.press('Enter');
  assert.equal(await seat(page, 3, 4).textContent(), '1');
  assert.equal(await seat(page, 3, 4).getAttribute('aria-label'), "Player 4's commander, 1 damage. Add one");
  await tile(page, 3).getByRole('button', { name: "Remove one commander damage from Player 4's commander" }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await seat(page, 3, 4).textContent(), '0');
  // Back at 0 after a change, the seat keeps its zero ring inside the changed ring.
  const back = (await seatLooks(page, 3)).find(looks => looks.attacker === 4);
  assert.equal(back.background, back.tile);
  assert.ok(back.shadow.startsWith(`${hex(back.rim)} 0px 0px 0px 1px inset, `), `zero ring kept: ${back.shadow}`);
  assert.match(back.shadow, /rgb\(243, 241, 229\) 0px 0px 0px 4px$/, 'changed ring kept');
  // A held seat at 0 thickens its ring, and keeps the changed ring.
  await seat(page, 3, 4).evaluate(cell => { cell.dataset.pressed = ''; });
  const held = (await seatLooks(page, 3)).find(looks => looks.attacker === 4);
  assert.ok(held.shadow.startsWith(`${hex(held.seat)} 0px 0px 0px 3px inset, `), `held ring: ${held.shadow}`);
  assert.match(held.shadow, /rgb\(243, 241, 229\) 0px 0px 0px 4px$/);
  await seat(page, 3, 4).evaluate(cell => { delete cell.dataset.pressed; });

  // ✕ asks before discarding, then puts damage and life back as they were.
  await button(page, 'Cancel').tap();
  assert.match(await page.locator('#discard-title').textContent(), /^Discard \d+ changes\?$/);
  await button(page, 'Discard').tap();
  await eventually(() => mode(page), null);
  assert.deepEqual(await scores(page), [40, 40, 40, 40]);
  assert.equal(await farBadges(page, 3), '');

  // ✓ saves. The far row shows commander damage only, one chip per opponent, largest first.
  await button(page, 'Commander damage').tap();
  for (let tap = 0; tap < 3; tap++) await seat(page, 3, 2).tap();
  await seat(page, 3, 4).tap();
  await seat(page, 1, 4).tap();
  await button(page, 'Save').tap();
  assert.equal(await mode(page), null);
  assert.deepEqual(await scores(page), [39, 40, 36, 40]);
  assert.equal(await farBadges(page, 3), '3 commander damage from Player 2 | 1 commander damage from Player 4');
  // The pill's sword leads the row in its own circle, hidden from screen readers. A row with nothing hides it too.
  const lead = await tile(page, 3).locator('.badges.far > :first-child').evaluate(chip => ({
    sword: chip.matches('.chip.sword'), hidden: chip.getAttribute('aria-hidden'),
    path: chip.querySelector('path').getAttribute('d') === document.querySelector('#damage-button path').getAttribute('d'),
  }));
  assert.deepEqual(lead, { sword: true, hidden: 'true', path: true });
  assert.equal(await page.locator('.badges.far .chip.sword').count(), 2, 'a sword only on rows that show');
  assert.ok(!(await tile(page, 2).locator('.badges.far .chip.sword').count()));
  // Each chip is a tiny piece of the attacker's tile: their tile colour, with the number in their seat colour.
  const chipLooks = number => tile(page, 3).locator('.badges.far .chip.damage').first().evaluate(chip => {
    const style = getComputedStyle(chip);
    return { background: style.backgroundColor, color: style.color };
  });
  const tileColour = number => tile(page, number).evaluate(node => getComputedStyle(node).backgroundColor);
  assert.deepEqual(await chipLooks(), { background: await tileColour(2), color: 'rgb(182, 224, 247)' },
    'the chip is the colour of the attacker’s tile');
  assert.equal(await farBadges(page, 2), '');
  await reload(page);
  assert.equal(await farBadges(page, 3), '3 commander damage from Player 2 | 1 commander damage from Player 4', 'saved damage survives a reload');
  assert.deepEqual(await scores(page), [39, 40, 36, 40]);

  // A new attacker colour shows on the chips straight away.
  await button(page, 'Game setup').tap();
  await button(page, 'Colours').tap();
  await tile(page, 2).getByRole('button', { name: 'Rose', exact: true }).tap();
  await button(page, 'Done choosing colours').tap();
  assert.deepEqual(await chipLooks(), { background: await tileColour(2), color: 'rgb(255, 205, 232)' });
  assert.equal(await tileColour(2), 'rgb(87, 49, 71)', 'Rose');

  // A new game resets commander damage.
  await button(page, 'Game setup').tap();
  await button(page, 'New game').tap();
  await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  await eventually(() => farBadges(page, 3), '', 'a new game clears commander damage');
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: commander damage is entered on a table map and linked to life`, { timeout: 60000 }, t => checkDamage(t, engine));
}

// Every map matches the table: seats that sit apart on the board sit apart the same way on screen.
async function checkMaps(t, engine) {
  const page = await openPage(t, engine);
  await fakeScreenOrientation(page);
  await page.goto(app);
  await turnOnCommander(page);
  const check = async (view) => {
    await button(page, 'Commander damage').tap();
    const problems = await page.evaluate(() => {
      const centre = (node) => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return [x + width / 2, y + height / 2];
      };
      const tiles = [...document.querySelectorAll('.player')].map(centre);
      const found = [];
      document.querySelectorAll('.player').forEach((player, defender) => {
        const cells = new Map([...player.querySelectorAll('.map-cell')].map(cell =>
          [cell.classList.contains('self') ? defender : Number(cell.dataset.attacker), centre(cell)]));
        for (const [a, cellA] of cells) {
          for (const [b, cellB] of cells) {
            for (const axis of [0, 1]) {
              const apart = tiles[a][axis] - tiles[b][axis];
              if (Math.abs(apart) > 10 && Math.sign(cellA[axis] - cellB[axis]) !== Math.sign(apart)) {
                found.push(`P${defender + 1}'s map puts P${a + 1} and P${b + 1} the wrong way round on ${axis ? 'y' : 'x'}`);
              }
            }
          }
        }
        if (cells.size !== tiles.length) found.push(`P${defender + 1}'s map has ${cells.size} seats`);
      });
      return found;
    });
    assert.deepEqual(problems, [], view);
    await button(page, 'Cancel').tap();
  };
  for (const [width, height, angle] of [[852, 393, 90], [393, 852, 0]]) {
    await turnScreen(page, width, height, angle);
    for (const count of [2, 3, 4, 5, 6]) {
      await startGame(page, count);
      await check(`${count} players, ${width}×${height}`);
    }
  }
  // A rotated seat turns its map with it.
  await button(page, 'Game setup').tap();
  await button(page, 'Rotate seats').tap();
  await button(page, 'Rotate Player 6 clockwise').tap();
  await button(page, 'Rotate Player 1 clockwise').tap();
  await button(page, 'Rotate Player 1 clockwise').tap();
  await button(page, 'Rotate Player 1 clockwise').tap();
  await button(page, 'Done rotating seats').tap();
  await check('6 players with rotated seats');
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: each map shows the table in board coordinates`, { timeout: 90000 }, t => checkMaps(t, engine));
}

test('chromium: warnings at 15 commander damage and 7 poison, out at 21 and 10', async (t) => {
  const page = await openPage(t, chromium);
  await page.goto(app);
  const load = async (saved) => {
    await page.evaluate(game => localStorage.setItem('lifepod-game', JSON.stringify(game)), saved);
    await page.reload();
    return page.evaluate(() => [...document.querySelectorAll('.player')].map(player => ({
      out: player.querySelector('.score').hasAttribute('data-out'),
      chips: [...player.querySelectorAll('.badges:not([hidden]) .chip[role="listitem"]')].map(chip => {
        const style = getComputedStyle(chip);
        const ring = style.boxShadow === 'none' ? 'no ring' : `${style.boxShadow.match(/rgb\([^)]*\)/)[0]} ring`;
        return `${chip.textContent} ${chip.dataset.level ?? 'plain'} ${style.color} ${ring}`;
      }),
    })));
  };
  const amber = 'rgb(242, 196, 109)';
  const red = 'rgb(244, 153, 147)';
  const text = 'rgb(243, 241, 229)';
  const game = {
    startingLife: 40, scores: [31, 15, 28, 12], rotations: [0, 0, 0, 0], keepAwake: true, landscapeAngle: 90,
    counters: { commander: true, poison: true }, poison: [0, 6, 7, 10],
    commanderDamage: [[0, 14, 0, 0], [0, 0, 0, 21], [15, 0, 0, 0], [0, 20, 0, 0]],
  };
  // Damage chips are in the attacker's tile colour with a ring: their rim colour, or the warning colour.
  const sky = { seat: 'rgb(182, 224, 247)', rim: 'rgb(81, 113, 135)' };
  assert.deepEqual(await load(game), [
    { out: false, chips: [`14 commander damage from Player 2 plain ${sky.seat} ${sky.rim} ring`] },
    { out: true, chips: [`21 commander damage from Player 4 out ${red} ${red} ring`, `6 poison plain ${text} no ring`] },
    { out: false, chips: [`15 commander damage from Player 1 warn ${amber} ${amber} ring`, `7 poison warn ${amber} no ring`] },
    { out: true, chips: [`20 commander damage from Player 2 warn ${amber} ${amber} ring`, `10 poison out ${red} ${red} ring`] },
  ]);
  // With their switches off, the counts don't show and don't knock anyone out.
  const off = await load({ ...game, counters: { commander: false, poison: false } });
  assert.deepEqual(off.map(player => player.out), [false, false, false, false]);
  assert.deepEqual(off.flatMap(player => player.chips), []);
  // Badly saved damage falls back to 0, and no one damages themselves.
  const bad = await load({ ...game, poison: [], commanderDamage: [[5, -1, 2.5, 'x'], 'no', [1, 2, 3, 4], [0, 0, 0, 100]] });
  assert.deepEqual(bad.map(player => player.chips.map(chip => chip.split(' plain')[0].split(' warn')[0])), [
    [], [], ['4 commander damage from Player 4', '2 commander damage from Player 2', '1 commander damage from Player 1'], [],
  ]);
});

test('chromium: commander damage and the busiest badges fit six players on the smallest phone', { timeout: 60000 }, async (t) => {
  const page = await openPage(t, chromium);
  await fakeScreenOrientation(page);
  await page.goto(app);
  // The worst case from the design: damage from all five opponents, poison 9, a five-colour identity and tax +10.
  const busy = { damage: [0, 18, 12, 9, 7, 4], poison: 9, identity: 'WUBRG', casts: 5 };
  const twoDigits = [0, 14, 13, 12, 11, 10];
  await page.evaluate(({ busy, twoDigits }) => {
    const row = (player, amounts) => amounts.map((_, attacker) => (attacker === player ? 0 : amounts[(attacker - player + 6) % 6]));
    localStorage.setItem('lifepod-game', JSON.stringify({
      startingLife: 40, scores: [11, 38, 33, 9, 30, 35], rotations: [0, 0, 0, 0, 0, 0], keepAwake: true, landscapeAngle: 90,
      counters: { commander: true, poison: true }, poison: [busy.poison, 0, 0, busy.poison, 0, 0],
      casts: [busy.casts, 0, 0, busy.casts, 0, 0], identities: [busy.identity, '', '', busy.identity, '', ''],
      commanderDamage: [row(0, busy.damage), row(1, twoDigits), [0, 0, 0, 0, 0, 0], row(3, busy.damage), row(4, twoDigits), [0, 0, 0, 0, 0, 0]],
    }));
  }, { busy, twoDigits });
  await page.reload();
  await turnScreen(page, 320, 568, 0);
  const findBadgeProblems = () => page.evaluate(() => {
    const found = [];
    document.querySelectorAll('.player').forEach((player, index) => {
      const bounds = player.getBoundingClientRect();
      const score = player.querySelector('.score').getBoundingClientRect();
      for (const row of player.querySelectorAll('.badges:not([hidden])')) {
        const chips = [...row.children].map(chip => chip.getBoundingClientRect());
        const name = `P${index + 1} ${row.classList.contains('far') ? 'far' : 'near'} row`;
        // Measured in the tile's own frame, since the board is turned on a portrait screen.
        if (new Set([...row.children].map(chip => chip.offsetTop)).size > 1) found.push(`${name} wraps`);
        for (const chip of chips) {
          if (chip.left < bounds.left || chip.right > bounds.right || chip.top < bounds.top || chip.bottom > bounds.bottom) {
            found.push(`${name} leaves the tile`);
          }
          if (chip.left < score.right && score.left < chip.right && chip.top < score.bottom && score.top < chip.bottom) {
            found.push(`${name} covers the life total`);
          }
        }
      }
    });
    return found;
  });
  assert.deepEqual(await findBadgeProblems(), []);
  assert.equal(await tile(page, 1).locator('.badges.far .chip:not(.sword)').count(), 5);
  assert.equal(await tile(page, 2).locator('.badges.far .chip:not(.sword)').count(), 5);
  assert.equal(await page.locator('.badges.far:not([hidden]) > .chip.sword:first-child').count(), 4, 'each far row leads with the sword');
  // The design's worst case, the sword and five chips of 18, 12, 9, 7 and 4, fits at full size. Five two-digit
  // amounts shrink the row's type a little, and no further than 10px.
  const sizes = await page.locator('.badges.far').evaluateAll(rows => rows.map(row => [row.style.fontSize, parseFloat(getComputedStyle(row).fontSize)]));
  assert.deepEqual([sizes[0][0], sizes[3][0]], ['', ''], `the worst case keeps its type: ${sizes}`);
  assert.ok(Math.min(...sizes.map(([, size]) => size)) >= 10, `two-digit rows stay readable: ${sizes}`);

  // The guarantee holds whatever the font: give every row a much wider face, as some Linux and Android
  // system fonts are, and the rows still fit on one line with every amount shown.
  await page.evaluate(() => {
    for (const row of document.querySelectorAll('.badges')) {
      row.style.fontFamily = 'monospace';
      row.style.letterSpacing = '.15em';
      row.style.fontStretch = 'expanded';
    }
    window.dispatchEvent(new Event('resize'));
  });
  assert.deepEqual(await findBadgeProblems(), [], 'a wide font still fits');
  assert.equal(await tile(page, 2).locator('.badges.far .chip:not(.sword)').count(), 5, 'every amount stays');
  const smallest = await page.locator('.badges:not([hidden])').evaluateAll(rows => Math.min(...rows.map(row => parseFloat(getComputedStyle(row).fontSize))));
  assert.ok(smallest >= 6, `type stays readable: ${smallest}px`);

  // Commander damage mode keeps every seat a whole 44px target, inside its tile and clear of the centre controls.
  await button(page, 'Commander damage').tap();
  const problems = await page.evaluate(() => {
    const controls = document.querySelector('#board-controls').getBoundingClientRect();
    const pill = { left: controls.left + 6, right: controls.right - 6, top: controls.top + 6, bottom: controls.bottom - 6 };
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return [...document.querySelectorAll('.player')].flatMap((player, index) => {
      const bounds = player.getBoundingClientRect();
      return [...player.querySelectorAll('.map-cell')].map((cell) => {
        const box = cell.getBoundingClientRect();
        const issues = [];
        if (Math.min(box.width, box.height) < 43.5) issues.push(`${Math.round(box.width)}×${Math.round(box.height)}`);
        if (box.left < bounds.left || box.right > bounds.right || box.top < bounds.top || box.bottom > bounds.bottom) issues.push('outside its tile');
        if (overlaps(box, pill)) issues.push('under the centre controls');
        return issues.length ? `P${index + 1} ${cell.getAttribute('aria-label') ?? 'own seat'}: ${issues.join(', ')}` : '';
      }).filter(Boolean);
    });
  });
  assert.deepEqual(problems, []);
  assert.equal(await page.locator('.map-cell').count(), 36);
});

test('chromium: Android back cancels commander damage the way ✕ does', async (t) => {
  const page = await openPage(t, chromium);
  await page.addInitScript(() => {
    window.backHandling = [];
    window.LifePodAndroid = {
      readGame: () => sessionStorage.getItem('game'),
      writeGame: (game) => sessionStorage.setItem('game', game),
      keepAwake() {},
      haptic() {},
      setBackHandling: (enabled) => window.backHandling.push(enabled),
    };
  });
  await page.goto(app);
  const back = () => page.evaluate(() => window.closeOpenDialog());
  await turnOnCommander(page);
  await button(page, 'Commander damage').tap();
  assert.equal(await page.evaluate(() => window.backHandling.at(-1)), true);
  await seat(page, 2, 1).tap();
  await seat(page, 2, 1).tap();
  assert.equal(await back(), true);
  assert.equal(await page.locator('#discard-title').textContent(), 'Discard 2 changes?');
  assert.equal(await back(), true, 'back closes the question and keeps editing');
  await eventually(() => page.locator('#discard').evaluate(dialog => dialog.open), false);
  assert.equal(await mode(page), 'damage');
  await button(page, 'Save').tap();
  const saved = JSON.parse(await page.evaluate(() => sessionStorage.getItem('game')));
  assert.deepEqual(saved.commanderDamage[1], [2, 0, 0, 0]);
  assert.equal(saved.scores[1], 38);
  assert.equal(await back(), false, 'back at rest leaves the app');
});
