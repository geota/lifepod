// Generates design/dice/shapes.js: flat die geometry on a 100x100 viewBox.
// Run from the repo root: node design/dice/build-shapes.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('./shapes.js', import.meta.url));
const r1 = v => Math.round(v * 10) / 10;
const pt = (x, y) => [r1(x), r1(y)];
const polar = (cx, cy, r, deg) => [cx + r * Math.cos(deg * Math.PI / 180), cy + r * Math.sin(deg * Math.PI / 180)];
// Regular polygon, first vertex straight up, clockwise.
const regular = (cx, cy, r, n, start = -90) => Array.from({ length: n }, (_, i) => polar(cx, cy, r, start + i * 360 / n));
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const centroid = ps => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];

// Light falls from the upper left. Side faces facing it are tone 1, faces turned away tone 3.
const light = [-0.6, -0.8];
function tone(face, centre) {
  const c = centroid(face);
  const d = [c[0] - centre[0], c[1] - centre[1]];
  const len = Math.hypot(...d) || 1;
  const dot = (d[0] * light[0] + d[1] * light[1]) / len;
  return dot > 0.3 ? 1 : dot < -0.3 ? 3 : 2;
}

// Distance from point to segment.
function segDist(p, a, b) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function inside(p, poly) {
  let inn = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inn = !inn;
  }
  return inn;
}
function clearance(p, poly) {
  if (!inside(p, poly)) return -1;
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) m = Math.min(m, segDist(p, poly[i], poly[(i + 1) % poly.length]));
  return m;
}
// Largest number box that fits the front face with a margin. Digits: cap height ~0.72em, and the widest
// label on the die (two tabular digits with -0.04em tracking ~1.12em, one digit ~0.6em).
function fitNumber(face, digits, margin) {
  const w = digits === 2 ? 1.12 : 0.6, h = 0.72;
  let best = { size: 0 };
  const [minX, maxX] = [Math.min(...face.map(p => p[0])), Math.max(...face.map(p => p[0]))];
  const [minY, maxY] = [Math.min(...face.map(p => p[1])), Math.max(...face.map(p => p[1]))];
  const cx = (minX + maxX) / 2;
  for (let cy = minY; cy <= maxY; cy += 0.25) {
    for (let size = 10; size <= 70; size += 0.25) {
      const hw = w * size / 2, hh = h * size / 2;
      const probes = [];
      for (const fx of [-1, -0.5, 0, 0.5, 1]) for (const fy of [-1, 0, 1]) probes.push([cx + fx * hw, cy + fy * hh]);
      if (probes.every(p => clearance(p, face) >= margin)) {
        if (size > best.size) best = { size, cx, cy };
      } else break;
    }
  }
  return best;
}

function fitsAt(face, digits, margin, cx, cy, size) {
  const hw = (digits === 2 ? 1.12 : 0.6) * size / 2, hh = 0.72 * size / 2;
  for (const fx of [-1, -0.5, 0, 0.5, 1]) for (const fy of [-1, 0, 1]) if (clearance([cx + fx * hw, cy + fy * hh], face) < margin) return false;
  return true;
}

// Rounded rectangle as a polygon, arcs sampled every 15 degrees. Clockwise from the top-left arc's end.
function roundedSquare(cx, cy, half, radius) {
  const ps = [];
  const corners = [[cx + half - radius, cy - half + radius, -90], [cx + half - radius, cy + half - radius, 0],
    [cx - half + radius, cy + half - radius, 90], [cx - half + radius, cy - half + radius, 180]];
  for (const [x, y, start] of corners) for (let a = 0; a <= 90; a += 15) ps.push(polar(x, y, radius, start + a));
  return ps;
}

const dice = {};

function bevel(outer, inner, centre) {
  // Outer and inner polygons with the same vertex count and order. Each side face joins one edge of each.
  const faces = [];
  for (let i = 0; i < outer.length; i++) {
    const j = (i + 1) % outer.length;
    faces.push([outer[i], outer[j], inner[j], inner[i]]);
  }
  return faces.map(f => ({ kind: 'side', tone: tone(f, centre), points: f }));
}

