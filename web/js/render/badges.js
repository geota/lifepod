// The badge rows at rest (design/polish/SPEC.md §2 and §9): the far row's commander damage and the mana strip, the
// near row's turn chips, identity, counters and designations, and the turn reminders above it. Their buttons call
// the actions above this module, which app.js passes in (setBadgeActions), so nothing here imports upward.

import { placeReminders, requestFit } from '../layout/fit.js';
import {
  commanderLethal, commanderWarning, designationKinds, manaColours, poisonLethal, poisonWarning, reminderText,
} from '../logic/data.js';
import {
  dangerLevel, hasMana, isOut, needsPassing, poolText, shownCounters, trackedDesignations,
} from '../logic/rules.js';
import { clearedPools, game, reminders } from '../state/state.js';
import { board, element, icon, manaIcon, setupButton, visuallyHidden } from '../ui/dom.js';
import { bindRelease, bindStep, bindTap } from '../ui/press.js';
import { counterIcon, designationIcon, identityChip, inColourOf, renderWatermark } from './tile.js';

/** @typedef {import('../logic/data.js').BoardMode} BoardMode */
/** @typedef {import('../logic/data.js').DesignationKind} DesignationKind */

/**
 * What the badge rows' buttons do: actions from above the renderers, passed in once by app.js.
 *
 * @typedef {object} BadgeActions
 * @property {() => void} stepTurn
 * @property {() => void} stepBack
 * @property {(index: number) => void} startTurn
 * @property {(index: number, colour: number) => void} spendMana
 * @property {(index: number) => void} clearPool
 * @property {(index: number) => void} undoClear
 * @property {(index: number, kind: DesignationKind) => void} dismissReminder
 * @property {(mode: BoardMode) => void} setBoardMode
 */
/** @type {BadgeActions} */
let badgeActions;
/** @param {BadgeActions} handlers */
export function setBadgeActions(handlers) {
  badgeActions = handlers;
}

// Redraws the holders' near rows: whether an out holder's tile asks to pass it on depends on who else is still in.
export function renderPassHints() {
  for (const kind of designationKinds) if (game[kind] !== null) renderBadges(game[kind]);
}

// The reminders a tile shows, newest last: each a chip in the turn chip's style that a tap dismisses. A chip already
// showing stays the same element, so a redraw of the tile neither replays its entrance nor pulls it from under a finger.
function syncReminderChips(index, box) {
  const showing = new Map([...box.children].map(chip => [chip.dataset.designation, chip]));
  const chips = [...(reminders.get(index)?.keys() ?? [])].map(kind => showing.get(kind) ?? reminderChip(index, kind));
  if (chips.length !== box.childElementCount || chips.some((chip, at) => box.children[at] !== chip)) box.replaceChildren(...chips);
}

function reminderChip(index, kind) {
  const [label, words] = reminderText[kind].split(': ');
  const chip = element('button', 'chip reminder-chip', designationIcon(kind), element('span', 'reminder-words', element('b', 'reminder-label', `${label}: `), words));
  chip.type = 'button';
  chip.dataset.designation = kind;
  chip.setAttribute('aria-label', `${reminderText[kind]}. Dismiss`);
  bindRelease(chip, () => badgeActions.dismissReminder(index, kind));
  return chip;
}

// The turn chips that lead a tile's near row. Rounds: the first player's flag carries the round and steps it. Turn by
// turn: the active player's chip says "Turn" and the round and passes the turn, and the first player keeps a small
// flag; with nobody's turn yet, every player who isn't out has a "Start" chip to start theirs.
function turnChips(index) {
  const { turns } = game;
  const { first, active, round } = game.turn;
  const chips = [];
  if (turns === 'rounds' && first === index) {
    const chip = element('button', 'chip turn-chip round-chip', icon('flag'), String(round));
    chip.setAttribute('aria-label', `Round ${round}. Next round`);
    bindStep(chip, badgeActions.stepTurn, badgeActions.stepBack);
    chips.push(chip);
  } else if (turns === 'turns') {
    if (active === index || (active === null && !isOut(game, index))) {
      // When the word "Turn" gives way, the round keeps a "T" so the untap symbol doesn't read as a letter.
      const chip = active === index
        ? element('button', 'chip turn-chip active-chip', manaIcon('untap'), element('span', 'turn-word', 'Turn'), element('span', 'turn-round', String(round)))
        : element('button', 'chip turn-chip start-chip', manaIcon('untap'), 'Start');
      // Each name starts with the chip's own words (WCAG 2.5.3), so voice control can say what it sees.
      chip.setAttribute('aria-label', active === index ? `Turn ${round}. Player ${index + 1}'s turn, pass it`
        : `Start Player ${index + 1}'s turn`);
      if (active === index) bindStep(chip, badgeActions.stepTurn, badgeActions.stepBack);
      else bindTap(chip, () => badgeActions.startTurn(index));
      chips.push(chip);
    }
    if (first === index) {
      const flag = element('span', 'chip flag-chip', icon('flag'), visuallyHidden('Went first'));
      chips.push(flag);
    }
  }
  for (const chip of chips) if (chip.tagName === 'BUTTON') chip.type = 'button';
  return chips;
}

