// Every mock-up frame, by id. preview.html?scene=<id> draws one; render.mjs renders them all.
// Strips group frames into the comparison images that OPTIONS.md shows.

const phone = { w: 852, h: 393 };
const small = { w: 320, h: 568 };
const tablet = { w: 1024, h: 768 };
const fullPill = ['sword', 'counters', 'dice', 'setup'];
const clone = o => structuredClone(o);

// Four players, Commander and Poison on. P3 has taken 4 from P4's commander, P4 has taken 9 from P1's.
// In every commander damage alternative, P2's commander hits P3 for 6.
const base4 = {
  players: 4, scores: [31, 36, 34, 27], identity: ['WU', 'BR', 'G', 'UBG'],
  cmd: { 2: { 3: 4 }, 3: { 0: 9 } }, poison: [0, 0, 0, 0], casts: [1, 0, 0, 0],
  badges: 'far', pill: fullPill,
};
const base6 = {
  players: 6, scores: [31, 36, 34, 27, 40, 22], identity: ['WU', 'BR', 'G', 'UBG', 'R', 'WB'],
  cmd: { 2: { 3: 4 }, 3: { 0: 9 }, 5: { 4: 7 } }, poison: [0, 0, 0, 0, 0, 0], casts: [1, 0, 0, 0, 1, 0],
  badges: 'far', pill: fullPill,
};
const after = (b) => { const s = clone(b); s.scores[2] -= 6; s.cmd[2] = { ...s.cmd[2], 1: 6 }; return s; };
const forAll = (n, fn) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, fn(i)]));
const mode = (b, tiles, extra = {}) => ({ ...clone(b), pillDone: true, tiles: { ...forAll(b.players, () => ({ noBadges: true })), ...tiles }, ...extra });

// A: attacker first, every opponent becomes a stepper.
function aAttacker(b, value) {
  const s = value ? after(b) : clone(b);
  if (value) s.cmd[2][1] = value;
  return mode(s, forAll(b.players, i => i === 1
    ? { noBadges: true, lit: true, prompt: { icon: 'sword', title: 'Attacking', hint: 'Tap again for another attacker' } }
    : { noBadges: true, stepper: { attacker: 1, value: s.cmd[i]?.[1] ?? 0 } }));
}
const aPick = b => mode(b, forAll(b.players, () => ({ noBadges: true, dim: true, prompt: { icon: 'sword', title: 'Whose commander?', hint: 'Tap its owner’s tile' } })));

// B: defender first, then the attacker, then one stepper on the defender's tile.
const bPick = b => mode(b, forAll(b.players, () => ({ noBadges: true, dim: true, prompt: { icon: 'sword', title: 'Who was hit?', hint: 'Tap the tile that took damage' } })));
const bDefender = b => mode(b, forAll(b.players, i => i === 2
  ? { noBadges: true, lit: true, prompt: { icon: 'sword', title: 'Hit by whose commander?', hint: 'Tap the attacker’s tile' } }
  : { noBadges: true, dim: true, prompt: { icon: 'sword', title: 'My commander', hint: 'Tap if it hit' } }));
function bStep(b, value) {
  const s = value ? after(b) : clone(b);
  return mode(s, forAll(b.players, i => i === 2 ? { noBadges: true, stepper: { attacker: 1, value } }
    : i === 1 ? { noBadges: true, lit: true, prompt: { icon: 'sword', title: 'Attacking' } }
    : { noBadges: true, dim: true }));
}

// C: drag from a handle on the attacker's tile to the defender's tile.
const handles = (b, extra = {}) => forAll(b.players, i => ({ handle: true, ...(extra[i] ?? {}) }));
const cIdle = b => ({ ...clone(b), tiles: handles(b) });
const cDrag = b => ({ ...clone(b), tiles: handles(b, { 1: { handle: 'active' }, 2: { target: 1 } }), drag: { from: 1, to: 2 } });
function cStep(b, value) {
  const s = value ? after(b) : clone(b);
  return mode(s, forAll(b.players, i => i === 2 ? { noBadges: true, stepper: { attacker: 1, value } }
    : i === 1 ? { noBadges: true, lit: true, prompt: { icon: 'sword', title: 'Attacking' } }
    : { noBadges: true, dim: true }));
}

