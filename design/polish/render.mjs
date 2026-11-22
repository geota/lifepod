// Polish round renders, mocked on the real app (web/index.html) with injected CSS and JS. Nothing in web/ changes.
// Run from the repo root:  node design/polish/render.mjs [strip ...]
// The app bundles the Mana font (Andrew Gioia, SIL OFL), so the mocks draw mana and counter symbols with it.
import { launch, close, open, tap, game, shot, compose, sizes } from './lib.mjs';
import ph from './icons.mjs';

const only = process.argv.slice(2);
await launch();

// ---- Shared bits --------------------------------------------------------------------------------------------

const svg = (d, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 256 256" aria-hidden="true"><path d="${d}"/></svg>`;

// Crops one tile and reports how to turn it upright (top-row tiles face away, so they turn 180°).
async function tile(page, index, extraPad = 0) {
  const box = await page.locator('.player').nth(index).boundingBox();
  const edge = await page.locator('.player').nth(index).getAttribute('data-edge');
  const f = await shot(page, { ...box, pad: extraPad });
  f.angle = edge === 'top' ? 180 : 0;
  return f;
}
// Crops a tile's badge row (with a margin), upright.
async function row(page, index, selector = '.badges.near', zoom = 2) {
  const box = await page.locator('.player').nth(index).evaluate((p, sel) => {
    const rects = [...p.querySelectorAll(`${sel} > *`)].map(c => c.getBoundingClientRect());
    const x = Math.min(...rects.map(q => q.left)), y = Math.min(...rects.map(q => q.top));
    return { x, y, width: Math.max(...rects.map(q => q.right)) - x, height: Math.max(...rects.map(q => q.bottom)) - y };
  }, selector);
  const edge = await page.locator('.player').nth(index).getAttribute('data-edge');
  const f = await shot(page, { ...box, pad: 6 });
  return { ...f, angle: edge === 'top' ? 180 : 0, zoom };
}
const caption = (f, text) => ({ ...f, caption: text });
const fit = (f, show) => ({ ...f, show });

// Holds a control pressed without firing its action, so pressed states can be photographed.
const pressed = (page, selector, nth = 0) => page.locator(selector).nth(nth).evaluate(el => { el.dataset.pressed = ''; el.classList.add('mock-press'); });

// Mana font glyphs (code points from mana.css 1.18.0), for symbols the app doesn't draw yet.
const glyphCss = `
  .mk-g { display: inline-block; width: 1em; height: 1em; font: normal normal normal 1em/1 Mana; text-align: center; }
  .mk-g::before { content: var(--g); }
  .mk-g[data-g="infect"] { --g: '\\ea73'; } .mk-g[data-g="energy"] { --g: '\\e907'; } .mk-g[data-g="rad"] { --g: '\\ea50'; }
  .mk-g[data-g="tap"] { --g: '\\e61a'; } .mk-g[data-g="C"] { --g: '\\e904'; }
  .pip[data-pip="C"] { --pip: #cdc8c4; --glyph: '\\e904'; }
  .mk-svg { width: 1em; height: 1em; fill: currentColor; }`;
// Page-side helpers the injected scripts share.
const helpersJs = `
  window.mk = {
    g(name) { const s = document.createElement('span'); s.className = 'mk-g'; s.dataset.g = name; return s; },
    svg(d) { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'mk-svg icon'); s.setAttribute('viewBox', '0 0 256 256'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p); return s; },
    ph: ${JSON.stringify(ph)},
    pip(c) { const s = document.createElement('span'); s.className = 'pip'; s.dataset.pip = c; return s; },
  };`;

// The five player counters, with example values per player.
const counterDefs = [
  { id: 'poison', label: 'Poison', icon: "mk.g('infect')", values: [3, 0, 7, 1, 0, 2] },
  { id: 'tax', label: 'Tax', icon: "icon('crown')", values: ['+2', '+0', '+4', '+0', '+2', '+0'] },
  { id: 'energy', label: 'Energy', icon: "mk.g('energy')", values: [5, 2, 0, 8, 1, 0] },
  { id: 'experience', label: 'Experience', icon: "mk.svg(mk.ph['star-four-fill'])", values: [2, 0, 1, 0, 3, 0] },
  { id: 'rad', label: 'Rad', icon: "mk.g('rad')", values: [4, 0, 0, 2, 0, 6] },
];
const defsJs = `window.mkDefs = [${counterDefs.map(d => `{ id: '${d.id}', label: '${d.label}', icon: () => ${d.icon}, values: ${JSON.stringify(d.values)} }`).join(', ')}];`;

const strips = {};

// ---- Ask 1: colour names on the real symbols ----------------------------------------------------------------

const names = {
  WU: 'Azorius', UB: 'Dimir', BR: 'Rakdos', RG: 'Gruul', WG: 'Selesnya', WB: 'Orzhov', UR: 'Izzet', BG: 'Golgari', WR: 'Boros', UG: 'Simic',
  WUG: 'Bant', WUB: 'Esper', UBR: 'Grixis', BRG: 'Jund', WRG: 'Naya', WBG: 'Abzan', WUR: 'Jeskai', UBG: 'Sultai', WBR: 'Mardu', URG: 'Temur',
  UBRG: 'Glint-Eye', WBRG: 'Dune-Brood', WURG: 'Ink-Treader', WUBG: 'Witch-Maw', WUBR: 'Yore-Tiller', WUBRG: 'Five-colour',
};
const namesJs = mode => `
  window.mockNames = ${JSON.stringify(names)};
  const nameOf = i => mockNames[game.identities[i]] ?? '';
  const baseBadges = renderBadges;
  window.renderBadges = function (index) {
    baseBadges(index);
    if (${JSON.stringify(mode)} !== 'board') return;
    const chip = board.children[index]?.querySelector('.badges.near .chip.ci-chip, .badges.near .chip.identity, .badges.near .chip.pips');
    if (chip && nameOf(index)) { chip.classList.add('named'); chip.append(element('span', 'pip-name', nameOf(index))); fitBadgeRow(chip.parentElement); }
  };
  const baseLayer = renderModeLayer;
  window.renderModeLayer = function (player, index) {
    baseLayer(player, index);
    const grid = player.querySelector('.identity');
    if (grid) grid.append(element('span', 'identity-name', nameOf(index)));
  };
  const baseSync = syncIdentity;
  window.syncIdentity = function () {
    baseSync();
    document.querySelectorAll('.identity[data-player] .identity-name').forEach(n => { n.textContent = nameOf(Number(n.parentElement.dataset.player)); });
  };
  [...board.children].forEach((p, i) => renderBadges(i));`;
const namesCss = `
  .chip.named { width: auto !important; padding: 0 .42em 0 .26em !important; gap: .3em; }
  .chip .pip-name { font-size: .86em; font-weight: 650; letter-spacing: .01em; color: var(--text-soft); }
  .identity .identity-name { display: grid; place-items: center; align-self: center; min-width: 0; padding: 0 2px; font-size: max(10px, var(--swatch-size, 44px) * .2); font-weight: 650; line-height: 1.05; color: var(--text-soft); text-align: center; overflow-wrap: anywhere; }`;

const four = game(4, { identities: ['WUB', 'UG', 'WBR', 'BRG'], poison: [0, 0, 3, 0], casts: [1, 0, 0, 2] });
const six = game(6, { identities: ['WUB', 'UG', 'WBR', 'BRG', 'WUBRG', 'BG'], poison: [0, 0, 3, 0, 0, 1], casts: [1, 0, 0, 2, 0, 0] });

strips['pips-names'] = async () => {
  const variant = (mode, cssExtra = '') => ({ css: namesCss + cssExtra, js: namesJs(mode) });
  const rows = [];
  {
    const p = await open('phone', four);
    const near = [await row(p, 2), await row(p, 3)];
    await tap(p, '#setup-button'); await tap(p, '#tile-colours'); await p.waitForTimeout(150);
    rows.push({ letter: 'N1', title: 'No names', note: 'The shipped design: mana symbols to set identity, the colour indicator at rest.', frames: [caption(fit(await tile(p, 3), 426), 'Colours mode · P4'), ...near.map((f, i) => caption(f, `Near row · P${i + 3}`))] });
    await p.close();
  }
  {
    const p = await open('phone', four, variant('colours'));
    const near = [await row(p, 2), await row(p, 3)];
    await tap(p, '#setup-button'); await tap(p, '#tile-colours'); await p.waitForTimeout(150);
    rows.push({ letter: 'N2', title: 'Name while choosing only', note: 'The name fills the empty sixth cell of the toggle grid as you pick, confirming the combination. The board keeps the indicator only.', frames: [caption(fit(await tile(p, 3), 426), 'Colours mode · P4 · Jund'), ...near.map((f, i) => caption(f, `Near row · P${i + 3}`))] });
    await p.close();
  }
  {
    const pillJs = `
      const b = document.createElement('button'); b.className = 'pill-button names-toggle'; b.setAttribute('aria-pressed', 'true');
      b.append(mk.svg(mk.ph['text-aa'])); document.querySelector('#board-controls').prepend(b);`;
    const css = `
      .names-toggle { color: var(--accent); }
      .names-toggle::before { inset: 7px 2px 7px 7px !important; background: var(--surface-pressed); }
      .board-controls[data-mode="colours"]:has(.names-toggle)::before { background: var(--background) !important; border-color: var(--control-border) !important; }
      .board-controls[data-mode="colours"]:has(.names-toggle) #setup-button { color: var(--ink); }
      .board-controls[data-mode="colours"]:has(.names-toggle) #setup-button::before { content: '' !important; inset: 7px 7px 7px 3px; background: var(--accent); }`;
    const p = await open('phone', four, { css: namesCss + css + glyphCss, js: helpersJs + namesJs('board') });
    const p6 = await open('small', six, variant('board'));
    const near = [caption(await row(p, 2), 'Near row · P3'), caption(await row(p, 3), 'Near row · P4'), caption(await row(p6, 4), 'Near row · 6 players, P5')];
    await tap(p, '#setup-button'); await tap(p, '#tile-colours'); await p.evaluate(pillJs); await p.waitForTimeout(150);
    const pill = await shot(p, '#board-controls');
    rows.push({ letter: 'N3', title: 'Name on the board too, with an off switch', note: 'The name follows the colour indicator in the near row. In colours mode the pill gains an Aa toggle (lit = names shown) beside ✓, so the switch lives where identity is set and setup doesn’t grow.', frames: [caption(fit(await tile(p, 3), 426), 'Colours mode · P4'), caption({ ...pill, zoom: 1.5 }, 'Colours-mode pill: Aa · ✓'), ...near] });
    await p.close(); await p6.close();
  }
  {
    // N4: the near-row chip shows the identity's symbol (the watermark's glyph) where one exists, else the indicator.
    const symJs = `
      const base4 = renderBadges;
      window.renderBadges = function (index) {
        base4(index);
        const p = board.children[index]; const chip = p?.querySelector('.badges.near .chip.ci-chip');
        if (!chip || !p.dataset.watermark) return;
        const sym = element('span', 'mk-sym'); sym.style.setProperty('--mk-sym', getComputedStyle(p).getPropertyValue('--watermark'));
        chip.querySelector('.ci')?.replaceWith(sym);
      };
      [...board.children].forEach((p, i) => renderBadges(i));`;
    const symCss = `.mk-sym { display: grid; place-items: center; font: normal normal normal 1.2em/1 Mana; color: var(--text); } .mk-sym::before { content: var(--mk-sym); }`;
    const p = await open('phone', four, { css: namesCss + symCss, js: symJs + namesJs('board') });
    const p6 = await open('small', six, { css: namesCss + symCss, js: symJs + namesJs('board') });
    const near = [caption(await row(p, 0), 'P1 · Esper (shard: no symbol)'), caption(await row(p, 1), 'P2 · Simic (guild)'), caption(await row(p, 2), 'P3 · Mardu (clan)'), caption(await row(p6, 4), 'P5 · WUBRG (colour pie)'), caption(await row(p6, 5), 'P6 · Golgari (guild)')];
    rows.push({ letter: 'N4', title: 'The guild or clan symbol in the chip, with the name', note: 'The near-row chip shows the same symbol as the watermark (mono: mana symbol, pair: guild, wedge: clan, WUBRG: colour pie) and falls back to the colour indicator for the 10 identities without one (shards and four-colour). Shown with names on (N3).', frames: [caption(fit(await shot(p), 420), 'Phone · 4 players'), ...near] });
    await p.close(); await p6.close();
  }
  await compose('pips-names', '1 · Colour names on the shipped mana symbols', 'Names come from the colours automatically (table in RESEARCH §1.7). Identities: Esper, Simic, Mardu, Jund; WUBRG and Golgari at 6 players. The faint watermark behind each total ships in fcf2a89.', rows);
};

// A reference page drawn inside the app, so the Mana font and the app's pip, indicator and chip styles apply.
async function appPage(name, build, width = 860) {
  const page = await open({ width: width + 40, height: 400 }, game(4), { css: glyphCss, js: helpersJs });
  await page.evaluate(build);
  await page.addStyleTag({ content: `
    html, body { height: auto !important; overflow: visible !important; }
    body { margin: 0; background: #0c0f0d; } #mk-ref { padding: 18px 20px 22px; color: #e8e6da; font: 13px/1.4 system-ui, -apple-system, sans-serif; }
    h1 { margin: 0 0 4px; font-size: 18px; } p.intro { margin: 0 0 14px; color: #aab3a8; }
    table { border-collapse: collapse; width: 100%; } td, th { padding: 5px 8px; border-bottom: 1px solid #1f2620; text-align: left; vertical-align: middle; }
    th { color: #8f998d; font-weight: 600; font-size: 12px; }
    .pips { display: flex; gap: 3px; font-size: 18px; } .pips .pip { --pip-size: 20px; }
    .ci { font-size: 22px; } .sym { font: normal normal normal 24px/1 Mana; color: #e8e6da; } .sym::before { content: var(--s); }
    .none { color: #6f786d; } .group td { padding-top: 12px; color: #def09a; font-weight: 650; border-bottom-color: #2a312b; }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; }` });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${(await import('./lib.mjs')).outDir}${name}.png`, fullPage: true });
  console.log('wrote', `${name}.png`);
  await page.close();
}

strips['identity-symbols'] = () => appPage('identity-symbols', `
  const names = ${JSON.stringify(names)};
  const groups = [['One colour', ['W', 'U', 'B', 'R', 'G']], ['Two colours: guilds', ['WU', 'UB', 'BR', 'RG', 'WG', 'WB', 'UR', 'BG', 'WR', 'UG']],
    ['Three colours: shards', ['WUG', 'WUB', 'UBR', 'BRG', 'WRG']], ['Three colours: wedges (clans)', ['WBG', 'WUR', 'UBG', 'WBR', 'URG']],
    ['Four colours', ['UBRG', 'WBRG', 'WURG', 'WUBG', 'WUBR']], ['Five colours', ['WUBRG']]];
  const mono = { W: 'Mono-white', U: 'Mono-blue', B: 'Mono-black', R: 'Mono-red', G: 'Mono-green' };
  const probe = document.createElement('div'); probe.className = 'player'; probe.hidden = true; document.body.append(probe);
  const symOf = id => { probe.dataset.watermark = id; return getComputedStyle(probe).getPropertyValue('--watermark').trim(); };
  const rowFor = id => {
    const sym = symOf(id);
    const pips = id.split('').map(c => '<span class="pip" data-pip="' + c + '"></span>').join('');
    return '<tr><td><div class="pips">' + pips + '</div></td><td><span class="ci" data-ci="' + id + '" data-count="' + id.length + '"></span></td><td>' +
      (sym && sym !== 'none' && sym !== '' ? '<span class="sym" style="--s:' + sym.replace(/"/g, '&quot;') + '"></span>' : '<span class="none">— indicator</span>') +
      '</td><td>' + (names[id] ?? mono[id]) + '</td></tr>';
  };
  const half = list => '<table><tr><th>Identity</th><th>Indicator</th><th>Symbol (N4, watermark)</th><th>Name</th></tr>' + list.map(([g, ids]) => '<tr class="group"><td colspan="4">' + g + '</td></tr>' + ids.map(rowFor).join('')).join('') + '</table>';
  const ref = document.createElement('div'); ref.id = 'mk-ref'; document.querySelector('.app').style.display = 'none'; document.body.append(ref); ref.innerHTML = '<h1>Every colour identity: indicator, symbol and name</h1><p class="intro">31 identities, plus none, which shows nothing. 15 have a guild or clan symbol; of the other 16, the five mono-colour ones use their mana symbol and WUBRG the colour pie, so 21 have a symbol. The 10 left (five shards and five four-colour) have none and keep the colour indicator. Names from RESEARCH §1.7.</p><div class="cols">' + half(groups.slice(0, 3)) + half(groups.slice(3)) + '</div>';`);

strips['experience-glyph'] = () => appPage('experience-glyph', `
  const cands = [['star-four-fill', 'Four-point star (recommended)'], ['sparkle-fill', 'Sparkle'], ['graduation-cap-fill', 'Graduation cap'], ['medal-fill', 'Medal'], ['trend-up-fill', 'Trend up'], ['book-open-text-fill', 'Open book']];
  const chips = d => '<span class="chip"><span class="mk-g" data-g="infect"></span>3</span><span class="chip"><span class="mk-g" data-g="energy"></span>5</span>' +
    '<span class="chip"><svg class="icon" viewBox="0 0 256 256"><path d="' + mk.ph[d] + '"/></svg>2</span><span class="chip"><span class="mk-g" data-g="rad"></span>4</span>';
  const ref = document.createElement('div'); ref.id = 'mk-ref'; document.querySelector('.app').style.display = 'none'; document.body.append(ref); ref.innerHTML = '<h1>An experience symbol</h1><p class="intro">Mana has symbols for energy (\\\\e907) and rad (\\\\ea50) but not experience. Phosphor fill-weight candidates, shown in a near badge row between poison (Mana infect), energy and rad, on a Violet tile at 2× badge size.</p>' +
    '<table>' + cands.map(([d, label]) => '<tr><td style="width:200px">' + label + '</td><td><div class="player" data-colour="violet" data-row="bottom" style="position:relative;height:56px;width:420px;border-radius:8px"><div class="badges near" style="position:absolute;inset:auto 0 12px 0;font-size:25px;display:flex">' + chips(d) + '</div></div></td></tr>').join('') + '</table>';`);

// ---- Counters: five player counters ---------------------------------------------------------------------------

// A counters-mode layer built from mkDefs, replacing the app's two rows, in one of three layouts.
const countersJs = (layout, count = 5) => `
  ${defsJs}
  const defs = mkDefs.slice(0, ${count});
  [...board.children].forEach((player, i) => {
    const layer = player.querySelector('.mode-layer');
    if (layer.hidden) return;
    if (${JSON.stringify(layout)} === 'grid') {
      const grid = element('div', 'mk-grid');
      grid.style.setProperty('--n', defs.length);
      for (const d of defs) {
        const v = d.values[i];
        const cell = element('button', 'mk-cell', element('span', 'mk-ico', d.icon()), element('b', '', String(v)));
        if (v === 0 || v === '+0') cell.dataset.zero = '';
        cell.setAttribute('aria-label', d.label);
        grid.append(cell);
      }
      const hint = element('p', 'layer-hint', 'Tap +1 · hold −1');
      layer.replaceChildren(hint, grid);
    } else {
      const rows = element('div', 'counter-rows' + (${JSON.stringify(layout)} === 'columns' ? ' mk-columns' : ''));
      for (const d of defs) {
        const [sub, add] = ['minus', 'plus'].map(n => element('button', '', icon(n)));
        const out = element('output', 'counter-value', d.icon(), element('b', '', String(d.values[i])));
        rows.append(element('div', 'counter-row', sub, out, add));
      }
      layer.replaceChildren(rows);
    }
  });`;
const countersCss = `
  ${glyphCss}
  .counter-value .mk-g, .counter-value .mk-svg { color: var(--seat); font-size: .78em; }
  .counter-rows.mk-columns { grid-template-columns: repeat(2, auto); column-gap: 10px; }
  .mk-columns .counter-row { grid-template-columns: auto minmax(2.6em, auto) auto; gap: 4px; }
  .mk-columns .counter-row button { width: 44px; }
  .mk-grid { --cols: min(var(--n), 3); display: flex; flex-wrap: wrap; justify-content: center; align-content: stretch; gap: 4px;
    width: min(100cqi - 12px, var(--cols) * 112 * var(--grow)); height: min(100cqb - 54px, 2 * 78 * var(--grow)); }
  .mk-grid:has(> :nth-child(-n + 3):last-child) { height: min(100cqb - 54px, 92 * var(--grow)); }
  .mk-grid > .mk-cell { flex: 0 0 calc((100% - (var(--cols) - 1) * 4px) / var(--cols)); min-height: 44px; }
  .mk-grid:not(:has(> :nth-child(-n + 3):last-child)) > .mk-cell { height: calc(50% - 2px); }
  .mk-cell { display: grid; place-content: center; justify-items: center; gap: 2px; min-width: 0; padding: 0; border: 0; border-radius: var(--radius-sm);
    background: var(--button); box-shadow: inset 0 0 0 1px var(--rim); color: var(--text);
    font-size: clamp(1.0625rem, 6cqi, max(1.625rem, 26 * var(--grow))); font-weight: var(--weight-heavy); font-variant-numeric: tabular-nums; letter-spacing: -.03em; line-height: 1; }
  .mk-cell .mk-ico { display: grid; color: var(--seat); font-size: .8em; }
  .mk-cell .mk-ico .icon { width: 1em; height: 1em; }
  .mk-cell[data-zero] { font-weight: var(--weight-semibold); color: var(--muted); }
  .mk-cell:is([data-pressed]) { background: var(--seat); color: var(--button); }
  .mk-cell:is([data-pressed]) .mk-ico { color: var(--button); }`;

async function countersBoard(size, seed, layout, count = 5, extraCss = '', press = null) {
  const p = await open(size, seed, { css: countersCss + extraCss, js: helpersJs });
  await tap(p, '#counters-button'); await p.waitForTimeout(80);
  await p.evaluate(countersJs(layout, count));
  if (press) await pressed(p, press[0], press[1]);
  return p;
}
const cellSize = p => p.evaluate(() => {
  const c = [...document.querySelectorAll('.mk-cell, .counter-row button')].filter(e => e.offsetWidth);
  const min = c.reduce((m, e) => (e.offsetWidth * e.offsetHeight < m.w * m.h ? { w: e.offsetWidth, h: e.offsetHeight } : m), { w: 1e9, h: 1e9 });
  return `${min.w}×${min.h}`;
});
const overflows = p => p.evaluate(() => [...document.querySelectorAll('.player')].some((pl) => {
  const t = pl.getBoundingClientRect();
  return [...pl.querySelectorAll('.counter-row button, .mk-cell')].some((b) => { const r = b.getBoundingClientRect(); return r.top < t.top - 1 || r.bottom > t.bottom + 1 || r.left < t.left - 1 || r.right > t.right + 1; });
}));

const c4 = game(4, { poison: [3, 0, 7, 1], casts: [1, 0, 2, 0] });
const c6 = game(6, { poison: [3, 0, 7, 1, 0, 2], casts: [1, 0, 2, 0, 1, 0] });

strips['counters-mode'] = async () => {
  const rows = [];
  const layouts = [
    ['K1', 'rows', 'Stepper rows (today’s pattern)', 'One − count + row per counter. Fine for two or three counters; five rows need 5 × 44px plus gaps, more than a phone tile has, so the rows run off the tile.'],
    ['K2', 'columns', 'Stepper rows in two columns', 'Halves the height, but each row still needs about 140px of width: it fits four players on a phone, not six.'],
    ['K3', 'grid', 'Tap +1, hold −1 cells', 'Each counter is one cell, like a commander damage seat: icon over count, tap to add, hold to take away (the same rule and hint as the map). Three per row, so five counters are two rows at every size.'],
  ];
  for (const [letter, layout, title, note] of layouts) {
    const frames = [];
    for (const [size, seed, label] of [['phone', c4, sizes.phone.label], ['small', c6, '6 players · 640 × 360'], ['tablet', c6, '6 players · tablet']]) {
      const p = await countersBoard(size, seed, layout);
      const over = await overflows(p);
      frames.push(caption(fit(await shot(p), size === 'tablet' ? 260 : 280), `${label} · smallest target ${await cellSize(p)}${over ? ' · does not fit' : ''}`));
      await p.close();
    }
    rows.push({ letter, title, note, frames });
  }
  // Fewer counters on: K3 with just Poison and Tax.
  const p = await countersBoard('phone', c4, 'grid', 2);
  const q = await countersBoard('small', c6, 'grid', 2);
  rows.push({ title: 'K3 with only Poison and Tax switched on', note: 'Only the counters a table turns on appear, and the cells grow to fill the room.', frames: [caption(fit(await shot(p), 420), `Phone · ${await cellSize(p)}`), caption(fit(await shot(q), 400), `6 players · 640 × 360 · ${await cellSize(q)}`)] });
  await p.close(); await q.close();
  await compose('counters-mode', 'K · Counters mode with all five player counters', 'Poison (Mana infect glyph), tax (crown), energy (Mana \\e907), experience (Phosphor star-four, fill; Mana has none) and rad (Mana \\ea50). Captions give the smallest touch target.', rows);
};

// Setup with seven switches: Commander, Poison, Energy, Experience, Rad, Turns, Mana pool.
const trackers = [
  ['Commander', "svgI(PATHS.sword)"], ['Poison', "mk.g('infect')"], ['Energy', "mk.g('energy')"], ['Experience', "mk.svg(mk.ph['star-four-fill'])"],
  ['Rad', "mk.g('rad')"], ['Turns', "mk.svg(mk.ph['flag-fill'])"], ['Mana pool', "mk.g('tap')"],
];
const setupJs = (layout, on = ['Commander', 'Poison', 'Turns']) => `
  const svgI = d => mk.svg(d); const PATHS = { sword: iconPaths.sword };
  const list = [${trackers.map(([name, ico]) => `['${name}', () => ${ico}]`).join(', ')}];
  const on = ${JSON.stringify(on)};
  const fs = document.querySelector('.counter-setting');
  fs.querySelector('legend').textContent = 'Track';
  const holder = fs.querySelector('.counter-switches');
  if (${JSON.stringify(layout)} === 'chips') {
    holder.className = 'counter-switches mk-chips';
    holder.replaceChildren(...list.map(([name, ico]) => { const b = element('button', 'mk-chip', ico(), name); b.type = 'button'; b.setAttribute('aria-pressed', String(on.includes(name))); return b; }));
  } else if (${JSON.stringify(layout)} === 'summary') {
    holder.className = 'counter-switches mk-summary-row';
    const b = element('button', 'secondary mk-summary', element('span', 'mk-summary-icons', ...list.filter(([n]) => on.includes(n)).map(([, ico]) => ico())), element('span', 'mk-summary-text', on.join(' · ')), mk.svg(mk.ph['caret-right']));
    b.type = 'button'; holder.replaceChildren(b);
  } else {
    holder.className = 'counter-switches mk-switch-grid';
    const tpl = document.querySelector('.switch-setting');
    holder.replaceChildren(...list.map(([name]) => { const l = tpl.cloneNode(true); l.querySelector('input').checked = on.includes(name); l.querySelector('input').removeAttribute('id'); l.lastElementChild.textContent = name; return l; }));
  }`;
const setupCss = `
  ${glyphCss}
  #setup { width: min(500px, calc(100% - 32px)); }
  #setup:has(.mk-chips) { width: min(560px, calc(100% - 32px)); }
  .counter-switches.mk-chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .mk-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 11px 0 9px; border: 1px solid var(--border); border-radius: var(--radius-full); background: var(--background); color: var(--text-soft); font-size: var(--type-label); font-weight: var(--weight-semibold); }
  .mk-chip .icon, .mk-chip .mk-g { width: 16px; height: 16px; font-size: 16px; color: var(--muted); }
  .mk-chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--ink); }
  .mk-chip[aria-pressed="true"] :is(.icon, .mk-g) { color: var(--ink); }
  .counter-switches.mk-summary-row { display: block; }
  .mk-summary { display: flex; align-items: center; gap: 10px; width: 100%; padding: 0 10px 0 12px; font-size: var(--type-label); text-align: left; }
  .mk-summary-icons { display: flex; gap: 6px; color: var(--accent); } .mk-summary-icons :is(.icon, .mk-g) { width: 16px; height: 16px; font-size: 16px; }
  .mk-summary-text { flex: 1; color: var(--text-soft); font-weight: var(--weight-medium); }
  .mk-summary > .icon { width: 16px; height: 16px; color: var(--muted); }
  .counter-switches.mk-switch-grid { display: grid; grid-template-columns: repeat(3, auto); justify-content: start; column-gap: 16px; }`;
// The sub-sheet S2 opens: every tracker as a switch, two columns.
const subSheetJs = on => `
  const list = [${trackers.map(([name, ico]) => `['${name}', () => ${ico}]`).join(', ')}];
  const svgI = d => mk.svg(d); const PATHS = { sword: iconPaths.sword };
  const on = ${JSON.stringify(on)};
  document.querySelector('#setup').close();
  const d = document.createElement('dialog'); d.id = 'mk-track';
  const tpl = document.querySelector('.switch-setting');
  const items = list.map(([name, ico]) => { const l = tpl.cloneNode(true); l.querySelector('input').checked = on.includes(name); l.querySelector('input').removeAttribute('id'); l.lastElementChild.replaceChildren(element('span', 'mk-track-ico', ico()), name); return l; });
  const back = element('button', 'close', icon('minus')); back.innerHTML = document.querySelector('#setup .close').innerHTML;
  d.append(element('div', 'sheet', element('div', 'sheet-header', element('h2', '', 'Track'), back), element('div', 'mk-track-grid', ...items)));
  document.body.append(d); d.showModal();`;
const subSheetCss = `
  #mk-track { width: min(500px, calc(100% - 32px)); }
  .mk-track-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 16px; }
  .mk-track-ico { display: inline-grid; place-items: center; width: 18px; margin-inline-end: 8px; color: var(--muted); vertical-align: -3px; }
  .mk-track-ico :is(.icon, .mk-g) { width: 16px; height: 16px; font-size: 16px; }
  .switch-setting > span:last-child { display: inline-flex; align-items: center; }`;

strips['counters-setup'] = async () => {
  const rows = [];
  const tall = { width: 952, height: 427 };
  const measure = p => p.evaluate(() => { const s = document.querySelector('dialog[open]'); return { h: Math.round(s.getBoundingClientRect().height), scroll: s.scrollHeight > s.clientHeight + 1 }; });
  const variants = [
    ['S1', 'chips', 'Toggle chips under “Track”', 'Seven multi-select chips, each 44px tall, on two lines in a 560px sheet. Everything is one tap from setup, but the sheet grows by a row: it scrolls at 393px tall and only just fits 427.'],
    ['S2', 'summary', 'A “Track” button that opens its own sheet', 'Setup keeps today’s height: one row shows what’s on and opens a Track sheet with a switch per tracker. One extra tap, set once per group.'],
    ['S3', 'grid', 'Switches in a grid', 'Seven switches, three per row: two extra rows, so it scrolls at both heights.'],
  ];
  const base = {};
  for (const [size, key] of [[tall, 'tall'], ['phone', 'phone']]) {
    const p = await open(size, game(4));
    await tap(p, '#setup-button'); await p.waitForTimeout(80);
    base[key] = (await measure(p)).h;
    await p.close();
  }
  for (const [letter, layout, title, note] of variants) {
    const frames = [];
    for (const [size, label] of [[tall, '952 × 427 (Pixel 10 Pro)'], ['phone', '852 × 393']]) {
      const p = await open(size, game(4), { css: setupCss, js: helpersJs });
      await tap(p, '#setup-button');
      await p.evaluate(setupJs(layout));
      await p.waitForTimeout(80);
      const m = await measure(p);
      frames.push(caption(fit(await shot(p), 410), `${label} · sheet ${m.h}px${m.scroll ? ' · scrolls' : ' · fits'}`));
      if (layout === 'summary' && size === tall) {
        await p.addStyleTag({ content: subSheetCss });
        await p.evaluate(subSheetJs(['Commander', 'Poison', 'Turns']));
        await p.waitForTimeout(80);
        const m2 = await measure(p);
        frames.push(caption(fit(await shot(p), 410), `Track sheet · 952 × 427 · ${m2.h}px${m2.scroll ? ' · scrolls' : ' · fits'}`));
      }
      await p.close();
    }
    rows.push({ letter, title, note, frames });
  }
  await compose('counters-setup', 'S · Turning trackers on in setup', `Seven trackers: Commander, Poison, Energy, Experience, Rad, Turns and Mana pool. Setup must fit a 427px-tall landscape phone without scrolling. Today's sheet is ${base.tall}px at 427 and ${base.phone}px at 393. Sheets widened to 500px (S1: 560px) on landscape phones.`, rows);
};

