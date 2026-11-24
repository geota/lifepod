// Final cross-size design review (design/polish/FINAL-REVIEW.md). Opens the shipped app (web/index.html) with seeded
// games, drives every mode and dialog, saves screenshots, and measures each state for:
//   overlaps between a tile's parts, content clipped by its tile or under the centre pill, targets under 44px,
//   sizes that differ between tiles, text cut off, contrast under 4.5:1 (3:1 for large text and icons),
//   controls without an accessible name, and sheets that scroll.
// Nothing here changes web/ or tests/. Run from the repo root:
//   node design/polish/final-review.mjs            screenshots and the full sweep
//   node design/polish/final-review.mjs --shots    screenshots only
//   node design/polish/final-review.mjs --sweep    sweep only
// Screenshots go to design/polish/renders/final/ at 2× (or the largest scale under 1800px wide). The sweep writes
// renders/final/findings.json (every problem, with its style, size, seed and mode) and prints a summary. The sweep runs in
// both styles (the Style setting: Material and Glass, design/polish/STYLE.md) and at every Badge size (Settings → Table:
// the board at rest, rotating seats and with turn reminders, where the badge rows show, at Large and Larger); the
// screenshots are Material, plus a set in Glass named glass-… and the target's 3- and 5-player boards with mana
// floating at each Badge size, named …-badge-<size>.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { fakeScreenOrientation, turnScreen } from '../../tests/helpers.mjs';
import { serveApp } from '../../scripts/serve.mjs';
import { readStyles } from '../../scripts/stylesheets.mjs';
import { inPage } from './lib.mjs';

const outDir = fileURLToPath(new URL('./renders/final/', import.meta.url));
const args = new Set(process.argv.slice(2));
const doShots = !args.has('--sweep');
const doSweep = !args.has('--shots');
// Run as a script; tests/design.test.mjs imports it only for its snippets.
if (import.meta.main) await mkdir(outDir, { recursive: true });
// The app over http. The internals it drives come from the page's own modules (inPage in lib.mjs).
const server = import.meta.main ? await serveApp() : null;
const app = server?.url;

// Sizes in CSS px, as the window is. Portrait windows report a portrait screen (angle 0), the rest landscape (90).
const styles = ['material', 'glass'];
const sizes = {
  target: { width: 952, height: 427, label: 'Pixel 11 Pro, 952 × 427 (target)' },
  phone: { width: 852, height: 393, label: 'Phone, 852 × 393' },
  small: { width: 640, height: 360, label: 'Smallest real phone, 640 × 360' },
  stress: { width: 568, height: 320, label: 'Stress, 568 × 320' },
  se: { width: 375, height: 667, label: 'iPhone SE portrait, 375 × 667' },
  tiny: { width: 320, height: 568, label: 'Small portrait, 320 × 568' },
  fold: { width: 841, height: 701, label: 'Foldable inner, 841 × 701' },
  tablet: { width: 1366, height: 1024, label: 'Tablet, 1366 × 1024' },
};

// ---------------------------------------------------------------------------------------------------------------
// Seeds. Each takes a player count and returns a saved game (the shape loadGame() in web/js/logic/save.js reads).
const pick = (list, count) => Array.from({ length: count }, (_, i) => list[i % list.length]);
const zeros = count => Array(count).fill(0);
const noPools = count => Array.from({ length: count }, () => zeros(6));
const base = count => ({
  startingLife: 40, scores: pick([40, 33, 27, 38, 19, 35], count), rotations: zeros(count), keepAwake: true, landscapeAngle: 90,
  colors: Array.from({ length: count }, (_, i) => i),
  counters: { commander: false, poison: false, energy: false, experience: false, rad: false, monarch: false, initiative: false },
  monarch: null, initiative: null,
  poison: zeros(count), casts: zeros(count), energy: zeros(count), experience: zeros(count), rad: zeros(count),
  identities: zeros(count).map(() => ''), identity: { show: { indicator: true, symbol: false, name: true }, background: 'symbol' },
  commanderDamage: Array.from({ length: count }, () => zeros(count)),
  manaPool: false, autoEmpty: true, pools: noPools(count), turns: 'off', turn: { first: null, active: null, round: 1 },
});
// Long names on purpose: Ink-Treader, Glint-Eye, Dune-Brood.
const identities = ['WURG', 'UB', 'UBRG', 'BG', 'WBRG', 'RG'];
// Commander damage from every opponent: 16 (a warning), 12, 8, 3 and 1. lethalOn puts 21 on one player.
const damageFrom = (count, lethalOn = null) => Array.from({ length: count }, (_, d) => Array.from({ length: count }, (_, a) => (d === a ? 0
  : d === lethalOn && a === (d + 1) % count ? 21 : [16, 12, 8, 3, 1][(d + a) % 5])));

