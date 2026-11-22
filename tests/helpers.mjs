export const app = new URL('../web/index.html', import.meta.url).href;

// Replaces screen.orientation with one the test controls. The angle survives reloads, like a real device.
// Angles follow a phone whose natural orientation is portrait.
export async function fakeScreenOrientation(page) {
  await page.addInitScript(() => {
    const types = { 0: 'portrait-primary', 90: 'landscape-primary', 180: 'portrait-secondary', 270: 'landscape-secondary' };
    const orientation = new EventTarget();
    let angle = Number(sessionStorage.getItem('test-screen-angle') ?? 0);
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
  });
}

// Resizes the window, then reports the new screen angle, as a phone does when it turns.
export async function turnScreen(page, width, height, angle) {
  await page.setViewportSize({ width, height });
  await page.evaluate(next => window.turnTestScreen(next), angle);
}

export function button(page, name) {
  return page.getByRole('button', { name, exact: true });
}

export async function startGame(page, count) {
  await button(page, 'Game setup').tap();
  await button(page, `${count} players`).tap();
  await page.locator('#save-setup').tap();
}

export function scores(page) {
  return page.locator('.score').evaluateAll(outputs => outputs.map(output => Number(output.value.replace('−', '-'))));
}

// Sets tracker switches in Setup → Track, then closes setup. Each switch saves the moment it changes.
export async function setSwitches(page, wanted) {
  await button(page, 'Game setup').tap();
  await button(page, 'Track').tap();
  for (const [name, on] of Object.entries(wanted)) {
    const input = page.getByRole('switch', { name, exact: true });
    if ((await input.isChecked()) !== on) await page.locator('#track label', { has: input }).tap();
  }
  await button(page, 'Close setup').tap();
}

// Anything wrong with the mana strips at rest: a strip over its tile's life total, − and + glyphs, "Out" tag or near
// row, a strip target under 44px, or one outside its tile.
export function stripProblems(page) {
  return page.evaluate(() => {
    const overlaps = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    return [...document.querySelectorAll('.player')].flatMap((player, index) => {
      const strip = player.querySelector('.mana-strip');
      if (strip.hidden || !strip.offsetWidth) return [];
      const problems = [];
      const box = strip.getBoundingClientRect();
      const tile = player.getBoundingClientRect();
      for (const blocker of player.querySelectorAll('.score, .controls button, .out-tag, .badges.near > *')) {
        if (!blocker.checkVisibility() || !blocker.offsetWidth) continue;
        if (overlaps(box, blocker.getBoundingClientRect())) problems.push(`covers ${blocker.className}`);
      }
      for (const item of strip.querySelectorAll('button:not(.chip)')) {
        if (!item.checkVisibility() || !item.offsetWidth) continue;
        const target = item.getBoundingClientRect();
        if (target.width < 43.5 || target.height < 43.5) problems.push(`${item.className} ${Math.round(target.width)}×${Math.round(target.height)}`);
        if (target.left < tile.left - 0.5 || target.right > tile.right + 0.5 || target.top < tile.top - 0.5 || target.bottom > tile.bottom + 0.5) {
          problems.push(`${item.className} outside its tile`);
        }
      }
      return problems.map(problem => `P${index + 1} strip: ${problem}`);
    });
  });
}

// The methods of GameBridge in android/src/dev/maceiras/lifepod/MainActivity.kt and the message handlers in
// ios/LifePodApp.swift. tests/native.test.mjs checks both lists against those sources, and the mocks below are built
// from them, so the mocks can't drift from the wrappers.
export const androidMethods = ['readGame', 'writeGame', 'keepAwake', 'haptic', 'setBackHandling'];
export const iosMessages = ['game', 'keepAwake', 'haptic'];

// A stand-in for the Android bridge that records every call in window.bridgeCalls as [method, ...arguments]. The game
// is kept in session storage, as SharedPreferences keeps it, so it survives a reload.
export async function mockAndroid(page) {
  await page.addInitScript((methods) => {
    window.bridgeCalls = [];
    const behaviour = {
      readGame: () => sessionStorage.getItem('android-game'),
      writeGame: game => sessionStorage.setItem('android-game', game),
    };
    window.LifePodAndroid = Object.fromEntries(methods.map(name => [name, (...args) => {
      window.bridgeCalls.push([name, ...args]);
      return behaviour[name]?.(...args);
    }]));
  }, androidMethods);
}

// A stand-in for the iOS app's window.webkit.messageHandlers that records every message in window.bridgeCalls as
// [name, body]. Like LifePodApp.swift, it keeps the last game message and injects it as window.initialGame before
// the page loads.
export async function mockIos(page) {
  await page.addInitScript((messages) => {
    window.bridgeCalls = [];
    const saved = sessionStorage.getItem('ios-game');
    if (saved !== null) window.initialGame = saved;
    const messageHandlers = Object.fromEntries(messages.map(name => [name, {
      postMessage(body) {
        window.bridgeCalls.push([name, body]);
        if (name === 'game') sessionStorage.setItem('ios-game', body);
      },
    }]));
    Object.defineProperty(window, 'webkit', { configurable: true, value: { messageHandlers } });
  }, iosMessages);
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
