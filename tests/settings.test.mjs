import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { chromium, webkit } from 'playwright-core';
import { app, button, fakeScreenOrientation, scores, turnScreen } from './helpers.mjs';

// The full-screen settings page (design/polish/SETTINGS-SPEC.md) and its controls (design/polish/STYLE.md): layout B,
// the notched players and life sliders, the inline life editor, the pending new game (P1), the flip (O1), board
// actions, the instant switches and the inline About.

const engines = { chromium, webkit };

async function openPage(t, engine, { android = false, viewport = { width: 952, height: 427 } } = {}) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ isMobile: true, hasTouch: true, viewport });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no script errors'));
  if (android) {
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
  }
  return page;
}

// A dialog's close event runs after the click that closes it, so results that follow it are polled.
async function eventually(read, expected, message) {
  const deadline = Date.now() + 2000;
  let value = await read();
  while (!isDeepStrictEqual(value, expected) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
    value = await read();
  }
  assert.deepEqual(value, expected, message);
}

const openDialogs = page => page.evaluate(() => [...document.querySelectorAll('dialog[open]')].map(dialog => dialog.id));
const boardMode = page => page.evaluate(() => document.querySelector('#board').dataset.mode ?? null);
const doneLabel = page => page.locator('#save-setup').textContent();
const pendingText = page => page.locator('#settings-pending').evaluate(note => (note.hasAttribute('data-empty') ? '' : note.textContent));
// A slider's value as a screen reader hears it, and where its thumb sits along the track (0 to 1).
const sliderState = (page, id) => page.locator(`#${id}-track`).evaluate((track) => {
  const thumb = track.querySelector('.k-thumb').getBoundingClientRect();
  const box = track.getBoundingClientRect();
  return {
    now: Number(track.getAttribute('aria-valuenow')),
    text: track.getAttribute('aria-valuetext'),
    at: Math.round(((thumb.left + thumb.width / 2 - box.left) / box.width) * 100) / 100,
    pinned: track.dataset.pinned ?? '',
  };
});
// The point on a slider's track for a value.
async function pointFor(page, id, value, [min, max]) {
  const box = await page.locator(`#${id}-track`).boundingBox();
  return { x: box.x + box.width * (value - min) / (max - min), y: box.y + box.height / 2 };
}

// ---- Layout -------------------------------------------------------------------------------------------------------

// Everything wrong with the page as shown: the dialog not covering the window, the header out of place, targets under
// 44px, anything wider than the window (a sideways scroll), a label cut short, or sections in the wrong place.
function readLayout(page) {
  return page.evaluate(() => {
    const found = [];
    const dialog = document.querySelector('#settings');
    const body = document.querySelector('#settings-body');
    const head = dialog.querySelector('.fs-head').getBoundingClientRect();
    const box = dialog.getBoundingClientRect();
    if (Math.abs(box.left) > 0.5 || Math.abs(box.top) > 0.5 || Math.abs(box.width - innerWidth) > 0.5 || Math.abs(box.height - innerHeight) > 0.5) {
      found.push(`dialog ${JSON.stringify(box)}`);
    }
    if (head.top < -0.5 || head.bottom > innerHeight / 2) found.push(`header at ${head.top}–${head.bottom}`);
    if (body.scrollWidth > body.clientWidth + 0.5) found.push(`the body scrolls sideways (${body.scrollWidth} > ${body.clientWidth})`);
    const shown = node => node.checkVisibility({ visibilityProperty: true }) && node.offsetWidth > 0;
    for (const node of [...dialog.querySelectorAll('button, label, .k-slider')].filter(shown)) {
      const target = node.getBoundingClientRect();
      const name = node.getAttribute('aria-label') ?? node.id ?? node.textContent.trim();
      if (target.width < 43.5 || target.height < 43.5) found.push(`${name} ${Math.round(target.width)}×${Math.round(target.height)}`);
      if (target.left < -0.5 || target.right > innerWidth + 0.5) found.push(`${name} runs off the side`);
    }
    for (const label of dialog.querySelectorAll('.nav-label')) {
      if (shown(label) && label.scrollWidth > label.clientWidth + 0.5) found.push(`${label.textContent} is cut short`);
    }
    const at = id => document.querySelector(`#settings-${id}`).getBoundingClientRect();
    const [game, track, identity, table, about] = ['game', 'track', 'identity', 'table', 'about'].map(at);
    const columns = document.querySelector('#settings-content').hasAttribute('data-columns');
    const layout = columns
      ? game.left < track.left && Math.abs(game.top - track.top) < 1 && Math.abs(game.left - table.left) < 1 && Math.abs(track.left - identity.left) < 1
        && table.top > game.top && identity.top > track.top && about.top >= Math.max(table.bottom, identity.bottom) && about.width > game.width * 1.5
      : [game, track, identity, table, about].every((section, index, all) => index === 0 || (section.top > all[index - 1].top && Math.abs(section.left - game.left) < 1));
    if (!layout) found.push(`sections out of place (${columns ? 'two columns' : 'one column'})`);
    return { found, columns, scrolls: body.scrollHeight > body.clientHeight + 1, headHeight: Math.round(head.height) };
  });
}