// Badge rows with all five counters set: identity, poison, tax, energy, experience, rad.
const badgesJs = mode => `
  ${defsJs}
  const vals = { energy: [5, 2, 0, 8, 1, 3], experience: [2, 0, 1, 0, 3, 1], rad: [4, 0, 0, 2, 0, 6] };
  const baseBadges = renderBadges;
  window.renderBadges = function (index) {
    baseBadges(index);
    const near = board.children[index]?.querySelector('.badges.near');
    if (!near) return;
    const extra = mkDefs.filter(d => vals[d.id]).filter(d => vals[d.id][index] > 0).map(d => { const c = element('span', 'chip', d.icon(), String(vals[d.id][index])); c.setAttribute('role', 'listitem'); return c; });
    near.append(...extra); near.hidden = near.childElementCount === 0;
    if (${JSON.stringify(mode)} === 'capsule') {
      const counters = [...near.querySelectorAll('.chip:not(.identity):not(.pips)')];
      if (counters.length > 1) { const cap = element('span', 'chip mk-capsule'); counters.forEach(c => { c.classList.add('mk-in'); cap.append(c); }); near.append(cap); }
    }
    if (${JSON.stringify(mode)} === 'split') {
      let second = board.children[index].querySelector('.mk-near2');
      if (!second) { second = element('div', 'badges near mk-near2'); near.after(second); }
      const keep = [...near.children].filter(c => c.matches('.identity, .pips') || c.textContent.includes('Commander tax'));
      second.replaceChildren(...[...near.children].filter(c => !keep.includes(c)));
      second.hidden = second.childElementCount === 0;
      fitBadgeRow(second);
    }
    fitBadgeRow(near);
  };
  [...board.children].forEach((p, i) => renderBadges(i));`;
