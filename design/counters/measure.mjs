// Prints badge row widths against the room available, for the round 2 overflow scenes.
// Run from the repo root: node design/counters/measure.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try { const body = await readFile(join(root, path)); res.writeHead(200, { 'content-type': { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[extname(path)] ?? 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const browser = await chromium.launch();
for (const id of ['o-today', 'o-compact', 'o-twoline', 'o-poisonnear']) {
  const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/design/counters/preview.html?scene=${id}`);
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
server.close();
