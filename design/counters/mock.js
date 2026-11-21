// Mock-up only: draws LifePod boards with counters, commander damage and tile colours from a scene object,
// using the real web/styles.css markup and classes. It does not change web/. Scenes live in scenes.js.
import palette from './palette.js';
import extraIcons from './phosphor-extra.js';

// Phosphor Icons (MIT), Bold weight, from @phosphor-icons/core.
const paths = {
  minus: 'M228,128a12,12,0,0,1-12,12H40a12,12,0,0,1,0-24H216A12,12,0,0,1,228,128Z',
  plus: 'M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z',
  check: 'M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z',
  x: 'M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z',
  sword: 'M216,28H152a12,12,0,0,0-9.33,4.45L79.5,110.51l-4.66-4.65a20,20,0,0,0-28.29,0L29.86,122.55a20,20,0,0,0,0,28.290h0L45,166,23.86,187.17a20,20,0,0,0,0,28.28l16.69,16.690a20,20,0,0,0,28.28,0L90,211l15.17,15.16a20,20,0,0,0,28.29,0l16.69-16.69a20,20,0,0,0,0-28.3l-4.65-4.65,78.06-63.17A12,12,0,0,0,228,104V40A12,12,0,0,0,216,28ZM54.69,212.34l-11-11L62,183l11,11Zm64.61-6L49.65,136.7l11.05-11,69.65,69.65ZM204,98.27l-75.58,61.17L121,152l47.51-47.5a12,12,0,0,0-17-17L104,135l-7.45-7.44L157.73,52H204Z',
  skull: 'M116,132a24,24,0,1,1-24-24A24,24,0,0,1,116,132Zm48-24a24,24,0,1,0,24,24A24,24,0,0,0,164,108Zm72,8c0,29.85-13.050,57.78-36,77.52V216a20,20,0,0,1-20,20H76a20,20,0,0,1-20-20V193.52c-23-19.74-36-47.67-36-77.52C20,58.65,68.45,12,128,12S236,58.65,236,116Zm-24,0c0-44.11-37.68-80-84-80S44,71.89,44,116c0,24.31,11.41,47,31.31,62.3A12,12,0,0,1,80,187.82V212H96V192a12,12,0,0,1,24,0v20h16V192a12,12,0,0,1,24,0v20h16V187.82a12,12,0,0,1,4.69-9.51C200.59,163,212,140.31,212,116Z',
  drop: 'M134.88,6.17a12,12,0,0,0-13.76,0,259,259,0,0,0-42.180,39C50.85,77.43,36,111.62,36,144a92,92,0,0,0,184,0C220,66.64,138.36,8.6,134.880,6.17ZM128,212a68.07,68.07,0,0,1-68-68c0-33.31,20-63.37,36.7-82.71A249.35,249.35,0,0,1,128,31.11a249.35,249.35,0,0,1,31.3,30.18C176,80.63,196,110.69,196,144A68.07,68.07,0,0,1,128,212Zm49.62-52.4a52,52,0,0,1-34,34,12.2,12.2,0,0,1-3.6.55,12,12,0,0,1-3.6-23.45,28,28,0,0,0,18.32-18.32,12,12,0,0,1,22.9,7.2Z',
  crown: 'M232.63,70a19.82,19.82,0,0,0-23.55,4.71l-29.52,31.82L146.22,31.76l-.06-.14a20,20,0,0,0-36.32,0l-.06.14L76.44,106.52,46.92,74.7a20,20,0,0,0-34.6,16.81c0,.16.06.31.09.47L35.07,195.76A20,20,0,0,0,54.71,212H201.29a20,20,0,0,0,19.64-16.24L243.59,92c0-.16.07-.31.09-.47A19.820,19.820,0,0,0,232.63,70ZM198.06,188H57.94L39.06,101.51,71.2,136.16A12,12,0,0,0,91,132.89l37-83.07,37,83.07a12,12,0,0,0,19.76,3.27l32.14-34.65Z',
  stack: 'M234.36,170A12,12,0,0,1,230,186.37l-96,56a12,12,0,0,1-12.1,0l-96-56a12,12,0,0,1,12.09-20.74l90,52.48L218,165.63A12,12,0,0,1,234.36,170ZM218,117.63,128,170.11,38.05,117.63A12,12,0,0,0,26,138.37l96,56a12,12,0,0,0,12.1,0l96-56A12,12,0,0,0,218,117.63ZM20,80a12,12,0,0,1,6-10.37l96-56a12.06,12.06,0,0,1,12.1,0l96,56a12,12,0,0,1,0,20.74l-96,56a12,12,0,0,1-12.1,0l-96-56A12,12,0,0,1,20,80Zm35.82,0L128,122.11,200.18,80,128,37.89Z',
  palette: 'M203.57,51A107.9,107.9,0,0,0,20,128c0,44.72,27.6,82.25,72,97.94A36,36,0,0,0,140,192a12,12,0,0,1,12-12h46.21a35.79,35.79,0,0,0,35.1-28A108.6,108.6,0,0,0,236,127.09,107.23,107.23,0,0,0,203.57,51Zm6.34,95.67a11.91,11.91,0,0,1-11.7,9.3H152a36,36,0,0,0-36,36,12,12,0,0,1-16,11.3c-16.65-5.88-30.65-15.76-40.48-28.56A76,76,0,0,1,44,128a84,84,0,0,1,83.13-84H128a84.350,84.350,0,0,1,84,83.29A84.72,84.72,0,0,1,209.91,146.71ZM144,76a16,16,0,1,1-16-16A16,16,0,0,1,144,76Zm-44,24A16,16,0,1,1,84,84,16,16,0,0,1,100,100Zm0,56a16,16,0,1,1-16-16A16,16,0,0,1,100,156Zm88-56a16,16,0,1,1-16-16A16,16,0,0,1,188,100Z',
  undo: 'M236,144a68.07,68.07,0,0,1-68,68H80a12,12,0,0,1,0-24h88a44,44,0,0,0,0-88H61l27.52,27.51a12,12,0,0,1-17,17l-48-48a12,12,0,0,1,0-17l48-48a12,12,0,1,1,17,17L61,76H168A68.08,68.08,0,0,1,236,144Z',
  dice: 'M192,28H64A36,36,0,0,0,28,64V192a36,36,0,0,0,36,36H192a36,36,0,0,0,36-36V64A36,36,0,0,0,192,28Zm12,164a12,12,0,0,1-12,12H64a12,12,0,0,1-12-12V64A12,12,0,0,1,64,52H192a12,12,0,0,1,12,12ZM104,88A16,16,0,1,1,88,72,16,16,0,0,1,104,88Zm40,40a16,16,0,1,1-16-16A16,16,0,0,1,144,128Zm40-40a16,16,0,1,1-16-16A16,16,0,0,1,184,88Zm-80,80a16,16,0,1,1-16-16A16,16,0,0,1,104,168Zm80,0a16,16,0,1,1-16-16A16,16,0,0,1,184,168Z',
  setup: 'M40,92H70.06a36,36,0,0,0,67.88,0H216a12,12,0,0,0,0-24H137.94a36,36,0,0,0-67.88,0H40a12,12,0,0,0,0,24Zm64-24A12,12,0,1,1,92,80,12,12,0,0,1,104,68Zm112,96H201.94a36,36,0,0,0-67.88,0H40a12,12,0,0,0,0,24h94.06a36,36,0,0,0,67.88,0H216a12,12,0,0,0,0-24Zm-48,24a12,12,0,1,1,12-12A12,12,0,0,1,168,188Z',
};
Object.assign(paths, extraIcons);
export function icon(name) {
  return `<svg class="icon" viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path d="${paths[name]}"/></svg>`;
}

