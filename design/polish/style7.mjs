// Control styling round (STYLE.md; renders/style7-*.png): three style directions and four chrome palettes, drawn on
// the current app (web/index.html) and the full-screen settings page (layout B, the owner's pick). Nothing in web/
// changes. Run from the repo root:  node design/polish/style7.mjs [strip ...]
import { launch, close, open, game, shot, compose } from './lib.mjs';
import { pageJs, pageCss } from './settings-lib.mjs';
import { palettes, paletteCss } from './palettes7.mjs';

const only = process.argv.slice(2);
await launch();
const caption = (f, text) => ({ ...f, caption: text });
const fit = (f, show) => ({ ...f, show });
const T = { width: 952, height: 427 };
const S = { width: 568, height: 320 };

const seed = game(4, {
  scores: [31, 24, 27, 38],
  counters: { commander: true, poison: true, energy: true, experience: false, rad: false },
  poison: [0, 0, 3, 0], casts: [1, 0, 0, 2], energy: [2, 0, 0, 5],
  identities: ['WUB', 'UG', 'WBR', 'BRG'],
  commanderDamage: [[0, 4, 0, 0], [0, 0, 0, 9], [6, 0, 0, 0], [0, 0, 2, 0]],
  manaPool: true, autoEmpty: true, turns: 'turns', turn: { first: 0, active: 1, round: 2 }, identity: { show: { indicator: true, symbol: false, name: true }, background: 'symbol' },
});

// ---- The notched sliders (shared structure; each direction styles them) ---------------------------------------
const sliderBase = `
  .k-row { grid-template-columns: 7.5rem minmax(0, 1fr) auto; grid-template-areas: 'label slider value'; }
  .k-row > .setting-label { grid-area: label; } .k-row > .k-slider { grid-area: slider; } .k-row > .k-val { grid-area: value; }
  .fs-columns .fs-sec .k-row, .fs .k-row:has(> .k-val) { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'label value' 'slider slider'; }
  .k-slider { position: relative; min-height: 70px; margin: 0 22px; }
  .k-stops { position: absolute; inset: 0 0 auto 0; height: 44px; }
  .k-stop { position: absolute; top: 0; width: 44px; height: 44px; padding: 0; transform: translateX(-50%); border: 0; background: none; color: var(--text-soft); font-size: .9375rem; font-weight: 650; font-variant-numeric: tabular-nums; }
  .k-stop[aria-pressed="true"] { color: var(--text); font-weight: 800; }
  .k-track { position: absolute; left: 0; right: 0; top: 54px; height: var(--track-h, 8px); transform: translateY(-50%); border-radius: 999px; background: var(--raised); }
  .k-fill { position: absolute; left: 0; top: 0; bottom: 0; width: var(--p); border-radius: inherit; background: var(--accent); }
  .k-tick { position: absolute; top: 50%; width: 4px; height: 4px; transform: translate(-50%, -50%); border-radius: 50%; background: var(--muted); }
  .k-tick.minor { width: 2px; height: 2px; opacity: .7; }
  .k-fill ~ .k-tick { z-index: 1; }
  .k-thumb { position: absolute; top: 50%; z-index: 2; transform: translate(-50%, -50%); }
  .k-value { display: inline-flex; align-items: center; gap: 6px; min-width: 76px; min-height: 44px; padding: 0 10px 0 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--background); color: var(--text); font-size: 1.125rem; font-weight: 800; font-variant-numeric: tabular-nums; }
  .k-value .k-edit { display: grid; color: var(--muted); } .k-value .k-edit .icon { width: 14px; height: 14px; }
  .k-value.editing { padding: 0 4px 0 0; border: 2px solid var(--accent); }
  .k-value.editing input { width: 64px; min-height: 40px; padding: 0 10px; border: 0; background: none; color: var(--text); font: inherit; caret-color: var(--accent); }
  .k-commit { display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 8px; background: var(--accent); color: var(--ink); }
  .k-commit .icon { width: 18px; height: 18px; }
  .mk-keyboard { position: fixed; left: 0; right: 0; bottom: 0; height: 46%; z-index: 9; display: grid; place-items: center; background: #2a2c30; color: #9aa0a8; font: 600 14px/1.3 system-ui; border-top: 1px solid #444; }`;

