import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { chromium, webkit } from 'playwright-core';
import { app, button, seedGame, setSwitches } from './helpers.mjs';

// The monarch (CR 726) and the initiative (CR 727): their Track switches, counters mode's cells, the holder's chip at rest,
// commander damage passing them on, handing them on when the holder leaves the game, the "Pass it on" hint, the turn
// reminders, and Settings → Reminders.

const engines = { chromium, webkit };
const designations = { monarch: true, initiative: true };

function savedGame(count, extra = {}) {
  return {
    startingLife: 40, scores: Array(count).fill(40), rotations: Array(count).fill(0), keepAwake: true, landscapeAngle: 90, ...extra,
  };
}

async function openPage(t, engine, { game, clock = false, viewport = { width: 952, height: 427 } } = {}) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  // Under Playwright's clock, nothing animates: an entrance animation (a turn reminder, "Undo clear") or a press
  // animation runs on real time while the timers wait for the test, so a tap could wait on an element that never
  // settles. Reduced motion turns them off, as it does for players who ask for it.
  const page = await browser.newPage({ isMobile: true, hasTouch: true, viewport, ...(clock ? { reducedMotion: 'reduce' } : {}) });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no script errors'));
  if (clock) await page.clock.install();
  await page.goto(app);
  if (game) await seedGame(page, game);
  return page;
}

async function eventually(read, expected, message, timeout = 3000) {
  const deadline = Date.now() + timeout;
  let value = await read();
  while (!isDeepStrictEqual(value, expected) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
    value = await read();
  }
  assert.deepEqual(value, expected, message);
}

const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('lifepod-game')));
const holders = async (page) => {
  const game = await saved(page);
  return { monarch: game.monarch, initiative: game.initiative };
};
const mode = page => page.locator('#board').getAttribute('data-mode');
const tile = (page, number) => page.locator(`.player:nth-child(${number})`);
const cell = (page, number, kind) => tile(page, number).locator(`.designation-cell[data-designation="${kind}"]`);
// Who each tile's counters mode says holds a designation: the player numbers whose cell is pressed.
const pressed = (page, kind) => page.locator(`.designation-cell[data-designation="${kind}"]`)
  .evaluateAll(cells => cells.map((node, index) => (node.getAttribute('aria-pressed') === 'true' ? index + 1 : null)).filter(Boolean));
// What each tile's near row shows of the designations: 'monarch', 'initiative', or 'pass monarch' for the hint.
const chips = page => page.locator('.player').evaluateAll(players => players.map(player => [...player.querySelectorAll('.badges.near > [data-designation]')]
  .map(chip => `${chip.matches('.pass-chip') ? 'pass ' : ''}${chip.dataset.designation}`)));
// The turn reminders showing on each tile: 'monarch' or 'initiative'.
const reminders = page => page.locator('.player').evaluateAll(players => players.map(player => [...player.querySelectorAll('.reminder-chip')]
  .map(chip => chip.dataset.designation)));
const announced = page => page.locator('#announcer').textContent();
const lose = (page, number) => tile(page, number).locator('.subtract').tap();
const gain = (page, number) => tile(page, number).locator('.add').tap();

// ---- Counters mode ------------------------------------------------------------------------------------------------