const layoutSizes = [[952, 427, 90], [852, 393, 90], [640, 360, 90], [620, 360, 90], [619, 360, 90], [568, 320, 90], [375, 667, 0], [320, 568, 0], [1366, 1024, 90]];

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: settings opens full screen, two columns from 620px wide and one below, with 44px targets and nothing sideways`, { timeout: 60000 }, async (t) => {
    const page = await openPage(t, engine);
    await fakeScreenOrientation(page);
    await page.goto(app);
    // With Mana pool on and Turns not Off, every row shows, auto-empty's included.
    await page.evaluate(() => localStorage.setItem('lifepod-game', JSON.stringify({
      startingLife: 40, scores: [40, 40, 40, 40], manaPool: true, turns: 'turns', turn: { first: 0, active: 0, round: 1 },
    })));
    await page.reload();
    for (const [width, height, angle] of layoutSizes) {
      const view = `${width} × ${height}`;
      await turnScreen(page, width, height, angle);
      await button(page, 'Settings').tap();
      assert.deepEqual(await openDialogs(page), ['settings'], `${view}: settings opens`);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'settings-close', `${view}: focus starts on ✕`);
      const layout = await readLayout(page);
      assert.deepEqual(layout.found, [], `${view}: the page fits`);
      assert.equal(layout.columns, width >= 620, `${view}: ${width >= 620 ? 'two columns' : 'one column'}`);
      if (height <= 427) assert.equal(layout.scrolls, true, `${view}: the body scrolls`);
      // With a new game pending, the pending line shows and the page still fits.
      await button(page, '6 players').tap();
      assert.deepEqual((await readLayout(page)).found, [], `${view}: the page fits with a new game pending`);
      // The header stays put as the body scrolls.
      const head = () => page.locator('.fs-head').boundingBox();
      const before = await head();
      await page.locator('#settings-body').evaluate((body) => { body.scrollTop = body.scrollHeight; });
      assert.deepEqual(await head(), before, `${view}: the header stays at the top`);
      await button(page, 'Close settings').tap();
      await eventually(() => openDialogs(page), [], `${view}: ✕ closes settings`);
    }
  });
}

test('chromium: settings keeps clear of the safe-area insets', async (t) => {
  const page = await openPage(t, chromium);
  await page.goto(app);
  // Stand-ins for a notch and a home indicator: the insets come in through CSS variables.
  await page.evaluate(() => {
    for (const [side, size] of [['top', 30], ['right', 44], ['bottom', 20], ['left', 48]]) document.documentElement.style.setProperty(`--safe-${side}`, `${size}px`);
  });
  await button(page, 'Settings').tap();
  const edges = await page.evaluate(() => {
    const head = document.querySelector('.fs-head').getBoundingClientRect();
    const body = document.querySelector('#settings-body').getBoundingClientRect();
    return { top: head.top, left: Math.min(head.left, body.left), right: innerWidth - Math.max(head.right, body.right), bottom: innerHeight - body.bottom };
  });
  assert.deepEqual(edges, { top: 30, left: 48, right: 44, bottom: 20 }, 'the header and body sit inside the insets');
});

// ---- Players slider -----------------------------------------------------------------------------------------------

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: the players slider works by tapping a number, tapping the track, dragging and the arrow keys`, async (t) => {
    const page = await openPage(t, engine);
    await page.goto(app);
    await button(page, 'Settings').tap();
    assert.deepEqual(await sliderState(page, 'players'), { now: 4, text: '4 players', at: 0.5, pinned: '' });

    // A tap on a number.
    await button(page, '6 players').tap();
    assert.deepEqual(await sliderState(page, 'players'), { now: 6, text: '6 players', at: 1, pinned: '' });
    assert.equal(await button(page, '6 players').getAttribute('aria-pressed'), 'true');
    // A tap on the track between stops snaps to the nearest.
    const nearThree = await pointFor(page, 'players', 3.2, [2, 6]);
    await page.touchscreen.tap(nearThree.x, nearThree.y);
    assert.equal((await sliderState(page, 'players')).now, 3, 'a tap on the track picks the nearest stop');
    // A drag snaps to each stop it passes and stays on the last.
    const from = await pointFor(page, 'players', 3, [2, 6]);
    const to = await pointFor(page, 'players', 5.1, [2, 6]);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    assert.equal((await sliderState(page, 'players')).now, 5, 'the value follows the drag');
    await page.mouse.up();
    assert.deepEqual(await sliderState(page, 'players'), { now: 5, text: '5 players', at: 0.75, pinned: '' });
    // A press that moves up or down is a swipe, not a tap or a drag, even where nothing scrolls: the value stays.
    const swipe = await pointFor(page, 'players', 3, [2, 6]);
    await page.mouse.move(swipe.x, swipe.y);
    await page.mouse.down();
    await page.mouse.move(swipe.x + 2, swipe.y - 40, { steps: 6 });
    await page.mouse.up();
    assert.equal((await sliderState(page, 'players')).now, 5, 'a vertical swipe leaves the value');
    // Keys step it and stop at the ends.
    await page.locator('#players-track').focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal((await sliderState(page, 'players')).now, 4);
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowRight');
    assert.equal((await sliderState(page, 'players')).now, 6, 'never above 6');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    assert.equal((await sliderState(page, 'players')).now, 2, 'never below 2');
    await page.keyboard.press('ArrowUp');
    await page.locator('#save-setup').tap();
    assert.equal((await scores(page)).length, 3, 'Start new game deals the chosen players');
  });
}