// d4: triangle, inset front triangle, bevels.
{
  const side = 96, c = [50, 0];
  const h = side * Math.sqrt(3) / 2;
  const top = 5;
  c[1] = top + h * 2 / 3; // centroid
  const R = side / Math.sqrt(3);
  const outer = regular(c[0], c[1], R, 3);
  const inset = 9; // perpendicular bevel width
  const inner = regular(c[0], c[1], R - 2 * inset, 3); // inradius shrinks by inset, circumradius by 2x
  dice[4] = { outer, front: inner, sides: bevel(outer, inner, c), centre: c, digits: 1 };
}
// d6: rounded square, inset rounded front face, bevels split at the corner diagonals.
{
  const c = [50, 50];
  const outer = roundedSquare(50, 50, 41, 12);
  const inner = roundedSquare(50, 50, 32.5, 6.5);
  // 4 corners x 7 samples. Split each corner arc at its middle sample (index 3).
  const n = 7, faces = [];
  for (let k = 0; k < 4; k++) {
    const from = k * n + 3, to = ((k + 1) * n + 3) % (4 * n);
    const o = [], i = [];
    for (let s = from; ; s = (s + 1) % (4 * n)) { o.push(outer[s]); i.push(inner[s]); if (s === to) break; }
    const f = [...o, ...i.reverse()];
    faces.push({ kind: 'side', tone: tone(f, c), points: f });
  }
  dice[6] = { outer, front: inner, sides: faces, centre: c, digits: 1 };
}
// d8: hexagon; the front triangle joins alternate corners.
{
  const c = [50, 50];
  const hex = regular(50, 50, 48, 6); // 0 top, 1 upper right, 2 lower right, 3 bottom, 4 lower left, 5 upper left
  const front = [hex[0], hex[2], hex[4]];
  const sides = [[hex[0], hex[1], hex[2]], [hex[2], hex[3], hex[4]], [hex[4], hex[5], hex[0]]]
    .map(f => ({ kind: 'side', tone: tone(f, c), points: f }));
  dice[8] = { outer: hex, front, sides, centre: c, digits: 1 };
}
// d10: diamond; kite front face shares the top point, its other corners run out to the outline.
{
  const c = [50, 50];
  const T = [50, 2], R = [97, 54], B = [50, 98], L = [3, 54];
  const kl = [22, 56], kb = [50, 77], kr = [78, 56];
  const outer = [T, R, B, L];
  const front = [T, kr, kb, kl];
  const raw = [[T, R, kr], [R, B, kb, kr], [B, L, kl, kb], [L, T, kl]];
  const tones = [2, 3, 2, 1];
  const sides = raw.map((f, i) => ({ kind: 'side', tone: tones[i], points: f }));
  dice[10] = { outer, front, sides, centre: c, digits: 2 };
}
// d12: pentagon; inner pentagon front face, spokes to the outline corners.
{
  const R = 50;
  const c = [50, 50 + (R - R * Math.cos(Math.PI / 5)) / 2]; // centre the bounding box
  const outer = regular(c[0], c[1], R, 5);
  const inner = regular(c[0], c[1], 31, 5);
  dice[12] = { outer, front: inner, sides: bevel(outer, inner, c), centre: c, digits: 2 };
}
// d20: hexagon; inset front triangle, each corner joined to three outline corners.
{
  const c = [50, 50];
  const hex = regular(50, 50, 48, 6);
  const tri = regular(50, 50, 34.5, 3); // 0 top, 1 lower right, 2 lower left
  const [t0, t1, t2] = tri;
  const [h0, h1, h2, h3, h4, h5] = hex;
  const inner = [[t0, h1, t1], [t1, h3, t2], [t2, h5, t0]]; // across each front edge
  const outerRing = [[t0, h0, h1], [t1, h1, h2], [t1, h2, h3], [t2, h3, h4], [t2, h4, h5], [t0, h5, h0]];
  const sides = [
    ...inner.map(f => ({ kind: 'side', tone: Math.min(3, tone(f, c)), points: f })),
    // The outer ring turns further from the viewer, so it reads a step darker than the faces beside the front.
    ...outerRing.map(f => ({ kind: 'side', tone: Math.min(3, tone(f, c) + 1), points: f })),
  ];
  dice[20] = { outer: hex, front: tri, sides, centre: c, digits: 2 };
}

