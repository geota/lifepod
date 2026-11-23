// Prints badge row widths against the room available, for the round 2 overflow scenes.
// Run from the repo root: node design/counters/measure.mjs
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from '../../scripts/serve.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
// The repo root over http (scripts/serve.mjs), for the mock-ups beside the app.
const server = await startServer({ web: root });
const browser = await chromium.launch();
for (const id of ['o-today', 'o-compact', 'o-twoline', 'o-poisonnear']) {
  const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
  await page.goto(`${server.origin}/design/counters/preview.html?scene=${id}`);
  await page.waitForFunction(() => window.mockReady);
  const rows = await page.evaluate(() => [...document.querySelectorAll('.player')].slice(0, 4).flatMap((tile, i) =>
    [...tile.querySelectorAll('.badges')].map(row => {
      const content = [...row.children].reduce((w, c) => w + c.offsetWidth, 0) + (row.children.length - 1) * parseFloat(getComputedStyle(row).columnGap || 0);
      return `P${i + 1} ${row.classList.contains('far') ? 'far ' : 'near'}: ${Math.round(content)}px of ${row.closest('.player-face').offsetWidth - 8}px, ${Math.round(row.offsetHeight)}px tall`;
    })));
  console.log(id, '\n  ' + rows.filter(r => r.startsWith('P1') || r.startsWith('P4')).join('\n  '));
  await page.close();
}
await browser.close();
await server.close();