const seeds = {
  // Everything on: every counter with two-digit counts, three-digit and negative totals, a player out on poison,
  // commander damage from every opponent, the full chip, Turn by turn, mana floating in two pools, the monarch on the
  // busiest row and the initiative with Player 2, who is out and hasn't passed it on ("Pass it on").
  everything: count => ({
    ...base(count),
    scores: pick([112, -3, 27, 5, 40, 19], count),
    counters: { commander: true, poison: true, energy: true, experience: true, rad: true, monarch: true, initiative: true },
    monarch: 0, initiative: 1,
    poison: pick([0, 10, 7, 2, 1, 9], count), casts: pick([1, 2, 0, 5, 1, 3], count),
    energy: pick([12, 2, 0, 8, 11, 3], count), experience: pick([10, 0, 1, 0, 13, 1], count), rad: pick([14, 0, 0, 2, 0, 16], count),
    identities: pick(identities, count), identity: { show: { indicator: true, symbol: true, name: true }, background: 'symbol' },
    commanderDamage: damageFrom(count),
    turns: 'turns', turn: { first: 0, active: count > 2 ? 2 : 0, round: 12 },
    manaPool: true, pools: Array.from({ length: count }, (_, i) => (i === 0 ? [1, 0, 2, 3, 0, 1] : i === 3 ? [0, 0, 0, 0, 4, 0] : zeros(6))),
  }),
  // A plain game: nothing tracked, no identity shown.
  minimal: count => ({ ...base(count), scores: pick([40, 40, 40, 40, 40, 40], count), identity: { show: { indicator: false, symbol: false, name: false }, background: 'off' } }),
  // A typical Commander night: commander and poison, the default chip, Rounds, single-digit counts.
  commander: count => ({
    ...base(count), counters: { commander: true, poison: true, energy: false, experience: false, rad: false, monarch: true, initiative: false },
    monarch: count - 1,
    poison: pick([0, 3, 0, 1, 0, 0], count), casts: pick([1, 0, 2, 0, 1, 0], count),
    identities: pick(['WUB', 'RG', 'WURG', 'B', 'WUBRG', 'UG'], count), commanderDamage: damageFrom(count).map(row => row.map(v => (v > 12 ? 0 : v))),
    turns: 'rounds', turn: { first: 1 % count, active: 1 % count, round: 4 },
  }),
  // Counters without commander: symbol-only chip, indicator background, mana floating, turns off.
  counters: count => ({
    ...base(count), counters: { commander: false, poison: true, energy: true, experience: true, rad: true },
    poison: pick([1, 0, 4, 0, 2, 0], count), energy: pick([3, 5, 0, 1, 0, 2], count), experience: pick([0, 2, 1, 0, 3, 0], count), rad: pick([0, 0, 6, 0, 0, 1], count),
    identities: pick(['G', 'WU', 'BRG', 'WUBR', 'R', 'UBG'], count), identity: { show: { indicator: false, symbol: true, name: false }, background: 'indicator' },
    manaPool: true, pools: Array.from({ length: count }, (_, i) => (i % 2 ? [0, 2, 0, 0, 0, 0] : [3, 3, 3, 3, 3, 3])),
  }),
  // Rotated seats, name-only chip, Rounds, a 3-digit total, a player out on commander damage.
  rotated: count => ({
    ...base(count), scores: pick([140, 22, 0, 31, 8, 26], count), rotations: pick([1, 2, 3, 0, 1, 3], count),
    counters: { commander: true, poison: false, energy: false, experience: false, rad: false }, casts: pick([2, 0, 1, 0, 0, 3], count),
    identities: pick(['WR', 'UBRG', 'WUBRG', 'G', 'WBG', 'URG'], count), identity: { show: { indicator: false, symbol: false, name: true }, background: 'off' },
    commanderDamage: damageFrom(count, count - 1), turns: 'rounds', turn: { first: 0, active: 0, round: 9 },
  }),
  // Turn by turn with nobody's turn yet (every tile offers to start), indicator + symbol chip, background symbol.
  startTurns: count => ({
    ...base(count), counters: { commander: true, poison: true, energy: true, experience: false, rad: false },
    poison: pick([0, 0, 2, 0, 0, 0], count), energy: pick([4, 0, 0, 1, 0, 0], count),
    identities: pick(['WUG', 'UB', 'WBR', 'RG', 'W', 'UBRG'], count), identity: { show: { indicator: true, symbol: true, name: false }, background: 'symbol' },
    turns: 'turns', turn: { first: null, active: null, round: 1 }, manaPool: true,
  }),
};

// Mana floating in every pool, one to four colours, on the busiest board: the strip on its own row above the near row
// on every tile.
seeds.floating = count => ({
  ...seeds.everything(count),
  pools: Array.from({ length: count }, (_, i) => [[0, 2, 0, 0, 0, 0], [1, 0, 0, 3, 0, 0], [0, 0, 2, 1, 4, 0], [2, 1, 0, 3, 0, 1]][i % 4]),
});
const badgeSizes = ['default', 'large', 'larger'];

// The eight "Show on tiles" combinations.
const showCombos = [[], ['indicator'], ['symbol'], ['name'], ['indicator', 'symbol'], ['indicator', 'name'], ['symbol', 'name'], ['indicator', 'symbol', 'name']];
const withShow = (game, parts, background = game.identity.background) => ({
  ...game, identity: { show: Object.fromEntries(['indicator', 'symbol', 'name'].map(p => [p, parts.includes(p)])), background },
});

// ---------------------------------------------------------------------------------------------------------------
// Modes and dialogs. Each opens its state from the board at rest. They click through the real controls.
// Real touch taps, so focus rings show only where a touch would show them. A control that can't be tapped where it
// is (covered, or outside the window) is clicked instead.
const click = async (page, selector) => {
  const target = page.locator(selector).first();
  try {
    await target.tap({ timeout: 1500 });
  } catch {
    await target.evaluate(el => el.click());
  }
};
const openSetup = page => click(page, '#setup-button');
// The page code the modes run, for tests/design.test.mjs.
const remindersJs = "game.scores.forEach((_, index) => remind(index, index % 2 ? 'initiative' : 'monarch'));";
export const snippets = () => ({ reminders: { js: remindersJs } });
const modes = {
  rest: async () => {},
  damage: page => click(page, '#damage-button'),
  counters: page => click(page, '#counters-button'),
  mana: page => click(page, '#mana-button'),
  colours: async (page) => { await openSetup(page); await click(page, '#tile-colours'); },
  identity: async (page) => { await openSetup(page); await click(page, '#choose-identities'); },
  rotate: async (page) => { await openSetup(page); await click(page, '#rotate-seats'); },
  // "Who goes first?": a game with no first player and Turns off, then Turns to Rounds in settings and close.
  first: async (page, game) => {
    await load(page, { ...game, turns: 'off', turn: { first: null, active: null, round: 1 } });
    await openSetup(page);
    await click(page, '#turn-choices [data-turns="off"]'); await click(page, '#turn-choices [data-turns="rounds"]');
    await click(page, '#settings-close');
  },
  dice: page => click(page, '#dice-button'),
  // Turn reminders on every tile, the monarch's and the initiative's in turn (remind() from the page's modules).
  reminders: page => page.evaluate(inPage(remindersJs)),
  // Settings (design/polish/SETTINGS-SPEC.md): at the top, scrolled to the end, with a new game pending, with the life
  // field open, and turned to face the other side.
  settings: openSetup,
  'settings-end': async (page) => { await openSetup(page); await page.locator('#settings-body').evaluate((body) => { body.scrollTop = body.scrollHeight; }); },
  'settings-pending': async (page) => { await openSetup(page); await click(page, '#player-choices [value="6"]'); await click(page, '#life-presets [data-life="30"]'); },
  'settings-edit': async (page) => { await openSetup(page); await click(page, '#life-edit'); },
  'settings-flipped': async (page) => { await openSetup(page); await click(page, '#settings-flip'); },
  'new-game': async (page) => { await openSetup(page); await click(page, '#restart-button'); },
  // Discard: one edit in counters mode, then ✕.
  discard: async (page) => {
    await click(page, '#counters-button');
    await click(page, '.counter-cell');
    await click(page, '#cancel-button');
  },
};
// Which modes a seed can show.
const available = (mode, game) => ({
  damage: game.counters.commander,
  counters: Object.values(game.counters).some(Boolean),
  mana: game.manaPool,
  discard: Object.values(game.counters).some(Boolean),
  reminders: game.turns === 'turns' && game.counters.monarch && game.counters.initiative,
}[mode] ?? true);

