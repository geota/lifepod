// The game's undo history (MANA-UNDO-SPEC §6, UNDO-ARCHITECTURE.md), as pure functions: a copy of the board fields, the
// per-field delta between two copies, applying a step's before- or after-values, merging a burst of taps into one step,
// the cap, the words that describe a step, and fitHistory, which checks a saved history. No DOM and no state.
//
// A step is { t, k?, n?, d }: t is seconds since the history began (base), k a label for steps that aren't just their
// cells (a turn pass, the eraser), n how many taps a burst merged, and d its delta, by board field:
// - a per-player field's delta is { index: [before, after] }, such as { scores: { 2: [38, 37] } };
// - a grid's (commanderDamage, pools) is { i: { j: [before, after] } };
// - a scalar's (startingLife, turn, monarch, initiative) is the whole [before, after], and so is an array's whose shape
//   changed.
// A new game isn't a step: it empties the history (SPEC §10.2), so every step is on a board of one player count.

import {
  countKinds, historyBytes, historyCap, historyFields, historyVersion, manaColours, maxCount, maxRound, maxStartingLife,
  stepKinds, swatches, tileSets,
} from './data.js';

/** @typedef {import('./save.js').Game} Game */
/** @typedef {import('./data.js').StepKind} StepKind */
/** @typedef {[any, any]} Pair */
/** @typedef {Record<string, any>} Changes */
/**
 * @typedef {object} Step
 * @property {number} t Seconds since the history's base.
 * @property {StepKind} [k] What kind of step it is, where its cells alone don't say.
 * @property {number} [n] How many taps a burst merged, when more than one.
 * @property {Changes} d The delta, by board field.
 */
/**
 * @typedef {object} History
 * @property {number} v historyVersion.
 * @property {number} at How many steps are applied: Undo takes back steps[at - 1], Redo applies steps[at].
 * @property {number} base When the history began, in epoch milliseconds (0 until its first step).
 * @property {Step[]} steps Oldest first.
 */

// The board fields by shape. Every other board field holds one value per player.
const scalarFields = ['startingLife', 'turn', 'monarch', 'initiative'];
const gridFields = ['commanderDamage', 'pools'];
const isScalar = (/** @type {string} */ field) => scalarFields.includes(field);
const isGrid = (/** @type {string} */ field) => gridFields.includes(field);

/** @returns {History} */
export function emptyHistory() {
  return { v: historyVersion, at: 0, base: 0, steps: [] };
}

// A copy of a board value: numbers, strings and null as they are, arrays and the turn copied all the way down.
/** @param {any} value @returns {any} */
function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object') return { ...value };
  return value;
}

// Two board values alike. A turn is alike field by field, whatever order its keys were written in.
/** @param {any} a @param {any} b @returns {boolean} */
function same(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => same(value, b[index]));
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => same(a[key], b[key]));
  }
  return false;
}

// The board fields of a game, copied: what undo restores (historyFields in data.js).
/** @param {Game} game @returns {Record<string, any>} */
export function boardOf(game) {
  /** @type {Record<string, any>} */
  const board = {};
  const source = /** @type {Record<string, any>} */ (game);
  for (const field of historyFields) board[field] = copy(source[field]);
  return board;
}

// What changed between two copies of the board, as a step's delta. Empty when nothing did.
/** @param {Record<string, any>} before @param {Record<string, any>} after @returns {Changes} */
export function diffBoard(before, after) {
  /** @type {Changes} */
  const d = {};
  for (const field of historyFields) {
    const change = diffField(field, before[field], after[field]);
    if (change !== undefined) d[field] = change;
  }
  return d;
}