const seatLayouts = {
  2: ['left-1 right-2'],
  3: ['top-1 right-3', 'bottom-2 right-3'],
  4: ['top-1 top-2', 'bottom-3 bottom-4'],
  5: ['top-1 top-2 right-5', 'bottom-3 bottom-4 right-5'],
  6: ['top-1 top-2 top-5', 'bottom-3 bottom-4 bottom-6'],
};
const angles = { bottom: 0, top: 180, left: 90, right: -90 };
const pipColours = { W: '--pip-w', U: '--pip-u', B: '--pip-b', R: '--pip-r', G: '--pip-g', C: '--pip-c' };

// The seat grid as player indices, row by row, for the table map.
function seatGrid(players) {
  return seatLayouts[players].map(row => row.split(' ').map(seat => Number(seat.split('-')[1]) - 1));
}
function edgeOf(players, index) {
  const seat = seatLayouts[players].join(' ').split(' ').find(s => s.endsWith(`-${index + 1}`));
  return seat.split('-')[0];
}
// A tile's palette: the player's swatch at its row's lightness. Seat n defaults to swatch n.
export function paletteFor(scene, index) {
  const swatch = (scene.palette === 'r2' ? palette.r2.swatches : palette.swatches)[scene.colors?.[index] ?? index];
  return swatch[edgeOf(scene.players, index) === 'top' ? 'top' : 'bottom'];
}
function applyPalette(el, p) {
  el.style.setProperty('--panel', p.panel);
  el.style.setProperty('--rim', p.rim);
  el.style.setProperty('--seat', p.seat);
  el.style.setProperty('--button', p.button);
}
const html = (strings, ...values) => strings.reduce((out, s, i) => out + s + (values[i] ?? ''), '');
const minus = s => String(s).replace('-', '−');

