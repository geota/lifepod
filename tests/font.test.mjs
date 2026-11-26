import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openSync } from 'fontkit';
import { chromium } from 'playwright-core';
import { hex, manaCodePoints } from '../scripts/mana-codepoints.mjs';
import { stylesheets } from '../scripts/stylesheets.mjs';
import { openPage, test } from './helpers.mjs';

// web/fonts/mana.woff2 is a subset of design/fonts/mana.woff2, made by scripts/subset-mana.mjs. These check that it
// still has every symbol the page draws, so a new symbol can't render as a missing glyph. The font checks need no
// browser except the last, which checks what Chromium makes of the font.

const fontPath = fileURLToPath(new URL('../web/fonts/mana.woff2', import.meta.url));
const rerun = 'run `npm run font:subset` after adding or removing a Mana symbol';

test('node: the Mana subset has a drawn glyph for every symbol the stylesheets and the scripts use', () => {
  const used = manaCodePoints();
  assert.ok(used.length >= 39, `found the Mana code points the page uses (${used.length})`);
  const font = openSync(fontPath);
  assert.equal(font.familyName, 'Mana', 'the subset keeps the family name the CSS uses');
  for (const codePoint of used) {
    assert.ok(font.hasGlyphForCodePoint(codePoint), `web/fonts/mana.woff2 has ${hex(codePoint)}; ${rerun}`);
    assert.ok(font.glyphForCodePoint(codePoint).path.commands.length > 0, `${hex(codePoint)} has an outline`);
  }
  // The mana button's tap symbol is the classic tilted T, U+E61C (MANA-UNDO-SPEC §5). Card lookup draws {T} in rules
  // text as printed on cards since Eighth Edition, the curved arrow U+E61A (css/cards.css), so the subset has both.
  assert.ok(used.includes(0xe61c) && font.hasGlyphForCodePoint(0xe61c), 'the subset has the classic tap symbol, U+E61C');
  assert.ok(used.includes(0xe61a) && font.hasGlyphForCodePoint(0xe61a), 'and card text\'s tap arrow, U+E61A');
  // Treasure's icon is the gold counter, ms-counter-gold (MANA-SPEC-v2 §1.3).
  assert.ok(used.includes(0xe934) && font.hasGlyphForCodePoint(0xe934), 'the subset has Treasure\'s gold counter, U+E934');
  // U+FFFF ends every format 4 cmap, so it isn't a symbol.
  const extra = font.characterSet.filter(codePoint => codePoint !== 0xffff && !used.includes(codePoint)).map(hex);
  assert.deepEqual(extra, [], `web/fonts/mana.woff2 has only the symbols the page uses; ${rerun}`);
});

// The browser parses the stylesheets itself, so this doesn't depend on how scripts/mana-codepoints.mjs reads them, and
// it checks that Chromium's font sanitizer accepts the subset. The page keeps its system font, so the stylesheets it
// reads are web/css/ as shipped, without the test font's rules.
test('chromium: the page loads the Mana subset and every Mana code point in its CSS is in the font', async (t) => {
  const page = await openPage(t, chromium, { font: 'system' });
  const { status, sheets, cssCodePoints } = await page.evaluate(async () => {
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
    const sheets = [...document.styleSheets].filter(sheet => sheet.href);
    for (const sheet of sheets) visit(sheet.cssRules);
    return {
      status: face?.status,
      sheets: sheets.map(sheet => new URL(sheet.href ?? '').pathname.slice(1)),
      cssCodePoints: [...found].sort((a, b) => a - b),
    };
  });
  assert.deepEqual(sheets, stylesheets(), 'Chromium read every stylesheet index.html links');
  assert.equal(status, 'loaded', 'Chromium loads web/fonts/mana.woff2');
  assert.ok(cssCodePoints.length >= 39, `Chromium found the Mana code points in the stylesheets (${cssCodePoints.length})`);
  const used = manaCodePoints();
  for (const codePoint of cssCodePoints) assert.ok(used.includes(codePoint), `scripts/mana-codepoints.mjs finds ${hex(codePoint)}`);
  const font = openSync(fontPath);
  for (const codePoint of cssCodePoints) assert.ok(font.hasGlyphForCodePoint(codePoint), `web/fonts/mana.woff2 has ${hex(codePoint)}`);
});