// D: every tile shows a map of the table. Each player taps the seat of the commander that hit them.
function dMap(b, value, touched) {
  const s = value ? after(b) : clone(b);
  if (value) { s.cmd[2][1] = value; s.scores[2] = b.scores[2] - value; }
  return mode(s, forAll(b.players, i => ({ noBadges: true, map: { touched: i === 2 ? touched : undefined } })));
}

const scenes = {};
const add = (id, size, scene, caption) => { scenes[id] = { ...size, ...scene, caption }; };

// 1. Commander damage entry, 4 players at 852 × 393.
add('a1', phone, { ...clone(base4), fingers: [{ at: 'pill', name: 'sword', count: 'tap 1' }] }, 'Idle. Tap the sword.');
add('a2', phone, { ...aPick(base4), fingers: [{ tile: 1, count: 'tap 2', y: '16%' }] }, 'Whose commander? Tap P2 (blue).');
add('a3', phone, { ...aAttacker(base4, 0), fingers: [{ tile: 2, at: 'add', count: 'taps 3–8: + ×6' }] }, 'Every opponent is a stepper from P2.');
add('a4', phone, { ...aAttacker(base4, 6), fingers: [{ at: 'pill', count: 'tap 9' }] }, 'After 6: P3 at 6 from P2, 28 life.');
add('a5', phone, { ...after(base4) }, 'Done. P3 shows ●6 ●4.');

add('b1', phone, { ...clone(base4), fingers: [{ at: 'pill', name: 'sword', count: 'tap 1' }] }, 'Idle. Tap the sword.');
add('b2', phone, { ...bPick(base4), fingers: [{ tile: 2, count: 'tap 2', y: '90%' }] }, 'Who was hit? Tap P3.');
add('b3', phone, { ...bDefender(base4), fingers: [{ tile: 1, count: 'tap 3', y: '16%' }] }, 'Hit by whom? Tap P2.');
add('b4', phone, { ...bStep(base4, 0), fingers: [{ tile: 2, at: 'add', count: 'taps 4–9: + ×6' }] }, 'One stepper, on the defender’s tile.');
add('b5', phone, { ...bStep(base4, 6), fingers: [{ at: 'pill', count: 'tap 10' }] }, 'After 6.');
add('b6', phone, { ...after(base4) }, 'Done.');

add('c1', phone, { ...cIdle(base4), fingers: [{ tile: 1, at: 'handle', count: 'press' }] }, 'Idle: a sword handle on every tile.');
add('c2', phone, { ...cDrag(base4) }, 'Drag from P2’s handle onto P3 (gesture 1).');
add('c3', phone, { ...cStep(base4, 0), fingers: [{ tile: 2, at: 'add', count: 'taps 2–7: + ×6' }] }, 'Released: P3 becomes a stepper.');
add('c4', phone, { ...cStep(base4, 6), fingers: [{ at: 'pill', count: 'tap 8' }] }, 'After 6.');
add('c5', phone, { ...cIdle(after(base4)) }, 'Done.');

add('d1', phone, { ...clone(base4), fingers: [{ at: 'pill', name: 'sword', count: 'tap 1' }] }, 'Idle. Tap the sword.');
add('d2', phone, { ...dMap(base4, 0), fingers: [{ tile: 2, at: 'cell', seat: 1, count: 'taps 2–7: ×6' }] }, 'Every tile shows the table. P3 taps P2’s seat.');
add('d3', phone, { ...dMap(base4, 1, 1) }, 'First tap: 1 from P2, 33 life.');
add('d4', phone, { ...dMap(base4, 6, 1), fingers: [{ at: 'pill', count: 'tap 8' }] }, 'After 6: 6 from P2, 28 life.');
add('d5', phone, { ...after(base4) }, 'Done.');

