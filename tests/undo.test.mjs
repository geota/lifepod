import assert from 'node:assert/strict';
import {
  button, engines, eventually, faceBoxes, hold, openPage, reload, saved, savedGame, scores, seedGame, test, tileProblems,
} from './helpers.mjs';

// Game-wide Undo and Redo (MANA-UNDO-SPEC §6, UNDO-ARCHITECTURE.md): one step per action, quick taps on one tile and
// count merged into one step while each comes within mergeWindow of the last, the running delta on a total, the pill's
// Undo, the toast's Redo, announcements, and the history saved with the game.

// Timers in web/js/logic/data.js. Tests pause the page's clock, so each happens only when the test runs it.
const mergeWindow = 1500;
const deltaFade = 300;
const toastTime = 4000;
const holdDelay = 500;

const tile = (page, number) => page.locator(`.player:nth-child(${number})`);
const add = (page, number) => tile(page, number).locator('.add');
const subtract = (page, number) => tile(page, number).locator('.subtract');
const undoButton = page => page.locator('#undo-button');
const history = async page => (await saved(page)).history;
// The running delta on a tile's total, as it reads, or null while it's hidden.
const delta = (page, number) => tile(page, number).locator('.life-delta').evaluateAll(nodes => (nodes[0] && !nodes[0].hidden ? nodes[0].textContent : null));
const toast = (page, number) => tile(page, number).locator('.toast-chip').evaluateAll(nodes => nodes.map(node => node.textContent).join(' | ') || null);
const announced = async (page) => {
  await page.clock.runFor(700);
  return page.locator('#announcer').textContent();
};
const toasts = page => page.locator('.player').evaluateAll(players => players.map(player => player.querySelector('.toast-chip')?.textContent ?? null));

for (const [name, engine] of Object.entries(engines)) {
  // Five quick taps on − are one step, shown by a running delta from the second; the window restarts on each tap and
  // closes 1.5s after the last, and the delta fades 300ms after that. A tap 1.6s later is a new step.
  test(`${name}: quick taps on one total merge into one step, with a running delta, and the window restarts on each tap`, async (t) => {
    const page = await openPage(t, engine, { clock: true, motion: 'no-preference', game: savedGame(4) });
    assert.equal(await undoButton(page).getAttribute('aria-label'), 'Undo, nothing to undo', 'Undo is there, dimmed, with nothing to undo');
    assert.equal(await undoButton(page).getAttribute('aria-disabled'), 'true');
    assert.ok(await undoButton(page).isVisible(), 'Undo always shows at rest');

    await subtract(page, 3).tap();
    assert.equal(await delta(page, 3), null, 'one tap says nothing new');
    for (let tap = 0; tap < 4; tap++) {
      // Each tap 1.4s after the last: a fixed window from the first tap would have closed by now.
      await page.clock.runFor(mergeWindow - 100);
      await subtract(page, 3).tap();
    }
    assert.deepEqual((await scores(page))[2], 35);
    assert.equal(await delta(page, 3), '−5', 'the running delta shows the burst so far');
    const merged = await history(page);
    assert.equal(merged.steps.length, 1, 'five taps are one step');
    assert.deepEqual(merged.steps[0].d, { scores: { 2: [40, 35] } });
    assert.equal(merged.steps[0].n, 5);
    assert.equal(await undoButton(page).getAttribute('aria-label'), 'Undo: Player 3, Coral, life 40 → 35');
    assert.equal(await undoButton(page).getAttribute('aria-disabled'), null);

    await page.clock.runFor(mergeWindow);
    assert.equal(await delta(page, 3), '−5', 'the delta fades once the window closes');
    await page.clock.runFor(deltaFade);
    assert.equal(await delta(page, 3), null, `and is gone ${deltaFade}ms later`);

    await page.clock.runFor(100);
    await add(page, 3).tap();
    assert.equal((await history(page)).steps.length, 2, 'a tap after the window is a new step');
  });

  // Up and down merge: the burst is its net change, and a net change of nothing leaves no step.
  test(`${name}: a burst is its net change, and a burst back to where it began leaves no step`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: savedGame(4) });
    for (const button of [subtract, subtract, subtract, add]) await button(page, 2).tap();
    assert.deepEqual((await history(page)).steps.map(step => step.d), [{ scores: { 1: [40, 38] } }], '−3 then +1 is life 40 → 38');
    for (const button of [add, add]) await button(page, 2).tap();
    assert.deepEqual((await history(page)).steps, [], 'back to 40: no step');
    assert.equal(await undoButton(page).getAttribute('aria-label'), 'Undo, nothing to undo');
  });

  // Undo takes back the whole burst, and its toast on the tile, facing its player, offers Redo; Redo puts it back.
  // Both are announced, and the toast goes after 4 seconds.
  test(`${name}: Undo takes back a burst with a toast and an announcement, and the toast's Redo brings it back`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: savedGame(4) });
    await subtract(page, 3).tap();
    await subtract(page, 3).tap();
    await undoButton(page).tap();
    assert.equal((await scores(page))[2], 40, 'the whole burst is undone');
    assert.equal(await toast(page, 3), 'Undid life 40 → 38Redo');
    assert.deepEqual((await toasts(page)).map(Boolean), [false, false, true, false], 'only on the tile it changed');
    assert.equal(await announced(page), 'Undid: Player 3, Coral, life 40 → 38');
    assert.equal(await undoButton(page).getAttribute('aria-label'), 'Undo, nothing to undo', 'Undo dims at the start');
    assert.equal((await history(page)).at, 0);
    assert.equal(await page.locator('#redo-button').getAttribute('aria-label'), 'Redo: Player 3, Coral, life 40 → 38');

    // The toast faces its player: it's inside the tile's face.
    assert.equal(await tile(page, 3).locator('.player-face .toast-chip').count(), 1);
    await tile(page, 3).locator('.toast-redo').tap();
    assert.equal((await scores(page))[2], 38, 'Redo brings it back');
    assert.equal(await toast(page, 3), 'Redid life 40 → 38');
    assert.equal(await announced(page), 'Redid: Player 3, Coral, life 40 → 38');
    assert.equal((await history(page)).at, 1);
    await page.clock.runFor(toastTime);
    assert.equal(await toast(page, 3), null, 'the toast goes after 4 seconds');

    // Undo again, then a new action: Forward is gone.
    await undoButton(page).tap();
    await add(page, 1).tap();
    const after = await history(page);
    assert.deepEqual(after.steps.map(step => step.d), [{ scores: { 0: [40, 41] } }], 'a new step drops Forward');
    assert.equal(after.at, 1);
    assert.equal(await page.locator('#redo-button').getAttribute('aria-label'), 'Redo, nothing to redo');
  });
}

