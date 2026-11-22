// Shared by settings.mjs and style7.mjs: the full-screen settings page, built from clones of the app's own controls.
import { game } from './lib.mjs';
import ph from './icons.mjs';

export const seed = game(4, {
  counters: { commander: true, poison: true, energy: false, experience: false, rad: false },
  manaPool: true, autoEmpty: true, turns: 'turns', identity: { show: { indicator: true, symbol: false, name: true }, background: 'symbol' },
});

// The page. layout: 'list' (A), 'columns' (B) or 'rail' (C). pending: players changed, so a new game is waiting.
export const pageJs = (layout, { pending = false, scrollTo = null, picked = false, sliders = false, lifeEdit = false } = {}) => `
  const PH = ${JSON.stringify(ph)};
  const svg = n => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'icon'); s.setAttribute('viewBox', '0 0 256 256'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', PH[n]); s.append(p); return s; };
  const mana = g => { const s = document.createElement('span'); s.className = 'icon mana-icon'; s.dataset.glyph = g; return s; };
  const el = (tag, cls, ...kids) => { const n = document.createElement(tag); if (cls) n.className = cls; n.append(...kids.filter(k => k != null)); return n; };
  const clone = sel => { const n = document.querySelector(sel).cloneNode(true); n.removeAttribute('id'); n.querySelectorAll('[id]').forEach(x => x.removeAttribute('id')); n.hidden = false; return n; };
  const press = (seg, test) => [...seg.querySelectorAll(':scope > button')].forEach(b => b.setAttribute('aria-pressed', String(test(b))));
  // Board actions: they close settings and start a board mode, so they end in an "out to the board" arrow.
  const action = (icon, label, note) => { const b = el('button', 'nav-row fs-action', icon, el('span', 'nav-label', label), note ? el('span', 'fs-action-note', note) : null, svg('arrow-square-up-right')); b.type = 'button'; return b; };
  const section = (id, icon, title, ...rows) => el('section', 'fs-sec', el('h3', '', icon, title), ...rows);

  // Game
  const players = clone('#players-row'); press(players.querySelector('.segmented'), b => Number(b.value) === ${pending ? 6 : 4});
  const life = clone('#life-presets').closest ? clone('.setting-row:has(#life-presets)') : null;
  press(life.querySelector('.segmented'), b => b.dataset.life === '40');
  const newGame = el('button', 'secondary fs-newgame', 'New game');
  // The owner's notched sliders (STYLE.md §4): every stop is a labelled 44px target, so a tap works as well as a drag.
  const slider = (label, min, max, value, stops, opts = {}) => {
    const pos = v => ((v - min) / (max - min) * 100) + '%';
    const track = el('div', 'k-track', el('div', 'k-fill'), ...(opts.minor ?? []).map(v => { const t = el('span', 'k-tick minor'); t.style.left = pos(v); return t; }),
      ...stops.map(v => { const t = el('span', 'k-tick'); t.style.left = pos(v); if (v === value) t.dataset.on = ''; return t; }), (() => { const t = el('span', 'k-thumb'); t.style.left = pos(value); return t; })());
    track.style.setProperty('--p', pos(value));
    const labels = el('div', 'k-stops', ...stops.map(v => { const b = el('button', 'k-stop', String(v)); b.type = 'button'; b.style.left = pos(v); b.setAttribute('aria-pressed', String(v === value)); return b; }));
    const s = el('div', 'k-slider', track, labels); s.setAttribute('role', 'slider');
    const row = el('div', 'setting-row k-row', el('span', 'setting-label', label), s);
    if (opts.value) { opts.value.classList.add('k-val'); row.append(opts.value); }
    return row;
  };
  const lifeValue = ${lifeEdit}
    ? el('div', 'k-value editing', Object.assign(document.createElement('input'), { value: '25', inputMode: 'numeric' }), el('button', 'k-commit', svg('check')))
    : el('button', 'k-value', '40', el('span', 'k-edit', svg('pencil-simple')));
  const playersS = slider('Players', 2, 6, ${pending ? 6 : 4}, [2, 3, 4, 5, 6]);
  const lifeS = slider('Starting life', 10, 60, ${lifeEdit ? 25 : 40}, [20, 30, 40], { minor: [10, 15, 25, 35, 45, 50, 55, 60], value: lifeValue });
  const pendingNote = ${pending} ? el('p', 'fs-pending', svg('play'), 'Starts a new game with 6 players at 40 life when you leave settings.') : null;
  const awakeG = ${picked} ? (() => { const a = clone('.switch-row:has(#keep-awake)'); a.classList.add('compact-switch'); a.querySelector('input').checked = true; return a; })() : null;
  const gameFoot = el('div', 'fs-gamefoot', ${pending} ? pendingNote : newGame, awakeG);
  const game = section('game', svg('users-three'), 'Game', ${sliders} ? playersS : players, ${sliders} ? lifeS : life, gameFoot);

  // Track
  const trackers = clone('.tracker-grid'); trackers.className = 'fs-switches';
  trackers.querySelectorAll('.switch-row').forEach((r, i) => { r.classList.add('compact-switch'); r.querySelector('input').checked = [true, true, false, false, false, true][i]; });
  const turns = clone('.setting-row:has(#turn-choices)'); press(turns.querySelector('.segmented'), b => b.dataset.turns === 'turns');
  const autoEmpty = clone('#auto-empty-row'); autoEmpty.classList.add('compact-switch'); autoEmpty.querySelector('input').checked = true;
  const track = section('track', svg('flag-fill'), 'Track', trackers, turns, autoEmpty);

  // Identity
  const show = clone('.setting-row:has(#identity-show)');
  show.querySelectorAll('input').forEach(i => { i.checked = i.dataset.show !== 'symbol'; });
  const bg = clone('.setting-row:has(#identity-background)'); press(bg.querySelector('.segmented'), b => b.dataset.background === 'symbol');
  const identity = section('identity', mana('pie'), 'Identity', show, bg, el('div', 'fs-actions', action(mana('pie'), 'Choose identities')));

  // Table
  const colours = action(svg('palette'), 'Colours');
  const rotate = action(svg('arrows-clockwise'), 'Rotate seats');
  const awake = clone('.switch-row:has(#keep-awake)'); awake.classList.add('compact-switch'); awake.querySelector('input').checked = true;
  const table = section('table', svg('squares-four'), 'Table', el('div', 'fs-actions', colours, rotate, ${picked} ? null : awake));

  // About
  const about = section('about', svg('info'), 'About', clone('.privacy-text'));

  const head = el('header', 'fs-head',
    el('button', 'close fs-x', svg('x')),
    el('h2', '', 'Settings'),
    el('button', 'close fs-flip', svg('device-rotate')),
    el('button', 'fs-done', ${pending} ? 'Start new game' : 'Done'));
  const content = el('div', 'fs-content');
  if (${JSON.stringify(layout)} === 'columns') {
    content.append(el('div', 'fs-col', game, table), el('div', 'fs-col', track, identity), about);
  } else content.append(game, track, identity, table, about);
  const body = el('div', 'fs-body');
  if (${JSON.stringify(layout)} === 'rail') {
    const rail = el('nav', 'fs-rail', ...[['users-three', 'Game'], ['flag-fill', 'Track'], ['pie', 'Identity'], ['squares-four', 'Table'], ['info', 'About']].map(([i, t], k) => {
      const b = el('button', 'fs-rail-item', i === 'pie' ? mana('pie') : svg(i), el('span', '', t)); if (k === 0) b.setAttribute('aria-current', 'true'); return b; }));
    body.append(rail, content);
  } else body.append(content);
  const d = el('dialog', 'fs fs-' + ${JSON.stringify(layout)}, head, body);
  document.body.append(d); d.showModal(); document.activeElement?.blur();
  const scroller = ${JSON.stringify(layout)} === 'rail' ? content : body;
  if (${JSON.stringify(scrollTo)}) { const t = d.querySelector('.fs-sec:nth-of-type(1)'); scroller.scrollTop = scroller.scrollHeight; }
  window.mkFull = () => scroller.scrollHeight + d.querySelector('.fs-head').offsetHeight + 64;`;