// A tile's mana strip at rest: each colour its pool holds, with its amount (tap to spend one), then the eraser. Or
// "Undo clear" for 5 seconds after the eraser.
function stripItems(index) {
  if (clearedPools.has(index)) {
    const undo = element('button', 'strip-undo', icon('undo'), 'Undo clear');
    undo.type = 'button';
    undo.setAttribute('aria-label', `Undo clear, Player ${index + 1}'s mana pool`);
    bindTap(undo, () => badgeActions.undoClear(index));
    return [undo, stripChip(index)];
  }
  const items = manaColours.flatMap((colour, at) => {
    const amount = game.pools[index][at];
    if (!amount) return [];
    const pip = element('span', 'pip');
    pip.dataset.pip = colour.id;
    pip.setAttribute('aria-hidden', 'true');
    const spend = element('button', 'strip-spend', pip, String(amount));
    spend.type = 'button';
    spend.dataset.colour = colour.id;
    spend.setAttribute('aria-label', `Player ${index + 1}, ${amount} ${colour.name} mana. Spend one`);
    bindTap(spend, () => badgeActions.spendMana(index, at));
    return [spend];
  });
  const eraser = element('button', 'strip-clear', icon('eraser'));
  eraser.type = 'button';
  eraser.setAttribute('aria-label', `Clear Player ${index + 1}'s mana pool`);
  bindTap(eraser, () => badgeActions.clearPool(index));
  return [...items, eraser, stripChip(index)];
}

// The strip folded into one chip, where the strip can't fit: the pool's colours and amounts with a caret, which opens
// mana mode. Or, for 5 seconds after the eraser, "Undo".
function stripChip(index) {
  let chip;
  if (clearedPools.has(index)) {
    chip = element('button', 'chip strip-chip', icon('undo'), 'Undo');
    chip.setAttribute('aria-label', `Undo clearing Player ${index + 1}'s mana pool`);
    bindTap(chip, () => badgeActions.undoClear(index));
  } else {
    // One colour and its amount, or several colours' symbols stacked before the pool's total, so the chip stays short.
    const held = manaColours.map((colour, at) => ({ colour, amount: game.pools[index][at] })).filter(({ amount }) => amount > 0);
    const pip = (colour) => {
      const symbol = element('span', 'pip');
      symbol.dataset.pip = colour.id;
      return symbol;
    };
    const parts = held.length > 1
      ? [element('span', 'summary-item', ...held.map(({ colour }) => pip(colour)), String(held.reduce((sum, { amount }) => sum + amount, 0)))]
      : held.map(({ colour, amount }) => element('span', 'summary-item', pip(colour), String(amount)));
    chip = element('button', 'chip strip-chip', ...parts, icon('caret-right'));
    const total = held.reduce((sum, { amount }) => sum + amount, 0);
    chip.setAttribute('aria-label', `${total} mana. Player ${index + 1}'s pool: ${poolText(game, index)}. Open mana`);
    bindRelease(chip, () => badgeActions.setBoardMode('mana'));
  }
  chip.type = 'button';
  return chip;
}

// The holder's chip at rest: the crown or the castle. A holder who is out and hasn't handed it on (no Turn by turn
// turn to start from) gets a "Pass it on" chip instead, which opens counters mode to give it to someone.
function designationChip({ kind, label, name, still }, index) {
  if (needsPassing(game, kind, index)) {
    const chip = element('button', 'chip pass-chip', designationIcon(kind), icon('arrow-bend-up-right'), element('span', 'pass-word', 'Pass it on'));
    chip.type = 'button';
    chip.dataset.designation = kind;
    chip.setAttribute('aria-label', `Pass it on: Player ${index + 1} is out and ${still}. Give ${name} to someone in counters`);
    bindRelease(chip, () => badgeActions.setBoardMode('counters'));
    return chip;
  }
  const chip = element('span', 'chip designation-chip', designationIcon(kind), visuallyHidden(label));
  chip.dataset.designation = kind;
  return chip;
}