function chipsFor(scene, index) {
  const chips = { identity: '', damage: [], poison: '', tax: '' };
  const lethal = scene.lethal;
  const ident = scene.identity?.[index];
  if (ident) {
    chips.identity = `<span class="chip pips" aria-label="Colour identity ${ident}">${[...ident].map(c => `<span class="pip" data-c="${c}" style="--pip: var(${pipColours[c]})"></span>`).join('')}</span>`;
  }
  const damage = scene.cmd?.[index] ?? {};
  chips.damage = Object.entries(damage).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([attacker, n]) => {
    const level = lethal && n >= 21 ? 'out' : lethal && n >= 15 ? 'warn' : '';
    const colour = paletteFor(scene, Number(attacker)).seat;
    return `<span class="chip" data-kind="damage" data-colour="${colour}" ${level ? `data-level="${level}"` : ''}><span class="dot" style="--c:${colour}"></span>${n}</span>`;
  });
  const poison = scene.poison?.[index] ?? 0;
  if (poison > 0) {
    const level = lethal && poison >= 10 ? 'out' : lethal && poison >= 7 ? 'warn' : '';
    chips.poison = `<span class="chip" ${level ? `data-level="${level}"` : ''}>${icon(scene.poisonIcon ?? 'drop')}${poison}</span>`;
  }
  const casts = scene.casts?.[index] ?? 0;
  if (casts > 0) chips.tax = `<span class="chip">${icon('crown')}+${casts * 2}</span>`;
  return chips;
}

function addBadges(scene, face, index) {
  const c = chipsFor(scene, index);
  const rows = scene.badges === 'split'
    ? (scene.poisonNear ? { far: c.damage, near: [c.identity, c.poison, c.tax] } : { far: [...c.damage, c.poison], near: [c.identity, c.tax] })
    : { [scene.badges]: [c.identity, ...c.damage, c.poison, c.tax] };
  for (const [edge, chips] of Object.entries(rows)) {
    const content = chips.filter(Boolean).join('');
    if (!content) continue;
    const row = document.createElement('div');
    row.className = `badges ${edge}`;
    row.innerHTML = content;
    face.append(row);
  }
}

// A badge row stays one line. When it would wrap, the smallest commander damage chips fold into one chip of
// plain dots (their colours, no amounts) until the row fits. Commander damage mode still shows every amount.
function fitBadges(board, scene) {
  if (scene.badgeStyle === 'today' || scene.badgeStyle === 'twoline') {
    // No folding: 'today' shows the overflow as it is, 'twoline' lets the far row take a second line.
    if (scene.badgeStyle === 'twoline') {
      for (const row of board.querySelectorAll('.badges.far')) {
        if (row.offsetHeight > row.firstElementChild.offsetHeight + 1) row.closest('.player').toggleAttribute('data-two-lines', true);
      }
    }
    return;
  }
  for (const row of board.querySelectorAll('.badges')) {
    const oneLine = () => row.offsetHeight <= row.firstElementChild.offsetHeight + 1;
    let folded = null;
    while (!oneLine()) {
      const damage = [...row.querySelectorAll('.chip[data-kind="damage"]:not([data-level])')];
      if (damage.length < 2) break;
      const last = damage.at(-1);
      if (!folded) {
        folded = document.createElement('span');
        folded.className = 'chip folded';
        folded.setAttribute('aria-label', 'More commander damage');
        last.after(folded);
      }
      folded.insertAdjacentHTML('afterbegin', `<span class="dot" style="--c:${last.dataset.colour}"></span>`);
      last.remove();
    }
    // Still too wide: the identity pips move to the opposite edge, as in the split layout.
    const pips = row.querySelector('.pips');
    if (!oneLine() && pips) {
      const edge = row.classList.contains('far') ? 'near' : 'far';
      let other = row.parentElement.querySelector(`.badges.${edge}`);
      if (!other) {
        other = document.createElement('div');
        other.className = `badges ${edge}`;
        row.parentElement.append(other);
      }
      other.prepend(pips);
    }
  }
}

function isOut(scene, index) {
  const damage = Object.values(scene.cmd?.[index] ?? {});
  if (scene.lethal && damage.some(n => n >= 21)) return 'commander';
  if (scene.lethal && (scene.poison?.[index] ?? 0) >= 10) return 'poison';
  return scene.scores[index] <= 0 ? 'life' : '';
}

