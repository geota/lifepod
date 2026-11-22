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
