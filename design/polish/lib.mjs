// Shared helpers for the polish renders: open the real app (web/index.html) with a seeded game, inject mock CSS
// and JS, and compose labelled comparison strips. Nothing here changes web/.
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { app } from '../../tests/helpers.mjs';

export const outDir = fileURLToPath(new URL('./renders/', import.meta.url));
export const sizes = {
  target: { width: 952, height: 427, label: 'Pixel 11 Pro · 952 × 427' },
  phone: { width: 852, height: 393, label: 'Phone · 852 × 393' },
  small: { width: 640, height: 360, label: 'Smallest real phone · 640 × 360' },
  tablet: { width: 1366, height: 1024, label: 'Tablet · 1366 × 1024' },
};

// Seeded games. Colours default to seats 1–6 (Sage, Sky, Coral, Violet, Amber, Teal).
export function game(count, extra = {}) {
  const base = {
    2: { scores: [27, 33] },
    3: { scores: [31, 24, 38] },
    4: { scores: [31, 24, 27, 38] },
    5: { scores: [31, 24, 27, 38, 19] },
    6: { scores: [31, 24, 27, 38, 19, 35] },
  }[count];
  const zero = Array(count).fill(0);
  return {
    startingLife: 40, rotations: [...zero], keepAwake: false,
    colors: Array.from({ length: count }, (_, i) => i),
    counters: { commander: true, poison: true },
    poison: [...zero], casts: [...zero],
    identities: ['WUB', 'UG', 'RW', 'BRG', 'WUBRG', 'BG'].slice(0, count),
    commanderDamage: Array.from({ length: count }, () => [...zero]),
    ...base,
    ...extra,
  };
}

let browser;
export const errors = [];
export async function launch() {
  browser = await chromium.launch();
  return browser;
}
export async function close() {
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
}

// Opens the app at a size with a game, then applies a variant's CSS and JS. scale is the device pixel ratio.
export async function open(size, seed, variant = {}, scale = 2) {
  const { width, height } = sizes[size] ?? size;
  const page = await browser.newPage({
    viewport: { width, height }, deviceScaleFactor: scale,
    isMobile: true, hasTouch: true, reducedMotion: 'reduce', bypassCSP: true,
  });
  page.on('pageerror', e => errors.push(`${width}×${height}: ${e.message}`));
  await page.addInitScript(g => {
    if (!sessionStorage.getItem('polish-seeded')) {
      localStorage.setItem('lifepod-game', JSON.stringify(g));
      sessionStorage.setItem('polish-seeded', '1');
    }
  }, seed);
  await page.goto(app);
  await page.waitForSelector('#board .player');
  if (variant.css) await page.addStyleTag({ content: variant.css });
  if (variant.js) await page.evaluate(variant.js);
  await page.evaluate(() => window.fitAllBadges?.());
  return page;
}

export const tap = (page, selector) => page.locator(selector).first().tap();

// Holds the pointer down on an element (without releasing) so its pressed state shows in a screenshot.
export async function pressHold(page, selector) {
  await page.locator(selector).first().evaluate(el => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 77, button: 0, isPrimary: false }));
  });
  await page.waitForTimeout(60);
}

export async function shot(page, clip) {
  if (!clip) return { image: await page.screenshot(), width: page.viewportSize().width };
  const box = typeof clip === 'string' ? await page.locator(clip).first().boundingBox() : clip;
  const pad = clip.pad ?? 6;
  return {
    image: await page.screenshot({ clip: { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad } }),
    width: box.width + 2 * pad, height: box.height + 2 * pad,
  };
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const img = (buf, width, angle) => {
  const tag = `<img src="data:image/png;base64,${buf.toString('base64')}" style="width:${width}px">`;
  return angle ? `<div style="transform:rotate(${angle}deg)">${tag}</div>` : tag;
};

// A strip: a title, an intro, then rows of { title, note, frames: [{ image, width, caption, zoom }] }.
// maxWidth keeps the output under about 1800 device pixels at the 2× scale used here.
export async function compose(name, title, intro, rows, { width = 860 } = {}) {
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 18px 20px 22px; background: #0c0f0d; color: #e8e6da; font: 13px/1.4 system-ui, -apple-system, sans-serif; width: ${width}px; }
    h1 { margin: 0 0 4px; font-size: 18px; letter-spacing: -.01em; }
    .intro { margin: 0 0 14px; color: #aab3a8; }
    .row { margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid #1f2620; }
    .row:last-child { border-bottom: 0; margin-bottom: 0; }
    .row h2 { margin: 0 0 2px; font-size: 14.5px; }
    .row h2 b { display: inline-block; min-width: 1.5em; padding: 0 6px; margin-right: 6px; border-radius: 6px; background: #def09a; color: #202914; text-align: center; }
    .row p { margin: 0 0 8px; color: #aab3a8; font-size: 12.5px; }
    .frames { display: flex; flex-wrap: wrap; gap: 10px 12px; align-items: flex-start; }
    figure { margin: 0; width: min-content; }
    figure img { display: block; border-radius: 5px; outline: 1px solid #2a312b; }
    figcaption { margin-top: 3px; color: #8f998d; font-size: 11.5px; }
  </style><h1>${esc(title)}</h1>${intro ? `<p class="intro">${esc(intro)}</p>` : ''}${rows.map(r => `<div class="row">
    ${r.title ? `<h2>${r.letter ? `<b>${esc(r.letter)}</b>` : ''}${esc(r.title)}</h2>` : ''}${r.note ? `<p>${esc(r.note)}</p>` : ''}
    <div class="frames">${r.frames.map(f => `<figure>${img(f.image, (f.show ?? f.width) * (f.zoom ?? 1), f.angle)}${f.caption ? `<figcaption>${esc(f.caption)}</figcaption>` : ''}</figure>`).join('')}</div>
  </div>`).join('')}`;
  const page = await browser.newPage({ viewport: { width: width + 40, height: 100 }, deviceScaleFactor: 2 });
  await page.setContent(html);
  await page.screenshot({ path: `${outDir}${name}.png`, fullPage: true });
  await page.close();
  console.log('wrote', `${name}.png`);
}
