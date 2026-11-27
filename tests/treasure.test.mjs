import assert from 'node:assert/strict';
import {
  button, engines, eventually, hold, openPage, saved, savedGame, seedGame, setSwitches, stripProblems, test, tileProblems,
} from './helpers.mjs';

// Treasure and Keep (design/polish/MANA-SPEC-v2.md, as built): Treasure's cell in mana mode and its place on the mana
// strip at rest, Keep's cell and what it does to the turn pass, their undo steps and words, Track's mana tab, New game and
// old saves.

// Timers in web/js/logic/data.js. Tests pause the page's clock, so each happens only when the test runs it.
const holdDelay = 500;
const stripHoldTime = 800;
const mergeWindow = 1500;

const tile = (page, number) => page.locator(`.player:nth-child(${number})`);
const mode = page => page.locator('#board').getAttribute('data-mode');
const chip = (page, number) => tile(page, number).locator('.mana-strip > .strip-token');
const treasureCell = (page, number) => tile(page, number).locator('.treasure-cell');
const keepCell = (page, number) => tile(page, number).locator('.keep-cell');
const history = async page => (await saved(page)).history;
// The game as the page holds it now, for a seeded save it hasn't written yet.
const live = page => page.evaluate(async () => (await import('/js/state/state.js')).game);
const announced = async (page) => {
  await page.clock.runFor(700);
  return page.locator('#announcer').textContent();
};
// Each tile's near row as it reads: each chip's kind.
const nearRow = (page, number) => tile(page, number).locator('.badges.near > *').evaluateAll(chips => chips.filter(node => node.checkVisibility())
  .map(node => node.dataset.kind ?? node.dataset.designation ?? node.className.split(' ').at(-1)));
// Each tile's strip as it reads, with Keep's lock as 'lock' and Treasure as 'treasure' and its count.
const strips = page => page.locator('.mana-strip').evaluateAll(rows => rows.map(row => (row.hidden ? '' : [...row.children]
  .filter(item => !item.matches('.chip') && item.checkVisibility())
  .map(item => (item.matches('.keep-lock') ? 'lock' : item.matches('.strip-clear') ? 'clear' : item.matches('.strip-token') ? `treasure${item.textContent}`
    : `${item.dataset.colour}${item.textContent}`)).join(' '))));

// A 4-player game with Mana and Treasure on, poison and rad, the monarch on Player 1, and Turn by turn on Player 1.
function treasureGame(extra = {}) {
  return savedGame(4, {
    manaPool: true, counters: { poison: true, rad: true, monarch: true }, poison: [1, 0, 0, 0], rad: [2, 0, 0, 0], monarch: 0,
    turns: 'turns', turn: { first: 0, active: 0, round: 1 }, colors: [0, 1, 2, 3], tileColours: 'classic', ...extra,
  });
}

