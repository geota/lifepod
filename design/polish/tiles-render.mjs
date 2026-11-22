// Tile palette sets (TILES.md; renders/tiles-*.png) on the current app with the Graphite chrome. Reads tiles7.json,
// so run `node design/polish/tiles7.mjs` first. Run from the repo root:  node design/polish/tiles-render.mjs [set ...]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch, close, open, game, shot, compose } from './lib.mjs';
import { paletteCss } from './palettes7.mjs';

const sets = JSON.parse(readFileSync(fileURLToPath(new URL('./tiles7.json', import.meta.url)), 'utf8'));
const only = process.argv.slice(2);
await launch();
const caption = (f, text) => ({ ...f, caption: text });
const fit = (f, show) => ({ ...f, show });
const T = { width: 952, height: 427 };

// A set as CSS: every --<id>-<row>-<role> token.
const setCss = key => `:root { ${Object.entries(sets[key].set).flatMap(([id, rows]) => Object.entries(rows).flatMap(([row, roles]) =>
  Object.entries(roles).map(([role, hex]) => `--${id}-${row}-${role}: ${hex};`))).join(' ')} }`;
// Deuteranope view: Machado et al. 2009 (severity 1.0) in linear RGB, as an SVG filter over the page.
const deutanJs = `
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('width', 0); svg.setAttribute('height', 0); svg.style.position = 'absolute';
  svg.innerHTML = '<filter id="mk-deutan" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0"/></filter>';
  document.body.append(svg); document.documentElement.style.filter = 'url(#mk-deutan)';`;

const n6 = [0, 1, 2, 3, 4, 5];
const seed = colors => game(6, {
  scores: [31, 24, 27, 38, 19, 35], colors,
  identities: ['WUB', 'UG', 'WBR', 'BRG', 'WUBRG', 'RG'],
  counters: { commander: true, poison: true, energy: true, experience: false, rad: false },
  poison: [0, 2, 0, 7, 0, 1], casts: [1, 0, 2, 0, 0, 1], energy: [0, 3, 0, 0, 2, 0],
  commanderDamage: n6.map(d => n6.map(a => (d === a ? 0 : [0, 6, 0, 3, 9][(d + a) % 5]))),
  identity: { show: { indicator: true, symbol: false, name: true }, background: 'symbol' },
});
async function frame(key, colors, opts = {}) {
  const p = await open(opts.size ?? T, seed(colors), { css: paletteCss('graphite') + setCss(key) });
  if (opts.colours) { await p.evaluate("setBoardMode('colours')"); await p.waitForTimeout(150); }
  if (opts.deutan) await p.evaluate(deutanJs);
  await p.waitForTimeout(150);
  const f = await shot(p);
  await p.close();
  return f;
}

const strips = {};
for (const key of Object.keys(sets)) {
  strips[`tiles-${key}`] = async () => {
    const s = sets[key];
    const rows = [
      { title: 'Six players, colours 1–6 and 7–12 (Graphite chrome)', frames: [caption(fit(await frame(key, [0, 1, 2, 3, 4, 5]), 420), s.names.slice(0, 6).join(' · ')), caption(fit(await frame(key, [6, 7, 8, 9, 10, 11]), 420), s.names.slice(6).join(' · '))] },
      { title: 'Colours mode, and the same board as a deuteranope sees it', frames: [caption(fit(await frame(key, [0, 1, 2, 3, 4, 5], { colours: true }), 420), 'All twelve swatches'), caption(fit(await frame(key, [0, 1, 2, 3, 4, 5], { deutan: true }), 420), 'Deuteranope simulation (Machado 2009)')] },
    ];
    await compose(`tiles-${key}`, `Tiles · ${s.name}`, s.note, rows);
  };
}
strips['tiles-overview'] = async () => {
  const rows = [];
  for (const [key, s] of Object.entries(sets)) rows.push({ title: s.name, frames: [caption(fit(await frame(key, [0, 1, 2, 3, 4, 5]), 272), 'Colours 1–6'), caption(fit(await frame(key, [6, 7, 8, 9, 10, 11]), 272), 'Colours 7–12'), caption(fit(await frame(key, [0, 1, 2, 3, 4, 5], { deutan: true }), 272), 'Deuteranope')] });
  await compose('tiles-overview', 'Tile palette sets side by side', 'Every set passes the app’s contrast minimums on every panel. The deuteranope column shows how far apart the colours stay for the most common colour blindness.', rows);
};

for (const [name, run] of Object.entries(strips)) {
  if (only.length && !only.includes(name)) continue;
  await run();
}
await close();