async function checkGiveAndClear(t, engine) {
  const page = await openPage(t, engine);
  assert.ok(!(await button(page, 'Counters').isVisible()), 'no counters button with nothing tracked');
  await setSwitches(page, { Monarch: true });
  assert.ok(await button(page, 'Counters').isVisible(), 'Monarch alone shows the counters button');
  assert.deepEqual((await saved(page)).counters.monarch, true, 'the switch is saved');

  await button(page, 'Counters').tap();
  assert.equal(await page.locator('.counter-cell').count(), 4, 'one cell per tile');
  assert.equal(await cell(page, 1, 'monarch').locator('.icon[data-icon="crown"]').count(), 1, 'the crown');
  assert.deepEqual(await pressed(page, 'monarch'), [], 'nobody is the monarch until an effect says so');
  assert.equal(await cell(page, 2, 'monarch').getAttribute('aria-label'), 'Player 2 monarch');

  // A tap gives it to that player; a tap on someone else's cell moves it, so only one player is ever the monarch.
  await cell(page, 2, 'monarch').tap();
  assert.deepEqual(await pressed(page, 'monarch'), [2]);
  await cell(page, 3, 'monarch').tap();
  assert.deepEqual(await pressed(page, 'monarch'), [3], 'giving it to Player 3 takes it from Player 2');
  assert.equal((await saved(page)).monarch, 2, 'saved as it changes');
  // A tap on the holder's own cell clears it.
  await cell(page, 3, 'monarch').tap();
  assert.deepEqual(await pressed(page, 'monarch'), []);
  assert.equal((await saved(page)).monarch, null);

  // Undo steps back through each change.
  await button(page, 'Undo').tap();
  assert.deepEqual(await pressed(page, 'monarch'), [3]);
  await button(page, 'Undo').tap();
  assert.deepEqual(await pressed(page, 'monarch'), [2]);
  await button(page, 'Undo').tap();
  assert.deepEqual(await pressed(page, 'monarch'), []);
  assert.ok(await button(page, 'Undo').isDisabled());

  // ✕ discards the mode's changes, saying the monarch goes back too.
  await cell(page, 4, 'monarch').tap();
  await button(page, 'Cancel').tap();
  assert.equal(await page.locator('#discard-message').textContent(),
    'Every counter goes back to how it was when you opened counters. So does the monarch.');
  await button(page, 'Discard').tap();
  await eventually(() => mode(page), null);
  assert.equal((await saved(page)).monarch, null, 'the discard is saved');

  // With every counter and both designations on, the cells follow the counters, and seven go four to a row.
  await setSwitches(page, { Commander: true, Poison: true, Energy: true, Experience: true, Rad: true, Initiative: true });
  await button(page, 'Counters').tap();
  assert.deepEqual(await tile(page, 1).locator('.counter-cell').evaluateAll(cells => cells.map(node => node.dataset.kind ?? node.dataset.designation)),
    ['poison', 'casts', 'energy', 'experience', 'rad', 'monarch', 'initiative']);
  const rows = await tile(page, 1).locator('.counter-cell').evaluateAll(cells => [...new Set(cells.map(node => Math.round(node.getBoundingClientRect().top)))].length);
  assert.equal(rows, 2, 'seven cells take two rows');
  await cell(page, 1, 'monarch').tap();
  await cell(page, 1, 'initiative').tap();
  await cell(page, 2, 'initiative').tap();
  await button(page, 'Save').tap();
  assert.deepEqual(await holders(page), { monarch: 0, initiative: 1 });
  assert.deepEqual(await chips(page), [['monarch'], ['initiative'], [], []], 'the holder’s near row shows the crown or the castle');
  assert.equal(await tile(page, 2).locator('.designation-chip .icon').getAttribute('data-icon'), 'castle-turret');
  assert.equal(await tile(page, 2).locator('.designation-chip').textContent(), 'Initiative', 'screen readers hear it');

  // Switching one off hides it and keeps the holder; a new game clears both.
  await setSwitches(page, { Monarch: false });
  assert.deepEqual(await chips(page), [[], ['initiative'], [], []]);
  assert.equal((await saved(page)).monarch, 0);
  await setSwitches(page, { Monarch: true });
  await button(page, 'Settings').tap();
  await button(page, 'New game').tap();
  await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  await eventually(() => holders(page), { monarch: null, initiative: null }, 'a new game clears both');
  assert.deepEqual(await chips(page), [[], [], [], []]);
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: counters mode gives and clears the monarch and the initiative, one holder at a time, with Undo`, { timeout: 60000 }, t => checkGiveAndClear(t, engine));
}

// ---- Commander damage ---------------------------------------------------------------------------------------------

async function checkDamageTransfer(t, engine) {
  const page = await openPage(t, engine, {
    game: savedGame(4, { counters: { commander: true, ...designations }, monarch: 1, initiative: 1 }),
  });
  const seat = (defender, attacker) => tile(page, defender).locator(`.map-cell[data-attacker="${attacker - 1}"]`);
  await button(page, 'Commander damage').tap();
  // Player 3's commander hits Player 2, the monarch with the initiative: Player 3 takes both.
  await seat(2, 3).tap();
  assert.deepEqual(await holders(page), { monarch: 2, initiative: 2 }, 'combat damage to the holder passes both to the attacker');
  assert.equal((await saved(page)).scores[1], 39);
  await eventually(async () => (await announced(page)).includes('Player 3 is the monarch. Player 3 has the initiative'), true, 'the change is announced');
  // Undo takes back the damage and the transfer together.
  await button(page, 'Undo').tap();
  assert.deepEqual(await holders(page), { monarch: 1, initiative: 1 }, 'Undo gives them back');
  assert.equal((await saved(page)).scores[1], 40);
  // Damage to someone else, or taking damage away, moves nothing.
  await seat(4, 1).tap();
  assert.deepEqual(await holders(page), { monarch: 1, initiative: 1 });
  await seat(2, 4).tap();
  assert.deepEqual(await holders(page), { monarch: 3, initiative: 3 });
  await page.getByRole('button', { name: 'Remove one commander damage from Player 4\'s commander', exact: true }).first()
    .evaluate(remove => remove.click());
  assert.deepEqual(await holders(page), { monarch: 3, initiative: 3 }, 'taking damage away moves nothing');
  // ✕ discards both, and says so.
  await button(page, 'Cancel').tap();
  assert.equal(await page.locator('#discard-message').textContent(),
    'Commander damage and life go back to how they were when you opened commander damage. So do the monarch and the initiative.');
  await button(page, 'Discard').tap();
  await eventually(() => mode(page), null);
  assert.deepEqual(await holders(page), { monarch: 1, initiative: 1 }, 'discarding gives them back');
  // Saving keeps the transfer.
  await button(page, 'Commander damage').tap();
  await seat(2, 1).tap();
  await button(page, 'Save').tap();
  assert.deepEqual(await holders(page), { monarch: 0, initiative: 0 });
  assert.deepEqual(await chips(page), [['monarch', 'initiative'], [], [], []]);
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: commander damage to the holder passes the monarch and the initiative to the attacker, undone with it`, { timeout: 60000 }, t => checkDamageTransfer(t, engine));
}

