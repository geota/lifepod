// Builds the LifePod logo SVGs, Android vector drawables and PNG exports from one geometry.
// Run from the repo root: node design/logo/build.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const dir = new URL('./', import.meta.url).pathname;
const C = { field: '#283621', outline: '#8da975', accent: '#def09a', ink: '#202914', text: '#f3f1e5', surface: '#141916' };

// Mark grid: 44 units square. Four 19-unit seats, 6-unit gap, outer corner radius 3.6.
// Refined from the shipped art: outline and plus go from 1.433 to 2 units, the plus from 7.31 to 8 units long,
// and the plus is centred exactly in its seat (it sat 0.07 units high).
const SEAT = 19, GAP = 6, R = 3.6, N = 44;
const n = v => +v.toFixed(3);
function roundRect(x, y, w, h, r) {
  return `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`;
}
// A single 12-point cross, so it can be knocked out with even-odd without the bars overlapping.
function cross(cx, cy, len, t) {
  const a = len / 2, b = t / 2;
  const p = [[-b, -a], [b, -a], [b, -b], [a, -b], [a, b], [b, b], [b, a], [-b, a], [-b, b], [-a, b], [-a, -b], [-b, -b]];
  return 'M' + p.map(([x, y]) => `${n(cx + x)} ${n(cy + y)}`).join('L') + 'Z';
}
function geometry({ stroke = 2, plusLen = 8, plusT = 2 } = {}) {
  const hi = SEAT + GAP; // offset of second column/row
  const inset = stroke / 2;
  const outlined = [[0, 0], [0, hi], [hi, hi]]
    .map(([x, y]) => roundRect(x + inset, y + inset, SEAT - stroke, SEAT - stroke, R - inset)).join('');
  const filled = roundRect(hi, 0, SEAT, SEAT, R);
  const plus = cross(hi + SEAT / 2, SEAT / 2, plusLen, plusT);
  return { outlined, filled, plus, stroke };
}

// Colour mark, placed at (x, y) with scale s.
function markGroup(g, x = 0, y = 0, s = 1) {
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})">
    <path d="${g.outlined}" fill="none" stroke="${C.outline}" stroke-width="${g.stroke}"/>
    <path d="${g.filled}" fill="${C.accent}"/>
    <path d="${g.plus}" fill="${C.ink}"/>
  </g>`;
}
function monoGroup(g, color = 'currentColor', x = 0, y = 0, s = 1) {
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})" fill="${color}">
    <path d="${g.outlined}" fill="none" stroke="${color}" stroke-width="${g.stroke}"/>
    <path d="${g.filled}${g.plus}" fill-rule="evenodd"/>
  </g>`;
}
const svg = (w, h, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}">
  <title>${title}</title>
  ${body}
</svg>
`;

const regular = geometry();
const small = geometry({ stroke: 3, plusLen: 10, plusT: 3 }); // 32 px and below: favicons, notification-sized uses

// Wordmark: constructed monoline letters on the same rounded-square logic as the seats.
// Units: cap height 62, x-height 44, stroke 10.5. Bowls are rounded squares, like the seat tiles.
const W = { s: 10.5, cap: 62 };
function wordmark() {
  const s = W.s, h = s / 2, base = 62, xh = 18, r = 9, bw = 42;
  const bowl = (x0, x1, open) => { // open: 'right' leaves the right side for a stem
    const l = x0 + h, rr = x1 - h, t = xh + h, b = base - h;
    return open === 'e'
      ? `M${l} ${(t + b) / 2}H${rr}V${t + r}A${r} ${r} 0 0 0 ${rr - r} ${t}H${l + r}A${r} ${r} 0 0 0 ${l} ${t + r}V${b - r}A${r} ${r} 0 0 0 ${l + r} ${b}H${rr - 4}`
      : open === 'd'
        ? `M${rr} ${t}H${l + r}A${r} ${r} 0 0 0 ${l} ${t + r}V${b - r}A${r} ${r} 0 0 0 ${l + r} ${b}H${rr}`
        : roundRect(l, t, rr - l, b - t, r);
  };
  let x = 0; const parts = []; const fills = [];
  // L
  parts.push(`M${x + h} 0V${base - h}H${x + 35}`); x += 35 + 8;
  // i (dot is a small seat, filled with the accent)
  parts.push(`M${x + h} ${xh}V${base}`); fills.push({ d: roundRect(x, 1, s, s, 2.5), accent: true }); x += s + 6;
  // f
  parts.push(`M${x + 4 + h} ${base}V${h + 10}A10 10 0 0 1 ${x + 4 + h + 10} ${h}H${x + 30}`);
  parts.push(`M${x} ${xh + h}H${x + 26}`); x += 30 + 7;
  // e
  parts.push(bowl(x, x + bw, 'e')); x += bw + 11;
  // P
  parts.push(`M${x + h} ${base}V${h}H${x + 24}A13 13 0 0 1 ${x + 37} ${h + 13}V${h + 21}A13 13 0 0 1 ${x + 24} ${h + 34}H${x + h}`); x += 37 + h + 9;
  // o
  parts.push(bowl(x, x + bw)); x += bw + 9;
  // d
  parts.push(bowl(x, x + bw, 'd')); parts.push(`M${x + bw - h} 0V${base}`); x += bw;
  return { width: x, height: base, parts, fills };
}
const wm = wordmark();
function wordGroup(x, y, s, color = C.text, dot = C.accent) {
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})">
    <path d="${wm.parts.join('')}" fill="none" stroke="${color}" stroke-width="${W.s}" stroke-linejoin="round"/>
    ${wm.fills.map(f => `<path d="${f.d}" fill="${f.accent ? dot : color}"/>`).join('')}
  </g>`;
}

