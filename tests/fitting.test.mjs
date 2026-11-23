import assert from 'node:assert/strict';
import { engines, faceBoxes, fontsReady, openPage, reload, savedGame, test } from './helpers.mjs';

const { chromium } = engines;
// A strip keeps its buttons in place for stripHoldTime after its last tap (web/js/logic/data.js).
const stripHoldTime = 800;

// When the badge rows are measured and fitted again (design/polish/SPEC.md §3.1 and §3.2): after any total changes its
// digit count, as well as after a resize or a badge change.

// Six players at the stress size, Badge size Larger, with commander damage and poison on every tile, so both rows grow as
// far as the room between their edge and the total lets them.
function busyLarger(scores) {
  const count = scores.length;
  return savedGame(count, {
    scores, badgeSize: 'larger',
    counters: { commander: true, poison: true }, poison: Array(count).fill(2),
    commanderDamage: Array.from({ length: count }, (_, defender) => Array.from({ length: count }, (_, attacker) => (defender === attacker ? 0 : 3))),
  });
}

// The room each row was measured with, and whether any chip covers its tile's total or glyphs.
function readFit(page) {
  return page.evaluate(() => {
    const board = document.querySelector('#board');
    const overlaps = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const covers = [...document.querySelectorAll('.player')].flatMap((player, index) => {
      const blockers = [...player.querySelectorAll('.score, .controls button')].map(blocker => blocker.getBoundingClientRect());
      return [...player.querySelectorAll('.badges .chip')].filter(chip => chip.offsetWidth && blockers.some(blocker => overlaps(chip.getBoundingClientRect(), blocker)))
        .map(chip => `P${index + 1} ${chip.className} ${chip.textContent}`);
    });
    return { far: board.style.getPropertyValue('--far-room'), near: board.style.getPropertyValue('--near-room'), covers };
  });
}

// SPEC-COMPLIANCE B1: 100 → 99 on one tile grows every total back to two-digit size, and the rows are measured again
// for it, exactly as a fresh load of the same board would measure them.
async function checkDigitCount(t, engine) {
  const page = await openPage(t, engine, { viewport: { width: 568, height: 320 }, game: busyLarger([100, 99, 99, 99, 99, 99]) });
  const wide = await readFit(page);
  await page.locator('.player:nth-child(1) .subtract').tap();
  const after = await readFit(page);
  assert.deepEqual(after.covers, [], 'no chip covers a total after 100 → 99');
  await reload(page);
  assert.deepEqual(await readFit(page), after, 'the rows are measured as a fresh load of the board measures them');
  assert.notDeepEqual(after, wide, 'the two-digit totals left the rows less room');
  // And back: 99 → 100 shrinks every total, and the rows get the room back.
  await page.locator('.player:nth-child(1) .add').tap();
  assert.deepEqual(await readFit(page), wide, '99 → 100 measures the room again too');
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: a total changing its digit count measures the badge rows again`, t => checkDigitCount(t, engine));
}

// ---- What a change costs (docs/review/DEEP-DIVE.md §2.3, docs/review/PERFORMANCE.md) --------------------------------

// The busy board: six players with every tracker on, long identities in full, commander damage from everyone, Turn by
// turn, and a two-colour pool on every tile, so the strips stay unfolded on the target phone.
function busyBoard() {
  const count = 6;
  return savedGame(count, {
    counters: { commander: true, poison: true, energy: true, experience: true, rad: true, monarch: true, initiative: true },
    poison: Array(count).fill(3), casts: Array(count).fill(2), energy: Array(count).fill(4), experience: Array(count).fill(1), rad: Array(count).fill(5),
    identities: ['WUB', 'UG', 'RW', 'BRG', 'WUBRG', 'BG'],
    identity: { show: { indicator: true, symbol: true, name: true }, background: 'default', version: 2 },
    commanderDamage: Array.from({ length: count }, (_, defender) => Array.from({ length: count }, (_, attacker) => (defender === attacker ? 0 : 3 + attacker))),
    manaPool: true, pools: Array.from({ length: count }, () => [3, 0, 0, 3, 0, 0]),
    turns: 'turns', turn: { first: 0, active: 0, round: 5 }, monarch: 1, initiative: 2,
  });
}

// How often the board has been measured and fitted (layoutStats in web/js/layout/fit.js), read from the page's own
// module instance, and the drop the fit chose.
const stats = page => page.evaluate(async () => ({
  ...(await import('/js/layout/fit.js')).layoutStats, drop: document.querySelector('#board').dataset.drop ?? '',
}));

// Dispatches a press on the first element matching selector, as a finger does, and waits out the fit it queues.
function press(page, selector) {
  return page.evaluate(async (selector) => {
    const target = document.querySelector(selector);
    const options = { button: 0, pointerId: 7, isPrimary: true, bubbles: true, pointerType: 'touch' };
    target.dispatchEvent(new PointerEvent('pointerdown', options));
    target.dispatchEvent(new PointerEvent('pointerup', options));
    await new Promise(queueMicrotask);
    return document.body.offsetWidth;
  }, selector);
}

// A strip tap that changes no width (3 → 2) runs no fit: one layout and a few style recalcs, against the 56–113 layouts
// and 120–134 recalcs of a full fit. A tap that does change the rows still fits them, once.
async function checkStripTapCost(t) {
  const page = await openPage(t, chromium, { clock: true, game: busyBoard() });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const counts = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics
    .filter(({ name }) => ['LayoutCount', 'RecalcStyleCount'].includes(name)).map(({ name, value }) => [name, value]));
  const cost = async (selector) => {
    const before = await counts();
    const fits = (await stats(page)).fits;
    await press(page, selector);
    const after = await counts();
    return { layouts: after.LayoutCount - before.LayoutCount, recalcs: after.RecalcStyleCount - before.RecalcStyleCount, fits: (await stats(page)).fits - fits };
  };
  const spend = await cost('.player:nth-child(4) .strip-spend[data-colour="R"]');
  assert.equal(spend.fits, 0, 'a spend that changes no width runs no fit');
  assert.ok(spend.layouts <= 2, `a spend forces at most 2 layouts (${spend.layouts})`);
  assert.ok(spend.recalcs <= 4, `and at most 4 style recalcs (${spend.recalcs})`);
  // Once the strip reflows, a spend that empties a colour changes the row, and fits it once.
  await page.clock.runFor(stripHoldTime);
  for (let tap = 0; tap < 2; tap++) await press(page, '.player:nth-child(4) .strip-spend[data-colour="R"]');
  const reflow = (await stats(page)).fits;
  await page.clock.runFor(stripHoldTime);
  assert.equal((await stats(page)).fits - reflow, 1, 'the strip reflowing fits the rows once');
}

// A resize measures the board once and fits it once, though the ResizeObserver, the resize event and Chromium's font
// events all answer it. A font event after which no more faces have loaded keeps the drops; and a measure whose
// readings haven't changed, as the ResizeObserver's first callback at startup, does nothing.
async function checkResizeCost(t, engine) {
  const page = await openPage(t, engine, { game: busyBoard() });
  const start = await stats(page);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  assert.deepEqual(await stats(page), start, 'a resize event with nothing changed measures and fits nothing');
  await page.evaluate(() => {
    document.fonts.dispatchEvent(new Event('loading'));
    document.fonts.dispatchEvent(new Event('loadingdone'));
  });
  await fontsReady(page);
  assert.deepEqual(await stats(page), start, 'font events that load nothing keep the drops and fit nothing');
  await page.setViewportSize({ width: 640, height: 360 });
  // Two rendering updates, so the ResizeObserver has run; Chromium's own font events for the resize arrive too.
  await fontsReady(page);
  const resized = await stats(page);
  assert.equal(resized.measures - start.measures, 1, 'one measure for the resize');
  assert.equal(resized.fits - start.fits, 1, 'one fit for the resize');
}

test('chromium: a strip tap that changes no width forces no fit', t => checkStripTapCost(t));
for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: a resize measures and fits the board once`, t => checkResizeCost(t, engine));
}

