import assert from 'node:assert/strict';
import { button, engines, faceBoxes, openPage, savedGame, test, tileProblems } from './helpers.mjs';

// Centring (design/polish/SPEC.md §3.1): a tile keeps clear of the centre pill only on the edges the pill actually
// reaches, as measured (--clear-far, --clear-end, --clear-near and --clear-start), and centres everything else in what's
// left. The far row's chips are centred along their edge, and each mode layer's content (the map, the counter or mana
// cells, the swatches, the identity preview over its toggles) is centred in the face. A hint sits on the far side of
// the content; only where that side is too short for it does the content give way, and then the hint is pressed against
// the layer's far padding.

const { chromium, webkit } = engines;

// Every player has something on each row: commander damage from every opponent, poison and an identity, with mana off so
// only the far row and the near row are at rest.
function busyGame(count, rotations) {
  return savedGame(count, {
    rotations,
    counters: { commander: true, poison: true, energy: true },
    poison: Array(count).fill(3), energy: Array(count).fill(2),
    identities: ['WUB', 'RG', 'WURG', 'B', 'WUBRG', 'UG'].slice(0, count),
    commanderDamage: Array.from({ length: count }, (_, defender) => Array.from({ length: count }, (_, attacker) => (defender === attacker ? 0 : 4))),
  });
}

// Each tile's face, far edge at the top (faceBoxes): the far row's chips, and the open mode layer's content and hint,
// with how far the layer's padding keeps its content from the far edge.
async function readFaces(page) {
  const faces = await faceBoxes(page, {
    far: '.badges.far > *',
    content: '.mode-layer:not([hidden]) > :is(.seat-map, .counter-cells, .identity, .first-picker), .mode-layer:not([hidden]) .swatches, .mode-layer:not([hidden]) > .identity-preview > .chip',
    hint: '.mode-layer:not([hidden]) > .layer-hint',
  });
  const tops = await page.locator('.player .mode-layer').evaluateAll(layers => layers.map(layer => parseFloat(getComputedStyle(layer).paddingTop)));
  return faces.map((face, index) => ({ ...face, layerTop: tops[index] }));
}

const middle = (low, high) => (low + high) / 2;

// What isn't centred on each tile, as messages. Along the edge, within 1.5px (the far row) or 2px (a layer, whose start
// and end padding round differently); across it, a layer's content within 3px of the room's middle, unless its hint
// needed the room on the far side, in which case the hint touches the layer's far padding. Content larger than the room
// along an axis (swatches on a narrow or short board may reach 6px into a clearance so their grid fits) can't be
// centred along it.
function centringProblems(faces, { far = false, layer = false } = {}) {
  return faces.flatMap((face, index) => {
    const found = [];
    const seat = `P${index + 1} (${face.edge})`;
    const along = middle(face.room.left, face.room.right);
    if (far && face.far) {
      const off = middle(face.far.left, face.far.right) - along;
      if (Math.abs(off) > 1.5) found.push(`${seat} far row is ${off.toFixed(1)}px off-centre`);
    }
    if (layer) {
      if (!face.content) return [`${seat} shows no layer content`];
      const wider = face.content.left < face.room.left - 0.5 || face.content.right > face.room.right + 0.5;
      const taller = face.content.top < face.room.top - 0.5 || face.content.bottom > face.room.bottom + 0.5;
      const sideways = middle(face.content.left, face.content.right) - along;
      if (Math.abs(sideways) > 2 && !wider) found.push(`${seat} layer content is ${sideways.toFixed(1)}px off-centre along the edge`);
      const across = middle(face.content.top, face.content.bottom) - middle(face.room.top, face.room.bottom);
      const hintPressed = face.hint && Math.abs(face.hint.top - face.layerTop) <= 1;
      if (Math.abs(across) > 3 && !taller && !(hintPressed && across > 0)) found.push(`${seat} layer content is ${across.toFixed(1)}px off-centre across the face`);
      if (face.hint && face.hint.bottom > face.content.top + 0.5) found.push(`${seat} hint overlaps the layer content`);
    }
    return found;
  });
}

