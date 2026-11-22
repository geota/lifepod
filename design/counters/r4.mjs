// Round 4 renders: colour and pip fixes, mocked on the real app (web/index.html) with injected CSS and JS.
// Writes design/counters/renders/r4-*.png. Run from the repo root: node design/counters/r4.mjs [strip ...]
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { appFile as app } from '../../tests/helpers.mjs';

const outDir = fileURLToPath(new URL('./renders/', import.meta.url));
const only = process.argv.slice(2);
const browser = await chromium.launch();
const errors = [];
const SCALE = 3;
const sizes = {
  four: { width: 852, height: 393, label: '4 players · 852 × 393' },
  six: { width: 320, height: 568, label: '6 players · 320 × 568' },
};

// Game states. Colours: 4 players use Sage, Sky, Coral, Violet; 6 players Amber, Teal, Rose, Indigo, Slate, Sage,
// so the two sizes between them show all nine swatches.
const games = {
  four: {
    startingLife: 40, scores: [31, 24, 27, 38], rotations: [0, 0, 0, 0], keepAwake: false,
    colors: [0, 1, 2, 3], counters: { commander: true, poison: true },
    poison: [2, 0, 7, 0], casts: [1, 0, 2, 3], identities: ['WUBRG', 'UB', 'WB', 'C'],
    commanderDamage: [[0, 6, 0, 3], [0, 0, 16, 0], [9, 4, 0, 0], [0, 0, 2, 0]],
  },
  six: {
    startingLife: 40, scores: [0, 37, 33, 0, 40, 34], rotations: [0, 0, 0, 0, 0, 0], keepAwake: false,
    colors: [4, 5, 6, 7, 8, 0], counters: { commander: true, poison: true },
    poison: [9, 0, 0, 9, 3, 0], casts: [5, 1, 0, 5, 0, 2], identities: ['WUBRG', 'B', 'WUB', 'C', 'BRG', 'WB'],
    commanderDamage: [
      [0, 18, 12, 9, 7, 4], [3, 0, 0, 0, 0, 0], [0, 5, 0, 0, 2, 0],
      [4, 18, 12, 0, 9, 7], [0, 0, 0, 0, 0, 0], [0, 0, 6, 0, 0, 0],
    ],
  },
};

const sword = 'M216,28H152a12,12,0,0,0-9.33,4.45L79.5,110.51l-4.66-4.65a20,20,0,0,0-28.29,0L29.86,122.55a20,20,0,0,0,0,28.29h0L45,166,23.86,187.17a20,20,0,0,0,0,28.28l16.69,16.69a20,20,0,0,0,28.28,0L90,211l15.17,15.16a20,20,0,0,0,28.29,0l16.69-16.69a20,20,0,0,0,0-28.3l-4.65-4.65,78.06-63.17A12,12,0,0,0,228,104V40A12,12,0,0,0,216,28ZM54.69,212.34l-11-11L62,183l11,11Zm64.61-6L49.65,136.7l11.05-11,69.65,69.65ZM204,98.27l-75.58,61.17L121,152l47.51-47.5a12,12,0,0,0-17-17L104,135l-7.45-7.44L157.73,52H204Z';

// ---- Variants ---------------------------------------------------------------------------------------------