mkdirSync(`${dir}png`, { recursive: true });
const files = {};
files['mark.svg'] = svg(N, N, markGroup(regular), 'LifePod');
files['mark-small.svg'] = svg(N, N, markGroup(small), 'LifePod');
files['mark-mono.svg'] = svg(N, N, monoGroup(regular), 'LifePod');
// App icon: full-bleed field, mark at 60% of the canvas (as the shipped iOS art).
const ICON = 1024, MS = ICON * 0.6 / N;
files['app-icon.svg'] = svg(ICON, ICON, `<rect width="${ICON}" height="${ICON}" fill="${C.field}"/>${markGroup(regular, (ICON - N * MS) / 2, (ICON - N * MS) / 2, MS)}`, 'LifePod app icon');
// Horizontal lockup: mark height = cap height of the wordmark x 1.25, optical gap one seat wide.
{
  const mh = 72, ms = mh / N, ws = (mh * 0.78) / W.cap, gap = SEAT * ms;
  const w = mh + gap + wm.width * ws, h = mh;
  files['lockup-horizontal.svg'] = svg(n(w), h, markGroup(regular, 0, 0, ms) + wordGroup(mh + gap, (mh - W.cap * ws) / 2, ws), 'LifePod');
}
for (const [name, body] of Object.entries(files)) writeFileSync(`${dir}${name}`, body);

// Android adaptive icon layers (108 dp grid, mark at 32..76 as shipped). Copy into android/res/drawable when adopting.
const A = 32;
const tx = d => d.replace(/([MLHVAZ])([^MLHVAZ]*)/g, (m, cmd, args) => {
  const v = args.trim().split(/[ ,]+/).filter(Boolean).map(Number);
  if (cmd === 'H' || cmd === 'V') return cmd + n(v[0] + A);
  if (cmd === 'A') return `A${v[0]},${v[1]} ${v[2]} ${v[3]} ${v[4]} ${n(v[5] + A)},${n(v[6] + A)}`;
  if (cmd === 'Z') return 'Z';
  return cmd + v.map(c => n(c + A)).join(',');
}).replace(/([MLHVA])/g, ' $1').trim();
const vec = body => `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by design/logo/build.mjs: four seats, one highlighted with +. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
${body}</vector>
`;
writeFileSync(`${dir}android/ic_launcher_foreground.xml`, vec(
`    <path android:strokeColor="#8DA975" android:strokeWidth="2" android:pathData="${tx(regular.outlined)}" />
    <path android:fillColor="#DEF09A" android:pathData="${tx(regular.filled)}" />
    <path android:fillColor="#202914" android:pathData="${tx(regular.plus)}" />
`));
writeFileSync(`${dir}android/ic_launcher_monochrome.xml`, vec(
`    <path android:strokeColor="#FFFFFF" android:strokeWidth="2" android:pathData="${tx(regular.outlined)}" />
    <path android:fillColor="#FFFFFF" android:fillType="evenOdd" android:pathData="${tx(regular.filled)} ${tx(regular.plus)}" />
`));

// PNG exports through the repo's Chromium.
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const shoot = async (file, size, out, bg = 'transparent') => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:${bg}}svg{display:block;width:${size}px;height:${size}px}</style>${files[file]}`);
    await page.screenshot({ path: `${dir}png/${out}`, omitBackground: bg === 'transparent' });
  };
  for (const size of [1024, 512, 192]) {
    await shoot('app-icon.svg', size, `app-icon-${size}.png`, C.field);
    await shoot('mark.svg', size, `mark-${size}.png`);
  }
  await shoot('mark-small.svg', 32, 'favicon-32.png', C.field);
} finally {
  await browser.close();
}
console.log('Built logo files in', dir);
