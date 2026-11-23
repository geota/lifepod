import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { request } from 'node:http';
import { chromium, webkit } from 'playwright-core';
import { button, openPage, scores, test } from './helpers.mjs';
import { startServer } from '../scripts/serve.mjs';

// The test harness itself: every test file registers its tests through it, the test server serves web/ and nothing
// else, and the app runs as modules over http.

const testFiles = readdirSync(new URL('.', import.meta.url)).filter(name => name.endsWith('.test.mjs'));
const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');

// CI picks tests by their engine prefix (LIFEPOD_TESTS), so a test registered straight with node:test, which has no
// prefix check, could run in no job without anyone noticing.
test('node: every test file registers its tests through the harness', () => {
  assert.ok(testFiles.length > 10, `found the test files (${testFiles.length})`);
  for (const name of testFiles) {
    const text = source(name);
    assert.doesNotMatch(text, /from ['"]node:test['"]/, `${name} imports test from ./helpers.mjs, not node:test`);
    assert.match(text, /from '\.\/(helpers|sizes-checks)\.mjs'/, `${name} uses the harness`);
  }
});

test('node: a test name without an engine prefix is refused', () => {
  assert.throws(() => test('the board fits', () => {}), /Start every test name with node:, chromium: or webkit:/);
  assert.throws(() => test('firefox: the board fits', () => {}), /Start every test name/);
});

test('node: no test waits on real time, launches its own browser or copies a colour', () => {
  for (const name of [...testFiles.filter(name => name !== 'harness.test.mjs'), 'sizes-checks.mjs']) {
    const text = source(name);
    assert.doesNotMatch(text, /waitForTimeout/, `${name} waits on the page's clock or a condition, not a sleep`);
    assert.doesNotMatch(text, /\b(?:chromium|webkit|engine)\.launch\(/, `${name} opens pages through openPage`);
    // A colour copied from styles.css fails for a palette tweak rather than a broken behaviour; read it with token().
    assert.doesNotMatch(text, /rgba?\(\d/, `${name} reads colours from styles.css rather than copying them`);
  }
});

// The raw request path, so the client doesn't tidy away a "..".
function get(origin, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const { hostname, port } = new URL(origin);
    const sent = request({ hostname, port, path, method }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, type: response.headers['content-type'], body }));
    });
    sent.on('error', reject);
    sent.end();
  });
}

test('node: the test server serves web/ and the test fonts, read-only, on 127.0.0.1', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  assert.match(server.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const page = await get(server.origin, '/index.html');
  assert.equal(page.status, 200);
  assert.equal(page.type, 'text/html; charset=utf-8');
  assert.equal(page.body, source('../web/index.html'));
  assert.equal((await get(server.origin, '/')).body, page.body, '/ is index.html');
  assert.equal((await get(server.origin, '/app.js')).type, 'text/javascript; charset=utf-8');
  assert.equal((await get(server.origin, '/fonts/mana.woff2')).type, 'font/woff2');
  assert.equal((await get(server.origin, '/__tests__/fonts/Roboto-Regular.woff2')).type, 'font/woff2');
  assert.equal((await get(server.origin, '/missing.js')).status, 404);
  for (const path of ['/../package.json', '/%2e%2e/package.json', '/__tests__/fonts/../helpers.mjs', '/__tests__/fonts/%2e%2e/helpers.mjs', '/fonts/']) {
    assert.equal((await get(server.origin, path)).status, 404, `${path} is outside what's served`);
  }
  assert.equal((await get(server.origin, '/index.html', 'POST')).status, 405, 'nothing is written');
  assert.equal((await get(server.origin, '/index.html', 'PUT')).status, 405);
  assert.equal((await get(server.origin, '/index.html', 'HEAD')).status, 200);
});

// The app is ES modules (web/app.js and web/js/), which the tests load over http as the apps serve them from their own
// schemes: a tap still counts and saves, with no errors or policy violations. Browsers run no module script from
// file://, so the README's browser preview serves web/ over http too.
async function checkModules(t, engine) {
  const page = await openPage(t, engine, { font: 'system' });
  assert.equal(new URL(page.url()).protocol, 'http:');
  assert.deepEqual(await page.locator('script').evaluateAll(scripts => scripts.map(script => [script.getAttribute('src'), script.type])),
    [['dice.js', ''], ['app.js', 'module']], 'dice.js is a classic script and app.js the module entry');
  assert.deepEqual(await scores(page), [40, 40, 40, 40]);
  await button(page, 'Add one life to Player 1').tap();
  assert.deepEqual(await scores(page), [41, 40, 40, 40]);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lifepod-game')).scores[0]), 41, 'and saves');
}

test('chromium: the app runs as modules over http', t => checkModules(t, chromium));
test('webkit: the app runs as modules over http', t => checkModules(t, webkit));

// Chromium pages get the pinned test font, so text measures the same on every machine.
test('chromium: pages measure their text in the pinned Roboto', async (t) => {
  const page = await openPage(t, chromium);
  const fonts = await page.evaluate(() => ({
    ui: getComputedStyle(document.body).fontFamily,
    loaded: [...document.fonts].filter(face => face.family.includes('LifePod Test Roboto')).map(face => face.status),
  }));
  assert.equal(fonts.ui, '"LifePod Test Roboto"');
  assert.deepEqual(fonts.loaded, ['loaded', 'loaded', 'loaded', 'loaded'], 'every weight loaded before the test starts');
});

// WebKit pages stand in for iOS, so they keep the system font, San Francisco, as an iPhone does.
test('webkit: pages measure their text in the system font', async (t) => {
  const page = await openPage(t, webkit);
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).fontFamily), 'system-ui, -apple-system, sans-serif');
});
