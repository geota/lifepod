// Mock-up only: adds the dice pill and the dice sheet to the running app (web/index.html) for the renders
// in design/dice/renders. It does not change web/. The main session implements the real thing.
import { dieSides } from './shapes.js';
import { dieIcon, stageDie, playRoll } from './dice.js';

const svgNS = 'http://www.w3.org/2000/svg';
// Stand-in drawn to Phosphor's dice-five (Bold) geometry; the app should use the real Phosphor path.
function diceFiveIcon() {
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 256 256');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const frame = document.createElementNS(svgNS, 'rect');
  for (const [k, v] of Object.entries({ x: 44, y: 44, width: 168, height: 168, rx: 20, fill: 'none', stroke: 'currentColor', 'stroke-width': 24 })) frame.setAttribute(k, v);
  svg.append(frame);
  for (const [cx, cy] of [[92, 92], [164, 92], [128, 128], [92, 164], [164, 164]]) {
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('r', 16);
    svg.append(dot);
  }
  return svg;
}

export function installPill() {
  const setupButton = document.querySelector('#setup-button');
  const controls = document.createElement('div');
  controls.className = 'board-controls';
  const diceButton = document.createElement('button');
  diceButton.type = 'button';
  diceButton.className = 'dice-button';
  diceButton.id = 'dice-button';
  diceButton.setAttribute('aria-label', 'Roll dice');
  diceButton.setAttribute('aria-haspopup', 'dialog');
  diceButton.append(diceFiveIcon());
  setupButton.replaceWith(controls);
  controls.append(diceButton, setupButton);
  return { controls, diceButton };
}

const closeIcon = 'M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z';

export function installDiceSheet({ sides = 20, reducedMotion = false } = {}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'dice';
  dialog.setAttribute('aria-labelledby', 'dice-title');
  dialog.innerHTML = `
    <div class="sheet dice-sheet">
      <div class="sheet-header">
        <h2 id="dice-title">Dice</h2>
        <button class="close" type="button" data-close aria-label="Close dice" autofocus><svg class="icon" viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path d="${closeIcon}"/></svg></button>
      </div>
      <button class="dice-stage" type="button" id="dice-stage"></button>
      <div class="dice-picker" id="dice-picker" role="group" aria-label="Sides"></div>
      <button class="primary dice-roll" type="button" id="dice-roll"></button>
      <p class="visually-hidden" id="dice-announcer" aria-live="polite"></p>
    </div>`;
  document.body.append(dialog);
  const stage = dialog.querySelector('#dice-stage');
  const picker = dialog.querySelector('#dice-picker');
  const rollButton = dialog.querySelector('#dice-roll');
  const announcer = dialog.querySelector('#dice-announcer');
  let parts;
  let rolling = false;

  function select(next) {
    sides = next;
    parts = stageDie(sides);
    parts.showIdle();
    stage.replaceChildren(parts.shadow, parts.svg);
    stage.setAttribute('aria-label', `Roll a d${sides}`);
    rollButton.textContent = `Roll d${sides}`;
    for (const choice of picker.children) choice.setAttribute('aria-pressed', String(Number(choice.value) === sides));
  }
  for (const count of dieSides) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.value = count;
    choice.setAttribute('aria-label', `${count}-sided die`);
    const label = document.createElement('span');
    label.textContent = `d${count}`;
    choice.append(dieIcon(count), label);
    choice.addEventListener('click', () => { if (!rolling) select(count); });
    picker.append(choice);
  }
  async function roll() {
    if (rolling) return;
    rolling = true;
    const result = await playRoll(parts, sides, { reducedMotion });
    announcer.textContent = `Rolled ${result} on a d${sides}`;
    rolling = false;
  }
  stage.addEventListener('click', roll);
  rollButton.addEventListener('click', roll);
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  select(sides);
  return { dialog, open: () => dialog.showModal(), select, roll, get parts() { return parts; } };
}

// Lets design/dice/render.mjs drive the mock-up inside the running app.
window.diceMock = { installPill, installDiceSheet };