const map = {
  today: { title: 'Today', note: 'Pale seat fill; zero cells at 70% opacity blend with the tile underneath.', css: '' },
  A: {
    title: 'A · Mini tile',
    note: 'Attacker’s panel, rim border, number in their seat colour (7.4–9.4:1). Zero: lighter weight. Panel vs the defender’s panel can be 1.00:1, so only the rim (1.45–2.67:1) separates them.',
    css: `
      .map-cell[data-attacker] { border: 1.5px solid var(--rim); background: var(--panel); color: var(--seat); }
      .map-cell[data-zero] { opacity: 1; font-weight: var(--weight-semibold); }`,
  },
  B: {
    title: 'B · Solid seat, muted zero',
    note: 'Seat colour, solid (6.9–10.6:1 against any defender panel). Numbers in the attacker’s button colour (9.4–11.7:1); zero in a solid 40/60 button–rim mix, semibold (5.4–7.1:1).',
    css: `
      .map-cell[data-zero] { opacity: 1; color: color-mix(in oklab, var(--button) 40%, var(--rim)); font-weight: var(--weight-semibold); }`,
  },
  C: {
    title: 'C · Outlined at zero, filled once hit',
    note: 'Zero: the attacker’s panel with a 2px seat-colour ring and a seat-colour 0 (ring 6.9–10.6:1 on any defender panel). Any damage fills the cell with the seat colour, as in B.',
    css: `
      .map-cell[data-zero] { opacity: 1; box-shadow: inset 0 0 0 2px var(--seat); background: var(--panel); color: var(--seat); font-weight: var(--weight-semibold); }
      .map-cell[data-zero][data-pressed] { box-shadow: inset 0 0 0 3px var(--seat); }`,
  },
};

// Taken swatches get their owner's tag from a small JS wrapper around syncSwatches.
const ownerTagJs = `
  const sync = syncSwatches;
  window.syncSwatches = function (group) {
    sync(group);
    for (const button of group.children) {
      button.querySelector('.owner')?.remove();
      const owner = game.colors.indexOf(Number(button.value));
      if (button.disabled) button.append(element('span', 'owner', 'P' + (owner + 1)));
    }
  };
  syncAllSwatches();`;
const taken = {
  today: { title: 'Today', note: '40% opacity plus a seat-colour strike: the swatch takes on the tile underneath.', css: '' },
  A: {
    title: 'A · Strike and owner tag',
    note: 'Full colour. A light strike with a dark edge, and a “P2” tag in the corner (text 15.7:1).',
    css: `
      .swatch:disabled { opacity: 1; }
      .swatch:disabled::after { width: 64%; height: 2px; background: var(--text); box-shadow: 0 0 0 1px var(--background); }
      .swatch .owner { position: absolute; right: 2px; bottom: 2px; padding: 2px 3px; border-radius: 4px; background: var(--background); color: var(--text); font-size: 10px; font-weight: var(--weight-heavy); line-height: 1; letter-spacing: .01em; }`,
    js: ownerTagJs,
  },
  B: {
    title: 'B · Owner in place of the dot',
    note: 'Full colour. The seat dot becomes the owner, “P2”, in the seat colour (7.4–9.4:1). No strike.',
    css: `
      .swatch:disabled { opacity: 1; }
      .swatch:disabled::before, .swatch:disabled::after { display: none; }
      .swatch .owner { color: var(--seat); font-size: 14px; font-weight: var(--weight-heavy); letter-spacing: -.01em; }`,
    js: ownerTagJs,
  },
};

const swordChipJs = (mode) => `
  iconPaths.sword = ${JSON.stringify(sword)};
  const render = renderBadges;
  window.renderBadges = function (index) {
    render(index);
    const far = board.children[index]?.querySelector('.badges.far');
    if (!far || far.hidden) return;
    if (${JSON.stringify(mode)} === 'lead') {
      const chip = element('span', 'chip sword', icon('sword'));
      chip.setAttribute('aria-hidden', 'true');
      far.prepend(chip);
    } else {
      for (const chip of far.children) chip.prepend(icon('sword'));
    }
    fitBadgeRow(far);
  };
  board.children.length && [...board.children].forEach((_, index) => renderBadges(index));`;
const swordChip = {
  today: { title: 'Today', note: 'No sword: the coloured chips have no label.', css: '' },
  lead: {
    title: 'S1 · Sword in its own circle',
    note: 'One 1.7em circle leads the row, sword in the muted text colour (8.2–9.3:1 on the chip).',
    css: `
      .chip.sword { width: 1.7em; padding: 0; justify-content: center; color: var(--muted); }
      .chip.sword .icon { width: 1em; height: 1em; }`,
    js: swordChipJs('lead'),
  },
  each: {
    title: 'S2 · Tiny sword in every chip',
    note: 'Each chip reads sword · dot · amount. Five chips carry five swords.',
    css: `
      .badges.far .chip .icon { width: .8em; height: .8em; color: var(--muted); margin-inline-end: .04em; }`,
    js: swordChipJs('each'),
  },
};

