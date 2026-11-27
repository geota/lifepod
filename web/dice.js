'use strict';

// Dice and the coin for the dice page: geometry, drawing, true-random rolls and the roll and flip animations.
// The design and its reasoning are in design/dice/SPEC.md; the geometry comes from design/dice/shapes.js.
window.lifePodDice = (() => {
  const svgNS = 'http://www.w3.org/2000/svg';

  // Each die on a 100 x 100 viewBox, upright, lit from the upper left. Faces are [tone, points], painted in
  // order: tone 0 is the front face that holds the number, tones 1–3 are side faces turning away from the light.
  // The number is centred at (x, y) in the front face; size fits the widest label the die can show.
  const shapes = {
  4: {
    outline: '50,5 98,88.1 2,88.1',
    faces: [
      [0, '50,23 82.4,79.1 17.6,79.1'],
      [2, '50,5 98,88.1 82.4,79.1 50,23'],
      [3, '98,88.1 2,88.1 17.6,79.1 82.4,79.1'],
      [1, '2,88.1 50,5 50,23 17.6,79.1'],
    ],
    number: { x: 50, y: 62.3, size: 35, baseline: 74.9 },
  },
  6: {
    outline: '79,9 82.1,9.4 85,10.6 87.5,12.5 89.4,15 90.6,17.9 91,21 91,79 90.6,82.1 89.4,85 87.5,87.5 85,89.4 82.1,90.6 79,91 21,91 17.9,90.6 15,89.4 12.5,87.5 10.6,85 9.4,82.1 9,79 9,21 9.4,17.9 10.6,15 12.5,12.5 15,10.6 17.9,9.4 21,9',
    faces: [
      [0, '76,17.5 77.7,17.7 79.3,18.4 80.6,19.4 81.6,20.8 82.3,22.3 82.5,24 82.5,76 82.3,77.7 81.6,79.3 80.6,80.6 79.3,81.6 77.7,82.3 76,82.5 24,82.5 22.3,82.3 20.8,81.6 19.4,80.6 18.4,79.3 17.7,77.7 17.5,76 17.5,24 17.7,22.3 18.4,20.8 19.4,19.4 20.7,18.4 22.3,17.7 24,17.5'],
      [3, '87.5,12.5 89.4,15 90.6,17.9 91,21 91,79 90.6,82.1 89.4,85 87.5,87.5 80.6,80.6 81.6,79.3 82.3,77.7 82.5,76 82.5,24 82.3,22.3 81.6,20.8 80.6,19.4'],
      [3, '87.5,87.5 85,89.4 82.1,90.6 79,91 21,91 17.9,90.6 15,89.4 12.5,87.5 19.4,80.6 20.8,81.6 22.3,82.3 24,82.5 76,82.5 77.7,82.3 79.3,81.6 80.6,80.6'],
      [1, '12.5,87.5 10.6,85 9.4,82.1 9,79 9,21 9.4,17.9 10.6,15 12.5,12.5 19.4,19.4 18.4,20.8 17.7,22.3 17.5,24 17.5,76 17.7,77.7 18.4,79.3 19.4,80.6'],
      [1, '12.5,12.5 15,10.6 17.9,9.4 21,9 79,9 82.1,9.4 85,10.6 87.5,12.5 80.6,19.4 79.3,18.4 77.7,17.7 76,17.5 24,17.5 22.3,17.7 20.7,18.4 19.4,19.4'],
    ],
    number: { x: 50, y: 50, size: 40, baseline: 64.4 },
  },
  8: {
    outline: '50,2 91.6,26 91.6,74 50,98 8.4,74 8.4,26',
    faces: [
      [0, '50,2 91.6,74 8.4,74'],
      [2, '50,2 91.6,26 91.6,74'],
      [3, '91.6,74 50,98 8.4,74'],
      [1, '8.4,74 8.4,26 50,2'],
    ],
    number: { x: 50, y: 50.4, size: 40, baseline: 64.8 },
  },
  10: {
    outline: '50,2 97,54 50,98 3,54',
    faces: [
      [0, '50,2 78,56 50,77 22,56'],
      [2, '50,2 97,54 78,56'],
      [3, '97,54 50,98 50,77 78,56'],
      [2, '50,98 3,54 22,56 50,77'],
      [1, '3,54 50,2 22,56'],
    ],
    number: { x: 50, y: 50.5, size: 29, baseline: 60.9 },
  },
  12: {
    outline: '50,4.8 97.6,39.3 79.4,95.2 20.6,95.2 2.4,39.3',
    faces: [
      [0, '50,23.8 79.5,45.2 68.2,79.9 31.8,79.9 20.5,45.2'],
      [2, '50,4.8 97.6,39.3 79.5,45.2 50,23.8'],
      [3, '97.6,39.3 79.4,95.2 68.2,79.9 79.5,45.2'],
      [3, '79.4,95.2 20.6,95.2 31.8,79.9 68.2,79.9'],
      [1, '20.6,95.2 2.4,39.3 20.5,45.2 31.8,79.9'],
      [1, '2.4,39.3 50,4.8 50,23.8 20.5,45.2'],
    ],
    number: { x: 50, y: 54.9, size: 32, baseline: 66.4 },
  },
  20: {
    outline: '50,2 91.6,26 91.6,74 50,98 8.4,74 8.4,26',
    faces: [
      [0, '50,15.5 79.9,67.3 20.1,67.3'],
      [2, '50,15.5 91.6,26 79.9,67.3'],
      [3, '79.9,67.3 50,98 20.1,67.3'],
      [1, '20.1,67.3 8.4,26 50,15.5'],
      [2, '50,15.5 50,2 91.6,26'],
      [3, '79.9,67.3 91.6,26 91.6,74'],
      [3, '79.9,67.3 91.6,74 50,98'],
      [3, '20.1,67.3 50,98 8.4,74'],
      [2, '20.1,67.3 8.4,74 8.4,26'],
      [2, '50,15.5 8.4,26 50,2'],
    ],
    number: { x: 50, y: 55.3, size: 26, baseline: 64.6 },
  },
  };
  const sides = Object.keys(shapes).map(Number);

  // The coin, a two-sided die (DICE-SPEC.md): a round front face inside a bevelled rim, lit from the upper left like the
  // dice, with a fine ring inside the rim. The rim's lit half is tone 1 and its far half tone 3, as on the d6. Its result
  // is a word, so the face holds "Heads" or "Tails" at a size that fits the wider of the two.
  const coinSides = 2;
  const coinFaces = ['Heads', 'Tails'];
  const coin = {
    radius: 46,
    rim: [
      [1, 'M82.53,17.47 A46,46 0 0 0 17.47,82.53 L23.84,76.16 A37,37 0 0 1 76.16,23.84 Z'],
      [3, 'M17.47,82.53 A46,46 0 0 0 82.53,17.47 L76.16,23.84 A37,37 0 0 1 23.84,76.16 Z'],
    ],
    face: 37,
    ring: 32.5,
    number: { x: 50, y: 50, size: 17.5, baseline: 56.3 },
  };

  function element(name, attributes = {}) {
    const node = document.createElementNS(svgNS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  // data-sides picks the die's colour in css/dice.css.
  function svg(className, count) {
    return element('svg', {
      viewBox: '0 0 100 100', class: className, 'data-sides': count, 'aria-hidden': 'true', focusable: 'false',
    });
  }

  function body(count) {
    const group = element('g');
    if (count === coinSides) {
      for (const [tone, d] of coin.rim) group.append(element('path', { d, class: `die-face tone-${tone}` }));
      group.append(element('circle', { cx: 50, cy: 50, r: coin.face, class: 'die-face tone-0' }));
      group.append(element('circle', { cx: 50, cy: 50, r: coin.radius, class: 'die-outline' }));
      return group;
    }
    for (const [tone, points] of shapes[count].faces) {
      group.append(element('polygon', { points, class: `die-face tone-${tone}` }));
    }
    group.append(element('polygon', { points: shapes[count].outline, class: 'die-outline' }));
    return group;
  }

  // A small line drawing of the die, in its colour, for the sides picker.
  function icon(count) {
    const picture = svg('die-icon', count);
    picture.append(body(count));
    return picture;
  }

  // The die on the stage: a shadow, then the body with its number.
  // The word or number a result reads as: 17 on a d20, Heads or Tails on the coin.
  function label(count, value) {
    return count === coinSides ? coinFaces[value - 1] : String(value);
  }

  function stageDie(count) {
    const shape = count === coinSides ? coin : shapes[count];
    const shadow = svg('die-shadow', count);
    shadow.append(count === coinSides
      ? element('circle', { cx: 50, cy: 50, r: coin.radius })
      : element('polygon', { points: shape.outline }));
    const die = svg('die-body', count);
    die.append(body(count));
    // The coin's fine ring sits on its face, inside the rim; the icon leaves it out, as it's too small to read there.
    if (count === coinSides) die.append(element('circle', { cx: 50, cy: 50, r: coin.ring, class: 'coin-ring' }));
    const number = element('text', { class: 'die-number', x: shape.number.x, 'text-anchor': 'middle' });
    die.append(number);
    return {
      count, shadow, die, number,
      show(value) {
        number.removeAttribute('data-idle');
        number.textContent = label(count, value);
        number.setAttribute('font-size', shape.number.size);
        number.setAttribute('y', shape.number.baseline);
      },
      // Before a roll the face names the die ("d20") in a quieter ink, so it isn't read as a result.
      showIdle() {
        const size = Math.round(shape.number.size * (count >= 10 ? 0.62 : count === coinSides ? 0.84 : 0.72));
        number.setAttribute('data-idle', '');
        number.textContent = count === coinSides ? 'Coin' : `d${count}`;
        number.setAttribute('font-size', size);
        number.setAttribute('y', Math.round((shape.number.y + 0.36 * size) * 10) / 10);
      },
    };
  }

  // A uniform whole number from 1 to count, from the platform's cryptographic random generator.
  // Values past the last whole multiple of count are drawn again, so no face is favoured.
  function randomFace(count) {
    const limit = Math.floor(0x100000000 / count) * count;
    const value = new Uint32Array(1);
    do crypto.getRandomValues(value); while (value[0] >= limit);
    return (value[0] % count) + 1;
  }

  const duration = 720;
  const landsAt = 0.78;
  // When the number changes in the air (ms). The gaps grow, so the flicker slows into the result.
  const ticks = [0, 45, 95, 150, 210, 275, 350, 440];

  function tumbleFrames(spin) {
    const turn = degrees => `${spin * degrees}deg`;
    return [
      { offset: 0, transform: 'translate(0, 0) rotate(0deg) scale(1)', easing: 'cubic-bezier(.4, 0, 1, 1)' },
      { offset: 0.1, transform: `translate(0, 2%) rotate(${turn(-8)}) scale(.94)`, easing: 'cubic-bezier(.2, .6, .4, 1)' },
      { offset: 0.42, transform: `translate(0, -7%) rotate(${turn(210)}) scale(1.1)`, easing: 'cubic-bezier(.5, 0, .9, .5)' },
      { offset: landsAt, transform: `translate(0, 0) rotate(${turn(366)}) scale(.95)`, easing: 'cubic-bezier(.2, .8, .3, 1)' },
      { offset: 0.9, transform: `translate(0, 0) rotate(${turn(358)}) scale(1.02)`, easing: 'cubic-bezier(.3, 0, .3, 1)' },
      { offset: 1, transform: `translate(0, 0) rotate(${turn(360)}) scale(1)` },
    ];
  }

  // The shadow stays on the table: it drifts and fades while the die is in the air.
  function shadowFrames(spin) {
    const turn = degrees => `${spin * degrees}deg`;
    return [
      { offset: 0, transform: 'translate(2%, 4%) rotate(0deg) scale(1)', opacity: 0.6, easing: 'cubic-bezier(.4, 0, 1, 1)' },
      { offset: 0.1, transform: `translate(1%, 3%) rotate(${turn(-8)}) scale(.96)`, opacity: 0.65, easing: 'cubic-bezier(.2, .6, .4, 1)' },
      { offset: 0.42, transform: `translate(5%, 12%) rotate(${turn(210)}) scale(.9)`, opacity: 0.28, easing: 'cubic-bezier(.5, 0, .9, .5)' },
      { offset: landsAt, transform: `translate(1.5%, 3%) rotate(${turn(366)}) scale(.97)`, opacity: 0.68, easing: 'cubic-bezier(.2, .8, .3, 1)' },
      { offset: 1, transform: `translate(2%, 4%) rotate(${turn(360)}) scale(1)`, opacity: 0.6 },
    ];
  }

  // The coin's flip: it rises and falls back over the tumble's landing time while it turns end over end, drawn as its
  // height squashing to an edge and back. Seven half turns, slowing as it comes down. Only transforms move.
  const halfTurns = 7;
  const flipSteps = 28;
  const turned = p => halfTurns * Math.PI * (1 - (1 - p) ** 2);
  function flipFrames() {
    const frames = [];
    for (let step = 0; step <= flipSteps; step++) {
      const p = step / flipSteps;
      const lift = 4 * p * (1 - p);
      const size = 1 + 0.14 * lift;
      const edge = Math.max(0.04, Math.abs(Math.cos(turned(p))));
      frames.push({ offset: p * landsAt, transform: `translate(0, ${(-16 * lift).toFixed(2)}%) scale(${size.toFixed(3)}, ${(size * edge).toFixed(3)})` });
    }
    frames.push({ offset: 0.88, transform: 'translate(0, 0) scale(1.03, .96)', easing: 'cubic-bezier(.3, 0, .3, 1)' });
    frames.push({ offset: 1, transform: 'translate(0, 0) scale(1, 1)' });
    return frames;
  }
  // The shadow stays on the table, shrinking and fading while the coin is up.
  function flipShadowFrames() {
    return [
      { offset: 0, transform: 'translate(2%, 4%) scale(1)', opacity: 0.6, easing: 'cubic-bezier(.3, .6, .5, 1)' },
      { offset: landsAt / 2, transform: 'translate(6%, 12%) scale(.8)', opacity: 0.25, easing: 'cubic-bezier(.5, 0, .7, .4)' },
      { offset: landsAt, transform: 'translate(2%, 4%) scale(1)', opacity: 0.65 },
      { offset: 1, transform: 'translate(2%, 4%) scale(1)', opacity: 0.6 },
    ];
  }
  // When the coin is edge-on (ms), where its face changes: Heads and Tails in turn, ending on the result as it lands.
  const flipTicks = Array.from({ length: halfTurns }, (_, turn) => Math.round((1 - Math.sqrt(1 - (turn + 0.5) / halfTurns)) * landsAt * duration));

  // Rolls the stage die. onLand(result) runs once the result shows, and done() once the die has settled.
  // Returns a function that stops the roll early.
  function roll(stage, { reducedMotion, onLand, done }) {
    const result = randomFace(stage.count);
    const timers = [];
    const animations = [];
    const after = (ms, action) => timers.push(setTimeout(action, ms));
    const land = () => {
      stage.show(result);
      onLand(result);
    };
    if (reducedMotion) {
      // No movement: the old number fades out and the result fades in.
      animations.push(stage.number.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, easing: 'ease-in' }));
      after(90, () => {
        land();
        animations.push(stage.number.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' }));
      });
      after(250, done);
    } else if (stage.count === coinSides) {
      animations.push(stage.die.animate(flipFrames(), duration));
      animations.push(stage.shadow.animate(flipShadowFrames(), duration));
      flipTicks.forEach((at, turn) => {
        after(at, () => stage.show((halfTurns - 1 - turn) % 2 === 0 ? result : 3 - result));
      });
      after(duration * landsAt, land);
      after(duration, done);
    } else {
      const spin = randomFace(2) === 1 ? 1 : -1;
      animations.push(stage.die.animate(tumbleFrames(spin), duration));
      animations.push(stage.shadow.animate(shadowFrames(spin), duration));
      let last = 0;
      for (const at of ticks) {
        // A different face each tick, so the flicker never seems to stall. These faces are only for show.
        after(at, () => {
          let face;
          do face = randomFace(stage.count); while (face === last && stage.count > 1);
          last = face;
          stage.show(face);
        });
      }
      after(duration * landsAt, () => {
        land();
        animations.push(stage.number.animate([{ transform: 'scale(1.16)' }, { transform: 'scale(1)' }],
          { duration: 200, easing: 'cubic-bezier(.2, .8, .3, 1)' }));
      });
      after(duration, done);
    }
    return () => {
      timers.forEach(clearTimeout);
      animations.forEach(animation => animation.cancel());
    };
  }

  return { sides, coin: coinSides, icon, stageDie, label, randomFace, roll };
})();
