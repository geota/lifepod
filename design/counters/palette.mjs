// Builds the tile-colour swatches in OKLCH and checks their contrast. Writes palette.js for mock.js.
// Exits with an error if any of the twelve swatches the app ships (round 3) misses a contrast minimum.
// Run from the repo root: node design/counters/palette.mjs
import { writeFileSync } from 'node:fs';
import { oklchToHex, contrast, hexToRgb, rgbToHex, rgbToOklch } from './oklch.mjs';

// Today's six seat palettes (web/styles.css). Seats 1, 2, 5 sit in the top row, 3, 4, 6 in the bottom row.
const today = [
  { name: 'Sage', hue: 145, row: 'top', panel: '#2f432f', rim: '#556e4e', seat: '#d3eeaa', button: '#233324' },
  { name: 'Sky', hue: 238, row: 'top', panel: '#2c4352', rim: '#517187', seat: '#b6e0f7', button: '#21323e' },
  { name: 'Coral', hue: 27, row: 'bottom', panel: '#432a27', rim: '#7b4f44', seat: '#ffc7b2', button: '#301d1a' },
  { name: 'Violet', hue: 303, row: 'bottom', panel: '#342b41', rim: '#655179', seat: '#e4cff7', button: '#271f32' },
  { name: 'Amber', hue: 90, row: 'top', panel: '#4a4024', rim: '#7f6d49', seat: '#f6de96', button: '#362e16' },
  { name: 'Teal', hue: 184, row: 'bottom', panel: '#1d3a36', rim: '#3f675d', seat: '#b4eddd', button: '#142925' },
];
// Six new hues fill the gaps between today's, plus one near-neutral.
const added = [
  { name: 'Rose', hue: 352 }, { name: 'Orange', hue: 58 }, { name: 'Lime', hue: 118 },
  { name: 'Cyan', hue: 212 }, { name: 'Indigo', hue: 270 }, { name: 'Slate', hue: 250, neutral: true },
];
// Lightness per role, averaged from today's palettes in each row. Chroma likewise.
const L = {
  top: { panel: 0.368, rim: 0.528, seat: 0.900, button: 0.305 },
  bottom: { panel: 0.316, rim: 0.475, seat: 0.887, button: 0.258 },
};
const C = { panel: 0.040, rim: 0.058, seat: 0.072, button: 0.033 };
const CN = { panel: 0.012, rim: 0.018, seat: 0.022, button: 0.010 };

function build(hue, row, neutral, k = 1) {
  const out = {};
  for (const role of ['panel', 'rim', 'seat', 'button']) out[role] = oklchToHex([L[row][role], (neutral ? CN : C)[role] * k, hue]);
  return out;
}
const swatches = [...today, ...added].map(s => {
  const top = s.row === 'top' ? pick(s) : build(s.hue, 'top', s.neutral);
  const bottom = s.row === 'bottom' ? pick(s) : build(s.hue, 'bottom', s.neutral);
  return { name: s.name, hue: s.hue, top, bottom };
});
function pick({ panel, rim, seat, button }) { return { panel, rim, seat, button }; }

const text = '#f3f1e5', soft = '#d6e1d5', out = '#f49993', warn = '#f2c46d';
const rows = [];
let worst = Infinity;
for (const s of swatches) {
  for (const row of ['top', 'bottom']) {
    const p = s[row];
    const checks = {
      life: contrast(text, p.panel), small: contrast(soft, p.panel), lifeOut: contrast(out, p.panel),
      warn: contrast(warn, p.panel), pressed: contrast(p.button, p.seat), glyph: contrast(p.seat, p.button),
    };
    worst = Math.min(worst, ...Object.values(checks));
    rows.push({ name: s.name, row, ...p, ...Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, +v.toFixed(2)])) });
  }
}
// Round 2: nine swatches. Today's six, then the hues furthest from them in OKLab, with extra chroma (k) so
// their panels sit at least as far from today's as today's own closest pair (Sage–Teal, 0.027).
const r2Added = [
  { name: 'Rose', hue: 345, k: 1.6 }, { name: 'Indigo', hue: 275, k: 1.8 }, { name: 'Slate', hue: 250, neutral: true },
];
const r2Swatches = [...today.map(s => swatches.find(w => w.name === s.name)), ...r2Added.map(s => ({
  name: s.name, hue: s.hue, top: build(s.hue, 'top', s.neutral, s.k), bottom: build(s.hue, 'bottom', s.neutral, s.k),
}))];
// Browser compositing of a translucent colour over an opaque one, in sRGB.
const over = (top, alpha, bottom) => {
  const [a, b] = [hexToRgb(top), hexToRgb(bottom)];
  return rgbToHex(a.map((v, i) => v * alpha + b[i] * (1 - alpha)));
};
const chipBg = p => over('#0a0e0b', 0x70 / 255, p);
const r2Rows = [];
let r2Worst = Infinity;
for (const s of r2Swatches) {
  for (const row of ['top', 'bottom']) {
    const p = s[row];
    const chip = chipBg(p.panel);
    const checks = {
      life: contrast(text, p.panel), small: contrast(soft, p.panel), lifeOut: contrast(out, p.panel), warn: contrast(warn, p.panel),
      pressed: contrast(p.button, p.seat), chipText: contrast(text, chip),
      // Round 2 lethal treatment: tinted text on the chip, with a 16% tint of the same colour behind it.
      warnChip: contrast(warn, over(warn, 0.16, chip)), outChip: contrast(out, over(out, 0.16, chip)),
    };
    r2Worst = Math.min(r2Worst, ...Object.values(checks));
    r2Rows.push({ name: s.name, row, ...p, ...Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, +v.toFixed(2)])) });
  }
}
console.table(r2Rows.map(({ rim, button, ...r }) => r));
console.log('round 2 worst', r2Worst.toFixed(2));

