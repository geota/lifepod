// The badge rows at rest (design/polish/SPEC.md §2 and §9): the far row's commander damage and the mana strip, the
// near row's turn chips, identity, counters and designations, and the turn reminders above it. Their buttons call
// the actions above this module, which app.js passes in (setBadgeActions), so nothing here imports upward.
//
// Each row's children are keyed (syncChildren in ui/dom.js): a chip that's still showing after a redraw is the same
// element, updated in place, so a finger on it, its keyboard focus and a reminder's entrance all survive the redraw.

import { placeReminders, requestFit } from '../layout/fit.js';
import {
  commanderLethal, commanderWarning, designationKinds, manaColours, poisonLethal, poisonWarning, reminderText,
} from '../logic/data.js';
import {
  dangerLevel, hasMana, isOut, needsPassing, poolText, shownCounters, trackedDesignations,
} from '../logic/rules.js';
import { clearedPools, game, reminders, stripHolds } from '../state/state.js';
import { board, element, icon, manaIcon, syncChildren, visuallyHidden } from '../ui/dom.js';
import { bindRelease, bindStep, bindTap } from '../ui/press.js';
import { counterIcon, designationIcon, identityChip, inColourOf, renderWatermark } from './tile.js';

/** @typedef {import('../logic/data.js').BoardMode} BoardMode */
/** @typedef {import('../logic/data.js').DesignationKind} DesignationKind */
/** @typedef {import('../ui/dom.js').Keyed} Keyed */

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