// Settings → New game → Start new game, then waits for the dialogs to close.
async function newGame(page) {
  await button(page, 'Settings').tap();
  await button(page, 'New game').tap();
  await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
  await eventually(() => page.evaluate(() => document.querySelector('dialog[open]') === null), true, 'the new game starts');
}
const live = page => page.evaluate(async () => {
  const { game } = await import('/js/state/state.js');
  return JSON.parse(JSON.stringify(game));
});

for (const [name, engine] of Object.entries(engines)) {
  // Two players tapping at once (§6.2a): each tile keeps its own burst, neither cuts the other short, and each burst
  // sits in the history where its latest tap was, so Undo takes back whichever was touched last.
  test(`${name}: two tiles tapping at once each keep their own burst, ordered by their latest tap`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: savedGame(4) });
    for (const [button, number] of [[subtract, 3], [add, 2], [subtract, 3], [add, 2], [subtract, 3]]) {
      await button(page, number).tap();
      await page.clock.runFor(200);
    }
    assert.deepEqual((await history(page)).steps.map(step => step.d), [{ scores: { 1: [40, 42] } }, { scores: { 2: [40, 37] } }], 'two steps, P3\'s last');
    assert.equal(await delta(page, 3), '−3');
    assert.equal(await delta(page, 2), '+2', 'a gain in the seat colour');
    assert.equal(await tile(page, 2).locator('.life-delta').getAttribute('data-sign'), 'gain');
    await add(page, 2).tap();
    assert.deepEqual((await history(page)).steps.map(step => step.d), [{ scores: { 2: [40, 37] } }, { scores: { 1: [40, 43] } }], 'a merge moves the step to the top');
    await undoButton(page).tap();
    assert.deepEqual(await scores(page), [40, 40, 37, 40], 'Undo takes back the burst touched last, all of it');
    assert.equal(await delta(page, 3), null, 'and Undo closes every burst');
    await subtract(page, 3).tap();
    assert.equal((await history(page)).steps.length, 2, 'so the next tap starts a new step, after Forward went');
  });

  // What breaks a burst (§6.2a): another count on the same tile, any step that isn't a merging tap, and a mode.
  test(`${name}: another count on the same tile, a turn pass or a mode breaks a burst`, async (t) => {
    const page = await openPage(t, engine, {
      clock: true,
      game: savedGame(4, { manaPool: true, pools: [[0, 0, 0, 3, 0, 0], ...Array(3).fill([0, 0, 0, 0, 0, 0])], turns: 'rounds', turn: { first: 1, active: null, round: 1 }, autoEmpty: false }),
    });
    // The life buttons under a strip ignore touches for stripHoldTime after a spend, which is inside the merge window.
    await subtract(page, 1).tap();
    await tile(page, 1).locator('.strip-spend[data-colour="R"]').tap();
    await page.clock.runFor(900);
    await subtract(page, 1).tap();
    assert.equal((await history(page)).steps.length, 3, 'life, a spend, then life again: three steps');
    await tile(page, 1).locator('.strip-spend[data-colour="R"]').tap();
    await page.locator('#round-button').tap();
    await tile(page, 1).locator('.strip-spend[data-colour="R"]').tap();
    assert.deepEqual((await history(page)).steps.slice(-3).map(step => step.k ?? Object.keys(step.d).join()), ['pools', 'turn', 'pools'], 'a turn pass breaks the spend');
    await subtract(page, 2).tap();
    await page.locator('#mana-button').tap();
    await button(page, 'Cancel').tap();
    await subtract(page, 2).tap();
    assert.deepEqual((await history(page)).steps.slice(-2).map(step => step.d), [{ scores: { 1: [40, 39] } }, { scores: { 1: [39, 38] } }], 'a mode between taps breaks the burst');
  });

  // A tap that puts a player out hands the monarch on in the same step, and ends the burst after it (§6.2, §6.9).
  test(`${name}: a player going out and the handoff it causes are one step, and Undo brings both back`, async (t) => {
    const page = await openPage(t, engine, {
      clock: true,
      game: savedGame(4, { scores: [40, 2, 40, 40], counters: { monarch: true }, monarch: 1, turns: 'turns', turn: { first: 0, active: 0, round: 1 } }),
    });
    await subtract(page, 2).tap();
    await subtract(page, 2).tap();
    assert.equal((await saved(page)).monarch, 0, 'the active player takes the crown');
    await subtract(page, 2).tap();
    const { steps } = await history(page);
    assert.deepEqual(steps.map(step => step.d), [{ scores: { 1: [2, 0] }, monarch: [1, 0] }, { scores: { 1: [0, -1] } }], 'the tap that put P2 out ends its burst');
    await undoButton(page).tap();
    await undoButton(page).tap();
    const back = await saved(page);
    assert.deepEqual([back.scores[1], back.monarch], [2, 1], 'one Undo brings the player and the crown back');
    assert.equal(await tile(page, 2).locator('.designation-chip[data-designation="monarch"]').count(), 1, 'the crown is drawn back on P2');
    assert.ok(/monarch: Player 2 → Player 1/.test(await toast(page, 1)), 'the handoff\'s toast is on both tiles');
  });

  // A turn pass is one step with the pools it emptied; a hold on the turn chip is its own step; the eraser and spends
  // are steps; "Who goes first?" is a step, and a skip that changes nothing isn't (§6.2).
  test(`${name}: turn passes, step backs, spends, the eraser and "Who goes first?" each undo and redo`, async (t) => {
    const page = await openPage(t, engine, {
      clock: true,
      game: savedGame(4, { manaPool: true, pools: [[1, 0, 0, 2, 0, 0], [0, 0, 0, 0, 1, 0], ...Array(2).fill([0, 0, 0, 0, 0, 0])], turns: 'turns', turn: { first: 0, active: 0, round: 1 } }),
    });
    await tile(page, 1).locator('.turn-chip').tap();
    assert.deepEqual([(await saved(page)).turn.active, (await saved(page)).pools[0]], [1, [0, 0, 0, 0, 0, 0]], 'the pass empties the pools');
    await undoButton(page).tap();
    let now = await saved(page);
    assert.deepEqual([now.turn, now.pools[0], now.pools[1]], [{ first: 0, active: 0, round: 1 }, [1, 0, 0, 2, 0, 0], [0, 0, 0, 0, 1, 0]], 'Undo brings back the turn and the pools it emptied');
    assert.equal(await announced(page), 'Undid: turn pass. Player 1, Jade\'s turn, round 1');
    assert.match(await toast(page, 1), /^Undid turn pass/, 'the toast is on the tile whose turn it is now');
    await page.locator('#redo-button').evaluate(redo => redo.click());
    assert.equal((await saved(page)).turn.active, 1, 'the hidden Redo passes it again');
    // On a short tile the toast takes the near edge for its seconds, as a reminder does.
    await page.clock.runFor(toastTime);
    await hold(page, tile(page, 2).locator('.turn-chip'), holdDelay);
    assert.equal((await saved(page)).turn.active, 0, 'a hold steps back');
    assert.equal((await history(page)).steps.at(-1).k, 'turnBack', 'as a step of its own');
    await undoButton(page).tap();
    assert.equal((await saved(page)).turn.active, 1, 'Undo takes the step back back');

    // The eraser and a spend.
    await page.clock.runFor(1000);
    await undoButton(page).tap();
    now = await saved(page);
    assert.equal(now.turn.active, 0);
    await page.clock.runFor(toastTime);
    await tile(page, 1).locator('.strip-clear').tap();
    await page.clock.runFor(1000);
    await tile(page, 2).locator('.strip-spend[data-colour="G"]').tap();
    assert.deepEqual((await saved(page)).pools[1], [0, 0, 0, 0, 0, 0]);
    await undoButton(page).tap();
    assert.deepEqual((await saved(page)).pools[1], [0, 0, 0, 0, 1, 0], 'Undo puts a spend back');
    await undoButton(page).tap();
    assert.deepEqual((await saved(page)).pools[0], [1, 0, 0, 2, 0, 0], 'and the eraser\'s pool');
    assert.equal(await announced(page), 'Undid: Player 1, Jade, mana pool emptied');

    // "Who goes first?" after a new game: a pick is the new game's first step.
    await newGame(page);
    await eventually(() => page.locator('#board').getAttribute('data-mode'), 'first');
    await button(page, 'Me first, Player 3').tap();
    await page.clock.runFor(1000);
    const picked = await history(page);
    assert.deepEqual(picked.steps.map(step => step.k), ['first'], 'the new game emptied the history; the pick is its first step');
    await undoButton(page).tap();
    assert.deepEqual((await saved(page)).turn, { first: null, active: null, round: 1 }, 'Undo takes the pick back');
    assert.equal(await undoButton(page).getAttribute('aria-disabled'), 'true', 'and no further, into the game before');
  });

  // A new game empties the history (SPEC §10.2): the steps taken, the steps ahead and any open burst go, Undo and
  // Redo dim, and a relaunch keeps it so (History's own test is in history.test.mjs). Undo still works within the new game.
  test(`${name}: a new game empties the history, and Undo works within the new game`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: savedGame(4) });
    await subtract(page, 1).tap();
    await page.clock.runFor(mergeWindow + 100);
    await subtract(page, 2).tap();
    await undoButton(page).tap();
    // A step ahead, a step back and a burst still open on tile 3.
    await subtract(page, 3).tap();
    await subtract(page, 3).tap();
    assert.equal(await delta(page, 3), '−2');
    await newGame(page);
    assert.deepEqual(await history(page), { v: 1, at: 0, base: 0, steps: [] }, 'nothing back, nothing ahead');
    assert.equal(await undoButton(page).getAttribute('aria-disabled'), 'true', 'Undo dims');
    assert.equal(await undoButton(page).getAttribute('aria-label'), 'Undo, nothing to undo');
    assert.equal(await page.locator('#redo-button').getAttribute('aria-label'), 'Redo, nothing to redo');
    await undoButton(page).tap({ force: true });
    assert.deepEqual(await scores(page), [40, 40, 40, 40], 'and Undo does nothing');
    assert.equal(await delta(page, 3), null, 'the open burst ended with the old game');

    // A relaunch keeps it empty.
    await reload(page);
    assert.deepEqual((await history(page)).steps, []);
    assert.equal(await undoButton(page).getAttribute('aria-disabled'), 'true', 'Undo is still dimmed after a relaunch');

    // The first tap of the new game is a step of its own, not merged with the old game's burst, and Undo takes it back.
    await subtract(page, 3).tap();
    assert.deepEqual((await history(page)).steps.map(step => step.d), [{ scores: { 2: [40, 39] } }]);
    await undoButton(page).tap();
    assert.deepEqual(await scores(page), [40, 40, 40, 40], 'Undo works within the new game');
    assert.equal(await undoButton(page).getAttribute('aria-disabled'), 'true', 'and stops at its start');
  });

  // The same from Settings, where a change of players or starting life is a pending new game that Start new game
  // starts: the history empties, even across a change of player count, and stays empty after a relaunch.
  test(`${name}: a new game from a pending change in Settings empties the history too`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: savedGame(4, { scores: [31, 22, 40, 7] }) });
    await subtract(page, 1).tap();
    await page.clock.runFor(mergeWindow + 100);
    await subtract(page, 2).tap();
    await button(page, 'Settings').tap();
    await button(page, '6 players').tap();
    assert.equal(await page.locator('#save-setup').textContent(), 'Start new game');
    await page.locator('#save-setup').tap();
    await eventually(() => page.locator('.player').count(), 6);
    assert.deepEqual(await history(page), { v: 1, at: 0, base: 0, steps: [] }, 'the history is empty');
    assert.equal(await undoButton(page).getAttribute('aria-label'), 'Undo, nothing to undo');
    await undoButton(page).tap({ force: true });
    assert.equal(await page.locator('.player').count(), 6, 'Undo doesn\'t bring the old game back');
    await reload(page);
    assert.equal(await page.locator('.player').count(), 6);
    assert.deepEqual((await history(page)).steps, [], 'and a relaunch keeps it empty');
    assert.equal(await undoButton(page).getAttribute('aria-disabled'), 'true');
  });

  // A save from before a new game emptied the history kept the new game as a step (k 'newGame'), sometimes across a
  // change of player count. It loads with its game as saved and only the steps since that new game, which still undo.
  test(`${name}: an old save with a new game in its history loads safely`, async (t) => {
    const oldHistory = {
      v: 1, at: 3, base: 0, steps: [
        { t: 0, d: { scores: { 0: [40, 39] } } },
        { t: 5, k: 'newGame', d: { scores: [[39, 40], [40, 40, 40, 40]], rotations: [[0, 0], [0, 0, 0, 0]], colors: [[0, 1], [0, 1, 2, 3]] } },
        { t: 9, d: { scores: { 2: [40, 30] } } },
      ],
    };
    const page = await openPage(t, engine, { clock: true, game: savedGame(4, { scores: [40, 40, 30, 40], history: oldHistory }) });
    assert.deepEqual(await scores(page), [40, 40, 30, 40], 'the game loads as saved');
    assert.equal(await page.locator('.player').count(), 4);
    assert.deepEqual((await live(page)).history.steps, [oldHistory.steps[2]], 'only the step since the new game is kept');
    assert.equal(await undoButton(page).getAttribute('aria-label'), 'Undo: Player 3, Coral, life 40 → 30');
    await undoButton(page).tap();
    assert.deepEqual(await scores(page), [40, 40, 40, 40], 'it undoes');
    assert.equal(await undoButton(page).getAttribute('aria-disabled'), 'true', 'and Undo stops there, not crossing the old new game');
    assert.equal(await page.locator('.player').count(), 4);
  });

  // What isn't a step (§6.3): settings, seat rotation, tile colours and identities. They don't drop Forward, and an
  // undo of an unrelated step leaves them as they are.
  test(`${name}: settings, rotations, colours and identities aren't steps, and survive an unrelated undo`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: savedGame(4) });
    await subtract(page, 1).tap();
    await undoButton(page).tap();
    // Rotate seats, a tile colour and an identity, then a setting.
    await button(page, 'Settings').tap();
    await button(page, 'Rotate seats on the board').tap();
    await page.locator('.player:nth-child(2) .rotate-seat').tap();
    await button(page, 'Done rotating seats').tap();
    await button(page, 'Settings').tap();
    await button(page, 'Choose tile colours on the board').tap();
    await tile(page, 1).locator('.swatch:not([aria-pressed="true"]):not([disabled])').first().tap();
    await button(page, 'Done choosing colours').tap();
    await button(page, 'Settings').tap();
    await page.locator('#settings label', { has: page.getByRole('switch', { name: 'Poison', exact: true }) }).tap();
    await button(page, 'Close settings').tap();
    const set = await saved(page);
    assert.equal(set.history.steps.length, 1, 'nothing recorded');
    assert.equal(set.history.at, 0, 'and Forward is still there');
    await page.locator('#redo-button').evaluate(redo => redo.click());
    const after = await saved(page);
    assert.equal(after.scores[0], 39, 'Redo still works');
    assert.deepEqual([after.rotations, after.colors, after.counters.poison], [set.rotations, set.colors, true], 'and leaves the rotation, colour and setting');
  });

  // The history is saved with the game (§6.1): a relaunch keeps Back and Forward.
  test(`${name}: a relaunch keeps the history, Back and Forward`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: savedGame(4) });
    await subtract(page, 1).tap();
    await page.clock.runFor(mergeWindow + 100);
    await subtract(page, 2).tap();
    await undoButton(page).tap();
    await reload(page);
    assert.equal(await undoButton(page).getAttribute('aria-label'), 'Undo: Player 1, Jade, life 40 → 39');
    assert.equal(await page.locator('#redo-button').getAttribute('aria-label'), 'Redo: Player 2, Sky, life 40 → 39');
    await page.locator('#redo-button').evaluate(redo => redo.click());
    assert.deepEqual(await scores(page), [39, 39, 40, 40]);
    await undoButton(page).tap();
    await undoButton(page).tap();
    assert.deepEqual(await scores(page), [40, 40, 40, 40]);
  });

  // A corrupt or hostile history never breaks or resets the game: the board loads as saved, with the valid steps or
  // none, and Undo works from there (AGENTS.md, §10).
  test(`${name}: a corrupt history loads safely, keeping the game`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: savedGame(4, { scores: [30, 40, 40, 40] }) });
    for (const history of ['nonsense', { v: 1, at: 99, steps: 'x' }, { v: 1, at: 1, base: 0, steps: [{ t: 0, d: { scores: { 7: [1, 2] } } }] }, { v: 9 }, null]) {
      await seedGame(page, savedGame(4, { scores: [30, 40, 40, 40], history }));
      assert.deepEqual(await scores(page), [30, 40, 40, 40], `the game loads with history ${JSON.stringify(history)}`);
      assert.equal(await undoButton(page).getAttribute('aria-label'), 'Undo, nothing to undo');
      // Dimmed (aria-disabled), but still a button.
      await undoButton(page).tap({ force: true });
      assert.deepEqual(await scores(page), [30, 40, 40, 40], 'and Undo does nothing');
    }
    await seedGame(page, savedGame(4, { scores: [30, 40, 40, 40], history: { v: 1, at: 2, base: 0, steps: [{ t: 0, d: { scores: { 9: [1, 2] } } }, { t: 1, d: { scores: { 0: [40, 30] } } }] } }));
    await undoButton(page).tap();
    assert.deepEqual(await scores(page), [40, 40, 40, 40], 'the valid step after a bad one still undoes');
    assert.equal(await undoButton(page).getAttribute('aria-label'), 'Undo, nothing to undo', 'and the bad one is gone');
  });

  // An undo mid-hold ends the hold first (§6.9), then takes back the whole burst so far.
  test(`${name}: Undo during a hold on + ends the hold and takes back the whole burst`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: savedGame(4) });
    const box = await add(page, 1).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.clock.runFor(holdDelay + 300);
    assert.ok((await live(page)).scores[0] > 41, 'the hold repeats');
    await page.evaluate(async () => (await import('/js/actions/history.js')).undo());
    await page.clock.runFor(500);
    await page.mouse.up();
    assert.equal((await live(page)).scores[0], 40, 'the hold stopped and the burst is undone');
  });

  // The keyboard path (§6.6, §9): Undo keeps focus as it steps back; the hidden Redo after it shows while it has focus
  // and redoes; a hold on Undo opens History.
  test(`${name}: Undo and the hidden Redo work from the keyboard and keep focus`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: savedGame(4) });
    await subtract(page, 1).tap();
    await undoButton(page).focus();
    await page.keyboard.press('Enter');
    assert.equal((await scores(page))[0], 40);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'undo-button', 'focus stays on Undo');
    assert.equal(await page.evaluate(() => document.querySelector('#undo-button').nextElementSibling.id), 'redo-button', 'Redo comes next');
    await page.locator('#redo-button').focus();
    const shown = await page.locator('#redo-button').evaluate(node => ({ width: node.offsetWidth, height: node.offsetHeight }));
    assert.ok(shown.width >= 44 && shown.height >= 44, `the hidden Redo shows as a 44px button with focus (${shown.width}×${shown.height})`);
    await page.keyboard.press('Enter');
    assert.equal((await scores(page))[0], 39, 'and redoes');
  });

  // Every new target is at least 44px (§9): the 7-button pill at 568 × 320 with 2 players takes 44px buttons and stays
  // inside the board's short side, 48px elsewhere; the toast's Redo is a 64 × 44 target inside its tile.
  // On the smallest phone the pill takes Track (design/polish/PILL-SPEC.md, as built) rather than 44px buttons.
  test(`${name}: Undo's pill fits at full size on the smallest phone, and the toast's Redo is a whole target`, async (t) => {
    const busy = { counters: { commander: true, poison: true, monarch: true }, manaPool: true, turns: 'rounds', turn: { first: 0, active: null, round: 1 } };
    for (const [width, height, count, expected] of [[568, 320, 2, 48], [640, 360, 2, 48], [568, 320, 4, 48], [952, 427, 2, 48]]) {
      const page = await openPage(t, engine, { clock: true, viewport: { width, height }, orientation: 90, game: savedGame(count, busy) });
      const pill = await page.locator('#board-controls').evaluate((controls) => {
        const buttons = [...controls.querySelectorAll('.pill-button')].filter(button => !button.hidden);
        const box = controls.getBoundingClientRect();
        return { count: buttons.length, sizes: [...new Set(buttons.map(button => button.offsetWidth))], long: Math.max(box.width, box.height) };
      });
      const view = `${width} × ${height}, ${count} players`;
      assert.deepEqual(pill.sizes, [expected], `${view}: ${expected}px buttons`);
      assert.ok(pill.long <= Math.min(width, height) || count > 2, `${view}: the pill fits the board's short side (${pill.long}px)`);
      assert.ok(await undoButton(page).isVisible(), `${view}: Undo shows`);
      await subtract(page, 1).tap();
      await undoButton(page).tap();
      // Redo's target is its ::after, checked below; the chip and the button themselves sit inside the tile.
      assert.deepEqual(await tileProblems(page, { parts: '.toast-chip, .toast-redo' }), [], `${view}: the toast and its Redo fit`);
      const redo = await tile(page, 1).locator('.toast-redo').evaluate((node) => {
        const touch = getComputedStyle(node, '::after');
        return [parseFloat(touch.width), parseFloat(touch.height)];
      });
      assert.ok(redo[0] >= 64 && redo[1] >= 44, `${view}: Redo is a 64 × 44 target (${redo})`);
      await page.close();
    }
  });
}