// Key frames at 6 players, the smallest phone and a tablet.
add('a3-6p', phone, aAttacker(base6, 0), 'A, 6 players: five steppers at once.');
add('b4-6p', phone, bStep(base6, 0), 'B, 6 players.');
add('c2-6p', phone, cDrag(base6), 'C, 6 players: the drag crosses the pill.');
add('d2-6p', phone, { ...dMap(base6, 4, 1) }, 'D, 6 players: a 3 × 2 map on every tile.');
add('a3-6p-small', small, aAttacker(base6, 0), 'A at 320 × 568, 6 players.');
add('d2-6p-small', small, { ...dMap(base6, 4, 1) }, 'D at 320 × 568, 6 players: cells stay 44px.');
add('d2-4p-small', small, { ...dMap(base4, 4, 1) }, 'D at 320 × 568, 4 players.');
add('a3-tablet', tablet, aAttacker(base4, 0), 'A on a 1024 × 768 tablet.');
add('d2-tablet', tablet, { ...dMap(base4, 4, 1) }, 'D on a 1024 × 768 tablet.');

// 2. Badges at rest. A busy tile next to an empty one, on the smallest phone.
const busy4 = {
  players: 4, scores: [23, 40, 36, 29], identity: ['WUB', '', 'R', 'G'],
  cmd: { 0: { 1: 12, 3: 6 }, 2: { 0: 4 } }, poison: [3, 0, 0, 0], casts: [2, 0, 0, 1], pill: fullPill,
};
const busy6 = {
  players: 6, scores: [19, 40, 33, 35, 28, 38], identity: ['WUB', '', 'R', '', 'UG', 'C'],
  cmd: { 0: { 1: 12, 4: 6, 3: 3 }, 3: { 5: 5 }, 4: { 0: 8 } }, poison: [3, 0, 1, 0, 0, 0], casts: [2, 0, 0, 0, 0, 1], pill: fullPill,
};
for (const edge of ['far', 'near', 'split']) {
  add(`badges-${edge}-4p-small`, small, { ...busy4, badges: edge }, `${edge} edge, 4 players, 320 × 568`);
  add(`badges-${edge}-6p-small`, small, { ...busy6, badges: edge }, `${edge} edge, 6 players, 320 × 568`);
  add(`badges-${edge}-6p`, phone, { ...busy6, badges: edge }, `${edge} edge, 6 players, 852 × 393`);
}
add('badges-skull-6p-small', small, { ...busy6, badges: 'far', poisonIcon: 'skull' }, 'Poison as a skull instead of a drop');
add('badges-far-tablet', tablet, { ...busy4, badges: 'far' }, 'Far edge on a 1024 × 768 tablet');
add('badges-none-4p', phone, { players: 4, scores: [40, 40, 40, 40], pill: ['dice', 'setup'] }, 'Counters off: today’s board, unchanged');

// 3. Close to losing: 16 and 21 commander damage, 7 and 10 poison.
const lethal4 = {
  players: 4, scores: [18, 15, 26, 12], identity: ['', '', '', ''],
  cmd: { 0: { 1: 16 }, 1: { 3: 21 } }, poison: [0, 0, 7, 10], casts: [0, 0, 0, 0], pill: fullPill, badges: 'far',
};
add('lethal-text', phone, { ...lethal4, lethal: 'text' }, 'Tinted text and ring');
add('lethal-fill', phone, { ...lethal4, lethal: 'fill' }, 'Filled chip');
add('lethal-edge', phone, { ...lethal4, lethal: 'edge', outReason: true }, 'Filled chip, tile ring and a reason at the losing amount');
add('lethal-edge-6p-small', small, {
  ...lethal4, players: 6, scores: [18, 15, 26, 12, 33, 30], identity: ['', '', '', '', '', ''],
  poison: [0, 0, 7, 10, 0, 0], casts: [0, 0, 0, 0, 0, 0], lethal: 'edge', outReason: true,
}, 'Filled chip and ring, 6 players, 320 × 568');

