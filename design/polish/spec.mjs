// Spec mock-ups (renders/spec-*.png), drawn on the current app (web/index.html) with injected CSS and JS.
// Nothing in web/ changes. Run from the repo root:  node design/polish/spec.mjs [strip ...]
// Every frame uses the spec baseline: button style B and one life-total size per board (SPEC §3).
// The official experience icon isn't bundled: set EXP_SVG to a local copy of https://files.mtg.wiki/Exp.svg to
// draw it in spec-experience; without it that frame says so.
import { readFileSync, existsSync } from 'node:fs';
import { launch, close, open, tap, game, shot, compose, outDir } from './lib.mjs';
import ph from './icons.mjs';

const only = process.argv.slice(2);
await launch();

// ---- Shared ---------------------------------------------------------------------------------------------------

const caption = (f, text) => ({ ...f, caption: text });
const fit = (f, show) => ({ ...f, show });
async function tile(page, index) {
  const box = await page.locator('.player').nth(index).boundingBox();
  const edge = await page.locator('.player').nth(index).getAttribute('data-edge');
  return { ...(await shot(page, { ...box, pad: 0 })), angle: edge === 'top' ? 180 : 0 };
}
async function crop(page, selector, pad = 8, zoom = 1) {
  const f = await shot(page, { ...(await page.locator(selector).first().boundingBox()), pad });
  return { ...f, zoom };
}
const pressed = (page, selector, nth = 0) => page.locator(selector).nth(nth).evaluate(el => { el.dataset.pressed = ''; });

// Code points in the Mana font (mana.css 1.18.0).
const G = {
  W: 0xe600, U: 0xe601, B: 0xe602, R: 0xe603, G: 0xe604, C: 0xe904, energy: 0xe907, rad: 0xea50, infect: 0xea73, tap: 0xe61a, untap: 0xe61b,
  pie: 0xe9f0, d20: 0xe999,
  WU: 0xe90c, WR: 0xe90d, UB: 0xe90e, BG: 0xe90f, RG: 0xe910, UR: 0xe911, WB: 0xe912, BR: 0xe913, WG: 0xe914, UG: 0xe915,
  WBG: 0xe916, WUR: 0xe917, WBR: 0xe918, UBG: 0xe919, URG: 0xe91a,
  WUG: 0xea0d, WRG: 0xea0e, UBR: 0xea0f, WUB: 0xea10, BRG: 0xea11, // Streets of New Capenna families (SPEC §2.4)
};
const NAMES = {
  W: 'Mono-white', U: 'Mono-blue', B: 'Mono-black', R: 'Mono-red', G: 'Mono-green',
  WU: 'Azorius', UB: 'Dimir', BR: 'Rakdos', RG: 'Gruul', WG: 'Selesnya', WB: 'Orzhov', UR: 'Izzet', BG: 'Golgari', WR: 'Boros', UG: 'Simic',
  WUG: 'Bant', WUB: 'Esper', UBR: 'Grixis', BRG: 'Jund', WRG: 'Naya', WBG: 'Abzan', WUR: 'Jeskai', UBG: 'Sultai', WBR: 'Mardu', URG: 'Temur',
  UBRG: 'Glint-Eye', WBRG: 'Dune-Brood', WURG: 'Ink-Treader', WUBG: 'Witch-Maw', WUBR: 'Yore-Tiller', WUBRG: 'WUBRG',
};

// Page-side helpers: Mana glyphs, Phosphor icons, the identity symbol (with the four-colour "pie minus one"),
// and the identity chip in any display mode.
const helpersJs = `
  window.mk = {
    G: ${JSON.stringify(G)}, NAMES: ${JSON.stringify(NAMES)}, ph: ${JSON.stringify(ph)},
    glyph(code, cls = 'mk-glyph') { const s = document.createElement('span'); s.className = cls; s.textContent = String.fromCodePoint(typeof code === 'number' ? code : mk.G[code]); s.setAttribute('aria-hidden', 'true'); return s; },
    svg(name) { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'icon'); s.setAttribute('viewBox', '0 0 256 256'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', mk.ph[name]); s.append(p); return s; },
    pip(c) { const s = document.createElement('span'); s.className = 'pip'; s.dataset.pip = c; return s; },
    ci(id) { const s = document.createElement('span'); s.className = 'ci'; s.dataset.ci = id; s.dataset.count = id.length; return s; },
    // The identity's symbol: mono mana symbol, guild, clan, family, colour pie, or the pie with the missing colour left out.
    symbol(id) {
      if (mk.G[id] && id.length <= 3 || id === 'WUBRG') return mk.glyph(id === 'WUBRG' ? 'pie' : id, 'mk-glyph mk-sym');
      if (id.length === 4) {
        const pie = document.createElement('span'); pie.className = 'mk-sym mk-pie';
        for (const c of 'WUBRG') { const g = mk.glyph(c, 'mk-glyph'); g.dataset.at = c; if (!id.includes(c)) g.dataset.gap = ''; pie.append(g); }
        return pie;
      }
      return null;
    },
    // The identity chip for a display mode: any of indicator, symbol, name. A symbol-only chip for an identity with no
    // symbol falls back to the indicator, so a set identity always shows something.
    chip(id, show) {
      const chip = document.createElement('span'); chip.className = 'chip mk-id';
      const sym = show.symbol ? mk.symbol(id) : null;
      if (show.indicator || (show.symbol && !sym)) chip.append(mk.ci(id));
      if (sym) chip.append(sym);
      if (show.name) chip.append(Object.assign(document.createElement('span'), { className: 'mk-name', textContent: mk.NAMES[id] }));
      if (chip.childElementCount === 1 && !show.name) chip.classList.add('round');
      return chip;
    },
  };`;

// Mana glyphs, the composite pie and identity chips.
const glyphCss = `
  .mk-glyph { display: inline-grid; place-items: center; font: normal normal normal 1em/1 Mana; }
  .mk-pie { position: relative; display: inline-block; width: 1.1em; height: 1.1em; }
  .mk-pie .mk-glyph { position: absolute; font-size: .46em; transform: translate(-50%, -50%); }
  .mk-pie [data-at="W"] { left: 50%; top: 14%; } .mk-pie [data-at="U"] { left: 86%; top: 40%; } .mk-pie [data-at="B"] { left: 72%; top: 84%; }
  .mk-pie [data-at="R"] { left: 28%; top: 84%; } .mk-pie [data-at="G"] { left: 14%; top: 40%; }
  .mk-pie [data-gap] { opacity: .22; }
  .chip.mk-id { gap: .3em; padding: 0 .42em 0 .26em; }
  .chip.mk-id.round { width: 1.7em; padding: 0; justify-content: center; }
  .chip.mk-id .ci { font-size: 1.12em; } .chip.mk-id .mk-sym { font-size: 1.12em; color: var(--text); }
  .chip.mk-id .mk-name { font-size: .86em; font-weight: 650; letter-spacing: .01em; color: var(--text-soft); }
  .pip[data-pip="C"] { --pip: #cdc8c4; --glyph: '\\e904'; }`;

// The spec baseline: style B (bare glyphs, the pressed half lights), one size per board for everything on a tile,
// and a pill that grows on tablets. --ui and --ub are the smallest tile face's width and height, set by uniformJs.
const wash = 'color-mix(in oklab, var(--seat) 17%, transparent)';
const baseCss = `
  ${glyphCss}
  :root { --setup-button: clamp(48px, 48 * var(--grow), 64px); }
  .pill-button { font-size: clamp(1.25rem, 20 * var(--grow), 1.6rem); }
  .board-controls::before { inset: calc(var(--setup-button) / 8); }
  .pill-button::before { inset: calc(var(--setup-button) / 7) 2px; }
  .board { --u: calc(var(--ui, 400px) / 100); }
  .player-face { --control-size: clamp(44px, calc(18 * var(--u)), 74 * var(--grow)); --control-gap: clamp(4px, calc(3 * var(--u)), 16 * var(--grow)); }
  .score { font-size: min(clamp(2rem, 19vmin, max(7rem, 112 * var(--grow))), calc((var(--ui, 400px) - 2 * var(--control-size) - 2 * var(--control-gap) - 8px) * 1.5 / var(--board-digits, 2))) !important; }
  .badges { font-size: clamp(.78125rem, calc(3.6 * var(--u)), max(1rem, 16 * var(--grow))); }
  .controls { width: 100%; grid-template-columns: 1fr auto 1fr; }
  .controls button { width: clamp(44px, calc(16 * var(--u)), 84 * var(--grow)); border: 0; background: none; font-size: clamp(1.75rem, calc(12 * var(--u)), max(2.5rem, 46 * var(--grow))); }
  .controls .subtract { justify-self: start; margin-inline-start: calc(5 * var(--u)); }
  .controls .add { justify-self: end; margin-inline-end: calc(5 * var(--u)); }
  .controls button:is(:active, [data-pressed]) { background: none; color: var(--text); }
  .controls button[data-pressed]::after { background: ${wash}; }
  .controls .subtract[data-pressed]::after { border-radius: 0 28px 28px 0; }
  .controls .add[data-pressed]::after { border-radius: 28px 0 0 28px; }`;