for (const [name, engine] of Object.entries(engines)) {
  // Modes on the one history (§6.5): each tap is a step, merged per cell; the mode's Undo stops at what was there when
  // it opened; ✕ asks, then takes the mode's steps back, and Redo at rest brings them back; and after ✓ they're ordinary
  // steps that Undo in the centre takes back. Commander damage's monarch transfer is in its step.
  test(`${name}: the modes' Undo, ✕ and Discard work on the game's history, and Redo brings a discard back`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: savedGame(4, { counters: { commander: true, poison: true, monarch: true }, monarch: 2 }) });
    await subtract(page, 4).tap();
    await page.clock.runFor(mergeWindow + 1);
    await button(page, 'Counters').tap();
    assert.ok(await button(page, 'Undo').isDisabled(), 'nothing to undo in the mode yet, though the game has a step');
    const poison = (number) => tile(page, number).locator('.counter-cell[data-kind="poison"]');
    await poison(1).tap();
    await poison(1).tap();
    await page.clock.runFor(mergeWindow + 1);
    await poison(2).tap();
    assert.equal((await history(page)).steps.length, 3, 'a life step, then two poison steps');
    await button(page, 'Undo').tap();
    await button(page, 'Undo').tap();
    assert.deepEqual((await saved(page)).poison, [0, 0, 0, 0]);
    assert.ok(await button(page, 'Undo').isDisabled(), 'Undo stops at the mode\'s start');
    assert.equal((await saved(page)).scores[3], 39, 'and leaves the life step before it');
    assert.equal(await announced(page), 'Undid: Player 1, Jade, poison 0 → 2');
    assert.equal(await page.locator('.toast-chip').count(), 0, 'no toast in a mode: the cells change in place');

    // ✕ with changes asks, and Discard takes the mode's steps back; Redo at rest brings them back.
    await poison(3).tap();
    await page.clock.runFor(mergeWindow + 1);
    await poison(3).tap();
    await button(page, 'Cancel').tap();
    assert.equal(await page.locator('#discard-title').textContent(), 'Discard 2 changes?');
    await button(page, 'Discard').tap();
    await eventually(() => page.locator('#board').getAttribute('data-mode'), null);
    assert.deepEqual((await saved(page)).poison, [0, 0, 0, 0], 'discarded');
    const after = await history(page);
    assert.equal(after.steps.length - after.at, 2, 'the discarded steps are ahead, to redo');
    await page.locator('#redo-button').evaluate(redo => redo.click());
    await page.locator('#redo-button').evaluate(redo => redo.click());
    assert.deepEqual((await saved(page)).poison, [0, 0, 2, 0], 'Redo brings them back');

    // Commander damage to the monarch passes the crown in the same step; after ✓, Undo in the centre takes both back.
    await button(page, 'Commander damage').tap();
    await tile(page, 3).locator('.map-cell[data-attacker="0"]').tap();
    assert.equal((await saved(page)).monarch, 0, 'the attacker takes the crown');
    await button(page, 'Save').tap();
    await page.clock.runFor(toastTime);
    await undoButton(page).tap();
    const back = await saved(page);
    assert.deepEqual([back.commanderDamage[2][0], back.scores[2], back.monarch], [0, 40, 2], 'one Undo takes back the damage, the life and the crown');
  });
}