// 4. Counters access.
const counters4 = { ...clone(base4), poison: [0, 2, 0, 0], casts: [1, 0, 2, 0] };
const counters6 = { ...clone(base6), poison: [0, 2, 0, 0, 0, 0], casts: [1, 0, 2, 0, 1, 0] };
const panels = (b, extra = {}) => mode(b, forAll(b.players, i => ({ noBadges: true, panel: { link: true, ...(extra[i] ?? {}) } })));
add('panel-counters-4p', phone, panels(counters4), 'In-tile panel: poison, tax, and a link to colour');
add('panel-colour-4p', phone, panels(counters4, { 2: { page: 'colour' } }), 'In-tile panel, P3 on its colour page');
add('panel-counters-6p-small', small, panels(counters6), 'In-tile panel, 6 players, 320 × 568');
const pickTiles = b => mode(b, forAll(b.players, () => ({ noBadges: true, dim: true, prompt: { icon: 'stack', title: 'Counters', hint: 'Tap your tile to edit' } })));
add('sheet-pick-4p', phone, { ...pickTiles(counters4), fingers: [{ tile: 0, count: 'tap 2', y: '16%' }] }, 'Player sheet: tap your tile');
add('sheet-4p', phone, { ...pickTiles(counters4), playerSheet: { player: 0 } }, 'Player sheet for P1, turned to face them');
add('sheet-6p-small', small, { ...pickTiles(counters6), playerSheet: { player: 3 } }, 'Player sheet for P4, 320 × 568');
add('hybrid-colour-6p-small', small, { ...panels(counters6), playerSheet: { player: 0, parts: ['colour'] } }, 'Hybrid: colour and identity sheet for P1, from its panel');
add('hybrid-colour-4p', phone, { ...panels(counters4), playerSheet: { player: 2, parts: ['colour'] } }, 'Hybrid: colour sheet for P3');
add('sheet-tablet', tablet, { ...pickTiles(counters4), playerSheet: { player: 0 } }, 'Player sheet on a tablet');

// 5. Tile colours on the board: two players share Amber; neighbours stay apart by row lightness.
add('colours-4p', phone, { ...clone(base4), colors: [4, 6, 4, 9], badges: 'far' }, 'P1 and P3 both pick Amber: row lightness keeps the neighbours apart');
add('colours-6p', phone, { ...clone(base6), colors: [7, 8, 10, 11, 0, 1], badges: 'far' }, 'Six of the new swatches');
add('swatches', { w: 1100, h: 900 }, { kind: 'swatches' }, 'Swatches');

// 6. Setup sheet with the Counters group.
for (const variant of ['switches', 'toggles', 'inline']) {
  add(`setup-${variant}-phone`, phone, { ...clone(base4), kind: 'setup', setup: variant, commander: true, poison: false }, `${variant}, 852 × 393`);
  add(`setup-${variant}-small`, small, { ...clone(base4), kind: 'setup', setup: variant, commander: true, poison: false }, `${variant}, 320 × 568`);
  add(`setup-${variant}-tablet`, tablet, { ...clone(base4), kind: 'setup', setup: variant, commander: true, poison: false }, `${variant}, 1024 × 768`);
}
add('pill-variants', phone, { ...clone(base6), badges: 'far' }, 'Four-button pill, 6 players');

// ---------- Round 2 ----------

// 1. Map cells: per-cell − and +, then tap = +1 and long-press = −1.
function dMap2(b, value, map = {}, extra = {}) {
  const s = clone(b);
  if (value) { s.cmd[2] = { ...s.cmd[2], 1: value }; s.scores[2] = b.scores[2] - value; }
  return mode(s, forAll(b.players, i => ({ noBadges: true, map: { ...map, touched: i === 2 ? 1 : undefined, delta: i === 2 && value ? -value : undefined } })), extra);
}
const holdTitle = 'Tap +1 · hold −1';
add('m-split-4p', phone, dMap2(base4, 6, { split: true }), 'Split cells, 4 players, 852 × 393');
add('m-split-6p', phone, dMap2(base6, 6, { split: true }), 'Split cells, 6 players, 852 × 393');
add('m-split-6p-small', small, dMap2(base6, 6, { split: true }), 'Split cells, 6 players, 320 × 568');
add('m-split-6p-tablet', tablet, dMap2(base6, 6, { split: true }), 'Split cells, 6 players, tablet');
add('m-hold-4p', phone, { ...dMap2(base4, 6, { title: holdTitle }), fingers: [{ tile: 2, at: 'cell', seat: 1, count: 'hold = −1' }] }, 'Fallback: tap +1, hold −1, own seat is Undo');
add('m-hold-6p-small', small, dMap2(base6, 6, { title: holdTitle }), 'Fallback, 6 players, 320 × 568');
add('m-life-4p', phone, dMap2(base4, 6, { title: holdTitle, ownSeat: 'life' }), 'Variant: own seat shows your life, no Undo');
add('m-life-6p-small', small, dMap2(base6, 6, { title: holdTitle, ownSeat: 'life' }), 'Variant, 6 players, 320 × 568');