const badgesCss = `
  ${glyphCss}
  .chip .mk-g, .chip .mk-svg { width: .95em; height: .95em; font-size: .95em; }
  .chip.mk-capsule { gap: .55em; padding: 0 .5em; }
  .chip.mk-in { height: auto; padding: 0; background: none; }
  .badges.mk-near2 { bottom: calc(8 * var(--grow) + 1.7em + 3px); }`;

strips['counters-badges'] = async () => {
  const seed6 = game(6, { identities: ['WUB', 'UG', 'WR', 'BRG', 'WUBRG', 'BG'], poison: [3, 0, 7, 1, 0, 2], casts: [1, 0, 2, 0, 1, 0] });
  const worst6 = game(6, { identities: ['WUBRG', 'UG', 'WR', 'BRG', 'WUBRG', 'BG'], poison: [9, 0, 7, 1, 0, 2], casts: [5, 0, 2, 0, 1, 0] });
  const big = "Object.assign(vals, { energy: [14, 2, 0, 8, 1, 3], experience: [11, 0, 1, 0, 3, 1], rad: [12, 0, 0, 2, 0, 6] });";
  const rowFont = (p, i) => p.evaluate(n => { const r = document.querySelectorAll('.player')[n].querySelector('.badges.near'); const used = [...r.children].reduce((s, c) => s + c.offsetWidth, 0); return `${Math.round(parseFloat(getComputedStyle(r).fontSize) * 10) / 10}px type, ${used}/${r.clientWidth}px used`; }, i);
  const rows = [];
  for (const [letter, mode, title, note, seed, extra] of [
    ['B1', 'one', 'One row, as today', 'Every set counter gets its own chip in the near row. With single digits, all six chips fit at full size even at 6 players on the smallest phone.', seed6, ''],
    ['B1', 'one', 'One row, worst case', 'Two-digit counts on every counter (tax +10, energy 14, experience 11, rad 12): the row shrinks its type by half a pixel to fit, as it already does for commander damage. A shared capsule was tried and gains nothing (11.6px).', worst6, big],
  ]) {
    const js = helpersJs + badgesJs(mode).replace("const baseBadges", `${extra}\n  const baseBadges`);
    const p6 = await open('small', seed, { css: badgesCss, js });
    rows.push({ letter, title, note, frames: [caption(fit(await shot(p6), 420), `6 players · 640 × 360 · P1: ${await rowFont(p6, 0)}`), caption({ ...(await row(p6, 0)), zoom: 2.4 }, 'P1 near row, 2.4×, upright')] });
    await p6.close();
  }
  await compose('counters-badges', 'B · The near badge row with every counter set', 'Identity (colour indicator), poison, tax, energy, experience and rad. Display-only, as today; each chip shows only when its counter is above zero. Full-size badge type at 640 × 360 is 12.5px.', rows);
};