function buildTile(scene, index) {
  const tile = document.createElement('section');
  tile.className = 'player';
  tile.setAttribute('aria-label', `Player ${index + 1}`);
  tile.innerHTML = html`
    <div class="player-face">
      <div class="controls">
        <button type="button" class="subtract" aria-label="Subtract one life">${icon('minus')}</button>
        <output class="score"></output>
        <button type="button" class="add" aria-label="Add one life">${icon('plus')}</button>
      </div>
    </div>`;
  applyPalette(tile, paletteFor(scene, index));
  const face = tile.querySelector('.player-face');
  const score = tile.querySelector('.score');
  const value = minus(scene.scores[index]);
  score.textContent = value;
  score.style.setProperty('--digits', value.length);
  const out = isOut(scene, index);
  score.toggleAttribute('data-out', Boolean(out));
  if (out && out !== 'life' && scene.outReason) score.insertAdjacentHTML('beforeend', `<span class="out-reason">${out === 'poison' ? '10 poison' : '21 commander'}</span>`);
  if (out && scene.lethal === 'edge') tile.toggleAttribute('data-ring-out', true);
  const t = scene.tiles?.[index] ?? {};
  if (scene.badges && !t.noBadges) addBadges(scene, face, index);
  if (t.dim) tile.toggleAttribute('data-dim', true);
  if (t.lit) tile.toggleAttribute('data-lit', true);
  if (t.target !== undefined) {
    tile.toggleAttribute('data-target', true);
    tile.style.setProperty('--target', paletteFor(scene, t.target).seat);
  }
  if (t.hide || t.map || t.panel) tile.toggleAttribute('data-hide-controls', true);
  if (t.prompt) {
    tile.toggleAttribute('data-hide-controls', true);
    face.insertAdjacentHTML('beforeend', html`<div class="layer">
      ${t.prompt.icon ? `<div class="prompt-icon">${icon(t.prompt.icon)}</div>` : ''}
      <div class="prompt-title">${t.prompt.title}</div>
      ${t.prompt.hint ? `<div class="prompt-hint">${t.prompt.hint}</div>` : ''}
    </div>`);
  }
  if (t.stepper) {
    const { attacker, value: n } = t.stepper;
    const colour = paletteFor(scene, attacker).seat;
    score.removeAttribute('data-out');
    score.innerHTML = `<span class="cdot" style="--c:${colour}"></span>${n}<span class="score-sub">${minus(scene.scores[index])} life</span>`;
    score.style.setProperty('--digits', String(n).length + 0.6);
    if (n >= 21) score.toggleAttribute('data-out', true);
  }
  if (t.map) face.append(buildMap(scene, index, t.map));
  if (t.panel) face.append(buildPanel(scene, index, t.panel));
  if (t.stepRows) { tile.toggleAttribute('data-hide-controls', true); face.append(buildStepRows(scene, index, t.stepRows)); }
  if (t.swatchGrid) { tile.toggleAttribute('data-hide-controls', true); face.append(buildSwatchGrid(scene, index)); }
  if (t.paletteOnly) {
    tile.toggleAttribute('data-hide-controls', true);
    face.insertAdjacentHTML('beforeend', `<div class="layer"><button class="count-palette big" type="button" aria-label="Colour and identity">${icon('palette')}</button><div class="prompt-hint">Colour and identity</div></div>`);
  }
  if (t.counterButtons) { tile.toggleAttribute('data-hide-controls', true); face.append(buildCounterButtons(scene, index, t.counterButtons)); }
  if (t.handle) {
    face.insertAdjacentHTML('beforeend', `<span class="drag-handle" ${t.handle === 'active' ? 'data-active' : ''}>${icon('sword')}</span>`);
  }
  return tile;
}

function buildMap(scene, index, { touched, split, ownSeat = 'undo', delta, title = 'Commander damage to you' }) {
  tileMaps.push(index);
  const wrap = document.createElement('div');
  wrap.className = 'layer';
  let grid = seatGrid(scene.players);
  // A top-edge tile is turned 180°, so its map is reversed to match the table as that player sees it.
  if (edgeOf(scene.players, index) === 'top') grid = grid.map(row => [...row].reverse()).reverse();
  const cells = grid.flat().map(seat => {
    if (seat === index && ownSeat === 'life') {
      return `<div class="map-cell self you"><strong>${minus(scene.scores[index])}</strong>${delta ? `<span class="delta">${minus(delta)}</span>` : '<span>you</span>'}</div>`;
    }
    if (seat === index) return `<button class="map-cell self" type="button" aria-label="Undo the last point">${icon('undo')}</button>`;
    const p = paletteFor(scene, seat);
    const n = scene.cmd?.[index]?.[seat] ?? 0;
    const body = split ? `<span class="half minus">${icon('minus')}</span><span class="cell-n">${n}</span><span class="half plus">${icon('plus')}</span>` : n;
    return `<button class="map-cell ${split ? 'split' : ''}" type="button" style="--c-seat:${p.seat};--c-ink:${p.button}" ${n ? '' : 'data-zero'} ${touched === seat ? 'data-touched' : ''} aria-label="Player ${seat + 1}'s commander, ${n}">${body}</button>`;
  }).join('');
  wrap.innerHTML = html`<div class="map-wrap">
    <div class="map-title">${title}</div>
    <div class="map" style="--cols:${grid[0].length}">${cells}</div>
    ${ownSeat === 'life' ? '' : `<div class="map-life"><strong>${minus(scene.scores[index])}</strong> life${delta ? ` <span class="delta">(${minus(delta)})</span>` : ''}</div>`}
  </div>`;
  return wrap;
}
const tileMaps = [];
// Sizes the table map cells to the tile once it's laid out: at least 44px, as large as fits.
function sizeMaps(board) {
  for (const map of board.querySelectorAll('.map')) {
    const face = map.closest('.player-face');
    const cols = Number(map.style.getPropertyValue('--cols'));
    const w = face.offsetWidth, h = face.offsetHeight;
    const cellW = Math.max(44, Math.min(120, (w - 28 - (cols - 1) * 4) / cols));
    const lifeLine = map.parentElement.querySelector('.map-life') ? 0 : 22;
    const cellH = Math.max(44, Math.min(80, (h - 90 + lifeLine) / 2 - 2));
    map.style.setProperty('--cell-w', `${cellW}px`);
    map.style.setProperty('--cell-h', `${cellH}px`);
    // Split cells: flag halves narrower than the 44px minimum, and record the size for the caption.
    if (map.querySelector('.split')) {
      const half = Math.floor(cellW / 2);
      map.toggleAttribute('data-small-halves', half < 44);
      const tag = document.createElement('div');
      tag.className = 'size-tag';
      tag.textContent = `halves ${half} × ${Math.floor(cellH)}px`;
      map.after(tag);
    }
  }
}