// 2. Poison icons: a page of its own.
add('r2-poison-icons', { w: 1180, h: 900 }, { kind: 'poison-icons', page: true }, 'Poison icons');

// 3. Overflow: the true worst case on the smallest phone. P1 (outer seat) and P4 (middle seat, under the pill)
// have damage from all five opponents, poison 9, identity WUBRG and tax +10.
const worst6 = {
  players: 6, scores: [11, 38, 30, 9, 33, 35], identity: ['WUBRG', '', 'R', 'WUBRG', '', 'G'],
  cmd: { 0: { 1: 18, 2: 12, 3: 9, 4: 7, 5: 4 }, 3: { 0: 18, 1: 12, 2: 9, 4: 7, 5: 4 }, 4: { 0: 3 } },
  poison: [9, 0, 0, 9, 0, 0], casts: [5, 0, 1, 5, 0, 0], pill: fullPill, badges: 'split', lethal: 'quiet',
};
add('o-today', small, { ...worst6, badgeStyle: 'today' }, 'Today’s chip sizes, nothing folded: the far row wraps into the life total');
add('o-compact', small, { ...worst6, badgeStyle: 'compact' }, '1. Compact: one shared background, each dot pressed against its number');
add('o-twoline', small, { ...worst6, badgeStyle: 'twoline' }, '2. Two lines: the far row wraps, the life total moves down and shrinks');
add('o-poisonnear', small, { ...worst6, badgeStyle: 'tight', poisonNear: true }, '3. Tight chips, poison moves to the near row');
add('o-compact-6p-phone', phone, { ...worst6, badgeStyle: 'compact' }, 'Compact at 852 × 393');
add('o-poisonnear-6p-phone', phone, { ...worst6, badgeStyle: 'tight', poisonNear: true }, 'Tight + poison near at 852 × 393');

// 4. Lethal, treatment 1 refined.
add('l-quiet', phone, { ...lethal4, lethal: 'quiet' }, 'Tinted chips; the thin ring and red life only at 21 and 10');
add('l-quiet-reason', phone, { ...lethal4, lethal: 'quiet', outReason: true }, 'The same, with the reason line');
add('l-quiet-6p-small', small, {
  ...lethal4, players: 6, scores: [18, 15, 26, 12, 33, 30], identity: ['', '', '', '', '', ''],
  poison: [0, 0, 7, 10, 0, 0], casts: [0, 0, 0, 0, 0, 0], lethal: 'quiet', outReason: true, badges: 'split',
}, 'With the reason line, 6 players, 320 × 568');
add('l-quiet-r2colours', phone, { ...lethal4, lethal: 'quiet', outReason: true, palette: 'r2', colors: [6, 7, 8, 4] }, 'On Rose, Indigo, Slate and Amber');

// 5. Counters mode: poison and tax as big buttons.
const k4 = { ...clone(base4), badges: 'split', poison: [0, 0, 0, 0], casts: [0, 0, 0, 0] };
const k6 = { ...clone(base6), badges: 'split', poison: [0, 0, 0, 0, 0, 0], casts: [0, 0, 0, 0, 0, 0] };
const kAfter = b => { const s = clone(b); s.poison[2] = 2; s.casts[0] = 1; return s; };
const kMode = (b, pressed = {}) => mode(b, forAll(b.players, i => ({ noBadges: true, counterButtons: { pressed: pressed[i] } })));
add('k1', phone, { ...k4, fingers: [{ at: 'pill', name: 'counters', count: 'tap 1' }] }, 'Idle. Tap the counters button.');
add('k2', phone, { ...kMode(k4), fingers: [{ tile: 2, at: 'count', n: 0, count: 'taps 2–3' }] }, 'Every tile shows poison and tax as buttons, even at 0');
add('k3', phone, { ...kMode(kAfter(k4), { 0: 'tax' }), fingers: [{ tile: 0, at: 'count', n: 1, count: 'tap: +1 cast' }, { at: 'pill', count: 'tap 4' }] }, 'P3 at 2 poison; P1 cast once (+2)');
add('k4', phone, kAfter(k4), 'Done: chips at rest, display only');
add('k5', phone, { ...kMode(kAfter(k4)), palette: 'r2', playerSheet: { player: 2, parts: ['colour'] } }, 'The palette button opens colour and identity, facing P3');
add('k2-small', small, { ...kMode(k6), fingers: [{ tile: 2, at: 'count', n: 0, count: 'taps' }] }, 'Counters mode, 6 players, 320 × 568');
add('k3-small', small, kMode(kAfter(k6), { 2: 'poison' }), 'After taps, 6 players, 320 × 568');
add('k4-small', small, kAfter(k6), 'Done, 6 players, 320 × 568');