// ---- Leaving the game ---------------------------------------------------------------------------------------------

// Six players play P1, P2, P5, P6, P4, P3 (seats 0, 1, 4, 5, 3, 2). Turn by turn with an active player: whoever leaves
// hands on what they hold (CR 726.4, 727.4).
async function checkHandoff(t, engine) {
  const turnByTurn = (extra) => savedGame(6, { counters: { ...designations }, turns: 'turns', ...extra });
  const page = await openPage(t, engine, {
    game: turnByTurn({ scores: [40, 40, 40, 1, 40, 40], turn: { first: 0, active: 1, round: 2 }, monarch: 3, initiative: 3 }),
  });
  // The holder leaves on someone else's turn: the active player takes both.
  await lose(page, 4);
  assert.deepEqual(await holders(page), { monarch: 1, initiative: 1 }, 'the active player takes both');
  assert.deepEqual(await chips(page), [[], ['monarch', 'initiative'], [], [], [], []]);
  await eventually(async () => (await announced(page)).includes('Player 2 is the monarch. Player 2 has the initiative'), true, 'announced');
  // Coming back from 0 doesn't take it back.
  await gain(page, 4);
  assert.deepEqual(await holders(page), { monarch: 1, initiative: 1 });

  // The active player is the one leaving: the next player in turn order who's still in takes it, skipping anyone out.
  await seedGame(page, turnByTurn({ scores: [40, 1, 40, 40, 0, 40], turn: { first: 0, active: 1, round: 2 }, monarch: 1, initiative: 1 }));
  await lose(page, 2);
  assert.deepEqual(await holders(page), { monarch: 5, initiative: 5 }, 'P5 is out, so P6 takes both');

  // The active player has already left: the next player after them who's still in.
  await seedGame(page, turnByTurn({ scores: [1, 0, 40, 40, 40, 40], turn: { first: 0, active: 1, round: 2 }, monarch: 0, initiative: 0 }));
  await lose(page, 1);
  assert.deepEqual(await holders(page), { monarch: 4, initiative: 4 }, 'P2 is active but out, so P5 takes both');

  // Out on poison in counters mode: the handoff is part of that edit, so Undo takes both back.
  await seedGame(page, turnByTurn({
    counters: { poison: true, ...designations }, poison: [0, 0, 0, 0, 9, 0], turn: { first: 0, active: 0, round: 1 }, monarch: 4, initiative: null,
  }));
  await button(page, 'Counters').tap();
  await tile(page, 5).locator('.counter-cell[data-kind="poison"]').tap();
  assert.deepEqual(await holders(page), { monarch: 0, initiative: null }, 'ten poison hands the monarch to the active player');
  await button(page, 'Undo').tap();
  assert.deepEqual(await holders(page), { monarch: 4, initiative: null }, 'Undo takes the poison and the handoff back');
  await button(page, 'Cancel').tap();

  // Giving it to a player who has already left, in counters mode, is a choice: it stays with them, and their tile asks
  // to pass it on. Someone else leaving later doesn't move it either.
  await seedGame(page, turnByTurn({ scores: [40, 1, 0, 40, 40, 40], turn: { first: 0, active: 0, round: 1 }, monarch: null, initiative: null }));
  await button(page, 'Counters').tap();
  await cell(page, 3, 'monarch').tap();
  assert.deepEqual(await holders(page), { monarch: 2, initiative: null }, 'it stays with the out player they chose');
  await button(page, 'Save').tap();
  await lose(page, 2);
  assert.deepEqual(await holders(page), { monarch: 2, initiative: null });
  assert.deepEqual((await chips(page))[2], ['pass monarch']);

  // Nobody else is in: the game goes on with no monarch, and the initiative stays with its holder, with no hint.
  await seedGame(page, savedGame(3, {
    counters: { ...designations }, turns: 'turns', scores: [1, 0, 0], turn: { first: 0, active: 0, round: 4 }, monarch: 0, initiative: 0,
  }));
  await lose(page, 1);
  assert.deepEqual(await holders(page), { monarch: null, initiative: 0 });
  assert.deepEqual(await chips(page), [['initiative'], [], []], 'nobody to pass it to, so no hint');
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: a holder who leaves the game hands on the monarch and the initiative, turn by turn`, { timeout: 60000 }, t => checkHandoff(t, engine));
}

// Without Turn by turn there's no active player to start from: an out holder's tile asks to pass it on until someone takes
// it in counters mode, and the hint has its own switch.
async function checkPassHint(t, engine) {
  const page = await openPage(t, engine, {
    game: savedGame(4, { counters: { ...designations }, scores: [40, 1, 40, 40], monarch: 1, initiative: null }),
  });
  await lose(page, 2);
  assert.deepEqual(await holders(page), { monarch: 1, initiative: null }, 'no turns, so nothing moves by itself');
  assert.deepEqual(await chips(page), [[], ['pass monarch'], [], []], 'the out holder’s tile asks to pass it on');
  const hint = tile(page, 2).locator('.pass-chip');
  assert.equal(await hint.textContent(), 'Pass it on');
  assert.equal(await hint.getAttribute('aria-label'), 'Player 2 is out and is still the monarch. Pass the monarch on in counters');
  const box = await hint.evaluate(node => [node.offsetWidth, node.offsetHeight, getComputedStyle(node, '::after').height]);
  assert.equal(box[2], '44px', 'a 44px target');
  // It stays while nobody takes it, even across a reload and a step of the turn in Rounds.
  await page.reload();
  assert.deepEqual(await chips(page), [[], ['pass monarch'], [], []]);
  // The hint switch hides it, and shows only while the monarch or the initiative is tracked.
  await button(page, 'Settings').tap();
  assert.ok(await page.locator('#pass-hints-row').isVisible());
  assert.ok(await page.locator('#turn-reminders-row').isHidden(), 'turn reminders need Turn by turn');
  await page.locator('#pass-hints-row').tap();
  await button(page, 'Close settings').tap();
  assert.deepEqual(await chips(page), [[], ['monarch'], [], []], 'with the hint off, the plain crown');
  assert.equal((await saved(page)).reminders.passOn, false);
  await setSwitches(page, { 'Pass-it-on hints': true });
  // Tapping the hint opens counters mode, where giving it to someone else ends it.
  await tile(page, 2).locator('.pass-chip').tap();
  assert.equal(await mode(page), 'counters');
  await cell(page, 4, 'monarch').tap();
  await button(page, 'Save').tap();
  assert.deepEqual(await chips(page), [[], [], [], ['monarch']]);
  assert.equal((await saved(page)).monarch, 3);
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: without turns, an out holder’s tile shows a Pass it on hint until someone takes it`, { timeout: 60000 }, t => checkPassHint(t, engine));
}