test('chromium: a touch drag along the players slider picks a value', async (t) => {
  const page = await openPage(t, chromium);
  await page.goto(app);
  await button(page, 'Settings').tap();
  const cdp = await page.context().newCDPSession(page);
  const from = await pointFor(page, 'players', 4, [2, 6]);
  const to = await pointFor(page, 'players', 2, [2, 6]);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let step = 1; step <= 8; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * step / 8, y: from.y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal((await sliderState(page, 'players')).now, 2, 'the drag ends on 2');
});

// ---- Starting life slider and the inline editor -------------------------------------------------------------------

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: the life slider has stops at 20, 30 and 40, snaps to fives and steps by keys`, async (t) => {
    const page = await openPage(t, engine);
    await page.goto(app);
    await button(page, 'Settings').tap();
    assert.deepEqual(await sliderState(page, 'life'), { now: 40, text: 'Starting life 40', at: 0.6, pinned: '' });
    assert.deepEqual(await page.locator('#life-presets .k-stop').allTextContents(), ['20', '30', '40']);
    assert.equal(await page.locator('#life-track .k-tick').count(), 11, 'a tick every 5 from 10 to 60');
    assert.equal(await page.locator('#life-track .k-tick[data-stop]').count(), 3, 'three of them are the stops');

    await button(page, '30').tap();
    assert.equal((await sliderState(page, 'life')).now, 30);
    assert.equal(await page.locator('#life-value').textContent(), '30', 'the number follows the slider');
    // A tap on the track snaps to a multiple of 5.
    const nearFifty = await pointFor(page, 'life', 51.5, [10, 60]);
    await page.touchscreen.tap(nearFifty.x, nearFifty.y);
    assert.equal((await sliderState(page, 'life')).now, 50);
    // A drag snaps to fives too.
    const from = await pointFor(page, 'life', 50, [10, 60]);
    const to = await pointFor(page, 'life', 23, [10, 60]);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    assert.equal((await sliderState(page, 'life')).now, 25);
    // Arrows step by 1 and Page Up and Page Down by 5.
    await page.locator('#life-track').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    assert.equal((await sliderState(page, 'life')).now, 27);
    await page.keyboard.press('PageDown');
    assert.equal((await sliderState(page, 'life')).now, 22);
    await page.keyboard.press('PageUp');
    await page.keyboard.press('PageUp');
    assert.equal((await sliderState(page, 'life')).now, 32);
    // Past the end of the track the value keeps going, with the handle pinned and marked.
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowRight');
    assert.deepEqual(await sliderState(page, 'life'), { now: 61, text: 'Starting life 61', at: 1, pinned: 'high' });
    await page.keyboard.press('Home');
    for (let step = 0; step < 12; step++) await page.keyboard.press('ArrowLeft');
    assert.deepEqual(await sliderState(page, 'life'), { now: 1, text: 'Starting life 1', at: 0, pinned: 'low' }, 'never below 1');
    await button(page, '40').tap();
    assert.equal(await doneLabel(page), 'Done', 'back at 40 nothing is pending');
  });

  test(`${name}: the life number opens an inline field for valid, invalid and out-of-range values`, async (t) => {
    const page = await openPage(t, engine);
    await page.goto(app);
    await button(page, 'Settings').tap();
    const field = page.locator('#life-input');
    const edit = async (text, key) => {
      await page.locator('#life-edit').tap();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'life-input', 'the field takes focus');
      assert.deepEqual(await field.evaluate(input => [input.selectionStart, input.selectionEnd]), [0, (await field.inputValue()).length], 'its value is selected, so typing replaces it');
      await field.press('Backspace');
      if (text) await field.pressSequentially(text);
      if (key) await field.press(key);
    };
    assert.deepEqual(await field.evaluate(input => [input.inputMode, input.getAttribute('enterkeyhint'), input.maxLength]), ['numeric', 'done', 3]);

    // Valid: Enter commits, and the slider and Done follow.
    await edit('25', 'Enter');
    assert.equal(await page.locator('#life-editor').isHidden(), true, 'Enter closes the field');
    assert.deepEqual(await openDialogs(page), ['settings'], 'Enter doesn’t submit settings');
    assert.equal(await page.locator('#life-value').textContent(), '25');
    assert.deepEqual(await sliderState(page, 'life'), { now: 25, text: 'Starting life 25', at: 0.3, pinned: '' });
    assert.equal(await doneLabel(page), 'Start new game');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'life-edit', 'focus returns to the number');

    // Invalid: empty, 0 and letters keep the last value.
    for (const text of ['', '0', 'ab']) {
      await edit(text, 'Enter');
      assert.equal(await page.locator('#life-value').textContent(), '25', `"${text}" reverts`);
    }
    // Escape cancels without closing settings.
    await edit('33', 'Escape');
    assert.equal(await page.locator('#life-value').textContent(), '25', 'Escape keeps the last value');
    assert.deepEqual(await openDialogs(page), ['settings'], 'Escape only closes the field');

    // Out of range for the track but allowed (1 to 999): the number shows and the handle pins to the end, marked.
    await edit('150');
    await page.locator('#life-commit').tap();
    assert.equal(await page.locator('#life-value').textContent(), '150');
    assert.deepEqual(await sliderState(page, 'life'), { now: 150, text: 'Starting life 150', at: 1, pinned: 'high' });
    await edit('7');
    // Leaving the field commits (iOS has no Enter on its number pad).
    await page.locator('.fs-sec > h3').first().tap();
    assert.deepEqual(await sliderState(page, 'life'), { now: 7, text: 'Starting life 7', at: 0, pinned: 'low' });
    // Only three digits fit.
    await edit('12345', 'Enter');
    assert.equal(await page.locator('#life-value').textContent(), '123');
    await page.locator('#save-setup').tap();
    assert.deepEqual(await scores(page), [123, 123, 123, 123], 'the new game starts at the typed life');

    // An old save off the track opens with its life shown and the handle pinned.
    await page.evaluate(() => localStorage.setItem('lifepod-game', JSON.stringify({ startingLife: 5, scores: [5, 3, 5, 5] })));
    await page.reload();
    await button(page, 'Settings').tap();
    assert.deepEqual(await sliderState(page, 'life'), { now: 5, text: 'Starting life 5', at: 0, pinned: 'low' });
    assert.equal(await doneLabel(page), 'Done', 'nothing has changed yet');
  });
}

// In both styles: Glass's header floats over the body (design/polish/STYLE.md, direction B).
for (const style of ['material', 'glass']) {
  test(`chromium: the life field scrolls clear of the keyboard and the header (${style})`, async (t) => {
    const page = await openPage(t, chromium);
    await page.goto(app);
    await page.evaluate(saved => localStorage.setItem('lifepod-game', JSON.stringify(saved)), { startingLife: 40, scores: [40, 40, 40, 40], style });
    await page.reload();
    await button(page, 'Settings').tap();
    // Scrolled so the life row is near the bottom of the screen, then the keyboard takes 46% of the height (Android's
    // WebView shrinks the page for it).
    await page.locator('#settings-body').evaluate((body) => {
      const row = document.querySelector('#life-row').getBoundingClientRect();
      body.scrollTop = Math.max(0, row.bottom - innerHeight + 20 + body.scrollTop);
    });
    await page.locator('#life-edit').tap();
    await page.setViewportSize({ width: 952, height: 230 });
    const clear = () => page.evaluate(() => {
      const field = document.querySelector('#life-editor').getBoundingClientRect();
      const head = document.querySelector('.fs-head').getBoundingClientRect();
      return field.top >= head.bottom && field.bottom <= innerHeight;
    });
    await eventually(clear, true, 'the field shows between the header and the keyboard');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'life-input', 'the field keeps focus');
    // Turned to face the other side too.
    await page.setViewportSize({ width: 952, height: 427 });
    await page.locator('#settings-flip').evaluate(flip => flip.click());
    await page.locator('#life-input').focus();
    await page.setViewportSize({ width: 952, height: 230 });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    const clearFlipped = () => page.evaluate(() => {
      const field = document.querySelector('#life-editor').getBoundingClientRect();
      const head = document.querySelector('.fs-head').getBoundingClientRect();
      return field.top >= 0 && field.bottom <= head.top;
    });
    await eventually(clearFlipped, true, 'turned, the field shows between the top of the screen and the header');
  });
}

// ---- Pending new game (P1), Done, ✕ and New game ------------------------------------------------------------------

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: a players or life change is pending until Done, and ✕ drops it`, async (t) => {
    const page = await openPage(t, engine);
    await page.goto(app);
    await button(page, 'Settings').tap();
    assert.equal(await doneLabel(page), 'Done');
    assert.equal(await pendingText(page), '');
    assert.ok(await button(page, 'New game').isVisible());

    await button(page, '6 players').tap();
    assert.equal(await doneLabel(page), 'Start new game');
    assert.equal(await pendingText(page), 'Starts a new game with 6 players at 40 life when you leave settings.');
    assert.equal(await page.locator('#settings-pending').getAttribute('aria-live'), 'polite');
    assert.ok(!(await button(page, 'New game').isVisible()), 'New game hides while a game is pending');
    await button(page, '30').tap();
    assert.equal(await pendingText(page), 'Starts a new game with 6 players at 30 life when you leave settings.');
    // Choosing the old values again clears it.
    await button(page, '4 players').tap();
    await button(page, '40').tap();
    assert.equal(await doneLabel(page), 'Done');
    assert.equal(await pendingText(page), '');
    assert.ok(await button(page, 'New game').isVisible());

    // ✕ drops a pending change.
    await button(page, '6 players').tap();
    await button(page, 'Close settings').tap();
    await eventually(() => openDialogs(page), []);
    assert.equal((await scores(page)).length, 4, '✕ starts nothing');
    // Escape too, and settings opens from the current game each time.
    await button(page, 'Settings').tap();
    assert.equal(await button(page, '4 players').getAttribute('aria-pressed'), 'true', 'pending choices start from the game');
    await button(page, '2 players').tap();
    await page.keyboard.press('Escape');
    await eventually(() => openDialogs(page), []);
    assert.equal((await scores(page)).length, 4, 'Escape starts nothing');
    // Done with nothing pending just closes.
    await page.locator('.player').first().locator('.add').tap();
    await button(page, 'Settings').tap();
    await page.locator('#save-setup').tap();
    await eventually(() => openDialogs(page), []);
    assert.deepEqual(await scores(page), [41, 40, 40, 40], 'Done keeps the game');
    // Start new game deals it, without asking.
    await button(page, 'Settings').tap();
    await button(page, '5 players').tap();
    await button(page, '20').tap();
    await page.locator('#save-setup').tap();
    await eventually(() => openDialogs(page), []);
    assert.deepEqual(await scores(page), [20, 20, 20, 20, 20]);
  });

  test(`${name}: New game asks over settings; cancelling returns, confirming starts it and closes both`, async (t) => {
    const page = await openPage(t, engine, { android: engine === chromium });
    await page.goto(app);
    await page.locator('.player').first().locator('.add').tap();
    await button(page, 'Settings').tap();
    await button(page, 'New game').tap();
    await eventually(() => openDialogs(page), ['settings', 'restart'], 'the confirmation opens over settings');
    assert.equal(await page.locator('#restart-message').textContent(), 'All players will go back to 40 life.');
    await button(page, 'Cancel new game').tap();
    await eventually(() => openDialogs(page), ['settings'], 'cancelling returns to settings');
    if (engine === chromium) {
      // Android back closes the confirmation first, then settings.
      await button(page, 'New game').tap();
      assert.equal(await page.evaluate(() => window.closeOpenDialog()), true);
      await eventually(() => openDialogs(page), ['settings'], 'back closes the confirmation, not settings');
    }
    await button(page, 'New game').tap();
    await button(page, 'Start new game').last().tap();
    await eventually(() => openDialogs(page), [], 'confirming closes both');
    assert.deepEqual(await scores(page), [40, 40, 40, 40]);
  });
}