// One field's change, in its smallest form: per-player and grid fields as their changed cells while the shape is the
// same, a whole [before, after] pair otherwise; undefined when nothing changed. diffBoard and composeChanges share it,
// so a step reads the same however it was made.
/** @param {string} field @param {any} b @param {any} a */
function diffField(field, b, a) {
  if (isScalar(field) || !Array.isArray(b) || !Array.isArray(a) || b.length !== a.length) {
    return same(b, a) ? undefined : [copy(b), copy(a)];
  }
  /** @type {Record<string, any>} */
  const cells = {};
  if (isGrid(field)) {
    if (b.some((row, i) => row.length !== a[i].length)) return [copy(b), copy(a)];
    b.forEach((row, i) => row.forEach((/** @type {any} */ value, /** @type {number} */ j) => {
      if (value !== a[i][j]) (cells[i] ??= {})[j] = [value, a[i][j]];
    }));
  } else {
    b.forEach((value, i) => {
      if (value !== a[i]) cells[i] = [value, a[i]];
    });
  }
  return Object.keys(cells).length ? cells : undefined;
}

// Sets a per-player or grid field's cells to one side of their pairs (0 before, 1 after), in place.
/** @param {any[]} target @param {Record<string, any>} cells @param {0 | 1} side @param {boolean} grid */
function setCells(target, cells, side, grid) {
  for (const [i, value] of Object.entries(cells)) {
    if (grid) for (const [j, pair] of Object.entries(value)) target[Number(i)][Number(j)] = pair[side];
    else target[Number(i)] = value[side];
  }
}

// Puts a step's before-values ('b': undo) or after-values ('a': redo) into the game, touching only its cells, so a
// change made since by something that isn't a step, such as a new tile colour, survives (MANA-UNDO-SPEC §6.4).
/** @param {Game} game @param {Step} step @param {'b' | 'a'} side */
export function applyStep(game, step, side) {
  const at = side === 'b' ? 0 : 1;
  const target = /** @type {Record<string, any>} */ (game);
  for (const [field, delta] of Object.entries(step.d)) {
    if (Array.isArray(delta)) target[field] = copy(delta[at]);
    else setCells(target[field], delta, at, isGrid(field));
  }
}

// Two deltas one after the other as one: the first's before-values and the second's after-values, cell by cell. A cell
// back where it started drops out, and so does a field with no cells left.
/** @param {Changes} first @param {Changes} second @returns {Changes} */
export function composeChanges(first, second) {
  /** @type {Changes} */
  const d = {};
  for (const field of historyFields) {
    const x = first[field];
    const y = second[field];
    if (x === undefined && y === undefined) continue;
    if (x === undefined || y === undefined) {
      d[field] = copy(x ?? y);
      continue;
    }
    const grid = isGrid(field);
    if (Array.isArray(x) || Array.isArray(y)) {
      // A whole value on either side makes the whole value: the cells on the other side are set on its copy.
      /** @type {Pair} */
      let pair;
      if (Array.isArray(x) && Array.isArray(y)) pair = [copy(x[0]), copy(y[1])];
      else if (Array.isArray(x)) {
        const after = copy(x[1]);
        setCells(after, y, 1, grid);
        pair = [copy(x[0]), after];
      } else {
        const before = copy(y[0]);
        setCells(before, x, 0, grid);
        pair = [before, copy(y[1])];
      }
      // Back in the same shape, the whole pair shrinks to its changed cells, as diffBoard would write it.
      const change = diffField(field, pair[0], pair[1]);
      if (change !== undefined) d[field] = change;
      continue;
    }
    /** @type {Record<string, any>} */
    const cells = {};
    /** @param {any} xs @param {any} ys @param {Record<string, any>} into */
    const mergeRow = (xs, ys, into) => {
      for (const i of new Set([...Object.keys(xs ?? {}), ...Object.keys(ys ?? {})])) {
        const before = xs?.[i] ? xs[i][0] : ys[i][0];
        const after = ys?.[i] ? ys[i][1] : xs[i][1];
        if (before !== after) into[i] = [before, after];
      }
    };
    if (grid) {
      for (const i of new Set([...Object.keys(x), ...Object.keys(y)])) {
        /** @type {Record<string, any>} */
        const row = {};
        mergeRow(x[i], y[i], row);
        if (Object.keys(row).length) cells[i] = row;
      }
    } else mergeRow(x, y, cells);
    if (Object.keys(cells).length) d[field] = cells;
  }
  return d;
}

