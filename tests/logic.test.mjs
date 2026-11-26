// Property tests for the pure game logic in web/js/logic/, in Node with no browser (docs/review/LOGIC-AND-STATIC.md).
// fast-check picks a seed and prints it with the shrunk counterexample on a failure. PBT_RUNS sets the cases per property
// (500 by default, about a second for the file); PBT_RUNS=20000 is a deep run.
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  badgeSizeOrder, countKinds, designationKinds, historyBytes, historyCap, historyFields, historyVersion, identityBackgrounds,
  identityParts, identitySettingsVersion, manaColours, maxCount, maxRound, maxStartingLife, playOrders, playerCounts,
  pillTools, reminderKinds, settingsFields, stepKinds, styleOrder, swatches, tileSetOrder, trackers, trackTabKinds, turnModes,
} from '../web/js/logic/data.js';
import {
  applyStep, boardOf, composeChanges, describeStep, diffBoard, emptyHistory, fitHistory, mergeStep, overlaps, stepCells,
  stepTab, stepText, trimHistory,
} from '../web/js/logic/history.js';
import {
  applyEdit, applyNewEdit, countEdit, damageEdit, designationEdit, isOut, leavingTransfers, manaEdit, nextTurn, openingTab,
  outPlayers, pillFit, playOrder, previousTurn, restPillButtons, trackTabs, turnBack, turnForward, widestPill,
} from '../web/js/logic/rules.js';
import { fitColors, fitCounts, fitDamage, fitIdentities, fitPools, fitTurn, loadGame } from '../web/js/logic/save.js';
import { test } from './helpers.mjs';

const opts = { numRuns: Number(process.env.PBT_RUNS ?? 500) };

// ---- A validator for Game, written from the @typedef in save.js ---------------------------------------------------

const seatOrNull = (v, n) => v === null || (Number.isInteger(v) && v >= 0 && v < n);
const countRow = (row, n) => Array.isArray(row) && row.length === n && row.every(v => Number.isInteger(v) && v >= 0 && v <= maxCount);
function gameProblems(g) {
  const p = [];
  const n = g?.scores?.length;
  if (!playerCounts.includes(n) || !g.scores.every(Number.isSafeInteger)) return ['scores'];
  if (!Number.isSafeInteger(g.startingLife) || g.startingLife < 1 || g.startingLife > maxStartingLife) p.push('startingLife');
  if (!(g.rotations.length === n && g.rotations.every(r => [0, 1, 2, 3].includes(r)))) p.push('rotations');
  if (typeof g.keepAwake !== 'boolean') p.push('keepAwake');
  if (![0, 90, 180, 270].includes(g.landscapeAngle)) p.push('landscapeAngle');
  if (!(g.colors.length === n && new Set(g.colors).size === n && g.colors.every(c => Number.isInteger(c) && c >= 0 && c < swatches.length))) p.push('colors');
  if (!trackers.every(t => typeof g.counters[t] === 'boolean')) p.push('counters');
  for (const k of countKinds) if (!countRow(g[k], n)) p.push(k);
  if (!(g.identities.length === n && g.identities.every(s => typeof s === 'string' && /^W?U?B?R?G?$/.test(s)))) p.push('identities');
  if (!(identityParts.every(k => typeof g.identity.show[k] === 'boolean') && identityBackgrounds.includes(g.identity.background) && g.identity.version === identitySettingsVersion)) p.push('identity');
  if (!(g.commanderDamage.length === n && g.commanderDamage.every((row, d) => countRow(row, n) && row[d] === 0))) p.push('commanderDamage');
  if (typeof g.manaPool !== 'boolean' || typeof g.autoEmpty !== 'boolean') p.push('mana switches');
  if (!(g.pools.length === n && g.pools.every(row => countRow(row, manaColours.length)))) p.push('pools');
  if (!turnModes.includes(g.turns)) p.push('turns');
  if (!(seatOrNull(g.turn.first, n) && seatOrNull(g.turn.active, n) && Number.isInteger(g.turn.round) && g.turn.round >= 1 && g.turn.round <= maxRound)) p.push('turn');
  if (!tileSetOrder.includes(g.tileColours)) p.push('tileColours');
  if (typeof g.shuffleColours !== 'boolean') p.push('shuffleColours');
  if (!badgeSizeOrder.includes(g.badgeSize)) p.push('badgeSize');
  if (!(g.style === null || styleOrder.includes(g.style))) p.push('style');
  if (!seatOrNull(g.monarch, n) || !seatOrNull(g.initiative, n)) p.push('designations');
  if (!reminderKinds.every(k => typeof g.reminders[k] === 'boolean')) p.push('reminders');
  if (!trackTabKinds.includes(g.trackTab)) p.push('trackTab');
  if (historyProblems(g.history, n).length) p.push('history');
  return p;
}

// A valid History (logic/history.js): version 1, `at` within its steps, at most historyCap steps and historyBytes of
// them, each step's t, k and n well formed and its delta naming only board fields, and a fixed point of fitHistory, which
// checks every cell against the player count at its place.
function historyProblems(h, n) {
  const p = [];
  if (!h || h.v !== historyVersion || !Array.isArray(h.steps)) return ['shape'];
  if (!(Number.isInteger(h.at) && h.at >= 0 && h.at <= h.steps.length)) p.push('at');
  if (!(Number.isFinite(h.base) && h.base >= 0)) p.push('base');
  if (h.steps.length > historyCap || JSON.stringify(h.steps).length > historyBytes) p.push('cap');
  for (const step of h.steps) {
    if (!(Number.isFinite(step.t) && step.t >= 0) || (step.k !== undefined && !stepKinds.includes(step.k)) || (step.n !== undefined && !(Number.isInteger(step.n) && step.n > 1))) p.push('step');
    if (!step.d || !Object.keys(step.d).length || !Object.keys(step.d).every(f => historyFields.includes(f))) p.push('delta');
  }
  if (JSON.stringify(fitHistory(h, n)) !== JSON.stringify(h)) p.push('not fitted');
  return p;
}

// The fields that hold one entry per seat, so they mean nothing without a board to fit them to, and the rest.
const perPlayerFields = ['scores', 'rotations', 'colors', ...countKinds, 'identities', 'commanderDamage', 'pools', 'turn', 'monarch', 'initiative', 'history'];

