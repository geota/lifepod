import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright-core';
import { backHandling, button, engines, eventually, hold, openPage, reload, saved, savedGame, seedGame, test } from './helpers.mjs';

// Turns (design/polish/SPEC.md §8): Off, Rounds or Turn by turn in Setup → Track, "Who goes first?", the play order,
// the turn chip and the pill's round button.

const playOrders = { 2: [1, 2], 3: [1, 3, 2], 4: [1, 2, 4, 3], 5: [1, 2, 5, 4, 3], 6: [1, 2, 5, 6, 4, 3] };

// Timers in web/app.js. A turn chip or the pill's round button steps back once a press has lasted holdDelay. The shuffle
// lights a tile every shuffleTick, landing on its pick on the ninth (shuffleTicks), and the board comes back firstBeat
// after a pick. With the page's clock paused, these happen only when a test runs the clock past them.
const holdDelay = 500;
const shuffleTick = 90;
const shuffleTicks = 9;
const firstBeat = 700;
const shuffle = shuffleTick * (shuffleTicks - 1);

// Every random draw returns this value, and each draw is counted, so the pick is known.
const fixedRandom = value => page => page.addInitScript((value) => {
  window.randomDraws = 0;
  crypto.getRandomValues = (array) => {
    window.randomDraws += 1;
    array.fill(value);
    return array;
  };
}, value);

const mode = page => page.locator('#board').getAttribute('data-mode');
const tile = (page, number) => page.locator(`.player:nth-child(${number})`);
// The active tile's player number, or null.
const active = page => page.evaluate(() => {
  const index = [...document.querySelectorAll('.player')].findIndex(player => player.hasAttribute('data-active'));
  return index === -1 ? null : index + 1;
});
const pillRound = page => page.locator('#round-button .round').evaluate(round => [...round.children].map(number => number.textContent));
// What each tile's turn chips say, in order: 'flag 3' (Rounds), 'turn 3' (the active player, "Turn 3"), 'start' (nobody's
// turn yet: a "Start" chip with no round, design/polish/FINAL-REVIEW.md #7) and 'went first'.
const chips = page => page.locator('.player').evaluateAll(players => players.map(player => [...player.querySelectorAll('.turn-chip, .flag-chip')]
  .map(chip => (chip.matches('.flag-chip') ? 'went first' : chip.matches('.start-chip') ? (chip.textContent === 'Start' ? 'start' : `start ${chip.textContent}`)
    : `${chip.matches('.round-chip') ? 'flag' : 'turn'} ${chip.textContent.replace('Turn', '')}`))));

async function setTurns(page, label) {
  await button(page, 'Settings').tap();
  await page.locator('#turn-choices').getByRole('button', { name: label, exact: true }).tap();
  await button(page, 'Close settings').tap();
}

// Turn by turn passes clockwise on screen, which is passing to the left, in the spec's order for every player count.
// The round goes up only when play comes back round to the first player.
async function checkPlayOrder(t, engine) {
  for (const count of [2, 3, 4, 5, 6]) {
    const page = await openPage(t, engine, { clock: true, game: savedGame(count, { turns: 'turns', turn: { first: 0, active: 0, round: 1 } }) });
    const seen = [await active(page)];
    const rounds = [(await saved(page)).turn.round];
    for (let pass = 0; pass < count + 1; pass++) {
      await button(page, `Round ${rounds.at(-1)}, Player ${seen.at(-1)}'s turn. Pass the turn`).tap();
      seen.push(await active(page));
      rounds.push((await saved(page)).turn.round);
    }
    assert.deepEqual(seen, [...playOrders[count], ...playOrders[count].slice(0, 2)], `${count} players: the play order`);
    assert.deepEqual(rounds, [...Array(count).fill(1), 2, 2], `${count} players: the round goes up on reaching the first player again`);
    await page.close();
  }
}