// Round 3 (design/polish/SPEC.md §5): twelve swatches. The nine above, then three hues where the hue circle has
// gaps: Copper, Olive and Orchid. Each gets the chroma (k) that puts its panel at least as far in OKLab from every
// other panel in its row as the nine's own closest pair (Sky–Slate 0.028 on top, Sage–Teal 0.027 below). Orchid
// sits at 320° rather than 330°: at 330° it is never further than 0.025 from Rose without an overripe panel.
const r3Added = [
  { name: 'Copper', hue: 55, k: 1.4 }, { name: 'Olive', hue: 120, k: 1.6 }, { name: 'Orchid', hue: 320, k: 1.8 },
];
const r3Swatches = [...r2Swatches, ...r3Added.map(s => ({
  name: s.name, hue: s.hue, top: build(s.hue, 'top', false, s.k), bottom: build(s.hue, 'bottom', false, s.k),
}))];
const toLab = (hex) => {
  const [l, c, h] = rgbToOklch(hexToRgb(hex));
  return [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
};
const labDistance = (a, b) => Math.hypot(...toLab(a).map((v, i) => v - toLab(b)[i]));
// The contrast every tile palette must keep (web/styles.css): the life total, small text and the red of a life
// total at 0 or below, on the panel.
const minimums = { life: 9, small: 7.6, lifeOut: 4.79 };
const r3Rows = [];
const failures = [];
for (const s of r3Swatches) {
  for (const row of ['top', 'bottom']) {
    const p = s[row];
    const chip = chipBg(p.panel);
    const checks = {
      life: contrast(text, p.panel), small: contrast(soft, p.panel), lifeOut: contrast(out, p.panel), warn: contrast(warn, p.panel),
      pressed: contrast(p.button, p.seat), chipText: contrast(text, chip),
      warnChip: contrast(warn, over(warn, 0.16, chip)), outChip: contrast(out, over(out, 0.16, chip)),
    };
    for (const [check, minimum] of Object.entries(minimums)) {
      if (checks[check] < minimum) failures.push(`${s.name} ${row}: ${check} ${checks[check].toFixed(2)} < ${minimum}`);
    }
    const nearest = Math.min(...r3Swatches.filter(other => other !== s).map(other => labDistance(p.panel, other[row].panel)));
    r3Rows.push({ name: s.name, row, ...p, ...Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, +v.toFixed(2)])), nearest: +nearest.toFixed(4) });
  }
}
console.table(r3Rows.map(({ rim, button, ...r }) => r));
for (const failure of failures) console.error('FAIL', failure);
if (failures.length) process.exitCode = 1;
// The new palettes as web/styles.css custom properties.
for (const s of r3Swatches.slice(r2Swatches.length)) {
  const id = s.name.toLowerCase();
  for (const row of ['top', 'bottom']) {
    console.log(['panel', 'rim', 'seat', 'button'].map(role => `--${id}-${row}-${role}: ${s[row][role]};`).join(' '));
  }
}
const data = JSON.stringify({
  swatches, checks: rows, worst: +worst.toFixed(2), r2: { swatches: r2Swatches, checks: r2Rows, worst: +r2Worst.toFixed(2) },
  r3: { swatches: r3Swatches, checks: r3Rows, minimums },
}, null, 1);
writeFileSync(new URL("./palette.js", import.meta.url), `// Generated by palette.mjs. Do not edit.\nexport default ${data};\n`);
console.table(rows.map(r => ({ name: r.name, row: r.row, panel: r.panel, seat: r.seat, life: r.life, small: r.small, lifeOut: r.lifeOut, warn: r.warn, pressed: r.pressed, glyph: r.glyph })));
console.log('worst', worst.toFixed(2));