// ---- Three directions ------------------------------------------------------------------------------------------
const directions = {
  A: {
    title: 'Tonal (Material 3 Expressive)',
    note: 'Filled tonal containers instead of outlines: controls are a step lighter than their card, so groups read by fill, not by strokes. Buttons and the selected segment are full capsules; segments are a connected group whose selected item rounds fully. Pressed adds a 10% state layer. The slider has a thick track and a bar handle. Motion: 200ms emphasised easing, corners morph on press.',
    css: `
      .fs-head { border-bottom: 0; background: var(--surface); }
      .fs-sec { border: 0; border-radius: 24px; background: var(--surface); }
      .segmented { gap: 2px; padding: 0; border: 0; background: none; }
      .segmented > button { border-radius: 8px; background: var(--raised); transition: border-radius .2s cubic-bezier(.2,0,0,1), background .2s; }
      .segmented > button:first-of-type { border-radius: 22px 8px 8px 22px; } .segmented > button:last-of-type { border-radius: 8px 22px 22px 8px; }
      .segmented > button[aria-pressed="true"] { border-radius: 22px; }
      .switch-row, .nav-row, .fs-action { border: 0; border-radius: 16px; background: var(--raised); }
      .switch { width: 36px; height: 20px; border: 2px solid var(--control-border); background: transparent; }
      .switch::after { top: 2px; left: 2px; width: 12px; height: 12px; background: var(--control-border); }
      input:checked + .switch { border-color: var(--accent); background: var(--accent); }
      input:checked + .switch::after { width: 14px; height: 14px; top: 1px; transform: translateX(16px); background: var(--ink); }
      .fs-done, .primary { border-radius: 999px; }
      .secondary, .fs-newgame { border: 0; border-radius: 999px; background: var(--raised); }
      .close { border: 0; border-radius: 999px; background: var(--raised); }
      .board-controls::before { border: 0; background: var(--raised); box-shadow: 0 1px 3px #0009, 0 6px 18px #0007; }
      .pill-button.mock-press::before { background: color-mix(in oklab, var(--text) 12%, var(--raised)); }
      .map-cell { border-radius: 16px; }
      .swatch { border-radius: 16px; }
      dialog { border: 0; border-radius: 28px; background: var(--surface); }
      .dice-picker button { border: 0; border-radius: 999px; background: var(--raised); }
      .dice-picker button[aria-pressed="true"] { background: var(--accent); }
      .k-value { border: 0; background: var(--raised); border-radius: 999px; }
      .k-track { --track-h: 16px; }
      .k-tick { background: var(--ink); opacity: .55; } .k-fill ~ .k-tick { background: var(--muted); }
      .k-thumb { width: 4px; height: 44px; border-radius: 2px; background: var(--accent); box-shadow: 0 0 0 4px var(--surface); }
      .k-stop[aria-pressed="true"] { color: var(--accent); }`,
  },
  B: {
    title: 'Glass chrome, solid content (iOS 26 Liquid Glass)',
    note: 'Glass only for what floats over the board: the pill and the settings header, as Apple’s guidance asks (never in the content layer). Content uses grouped lists: rows share a card and are split by hairlines, switches line up on the right edge. Segments are a single track with a raised light thumb; the accent is kept for Done and switches that are on. Pressed scales to 96%. Motion: springy, 250ms.',
    css: `
      .fs { grid-template-rows: minmax(0, 1fr); }
      .fs-head { position: absolute; z-index: 5; top: 8px; left: 8px; right: 8px; border: 1px solid #ffffff22; border-radius: 22px;
        background: color-mix(in oklab, var(--surface) 62%, transparent); backdrop-filter: blur(22px) saturate(1.5); box-shadow: inset 0 1px 0 #ffffff1f, 0 8px 24px #0008; }
      .fs-body { padding-top: 68px; }
      .fs-sec { border: 0; border-radius: 20px; background: var(--surface); }
      .fs-switches, .fs-actions { gap: 0 18px; }
      .switch-row, .nav-row, .fs-action { border: 0; border-bottom: 1px solid var(--border); border-radius: 0; background: none; padding-inline: 4px; }
      .segmented { padding: 2px; border: 0; border-radius: 12px; background: var(--raised); }
      .segmented > button { border-radius: 10px; }
      .segmented > button[aria-pressed="true"] { background: color-mix(in oklab, var(--text) 26%, var(--raised)); color: var(--text); box-shadow: 0 1px 4px #0007; }
      .switch { width: 40px; height: 24px; border: 0; background: var(--switch-off); }
      .switch::after { top: 2px; left: 2px; width: 20px; height: 20px; background: #f4f4f2; box-shadow: 0 1px 3px #0008; }
      input:checked + .switch { background: var(--accent); } input:checked + .switch::after { transform: translateX(16px); background: #fff; }
      .fs-done, .primary { border-radius: 999px; }
      .secondary, .fs-newgame { border: 0; border-radius: 999px; background: var(--raised); }
      .close { border: 0; border-radius: 999px; background: #ffffff14; }
      .board-controls::before { border: 1px solid #ffffff30; background: color-mix(in oklab, var(--surface) 50%, transparent); backdrop-filter: blur(16px) saturate(1.6); box-shadow: inset 0 1px 0 #ffffff26, 0 8px 22px #0009; }
      .pill-button.mock-press { transform: scale(.94); } .pill-button.mock-press::before { background: #ffffff1c; }
      .map-cell { border-radius: 14px; } .swatch { border-radius: 14px; }
      dialog { border: 1px solid #ffffff1c; border-radius: 30px; background: color-mix(in oklab, var(--surface) 88%, transparent); backdrop-filter: blur(24px); }
      .dice-picker { padding: 2px; border-radius: 12px; background: var(--raised); gap: 2px; } .dice-picker button { border: 0; background: none; border-radius: 10px; }
      .dice-picker button[aria-pressed="true"] { background: color-mix(in oklab, var(--text) 26%, var(--raised)); color: var(--text); }
      .k-value { border: 0; background: var(--raised); border-radius: 12px; }
      .k-track { --track-h: 4px; } .k-tick { width: 2px; height: 10px; border-radius: 1px; background: var(--muted); }
      .k-thumb { width: 28px; height: 28px; border-radius: 50%; background: #f6f6f4; box-shadow: 0 2px 6px #000a, 0 0 0 .5px #0004; }`,
  },
  C: {
    title: 'Flat, high contrast (glanceable)',
    note: 'No elevation and no tonal fills: every control boundary is a 2px outline at 3:1 or better against its surface (WCAG 1.4.11), and selected is a solid accent fill with bold text. Pressed inverts (light fill, dark text). Corners are a calm 10px everywhere. Switches show a tick on the thumb when on, so state never rests on colour alone. Motion: colour only, 100ms; nothing moves.',
    css: `
      .fs-head { border-bottom: 2px solid var(--border); }
      .fs-sec { border: 0; border-top: 1px solid var(--border); border-radius: 0; background: none; padding-inline: 4px; }
      .segmented { gap: 0; padding: 0; border: 2px solid var(--control-border); border-radius: 10px; overflow: hidden; background: none; }
      .segmented > button { border-radius: 0; } .segmented > button + button { border-inline-start: 1px solid var(--border); }
      .segmented > button[aria-pressed="true"] { background: var(--accent); color: var(--ink); font-weight: 800; }
      .switch-row, .nav-row, .fs-action { border: 2px solid var(--control-border); border-radius: 10px; background: none; }
      .switch { width: 36px; height: 20px; border: 2px solid var(--control-border); background: none; }
      .switch::after { top: 2px; left: 2px; width: 12px; height: 12px; background: var(--control-border); }
      input:checked + .switch { border-color: var(--accent); background: var(--accent); }
      input:checked + .switch::after { transform: translateX(16px); background: var(--ink) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 6.3l2.2 2.2L9.5 3.7' stroke='%23def09a' stroke-width='1.8' fill='none'/%3E%3C/svg%3E") center/10px no-repeat; }
      .fs-done, .primary { border-radius: 10px; }
      .secondary, .fs-newgame { border: 2px solid var(--control-border); border-radius: 10px; background: none; }
      .close { border: 2px solid var(--control-border); border-radius: 10px; background: none; }
      .board-controls::before { border: 2px solid var(--control-border); background: var(--background); box-shadow: none; }
      .pill-button.mock-press::before { background: var(--text); } .pill-button.mock-press { color: var(--background); }
      .map-cell { border-radius: 10px; } .swatch { border-radius: 10px; }
      dialog { border: 2px solid var(--control-border); border-radius: 14px; box-shadow: none; }
      .dice-picker button { border: 2px solid var(--control-border); border-radius: 10px; background: none; }
      .dice-picker button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); }
      .k-value { border: 2px solid var(--control-border); border-radius: 10px; background: none; }
      .k-track { --track-h: 12px; border: 2px solid var(--control-border); background: none; border-radius: 6px; }
      .k-fill { border-radius: 3px 0 0 3px; }
      .k-tick { width: 2px; height: 12px; border-radius: 0; background: var(--control-border); }
      .k-thumb { width: 22px; height: 32px; border: 2px solid var(--text); border-radius: 6px; background: var(--background); }`,
  },
};
const recommendedPalette = { A: 'graphite', B: 'midnight', C: 'graphite' };

