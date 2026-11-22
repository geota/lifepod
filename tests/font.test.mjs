import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { openSync } from 'fontkit';
import { chromium } from 'playwright-core';
import { hex, manaCodePoints } from '../scripts/mana-codepoints.mjs';
import { app } from './helpers.mjs';

// web/fonts/mana.woff2 is a subset of design/fonts/mana.woff2, made by scripts/subset-mana.mjs. These check that it
// still has every symbol the page draws, so a new symbol can't render as a missing glyph. The font checks need no
// browser; they're named for Chromium so the web CI job runs them.

const fontPath = fileURLToPath(new URL('../web/fonts/mana.woff2', import.meta.url));
const rerun = 'run `npm run font:subset` after adding or removing a Mana symbol';

test('chromium: the Mana subset has a drawn glyph for every symbol styles.css and the scripts use', () => {
  const used = manaCodePoints();
  assert.ok(used.length >= 39, `found the Mana code points the page uses (${used.length})`);
  const font = openSync(fontPath);
  assert.equal(font.familyName, 'Mana', 'the subset keeps the family name styles.css uses');
  for (const codePoint of used) {
    assert.ok(font.hasGlyphForCodePoint(codePoint), `web/fonts/mana.woff2 has ${hex(codePoint)}; ${rerun}`);
    assert.ok(font.glyphForCodePoint(codePoint).path.commands.length > 0, `${hex(codePoint)} has an outline`);
  }
  // U+FFFF ends every format 4 cmap, so it isn't a symbol.
  const extra = font.characterSet.filter(codePoint => codePoint !== 0xffff && !used.includes(codePoint)).map(hex);
  assert.deepEqual(extra, [], `web/fonts/mana.woff2 has only the symbols the page uses; ${rerun}`);
});

// The browser parses styles.css itself, so this doesn't depend on how scripts/mana-codepoints.mjs reads it, and it
// checks that Chromium's font sanitizer accepts the subset. A page from file:// can't read its own cssRules, so the
// stylesheet's text is parsed again into a constructed stylesheet.
test('chromium: the page loads the Mana subset and every Mana code point in its CSS is in the font', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(app);
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  const { status, cssCodePoints } = await page.evaluate(async (css) => {
    await document.fonts.ready;
    const face = [...document.fonts].find(font => font.family.replace(/["']/g, '') === 'Mana');
    if (face?.status === 'unloaded') await face.load().catch(() => {});
    const found = new Set();
    // A custom property keeps its value as written, escapes and all, so each value goes through `content` to be
    // decoded. Iterating a style declaration skips custom properties, so their names come from its text.
    const probe = document.createElement('i').style;
    const visit = (rules) => {
      for (const rule of rules) {
        if (rule.cssRules) visit(rule.cssRules);
        if (!rule.style) continue;
        const names = [...rule.style, ...[...rule.style.cssText.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1])];
        for (const name of names) {
          probe.content = '';
          probe.content = rule.style.getPropertyValue(name).trim();
          for (const character of `${rule.style.getPropertyValue(name)}${probe.content}`) {
            const codePoint = character.codePointAt(0);
            if (codePoint >= 0xe000 && codePoint <= 0xf8ff) found.add(codePoint);
          }
        }
      }
    };
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    visit(sheet.cssRules);
    return { status: face?.status, cssCodePoints: [...found].sort((a, b) => a - b) };
  }, css);
  assert.equal(status, 'loaded', 'Chromium loads web/fonts/mana.woff2');
  assert.ok(cssCodePoints.length >= 39, `Chromium found the Mana code points in styles.css (${cssCodePoints.length})`);
  const used = manaCodePoints();
  for (const codePoint of cssCodePoints) assert.ok(used.includes(codePoint), `scripts/mana-codepoints.mjs finds ${hex(codePoint)}`);
  const font = openSync(fontPath);
  for (const codePoint of cssCodePoints) assert.ok(font.hasGlyphForCodePoint(codePoint), `web/fonts/mana.woff2 has ${hex(codePoint)}`);
});
