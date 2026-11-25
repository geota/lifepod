// Renders card lookup for review: the pill with its magnifier (on a 4-player board, and on the fullest 2-player pill at
// the stress size, both ways up), the sheet empty, typing, a card open (double-faced, and a creature with power and
// toughness), rules text and the keyboard open on a landscape phone, in both styles at 952 × 427, 568 × 320 and an iPad.
//
//   node design/cards/render.mjs [--out <folder>]     (default design/cards/renders/)
//
// The keyboard is drawn as Android's WebView sees it: the page shrinks to the half of the screen above it.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { close, game, launch, open } from '../polish/lib.mjs';

const at = process.argv.indexOf('--out');
const outDir = at > 0 ? process.argv[at + 1] : fileURLToPath(new URL('./renders/', import.meta.url));
await mkdir(outDir, { recursive: true });

const sizes = {
  '952x427': { width: 952, height: 427 },
  '568x320': { width: 568, height: 320 },
  'ipad-820x1180': { width: 820, height: 1180 },
};
const styles = ['material', 'glass'];
const seed = style => ({ ...game(4), style, manaPool: true });
// The fullest pill: the round, commander damage, counters, mana, the magnifier, dice and settings.
const fullPill = style => ({ ...game(2), style, manaPool: true, turns: 'turns', turn: { first: 0, active: 0, round: 3 } });

async function openCards(page) {
  await page.locator('#lookup-button').tap();
  await page.waitForFunction(() => !/Loading/.test(document.querySelector('#card-status').textContent));
}
async function type(page, text) {
  await page.locator('#card-query').fill(text);
  await page.waitForFunction(() => document.querySelector('#card-results').children.length > 0);
}
async function openCard(page, name) {
  await type(page, name);
  await page.locator('#card-results .card-row', { hasText: name }).first().tap();
}

await launch();
const shots = [];
for (const style of styles) {
  for (const [sizeName, size] of Object.entries(sizes)) {
    const name = suffix => `${outDir}/${suffix}-${style}-${sizeName}.png`;
    let page = await open(size, seed(style));
    await page.waitForTimeout(300);
    await page.screenshot({ path: name('pill-4p') });
    await openCards(page);
    await page.locator('#card-query').blur();
    await page.waitForTimeout(150);
    await page.screenshot({ path: name('sheet-empty') });
    await type(page, 'sol r');
    await page.screenshot({ path: name('typing-sol-r') });
    await openCard(page, 'Delver of Secrets');
    await page.waitForTimeout(100);
    await page.screenshot({ path: name('card-double-faced') });
    if (await page.locator('#card-back').isVisible()) await page.locator('#card-back').tap();
    await openCard(page, 'Atraxa, Praetors\' Voice');
    await page.screenshot({ path: name('card-creature') });
    if (await page.locator('#card-back').isVisible()) await page.locator('#card-back').tap();
    await page.locator('#card-text').tap();
    await type(page, 'create a treasure');
    await page.waitForTimeout(50);
    await page.screenshot({ path: name('rules-text-treasure') });
    await page.close();

    if (size.width > size.height) {
      // The keyboard covers the bottom half: the page is the top half, with the field focused and a query typed.
      page = await open({ width: size.width, height: Math.round(size.height / 2) }, seed(style));
      await page.waitForTimeout(200);
      await openCards(page);
      await type(page, 'llanow');
      await page.locator('#card-query').focus();
      await page.waitForTimeout(100);
      await page.screenshot({ path: name('keyboard-open') });
      await page.close();
    }
    shots.push(`${style} ${sizeName}`);
  }
  // The fullest 2-player pill at the stress size, landscape and portrait, with how much room it leaves.
  for (const [label, size] of [['568x320', { width: 568, height: 320 }], ['320x568', { width: 320, height: 568 }]]) {
    const page = await open(size, fullPill(style));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/pill-2p-full-${style}-${label}.png` });
    const pill = await page.evaluate(() => {
      const controls = document.querySelector('#board-controls').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('#board-controls .pill-button')].filter(button => !button.hidden).length;
      return { buttons, length: Math.round(Math.max(controls.width, controls.height)), across: Math.round(Math.min(controls.width, controls.height)) };
    });
    console.log(`${style} ${label}, 2 players, fullest pill: ${pill.buttons} buttons, ${pill.length}px long, ${pill.across}px across`);
    await page.close();
  }
}
await close();
console.log(`Rendered ${shots.length} style and size pairs to ${outDir}`);