// ---- Turn reminders -----------------------------------------------------------------------------------------------

// Four players play P1, P2, P4, P3. Playwright's clock runs the 3 seconds.
async function checkReminders(t, engine) {
  const page = await openPage(t, engine, {
    clock: true,
    game: savedGame(4, { counters: { commander: true, ...designations }, turns: 'turns', turn: { first: 0, active: 0, round: 1 }, monarch: 0, initiative: 1 }),
  });
  const turnChip = number => tile(page, number).locator('.active-chip');
  assert.deepEqual(await reminders(page), [[], [], [], []], 'nothing on load');
  // The monarch passes the turn: they draw a card. The initiative's turn starts: they venture.
  await turnChip(1).tap();
  assert.deepEqual(await reminders(page), [['monarch'], ['initiative'], [], []]);
  assert.equal(await tile(page, 1).locator('.reminder-chip').textContent(), 'Monarch: draw a card');
  assert.equal(await tile(page, 2).locator('.reminder-chip').textContent(), 'Initiative: venture into Undercity');
  assert.equal(await tile(page, 2).locator('.reminder-chip').getAttribute('aria-label'), 'Initiative: venture into Undercity. Dismiss');
  // Facing the player: inside their own turned tile face.
  assert.equal(await tile(page, 1).locator('.player-face .reminder-chip').count(), 1);
  await page.clock.runFor(2500);
  assert.deepEqual(await reminders(page), [['monarch'], ['initiative'], [], []], 'still there before 3 seconds');
  // A tap dismisses one.
  await tile(page, 1).locator('.reminder-chip').tap();
  assert.deepEqual(await reminders(page), [[], ['initiative'], [], []]);
  await page.clock.runFor(600);
  assert.deepEqual(await reminders(page), [[], [], [], []], 'gone after 3 seconds');

  // Nobody's reminded on a pass that isn't theirs, or on a step back.
  await turnChip(2).tap();
  assert.deepEqual(await reminders(page), [[], [], [], []], 'Player 2 is neither, and Player 4 has neither');
  await page.locator('#round-back').evaluate(back => back.click());
  assert.deepEqual(await reminders(page), [[], [], [], []], 'stepping back reminds nobody');

  // Taking the initiative mid-turn: they venture once the mode is saved.
  await button(page, 'Commander damage').tap();
  await tile(page, 2).locator('.map-cell[data-attacker="3"]').tap();
  assert.deepEqual(await reminders(page), [[], [], [], []], 'not while the mode is open');
  await button(page, 'Save').tap();
  assert.deepEqual(await reminders(page), [[], [], [], ['initiative']], 'Player 4 took the initiative, so they venture');
  await page.clock.runFor(3100);

  // Turn reminders off: no reminders at all.
  await setSwitches(page, { 'Turn reminders': false });
  assert.equal((await saved(page)).reminders.turns, false);
  await turnChip(2).tap();
  assert.deepEqual(await reminders(page), [[], [], [], []], 'the switch turns them off: Player 4 has the initiative and isn’t reminded');
  await turnChip(4).tap();
  await setSwitches(page, { 'Turn reminders': true });

  // Only in Turn by turn: Rounds reminds nobody, and hides the switch.
  await button(page, 'Settings').tap();
  assert.ok(await page.locator('#turn-reminders-row').isVisible());
  await page.locator('#turn-choices').getByRole('button', { name: 'Rounds', exact: true }).tap();
  assert.ok(await page.locator('#turn-reminders-row').isHidden(), 'Turn reminders shows only in Turn by turn');
  await button(page, 'Close settings').tap();
  await tile(page, 1).locator('.round-chip').tap();
  assert.deepEqual(await reminders(page), [[], [], [], []]);
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: turn reminders tell the monarch to draw and the initiative to venture, at the right moment`, { timeout: 60000 }, t => checkReminders(t, engine));
}

// "Who goes first?" and a Start chip start a turn too, and a new holder by handoff ventures at once.
async function checkStartReminders(t, engine) {
  const page = await openPage(t, engine, {
    clock: true,
    game: savedGame(4, { counters: { ...designations }, turns: 'turns', turn: { first: null, active: null, round: 1 }, initiative: 2, monarch: null }),
  });
  await tile(page, 3).locator('.start-chip').tap();
  assert.deepEqual(await reminders(page), [[], [], ['initiative'], []], 'a Start chip starts their turn');
  await page.clock.runFor(3100);

  await seedGame(page, savedGame(4, { counters: { ...designations }, scores: [40, 40, 1, 40], turns: 'turns', turn: { first: 0, active: 0, round: 1 }, initiative: 2 }));
  await lose(page, 3);
  assert.deepEqual(await holders(page), { monarch: null, initiative: 0 });
  assert.deepEqual(await reminders(page), [['initiative'], [], [], []], 'taking the initiative by handoff ventures');
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: starting a turn or taking the initiative by handoff reminds them to venture`, { timeout: 60000 }, t => checkStartReminders(t, engine));
}

