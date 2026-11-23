// The design scripts (design/polish/*.mjs, design/counters/r4.mjs) drive the app from inside the page: they import the
// modules they need with inPage() from design/polish/lib.mjs. Nothing else runs them, so a rename in web/js/ would break
// them without a failing test (CODE-REVIEW S1 and R3). These tests check that every name inPage() imports is still
// exported, and run each script's page snippets on a seeded board, where any page error fails the test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { appModules, inPage } from '../design/polish/lib.mjs';
import { openPage, savedGame, test } from './helpers.mjs';

const scripts = ['polish/final-review', 'polish/glass', 'polish/render', 'polish/settings', 'polish/spec', 'polish/style7', 'polish/tiles-render', 'counters/r4'];

test('node: every app name the design scripts import is still exported by its module', () => {
  for (const [path, names] of Object.entries(appModules)) {
    const source = readFileSync(new URL(`../web/js/${path}`, import.meta.url), 'utf8');
    for (const name of names) {
      assert.match(source, new RegExp(`^export (?:async )?(?:function|const|let) ${name}\\b`, 'm'), `${name} in web/js/${path}`);
    }
  }
});

test('node: inPage imports only the names a snippet mentions, from the page\'s own modules', () => {
  const code = inPage("setBoardMode('counters'); game.scores.length;");
  assert.match(code, /const \{ game \} = await import\('\/js\/state\/state\.js'\);/);
  assert.match(code, /const \{ setBoardMode \} = await import\('\/js\/actions\/mode\.js'\);/);
  assert.doesNotMatch(code, /render\/badges\.js/);
});

for (const script of scripts) {
  test(`chromium: the page snippets in design/${script}.mjs run on the current app`, async (t) => {
    const { snippets } = await import(`../design/${script}.mjs`);
    for (const [name, { seed, js }] of Object.entries(snippets())) {
      const page = await openPage(t, chromium, { game: seed ?? savedGame(4) });
      await page.evaluate(inPage(js)).catch((error) => {
        throw new Error(`${script} "${name}": ${error.message}`);
      });
      // Let anything the snippet scheduled (afterRender, a fit) run before the page closes.
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      await page.close();
    }
  });
}