// ---- Ask 3: button styles -----------------------------------------------------------------------------------

const wash = 'color-mix(in oklab, var(--seat) 17%, transparent)';
const styles = {
  A: {
    title: 'Bordered buttons (today)',
    note: 'A dark button with a rim; pressed fills with the seat colour. The touch area is already the whole half, but nothing says so. Counter cells are bordered like map seats.',
    css: '',
  },
  B: {
    title: 'Bare glyphs, whole half lights',
    note: 'No button chrome. Large − and + sit near the outer edges; a press washes the whole half in the seat colour, so the target shows itself the first time anyone taps. Counter cells are a faint fill with no border; a press lights the cell the same way.',
    css: `
      .controls { width: 100%; grid-template-columns: 1fr auto 1fr; }
      .controls button { width: clamp(44px, 16cqi, 84 * var(--grow)); border: 0; background: none; font-size: clamp(1.75rem, 12cqi, max(2.5rem, 46 * var(--grow))); }
      .controls .subtract { justify-self: start; margin-inline-start: 5cqi; }
      .controls .add { justify-self: end; margin-inline-end: 5cqi; }
      .controls button:is(:active, [data-pressed]) { background: none; color: var(--text); }
      .controls button[data-pressed]::after { background: ${wash}; }
      .controls .subtract[data-pressed]::after { border-radius: 0 28px 28px 0; }
      .controls .add[data-pressed]::after { border-radius: 28px 0 0 28px; }
      .mk-cell { box-shadow: none; background: color-mix(in oklab, var(--button) 55%, var(--panel)); }
      .mk-cell[data-pressed] { background: color-mix(in oklab, var(--seat) 26%, var(--panel)); color: var(--text); }
      .mk-cell[data-pressed] .mk-ico { color: var(--seat); }`,
  },
  C: {
    title: 'Soft discs and a split line',
    note: 'Borderless round discs, and a faint line above and below the total that splits the tile into its two halves. Pressed: the disc fills and the half lights. Counter cells are soft rounded fills.',
    css: `
      .controls button { border: 0; border-radius: 50%; width: var(--control-size); height: var(--control-size); background: color-mix(in oklab, var(--button) 82%, var(--panel)); }
      .controls button:is(:active, [data-pressed]) { background: var(--seat); color: var(--button); }
      .controls button[data-pressed]::after { background: color-mix(in oklab, var(--seat) 11%, transparent); }
      .player-face::after { content: ''; position: absolute; left: calc(50% - .5px); top: 9%; bottom: 9%; width: 1px; z-index: -1;
        background: linear-gradient(transparent, var(--rim) 12%, var(--rim) 24%, transparent 30%, transparent 70%, var(--rim) 76%, var(--rim) 88%, transparent); }
      .board[data-mode] .player-face::after { content: none; }
      .mk-cell { box-shadow: none; border-radius: 18px; background: color-mix(in oklab, var(--button) 82%, var(--panel)); }`,
  },
  D: {
    title: 'Edge rails',
    note: 'Each half becomes a tall rail hugging its outer edge, so the button visibly runs the height of the tile. Pressed: the rail fills and the half lights. Counter cells become capsules.',
    css: `
      .controls { width: 100%; grid-template-columns: 1fr auto 1fr; }
      .controls button { width: clamp(44px, 13cqi, 68 * var(--grow)); height: clamp(88px, 64cqb, 420px); border-radius: 999px; border-color: color-mix(in oklab, var(--rim) 70%, var(--panel)); font-size: clamp(1.25rem, 8cqi, max(1.75rem, 30 * var(--grow))); }
      .controls .subtract { justify-self: start; margin-inline-start: 3cqi; }
      .controls .add { justify-self: end; margin-inline-end: 3cqi; }
      .controls button[data-pressed]::after { background: color-mix(in oklab, var(--seat) 11%, transparent); }
      .mk-cell { border-radius: 999px; }`,
  },
};
const pillPress = `
  .pill-button.mock-press::before { background: var(--surface-pressed); }`;