// ---- Settings → Reminders and gesture hints -----------------------------------------------------------------------

async function checkGestureHints(t, engine) {
  const page = await openPage(t, engine, { game: savedGame(4, { counters: { commander: true, poison: true }, manaPool: true }) });
  const hints = () => page.locator('.layer-hint').evaluateAll(nodes => nodes.filter(node => node.checkVisibility()).map(node => node.textContent));
  const visit = async (open, close) => {
    await open();
    const shown = await hints();
    await close();
    return shown;
  };
  const modes = async () => ({
    counters: await visit(() => button(page, 'Counters').tap(), () => button(page, 'Cancel').tap()),
    damage: await visit(() => button(page, 'Commander damage').tap(), () => button(page, 'Cancel').tap()),
    mana: await visit(() => button(page, 'Mana pool').tap(), () => button(page, 'Cancel').tap()),
    identity: await visit(async () => {
      await button(page, 'Settings').tap();
      await button(page, 'Choose identities on the board').tap();
    }, () => button(page, 'Done choosing identities').tap()),
    colours: await visit(async () => {
      await button(page, 'Settings').tap();
      await button(page, 'Choose tile colours on the board').tap();
    }, () => button(page, 'Done choosing colours').tap()),
  });
  const tap = Array(4).fill('Tap +1 · hold −1');
  assert.deepEqual(await modes(), {
    counters: tap, damage: tap, mana: tap, identity: Array(4).fill('Tap your colours'), colours: Array(4).fill('Your tile colour'),
  });
  // The Reminders section always shows Gesture hints; the other two wait for the monarch or the initiative.
  await button(page, 'Settings').tap();
  assert.ok(await page.locator('#gesture-hints-row').isVisible());
  assert.ok(await page.locator('#pass-hints-row').isHidden(), 'Pass-it-on hints waits for the monarch or the initiative');
  assert.ok(await page.locator('#turn-reminders-row').isHidden());
  await button(page, 'Close settings').tap();
  await setSwitches(page, { 'Gesture hints': false });
  assert.equal((await saved(page)).reminders.gestures, false);
  assert.deepEqual(await modes(), { counters: [], damage: [], mana: [], identity: [], colours: Array(4).fill('Your tile colour') },
    'the gesture lines go; the colours label is a label, not a gesture');
  await page.reload();
  await button(page, 'Settings').tap();
  assert.equal(await page.getByRole('switch', { name: 'Gesture hints', exact: true }).isChecked(), false, 'saved');
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: the Gesture hints switch hides the tap and hold lines in every mode`, { timeout: 60000 }, t => checkGestureHints(t, engine));
}

// The Reminders section sits after Table in the left column (layout B), and after Table in one column.
async function checkRemindersSection(t, engine) {
  const page = await openPage(t, engine, { game: savedGame(4, { counters: { monarch: true }, turns: 'turns' }) });
  await button(page, 'Settings').tap();
  const order = () => page.locator('#settings-content .fs-col').evaluateAll(columns => columns.map(column => [...column.children].map(section => section.id.replace('settings-', ''))));
  assert.deepEqual(await order(), [['game', 'table', 'reminders'], ['track', 'identity']]);
  assert.deepEqual(await page.locator('#settings-reminders .switch-row').evaluateAll(rows => rows.filter(row => !row.hidden).map(row => row.textContent.trim())),
    ['Turn reminders', 'Pass-it-on hints', 'Gesture hints']);
  const targets = await page.locator('#settings-reminders .switch-row').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
  assert.ok(targets.every(height => height >= 44), `44px rows (${targets})`);
  await page.setViewportSize({ width: 568, height: 900 });
  await eventually(order, [['game', 'track', 'identity', 'table', 'reminders'], []], 'one column below 620px');
  await page.setViewportSize({ width: 375, height: 667 });
  await eventually(order, [['game', 'track', 'identity', 'table', 'reminders'], []], 'and in portrait');
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: Settings → Reminders shows each switch only when it applies, in layout B`, t => checkRemindersSection(t, engine));
}