// ---- Board actions ------------------------------------------------------------------------------------------------

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: Colours, Rotate seats and Choose identities close settings, starting a pending game first`, { timeout: 60000 }, async (t) => {
    const page = await openPage(t, engine);
    await page.goto(app);
    const actions = [
      ['Choose tile colours on the board', 'colours', 'Done choosing colours'],
      ['Rotate seats on the board', 'rotate', 'Done rotating seats'],
      ['Choose identities on the board', 'identity', 'Done choosing identities'],
    ];
    for (const [action, mode, done] of actions) {
      // Nothing pending: the game carries on.
      await page.locator('.player').first().locator('.add').tap();
      const before = await scores(page);
      await button(page, 'Settings').tap();
      await button(page, action).tap();
      await eventually(() => openDialogs(page), [], `${action} closes settings`);
      assert.equal(await boardMode(page), mode, `${action} starts ${mode} mode`);
      assert.deepEqual(await scores(page), before, `${action} keeps the game`);
      await button(page, done).tap();
      assert.equal(await boardMode(page), null, 'the check mark returns to the board, not settings');
      assert.deepEqual(await openDialogs(page), []);

      // Pending: the new game starts first, then the mode on it.
      const count = { colours: 6, rotate: 3, identity: 5 }[mode];
      await button(page, 'Settings').tap();
      await button(page, `${count} players`).tap();
      await button(page, '30').tap();
      await button(page, action).tap();
      await eventually(() => openDialogs(page), []);
      assert.equal(await boardMode(page), mode);
      assert.deepEqual(await scores(page), Array(count).fill(30), `${action} starts the ${count}-player game first`);
      await button(page, done).tap();
    }
  });
}

// ---- Flip ---------------------------------------------------------------------------------------------------------

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: the flip turns settings to face the other side and resets on reopening`, async (t) => {
    const page = await openPage(t, engine);
    await page.goto(app);
    await button(page, 'Settings').tap();
    const flip = button(page, 'Turn settings to face the other side');
    const turned = () => page.locator('#settings').evaluate(dialog => [dialog.hasAttribute('data-flipped'), getComputedStyle(dialog).transform]);
    assert.deepEqual(await turned(), [false, 'none']);
    assert.equal(await flip.getAttribute('aria-pressed'), 'false');
    await flip.tap();
    const [flipped, transform] = await turned();
    assert.equal(flipped, true);
    assert.match(transform, /^matrix\(-1, (0|1\.\d+e-16|-?1\.22465e-16), (0|-?1\.\d+e-16|-?1\.22465e-16), -1, 0, 0\)$/, `the page is turned 180° (${transform})`);
    assert.equal(await flip.getAttribute('aria-pressed'), 'true');
    // The controls still work turned: a tap on a number, and a drag runs the other way on screen.
    await button(page, '5 players').tap();
    assert.equal((await sliderState(page, 'players')).now, 5);
    const from = await pointFor(page, 'players', 5, [2, 6]);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    // On screen the track is mirrored, so the point for 3 (unturned) is where 5 is turned; move toward the screen's left.
    const box = await page.locator('#players-track').boundingBox();
    await page.mouse.move(box.x + box.width * 0.02, from.y, { steps: 8 });
    await page.mouse.up();
    assert.equal((await sliderState(page, 'players')).now, 6, 'dragging toward the screen’s left raises the value when turned');
    await flip.tap();
    assert.deepEqual(await turned(), [false, 'none'], 'a second tap turns it back');
    await flip.tap();
    await button(page, 'Close settings').tap();
    await eventually(() => openDialogs(page), []);
    await button(page, 'Settings').tap();
    assert.deepEqual(await turned(), [false, 'none'], 'reopening resets the flip');
  });
}