// ---- Generators ---------------------------------------------------------------------------------------------------

const count = fc.integer({ min: 0, max: maxCount });
const seat = n => fc.option(fc.nat(n - 1), { nil: null });
const rowOf = (arb, n) => fc.array(arb, { minLength: n, maxLength: n });
const boolRecord = keys => fc.record(Object.fromEntries(keys.map(k => [k, fc.boolean()])));
const identity = fc.subarray(['W', 'U', 'B', 'R', 'G']).map(a => a.join(''));
// Rounds near both ends, where the limits are, as well as anywhere between.
const round = fc.oneof(fc.integer({ min: 1, max: maxRound }), fc.constantFrom(1, 2, maxRound - 1, maxRound));

// A valid Game, field by field, for a given player count.
const gameOf = n => fc.record({
  startingLife: fc.integer({ min: 1, max: maxStartingLife }),
  scores: rowOf(fc.integer({ min: -50, max: 200 }), n),
  rotations: rowOf(fc.nat(3), n),
  keepAwake: fc.boolean(),
  landscapeAngle: fc.constantFrom(0, 90, 180, 270),
  colors: fc.shuffledSubarray([...swatches.keys()], { minLength: n, maxLength: n }),
  counters: boolRecord(trackers),
  ...Object.fromEntries(countKinds.map(k => [k, rowOf(count, n)])),
  identities: rowOf(identity, n),
  identity: fc.record({ show: boolRecord(identityParts), background: fc.constantFrom(...identityBackgrounds), version: fc.constant(identitySettingsVersion) }),
  commanderDamage: rowOf(rowOf(count, n), n).map(m => m.map((row, d) => row.map((v, a) => (a === d ? 0 : v)))),
  manaPool: fc.boolean(),
  autoEmpty: fc.boolean(),
  pools: rowOf(rowOf(count, manaColours.length), n),
  turns: fc.constantFrom(...turnModes),
  turn: fc.record({ first: seat(n), active: seat(n), round }),
  tileColours: fc.constantFrom(...tileSetOrder),
  shuffleColours: fc.boolean(),
  badgeSize: fc.constantFrom(...badgeSizeOrder),
  style: fc.constantFrom(null, ...styleOrder),
  monarch: seat(n),
  initiative: seat(n),
  reminders: boolRecord(reminderKinds),
  trackTab: fc.constantFrom(...trackTabKinds),
  history: fc.constant(0).map(() => emptyHistory()),
});

// ---- Actions on the board, for the history's properties ----------------------------------------------------------

// One game action, as random numbers read against the board when it's applied, since a new game can change the player
// count: a life change, a counter, commander damage (with its handoffs), a mana count, a designation, a turn step that
// empties the pools, a new game (with a new count, sometimes), an identity, or a seat's rotation and a colour swap.
const actionArb = fc.record({ kind: fc.nat(9), a: fc.nat(30), b: fc.nat(30), c: fc.integer({ min: -12, max: 12 }) });
const clamp = v => Math.min(maxCount, Math.max(0, v));
function act(g, { kind, a, b, c }) {
  const n = g.scores.length;
  const i = a % n;
  if (kind === 0) g.scores[i] += c || 1;
  else if (kind === 1) {
    const k = countKinds[b % countKinds.length];
    g[k][i] = clamp(g[k][i] + (c || 1));
  } else if (kind === 2) {
    const edit = damageEdit(g, i, (i + 1 + (b % (n - 1))) % n, c < 0 ? -1 : 1);
    if (edit) applyNewEdit(g, edit);
  } else if (kind === 3) g.pools[i][b % manaColours.length] = clamp(g.pools[i][b % manaColours.length] + (c || 1));
  else if (kind === 4) applyNewEdit(g, designationEdit(g, designationKinds[b % 2], i));
  else if (kind === 5) {
    g.turn = turnForward(g) ?? { ...g.turn, round: Math.min(maxRound, g.turn.round + 1) };
    g.pools = fitPools([], n);
  } else if (kind === 6) {
    const count = b % 3 === 0 ? playerCounts[b % playerCounts.length] : n;
    if (count !== n) g.rotations = Array(count).fill(0);
    g.colors = fitColors(g.colors, count);
    for (const k of countKinds) g[k] = fitCounts([], count);
    g.identities = fitIdentities([], count);
    g.commanderDamage = fitDamage([], count);
    g.pools = fitPools([], count);
    g.turn = fitTurn(null, count);
    g.monarch = null;
    g.initiative = null;
    g.startingLife = 1 + (a * 37 + b) % maxStartingLife;
    g.scores = Array(count).fill(g.startingLife);
  } else if (kind === 7) g.identities[i] = ['', 'W', 'UB', 'BRG', 'WUBRG'][b % 5];
  else {
    g.rotations[i] = (g.rotations[i] + 1) % 4;
    const free = [...swatches.keys()].find(colour => !g.colors.includes(colour));
    if (free !== undefined) g.colors[i] = free;
  }
  return kind === 6 ? 'newGame' : kind === 5 ? 'turn' : undefined;
}

// Records each action as the app's commit() does, one step per action with nothing merged, and leaves `back` of them
// undone, so the game is where the history's `at` says.
function played(g, actions, back = 0) {
  const history = emptyHistory();
  actions.forEach((action, t) => {
    const before = boardOf(g);
    const k = act(g, action);
    const d = diffBoard(before, boardOf(g));
    if (Object.keys(d).length) history.steps.push({ t, ...(k ? { k } : {}), d });
  });
  history.at = history.steps.length;
  for (let undone = 0; undone < back && history.at; undone++) applyStep(g, history.steps[--history.at], 'b');
  g.history = history;
  return g;
}

const anyGame = fc.constantFrom(...playerCounts).chain(gameOf)
  .chain(g => fc.tuple(fc.constant(g), fc.array(actionArb, { maxLength: 8 }), fc.nat(3)))
  .map(([g, actions, back]) => played(g, actions, back));