// A burst's open step with one more tap merged in (MANA-UNDO-SPEC §6.2a): the first tap's before-values, the latest
// after-values and time, and the taps counted. null when the burst's net change is nothing, which leaves no step.
/** @param {Step} open @param {Step} next @returns {Step | null} */
export function mergeStep(open, next) {
  const d = composeChanges(open.d, next.d);
  if (!Object.keys(d).length) return null;
  return { t: next.t, ...(open.k ? { k: open.k } : {}), n: (open.n ?? 1) + (next.n ?? 1), d };
}

// The cells a step's delta touches, by field: the set of 'i' or 'i.j' keys, or 'all' for a whole value.
/** @param {Changes} d @returns {Map<string, Set<string> | 'all'>} */
export function stepCells(d) {
  /** @type {Map<string, Set<string> | 'all'>} */
  const cells = new Map();
  for (const [field, delta] of Object.entries(d)) {
    if (Array.isArray(delta)) cells.set(field, 'all');
    else {
      cells.set(field, new Set(Object.entries(delta)
        .flatMap(([i, value]) => (isGrid(field) ? Object.keys(value).map(j => `${i}.${j}`) : [i]))));
    }
  }
  return cells;
}

// What mana mode and Track's mana tab change: the pools, Treasure and each player's Keep (MANA-SPEC-v2 §5.3).
const manaFields = ['pools', 'treasure', 'keepMana'];

// The Track tab a step taken in an editing mode belongs to (PILL-SPEC.md §3.2): commander damage (which changes life,
// and can pass the monarch or the initiative), mana (the pools, Treasure and Keep), or counters (the counts and the
// designations).
/**
 * @param {Step} step
 * @returns {import('./data.js').TrackTab}
 */
export function stepTab(step) {
  if ('commanderDamage' in step.d) return 'damage';
  return manaFields.some(field => field in step.d) ? 'mana' : 'counters';
}

// Whether two steps touch any cell in common.
/** @param {Map<string, Set<string> | 'all'>} a @param {Map<string, Set<string> | 'all'>} b */
export function overlaps(a, b) {
  for (const [field, cells] of a) {
    const other = b.get(field);
    if (!other) continue;
    if (cells === 'all' || other === 'all') return true;
    for (const cell of cells) if (other.has(cell)) return true;
  }
  return false;
}

// Drops the oldest steps until the history holds at most historyCap of them and historyBytes of JSON, in place. Forward
// steps count toward the cap; should the steps taken not be enough to drop, Forward goes first, since a step ahead only
// makes sense after every step before it. sizeOf may cache each step's size.
/** @param {History} history @param {(step: Step) => number} [sizeOf] */
export function trimHistory(history, sizeOf = step => JSON.stringify(step).length) {
  let drop = Math.max(0, history.steps.length - historyCap);
  let bytes = 0;
  for (let index = history.steps.length - 1; index >= drop; index--) {
    bytes += sizeOf(history.steps[index]) + 1;
    if (bytes > historyBytes) {
      drop = index + 1;
      break;
    }
  }
  if (!drop) return;
  if (drop > history.at) {
    history.steps.length = history.at;
    trimHistory(history, sizeOf);
    return;
  }
  history.steps.splice(0, drop);
  history.at -= drop;
}

// ---- Words -----------------------------------------------------------------------------------------------------

/** @param {Game} game @param {number} index */
export function seatWords(game, index) {
  const name = tileSets[game.tileColours]?.names[game.colors[index]];
  return name ? `Player ${index + 1}, ${name}` : `Player ${index + 1}`;
}
/** @param {number | null} index */
const seatOf = index => (index === null ? 'nobody' : `Player ${index + 1}`);
/** @param {number} value */
const number = value => String(value).replace('-', '−');
const countWords = /** @type {Record<string, string>} */ ({ poison: 'poison', energy: 'energy', experience: 'experience', rad: 'rad' });
/** @type {Record<string, string>} */
const kindLabels = { turn: 'turn pass', turnBack: 'step back', first: 'who goes first', start: 'turn start', eraser: 'mana pool emptied' };