// Opens the app with a palette and a direction; returns the page.
async function app(size, dir, pal, extraCss = '') {
  return open(size, seed, { css: paletteCss(pal) + pageCss + sliderBase + directions[dir].css + extraCss });
}
async function settings(size, dir, pal, opts = {}) {
  const p = await app(size, dir, pal);
  await p.evaluate(pageJs('columns', { picked: true, sliders: true, ...opts }));
  if (opts.keyboard) await p.evaluate(() => { const k = document.createElement('div'); k.className = 'mk-keyboard'; k.textContent = 'System number pad (Gboard / iOS): about 46% of a 427px-tall screen'; document.querySelector('dialog.fs').append(k); const b = document.querySelector('.fs-body'); b.style.paddingBottom = '46vh'; const f = document.querySelector('.k-value.editing'); b.scrollTop = f.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop - 60; document.querySelector('.k-value input')?.focus(); });
  await p.waitForTimeout(150);
  return p;
}
async function boardAtRest(size, dir, pal) {
  const p = await app(size, dir, pal);
  await p.evaluate(() => {
    document.querySelector('.player:nth-child(3) .add')?.setAttribute('data-pressed', '');
    document.querySelector('#dice-button')?.classList.add('mock-press');
  });
  await p.waitForTimeout(120);
  return p;
}
async function snap(p) { const f = await shot(p); await p.close(); return f; }

