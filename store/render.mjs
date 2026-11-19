// Renders the Google Play and App Store images from the real app. Run with `npm run store:images`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { app, button, fakeScreenOrientation } from '../tests/helpers.mjs';

const out = new URL('./', import.meta.url).pathname;

// Each scene is a saved game, optionally with a dialog or seat rotation open.
const scenes = [
  { name: '01-four-players', startingLife: 40, scores: [31, 24, 40, 17] },
  { name: '02-six-players', startingLife: 40, scores: [40, 33, 28, 12, 36, 21] },
  { name: '03-three-players', startingLife: 20, scores: [18, 11, 20] },
  { name: '04-five-players', startingLife: 40, scores: [27, 40, 35, 19, 32] },
  { name: '05-two-players', startingLife: 20, scores: [14, 6] },
  { name: '06-setup', startingLife: 40, scores: [31, 24, 40, 17], open: 'setup' },
  { name: '07-rotate-seats', startingLife: 40, scores: [40, 33, 28, 12, 36, 21], rotations: [1, 0, 0, 0, 0, 1], open: 'rotate' },
];

// Store sizes. Viewport × scale gives each store's exact pixel size.
const devices = [
  // Google Play requires 16:9 for phone and tablet screenshots.
  { dir: 'play/phone', width: 960, height: 540, scale: 2 },          // 1920 × 1080
  { dir: 'play/tablet-7in', width: 1024, height: 576, scale: 2 },    // 2048 × 1152
  { dir: 'play/tablet-10in', width: 1280, height: 720, scale: 2 },   // 2560 × 1440
  { dir: 'app-store/iphone-6.9in', width: 956, height: 440, scale: 3 }, // 2868 × 1320
  { dir: 'app-store/ipad-13in', width: 1376, height: 1032, scale: 2 },  // 2752 × 2064
];

// The README screenshots, at the 852 × 393 phone size, saved under the names the README uses.
const readme = {
  dir: '../screenshots', width: 852, height: 393, scale: 2,
  names: {
    '01-four-players': 'board', '02-six-players': 'six-players', '03-three-players': 'three-players',
    '04-five-players': 'five-players', '06-setup': 'setup', '07-rotate-seats': 'rotate-seats',
  },
};

async function renderScene(browser, device, scene) {
  const page = await browser.newPage({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.scale, isMobile: true, hasTouch: true,
  });
  // Runs before the fake screen reads its angle: a landscape phone at 90°, so the board is upright.
  await page.addInitScript(game => {
    sessionStorage.setItem('test-screen-angle', '90');
    localStorage.setItem('lifepod-game', JSON.stringify(game));
  }, {
    startingLife: scene.startingLife,
    scores: scene.scores,
    rotations: scene.rotations ?? scene.scores.map(() => 0),
    keepAwake: true,
  });
  await fakeScreenOrientation(page);
  await page.goto(app);
  const turn = await page.locator('.app').getAttribute('data-board-turn');
  if (turn !== '0') throw new Error(`${scene.name} rendered with the board turned ${turn}°`);
  if (scene.open) {
    await button(page, 'Game setup').tap();
    if (scene.open === 'rotate') await button(page, 'Rotate seats').tap();
    await page.evaluate(() => document.activeElement?.blur());
  }
  const path = `${out}${device.dir}/${device.names?.[scene.name] ?? scene.name}.png`;
  await page.screenshot({ path });
  await page.close();
  return path;
}

const browser = await chromium.launch();
try {
  for (const device of devices) {
    rmSync(`${out}${device.dir}`, { recursive: true, force: true });
    mkdirSync(`${out}${device.dir}`, { recursive: true });
    for (const scene of scenes) await renderScene(browser, device, scene);
  }
  for (const scene of scenes.filter(({ name }) => readme.names[name])) await renderScene(browser, readme, scene);

  // Play's feature graphic is drawn from the four-player phone screenshot.
  const graphic = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await graphic.goto(new URL('./feature-graphic.html', import.meta.url).href);
  await graphic.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  await graphic.screenshot({ path: `${out}play/feature-graphic.png` });
} finally {
  await browser.close();
}

// Play's 512 × 512 icon comes from the iOS app icon art.
const iosIcon = new URL('../ios/Assets.xcassets/AppIcon.appiconset/AppIcon.png', import.meta.url).pathname;
execFileSync('sips', ['-z', '512', '512', iosIcon, '--out', `${out}play/icon-512.png`], { stdio: 'ignore' });
console.log(`Rendered store images in ${out}`);