function buildPanel(scene, index, { page = 'counters', link = false, tabs = false }) {
  const layer = document.createElement('div');
  layer.className = 'layer';
  const poison = scene.poison?.[index] ?? 0;
  const casts = scene.casts?.[index] ?? 0;
  const rowsHtml = html`
    <div class="prow"><span class="label">${icon('drop')}<span class="word">Poison</span></span>
      <button class="step" type="button" aria-label="Remove a poison counter">${icon('minus')}</button>
      <span class="value">${poison}</span>
      <button class="step" type="button" aria-label="Add a poison counter">${icon('plus')}</button></div>
    <div class="prow"><span class="label">${icon('crown')}<span class="word">Tax</span> <small>+${casts * 2}</small></span>
      <button class="step" type="button" aria-label="Undo a cast">${icon('minus')}</button>
      <span class="value">${casts}</span>
      <button class="step" type="button" aria-label="Add a cast">${icon('plus')}</button></div>`;
  const tabsHtml = tabs ? html`<div class="panel-tabs">
      <button class="panel-link" type="button" aria-pressed="${page === 'counters'}">Counters</button>
      <button class="panel-link" type="button" aria-pressed="${page === 'colour'}">Colour</button></div>` : '';
  let body = '';
  if (page === 'counters') {
    body = rowsHtml + (link ? `<button class="panel-link" type="button">${icon('palette')}Colour<span class="word">&nbsp;and identity</span></button>` : '');
  } else {
    body = swatchesHtml(scene, index, 6) + identityHtml(scene, index);
  }
  layer.innerHTML = `<div class="panel">${tabsHtml}${body}</div>`;
  return layer;
}

// Counters mode (round 3): a poison row and a tax row, each laid out like the life controls.
function buildStepRows(scene, index, { pressed } = {}) {
  const layer = document.createElement('div');
  layer.className = 'layer step-rows';
  const poison = scene.poison?.[index] ?? 0;
  const casts = scene.casts?.[index] ?? 0;
  const row = (kind, glyph, value, label) => `<div class="srow" data-kind="${kind}">
      <button type="button" class="sbtn minus" aria-label="Remove one ${label}" ${pressed === `${kind}-minus` ? 'data-pressed' : ''}>${icon('minus')}</button>
      <output class="sval" aria-label="${label}">${icon(glyph)}<b>${value}</b></output>
      <button type="button" class="sbtn plus" aria-label="Add one ${label}" ${pressed === `${kind}-plus` ? 'data-pressed' : ''}>${icon('plus')}</button></div>`;
  const rows = [];
  if (scene.counters?.poison !== false) rows.push(row('poison', 'flask', poison, 'poison counter'));
  if (scene.counters?.commander !== false) rows.push(row('tax', 'crown', `+${casts * 2}`, 'commander cast'));
  layer.innerHTML = html`<div class="srows">${rows.join('')}
    <button class="count-palette" type="button" aria-label="Colour and identity">${icon('palette')}<span class="word">Colour</span></button></div>`;
  return layer;
}

// Tile colour mode (round 3, option C): each tile shows the nine swatches, facing its player.
function buildSwatchGrid(scene, index) {
  const layer = document.createElement('div');
  layer.className = 'layer swatch-mode';
  layer.innerHTML = `<div class="swatch-wrap"><div class="prompt-hint wide-only">Your tile colour</div>${swatchesHtml({ ...scene, palette: 'r2' }, index, 3)}</div>`;
  return layer;
}

