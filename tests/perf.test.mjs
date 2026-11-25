import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { openPage, savedGame, test } from './helpers.mjs';

// The undo history's cost (UNDO-ARCHITECTURE.md §6 and §8): commit() records, saves the game with its history and
// redraws, so with a full history of 500 steps it must stay under 4ms at 4× CPU throttle, a mid-range phone. The median
// is held to that and the history's extra cost to half of it; a single slow run on a busy CI runner (p95) isn't. And an
// undo is one commit and one fit: an undone life tap redraws one total and lays nothing out again. Chromium only, since
// WebKit rounds performance.now() to 1ms. The numbers are printed as the test's diagnostics.

const budget = 4;

// A busy 6-player game with a full history of mixed steps: taps, commander damage with transfers and turn passes that
// emptied pools, as UNDO-ARCHITECTURE §2.2 measured.
function fullHistory() {
  const steps = [];
  for (let t = 0; t < 500; t++) {
    const i = t % 6;
    if (t % 25 === 0) steps.push({ t, k: 'turn', d: { turn: [{ first: 0, active: i, round: 1 + (t >> 5) }, { first: 0, active: (i + 1) % 6, round: 1 + (t >> 5) }], pools: Object.fromEntries([0, 1, 2, 3, 4, 5].map(p => [p, { 3: [2, 0], 5: [1, 0] }])) } });
    else if (t % 16 === 0) steps.push({ t, d: { commanderDamage: { [i]: { [(i + 1) % 6]: [3, 8] } }, scores: { [i]: [33, 28] }, monarch: [i, (i + 1) % 6] } });
    else steps.push({ t, n: 3, d: { scores: { [i]: [40, 37] } } });
  }
  return { v: 1, at: 500, base: Date.now() - 3600000, steps };
}

function busy(history) {
  return savedGame(6, {
    counters: { commander: true, poison: true, energy: true, experience: true, rad: true, monarch: true, initiative: true },
    poison: [1, 2, 3, 4, 5, 6], casts: [1, 2, 0, 1, 2, 0], energy: [3, 0, 12, 0, 1, 0], rad: [0, 4, 0, 0, 2, 0],
    commanderDamage: Array.from({ length: 6 }, (_, d) => Array.from({ length: 6 }, (_, a) => (d === a ? 0 : (d + a) % 7))),
    manaPool: true, pools: Array.from({ length: 6 }, (_, i) => [0, 0, 0, i % 3, 0, 1]), turns: 'turns', turn: { first: 0, active: 2, round: 4 },
    monarch: 1, initiative: 3, identities: ['WU', 'B', 'RG', '', 'WUBRG', 'G'], history,
  });
}

// commit() after one life change, 300 times: each a step of its own, so the history drops its oldest step every time.
async function commitTimes(page) {
  return page.evaluate(async () => {
    const { commit } = await import('/js/actions/commit.js');
    const { game } = await import('/js/state/state.js');
    const times = [];
    for (let run = 0; run < 300; run++) {
      const index = run % 6;
      game.scores[index] += run % 2 ? 1 : -1;
      const start = performance.now();
      commit({ scores: [index] });
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    return { p50: times[150], p95: times[284], bytes: localStorage.getItem('lifepod-game').length, steps: game.history.steps.length };
  });
}

test('chromium: commit() with 500 steps of history stays within budget at 4× CPU throttle, and an undo is one commit and one fit', async (t) => {
  const page = await openPage(t, chromium, { game: busy(fullHistory()) });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const full = await commitTimes(page);
  assert.equal(full.steps, 500, 'the history stays at its cap');
  const empty = await openPage(t, chromium, { game: busy(undefined) });
  const emptyCdp = await empty.context().newCDPSession(empty);
  await emptyCdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // An empty history fills to 300 steps here, so this is the cost before the cap.
  const none = await commitTimes(empty);
  t.diagnostic(`commit at 4×, empty history: p50 ${none.p50.toFixed(2)}ms, p95 ${none.p95.toFixed(2)}ms, save ${none.bytes} bytes`);
  t.diagnostic(`commit at 4×, 500 steps: p50 ${full.p50.toFixed(2)}ms, p95 ${full.p95.toFixed(2)}ms, save ${full.bytes} bytes`);
  assert.ok(full.p50 < budget, `commit() p50 with 500 steps is ${full.p50.toFixed(2)}ms, under ${budget}ms`);
  assert.ok(full.p50 - none.p50 < budget / 2, `500 steps add ${(full.p50 - none.p50).toFixed(2)}ms to commit()'s p50, under ${budget / 2}ms`);

  // One undo of a life tap: one total redrawn, no measure of the board, and at most one fit.
  const undo = await page.evaluate(async () => {
    const { layoutStats } = await import('/js/layout/fit.js');
    const { undo: back } = await import('/js/actions/history.js');
    // Warm: a few undos first, then five timed, then one watched.
    for (let run = 0; run < 5; run++) back();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const times = [];
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      back();
      times.push(performance.now() - start);
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const changed = new Set();
    const observer = new MutationObserver(records => records.forEach(record => changed.add(record.target.parentElement?.closest('.player') ?? record.target.closest?.('.player'))));
    for (const score of document.querySelectorAll('.score')) observer.observe(score, { childList: true, characterData: true, subtree: true });
    const before = { ...layoutStats };
    const start = performance.now();
    back();
    const time = performance.now() - start;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    observer.takeRecords().forEach(record => changed.add(record.target.parentElement?.closest('.player')));
    observer.disconnect();
    return { time, warm: times.map(x => x.toFixed(1)).join(), totals: changed.size, measures: layoutStats.measures - before.measures, fits: layoutStats.fits + layoutStats.skippedFits - before.fits - before.skippedFits };
  });
  t.diagnostic(`undos at 4×, warm: ${undo.warm} ms`);
  t.diagnostic(`one undo at 4×: ${undo.time.toFixed(2)}ms, ${undo.totals} total redrawn, ${undo.measures} measures, ${undo.fits} fits`);
  assert.deepEqual({ totals: undo.totals, measures: undo.measures }, { totals: 1, measures: 0 }, 'an undone life tap redraws one total and lays nothing out');
  assert.ok(undo.fits <= 1, `at most one fit (${undo.fits})`);
});