// The badge rows, each only when it has something to show. The far edge, toward the table, holds commander
// damage: a sword, like the pill's, then one chip per opponent in their own tile colour, largest first, and under it
// the mana strip while the pool has mana. The near edge holds the colour identity chip, then poison, tax, energy,
// experience and rad, each only when it's set and its switch is on, then the monarch's crown and the initiative's castle
// on their holder's tile. A turn reminder shows above the near edge, or over it on a short tile.
export function renderBadges(index) {
  const player = board.children[index];
  if (!player) return;
  renderWatermark(index);
  const far = player.querySelector('.badges.far');
  const damage = game.counters.commander ? game.commanderDamage[index]
    .map((amount, attacker) => ({ amount, attacker })).filter(({ amount }) => amount > 0)
    .sort((a, b) => b.amount - a.amount || a.attacker - b.attacker) : [];
  // The sword only labels the row: each chip already says whose commander it counts.
  const sword = element('span', 'chip sword', icon('sword'));
  sword.setAttribute('aria-hidden', 'true');
  const foldedChip = game.manaPool && (hasMana(game, index) || clearedPools.has(index)) ? stripChip(index) : null;
  far.replaceChildren(...(damage.length ? [sword] : []), ...damage.map(({ amount, attacker }) => {
    const chip = inColourOf(element('span', 'chip damage', String(amount),
      visuallyHidden(` commander damage from Player ${attacker + 1}`)), attacker);
    const level = dangerLevel(amount, commanderWarning, commanderLethal);
    if (level) chip.dataset.level = level;
    return chip;
  }), ...(foldedChip ? [foldedChip] : []));
  // The strip folded onto the end of the far row, shown only when it can go nowhere else.
  far.hidden = damage.length === 0;
  far.setAttribute('aria-label', foldedChip ? 'Commander damage and mana pool' : 'Commander damage');
  const near = player.querySelector('.badges.near');
  player.toggleAttribute('data-active', game.turns === 'turns' && game.turn.active === index);
  // While a pool has mana, or for 5 seconds after the eraser, its strip shows at the far edge, and both rows stay.
  const strip = player.querySelector('.mana-strip');
  const hadFocus = strip.contains(document.activeElement) ? /** @type {HTMLElement} */ (document.activeElement).dataset.colour ?? '' : null;
  const floating = game.manaPool && (hasMana(game, index) || clearedPools.has(index));
  strip.replaceChildren(...(floating ? stripItems(index) : []));
  strip.hidden = !floating;
  if (floating) {
    // Keep keyboard focus in the strip as items come and go.
    if (hadFocus !== null) (strip.querySelector(`[data-colour="${hadFocus}"]`) ?? strip.querySelector('.strip-spend, .strip-clear, .strip-undo'))?.focus();
  } else {
    delete player.dataset.strip;
    if (hadFocus !== null) setupButton.focus();
  }
  const chips = [...turnChips(index)];
  const identity = identityChip(game.identities[index], game.identity.show);
  if (identity) chips.push(identity);
  for (const { kind } of shownCounters(game)) {
    const value = game[kind][index];
    if (value === 0) continue;
    const chip = kind === 'casts' ? element('span', 'chip', visuallyHidden('Commander tax '), counterIcon(kind), `+${value * 2}`)
      : element('span', 'chip', counterIcon(kind), String(value), visuallyHidden(` ${kind}`));
    chip.dataset.kind = kind;
    const level = kind === 'poison' ? dangerLevel(value, poisonWarning, poisonLethal) : '';
    if (level) chip.dataset.level = level;
    chips.push(chip);
  }
  for (const designation of trackedDesignations(game)) {
    if (game[designation.kind] === index) chips.push(designationChip(designation, index));
  }
  syncReminderChips(index, /** @type {HTMLElement} */ (near.parentElement).querySelector('.reminders'));
  placeReminders(player);
  // Keep keyboard focus on a turn chip as the row is rebuilt. When the turn moves to another tile, showTurn follows it.
  const turnFocus = near.contains(document.activeElement) && /** @type {Element} */ (document.activeElement).matches('.turn-chip');
  near.replaceChildren(...chips);
  if (turnFocus) near.querySelector('.turn-chip')?.focus();
  near.hidden = chips.length === 0;
  requestFit();
}