/**
 * What a step changed, in words (MANA-UNDO-SPEC §6.7): what each player's tile changed (life 38 → 37), and what changed
 * for the table (a turn pass, a round). game is the board after the step was applied or taken back, for the seats'
 * names. A designation's handoff is on both players' tiles.
 *
 * @param {Step} step
 * @param {Game} game
 * @returns {{ tiles: { index: number, words: string[] }[], table: string[], label: string | null }}
 */
export function describeStep(step, game) {
  /** @type {Map<number, string[]>} */
  const tiles = new Map();
  /** @param {number} index @param {string} words */
  const say = (index, words) => tiles.set(index, [...(tiles.get(index) ?? []), words]);
  /** @type {string[]} */
  const table = [];
  const { d, k } = step;
  const label = k ? kindLabels[k] ?? null : null;
  /** @param {string} field @param {(index: number, b: any, a: any) => void} each */
  const perCell = (field, each) => {
    const delta = d[field];
    if (!delta || Array.isArray(delta)) return;
    for (const [i, pair] of Object.entries(delta)) each(Number(i), pair[0], pair[1]);
  };
  perCell('scores', (index, b, a) => say(index, `life ${number(b)} → ${number(a)}`));
  for (const kind of countKinds) {
    perCell(kind, (index, b, a) => say(index, kind === 'casts' ? `commander tax +${b * 2} → +${a * 2}` : `${countWords[kind]} ${b} → ${a}`));
  }
  const damage = d.commanderDamage;
  if (damage && !Array.isArray(damage)) {
    for (const [i, row] of Object.entries(damage)) {
      for (const [j, [b, a]] of Object.entries(/** @type {Record<string, Pair>} */ (row))) {
        say(Number(i), a > b ? `${a - b} commander damage from Player ${Number(j) + 1}` : `commander damage from Player ${Number(j) + 1} ${b} → ${a}`);
      }
    }
    // Life lost to commander damage reads after the damage that cost it.
    for (const [index, words] of tiles) tiles.set(index, [...words.filter(word => !word.startsWith('life')), ...words.filter(word => word.startsWith('life'))]);
  }
  const pools = d.pools;
  if (pools && !Array.isArray(pools)) {
    for (const [i, row] of Object.entries(pools)) {
      if (k === 'eraser') say(Number(i), 'mana pool emptied');
      else if (k === 'turn' || k === 'turnBack') continue;
      else {
        for (const [j, [b, a]] of Object.entries(/** @type {Record<string, Pair>} */ (row))) say(Number(i), `${manaColours[Number(j)].name} mana ${b} → ${a}`);
      }
    }
  }
  perCell('treasure', (index, b, a) => say(index, `Treasure ${b} → ${a}`));
  perCell('keepMana', (index, _b, a) => say(index, `Keep mana ${a ? 'on' : 'off'}`));
  perCell('identities', (index, b, a) => say(index, `identity ${b || 'none'} → ${a || 'none'}`));
  for (const kind of /** @type {const} */ (['monarch', 'initiative'])) {
    const pair = d[kind];
    if (!pair) continue;
    const words = `${kind}: ${seatOf(pair[0])} → ${seatOf(pair[1])}`;
    const holders = [pair[0], pair[1]].filter(index => index !== null);
    if (holders.length) for (const index of holders) say(index, words);
    else table.push(words);
  }
  if (d.turn) {
    const [b, a] = d.turn;
    table.push(game.turns === 'turns' && (b.active !== null || a.active !== null)
      ? `turn: ${seatOf(b.active)} → ${seatOf(a.active)}, round ${a.round}`
      : `round ${b.round} → ${a.round}`);
    if (pools) table.push('mana pools emptied');
  }
  return { tiles: [...tiles].sort(([a], [b]) => a - b).map(([index, words]) => ({ index, words })), table, label };
}

