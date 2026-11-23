import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { contrast, hexToRgb, rgbToOklch } from '../design/counters/oklch.mjs';

// web/js/logic/data.js imports nothing, so Node loads it as a module from its text (the repo's package.json has no
// "type", and the app's .js files are browser modules).
const { tileSets, topRowPlayers } = await import(`data:text/javascript,${encodeURIComponent(readFileSync(new URL('../web/js/logic/data.js', import.meta.url), 'utf8'))}`);
import { openPage, seedGame, test, token } from './helpers.mjs';

// The twelve tile palettes (design/polish/SPEC.md §5) are the ones design/counters/palette.mjs generated and checked,
// and every panel the app ships keeps the contrast minimums: the life total 9:1, small text 7.6:1 and the red of a
// life total at 0 or below 4.79:1.
const generated = JSON.parse(readFileSync(new URL('../design/counters/palette.js', import.meta.url), 'utf8')
  .replace(/^[\s\S]*?export default /, '').replace(/;\s*$/, ''));

test('chromium: every tile palette is palette.mjs’s and passes its contrast checks', async (t) => {
  const page = await openPage(t, chromium);
  const ids = generated.r3.swatches.map(swatch => swatch.name.toLowerCase());
  assert.deepEqual(ids, ['sage', 'sky', 'coral', 'violet', 'amber', 'teal', 'rose', 'indigo', 'slate', 'copper', 'olive', 'orchid']);
  // Classic, the Tile colours setting's first set, is the twelve palette.mjs made.
  const shipped = await page.evaluate((ids) => {
    document.documentElement.dataset.tiles = 'classic';
    const style = getComputedStyle(document.documentElement);
    const read = name => style.getPropertyValue(name).trim();
    return Object.fromEntries(ids.map(id => [id, Object.fromEntries(['top', 'bottom'].map(row => [row,
      Object.fromEntries(['panel', 'rim', 'seat', 'button'].map(role => [role, read(`--${id}-${row}-${role}`)]))]))]));
  }, ids);
  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(['--text', '--text-soft', '--life-out'].map(name => [name, style.getPropertyValue(name).trim()]));
  });
  const { minimums } = generated.r3;
  assert.deepEqual(minimums, { life: 9, small: 7.6, lifeOut: 4.79 });
  for (const swatch of generated.r3.swatches) {
    const id = swatch.name.toLowerCase();
    for (const row of ['top', 'bottom']) {
      assert.deepEqual(shipped[id][row], swatch[row], `${swatch.name} ${row}: css/tokens.css matches palette.mjs`);
      const { panel } = shipped[id][row];
      const checks = { life: contrast(tokens['--text'], panel), small: contrast(tokens['--text-soft'], panel), lifeOut: contrast(tokens['--life-out'], panel) };
      for (const [check, minimum] of Object.entries(minimums)) {
        assert.ok(checks[check] >= minimum, `${swatch.name} ${row}: ${check} ${checks[check].toFixed(2)}:1 is at least ${minimum}:1`);
      }
    }
  }
});