// Every path to a field of g, nested ones included.
const fieldPaths = g => {
  const out = [];
  const walk = (v, path) => {
    out.push(path);
    if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], [...path, k]);
  };
  walk(g, []);
  return out.filter(p => p.length);
};
// Replacement values: arbitrary JSON, and near-misses that a validator can get wrong (off-by-one ints, other enums,
// floats, numeric strings), so the generator reaches into each fit* check.
const nearMiss = fc.oneof(
  fc.jsonValue(),
  fc.integer({ min: -2, max: 13 }), fc.integer({ min: 95, max: 1002 }),
  fc.constantFrom(0.5, -0, 1e21, '1', '', 'C', 'WW', 'GW', true, false, null, [], {}, 'off', 'turns', 'glass', 'large', 'jewel'),
);
// A valid save with one field (possibly nested) replaced by a near-miss, or deleted.
const corrupted = anyGame.chain(g => fc.tuple(fc.constant(g), fc.constantFrom(...fieldPaths(g)), fc.option(nearMiss, { nil: undefined })))
  .map(([g, path, value]) => {
    const copy = structuredClone(g);
    let at = copy;
    for (const k of path.slice(0, -1)) at = at[k];
    if (value === undefined) delete at[path.at(-1)];
    else at[path.at(-1)] = value;
    return { original: g, path, value, text: JSON.stringify(copy) };
  });

// A save with many leaves corrupted at once (about one in eight): duplicate colours, self-damage, bad enums and so on.
const messy = fc.tuple(anyGame, fc.infiniteStream(fc.tuple(fc.nat(7), nearMiss))).map(([g, stream]) => {
  const it = stream[Symbol.iterator]();
  const mess = v => {
    if (Array.isArray(v)) return v.map(mess);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mess(x)]));
    const [roll, value] = it.next().value;
    return roll === 0 ? value : v;
  };
  return JSON.stringify(mess(g));
});

const load = text => loadGame(() => text, 0);
const json = v => JSON.stringify(v); // compares like the save does (and treats -0 as 0)

// ---- loadGame ----------------------------------------------------------------------------------------------------

test('node: loadGame never throws and returns a valid Game for any string, any JSON, or a throwing read', () => {
  fc.assert(fc.property(fc.oneof(fc.string(), fc.json(), corrupted.map(c => c.text), messy, messy), text => {
    assert.deepEqual(gameProblems(load(text)), []);
  }), opts);
  assert.deepEqual(gameProblems(loadGame(() => { throw new Error('no storage'); }, 90)), []);
  assert.deepEqual(gameProblems(loadGame(() => undefined, 90)), []);
  assert.deepEqual(gameProblems(loadGame(() => null, 90)), []);
});

test('node: round trip: a valid game saves and loads unchanged', () => {
  fc.assert(fc.property(anyGame, g => {
    assert.deepEqual(load(JSON.stringify(g)), g);
  }), opts);
});

test('node: loading is idempotent: load(save(load(x))) equals load(x)', () => {
  fc.assert(fc.property(fc.oneof(corrupted.map(c => c.text), messy, fc.json()), text => {
    const once = load(text);
    assert.equal(json(load(json(once))), json(once));
  }), opts);
});

// AGENTS.md: loadGame "falls back to a default when a field is missing or wrong ... Never make an old save throw or reset
// the game." So corrupting one field leaves every other field as it was. The one exception is replacing the scores with
// something of another length: the per-player fields are then fitted to the new board, or to the default board when the
// length isn't a player count, and only the settings are kept as they were.
test('node: corrupting one field keeps every other field (AGENTS.md)', () => {
  fc.assert(fc.property(corrupted, ({ original, path, value, text }) => {
    const g = load(text);
    const resized = path.length === 1 && path[0] === 'scores' && !(Array.isArray(value) && value.length === original.scores.length);
    for (const key of Object.keys(original)) {
      if (key === path[0] || (resized && perPlayerFields.includes(key))) continue;
      assert.equal(json(g[key]), json(original[key]), `field ${key} after corrupting ${path.join('.')}`);
    }
    if (path[0] === 'scores' && path.length === 2) {
      g.scores.forEach((score, index) => {
        if (index !== Number(path[1])) assert.equal(score, original.scores[index], `score ${index}`);
        else assert.equal(json(score), json(Number.isSafeInteger(value) ? value : original.startingLife), `the corrupted score ${index}`);
      });
    }
  }), opts);
});

test('node: a starting life outside 1-999 loads as 40, and keeps the scores (SETTINGS §4)', () => {
  fc.assert(fc.property(anyGame, fc.oneof(fc.integer({ min: maxStartingLife + 1, max: Number.MAX_SAFE_INTEGER }), fc.integer({ min: Number.MIN_SAFE_INTEGER, max: 0 })), (g, life) => {
    const loaded = load(JSON.stringify({ ...g, startingLife: life }));
    assert.equal(loaded.startingLife, 40);
    assert.deepEqual(loaded.scores, g.scores);
  }), opts);
  const saved = { startingLife: 1000, scores: [1000, 7], keepAwake: false, badgeSize: 'larger' };
  assert.deepEqual(load(JSON.stringify(saved)), { ...load(JSON.stringify({ ...saved, startingLife: 40 })) });
});

test('node: scores for no known board start the default board and keep the settings', () => {
  const settings = { startingLife: 30, keepAwake: false, turns: 'rounds', badgeSize: 'large', style: 'glass', tileColours: 'jewel', manaPool: true };
  for (const scores of [undefined, [], [40], [1, 2, 3, 4, 5, 6, 7], 'x', { length: 4 }]) {
    const g = load(JSON.stringify({ ...settings, scores, colors: [5, 4, 3, 2], monarch: 1 }));
    assert.deepEqual(gameProblems(g), []);
    assert.deepEqual(g.scores, [30, 30, 30, 30], `scores ${json(scores)}`);
    assert.deepEqual(g.colors, [0, 1, 2, 3]);
    assert.equal(g.monarch, null);
    for (const [key, value] of Object.entries(settings)) assert.equal(g[key], value, key);
  }
});

// ---- Play order and turns ----------------------------------------------------------------------------------------

test('node: play order is a permutation of the seats for every player count', () => {
  for (const n of playerCounts) {
    assert.deepEqual([...playOrders[n]].sort(), [...Array(n).keys()]);
  }
});