// A step in one line, for Undo's name, the announcements and History: each tile's seat and what changed there, then what
// changed for the table, such as "Player 3, Coral, life 38 → 37" or "turn: Player 1 → Player 2, round 3".
/** @param {Step} step @param {Game} game */
export function stepText(step, game) {
  const { tiles, table, label } = describeStep(step, game);
  return [...tiles.map(({ index, words }) => `${seatWords(game, index)}, ${words.join(', ')}`), ...table].join('. ') || label || 'a change';
}

// ---- Loading a saved history --------------------------------------------------------------------------------------

/** @param {any} value @param {number} n */
const seatOrNobody = (value, n) => value === null || (Number.isInteger(value) && value >= 0 && value < n);

// Each board field's check of one value, for a board of n players: a per-player field's cell, a grid's cell at (i, j),
// or a scalar. A whole array is checked by its length and each cell.
/** @type {Record<string, (value: any, n: number, i: number, j: number) => boolean>} */
const cellChecks = {
  startingLife: value => Number.isSafeInteger(value) && value >= 1 && value <= maxStartingLife,
  scores: value => Number.isSafeInteger(value),
  rotations: value => Number.isInteger(value) && value >= 0 && value <= 3,
  colors: value => Number.isInteger(value) && value >= 0 && value < swatches.length,
  ...Object.fromEntries(countKinds.map(kind => [kind, (/** @type {any} */ value) => Number.isInteger(value) && value >= 0 && value <= maxCount])),
  // Letters in W U B R G order, each at most once, as normalizeIdentity in save.js writes them.
  identities: value => typeof value === 'string' && /^W?U?B?R?G?$/.test(value),
  commanderDamage: (value, _n, i, j) => Number.isInteger(value) && value >= 0 && value <= maxCount && (i !== j || value === 0),
  pools: value => Number.isInteger(value) && value >= 0 && value <= maxCount,
  treasure: value => Number.isInteger(value) && value >= 0 && value <= maxCount,
  keepMana: value => typeof value === 'boolean',
  // As fitTurn in save.js keeps it: exactly first, active and round.
  turn: (value, n) => !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join() === 'active,first,round' && seatOrNobody(value.first, n) && seatOrNobody(value.active, n)
    && Number.isInteger(value.round) && value.round >= 1 && value.round <= maxRound,
  monarch: (value, n) => seatOrNobody(value, n),
  initiative: (value, n) => seatOrNobody(value, n),
};
/** @param {string} field @param {number} n */
const rowLength = (field, n) => (field === 'pools' ? manaColours.length : n);

// A whole value of a board field, for n players.
/** @param {string} field @param {any} value @param {number} n */
function wholeValid(field, value, n) {
  const check = cellChecks[field];
  if (isScalar(field)) return check(value, n, 0, 0);
  if (!Array.isArray(value) || value.length !== n) return false;
  // Tile colours are distinct, as fitColors keeps them.
  if (field === 'colors' && new Set(value).size !== n) return false;
  if (!isGrid(field)) return value.every((cell, i) => check(cell, n, i, 0));
  return value.every((row, i) => Array.isArray(row) && row.length === rowLength(field, n) && row.every((cell, j) => check(cell, n, i, j)));
}

/** @param {any} pair */
const isPair = pair => Array.isArray(pair) && pair.length === 2;
/** @param {string} key @param {number} below */
const indexIn = (key, below) => /^(0|[1-9]\d*)$/.test(key) && Number(key) < below;