// Pips: today's near-row discs have a dark rim, black alone a light one.
const pips = {
  today: { title: 'Today', note: 'Dark rim on every pip except black, which gets a light one. Black on the chip: 1.00–1.11:1.', css: '' },
  a: {
    title: 'a · One thin light ring on every pip',
    note: '1px ring in #a89ea4 on all six, so black is no longer the odd one out.',
    css: `
      .pip, .pip[data-pip="B"] { box-shadow: 0 0 0 1px var(--pip-b-rim); }
      .identity-toggle .pip, .identity-toggle .pip[data-pip="B"] { box-shadow: 0 0 0 1.5px var(--pip-b-rim); }
      .identity-toggle:not([aria-pressed="true"]) .pip { opacity: 1; }`,
  },
  b: {
    title: 'b · White capsule, no rings',
    note: 'The user’s idea as stated. Black reads at 13:1, but white vanishes (1.04:1) and blue, red, green and grey sit at 1.9–2.6:1.',
    css: `
      .chip.pips { min-width: 1.7em; justify-content: center; background: var(--text); }
      .pip, .pip[data-pip="B"] { box-shadow: none; }
      .identity-toggle .pip, .identity-toggle .pip[data-pip="B"] { box-shadow: 0 0 0 3px var(--text); }
      .identity-toggle:not([aria-pressed="true"]) .pip { opacity: 1; }`,
  },
  b2: {
    title: 'b2 · Light capsule, dark hairline on every pip',
    note: 'Off-white capsule (#e6e2d3) with today’s dark rim on all six pips, black included. Every disc has the same edge.',
    css: `
      .chip.pips { min-width: 1.7em; justify-content: center; background: #e6e2d3; gap: 3px; padding-inline: .36em; }
      .pip, .pip[data-pip="B"] { box-shadow: 0 0 0 1px var(--dot-rim); }
      .identity-toggle .pip, .identity-toggle .pip[data-pip="B"] { box-shadow: 0 0 0 1px var(--dot-rim), 0 0 0 4px #e6e2d3; }
      .identity-toggle:not([aria-pressed="true"]) .pip { opacity: 1; }`,
  },
  c: {
    title: 'c · Charcoal black, no ring',
    note: 'Black as #6b6468 with today’s dark rim. Still only 2.5–2.8:1 on the chip, and 2.7:1 from colourless grey.',
    css: `
      :root { --pip-b: #6b6468; }
      .pip[data-pip="B"] { box-shadow: 0 0 0 1.5px var(--dot-rim); }
      .identity-toggle:not([aria-pressed="true"]) .pip { opacity: 1; }`,
  },
};

// ---- Capture ----------------------------------------------------------------------------------------------

async function open(size, variant) {
  const page = await browser.newPage({
    viewport: { width: sizes[size].width, height: sizes[size].height }, deviceScaleFactor: SCALE,
    isMobile: true, hasTouch: true, reducedMotion: 'reduce', bypassCSP: true,
  });
  page.on('pageerror', e => errors.push(`${size}: ${e.message}`));
  await page.addInitScript(game => {
    if (!sessionStorage.getItem('r4-seeded')) {
      localStorage.setItem('lifepod-game', JSON.stringify(game));
      sessionStorage.setItem('r4-seeded', '1');
    }
  }, games[size]);
  await page.goto(app);
  await page.waitForSelector('#board .player');
  if (variant.css) await page.addStyleTag({ content: variant.css });
  if (variant.js) await page.evaluate(variant.js);
  await page.evaluate(() => fitAllBadges());
  return page;
}

const tap = (page, selector) => page.locator(selector).first().tap();

