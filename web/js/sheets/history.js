// The History sheet (MANA-UNDO-SPEC §6.8): the game's steps, newest first, with Now between the steps ahead (struck
// through, which Redo brings back) and the steps taken; a tap on a row goes back or forward to just after it, and Back and
// Forward step one at a time. A hold on Undo opens it, and so does Settings → Game → History. Importing this module wires
// the sheet.

import { jumpTo, redo, undo } from '../actions/history.js';
import { showDialog } from '../actions/dialog.js';
import { describeStep, seatWords } from '../logic/history.js';
import { inColourOf } from '../render/tile.js';
import { game, syncBackHandling } from '../state/state.js';
import { element } from '../ui/dom.js';

/** @typedef {import('../logic/history.js').Step} Step */

const historyDialog = /** @type {HTMLDialogElement} */ (document.querySelector('#history'));
const list = /** @type {HTMLOListElement} */ (document.querySelector('#history-list'));
const backButton = /** @type {HTMLButtonElement} */ (document.querySelector('#history-back'));
const forwardButton = /** @type {HTMLButtonElement} */ (document.querySelector('#history-forward'));
const flipButton = /** @type {HTMLButtonElement} */ (document.querySelector('#history-flip'));
const emptyNote = /** @type {HTMLParagraphElement} */ (document.querySelector('#history-empty'));

// Rows are drawn a page at a time, more as the list scrolls to its end.
const page = 100;
let shown = page;
/** @type {Element | null} */
let opener = null;

// How long ago a step was, from the history's base and its seconds.
/** @param {Step} step */
function ago(step) {
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - game.history.base / 1000 - step.t));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  return `${Math.floor(seconds / 3600)} h ago`;
}

// One step's row: the seat's dot, "Player 2 · Sky", what changed and how long ago; a new game is a divider. A tap goes to
// just after it.
/** @param {Step} step @param {number} index @param {boolean} ahead */
function row(step, index, ahead) {
  const button = element('button', 'history-row');
  button.type = 'button';
  button.dataset.at = String(index + 1);
  if (ahead) button.dataset.ahead = '';
  const when = element('span', 'history-when', ago(step));
  if (step.k === 'newGame') {
    const scores = Array.isArray(step.d.scores) ? step.d.scores[1] : game.scores;
    const life = Array.isArray(step.d.startingLife) ? step.d.startingLife[1] : scores[0];
    button.classList.add('history-divider');
    button.append(element('span', 'history-what', `New game · ${scores.length} players at ${life}`), when);
  } else {
    const { tiles, table, label } = describeStep(step, game);
    const seat = tiles[0]?.index ?? (step.d.turn ? step.d.turn[1].active ?? step.d.turn[1].first : null);
    const dot = element('span', 'history-dot');
    dot.setAttribute('aria-hidden', 'true');
    if (seat !== null && seat < game.scores.length) inColourOf(dot, seat);
    else dot.dataset.table = '';
    const who = seat !== null && seat < game.scores.length ? seatWords(game, seat).replace(', ', ' · ') : 'Table';
    const what = [...tiles.flatMap(({ index: tile, words }) => (tile === seat ? words : [`Player ${tile + 1}: ${words.join(', ')}`])), ...table];
    button.append(dot, element('span', 'history-who', who), element('span', 'history-what', (step.d.turn && label ? [label, ...what] : what).join(', ')), when);
  }
  button.setAttribute('aria-label', `${button.textContent}${ahead ? ', undone' : ''}. Go to here`);
  button.addEventListener('click', () => {
    jumpTo(index + 1);
    renderHistory();
  });
  return element('li', '', button);
}

// The list, newest first: the steps ahead (struck through), Now, then the steps taken, as far as has been scrolled.
export function renderHistory() {
  const { at, steps } = game.history;
  const items = [];
  for (let index = steps.length - 1; index >= 0 && items.length < shown; index--) {
    if (index === at - 1) items.push(element('li', 'history-now', 'Now'));
    items.push(row(steps[index], index, index >= at));
  }
  if (at === 0 && steps.length && items.length < shown + 1) items.push(element('li', 'history-now', 'Now: the start'));
  list.replaceChildren(...items);
  emptyNote.hidden = steps.length > 0;
  backButton.disabled = at === 0;
  forwardButton.disabled = at >= steps.length;
}

/** @param {Element | null} [from] What to give focus back to when it closes. */
export function openHistorySheet(from = document.activeElement) {
  opener = from;
  shown = page;
  historyDialog.removeAttribute('data-flipped');
  flipButton.setAttribute('aria-pressed', 'false');
  renderHistory();
  showDialog(historyDialog);
}

list.addEventListener('scroll', () => {
  if (list.scrollTop + list.clientHeight < list.scrollHeight - 200 || shown >= game.history.steps.length) return;
  shown += page;
  renderHistory();
});
// Arrow keys move between the rows.
list.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const rows = [...list.querySelectorAll('button')];
  const at = rows.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
  const next = rows[Math.min(rows.length - 1, Math.max(0, at + (event.key === 'ArrowDown' ? 1 : -1)))];
  if (!next) return;
  event.preventDefault();
  next.focus();
});
backButton.addEventListener('click', () => {
  undo();
  renderHistory();
});
forwardButton.addEventListener('click', () => {
  redo();
  renderHistory();
});
flipButton.addEventListener('click', () => {
  const flipped = !historyDialog.hasAttribute('data-flipped');
  historyDialog.toggleAttribute('data-flipped', flipped);
  flipButton.setAttribute('aria-pressed', String(flipped));
});
historyDialog.querySelector('[data-close]')?.addEventListener('click', () => historyDialog.close());
historyDialog.addEventListener('close', () => {
  syncBackHandling();
  if (opener instanceof HTMLElement && opener.isConnected && !opener.closest('[inert]')) opener.focus();
  opener = null;
});
document.querySelector('#settings-history')?.addEventListener('click', event => openHistorySheet(/** @type {Element} */ (event.currentTarget)));
