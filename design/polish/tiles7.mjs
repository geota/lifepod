// Alternative 12-colour tile palette sets (TILES.md), generated in OKLCH and checked against the Graphite chrome.
// Run from the repo root:  node design/polish/tiles7.mjs     (prints the checks, writes tiles7.json for tiles-render.mjs
// and the Soft, Jewel and Clear blocks in web/styles.css)
// Exits with an error if a set misses a contrast minimum.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { oklchToHex, contrast, hexToRgb, rgbToHex, rgbToOklch } from '../counters/oklch.mjs';

const ids = ['sage', 'sky', 'coral', 'violet', 'amber', 'teal', 'rose', 'indigo', 'slate', 'copper', 'olive', 'orchid'];
const roles = ['panel', 'rim', 'seat', 'button'];

// Today's twelve, read from web/styles.css.
const css = readFileSync(fileURLToPath(new URL('../../web/styles.css', import.meta.url)), 'utf8');
const todaySet = Object.fromEntries(ids.map(id => [id, Object.fromEntries(['top', 'bottom'].map(row => [row,
  Object.fromEntries(roles.map(role => [role, css.match(new RegExp(`--${id}-${row}-${role}:\\s*(#[0-9a-f]{6})`))[1]]))]))]));

// Graphite chrome text (palettes7.mjs) and the app's state colours.
const text = '#f2f2ef', soft = '#dedfe2', out = '#f49993', warn = '#f2c46d';
const over = (top, alpha, bottom) => rgbToHex(hexToRgb(top).map((v, i) => v * alpha + hexToRgb(bottom)[i] * (1 - alpha)));

// A set derived from today's by transforming each role's OKLCH.
function derive(fn) {
  return Object.fromEntries(ids.map(id => [id, Object.fromEntries(['top', 'bottom'].map(row => [row,
    Object.fromEntries(roles.map(role => {
      const [L, C, H] = rgbToOklch(hexToRgb(todaySet[id][row][role]));
      return [role, oklchToHex(fn({ L, C, H, role, row, id }))];
    }))]))]));
}
// A set built from (hue, top lightness, chroma) per swatch, with today's role offsets.
const roleL = { top: { panel: 0, rim: 0.16, seat: 0.532, button: -0.063 }, bottom: { panel: -0.052, rim: 0.107, seat: 0.519, button: -0.110 } };
const roleC = { panel: 1, rim: 1.45, seat: 1.6, button: 0.82 };
function build(spec) {
  return Object.fromEntries(ids.map((id, i) => {
    const { h, l, c } = spec[i];
    return [id, Object.fromEntries(['top', 'bottom'].map(row => [row,
      Object.fromEntries(roles.map(role => [role, oklchToHex([l + roleL[row][role], Math.min(c * roleC[role], role === 'seat' ? 0.11 : 0.2), h])]))]))];
  }));
}

// Colour-vision simulation (Machado, Oliveira and Fernandes 2009, severity 1.0), in linear RGB.
const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const M = {
  normal: null,
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const simulate = (hex, m) => {
  if (!m) return hexToRgb(hex);
  const v = hexToRgb(hex).map(lin);
  return m.map(r => gam(Math.min(1, Math.max(0, r[0] * v[0] + r[1] * v[1] + r[2] * v[2]))));
};
const lab = rgb => { const [L, C, H] = rgbToOklch(rgb); return [L, C * Math.cos(H * Math.PI / 180), C * Math.sin(H * Math.PI / 180)]; };
const dE = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
// The smallest difference between two different swatches as a tile: panel and seat colour together (the seat
// colour is the − + glyphs and the ring, so it identifies a tile as much as the panel does).
function minPair(set, vision) {
  let best = { d: Infinity };
  for (const row of ['top', 'bottom']) {
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = set[ids[i]][row], b = set[ids[j]][row];
      const d = Math.hypot(dE(lab(simulate(a.panel, M[vision])), lab(simulate(b.panel, M[vision]))),
        0.5 * dE(lab(simulate(a.seat, M[vision])), lab(simulate(b.seat, M[vision]))));
      if (d < best.d) best = { d, pair: `${ids[i]}–${ids[j]}` };
    }
  }
  return best;
}