const uniformJs = `
  window.mkUniform = () => {
    const faces = [...document.querySelectorAll('.player-face')];
    board.style.setProperty('--ui', Math.min(...faces.map(f => f.offsetWidth)) + 'px');
    board.style.setProperty('--ub', Math.min(...faces.map(f => f.offsetHeight)) + 'px');
    board.style.setProperty('--board-digits', Math.max(2, ...game.scores.map(s => String(s).length)));
    fitAllBadges();
  };
  mkUniform();`;
// Today's per-tile sizing with style B, for comparison (cqi instead of the board unit).
const perTileCss = baseCss.replace(/calc\((\d+(?:\.\d+)?) \* var\(--u\)\)/g, '$1cqi')
  .replace(/calc\(\(var\(--ui, 400px\) - 2 \* var\(--control-size\) - 2 \* var\(--control-gap\) - 8px\) \* 1\.5 \/ var\(--board-digits, 2\)\)/, 'calc((100cqi - 2 * var(--control-size) - 2 * var(--control-gap) - 8px) * 1.5 / var(--digits, 2))');

// Shard and four-colour symbols for the watermark, and the background setting (symbol, indicator or off).
const backgroundJs = mode => `
  [...board.children].forEach((p, i) => {
    const id = game.identities[i];
    p.querySelector('.player-face > .mk-wm')?.remove();
    if (${JSON.stringify(mode)} === 'off') { delete p.dataset.watermark; return; }
    if (${JSON.stringify(mode)} === 'indicator') {
      delete p.dataset.watermark; if (!id) return;
      const ci = mk.ci(id); ci.classList.add('mk-wm'); p.querySelector('.player-face').prepend(ci); return;
    }
    if (['WUG', 'WRG', 'UBR', 'WUB', 'BRG'].includes(id)) { p.dataset.watermark = id; p.style.setProperty('--watermark', '"' + String.fromCodePoint(mk.G[id]) + '"'); }
    if (id.length === 4) { const s = mk.symbol(id); s.classList.add('mk-wm'); p.querySelector('.player-face').prepend(s); }
  });`;
const backgroundCss = `
  .player-face > .mk-wm { position: absolute; left: 50%; top: 50%; z-index: -1; transform: translate(-50%, -50%); pointer-events: none; }
  .player-face > .mk-pie.mk-wm { width: min(70cqb, 50cqi); height: min(70cqb, 50cqi); font-size: min(70cqb, 50cqi); color: var(--seat); opacity: .07; }
  .player-face > .mk-pie.mk-wm .mk-glyph { font-size: .4em; } .player-face > .mk-pie.mk-wm [data-gap] { opacity: 0; }
  .player-face > .ci.mk-wm { width: min(72cqb, 52cqi); height: min(72cqb, 52cqi); font-size: min(72cqb, 52cqi); opacity: .1; box-shadow: none; }
  .player:has(> .player-face > .mk-wm) .player-face::before { content: none; }`;
// Replace the near row's identity chip with one in a display mode.
const chipModeJs = show => `
  const show = ${JSON.stringify(show)};
  const base = renderBadges;
  window.renderBadges = function (index) {
    base(index);
    const near = board.children[index]?.querySelector('.badges.near');
    const old = near?.querySelector('.ci-chip'); const id = game.identities[index];
    if (!old || !id) return;
    if (!show.indicator && !show.symbol && !show.name) old.remove(); else old.replaceWith(mk.chip(id, show));
    near.hidden = near.childElementCount === 0; fitBadgeRow(near);
  };
  [...board.children].forEach((p, i) => renderBadges(i));`;

// Opens a board with the spec baseline. extra: { css, js } applied after it.
async function board(size, seed, extra = {}) {
  const p = await open(size, seed, { css: baseCss + backgroundCss + (extra.css ?? ''), js: helpersJs + uniformJs });
  if (extra.js) await p.evaluate(extra.js);
  await p.evaluate('mkUniform()');
  await p.waitForTimeout(120);
  return p;
}

