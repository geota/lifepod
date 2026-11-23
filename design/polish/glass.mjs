// Solid vs glass pill (GLASS.md; renders/glass-*.png) on the current app with the Graphite chrome and direction A.
// Each crop is captioned with the measured contrast of the pill's icons against the backdrop under them.
// Run from the repo root:  node design/polish/glass.mjs [strip ...]
import { launch, close, open, inPage, game, shot, compose } from './lib.mjs';
import { paletteCss, ratio } from './palettes7.mjs';

const only = process.argv.slice(2);
const browser = import.meta.main ? await launch() : null;
const caption = (f, text) => ({ ...f, caption: text });
const T = { width: 952, height: 427 };
const S = { width: 568, height: 320 };

// The pill in direction A (solid), and two glass versions.
const pills = {
  solid: { name: 'Solid (direction A)', css: '.board-controls::before { border: 0; background: var(--raised); box-shadow: 0 1px 3px #0009, 0 6px 18px #0007; }' },
  clear: {
    name: 'Clear glass', css: `.board-controls::before { border: 1px solid #ffffff2e; background: #ffffff10; -webkit-backdrop-filter: blur(10px) saturate(1.8); backdrop-filter: blur(10px) saturate(1.8);
      box-shadow: inset 0 1px 0 #ffffff30, 0 6px 18px #0006; }`,
  },
  frosted: {
    name: 'Tinted glass (done well)', css: `.board-controls::before { border: 1px solid #ffffff24; background: color-mix(in oklab, var(--surface) 68%, transparent);
      -webkit-backdrop-filter: blur(18px) saturate(1.3); backdrop-filter: blur(18px) saturate(1.3); box-shadow: inset 0 1px 0 #ffffff22, 0 6px 18px #0007; }`,
  },
};
const pressCss = '.pill-button.mock-press::before { background: #ffffff1f; } .pill-button.mock-press { transform: scale(.94); }';

const n4 = [0, 1, 2, 3], n6 = [0, 1, 2, 3, 4, 5];
const base = n => game(n, {
  identities: ['WUBRG', 'WBR', 'UBG', 'BRG', 'WU', 'RG'].slice(0, n),
  counters: { commander: true, poison: true, energy: false, experience: false, rad: false },
  manaPool: true, turns: 'rounds', turn: { first: 0, active: null, round: 3 },
  commanderDamage: Array.from({ length: n }, (_, d) => Array.from({ length: n }, (_, a) => (d === a ? 0 : [0, 6, 9][(d + a) % 3]))),
  identity: { show: { indicator: true, symbol: false, name: true }, background: 'symbol' },
});
// Presses every life half, so seat-colour washes cover the whole board under the pill: the brightest backdrop it gets.
const washJs = "document.querySelectorAll('.player .controls button').forEach(b => { b.dataset.pressed = ''; })";

// The page code each scene runs, for tests/design.test.mjs.
export const snippets = () => Object.fromEntries(scenes.filter(scene => scene.js).map(scene => [scene.id, { seed: scene.seed, js: scene.js }]));
const scenes = [
  { id: 'busy4', label: '4 players: watermarks, every half pressed (washes everywhere)', size: T, seed: base(4), js: washJs },
  { id: 'two', label: '2 players: the pill over the seam between sideways tiles', size: T, seed: base(2), js: washJs },
  { id: 'six', label: '6 players', size: T, seed: base(6), js: washJs },
  { id: 'counters', label: 'Counters mode: Undo · ✓ · ✕', size: T, seed: base(4), js: "setBoardMode('counters')" },
  { id: 'mana', label: 'Mana mode', size: T, seed: base(4), js: "setBoardMode('mana')" },
  { id: 'pressed', label: 'Pressed: dice held', size: T, seed: base(4), js: "document.querySelector('#dice-button').classList.add('mock-press')" },
  { id: 'small', label: '568 × 320, 6 players, washes', size: S, seed: base(6), js: washJs },
];