// The active tile's chip passes the turn too, and a hold steps back one turn, also across a round. Players who are
// out are skipped, and the round still goes up when play passes a first player who is out.
async function checkTurnByTurn(t, engine) {
  const page = await openPage(t, engine, { clock: true, game: savedGame(4, { turns: 'turns', turn: { first: 1, active: 1, round: 1 } }) });
  assert.deepEqual(await chips(page), [[], ['turn 1', 'went first'], [], []]);
  assert.equal(await active(page), 2);
  assert.deepEqual(await pillRound(page), ['1', '1'], 'the pill shows the round twice');
  const chip = page.locator('.turn-chip.active-chip');
  assert.deepEqual(await chip.evaluate((node) => {
    const hit = getComputedStyle(node, '::after');
    return [parseFloat(hit.width) >= 64, parseFloat(hit.height) >= 44];
  }), [true, true], 'the turn chip has a 64 × 44 hit area');

  // P2 → P4 → P3 → P1 → P2: round 2 starts when play is back with P2.
  for (const expected of [4, 3, 1, 2]) {
    await chip.tap();
    assert.equal(await active(page), expected);
  }
  assert.deepEqual(await chips(page), [[], ['turn 2', 'went first'], [], []]);
  assert.deepEqual(await pillRound(page), ['2', '2']);

  // A hold steps back one turn once it has lasted holdDelay, and back across the first player the round goes down
  // again. A hold never repeats.
  await hold(page, page.locator('.turn-chip.active-chip'), holdDelay);
  assert.deepEqual([await active(page), (await saved(page)).turn.round], [1, 1], 'a hold on the chip steps back one turn, into round 1');
  await hold(page, page.locator('#round-button'), 1500);
  assert.deepEqual([await active(page), (await saved(page)).turn.round], [3, 1], 'a long hold on the pill steps back just one turn');
  await page.locator('#round-button').tap();
  await page.locator('#round-button').tap();
  assert.deepEqual([await active(page), (await saved(page)).turn.round], [2, 2]);

  // P4 is out at 0 life, so P2 passes straight to P3.
  const p4 = tile(page, 4).locator('.subtract');
  for (let tap = 0; tap < 40; tap++) await p4.tap();
  assert.deepEqual((await saved(page)).scores, [40, 40, 40, 0], 'only P4’s life changed: no tap or hold on a turn control reached a life half');
  await chip.tap();
  assert.equal(await active(page), 3, 'a player who is out is skipped');
  // With the first player out too, the round still goes up when play passes their seat.
  const game = await saved(page);
  game.scores[1] = -2;
  await seedGame(page, game);
  await page.locator('#round-button').tap();
  assert.equal(await active(page), 1);
  await page.locator('#round-button').tap();
  assert.deepEqual([await active(page), (await saved(page)).turn.round], [3, 3], 'past the first player’s empty seat, round 3');
  // After a relaunch there's no history, and a hold steps back by the play order, skipping who's out.
  await reload(page);
  await hold(page, page.locator('#round-button'), holdDelay);
  assert.deepEqual([await active(page), (await saved(page)).turn.round], [1, 2], 'back across the first player’s seat');

  // Turn steps save at once.
  await reload(page);
  assert.equal(await active(page), 1);
}

// Rounds: the first player's flag carries the round. Tap for the next round, hold to go back, never below 1.
async function checkRounds(t, engine) {
  const page = await openPage(t, engine, { clock: true, game: savedGame(4, { turns: 'rounds', turn: { first: 1, active: null, round: 1 } }) });
  assert.deepEqual(await chips(page), [[], ['flag 1'], [], []], 'the first player’s flag shows the round');
  assert.equal(await active(page), null, 'no active tile in Rounds');
  const flag = page.locator('.turn-chip.round-chip');
  assert.equal(await flag.getAttribute('aria-label'), 'Round 1. Next round');
  await flag.tap();
  await flag.tap();
  await page.locator('#round-button').tap();
  assert.deepEqual(await chips(page), [[], ['flag 4'], [], []]);
  assert.deepEqual(await pillRound(page), ['4', '4']);
  await hold(page, flag, holdDelay);
  assert.equal((await saved(page)).turn.round, 3, 'a hold goes back one round');
  // With no history after a relaunch, holds still go back, and stop at round 1.
  await reload(page);
  for (let step = 0; step < 3; step++) await hold(page, page.locator('#round-button'), holdDelay);
  assert.equal((await saved(page)).turn.round, 1, 'never below round 1');
  // The hidden button beside the pill steps back for keyboards and screen readers.
  await flag.tap();
  await button(page, 'Back one round').evaluate(back => back.click());
  assert.equal((await saved(page)).turn.round, 1);

  // Off hides everything about turns but keeps the state, and on again resumes without asking.
  await flag.tap();
  await setTurns(page, 'Off');
  assert.deepEqual(await chips(page), [[], [], [], []]);
  assert.ok(await page.locator('#round-button').isHidden(), 'no round button with Turns off');
  await setTurns(page, 'Rounds');
  assert.equal(await mode(page), null, 'a game with a first player doesn’t ask again');
  assert.deepEqual(await chips(page), [[], ['flag 2'], [], []], 'switching back on resumes');
}