// A game in Turn by turn with an active player, and some players out by life.
const turnGame = fc.constantFrom(...playerCounts).chain(n => fc.tuple(gameOf(n), fc.nat(n - 1), seat(n), fc.subarray([...Array(n).keys()]), round))
  .map(([g, active, first, outs, r]) => {
    g.turns = 'turns';
    g.turn = { first, active, round: r };
    g.scores = g.scores.map((_, i) => (outs.includes(i) ? 0 : 20));
    g.counters.poison = false;
    g.counters.commander = false;
    return g;
  });
// Turn by turn with an active player who is in, or Rounds.
const steppableGame = fc.oneof(
  turnGame.filter(g => !isOut(g, g.turn.active)),
  anyGame.map(g => ({ ...g, turns: 'rounds' })),
);

// Positions walked from active, exclusive of the start, to the result, inclusive.
const walk = (order, from, to, dir) => {
  const seats = [];
  let i = order.indexOf(from);
  do {
    i = (i + dir + order.length) % order.length;
    seats.push(order[i]);
  } while (order[i] !== to || seats.length === 0);
  return seats;
};

test('node: nextTurn lands on a player who is in, unless nobody else is, and skips exactly the out players between', () => {
  fc.assert(fc.property(turnGame, g => {
    const { next } = nextTurn(g);
    const order = playOrder(g);
    const othersIn = order.filter(p => p !== g.turn.active && !isOut(g, p));
    if (othersIn.length) {
      assert.ok(!isOut(g, next), `landed on out player ${next}`);
      const path = walk(order, g.turn.active, next, 1);
      assert.ok(path.slice(0, -1).every(p => isOut(g, p)), 'skipped a player who is in');
    } else {
      assert.equal(next, g.turn.active);
    }
  }), opts);
});

test('node: the round goes up exactly when play passes the first player (nextTurn)', () => {
  fc.assert(fc.property(turnGame, g => {
    const { next, crossed } = nextTurn(g);
    const path = walk(playOrder(g), g.turn.active, next, 1);
    assert.equal(crossed, g.turn.first !== null && path.includes(g.turn.first));
  }), opts);
});

test('node: turnBack undoes turnForward, round included, so a step back after a relaunch is exact', () => {
  fc.assert(fc.property(steppableGame, g => {
    const start = g.turn;
    const forward = turnForward(g);
    fc.pre(forward !== null);
    assert.notDeepEqual(forward, start, 'a step forward that changes nothing');
    assert.deepEqual(turnBack({ ...g, turn: forward }), start);
  }), opts);
});

test('node: turnForward undoes turnBack', () => {
  fc.assert(fc.property(steppableGame, g => {
    const start = g.turn;
    const back = turnBack(g);
    fc.pre(back !== null);
    assert.notDeepEqual(back, start, 'a step back that changes nothing');
    assert.deepEqual(turnForward({ ...g, turn: back }), start);
  }), opts);
});

test('node: the round stays within 1 to maxRound, and holds at both ends', () => {
  fc.assert(fc.property(fc.oneof(turnGame, anyGame), g => {
    for (const step of [turnForward(g), turnBack(g)]) {
      if (step) assert.ok(step.round >= 1 && step.round <= maxRound, `round ${step.round}`);
    }
  }), opts);
  const rounds = { turns: 'rounds', turn: { first: 0, active: null, round: maxRound } };
  assert.equal(turnForward(rounds), null);
  assert.deepEqual(turnBack(rounds), { first: 0, active: null, round: maxRound - 1 });
  assert.equal(turnBack({ ...rounds, turn: { ...rounds.turn, round: 1 } }), null);
  // Turn by turn in the last round: play holds at the last player rather than pass the first player's seat.
  const last = { ...load(JSON.stringify({ startingLife: 40, scores: [40, 40, 40, 40] })), turns: 'turns' };
  last.turn = { first: 0, active: 2, round: maxRound };
  assert.equal(turnForward(last), null);
  last.turn.active = 0;
  assert.deepEqual(turnForward(last), { first: 0, active: 1, round: maxRound });
});

test('node: a full lap of turnForward visits every player who is in once and raises the round by one', () => {
  fc.assert(fc.property(turnGame.filter(g => !isOut(g, g.turn.active) && g.turn.first !== null && g.turn.round < maxRound), g => {
    const inPlayers = playOrder(g).filter(p => !isOut(g, p));
    const seen = [];
    const startRound = g.turn.round;
    for (let i = 0; i < inPlayers.length; i++) {
      g.turn = /** @type {object} */ (turnForward(g));
      seen.push(g.turn.active);
    }
    assert.deepEqual([...seen].sort(), [...inPlayers].sort());
    assert.equal(g.turn.round, startRound + 1);
  }), opts);
});

test('node: previousTurn undoes nextTurn for an active player who is in', () => {
  fc.assert(fc.property(turnGame.filter(g => !isOut(g, g.turn.active)), g => {
    const start = g.turn.active;
    g.turn.active = nextTurn(g).next;
    assert.equal(previousTurn(g).previous, start);
  }), opts);
});

// ---- The monarch and the initiative: CR 726.4 and 727.4 -----------------------------------------------------------

// Reference heir, written from the rules text rather than the code: the active player; if the active player is leaving
// (or has left), the next player in turn order who is still in.
function referenceHeir(g, leaver) {
  const order = playOrder(g);
  const { active } = g.turn;
  if (active !== leaver && !isOut(g, active)) return active;
  const start = order.indexOf(active);
  for (let s = 1; s < order.length; s++) {
    const p = order[(start + s) % order.length];
    if (p !== leaver && !isOut(g, p)) return p;
  }
  return undefined; // nobody can take it
}

const handoffGame = fc.tuple(turnGame, fc.nat(5), fc.nat(5)).map(([g, monarch, initiative]) => {
  const n = g.scores.length;
  g.counters.monarch = true;
  g.counters.initiative = true;
  g.monarch = monarch % n;
  g.initiative = initiative % n;
  return g;
});

