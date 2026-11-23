// Property tests for the pure game logic in web/js/logic/, in Node with no browser (docs/review/LOGIC-AND-STATIC.md).
// fast-check picks a seed and prints it with the shrunk counterexample on a failure. PBT_RUNS sets the cases per property
// (500 by default, about a second for the file); PBT_RUNS=20000 is a deep run.
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  badgeSizeOrder, countKinds, designationKinds, identityBackgrounds, identityParts, identitySettingsVersion, manaColours,
  maxCount, maxRound, maxStartingLife, playOrders, playerCounts, reminderKinds, styleOrder, swatches, tileSetOrder, trackers,
  turnModes,
} from '../web/js/logic/data.js';
import {
  applyEdit, applyNewEdit, countEdit, damageEdit, designationEdit, isOut, leavingTransfers, manaEdit, nextTurn, outPlayers,
  playOrder, previousTurn, turnBack, turnForward,
} from '../web/js/logic/rules.js';
import { loadGame } from '../web/js/logic/save.js';
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
  return p;
}

// The fields that hold one entry per seat, so they mean nothing without a board to fit them to, and the rest.
const perPlayerFields = ['scores', 'rotations', 'colors', ...countKinds, 'identities', 'commanderDamage', 'pools', 'turn', 'monarch', 'initiative'];

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
});
const anyGame = fc.constantFrom(...playerCounts).chain(gameOf);

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