export const pageCss = `
  .fs { position: fixed; inset: 0; width: 100vw; height: 100dvh; max-width: none; max-height: none; margin: 0; padding:
    env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    border: 0; border-radius: 0; background: var(--background); box-shadow: none; display: grid; grid-template-rows: auto minmax(0, 1fr); }
  .fs[open] { display: grid; }
  .fs-head { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--surface); }
  .fs-head h2 { flex: 1; font-size: 1.25rem; letter-spacing: -.02em; }
  .fs-head .close { border-radius: 12px; }
  .fs-head .icon { width: 18px; height: 18px; }
  .fs-done { min-height: 44px; padding: 0 20px; border: 0; border-radius: 12px; background: var(--accent); color: var(--ink); font-size: 1rem; font-weight: 700; }
  .fs-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
  .fs-content { display: grid; gap: 12px; max-width: 760px; margin: 0 auto; padding: 12px 16px 24px; align-content: start; }
  .fs-sec { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); }
  .fs-sec > h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 2px; color: var(--muted); font-size: .8125rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
  .fs-sec > h3 > :is(.icon, .mana-icon) { width: 16px; height: 16px; font-size: 16px; color: var(--accent); }
  .fs-switches { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 10rem), 1fr)); gap: 6px; }
  .fs-actions { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 13rem), 1fr)); gap: 6px; }
  .fs-action .fs-action-note { margin-inline-start: auto; color: var(--muted); font-size: var(--type-small); font-weight: 500; white-space: nowrap; }
  .fs-action > .icon:last-child { flex: none; width: 15px; height: 15px; color: var(--muted); }
  .fs-action .fs-action-note + .icon { margin-inline-start: 0; }
  .fs-action:not(:has(.fs-action-note)) > .icon:last-child { margin-inline-start: auto; }
  .fs-newgame { min-height: 48px; border-radius: 12px; font-size: 1rem; justify-self: start; padding: 0 24px; }
  .fs-gamefoot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .fs-gamefoot > .compact-switch { flex: 1 1 12rem; max-width: 16rem; margin-inline-start: auto; }
  .fs-gamefoot > .fs-pending { flex: 1 1 100%; }
  .fs-pending { display: flex; align-items: center; gap: 8px; margin: 0; padding: 10px 12px; border-radius: 12px; background: color-mix(in oklab, var(--accent) 14%, var(--background)); color: var(--text); font-size: var(--type-label); }
  .fs-pending .icon { flex: none; width: 16px; height: 16px; color: var(--accent); }
  .fs .privacy-text { max-width: none; font-size: var(--type-small); }
  .fs .setting-row:has(> .compact-switches) .compact-switches { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  /* B: two columns of sections */
  .fs-columns .fs-content { max-width: 1100px; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
  .fs-columns .fs-col { display: grid; gap: 12px; }
  .fs-columns .fs-content > .fs-sec:last-child { grid-column: 1 / -1; }
  .fs-columns .fs-sec .setting-row { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .fs-columns .fs-switches { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  /* C: an index rail beside a scrolling content column */
  .fs-rail-layout, .fs-rail .fs-body { }
  .fs.fs-rail .fs-body { display: grid; grid-template-columns: 188px minmax(0, 1fr); overflow: hidden; }
  .fs-rail { display: grid; align-content: start; gap: 4px; padding: 12px 8px 12px 16px; border-right: 1px solid var(--border); overflow-y: auto; }
  .fs-rail-item { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 12px; border: 0; border-radius: 12px; background: none; color: var(--text-soft); font-size: var(--type-label); font-weight: 650; text-align: start; }
  .fs-rail-item > :is(.icon, .mana-icon) { width: 18px; height: 18px; font-size: 18px; color: var(--muted); }
  .fs-rail-item[aria-current="true"] { background: var(--surface); color: var(--text); box-shadow: inset 3px 0 0 var(--accent); }
  .fs-rail-item[aria-current="true"] > :is(.icon, .mana-icon) { color: var(--accent); }
  .fs.fs-rail .fs-content { overflow-y: auto; max-width: none; margin: 0; }
  /* Narrow landscape (568 × 320): tighter header, the rail collapses to icons */
  @media (max-height: 360px) {
    .fs-head { padding: 4px 12px; }
    .fs-content { padding: 8px 12px 16px; gap: 8px; }
    .fs-sec { padding: 10px; gap: 6px; }
  }
  @media (max-width: 620px) {
    .fs.fs-rail .fs-body { grid-template-columns: 60px minmax(0, 1fr); }
    .fs-rail { padding: 8px 6px; }
    .fs-rail-item { justify-content: center; padding: 0; }
    .fs-rail-item > span:last-child { display: none; }
    .fs-columns .fs-content { grid-template-columns: minmax(0, 1fr); }
    .fs-switches { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  /* Portrait: one column for every layout; the rail becomes a row of tabs */
  @media (max-width: 480px) {
    .fs.fs-rail .fs-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    .fs-rail { display: flex; gap: 4px; padding: 6px 12px; border-right: 0; border-bottom: 1px solid var(--border); overflow-x: auto; }
    .fs-rail-item { flex: none; padding: 0 10px; } .fs-rail-item > span:last-child { display: inline; }
    .fs-rail-item[aria-current="true"] { box-shadow: inset 0 -3px 0 var(--accent); }
    .fs-switches { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (min-width: 1100px) {
    .fs-content { max-width: 820px; }
    .fs-columns .fs-content { max-width: 1180px; }
  }`;