async function styleBoard(size, seed, k, opts = {}) {
  if (opts.counters) return countersBoard(size, seed, 'grid', 5, styles[k].css + pillPress, opts.press?.[0]);
  const p = await open(size, seed, { css: styles[k].css + pillPress });
  for (const [sel, n] of opts.press ?? []) await pressed(p, sel, n);
  return p;
}

strips['style-phone'] = async () => {
  const rows = [];
  const seed = game(4, { poison: [3, 0, 7, 1], casts: [1, 0, 2, 0] });
  for (const k of Object.keys(styles)) {
    const p = await styleBoard('phone', seed, k, { press: [['.player:nth-child(3) .add', 0], ['.player:nth-child(2) .subtract', 0], ['#dice-button', 0]] });
    const board = await shot(p);
    const c = await styleBoard('phone', seed, k, { counters: true, press: [['.player:nth-child(3) .mk-cell', 2]] });
    const t = await tile(c, 2);
    rows.push({ letter: k, title: styles[k].title, note: styles[k].note, frames: [caption(fit(board, 520), 'At rest · P3 holding +, P2 holding −, dice pressed'), caption(fit(t, 290), 'Counters (K3) · P3 holding energy')] });
    await p.close(); await c.close();
  }
  await compose('style-phone', '3a · Button style, phone 852 × 393', 'Pressed states are shown held. The pill keeps its shape in every direction; only its pressed disc changes with the set.', rows);
};