// ---- Where the badge rows sit (docs/review/DESIGN-AUDIT.md S1, S6, S7) -------------------------------------------------

// Commander damage from every opponent and poison on every tile, mana off.
function damageBoard(count, rotations = Array(count).fill(0)) {
  return savedGame(count, {
    rotations, counters: { commander: true, poison: true }, poison: Array(count).fill(3),
    commanderDamage: Array.from({ length: count }, (_, defender) => Array.from({ length: count }, (_, attacker) => (defender === attacker ? 0 : 4))),
  });
}

// S7: at 5 and 6 players, the tiles of a board row line their far rows up at the same depth from their far edge, in
// the face's own coordinates, whether or not the pill reaches each one.
async function checkFarRowsAligned(t, engine) {
  for (const count of [5, 6]) {
    const page = await openPage(t, engine, { game: damageBoard(count) });
    const faces = await faceBoxes(page, { far: '.badges.far > .chip' });
    // The top row faces down and the bottom row up; a sideways end seat stands alone.
    const rows = new Map();
    for (const face of faces) rows.set(face.edge, [...(rows.get(face.edge) ?? []), face.far.top]);
    for (const [edge, tops] of rows) {
      assert.ok(Math.max(...tops) - Math.min(...tops) <= 1, `${count} players, the ${edge} row: far rows at one depth (${tops.join(', ')})`);
    }
    await page.close();
  }
}

// S6: with 2 players the far rows keep at least --space-4 (16px) clear of the upright pill, beyond its clearance.
async function checkSeamGap(t, engine) {
  const page = await openPage(t, engine, { game: damageBoard(2) });
  const gaps = await page.evaluate(() => {
    const pill = document.querySelector('#board-controls').getBoundingClientRect();
    return [...document.querySelectorAll('.badges.far')].map((row) => {
      const box = row.getBoundingClientRect();
      // The left tile's far row sits to the pill's left, the right tile's to its right.
      return Math.max(pill.left - box.right, box.left - pill.right);
    });
  });
  for (const gap of gaps) assert.ok(gap >= 16, `a far row keeps 16px from the pill (${gap.toFixed(1)}px)`);
}

// S1: a tall tablet tile sizes its badges from its height too, so at 6 players on an iPad they're larger than a
// width-only size (3.6 hundredths of the tile's width) would make them.
async function checkTabletBadges(t, engine) {
  const page = await openPage(t, engine, { viewport: { width: 1366, height: 1024 }, mobile: false, game: damageBoard(6) });
  const { size, widthOnly } = await page.evaluate(() => {
    const board = document.querySelector('#board');
    return { size: parseFloat(getComputedStyle(document.querySelector('.badges.near')).fontSize), widthOnly: parseFloat(board.style.getPropertyValue('--ui')) * 0.036 };
  });
  assert.ok(size > widthOnly * 1.15, `badges grow with a tall tile (${size.toFixed(1)}px against ${widthOnly.toFixed(1)}px)`);
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: far rows line up across a board row at 5 and 6 players`, t => checkFarRowsAligned(t, engine));
  test(`${name}: with 2 players the far rows keep clear of the pill`, t => checkSeamGap(t, engine));
  test(`${name}: badges on a tall tablet tile grow with its height`, t => checkTabletBadges(t, engine));
}