// Contrast of the icon colour against the pill's backdrop: the icons are hidden, the pill area sampled, and the worst
// (lightest) 5% of pixels and the median reported.
async function measure(page) {
  const box = await page.locator('#board-controls').boundingBox();
  await page.addStyleTag({ content: '.pill-button > *, .pill-button::after { visibility: hidden !important; } .round-button .round, .save-button::before { visibility: hidden !important; }' });
  await page.waitForTimeout(80);
  const clip = { x: box.x + 10, y: box.y + 10, width: box.width - 20, height: box.height - 20 };
  const png = await page.screenshot({ clip });
  const icon = await page.evaluate(() => getComputedStyle(document.querySelector('#setup-button')).color);
  const probe = await browser.newPage();
  const lums = await probe.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; const out = [];
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    for (let i = 0; i < d.length; i += 4) out.push(0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]));
    return out.sort((a, b) => a - b);
  }, png.toString('base64'));
  await probe.close();
  const [r, g, b] = icon.match(/\d+/g).map(Number);
  const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  const lumHex = l => { const v = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055; const h = Math.round(Math.min(1, v) * 255).toString(16).padStart(2, '0'); return '#' + h + h + h; };
  return { worst: ratio(hex, lumHex(lums[Math.floor(lums.length * 0.95)])), median: ratio(hex, lumHex(lums[Math.floor(lums.length / 2)])) };
}

async function crop(scene, pill) {
  const css = paletteCss('graphite') + pills[pill].css + pressCss;
  const p = await open(scene.size, scene.seed, { css });
  if (scene.js) await p.evaluate(inPage(scene.js));
  await p.waitForTimeout(200);
  const box = await p.locator('#board-controls').boundingBox();
  const w = Math.min(scene.size.width, box.width + 120), h = Math.min(scene.size.height, box.height + 100);
  const f = await shot(p, { x: Math.max(0, box.x + box.width / 2 - w / 2), y: Math.max(0, box.y + box.height / 2 - h / 2), width: w, height: h, pad: 0 });
  const full = await shot(p);
  const m = await measure(p);
  await p.close();
  return { f: { ...f, zoom: 1 }, full, m };
}

const strips = {};
strips['glass-cases'] = async () => {
  const rows = [];
  const results = [];
  for (const scene of scenes) {
    const frames = [];
    for (const key of Object.keys(pills)) {
      const { f, m } = await crop(scene, key);
      results.push(`${scene.id} ${key}: worst ${m.worst.toFixed(1)}:1, median ${m.median.toFixed(1)}:1`);
      frames.push(caption({ ...f, show: Math.min(f.width, 276) }, `${pills[key].name} · icons ${m.worst.toFixed(1)}:1 worst, ${m.median.toFixed(1)}:1 typical`));
    }
    rows.push({ title: scene.label, frames });
  }
  console.log(results.join('\n'));
  await compose('glass-cases', 'Solid vs glass pill in the hard cases', 'Crops around the pill, actual size. Captions: contrast of the pill icons (Graphite soft text) against the lightest 5% of the backdrop under them, and against its median. WCAG asks 3:1 for icons (1.4.11).', rows);
};
strips['glass-boards'] = async () => {
  const rows = [];
  for (const scene of [scenes[0], scenes[1], scenes[6]]) {
    const frames = [];
    for (const key of ['solid', 'frosted']) frames.push(caption({ ...(await crop(scene, key)).full, show: scene.size === S ? 300 : 420 }, pills[key].name));
    rows.push({ title: scene.label, frames });
  }
  await compose('glass-boards', 'Whole boards: solid and tinted glass', '', rows);
};

// Run as a script; tests/design.test.mjs imports it only for its snippets.
if (import.meta.main) {
  for (const [name, run] of Object.entries(strips)) {
    if (only.length && !only.includes(name)) continue;
    await run();
  }
  await close();
}