strips['style-sizes'] = async () => {
  const rows = [];
  const s6 = game(6, { poison: [3, 0, 7, 1, 0, 2], casts: [1, 0, 2, 0, 1, 0] });
  const t4 = game(4, { poison: [3, 0, 7, 1], casts: [1, 0, 2, 0] });
  for (const k of Object.keys(styles)) {
    const a = await styleBoard('small', s6, k, { press: [['.player:nth-child(3) .add', 0], ['.player:nth-child(5) .subtract', 0]] });
    const b = await styleBoard('tablet', t4, k, { press: [['.player:nth-child(4) .add', 0]] });
    const c = await styleBoard('small', s6, k, { counters: true, press: [['.player:nth-child(3) .mk-cell', 0]] });
    rows.push({ letter: k, title: styles[k].title, frames: [caption(fit(await shot(a), 275), '6 players · 640 × 360'), caption(fit(await shot(c), 275), '6 players · counters'), caption(fit(await shot(b), 275), 'Tablet · 1366 × 1024')] });
    await a.close(); await b.close(); await c.close();
  }
  await compose('style-sizes', '3b · Button style at the smallest phone (6 players) and on a tablet', '', rows);
};

// ---- Ask 2: sizes ---------------------------------------------------------------------------------------------

const targetsJs = `
  for (const el of document.querySelectorAll('.controls button, .mk-cell, .map-cell[data-attacker], .pill-button:not([hidden])')) {
    if (el.matches('.controls button') && board.dataset.mode) continue;
    const r = el.matches('.controls button') ? { w: Math.round(el.closest('.player-face').offsetWidth / 2), h: el.closest('.player-face').offsetHeight } : { w: el.offsetWidth, h: el.offsetHeight };
    const tag = document.createElement('span'); tag.className = 'mock-size'; tag.textContent = r.w + '×' + r.h;
    if (el.matches('.controls button')) { tag.classList.add(el.matches('.subtract') ? 'left' : 'right'); el.closest('.player-face').append(tag); }
    else { el.style.outline = '2px dashed #ffffffb0'; el.style.outlineOffset = '-2px'; if (!el.matches('.pill-button')) el.append(tag); }
  }`;
const targetsCss = `
  .controls button::after { outline: 2px dashed #ffffff90; outline-offset: -5px; }
  .mock-size { position: absolute; z-index: 5; padding: 1px 5px; border-radius: 5px; background: #000000c0; color: #fff; font: 700 11px/1.3 system-ui; letter-spacing: 0; pointer-events: none; }
  .player-face > .mock-size { top: 40%; }
  .player-face > .mock-size.left { left: 10px; } .player-face > .mock-size.right { right: 10px; }
  .mk-cell, .map-cell { position: relative; }
  .mk-cell .mock-size, .map-cell .mock-size { bottom: -2px; left: 50%; transform: translateX(-50%); font-size: 9.5px; }`;

strips['size-targets'] = async () => {
  const frames = [];
  for (const [size, seed, mode, label] of [['phone', c4, null, 'Phone, 4 players: life halves'], ['small', c6, null, '640 × 360, 6 players: life halves'],
    ['small', c6, 'counters', '640 × 360, 6 players: counters (K3 cells)'], ['small', c6, 'damage', '640 × 360, 6 players: map seats']]) {
    let p;
    if (mode === 'counters') p = await countersBoard(size, seed, 'grid', 5, targetsCss);
    else {
      p = await open(size, seed, { css: targetsCss });
      if (mode) { await tap(p, `#${mode}-button`); await p.waitForTimeout(80); }
    }
    await p.evaluate(targetsJs);
    frames.push(caption(fit(await shot(p), 410), label));
    await p.close();
  }
  await compose('size-targets', '2a · What a finger can hit', '', [{ title: 'Touch areas', note: 'Dashed boxes are what a finger can hit. Life halves are 4–8× the 44px minimum; the pill sits at the 48px floor. Counter cells (K3) stay above 44px with all five counters on at 6 players.', frames }]);
};

strips['size-options'] = async () => {
  const rows = [];
  {
    const crop = async (css) => {
      const p = await open('tablet', game(4), { css });
      const box = await p.locator('#board-controls').boundingBox();
      const f = await shot(p, { x: box.x + box.width / 2 - 200, y: box.y + box.height / 2 - 70, width: 400, height: 140, pad: 0 });
      await p.close();
      return f;
    };
    const grow = `:root { --setup-button: clamp(48px, 48 * var(--grow), 64px); }
      .pill-button { font-size: clamp(1.25rem, 20 * var(--grow), 1.6rem); }
      .board-controls::before { inset: calc(var(--setup-button) / 8); }
      .pill-button::before { inset: calc(var(--setup-button) / 7) 2px; }`;
    rows.push({ letter: 'Z1', title: 'Centre pill on a tablet', note: 'Left: today, 48px everywhere (36px visible). Right: grows with --grow to 64px on tablets, like the tile content does. Phones are unchanged.',
      frames: [caption(fit(await crop(''), 400), 'Today'), caption(fit(await crop(grow), 400), 'Grows to 64px')] });
  }
  {
    const css = '.score { font-size: min(max(clamp(2rem, 19vmin, max(7rem, 112 * var(--grow))), min(38cqb, 160 * var(--grow))), calc((100cqi - 2 * var(--control-size) - 2 * var(--control-gap) - 8px) * 1.5 / var(--digits, 2))); }';
    const a = await open('phone', game(2)); const b = await open('phone', game(2), { css });
    const c = await open('phone', game(3), { css });
    rows.push({ letter: 'Z2', title: 'Life total grows with a tall tile', note: 'Today the total is capped at 19% of the screen’s short side: 75px in a 425px tile at 2 players. The new rule never goes below today’s size but may grow to 38% of the tile’s height (up to 160px, 320px on tablets). 2 players get 160px, the end seat at 3 and 5 players 160px and 107px; 4 and 6 players are unchanged at every size.',
      frames: [caption(fit(await shot(a), 270), '2 players today: 75px'), caption(fit(await shot(b), 270), '2 players: 160px'), caption(fit(await shot(c), 270), '3 players: end seat 160px, others 75px')] });
    await a.close(); await b.close(); await c.close();
  }
  await compose('size-options', '2b · Size changes to decide', 'Counter targets are covered by the counters layout (K).', rows);
};

// ---- Ask 5: who goes first and turns --------------------------------------------------------------------------