// ---- Android back -------------------------------------------------------------------------------------------------

test('chromium: Android back closes settings and drops a pending change', async (t) => {
  const page = await openPage(t, chromium, { android: true });
  await page.goto(app);
  const back = () => page.evaluate(() => window.closeOpenDialog());
  await button(page, 'Settings').tap();
  await eventually(() => page.evaluate(() => window.backHandling.at(-1)), true, 'the page handles back while settings is open');
  await button(page, '6 players').tap();
  // With the life field open, back closes settings too (the keyboard is the system's to close first).
  await page.locator('#life-edit').tap();
  assert.equal(await back(), true);
  await eventually(() => openDialogs(page), [], 'back closes settings');
  assert.equal((await scores(page)).length, 4, 'the pending change is dropped');
  await eventually(() => page.evaluate(() => window.backHandling.at(-1)), false, 'back goes to the system at rest');
  assert.equal(await back(), false);
});

// ---- Instant switches ---------------------------------------------------------------------------------------------

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: Track, Identity and Keep awake save the moment they change and survive a reload`, { timeout: 60000 }, async (t) => {
    const page = await openPage(t, engine, { android: engine === chromium });
    await page.goto(app);
    const saved = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('game') ?? localStorage.getItem('lifepod-game')));
    const toggle = name => page.locator('#settings label', { has: page.getByRole('switch', { name, exact: true }) }).tap();
    await button(page, 'Settings').tap();
    // The switches come in the order Commander, Poison, Energy, Experience, Rad, Mana pool, Monarch, Initiative;
    // auto-empty follows them, shown only while Mana pool is on and Turns isn't Off.
    assert.deepEqual(await page.locator('#settings-track [role="switch"]').evaluateAll(inputs => inputs.map(input => input.closest('label').textContent.trim())),
      ['Commander', 'Poison', 'Energy', 'Experience', 'Rad', 'Mana pool', 'Monarch', 'Initiative', 'Empty mana pools when the turn passes']);
    assert.ok(await page.locator('#auto-empty-row').isHidden(), 'auto-empty is hidden with Mana pool off');
    await toggle('Poison');
    assert.equal((await saved()).counters.poison, true, 'Poison is saved while settings is open');
    assert.ok(!(await page.locator('#counters-button').evaluate(node => node.hidden)), 'the counters button shows at once');
    for (const name of ['Commander', 'Rad', 'Initiative']) await toggle(name);
    await toggle('Mana pool');
    await button(page, 'Rounds').tap();
    assert.ok(await page.locator('#auto-empty-row').isVisible(), 'auto-empty shows with Mana pool on and Turns on');
    await toggle('Name');
    await button(page, 'Off').last().tap();
    await toggle('Keep awake');
    assert.deepEqual((await saved()).counters, { commander: true, poison: true, energy: false, experience: false, rad: true, monarch: false, initiative: true });
    const game = await saved();
    assert.deepEqual([game.manaPool, game.turns, game.identity.show.name, game.identity.background, game.keepAwake], [true, 'rounds', false, 'off', false]);
    // ✕ drops nothing that saved at once.
    await button(page, 'Close settings').tap();
    await page.reload();
    await button(page, 'Settings').tap();
    const checked = await page.locator('#settings [role="switch"]').evaluateAll(inputs => Object.fromEntries(inputs.map(input => [input.closest('label').textContent.trim(), input.checked])));
    assert.deepEqual(checked, {
      Commander: true, Poison: true, Energy: false, Experience: false, Rad: true, 'Mana pool': true, Monarch: false, Initiative: true,
      'Empty mana pools when the turn passes': true, Indicator: true, Symbol: false, Name: false, 'Keep awake': false,
      'Turn reminders': true, 'Pass-it-on hints': true, 'Gesture hints': true,
    }, 'every switch survives a reload');
  });
}

// ---- Scrolling, focus and About -----------------------------------------------------------------------------------

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: the body scrolls to the end with no scroll trap, and the fade shows while there's more`, async (t) => {
    const page = await openPage(t, engine, { viewport: { width: 568, height: 320 } });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(app);
    await button(page, 'Settings').tap();
    const body = page.locator('#settings-body');
    const cue = () => page.locator('#settings .scroll-cue').evaluate(node => node.hasAttribute('data-more'));
    assert.equal(await body.evaluate(node => node.scrollTop), 0, 'settings opens at the top');
    assert.equal(await cue(), true, 'the fade says there is more');
    // The sliders leave vertical swipes to the page, and nothing above the page blocks them.
    assert.equal(await page.locator('#players-slider').evaluate(node => getComputedStyle(node).touchAction), 'pan-y');
    assert.deepEqual(await body.evaluate(node => [getComputedStyle(node).overflowY, getComputedStyle(node).overscrollBehaviorY]), ['auto', 'contain']);
    // The wheel scrolls the body even over a slider, and the slider keeps its value. (Mobile WebKit has no wheel.)
    if (engine === chromium) {
      const slider = await page.locator('#players-slider').boundingBox();
      await page.mouse.move(slider.x + slider.width / 2, slider.y + slider.height / 2);
      await page.mouse.wheel(0, 200);
      await eventually(() => body.evaluate(node => node.scrollTop > 0), true, 'the wheel over a slider scrolls the page');
      assert.equal((await sliderState(page, 'players')).now, 4, 'and leaves the slider alone');
    }
    // The end of About is reachable, and there the fade goes.
    await body.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await eventually(cue, false, 'at the end the fade goes');
    const end = await page.evaluate(() => {
      const about = document.querySelector('#settings-about').getBoundingClientRect();
      return about.bottom <= document.querySelector('#settings-body').getBoundingClientRect().bottom + 0.5;
    });
    assert.equal(end, true, 'the last section scrolls fully into view');
    assert.match(await page.locator('#settings-about').textContent(), /collects no data[\s\S]*unofficial Fan Content permitted under the Fan Content Policy/, 'About shows inline');
    // Reopening starts at the top again.
    await button(page, 'Close settings').tap();
    await eventually(() => openDialogs(page), []);
    await button(page, 'Settings').tap();
    assert.equal(await body.evaluate(node => node.scrollTop), 0, 'no scroll position is kept');
  });
}

