import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { contrast } from '../design/counters/oklch.mjs';
import { app } from './helpers.mjs';

// The twelve tile palettes (design/polish/SPEC.md §5) are the ones design/counters/palette.mjs generated and checked,
// and every panel the app ships keeps the contrast minimums: the life total 9:1, small text 7.6:1 and the red of a
// life total at 0 or below 4.79:1.
const generated = JSON.parse(readFileSync(new URL('../design/counters/palette.js', import.meta.url), 'utf8')
  .replace(/^[\s\S]*?export default /, '').replace(/;\s*$/, ''));

test('chromium: every tile palette is palette.mjs’s and passes its contrast checks', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(app);
  const ids = generated.r3.swatches.map(swatch => swatch.name.toLowerCase());
  assert.deepEqual(ids, ['sage', 'sky', 'coral', 'violet', 'amber', 'teal', 'rose', 'indigo', 'slate', 'copper', 'olive', 'orchid']);
  const shipped = await page.evaluate((ids) => {
    const style = getComputedStyle(document.documentElement);
    const read = name => style.getPropertyValue(name).trim();
    return Object.fromEntries(ids.map(id => [id, Object.fromEntries(['top', 'bottom'].map(row => [row,
      Object.fromEntries(['panel', 'rim', 'seat', 'button'].map(role => [role, read(`--${id}-${row}-${role}`)]))]))]));
  }, ids);
  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(['--text', '--text-soft', '--life-out'].map(name => [name, style.getPropertyValue(name).trim()]));
  });
  const { minimums } = generated.r3;
  assert.deepEqual(minimums, { life: 9, small: 7.6, lifeOut: 4.79 });
  for (const swatch of generated.r3.swatches) {
    const id = swatch.name.toLowerCase();
    for (const row of ['top', 'bottom']) {
      assert.deepEqual(shipped[id][row], swatch[row], `${swatch.name} ${row}: styles.css matches palette.mjs`);
      const { panel } = shipped[id][row];
      const checks = { life: contrast(tokens['--text'], panel), small: contrast(tokens['--text-soft'], panel), lifeOut: contrast(tokens['--life-out'], panel) };
      for (const [check, minimum] of Object.entries(minimums)) {
        assert.ok(checks[check] >= minimum, `${swatch.name} ${row}: ${check} ${checks[check].toFixed(2)}:1 is at least ${minimum}:1`);
      }
    }
  }
});

// The colour indicator's one-colour discs for black, green and blue are close to the dark chip they sit on, so each disc
// has a light rim (design/polish/FINAL-REVIEW.md #6). The rim clears 3:1 against the chip on every tile colour.
test('chromium: the colour indicator has a rim that clears 3:1 on every chip', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(app);
  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return { rim: style.getPropertyValue('--ci-rim').trim(), chip: style.getPropertyValue('--chip-background').trim() };
  });
  const rgba = hex => [1, 3, 5, 7].map(at => (at < 7 ? parseInt(hex.slice(at, at + 2), 16) : hex.length > 7 ? parseInt(hex.slice(7, 9), 16) / 255 : 1));
  const over = (top, bottom) => bottom.slice(0, 3).map((value, at) => top[at] * top[3] + value * (1 - top[3]));
  const hex = rgb => `#${rgb.map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
  for (const swatch of generated.r3.swatches) {
    for (const row of ['top', 'bottom']) {
      const chip = over(rgba(tokens.chip), rgba(swatch[row].panel));
      const rim = over(rgba(tokens.rim), chip);
      const ratio = contrast(hex(rim), hex(chip));
      assert.ok(ratio >= 3, `${swatch.name} ${row}: the rim is ${ratio.toFixed(2)}:1 on the chip`);
    }
  }
  // Every indicator in a chip draws that rim around its disc.
  await page.evaluate(() => localStorage.setItem('lifepod-game', JSON.stringify({ startingLife: 40, scores: [40, 40], identities: ['B', 'UG'] })));
  await page.reload();
  const shadows = await page.locator('.badges .ci').evaluateAll(discs => discs.map(disc => getComputedStyle(disc).boxShadow));
  assert.equal(shadows.length, 2);
  for (const shadow of shadows) assert.match(shadow, /rgba\(242, 242, 239, 0\.65\d*\) 0px 0px 0px 1\.5px/);
});