test('node: a holder who leaves hands on to the heir CR 726.4 and 727.4 name, and nobody else changes', () => {
  fc.assert(fc.property(handoffGame, fc.nat(5), (g, pick) => {
    const leaver = pick % g.scores.length;
    fc.pre(!isOut(g, leaver));
    const wasOut = outPlayers(g);
    g.scores[leaver] = 0;
    const transfers = leavingTransfers(g, wasOut);
    for (const kind of designationKinds) {
      const t = transfers.filter(x => x.kind === kind);
      assert.ok(t.length <= 1);
      if (g[kind] !== leaver) {
        assert.equal(t.length, 0, `${kind} moved though its holder stayed`);
        continue;
      }
      const heir = referenceHeir(g, leaver);
      if (heir === undefined) {
        // Monarch: nobody (726.4 has no one to take it). Initiative: it stays, since it always has a holder.
        if (kind === 'monarch') assert.deepEqual(t, [{ kind, from: leaver, to: null }]);
        else assert.equal(t.length, 0);
      } else {
        assert.deepEqual(t, [{ kind, from: leaver, to: heir }]);
      }
    }
  }), opts);
});

// ---- Edits: the pure core of actions/edits.js (the edit constructors and applyNewEdit in rules.js) ----------------

// One tap in a mode: the edit it makes, if any, applied with its handoffs and kept for undo, as commitEdit does.
function tap(game, stack, step) {
  const n = game.scores.length;
  const index = step.index % n;
  const edit = step.kind === 'damage' ? damageEdit(game, index, step.other % n, step.delta)
    : step.kind === 'mana' ? manaEdit(game, index, step.other % manaColours.length, step.delta)
    : step.kind === 'designation' ? designationEdit(game, designationKinds[step.other % 2], index)
    : countEdit(game, step.kind, index, step.delta);
  if (edit) stack.push(applyNewEdit(game, edit));
}

const stepArb = fc.record({
  kind: fc.constantFrom(...countKinds, 'mana', 'damage', 'designation'),
  index: fc.nat(5), other: fc.nat(11), delta: fc.constantFrom(1, -1, 1, 1),
});
const editGame = anyGame.map(g => {
  // Nearer the thresholds, so players go out and designations hand on.
  g.scores = g.scores.map(s => Math.min(Math.max(s, 1), 25));
  g.turns = 'turns';
  if (g.turn.active === null) g.turn.active = 0;
  return g;
});

test('node: any sequence of edits, undone in reverse, restores the game exactly', () => {
  fc.assert(fc.property(editGame, fc.array(stepArb, { maxLength: 60 }), (g, steps) => {
    const before = structuredClone(g);
    const stack = [];
    for (const s of steps) tap(g, stack, s);
    while (stack.length) applyEdit(g, stack.pop(), -1);
    assert.deepEqual(g, before);
  }), opts);
});

test('node: one edit of each kind, applied and taken back, is the identity on any valid game', () => {
  fc.assert(fc.property(anyGame, stepArb, (g, s) => {
    const before = structuredClone(g);
    const stack = [];
    tap(g, stack, s);
    if (stack.length) applyEdit(g, stack[0], -1);
    assert.deepEqual(g, before);
  }), opts);
});

test('node: counts, damage and pools stay within 0..maxCount, and each designation has at most one valid holder', () => {
  fc.assert(fc.property(editGame, fc.array(stepArb, { maxLength: 80 }), (g, steps) => {
    const stack = [];
    for (const s of steps) {
      tap(g, stack, s);
      assert.deepEqual(gameProblems(g).filter(x => x !== 'scores'), []);
    }
  }), opts);
});

test('node: commander damage to a holder moves the designation to the attacker; taking it away moves nothing', () => {
  const g = load(JSON.stringify({ startingLife: 40, scores: [40, 40, 40], counters: { commander: true, monarch: true, initiative: true }, monarch: 1, initiative: 1 }));
  assert.equal(damageEdit(g, 1, 1, 1), null, 'no damage to yourself');
  assert.deepEqual(damageEdit(g, 1, 2, 1)?.transfers, [{ kind: 'monarch', from: 1, to: 2 }, { kind: 'initiative', from: 1, to: 2 }]);
  g.commanderDamage[1][2] = 3;
  assert.deepEqual(damageEdit(g, 1, 2, -1)?.transfers, []);
  g.commanderDamage[1][2] = maxCount;
  assert.equal(damageEdit(g, 1, 2, 1), null, 'no more than maxCount');
});

// ---- The undo history: logic/history.js (MANA-UNDO-SPEC §6, UNDO-ARCHITECTURE.md §7) ------------------------------

const steps = fc.array(actionArb, { minLength: 1, maxLength: 30 });
// The board fields only, compared as the save compares them.
const boardJson = g => json(boardOf(g));

test('node: every saved field is in exactly one of historyFields and settingsFields', () => {
  const fields = Object.keys(loadGame(() => null, 0));
  for (const field of fields) {
    assert.equal(Number(historyFields.includes(field)) + Number(settingsFields.includes(field)), 1, `${field} is a board field or a setting, not both or neither`);
  }
  assert.deepEqual([...historyFields, ...settingsFields].sort(), [...fields].sort(), 'and the lists name nothing else');
});

test('node: undo ∘ do = id and redo ∘ undo = id, for any action on any game', () => {
  fc.assert(fc.property(anyGame, actionArb, (g, action) => {
    const before = structuredClone(g);
    const board = boardOf(g);
    act(g, action);
    const after = structuredClone(g);
    const step = { t: 0, d: diffBoard(board, boardOf(g)) };
    applyStep(g, step, 'b');
    assert.deepEqual(g, before, 'undo restores the game exactly');
    applyStep(g, step, 'a');
    assert.deepEqual(g, after, 'redo puts the action back');
  }), opts);
});

test('node: after any actions, undoing every step gives the start, and undoing j then redoing j gives the same game', () => {
  fc.assert(fc.property(anyGame, steps, fc.nat(30), (g, actions, j) => {
    // From a game at the end of its own history, so every step since is one of these actions.
    g.history = emptyHistory();
    const start = boardJson(g);
    played(g, actions);
    const end = structuredClone(g);
    const { history } = g;
    const back = j % (history.steps.length + 1);
    for (let at = history.steps.length; at > history.steps.length - back; at--) applyStep(g, history.steps[at - 1], 'b');
    for (let at = history.steps.length - back; at < history.steps.length; at++) applyStep(g, history.steps[at], 'a');
    assert.deepEqual(g, end, 'undo j then redo j');
    for (let at = history.steps.length; at > 0; at--) applyStep(g, history.steps[at - 1], 'b');
    assert.equal(boardJson(g), start, 'undo all');
  }), opts);
});

