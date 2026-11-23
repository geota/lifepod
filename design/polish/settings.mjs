// The full-screen settings page as shipped (renders/settings-page*.png): at the target and the stress size, as it opens
// and at its full length, then in portrait, on a tablet, and with a new game waiting. It opens the app's own settings
// (settings-lib.mjs). The refactor's mock-ups, A, B and C, are in renders/settings-a.png, -b, -c and -more
// (SETTINGS.md); layout B shipped, and the mock-up code went with it. Nothing in web/ changes.
// Run from the repo root:  node design/polish/settings.mjs [strip ...]
import { launch, close, open, inPage, shot, compose } from './lib.mjs';
import { seed, settingsJs } from './settings-lib.mjs';

const only = process.argv.slice(2);
const caption = (f, text) => ({ ...f, caption: text });
const fit = (f, show) => ({ ...f, show });

async function page(size, opts = {}) {
  const p = await open(size, seed);
  await p.evaluate(inPage(settingsJs(opts)));
  await p.waitForTimeout(150);
  return p;
}
// The page at its full scrolling length: the viewport grows to the content's height.
async function fullLength(size, opts = {}) {
  const p = await page(size, opts);
  const h = await p.evaluate('mkFull()');
  await p.setViewportSize({ width: size.width, height: Math.max(size.height, h + 4) });
  await p.waitForTimeout(150);
  const f = await shot(p);
  await p.close();
  return f;
}
async function top(size, opts = {}) {
  const p = await page(size, opts);
  const f = await shot(p);
  await p.close();
  return f;
}

const T = { width: 952, height: 427 };
const S = { width: 568, height: 320 };
const P = { width: 375, height: 667 };
const Tab = { width: 1366, height: 1024 };

// The page code the frames run, for tests/design.test.mjs.
export const snippets = () => ({
  'As it opens': { seed, js: settingsJs() },
  'A new game waiting, scrolled to the end': { seed, js: settingsJs({ pending: true, scrollToEnd: true }) },
});

const strips = {
  'settings-page': async () => {
    const rows = [
      { title: '952 × 427 (target): first screen, and the whole page', frames: [caption(fit(await top(T), 420), 'As it opens'), caption(fit(await fullLength(T), 420), 'Whole page (what scrolling reveals)')] },
      { title: '568 × 320 (stress)', frames: [caption(fit(await top(S), 300), 'As it opens'), caption(fit(await fullLength(S), 300), 'Whole page')] },
    ];
    await compose('settings-page', 'Settings', 'Sections in two columns on wide screens and one on narrow ones; switches line up in grids, and the board actions end in an out-to-the-board arrow.', rows);
  },
  'settings-page-more': async () => {
    const rows = [
      { title: 'Portrait and tablet', frames: [caption(fit(await top(P), 190), 'Portrait 375 × 667'), caption(fit(await top(Tab), 470), 'Tablet 1366 × 1024')] },
      { title: 'A new game waiting (players changed to 6) at the target', frames: [caption(fit(await top(T, { pending: true }), 420), 'Done becomes “Start new game”; the Game section says what will happen')] },
    ];
    await compose('settings-page-more', 'Settings: portrait, tablet, and a pending new game', '', rows);
  },
};

// Run as a script; tests/design.test.mjs imports it only for its snippets.
if (import.meta.main) {
  await launch();
  for (const [name, run] of Object.entries(strips)) {
    if (only.length && !only.includes(name)) continue;
    await run();
  }
  await close();
}