// Counters mode (round 2): poison and tax become big buttons in the tile. Tap adds one, long-press takes one back.
function buildCounterButtons(scene, index, { pressed } = {}) {
  const layer = document.createElement('div');
  layer.className = 'layer counters-mode';
  const poison = scene.poison?.[index] ?? 0;
  const casts = scene.casts?.[index] ?? 0;
  const poisonLevel = poison >= 10 ? 'out' : poison >= 7 ? 'warn' : '';
  const buttons = [];
  if (scene.counters?.poison !== false) {
    buttons.push(`<button class="count-button" type="button" ${pressed === 'poison' ? 'data-pressed' : ''} ${poisonLevel ? `data-level="${poisonLevel}"` : ''}
      role="slider" aria-label="Poison" aria-valuenow="${poison}" aria-valuemin="0" aria-valuetext="${poison} poison">
      <span class="count-main">${icon(scene.poisonIcon ?? 'drop')}<b>${poison}</b></span><span class="count-label">Poison</span></button>`);
  }
  if (scene.counters?.commander !== false) {
    buttons.push(`<button class="count-button" type="button" ${pressed === 'tax' ? 'data-pressed' : ''}
      role="slider" aria-label="Commander tax" aria-valuenow="${casts}" aria-valuemin="0" aria-valuetext="${casts} casts, plus ${casts * 2}">
      <span class="count-main">${icon('crown')}<b>+${casts * 2}</b></span><span class="count-label">${casts} ${casts === 1 ? 'cast' : 'casts'}</span></button>`);
  }
  layer.innerHTML = html`<div class="count-wrap">
    <div class="count-row">${buttons.join('')}</div>
    <div class="count-foot"><span class="count-hint">Tap +1 · hold −1</span>
      <button class="count-palette" type="button" aria-label="Colour and identity">${icon('palette')}</button></div>
  </div>`;
  return layer;
}

function swatchesHtml(scene, index, cols) {
  const row = edgeOf(scene.players, index) === 'top' ? 'top' : 'bottom';
  const chosen = scene.colors?.[index] ?? index;
  const list = scene.palette === 'r2' ? palette.r2.swatches : palette.swatches;
  return `<div class="swatches" style="--swatch-cols:${cols}">${list.map((s, i) => {
    const p = s[row];
    return `<button class="swatch" type="button" aria-label="${s.name}" aria-pressed="${i === chosen}" style="--s-panel:${p.panel};--s-rim:${p.rim};--s-seat:${p.seat}"></button>`;
  }).join('')}</div>`;
}
function identityHtml(scene, index) {
  const ident = scene.identity?.[index] ?? '';
  return `<div class="identity" role="group" aria-label="Colour identity">${[...'WUBRGC'].map(c =>
    `<button class="ident" type="button" aria-pressed="${ident.includes(c)}" aria-label="${c}"><span class="pip" data-c="${c}" style="--pip: var(${pipColours[c]})"></span>${c}</button>`).join('')}</div>`;
}

function buildPill(scene) {
  const pill = document.createElement('div');
  pill.className = 'board-controls pill';
  if (scene.cluster) {
    // Round 3: Undo, ✓ and ✕ replace the single ✓ during commander damage and counters modes.
    pill.classList.add('cluster');
    pill.innerHTML = `<button type="button" data-name="undo" aria-label="Undo" ${scene.cluster.undoDisabled ? 'disabled' : ''}>${icon('arrow-counter-clockwise')}</button>`
      + `<button type="button" data-name="save" class="save" aria-label="Save">${icon('check')}</button>`
      + `<button type="button" data-name="cancel" aria-label="Cancel">${icon('x')}</button>`;
    return pill;
  }
  if (scene.pillDone) {
    pill.toggleAttribute('data-done', true);
    pill.innerHTML = `<button type="button" aria-label="Done">${icon('check')}</button>`;
    return pill;
  }
  const labels = { sword: 'Commander damage', counters: 'Counters', dice: 'Roll dice', setup: 'Game setup' };
  pill.innerHTML = (scene.pill ?? ['dice', 'setup']).map(name =>
    `<button type="button" aria-label="${labels[name]}" data-name="${name}" ${scene.pillPressed === name ? 'data-pressed' : ''}>${icon(name === 'counters' ? 'stack' : name)}</button>`).join('');
  return pill;
}