// 6. Nine swatches.
add('r2-swatches', { w: 1600, h: 900 }, { kind: 'r2-swatches', page: true }, 'Nine swatches');
add('s-board-4p', phone, { ...clone(base4), palette: 'r2', colors: [6, 7, 8, 0], badges: 'split' }, 'Rose, Indigo, Slate, Sage');
add('s-board-6p', phone, { ...clone(base6), palette: 'r2', colors: [6, 7, 8, 2, 3, 5], badges: 'split' }, 'Rose, Indigo, Slate with Coral, Violet, Teal');

// ---------- Round 3 ----------
// Decided: own seat shows life, flask for poison, layout 3 badges (far row: commander damage only), no reason line, nine swatches.
const d3 = { palette: 'r2', poisonIcon: 'flask', badges: 'split', poisonNear: true, badgeStyle: 'tight', lethal: 'quiet' };
const b4 = { ...clone(base4), ...d3, poison: [0, 0, 1, 0], casts: [1, 0, 0, 0] };
const b6 = { ...clone(base6), ...d3, poison: [0, 0, 1, 0, 0, 0], casts: [1, 0, 0, 0, 1, 0] };
const tapHold = 'Tap +1 · hold −1';
function map3(b, value, extra = {}) {
  const s = clone(b);
  if (value) { s.cmd[2] = { ...s.cmd[2], 1: value }; s.scores[2] = b.scores[2] - value; }
  return { ...s, cluster: { undoDisabled: !value }, tiles: forAll(b.players, i => ({ noBadges: true, map: { ownSeat: 'life', title: tapHold, touched: i === 2 && value ? 1 : undefined, delta: i === 2 && value ? -value : undefined } })), ...extra };
}
add('r3m1', phone, { ...clone(b4), fingers: [{ at: 'pill', name: 'sword', count: 'tap 1' }] }, 'Idle. Tap the sword.');
add('r3m2', phone, map3(b4, 0), 'Mode open: Undo is dimmed until something changes');
add('r3m3', phone, { ...map3(b4, 6), fingers: [{ tile: 2, at: 'cell', seat: 1, count: 'taps 2–7' }] }, 'Six taps on P2’s seat: 6, and “28 −6” in P3’s own seat');
add('r3m4', phone, { ...map3(b4, 5), fingers: [{ tile: 2, at: 'cell', seat: 1, count: 'hold: −1, repeats' }] }, 'Holding a seat takes one away, then repeats like the life buttons');
add('r3m5', phone, { ...map3(b4, 6), fingers: [{ at: 'pillbtn', name: 'save', count: 'tap 8' }] }, '✓ saves, no confirmation');
add('r3m6', phone, after({ ...clone(b4) }), 'Done: ●6 on P3’s far row');
add('r3m3-small', small, map3(b6, 6), 'Commander damage mode, 6 players, 320 × 568');
add('r3m-undo', phone, { ...map3(b4, 6), fingers: [{ at: 'pillbtn', name: 'undo', count: 'Undo: back one step' }] }, 'Undo steps back one change at a time, anywhere on the board');
add('r3-discard', phone, { ...map3(b4, 6), discard: 6 }, '✕ with changes asks first');
add('r3-discard-small', small, { ...map3(b6, 6), discard: 6, noTurn: true }, '✕ confirmation at 320 × 568, in screen orientation like the other dialogs');