// The colour indicator's one-colour discs for black, green and blue are close to the dark chip they sit on, so each disc
// has a light rim (design/polish/FINAL-REVIEW.md #6). The rim clears 3:1 against the chip on every tile colour.
test('chromium: the colour indicator has a rim that clears 3:1 on every chip', async (t) => {
  const page = await openPage(t, chromium);
  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return { rim: style.getPropertyValue('--ci-rim').trim(), chip: style.getPropertyValue('--chip-background').trim() };
  });
  const rgba = hex => [1, 3, 5, 7].map(at => (at < 7 ? parseInt(hex.slice(at, at + 2), 16) : hex.length > 7 ? parseInt(hex.slice(7, 9), 16) / 255 : 1));
  const over = (top, bottom) => bottom.slice(0, 3).map((value, at) => top[at] * top[3] + value * (1 - top[3]));
  const hex = rgb => `#${rgb.map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
  // On every panel of every tile colour set (tiles7.json; Classic is its "today").
  const sets = JSON.parse(readFileSync(new URL('../design/polish/tiles7.json', import.meta.url), 'utf8'));
  for (const [setName, { set }] of Object.entries(sets)) {
    for (const [id, rows] of Object.entries(set)) {
      for (const row of ['top', 'bottom']) {
        const chip = over(rgba(tokens.chip), rgba(rows[row].panel));
        const rim = over(rgba(tokens.rim), chip);
        const ratio = contrast(hex(rim), hex(chip));
        assert.ok(ratio >= 3, `${setName} ${id} ${row}: the rim is ${ratio.toFixed(2)}:1 on the chip`);
      }
    }
  }
  // Every indicator in a chip draws that rim around its disc.
  await seedGame(page, { startingLife: 40, scores: [40, 40], identities: ['B', 'UG'] });
  const rim = await token(page, '--ci-rim');
  const shadows = await page.locator('.badges .ci').evaluateAll(discs => discs.map(disc => getComputedStyle(disc).boxShadow));
  assert.equal(shadows.length, 2);
  for (const shadow of shadows) assert.equal(shadow, `${rim} 0px 0px 0px 1.5px`);
});

// The Tile colours setting's four sets (design/polish/TILES.md): each is tiles7.mjs's set exactly (Classic is its
// "today"), and on every panel of every set the life total is at least 9:1, small text 7.6:1, the life-out red 4.79:1
// and the seat colour 7.35:1.
const sets = JSON.parse(readFileSync(new URL('../design/polish/tiles7.json', import.meta.url), 'utf8'));

test('chromium: every tile colour set is tiles7.mjs’s and passes the contrast minimums', async (t) => {
  const page = await openPage(t, chromium);
  const ids = Object.keys(sets.today.set);
  for (const [setting, source] of [['classic', 'today'], ['soft', 'soft'], ['jewel', 'jewel'], ['clear', 'clear']]) {
    const read = await page.evaluate(([setting, ids]) => {
      document.documentElement.dataset.tiles = setting;
      const style = getComputedStyle(document.documentElement);
      const value = name => style.getPropertyValue(name).trim();
      return {
        palettes: Object.fromEntries(ids.map(id => [id, Object.fromEntries(['top', 'bottom'].map(row => [row,
          Object.fromEntries(['panel', 'rim', 'seat', 'button'].map(role => [role, value(`--${id}-${row}-${role}`)]))]))])),
        text: value('--text'), soft: value('--text-soft'), out: value('--life-out'),
      };
    }, [setting, ids]);
    assert.deepEqual(read.palettes, sets[source].set, `${setting}: the CSS matches tiles7.json's ${source}`);
    for (const id of ids) {
      for (const row of ['top', 'bottom']) {
        const { panel, seat } = read.palettes[id][row];
        const checks = { life: [contrast(read.text, panel), 9], small: [contrast(read.soft, panel), 7.6], lifeOut: [contrast(read.out, panel), 4.79], seat: [contrast(seat, panel), 7.35] };
        for (const [check, [ratio, minimum]] of Object.entries(checks)) {
          assert.ok(ratio >= minimum, `${setting} ${id} ${row}: ${check} ${ratio.toFixed(2)}:1 is at least ${minimum}:1`);
        }
      }
    }
  }
});

// The default seats (DESIGN-AUDIT M1): players 1–6 start on swatch ids 0–5, and in every set those are spread round the
// hue circle rather than six neighbours. At every player count from 2 to 6, the closest two default tiles (the OKLab
// difference of the panels plus half the seat colours, each player in their own row, as tiles7.mjs measures tiles) are
// at least as far apart as Classic's closest default pair, its six-player table.
test('node: the default seats are well spread in every tile colour set', () => {
  const ids = Object.keys(sets.today.set);
  const lab = (hex) => {
    const [L, C, H] = rgbToOklch(hexToRgb(hex));
    return [L, C * Math.cos(H * Math.PI / 180), C * Math.sin(H * Math.PI / 180)];
  };
  const difference = (a, b) => Math.hypot(...a.map((value, at) => value - b[at]));
  const tile = (set, player) => set[ids[player]][topRowPlayers.includes(player) ? 'top' : 'bottom'];
  const closest = (set, players) => {
    let least = Infinity;
    for (let a = 0; a < players; a++) {
      for (let b = a + 1; b < players; b++) {
        const one = tile(set, a), other = tile(set, b);
        least = Math.min(least, Math.hypot(difference(lab(one.panel), lab(other.panel)), 0.5 * difference(lab(one.seat), lab(other.seat))));
      }
    }
    return least;
  };
  const floor = Math.min(...[2, 3, 4, 5, 6].map(players => closest(sets.today.set, players)));
  assert.ok(floor > 0.05, `Classic's six default seats are ${floor.toFixed(3)} apart`);
  for (const source of ['today', 'soft', 'jewel', 'clear']) {
    for (const players of [2, 3, 4, 5, 6]) {
      const least = closest(sets[source].set, players);
      assert.ok(least >= floor, `${source}, ${players} players: the closest default seats are ${least.toFixed(3)} apart, at least Classic's ${floor.toFixed(3)}`);
    }
  }
});

// Each id keeps its colour family in every set, and the app's names and shuffle families are tiles7.mjs's.
test('node: the tile sets name their swatches and families as tiles7.mjs does', () => {
  for (const [setting, source] of [['classic', 'today'], ['soft', 'soft'], ['jewel', 'jewel'], ['clear', 'clear']]) {
    assert.deepEqual(tileSets[setting].names, sets[source].names, `${setting}: the names`);
    assert.deepEqual(tileSets[setting].families, sets[source].families, `${setting}: the families`);
    assert.equal(new Set(tileSets[setting].families).size, 6, `${setting}: six families, one per seat at six players`);
    // The first three default seats are a green, sky and coral in every set.
    assert.ok(['Sage', 'Jade'].includes(tileSets[setting].names[0]), `${setting}: id 0 is a green`);
    assert.deepEqual(tileSets[setting].names.slice(1, 3), ['Sky', 'Coral'], `${setting}: ids 1 and 2 are sky and coral`);
  }
});