function buildPlayerSheet(scene, app, { player, parts = ['counters', 'colour'] }) {
  const p = paletteFor(scene, player);
  const scrim = document.createElement('div');
  scrim.className = 'player-sheet-scrim';
  const sheet = document.createElement('div');
  sheet.className = 'player-sheet';
  sheet.style.setProperty('--sheet-angle', `${angles[edgeOf(scene.players, player)]}deg`);
  const poison = scene.poison?.[player] ?? 0;
  const casts = scene.casts?.[player] ?? 0;
  const counters = parts.includes('counters') ? html`<div class="panel">
      <h3>Counters</h3>
      <div class="prow"><span class="label">${icon('drop')}Poison</span>
        <button class="step" type="button">${icon('minus')}</button><span class="value">${poison}</span>
        <button class="step" type="button">${icon('plus')}</button></div>
      <div class="prow"><span class="label">${icon('crown')}Tax <small>+${casts * 2}</small></span>
        <button class="step" type="button">${icon('minus')}</button><span class="value">${casts}</span>
        <button class="step" type="button">${icon('plus')}</button></div>
    </div>` : '';
  const colour = parts.includes('colour') ? html`<div>
      <h3>Tile colour</h3>${swatchesHtml(scene, player, 6)}
      <h3 style="margin-top:10px">Colour identity</h3>${identityHtml(scene, player)}
    </div>` : '';
  sheet.innerHTML = html`
    <div class="sheet-header">
      <h2><span class="dot" style="--c:${p.seat}"></span>Player ${player + 1}</h2>
      <button class="close" type="button" aria-label="Done">${icon('check')}</button>
    </div>
    <div class="cols">${counters}${colour}</div>`;
  app.append(scrim, sheet);
}

function addFinger(app, scene, f) {
  const tile = app.querySelector('.board').children[f.tile];
  const target = f.at === 'cell'
    ? [...tile.querySelectorAll('.map-cell')].find(c => c.getAttribute('aria-label')?.startsWith(`Player ${f.seat + 1}'s`))
    : f.at === 'handle' ? tile.querySelector('.drag-handle')
    : f.at === 'add' ? tile.querySelector('.add')
    : f.at === 'pill' ? app.querySelector(`.pill button[data-name="${f.name}"]`) ?? app.querySelector('.pill button')
    : f.at === 'step' ? tile.querySelectorAll('.step')[1]
    : f.at === 'count' ? tile.querySelectorAll('.count-button')[f.n ?? 0]
    : f.at === 'srow' ? tile.querySelectorAll('.srow')[f.n ?? 0].querySelector(f.side === 'minus' ? '.minus' : '.plus')
    : f.at === 'swatch' ? tile.querySelectorAll('.swatch')[f.n ?? 0]
    : f.at === 'pillbtn' ? app.querySelector(`.pill button[data-name="${f.name}"]`)
    : f.at === 'palette' ? tile.querySelector('.count-palette')
    : tile;
  const finger = document.createElement('span');
  finger.className = 'finger';
  if (f.count) finger.dataset.count = f.count;
  if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
  finger.style.left = f.x ?? '50%';
  finger.style.top = f.y ?? '50%';
  target.append(finger);
}

// Drag line for alternative C, drawn in board coordinates so it also works when the board is turned.
function addDragLine(app, scene, { from, to }) {
  const board = app.querySelector('.board');
  const a = board.children[from], b = board.children[to];
  const edge = edgeOf(scene.players, from);
  const hx = edge === 'top' ? a.offsetLeft + a.offsetWidth - 28 : a.offsetLeft + 28;
  const hy = edge === 'top' ? a.offsetTop + 28 : a.offsetTop + a.offsetHeight - 28;
  const tx = b.offsetLeft + b.offsetWidth * 0.62, ty = b.offsetTop + b.offsetHeight * 0.45;
  const colour = paletteFor(scene, from).seat;
  const svg = `<svg class="drag-overlay" width="${board.offsetWidth}" height="${board.offsetHeight}">
    <line x1="${hx}" y1="${hy}" x2="${tx}" y2="${ty}" stroke="${colour}" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 9"/>
    <circle cx="${tx}" cy="${ty}" r="17" fill="#ffffff38" stroke="#ffffffd9" stroke-width="2"/></svg>`;
  app.insertAdjacentHTML('beforeend', svg);
}

export function renderBoard(scene, host = document.body) {
  tileMaps.length = 0;
  const app = document.createElement('main');
  app.className = 'app';
  const portrait = window.innerHeight > window.innerWidth;
  app.dataset.boardTurn = portrait ? '90' : '0';
  const board = document.createElement('section');
  board.className = 'board';
  board.id = 'board';
  if (scene.lethal) board.classList.add(`lethal-${scene.lethal}`);
  if (scene.badgeStyle) board.classList.add(`badges-${scene.badgeStyle}`);
  const rows = seatLayouts[scene.players];
  board.style.gridTemplateAreas = rows.map(r => `"${r}"`).join(' ');
  for (let i = 0; i < scene.players; i++) board.append(buildTile(scene, i));
  for (const seat of new Set(rows.join(' ').split(' '))) {
    const [edge, number] = seat.split('-');
    const tile = board.children[Number(number) - 1];
    tile.style.gridArea = seat;
    tile.dataset.edge = edge;
  }
  app.append(board);
  if (!scene.noPill) app.append(buildPill(scene));
  host.append(app);
  sizeMaps(board);
  fitBadges(board, scene);
  if (scene.drag) addDragLine(app, scene, scene.drag);
  if (scene.playerSheet) buildPlayerSheet(scene, app, scene.playerSheet);
  for (const f of scene.fingers ?? []) addFinger(app, scene, f);
  if (scene.discard) renderDiscard(scene.discard);
  return app;
}

