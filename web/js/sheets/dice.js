// The dice page (design/polish/DICE-SPEC.md), over web/dice.js's window.lifePodDice: the picker with the six dice and
// the coin, Roll, the die at the centre (a tap rolls it), and the ledger of rolls, newest first. The page lies the way
// the board does, and with two players the die and its result face the short ends. Importing this module wires the
// page and the pill's dice button. The ledger and the last die are saved with the game (game.dice), but they aren't game state: a roll
// saves without commit(), so it makes no undo step and never shows in History.

import { diceChoices, diceLedgerCap } from '../logic/data.js';
import { haptic, reducedMotion } from '../state/platform.js';
import { showDialog } from '../actions/dialog.js';
import { game, saveGame, syncBackHandling } from '../state/state.js';
import { diceButton, element } from '../ui/dom.js';

const diceDialog = /** @type {HTMLDialogElement} */ (document.querySelector('#dice'));
const diceStage = /** @type {HTMLButtonElement} */ (document.querySelector('#dice-stage'));
const dicePicker = /** @type {HTMLParent<HTMLButtonElement>} */ (document.querySelector('#dice-picker'));
const diceRoll = /** @type {HTMLButtonElement} */ (document.querySelector('#dice-roll'));
const diceResult = /** @type {HTMLParagraphElement} */ (document.querySelector('#dice-result'));
const diceFlip = /** @type {HTMLButtonElement} */ (document.querySelector('#dice-flip'));
const rollsList = /** @type {HTMLOListElement} */ (document.querySelector('#dice-rolls'));
const rollsEmpty = /** @type {HTMLParagraphElement} */ (document.querySelector('#dice-empty'));
const rollsCount = /** @type {HTMLSpanElement} */ (document.querySelector('#dice-count'));
// The result printed again at both long edges of the stage: turned 180° at the far edge, like the pill's round button,
// and upright at the near one, so the whole table reads it the right way up (DESIGN-AUDIT S5). With two players they
// face the short ends instead. Screen readers hear the result once, from #dice-result.
const diceEcho = element('span', 'dice-echo');
const diceEchoNear = element('span', 'dice-echo dice-echo-near');
for (const echo of [diceEcho, diceEchoNear]) echo.setAttribute('aria-hidden', 'true');
/** @param {string} text */
const echo = (text) => {
  diceEcho.textContent = text;
  diceEchoNear.textContent = text;
};
const app = /** @type {HTMLElement} */ (document.querySelector('.app'));
const { coin, label } = window.lifePodDice;
// The times in the ledger refresh this often while the page is open, and when it opens.
const ledgerRefresh = 30000;
/** @type {LifePodDie} */
let die;
/** @type {(() => void) | undefined} */
let stopRoll;
/** @type {ReturnType<typeof setInterval> | undefined} */
let ledgerTimer;

/** @param {number} sides */
const dieName = sides => (sides === coin ? 'Coin' : `d${sides}`);

// How long ago a roll was, in History's words, short for the row and long for screen readers: "2 min ago" and
// "2 minutes ago". A roll from another day, kept in the save, counts days.
/** @param {number} t Unix seconds. @param {boolean} [long] */
function ago(t, long = false) {
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - t));
  /** @param {number} n @param {string} short @param {string} word */
  const words = (n, short, word) => (long ? `${n} ${word}${n === 1 ? '' : 's'} ago` : `${n} ${short} ago`);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return words(Math.floor(seconds / 60), 'min', 'minute');
  if (seconds < 86400) return words(Math.floor(seconds / 3600), 'h', 'hour');
  return words(Math.floor(seconds / 86400), 'd', 'day');
}

// The ledger, newest first: each row is the die's icon, its name, the result and how long ago. The newest is raised,
// and slides in when it has just landed (fresh). The rows aren't controls, so they aren't in the tab order.
/** @param {boolean} [fresh] */
function renderRolls(fresh = false) {
  const { rolls } = game.dice;
  const rows = rolls.toReversed().map(({ d, r, t }, index) => {
    const row = element('li', 'dice-row');
    row.dataset.sides = String(d);
    if (index === 0) {
      row.dataset.latest = '';
      if (fresh) row.dataset.fresh = '';
    }
    const words = label(d, r);
    row.append(window.lifePodDice.icon(d), element('span', 'dice-row-die', dieName(d)), element('span', 'dice-row-result', words),
      element('span', 'dice-row-when', ago(t)));
    row.setAttribute('aria-label', `${d === coin ? `Coin: ${words}` : `${words} on a d${d}`}, ${ago(t, true)}`);
    return row;
  });
  rollsList.replaceChildren(...rows);
  rollsList.hidden = rows.length === 0;
  rollsEmpty.hidden = rows.length > 0;
  rollsCount.textContent = rows.length ? String(rows.length) : '';
}