// The reminders a tile shows, newest last: each a chip in the turn chip's style that a tap dismisses.
/** @returns {Keyed[]} */
function reminderItems(index) {
  return [...(reminders.get(index)?.keys() ?? [])].map(kind => ({ key: `reminder-${kind}`, create: () => reminderChip(index, kind) }));
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

// Where the turn is, for a turn chip's press: the press is over once someone else steps the turn (bindStep).
const turnNow = () => `${game.turns} ${game.turn.active} ${game.turn.round}`;

// The turn chips that lead a tile's near row. Rounds: the first player's flag carries the round and steps it. Turn by
// turn: the active player's chip says "Turn" and the round and passes the turn, and the first player keeps a small
// flag; with nobody's turn yet, every player who isn't out has a "Start" chip to start theirs.
/** @returns {Keyed[]} */
function turnItems(index) {
  const { turns } = game;
  const { first, active, round } = game.turn;
  const items = [];
  if (turns === 'rounds' && first === index) {
    items.push({
      key: 'round',
      create: () => {
        const chip = element('button', 'chip turn-chip round-chip', icon('flag'), '');
        chip.type = 'button';
        bindStep(chip, badgeActions.stepTurn, badgeActions.stepBack, turnNow);
        return chip;
      },
      update: (chip) => {
        /** @type {Text} */ (chip.lastChild).data = String(round);
        chip.setAttribute('aria-label', `Round ${round}. Next round`);
      },
    });
  } else if (turns === 'turns') {
    if (active === index) {
      // When the word "Turn" gives way, the round keeps a "T" so the untap symbol doesn't read as a letter.
      items.push({
        key: 'turn',
        create: () => {
          const chip = element('button', 'chip turn-chip active-chip', manaIcon('untap'), element('span', 'turn-word', 'Turn'), element('span', 'turn-round'));
          chip.type = 'button';
          bindStep(chip, badgeActions.stepTurn, badgeActions.stepBack, turnNow);
          return chip;
        },
        update: (chip) => {
          /** @type {HTMLElement} */ (chip.querySelector('.turn-round')).textContent = String(round);
          // Each name starts with the chip's own words (WCAG 2.5.3), so voice control can say what it sees.
          chip.setAttribute('aria-label', `Turn ${round}. Player ${index + 1}'s turn, pass it`);
        },
      });
    } else if (active === null && !isOut(game, index)) {
      items.push({
        key: 'start',
        create: () => {
          const chip = element('button', 'chip turn-chip start-chip', manaIcon('untap'), 'Start');
          chip.type = 'button';
          chip.setAttribute('aria-label', `Start Player ${index + 1}'s turn`);
          bindTap(chip, () => badgeActions.startTurn(index));
          return chip;
        },
      });
    }
    if (first === index) items.push({ key: 'flag', create: () => element('span', 'chip flag-chip', icon('flag'), visuallyHidden('Went first')) });
  }
  return items;
}

// Whether a tile's strip shows: while its pool has mana, for 5 seconds after the eraser, and while it's being tapped.
function stripShows(index) {
  return game.manaPool && (hasMana(game, index) || clearedPools.has(index) || stripHolds.has(index));
}

// A tile's mana strip at rest: each colour its pool holds, with its amount (tap to spend one), then the eraser. Or
// "Undo clear" for 5 seconds after the eraser. While the strip is being tapped, its colours keep their places, at 0
// once spent (actions/mana.js), and "Undo clear" ignores taps, so a quick extra tap on the eraser can't undo it.
/** @returns {Keyed[]} */
function stripItems(index) {
  if (clearedPools.has(index)) {
    return [{
      key: 'undo',
      create: () => {
        const undo = element('button', 'strip-undo', icon('undo'), 'Undo clear');
        undo.type = 'button';
        undo.setAttribute('aria-label', `Undo clear, Player ${index + 1}'s mana pool`);
        bindTap(undo, () => stripHolds.has(index) || badgeActions.undoClear(index));
        return undo;
      },
    }, stripChipItem(index)];
  }
  const held = stripHolds.get(index)?.colours;
  const spends = manaColours.flatMap((colour, at) => {
    const amount = game.pools[index][at];
    if (!amount && !held?.has(colour.id)) return [];
    return [{
      key: `spend-${colour.id}`,
      create: () => {
        const pip = element('span', 'pip');
        pip.dataset.pip = colour.id;
        pip.setAttribute('aria-hidden', 'true');
        const spend = element('button', 'strip-spend', pip, '');
        spend.type = 'button';
        spend.dataset.colour = colour.id;
        bindTap(spend, () => badgeActions.spendMana(index, at));
        return spend;
      },
      update: (spend) => {
        /** @type {Text} */ (spend.lastChild).data = String(amount);
        spend.setAttribute('aria-label', amount ? `Player ${index + 1}, ${amount} ${colour.name} mana. Spend one` : `Player ${index + 1}, no ${colour.name} mana`);
        // Not disabled, which would drop keyboard focus from it.
        if (amount) spend.removeAttribute('aria-disabled');
        else spend.setAttribute('aria-disabled', 'true');
      },
    }];
  });
  const eraser = {
    key: 'eraser',
    create: () => {
      const button = element('button', 'strip-clear', icon('eraser'));
      button.type = 'button';
      button.setAttribute('aria-label', `Clear Player ${index + 1}'s mana pool`);
      bindTap(button, () => badgeActions.clearPool(index));
      return button;
    },
  };
  return [...spends, eraser, stripChipItem(index)];
}

// The strip folded into one chip, where the strip can't fit: the pool's colours and amounts with a caret, which opens
// mana mode. Or, for 5 seconds after the eraser, "Undo".
/** @returns {Keyed} */
function stripChipItem(index) {
  if (clearedPools.has(index)) {
    return {
      key: 'strip-undo',
      create: () => {
        const chip = element('button', 'chip strip-chip', icon('undo'), 'Undo');
        chip.type = 'button';
        chip.setAttribute('aria-label', `Undo clearing Player ${index + 1}'s mana pool`);
        bindTap(chip, () => stripHolds.has(index) || badgeActions.undoClear(index));
        return chip;
      },
    };
  }
  return {
    key: 'strip-chip',
    create: () => {
      const chip = element('button', 'chip strip-chip');
      chip.type = 'button';
      bindRelease(chip, () => badgeActions.setBoardMode('mana'));
      return chip;
    },
    update: (chip) => {
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
      chip.replaceChildren(...parts, icon('caret-right'));
      const total = held.reduce((sum, { amount }) => sum + amount, 0);
      chip.setAttribute('aria-label', `${total} mana. Player ${index + 1}'s pool: ${poolText(game, index)}. Open mana`);
    },
  };
}

// The holder's chip at rest: the crown or the castle. A holder who is out and hasn't handed it on (no Turn by turn
// turn to start from) gets a "Pass it on" chip instead, which opens counters mode to give it to someone.
/** @returns {Keyed} */
function designationItem({ kind, label, name, still }, index) {
  if (needsPassing(game, kind, index)) {
    return {
      key: `pass-${kind}`,
      create: () => {
        const chip = element('button', 'chip pass-chip', designationIcon(kind), icon('arrow-bend-up-right'), element('span', 'pass-word', 'Pass it on'));
        chip.type = 'button';
        chip.dataset.designation = kind;
        chip.setAttribute('aria-label', `Pass it on: Player ${index + 1} is out and ${still}. Give ${name} to someone in counters`);
        bindRelease(chip, () => badgeActions.setBoardMode('counters'));
        return chip;
      },
    };
  }
  return {
    key: `designation-${kind}`,
    create: () => {
      const chip = element('span', 'chip designation-chip', designationIcon(kind), visuallyHidden(label));
      chip.dataset.designation = kind;
      return chip;
    },
  };
}

// A counter's chip: commander tax as "+4" (two per cast), the others as their count, amber or red as poison nears 10.
/** @returns {Keyed} */
function counterItem(kind, value) {
  return {
    key: `count-${kind}`,
    create: () => {
      const chip = element('span', 'chip');
      chip.dataset.kind = kind;
      return chip;
    },
    update: (chip) => {
      chip.replaceChildren(...(kind === 'casts' ? [visuallyHidden('Commander tax '), counterIcon(kind), `+${value * 2}`]
        : [counterIcon(kind), String(value), visuallyHidden(` ${kind}`)]));
      const level = kind === 'poison' ? dangerLevel(value, poisonWarning, poisonLethal) : '';
      if (level) chip.dataset.level = level;
      else delete chip.dataset.level;
    },
  };
}

// The near row: the turn chips, the identity, each counter that's set, then the holder's designations.
/** @returns {Keyed[]} */
function nearItems(index) {
  const items = turnItems(index);
  const identity = game.identities[index];
  const { show } = game.identity;
  const chip = identityChip(identity, show);
  // The identity chip is made again when its identity or what it shows changes.
  if (chip) items.push({ key: `identity ${identity} ${show.indicator} ${show.symbol} ${show.name}`, create: () => chip });
  for (const { kind } of shownCounters(game)) {
    const value = game[kind][index];
    if (value !== 0) items.push(counterItem(kind, value));
  }
  for (const designation of trackedDesignations(game)) {
    if (game[designation.kind] === index) items.push(designationItem(designation, index));
  }
  return items;
}

// The far row: the sword, then one chip per opponent's commander damage, largest first, and the strip's chip at the
// end, which shows only when the strip can go nowhere else.
/** @returns {Keyed[]} */
function farItems(index) {
  const damage = game.counters.commander ? game.commanderDamage[index]
    .map((amount, attacker) => ({ amount, attacker })).filter(({ amount }) => amount > 0)
    .sort((a, b) => b.amount - a.amount || a.attacker - b.attacker) : [];
  /** @type {Keyed[]} */
  const items = damage.map(({ amount, attacker }) => ({
    key: `damage-${attacker}`,
    create: () => inColourOf(element('span', 'chip damage'), attacker),
    update: (chip) => {
      inColourOf(chip, attacker);
      chip.replaceChildren(String(amount), visuallyHidden(` commander damage from Player ${attacker + 1}`));
      const level = dangerLevel(amount, commanderWarning, commanderLethal);
      if (level) chip.dataset.level = level;
      else delete chip.dataset.level;
    },
  }));
  // The sword only labels the row: each chip already says whose commander it counts.
  if (damage.length) {
    items.unshift({
      key: 'sword',
      create: () => {
        const sword = element('span', 'chip sword', icon('sword'));
        sword.setAttribute('aria-hidden', 'true');
        return sword;
      },
    });
  }
  if (stripShows(index)) items.push(stripChipItem(index));
  return items;
}

// ---- Keyboard focus as chips come and go ----------------------------------------------------------------------------

// Where focus was when a redraw took away the badge control it was on (a reminder ending, "Undo clear" running out,
// the last mana spent), so it can move to a control nearby in the same tile rather than to <body> or the pill
// (docs/review/ACCESSIBILITY.md M4): the next control in its row, else the one before, else another badge control on
// the same edge of the tile, then on the other edge, else the tile's subtract button. A turn chip that passed the turn
// hands focus to the chip that now has it.
/** @type {{ player: Element, row: Element, near: boolean, turn: boolean, after: string[], before: string[] } | null} */
let lostFocus = null;

/** @param {Element} player */
function badgeFocus(player) {
  const node = document.activeElement;
  if (!(node instanceof HTMLElement) || !player.contains(node) || !node.closest('.far-edge, .near-edge')) return null;
  const row = /** @type {Element} */ (node.parentElement);
  const keys = [.../** @type {HTMLCollectionOf<HTMLElement>} */ (row.children)].map(child => child.dataset.key ?? '');
  const at = keys.indexOf(node.dataset.key ?? '');
  return { node, player, row, near: !!node.closest('.near-edge'), turn: node.matches('.turn-chip'), after: keys.slice(at + 1), before: keys.slice(0, at).reverse() };
}

// Runs once whatever redrew the board has finished, so the chip that now has the turn is there to take focus. If
// anything has taken focus in the meantime, it keeps it.
function restoreFocus() {
  const lost = lostFocus;
  lostFocus = null;
  if (!lost || !lost.player.isConnected || (document.activeElement && document.activeElement !== document.body)) return;
  /** @param {Element | null | undefined} node */
  const usable = node => node instanceof HTMLButtonElement && node.isConnected && !node.closest('[inert]') && node.checkVisibility({ visibilityProperty: true });
  const children = /** @type {HTMLElement[]} */ ([...lost.row.children]);
  /** @param {string[]} keys */
  const inRow = keys => keys.map(key => children.find(child => child.dataset.key === key)).find(usable);
  const target = (lost.turn ? [...board.querySelectorAll('.active-chip')].find(usable) : undefined)
    ?? inRow(lost.after) ?? inRow(lost.before)
    ?? [...lost.player.querySelectorAll(lost.near ? '.near-edge button' : '.far-edge button')].find(usable)
    ?? [...lost.player.querySelectorAll(lost.near ? '.far-edge button' : '.near-edge button')].find(usable)
    ?? [lost.player.querySelector('.controls .subtract')].find(usable);
  /** @type {HTMLElement | undefined} */ (target)?.focus();
}

// ---- Drawing the rows -----------------------------------------------------------------------------------------------

// The badge rows, each only when it has something to show. The far edge, toward the table, holds commander
// damage: a sword, like the pill's, then one chip per opponent in their own tile colour, largest first, and under it
// the mana strip while the pool has mana. The near edge holds the colour identity chip, then poison, tax, energy,
// experience and rad, each only when it's set and its switch is on, then the monarch's crown and the initiative's castle
// on their holder's tile. A turn reminder shows above the near edge, or over it on a short tile.
export function renderBadges(index) {
  const player = board.children[index];
  if (!player) return;
  const focus = badgeFocus(player);
  renderWatermark(index);
  const far = player.querySelector('.badges.far');
  const farRow = farItems(index);
  syncChildren(far, farRow);
  far.hidden = !farRow.some(({ key }) => key.startsWith('damage-'));
  far.setAttribute('aria-label', farRow.some(({ key }) => key.startsWith('strip-')) ? 'Commander damage and mana pool' : 'Commander damage');
  player.toggleAttribute('data-active', game.turns === 'turns' && game.turn.active === index);
  // While a pool has mana, or for 5 seconds after the eraser, its strip shows at the far edge, and both rows stay.
  const strip = player.querySelector('.mana-strip');
  const floating = stripShows(index);
  syncChildren(strip, floating ? stripItems(index) : []);
  strip.hidden = !floating;
  if (!floating) delete player.dataset.strip;
  const near = player.querySelector('.badges.near');
  const nearRow = nearItems(index);
  syncChildren(near, nearRow);
  near.hidden = nearRow.length === 0;
  syncChildren(/** @type {HTMLElement} */ (near.parentElement).querySelector('.reminders'), reminderItems(index));
  placeReminders(player);
  // A reminder over the near row on a short tile hides it, so focus on the row moves to the reminder in its place.
  if (player.hasAttribute('data-reminder') && near.contains(document.activeElement)) /** @type {HTMLElement} */ (player.querySelector('.reminder-chip:last-child'))?.focus();
  if (focus && document.activeElement !== focus.node && !lostFocus) {
    lostFocus = focus;
    queueMicrotask(restoreFocus);
  }
  requestFit();
}
