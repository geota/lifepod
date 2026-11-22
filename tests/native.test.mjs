import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { chromium, webkit } from 'playwright-core';
import { androidMethods, app, button, iosMessages, mockAndroid, mockIos, mockWakeLock, scores } from './helpers.mjs';

// The contract between the page and the native wrappers (docs/review/TESTING.md, recommendation 1): what the Android
// app serves and CI bundles, the bridge names on both sides, and what the page sends over each bridge. The source
// checks need no browser; they're named for Chromium so the web CI job runs them.

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const kotlin = read('android/src/dev/maceiras/lifepod/MainActivity.kt');
const swift = read('ios/LifePodApp.swift');
const appJs = read('web/app.js');
const sorted = values => [...new Set(values)].sort();
const matches = (source, pattern) => sorted([...source.matchAll(pattern)].map(match => match[1]));

// Every file the page loads, followed from index.html through its stylesheets and scripts.
function loadedFiles() {
  const found = new Set();
  const visit = (path) => {
    if (found.has(path)) return;
    found.add(path);
    const source = read(`web/${path}`);
    const references = path.endsWith('.html') ? matches(source, /\s(?:src|href)="([^"#:]+)"/g)
      : path.endsWith('.css') ? matches(source, /url\(['"]?([^'")]+)['"]?\)/g)
        : matches(source, /['"`]([\w./-]+\.(?:css|js|json|png|svg|webp|woff2|html))['"`]/g);
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    for (const reference of references) {
      if (/^(?:data|https?|blob):/.test(reference)) continue;
      const next = new URL(reference, `file:///${folder}`).pathname.slice(1);
      assert.ok(existsSync(new URL(`../web/${next}`, import.meta.url)), `web/${path} loads ${next}, which exists`);
      visit(next);
    }
  };
  visit('index.html');
  return sorted(found);
}

test('chromium: every file the page loads is served by the Android app and bundled by CI', () => {
  const files = loadedFiles();
  assert.deepEqual(files, sorted(['index.html', 'styles.css', 'app.js', 'dice.js', 'fonts/mana.woff2', 'icon.png', 'favicon-32.png']),
    'the files the page loads (update this list along with the two below)');

  const served = Object.fromEntries([...kotlin.matchAll(/"\/([^"]+)" to "([^"]+)"/g)].map(([, path, type]) => [path, type]));
  const types = { html: 'text/html', css: 'text/css', js: 'application/javascript', png: 'image/png', woff2: 'font/woff2' };
  for (const file of files) {
    assert.equal(served[file], types[file.split('.').pop()], `MainActivity.kt's MIME_TYPES serves ${file} with its type`);
  }
  for (const path of Object.keys(served)) assert.ok(existsSync(new URL(`../web/${path}`, import.meta.url)), `MIME_TYPES lists ${path}, which exists`);

  const zip = read('.github/workflows/ci.yml').match(/zip "\$RUNNER_TEMP\/lifepod-web\.zip" (.+)/)[1].trim().split(/\s+/);
  for (const file of files) assert.ok(zip.includes(file), `the CI web bundle includes ${file}`);
  for (const path of zip) assert.ok(existsSync(new URL(`../web/${path}`, import.meta.url)), `the CI web bundle lists ${path}, which exists`);
});

test('chromium: the bridge names match the Android and iOS wrappers', () => {
  // Android: the interface's name, its methods, and the methods the page calls.
  assert.match(kotlin, /addJavascriptInterface\(GameBridge\(\), "LifePodAndroid"\)/);
  assert.match(appJs, /const android = window\.LifePodAndroid;/);
  assert.deepEqual(matches(kotlin, /@JavascriptInterface\s+fun (\w+)/g), sorted(androidMethods), 'GameBridge has exactly the mocked methods');
  assert.deepEqual(matches(appJs, /\bandroid\??\.(\w+)/g), sorted(androidMethods), 'the page calls exactly those methods');

  // iOS: the message handlers registered and handled, the messages the page posts, and the injected saved game.
  assert.match(appJs, /const ios = window\.webkit\?\.messageHandlers;/);
  assert.deepEqual(matches(swift, /controller\.add\(context\.coordinator, name: "(\w+)"\)/g), sorted(iosMessages), 'LifePodApp registers exactly the mocked handlers');
  assert.deepEqual(matches(swift, /case \("(\w+)"/g), sorted(iosMessages), 'and handles each of them');
  assert.deepEqual(matches(appJs, /\bios\??\.(\w+)/g), sorted(iosMessages), 'the page posts exactly those messages');
  assert.match(swift, /source: "window\.initialGame = \\\(literal\);"/, 'LifePodApp injects the saved game as window.initialGame');
  assert.match(appJs, /ios \? window\.initialGame :/, 'the page loads window.initialGame on iOS');

  // Both wrappers keep the game under the same key, so a save survives updates on either platform.
  assert.match(kotlin, /const val GAME_KEY = "currentGame"/);
  assert.match(swift, /private let gameKey = "currentGame"/);

  // Back: both Android paths run CLOSE_DIALOG, and onBackPressed compares its JSON result with "true".
  assert.match(kotlin, /const val CLOSE_DIALOG = "window\.closeOpenDialog\?\.\(\)"/);
  assert.match(kotlin, /evaluateJavascript\(CLOSE_DIALOG\) \{ handled ->\s+if \(handled != "true"\) super\.onBackPressed\(\)/);
  assert.match(kotlin, /OnBackInvokedCallback \{ webView\.evaluateJavascript\(CLOSE_DIALOG, null\) \}/);
  assert.match(appJs, /window\.closeOpenDialog = \(\) => \{/);
});

const closeDialog = kotlin.match(/const val CLOSE_DIALOG = "(.+)"/)[1];

async function openPage(t, engine, mock) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ isMobile: true, hasTouch: true, viewport: { width: 952, height: 427 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no script errors'));
  await mock(page);
  await page.goto(app);
  return page;
}

async function eventually(read, expected, message) {
  const deadline = Date.now() + 5000;
  let value = await read();
  while (!isDeepStrictEqual(value, expected) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
    value = await read();
  }
  assert.deepEqual(value, expected, message);
}

const calls = (page, name) => page.evaluate(wanted => window.bridgeCalls.filter(([call]) => call === wanted).map(([, ...args]) => args), name);

async function toggleKeepAwake(page) {
  await button(page, 'Settings').tap();
  await page.locator('label', { has: page.locator('#keep-awake') }).tap();
  await button(page, 'Close settings').tap();
}

test('chromium: the Android bridge saves and loads, keeps the screen awake, ticks and takes back', async (t) => {
  const page = await openPage(t, chromium, mockAndroid);
  assert.deepEqual(await calls(page, 'keepAwake'), [[true]], 'keep awake on at launch');
  assert.deepEqual(await calls(page, 'setBackHandling'), [[false]], 'back goes to the system at rest');
  assert.equal(await page.evaluate(() => localStorage.length), 0, 'nothing goes to browser storage');

  // One tap: one life, one tick, and a save the page can load.
  const ticks = (await calls(page, 'haptic')).length;
  await button(page, 'Add one life to Player 1').tap();
  assert.equal((await scores(page))[0], 41);
  assert.equal((await calls(page, 'haptic')).length, ticks + 1, 'one tick per counted change');
  const written = await calls(page, 'writeGame');
  assert.equal(typeof written.at(-1)[0], 'string');
  assert.equal(JSON.parse(written.at(-1)[0]).scores[0], 41, 'writeGame gets the game as JSON');
  await page.reload();
  assert.equal((await scores(page))[0], 41, 'readGame loads it');
  assert.deepEqual(await calls(page, 'readGame'), [[]]);

  // Back runs MainActivity.kt's own script, whose JSON result onBackPressed compares with "true".
  assert.equal(await page.evaluate(`JSON.stringify(${closeDialog})`), 'false', 'at rest, back is the system’s');
  await button(page, 'Settings').tap();
  assert.equal(await page.evaluate(`JSON.stringify(${closeDialog})`), 'true', 'back closes settings');
  await eventually(() => page.evaluate(() => document.querySelectorAll('dialog[open]').length), 0);
  await eventually(() => calls(page, 'setBackHandling'), [[false], [true], [false]], 'back handling turns on with settings and off after it');
  // A board mode with no dialog open: back leaves the mode.
  await button(page, 'Settings').tap();
  await button(page, 'Rotate seats on the board').tap();
  await eventually(() => page.locator('#board').getAttribute('data-mode'), 'rotate');
  assert.equal(await page.evaluate(`JSON.stringify(${closeDialog})`), 'true', 'back leaves Rotate seats');
  assert.equal(await page.locator('#board').getAttribute('data-mode'), null);
  await eventually(async () => (await calls(page, 'setBackHandling')).at(-1), [false], 'then back is the system’s again');

  // The switch turns keep awake off, and it stays off on the next launch.
  await toggleKeepAwake(page);
  assert.deepEqual((await calls(page, 'keepAwake')).at(-1), [false], 'the switch turns keep awake off');
  await page.reload();
  assert.deepEqual(await calls(page, 'keepAwake'), [[false]], 'and it stays off on the next launch');
  await toggleKeepAwake(page);
  assert.deepEqual((await calls(page, 'keepAwake')).at(-1), [true]);
});

test('webkit: the iOS bridge saves and loads, keeps the screen awake and ticks', async (t) => {
  const page = await openPage(t, webkit, mockIos);
  assert.deepEqual(await calls(page, 'keepAwake'), [[true]], 'keep awake on at launch, as a Bool');

  const ticks = (await calls(page, 'haptic')).length;
  await button(page, 'Add one life to Player 2').tap();
  assert.equal((await scores(page))[1], 41);
  assert.equal((await calls(page, 'haptic')).length, ticks + 1, 'one tick per counted change');
  const posted = await calls(page, 'game');
  assert.equal(typeof posted.at(-1)[0], 'string', 'LifePodApp only stores a String');
  assert.equal(JSON.parse(posted.at(-1)[0]).scores[1], 41, 'the game message carries the game as JSON');
  assert.equal(await page.evaluate(() => localStorage.length), 0, 'nothing goes to browser storage');
  await page.reload();
  assert.equal((await scores(page))[1], 41, 'window.initialGame loads it');

  await toggleKeepAwake(page);
  assert.deepEqual((await calls(page, 'keepAwake')).at(-1), [false], 'the switch turns keep awake off');
  await page.reload();
  assert.deepEqual(await calls(page, 'keepAwake'), [[false]], 'and it stays off on the next launch');
});

// In a browser, the Screen Wake Lock API keeps the screen on while the switch is on and the page is showing. The
// browser releases the lock in the background, and the page asks for it again on return.
async function checkWakeLock(t, engine) {
  const page = await openPage(t, engine, mockWakeLock);
  const lockCalls = () => page.evaluate(() => window.wakeLockCalls);
  await eventually(lockCalls, ['request screen'], 'a wake lock at launch');
  await toggleKeepAwake(page);
  await eventually(lockCalls, ['request screen', 'release'], 'the switch releases it');
  await toggleKeepAwake(page);
  await eventually(lockCalls, ['request screen', 'release', 'request screen'], 'and requests it again');
  await page.evaluate(() => window.setTestHidden(true));
  await eventually(lockCalls, ['request screen', 'release', 'request screen', 'release'], 'the browser releases it in the background');
  await page.evaluate(() => window.setTestHidden(false));
  await eventually(lockCalls, ['request screen', 'release', 'request screen', 'release', 'request screen'], 'requested again on return');

  await toggleKeepAwake(page);
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForTimeout(300);
  assert.deepEqual(await lockCalls(), [], 'no wake lock at launch with the switch off');
}

test('chromium: the browser holds a wake lock while keep awake is on and the page shows', t => checkWakeLock(t, chromium));
test('webkit: the browser holds a wake lock while keep awake is on and the page shows', t => checkWakeLock(t, webkit));

test('chromium: a declined wake lock is harmless and asked for again', async (t) => {
  const page = await openPage(t, chromium, p => mockWakeLock(p, { decline: true }));
  const lockCalls = () => page.evaluate(() => window.wakeLockCalls);
  await eventually(lockCalls, ['request screen']);
  await page.evaluate(() => window.setTestHidden(true));
  await page.evaluate(() => window.setTestHidden(false));
  await eventually(lockCalls, ['request screen', 'request screen'], 'a declined request is tried again on return');
  await button(page, 'Add one life to Player 1').tap();
  assert.equal((await scores(page))[0], 41, 'the game goes on');
});