// A roll that has landed joins the ledger, which keeps the newest diceLedgerCap, and the game saves. The list goes back
// to the top, where the roll is.
/** @param {number} d @param {number} r */
function addRoll(d, r) {
  const { rolls } = game.dice;
  rolls.push({ d, r, t: Math.round(Date.now() / 1000) });
  rolls.splice(0, Math.max(0, rolls.length - diceLedgerCap));
  saveGame();
  renderRolls(true);
  rollsList.scrollTop = 0;
}

// Shows the chosen die without a result. A roll in progress stops.
/** @param {number} sides */
function showDie(sides) {
  stopRoll?.();
  stopRoll = undefined;
  die = window.lifePodDice.stageDie(sides);
  die.showIdle();
  echo('');
  diceStage.replaceChildren(die.shadow, die.die, diceEcho, diceEchoNear);
  diceRoll.textContent = sides === coin ? 'Flip coin' : `Roll d${sides}`;
  diceStage.setAttribute('aria-label', diceRoll.textContent);
  diceResult.textContent = '';
  for (const choice of dicePicker.children) choice.setAttribute('aria-pressed', String(Number(choice.value) === sides));
}

// Taps during a roll are ignored, so every roll shows its result.
function rollDie() {
  if (stopRoll) return;
  diceResult.textContent = '';
  echo('');
  const sides = die.count;
  stopRoll = window.lifePodDice.roll(die, {
    reducedMotion: reducedMotion.matches,
    onLand(result) {
      haptic();
      const words = label(sides, result);
      diceResult.textContent = sides === coin ? `Coin: ${words}` : `Rolled ${result} on a d${sides}`;
      echo(words);
      addRoll(sides, result);
    },
    done() { stopRoll = undefined; },
  });
}

for (const sides of diceChoices) {
  const choice = document.createElement('button');
  choice.type = 'button';
  choice.value = String(sides);
  choice.append(window.lifePodDice.icon(sides), element('span', '', dieName(sides)));
  // The page opens on the last die picked next time, the coin too.
  choice.addEventListener('click', () => {
    if (stopRoll) return;
    showDie(sides);
    if (game.dice.sides === sides) return;
    game.dice.sides = sides;
    saveGame();
  });
  dicePicker.append(choice);
}
// The page takes the board's turn (layout/board.js), so it lies the way the board does as the phone turns.
function followBoard() {
  diceDialog.dataset.turn = app.dataset.boardTurn ?? '0';
}
new MutationObserver(followBoard).observe(app, { attributes: true, attributeFilter: ['data-board-turn'] });
// It opens facing the near long side; the flip turns the whole page for the far side, as in settings. With two players,
// who sit at the short ends, the die and its result turn to face them (data-ends).
diceButton.addEventListener('click', () => {
  followBoard();
  diceDialog.toggleAttribute('data-ends', game.scores.length === 2);
  diceDialog.removeAttribute('data-flipped');
  diceFlip.setAttribute('aria-pressed', 'false');
  showDie(game.dice.sides);
  renderRolls();
  rollsList.scrollTop = 0;
  clearInterval(ledgerTimer);
  ledgerTimer = setInterval(renderRolls, ledgerRefresh);
  showDialog(diceDialog);
});
diceFlip.addEventListener('click', () => {
  const flipped = !diceDialog.hasAttribute('data-flipped');
  diceDialog.toggleAttribute('data-flipped', flipped);
  diceFlip.setAttribute('aria-pressed', String(flipped));
});
diceStage.addEventListener('click', rollDie);
diceRoll.addEventListener('click', rollDie);
diceDialog.querySelector('[data-close]').addEventListener('click', () => diceDialog.close());
diceDialog.addEventListener('close', () => {
  clearInterval(ledgerTimer);
  ledgerTimer = undefined;
  showDie(game.dice.sides);
  syncBackHandling();
});