// A reference page drawn inside the app, so the Mana font and the app's classes apply.
async function appPage(name, html, css = '', width = 860) {
  const page = await open({ width: width + 40, height: 400 }, game(4), { css: glyphCss, js: helpersJs });
  await page.evaluate(([h]) => {
    const ref = document.createElement('div'); ref.id = 'mk-ref';
    document.querySelector('.app').style.display = 'none'; document.body.append(ref);
    (new Function('ref', h))(ref);
  }, [html]);
  await page.addStyleTag({ content: `
    html, body { height: auto !important; overflow: visible !important; } body { margin: 0; background: #0c0f0d; }
    #mk-ref { padding: 18px 20px 22px; color: #e8e6da; font: 13px/1.4 system-ui, -apple-system, sans-serif; }
    #mk-ref h1 { margin: 0 0 4px; font-size: 18px; } #mk-ref p.intro { margin: 0 0 14px; color: #aab3a8; }
    #mk-ref table { border-collapse: collapse; } #mk-ref td, #mk-ref th { padding: 6px 8px; border-bottom: 1px solid #1f2620; text-align: left; vertical-align: middle; }
    #mk-ref th { color: #8f998d; font-weight: 600; font-size: 12px; } ${css}` });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}${name}.png`, fullPage: true });
  console.log('wrote', `${name}.png`);
  await page.close();
}

const strips = {};

// ---- 1. Identity: display modes, background, the identity page ------------------------------------------------

const ids4 = ['WUB', 'UG', 'WBR', 'UBRG'];
const idSeed = game(4, { identities: ids4, poison: [0, 0, 3, 0], casts: [1, 0, 0, 2] });
const idSeed6 = game(6, { identities: ['WUB', 'UG', 'WBR', 'UBRG', 'WUBRG', 'R'], poison: [0, 0, 3, 0, 0, 1], casts: [1, 0, 0, 2, 0, 0] });

strips['spec-identity-modes'] = () => appPage('spec-identity-modes', `
  const ids = ['R', 'UG', 'WUB', 'WBR', 'UBRG', 'WUBRG'];
  const modes = [['Indicator', { indicator: 1 }], ['Symbol', { symbol: 1 }], ['Name', { name: 1 }], ['Indicator + name (default)', { indicator: 1, name: 1 }],
    ['Symbol + name', { symbol: 1, name: 1 }], ['All three', { indicator: 1, symbol: 1, name: 1 }]];
  const t = document.createElement('table');
  t.innerHTML = '<tr><th>Identity</th>' + modes.map(m => '<th>' + m[0] + '</th>').join('') + '</tr>';
  for (const id of ids) {
    const tr = document.createElement('tr');
    const pips = document.createElement('td'); pips.className = 'pips'; for (const c of id) pips.append(mk.pip(c)); tr.append(pips);
    for (const [, show] of modes) {
      const td = document.createElement('td');
      const tileBg = document.createElement('div'); tileBg.className = 'player mk-swatch'; tileBg.dataset.colour = 'violet'; tileBg.dataset.row = 'bottom';
      const row = document.createElement('div'); row.className = 'badges mk-row'; row.append(mk.chip(id, show)); tileBg.append(row); td.append(tileBg); tr.append(td);
    }
    t.append(tr);
  }
  ref.innerHTML = '<h1>Identity chip: every display mode</h1><p class="intro">Off shows no chip. Esper and the other shards now use their Streets of New Capenna family symbol (Obscura for Esper); four-colour identities use the colour pie with the missing colour left out (Glint-Eye: no white). A symbol-only chip always has something to show, because every identity now has a symbol. Badge type at 1.6× phone size, on a Violet tile.</p>';
  ref.append(t);`, `
  .pips { display: flex; gap: 3px; } .pips .pip { --pip-size: 20px; }
  .mk-swatch { position: relative; height: 46px; min-width: 96px; border-radius: 8px; container-type: normal; overflow: visible; }
  .mk-row { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 20px; pointer-events: none; }`);

strips['spec-identity-board'] = async () => {
  const rows = [];
  const frames = [];
  for (const [mode, label] of [['symbol', 'Background: Symbol (default)'], ['indicator', 'Background: Indicator'], ['off', 'Background: Off (rings)']]) {
    const p = await board('target', idSeed, { js: chipModeJs({ indicator: 1, name: 1 }) + backgroundJs(mode) });
    frames.push(caption(fit(await shot(p), 275), label));
    await p.close();
  }
  rows.push({ title: 'The background setting, with the default chip (indicator + name)', note: 'Esper (Obscura) and Glint-Eye (pie minus white) now have symbols, so every set identity gets a watermark. “Indicator” draws the colour indicator faintly instead; “Off” brings back the rings.', frames });
  const f2 = [];
  for (const [show, label] of [[{ symbol: 1 }, 'Chip: Symbol'], [{ name: 1 }, 'Chip: Name'], [{}, 'Chip: Off']]) {
    const p = await board('small', idSeed6, { js: chipModeJs(show) + backgroundJs('symbol') });
    f2.push(caption(fit(await shot(p), 275), `6 players · ${label}`));
    await p.close();
  }
  rows.push({ title: 'Other chip modes at 6 players on the smallest phone', frames: f2 });
  await compose('spec-identity-board', 'Identity on the board: chip mode × background', '', rows);
};

// The Identity sheet (setup → Identity) and the identity board mode it starts.
const sheetCss = `
  ${glyphCss}
  .k-sheet { width: min(600px, calc(100% - 32px)); }
  .k-sheet .sheet { gap: 8px; padding: 12px 16px 14px; }
  .k-head { display: flex; align-items: center; gap: 6px; min-height: 44px; }
  .k-head h2 { flex: 1; font-size: 1.25rem; letter-spacing: -.02em; }
  .k-row { display: grid; grid-template-columns: 7.5rem 1fr; align-items: center; gap: 8px; }
  .k-row-head { grid-template-columns: 7.5rem 1fr auto auto; gap: 6px; }
  .k-sheet:has(.k-row-head) .sheet { padding-block: 10px; gap: 6px; }
  .k-label { font-size: .875rem; font-weight: 650; color: var(--text-soft); }
  .k-seg { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 2px; padding: 2px; border: 1px solid var(--border); border-radius: 12px; background: var(--background); }
  .k-seg > button { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 0 6px; border: 0; border-radius: 10px; background: none; color: var(--text-soft); font-size: .9375rem; font-weight: 650; }
  .k-seg > button[aria-pressed="true"] { background: var(--accent); color: var(--ink); }
  .k-seg > button .icon, .k-seg > button .mk-glyph { width: 16px; height: 16px; font-size: 16px; }
  .k-step { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; border-radius: 10px; background: var(--accent); color: var(--ink); font-weight: 750; text-align: center; }
  .k-step button { min-height: 44px; border: 0; background: none; color: var(--ink); font-size: 1.125rem; font-weight: 700; }
  .k-grid { display: grid; grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr)); gap: 6px; }
  .k-nav, .k-switch { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 10px 0 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--background); color: var(--text); font-size: .875rem; font-weight: 650; text-align: left; }
  .k-nav > .icon:first-child, .k-nav > .mk-glyph:first-child, .k-switch > .icon:first-child, .k-switch > .mk-glyph:first-child { width: 18px; height: 18px; font-size: 18px; color: var(--accent); flex: none; }
  .k-nav .k-sub { margin-left: auto; display: flex; gap: 4px; color: var(--muted); font-weight: 500; }
  .k-nav .k-sub .icon, .k-nav .k-sub .mk-glyph { width: 14px; height: 14px; font-size: 14px; }
  .k-nav > .k-caret { width: 14px; height: 14px; margin-left: auto; color: var(--muted); }
  .k-nav .k-sub + .k-caret { margin-left: 0; }
  .k-switch .switch { margin-left: auto; }
  .k-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  .k-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .k-primary, .k-secondary { min-height: 48px; border-radius: 12px; font-size: 1rem; font-weight: 700; }
  .k-primary { border: 0; background: var(--accent); color: var(--ink); }
  .k-secondary { border: 1px solid var(--border); background: var(--surface); color: var(--text); }
  .k-icon { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); }
  .k-icon .icon { width: 18px; height: 18px; }
  .k-text { min-height: 44px; padding: 0 12px; border: 0; border-radius: 12px; background: none; color: var(--muted); font-size: .875rem; font-weight: 650; }
  .k-note { margin: -2px 0 0; color: var(--muted); font-size: .8125rem; }`;
// Builds a k-sheet from a small description language and opens it.
const sheetJs = (spec) => `
  const S = ${JSON.stringify(spec)};
  const el = (tag, cls, ...kids) => { const n = document.createElement(tag); if (cls) n.className = cls; n.append(...kids.filter(k => k != null)); return n; };
  const ico = n => n.startsWith('g:') ? mk.glyph(n.slice(2)) : n === 'x' ? (() => { const s = document.querySelector('#setup .close svg').cloneNode(true); s.setAttribute('class', 'icon'); return s; })() : n === 'sword' ? (() => { const s = mk.svg('caret-right'); s.firstChild.setAttribute('d', iconPaths.sword); return s; })() : n === 'crown' ? icon('crown') : mk.svg(n);
  const seg = (items, cls = '') => el('div', 'k-seg ' + cls, ...items.map(it => it.step ? el('div', 'k-step', el('button', '', '−'), el('span', '', it.step), el('button', '', '+'))
    : (() => { const b = el('button', '', it.icon ? ico(it.icon) : null, it.label ?? ''); b.setAttribute('aria-pressed', String(!!it.on)); return b; })()));
  const sw = (it) => { const l = el('label', 'k-switch', it.icon ? ico(it.icon) : null, el('span', '', it.label), el('input'), el('span', 'switch')); l.querySelector('input').type = 'checkbox'; l.querySelector('input').checked = !!it.on; return l; };
  const nav = (it) => el('button', 'k-nav', it.icon ? ico(it.icon) : null, el('span', '', it.label), it.sub ? el('span', 'k-sub', ...it.sub.map(s => s.startsWith('t:') ? s.slice(2) : ico(s))) : null, (() => { const c = mk.svg('caret-right'); c.classList.add('k-caret'); return c; })());
  const parts = S.rows.map(r => {
    if (r.seg && S.compact && r === S.rows[0]) return el('div', 'k-row k-row-head', el('span', 'k-label', r.label), seg(r.seg, r.multi ? 'multi' : ''), el('button', 'k-text', 'About'), el('button', 'k-icon', ico('x')));
    if (r.seg) return el('div', 'k-row', el('span', 'k-label', r.label), seg(r.seg, r.multi ? 'multi' : ''));
    if (r.grid) { const g = el('div', 'k-grid', ...r.grid.map(it => it.nav ? nav(it) : sw(it))); g.style.setProperty('--cols', r.cols ?? 3); return g; }
    if (r.note) return el('p', 'k-note', r.note);
    if (r.actions) return el('div', 'k-actions', ...r.actions.map(a => el('button', a.primary ? 'k-primary' : 'k-secondary', a.label)));
    if (r.primary) return el('button', 'k-primary', r.primary);
    return null;
  });
  const head = el('div', 'k-head', S.back ? el('button', 'k-icon', ico('caret-left')) : null, el('h2', '', S.title), S.about ? el('button', 'k-text', 'About') : null, el('button', 'k-icon', ico('x')));
  const d = el('dialog', 'k-sheet', el('div', 'sheet', S.compact ? null : head, ...parts));
  document.body.append(d); d.showModal(); document.activeElement?.blur();`;

const setupSpec = (life = [{ label: '20' }, { label: '30' }, { label: '40', on: 1 }, { label: 'Custom' }]) => ({
  title: 'Game setup', about: true,
  rows: [
    { label: 'Players', seg: [2, 3, 4, 5, 6].map(n => ({ label: String(n), on: n === 4 })) },
    { label: 'Starting life', seg: life },
    { grid: [{ nav: 1, icon: 'flag-fill', label: 'Track', sub: ['sword', 'g:infect', 'g:untap'] }, { nav: 1, icon: 'g:pie', label: 'Identity' }, { nav: 1, icon: 'palette', label: 'Colours' }] },
    { grid: [{ nav: 1, icon: 'arrows-clockwise', label: 'Rotate seats' }, { icon: 'sun-dim', label: 'Keep awake', on: 1 }], cols: 2 },
    { actions: [{ label: 'New game' }, { label: 'Done', primary: 1 }] },
  ],
});
const trackSpec = {
  title: 'Track', back: true,
  rows: [
    { grid: [{ icon: 'sword', label: 'Commander', on: 1 }, { icon: 'g:infect', label: 'Poison', on: 1 }, { icon: 'g:energy', label: 'Energy' },
      { icon: 'graduation-cap', label: 'Experience' }, { icon: 'g:rad', label: 'Rad' }, { icon: 'g:tap', label: 'Mana pool', on: 1 }] },
    { label: 'Turns', seg: [{ label: 'Off' }, { label: 'Rounds', icon: 'flag-fill' }, { label: 'Turn by turn', icon: 'g:untap', on: 1 }] },
    { grid: [{ icon: 'eraser', label: 'Empty mana pools when the turn passes', on: 1 }], cols: 1 },
  ],
};
const identitySpec = {
  title: 'Identity', back: true,
  rows: [
    { label: 'Show on tiles', multi: 1, seg: [{ label: 'Indicator', on: 1 }, { label: 'Symbol' }, { label: 'Name', on: 1 }] },
    { label: 'Background', seg: [{ label: 'Symbol', on: 1 }, { label: 'Indicator' }, { label: 'Off' }] },
    { note: 'Nothing shows on a tile until its player picks an identity. Turning every “Show on tiles” option off hides the chip.' },
    { primary: 'Choose identities' },
  ],
};

strips['spec-setup'] = async () => {
  const rows = [];
  const tall = { width: 952, height: 427 };
  const measure = p => p.evaluate(() => { const d = document.querySelector('dialog[open]'); return { h: Math.round(d.getBoundingClientRect().height), scroll: d.scrollHeight > d.clientHeight + 1 }; });
  const sheet = async (size, spec) => {
    const p = await board(size, game(4), { css: sheetCss });
    await p.evaluate(sheetJs(spec)); await p.waitForTimeout(100);
    const m = await measure(p);
    const f = await crop(p, 'dialog[open]', 6);
    await p.close();
    return { f, m };
  };
  const main = await sheet('target', setupSpec());
  const custom = await sheet({ width: 640, height: 360 }, setupSpec([{ label: '20' }, { label: '30' }, { label: '40' }, { step: '25' }]));
  rows.push({ title: 'Game setup', note: 'Two segmented controls, a grid of navigation rows, one switch row and the two buttons. Custom starting life swaps its segment for a − 25 + stepper: no keyboard. Track, Identity and Colours open their own sheets or modes; Rotate seats starts the board mode as today.',
    frames: [caption(fit(main.f, 410), `952 × 427 · ${main.m.h}px${main.m.scroll ? ' · scrolls' : ' · fits'}`), caption(fit(custom.f, 410), `Custom life · 640 × 360 · ${custom.m.h}px${custom.m.scroll ? ' · scrolls' : ' · fits'}`)] });
  const compact = await sheet({ width: 568, height: 320 }, { ...setupSpec(), compact: true });
  rows.push({ title: 'Below 360px tall: the header folds into the Players row', note: 'The title goes; About and ✕ move to the end of the Players row. Same controls, same 44px targets.', frames: [caption(fit(compact.f, 410), `568 × 320 (stress) · ${compact.m.h}px${compact.m.scroll ? ' · scrolls' : ' · fits'}`)] });
  const track = await sheet('target', trackSpec);
  const ident = await sheet('target', identitySpec);
  rows.push({ title: 'Track and Identity sheets (‹ returns to setup)', note: 'Track: a switch row per tracker, the Turns choice and the auto-empty switch (shown only while Mana pool is on and Turns isn’t Off). Identity: what the chip shows (any combination), the background, and the button that starts choosing.',
    frames: [caption(fit(track.f, 410), `Track · ${track.m.h}px`), caption(fit(ident.f, 410), `Identity · ${ident.m.h}px`)] });
  await compose('spec-setup', 'Setup with six control types', 'Segmented choice (single or multiple), stepper, navigation row, switch row, primary and secondary buttons, and icon/text buttons in the header. Every target is at least 44px; the sheets fit 393px-tall phones.', rows);
};

// The identity board mode: every tile previews indicator, symbol and name above its five toggles.
const identityModeJs = `
  [...board.children].forEach((p, i) => {
    const layer = p.querySelector('.mode-layer'); layer.hidden = false;
    const id = game.identities[i];
    const preview = document.createElement('div'); preview.className = 'mk-preview';
    preview.append(id ? mk.chip(id, { indicator: 1, symbol: 1, name: 1 }) : Object.assign(document.createElement('span'), { className: 'chip', textContent: 'No identity' }));
    const toggles = buildIdentity(i); toggles.classList.add('mk-toggles');
    layer.replaceChildren(preview, toggles);
  });
  syncIdentity();`;
const identityModeCss = `
  .mk-preview { display: flex; justify-content: center; margin-bottom: 4px; font-size: clamp(.875rem, calc(4.2 * var(--u)), 1.25rem); pointer-events: none; }
  .mk-toggles { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; max-width: calc(var(--ui) - 12px); }
  .mk-toggles .identity-toggle { --t: clamp(44px, calc(12 * var(--u)), 72 * var(--grow)); width: var(--t); height: var(--t); font-size: 0; }
  .mk-toggles .identity-toggle .pip { --pip-size: calc(var(--t) * .62); }
  @container (max-width: 240px) { .mk-toggles { max-width: 150px; } }`;
// Twelve swatches once identity has its own page.
const coloursCss = `
  .swatches { grid-template-columns: repeat(4, var(--swatch-size)) !important; }
  .colour-picker { --swatch-size: clamp(44px, min((100cqi - 24px) / 4, (100cqb - 40px) / 3), 60 * var(--grow)) !important; }
  [data-colour="copper"] { --panel: oklch(.36 .06 55); --rim: oklch(.52 .08 55); --seat: oklch(.9 .07 60); --button: oklch(.28 .05 55); }
  [data-colour="olive"] { --panel: oklch(.36 .06 120); --rim: oklch(.52 .08 120); --seat: oklch(.91 .08 120); --button: oklch(.28 .05 120); }
  [data-colour="orchid"] { --panel: oklch(.35 .07 330); --rim: oklch(.52 .09 330); --seat: oklch(.9 .07 330); --button: oklch(.27 .05 330); }`;
const coloursJs = `
  document.querySelectorAll('.swatches').forEach(g => { for (const id of ['copper', 'olive', 'orchid']) { const b = document.createElement('button'); b.className = 'swatch'; b.dataset.colour = id; b.dataset.row = 'bottom'; g.append(b); } });
  document.querySelectorAll('.colour-picker').forEach(p => { delete p.dataset.identity; p.querySelectorAll('.identity, .identity-button').forEach(n => n.remove()); });
  document.querySelectorAll('.layer-hint').forEach(h => { h.textContent = 'Your tile colour'; });`;

strips['spec-identity-page'] = async () => {
  const rows = [];
  const frames = [];
  for (const [size, seed, label] of [['target', idSeed, 'Pixel 11 Pro · 952 × 427 · 4 players'], ['small', idSeed6, '6 players · 640 × 360']]) {
    const p = await board(size, seed, { css: identityModeCss });
    await tap(p, '#setup-button'); await tap(p, '#tile-colours'); await p.waitForTimeout(80);
    await p.evaluate(identityModeJs); await p.evaluate('mkUniform()'); await p.waitForTimeout(100);
    frames.push(caption(fit(await shot(p), 410), label));
    await p.close();
  }
  rows.push({ title: 'Choosing identities (setup → Identity → Choose identities)', note: 'A board mode like Colours, ending with ✓. Each tile shows its five mana-symbol toggles and, above them, everything the identity can show: indicator, symbol and name, whatever the tiles are set to display.', frames });
  const f2 = [];
  for (const [size, seed, label] of [['target', idSeed, 'Pixel 11 Pro · 952 × 427 · 4 players'], ['small', idSeed6, '6 players · 640 × 360']]) {
    const p = await board(size, seed, { css: coloursCss });
    await tap(p, '#setup-button'); await tap(p, '#tile-colours'); await p.waitForTimeout(80);
    await p.evaluate(coloursJs); await p.waitForTimeout(100);
    f2.push(caption(fit(await shot(p), 410), label));
    await p.close();
  }
  rows.push({ title: 'Colours on their own: room for twelve swatches', note: 'With identity out of the colours layer, every tile has room for a 4 × 3 grid at 44px or more. The three new hues (Copper, Olive, Orchid here, placeholder values) fill the gaps in the hue circle; palette.mjs generates the real ones.', frames: f2 });
  await compose('spec-identity-page', 'Identity gets its own page; Colours gets twelve swatches', '', rows);
};

// ---- 2. Uniform life size at 3 and 5 players ------------------------------------------------------------------

strips['spec-uniform'] = async () => {
  const label = p => p.evaluate(() => [...document.querySelectorAll('.player')].map((pl, i) => {
    const s = Math.round(parseFloat(getComputedStyle(pl.querySelector('.score')).fontSize));
    const g = Math.round(parseFloat(getComputedStyle(pl.querySelector('.controls button')).fontSize));
    return `P${i + 1} ${s}/${g}`;
  }).join(' · '));
  const tag = `document.querySelectorAll('.player').forEach((pl, i) => { const t = document.createElement('span'); t.className = 'mk-tag'; t.textContent = Math.round(parseFloat(getComputedStyle(pl.querySelector('.score')).fontSize)) + 'px'; pl.querySelector('.player-face').append(t); });`;
  const tagCss = '.mk-tag { position: absolute; top: 34%; left: 50%; transform: translateX(-50%); z-index: 6; padding: 1px 6px; border-radius: 5px; background: #000c; color: #fff; font: 700 11px/1.4 system-ui; }';
  const rows = [];
  for (const [n, size, seedScores] of [[3, 'target', [31, 24, 38]], [5, 'target', [31, 24, 27, 38, 19]], [5, 'tablet', [31, 24, 27, 38, 19]], [4, 'target', [31, 124, 27, 38]]]) {
    const seed = game(n, { scores: seedScores });
    const a = await open(size, seed, { css: perTileCss + tagCss });
    const b = await board(size, seed, { css: tagCss });
    const la = await label(a), lb = await label(b);
    await a.evaluate(tag); await b.evaluate(tag);
    const w = size === 'tablet' ? 330 : 410;
    rows.push({ title: `${n} players · ${size === 'tablet' ? '1366 × 1024' : '952 × 427'}${seedScores.some(s => s > 99) ? ' · one total at 124' : ''}`,
      frames: [caption(fit(await shot(a), w), `Per tile (today’s rule): ${la}`), caption(fit(await shot(b), w), `One size per board: ${lb}`)] });
    await a.close(); await b.close();
  }
  await compose('spec-uniform', 'One size per board', 'Life total / − + glyph sizes in px per tile. Left: each tile sizes its own content from its own width. Right: every tile uses the smallest tile’s size, and a three-digit total shrinks every total together. Style B in both.', rows);
};

// ---- 3. Counters cells: circles vs squares --------------------------------------------------------------------

const counterDefs = `[
  { id: 'poison', icon: () => mk.glyph('infect'), values: [3, 0, 7, 1, 0, 2] },
  { id: 'tax', icon: () => icon('crown'), values: ['+2', '+0', '+4', '+0', '+2', '+0'] },
  { id: 'energy', icon: () => mk.glyph('energy'), values: [5, 2, 0, 8, 1, 0] },
  { id: 'experience', icon: () => mk.svg('graduation-cap-fill'), values: [2, 0, 1, 0, 3, 0] },
  { id: 'rad', icon: () => mk.glyph('rad'), values: [4, 0, 0, 2, 0, 6] }]`;
const cellsJs = `
  const defs = ${counterDefs};
  [...board.children].forEach((player, i) => {
    const layer = player.querySelector('.mode-layer'); if (layer.hidden) return;
    const grid = element('div', 'mk-grid');
    for (const d of defs) { const v = d.values[i]; const c = element('button', 'mk-cell', element('span', 'mk-ico', d.icon()), element('b', '', String(v))); if (v === 0 || v === '+0') c.dataset.zero = ''; grid.append(c); }
    layer.replaceChildren(element('p', 'layer-hint', 'Tap +1 · hold −1'), grid);
  });`;
const cellsCss = shape => `
  .mk-grid { --cell: clamp(44px, min((var(--ui) - 20px) / 3, (var(--ub) - 58px) / 2), 92 * var(--grow)); display: flex; flex-wrap: wrap; justify-content: center; gap: 4px ${shape === 'circle' ? '10px' : '4px'}; width: calc(3 * var(--cell) + 2 * ${shape === 'circle' ? '10px' : '4px'}); }
  .mk-cell { display: grid; place-content: center; justify-items: center; gap: 1px; width: ${shape === 'circle' ? 'var(--cell)' : 'var(--cell)'}; height: var(--cell); padding: 0; border: 0;
    border-radius: ${shape === 'circle' ? '50%' : '12px'}; background: color-mix(in oklab, var(--button) 55%, var(--panel)); color: var(--text);
    font-size: calc(var(--cell) * .3); font-weight: var(--weight-heavy); font-variant-numeric: tabular-nums; letter-spacing: -.03em; line-height: 1; }
  .mk-cell .mk-ico { display: grid; color: var(--seat); font-size: .8em; } .mk-cell .mk-ico .icon { width: 1em; height: 1em; }
  .mk-cell[data-zero] { color: var(--muted); font-weight: var(--weight-semibold); }
  .mk-cell[data-pressed] { background: color-mix(in oklab, var(--seat) 26%, var(--panel)); }
  .layer-hint { margin-bottom: 2px; }
  @container (max-height: 200px) { .mode-layer .layer-hint { display: none; } }`;

strips['spec-counters'] = async () => {
  const rows = [];
  for (const shape of ['circle', 'square']) {
    const frames = [];
    for (const [size, n, label] of [['target', 4, 'Pixel 11 Pro · 952 × 427 · 4 players'], ['small', 6, '6 players · 640 × 360']]) {
      const p = await board(size, game(n, { poison: [3, 0, 7, 1, 0, 2].slice(0, n), casts: [1, 0, 2, 0, 1, 0].slice(0, n) }), { css: cellsCss(shape) });
      await tap(p, '#counters-button'); await p.waitForTimeout(80);
      await p.evaluate(cellsJs); await pressed(p, '.player:nth-child(3) .mk-cell', 2);
      const sz = await p.evaluate(() => { const c = document.querySelector('.mk-cell'); return `${c.offsetWidth}×${c.offsetHeight}`; });
      frames.push(caption(fit(await shot(p), 410), `${label} · cell ${sz} · P3 holding energy`));
      await p.close();
    }
    rows.push({ letter: shape === 'circle' ? 'O' : '□', title: shape === 'circle' ? 'Circles (chosen)' : 'Squares', note: shape === 'circle' ? 'Round like the counters and dice people use at the table, and like the pill’s pressed disc. Every cell is the same size on every tile.' : 'Rounded squares, like the map seats. They read as buttons rather than counters.', frames });
  }
  await compose('spec-counters', 'Counters mode in style B: circles or squares', 'Poison (infect), tax, energy, experience (graduation cap) and rad. Tap +1, hold −1; a press lights the cell.', rows);
};

// ---- 4. Turns: rounds and turn by turn ------------------------------------------------------------------------

const turnCss = `
  .round-button .round { position: relative; display: grid; grid-template-rows: 1fr 1fr; place-items: center; width: calc(var(--setup-button) * .7); height: calc(var(--setup-button) * .7); border-radius: 50%;
    background: var(--surface); box-shadow: inset 0 0 0 1.5px var(--accent); color: var(--text); font-weight: 800; font-size: calc(var(--setup-button) * .29); line-height: 1; font-variant-numeric: tabular-nums; }
  .round-button .round span:first-child { transform: rotate(180deg); }
  .round-button .round::after { content: ''; position: absolute; left: 20%; right: 20%; top: 50%; height: 1px; background: var(--border); }
  .badges.near:has(.mk-turn) { pointer-events: none; }
  .mk-turn { position: relative; pointer-events: auto; gap: .32em; padding: 0 .55em 0 .45em; font-weight: 750; }
  .mk-turn .icon, .mk-turn .mk-glyph { width: 1em; height: 1em; font-size: 1em; }
  .mk-turn::after { content: ''; position: absolute; left: 50%; top: 50%; width: max(100%, 64px); height: 44px; transform: translate(-50%, -50%); border-radius: 22px; }
  .mk-turn.rounds { background: var(--button); color: var(--seat); box-shadow: inset 0 0 0 1.5px var(--seat); }
  .mk-turn.active { background: var(--seat); color: var(--button); }
  .mk-turn.hit::after { outline: 2px dashed #ffffffb0; }
  .player.is-active { background: color-mix(in oklab, var(--panel) 86%, var(--seat)); box-shadow: inset 0 0 0 3px var(--seat); }
  .mk-flag { color: var(--seat); }`;
const turnJs = ({ mode, round = 3, first = 1, active = null, hit = false, icon: ic = 'untap' }) => `
  const pill = document.querySelector('#board-controls');
  const b = document.createElement('button'); b.className = 'pill-button round-button';
  b.append(element('span', 'round', element('span', '', '${round}'), element('span', '', '${round}'))); pill.prepend(b);
  const near = i => board.children[i].querySelector('.badges.near');
  const icon2 = n => n.startsWith('g:') ? mk.glyph(n.slice(2)) : mk.svg(n);
  if (${JSON.stringify(mode)} === 'rounds') {
    const m = element('button', 'chip mk-turn rounds', mk.svg('flag-fill'), '${round}'); if (${hit}) m.classList.add('hit');
    near(${first}).prepend(m); near(${first}).hidden = false; fitBadgeRow(near(${first}));
  } else {
    const f = element('span', 'chip mk-flag', mk.svg('flag-fill')); near(${first}).prepend(f); near(${first}).hidden = false; fitBadgeRow(near(${first}));
    board.children[${active}].classList.add('is-active');
    const t = element('button', 'chip mk-turn active', icon2(${JSON.stringify(ic.startsWith('g:') || ph[ic] ? ic : 'g:' + ic)}), 'Turn ${round}'); if (${hit}) t.classList.add('hit');
    near(${active}).prepend(t); near(${active}).hidden = false; fitBadgeRow(near(${active}));
  }`;

strips['spec-turns'] = async () => {
  const g4 = game(4, { poison: [0, 0, 3, 0], casts: [1, 0, 0, 2] });
  const g6 = game(6, { poison: [0, 0, 3, 0, 0, 1], casts: [1, 0, 0, 2, 0, 0] });
  const rows = [];
  {
    const a = await board('target', g4, { css: turnCss, js: turnJs({ mode: 'turns', active: 3 }) });
    const b = await board('small', g6, { css: turnCss, js: turnJs({ mode: 'turns', active: 5 }) });
    const z = await board('target', g4, { css: turnCss, js: turnJs({ mode: 'turns', active: 3, hit: true }) });
    rows.push({ letter: 'B', title: 'Turn by turn (Turns: Turn by turn)', note: 'The active tile lifts its panel slightly toward its seat colour and gets a 3px seat-colour frame. Its near row leads with the untap symbol and “Turn 3”: the player taps it when their turn ends, and the next player to the left lights up. The flag stays on whoever went first; the pill shows the round.',
      frames: [caption(fit(await shot(a), 410), '952 × 427 · P4’s turn, round 3'), caption(fit(await shot(b), 410), '6 players · P6’s turn'), caption({ ...(await tile(z, 3)), zoom: .64 }, 'P4’s tile: the 44px hit area')] });
    await a.close(); await b.close(); await z.close();
  }
  {
    const a = await board('target', g4, { css: turnCss, js: turnJs({ mode: 'rounds' }) });
    const z = await board('target', g4, { css: turnCss, js: turnJs({ mode: 'rounds', hit: true }) });
    rows.push({ letter: 'A', title: 'Rounds (Turns: Rounds)', note: 'No active tile. The first player’s flag carries the round and is the button: tap as your turn starts.', frames: [caption(fit(await shot(a), 410), '952 × 427 · round 3, P2 went first'), caption({ ...(await tile(z, 1)), zoom: .64 }, 'P2’s tile, upright: the flag’s hit area')] });
    await a.close(); await z.close();
  }
  {
    const frames = [];
    for (const [ic, label] of [['untap', 'Mana untap (chosen)'], ['play-fill', 'Play'], ['caret-double-right', 'Double caret'], ['hourglass-simple-high-fill', 'Hourglass'], ['arrow-right', 'Arrow']]) {
      const p = await board('target', g4, { css: turnCss, js: turnJs({ mode: 'turns', active: 3, icon: ic === 'untap' ? 'g:untap' : ic }) });
      const box = await p.locator('.mk-turn').boundingBox();
      frames.push(caption({ ...(await shot(p, { ...box, pad: 8 })), zoom: 2.4 }, label));
      await p.close();
    }
    rows.push({ title: 'The turn icon', note: 'Every turn starts with the untap step, and the Mana font already has the untap symbol: one glyph that says “your turn” to any Magic player. 2.4×.', frames });
  }
  await compose('spec-turns', 'Turns: Off, Rounds or Turn by turn', 'One setting in the Track sheet. Both modes share the start (“Who goes first?”), the flag and the pill round.', rows);
};

// ---- 5. Mana: add in a mode, a strip at rest only while mana floats --------------------------------------------

const pools = { 0: { W: 2, U: 1 }, 2: { R: 3, C: 1 } };
const manaCss = `
  .mk-pool { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; width: calc(3 * var(--cell) + 12px); --cell: clamp(44px, min((var(--ui) - 24px) / 3, (var(--ub) - 70px) / 2), 92 * var(--grow)); }
  .mk-pool button { display: grid; place-content: center; justify-items: center; gap: 2px; width: var(--cell); height: var(--cell); padding: 0; border: 0; border-radius: 50%;
    background: color-mix(in oklab, var(--button) 55%, var(--panel)); color: var(--text); font-size: calc(var(--cell) * .28); font-weight: var(--weight-heavy); font-variant-numeric: tabular-nums; line-height: 1; }
  .mk-pool .pip { --pip-size: calc(var(--cell) * .44); }
  .mk-pool button[data-zero] { color: var(--muted); font-weight: var(--weight-semibold); }
  .mk-pool button[data-zero] .pip { filter: saturate(.3) brightness(.85); }
  .mk-strip { position: absolute; left: 50%; bottom: calc(6 * var(--grow)); transform: translateX(-50%); z-index: 3; display: flex; align-items: center; gap: 2px; padding: 2px 2px 2px 6px; border-radius: 999px; background: var(--chip-background); }
  .mk-strip button { display: grid; grid-auto-flow: column; place-items: center; gap: 4px; min-width: 44px; height: 44px; padding: 0 6px; border: 0; border-radius: 999px; background: none; color: var(--text); font-size: 17px; font-weight: 750; font-variant-numeric: tabular-nums; }
  .mk-strip .pip { --pip-size: 22px; }
  .mk-strip .mk-clear { color: var(--text-soft); } .mk-strip .mk-clear .icon { width: 18px; height: 18px; }
  .player:has(.mk-strip, .mk-undo) .badges.near { display: none; }
  .mk-undo { position: absolute; left: 50%; bottom: calc(6 * var(--grow)); transform: translateX(-50%); z-index: 3; display: flex; align-items: center; gap: 6px; height: 44px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--chip-background); color: var(--text-soft); font-size: 14px; font-weight: 650; }
  .mk-undo .icon { width: 16px; height: 16px; }
  .mk-pill-dot { position: relative; color: var(--accent); }
  .mk-pill-dot::after { content: ''; position: absolute; right: 9px; top: 11px; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
  .pill-button > .mk-glyph { position: relative; }`;
const manaJs = mode => `
  const pools = ${JSON.stringify(pools)};
  const pill = document.querySelector('#board-controls');
  if (${JSON.stringify(mode)} === 'mode') {
    board.dataset.mode = 'mana'; pill.dataset.mode = 'mana';
    document.querySelectorAll('#damage-button, #counters-button, #dice-button, #setup-button').forEach(b => b.hidden = true);
    document.querySelectorAll('#undo-button, #save-button, #cancel-button').forEach(b => b.hidden = false);
    document.querySelector('#undo-button').disabled = false;
    [...board.children].forEach((p, i) => {
      const layer = p.querySelector('.mode-layer'); layer.hidden = false;
      const grid = element('div', 'mk-pool', ...['W', 'U', 'B', 'R', 'G', 'C'].map(c => { const v = pools[i]?.[c] ?? 0; const b = element('button', '', mk.pip(c), String(v)); if (!v) b.dataset.zero = ''; return b; }));
      layer.replaceChildren(element('p', 'layer-hint', 'Tap +1 · hold −1'), grid);
    });
  } else {
    const b = document.createElement('button'); b.className = 'pill-button mk-pill-dot'; b.append(mk.glyph('tap')); pill.insertBefore(b, document.querySelector('#dice-button'));
    [...board.children].forEach((p, i) => {
      const pool = pools[i]; if (!pool) return;
      if (${JSON.stringify(mode)} === 'undo' && i === 2) { p.querySelector('.player-face').append(element('button', 'mk-undo', mk.svg('arrow-counter-clockwise'), 'Undo clear')); return; }
      const strip = element('div', 'mk-strip', ...Object.entries(pool).map(([c, v]) => element('button', '', mk.pip(c), String(v))), element('button', 'mk-clear', mk.svg('eraser')));
      p.querySelector('.player-face').append(strip);
    });
  }`;

strips['spec-mana'] = async () => {
  const g4 = game(4, { poison: [0, 0, 3, 0], casts: [1, 0, 0, 2] });
  const g6 = game(6, { poison: [0, 0, 3, 0, 0, 1], casts: [1, 0, 0, 2, 0, 0] });
  const rows = [];
  {
    const a = await board('target', g4, { css: manaCss + cellsCss('circle').replace(/\.mk-grid[^}]*}/, ''), js: manaJs('mode') });
    const b = await board('small', g6, { css: manaCss, js: manaJs('mode') });
    rows.push({ letter: '1', title: 'Adding mana: the mana mode', note: 'The pill’s tap symbol opens it. Six circles per tile, W U B R G and colourless, like the counter cells: tap +1, hold −1. Undo, ✓ and ✕ as in counters mode.', frames: [caption(fit(await shot(a), 410), '952 × 427 · P1 adds W W U, P3 R R R C'), caption(fit(await shot(b), 410), '6 players · 640 × 360')] });
    await a.close(); await b.close();
  }
  {
    const a = await board('target', g4, { css: manaCss, js: manaJs('rest') });
    const b = await board('small', g6, { css: manaCss, js: manaJs('rest') });
    const z = await board('target', g4, { css: manaCss, js: manaJs('rest') });
    const s = await z.locator('.player').nth(2).locator('.mk-strip').boundingBox();
    const strip = { ...(await shot(z, { ...s, pad: 8 })), zoom: 2 };
    const u = await board('target', g4, { css: manaCss, js: manaJs('undo') });
    const ub = await u.locator('.mk-undo').boundingBox();
    const undo = { ...(await shot(u, { ...ub, pad: 8 })), zoom: 2 };
    rows.push({ letter: '2', title: 'At rest: a strip only while mana floats', note: 'Only tiles with mana show a strip, in place of their near row, and only the colours they hold. Tap a symbol to spend one; the eraser clears the pool in one tap and leaves “Undo clear” for 5 seconds. The pill’s tap symbol gets a dot while any pool has mana.',
      frames: [caption(fit(await shot(a), 410), '952 × 427 · P1 and P3 have mana'), caption(fit(await shot(b), 410), '6 players · 640 × 360'), caption(strip, 'P3’s strip, 2×'), caption(undo, 'After the eraser, 2×')] });
    await a.close(); await b.close(); await z.close(); await u.close();
  }
  await compose('spec-mana', 'Floating mana: add in a mode, see and spend it on the tile', '', rows);
};

// ---- 6. Experience symbol ---------------------------------------------------------------------------------------

strips['spec-experience'] = async () => {
  const exp = process.env.EXP_SVG && existsSync(process.env.EXP_SVG) ? readFileSync(process.env.EXP_SVG, 'utf8') : null;
  const official = exp ? (() => {
    const d = exp.match(/ d="([^"]+)"/)[1].replace(/\s+/g, ' ');
    const vb = exp.match(/viewBox="([^"]+)"/)[1];
    const tr = exp.match(/<g[^>]*transform="([^"]+)"/)?.[1] ?? '';
    return `<svg class="icon" viewBox="${vb}" style="width:1.3em"><g transform="${tr}"><path d="${d}"/></g></svg>`;
  })() : null;
  const cands = [['official', 'Official (MTGO, via MTG Wiki)'], ['graduation-cap-fill', 'Graduation cap, fill (owner’s pick)'], ['graduation-cap', 'Graduation cap, bold'], ['book-open-fill', 'Open book, fill'], ['book-open', 'Open book, bold'], ['shield-chevron-fill', 'Shield chevron, fill'], ['shield-chevron', 'Shield chevron, bold']];
  await appPage('spec-experience', `
    const official = ${JSON.stringify(official)};
    const cands = ${JSON.stringify(cands)};
    const iconHtml = n => n === 'official' ? (official ?? '<span style="font-size:11px;color:#8f998d">set EXP_SVG to draw it</span>') : '<svg class="icon" viewBox="0 0 256 256"><path d="' + mk.ph[n] + '"/></svg>';
    const chips = n => '<span class="chip"><span class="mk-glyph">' + String.fromCodePoint(mk.G.infect) + '</span>3</span><span class="chip"><span class="mk-glyph">' + String.fromCodePoint(mk.G.energy) + '</span>5</span><span class="chip mk-x">' + iconHtml(n) + '2</span><span class="chip"><span class="mk-glyph">' + String.fromCodePoint(mk.G.rad) + '</span>4</span>';
    ref.innerHTML = '<h1>Experience: candidates next to the official icon</h1><p class="intro">The official experience counter icon (Magic Online) is a shield-like chevron split down the middle, close to an open book seen end-on. Mana has no experience glyph. Shown large and in a badge row between infect, energy and rad, at 2× badge size.</p><table>' +
      cands.map(([n, l]) => '<tr><td style="width:230px">' + l + '</td><td class="big">' + iconHtml(n) + '</td><td><div class="player mk-tilebg" data-colour="violet" data-row="bottom"><div class="badges near mk-row">' + chips(n) + '</div></div></td></tr>').join('') + '</table>';`, `
    .big { font-size: 48px; color: #e8e6da; } .big .icon { width: 1em; height: 1em; fill: currentColor; } .big svg[style] { width: 1.3em !important; }
    .mk-tilebg { position: relative; width: 380px; height: 54px; border-radius: 8px; }
    .mk-row { position: absolute !important; inset: auto 0 10px 0 !important; font-size: 25px !important; display: flex; }
    .chip .mk-glyph { font-size: .95em; } .mk-x svg[style] { width: 1.25em !important; height: .95em; }`);
};

// ---- 7. Badges: near row vs right side ---------------------------------------------------------------------------

strips['spec-badges'] = async () => {
  const seed = game(6, { identities: ['WUB', 'UG', 'WBR', 'UBRG', 'WUBRG', 'R'], poison: [3, 0, 7, 1, 0, 2], casts: [1, 0, 2, 0, 1, 0] });
  const extraJs = `
    const vals = { energy: [5, 2, 0, 8, 1, 3], experience: [2, 0, 1, 0, 3, 1], rad: [4, 0, 0, 2, 0, 6] };
    const ic = { energy: () => mk.glyph('energy'), experience: () => mk.svg('graduation-cap-fill'), rad: () => mk.glyph('rad') };
    const base2 = renderBadges;
    window.renderBadges = function (index) {
      base2(index);
      const near = board.children[index]?.querySelector('.badges.near'); if (!near) return;
      for (const k of ['energy', 'experience', 'rad']) if (vals[k][index] > 0) near.append(element('span', 'chip', ic[k](), String(vals[k][index])));
      near.hidden = near.childElementCount === 0; fitBadgeRow(near);
    };
    [...board.children].forEach((p, i) => renderBadges(i));`;
  const sideCss = split => `
    .badges.near${split ? ':not(.mk-idrow)' : ''} { left: auto; right: 4px; top: 50%; bottom: auto; width: auto; transform: translateY(-50%); flex-direction: column; align-items: flex-end; gap: 3px; }
    .badges.near${split ? ':not(.mk-idrow)' : ''} { font-size: 12.5px !important; }
    .player:has(.badges.near:not([hidden])${split ? ':not(.mk-idrow)' : ''}) .controls .add { margin-inline-end: calc(5 * var(--u) + 34px); }
    ${split ? '.badges.mk-idrow { bottom: calc(8 * var(--grow)); }' : '.badges.near .mk-name { display: none; } .badges.near .chip.mk-id { width: 1.7em; padding: 0; justify-content: center; }'}`;
  const splitJs = `
    [...board.children].forEach((p) => {
      const near = p.querySelector('.badges.near'); const id = near.querySelector('.chip.mk-id'); if (!id) return;
      const row = element('div', 'badges near mk-idrow'); row.append(id); near.after(row);
      near.hidden = near.childElementCount === 0; fitBadgeRow(near); fitBadgeRow(row);
    });`;
  const rows = [];
  const colFit = `const of0 = fitBadgeRow; window.fitBadgeRow = row => { if (getComputedStyle(row).flexDirection === 'column') { row.style.removeProperty('font-size'); return; } of0(row); };`;
  for (const [letter, title, note, css, js] of [
    ['1', 'Near row (chosen)', 'Identity chip (indicator + name) first, then the counters, centred on the player’s own edge. Reads as one line from the seat; never collides with − or +.', '', ''],
    ['2', 'Right side, everything', 'All chips stack on the reader’s right, between the + glyph and the edge. The + moves in by 34px, the name has to go (a column can’t hold “Glint-Eye”), and six chips are taller than a 6-player tile’s middle band.', sideCss(false), ''],
    ['3', 'Right side counters, identity stays on the near edge', 'The counters stack on the right; the identity chip keeps its name on the near edge. Two places to look instead of one.', sideCss(true), splitJs],
  ]) {
    const p6 = await board('small', seed, { css, js: colFit + chipModeJs({ indicator: 1, name: 1 }) + extraJs + js });
    const p4 = await board('target', game(4, { identities: ['WUB', 'UG', 'WBR', 'UBRG'], poison: [3, 0, 7, 1], casts: [1, 0, 2, 0] }), { css, js: colFit + chipModeJs({ indicator: 1, name: 1 }) + extraJs + js });
    rows.push({ letter, title, note, frames: [caption(fit(await shot(p6), 410), '6 players · 640 × 360'), caption(fit(await shot(p4), 410), 'Pixel 11 Pro · 952 × 427 · 4 players')] });
    await p6.close(); await p4.close();
  }
  await compose('spec-badges', 'Badges: the near row or the right side', 'Identity (indicator + name), poison, tax, energy, experience and rad, each shown when set.', rows);
};

// ---- 8. Auto-drop: what gives way when a row runs out of room -----------------------------------------------

// Board-wide drop levels (SPEC §3.2). Every tile uses the same level, so the board stays uniform.
const dropCss = `
  .board[data-drop~="name"] .chip.mk-id .mk-name, .board[data-drop~="name"] .mk-turn .mk-word { display: none; }
  .board[data-drop~="name"] .chip.mk-id { padding: 0 .26em; }
  .board[data-drop~="symbol"] .chip.mk-id .ci ~ .mk-sym { display: none; }
  .board[data-drop~="identity"] .chip.mk-id { display: none; }
  .board[data-drop~="sword"] .badges.far .chip.sword { display: none; }
  .board[data-drop~="wrap"] .badges.near { flex-wrap: wrap; row-gap: 2px; }
  .mk-turn { gap: .32em; padding: 0 .55em 0 .45em; background: var(--seat); color: var(--button); font-weight: 750; }
  .mk-turn .mk-glyph { font-size: 1em; }`;
const dropJs = `
  window.mkDrop = () => {
    const B = board; const on = new Set(); B.dataset.drop = '';
    const add = d => { on.add(d); B.dataset.drop = [...on].join(' '); };
    const rows = sel => [...document.querySelectorAll(sel)].filter(r => !r.hidden && r.childElementCount);
    const need = r => { const kids = [...r.children].filter(c => c.offsetWidth); const gap = parseFloat(getComputedStyle(r).columnGap) || 0; return kids.reduce((s, c) => s + c.offsetWidth, 0) + gap * Math.max(0, kids.length - 1); };
    const ratio = sel => Math.min(1, ...rows(sel).map(r => { r.style.removeProperty('font-size'); return r.clientWidth / need(r); }));
    const plan = (sel, seq) => {
      if (!rows(sel).length) return 'empty';
      const base = parseFloat(getComputedStyle(rows(sel)[0]).fontSize);
      const done = []; if (ratio(sel) >= 1) return 'full size';
      for (const st of seq) {
        if (st.drop) { add(st.drop); done.push('no ' + st.drop); if (ratio(sel) >= 1) return done.join(', '); }
        else if (st.floor) { const f = ratio(sel) * base; if (f >= st.floor) return [...done, 'type ' + (Math.round(f * 10) / 10) + 'px'].join(', '); }
        else if (st.wrap) { add('wrap'); return [...done, 'two lines'].join(', '); }
      }
    };
    const near = plan('.badges.near', [{ drop: 'name' }, { drop: 'symbol' }, { floor: 11 }, { drop: 'identity' }, { floor: 9 }, { wrap: 1 }]);
    const far = plan('.badges.far', [{ drop: 'sword' }, { floor: 11 }, { floor: 9 }, { wrap: 1 }]);
    if (!on.has('wrap')) fitAllBadges(); else document.querySelectorAll('.badges.far').forEach(r => fitBadgeRow(r));
    return { near, far };
  };`;
const dropSeedJs = `
  const vals = { energy: [12, 2, 0, 8, 1, 3], experience: [10, 0, 1, 0, 3, 1], rad: [14, 0, 0, 2, 0, 6] };
  const ic = { energy: () => mk.glyph('energy'), experience: () => mk.svg('graduation-cap-fill'), rad: () => mk.glyph('rad') };
  const base3 = renderBadges;
  window.renderBadges = function (index) {
    base3(index);
    const near = board.children[index]?.querySelector('.badges.near'); if (!near) return;
    for (const k of ['energy', 'experience', 'rad']) if (vals[k][index] > 0) near.append(element('span', 'chip', ic[k](), String(vals[k][index])));
    if (index === 0) { const t = element('span', 'chip mk-turn', mk.glyph('untap'), element('span', 'mk-word', 'Turn '), '3'); near.prepend(t); }
    near.hidden = near.childElementCount === 0;
  };
  [...board.children].forEach((p, i) => renderBadges(i));`;

strips['spec-autodrop'] = async () => {
  const n6 = [0, 1, 2, 3, 4, 5];
  const busy6 = game(6, { identities: ['WURG', 'UBRG', 'WBR', 'WUBG', 'WUBRG', 'R'], poison: [9, 3, 7, 1, 0, 2], casts: [5, 2, 2, 0, 1, 0],
    commanderDamage: n6.map(d => n6.map(a => (d === a ? 0 : [16, 12, 9, 7, 4][(d + a) % 5]))) });
  const busy4 = game(4, { identities: ['WURG', 'UBRG', 'WBR', 'WUBG'], poison: [9, 3, 7, 1], casts: [5, 2, 2, 0],
    commanderDamage: [0, 1, 2, 3].map(d => [0, 1, 2, 3].map(a => (d === a ? 0 : [16, 12, 9][(d + a) % 3]))) });
  const rows = [];
  const results = [];
  for (const [size, seed, label] of [['target', busy6, 'Pixel 11 Pro · 952 × 427 · 6 players'], ['target', busy4, 'Pixel 11 Pro · 952 × 427 · 4 players'],
    [{ width: 640, height: 360 }, busy6, '640 × 360 · 6 players'], [{ width: 568, height: 320 }, busy6, '568 × 320 (stress) · 6 players'], [{ width: 568, height: 320 }, busy4, '568 × 320 (stress) · 4 players']]) {
    const p = await board(size, seed, { css: dropCss, js: dropJs + chipModeJs({ indicator: 1, symbol: 1, name: 1 }) + dropSeedJs + backgroundJs('symbol') });
    const r = await p.evaluate('mkDrop()');
    results.push(`${label}: near ${r.near}; far ${r.far}`);
    rows.push({ title: label, note: `Near row: ${r.near}. Far row: ${r.far}.`, frames: [caption(fit(await shot(p), size === 'target' ? 600 : 520), label), caption({ ...(await tile(p, 0)), zoom: size === 'target' ? .9 : 1.4 }, 'P1, upright')] });
    await p.close();
  }
  // Typical games (default chip, single-digit counts, no turn chip): logged for SPEC §3.2, not drawn.
  const typical = `
    const vals = { energy: [5, 2, 0, 8, 1, 3], experience: [2, 0, 1, 0, 3, 1], rad: [4, 0, 0, 2, 0, 6] };
    const ic = { energy: () => mk.glyph('energy'), experience: () => mk.svg('graduation-cap-fill'), rad: () => mk.glyph('rad') };
    const b4 = renderBadges;
    window.renderBadges = function (index) { b4(index); const near = board.children[index]?.querySelector('.badges.near'); if (!near) return;
      for (const k of ['energy', 'experience', 'rad']) if (vals[k][index] > 0) near.append(element('span', 'chip', ic[k](), String(vals[k][index]))); near.hidden = near.childElementCount === 0; };
    [...board.children].forEach((p, i) => renderBadges(i));`;
  const t6 = game(6, { identities: ['WURG', 'UBRG', 'WBR', 'WUBG', 'WUBRG', 'R'], poison: [3, 1, 7, 1, 0, 2], casts: [1, 2, 2, 0, 1, 0] });
  for (const [size, label, counters] of [['target', '952 × 427', true], [{ width: 640, height: 360 }, '640 × 360', true], [{ width: 568, height: 320 }, '568 × 320', true],
    ['target', '952 × 427 (poison + tax only)', false], [{ width: 640, height: 360 }, '640 × 360 (poison + tax only)', false], [{ width: 568, height: 320 }, '568 × 320 (poison + tax only)', false]]) {
    const p = await board(size, t6, { css: dropCss, js: dropJs + chipModeJs({ indicator: 1, name: 1 }) + (counters ? typical : '') });
    results.push(`typical 6p ${label}: near ${(await p.evaluate('mkDrop()')).near}`);
    await p.close();
  }
  console.log(results.join('\n'));
  await compose('spec-autodrop', 'Auto-drop: the same busy game from the target phone down to the stress size', 'Worst-case settings: chip shows indicator + symbol + name, Turn by turn on (P1 active), every counter on with two-digit counts, commander damage from every opponent. Levels apply board-wide (SPEC §3.2).', rows);
};

// Logs, for each drop step, the smallest-tile size (ui × ub) at which it starts, for a typical and a worst-case 6-player
// game across widths from the target down to the stress size. Not drawn: `node design/polish/spec.mjs spec-sweep`.
strips['spec-sweep'] = async () => {
  const n6 = [0, 1, 2, 3, 4, 5];
  const typicalSeed = game(6, { identities: ['WURG', 'UBRG', 'WBR', 'WUBG', 'WUBRG', 'R'], poison: [3, 1, 7, 1, 0, 2], casts: [1, 2, 2, 0, 1, 0] });
  const worstSeed = game(6, { identities: ['WURG', 'UBRG', 'WBR', 'WUBG', 'WUBRG', 'R'], poison: [9, 3, 7, 1, 0, 2], casts: [5, 2, 2, 0, 1, 0],
    commanderDamage: n6.map(d => n6.map(a => (d === a ? 0 : [16, 12, 9, 7, 4][(d + a) % 5]))) });
  const single = dropSeedJs.replace('[12, 2, 0, 8, 1, 3]', '[5, 2, 0, 8, 1, 3]').replace('[10, 0, 1, 0, 3, 1]', '[2, 0, 1, 0, 3, 1]').replace('[14, 0, 0, 2, 0, 6]', '[4, 0, 0, 2, 0, 6]').replace(/if \(index === 0\)[^;]*;[^}]*}/, '');
  for (const [name, seed, js, show] of [['typical (indicator + name, single digits)', typicalSeed, single, { indicator: 1, name: 1 }], ['worst (all three, two digits, turn chip)', worstSeed, dropSeedJs, { indicator: 1, symbol: 1, name: 1 }]]) {
    console.log('==', name);
    for (const w of [952, 900, 852, 800, 760, 720, 680, 640, 600, 568]) {
      const h = Math.round(w * (w >= 640 ? 427 / 952 : 320 / 568));
      const p = await board({ width: w, height: Math.max(h, 320) }, seed, { css: dropCss, js: dropJs + chipModeJs(show) + js });
      const r = await p.evaluate('mkDrop()');
      const u = await p.evaluate(() => getComputedStyle(board).getPropertyValue('--ui') + ' × ' + getComputedStyle(board).getPropertyValue('--ub'));
      console.log(`${w}×${Math.max(h, 320)} ui×ub ${u}: near ${r.near}; far ${r.far}`);
      await p.close();
    }
  }
};

for (const [name, run] of Object.entries(strips)) {
  if (only.length && !only.includes(name)) continue;
  await run();
}
await close();
