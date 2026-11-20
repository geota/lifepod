// Builds the preview page from shapes.js and dice.js.
import { dieSides } from './shapes.js';
import { dieIcon, stageDie, tumbleFrames, shadowFrames, rollTiming } from './dice.js';
import { installDiceSheet } from './mock-app.js';

function stage(sides, show) {
  const box = document.createElement('div');
  box.className = 'dice-stage';
  const parts = stageDie(sides);
  show(parts);
  box.append(parts.shadow, parts.svg);
  return { box, parts };
}
function figure(content, caption) {
  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.textContent = caption;
  fig.append(content, cap);
  return fig;
}

const widest = { 4: 4, 6: 6, 8: 8, 10: 10, 12: 12, 20: 20 };
for (const sides of dieSides) {
  document.querySelector('#row-results').append(figure(stage(sides, p => p.showNumber(widest[sides])).box, `d${sides}`));
  document.querySelector('#row-idle').append(figure(stage(sides, p => p.showIdle()).box, `d${sides}, idle`));
}

const picker = document.querySelector('#picker-demo');
for (const sides of dieSides) {
  const choice = document.createElement('button');
  choice.type = 'button';
  choice.setAttribute('aria-pressed', String(sides === 20));
  const label = document.createElement('span');
  label.textContent = `d${sides}`;
  choice.append(dieIcon(sides), label);
  picker.append(choice);
}
for (const size of [16, 22, 32, 48]) {
  for (const sides of dieSides) {
    const icon = dieIcon(sides);
    icon.setAttribute('width', size);
    icon.setAttribute('height', size);
    document.querySelector('#icon-scale').append(icon);
  }
}

// Frames of a d20 roll, paused at fixed times. The number shown follows the tick schedule.
const film = document.querySelector('#filmstrip');
const times = [0, 70, 160, 250, 330, 420, 500, 562, 640, 720];
const faces = [20, 7, 13, 2, 18, 9, 15, 17, 17, 17];
times.forEach((t, i) => {
  const { box, parts } = stage(20, p => p.showNumber(faces[i]));
  const opts = { duration: rollTiming.duration, fill: 'both' };
  const a = parts.svg.animate(tumbleFrames(1), opts);
  const b = parts.shadow.animate(shadowFrames(1), opts);
  for (const anim of [a, b]) { anim.pause(); anim.currentTime = Math.min(t, rollTiming.duration - 0.01); }
  film.append(figure(box, `${t} ms`));
});

const out = document.querySelector('#out-row');
['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].forEach((p, i) => {
  const tile = document.createElement('div');
  tile.className = p + (i === 0 ? ' alive' : '');
  const value = document.createElement('output');
  value.textContent = i === 0 ? '12' : ['', '0', '−3', '0', '−1', '0'][i];
  tile.append(value);
  out.append(tile);
});

const sheet = installDiceSheet({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
document.querySelector('#open-sheet').addEventListener('click', () => sheet.open());
window.diceSheet = sheet;