// 3. Counters mode as stepper rows.
const k3 = { ...clone(base4), ...d3, poison: [0, 0, 0, 0], casts: [0, 0, 0, 0] };
const k3s = { ...clone(base6), ...d3, poison: [0, 0, 0, 0, 0, 0], casts: [0, 0, 0, 0, 0, 0] };
const k3After = b => { const s = clone(b); s.poison[2] = 2; s.casts[0] = 1; return s; };
const rows3 = (b, pressed = {}, undo = false) => ({ ...b, cluster: { undoDisabled: !undo }, tiles: forAll(b.players, i => ({ noBadges: true, stepRows: { pressed: pressed[i] } })) });
add('r3k1', phone, { ...clone(k3), fingers: [{ at: 'pill', name: 'counters', count: 'tap 1' }] }, 'Idle. Tap the counters button.');
add('r3k2', phone, rows3(k3), 'Each tile: [− ⚗ 0 +] and [− ♛ +0 +], and Colour');
add('r3k3', phone, { ...rows3(k3After(k3), { 0: 'tax-plus' }, true), fingers: [{ tile: 2, at: 'srow', n: 0, count: 'taps 2–3' }, { at: 'pillbtn', name: 'save', count: 'tap 4' }] }, 'P3 +2 poison; P1 + on tax: one cast, +2');
add('r3k4', phone, k3After(k3), 'Done: poison and tax on the near row');
add('r3k2-small', small, rows3(k3s), 'Counters mode, 6 players, 320 × 568');
add('r3k3-small', small, rows3(k3After(k3s), { 2: 'poison-plus' }, true), 'After taps, 6 players, 320 × 568');

// 4. Colour and identity when Commander and Poison are both off.
const off4 = { players: 4, scores: [40, 38, 40, 35], pill: ['dice', 'setup'], palette: 'r2', colors: [0, 6, 2, 8] };
const off6 = { players: 6, scores: [40, 38, 40, 35, 40, 33], pill: ['dice', 'setup'], palette: 'r2', colors: [0, 6, 2, 8, 4, 7] };
add('ca-row-phone', phone, { ...off4, kind: 'setup', setup: 'switches', colourAccess: 'row' }, 'A. A player colour row in Game setup: the sheet now scrolls at 852 × 393');
add('ca-row-small', small, { ...off4, kind: 'setup', setup: 'switches', colourAccess: 'row' }, 'A at 320 × 568');
add('ca-pill-idle', phone, { ...off4, pill: ['counters', 'dice', 'setup'] }, 'B. Counters button always there, even with both off');
add('ca-pill-mode', phone, { ...off4, pillDone: true, tiles: forAll(4, () => ({ paletteOnly: true })) }, 'B in its mode: only a palette button per tile');
add('ca-mode-setup', phone, { ...off4, kind: 'setup', setup: 'switches', colourAccess: 'mode' }, 'C. A Colours button beside Rotate seats');
add('ca-mode-4p', phone, { ...off4, pillDone: true, tiles: forAll(4, () => ({ swatchGrid: true })), fingers: [{ tile: 1, at: 'swatch', n: 7, count: 'tap' }] }, 'C: every tile shows its nine swatches, facing its player; ✓ ends');
add('ca-mode-6p-small', small, { ...off6, pillDone: true, tiles: forAll(6, () => ({ swatchGrid: true })) }, 'C at 6 players, 320 × 568');

