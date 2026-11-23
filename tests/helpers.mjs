// The shared test harness: test registration by engine, one browser per test file, openPage and its options, the
// native and Wake Lock stand-ins, seeding and reloading a game, the fake clock, the pinned test font, and the one
// "a whole 44px target, inside its tile, clear of the pill" check.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, test as nodeTest } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { chromium, webkit } from 'playwright-core';
import { startServer } from '../scripts/serve.mjs';

// ---- Registering tests ----------------------------------------------------------------------------------------------

// Every test is a Node-only check ("node: …") or runs in one engine ("chromium: …", "webkit: …"). LIFEPOD_TESTS picks
// which kinds run, such as "node,chromium" in CI's web job and "webkit" in its iOS job; unset, everything runs. A test
// whose name has no known prefix fails its file as it loads, so it can't be skipped by every job without anyone seeing.
// tests/harness.test.mjs checks that every test file registers its tests through this function.
export const testKinds = ['node', 'chromium', 'webkit'];
const chosenKinds = (process.env.LIFEPOD_TESTS || testKinds.join(',')).split(',').map(kind => kind.trim()).filter(Boolean);
for (const kind of chosenKinds) {
  if (!testKinds.includes(kind)) throw new Error(`LIFEPOD_TESTS has "${kind}"; use any of ${testKinds.join(', ')}`);
}

let hooked = false;
export function test(name, ...rest) {
  const kind = /^(\w+): /.exec(name)?.[1];
  if (!testKinds.includes(kind)) throw new Error(`Start every test name with node:, chromium: or webkit: ("${name}")`);
  // The file's browsers and server close after its last test. The hook is added here, as the file registers its tests,
  // so it belongs to the file rather than to whichever test first opens a page, and the design scripts, which import
  // this file but register no tests, add none.
  if (!hooked) {
    hooked = true;
    after(closeAll);
  }
  if (chosenKinds.includes(kind)) nodeTest(name, ...rest);
}

export const engines = { chromium, webkit };

// ---- Where the app is -----------------------------------------------------------------------------------------------

// `npm test` runs one server for every file (scripts/serve.mjs, started by tests/server.mjs). A file run on its own
// starts one the first time it opens a page.
let server;
async function origin() {
  if (process.env.LIFEPOD_TEST_ORIGIN) return process.env.LIFEPOD_TEST_ORIGIN;
  server ??= startServer();
  return (await server).origin;
}

// ---- One browser per file -------------------------------------------------------------------------------------------

// Each file launches each engine once, the first time a test needs it, and closes it after the file's last test. Every
// page gets its own context, so tests still share no storage.
const browsers = new Map();
export function browserFor(engine) {
  const name = engine.name();
  if (!browsers.has(name)) browsers.set(name, engine.launch());
  return browsers.get(name);
}

async function closeAll() {
  await Promise.all([...browsers.values()].map(async launched => (await launched.catch(() => null))?.close()));
  browsers.clear();
  await (await server)?.close();
}

// ---- The pinned test font -------------------------------------------------------------------------------------------

// The board's type is --font-ui (system-ui), which is Roboto on Android, San Francisco on Apple devices and whatever a
// Linux machine has. Tests that measure text (badge fitting, auto-drop, the pill) would then measure a different font on
// each machine, so Chromium pages, which stand in for Android, get Roboto 2.138 from tests/fonts/ (Apache 2.0, the
// release Ubuntu's fonts-roboto packages): the same text on a Mac, on Linux and in CI's Linux job. Each face covers the
// weights nearest it, as a system font would. WebKit pages, which stand in for iOS, keep the system font, San
// Francisco, as on an iPhone: WebKit runs on macOS both locally and in CI, and with Roboto as a web font WebKit
// measured a badge row a few pixels narrower than it laid it out, in a second page of the same browser on a busy
// machine, so auto-drop's fit tests failed there. openPage's `font` option picks either for any page.
const testFontFamily = 'LifePod Test Roboto';
const testFontCss = `
/* Added by tests/helpers.mjs: the pinned test font. */
${[['Regular', '1 449'], ['Medium', '450 599'], ['Bold', '600 799'], ['Black', '800 1000']].map(([face, weights]) => `@font-face {
  font-family: '${testFontFamily}';
  font-weight: ${weights};
  src: url(/__tests__/fonts/Roboto-${face}.woff2) format('woff2');
}`).join('\n')}
:root { --font-ui: '${testFontFamily}'; }
`;