test('node: a step only restores its own cells, so a change that isn\'t a step survives an unrelated undo', () => {
  fc.assert(fc.property(anyGame, (g) => {
    const board = boardOf(g);
    g.scores[0] -= 3;
    const step = { t: 0, d: diffBoard(board, boardOf(g)) };
    // A colour change and a rotation, which aren't steps, since.
    const free = [...swatches.keys()].find(colour => !g.colors.includes(colour));
    if (free !== undefined) g.colors[1] = free;
    g.rotations[1] = (g.rotations[1] + 1) % 4;
    const colours = json(g.colors);
    const rotations = json(g.rotations);
    applyStep(g, step, 'b');
    assert.equal(g.scores[0], board.scores[0]);
    assert.equal(json(g.colors), colours, 'the colour stays');
    assert.equal(json(g.rotations), rotations, 'the rotation stays');
  }), opts);
});

// Merging a burst (§6.2a): the merged step is the burst's net change, which is the change from its first tap's before
// to its last tap's after, and a burst whose net change is nothing leaves no step.
test('node: merging taps preserves the net change, and a net-zero burst leaves no step', () => {
  const tapArb = fc.record({ delta: fc.integer({ min: -3, max: 3 }), damage: fc.boolean(), attacker: fc.nat(5) });
  fc.assert(fc.property(editGame, fc.array(tapArb, { minLength: 1, maxLength: 25 }), (g, taps) => {
    const n = g.scores.length;
    const start = boardOf(g);
    // The burst's step so far, or null while its net change is nothing, as state/history.js keeps it.
    let open = null;
    for (const { delta, damage, attacker } of taps) {
      const before = boardOf(g);
      // One tile and one count: player 1's life, or the commander damage one attacker dealt them (with any handoff).
      if (damage) {
        const edit = damageEdit(g, 0, 1 + (attacker % (n - 1)), delta < 0 ? -1 : 1);
        if (edit) applyNewEdit(g, edit);
      } else g.scores[0] += delta;
      const step = { t: 0, d: diffBoard(before, boardOf(g)) };
      if (!Object.keys(step.d).length) continue;
      open = open ? mergeStep(open, step) : step;
    }
    const net = diffBoard(start, boardOf(g));
    assert.equal(json(open?.d ?? {}), json(net), 'the merged step is the net change, and nothing is no step');
    // Undoing the merged step goes back to before the burst.
    if (open) applyStep(g, open, 'b');
    assert.equal(json(boardOf(g)), json(start));
  }), opts);
  // −3 then +1 is life 40 → 38, in 4 taps; +2 then −2 is nothing.
  const one = d => ({ t: 1, d: { scores: { 2: d } } });
  const burst = [[40, 39], [39, 38], [38, 37], [37, 38]].map(one).reduce((a, b) => mergeStep(a, b));
  assert.deepEqual(burst, { t: 1, n: 4, d: { scores: { 2: [40, 38] } } });
  assert.equal(mergeStep(one([40, 42]), one([42, 40])), null);
});

test('node: composing two deltas is the delta across both, whatever the fields and counts', () => {
  fc.assert(fc.property(anyGame, actionArb, actionArb, (g, first, second) => {
    const a = boardOf(g);
    act(g, first);
    const b = boardOf(g);
    act(g, second);
    const c = boardOf(g);
    assert.equal(json(composeChanges(diffBoard(a, b), diffBoard(b, c))), json(diffBoard(a, c)));
  }), opts);
});

test('node: steps overlap exactly when they touch a cell in common', () => {
  const life2 = stepCells({ scores: { 2: [40, 39] } });
  assert.equal(overlaps(life2, stepCells({ scores: { 3: [40, 39] } })), false, 'another tile\'s life');
  assert.equal(overlaps(life2, stepCells({ scores: { 2: [39, 38] }, monarch: [2, 1] })), true, 'the same total');
  assert.equal(overlaps(life2, stepCells({ scores: [[40, 40], [40, 40, 40]] })), true, 'a whole value touches every cell');
  assert.equal(overlaps(stepCells({ pools: { 1: { 3: [1, 0] } } }), stepCells({ pools: { 1: { 4: [1, 0] } } })), false, 'another colour');
  assert.equal(overlaps(stepCells({ monarch: [null, 1] }), stepCells({ monarch: [1, 2] })), true);
});

// The cap (§6.1): at most 500 steps and 64 KB, the oldest dropped first, Forward counted, and `at` kept in step.
test('node: the history stays within 500 steps and 64 KB, dropping the oldest', () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 800 }), fc.nat(40), fc.integer({ min: 1, max: 400 }), (count, back, width) => {
    const history = emptyHistory();
    for (let t = 0; t < count; t++) {
      history.steps.length = history.at;
      history.steps.push({ t, d: { scores: Object.fromEntries(Array.from({ length: 1 + (t % 3) }, (_, i) => [i, [t, t + width]])) } });
      history.at = history.steps.length;
      trimHistory(history);
      assert.ok(history.steps.length <= historyCap, 'at most 500 steps');
      assert.ok(JSON.stringify(history.steps).length <= historyBytes, 'at most 64 KB');
      assert.equal(history.at, history.steps.length);
    }
    if (history.steps.length) assert.equal(history.steps.at(-1).t, count - 1, 'the newest step is kept');
    // With Forward steps: they count, and `at` stays on the same step among those kept.
    history.at = Math.max(0, history.steps.length - back);
    const kept = history.steps[history.at];
    history.steps.push(...Array.from({ length: 30 }, (_, t) => ({ t, d: { poison: { 0: [0, 1] } } })));
    trimHistory(history);
    assert.ok(history.steps.length <= historyCap);
    if (kept && history.at < history.steps.length) assert.equal(history.steps[history.at], kept, '`at` still points at the same step');
  }), { ...opts, numRuns: Math.min(opts.numRuns, 25) });
});