export const strips = {
  'cmd-a': { title: 'A. Attacker first, every opponent a stepper (proposal). 9 taps.', ids: ['a1', 'a2', 'a3', 'a4', 'a5'] },
  'cmd-b': { title: 'B. Defender first, then attacker. 10 taps.', ids: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'] },
  'cmd-c': { title: 'C. Drag from a handle on the attacker’s tile. 1 drag + 7 taps.', ids: ['c1', 'c2', 'c3', 'c4', 'c5'] },
  'cmd-d': { title: 'D. Table map on every tile: tap the seat that hit you. 8 taps.', ids: ['d1', 'd2', 'd3', 'd4', 'd5'] },
  'cmd-6p': { title: 'Key frames at 6 players, 852 × 393', ids: ['a3-6p', 'b4-6p', 'c2-6p', 'd2-6p'] },
  'cmd-sizes': { title: 'A and D on the smallest phone and a tablet', ids: ['a3-6p-small', 'd2-6p-small', 'd2-4p-small', 'a3-tablet', 'd2-tablet'] },
  'badges-small': { title: 'Badges at rest on a 320 × 568 phone: far edge, near edge, split', ids: ['badges-far-4p-small', 'badges-near-4p-small', 'badges-split-4p-small', 'badges-far-6p-small', 'badges-near-6p-small', 'badges-split-6p-small'] },
  'badges-phone': { title: 'Badges at rest, 6 players at 852 × 393, plus a tablet and counters off', ids: ['badges-far-6p', 'badges-near-6p', 'badges-split-6p', 'badges-far-tablet', 'badges-skull-6p-small', 'badges-none-4p'] },
  lethal: { title: 'Close to losing: commander damage 16 and 21, poison 7 and 10', ids: ['lethal-text', 'lethal-fill', 'lethal-edge', 'lethal-edge-6p-small'] },
  counters: { title: 'Counters access: in-tile panel, player sheet, hybrid', ids: ['panel-counters-4p', 'panel-colour-4p', 'panel-counters-6p-small', 'sheet-pick-4p', 'sheet-4p', 'sheet-6p-small', 'hybrid-colour-4p', 'hybrid-colour-6p-small', 'sheet-tablet'] },
  colours: { title: 'Tile colours on the board', ids: ['colours-4p', 'colours-6p'] },
  'r2-map-cells': { title: 'Map cells: split − / + halves (dashed red = under 44px), then tap +1 / hold −1', ids: ['m-split-4p', 'm-split-6p', 'm-split-6p-small', 'm-split-6p-tablet', 'm-hold-4p', 'm-hold-6p-small', 'm-life-4p', 'm-life-6p-small'] },
  'r2-overflow': { title: 'Worst case on a 320 × 568 phone: damage from all 5 opponents, poison 9, WUBRG, tax +10', ids: ['o-today', 'o-compact', 'o-twoline', 'o-poisonnear', 'o-compact-6p-phone', 'o-poisonnear-6p-phone'] },
  'r2-lethal': { title: 'Lethal, treatment 1 refined: amber tint at 15+ and 7+, red tint and thin ring at 21 and 10', ids: ['l-quiet', 'l-quiet-reason', 'l-quiet-6p-small', 'l-quiet-r2colours'] },
  'r2-counters': { title: 'Counters mode: tap the poison or tax button +1, hold −1. 3 taps for 1 poison.', ids: ['k1', 'k2', 'k3', 'k4', 'k5', 'k2-small', 'k3-small', 'k4-small'] },
  'r2-swatch-boards': { title: 'Nine swatches on the board', ids: ['s-board-4p', 's-board-6p'] },
  'r3-map': { title: 'Map, round 3: tap +1, hold −1 (repeats), own seat shows your life. 8 taps for 6 damage.', ids: ['r3m1', 'r3m2', 'r3m3', 'r3m4', 'r3m5', 'r3m6'] },
  'r3-centre-controls': { title: 'Centre cluster during a mode: Undo, ✓ save, ✕ cancel', ids: ['r3m2', 'r3m-undo', 'r3k2', 'r3m3-small', 'r3k2-small', 'r3-discard', 'r3-discard-small'] },
  'r3-counters': { title: 'Counters mode as stepper rows: [− ⚗ 2 +] and [− ♛ +4 +]. 3 taps for 1 poison.', ids: ['r3k1', 'r3k2', 'r3k3', 'r3k4', 'r3k2-small', 'r3k3-small'] },
  'r3-colour-access': { title: 'Tile colour when Commander and Poison are both off', ids: ['ca-row-phone', 'ca-row-small', 'ca-pill-idle', 'ca-pill-mode', 'ca-mode-setup', 'ca-mode-4p', 'ca-mode-6p-small'] },
  setup: { title: 'Setup: the Counters group', ids: ['setup-switches-phone', 'setup-toggles-phone', 'setup-inline-phone', 'setup-switches-small', 'setup-toggles-small', 'setup-inline-small', 'setup-switches-tablet', 'setup-toggles-tablet', 'setup-inline-tablet'] },
};
export default scenes;