// A real swipe through CDP: first Chromium's synthetic scroll gesture, then raw touch events with small moves over time.
// Linux's headless shell on CI turns neither into a scroll (macOS does), so there the test falls back to what makes the
// scroll possible: the slider leaves vertical pans to the page (touch-action: pan-y) and the body scrolls on its own.
// Either way, the swipe never changes the slider. On macOS the real scroll is required.
test('chromium: a vertical touch swipe that starts on a slider scrolls the page and leaves the value', async (t) => {
  const page = await openPage(t, chromium, { viewport: { width: 568, height: 320 } });
  await page.goto(app);
  await button(page, 'Settings').tap();
  const cdp = await page.context().newCDPSession(page);
  const scrolled = () => page.locator('#settings-body').evaluate(node => node.scrollTop > 40);
  const settle = async () => {
    const deadline = Date.now() + 1500;
    while (!(await scrolled()) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    return scrolled();
  };
  const start = await pointFor(page, 'players', 5, [2, 6]);
  const x = Math.round(start.x);
  const y = Math.round(start.y);
  await cdp.send('Input.synthesizeScrollGesture', { x, y, yDistance: -200, gestureSourceType: 'touch', speed: 600, repeatCount: 1 });
  let scrolls = await settle();
  assert.equal((await sliderState(page, 'players')).now, 4, 'the gesture leaves the slider’s value');
  if (!scrolls) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 20; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 10 }] });
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    scrolls = await settle();
  }
  assert.equal((await sliderState(page, 'players')).now, 4, 'the swipe leaves the slider’s value');
  if (process.platform === 'darwin' || scrolls) {
    assert.equal(scrolls, true, 'the swipe scrolls the page');
    return;
  }
  // No synthetic swipe scrolls in this browser build: check the conditions for one instead.
  const conditions = await page.evaluate(() => {
    const body = document.querySelector('#settings-body');
    const blocks = [];
    for (let node = document.querySelector('#players-slider'); node; node = node.parentElement) {
      const action = getComputedStyle(node).touchAction;
      if (action === 'none' || action === 'pan-x') blocks.push(node.id || node.className);
    }
    return {
      slider: getComputedStyle(document.querySelector('#players-slider')).touchAction,
      body: [getComputedStyle(body).overflowY, getComputedStyle(body).overscrollBehaviorY],
      room: body.scrollHeight > body.clientHeight + 40,
      blocks,
    };
  });
  assert.deepEqual(conditions, { slider: 'pan-y', body: ['auto', 'contain'], room: true, blocks: [] },
    'the slider leaves vertical pans to a body that scrolls, and nothing above it blocks them');
});