// Loads every face in the page, the Mana symbols and the test font's weights, so a font that arrives later can't refit
// the board in the middle of a test. The app refits from full size on `loadingdone` (app.js), as it does on a phone
// when a font arrives, but browsers differ on whether and when that event follows a load (WebKit can fire `loading`
// and never `loadingdone`), so once every face has loaded this sends it: the board is then fitted with the fonts it
// will keep, whichever loaded first. Later font events reach the app as a phone's do: Chromium fires them on every
// resize, and the app ignores any after which no more faces have loaded (tests/fitting.test.mjs). Then it waits for
// two rendering updates, so the ResizeObserver that measures the board (app.js) has seen the page's final layout, even
// on a busy machine. A ResizeObserver of its own tells it when each has happened: Playwright's clock pauses
// requestAnimationFrame, but not rendering.
export async function fontsReady(page) {
  const failed = await page.evaluate(async () => {
    const faces = [...document.fonts];
    await Promise.all(faces.map(face => face.load().catch(() => {})));
    await document.fonts.ready;
    document.fonts.dispatchEvent(new Event('loadingdone'));
    // A probe of its own, fixed and 1px square, so the app's layout never resizes it and its observer can't leave
    // notifications undelivered.
    const probe = document.createElement('div');
    Object.assign(probe.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', pointerEvents: 'none' });
    document.body.append(probe);
    const rendered = () => new Promise((done) => {
      const observer = new ResizeObserver(() => {
        observer.disconnect();
        done();
      });
      observer.observe(probe);
    });
    // A message is a task the paused clock doesn't hold, so the second observer starts after the first update is over.
    const nextTask = () => new Promise((done) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = done;
      channel.port2.postMessage(null);
    });
    await rendered();
    await nextTask();
    await rendered();
    probe.remove();
    return faces.filter(face => face.status !== 'loaded').map(face => `${face.family} ${face.weight} ${face.status}`);
  });
  assert.deepEqual(failed, [], 'every font face loads');
}

// ---- The fake clock -------------------------------------------------------------------------------------------------

// Where a test's paused clock starts.
export const clockStart = Date.parse('2026-01-01T12:00:00Z');

// ---- Opening a page -------------------------------------------------------------------------------------------------

const platforms = new WeakMap();
const storageKeys = { web: ['local', 'lifepod-game'], android: ['session', 'android-game'], ios: ['session', 'ios-game'] };