const margin = { 4: 4, 6: 6, 8: 4, 10: 3, 12: 4, 20: 2.5 };
const cap = 40; // single digits never grow past this, so every die's number reads at a similar size
const data = {};
for (const [n, d] of Object.entries(dice)) {
  const fit = fitNumber(d.front, d.digits, margin[n]);
  const size = Math.min(cap, Math.floor(fit.size));
  // At the final size, centre the box in the band of positions where it still fits.
  const ok = [];
  for (let cy = 0; cy <= 100; cy += 0.25) if (fitsAt(d.front, d.digits, margin[n], fit.cx, cy, size)) ok.push(cy);
  fit.cy = (ok[0] + ok[ok.length - 1]) / 2;
  // Re-centre vertically for the capped size: keep the box centre found by the fit.
  data[n] = {
    sides: Number(n),
    outline: d.outer.map(p => pt(...p)),
    faces: [
      { kind: 'front', tone: 0, points: d.front.map(p => pt(...p)) },
      ...d.sides.map(s => ({ kind: s.kind, tone: s.tone, points: s.points.map(p => pt(...p)) })),
    ],
    number: { x: r1(fit.cx), y: r1(fit.cy), size, baseline: r1(fit.cy + 0.36 * size) },
  };
}

const fmt = ps => '[' + ps.map(p => `[${p[0]}, ${p[1]}]`).join(', ') + ']';
let src = `// LifePod dice geometry. Generated by design/dice/build-shapes.mjs; see design/dice/SPEC.md section 3.
//
// Every die is drawn on a 100 x 100 viewBox, upright, with light from the upper left.
// - outline: the silhouette, clockwise from the top. Stroke it on top of the faces.
// - faces: polygons, painted in order. kind 'front' (tone 0) holds the number; kind 'side' faces carry
//   tone 1 (facing the light), 2 or 3 (turned away). Map tones to --die-front / --die-side-1..3.
// - number: the centre (x, y) of the number's box in the front face, its font size in viewBox units,
//   and the text baseline (y + 0.36 * size) for <text text-anchor="middle" y={baseline}>. The size fits the
//   widest label the die can show (two digits on d10, d12, d20).
// Plain data: build with createElementNS and presentation attributes (points, class); no style attributes.

export const dieSides = [4, 6, 8, 10, 12, 20];

export const dice = {
`;
for (const n of [4, 6, 8, 10, 12, 20]) {
  const d = data[n];
  src += `  ${n}: {\n    sides: ${n},\n    outline: ${fmt(d.outline)},\n    faces: [\n`;
  for (const f of d.faces) src += `      { kind: '${f.kind}', tone: ${f.tone}, points: ${fmt(f.points)} },\n`;
  src += `    ],\n    number: { x: ${d.number.x}, y: ${d.number.y}, size: ${d.number.size}, baseline: ${d.number.baseline} },\n  },\n`;
}
src += `};

// "x1,y1 x2,y2 ..." for a <polygon points> attribute.
export function pointsAttribute(points) {
  return points.map(([x, y]) => \`\${x},\${y}\`).join(' ');
}
`;
writeFileSync(out, src);
for (const n of [4, 6, 8, 10, 12, 20]) console.log(n, JSON.stringify(data[n].number), data[n].faces.map(f => f.tone).join(''));