// "Who goes first?" opens on a new game while Turns is on and on Off → on, but not on Rounds ↔ Turn by turn. Each
// tile offers Me first; the shuffle picks with crypto.getRandomValues; ✕ skips.
async function checkWhoGoesFirst(t, engine) {
  // Every draw is 2, so the shuffle picks the third player in play order: P4. The shuffle and the beat after a pick
  // are what this checks, so motion stays on.
  const page = await openPage(t, engine, { clock: true, motion: 'no-preference', before: fixedRandom(2) });
  assert.ok(await page.locator('#round-button').isHidden(), 'Turns is off by default');

  // Off → on asks, once settings has closed.
  await button(page, 'Settings').tap();
  await page.locator('#turn-choices').getByRole('button', { name: 'Turn by turn', exact: true }).tap();
  await page.clock.runFor(100);
  assert.equal(await mode(page), null, 'not while settings is open');
  await page.locator('#save-setup').tap();
  await eventually(() => mode(page), 'first', 'Off → Turn by turn asks who goes first');
  assert.equal(await page.locator('.first-go').count(), 4, 'Me first on every tile');
  assert.ok(await button(page, 'Pick at random').isVisible());
  assert.ok(await button(page, 'Skip').isVisible());
  assert.ok(await page.locator('#setup-button').isHidden());

  // Me first: P3 goes first and, turn by turn, takes the first turn.
  await button(page, 'Player 3 goes first').tap();
  assert.equal(await tile(page, 3).locator('.first-go').textContent(), 'Goes first');
  await page.clock.runFor(firstBeat - 1);
  assert.equal(await mode(page), 'first', '"Goes first" shows for a beat');
  await page.clock.runFor(1);
  assert.equal(await mode(page), null, 'the board returns after a beat');
  assert.deepEqual(await chips(page), [[], [], ['turn 1', 'went first'], []]);
  assert.equal(await active(page), 3);

  // Rounds ↔ Turn by turn doesn't ask. Nobody's turn is known after the switch, so every player can start theirs.
  await setTurns(page, 'Rounds');
  assert.equal(await mode(page), null, 'Turn by turn → Rounds doesn’t ask');
  assert.deepEqual(await chips(page), [[], [], ['flag 1'], []]);
  await setTurns(page, 'Turn by turn');
  assert.equal(await mode(page), null, 'Rounds → Turn by turn doesn’t ask');
  assert.deepEqual(await chips(page), [['start'], ['start'], ['start', 'went first'], ['start']]);
  await tile(page, 2).locator('.start-chip').tap();
  assert.equal(await active(page), 2, 'a tile’s chip starts that player’s turn');

  // A new game asks again. The shuffle picks at random from the crypto RNG.
  await button(page, 'Settings').tap();
  await button(page, 'New game').tap();
  await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  await eventually(() => mode(page), 'first', 'a new game asks who goes first');
  assert.deepEqual((await saved(page)).turn, { first: null, active: null, round: 1 }, 'a new game resets the turn');
  const draws = await page.evaluate(() => window.randomDraws);
  await button(page, 'Pick at random').tap();
  await page.clock.runFor(shuffle - 1);
  assert.equal((await saved(page)).turn.first, null, 'the shuffle is still going round the table');
  await page.clock.runFor(1);
  assert.equal((await saved(page)).turn.first, 3, 'the shuffle lands on its ninth light');
  await page.clock.runFor(firstBeat);
  assert.equal(await mode(page), null, 'the shuffle lands and the board returns');
  assert.ok((await page.evaluate(() => window.randomDraws)) > draws, 'the pick uses crypto.getRandomValues');
  assert.deepEqual((await saved(page)).turn, { first: 3, active: 3, round: 1 }, 'the shuffle picked P4');
  assert.equal(await active(page), 4);

  // ✕ skips: no flag, round 1, and no active tile until someone starts their turn.
  await button(page, 'Settings').tap();
  await button(page, 'New game').tap();
  await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  await eventually(() => mode(page), 'first');
  await button(page, 'Skip').tap();
  assert.equal(await mode(page), null);
  assert.equal(await active(page), null);
  assert.deepEqual(await chips(page), [['start'], ['start'], ['start'], ['start']]);
  assert.deepEqual(await pillRound(page), ['1', '1']);
  // The pill can't pass a turn nobody has, so it asks who goes first again.
  await page.locator('#round-button').tap();
  await eventually(() => mode(page), 'first');
  await button(page, 'Skip').tap();
  await tile(page, 1).locator('.start-chip').tap();
  assert.deepEqual((await saved(page)).turn, { first: 0, active: 0, round: 1 }, 'the first player to start goes first');

  // Turning Turns off and on again in a game with a first player doesn't ask; a new game with Turns off doesn't either.
  await setTurns(page, 'Off');
  await setTurns(page, 'Rounds');
  assert.equal(await mode(page), null);
  await setTurns(page, 'Off');
  await button(page, 'Settings').tap();
  await button(page, 'New game').tap();
  await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  await eventually(() => page.evaluate(() => document.querySelectorAll('dialog[open]').length), 0, 'the new game closes settings');
  await page.clock.runFor(firstBeat);
  assert.equal(await mode(page), null, 'no question with Turns off');
  // Off → on now asks, since the new game has no first player. A player-count change from setup asks too.
  await setTurns(page, 'Rounds');
  await eventually(() => mode(page), 'first');
  await button(page, 'Skip').tap();
  await button(page, 'Settings').tap();
  await button(page, '3 players').tap();
  await page.locator('#save-setup').tap();
  await eventually(() => mode(page), 'first', 'a new game from setup asks');
  assert.equal(await page.locator('.first-go').count(), 3);
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: turn by turn follows the play order for 2 to 6 players`, t => checkPlayOrder(t, engine));
  test(`${name}: turn by turn passes, steps back and skips players who are out`, t => checkTurnByTurn(t, engine));
  test(`${name}: rounds step forward and back with the flag and the pill`, t => checkRounds(t, engine));
  test(`${name}: who goes first opens on a new game and on Off to on`, t => checkWhoGoesFirst(t, engine));
}

test('chromium: Track in settings holds Turns and fits the smallest phone', async (t) => {
  const page = await openPage(t, chromium, { viewport: { width: 568, height: 320 } });
  await button(page, 'Settings').tap();
  const pressed = () => page.locator('#turn-choices').evaluate(group => [...group.children].filter(choice => choice.getAttribute('aria-pressed') === 'true')
    .map(choice => choice.textContent));
  assert.deepEqual(await pressed(), ['Off']);
  await page.locator('#turn-choices').getByRole('button', { name: 'Turn by turn', exact: true }).tap();
  assert.deepEqual(await pressed(), ['Turn by turn']);
  assert.equal((await saved(page)).turns, 'turns', 'Turns saves at once');
  // Track is as wide as the page allows: every Turns choice is a 44px target inside the window.
  const choices = await page.locator('#turn-choices button').evaluateAll(buttons => buttons.map((choice) => {
    const box = choice.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && box.height >= 43.5;
  }));
  assert.deepEqual(choices, [true, true, true], 'every Turns choice fits 568 × 320');
});

test('chromium: Android back skips who goes first', async (t) => {
  const page = await openPage(t, chromium, { native: 'android', clock: true, motion: 'no-preference', game: savedGame(4, { turns: 'rounds' }) });
  const back = () => page.evaluate(() => window.closeOpenDialog());
  await button(page, 'Settings').tap();
  await button(page, 'New game').tap();
  await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  await eventually(() => mode(page), 'first');
  // Every change so far: off on load, on for Settings and New game, off as the new game closes them, and on as "Who
  // goes first?" opens.
  const asked = [false, true, false, true];
  await eventually(() => backHandling(page), asked, 'the page handles back');
  assert.equal(await back(), true);
  assert.equal(await mode(page), null, 'back skips');
  assert.deepEqual((await saved(page)).turn, { first: null, active: null, round: 1 }, 'with no first player');
  assert.deepEqual(await backHandling(page), [...asked, false], 'then back goes to the system');
  // Back while the shuffle runs skips too, so nobody is picked.
  await page.locator('#round-button').tap();
  assert.equal((await saved(page)).turn.round, 2, 'Rounds steps without a first player');
  await button(page, 'Settings').tap();
  await button(page, 'New game').tap();
  await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  await eventually(() => backHandling(page), [...asked, false, ...asked.slice(1)], 'the page handles back again');
  await button(page, 'Pick at random').tap();
  assert.equal(await back(), true);
  assert.equal(await mode(page), null);
  // Past when the shuffle would have landed and the board come back.
  await page.clock.runFor(shuffle + firstBeat);
  assert.deepEqual((await saved(page)).turn, { first: null, active: null, round: 1 }, 'a shuffle stopped by back picks nobody');
  assert.deepEqual(await backHandling(page), [...asked, false, ...asked.slice(1), false], 'back goes to the system again');
});

test('chromium: saved turns are checked when a game loads', async (t) => {
  const page = await openPage(t, chromium, { clock: true });
  const load = async (game) => {
    await seedGame(page, game);
    return { chips: await chips(page), pill: await page.locator('#round-button').isVisible(), round: (await pillRound(page))[0] };
  };
  const base = savedGame(4);
  assert.deepEqual(await load(base), { chips: [[], [], [], []], pill: false, round: '1' }, 'an old save loads with Turns off');
  assert.deepEqual(await load({ ...base, turns: 'sometimes', turn: { first: 2, active: 2, round: 3 } }),
    { chips: [[], [], [], []], pill: false, round: '3' }, 'a mode that isn’t one of the three is Off');
  assert.deepEqual(await load({ ...base, turns: 'turns', turn: { first: 2, active: 1.5, round: 4 } }),
    { chips: [['start'], ['start'], ['start', 'went first'], ['start']], pill: true, round: '4' }, 'a bad active seat is nobody');
  assert.deepEqual(await load({ ...base, turns: 'rounds', turn: { first: 4, active: 1, round: 'x' } }),
    { chips: [[], [], [], []], pill: true, round: '1' }, 'a seat off the board is nobody, and a bad round is 1');
  assert.deepEqual(await load({ ...base, turns: 'rounds', turn: { first: 0, round: 1000 } }),
    { chips: [['flag 1'], [], [], []], pill: true, round: '1' }, 'a round past 999 is 1');
  // The first change saves the checked turn.
  await page.locator('#round-button').tap();
  assert.deepEqual((await saved(page)).turn, { first: 0, active: null, round: 2 });
});

// "Back one turn" is hidden beside the pill's round button for keyboards and screen readers, and shows as a ‹ button
// there while it has keyboard focus (design/polish/FINAL-REVIEW.md #12).
async function checkBackFocus(t, engine) {
  const page = await openPage(t, engine, { game: savedGame(4, { turns: 'turns', turn: { first: 0, active: 1, round: 3 } }) });
  const look = () => page.locator('#round-back').evaluate((back) => {
    const box = back.getBoundingClientRect();
    const pill = document.querySelector('#board-controls').getBoundingClientRect();
    const style = getComputedStyle(back);
    return {
      focused: document.activeElement === back,
      shown: style.clipPath === 'none' && Math.min(box.width, box.height) >= 44,
      inPill: box.left >= pill.left - 0.5 && box.right <= pill.right + 0.5 && box.top >= pill.top - 0.5 && box.bottom <= pill.bottom + 0.5,
      outline: style.outlineStyle,
    };
  });
  assert.equal((await look()).shown, false, 'hidden until it has focus');
  // Keyboard focus: Tab from the round button in Chromium; WebKit on macOS doesn't tab to buttons, so it's focused after a
  // key press, which still counts as keyboard focus.
  await page.locator('#round-button').focus();
  if (engine === chromium) await page.keyboard.press('Tab');
  else {
    await page.keyboard.press('Shift');
    await page.locator('#round-back').focus();
  }
  assert.deepEqual(await look(), { focused: true, shown: true, inPill: true, outline: 'solid' }, 'focused, it shows in the pill with a focus ring');
  await page.keyboard.press('Enter');
  assert.deepEqual((await saved(page)).turn, { first: 0, active: 0, round: 3 }, 'Enter steps back one turn');
  await page.locator('#round-back').blur();
  assert.equal((await look()).shown, false, 'without focus it hides again');
}

test('chromium: back one turn shows while it has keyboard focus', t => checkBackFocus(t, chromium));
test('webkit: back one turn shows while it has keyboard focus', t => checkBackFocus(t, webkit));

// A press on a turn chip that someone else's pass removes is over: its hold timer must not step back and undo that
// pass (docs/review/ARCHITECTURE.md B2). The press and the pass are dispatched together, so no timing is involved
// until the hold delay has passed.
async function checkOrphanedChipPress(t, engine) {
  const page = await openPage(t, engine, { clock: true, game: savedGame(4, { turns: 'turns', turn: { first: 0, active: 0, round: 1 } }) });
  assert.equal(await active(page), 1);
  await page.evaluate(() => {
    document.querySelector('.player:nth-child(1) .turn-chip').dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 9, isPrimary: true, bubbles: true }));
    // Another player passes the turn from the pill before P1 lifts their finger.
    document.querySelector('#round-button').click();
  });
  assert.equal(await active(page), 2, 'the pill passed the turn to P2');
  await page.clock.runFor(holdDelay);
  assert.equal(await active(page), 2, 'P1’s removed chip doesn’t step back once its hold delay passes');
  assert.deepEqual((await saved(page)).turn, { first: 0, active: 1, round: 1 });
  // The next pass and step back still work, so the orphaned press left nothing behind.
  await page.locator('#round-button').tap();
  assert.equal(await active(page), 4);
  await hold(page, page.locator('.turn-chip.active-chip'), holdDelay);
  assert.equal(await active(page), 2, 'a hold still steps back one turn');
}

// Rotate seats, Colours and Choose identities close settings and open a board mode at once, so "Who goes first?" waits
// for that mode to end, then opens (docs/review/ARCHITECTURE.md B3).
async function checkAskFirstAfterMode(t, engine) {
  const page = await openPage(t, engine);
  for (const [entry, done] of [['Rotate seats on the board', 'Done rotating seats'], ['Choose tile colours on the board', 'Done choosing colours']]) {
    await button(page, 'Settings').tap();
    await page.locator('#turn-choices').getByRole('button', { name: 'Rounds', exact: true }).tap();
    await button(page, entry).tap();
    await eventually(() => page.evaluate(() => document.querySelectorAll('dialog[open]').length), 0, `${entry} closes settings`);
    assert.notEqual(await mode(page), 'first', `not while ${entry} is open`);
    await button(page, done).tap();
    await eventually(() => mode(page), 'first', `"Who goes first?" opens once ${entry} is done`);
    await button(page, 'Skip').tap();
    assert.equal(await mode(page), null);
    // Off, so the next round asks again.
    await setTurns(page, 'Off');
  }
}

// Passing the turn from the keyboard keeps focus on the turn: on the chip that now has it, or on the flag in Rounds
// (docs/review/ARCHITECTURE.md B5).
async function checkChipFocus(t, engine) {
  const page = await openPage(t, engine, { game: savedGame(4, { turns: 'turns', turn: { first: 0, active: 0, round: 1 } }) });
  const focused = () => page.evaluate(() => {
    const node = document.activeElement;
    const player = node.closest('.player');
    return player ? `P${[...player.parentElement.children].indexOf(player) + 1} ${node.className}` : node.tagName;
  });
  await page.locator('.turn-chip.active-chip').focus();
  await page.keyboard.press('Enter');
  assert.equal(await active(page), 2);
  assert.equal(await focused(), 'P2 chip turn-chip active-chip', 'focus follows the turn to P2’s chip');
  await page.keyboard.press('Enter');
  assert.equal(await active(page), 4);
  assert.equal(await focused(), 'P4 chip turn-chip active-chip');

  // With nobody's turn yet, a Start chip passes focus to the turn it starts.
  await seedGame(page, { ...await saved(page), turn: { first: null, active: null, round: 1 } });
  await tile(page, 3).locator('.start-chip').focus();
  await page.keyboard.press('Enter');
  assert.equal(await active(page), 3);
  assert.equal(await focused(), 'P3 chip turn-chip active-chip', 'focus moves to the turn the Start chip started');

  // Rounds: the flag is rebuilt with the next round and keeps focus.
  await setTurns(page, 'Rounds');
  await page.locator('.turn-chip.round-chip').focus();
  await page.keyboard.press('Enter');
  assert.equal((await saved(page)).turn.round, 2);
  assert.equal(await focused(), 'P3 chip turn-chip round-chip', 'the flag keeps focus');
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: a chip press removed by another player's pass doesn't step back`, t => checkOrphanedChipPress(t, engine));
  test(`${name}: who goes first waits for Rotate seats or Colours to end, then opens`, t => checkAskFirstAfterMode(t, engine));
  test(`${name}: passing the turn from the keyboard keeps focus on the turn`, t => checkChipFocus(t, engine));
}