// Opens the app in a new context of the file's browser for `engine`. Options:
// - viewport ({ width, height }, 952 × 427, the design target), mobile (isMobile, true) and touch (hasTouch, true);
// - motion: reducedMotion, 'reduce' with the clock and 'no-preference' without; media: page.emulateMedia's options;
// - clock: installs Playwright's clock at clockStart and pauses it, so only page.clock.runFor moves time;
// - native: 'android' or 'ios' installs that bridge's stand-in (mockAndroid, mockIos), and nativeOptions goes to
//   mockAndroid or mockIos; a function installs whatever it likes;
// - orientation: true fakes screen.orientation (fakeScreenOrientation) at 0°, or a number starts it at that angle;
// - game: a saved game to start with, with style and tiles (tileColours) merged in; style or tiles alone start a
//   four-player game at 40;
// - font: 'roboto' (the pinned test font, the default in Chromium) or 'system' (San Francisco, the default in WebKit);
// - before(page): anything else to install before the page loads, such as a stand-in for crypto.getRandomValues;
// - url: what to open, the app over http by default; goto: false opens nothing.
// Every page error and Content Security Policy violation fails the test, and the context closes when the test ends or
// when the test closes the page.
export async function openPage(t, engine, {
  viewport = { width: 952, height: 427 }, mobile = true, touch = true, clock = false, motion = clock ? 'reduce' : 'no-preference',
  media, native, nativeOptions, orientation = false, game, style, tiles, font = engine.name() === 'webkit' ? 'system' : 'roboto', before, url, goto = true,
} = {}) {
  const kind = /^(\w+): /.exec(t.name)?.[1];
  assert.ok(kind !== 'node' && (!testKinds.includes(kind) || kind === engine.name()),
    `"${t.name}" opens a page in ${engine.name()}; name it for the engine it runs in`);
  const browser = await browserFor(engine);
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: touch, reducedMotion: motion });
  t.after(() => context.close());
  const page = await context.newPage();
  page.on('close', () => context.close().catch(() => {}));
  const problems = [];
  const where = () => `${engine.name()} ${page.viewportSize()?.width}×${page.viewportSize()?.height}`;
  page.on('pageerror', error => problems.push(`${where()}: ${error.message}`));
  page.on('crash', () => problems.push(`${where()}: the page crashed`));
  page.on('console', (message) => {
    if (message.text().startsWith(cspPrefix)) problems.push(`${where()}: ${message.text()}`);
  });
  t.after(() => assert.deepEqual(problems, [], 'no script errors or Content Security Policy violations'));
  await page.addInitScript((prefix) => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`${prefix} ${event.effectiveDirective} blocked ${event.blockedURI || 'an inline resource'} in ${event.sourceFile || event.documentURI}`);
    });
  }, cspPrefix);

  const base = await origin();
  if (font === 'roboto') {
    await context.route(`${base}/styles.css`, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}\n${testFontCss}` });
    });
  } else assert.equal(font, 'system', `font is 'roboto' or 'system', not ${font}`);
  if (clock) {
    await page.clock.install({ time: clockStart });
    await page.clock.pauseAt(clockStart + 60000);
  }
  if (media) await page.emulateMedia(media);
  const platform = typeof native === 'string' ? native : 'web';
  platforms.set(page, platform);
  if (native === 'android') await mockAndroid(page, nativeOptions);
  else if (native === 'ios') await mockIos(page, nativeOptions);
  else if (typeof native === 'function') await native(page);
  else assert.equal(native, undefined, `native is 'android', 'ios' or a function, not ${native}`);
  if (orientation !== false) await fakeScreenOrientation(page, orientation === true ? 0 : orientation);
  if (before) await before(page);

  let seed = game;
  if (style !== undefined || tiles !== undefined) {
    seed = { ...(game ?? { startingLife: 40, scores: [40, 40, 40, 40] }), ...(style === undefined ? {} : { style }), ...(tiles === undefined ? {} : { tileColours: tiles }) };
  }
  if (!goto) {
    assert.equal(seed, undefined, 'a game needs a page to load it into');
    return page;
  }
  const once = seed ? await page.addInitScript(writeStorage, { origin: base, entries: [[...storageKeys[platform], JSON.stringify(seed)]] }) : null;
  await page.goto(url ?? `${base}/index.html`);
  await once?.dispose();
  // Every page, WebKit's included: its Mana symbols are a web font too, and a strip or a row measured before they
  // arrived could otherwise be checked where it was first placed.
  await fontsReady(page);
  return page;
}
const cspPrefix = '[lifepod-test] Content Security Policy violation:';

// Runs in the page before its scripts: writes storage entries, as [area, key, value], or replaces all of it.
function writeStorage({ origin, entries, replace }) {
  if (location.origin !== origin) return;
  const areas = { local: localStorage, session: sessionStorage };
  if (replace) for (const area of Object.values(areas)) area.clear();
  for (const [area, key, value] of entries) areas[area].setItem(key, value);
}

// ---- Saved games ----------------------------------------------------------------------------------------------------

// A saved game for `count` players at 40, as dealt, with keep awake on and the board upright at 90°.
export function savedGame(count, extra = {}) {
  return {
    startingLife: 40, scores: Array(count).fill(40), rotations: Array(count).fill(0), keepAwake: true, landscapeAngle: 90, ...extra,
  };
}

// The game as the page last saved it, from wherever its platform keeps it.
export async function saved(page) {
  const [area, key] = storageKeys[platforms.get(page) ?? 'web'];
  return JSON.parse(await page.evaluate(([area, key]) => (area === 'local' ? localStorage : sessionStorage).getItem(key), [area, key]));
}

// Reloads the page, then loads every font. A browser commits page storage in the background, so a page reloaded
// straight after a write can read storage from before it. Instead of waiting and hoping, this reads the page's storage
// and writes exactly that into the new page before the app starts: what the app saved is what it loads. The fake
// orientation's angle lives in session storage, so it survives too, as a real screen's does.
export async function reload(page) {
  const base = await origin();
  const entries = await page.evaluate(() => [
    ...Object.entries(localStorage).map(([key, value]) => ['local', key, value]),
    ...Object.entries(sessionStorage).map(([key, value]) => ['session', key, value]),
  ]);
  const once = await page.addInitScript(writeStorage, { origin: base, entries, replace: true });
  await page.reload();
  await once.dispose();
  await fontsReady(page);
}

// Loads a saved game: reloads with the game where the page's platform keeps it (local storage, or the Android or iOS
// stand-in's session storage).
export async function seedGame(page, game) {
  const base = await origin();
  const once = await page.addInitScript(writeStorage, { origin: base, entries: [[...storageKeys[platforms.get(page) ?? 'web'], JSON.stringify(game)]] });
  await page.reload();
  await once.dispose();
  await fontsReady(page);
}

// A fresh game in the Classic tile colours, for checks written against Classic's palettes and swatch names. Clear is
// the default set.
export async function useClassicTiles(page) {
  await seedGame(page, { startingLife: 40, scores: [40, 40, 40, 40], tileColours: 'classic' });
}

// ---- Waiting --------------------------------------------------------------------------------------------------------

// Polls read() until it deep-equals expected, for results that land after an event the test can't wait on directly,
// such as a dialog's close event. Real time, not the page's clock.
export async function eventually(read, expected, message, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let value = await read();
  while (!isDeepStrictEqual(value, expected) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
    value = await read();
  }
  assert.deepEqual(value, expected, message);
}

// Holds the mouse on a target for `ms` of the page's paused clock, then lets go.
export async function hold(page, target, ms) {
  const box = await target.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(ms);
  await page.mouse.up();
}

// Waits until every CSS or Web Animation on the element and inside it has finished. Playwright's clock doesn't drive
// animations, so a test waits for them rather than for a guessed time.
export function animationsDone(locator) {
  return locator.evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
}

// ---- Screen orientation ---------------------------------------------------------------------------------------------

// Replaces screen.orientation with one the test controls, starting at `angle`. The angle survives reloads, like a real
// device. Angles follow a phone whose natural orientation is portrait.
export async function fakeScreenOrientation(page, angle = 0) {
  await page.addInitScript((start) => {
    const types = { 0: 'portrait-primary', 90: 'landscape-primary', 180: 'portrait-secondary', 270: 'landscape-secondary' };
    const orientation = new EventTarget();
    let angle = Number(sessionStorage.getItem('test-screen-angle') ?? start);
    Object.defineProperties(orientation, {
      angle: { get: () => angle },
      type: { get: () => types[angle] },
    });
    Object.defineProperty(Screen.prototype, 'orientation', { configurable: true, get: () => orientation });
    window.turnTestScreen = (next) => {
      angle = next;
      sessionStorage.setItem('test-screen-angle', String(next));
      orientation.dispatchEvent(new Event('change'));
    };
  }, angle);
}

// Resizes the window, then reports the new screen angle, as a phone does when it turns.
export async function turnScreen(page, width, height, angle) {
  await page.setViewportSize({ width, height });
  await page.evaluate(next => window.turnTestScreen(next), angle);
}

// ---- Controls -------------------------------------------------------------------------------------------------------

export function button(page, name) {
  return page.getByRole('button', { name, exact: true });
}

export async function startGame(page, count) {
  await button(page, 'Settings').tap();
  await button(page, `${count} players`).tap();
  await page.locator('#save-setup').tap();
}

export function scores(page) {
  return page.locator('.score').evaluateAll(outputs => outputs.map(output => Number(output.value.replace('−', '-'))));
}

// Sets tracker switches in Settings → Track, then closes settings. Each switch saves the moment it changes.
export async function setSwitches(page, wanted) {
  await button(page, 'Settings').tap();
  for (const [name, on] of Object.entries(wanted)) {
    const input = page.getByRole('switch', { name, exact: true });
    if ((await input.isChecked()) !== on) await page.locator('#settings label', { has: input }).tap();
  }
  await button(page, 'Close settings').tap();
}

// ---- Styles ---------------------------------------------------------------------------------------------------------

// A colour custom property of the root, as styles.css sets it for the page's current style and tile set, read as a
// computed colour (rgb(…)) so it compares with getComputedStyle. Tests compare with these rather than copying values
// from styles.css, so a palette tweak doesn't fail tests about behaviour. Any other CSS colour, such as 'transparent',
// is read the same way.
export function token(page, name) {
  return page.evaluate((name) => {
    const probe = document.createElement('i');
    probe.hidden = true;
    probe.style.color = name.startsWith('--') ? `var(${name})` : name;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, name);
}

// styles.css as text, for tests that check a rule rather than its result.
export const stylesCss = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

// ---- Geometry -------------------------------------------------------------------------------------------------------

// The one check that a tile's targets and parts fit (AGENTS.md: every touch target is at least 44px). For every tile,
// each visible element matching `targets` must be
// - a whole 44px target: 43.5px allows for rounding. A chip measures by its ::after touch area, like the turn chip's
//   64 × 44 and a folded mana strip's;
// - inside its tile, to within 0.5px;
// - clear of the pill (with `pill`, the default): not overlapping the pill as drawn, its ::before, which sits inside
//   the 48px (64px on tablets) buttons by an eighth of their size. Tile targets may reach under the pill's clear edge.
// Each visible element matching `parts` (what a tile shows: a total, glyphs, chips) must be inside its tile and, with
// `pill`, clear of the pill's whole box, edge and all. Returns a description of each problem, or [].
export function tileProblems(page, { targets = '', parts = '', pill = true } = {}) {
  return page.evaluate(([targets, parts, checkPill]) => {
    const controls = document.querySelector('#board-controls');
    const box = controls.getBoundingClientRect();
    const inset = parseFloat(getComputedStyle(controls, '::before').top) || 0;
    const drawn = { left: box.left + inset, right: box.right - inset, top: box.top + inset, bottom: box.bottom - inset };
    const pillShown = checkPill && controls.checkVisibility() && box.width > 0;
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const shown = element => element.checkVisibility({ visibilityProperty: true }) && element.getBoundingClientRect().width > 0;
    const name = element => element.getAttribute('aria-label') || String(element.className.baseVal ?? element.className) || element.textContent.trim();
    return [...document.querySelectorAll('.player')].flatMap((player, index) => {
      const tile = player.getBoundingClientRect();
      const check = (element, isTarget) => {
        const found = [];
        const rect = element.getBoundingClientRect();
        if (isTarget) {
          const touch = getComputedStyle(element, '::after');
          const size = element.matches('.chip') && touch.content !== 'none' && touch.position === 'absolute'
            ? [parseFloat(touch.width), parseFloat(touch.height)] : [element.offsetWidth, element.offsetHeight];
          if (Math.min(...size) < 43.5) found.push(`${Math.round(size[0])}×${Math.round(size[1])}`);
        }
        if (rect.left < tile.left - 0.5 || rect.right > tile.right + 0.5 || rect.top < tile.top - 0.5 || rect.bottom > tile.bottom + 0.5) {
          found.push('outside its tile');
        }
        if (pillShown && overlaps(rect, isTarget ? drawn : box)) found.push('under the pill');
        return found.length ? [`P${index + 1} ${name(element)}: ${found.join(', ')}`] : [];
      };
      const all = selector => (selector ? [...player.querySelectorAll(selector)].filter(shown) : []);
      return [...all(targets).flatMap(element => check(element, true)), ...all(parts).flatMap(element => check(element, false))];
    });
  }, [targets, parts, pill]);
}

// Each tile's face in its own coordinates, with its far edge at the top: its width and height, the room its measured
// clearances from the pill leave (--clear-far and so on), and for each named selector the box around every visible
// match inside the face, or null. Boxes are { left, right, top, bottom } from the face's top left as its player reads
// it, so a face turned by the board or its seat compares like an upright one.
export function faceBoxes(page, selectors) {
  return page.locator('.player').evaluateAll((players, selectors) => players.map((player) => {
    const face = player.querySelector('.player-face');
    const matrix = (element) => {
      const value = getComputedStyle(element).transform;
      return new DOMMatrixReadOnly(value === 'none' ? undefined : value);
    };
    const { a, b } = matrix(document.querySelector('.app')).multiply(matrix(face));
    const angle = ((Math.round(Math.atan2(b, a) / (Math.PI / 2)) * 90) % 360 + 360) % 360;
    const screen = face.getBoundingClientRect();
    const local = (rect) => {
      const box = {
        0: { left: rect.left - screen.left, top: rect.top - screen.top, right: rect.right - screen.left, bottom: rect.bottom - screen.top },
        90: { left: rect.top - screen.top, top: screen.right - rect.right, right: rect.bottom - screen.top, bottom: screen.right - rect.left },
        180: { left: screen.right - rect.right, top: screen.bottom - rect.bottom, right: screen.right - rect.left, bottom: screen.bottom - rect.top },
        270: { left: screen.bottom - rect.bottom, top: rect.left - screen.left, right: screen.bottom - rect.top, bottom: rect.right - screen.left },
      }[angle];
      return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value * 10) / 10]));
    };
    const union = (selector) => {
      const boxes = [...face.querySelectorAll(selector)].filter(element => element.checkVisibility() && element.getBoundingClientRect().width > 0)
        .map(element => element.getBoundingClientRect());
      if (!boxes.length) return null;
      return local({
        left: Math.min(...boxes.map(box => box.left)), right: Math.max(...boxes.map(box => box.right)),
        top: Math.min(...boxes.map(box => box.top)), bottom: Math.max(...boxes.map(box => box.bottom)),
      });
    };
    const clear = edge => parseFloat(getComputedStyle(player).getPropertyValue(`--clear-${edge}`)) || 0;
    const width = face.offsetWidth;
    const height = face.offsetHeight;
    return {
      edge: player.dataset.edge, width, height,
      room: { left: clear('start'), right: width - clear('end'), top: clear('far'), bottom: height - clear('near') },
      ...Object.fromEntries(Object.entries(selectors).map(([name, selector]) => [name, union(selector)])),
    };
  }), selectors);
}

// Anything wrong with the mana strips at rest: a strip over its tile's life total, − and + glyphs, "Out" tag, far row
// or near row, or a strip target that isn't a whole 44px target inside its tile and clear of the pill (tileProblems).
export async function stripProblems(page) {
  const covers = await page.evaluate(() => {
    const overlaps = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    return [...document.querySelectorAll('.player')].flatMap((player, index) => {
      const strip = player.querySelector('.mana-strip');
      if (strip.hidden || !strip.offsetWidth) return [];
      const box = strip.getBoundingClientRect();
      return [...player.querySelectorAll('.score, .controls button, .out-tag, .badges.near > *, .badges.far > *')]
        .filter(blocker => blocker.checkVisibility() && blocker.offsetWidth && overlaps(box, blocker.getBoundingClientRect()))
        .map(blocker => `P${index + 1} strip: covers ${blocker.className}`);
    });
  });
  return [...covers, ...await tileProblems(page, { targets: '.mana-strip:not([hidden]) button:not(.chip)' })];
}

// ---- Native stand-ins -----------------------------------------------------------------------------------------------

// The methods of GameBridge in android/src/dev/maceiras/lifepod/MainActivity.kt and the message handlers in
// ios/LifePodApp.swift. tests/native.test.mjs checks both lists against those sources, and the mocks below are built
// from them, so the mocks can't drift from the wrappers.
export const androidMethods = ['readGame', 'writeGame', 'keepAwake', 'haptic', 'setBackHandling', 'textScale'];
export const iosMessages = ['game', 'keepAwake', 'haptic'];
// What LifePodApp.swift puts on window before the page loads (user scripts), and the page functions it calls later.
export const iosGlobals = ['initialGame', 'initialReduceTransparency', 'initialTextScale'];
export const iosCalls = ['setReduceTransparency', 'setTextScale'];

// A stand-in for the Android bridge that records every call in window.bridgeCalls as [method, ...arguments]. The game
// is kept in session storage, as SharedPreferences keeps it, so it survives a reload. textScale reports the system font
// scale (1 unless given).
export async function mockAndroid(page, { textScale = 1 } = {}) {
  await page.addInitScript(([methods, fontScale]) => {
    window.bridgeCalls = [];
    const behaviour = {
      readGame: () => sessionStorage.getItem('android-game'),
      writeGame: game => sessionStorage.setItem('android-game', game),
      textScale: () => fontScale,
    };
    window.LifePodAndroid = Object.fromEntries(methods.map(name => [name, (...args) => {
      window.bridgeCalls.push([name, ...args]);
      return behaviour[name]?.(...args);
    }]));
  }, [androidMethods, textScale]);
}

// Each change the page has made with setBackHandling on the Android stand-in, in order, starting with its first call.
// The page calls it again whenever a dialog or mode might have changed, and how many of those repeats arrive depends on
// event timing, so a call that repeats the value before it is left out: the sequence is what back does, step by step.
export function backHandling(page) {
  return page.evaluate(() => window.bridgeCalls.filter(([name]) => name === 'setBackHandling').map(([, enabled]) => enabled)
    .filter((enabled, index, all) => index === 0 || enabled !== all[index - 1]));
}

// A stand-in for the iOS app's window.webkit.messageHandlers that records every message in window.bridgeCalls as
// [name, body]. Like LifePodApp.swift, it keeps the last game message and injects it as window.initialGame before
// the page loads, and injects Reduce Transparency as window.initialReduceTransparency (reduceTransparency, off unless
// given) and Dynamic Type as window.initialTextScale (textScale, 1 unless given). A test changes a setting as the app
// does, by calling window.setReduceTransparency or window.setTextScale.
export async function mockIos(page, { reduceTransparency = false, textScale = 1 } = {}) {
  await page.addInitScript(([messages, reduce, scale]) => {
    window.bridgeCalls = [];
    window.initialReduceTransparency = reduce;
    window.initialTextScale = scale;
    const saved = sessionStorage.getItem('ios-game');
    if (saved !== null) window.initialGame = saved;
    const messageHandlers = Object.fromEntries(messages.map(name => [name, {
      postMessage(body) {
        window.bridgeCalls.push([name, body]);
        if (name === 'game') sessionStorage.setItem('ios-game', body);
      },
    }]));
    Object.defineProperty(window, 'webkit', { configurable: true, value: { messageHandlers } });
  }, [iosMessages, reduceTransparency, textScale]);
}

// A stand-in for the Screen Wake Lock API that records 'request screen' and 'release' in window.wakeLockCalls, or
// declines every request. window.setTestHidden(true or false) sends the page to the background and back; as in a
// browser, going to the background releases every lock.
export async function mockWakeLock(page, { decline = false } = {}) {
  await page.addInitScript((declines) => {
    window.wakeLockCalls = [];
    const held = new Set();
    let hidden = false;
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    window.setTestHidden = async (next) => {
      hidden = next;
      if (hidden) for (const sentinel of held) await sentinel.release();
      document.dispatchEvent(new Event('visibilitychange'));
    };
    const wakeLock = {
      async request(type) {
        window.wakeLockCalls.push(`request ${type}`);
        if (declines) throw new DOMException('Wake lock declined', 'NotAllowedError');
        const sentinel = new EventTarget();
        Object.assign(sentinel, {
          type,
          released: false,
          async release() {
            if (sentinel.released) return;
            sentinel.released = true;
            held.delete(sentinel);
            window.wakeLockCalls.push('release');
            sentinel.dispatchEvent(new Event('release'));
          },
        });
        held.add(sentinel);
        return sentinel;
      },
    };
    Object.defineProperty(Navigator.prototype, 'wakeLock', { configurable: true, get: () => wakeLock });
  }, decline);
}