for (const style of ['material', 'glass']) {
  test(`chromium: the fixed header never covers the focused control (${style})`, async (t) => {
    const page = await openPage(t, chromium, { viewport: { width: 568, height: 320 } });
    await page.goto(app);
    await page.evaluate(saved => localStorage.setItem('lifepod-game', JSON.stringify(saved)), { startingLife: 40, scores: [40, 40, 40, 40], manaPool: true, turns: 'turns', style });
    await page.reload();
    await button(page, 'Settings').tap();
    const seen = new Set();
    for (let step = 0; step < 60; step++) {
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const node = document.activeElement;
        // Past the last control, focus leaves the page for a moment before it comes round to ✕.
        if (!document.querySelector('#settings').contains(node)) return { id: 'outside', covered: false };
        const target = node.closest('label') ?? node;
        const box = target.getBoundingClientRect();
        const head = document.querySelector('.fs-head');
        const inHead = head.contains(node);
        const headBottom = head.getBoundingClientRect().bottom;
        return { id: node.id || node.textContent.trim().slice(0, 20), covered: !inHead && (box.top < headBottom - 0.5 || box.bottom > innerHeight + 0.5) };
      });
      assert.equal(focus.covered, false, `${focus.id} is in full view below the header`);
      if (seen.has(focus.id) && focus.id === 'settings-close') break;
      seen.add(focus.id);
    }
    for (const id of ['players-track', 'life-track', 'life-edit', 'keep-awake', 'tile-colours', 'choose-identities', 'auto-empty-switch']) {
      assert.ok(seen.has(id), `Tab reaches ${id}`);
    }
  });
}