// The running delta (the owner's rules, alpha.20) sits directly above its total, centred on it, facing the player on every
// seat; where it can't fit there even at its 14px floor, it sits beside the total, by the digits. Either way it
// never covers the digits, the far row, the folded mana chip under it, the mana strip, the near row, the − and + glyphs
// or the pill. Every sweep size at 2–6 players with floating mana and Treasure on every tile (which lifts the totals
// toward the far row), the stress sizes without them too, and a rotated seat.
const sweepSizes = [[952, 427], [852, 393], [640, 360], [568, 320], [375, 667], [320, 568], [841, 701], [1366, 1024]];
async function checkDeltaPlace(t, engine) {
  const page = await openPage(t, engine, { clock: true, viewport: { width: 952, height: 427 } });
  const boards = [
    ...sweepSizes.flatMap(([width, height]) => [2, 3, 4, 5, 6].map(count => [width, height, count, true])),
    ...[2, 3, 4, 5, 6].map(count => [568, 320, count, false]), ...[2, 4, 6].map(count => [320, 568, count, false]),
    [952, 427, 4, false, [1, 0, 0, 0]], [568, 320, 4, true, [1, 0, 0, 0]],
  ];
  const overlaps = (a, b) => a && b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  let beside = 0;
  for (const [width, height, count, mana, rotations] of boards) {
    await page.setViewportSize({ width, height });
    const zero = Array(count).fill(0);
    await seedGame(page, savedGame(count, {
      ...(rotations ? { rotations } : {}), counters: { commander: true, poison: true }, poison: zero.map(() => 2),
      commanderDamage: zero.map((_, d) => zero.map((__, a) => (a === d ? 0 : 3 + a))),
      manaPool: mana, pools: zero.map((_, i) => [0, i % 2, 0, (i + 1) % 2, 0, 0]), treasure: zero.map(() => 2),
    }));
    // Two taps on every tile, and twelve on the third, for a two-digit delta.
    for (let number = 1; number <= count; number++) {
      for (let tap = 0; tap < (number === 3 ? 12 : 2); tap++) await (number % 2 ? add : subtract)(page, number).tap();
    }
    const view = `${width} × ${height}, ${count} players${mana ? ', mana and Treasure' : ''}${rotations ? ', a rotated seat' : ''}`;
    const faces = await faceBoxes(page, {
      delta: '.life-delta:not([hidden]) .life-delta-value', score: '.score', far: '.badges.far > *', farChip: '.mana-far > *',
      strip: '.mana-strip > *', near: '.badges.near > *', subtract: '.controls .subtract .icon', add: '.controls .add .icon',
    });
    // Where the digits are in each total's box, from the font's own metrics (line-height 1, no descenders).
    const insets = await page.locator('.score').evaluateAll(scores => scores.map((score) => {
      const style = getComputedStyle(score);
      const size = parseFloat(style.fontSize);
      const context = document.createElement('canvas').getContext('2d');
      context.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
      const metrics = context.measureText(score.value);
      const tallest = context.measureText('0123456789').actualBoundingBoxAscent;
      const baseline = (size - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2 + metrics.fontBoundingBoxAscent;
      return { top: baseline - Math.max(metrics.actualBoundingBoxAscent, tallest), bottom: baseline };
    }));
    faces.forEach((face, index) => {
      const seat = `${view}, P${index + 1}`;
      assert.ok(face.delta, `${seat}: the delta shows`);
      const digits = { left: face.score.left, right: face.score.right, top: face.score.top + insets[index].top, bottom: face.score.top + insets[index].bottom };
      assert.ok(!overlaps(face.delta, digits), `${seat}: clear of the digits (${JSON.stringify(face.delta)} against ${JSON.stringify(digits)})`);
      if (face.delta.right <= digits.left + 0.5 || face.delta.left >= digits.right - 0.5) {
        beside += 1;
        // At the digits' vertical centre, or as near it as clears the glyph, no more than its height past their top or bottom.
        const height = face.delta.bottom - face.delta.top;
        assert.ok(face.delta.bottom >= digits.top - height - 0.5 && face.delta.top <= digits.bottom + height + 0.5, `${seat}: beside the total, level with the digits (${face.delta.top}–${face.delta.bottom} against ${digits.top.toFixed(1)}–${digits.bottom.toFixed(1)})`);
      } else {
        const off = (face.delta.left + face.delta.right) / 2 - (face.score.left + face.score.right) / 2;
        assert.ok(Math.abs(off) <= 1, `${seat}: centred on the total (${off.toFixed(1)}px off)`);
        assert.ok(face.delta.bottom <= digits.top + 0.5, `${seat}: above the digits`);
      }
      for (const part of ['far', 'farChip', 'strip', 'near', 'subtract', 'add']) assert.ok(!overlaps(face.delta, face[part]), `${seat}: clear of ${part}`);
    });
    const pill = await page.locator('.life-delta-value').evaluateAll((values) => {
      const box = document.querySelector('#board-controls').getBoundingClientRect();
      return values.filter((value) => {
        const own = value.getBoundingClientRect();
        return own.left < box.right - 0.5 && box.left < own.right - 0.5 && own.top < box.bottom - 0.5 && box.top < own.bottom - 0.5;
      }).length;
    });
    assert.equal(pill, 0, `${view}: clear of the pill`);
    await page.clock.runFor(mergeWindow + deltaFade);
  }
  assert.ok(beside > 0, 'some tight tiles put the delta beside the total');
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: the running delta sits centred above its total, or beside it where there's no room, never over the digits`, { timeout: 600000 }, t => checkDeltaPlace(t, engine));
}