const turnCss = `
  ${glyphCss}
  .round-button .round { position: relative; display: grid; grid-template-rows: 1fr 1fr; place-items: center; width: 34px; height: 34px; border-radius: 50%;
    background: var(--surface); box-shadow: inset 0 0 0 1.5px var(--accent); color: var(--text); font-weight: 800; font-size: 14px; line-height: 1; font-variant-numeric: tabular-nums; }
  .round-button .round span:first-child { transform: rotate(180deg); }
  .round-button .round::after { content: ''; position: absolute; left: 7px; right: 7px; top: 50%; height: 1px; background: var(--border); }
  .badges.near:has(.mk-marker) { pointer-events: none; }
  .mk-marker { position: relative; pointer-events: auto; gap: .3em; padding: 0 .55em 0 .45em; background: var(--button); color: var(--seat); box-shadow: inset 0 0 0 1.5px var(--seat); font-weight: 750; }
  .mk-marker .icon { width: .95em; height: .95em; }
  .mk-marker::after { content: ''; position: absolute; left: 50%; top: 50%; width: max(100%, 64px); height: 44px; transform: translate(-50%, -50%); border-radius: 22px; }
  .mk-marker.show-hit::after { outline: 2px dashed #ffffffb0; }
  .mk-marker[data-pressed] { background: var(--seat); color: var(--button); }
  .player.is-active { box-shadow: inset 0 0 0 4px var(--seat); }
  .mk-end { position: relative; pointer-events: auto; gap: .3em; padding: 0 .4em 0 .6em; background: var(--seat); color: var(--button); font-weight: 750; }
  .mk-end .icon { width: .9em; height: .9em; }
  .mk-end::after { content: ''; position: absolute; left: 50%; top: 50%; width: max(100%, 64px); height: 44px; transform: translate(-50%, -50%); }
  .mk-end.show-hit::after { outline: 2px dashed #ffffffb0; border-radius: 22px; }
  .layer-first { display: grid; justify-items: center; gap: 8px; }
  .layer-first .go { display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 0 20px; border-radius: 999px; border: 1.5px solid var(--seat); background: var(--button); color: var(--seat); font-weight: 750; font-size: clamp(1rem, 5cqi, 1.5rem); }
  .layer-first .go .icon { width: 1.1em; height: 1.1em; }
  .player.lit .layer-first .go { background: var(--seat); color: var(--button); }
  .player.dim .mode-layer { opacity: .35; }
  .player.lit { box-shadow: inset 0 0 0 4px var(--seat); }`;
const turnJs = ({ round = null, first = null, active = null, mode = null, lit = null, hit = false, press = false } = {}) => `
  const pill = document.querySelector('#board-controls');
  if (${round} !== null) {
    const b = document.createElement('button'); b.className = 'pill-button round-button'; b.setAttribute('aria-label', 'Round ${round}');
    b.append(element('span', 'round', element('span', '', '${round}'), element('span', '', '${round}'))); pill.prepend(b);
  }
  const nearOf = i => board.children[i].querySelector('.badges.near');
  if (${first} !== null && ${active} === null) {
    const near = nearOf(${first});
    const m = element('button', 'chip mk-marker', mk.svg(mk.ph['flag-fill']), '${round}');
    m.setAttribute('aria-label', 'Round ${round}. Start round ${(round ?? 0) + 1}');
    if (${hit}) m.classList.add('show-hit'); if (${press}) m.dataset.pressed = '';
    near.prepend(m); near.hidden = false; fitBadgeRow(near);
  }
  if (${active} !== null) {
    const fm = element('span', 'chip', mk.svg(mk.ph['flag-fill'])); fm.style.color = 'var(--seat)';
    nearOf(${first}).prepend(fm); nearOf(${first}).hidden = false; fitBadgeRow(nearOf(${first}));
    const p = board.children[${active}]; p.classList.add('is-active');
    const near = nearOf(${active});
    const e = element('button', 'chip mk-end', 'Turn ${round ?? 1}', mk.svg(mk.ph['caret-right']));
    if (${hit}) e.classList.add('show-hit');
    near.prepend(e); near.hidden = false; fitBadgeRow(near);
  }
  if (${JSON.stringify(mode)} === 'first') {
    board.dataset.mode = 'first'; pill.dataset.mode = 'first';
    for (const b of pill.querySelectorAll('.pill-button')) b.hidden = true;
    const dice = document.createElement('button'); dice.className = 'pill-button'; dice.append(mk.svg(mk.ph.shuffle));
    const x = document.querySelector('#cancel-button'); x.hidden = false;
    pill.insertBefore(dice, x);
    [...board.children].forEach((p, i) => {
      const layer = p.querySelector('.mode-layer'); layer.hidden = false;
      const lit = ${lit} === i;
      const go = element('span', 'go', mk.svg(lit ? mk.ph['flag-fill'] : mk.ph['hand-tap']), lit ? 'Goes first' : 'Me first');
      layer.replaceChildren(element('div', 'layer-first', go, element('p', 'layer-hint', lit ? 'Tap the flag to start each round' : 'or the centre button picks at random')));
      if (${lit} !== null) p.classList.add(lit ? 'lit' : 'dim');
    });
  }`;

strips['turns-start'] = async () => {
  const a = await open('phone', game(4, { scores: [40, 40, 40, 40] }), { css: turnCss, js: helpersJs });
  await a.evaluate(turnJs({ mode: 'first' }));
  const b = await open('phone', game(4, { scores: [40, 40, 40, 40] }), { css: turnCss, js: helpersJs });
  await b.evaluate(turnJs({ mode: 'first', lit: 1 }));
  await compose('turns-start', '5a · New game: “Who goes first?”', '', [{
    title: 'Opens on every new game while Turns is on',
    note: 'Each tile offers “Me first”, facing its player; the shuffle button in the centre picks at random (a short run around the table that lands on one tile, from the same crypto RNG as the dice); ✕ skips. The chosen tile shows “Goes first” for a beat, then the board returns with the flag on that tile.',
    frames: [caption(fit(await shot(a), 410), 'Pick a tile, or shuffle for random'), caption(fit(await shot(b), 410), 'P2 goes first')],
  }]);
  await a.close(); await b.close();
};

strips['turns-models'] = async () => {
  const rows = [];
  const g4 = game(4, { poison: [0, 0, 3, 0], casts: [1, 0, 0, 2] });
  const g6 = game(6, { poison: [0, 0, 3, 0, 0, 1], casts: [1, 0, 0, 2, 0, 0] });
  {
    const a = await open('phone', g4, { css: turnCss, js: helpersJs }); await a.evaluate(turnJs({ round: 3, first: 1 }));
    const b = await open('small', g6, { css: turnCss, js: helpersJs }); await b.evaluate(turnJs({ round: 3, first: 1 }));
    const z = await open('phone', g4, { css: turnCss, js: helpersJs }); await z.evaluate(turnJs({ round: 3, first: 1, hit: true }));
    const zp = await open('phone', g4, { css: turnCss, js: helpersJs }); await zp.evaluate(turnJs({ round: 4, first: 1, press: true }));
    rows.push({ letter: 'A', title: 'The first player taps their flag to start each round', note: 'The flag on the first player’s near edge carries the round (⚑ 3) and is the button: they tap it as their turn begins, facing them, on their own tile. Hold takes a round back. The pill shows the round to everyone, printed twice like a card index. One tap per lap of the table, by one person.',
      frames: [caption(fit(await shot(a), 410), 'Phone · round 3, P2 went first'), caption(fit(await shot(b), 410), '6 players · 640 × 360'),
        caption({ ...(await tile(z, 1)), zoom: 0.62 }, 'P2’s tile, upright: the 44px hit area'), caption({ ...(await tile(zp, 1)), zoom: 0.62 }, 'Pressed: round 4 starts')] });
    await a.close(); await b.close(); await z.close(); await zp.close();
  }
  {
    const a = await open('phone', g4, { css: turnCss, js: helpersJs }); await a.evaluate(turnJs({ round: 3, first: 1, active: 3 }));
    const b = await open('small', g6, { css: turnCss, js: helpersJs }); await b.evaluate(turnJs({ round: 3, first: 1, active: 5 }));
    const z = await open('phone', g4, { css: turnCss, js: helpersJs }); await z.evaluate(turnJs({ round: 3, first: 1, active: 3, hit: true }));
    rows.push({ letter: 'B', title: 'Each player ends their own turn (a chess clock)', note: 'The active tile gets a seat-colour frame and a “Turn 3 ›” chip on its near edge; its player taps it when done and the next player to the left lights up. The round goes up when it comes back to the first player. Hold steps back one turn.',
      frames: [caption(fit(await shot(a), 410), 'Phone · P4’s turn, round 3'), caption(fit(await shot(b), 410), '6 players · P6’s turn'), caption({ ...(await tile(z, 3)), zoom: 0.62 }, 'P4’s tile: the 44px hit area')] });
    await a.close(); await b.close(); await z.close();
  }
  await compose('turns-models', '5b · Making the turn tap cheap', 'Both models put the tap on the player’s own tile, facing them, at the near edge, where the badge row already sits. Its 44px hit area takes a small bite out of the − and + halves at the bottom centre.', rows);
};