// The seat turns checked: as dealt, each seat turned a different way, and every seat turned to face across the table.
const rotationSets = [[0, 0, 0, 0, 0, 0], [1, 2, 3, 0, 1, 3], [2, 2, 2, 2, 2, 2]];
const modes = [
  ['damage', page => button(page, 'Commander damage').tap()],
  ['counters', page => button(page, 'Counters').tap()],
  ['colours', async (page) => {
    await button(page, 'Settings').tap();
    await button(page, 'Choose tile colours on the board').tap();
  }],
  ['identity', async (page) => {
    await button(page, 'Settings').tap();
    await button(page, 'Choose identities on the board').tap();
  }],
];
const closeMode = { damage: 'Cancel', counters: 'Cancel', colours: 'Done choosing colours', identity: 'Done choosing identities' };

async function checkCentring(t, engine, sizes) {
  for (const [width, height] of sizes) {
    for (const count of [2, 3, 4, 5, 6]) {
      for (const rotations of rotationSets) {
        const view = `${count} players, ${width} × ${height}, seats turned ${rotations.slice(0, count).join('')}`;
        const page = await openPage(t, engine, { viewport: { width, height }, game: busyGame(count, rotations.slice(0, count)) });
        assert.deepEqual(centringProblems(await readFaces(page), { far: true }), [], `${view}: every far row is centred`);
        assert.deepEqual(await tileProblems(page, { parts: '.badges .chip, .controls .score' }), [], `${view}: every chip is inside its tile and clear of the pill`);
        for (const [mode, open] of modes) {
          await open(page);
          assert.deepEqual(centringProblems(await readFaces(page), { layer: true }), [], `${view}, ${mode}: every layer is centred`);
          assert.deepEqual(await tileProblems(page, { targets: '.mode-layer button:not(.visually-hidden)' }), [], `${view}, ${mode}: every target is whole, inside its tile and clear of the pill`);
          await button(page, closeMode[mode]).tap();
        }
        await page.close();
      }
    }
  }
}

// The mana layer and "Who goes first?" are centred too: one board each, at the target, with the two odd counts whose end
// seat used to sit off-centre.
async function checkOtherLayers(t, engine) {
  for (const count of [3, 5]) {
    const page = await openPage(t, engine, { game: { ...busyGame(count, Array(count).fill(0)), manaPool: true, turns: 'rounds' } });
    await button(page, 'Mana pool').tap();
    assert.deepEqual(centringProblems(await readFaces(page), { layer: true }), [], `${count} players, mana: every layer is centred`);
    await button(page, 'Cancel').tap();
    await button(page, 'Settings').tap();
    await button(page, 'New game').tap();
    await page.locator('#restart').getByRole('button', { name: 'Start new game' }).tap();
    await page.locator('.first-go').first().waitFor();
    assert.deepEqual(centringProblems(await readFaces(page), { layer: true }), [], `${count} players, Who goes first?: every layer is centred`);
    await page.close();
  }
}

// The end seat at 3 and 5 players, which the pill doesn't reach, keeps no clearance at all.
async function checkEndSeats(t, engine) {
  for (const count of [3, 5]) {
    const page = await openPage(t, engine, { game: busyGame(count, Array(count).fill(0)) });
    const clear = await page.locator('.player').last().evaluate(player => ['far', 'end', 'near', 'start'].map(edge => player.style.getPropertyValue(`--clear-${edge}`)));
    assert.deepEqual(clear, ['', '', '', ''], `${count} players: the end seat keeps no clearance from the pill`);
    await page.close();
  }
}

test('chromium: far rows and mode layers are centred where the pill doesn\'t reach, on the target and the stress size', { timeout: 600000 }, t => checkCentring(t, chromium, [[952, 427], [568, 320]]));
test('webkit: far rows and mode layers are centred where the pill doesn\'t reach, on the target', { timeout: 600000 }, t => checkCentring(t, webkit, [[952, 427]]));
for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: the mana layer and "Who goes first?" are centred`, t => checkOtherLayers(t, engine));
  test(`${name}: the end seat at 3 and 5 players keeps no clearance from the pill`, t => checkEndSeats(t, engine));
}