// fitHistory (§10): anything at all never throws and gives a valid history, a valid one round-trips, and a bad step
// drops itself and everything further from `at`, including across a change of player count.
test('node: fitHistory accepts anything without throwing, and gives a valid history', () => {
  const cell = fc.oneof(fc.anything(), fc.tuple(nearMiss, nearMiss), fc.dictionary(fc.constantFrom('0', '1', '2', '7', '-1', 'x'), fc.tuple(nearMiss, nearMiss)));
  const weird = fc.oneof(fc.anything(), fc.jsonValue(), fc.record({ v: fc.constant(1), at: fc.anything(), base: fc.anything(), steps: fc.array(fc.anything()) }),
    fc.record({ v: fc.constant(1), at: fc.nat(5), base: fc.nat(), steps: fc.array(fc.record({ t: fc.anything(), k: fc.anything(), n: fc.anything(), d: fc.dictionary(fc.constantFrom(...historyFields, 'treasure', 'x'), cell) })) }));
  fc.assert(fc.property(weird, fc.constantFrom(...playerCounts), (saved, n) => {
    const fitted = fitHistory(saved, n);
    assert.deepEqual(historyProblems(fitted, n), []);
  }), opts);
  assert.deepEqual(fitHistory(undefined, 4), emptyHistory(), 'a save from before Undo gets an empty history');
  assert.deepEqual(fitHistory({ v: 2, at: 0, steps: [] }, 4), emptyHistory(), 'an unknown version is empty');
});

test('node: a valid history round-trips through JSON and fitHistory unchanged', () => {
  fc.assert(fc.property(anyGame, (g) => {
    assert.equal(json(fitHistory(JSON.parse(json(g.history)), g.scores.length)), json(g.history));
  }), opts);
});

test('node: a corrupt step drops itself and every step further from at; at is clamped; the game is untouched', () => {
  const life = (i, b, a) => ({ t: 0, d: { scores: { [i]: [b, a] } } });
  const ok = [life(0, 40, 39), life(1, 40, 38), life(2, 40, 37), life(3, 40, 36)];
  const fit = (list, at, n = 4) => fitHistory({ v: 1, at, base: 5, steps: list }, n);
  assert.deepEqual(fit(ok, 4).steps, ok, 'valid steps are kept');
  assert.equal(fit(ok, 9).at, 4, 'an `at` past the end is the end');
  assert.equal(fit(ok, -1).at, 4);
  assert.equal(fit(ok, 1.5).at, 4);
  const bad = [life(0, 40, 39), life(9, 40, 38), life(2, 40, 37), life(3, 40, 36)];
  assert.deepEqual(fit(bad, 4), { v: 1, at: 2, base: 5, steps: [life(2, 40, 37), life(3, 40, 36)] }, 'an index out of range drops it and everything older');
  assert.deepEqual(fit(bad, 1), { v: 1, at: 1, base: 5, steps: [life(0, 40, 39)] }, 'ahead of at, everything newer goes');
  assert.deepEqual(fit([life(0, 40, '39')], 1).steps, [], 'a value that fails its field\'s check');
  assert.deepEqual(fit([{ t: 0, d: { scores: { 0: [40, 40] } } }], 1).steps, [], 'a cell that doesn\'t change');
  assert.deepEqual(fit([{ t: 0, d: { treasure: { 0: [0, 1] }, scores: { 0: [40, 39] } } }], 1).steps, [life(0, 40, 39)], 'a field it doesn\'t know is left out');
  // Across a new game from 4 players to 6: the steps before it are checked against 4 players, the ones after against 6.
  const newGame = { t: 0, k: 'newGame', d: { scores: [[40, 40, 40, 40], [30, 30, 30, 30, 30, 30]] } };
  assert.equal(fit([life(3, 40, 39), newGame, life(5, 30, 29)], 3, 6).steps.length, 3, 'each side of a count change has its own count');
  assert.equal(fit([life(5, 40, 39), newGame, life(5, 30, 29)], 3, 6).steps.length, 2, 'a step before it is checked against 4 players');
  assert.equal(fit([newGame, life(5, 30, 29)], 1, 6).at, 1, 'with a step ahead');
  assert.deepEqual(fit([newGame, life(5, 30, 29)], 0, 6).steps, [], 'at 0 the game has 6 players, so a new game from 4 ahead of it is wrong');
  // A history that's corrupt never touches the rest of the save.
  const save = { startingLife: 40, scores: [39, 40, 40, 40], history: { v: 1, at: 'x', base: null, steps: [null, life(0, 40, 39)] } };
  const loaded = load(JSON.stringify(save));
  assert.deepEqual(loaded.scores, [39, 40, 40, 40]);
  assert.deepEqual(loaded.history, { v: 1, at: 1, base: 0, steps: [life(0, 40, 39)] });
});

// What each step says (§6.7), for Undo's name, the toast and the announcement.
test('node: describeStep and stepText say what each kind of step changed', () => {
  const g = load(JSON.stringify({ startingLife: 40, scores: [40, 40, 40, 40], colors: [0, 1, 2, 3], tileColours: 'classic', turns: 'turns' }));
  const text = d => stepText({ t: 0, d }, g);
  const cases = [
    [{ scores: { 2: [38, 37] } }, 'Player 3, Coral, life 38 → 37'],
    [{ scores: { 0: [1, -2] } }, 'Player 1, Sage, life 1 → −2'],
    [{ poison: { 1: [2, 3] } }, 'Player 2, Sky, poison 2 → 3'],
    [{ casts: { 0: [1, 2] } }, 'Player 1, Sage, commander tax +2 → +4'],
    [{ commanderDamage: { 1: { 0: [0, 5] } }, scores: { 1: [33, 28] } }, 'Player 2, Sky, 5 commander damage from Player 1, life 33 → 28'],
    [{ commanderDamage: { 1: { 0: [5, 3] } } }, 'Player 2, Sky, commander damage from Player 1 5 → 3'],
    [{ pools: { 3: { 3: [1, 0] } } }, 'Player 4, Violet, red mana 1 → 0'],
    [{ monarch: [3, 1] }, 'Player 2, Sky, monarch: Player 4 → Player 2. Player 4, Violet, monarch: Player 4 → Player 2'],
    [{ initiative: [null, 0] }, 'Player 1, Sage, initiative: nobody → Player 1'],
    [{ turn: [{ first: 0, active: 0, round: 3 }, { first: 0, active: 1, round: 3 }] }, 'turn: Player 1 → Player 2, round 3'],
  ];
  for (const [d, words] of cases) assert.equal(text(d), words);
  assert.equal(stepText({ t: 0, k: 'eraser', d: { pools: { 0: { 0: [2, 0], 3: [1, 0] } } } }, g), 'Player 1, Sage, mana pool emptied');
  assert.equal(stepText({ t: 0, k: 'newGame', d: { scores: [[40, 40, 40, 40], [40, 40]] } }, g), 'new game');
  const rounds = { ...g, turns: 'rounds' };
  assert.equal(stepText({ t: 0, k: 'turn', d: { turn: [{ first: 0, active: null, round: 2 }, { first: 0, active: null, round: 3 }], pools: { 0: { 0: [1, 0] } } } }, rounds), 'round 2 → 3. mana pools emptied');
  assert.deepEqual(describeStep({ t: 0, k: 'turn', d: { turn: [{ first: 0, active: 0, round: 1 }, { first: 0, active: 1, round: 1 }] } }, g).label, 'turn pass');
});

