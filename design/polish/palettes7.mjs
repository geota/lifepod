// Chrome palettes for the style round (STYLE.md §5). Each replaces the app's :root surface, text and accent tokens; the
// 12 tile palettes stay as they are. `node design/polish/palettes7.mjs` prints the contrast table STYLE.md quotes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const palettes = {
  today: {
    name: 'Today: green-tinted dark, lime accent',
    background: '#141916', surface: '#202720', raised: '#273027', 'surface-pressed': '#354137', border: '#3b473d', 'control-border': '#819084',
    'switch-off': '#38423a', text: '#f3f1e5', 'text-soft': '#d6e1d5', muted: '#bcc7b8', accent: '#def09a', 'accent-pressed': '#c5d882', ink: '#202914',
  },
  graphite: {
    name: 'Graphite + lime: neutral surfaces, the brand lime kept',
    background: '#111213', surface: '#1b1c1e', raised: '#242528', 'surface-pressed': '#303236', border: '#393b40', 'control-border': '#8b8f97',
    'switch-off': '#35373b', text: '#f2f2ef', 'text-soft': '#d8d9dc', muted: '#b3b6bc', accent: '#d9f08a', 'accent-pressed': '#c4dc76', ink: '#1d2608',
  },
  amber: {
    name: 'Graphite + amber: neutral surfaces, a warm accent',
    background: '#111213', surface: '#1b1c1e', raised: '#242528', 'surface-pressed': '#303236', border: '#393b40', 'control-border': '#8b8f97',
    'switch-off': '#35373b', text: '#f2f2ef', 'text-soft': '#d8d9dc', muted: '#b3b6bc', accent: '#f6c560', 'accent-pressed': '#e2b04b', ink: '#2b1d00',
  },
  midnight: {
    name: 'Midnight + ice: blue-black surfaces, a cool accent',
    background: '#0d1117', surface: '#161b22', raised: '#1e252e', 'surface-pressed': '#29323e', border: '#334050', 'control-border': '#8696aa',
    'switch-off': '#2c3543', text: '#eef3f8', 'text-soft': '#d3dce6', muted: '#aab6c4', accent: '#8fd3ff', 'accent-pressed': '#74c1f0', ink: '#04202f',
  },
};

// CSS that applies a palette to the app (and to the mock-up classes, which use the same tokens).
export const paletteCss = key => {
  const p = palettes[key];
  return `:root { ${Object.entries(p).filter(([k]) => k !== 'name').map(([k, v]) => `--${k}: ${v};`).join(' ')} --scrim: ${p.background}d9; }
    body, .app { background: var(--background); }`;
};

// WCAG 2.2 contrast.
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = hex => { const n = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16)); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

// The tile panels, from web/styles.css, for checking chrome that sits on tiles (the pill).
function tilePanels() {
  const css = readFileSync(fileURLToPath(new URL('../../web/styles.css', import.meta.url)), 'utf8');
  return [...css.matchAll(/--([a-z]+)-(top|bottom)-panel:\s*(#[0-9a-f]{6})/g)].map(m => ({ name: `${m[1]}-${m[2]}`, hex: m[3] }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const panels = tilePanels();
  const checks = [
    ['Text on surface', 'text', 'surface', 7], ['Text on background', 'text', 'background', 7], ['Soft text on surface', 'text-soft', 'surface', 7],
    ['Muted text on surface', 'muted', 'surface', 4.5], ['Muted text on raised', 'muted', 'raised', 4.5], ['Ink on accent', 'ink', 'accent', 7],
    ['Accent on surface (icons, focus ring)', 'accent', 'surface', 3], ['Control border on surface', 'control-border', 'surface', 3],
    ['Control border on background', 'control-border', 'background', 3], ['Accent vs raised (selected vs unselected)', 'accent', 'raised', 3],
  ];
  console.log(`| Check (target) | ${Object.keys(palettes).join(' | ')} |\n|---|${Object.keys(palettes).map(() => '---').join('|')}|`);
  for (const [label, a, b, min] of checks) {
    console.log(`| ${label} (≥ ${min}:1) | ${Object.values(palettes).map(p => { const r = ratio(p[a], p[b]); return `${r.toFixed(1)}${r < min ? ' ✗' : ''}`; }).join(' | ')} |`);
  }
  const pill = Object.values(palettes).map(p => {
    const worst = panels.reduce((w, t) => { const r = ratio(p['control-border'], t.hex); return r < w.r ? { r, t: t.name } : w; }, { r: 99, t: '' });
    return `${worst.r.toFixed(1)} (${worst.t})`;
  });
  console.log(`| Pill border on the worst tile panel (≥ 3:1) | ${pill.join(' | ')} |`);
  const seam = Object.values(palettes).map(p => Math.min(...panels.map(t => ratio(p.background, t.hex))).toFixed(2));
  console.log(`| Seam (background) vs the closest tile panel | ${seam.join(' | ')} |`);
}