// ---------------------------------------------------------------------------------------------------------------
// The audit, run in the page. Returns { problems: [{ kind, detail }], facts }.
function audit() {
  const problems = [];
  const add = (kind, detail) => problems.push({ kind, detail });
  const hiddenByClip = el => el.closest('.visually-hidden');
  const visible = el => el.isConnected && !hiddenByClip(el) && el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })
    && el.getClientRects().length > 0 && (el.getBoundingClientRect().width > 0.5);
  const rect = el => el.getBoundingClientRect();
  const overlapArea = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const overlaps = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const inside = (a, b) => a.left >= b.left - 1 && a.top >= b.top - 1 && a.right <= b.right + 1 && a.bottom <= b.bottom + 1;
  const name = (el) => {
    const cls = typeof el.className === 'string' ? el.className : el.className?.baseVal ?? '';
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls.trim().split(/\s+/).join('.')}` : ''}`;
  };
  const tileOf = el => el.closest('.player');
  const who = el => (tileOf(el) ? `P${[...document.querySelectorAll('#board > .player')].indexOf(tileOf(el)) + 1} ` : '');
  const px = n => Math.round(n * 10) / 10;

  // Colour maths: any CSS colour to sRGB through a canvas, then WCAG contrast.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = (css) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    ctx.globalCompositeOperation = 'copy';
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, bottom) => {
    const a = top[3] + bottom[3] * (1 - top[3]);
    if (!a) return [0, 0, 0, 0];
    return [0, 1, 2].map(i => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a).concat(a);
  };
  const lum = ([r, g, b]) => {
    const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const backgroundOf = (el) => {
    const layers = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const style = getComputedStyle(node);
      // A ::before drawn behind the content (the pill and its discs) is part of the background.
      const before = getComputedStyle(node, '::before');
      if (before.content !== 'none' && before.position === 'absolute') {
        const b = rgba(before.backgroundColor);
        if (b[3] > 0) layers.push(b);
        if (b[3] >= 0.999) break;
      }
      const c = rgba(style.backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 0.999) break;
      if (node.tagName === 'DIALOG') break;
    }
    layers.push(rgba(getComputedStyle(document.documentElement).backgroundColor));
    return layers.reduceRight((acc, layer) => over(layer, acc), [0, 0, 0, 1]);
  };
  const opacityOf = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };

  const dialog = document.querySelector('dialog[open]');
  const scope = dialog ?? document.querySelector('main');
  const facts = { dialog: dialog?.id ?? null, mode: document.querySelector('#board').dataset.mode ?? null, drop: document.querySelector('#board').dataset.drop ?? '' };
  facts.focus = document.activeElement ? `${name(document.activeElement)} "${document.activeElement.getAttribute('aria-label') ?? document.activeElement.textContent.trim().slice(0, 30)}"` : null;

  // 1. Targets under 44px. The life halves' touch area is the ::after half; turn chips have a 64 × 44 ::after.
  const targets = [...scope.querySelectorAll('button, [role="switch"], label.switch-row, input:not([type="checkbox"])')]
    .filter(el => visible(el) && !el.closest('[inert]') && !el.matches('.switch-row input'));
  for (const el of targets) {
    let w = el.offsetWidth, h = el.offsetHeight;
    const after = getComputedStyle(el, '::after');
    if (after.content !== 'none' && after.position === 'absolute' && !el.matches('.pill-button')) {
      w = Math.max(w, parseFloat(after.width) || 0); h = Math.max(h, parseFloat(after.height) || 0);
    }
    if (el.matches('.controls button')) { const face = el.closest('.player-face'); w = face.offsetWidth / 2; h = face.offsetHeight; }
    if (w < 43.5 || h < 43.5) add('target', `${who(el)}${name(el)} ${px(w)}×${px(h)}`);
  }

  // 2. Accessible names for every visible control.
  for (const el of targets) {
    const label = el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent)
      || (el.labels?.[0]?.textContent) || [...el.childNodes].map(n => (n.nodeType === 3 ? n.textContent : n.getAttribute?.('aria-hidden') === 'true' ? '' : n.textContent)).join('');
    if (!label?.trim()) add('name', `${who(el)}${name(el)} has no accessible name`);
  }

  // 3. Text cut off, and text outside its tile or sheet.
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const texts = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim() || !node.parentElement) continue;
    const parent = node.parentElement;
    // Text squeezed to nothing by its neighbours (it renders, but in a box with no width).
    if (!visible(parent) && parent.isConnected && !hiddenByClip(parent) && parent.checkVisibility({ visibilityProperty: true })
        && parent.getClientRects().length && parent.offsetWidth === 0 && parent.scrollWidth > 0 && !parent.closest('[hidden]')) {
      add('clip', `${who(parent)}${name(parent)} "${node.textContent.trim().slice(0, 24)}" is squeezed to 0px wide`);
      continue;
    }
    if (!visible(parent)) continue;
    // Hidden on purpose by a clipped 1px box.
    if (getComputedStyle(node.parentElement).clipPath.startsWith('inset(50%')) continue;
    texts.push(node);
  }
  for (const node of texts) {
    const el = node.parentElement;
    const range = document.createRange();
    range.selectNodeContents(node);
    const box = range.getBoundingClientRect();
    if (!box.width) continue;
    const frame = tileOf(el) ?? el.closest('dialog') ?? document.documentElement;
    let frameBox = frame === document.documentElement ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight } : rect(frame);
    // The settings body scrolls, so text above or below the part in view isn't cut off; only its sideways fit counts.
    const scroller = el.closest('.fs-body');
    if (scroller) frameBox = { left: rect(scroller).left, right: rect(scroller).right, top: -Infinity, bottom: Infinity };
    // A sheet that scrolls with a cue at the bottom (About) shows the rest when scrolled; that's covered by the scroll check.
    const cued = frame.matches?.('dialog') && frame.querySelector('.scroll-cue[data-more]') && box.left >= frameBox.left - 1 && box.right <= frameBox.right + 1;
    if (!inside(box, frameBox) && !cued) add('clip', `${who(el)}${name(el)} text "${node.textContent.trim().slice(0, 24)}" runs outside its ${tileOf(el) ? 'tile' : 'sheet'}`);
    for (let n = el; n && n !== frame; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.overflow !== 'visible' || s.textOverflow === 'ellipsis') {
        if (n.scrollWidth > n.clientWidth + 1 && !n.matches('.player-face, dialog, .sheet')) add('clip', `${who(el)}${name(n)} cuts its text "${n.textContent.trim().slice(0, 24)}" (${n.scrollWidth} > ${n.clientWidth}px)`);
        break;
      }
    }
  }

  // 4. Contrast: text, then icons (3:1). The lowest ratio found is kept as a fact.
  const seen = new Set();
  let lowest = { ratio: 99 };
  const keep = (c, el) => { if (c < lowest.ratio) lowest = { ratio: Math.round(c * 100) / 100, what: `${who(el)}${name(el)}` }; };
  for (const node of texts) {
    const el = node.parentElement;
    if (seen.has(el) || el.closest('[aria-hidden="true"].watermark') || el.matches('.die-number')) continue;
    seen.add(el);
    const style = getComputedStyle(el);
    const disabled = el.closest('button:disabled, [aria-disabled="true"]');
    const fg = rgba(style.color);
    fg[3] *= opacityOf(el);
    const bg = backgroundOf(el);
    const c = ratio(over(fg, bg), bg);
    const size = parseFloat(style.fontSize), weight = Number(style.fontWeight);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    if (!disabled) keep(c, el);
    if (c < need && !disabled) add('contrast', `${who(el)}${name(el)} "${node.textContent.trim().slice(0, 20)}" ${c.toFixed(2)}:1 at ${px(size)}px (needs ${need})`);
  }
  for (const el of scope.querySelectorAll('.icon, .mana-icon, .id-symbol')) {
    // A dimmed control (disabled, or aria-disabled like Undo with nothing to undo) is exempt, as for text (WCAG 1.4.11).
    if (!visible(el) || el.closest('.watermark, .pip, .ci, :disabled, [aria-disabled="true"], .die-icon') || el.closest('[hidden]')) continue;
    const fg = rgba(getComputedStyle(el).color);
    fg[3] *= opacityOf(el);
    // From the icon itself, so an icon on its own disc (the mana button's pip) is measured on the disc.
    const bg = backgroundOf(el);
    const c = ratio(over(fg, bg), bg);
    keep(c, el);
    if (c < 3) add('contrast', `${who(el)}${name(el)} icon in ${name(el.parentElement)} ${c.toFixed(2)}:1 (needs 3)`);
  }

  facts.lowestContrast = lowest;
  // 5. Sheets: no scrolling, and inside the window.
  if (dialog) {
    const box = rect(dialog);
    const cue = dialog.querySelector('.scroll-cue');
    if (dialog.scrollHeight > dialog.clientHeight + 1) {
      // A sheet may scroll only with its cue showing (design/polish/FINAL-REVIEW.md #20).
      if (!cue) add('scroll', `#${dialog.id} scrolls: ${dialog.scrollHeight}px of content in ${dialog.clientHeight}px`);
      else if (!cue.hasAttribute('data-more') || getComputedStyle(cue, '::before').opacity === '0') add('scroll', `#${dialog.id} scrolls with no cue that there's more`);
      else facts.scrollCue = `${dialog.scrollHeight}px in ${dialog.clientHeight}px, cue shown`;
    }
    if (!inside(box, { left: 0, top: 0, right: innerWidth, bottom: innerHeight })) add('clip', `#${dialog.id} runs outside the window`);
    facts.sheet = `${px(box.width)}×${px(box.height)}`;
    return { problems, facts };
  }

  // 6. The board: overlaps between a tile's parts, clipping, the pill, and sizes that differ between tiles.
  const players = [...document.querySelectorAll('#board > .player')];
  const pill = document.querySelector('#board-controls');
  const pillBox = (() => {
    const b = rect(pill); const inset = parseFloat(getComputedStyle(pill, '::before').top) || 6;
    return { left: b.left + inset, right: b.right - inset, top: b.top + inset, bottom: b.bottom - inset };
  })();
  const groups = {
    score: '.controls .score',
    out: '.controls .out-tag',
    glyphs: '.controls button .icon',
    near: '.badges.near > *',
    far: '.badges.far > *',
    strip: '.mana-strip > *, .mana-far > *',
    // A turn reminder sits above the near edge, clear of the total and the glyphs, or takes the near edge for its 3 seconds.
    reminder: '.reminders > *',
    layer: '.mode-layer button, .mode-layer .layer-hint, .mode-layer .identity-preview > *, .mode-layer .map-cell',
    rotate: '.rotate-badge',
  };
  const pairs = [['score', 'near'], ['score', 'far'], ['score', 'strip'], ['score', 'glyphs'], ['glyphs', 'near'], ['glyphs', 'far'], ['glyphs', 'strip'], ['near', 'far'], ['strip', 'far'],
    ['out', 'near'], ['out', 'far'], ['out', 'strip'], ['strip', 'near'],
    ['reminder', 'score'], ['reminder', 'glyphs'], ['reminder', 'out'], ['reminder', 'far'], ['reminder', 'strip']];
  const sizesBy = {};
  const note = (key, value) => { (sizesBy[key] ??= []).push(value); };
  for (const player of players) {
    const tile = rect(player);
    const parts = Object.fromEntries(Object.entries(groups).map(([g, sel]) => [g, [...player.querySelectorAll(sel)].filter(visible)]));
    for (const [a, b] of pairs) {
      for (const x of parts[a]) for (const y of parts[b]) {
        if (overlaps(rect(x), rect(y))) add('overlap', `${who(player)}${a} ${name(x)} overlaps ${b} ${name(y)} by ${px(overlapArea(rect(x), rect(y)))}px²`);
      }
    }
    // Mode layer parts must not overlap each other.
    const layer = parts.layer;
    for (let i = 0; i < layer.length; i++) for (let j = i + 1; j < layer.length; j++) {
      if (layer[i].contains(layer[j]) || layer[j].contains(layer[i])) continue;
      if (overlaps(rect(layer[i]), rect(layer[j]))) add('overlap', `${who(player)}${name(layer[i])} overlaps ${name(layer[j])}`);
    }
    for (const el of Object.values(parts).flat()) {
      const box = rect(el);
      if (!inside(box, tile)) add('clip', `${who(player)}${name(el)} is cut by its tile (${px(box.left - tile.left)},${px(box.top - tile.top)} ${px(box.width)}×${px(box.height)} in ${px(tile.width)}×${px(tile.height)})`);
      if (visible(pill) && overlaps(box, pillBox) && !el.matches('.mode-layer .layer-hint')) add('pill', `${who(player)}${name(el)} sits under the centre pill (${px(overlapArea(box, pillBox))}px²)`);
    }
    const num = (sel, prop = 'fontSize', pseudo) => { const el = [...player.querySelectorAll(sel)].find(visible); return el ? parseFloat(getComputedStyle(el, pseudo)[prop]) : null; };
    const width = (sel) => { const el = [...player.querySelectorAll(sel)].find(visible); return el ? el.offsetWidth : null; };
    note('life total', num('.score'));
    note('± glyph', (() => { const el = [...player.querySelectorAll('.controls button .icon')].find(visible); return el ? el.getBoundingClientRect().width : null; })());
    note('near badges', num('.badges.near'));
    note('far badges', num('.badges.far'));
    note('strip type', num('.mana-strip'));
    note('counter cell', width('.counter-cell'));
    // A seat's short side: the map draws the table as this player sees it, so seats turn with the tile.
    note('map seat', (() => { const el = [...player.querySelectorAll('.map-cell:not(.self)')].find(visible); return el ? Math.min(el.offsetWidth, el.offsetHeight) : null; })());
    note('swatch', width('.swatch'));
    note('identity toggle', width('.identity-toggle'));
    note('Me first', width('.first-go'));
    note('turn chip', num('.turn-chip'));
    // The life total's text must fit between the glyphs.
    const score = player.querySelector('.score');
    if (visible(score) && score.scrollWidth > score.clientWidth + 1) add('clip', `${who(player)}life total "${score.value}" is wider than its box`);
  }
  for (const [key, values] of Object.entries(sizesBy)) {
    const shown = values.filter(v => v !== null);
    if (shown.length < 2) continue;
    const spread = Math.max(...shown) - Math.min(...shown);
    // Rows with nothing in them are fine; differing sizes are not.
    if (spread > 0.5) add('uniform', `${key} differs between tiles: ${shown.map(px).join(' / ')}`);
  }
  facts.sizes = Object.fromEntries(Object.entries(sizesBy).map(([k, v]) => [k, [...new Set(v.filter(x => x !== null).map(px))]]).filter(([, v]) => v.length));
  // While a pool has mana, its strip has a row of its own directly above the near row (SPEC.md §9), and must leave both
  // badge rows in place: list the counts and chips that don't show, and a strip on its row that isn't just above the
  // near row or shares a line with a badge. A strip folded into one chip must say that it opens mana mode (a caret).
  const game = JSON.parse(localStorage.getItem('lifepod-game'));
  // A turn reminder that takes its tile's near edge (data-reminder="over", on tiles too short to show it above) hides the
  // near row and the strip on purpose for its 3 seconds, so their checks skip that tile.
  const covered = el => el.closest('.player[data-reminder="over"]') !== null;
  if (!facts.mode) {
    players.forEach((player, index) => {
      if (!game.manaPool || !game.pools[index].some(Boolean) || covered(player)) return;
      const near = player.querySelector('.badges.near');
      const shownKinds = [...near.querySelectorAll('.chip[data-kind]')].filter(visible).map(chip => chip.dataset.kind);
      const hidden = ['poison', 'casts', 'energy', 'experience', 'rad']
        .filter(kind => game.counters[kind === 'casts' ? 'commander' : kind] && game[kind]?.[index] > 0 && !shownKinds.includes(kind))
        .map(kind => `${kind} ${game[kind][index]}`);
      if (game.identities[index] && Object.values(game.identity.show).some(Boolean) && ![...near.querySelectorAll('.ci-chip')].some(visible)) hidden.unshift('identity chip');
      if (hidden.length) add('hidden', `P${index + 1} mana strip hides ${hidden.join(', ')}`);
      const turnChip = player.querySelector('.turn-chip');
      if (turnChip && !visible(turnChip)) add('hidden', `P${index + 1} mana strip hides the turn chip (${turnChip.className})`);
      // A strip too wide for its row folds into a chip there, and where the row can't fit, the chip goes under the far row
      // or, the last resort, ends the near row.
      const folded = ['fold', 'far', 'near'].includes(player.dataset.strip);
      const chip = [...player.querySelectorAll('.strip-chip')].find(visible);
      if (folded && !chip) add('hidden', `P${index + 1} folded mana strip shows no chip`);
      if (chip && !chip.querySelector('.icon[data-icon="caret-right"], .icon[data-icon="undo"]')) add('hidden', `P${index + 1} folded mana strip has no cue that it opens mana mode`);
      if (!folded && !visible(player.querySelector('.mana-strip'))) add('hidden', `P${index + 1} mana strip doesn't show`);
      const shownStrip = [player.querySelector('.mana-strip'), chip].find(el => el && visible(el));
      if (shownStrip && ['row', 'fold'].includes(player.dataset.strip)) {
        // In the face's own coordinates, unturned: the strip's row ends just above the near row, and no badge shares it.
        const face = player.querySelector('.player-face');
        const local = (el) => { let top = 0; for (let node = el; node && node !== face; node = node.offsetParent) top += node.offsetTop; return { top, bottom: top + el.offsetHeight }; };
        const strip = local(player.querySelector('.mana-strip'));
        const chips = [...player.querySelectorAll('.badges.near > *, .badges.far > *')].filter(visible).map(local);
        const nearTop = Math.min(...[...player.querySelectorAll('.badges.near > *')].filter(visible).map(chip => local(chip).top));
        if (Number.isFinite(nearTop) && (strip.bottom > nearTop + 0.5 || nearTop - strip.bottom > 3)) add('place', `P${index + 1} mana strip isn't just above the near row (${px(strip.bottom)} against ${px(nearTop)})`);
        if (chips.some(chip => chip.top < strip.bottom - 0.5 && strip.top < chip.bottom - 0.5)) add('place', `P${index + 1} mana strip shares a line with a badge`);
      }
    });
  }
  // Every count chip, every identity chip and its colour indicator must be visible (never dropped, SPEC.md §3.2).
  for (const chip of document.querySelectorAll('.badges.near .chip[data-kind], .badges.far .chip.damage, .badges.near .ci-chip, .badges.near .ci-chip .ci')) {
    if (!chip.closest('.badges').hidden && !document.querySelector('#board').dataset.mode && !visible(chip) && !(chip.closest('.near') && covered(chip))) add('dropped', `${who(chip)}${name(chip)} is hidden`);
  }
  return { problems, facts };
}

