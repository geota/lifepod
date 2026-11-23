import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { chromium, webkit } from 'playwright-core';
import {
  androidMethods, backHandling, button, eventually, iosCalls, iosGlobals, iosMessages, mockWakeLock, openPage, reload, scores, test,
} from './helpers.mjs';

// The contract between the page and the native wrappers (docs/review/TESTING.md, recommendation 1): what the Android
// app serves and CI bundles, the bridge names on both sides, and what the page sends over each bridge. The source
// checks need no browser, so they're Node-only tests.

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const kotlin = read('android/src/dev/maceiras/lifepod/MainActivity.kt');
const swift = read('ios/LifePodApp.swift');
// The page's scripts, app.js and its modules under web/js/ (and dice.js), as one source.
const appJs = readdirSync(new URL('../web/', import.meta.url), { recursive: true }).map(String).filter(path => path.endsWith('.js'))
  .sort().map(path => read(`web/${path}`)).join('\n');
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

test('node: every file the page loads is served by the Android and iOS apps and bundled by CI', () => {
  // Both apps serve any file under web/ whose extension is in their type table, and the two tables match.
  const table = (source, start, pattern) => Object.fromEntries(
    [...source.slice(source.indexOf(start)).split(/^\s*[)\]]$/m)[0].matchAll(pattern)].map(([, extension, type]) => [extension, type]));
  const android = table(kotlin, 'val MIME_TYPES =', /"(\w+)" to "([^"]+)"/g);
  const ios = table(swift, 'static let mimeTypes = [', /"(\w+)": "([^"]+)"/g);
  assert.deepEqual(ios, android, "LifePodApp.swift's mimeTypes match MainActivity.kt's MIME_TYPES");
  assert.equal(android.js, 'text/javascript', 'scripts have a JavaScript type, which module scripts need');
  assert.equal(android.mjs, 'text/javascript');
  for (const file of loadedFiles()) {
    assert.ok(android[file.split('.').pop()], `the apps serve ${file}: its extension is in MIME_TYPES and mimeTypes`);
  }

  // Each app takes its paths percent-decoded, only from its own host, and refuses empty segments and any segment that
  // starts with a dot, so a request can't climb out of web/.
  assert.match(kotlin, /val path = assetPath\(request\.url\)/, 'the Android interceptor checks every path');
  assert.match(kotlin, /if \(url\.scheme != "https" \|\| url\.authority != ASSET_HOST\) return null/);
  assert.match(kotlin, /val path = url\.path\?/, 'Uri.path, which is percent-decoded');
  assert.match(kotlin, /if \(segments\.any \{ it\.isEmpty\(\) \|\| it\.startsWith\('\.'\) \|\| '\\\\' in it \}\) return null/);
  assert.match(swift, /setURLSchemeHandler\(WebFolderSchemeHandler\(\), forURLScheme: appScheme\)/);
  assert.match(swift, /webView\.load\(URLRequest\(url: startPage\)\)/, 'iOS loads the page through the scheme handler');
  assert.doesNotMatch(swift, /loadFileURL/, 'and not from file://, where module scripts are blocked');
  assert.match(swift, /url\.scheme == appScheme, url\.host\(percentEncoded: false\) == appHost/);
  assert.match(swift, /let path = url\.path\(percentEncoded: false\)/);
  assert.match(swift, /segments\.allSatisfy\(\{ !\$0\.isEmpty && !\$0\.hasPrefix\("\."\) && !\$0\.contains\("\\\\"\) \}\) else \{ return nil \}/);
  assert.match(swift, /respond\(to: task, url: url, status: 404,/, 'iOS answers anything else with a 404');

  // CI bundles the whole folder.
  assert.match(read('.github/workflows/ci.yml'), /name: Bundle offline web app\n\s+working-directory: web\n\s+run: zip -r -X "\$RUNNER_TEMP\/lifepod-web\.zip" \.\n/);
});

// The page's CSP (AGENTS.md, "Invariants"): every fetch directive is 'self', the app's own origin, or 'none'. Both apps
// serve the page from a real origin (lifepod://app/, https://appassets.androidplatform.net/) and the tests over http, so
// nothing needs file:, and a network source such as https:, http:, data:, blob: or * would let the page reach outside it.
test('node: the CSP loads nothing but the app\'s own files', () => {
  const csp = read('web/index.html').match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)[1];
  const directives = Object.fromEntries(csp.split(';').map(part => part.trim().split(/\s+/)).map(([name, ...sources]) => [name, sources]));
  assert.deepEqual(directives, {
    'default-src': ["'none'"], 'script-src': ["'self'"], 'style-src': ["'self'"], 'font-src': ["'self'"], 'img-src': ["'self'"],
    'base-uri': ["'none'"], 'form-action': ["'none'"],
  });
  // Neither app injects a policy of its own.
  for (const source of [kotlin, swift]) assert.doesNotMatch(source, /Content-Security-Policy/);
});