// ---- Tile colours -------------------------------------------------------------------------------------------------

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: Tile colours switches sets, keeping every player's colour and no two alike, and saves at once`, async (t) => {
    const page = await openPage(t, engine);
    await page.goto(app);
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('lifepod-game')));
    const tiles = () => page.evaluate(() => ({
      set: document.documentElement.dataset.tiles,
      colours: [...document.querySelectorAll('.player')].map(player => player.dataset.colour),
      panels: [...document.querySelectorAll('.player')].map(player => getComputedStyle(player).backgroundColor),
    }));
    // A save from before the setting gets Clear.
    await page.evaluate(() => localStorage.setItem('lifepod-game', JSON.stringify({ startingLife: 40, scores: [40, 40, 40, 40, 40, 40], colors: [6, 1, 2, 3, 4, 5] })));
    await page.reload();
    const start = await tiles();
    assert.equal(start.set, 'clear', 'an old save gets Clear');
    assert.deepEqual(start.colours, ['rose', 'sky', 'coral', 'violet', 'amber', 'teal']);
    await button(page, 'Settings').tap();
    assert.deepEqual(await sliderState(page, 'tiles'), { now: 3, text: 'Clear tile colours', at: 1, pinned: '' });
    assert.deepEqual(await page.locator('#tile-set-choices .k-stop').allTextContents(), ['Classic', 'Soft', 'Jewel', 'Clear']);

    // Each set, by tap and by key: the same swatch for every player, all different, in that set's colours.
    const seen = new Set([start.panels.join()]);
    await button(page, 'Classic').tap();
    const classic = await tiles();
    assert.equal(classic.set, 'classic');
    assert.equal((await saved()).tileColours, 'classic', 'saved the moment it changes');
    for (const [key, set] of [['ArrowRight', 'soft'], ['ArrowRight', 'jewel']]) {
      await page.locator('#tiles-track').focus();
      await page.keyboard.press(key);
      assert.equal((await tiles()).set, set);
    }
    for (const state of [classic, await tiles()]) {
      assert.deepEqual(state.colours, start.colours, `${state.set}: every player keeps their colour`);
      assert.equal(new Set(state.colours).size, 6, `${state.set}: no two players share a colour`);
      assert.equal(new Set(state.panels).size, 6, `${state.set}: no two tiles look alike`);
      seen.add(state.panels.join());
    }
    assert.equal(seen.size, 3, 'each set draws different panels');
    assert.equal(await doneLabel(page), 'Done', 'a set is not a new game');
    // The swatches take the set's names.
    await button(page, 'Clear').tap();
    await button(page, 'Choose tile colours on the board').tap();
    assert.equal(await page.locator('.player:nth-child(1) .swatch').first().getAttribute('aria-label'), 'Coral', 'Clear names its first swatch Coral');
    await button(page, 'Done choosing colours').tap();
    await page.reload();
    assert.equal((await tiles()).set, 'clear', 'the set survives a reload');
    // An unknown set falls back to Clear.
    await page.evaluate(() => localStorage.setItem('lifepod-game', JSON.stringify({ startingLife: 40, scores: [40, 40], tileColours: 'neon' })));
    await page.reload();
    assert.equal((await tiles()).set, 'clear', 'an unknown set gets Clear');
  });
}
