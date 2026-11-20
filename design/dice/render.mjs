// Renders design/dice/renders/*.png with the repo's playwright-core Chromium.
// Run from the repo root: node design/dice/render.mjs
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outDir = fileURLToPath(new URL('./renders/', import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const shot = (page, name, opts = {}) => page.screenshot({ path: join(outDir, name), ...opts });

async function preview() {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/design/dice/preview.html`);
  await page.waitForSelector('#filmstrip figure');
  await page.evaluate(() => document.fonts.ready);
  await shot(page, 'preview.png', { fullPage: true });
  await (await page.$('#row-results')).screenshot({ path: join(outDir, 'dice-large.png') });
  await (await page.$('#row-idle')).screenshot({ path: join(outDir, 'dice-idle.png') });
  await (await page.$('.icon-rows')).screenshot({ path: join(outDir, 'dice-small.png') });
  await (await page.$('#filmstrip')).screenshot({ path: join(outDir, 'roll-filmstrip.png') });
  await (await page.$('#out-row')).screenshot({ path: join(outDir, 'life-out.png') });
  await page.close();
}

async function app({ width, height, players = 4, scores, name, sheet, result, sides = 20, rotating = false }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.addInitScript(([p, s]) => {
    const game = { startingLife: 40, scores: s ?? Array(p).fill(40), rotations: Array(p).fill(0), keepAwake: true, landscapeAngle: 0 };
    localStorage.setItem('lifepod-game', JSON.stringify(game));
  }, [players, scores]);
  await page.goto(`${base}/web/index.html`);
  await page.addStyleTag({ url: `${base}/design/dice/dice.css` });
  await page.addScriptTag({ url: `${base}/design/dice/mock-app.js`, type: 'module' });
  await page.waitForFunction(() => window.diceMock);
  await page.evaluate(([showSheet, value, s, rot]) => {
    const { controls } = window.diceMock.installPill();
    if (rot) {
      document.querySelector('#rotate-seats').click();
      controls.toggleAttribute('data-rotating', true);
    }
    if (showSheet) {
      const sheet = window.diceMock.installDiceSheet({ sides: s });
      sheet.open();
      if (value) sheet.parts.showNumber(value);
      document.activeElement.blur();
    }
  }, [sheet, result, sides, rotating]);
  await page.waitForTimeout(100);
  await shot(page, name);
  await page.close();
}

await preview();
await app({ width: 568, height: 320, name: 'board-4p-568x320.png' });
await app({ width: 844, height: 390, name: 'board-4p-844x390.png', scores: [40, 0, -3, 17] });
await app({ width: 844, height: 390, players: 2, name: 'board-2p-844x390.png' });
await app({ width: 844, height: 390, players: 3, name: 'board-3p-844x390.png' });
await app({ width: 844, height: 390, players: 6, name: 'board-6p-844x390.png' });
await app({ width: 844, height: 390, name: 'board-4p-rotating.png', rotating: true });
await app({ width: 568, height: 320, name: 'sheet-568x320.png', sheet: true, result: 17 });
await app({ width: 320, height: 568, name: 'sheet-320x568.png', sheet: true, result: 17 });
await app({ width: 320, height: 568, name: 'sheet-320x568-idle.png', sheet: true, sides: 6 });
await app({ width: 1024, height: 768, name: 'sheet-1024x768.png', sheet: true, result: 12, sides: 12 });
await app({ width: 768, height: 1024, name: 'sheet-768x1024.png', sheet: true, result: 8, sides: 8 });
await browser.close();
server.close();
console.log('rendered to', outDir);