const strips = {};
for (const [dir, d] of Object.entries(directions)) {
  strips[`style7-${dir.toLowerCase()}`] = async () => {
    const pal = recommendedPalette[dir];
    const modes = [];
    for (const [label, js] of [['Counters mode', "setBoardMode('counters')"], ['Commander damage map', "setBoardMode('damage')"], ['Choosing identities', "setBoardMode('identity')"], ['Dice', "document.querySelector('#dice-button').click()"]]) {
      const p = await app(T, dir, pal);
      await p.evaluate(js); await p.waitForTimeout(200);
      modes.push(caption(fit(await snap(p), 270), label));
    }
    const rows = [
      { title: 'Settings (layout B, Keep awake in Game, notched sliders)', frames: [caption(fit(await snap(await settings(T, dir, pal)), 520), '952 × 427'), caption(fit(await snap(await settings(S, dir, pal)), 310), '568 × 320')] },
      { title: 'The board at rest (P3 holding +, dice pressed)', frames: [caption(fit(await snap(await boardAtRest(T, dir, pal)), 520), '952 × 427'), caption(fit(await snap(await boardAtRest(S, dir, pal)), 310), '568 × 320')] },
      { title: 'The other controls at 952 × 427', frames: modes },
    ];
    await compose(`style7-${dir.toLowerCase()}`, `${dir} · ${d.title}`, `${d.note} Palette: ${palettes[pal].name}.`, rows);
  };
}

strips['style7-palettes'] = async () => {
  const rows = [];
  for (const [key, p] of Object.entries(palettes)) {
    rows.push({ title: p.name, frames: [caption(fit(await snap(await settings(T, 'A', key)), 420), 'Settings · 952 × 427 · direction A'), caption(fit(await snap(await boardAtRest(T, 'A', key)), 420), 'Board · 952 × 427')] });
  }
  await compose('style7-palettes', 'Chrome palettes', 'Surfaces, text and accent change; the twelve tile palettes don’t. All four pass the contrast checks in STYLE.md §5.', rows);
};

strips['style7-sliders'] = async () => {
  const cropRow = async (size, dir, opts, sel = '.fs-sec:first-of-type') => {
    const p = await settings(size, dir, recommendedPalette[dir], opts);
    const box = await p.locator(sel).first().boundingBox();
    const f = await shot(p, { ...box, pad: 6 });
    await p.close();
    return f;
  };
  const rows = [];
  for (const dir of ['A', 'B', 'C']) {
    rows.push({ letter: dir, title: directions[dir].title, frames: [caption(fit(await cropRow(T, dir, {}), 520), 'Game section · 952 × 427'), caption(fit(await cropRow(S, dir, {}), 300), '568 × 320')] });
  }
  const seg = await (async () => {
    const p = await app(T, 'A', 'graphite');
    await p.evaluate(pageJs('columns', { picked: true, sliders: false }));
    await p.waitForTimeout(120);
    const box = await p.locator('.fs-sec').first().boundingBox();
    const f = await shot(p, { ...box, pad: 6 }); await p.close(); return f;
  })();
  rows.push({ title: 'For comparison: segmented choices (direction A)', frames: [caption(fit(seg, 520), 'Game section · 952 × 427')] });
  const edit = await snap(await settings(T, 'A', 'graphite', { lifeEdit: true, keyboard: true }));
  rows.push({ title: 'Tap the number to type one: the inline editor', note: 'The value turns into a field with a numeric keyboard and a ✓; Enter, ✓, tapping elsewhere or closing settings commits; an empty or invalid entry reverts. The keyboard covers about half the landscape screen, so the page scrolls the field into view.', frames: [caption(fit(edit, 520), 'Editing starting life · 952 × 427 (keyboard drawn as a placeholder)')] });
  await compose('style7-sliders', 'Players and starting life as notched sliders', 'Every labelled stop is a 44px tap target, so the slider works by tap as well as by drag (WCAG 2.5.7). Labels sit above the track so a finger never covers them.', rows);
};

for (const [name, run] of Object.entries(strips)) {
  if (only.length && !only.includes(name)) continue;
  await run();
}
await close();
