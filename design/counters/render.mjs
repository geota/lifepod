// Renders design/counters/renders/: one PNG per scene in frames/, then the comparison strips OPTIONS.md shows.
// Run from the repo root: node design/counters/render.mjs [scene-or-strip ...]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import scenes, { strips } from './scenes.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outDir = fileURLToPath(new URL('./renders/', import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/design/counters/preview.html`;
await mkdir(join(outDir, 'frames'), { recursive: true });

const only = process.argv.slice(2);
const browser = await chromium.launch();
const errors = [];

async function open(url, viewport, opts = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2, reducedMotion: 'reduce', ...opts });
  page.on('pageerror', e => errors.push(`${url}: ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => window.mockReady, null, { timeout: 10000 });
  return page;
}

const wanted = id => !only.length || only.includes(id) || Object.entries(strips).some(([k, s]) => only.includes(k) && s.ids.includes(id));
for (const [id, scene] of Object.entries(scenes)) {
  if (!wanted(id) || id === 'swatches') continue;
  if (scene.page) {
    const page = await open(`${base}?scene=${id}`, { width: scene.w, height: scene.h });
    await page.screenshot({ path: join(outDir, `${id}.png`), fullPage: true });
    await page.close();
    continue;
  }
  const page = await open(`${base}?scene=${id}`, { width: scene.w, height: scene.h }, { isMobile: true, hasTouch: true });
  await page.screenshot({ path: join(outDir, 'frames', `${id}.png`) });
  await page.close();
}
if (wanted('swatches')) {
  const page = await open(`${base}?scene=swatches`, { width: 1160, height: 900 });
  await page.screenshot({ path: join(outDir, 'swatches.png'), fullPage: true });
  await page.close();
}
for (const name of Object.keys(strips)) {
  if (only.length && !only.includes(name) && !strips[name].ids.some(id => only.includes(id))) continue;
  const page = await open(`${base}?strip=${name}`, { width: 1660, height: 600 });
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
  await page.close();
}
await browser.close();
server.close();
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
console.log('rendered to', outDir);