// ---------------------------------------------------------------------------------------------------------------
let browser;
const allFindings = [];
const pageErrors = [];

async function openSize(key, { scale = 1, reducedMotion = 'reduce', engine = browser } = {}) {
  const { width, height } = sizes[key];
  const portrait = height > width;
  const context = await engine.newContext({
    viewport: { width, height }, deviceScaleFactor: scale, isMobile: true, hasTouch: true, reducedMotion,
  });
  const page = await context.newPage();
  page.on('pageerror', e => pageErrors.push(`${key}: ${e.message}`));
  await fakeScreenOrientation(page);
  await page.goto(app);
  await turnScreen(page, width, height, portrait ? 0 : 90);
  return page;
}

async function load(page, game, style = 'material', badgeSize = 'default') {
  await page.evaluate(g => { localStorage.setItem('lifepod-game', g); }, JSON.stringify({ ...game, style, badgeSize }));
  await page.reload();
  await page.waitForSelector('#board .player');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function settle(page) {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(40);
}

async function enter(page, mode, game) {
  await modes[mode](page, game);
  await settle(page);
}

async function leave(page) {
  await page.evaluate(() => { for (let i = 0; i < 4 && window.closeOpenDialog(); i++); });
  await settle(page);
}

function record(where, result) {
  for (const p of result.problems) allFindings.push({ ...where, ...p });
}

// ---------------------------------------------------------------------------------------------------------------
// Screenshots: every mode at the target and stress sizes with everything on, plus a spread of mixed combinations.
async function shots() {
  const list = [];
  const allModes = Object.keys(modes);
  for (const size of ['target', 'stress']) {
    for (const mode of allModes) list.push({ size, count: 6, seed: 'everything', mode });
    list.push({ size, count: 4, seed: 'everything', mode: 'rest' });
    list.push({ size, count: 4, seed: 'everything', mode: 'counters' });
    list.push({ size, count: 5, seed: 'everything', mode: 'rest' });
    list.push({ size, count: 3, seed: 'everything', mode: 'rest' });
    list.push({ size, count: 2, seed: 'everything', mode: 'rest' });
  }
  list.push(
    { size: 'target', count: 4, seed: 'commander', mode: 'rest' },
    { size: 'target', count: 6, seed: 'commander', mode: 'damage' },
    { size: 'target', count: 6, seed: 'startTurns', mode: 'rest' },
    { size: 'target', count: 5, seed: 'rotated', mode: 'rest' },
    { size: 'target', count: 4, seed: 'minimal', mode: 'rest' },
    { size: 'target', count: 6, seed: 'counters', mode: 'rest' },
    { size: 'phone', count: 6, seed: 'everything', mode: 'rest' },
    { size: 'phone', count: 5, seed: 'counters', mode: 'mana' },
    { size: 'phone', count: 3, seed: 'rotated', mode: 'rest' },
    { size: 'small', count: 6, seed: 'everything', mode: 'rest' },
    { size: 'small', count: 6, seed: 'commander', mode: 'rest' },
    { size: 'small', count: 6, seed: 'everything', mode: 'identity' },
    { size: 'small', count: 6, seed: 'everything', mode: 'colours' },
    { size: 'small', count: 6, seed: 'everything', mode: 'settings' },
    { size: 'stress', count: 6, seed: 'counters', mode: 'rest' },
    { size: 'stress', count: 6, seed: 'startTurns', mode: 'rest' },
    { size: 'se', count: 4, seed: 'everything', mode: 'rest' },
    { size: 'se', count: 6, seed: 'commander', mode: 'rest' },
    { size: 'se', count: 4, seed: 'everything', mode: 'settings' },
    { size: 'tiny', count: 6, seed: 'everything', mode: 'rest' },
    { size: 'tiny', count: 6, seed: 'everything', mode: 'counters' },
    { size: 'tiny', count: 4, seed: 'everything', mode: 'settings-end' },
    { size: 'fold', count: 5, seed: 'everything', mode: 'rest' },
    { size: 'fold', count: 4, seed: 'commander', mode: 'identity' },
    { size: 'fold', count: 6, seed: 'everything', mode: 'settings' },
    { size: 'tablet', count: 6, seed: 'everything', mode: 'rest' },
    { size: 'tablet', count: 4, seed: 'commander', mode: 'counters' },
    { size: 'tablet', count: 2, seed: 'rotated', mode: 'rest' },
    { size: 'tablet', count: 6, seed: 'everything', mode: 'settings' },
    { size: 'stress', count: 6, seed: 'rotated', mode: 'rest' },
    { size: 'stress', count: 6, seed: 'rotated', mode: 'colours' },
    { size: 'small', count: 4, seed: 'rotated', mode: 'colours' },
    { size: 'stress', count: 2, seed: 'rotated', mode: 'damage' },
    { size: 'small', count: 2, seed: 'everything', mode: 'rest' },
    { size: 'small', count: 3, seed: 'commander', mode: 'rest' },
    { size: 'fold', count: 2, seed: 'everything', mode: 'rest' },
    { size: 'se', count: 3, seed: 'everything', mode: 'rest' },
    { size: 'target', count: 2, seed: 'rotated', mode: 'rest' },
    { size: 'target', count: 6, seed: 'startTurns', mode: 'first' },
    { size: 'stress', count: 6, seed: 'everything', mode: 'identity' },
    { size: 'target', count: 5, seed: 'everything', mode: 'damage' },
    { size: 'stress', count: 5, seed: 'everything', mode: 'damage' },
    ...[3, 5].flatMap(count => badgeSizes.map(badge => ({ size: 'target', count, seed: 'floating', mode: 'rest', badge }))),
  );
  // Glass: the board, a mode, settings and the dialogs, at the target and the stress size.
  for (const size of ['target', 'stress']) {
    for (const mode of ['rest', 'counters', 'identity', 'settings', 'settings-end', 'dice', 'new-game']) list.push({ size, count: 4, seed: 'everything', mode, style: 'glass' });
  }
  const bySize = Object.groupBy(list, s => s.size);
  const report = [];
  await Promise.all(Object.entries(bySize).map(async ([size, items]) => {
    const scale = Math.min(2, Math.floor((1799 / sizes[size].width) * 100) / 100);
    const page = await openSize(size, { scale });
    for (const item of items) {
      const game = seeds[item.seed](item.count);
      if (!available(item.mode, game)) continue;
      const style = item.style ?? 'material';
      await load(page, game, style, item.badge);
      await enter(page, item.mode, game);
      const file = `${style === 'glass' ? 'glass-' : ''}${size}-${item.count}p-${item.seed}-${item.mode}${item.badge ? `-badge-${item.badge}` : ''}.png`;
      await page.screenshot({ path: `${outDir}${file}` });
      const result = await page.evaluate(audit);
      record({ style, size, count: item.count, seed: item.seed, mode: item.mode, badge: item.badge ?? 'default', shot: file }, result);
      report.push({ file, ...result.facts, problems: result.problems.length });
      await leave(page);
    }
    // Every "Show on tiles" combination, at the target with 6 players: one board each.
    if (size === 'target') {
      for (const [i, parts] of showCombos.entries()) {
        await load(page, withShow(seeds.commander(6), parts, ['symbol', 'indicator', 'off'][i % 3]));
        const file = `target-6p-show-${parts.length ? parts.join('+') : 'none'}.png`;
        await page.screenshot({ path: `${outDir}${file}` });
        record({ size, count: 6, seed: `commander, show ${parts.join('+') || 'none'}`, mode: 'rest', shot: file }, await page.evaluate(audit));
      }
      // Pressed states: a life half and a counter cell held down.
      await load(page, seeds.everything(4));
      await page.locator('.player .add').nth(1).evaluate(el => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9, button: 0 })));
      await settle(page);
      await page.screenshot({ path: `${outDir}target-4p-pressed-half.png` });
      await page.locator('.player .add').nth(1).evaluate(el => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9, button: 0 })));
      // Focus ring on a tile control after Tab.
      await load(page, seeds.everything(4));
      for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
      await settle(page);
      await page.screenshot({ path: `${outDir}target-4p-focus.png` });
    }
    await page.context().close();
  }));
  await writeFile(`${outDir}shots.json`, JSON.stringify(report.sort((a, b) => a.file.localeCompare(b.file)), null, 1));
}

