// Settings refactor mock-ups (renders/settings-*.png): one full-screen, scrolling settings page in place of the setup
// dialog and its Track and Identity sheets, drawn on the current app (web/index.html). The page is built from clones
// of the app's own controls, so it uses the shipped classes, icons and palette. Nothing in web/ changes.
// Run from the repo root:  node design/polish/settings.mjs [strip ...]
import { launch, close, open, shot, compose } from './lib.mjs';
import { seed, pageJs, pageCss } from './settings-lib.mjs';

const only = process.argv.slice(2);
await launch();
const caption = (f, text) => ({ ...f, caption: text });
const fit = (f, show) => ({ ...f, show });

async function page(size, layout, opts = {}) {
  const p = await open(size, seed, { css: pageCss });
  await p.evaluate(pageJs(layout, opts));
  await p.waitForTimeout(150);
  return p;
}
// The page at its full scrolling length: the viewport grows to the content's height.
async function fullLength(size, layout, opts = {}) {
  const p = await page(size, layout, opts);
  const h = await p.evaluate('mkFull()');
  await p.setViewportSize({ width: size.width, height: Math.max(size.height, h + 4) });
  await p.waitForTimeout(150);
  const f = await shot(p);
  await p.close();
  return f;
}
async function top(size, layout, opts = {}) {
  const p = await page(size, layout, opts);
  const f = await shot(p);
  await p.close();
  return f;
}

const T = { width: 952, height: 427 };
const S = { width: 568, height: 320 };
const layouts = {
  list: ['A', 'One scrolling column of sections', 'Sections stack in one centred column (760px at most), each a card with a small caps title. Switches sit three or four to a line; choices stay segmented. Board actions (Choose identities, Colours, Rotate seats) end in an out-to-the-board arrow: one tap closes settings and starts the mode. Simple to scan and to build; the most scrolling.'],
  columns: ['B', 'Two columns of sections', 'Game and Table on the left, Track and Identity on the right, About across the bottom. On the target most of it fits in one or two screens; below 620px wide it falls back to one column.'],
  rail: ['C', 'An index rail beside the content', 'Section names stay on the left (icons only below 620px wide); the content scrolls on its own and the rail marks where you are. One tap jumps to a section. Most like a phone’s own settings app, at the cost of 188px of width.'],
};

const strips = {};
for (const [layout, [letter, title, note]] of Object.entries(layouts)) {
  strips[`settings-${letter.toLowerCase()}`] = async () => {
    const rows = [
      { title: '952 × 427 (target): first screen, and the whole page', frames: [caption(fit(await top(T, layout), 420), 'As it opens'), caption(fit(await fullLength(T, layout), 420), 'Whole page (what scrolling reveals)')] },
      { title: '568 × 320 (stress)', frames: [caption(fit(await top(S, layout), 300), 'As it opens'), caption(fit(await fullLength(S, layout), 300), 'Whole page')] },
    ];
    await compose(`settings-${letter.toLowerCase()}`, `${letter} · ${title}`, note, rows);
  };
}
strips['settings-more'] = async () => {
  const P = { width: 375, height: 667 };
  const Tab = { width: 1366, height: 1024 };
  const rows = [];
  for (const [layout, [letter, title]] of Object.entries(layouts)) {
    rows.push({ letter, title, frames: [caption(fit(await top(P, layout), 190), 'Portrait 375 × 667'), caption(fit(await top(Tab, layout), 470), 'Tablet 1366 × 1024')] });
  }
  rows.push({ title: 'A new game waiting (players changed to 6), option A at the target', frames: [caption(fit(await top(T, 'list', { pending: true }), 420), 'Done becomes “Start new game”; the Game section says what will happen')] });
  await compose('settings-more', 'Portrait, tablet, and a pending new game', '', rows);
};

for (const [name, run] of Object.entries(strips)) {
  if (only.length && !only.includes(name)) continue;
  await run();
}
await close();