// ---- Floating mana ---------------------------------------------------------------------------------------------

const pools = { 0: { W: 2, U: 1 }, 2: { R: 3, C: 1 }, 4: { G: 1 } };
const poolCss = `
  ${glyphCss}
  .mk-pool { display: grid; grid-template-columns: repeat(3, minmax(44px, 1fr)); gap: 4px; width: min(100cqi - 12px, 3 * 100 * var(--grow)); height: min(100cqb - 72px, 2 * 70 * var(--grow)); grid-auto-rows: minmax(44px, 1fr); }
  .mk-pool button { position: relative; display: grid; place-items: center; grid-auto-flow: column; gap: 6px; padding: 0; border: 0; border-radius: var(--radius-sm); background: var(--button); box-shadow: inset 0 0 0 1px var(--rim);
    color: var(--text); font-size: clamp(1.0625rem, 6cqi, max(1.625rem, 26 * var(--grow))); font-weight: var(--weight-heavy); font-variant-numeric: tabular-nums; }
  .mk-pool button[data-zero] { color: var(--muted); font-weight: var(--weight-semibold); }
  .mk-pool button[data-zero] .pip { filter: saturate(.25) brightness(.8); }
  .mk-pool .pip { --pip-size: 1.5em; }
  .mk-empty { min-height: 44px; padding: 0 14px; border: 0; border-radius: var(--radius-full); background: none; color: var(--text-soft); font-size: clamp(.75rem, 3.6cqi, .9375rem); font-weight: var(--weight-semibold); display: inline-flex; align-items: center; gap: 6px; }
  .mk-empty .icon { width: 1.1em; height: 1.1em; }
  .board.mk-pool-on .player-face { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding-top: 20px; }
  .board.mk-pool-on .badges.near { display: none; }
  .mk-strip { z-index: 3; display: flex; flex-wrap: wrap; justify-content: center; gap: 2px; max-width: calc(100cqi - 8px); padding: 2px; border-radius: 14px; background: var(--chip-background); }
  .mk-strip button { display: grid; grid-auto-flow: column; place-items: center; gap: 3px; min-width: max(46px, 46 * var(--grow)); height: max(44px, 46 * var(--grow)); padding: 0 4px; border: 0; border-radius: 11px; background: none; color: var(--text); font-size: max(15px, 20 * var(--grow)); font-weight: 750; font-variant-numeric: tabular-nums; }
  .mk-strip button[data-zero] { color: var(--muted); font-weight: 600; }
  .mk-strip button[data-zero] .pip { filter: saturate(.25) brightness(.8); }
  .mk-strip .pip { --pip-size: max(22px, 26 * var(--grow)); }
  .mk-strip .mk-clear { color: var(--text-soft); } .mk-strip .mk-clear .icon { width: 18px; height: 18px; }
  @container (max-height: 200px) and (max-width: 300px) {
    .board.mk-pool-on .player-face { padding-top: 4px; }
    .board.mk-pool-on .score { font-size: 46px; }
    .board.mk-pool-on .badges.far { display: none; }
    .mk-strip { width: 200px; }
    .mk-strip button { padding: 0 2px; gap: 2px; }
    .mk-strip .pip { --pip-size: 20px; }
  }
  .pill-button > .mk-g { position: relative; }
  .mk-pool-button { color: var(--accent); }
  .mk-pool-button::before { background: var(--surface-pressed); }`;
const poolJs = mode => `
  const pools = ${JSON.stringify(pools)};
  const cell = (cls, i, c) => { const v = pools[i]?.[c] ?? 0; const b = element('button', cls, mk.pip(c), String(v)); if (!v) b.dataset.zero = ''; return b; };
  const pill = document.querySelector('#board-controls');
  if (${JSON.stringify(mode)} === 'mode') {
    board.dataset.mode = 'mana'; pill.dataset.mode = 'mana';
    document.querySelectorAll('#damage-button, #counters-button, #dice-button, #setup-button').forEach(b => b.hidden = true);
    document.querySelectorAll('#undo-button, #save-button, #cancel-button').forEach(b => b.hidden = false);
    document.querySelector('#undo-button').disabled = false;
    [...board.children].forEach((p, i) => {
      const layer = p.querySelector('.mode-layer'); layer.hidden = false;
      const grid = element('div', 'mk-pool', ...['W', 'U', 'B', 'R', 'G', 'C'].map(c => cell('', i, c)));
      const empty = element('button', 'mk-empty', mk.svg(mk.ph.eraser), 'Empty');
      layer.replaceChildren(element('p', 'layer-hint', 'Tap +1 · hold −1'), grid, empty);
    });
  } else {
    board.classList.add('mk-pool-on');
    const b = document.createElement('button'); b.className = 'pill-button mk-pool-button'; b.append(mk.g('tap'));
    pill.insertBefore(b, document.querySelector('#dice-button'));
    [...board.children].forEach((p, i) => {
      const strip = element('div', 'mk-strip', ...['W', 'U', 'B', 'R', 'G', 'C'].map(c => cell('', i, c)));
      const clear = element('button', 'mk-clear', mk.svg(mk.ph.eraser)); strip.append(clear);
      p.querySelector('.player-face').append(strip);
    });
  }`;

strips['mana-pool'] = async () => {
  const g4 = game(4, { poison: [0, 0, 3, 0], casts: [1, 0, 0, 2] });
  const g6 = game(6, { poison: [0, 0, 3, 0, 0, 1], casts: [1, 0, 0, 2, 0, 0] });
  const rows = [];
  for (const [letter, mode, title, note] of [
    ['M1', 'mode', 'A mana mode, like counters', 'A pill button (the tap symbol) opens a board mode: every tile shows its pool as six cells, W U B R G and colourless, facing its player. Tap +1, hold −1, as on the map; Empty clears that player’s pool. Undo, ✓ and ✕ as in counters mode. Life is locked while it’s open.'],
    ['M2', 'strip', 'A pool strip on every tile, life stays live', 'The same pill button toggles a strip of the six symbols along each tile’s near edge (in place of the badge row) while − and + keep working, so a player can pay life and float mana at once. Tap +1, hold −1; the eraser empties that pool. At 6 players on a phone the strip wraps to two rows, the total shrinks to 46px and the commander damage chips hide while pools are shown.'],
  ]) {
    const a = await open('phone', g4, { css: poolCss, js: helpersJs }); await a.evaluate(poolJs(mode)); await a.waitForTimeout(60);
    const b = await open('small', g6, { css: poolCss, js: helpersJs }); await b.evaluate(poolJs(mode)); await b.waitForTimeout(60);
    const t = await open('tablet', g4, { css: poolCss, js: helpersJs }); await t.evaluate(poolJs(mode)); await t.waitForTimeout(60);
    rows.push({ letter, title, note, frames: [caption(fit(await shot(a), 420), 'Phone · P1 has W W U, P3 has R R R C'), caption(fit(await shot(b), 400), '6 players · 640 × 360'), caption(fit(await shot(t), 300), 'Tablet')] });
    await a.close(); await b.close(); await t.close();
  }
  await compose('mana-pool', 'M · Floating mana', 'Each player’s pool of W U B R G and colourless mana, drawn with the real Mana symbols. A Mana pool tracker switch in setup shows the pill button.', rows);
};

for (const [name, run] of Object.entries(strips)) {
  if (only.length && !only.includes(name)) continue;
  await run();
}
await close();