// ---------------------------------------------------------------------------------------------------------------
// The sweep, in each style: every size × 2–6 players × every seed (with the eight chip combinations spread over them) × every mode
// the seed can show, measured but not saved as screenshots.
async function sweep() {
  const boardModes = ['rest', 'damage', 'counters', 'mana', 'colours', 'identity', 'rotate', 'first', 'reminders'];
  const dialogModes = ['dice', 'settings', 'settings-end', 'settings-pending', 'settings-edit', 'settings-flipped', 'new-game', 'discard'];
  let runs = 0;
  await Promise.all(Object.keys(sizes).flatMap(size => styles.map(async (style) => {
    const page = await openSize(size);
    // Every board mode at the default Badge size; at Large and Larger, the states that show the badge rows.
    for (const badge of badgeSizes) {
      let combo = 0;
      for (const count of [2, 3, 4, 5, 6]) {
        for (const seedName of Object.keys(seeds)) {
          const parts = showCombos[combo++ % showCombos.length];
          const game = ['everything', 'floating'].includes(seedName) ? seeds[seedName](count) : withShow(seeds[seedName](count), parts);
          await load(page, game, style, badge);
          for (const mode of badge === 'default' ? boardModes : ['rest', 'rotate', 'reminders']) {
            if (!available(mode, game)) continue;
            await enter(page, mode, game);
            record({ style, size, badge, count, seed: ['everything', 'floating'].includes(seedName) ? seedName : `${seedName} (show ${parts.join('+') || 'none'})`, mode }, await page.evaluate(audit));
            runs++;
            await leave(page);
            // "Who goes first?" changes the game; start the next mode from the seed again.
            if (mode === 'first' || mode === 'rotate') await load(page, game, style, badge);
          }
        }
      }
    }
    // Dialogs depend on the window, not the players.
    for (const mode of dialogModes) {
      const game = seeds.everything(6);
      await load(page, game, style);
      await enter(page, mode, game);
      record({ style, size, count: 6, seed: 'everything', mode }, await page.evaluate(audit));
      runs++;
    }
    // The other tile colour sets (Clear, the default, is everything above): the board at rest, the map and Colours.
    for (const tileColours of ['classic', 'soft', 'jewel']) {
      const game = { ...seeds.everything(6), tileColours };
      for (const mode of ['rest', 'damage', 'colours']) {
        await load(page, game, style);
        await enter(page, mode, game);
        record({ style, size, count: 6, seed: `everything, ${tileColours} tiles`, mode }, await page.evaluate(audit));
        runs++;
      }
    }
    // Settings with a life off the track (the handle pinned), and with Turns off (no auto-empty row).
    await load(page, { ...seeds.everything(6), startingLife: 100 }, style);
    await enter(page, 'settings');
    record({ style, size, count: 6, seed: 'everything, life 100', mode: 'settings (pinned)' }, await page.evaluate(audit));
    await load(page, { ...seeds.minimal(6) }, style);
    await enter(page, 'settings');
    record({ style, size, count: 6, seed: 'minimal', mode: 'settings' }, await page.evaluate(audit));
    await page.context().close();
  })));
  return runs;
}