test('node: the bridge names match the Android and iOS wrappers', () => {
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
  // Reduce Transparency: injected before the page loads, and passed on whenever it changes.
  assert.deepEqual(matches(swift, /source: "window\.(\w+) = /g), sorted(iosGlobals), 'LifePodApp injects exactly the mocked globals');
  for (const name of iosGlobals) assert.match(appJs, new RegExp(`window\\.${name}\\b`), `the page reads window.${name}`);
  assert.match(swift, /source: "window\.initialReduceTransparency = \\\(UIAccessibility\.isReduceTransparencyEnabled\);"/);
  assert.match(swift, /name: UIAccessibility\.reduceTransparencyStatusDidChangeNotification/, 'LifePodApp listens for Reduce Transparency changes');
  assert.deepEqual(matches(swift, /evaluateJavaScript\("window\.(\w+)\?\./g), sorted(iosCalls), 'LifePodApp calls exactly the mocked page functions');
  for (const name of iosCalls) assert.match(appJs, new RegExp(`window\\.${name} = `), `the page defines window.${name}`);

  // Both wrappers keep the game under the same key, so a save survives updates on either platform.
  assert.match(kotlin, /const val GAME_KEY = "currentGame"/);
  assert.match(swift, /private let gameKey = "currentGame"/);

  // Back: both Android paths run CLOSE_DIALOG, and onBackPressed compares its JSON result with "true".
  assert.match(kotlin, /const val CLOSE_DIALOG = "window\.closeOpenDialog\?\.\(\)"/);
  assert.match(kotlin, /evaluateJavascript\(CLOSE_DIALOG\) \{ handled ->\s+if \(handled != "true"\) super\.onBackPressed\(\)/);
  assert.match(kotlin, /OnBackInvokedCallback \{ webView\.evaluateJavascript\(CLOSE_DIALOG, null\) \}/);
  assert.match(appJs, /window\.closeOpenDialog = \(\) => \{/);
});

// A renderer that dies again and again as the page loads stops being restarted after a few tries, and a native message
// offers to try again, on both platforms with the same limits (docs/review/LOGIC-AND-STATIC.md S2).
test('node: the apps stop restarting a renderer that keeps dying on load', () => {
  assert.match(kotlin, /override fun onRenderProcessGone\([^)]*\): Boolean \{\s*if \(view == webView\) replaceTracker\(\)/);
  assert.match(kotlin, /quickRestarts = if \(quick\) quickRestarts \+ 1 else 0\s*if \(quickRestarts < MAX_QUICK_RESTARTS\) \{\s*showTracker\(\)/);
  assert.match(kotlin, /crashNotice =\s*showNotice\(/, 'Android shows a native message instead');
  assert.match(swift, /quickRestarts = quick \? quickRestarts \+ 1 : 0\s*if quickRestarts < maxQuickRestarts \{\s*loadTracker\(in: webView\)\s*\} else \{\s*showCrashNotice\(in: webView\)/);
  assert.equal(Number(kotlin.match(/QUICK_RESTART_MS = ([\d_]+)L/)[1].replace('_', '')) / 1000, Number(swift.match(/quickRestart: TimeInterval = (\d+)/)[1]),
    'the same window on both platforms');
  assert.equal(kotlin.match(/MAX_QUICK_RESTARTS = (\d+)/)[1], swift.match(/maxQuickRestarts = (\d+)/)[1], 'the same number of tries');
});

const closeDialog = kotlin.match(/const val CLOSE_DIALOG = "(.+)"/)[1];

const calls = (page, name) => page.evaluate(wanted => window.bridgeCalls.filter(([call]) => call === wanted).map(([, ...args]) => args), name);

async function toggleKeepAwake(page) {
  await button(page, 'Settings').tap();
  await page.locator('label', { has: page.locator('#keep-awake') }).tap();
  await button(page, 'Close settings').tap();
}

test('chromium: the Android bridge saves and loads, keeps the screen awake, ticks and takes back', async (t) => {
  const page = await openPage(t, chromium, { native: 'android' });
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
  await reload(page);
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
  await eventually(() => backHandling(page), [false, true, false, true, false], 'then back is the system’s again');

  // The switch turns keep awake off, and it stays off on the next launch.
  await toggleKeepAwake(page);
  assert.deepEqual((await calls(page, 'keepAwake')).at(-1), [false], 'the switch turns keep awake off');
  await reload(page);
  assert.deepEqual(await calls(page, 'keepAwake'), [[false]], 'and it stays off on the next launch');
  await toggleKeepAwake(page);
  assert.deepEqual((await calls(page, 'keepAwake')).at(-1), [true]);
});

test('webkit: the iOS bridge saves and loads, keeps the screen awake and ticks', async (t) => {
  const page = await openPage(t, webkit, { native: 'ios' });
  assert.deepEqual(await calls(page, 'keepAwake'), [[true]], 'keep awake on at launch, as a Bool');

  const ticks = (await calls(page, 'haptic')).length;
  await button(page, 'Add one life to Player 2').tap();
  assert.equal((await scores(page))[1], 41);
  assert.equal((await calls(page, 'haptic')).length, ticks + 1, 'one tick per counted change');
  const posted = await calls(page, 'game');
  assert.equal(typeof posted.at(-1)[0], 'string', 'LifePodApp only stores a String');
  assert.equal(JSON.parse(posted.at(-1)[0]).scores[1], 41, 'the game message carries the game as JSON');
  assert.equal(await page.evaluate(() => localStorage.length), 0, 'nothing goes to browser storage');
  await reload(page);
  assert.equal((await scores(page))[1], 41, 'window.initialGame loads it');

  await toggleKeepAwake(page);
  assert.deepEqual((await calls(page, 'keepAwake')).at(-1), [false], 'the switch turns keep awake off');
  await reload(page);
  assert.deepEqual(await calls(page, 'keepAwake'), [[false]], 'and it stays off on the next launch');
});

// Reduce Transparency on iOS: LifePodApp.swift injects it before the page loads and runs its own script when it changes.
// The app starts on Glass on iOS, whose pill, settings header and dialogs go solid while it's on.
const reduceScript = enabled => swift.match(/evaluateJavaScript\("(window\.setReduceTransparency.+?)", completionHandler/)[1].replace('\\(enabled)', String(enabled));
// The pill's fill, and the blur behind the dialogs (the board's pill has none; DESIGN-AUDIT S10).
const glassChrome = page => page.evaluate(() => {
  const pill = getComputedStyle(document.querySelector('#board-controls'), '::before');
  const dialog = getComputedStyle(document.querySelector('#dice'));
  return {
    style: document.documentElement.dataset.style,
    reduce: document.documentElement.hasAttribute('data-reduce-transparency'),
    filter: dialog.webkitBackdropFilter ?? dialog.backdropFilter,
    opaque: pill.backgroundColor.startsWith('rgb('),
  };
});

test('webkit: the iOS bridge passes Reduce Transparency to Glass, at load and when it changes', async (t) => {
  const page = await openPage(t, webkit, { native: 'ios', nativeOptions: { reduceTransparency: true } });
  assert.deepEqual(await glassChrome(page), { style: 'glass', reduce: true, filter: 'none', opaque: true }, 'on at load: solid');
  await page.evaluate(reduceScript(false));
  assert.deepEqual(await glassChrome(page), { style: 'glass', reduce: false, filter: 'blur(18px) saturate(1.3)', opaque: false }, 'turned off: glass');
  await page.evaluate(reduceScript(true));
  assert.deepEqual(await glassChrome(page), { style: 'glass', reduce: true, filter: 'none', opaque: true }, 'turned on again: solid');
  await reload(page);
  assert.equal((await glassChrome(page)).reduce, true, 'a reload takes the injected value');
});

// In a browser, the Screen Wake Lock API keeps the screen on while the switch is on and the page is showing. The
// browser releases the lock in the background, and the page asks for it again on return.
async function checkWakeLock(t, engine) {
  const page = await openPage(t, engine, { before: mockWakeLock });
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

  // The page asks for its lock as it starts, before the load event, so the reload has shown whether it asked.
  await reload(page);
  assert.deepEqual(await lockCalls(), ['request screen'], 'a wake lock at launch with the switch on');
  await toggleKeepAwake(page);
  await reload(page);
  assert.deepEqual(await lockCalls(), [], 'no wake lock at launch with the switch off');
}

test('chromium: the browser holds a wake lock while keep awake is on and the page shows', t => checkWakeLock(t, chromium));
test('webkit: the browser holds a wake lock while keep awake is on and the page shows', t => checkWakeLock(t, webkit));

test('chromium: a declined wake lock is harmless and asked for again', async (t) => {
  const page = await openPage(t, chromium, { before: p => mockWakeLock(p, { decline: true }) });
  const lockCalls = () => page.evaluate(() => window.wakeLockCalls);
  await eventually(lockCalls, ['request screen']);
  await page.evaluate(() => window.setTestHidden(true));
  await page.evaluate(() => window.setTestHidden(false));
  await eventually(lockCalls, ['request screen', 'request screen'], 'a declined request is tried again on return');
  await button(page, 'Add one life to Player 1').tap();
  assert.equal((await scores(page))[0], 41, 'the game goes on');
});
