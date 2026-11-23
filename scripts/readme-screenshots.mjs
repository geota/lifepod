// Renders the README's screenshots into screenshots/readme/ from the real app. Run with `npm run screenshots:readme`,
// or name files to render just those: `npm run screenshots:readme -- turn.png dice.png`.
// Each shot seeds a saved game (the shape loadGame() in web/js/logic/save.js reads; the seeds are trimmed copies of
// design/polish/final-review.mjs's), opens a mode through the real controls, and saves the viewport or one element.
// Nothing else in the repo is written.
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright-core';
import { serveApp } from './serve.mjs';
import { fakeScreenOrientation, turnScreen } from '../tests/helpers.mjs';

const outDir = new URL('../screenshots/readme/', import.meta.url).pathname;

const sizes = {
  pixel: { width: 952, height: 427 }, // Pixel 11 Pro in landscape, the design target
  ipad: { width: 1366, height: 1024 }, // 13-inch iPad in landscape
};

// ---- Seeds ------------------------------------------------------------------------------------------------------
const pick = (list, count) => Array.from({ length: count }, (_, i) => list[i % list.length]);
const zeros = count => Array(count).fill(0);
const base = count => ({
  startingLife: 40, scores: pick([40, 33, 27, 38, 19, 35], count), rotations: zeros(count), keepAwake: true, landscapeAngle: 90,
  colors: Array.from({ length: count }, (_, i) => i), tileColours: 'clear', badgeSize: 'default',
  counters: { commander: false, poison: false, energy: false, experience: false, rad: false, monarch: false, initiative: false },
  monarch: null, initiative: null,
  poison: zeros(count), casts: zeros(count), energy: zeros(count), experience: zeros(count), rad: zeros(count),
  identities: zeros(count).map(() => ''), identity: { show: { indicator: true, symbol: false, name: true }, background: 'symbol' },
  commanderDamage: Array.from({ length: count }, () => zeros(count)),
  manaPool: false, autoEmpty: true, pools: Array.from({ length: count }, () => zeros(6)), turns: 'off', turn: { first: null, active: null, round: 1 },
});
// Commander damage from every opponent: 16 (a warning), 12, 8, 3 and 1.
const damageFrom = count => Array.from({ length: count }, (_, d) => Array.from({ length: count }, (_, a) => (d === a ? 0 : [16, 12, 8, 3, 1][(d + a) % 5])));
const seeds = {
  // A typical Commander night: commander damage, tax and poison, the monarch with player 4, Rounds, identities.
  commander: count => ({
    ...base(count), counters: { commander: true, poison: true, energy: false, experience: false, rad: false, monarch: true, initiative: false },
    monarch: count - 1,
    poison: pick([0, 3, 0, 1, 0, 0], count), casts: pick([1, 0, 2, 0, 1, 0], count),
    identities: pick(['WUB', 'RG', 'WURG', 'B', 'WUBRG', 'UG'], count),
    commanderDamage: damageFrom(count).map(row => row.map(v => (v > 12 ? 0 : v))),
    turns: 'rounds', turn: { first: 1 % count, active: 1 % count, round: 4 },
  }),
  // Everything on: every counter, warnings, Turn by turn with player 3 active, mana floating for players 3 and 4, the
  // monarch with player 3 and the initiative with player 4.
  everything: count => ({
    ...base(count),
    scores: pick([62, 18, 27, 5, 40, 19], count),
    counters: { commander: true, poison: true, energy: true, experience: true, rad: true, monarch: true, initiative: true },
    monarch: 2, initiative: 3,
    poison: pick([0, 4, 7, 2, 1, 9], count), casts: pick([1, 2, 0, 2, 1, 3], count),
    energy: pick([3, 2, 0, 4, 1, 3], count), experience: pick([1, 0, 1, 0, 3, 1], count), rad: pick([0, 0, 0, 2, 0, 1], count),
    identities: pick(['WURG', 'UB', 'UBRG', 'BG', 'WBRG', 'RG'], count), identity: { show: { indicator: true, symbol: true, name: true }, background: 'symbol' },
    commanderDamage: damageFrom(count),
    turns: 'turns', turn: { first: 0, active: count > 2 ? 2 : 0, round: 6 },
    manaPool: true, pools: Array.from({ length: count }, (_, i) => (i === 3 ? [0, 0, 2, 0, 3, 0] : i === 2 ? [1, 0, 0, 2, 0, 1] : zeros(6))),
  }),
  // Nothing tracked: the plain board.
  minimal: count => ({ ...base(count), scores: pick([40, 40, 40, 40, 40, 40], count), identity: { show: { indicator: false, symbol: false, name: false }, background: 'off' } }),
};

