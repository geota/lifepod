// The dice sheet (design/dice/SPEC.md), over web/dice.js's window.lifePodDice: the picker, the stage die and a roll.
// Importing this module wires the sheet and the pill's dice button.

import { haptic, reducedMotion } from '../state/platform.js';
import { showDialog } from '../actions/dialog.js';
import { syncBackHandling } from '../state/state.js';
import { diceButton, element } from '../ui/dom.js';

const diceDialog = /** @type {HTMLDialogElement} */ (document.querySelector('#dice'));
const diceStage = /** @type {HTMLDivElement} */ (document.querySelector('#dice-stage'));
const dicePicker = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#dice-picker'));
const diceRoll = /** @type {HTMLButtonElement} */ (document.querySelector('#dice-roll'));
const diceResult = /** @type {HTMLParagraphElement} */ (document.querySelector('#dice-result'));
// The result printed a second time on the far edge of the stage, turned 180° like the pill's round button, so a player
// across the table reads the roll the right way up too (DESIGN-AUDIT S5). Screen readers hear it once, from #dice-result.
const diceEcho = element('span', 'dice-echo');
diceEcho.setAttribute('aria-hidden', 'true');
let diceSides = 20;
let die;
let stopRoll;

// Shows the chosen die without a result. A roll in progress stops.
function showDie(sides) {
  stopRoll?.();
  stopRoll = undefined;
  diceSides = sides;
  die = window.lifePodDice.stageDie(sides);
  die.showIdle();
  diceEcho.textContent = '';
  diceStage.replaceChildren(die.shadow, die.die, diceEcho);
  diceRoll.textContent = `Roll d${sides}`;
  diceResult.textContent = '';
  for (const choice of dicePicker.children) choice.setAttribute('aria-pressed', String(Number(choice.value) === sides));
}

// Taps during a roll are ignored, so every roll shows its result.
function rollDie() {
  if (stopRoll) return;
  diceResult.textContent = '';
  diceEcho.textContent = '';
  const sides = diceSides;
  stopRoll = window.lifePodDice.roll(die, {
    reducedMotion: reducedMotion.matches,
    onLand(result) {
      haptic();
      diceResult.textContent = `Rolled ${result} on a d${sides}`;
      diceEcho.textContent = String(result);
    },
    done() { stopRoll = undefined; },
  });
}

for (const sides of window.lifePodDice.sides) {
  const choice = document.createElement('button');
  choice.type = 'button';
  choice.value = String(sides);
  choice.append(window.lifePodDice.icon(sides), `d${sides}`);
  choice.addEventListener('click', () => {
    if (!stopRoll) showDie(sides);
  });
  dicePicker.append(choice);
}
diceButton.addEventListener('click', () => {
  showDie(diceSides);
  showDialog(diceDialog);
});
diceStage.addEventListener('click', rollDie);
diceRoll.addEventListener('click', rollDie);
diceDialog.querySelector('[data-close]').addEventListener('click', () => diceDialog.close());
diceDialog.addEventListener('close', () => {
  showDie(diceSides);
  syncBackHandling();
});
