import assert from 'node:assert/strict';
import {
  button, engines, eventually, openFromPill, openPage, reload, saved, savedGame, seedGame, test, token,
} from './helpers.mjs';

// Track (design/polish/PILL-SPEC.md, option A, as built): where the centre pill can't hold commander damage, counters and
// mana as three buttons at full size, they become one Track button whose mode has a tab for each in the pill. Which
// form the pill takes is decided from the board's layout when it's measured, and changes only at rest.

const mergeWindow = 1500;

// Everything on: Commander (with commander tax), every counter, the monarch and the initiative, Mana pool with mana
// floating, and Turn by turn, so the pill holds every button: the round, three modes or Track, Undo, dice and settings.
function busyGame(count, extra = {}) {
  const zero = () => Array(count).fill(0);
  return savedGame(count, {
    counters: { commander: true, poison: true, energy: true, experience: true, rad: true, monarch: true, initiative: true },
    poison: zero(), casts: zero(), energy: zero(), experience: zero(), rad: zero(),
    manaPool: true, pools: Array.from({ length: count }, (_, i) => (i === 0 ? [0, 0, 0, 3, 0, 1] : [0, 0, 0, 0, 0, 0])),
    turns: 'turns', turn: { first: 0, active: 0, round: 2 },
    ...extra,
  });
}

// The sweep's sizes (design/polish/final-review.mjs), as the window is; portrait windows turn the board to landscape.
const sweep = {
  '952 × 427': [952, 427], '852 × 393': [852, 393], '640 × 360': [640, 360], '568 × 320': [568, 320],
  '375 × 667': [375, 667], '320 × 568': [320, 568], '841 × 701': [841, 701], '1366 × 1024': [1366, 1024],
};
// Where the pill takes Track with everything on, by size and player count, and where even Track needs 44px buttons;
// then the same with card lookup's magnifier counted as a fourth tool (the card-lookup branch).
const collapses = {
  '640 × 360': [3], '568 × 320': [2, 3], '375 × 667': [3], '320 × 568': [2, 3], '841 × 701': [3],
};
const tight = { '568 × 320': [3], '320 × 568': [3] };
const collapsesWithLookup = {
  '640 × 360': [2, 3], '568 × 320': [2, 3, 5], '375 × 667': [2, 3], '320 × 568': [2, 3, 5], '841 × 701': [3],
};

// What the pill is now: its form, its buttons, and its box against the board's.
function readPill(page) {
  return page.evaluate(async () => {
    const { pillCollapsed, pillRoom } = await import('/js/layout/board.js');
    const { pillFit } = await import('/js/logic/rules.js');
    const { pillTools } = await import('/js/logic/data.js');
    const { game } = await import('/js/state/state.js');
    const controls = document.querySelector('#board-controls');
    const buttons = [...controls.querySelectorAll('.pill-button')].filter(node => !node.hidden && node.checkVisibility());
    const box = controls.getBoundingClientRect();
    const board = document.querySelector('#board').getBoundingClientRect();
    return {
      collapsed: pillCollapsed, tight: controls.hasAttribute('data-tight'), lookup: pillFit(game, pillRoom.room, pillRoom.natural, pillTools + 1).collapsed,
      track: !document.querySelector('#track-button').hidden, modes: ['damage', 'counters', 'mana'].filter(mode => !document.querySelector(`#${mode}-button`).hidden),
      tabs: [...controls.querySelectorAll('[role="tab"]')].filter(tab => !tab.hidden).map(tab => tab.dataset.tab),
      count: buttons.length, smallest: Math.min(...buttons.flatMap(node => [node.offsetWidth, node.offsetHeight])),
      length: Math.max(box.width, box.height), room: pillRoom.room,
      inside: box.left >= board.left - 0.5 && box.top >= board.top - 0.5 && box.right <= board.right + 0.5 && box.bottom <= board.bottom + 0.5,
    };
  });
}