// Across the table: a top-row tile against a bottom-row tile of a different swatch, in deuteranope vision.
function rowsApart(set) {
  let m = Infinity;
  for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) if (i !== j) {
    const a = set[ids[i]].top, b = set[ids[j]].bottom;
    m = Math.min(m, Math.hypot(dE(lab(simulate(a.panel, M.deutan)), lab(simulate(b.panel, M.deutan))), 0.5 * dE(lab(simulate(a.seat, M.deutan)), lab(simulate(b.seat, M.deutan)))));
  }
  return m;
}
function check(set) {
  const worst = { life: 99, small: 99, lifeOut: 99, seat: 99, warnChip: 99 };
  for (const id of ids) for (const row of ['top', 'bottom']) {
    const p = set[id][row];
    const chip = over('#0a0e0b', 0x70 / 255, p.panel);
    const r = { life: contrast(text, p.panel), small: contrast(soft, p.panel), lifeOut: contrast(out, p.panel), seat: contrast(p.seat, p.panel), warnChip: contrast(warn, over(warn, 0.16, chip)) };
    for (const k of Object.keys(worst)) worst[k] = Math.min(worst[k], r[k]);
  }
  return worst;
}

// ---- The sets ---------------------------------------------------------------------------------------------------

// Colour-blind friendly: chosen by search so the smallest tile-to-tile difference is as large as possible under
// normal, deuteranope and protanope vision at once, varying hue, lightness (within the contrast limits) and chroma.
function cvdSearch() {
  const cands = [];
  for (let h = 0; h < 360; h += 8) for (const l of [0.31, 0.33, 0.35, 0.368]) for (const c of [0.035, 0.06, 0.085]) cands.push({ h, l, c });
  for (const l of [0.31, 0.35]) cands.push({ h: 250, l, c: 0.01 });
  const ok = s => { const w = check(build(Array(12).fill(s))); return w.life >= 9 && w.small >= 7.6 && w.lifeOut >= 4.79 && w.seat >= 7.35; };
  const pool = cands.filter(ok);
  // Each candidate's panel and seat colours in OKLab, per row and per vision, computed once.
  const visions = ['normal', 'deutan', 'protan'];
  for (const c of pool) {
    const t = build(Array(12).fill(c)).sage;
    c.v = Object.fromEntries(visions.map(v => [v, Object.fromEntries(['top', 'bottom'].map(row => [row, { p: lab(simulate(t[row].panel, M[v])), s: lab(simulate(t[row].seat, M[v])) }]))]));
  }
  const dist = (a, b, v, ra, rb) => Math.hypot(dE(a.v[v][ra].p, b.v[v][rb].p), 0.5 * dE(a.v[v][ra].s, b.v[v][rb].s));
  // The smallest difference between two picks: in the same row (neighbours) and across rows (opposite sides).
  const pairMin = (a, b) => { let m = Infinity; for (const v of visions) for (const [ra, rb] of [['top', 'top'], ['bottom', 'bottom'], ['top', 'bottom'], ['bottom', 'top']]) m = Math.min(m, dist(a, b, v, ra, rb)); return m; };
  const score = picks => { let m = Infinity; for (let i = 0; i < picks.length; i++) for (let j = i + 1; j < picks.length; j++) m = Math.min(m, pairMin(picks[i], picks[j])); return m; };
  let picks = [pool.find(c => c.h === 24 && c.l === 0.35 && c.c === 0.085) ?? pool[0]];
  while (picks.length < 12) {
    let best = null, bs = -1;
    for (const c of pool) { if (picks.includes(c)) continue; const sc = Math.min(...picks.map(p => pairMin(p, c))); const s2 = Math.min(sc, score(picks)); if (s2 > bs || (s2 === bs && sc > best.sc)) { bs = s2; best = c; best.sc = sc; } }
    picks.push(best);
  }
  for (let pass = 0; pass < 4; pass++) for (let i = 0; i < 12; i++) {
    let cur = score(picks);
    for (const c of pool) { if (picks.includes(c)) continue; const t = picks.slice(); t[i] = c; const sc = score(t); if (sc > cur) { picks = t; cur = sc; } }
  }
  return picks.map(({ h, l, c }) => ({ h, l, c })).sort((a, b) => (a.c < 0.02) - (b.c < 0.02) || a.h - b.h);
}
const hueName = (h, c) => (c < 0.02 ? 'Slate' : ['Rose', 'Coral', 'Copper', 'Amber', 'Olive', 'Lime', 'Sage', 'Jade', 'Teal', 'Cyan', 'Sky', 'Azure', 'Indigo', 'Violet', 'Orchid', 'Plum'][Math.round(((h + 360) % 360) / 22.5) % 16]);

