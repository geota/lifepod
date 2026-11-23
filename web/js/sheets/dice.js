// The dice sheet (design/dice/SPEC.md), over web/dice.js's window.lifePodDice: the picker, the stage die and a roll.
// Importing this module wires the sheet and the pill's dice button.

import { haptic, reducedMotion } from '../state/platform.js';
import { syncBackHandling } from '../state/state.js';
import { diceButton } from '../ui/dom.js';

const diceDialog = /** @type {HTMLDialogElement} */ (document.querySelector('#dice'));
const diceStage = /** @type {HTMLDivElement} */ (document.querySelector('#dice-stage'));
const dicePicker = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#dice-picker'));
const diceRoll = /** @type {HTMLButtonElement} */ (document.querySelector('#dice-roll'));
const diceResult = /** @type {HTMLParagraphElement} */ (document.querySelector('#dice-result'));
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
  diceStage.replaceChildren(die.shadow, die.die);
  diceRoll.textContent = `Roll d${sides}`;
  diceResult.textContent = '';
  for (const choice of dicePicker.children) choice.setAttribute('aria-pressed', String(Number(choice.value) === sides));
}

// Taps during a roll are ignored, so every roll shows its result.
function rollDie() {
  if (stopRoll) return;
  diceResult.textContent = '';
  const sides = diceSides;
  stopRoll = window.lifePodDice.roll(die, {
    reducedMotion: reducedMotion.matches,
    onLand(result) {
      haptic();
      diceResult.textContent = `Rolled ${result} on a d${sides}`;
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
  diceDialog.showModal();
  syncBackHandling();
});
diceStage.addEventListener('click', rollDie);
diceRoll.addEventListener('click', rollDie);
diceDialog.querySelector('[data-close]').addEventListener('click', () => diceDialog.close());
diceDialog.addEventListener('close', () => {
  showDie(diceSides);
  syncBackHandling();
});