for (const [name, engine] of Object.entries(engines)) {
  // Mana mode's fourth column: Treasure's cell, tap +1 and hold −1, beside the colours and above Keep; at rest, an item on
  // the mana strip, not the near row, whose tap uses one, dimmed at 0 while it's being tapped, then gone.
  test(`${name}: Treasure counts up in mana mode, and on the strip at rest uses one a tap`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: treasureGame() });
    assert.equal(await chip(page, 1).count(), 0, 'no Treasure with none');
    assert.deepEqual(await strips(page), ['', '', '', ''], 'and no strip');
    await page.locator('#mana-button').tap();
    const cells = await tile(page, 1).locator('.mana-cells').evaluate(grid => [...grid.querySelectorAll('.counter-cell')].map((cell) => {
      const style = getComputedStyle(cell);
      return `${cell.dataset.colour ?? cell.className.split(' ')[1]} ${style.gridRowStart}/${style.gridColumnStart}`;
    }));
    assert.deepEqual(cells, ['W 1/1', 'U 1/2', 'B 1/3', 'R 2/1', 'G 2/2', 'C 2/3', 'treasure-cell 1/4', 'keep-cell 2/4'],
      'W U B over R G C, and Treasure over Keep in a fourth column');
    assert.equal(await treasureCell(page, 1).getAttribute('aria-label'), 'Treasure, Player 1, 0. Add one');
    assert.equal(await treasureCell(page, 1).locator('.mana-icon').getAttribute('data-glyph'), 'treasure');
    assert.equal(await treasureCell(page, 1).locator('.mana-icon').evaluate(icon => getComputedStyle(icon, '::before').content), '"\ue934"', 'the gold counter, U+E934');
    for (let tap = 0; tap < 4; tap++) await treasureCell(page, 1).tap();
    await hold(page, treasureCell(page, 1), holdDelay + 60);
    assert.equal(await treasureCell(page, 1).locator('b').textContent(), '3', 'four taps and a hold');
    await page.getByRole('button', { name: 'Remove one Treasure from Player 1', exact: true }).evaluate(remove => remove.click());
    assert.equal((await saved(page)).treasure[0], 2, 'the hidden button takes one too, saved at once');
    assert.deepEqual((await history(page)).steps.map(step => step.d), [{ treasure: { 0: [0, 2] } }], 'quick taps on the cell merge into one step');
    await treasureCell(page, 1).tap();
    await button(page, 'Save').tap();

    assert.deepEqual(await nearRow(page, 1), ['active-chip', 'flag-chip', 'poison', 'rad', 'monarch'], 'not in the near row');
    assert.deepEqual(await strips(page), ['treasure3', '', '', ''], 'a strip with only Treasure: no eraser');
    assert.equal(await chip(page, 1).getAttribute('aria-label'), 'Treasure, Player 1, 3. Use one');
    assert.equal(await chip(page, 1).locator('.mana-icon').getAttribute('data-glyph'), 'treasure', 'the gold counter');
    assert.deepEqual(await stripProblems(page), [], 'a whole 44px target inside its tile, clear of the total and rows');

    await chip(page, 1).tap();
    await chip(page, 1).tap();
    assert.equal(await chip(page, 1).textContent(), '1');
    assert.equal((await saved(page)).treasure[0], 1, 'each use saves at once');
    assert.equal(await announced(page), 'Player 1, Sage, Treasure 3 → 1', 'the burst is announced');
    await chip(page, 1).tap();
    assert.equal(await chip(page, 1).getAttribute('aria-disabled'), 'true', 'at 0 the chip stays, dimmed, while it\'s being tapped');
    await chip(page, 1).tap({ force: true });
    assert.equal((await saved(page)).treasure[0], 0, 'a tap at 0 does nothing');
    await page.clock.runFor(stripHoldTime);
    assert.equal(await chip(page, 1).count(), 0, 'then it goes');
    assert.deepEqual(await strips(page), ['', '', '', ''], 'and with no mana, the strip with it');
    assert.deepEqual((await history(page)).steps.at(-1).d, { treasure: { 0: [3, 0] } }, 'quick uses merge into one step');
    assert.equal(await page.locator('#mana-button').evaluate(node => node.hasAttribute('data-floating')), false, 'Treasure doesn\'t light the mana dot');

    // Turning Mana and Treasure off hides the chip and keeps the count.
    await page.clock.runFor(mergeWindow);
    await page.locator('#undo-button').tap();
    assert.equal(await chip(page, 1).textContent(), '3', 'Undo puts the three back');
    await setSwitches(page, { 'Mana and Treasure': false });
    assert.equal(await chip(page, 1).count(), 0);
    await setSwitches(page, { 'Mana and Treasure': true });
    assert.equal(await chip(page, 1).textContent(), '3');
  });

  // The eraser and the turn pass empty the colours and leave Treasure (the owner's rule, alpha.20): the strip keeps the
  // Treasure item, apart from the colours, and Keep's lock leads it while Keep is on.
  test(`${name}: the eraser and the turn pass leave Treasure on the strip`, async (t) => {
    const pools = [[0, 0, 0, 2, 0, 0], [0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];
    const page = await openPage(t, engine, { clock: true, game: treasureGame({ pools, treasure: [3, 2, 0, 1], keepMana: [false, false, false, true], monarch: null }) });
    assert.deepEqual(await strips(page), ['R2 treasure3 clear', 'U1 treasure2 clear', '', 'lock treasure1'], 'after the colours, before the eraser; alone with Keep\'s lock');
    // A hairline and a gap set Treasure apart from the colours, and there's none where it's alone.
    const rules = await page.locator('.mana-strip > .strip-token').evaluateAll(items => items.map(item => getComputedStyle(item, '::before').content !== 'none'));
    assert.deepEqual(rules, [true, true, false]);
    const eraser = tile(page, 1).locator('.strip-clear');
    assert.equal(await eraser.getAttribute('aria-label'), 'Empty floating mana, Player 1', 'the eraser says it empties the colours');
    await eraser.tap();
    assert.deepEqual((await saved(page)).pools[0], [0, 0, 0, 0, 0, 0]);
    assert.equal((await saved(page)).treasure[0], 3, 'the eraser leaves Treasure');
    assert.deepEqual((await history(page)).steps.at(-1).d, { pools: { 0: { 3: [2, 0] } } }, 'its step holds only the colours');
    await page.clock.runFor(stripHoldTime);
    assert.deepEqual((await strips(page))[0], 'treasure3', 'the strip keeps Treasure, and the eraser goes with the colours');
    await page.locator('#undo-button').tap();
    assert.deepEqual((await strips(page))[0], 'R2 treasure3 clear', 'Undo puts the colours back');
    // The turn pass empties the colours, never Treasure (once Undo's toast has left the near edge).
    await page.clock.runFor(4000);
    await tile(page, 1).locator('.turn-chip').tap();
    await page.clock.runFor(stripHoldTime);
    assert.deepEqual(await strips(page), ['treasure3', 'treasure2', '', 'lock treasure1']);
    assert.deepEqual((await saved(page)).treasure, [3, 2, 0, 1]);
    // While Treasure is being tapped, the life halves under the strip ignore a touch, as for a spend.
    await chip(page, 4).tap();
    await tile(page, 4).locator('.controls .add').tap({ force: true });
    assert.equal((await saved(page)).scores[3], 40, 'a tap meant for Treasure doesn\'t add life');
    assert.deepEqual((await strips(page))[3], 'lock treasure0');
  });

  // Where the strip folds, its chip sums the pool and Treasure, and opens mana mode as before.
  test(`${name}: a folded strip's chip shows Treasure with the pool, and opens mana`, async (t) => {
    const six = [2, 1, 3, 4, 5, 6];
    const page = await openPage(t, engine, {
      clock: true, viewport: { width: 568, height: 320 },
      game: savedGame(6, { manaPool: true, pools: Array(6).fill(six), treasure: [3, 0, 0, 0, 0, 0], counters: { commander: true, poison: true }, poison: Array(6).fill(9) }),
    });
    const folded = tile(page, 1).locator('.strip-chip').filter({ visible: true });
    assert.equal(await folded.count(), 1, 'the strip folds');
    assert.deepEqual(await folded.locator('.summary-item').allTextContents(), ['21', '3'], 'the pool\'s total, then Treasure\'s count');
    assert.equal(await folded.locator('.summary-token .mana-icon').getAttribute('data-glyph'), 'treasure');
    assert.match(await folded.getAttribute('aria-label'), /^21 mana and 3 Treasure\. Player 1's pool: .+\. Open mana$/);
    assert.deepEqual(await tileProblems(page, { targets: '.strip-chip' }), [], 'a whole target inside its tile');
    await folded.tap();
    assert.equal(await mode(page), 'mana');
  });

  // Undo and Redo of Treasure (MANA-SPEC-v2 §5): the toast names it, History has its row, and a mode's taps and a chip's
  // uses don't merge, since opening and closing a mode closes every burst.
  test(`${name}: Treasure's undo toast and History say "Treasure 3 → 2", and Redo puts it back`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: treasureGame({ treasure: [0, 0, 3, 0] }) });
    await chip(page, 3).tap();
    assert.equal(await page.locator('#undo-button').getAttribute('aria-label'), 'Undo: Player 3, Coral, Treasure 3 → 2');
    await page.locator('#undo-button').tap();
    assert.equal(await chip(page, 3).textContent(), '3');
    assert.equal(await tile(page, 3).locator('.toast-chip').textContent(), 'Undid Treasure 3 → 2Redo', 'the toast on that tile');
    await tile(page, 3).locator('.toast-redo').tap();
    assert.equal(await chip(page, 3).textContent(), '2', 'Redo uses it again');
    await page.clock.runFor(mergeWindow);
    await page.locator('#mana-button').tap();
    await treasureCell(page, 3).tap();
    await button(page, 'Save').tap();
    await chip(page, 3).tap();
    assert.deepEqual((await history(page)).steps.map(step => step.d), [{ treasure: { 2: [3, 2] } }, { treasure: { 2: [2, 3] } }, { treasure: { 2: [3, 2] } }],
      'a mode\'s tap and a use straight after it are steps of their own');
    await hold(page, page.locator('#undo-button'), holdDelay);
    const rows = await page.locator('#history-list .history-row').evaluateAll(items => items.slice(0, 2).map(row => `${row.querySelector('.history-who').textContent}: ${row.querySelector('.history-what').textContent}`));
    assert.deepEqual(rows, ['Player 3 · Coral: Treasure 3 → 2', 'Player 3 · Coral: Treasure 2 → 3']);
  });

  // Keep (MANA-SPEC-v2 §4): a toggle cell in the designation cells' language, shown only while pools can empty. A kept
  // pool survives the turn passing, with its lock at rest; Undo and the turn chip's hold put back only what was emptied.
  test(`${name}: a kept pool survives the turn passing, and Undo puts back only the pools it emptied`, async (t) => {
    const pools = [[0, 0, 0, 2, 0, 0], [0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0]];
    const page = await openPage(t, engine, { clock: true, game: treasureGame({ pools, treasure: [0, 2, 0, 0], monarch: null }) });
    await page.locator('#mana-button').tap();
    assert.equal(await keepCell(page, 2).getAttribute('aria-pressed'), 'false');
    assert.equal(await keepCell(page, 2).getAttribute('aria-label'), 'Keep mana, Player 2');
    assert.equal(await keepCell(page, 2).textContent(), 'Keep');
    // The cell's fill against its seat colour, read through a probe that draws in --seat, and whether it has any fill.
    const look = () => keepCell(page, 2).evaluate((cell) => {
      const probe = document.createElement('i');
      probe.style.color = 'var(--seat)';
      cell.append(probe);
      const seat = getComputedStyle(probe).color;
      probe.remove();
      const fill = getComputedStyle(cell).backgroundColor;
      return { seat: fill === seat, clear: fill === 'transparent' || /,\s*0\)$/.test(fill), check: getComputedStyle(cell.querySelector('.toggle-check')).display };
    });
    assert.deepEqual(await look(), { seat: false, clear: true, check: 'none' }, 'off: an outline, no fill and no check');
    // Treasure taps, Keep, then Treasure again: Keep is a step of its own and breaks the burst.
    await treasureCell(page, 2).tap();
    await keepCell(page, 2).tap();
    await treasureCell(page, 2).tap();
    assert.deepEqual((await history(page)).steps.map(step => step.d), [{ treasure: { 1: [2, 3] } }, { keepMana: { 1: [false, true] } }, { treasure: { 1: [3, 4] } }]);
    assert.equal(await keepCell(page, 2).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await look(), { seat: true, clear: false, check: 'grid' }, 'on: the seat colour fills it, with a check');
    assert.equal(await announced(page), 'Player 2, Sky, Treasure 3 → 4. Player 2, keep mana on');
    await button(page, 'Save').tap();
    assert.deepEqual(await strips(page), ['R2 clear', 'lock U1 treasure4 clear', '', 'G1 clear'], 'a kept pool\'s mana is led by a lock');

    await tile(page, 1).locator('.turn-chip').tap();
    assert.deepEqual(await strips(page), ['', 'lock U1 treasure4 clear', '', ''], 'the pass empties every pool but the kept one');
    const pass = (await history(page)).steps.at(-1);
    assert.deepEqual(Object.keys(pass.d.pools).map(Number), [0, 3], 'the step holds only the pools it emptied');
    assert.equal((await saved(page)).treasure[1], 4, 'Treasure is never emptied');
    assert.match(await announced(page), /Player 2, Sky's turn, round 1\. Player 2's mana kept/);
    // Undo of the pass puts back only the pools it emptied, so Player 2's kept pool isn't added to.
    await page.locator('#undo-button').tap();
    assert.deepEqual((await saved(page)).pools, pools, 'Undo puts back exactly what the pass emptied');
    // The toast takes a short tile's near edge for its 4 seconds.
    await page.clock.runFor(4000);
    await tile(page, 1).locator('.turn-chip').tap();
    await hold(page, page.locator('#round-button'), holdDelay);
    assert.deepEqual((await saved(page)).pools, pools, 'and so does the turn chip\'s hold');

    // Keep shows only while pools can empty: with auto-empty off there's no cell and no lock, and the value stays.
    await button(page, 'Settings').tap();
    await page.locator('#auto-empty-row').tap();
    await button(page, 'Close settings').tap();
    assert.deepEqual(await strips(page), ['R2 clear', 'U1 treasure4 clear', '', 'G1 clear'], 'no lock while nothing empties');
    await page.locator('#mana-button').tap();
    assert.equal(await page.locator('.keep-cell').count(), 0, 'no Keep cell with auto-empty off');
    assert.equal(await treasureCell(page, 2).isVisible(), true, 'Treasure stays');
    await button(page, 'Cancel').tap();
    await button(page, 'Settings').tap();
    await page.locator('#turn-choices').getByRole('button', { name: 'Off', exact: true }).tap();
    await page.locator('#auto-empty-row').evaluate(row => row.hidden);
    await button(page, 'Close settings').tap();
    await page.locator('#mana-button').tap();
    assert.equal(await page.locator('.keep-cell').count(), 0, 'and none with Turns off');
    await button(page, 'Cancel').tap();
    assert.equal((await saved(page)).keepMana[1], true, 'the saved value stays');
  });

  // Track's mana tab (MANA-SPEC-v2 §2.4, §5.3): Undo of a Treasure or Keep step opens the mana tab, and ✕ names Treasure.
  test(`${name}: Undo of a Treasure or Keep step in Track opens the mana tab, and ✕ names Treasure`, async (t) => {
    const page = await openPage(t, engine, {
      clock: true, viewport: { width: 568, height: 320 }, orientation: 90,
      game: treasureGame({ scores: [40, 40], rotations: [0, 0], colors: [0, 1], poison: [0, 0], rad: [0, 0], monarch: null, turn: { first: 0, active: 0, round: 1 }, trackTab: 'mana' }),
    });
    await page.locator('#track-button').tap();
    assert.equal(await mode(page), 'mana');
    assert.deepEqual(await tileProblems(page, { targets: '.mana-cells .counter-cell' }), [], 'every cell is a whole 44px target on the turned faces');
    await treasureCell(page, 1).tap();
    await keepCell(page, 2).tap();
    await page.locator('#track-tab-counters').tap();
    await tile(page, 1).locator('.counter-cell[data-kind="poison"]').tap();
    await page.locator('#undo-button').tap();
    assert.equal(await mode(page), 'counters', 'the poison step was on this tab');
    await page.locator('#undo-button').tap();
    assert.equal(await mode(page), 'mana', 'Undo of Keep opens the mana tab');
    assert.equal(await keepCell(page, 2).getAttribute('aria-pressed'), 'false');
    await page.locator('#track-tab-counters').tap();
    await page.locator('#undo-button').tap();
    assert.equal(await mode(page), 'mana', 'and so does Undo of Treasure');
    assert.equal((await saved(page)).treasure[0], 0);
    await treasureCell(page, 2).tap();
    await button(page, 'Cancel').tap();
    assert.equal(await page.locator('#discard-message').textContent(), 'Mana pools and Treasure go back to how they were when you opened Track.');
    await button(page, 'Discard').tap();
    await eventually(() => mode(page), null);
  });

  // New game resets Treasure and Keep; an old save loads with neither; the counts are checked as a game loads.
  test(`${name}: a new game resets Treasure and Keep, and saves from before them load unchanged`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: treasureGame({ treasure: [2, 0, 5, 0], keepMana: [true, false, false, true] }) });
    await button(page, 'Settings').tap();
    await button(page, 'New game').tap();
    assert.ok((await page.locator('#restart-resets li').allTextContents()).includes('Floating mana and Treasure'));
    await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
    await eventually(() => mode(page), 'first');
    await button(page, 'Skip').tap();
    const fresh = await saved(page);
    assert.deepEqual([fresh.treasure, fresh.keepMana], [[0, 0, 0, 0], [false, false, false, false]]);
    await page.locator('#undo-button').tap();
    assert.deepEqual((await saved(page)).treasure, [2, 0, 5, 0], 'undoing the new game brings them back');
    assert.deepEqual((await saved(page)).keepMana, [true, false, false, true]);

    // A save from before Treasure: no chips, nobody's pool kept, and its history still works.
    const old = savedGame(4, { manaPool: true, pools: [[1, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]], turns: 'rounds',
      history: { v: 1, at: 1, base: 1, steps: [{ t: 0, d: { pools: { 0: { 0: [0, 1] } } } }] } });
    await seedGame(page, old);
    assert.equal(await page.locator('.strip-token').count(), 0);
    const loaded = await live(page);
    assert.deepEqual([loaded.treasure, loaded.keepMana, loaded.history.steps.length], [[0, 0, 0, 0], [false, false, false, false], 1]);
    await seedGame(page, { ...old, treasure: [3, -1, 100, 'x'], keepMana: [1, true, 'true', null] });
    assert.deepEqual(await page.locator('.strip-token').allTextContents(), ['3']);
    assert.deepEqual((await live(page)).keepMana, [false, true, false, false], 'only true keeps a pool');
  });
}