// ✕ with changes asks first, in the app's own dialog style (see #restart in web/index.html).
function renderDiscard(n) {
  const dialog = document.createElement('dialog');
  dialog.id = 'discard';
  dialog.innerHTML = html`<form class="sheet" method="dialog">
      <div class="sheet-header"><h2>Discard ${n} changes?</h2></div>
      <p class="discard-message">Life, commander damage and counters go back to how they were when you opened this mode.</p>
      <div class="sheet-actions">
        <button class="secondary discard" type="submit" value="discard">Discard</button>
        <button class="primary" type="submit" value="keep" autofocus>Keep editing</button>
      </div></form>`;
  document.body.append(dialog);
  dialog.showModal();
  document.activeElement?.blur();
}

// Setup sheet with the new Counters group. Markup follows web/index.html.
function playerColourRow(scene) {
  return html`<fieldset><legend>Player colours</legend><div class="player-colours">${Array.from({ length: scene.players }, (_, i) => {
    const p = paletteFor({ ...scene, palette: 'r2' }, i);
    return `<button type="button" class="player-colour" aria-label="Player ${i + 1} colour" style="--s-panel:${p.panel};--s-rim:${p.rim};--s-seat:${p.seat}"><span>${i + 1}</span></button>`;
  }).join('')}</div></fieldset>`;
}

export function renderSetup(scene) {
  const variant = scene.setup;
  const switchRow = (id, label, checked) => `<label class="wake-setting"><input type="checkbox" id="${id}" role="switch" ${checked ? 'checked' : ''}><span class="switch" aria-hidden="true"></span><span>${label}</span></label>`;
  const counters = variant === 'switches' ? html`
      <fieldset>
        <legend>Counters</legend>
        <div class="counter-switches">
          ${switchRow('sw-commander', 'Commander', scene.commander)}
          ${switchRow('sw-poison', 'Poison', scene.poison)}
        </div>
      </fieldset>`
    : variant === 'toggles' ? html`
      <fieldset>
        <legend>Counters</legend>
        <div class="choices toggles">
          <button type="button" aria-pressed="${Boolean(scene.commander)}">${icon('sword')}Commander</button>
          <button type="button" aria-pressed="${Boolean(scene.poison)}">${icon('drop')}Poison</button>
        </div>
      </fieldset>`
    : html`
      <div class="setup-options">
        ${switchRow('sw-commander', 'Commander', scene.commander)}
        ${switchRow('sw-poison', 'Poison', scene.poison)}
      </div>`;
  const dialog = document.createElement('dialog');
  dialog.id = 'setup';
  dialog.innerHTML = html`
    <form class="sheet" novalidate>
      <div class="sheet-header">
        <h2>Game setup</h2>
        <div class="sheet-header-actions">
          <button class="text-button" type="button">Privacy</button>
          <button class="close" type="button" aria-label="Close setup">${icon('x')}</button>
        </div>
      </div>
      <fieldset>
        <legend>Players</legend>
        <div class="choices">${[2, 3, 4, 5, 6].map(n => `<button type="button" aria-pressed="${n === scene.players}">${n}</button>`).join('')}</div>
      </fieldset>
      <div class="life-setting">
        <label for="starting-life">Starting life</label>
        <div class="starting-life-row">
          <div class="choices">${[20, 30, 40].map(n => `<button type="button" aria-pressed="${n === 40}">${n}</button>`).join('')}</div>
          <input type="text" id="starting-life" value="40" inputmode="numeric">
        </div>
      </div>
      ${counters}
      ${scene.colourAccess === 'row' ? playerColourRow(scene) : ''}
      <div class="setup-options">
        ${switchRow('keep-awake', 'Keep awake', true)}
        <div class="setup-mode-buttons">
          ${scene.colourAccess === 'mode' ? `<button class="secondary" id="tile-colours" type="button">${icon('palette')}Colours</button>` : ''}
          <button class="secondary" id="rotate-seats" type="button">Rotate seats</button>
        </div>
      </div>
      <div class="sheet-actions">
        <button class="secondary" type="button">New game</button>
        <button class="primary" type="submit">Done</button>
      </div>
    </form>`;
  document.body.append(dialog);
  dialog.showModal();
  document.activeElement?.blur();
  return dialog;
}