async function frame(size, variant, scene) {
  const page = await open(size, variant);
  if (scene.action === 'damage') await tap(page, '#damage-button');
  if (scene.action === 'colours') { await tap(page, '#setup-button'); await tap(page, '#tile-colours'); }
  if (scene.action === 'sheet') {
    await tap(page, '#counters-button');
    await page.locator('.player').nth(scene.player[size]).locator('.palette-button').tap();
    await page.waitForSelector('#player-sheet[open]');
  }
  await page.waitForTimeout(150);
  const result = {};
  if (scene.clip === 'sheet') {
    const box = await page.locator('#player-sheet').boundingBox();
    const pad = 10;
    result.image = await page.screenshot({ clip: { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad } });
    result.width = box.width + 2 * pad;
    result.height = box.height + 2 * pad;
    // The sheet faces its player; the strip turns the crop back upright so it can be read.
    const angle = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('#player-sheet')).getPropertyValue('--sheet-angle') || 0) % 360);
    result.angle = -angle;
  } else if (scene.clip) {
    const box = await page.locator(scene.clip).boundingBox();
    const pad = 8;
    result.image = await page.screenshot({ clip: { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad } });
    result.width = box.width + 2 * pad;
  } else {
    result.image = await page.screenshot();
    result.width = sizes[size].width;
  }
  if (scene.crops) result.crops = await crops(page, scene.crops);
  if (scene.measure) result.measure = await page.evaluate(sel => [...document.querySelectorAll('.player')].map((player, i) => {
    const row = player.querySelector(sel);
    if (!row || row.hidden) return null;
    const used = [...row.children].reduce((s, c) => s + c.offsetWidth, 0) + 2 * (row.childElementCount - 1);
    return { player: i + 1, font: parseFloat(getComputedStyle(row).fontSize), room: row.clientWidth, used };
  }).filter(Boolean), scene.measure);
  await page.close();
  return result;
}

// Crops of badge rows, turned back upright: the CSS angle that undoes the tile's turn on screen.
async function crops(page, selector) {
  const boxes = await page.evaluate(sel => [...document.querySelectorAll('.player')].map((player, i) => {
    const row = player.querySelector(sel);
    if (!row || row.hidden || !row.childElementCount) return null;
    const rects = [...row.children].map(c => c.getBoundingClientRect());
    const x = Math.min(...rects.map(r => r.left)), y = Math.min(...rects.map(r => r.top));
    const right = Math.max(...rects.map(r => r.right)), bottom = Math.max(...rects.map(r => r.bottom));
    const turn = getComputedStyle(player.querySelector('.player-face')).transform;
    const m = new DOMMatrix(turn === 'none' ? undefined : turn);
    const angle = Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI);
    const board = Number(document.querySelector('.app').dataset.boardTurn || 0);
    return { player: i + 1, x: x - 5, y: y - 5, width: right - x + 10, height: bottom - y + 10, angle: -(angle + board) };
  }).filter(Boolean), selector);
  const out = [];
  for (const box of boxes) {
    out.push({ ...box, image: await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } }) });
  }
  return out;
}

// ---- Strips -----------------------------------------------------------------------------------------------

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const img = (buf, width, extra = '') => `<img src="data:image/png;base64,${buf.toString('base64')}" style="width:${width}px${extra}">`;
// A frame, turned by its angle when it has one (sheet crops).
function shot(f) {
  if (!f.angle) return img(f.image, f.width);
  const side = Math.abs(f.angle) % 180 === 90;
  const w = side ? f.height : f.width, h = side ? f.width : f.height;
  return `<div style="position:relative;width:${w}px;height:${h}px"><div style="position:absolute;left:50%;top:50%;width:${f.width}px;height:${f.height}px;transform:translate(-50%,-50%) rotate(${f.angle}deg)">${img(f.image, f.width)}</div></div>`;
}