// ---- The centre pill's form (design/polish/PILL-SPEC.md, as built) --------------------------------------------------

// Three buttons for commander damage, counters and mana where every button the pill can show fits its seam at full size;
// otherwise one Track button with a tab for each in its mode; and 44px buttons only where even Track doesn't fit.
test('node: the pill keeps separate buttons where they fit, takes Track where they don\'t, and shrinks only past that', () => {
  const all = load(JSON.stringify({ scores: [40, 40], counters: { commander: true, poison: true }, manaPool: true, turns: 'turns' }));
  assert.deepEqual(trackTabs(all), ['damage', 'counters', 'mana']);
  assert.equal(restPillButtons(all), 4 + pillTools, 'the round, three modes and the tools');
  assert.equal(restPillButtons(all, { collapsed: true }), 2 + pillTools, 'the round, Track and the tools');
  assert.equal(widestPill(all, { collapsed: true }), 6, 'Track\'s mode: three tabs, Undo, save and ✕');
  assert.equal(pillTools, 4, 'Undo, card lookup\'s magnifier, the dice and settings');
  assert.equal(widestPill(all, { collapsed: true, tools: 3 }), 6, 'without the magnifier, Track\'s mode is the longest');
  // 568 × 320 with 2 players: 312px of seam.
  assert.deepEqual(pillFit(all, 312, 48), { collapsed: true, tight: false }, '8 buttons are 384px, Track\'s 6 are 288px');
  assert.deepEqual(pillFit(all, 312, 48, 3), { collapsed: true, tight: false }, 'without the magnifier too');
  // 568 × 320 with 3 players: the 283px seam column.
  assert.deepEqual(pillFit(all, 275, 48), { collapsed: true, tight: true }, 'Track\'s mode is 288px, so 44px buttons');
  // 952 × 427 with 4 players.
  assert.deepEqual(pillFit(all, 944, 48), { collapsed: false, tight: false });
  // 640 × 360 with 2 players: seven fit at 48px, the eight with the magnifier don't.
  assert.deepEqual(pillFit(all, 352, 48, 3), { collapsed: false, tight: false });
  assert.deepEqual(pillFit(all, 352, 48), { collapsed: true, tight: false });
  // Exactly at the boundary, it fits.
  assert.equal(pillFit(all, 8 * 48, 48).collapsed, false);
  assert.equal(pillFit(all, 8 * 48 - 1, 48).collapsed, true);
  // Commander alone has two tabs, since commander tax is a counter.
  const commander = { ...all, counters: { ...all.counters, poison: false }, manaPool: false };
  assert.deepEqual(trackTabs(commander), ['damage', 'counters']);
  // One mode on: Track would be its own button, so there's nothing to collapse, only the shrink.
  const one = { ...commander, counters: { ...commander.counters, commander: false }, manaPool: true };
  assert.deepEqual(trackTabs(one), ['mana']);
  assert.deepEqual(pillFit(one, 200, 48), { collapsed: false, tight: true });
  // None on: the round and the tools.
  const none = { ...one, manaPool: false };
  assert.equal(widestPill(none, { collapsed: true }), 1 + pillTools);
});

test('node: the pill\'s form follows only its inputs, and more room never takes Track where less room kept the buttons', () => {
  fc.assert(fc.property(anyGame, fc.integer({ min: 100, max: 1400 }), fc.integer({ min: 0, max: 200 }), fc.constantFrom(48, 56, 64), fc.constantFrom(pillTools, pillTools + 1), (g, room, more, natural, tools) => {
    const small = pillFit(g, room, natural, tools);
    assert.deepEqual(pillFit(g, room, natural, tools), small, 'the same inputs, the same form');
    const large = pillFit(g, room + more, natural, tools);
    if (!small.collapsed) assert.equal(large.collapsed, false);
    if (!small.tight) assert.equal(large.tight, false);
    if (small.collapsed) assert.ok(trackTabs(g).length > 1, 'Track only with two or more tabs');
  }), opts);
});

test('node: Track opens on the tab it last showed, or the first that\'s still on, and Undo knows each step\'s tab', () => {
  const g = load(JSON.stringify({ scores: [40, 40], counters: { commander: true, poison: true }, manaPool: true }));
  assert.equal(g.trackTab, 'damage', 'a save from before Track opens on its first tab');
  assert.equal(load(JSON.stringify({ trackTab: 'treasure' })).trackTab, 'damage', 'an unknown tab is the first');
  assert.equal(load(JSON.stringify({ trackTab: 'mana' })).trackTab, 'mana');
  assert.equal(openingTab({ ...g, trackTab: 'mana' }), 'mana');
  assert.equal(openingTab({ ...g, trackTab: 'mana', manaPool: false }), 'damage', 'a tab switched off falls back to the first');
  assert.equal(openingTab({ ...g, trackTab: 'damage', counters: { commander: false, poison: true } }), 'counters');
  assert.equal(stepTab({ t: 0, d: { commanderDamage: { 1: { 0: [0, 1] } }, scores: { 1: [40, 39] }, monarch: [0, 1] } }), 'damage');
  assert.equal(stepTab({ t: 0, d: { pools: { 0: { 2: [0, 1] } } } }), 'mana');
  assert.equal(stepTab({ t: 0, d: { poison: { 0: [0, 1] } } }), 'counters');
  assert.equal(stepTab({ t: 0, d: { initiative: [null, 1] } }), 'counters');
});