// Keyboard and screen reader checks at the target: the tab order at rest, and the ARIA tree of the board.
async function accessibility() {
  const page = await openSize('target');
  await load(page, seeds.everything(4));
  const order = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => {
      const el = document.activeElement;
      const style = getComputedStyle(el);
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${el.className} "${el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 30)}" outline ${style.outlineStyle} ${style.outlineWidth}`;
    }));
  }
  const tree = await page.locator('body').ariaSnapshot();
  await enter(page, 'counters');
  const countersTree = await page.locator('#board').ariaSnapshot();
  await leave(page);
  await enter(page, 'settings');
  const settingsTree = await page.locator('#settings').ariaSnapshot();
  await writeFile(`${outDir}accessibility.txt`, [
    '# Tab order at rest (952 × 427, 4 players, everything on)', ...order, '',
    '# ARIA tree at rest', tree, '', '# Counters mode', countersTree, '', '# Settings', settingsTree, '',
  ].join('\n'));
  await page.context().close();
}

// iOS draws the app in WebKit: the target and stress boards and settings, for font and layout differences.
async function webkitShots() {
  const engine = await webkit.launch();
  for (const size of ['target', 'stress']) {
    const page = await openSize(size, { scale: Math.min(2, Math.floor((1799 / sizes[size].width) * 100) / 100), engine });
    for (const mode of ['rest', 'settings', 'settings-end', 'counters']) {
      const game = seeds.everything(6);
      await load(page, game);
      await enter(page, mode, game);
      const file = `webkit-${size}-6p-everything-${mode}.png`;
      await page.screenshot({ path: `${outDir}${file}` });
      record({ size, count: 6, seed: 'everything (WebKit)', mode, shot: file }, await page.evaluate(audit));
    }
    await page.context().close();
  }
  await engine.close();
}

// The colour indicator's one-colour discs against the chip they sit on (#0a0e0b at 44% over each tile panel), from
// the stylesheets (web/css/), and the rim each disc has around it (--ci-rim). Non-text marks need 3:1: a disc whose fill
// is below that still shows its edge when the rim clears it. Printed, and kept in findings.json.
async function indicatorContrast() {
  const css = readStyles();
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lum = c => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const panels = [...css.matchAll(/--(\w+-(?:top|bottom))-panel: (#[0-9a-f]{6})/g)].map(m => [m[1], hex(m[2])]);
  const chip = hex('#0a0e0b');
  const discs = [...css.matchAll(/\.ci\[data-ci="([WUBRG])"\] \{ background: (#[0-9a-f]{6}); \}/g)];
  const rimMatch = css.match(/--ci-rim: (#[0-9a-f]{6})([0-9a-f]{2})?;/);
  const on = rgb => rgb.map((v, i) => chip[i] * 0.44 + v * 0.56);
  const rimOn = (bg) => {
    if (!rimMatch) return null;
    const alpha = rimMatch[2] ? parseInt(rimMatch[2], 16) / 255 : 1;
    return hex(rimMatch[1]).map((v, i) => v * alpha + bg[i] * (1 - alpha));
  };
  return discs.map(([, colour, value]) => {
    const ratios = panels.map(([panel, rgb]) => [panel, ratio(hex(value), on(rgb))]);
    ratios.sort((x, y) => x[1] - y[1]);
    const rims = rimMatch ? panels.map(([panel, rgb]) => [panel, ratio(rimOn(on(rgb)), on(rgb))]).sort((x, y) => x[1] - y[1]) : null;
    return {
      colour, disc: value, lowest: `${ratios[0][1].toFixed(2)}:1 on ${ratios[0][0]}`, highest: `${ratios.at(-1)[1].toFixed(2)}:1 on ${ratios.at(-1)[0]}`,
      rim: rims ? `${rims[0][1].toFixed(2)}:1 on ${rims[0][0]}` : 'none',
      visible: Math.max(ratios[0][1], rims ? rims[0][1] : 0) >= 3,
    };
  });
}

if (import.meta.main) {
  browser = await chromium.launch();
  const started = Date.now();
  if (doShots) {
    await shots();
    await webkitShots();
  }
  let runs = 0;
  if (doSweep) {
    runs = await sweep();
    await accessibility();
  }
  await browser.close();
  await server.close();

  // Summary: problems grouped by kind and by a normalised message, with where they happen.
  const key = f => `${f.kind}: ${f.detail.replace(/^P\d /, '').replace(/[\d.]+(px²|px|×[\d.]+|:1)/g, 'N$1').replace(/"[^"]*"/g, '"…"').replace(/\(.*?\)/g, '(…)')}`;
  const grouped = {};
  for (const f of allFindings) (grouped[key(f)] ??= []).push(f);
  const summary = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length).map(([k, list]) => ({
    problem: k, count: list.length,
    styles: [...new Set(list.map(f => f.style ?? 'material'))],
    sizes: [...new Set(list.map(f => f.size))], badges: [...new Set(list.map(f => f.badge ?? 'default'))], players: [...new Set(list.map(f => f.count))].sort(), modes: [...new Set(list.map(f => f.mode))],
    example: list[0],
  }));
  const indicators = await indicatorContrast();
  // Only a sweep writes findings.json, so --shots leaves the last sweep's findings alone.
  if (doSweep) await writeFile(`${outDir}findings.json`, JSON.stringify({ runs, pageErrors, indicators, summary, all: allFindings }, null, 1));
  console.log('Indicator discs on chips (need 3:1 from the fill or the rim):', indicators.map(d => `${d.colour} fill ${d.lowest}, rim ${d.rim}${d.visible ? '' : ' FAILS'}`).join(' · '));
  console.log(`${runs} sweep states, ${allFindings.length} problems in ${summary.length} groups, ${pageErrors.length} page errors, ${Math.round((Date.now() - started) / 1000)}s`);
  for (const s of summary) console.log(`${String(s.count).padStart(4)}  ${s.problem}\n      styles ${s.styles.join(' ')} · sizes ${s.sizes.join(' ')} · badges ${s.badges.join(' ')} · players ${s.players.join(' ')} · modes ${s.modes.join(' ')}\n      e.g. ${s.example.style ?? 'material'} ${s.example.size} ${s.example.badge ?? 'default'} badges ${s.example.count}p ${s.example.seed} ${s.example.mode}${s.example.shot ? ` → ${s.example.shot}` : ''}: ${s.example.detail}`);
  if (pageErrors.length) console.log('Page errors:\n' + [...new Set(pageErrors)].join('\n'));
}