// Hue names, with "Deep" or "Pale" when two picks share a name.
const uniqueNames = spec => { const n = spec.map(p => hueName(p.h, p.c)); return n.map((x, i) => (n.filter(y => y === x).length > 1 ? (spec[i].l <= Math.min(...spec.filter((_, j) => n[j] === x).map(q => q.l)) ? 'Deep ' : 'Pale ') + x.toLowerCase() : x)); };
// Soft's and Clear's palettes are made in hue order, then placed on the swatch ids by colour family (DESIGN-AUDIT M1):
// each id keeps its Classic family in every set (0 green, 1 sky, 2 coral, 3 violet, 4 amber, 5 teal, 6 rose, 7 indigo,
// 8 slate, 9 copper, 10 olive, 11 orchid), so players 1–6, who default to ids 0–5, get six spread colours rather than
// six neighbours, and switching sets keeps each player's colour family. Clear has no neutral, so its slate is the deep
// plum. byFamily[id] is the hue-order pick that id takes.
const byFamily = {
  // Soft, in hue order: Coral, Copper, Olive, Lime, Jade, Teal, Sky, Azure, Violet, Orchid, Plum, Slate.
  soft: [4, 6, 0, 8, 2, 5, 10, 7, 11, 1, 3, 9],
  // Clear, in hue order: Coral, Copper, Olive, Lime, Jade, Cyan, Sky, Indigo, Violet, Orchid, Pale plum, Deep plum.
  clear: [4, 6, 0, 8, 2, 5, 10, 7, 11, 1, 3, 9],
};
const inFamilyOrder = (spec, order) => order.map(at => spec[at]);
const cvdPicks = inFamilyOrder(cvdSearch(), byFamily.clear);
const softSpec = inFamilyOrder([...Array.from({ length: 11 }, (_, i) => ({ h: (20 + i * 360 / 11) % 360, l: i % 2 ? 0.335 : 0.368, c: 0.045 })), { h: 250, l: 0.35, c: 0.01 }], byFamily.soft);
const sets = {
  today: { name: 'Today', note: 'The twelve shipped palettes.', set: todaySet, names: ids.map(i => i[0].toUpperCase() + i.slice(1)) },
  soft: {
    name: 'Soft', note: 'Muted: low chroma (0.045), so the board recedes and the numbers carry it. Lower chroma brings colours closer, so the eleven hues are re-spaced evenly round the circle and alternate between two lightness steps to stay apart.',
    set: build(softSpec), names: uniqueNames(softSpec),
  },
  jewel: {
    name: 'Jewel', note: 'Rich: panel chroma ×1.7 and accent chroma ×1.35, panels 0.01 darker to keep the red of a life total at 0 readable, so colours read as colours from across the table.',
    set: derive(({ L, C, H, role }) => [role === 'seat' ? L : L - 0.01, Math.min(C * (role === 'seat' ? 1.35 : 1.7), 0.16), H]),
  },
  deep: {
    name: 'Deep rows', note: 'Stronger rows: the bottom row 0.05 darker in OKLCH (panel, rim and button), so the two sides of the table differ more by lightness, which colour-blind players see.',
    set: derive(({ L, C, H, role, row }) => [row === 'bottom' && role !== 'seat' ? L - 0.05 : L, C, H]),
  },
  clear: {
    name: 'Clear (colour-blind friendly)', note: 'Hues, lightness and chroma chosen by search so every pair of tiles stays apart under deuteranope and protanope vision as well as normal vision. Fewer greens, more spread in lightness.',
    set: build(cvdPicks), names: uniqueNames(cvdPicks), spec: cvdPicks,
  },
};
for (const s of Object.values(sets)) s.names ??= ids.map(i => i[0].toUpperCase() + i.slice(1));

// Colour families, for Settings → Table → Shuffle tile colours each game: each set's twelve swatches split into six
// groups, found by search, so that the closest two swatches in different groups are as far apart as possible (as tiles,
// in either row). A shuffle gives each seat a different family while it can, so six players get one of each.
function families(set) {
  const tile = id => ['top', 'bottom'].map(row => ({ p: lab(hexToRgb(set[id][row].panel)), s: lab(hexToRgb(set[id][row].seat)) }));
  const tiles = ids.map(tile);
  const d = tiles.map(a => tiles.map(b => Math.min(...a.flatMap(x => b.map(y => Math.hypot(dE(x.p, y.p), 0.5 * dE(x.s, y.s)))))));
  const count = 6;
  const group = Array(ids.length).fill(0);
  let best = { score: -1, group };
  const visit = (i, used) => {
    if (ids.length - i < count - used) return;
    if (i === ids.length) {
      if (used !== count) return;
      let score = Infinity;
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) if (group[a] !== group[b]) score = Math.min(score, d[a][b]);
      if (score > best.score) best = { score, group: [...group] };
      return;
    }
    for (let g = 0; g <= Math.min(used, count - 1); g++) {
      group[i] = g;
      visit(i + 1, Math.max(used, g + 1));
    }
  };
  visit(0, 0);
  return best;
}
for (const s of Object.values(sets)) s.families = families(s.set);

