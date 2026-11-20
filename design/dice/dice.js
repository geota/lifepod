// Reference implementation for design/dice/SPEC.md: drawing, true-random rolls and the roll animation.
// The preview uses it; the app can lift it as is (no inline styles, only presentation attributes and classes).
import { dice, pointsAttribute } from './shapes.js';

const svgNS = 'http://www.w3.org/2000/svg';

function el(name, attributes = {}) {
  const node = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function polygon(points, className) {
  return el('polygon', { points: pointsAttribute(points), class: className });
}

// The faces and silhouette of one die, without a number.
function body(sides) {
  const die = dice[sides];
  const group = el('g');
  for (const face of die.faces) group.append(polygon(face.points, `die-face tone-${face.tone}`));
  group.append(polygon(die.outline, 'die-outline'));
  return group;
}

// A small one-colour icon for the sides picker.
export function dieIcon(sides) {
  const svg = el('svg', { viewBox: '0 0 100 100', class: 'die-icon', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(body(sides));
  return svg;
}

// The stage die: a shadow and the body with its number. Returns the parts the animation needs.
export function stageDie(sides) {
  const die = dice[sides];
  const shadow = el('svg', { viewBox: '0 0 100 100', class: 'die-shadow', 'aria-hidden': 'true', focusable: 'false' });
  shadow.append(polygon(die.outline, ''));
  const svg = el('svg', { viewBox: '0 0 100 100', class: 'die-stage-body', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(body(sides));
  const number = el('text', { class: 'die-number', x: die.number.x, 'text-anchor': 'middle' });
  svg.append(number);
  const showNumber = (value) => {
    number.removeAttribute('data-idle');
    number.textContent = String(value);
    number.setAttribute('font-size', die.number.size);
    number.setAttribute('y', die.number.baseline);
  };
  // Before the first roll the face names the die ("d20") in a quieter ink, so it isn't read as a result.
  const showIdle = () => {
    const size = Math.round(die.number.size * (sides >= 10 ? 0.62 : 0.72));
    number.setAttribute('data-idle', '');
    number.textContent = `d${sides}`;
    number.setAttribute('font-size', size);
    number.setAttribute('y', Math.round((die.number.y + 0.36 * size) * 10) / 10);
  };
  return { shadow, svg, number, showNumber, showIdle };
}

// A uniform whole number from 1 to sides, from the platform's cryptographic generator.
// Rejection sampling removes the modulo bias.
export function rollValue(sides) {
  const limit = Math.floor(0x100000000 / sides) * sides;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer); while (buffer[0] >= limit);
  return (buffer[0] % sides) + 1;
}

export const rollTiming = {
  duration: 720,
  land: 0.78, // fraction of the duration where the die lands and the result appears
  // When the number changes during the tumble (ms). The gaps grow, so the flicker slows into the result.
  ticks: [0, 45, 95, 150, 210, 275, 350, 440],
};

export function tumbleFrames(spin) {
  const turn = (deg) => `${spin * deg}deg`;
  return [
    { offset: 0, transform: 'translate(0, 0) rotate(0deg) scale(1)', easing: 'cubic-bezier(.4, 0, 1, 1)' },
    { offset: 0.1, transform: `translate(0, 2%) rotate(${turn(-8)}) scale(.94)`, easing: 'cubic-bezier(.2, .6, .4, 1)' },
    { offset: 0.42, transform: `translate(0, -7%) rotate(${turn(210)}) scale(1.1)`, easing: 'cubic-bezier(.5, 0, .9, .5)' },
    { offset: rollTiming.land, transform: `translate(0, 0) rotate(${turn(366)}) scale(.95)`, easing: 'cubic-bezier(.2, .8, .3, 1)' },
    { offset: 0.9, transform: `translate(0, 0) rotate(${turn(358)}) scale(1.02)`, easing: 'cubic-bezier(.3, 0, .3, 1)' },
    { offset: 1, transform: 'translate(0, 0) rotate(360deg) scale(1)' },
  ];
}

// The shadow stays on the table: it drifts away and fades while the die is in the air.
export function shadowFrames(spin) {
  const turn = (deg) => `${spin * deg}deg`;
  return [
    { offset: 0, transform: 'translate(2%, 4%) rotate(0deg) scale(1)', opacity: 0.6, easing: 'cubic-bezier(.4, 0, 1, 1)' },
    { offset: 0.1, transform: `translate(1%, 3%) rotate(${turn(-8)}) scale(.96)`, opacity: 0.65, easing: 'cubic-bezier(.2, .6, .4, 1)' },
    { offset: 0.42, transform: `translate(5%, 12%) rotate(${turn(210)}) scale(.9)`, opacity: 0.28, easing: 'cubic-bezier(.5, 0, .9, .5)' },
    { offset: rollTiming.land, transform: `translate(1.5%, 3%) rotate(${turn(366)}) scale(.97)`, opacity: 0.68, easing: 'cubic-bezier(.2, .8, .3, 1)' },
    { offset: 1, transform: 'translate(2%, 4%) rotate(360deg) scale(1)', opacity: 0.6 },
  ];
}

// Plays one roll and resolves with the result once the die has settled.
// onLand runs when the result appears (the place for a haptic tick).
export function playRoll(parts, sides, { reducedMotion = false, onLand } = {}) {
  const result = rollValue(sides);
  const { shadow, svg, number, showNumber } = parts;
  if (reducedMotion) {
    // No movement: the old number fades out, the result fades in.
    const out = number.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, easing: 'ease-in', fill: 'forwards' });
    return out.finished.then(() => {
      showNumber(result);
      onLand?.();
      out.cancel();
      return number.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' }).finished;
    }).then(() => result);
  }
  const spin = rollValue(2) === 1 ? 1 : -1;
  const options = { duration: rollTiming.duration };
  svg.animate(tumbleFrames(spin), options);
  const tumble = shadow.animate(shadowFrames(spin), options);
  let last = 0;
  const timers = rollTiming.ticks.map((at) => setTimeout(() => {
    // A different face each tick, so the flicker never seems to stall.
    let face;
    do face = rollValue(sides); while (face === last && sides > 1);
    last = face;
    showNumber(face);
  }, at));
  const landAt = rollTiming.duration * rollTiming.land;
  timers.push(setTimeout(() => {
    showNumber(result);
    onLand?.();
    number.animate([{ transform: 'scale(1.16)' }, { transform: 'scale(1)' }], { duration: 200, easing: 'cubic-bezier(.2, .8, .3, 1)' });
  }, landAt));
  return tumble.finished.then(() => result, () => { timers.forEach(clearTimeout); return result; });
}