// ---- Modes: each opens from the board at rest by tapping the real controls ---------------------------------------
const click = async (page, selector) => {
  const target = page.locator(selector).first();
  try {
    await target.tap({ timeout: 1500 });
  } catch {
    await target.evaluate(el => el.click());
  }
};
const openSetup = page => click(page, '#setup-button');
const modes = {
  rest: async () => {},
  damage: page => click(page, '#damage-button'),
  counters: page => click(page, '#counters-button'),
  mana: page => click(page, '#mana-button'),
  dice: page => click(page, '#dice-button'),
  colours: async (page) => { await openSetup(page); await click(page, '#tile-colours'); },
  identity: async (page) => { await openSetup(page); await click(page, '#choose-identities'); },
};

// ---- The shots -----------------------------------------------------------------------------------------------------
// crop is null for the whole viewport, or a selector for one element. On a 4-player board, tiles 2 and 3 are the bottom
// row (data-row="bottom"), which faces the near long side and so reads upright.
const tile = i => `#board .player >> nth=${i}`;
const pixel = { size: 'pixel', engine: 'chromium', style: 'material', count: 4, scale: 2 };
const shots = [
  { ...pixel, file: 'hero.png', seed: 'commander', mode: 'rest', crop: null },
  { ...pixel, file: 'turn.png', seed: 'everything', mode: 'rest', crop: tile(2) },
  { ...pixel, file: 'counters.png', seed: 'everything', mode: 'counters', crop: tile(3) },
  { ...pixel, file: 'commander-damage.png', seed: 'commander', mode: 'damage', crop: tile(2) },
  { ...pixel, file: 'mana.png', seed: 'everything', mode: 'mana', crop: tile(2) },
  { ...pixel, file: 'identity.png', seed: 'commander', mode: 'identity', crop: tile(2) },
  { ...pixel, file: 'tile-colours.png', seed: 'minimal', mode: 'colours', crop: tile(2) },
  { ...pixel, file: 'dice.png', seed: 'minimal', mode: 'dice', crop: '#dice .sheet' },
  { size: 'ipad', engine: 'webkit', style: 'glass', count: 6, scale: 1, file: 'ipad-glass.png', seed: 'everything', mode: 'rest', crop: null },
];

// ---- Rendering -----------------------------------------------------------------------------------------------------
const settle = page => page.evaluate(() => new Promise((done) => {
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 300)));
}));

async function load(page, game, style) {
  await page.evaluate((saved) => { localStorage.setItem('lifepod-game', saved); }, JSON.stringify({ ...game, style }));
  await page.reload();
  await page.waitForSelector('#board .player');
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
}

const only = new Set(process.argv.slice(2));
const unknown = [...only].filter(file => !shots.some(shot => shot.file === file));
if (unknown.length) throw new Error(`No such shot: ${unknown.join(', ')}`);

await mkdir(outDir, { recursive: true });
const server = await serveApp();
const engines = { chromium, webkit };
const browsers = {};
const errors = [];
try {
  for (const shot of shots.filter(s => !only.size || only.has(s.file))) {
    browsers[shot.engine] ??= await engines[shot.engine].launch();
    const { width, height } = sizes[shot.size];
    const context = await browsers[shot.engine].newContext({
      viewport: { width, height }, deviceScaleFactor: shot.scale, isMobile: shot.engine === 'chromium', hasTouch: true, reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${shot.file}: ${error.message}`));
    await fakeScreenOrientation(page);
    await page.goto(server.url);
    await turnScreen(page, width, height, 90);
    await load(page, seeds[shot.seed](shot.count), shot.style);
    await modes[shot.mode](page);
    await settle(page);
    const path = `${outDir}${shot.file}`;
    if (shot.crop) {
      // The centre pill would cut into a tile's inner corner, so a tile crop hides it. Through CSSOM: the page's CSP
      // refuses an injected <style>.
      if (shot.crop.startsWith('#board .player')) await page.locator('#board-controls').evaluate((pill) => { pill.style.visibility = 'hidden'; });
      await page.locator(shot.crop).first().screenshot({ path });
    } else {
      await page.screenshot({ path });
    }
    console.log(`screenshots/readme/${shot.file}`);
    await context.close();
  }
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await server.close();
}
if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