// A saved step's delta, checked cell by cell for a board of n players; or null if any cell is wrong. A field it doesn't
// know, such as one a later version removed, is left out (UNDO-ARCHITECTURE §8).
/** @param {any} saved @param {number} n @returns {Changes | null} */
function fitChanges(saved, n) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
  /** @type {Changes} */
  const d = {};
  for (const [field, delta] of Object.entries(saved)) {
    if (!historyFields.includes(field)) continue;
    const check = cellChecks[field];
    if (Array.isArray(delta)) {
      if (!isPair(delta) || !wholeValid(field, delta[0], n) || !wholeValid(field, delta[1], n) || same(delta[0], delta[1])) return null;
      d[field] = [copy(delta[0]), copy(delta[1])];
      continue;
    }
    if (isScalar(field) || !delta || typeof delta !== 'object') return null;
    /** @type {Record<string, any>} */
    const cells = {};
    for (const [i, value] of Object.entries(delta)) {
      if (!indexIn(i, n)) return null;
      if (isGrid(field)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        /** @type {Record<string, Pair>} */
        const row = {};
        for (const [j, pair] of Object.entries(value)) {
          if (!indexIn(j, rowLength(field, n)) || !isPair(pair) || pair[0] === pair[1]) return null;
          if (!check(pair[0], n, Number(i), Number(j)) || !check(pair[1], n, Number(i), Number(j))) return null;
          row[j] = [pair[0], pair[1]];
        }
        if (!Object.keys(row).length) return null;
        cells[i] = row;
      } else {
        if (!isPair(value) || value[0] === value[1] || !check(value[0], n, Number(i), 0) || !check(value[1], n, Number(i), 0)) return null;
        cells[i] = [value[0], value[1]];
      }
    }
    if (!Object.keys(cells).length) return null;
    d[field] = cells;
  }
  return Object.keys(d).length ? d : null;
}

// A saved step, checked: its delta for a board of n players, with t a whole number of seconds or more and k and n only
// where they're valid. null if its delta is wrong, or if it's a new game: saves from before a new game emptied the
// history kept one as a step (k 'newGame'), and the history now begins after it.
/** @param {any} saved @param {number} n @returns {Step | null} */
function fitStep(saved, n) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || saved.k === 'newGame') return null;
  const d = fitChanges(saved.d, n);
  if (!d) return null;
  /** @type {Step} */
  const step = /** @type {Step} */ ({ t: Number.isFinite(saved.t) && saved.t >= 0 ? saved.t : 0 });
  if (stepKinds.includes(saved.k)) step.k = saved.k;
  if (Number.isInteger(saved.n) && saved.n > 1) step.n = saved.n;
  step.d = d;
  return step;
}

// A saved history, checked (MANA-UNDO-SPEC §10): never throws, and the worst case is an empty history, never a broken
// game. count is the loaded game's player count, which no step changes, since a new game empties the history.
// 1. Anything but an object with a known version is empty.
// 2. It keeps the newest historyCap steps.
// 3. `at` must be a whole number from 0 to the number of steps; otherwise it's the end (no Forward).
// 4. From `at`, it walks back through the steps taken and forward through the steps ahead. A step is kept only if every
//    cell names a board field, has indexes in range for the count, and both values pass that field's check. The first
//    invalid step drops itself and everything further from `at`. An old save's New game step counts as invalid, so
//    only the game it started is kept, as if that new game had emptied the history.
// 5. Then it keeps at most historyBytes of the newest steps.
/** @param {any} saved @param {number} count @returns {History} */
export function fitHistory(saved, count) {
  try {
    if (!saved || typeof saved !== 'object' || saved.v !== historyVersion || !Array.isArray(saved.steps)) return emptyHistory();
    let steps = /** @type {any[]} */ (saved.steps);
    let at = Number.isInteger(saved.at) && saved.at >= 0 && saved.at <= steps.length ? saved.at : steps.length;
    const extra = Math.max(0, steps.length - historyCap);
    if (extra > at) return emptyHistory();
    steps = steps.slice(extra);
    at -= extra;
    /** @type {Step[]} */
    const back = [];
    for (let index = at - 1; index >= 0; index--) {
      const step = fitStep(steps[index], count);
      if (!step) break;
      back.unshift(step);
    }
    /** @type {Step[]} */
    const ahead = [];
    for (let index = at; index < steps.length; index++) {
      const step = fitStep(steps[index], count);
      if (!step) break;
      ahead.push(step);
    }
    const base = Number.isFinite(saved.base) && saved.base >= 0 ? saved.base : 0;
    /** @type {History} */
    const history = { v: historyVersion, at: back.length, base, steps: [...back, ...ahead] };
    trimHistory(history);
    return history;
  } catch {
    return emptyHistory();
  }
}