const results = {};
let failed = false;
for (const [k, s] of Object.entries(sets)) {
  const w = check(s.set);
  const pairs = Object.fromEntries(['normal', 'deutan', 'protan', 'tritan'].map(v => [v, minPair(s.set, v)]));
  results[k] = { ...w, pairs, rows: rowsApart(s.set) };
  if (w.life < 9 || w.small < 7.6 || w.lifeOut < 4.79 || w.seat < 7.35) failed = true;
}
writeFileSync(fileURLToPath(new URL('./tiles7.json', import.meta.url)), JSON.stringify(Object.fromEntries(Object.entries(sets).map(([k, s]) => [k, { name: s.name, note: s.note, names: s.names, families: s.families.group, set: s.set }])), null, 1));

// The app's Soft, Jewel and Clear blocks in web/styles.css (Classic is the :root palettes, which today's set reads), so
// the shipped tokens are always this script's. palette.test.mjs checks they match tiles7.json.
const cssPath = fileURLToPath(new URL('../../web/styles.css', import.meta.url));
const block = (setting, set) => `[data-tiles="${setting}"] {\n${ids.map(id => ['top', 'bottom'].map(row =>
  `  ${roles.map(role => `--${id}-${row}-${role}: ${set[id][row][role]};`).join(' ')}`).join('\n')).join('\n')}\n}`;
let shipped = css;
for (const [setting, source] of [['soft', 'soft'], ['jewel', 'jewel'], ['clear', 'clear']]) {
  shipped = shipped.replace(new RegExp(`\\[data-tiles="${setting}"\\] \\{[^}]*\\}`), block(setting, sets[source].set));
}
// The Tile colours control's previews: each set's panel and rim for players 1–4 (ids 0–3; players 1 and 2 sit in the
// top row, 3 and 4 in the bottom), whichever set is in use.
const strip = (setting, set) => `.tile-sets > [data-set="${setting}"] { ${[0, 1, 2, 3].map(player => {
  const palette = set[ids[player]][player < 2 ? 'top' : 'bottom'];
  return `--strip-${player + 1}: ${palette.panel}; --strip-${player + 1}-rim: ${palette.rim};`;
}).join(' ')} }`;
for (const [setting, source] of [['classic', 'today'], ['soft', 'soft'], ['jewel', 'jewel'], ['clear', 'clear']]) {
  shipped = shipped.replace(new RegExp(`\\.tile-sets > \\[data-set="${setting}"\\] \\{[^}]*\\}`), strip(setting, sets[source].set));
}
if (shipped !== css) writeFileSync(cssPath, shipped);

console.log('| Set | Life total ≥ 9 | Small text ≥ 7.6 | Life-out red ≥ 4.79 | Seat colour on panel ≥ 7.35 | Warning chip ≥ 4.5 | Closest pair: normal | deuteranope | protanope | tritanope | Across rows, deuteranope |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const [k, r] of Object.entries(results)) {
  const nm = pair => pair.split('–').map(id => sets[k].names[ids.indexOf(id)]).join('–');
  const p = v => `${r.pairs[v].d.toFixed(3)} (${nm(r.pairs[v].pair)})`;
  console.log(`| ${sets[k].name} | ${r.life.toFixed(2)} | ${r.small.toFixed(2)} | ${r.lifeOut.toFixed(2)} | ${r.seat.toFixed(2)} | ${r.warnChip.toFixed(2)} | ${p('normal')} | ${p('deutan')} | ${p('protan')} | ${p('tritan')} | ${r.rows.toFixed(3)} |`);
}
console.log('\nFamilies (the closest pair in different families):');
for (const s of Object.values(sets)) {
  const groups = Object.values(Object.groupBy(ids.map((_, i) => i), i => s.families.group[i])).map(g => g.map(i => s.names[i]).join(' · '));
  console.log(`  ${s.name}: ${groups.join(' | ')} (${s.families.score.toFixed(3)})`);
}
console.log('\nClear set:', cvdPicks.map((p, i) => `${sets.clear.names[i]} h${p.h} L${p.l} C${p.c}`).join(', '));
if (failed) { console.error('a set misses a contrast minimum'); process.exitCode = 1; }
