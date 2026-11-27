// Mocks for PILL-CENTER-SPEC.md: the round near the pill's centre, with Undo on a flank. Drawn on the real app (served by
// scripts/serve.mjs, CSP bypassed): the mock only moves the pill's buttons in the DOM and, for option B, shifts the pill.
// Everything else (which buttons show, Track, the 44px fallback, the tiles' clearances) is the app's own.
//   node design/polish/pill-center.mjs <out-dir>
// Writes one PNG per mock and prints a JSON line of measurements per mock: how far the round's centre is from the seam's
// centre, how far the pill passes the end of its seam, the smallest button, and whether the pill covers a tile's content.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { close, launch, open } from './lib.mjs';

const out = process.argv[2] ?? 'design/polish/renders/pill-center';
await mkdir(out, { recursive: true });
await launch();

// Every feature on (the busiest pill), or Commander alone (damage and counters, as commander tax is a counter).
function seed(count, style, { only = false } = {}) {
  const zero = Array(count).fill(0);
  return {
    style, startingLife: 40, scores: [31, 24, 27, 38, 19, 35].slice(0, count), rotations: [...zero], colors: zero.map((_, i) => i),
    counters: only ? { commander: true } : { commander: true, poison: true, energy: true, monarch: true },
    poison: zero.map(() => 2), casts: zero.map(() => 1), energy: zero.map(() => 3), monarch: 0,
    identities: ['WUB', 'UG', 'RW', 'BRG', 'WUBRG', 'BG'].slice(0, count),
    commanderDamage: zero.map((_, d) => zero.map((__, a) => (a === d ? 0 : [9, 6, 4, 3, 2, 1][a]))),
    turns: 'turns', turn: { first: 0, active: 1, round: 7 }, manaPool: !only, pools: zero.map((_, i) => (i === 1 ? [0, 0, 0, 2, 0, 0] : [0, 0, 0, 0, 0, 0])),
    trackTab: 'damage',
  };
}

// The pill's buttons in each option's order. Today: round · modes (or Track, or its tabs) · Undo · tools; in a mode,
// [tabs] · Undo · ✓ · ✕.
const orders = {
  today: null,
  // A: Undo leads, then the modes (or Track, or its tabs in Track's mode), the round, then the tools. In a mode,
  // Undo · [tabs] · ✓ · ✕: Undo keeps its end, and the tabs open where Track was.
  A: ['undo-button', 'redo-button', 'damage-button', 'counters-button', 'mana-button', 'track-button', 'track-tabs', 'round-button', 'round-back',
    'lookup-button', 'dice-button', 'setup-button', 'shuffle-button', 'save-button', 'cancel-button'],
  // A′: Undo ends the tools side instead: modes · round · tools · Undo; in a mode, [tabs] · Undo · ✓ · ✕ as today.
  'A-prime': ['damage-button', 'counters-button', 'mana-button', 'track-button', 'track-tabs', 'round-button', 'round-back',
    'lookup-button', 'dice-button', 'setup-button', 'shuffle-button', 'undo-button', 'redo-button', 'save-button', 'cancel-button'],
};
orders.B = orders.A;

// Undo now comes before the tabs: the first tab gets a divider, and it isn't the pill's end, whatever its own siblings say.
const css = `
#board-controls .pill-tabs:not([hidden]) + #undo-button::after { content: none; }
#undo-button:not([hidden]) ~ .pill-tabs > .pill-button:nth-child(1 of :not([hidden]))::before { inset-inline-start: 2px; }
#undo-button:not([hidden]) ~ .pill-tabs > .pill-button:nth-child(1 of :not([hidden]))::after {
  position: absolute; top: calc(2 * var(--pill-inset)); bottom: calc(2 * var(--pill-inset)); left: 0; width: 1px; content: ''; background: var(--border);
}
#board-controls .pill-tabs:not([hidden]) + .save-button { margin-inline-start: 3px; }
`;

const reorder = order => `
  const pill = document.getElementById('board-controls');
  for (const id of ${JSON.stringify(order)}) pill.append(document.getElementById(id));
`;

