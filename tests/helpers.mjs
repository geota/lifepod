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