for (const [name, engine] of Object.entries(engines)) {
  // At every sweep size and player count with everything on: the pill keeps the three buttons where they fit and takes
  // Track where they don't, at 48px or more, 44px only where even Track doesn't fit; it stays inside the board, along
  // its seam, at rest and in Track's mode, whose pill is never longer than the room.
  test(`${name}: the pill takes Track only where the three buttons don't fit, at every sweep size and player count`, { timeout: 240000 }, async (t) => {
    const found = {};
    for (const [size, [width, height]] of Object.entries(sweep)) {
      const page = await openPage(t, engine, { viewport: { width, height }, orientation: height > width ? 0 : 90 });
      for (const count of [2, 3, 4, 5, 6]) {
        const view = `${size}, ${count} players`;
        await seedGame(page, busyGame(count));
        const rest = await readPill(page);
        const collapsed = collapses[size]?.includes(count) ?? false;
        const shrunk = tight[size]?.includes(count) ?? false;
        found[view] = { collapsed: rest.collapsed, tight: rest.tight, lookup: rest.lookup };
        assert.equal(rest.collapsed, collapsed, `${view}: ${collapsed ? 'Track' : 'three buttons'}`);
        assert.equal(rest.tight, shrunk, `${view}: ${shrunk ? '44px' : 'full-size'} buttons`);
        assert.equal(rest.lookup, collapsesWithLookup[size]?.includes(count) ?? false, `${view}, with the magnifier: ${rest.lookup ? 'Track' : 'three buttons'}`);
        assert.deepEqual({ track: rest.track, modes: rest.modes }, collapsed ? { track: true, modes: [] } : { track: false, modes: ['damage', 'counters', 'mana'] }, `${view}: the pill's buttons`);
        assert.equal(rest.count, collapsed ? 5 : 7, `${view}: the round, ${collapsed ? 'Track' : 'three modes'}, Undo, dice and settings`);
        assert.ok(rest.smallest >= (shrunk ? 43.5 : 47.5), `${view}: ${rest.smallest}px buttons`);
        assert.ok(rest.inside, `${view}: the pill is inside the board`);
        if (!shrunk) assert.ok(rest.length <= rest.room + 0.5, `${view}: the pill (${rest.length}px) fits its seam (${rest.room}px)`);
        if (collapsed) {
          await page.locator('#track-button').tap();
          const open = await readPill(page);
          assert.deepEqual(open.tabs, ['damage', 'counters', 'mana'], `${view}: Track's tabs`);
          assert.equal(open.count, 6, `${view}: three tabs, Undo, save and ✕`);
          assert.ok(open.smallest >= 43.5, `${view}: every tab and button is a 44px target`);
          assert.ok(open.inside, `${view}: Track's pill is inside the board`);
          assert.ok(open.length <= open.room + 0.5, `${view}: Track's pill (${open.length}px) fits its seam (${open.room}px)`);
          await button(page, 'Cancel').tap();
        }
      }
      await page.close();
    }
    t.diagnostic(JSON.stringify(found));
  });

  // The form follows the board, not a redraw, and never changes while a mode is open: a resize across the threshold
  // keeps the mode's pill until the mode closes, both ways, and the visit's edits, Undo and ✓ carry on.
  test(`${name}: the pill never changes form while a mode is open`, async (t) => {
    const page = await openPage(t, engine, { clock: true, viewport: { width: 568, height: 320 }, orientation: 90, game: busyGame(2) });
    assert.equal((await readPill(page)).collapsed, true, 'Track at 568 × 320');
    // From the keyboard, so the button has focus to give back in WebKit, which doesn't focus a tapped button.
    await page.locator('#track-button').focus();
    await page.keyboard.press('Enter');
    await page.locator('.player:nth-child(1) .counter-cell, .player:nth-child(1) .map-cell[data-attacker]').first().tap();
    await page.setViewportSize({ width: 952, height: 427 });
    await eventually(async () => (await page.evaluate(async () => (await import('/js/layout/board.js')).pillRoom.room)) > 400, true, 'the board is measured at its new size');
    let pill = await readPill(page);
    assert.deepEqual({ collapsed: pill.collapsed, tabs: pill.tabs, track: pill.track }, { collapsed: true, tabs: ['damage', 'counters', 'mana'], track: false }, 'Track\'s mode keeps its tabs through the resize');
    assert.ok(!(await page.locator('#undo-button').isDisabled()), 'the visit\'s step is still there to undo');
    await button(page, 'Save').tap();
    pill = await readPill(page);
    assert.deepEqual({ collapsed: pill.collapsed, track: pill.track, modes: pill.modes }, { collapsed: false, track: false, modes: ['damage', 'counters', 'mana'] }, 'at rest, the three buttons');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'damage-button', 'focus returns to the mode\'s own button where Track went');
    // And back: a mode opened from its own button keeps its pill when the window shrinks.
    await page.locator('#counters-button').focus();
    await page.keyboard.press('Enter');
    await page.setViewportSize({ width: 568, height: 320 });
    await eventually(async () => (await page.evaluate(async () => (await import('/js/layout/board.js')).pillRoom.room)) < 400, true, 'the board is measured at its new size');
    pill = await readPill(page);
    assert.deepEqual({ collapsed: pill.collapsed, tabs: pill.tabs }, { collapsed: false, tabs: [] }, 'counters keeps its own pill: no tabs');
    await button(page, 'Cancel').tap();
    pill = await readPill(page);
    assert.deepEqual({ collapsed: pill.collapsed, track: pill.track, modes: pill.modes }, { collapsed: true, track: true, modes: [] }, 'at rest, Track');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'track-button', 'focus returns to Track where the button went');
    // A redraw doesn't change the form: nor do taps at rest.
    const measures = await page.evaluate(async () => (await import('/js/layout/fit.js')).layoutStats.measures);
    await page.locator('.player:nth-child(1) .subtract').tap();
    await page.locator('.player:nth-child(2) .add').tap();
    assert.equal((await readPill(page)).collapsed, true);
    assert.equal(await page.evaluate(async () => (await import('/js/layout/fit.js')).layoutStats.measures), measures, 'a tap lays nothing out');
  });

  // Track at rest and its tabs (PILL-SPEC.md §3.1, §3.5): its name lists what it tracks, its face is the tab it opens
  // with a dot for each; the tabs are a tablist with a roving tab stop, arrow keys either way, Home and End, each change
  // announced, focus kept on the tab; ✕ with no changes says "Track closed" and gives focus back to Track; re-entry, and
  // a relaunch, open the last tab.
  test(`${name}: Track's tabs are tabs: names, keys, focus, announcements and re-entry`, async (t) => {
    const page = await openPage(t, engine, { clock: true, viewport: { width: 568, height: 320 }, orientation: 90, game: busyGame(2) });
    const track = page.locator('#track-button');
    const face = () => track.evaluate(node => ({
      face: [...node.querySelectorAll('[data-face]')].filter(part => !part.hasAttribute('hidden')).map(part => part.dataset.face),
      dots: [...node.querySelectorAll('.track-dots > i')].filter(dot => !dot.hidden).map(dot => (dot.hasAttribute('data-on') ? 'on' : 'off')),
    }));
    const announced = async () => page.locator('#announcer').textContent();
    const tabs = () => page.locator('#track-tabs [role="tab"]').evaluateAll(nodes => nodes.filter(node => !node.hidden)
      .map(node => [node.dataset.tab, node.getAttribute('aria-selected'), node.tabIndex, node.getAttribute('aria-controls'), node.getAttribute('aria-label')]));
    assert.equal(await track.getAttribute('aria-label'), 'Track: commander damage, counters, mana, 4 mana floating');
    assert.equal(await track.getAttribute('aria-haspopup'), null, 'Track opens a board mode, not a dialog');
    assert.deepEqual(await face(), { face: ['damage'], dots: ['on', 'off', 'off'] }, 'its face: commander damage, the first of three');
    await track.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#track-tabs').getAttribute('aria-label'), 'Track');
    assert.equal(await page.locator('#track-tabs').getAttribute('aria-orientation'), 'vertical', 'the 2-player pill stands upright');
    assert.deepEqual(await tabs(), [
      ['damage', 'true', 0, 'board', 'Commander damage'], ['counters', 'false', -1, 'board', 'Counters'], ['mana', 'false', -1, 'board', 'Mana pool, 4 mana floating'],
    ], 'one tab stop, on the open tab');
    assert.match(await announced(), /^Track, commander damage, tab 1 of 3\. Press a commander on a tile to add one damage\. Switch tabs, Undo, Save or Cancel in the centre/);
    assert.ok(await page.evaluate(() => document.activeElement?.closest('.mode-layer') !== null), 'focus moves to the first mode cell, as a mode does');
    await page.locator('#track-tab-damage').focus();
    const step = async (key, tab, words) => {
      await page.keyboard.press(key);
      assert.equal(await page.evaluate(() => document.activeElement?.dataset.tab), tab, `${key}: focus moves to ${tab}`);
      assert.equal(await page.locator('#board').getAttribute('data-mode'), tab, `${key}: the board shows ${tab}`);
      if (words) assert.equal(await announced(), words);
    };
    await step('ArrowDown', 'counters', 'Counters, tab 2 of 3. Press a counter to add one');
    await step('ArrowRight', 'mana', 'Mana pool, tab 3 of 3. Press a colour to add one mana');
    await step('ArrowRight', 'damage');
    await step('ArrowUp', 'mana');
    await step('ArrowLeft', 'counters');
    await step('Home', 'damage');
    await step('End', 'mana');
    assert.deepEqual((await tabs()).map(([tab, selected, index]) => [tab, selected, index]), [['damage', 'false', -1], ['counters', 'false', -1], ['mana', 'true', 0]]);
    // WebKit's Tab key skips buttons unless the system's keyboard navigation is on.
    if (name === 'chromium') {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'save-button', 'Tab moves on from the tabs, past Undo while it has nothing to undo');
    }
    await button(page, 'Cancel').tap();
    assert.equal(await announced(), 'Track closed');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'track-button', 'focus returns to Track');
    assert.deepEqual(await face(), { face: ['mana'], dots: ['off', 'off', 'on'] }, 'its face is now the tab it will open');
    assert.ok(await track.evaluate(node => node.hasAttribute('data-floating')), 'with mana floating, the mana dot shows on its face');
    await track.tap();
    assert.equal(await page.locator('#board').getAttribute('data-mode'), 'mana', 're-entry opens the last tab');
    await button(page, 'Cancel').tap();
    assert.equal((await saved(page)).trackTab, 'mana', 'the tab is saved with the game');
    await reload(page);
    await page.locator('#track-button').tap();
    assert.equal(await page.locator('#board').getAttribute('data-mode'), 'mana', 'and survives a relaunch');
    await button(page, 'Cancel').tap();
    // Only the tabs whose features are on, and none with one. Two tabs need Track only on the 3-player board's short seam.
    await seedGame(page, busyGame(3, { manaPool: false, trackTab: 'mana' }));
    await page.locator('#track-button').tap();
    assert.deepEqual((await tabs()).map(([tab]) => tab), ['damage', 'counters'], 'Mana pool off: two tabs');
    assert.equal(await page.locator('#board').getAttribute('data-mode'), 'damage', 'a remembered tab that\'s off opens the first');
    await button(page, 'Cancel').tap();
    await seedGame(page, busyGame(2, { counters: {} }));
    const pill = await readPill(page);
    assert.deepEqual({ track: pill.track, modes: pill.modes }, { track: false, modes: ['mana'] }, 'with one on, it is that one\'s own button');
    await page.locator('#mana-button').tap();
    assert.deepEqual(await tabs(), [], 'and its mode has no tabs');
  });

  // A tile's chips open their own tab directly, which becomes the remembered tab: the mana strip's folded chip opens mana
  // and "Pass it on" opens counters. On the 3-player board at 568 × 320, where Player 1's strip folds.
  test(`${name}: a tile's mana or counters chip opens Track on its own tab`, async (t) => {
    const pools = [[4, 3, 2, 5, 6, 7], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];
    const page = await openPage(t, engine, { clock: true, viewport: { width: 568, height: 320 }, orientation: 90, game: busyGame(3, { pools, scores: [40, 0, 40], monarch: 1, turns: 'rounds', turn: { first: 0, active: null, round: 1 } }) });
    assert.equal((await readPill(page)).collapsed, true);
    const chip = page.locator('.player:nth-child(1) .strip-chip').filter({ visible: true }).first();
    await chip.tap();
    assert.equal(await page.locator('#board').getAttribute('data-mode'), 'mana');
    assert.equal(await page.locator('#track-tab-mana').getAttribute('aria-selected'), 'true', 'Track opens on Mana');
    assert.equal(await page.locator('#track-tabs').isVisible(), true, 'with its tabs');
    await button(page, 'Cancel').tap();
    assert.equal((await saved(page)).trackTab, 'mana', 'Mana becomes the remembered tab');
    await page.locator('.player:nth-child(2) .pass-chip').tap();
    assert.equal(await page.locator('#track-tab-counters').getAttribute('aria-selected'), 'true', '"Pass it on" opens Track on Counters');
    await button(page, 'Cancel').tap();
    await page.locator('#track-button').tap();
    assert.equal(await page.locator('#board').getAttribute('data-mode'), 'counters', 'and Track reopens there');
  });

  // Undo, ✓ and ✕ cover the whole visit across tabs (PILL-SPEC.md §3.2): Undo goes back newest first, switching to the
  // tab each step was taken on, and stops at the visit's start; ✕ names what goes back and takes it all back; and ✓
  // saves it all, as steps the centre's Undo takes back at rest. The same edits from the three buttons make the same
  // history.
  test(`${name}: Undo, save and ✕ cover a Track visit across its tabs`, async (t) => {
    const page = await openPage(t, engine, { clock: true, viewport: { width: 568, height: 320 }, orientation: 90, game: busyGame(2, { pools: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]] }) });
    const mode = () => page.locator('#board').getAttribute('data-mode');
    const damageCell = page.locator('.player:nth-child(2) .map-cell[data-attacker]').first();
    const poisonCell = () => page.locator('.player:nth-child(1) .counter-cell[data-kind="poison"]');
    const manaCell = () => page.locator('.player:nth-child(2) .mana-cell').first();
    const state = () => page.evaluate(async () => {
      const { game } = await import('/js/state/state.js');
      return { damage: game.commanderDamage[1][0], life: game.scores[1], poison: game.poison[0], mana: game.pools[1][0] };
    });
    const visit = async () => {
      await page.locator('#track-button').tap();
      if (await mode() !== 'damage') await page.locator('#track-tab-damage').tap();
      await damageCell.tap();
      await page.clock.runFor(mergeWindow + 1);
      await page.locator('#track-tab-counters').tap();
      await poisonCell().tap();
      await page.clock.runFor(mergeWindow + 1);
      await page.locator('#track-tab-mana').tap();
      await manaCell().tap();
      await page.clock.runFor(mergeWindow + 1);
    };
    const before = await state();
    await visit();
    assert.deepEqual(await state(), { damage: 1, life: 39, poison: 1, mana: 1 }, 'one step on each tab');
    const undo = page.locator('#undo-button');
    await undo.tap();
    assert.equal(await mode(), 'mana', 'the newest step was on this tab');
    assert.deepEqual(await state(), { damage: 1, life: 39, poison: 1, mana: 0 });
    await undo.tap();
    assert.equal(await mode(), 'counters', 'Undo switches to the tab its step was taken on');
    assert.equal(await page.locator('#track-tab-counters').getAttribute('aria-selected'), 'true');
    assert.deepEqual(await state(), { damage: 1, life: 39, poison: 0, mana: 0 });
    await undo.tap();
    assert.equal(await mode(), 'damage');
    assert.deepEqual(await state(), before);
    assert.ok(await undo.isDisabled(), 'Undo stops at the visit\'s start');
    await button(page, 'Cancel').tap();

    // ✕ across tabs.
    await visit();
    await button(page, 'Cancel').tap();
    assert.equal(await page.locator('#discard-title').textContent(), 'Discard 3 changes?');
    assert.equal(await page.locator('#discard-message').textContent(), 'Commander damage, life, counters and mana pools go back to how they were when you opened Track.');
    await button(page, 'Discard').tap();
    assert.deepEqual(await state(), before, 'the whole visit goes back');

    // ✓ across tabs, then the centre's Undo at rest.
    await visit();
    await button(page, 'Save').tap();
    assert.deepEqual(await state(), { damage: 1, life: 39, poison: 1, mana: 1 });
    const steps = (await saved(page)).history.steps.slice(-3).map(step => Object.keys(step.d).sort().join());
    assert.deepEqual(steps, ['commanderDamage,scores', 'poison', 'pools'], 'three steps, one per tab');
    await undo.tap();
    assert.deepEqual(await state(), { damage: 1, life: 39, poison: 1, mana: 0 }, 'Undo at rest takes back the newest');

    // The same edits from the three buttons, where the pill has room, make the same steps.
    const wide = await openPage(t, engine, { clock: true, game: busyGame(2, { pools: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]] }) });
    assert.equal((await readPill(wide)).collapsed, false);
    for (const [open, cell] of [['damage', '.player:nth-child(2) .map-cell[data-attacker]'], ['counters', '.player:nth-child(1) .counter-cell[data-kind="poison"]'], ['mana', '.player:nth-child(2) .mana-cell']]) {
      await openFromPill(wide, open);
      await wide.locator(cell).first().tap();
      await button(wide, 'Save').tap();
    }
    assert.deepEqual((await saved(wide)).history.steps.slice(-3).map(step => Object.keys(step.d).sort().join()), steps, 'the same history either way');
  });

  // The tabs in both styles: the open tab in the chosen tint (Accent L3), never solid lime, every tab a 44px target, and
  // a 2px rule before Undo.
  test(`${name}: Track's open tab takes the chosen tint in both styles, never solid lime`, async (t) => {
    for (const style of ['material', 'glass']) {
      const page = await openPage(t, engine, { viewport: { width: 568, height: 320 }, orientation: 90, game: busyGame(2, { style }) });
      await page.locator('#track-button').tap();
      const read = () => page.locator('#track-tabs').evaluate(list => [...list.querySelectorAll('[role="tab"]')].map((tab) => {
        const disc = getComputedStyle(tab, '::before');
        return { selected: tab.getAttribute('aria-selected'), fill: disc.backgroundColor, ink: getComputedStyle(tab).color, size: [tab.offsetWidth, tab.offsetHeight] };
      }));
      const [chosen, ink, commit, rule] = [await token(page, '--chosen-fill'), await token(page, '--chosen-ink'), await token(page, '--commit-fill'),
        await page.locator('#undo-button').evaluate(node => getComputedStyle(node, '::after').width)];
      const tabs = await read();
      const open = tabs.find(tab => tab.selected === 'true');
      assert.deepEqual({ fill: open.fill, ink: open.ink }, { fill: chosen, ink }, `${style}: the open tab is in the chosen tint`);
      assert.notEqual(open.fill, commit, `${style}: never solid lime`);
      assert.ok(tabs.filter(tab => tab.selected === 'false').every(tab => tab.fill !== chosen), `${style}: only the open tab`);
      assert.ok(tabs.every(tab => tab.size.every(side => side >= 44)), `${style}: every tab is a 44px target`);
      assert.equal(rule, '2px', `${style}: a 2px rule sets the tabs off from Undo`);
      await page.close();
    }
  });
}