function cropHtml(list, zoom) {
  return `<div class="crops">${list.map(c => {
    const side = Math.abs(c.angle) % 180 === 90;
    const w = (side ? c.height : c.width) * zoom, h = (side ? c.width : c.height) * zoom;
    return `<figure class="crop" style="width:${w}px;height:${h}px"><div style="width:${c.width * zoom}px;height:${c.height * zoom}px;transform:translate(-50%,-50%) rotate(${c.angle}deg)">${img(c.image, c.width * zoom)}</div><figcaption>P${c.player}</figcaption></figure>`;
  }).join('')}</div>`;
}

async function compose(name, title, intro, rows) {
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 20px 24px 28px; background: #0c0f0d; color: #e8e6da; font: 14px/1.4 system-ui, -apple-system, sans-serif; width: max-content; }
    h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: -.01em; }
    .intro { margin: 0 0 16px; color: #aab3a8; max-width: 1150px; }
    .row { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 30px; padding-bottom: 14px; border-bottom: 1px solid #1f2620; }
    .label { width: 230px; flex: none; }
    .label h2 { margin: 0 0 6px; font-size: 15px; }
    .label p { margin: 0; color: #aab3a8; font-size: 12.5px; }
    .label .m { margin-top: 6px; color: #def09a; font-size: 12px; font-variant-numeric: tabular-nums; }
    figure { margin: 0; }
    figure > figcaption { margin-top: 4px; color: #8f998d; font-size: 11.5px; }
    .frames { display: flex; gap: 12px; align-items: flex-start; flex-wrap: nowrap; }
    .frames img { display: block; border-radius: 6px; outline: 1px solid #2a312b; }
    .crops { display: flex; flex-wrap: wrap; gap: 20px 14px; align-items: center; max-width: 420px; }
    .crop { position: relative; }
    .crop > div { position: absolute; left: 50%; top: 50%; }
    .crop img { outline: 0 !important; border-radius: 3px !important; }
    .crop figcaption { position: absolute; left: 0; top: 100%; margin-top: 1px; color: #8f998d; font-size: 10.5px; }
  </style><h1>${esc(title)}</h1><p class="intro">${esc(intro)}</p>${rows.join('')}`;
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1.5 });
  await page.setContent(html);
  await page.screenshot({ path: `${outDir}${name}.png`, fullPage: true });
  await page.close();
  console.log('wrote', `${name}.png`);
}

function row(variant, frames, extra = '', measure = '') {
  return `<div class="row"><div class="label"><h2>${esc(variant.title)}</h2><p>${esc(variant.note)}</p>${measure}</div><div class="frames">${frames.map(f =>
    `<figure>${shot(f)}${f.caption ? `<figcaption>${esc(f.caption)}</figcaption>` : ''}</figure>`).join('')}${extra}</div></div>`;
}

const strips = {
  async 'r4-map-colours'() {
    const rows = [];
    for (const variant of Object.values(map)) {
      const four = await frame('four', variant, { action: 'damage' });
      const six = await frame('six', variant, { action: 'damage' });
      four.caption = sizes.four.label; six.caption = sizes.six.label;
      rows.push(row(variant, [four, six]));
    }
    await compose('r4-map-colours', 'R4.1 Map cells in the attacker’s colour, with no transparency',
      'Commander damage mode, opened from the pill. Each tile is a map of the table; every opponent’s seat shows the damage their commander has dealt this player. All four rows use the same game.', rows);
  },
  async 'r4-taken-swatches'() {
    const rows = [];
    const sheet = { action: 'sheet', clip: 'sheet', player: { four: 2, six: 3 } };
    for (const variant of Object.values(taken)) {
      const f = [
        { ...(await frame('four', variant, { action: 'colours' })), caption: `Colours mode · ${sizes.four.label}` },
        { ...(await frame('six', variant, { action: 'colours' })), caption: `Colours mode · ${sizes.six.label}` },
        { ...(await frame('four', variant, sheet)), caption: 'Player sheet · 4 players, Player 3' },
        { ...(await frame('six', variant, sheet)), caption: 'Player sheet · 6 players, Player 4' },
      ];
      rows.push(`<div class="row"><div class="label"><h2>${esc(variant.title)}</h2><p>${esc(variant.note)}</p></div><div>
        <div class="frames">${f.slice(0, 2).map(x => `<figure>${shot(x)}<figcaption>${esc(x.caption)}</figcaption></figure>`).join('')}</div>
        <div class="frames" style="margin-top:10px">${f.slice(2).map(x => `<figure>${shot(x)}<figcaption>${esc(x.caption)}</figcaption></figure>`).join('')}</div></div></div>`);
    }
    await compose('r4-taken-swatches', 'R4.2 Taken swatches, with no transparency',
      'Top: Game setup → Colours, every tile picking at once. Bottom: counters mode → palette button, the sheet facing that player. A swatch another player has can’t be chosen.', rows);
  },
  async 'r4-sword-chip'() {
    const rows = [];
    for (const variant of Object.values(swordChip)) {
      const four = await frame('four', variant, { crops: '.badges.far', measure: '.badges.far' });
      const six = await frame('six', variant, { crops: '.badges.far', measure: '.badges.far' });
      four.caption = sizes.four.label; six.caption = sizes.six.label;
      const worst = six.measure.filter(m => m.player === 1 || m.player === 4)
        .map(m => `P${m.player}: ${m.font}px type, ${m.used}/${m.room}px`).join('<br>');
      const measure = `<p class="m">6 players, 5 chips:<br>${worst}</p>`;
      const zoom = `<div><p style="margin:0 0 6px;color:#8f998d;font-size:11.5px">Far rows, 2× and upright</p>${cropHtml(four.crops, 2)}<div style="height:12px"></div>${cropHtml(six.crops, 2)}</div>`;
      rows.push(row(variant, [four, six], zoom, measure));
    }
    await compose('r4-sword-chip', 'R4.3 A sword that labels the commander damage row',
      'The board at rest. 6 players: P1 (outer seat) and P4 (middle seat) have damage from all five opponents: 18, 12, 9, 7, 4. A row that would overflow shrinks its type to fit (fitBadgeRow), measured below each label.', rows);
  },
  async 'r4-pips'() {
    const rows = [];
    const toggles = { action: 'sheet', clip: '#identity-toggles', player: { four: 2 } };
    for (const variant of Object.values(pips)) {
      const four = await frame('four', variant, { crops: '.badges.near' });
      const six = await frame('six', variant, { crops: '.badges.near' });
      const sheet = await frame('four', variant, toggles);
      four.caption = sizes.four.label; six.caption = sizes.six.label;
      rows.push(`<div class="row"><div class="label"><h2>${esc(variant.title)}</h2><p>${esc(variant.note)}</p></div><div>
        <div class="frames">${[four, six].map(x => `<figure>${img(x.image, x.width)}<figcaption>${esc(x.caption)}</figcaption></figure>`).join('')}
        <figure>${img(sheet.image, sheet.width * 2)}<figcaption>Sheet toggles, 2× · Player 3 has W B</figcaption></figure></div>
        <p style="margin:10px 0 6px;color:#8f998d;font-size:11.5px">Near rows, 2× and upright</p>
        <div class="crops" style="max-width:1340px;margin-bottom:6px">${cropHtml([...four.crops, ...six.crops], 2).slice('<div class="crops">'.length)}
      </div></div>`);
    }
    await compose('r4-pips', 'R4.4 Colour identity pips: making black look like the others',
      'The board at rest and the player sheet’s W U B R G C toggles. Identities: 4 players WUBRG, UB, WB, C on Sage, Sky, Coral, Violet; 6 players WUBRG, B, WUB, C, BRG, WB on Amber, Teal, Rose, Indigo, Slate, Sage. Variants also show unchosen toggles at full colour, since their dimming is transparency too.', rows);
  },
};

for (const [name, run] of Object.entries(strips)) {
  if (only.length && !only.includes(name)) continue;
  await run();
}
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
