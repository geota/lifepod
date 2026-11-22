// Measures every tap target in the shipped app at phone, smallest-phone and tablet sizes, and saves a
// screenshot of each state it opens. Run from the repo root:
//   node design/polish/measure.mjs [screenshot-dir]
// Prints a Markdown table (used in OVERVIEW.md). Screenshots of every state go to the folder, if one is given.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launch, close, open, tap, game } from './lib.mjs';

const shots = process.argv[2];
if (shots) await mkdir(shots, { recursive: true });
await launch();

const screens = {
  phone: { width: 852, height: 393 },
  small: { width: 640, height: 360 },
  tablet: { width: 1366, height: 1024 },
};
const busy = count => game(count, {
  poison: [2, 0, 7, 0, 0, 1].slice(0, count), casts: [1, 0, 2, 0, 1, 0].slice(0, count),
  commanderDamage: Array.from({ length: count }, (_, d) => Array.from({ length: count }, (_, a) => (d === a ? 0 : [0, 4, 9, 0, 16][(d + a) % 5]))),
});

// Size of the smallest and largest visible box matching a selector.
const boxes = (page, selector) => page.evaluate((sel) => {
  const list = [...document.querySelectorAll(sel)].filter(e => e.checkVisibility({ visibilityProperty: true }) && e.offsetWidth > 0)
    .map((e) => {
      // Tile content is rotated: use the element's own (unrotated) size.
      return { w: e.offsetWidth, h: e.offsetHeight };
    });
  if (!list.length) return null;
  const area = b => b.w * b.h;
  list.sort((a, b) => area(a) - area(b));
  return { min: list[0], max: list[list.length - 1], n: list.length };
}, selector);
const fmt = b => (b ? (b.min.w === b.max.w && b.min.h === b.max.h ? `${b.min.w}×${b.min.h}` : `${b.min.w}×${b.min.h} – ${b.max.w}×${b.max.h}`) : '—');

// The touch area of the life buttons is the ::after half; measure it as half the tile face.
const halves = page => page.evaluate(() => {
  const faces = [...document.querySelectorAll('.player-face')].map(f => ({ w: Math.round(f.offsetWidth / 2), h: f.offsetHeight }));
  faces.sort((a, b) => a.w * a.h - b.w * b.h);
  return { min: faces[0], max: faces[faces.length - 1] };
});
const scoreFont = page => page.evaluate(() => {
  const s = [...document.querySelectorAll('.score')].map(e => parseFloat(getComputedStyle(e).fontSize));
  return `${Math.round(Math.min(...s))}–${Math.round(Math.max(...s))}px`;
});

const rows = [];
for (const [name, size] of Object.entries(screens)) {
  for (const count of [2, 4, 6]) {
    const tag = `${name}-${count}p`;
    const page = await open(size, busy(count));
    if (shots) await page.screenshot({ path: join(shots, `${tag}-rest.png`) });
    const r = { tag };
    r.life = fmt(await boxes(page, '.controls button'));
    r.half = fmt(await halves(page));
    r.score = await scoreFont(page);
    r.pill = fmt(await boxes(page, '.pill-button'));
    await tap(page, '#damage-button');
    await page.waitForTimeout(80);
    if (shots) await page.screenshot({ path: join(shots, `${tag}-damage.png`) });
    r.map = fmt(await boxes(page, '.map-cell[data-attacker]'));
    await tap(page, '#cancel-button');
    await tap(page, '#counters-button');
    await page.waitForTimeout(80);
    if (shots) await page.screenshot({ path: join(shots, `${tag}-counters.png`) });
    r.stepper = fmt(await boxes(page, '.counter-row button'));
    await tap(page, '#cancel-button');
    await tap(page, '#setup-button');
    await page.waitForTimeout(80);
    if (shots) await page.screenshot({ path: join(shots, `${tag}-setup.png`) });
    r.setup = fmt(await boxes(page, '#setup .choices button'));
    r.switchRow = fmt(await boxes(page, '#setup .switch-setting'));
    r.setupButtons = fmt(await boxes(page, '#setup :is(.primary, .secondary)'));
    await tap(page, '#tile-colours');
    await page.waitForTimeout(80);
    if (shots) await page.screenshot({ path: join(shots, `${tag}-colours.png`) });
    r.swatch = fmt(await boxes(page, '.swatch'));
    r.toggle = fmt(await boxes(page, '.mode-layer :is(.identity-toggle, .identity-button)'));
    await tap(page, '#setup-button');
    await tap(page, '#dice-button');
    await page.waitForTimeout(80);
    if (shots) await page.screenshot({ path: join(shots, `${tag}-dice.png`) });
    r.dice = fmt(await boxes(page, '#dice-picker button'));
    rows.push(r);
    await page.close();
  }
}
await close();

const cols = [
  ['tag', 'Screen'], ['life', '− / + visible'], ['half', 'Touch half'], ['score', 'Life type'], ['pill', 'Pill button'],
  ['map', 'Map seat'], ['stepper', 'Counter stepper'], ['swatch', 'Swatch'], ['toggle', 'Identity toggle'],
  ['setup', 'Setup choice'], ['switchRow', 'Switch row'], ['setupButtons', 'Setup buttons'], ['dice', 'Dice picker'],
];
console.log(`| ${cols.map(c => c[1]).join(' | ')} |\n|${cols.map(() => '---').join('|')}|`);
for (const r of rows) console.log(`| ${cols.map(c => r[c[0]]).join(' | ')} |`);