// ---- Commander tax's icon -----------------------------------------------------------------------------------------

async function checkTaxIcon(t, engine) {
  const page = await openPage(t, engine, { game: savedGame(4, { counters: { commander: true }, casts: [2, 0, 0, 0] }) });
  assert.equal(await tile(page, 1).locator('.badges.near .chip[data-kind="casts"] .mana-icon').getAttribute('data-glyph'), 'commander');
  assert.equal(await tile(page, 1).locator('.badges.near .chip[data-kind="casts"] [data-icon="crown"]').count(), 0, 'no crown on tax');
  await button(page, 'Counters').tap();
  assert.equal(await tile(page, 1).locator('.counter-cell[data-kind="casts"] .mana-icon').getAttribute('data-glyph'), 'commander');
  // The Mana font has the commander symbol: drawn in Mana, it differs from the fallback font drawing the same character.
  const drawn = await page.evaluate(async () => {
    await document.fonts.load('32px Mana');
    const draw = (font) => {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 48;
      const context = canvas.getContext('2d');
      context.font = font;
      context.fillText('', 4, 40);
      return [...context.getImageData(0, 0, 48, 48).data].join(',');
    };
    const glyph = getComputedStyle(document.querySelector('.counter-cell[data-kind="casts"] .mana-icon'), '::before').content;
    return { glyph, differs: draw('32px Mana, monospace') !== draw('32px monospace'), inked: draw('32px Mana').split(',').some((value, index) => index % 4 === 3 && value !== '0') };
  });
  assert.deepEqual(drawn, { glyph: '""', differs: true, inked: true });
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: commander tax uses the Mana commander symbol, and the font draws it`, t => checkTaxIcon(t, engine));
}

// ---- Saved games --------------------------------------------------------------------------------------------------

async function checkLoad(t, engine) {
  const page = await openPage(t, engine);
  const load = async (extra, count = 4) => {
    await seedGame(page, savedGame(count, extra));
    return page.evaluate(() => {
      const near = [...document.querySelectorAll('.player')].map(player => [...player.querySelectorAll('.badges.near > [data-designation]')]
        .map(chip => chip.dataset.designation));
      return { near, counters: !document.querySelector('#counters-button').hidden };
    });
  };
  const none = [[], [], [], []];
  assert.deepEqual(await load({}), { near: none, counters: false }, 'a save from before them loads with both off and nobody holding either');
  assert.deepEqual(await load({ counters: { monarch: 'yes', initiative: 1 }, monarch: 0, initiative: 0 }), { near: none, counters: false },
    'only a true switch is on');
  for (const bad of [-1, 4, 1.5, '1', true, [1], { seat: 1 }]) {
    assert.deepEqual((await load({ counters: { ...designations }, monarch: bad, initiative: bad })).near, none, `${JSON.stringify(bad)} is nobody`);
  }
  assert.deepEqual((await load({ counters: { ...designations }, monarch: 3, initiative: 0 })).near, [['initiative'], [], [], ['monarch']]);
  // A seat that isn't on a smaller board is nobody.
  assert.deepEqual((await load({ counters: { ...designations }, monarch: 2, initiative: 1 }, 2)).near, [[], ['initiative']]);
  // Reminders are on unless saved as exactly false.
  await seedGame(page, savedGame(4, { reminders: { turns: false, passOn: 'no', gestures: 0 } }));
  await button(page, 'Settings').tap();
  const switches = await page.locator('#settings-reminders [role="switch"]').evaluateAll(inputs => inputs.map(input => input.checked));
  assert.deepEqual(switches, [false, true, true]);
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: saved monarch, initiative and reminders are checked when a game loads`, t => checkLoad(t, engine));
}