// B: the round exactly on the seam's centre; the pill moves by however far the round is from its own centre.
const shiftJs = `
  const pill = document.getElementById('board-controls');
  const round = document.getElementById('round-button').getBoundingClientRect();
  const box = pill.getBoundingClientRect();
  const vertical = pill.hasAttribute('data-vertical');
  const dx = vertical ? 0 : (box.left + box.right) / 2 - (round.left + round.right) / 2;
  const dy = vertical ? (box.top + box.bottom) / 2 - (round.top + round.bottom) / 2 : 0;
  pill.style.left = (parseFloat(pill.style.left) + dx) + 'px';
  pill.style.top = (parseFloat(pill.style.top) + dy) + 'px';
`;

// What a mock measures: the round's offset from the seam's centre (the board's centre along the pill), how far the pill
// passes its seam's ends, the smallest visible button, and any badge, total or glyph the pill's buttons cover.
const measureJs = () => {
  const pill = document.getElementById('board-controls');
  const vertical = pill.hasAttribute('data-vertical');
  const board = document.getElementById('board').getBoundingClientRect();
  const buttons = [...pill.querySelectorAll('.pill-button')].filter(button => button.checkVisibility() && button.offsetWidth);
  const boxes = buttons.map(button => button.getBoundingClientRect());
  const ends = vertical ? [Math.min(...boxes.map(b => b.top)), Math.max(...boxes.map(b => b.bottom))] : [Math.min(...boxes.map(b => b.left)), Math.max(...boxes.map(b => b.right))];
  const centre = vertical ? (board.top + board.bottom) / 2 : (board.left + board.right) / 2;
  const round = document.getElementById('round-button');
  const r = round.checkVisibility() ? round.getBoundingClientRect() : null;
  const roundOff = r ? (vertical ? (r.top + r.bottom) / 2 : (r.left + r.right) / 2) - centre : null;
  const seam = vertical ? [board.top, board.bottom] : [board.left, board.right];
  const covers = [...document.querySelectorAll('.player .score, .player .controls button .icon, .player .badges .chip, .player .mana-strip > *')]
    .filter(node => node.checkVisibility() && node.offsetWidth).filter((node) => {
      const a = node.getBoundingClientRect();
      return boxes.some(b => a.left < b.right - 4 && b.left < a.right - 4 && a.top < b.bottom - 4 && b.top < a.bottom - 4);
    }).length;
  return {
    order: buttons.map(button => button.id.replace('-button', '').replace('track-tab-', 'tab:')),
    roundOff: roundOff === null ? null : Math.round(roundOff * 10) / 10,
    pillOff: Math.round(((ends[0] + ends[1]) / 2 - centre) * 10) / 10,
    passes: Math.round(Math.max(0, seam[0] + 4 - ends[0], ends[1] - (seam[1] - 4)) * 10) / 10,
    smallest: Math.round(Math.min(...boxes.map(b => Math.min(b.width, b.height))) * 10) / 10,
    covers,
  };
};

const views = [
  { name: '568x320-2p', size: { width: 568, height: 320 }, count: 2 },
  { name: '568x320-2p-track', size: { width: 568, height: 320 }, count: 2, mode: 'track' },
  { name: '952x427-4p', size: { width: 952, height: 427 }, count: 4 },
  { name: '952x427-4p-commander', size: { width: 952, height: 427 }, count: 4, only: true },
  { name: '952x427-4p-mode', size: { width: 952, height: 427 }, count: 4, mode: 'counters' },
  { name: '952x427-6p', size: { width: 952, height: 427 }, count: 6 },
  { name: 'ipad-4p', size: { width: 1366, height: 1024 }, count: 4 },
];

for (const style of ['material', 'glass']) {
  for (const view of views) {
    for (const [option, order] of Object.entries(orders)) {
      if (view.mode && option === 'B') continue;
      const page = await open(view.size, seed(view.count, style, view), { css });
      if (order) await page.evaluate(reorder(order));
      if (view.mode === 'track') await page.locator('#track-button').tap();
      if (view.mode === 'counters') await page.locator('#counters-button').tap();
      if (option === 'B') await page.evaluate(shiftJs);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const file = `${option}-${view.name}-${style}.png`;
      await page.screenshot({ path: join(out, file) });
      console.log(JSON.stringify({ file, ...(await page.evaluate(measureJs)) }));
      await page.close();
    }
  }
}
await close();
