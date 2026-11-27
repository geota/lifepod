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
  dangerLevel, hasMana, isOut, needsPassing, poolsCanEmpty, poolText, shownCounters, trackedDesignations,
} from '../logic/rules.js';
import { toasts } from '../state/history.js';
import { game, shownReminders, stripHolds, tokenHolds } from '../state/state.js';
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
 * @property {(index: number) => void} useTreasure
 * @property {(index: number, kind: DesignationKind) => void} dismissReminder
 * @property {(mode: BoardMode) => void} setBoardMode
 * @property {() => void} redo
 * @property {(index: number) => void} dismissUndoToast
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

// The reminders a tile shows, newest last: each a chip in the turn chip's style that a tap dismisses. An undo's toast
// comes after them.
/** @returns {Keyed[]} */
function reminderItems(index) {
  /** @type {Keyed[]} */
  const items = [...(shownReminders.get(index)?.keys() ?? [])].map(kind => ({ key: `reminder-${kind}`, create: () => reminderChip(index, kind) }));
  const toast = toasts.get(index);
  if (toast) items.push({ key: `toast-${toast.id}`, create: () => toastChip(index, toast) });
  return items;
}

// The toast an undo or redo leaves (MANA-UNDO-SPEC §6.7), in the reminder chip's language: "Undid life 38 → 37" with
// Redo, a 64 × 44 target, after an undo; "Redid …" alone after a redo, which a tap dismisses. The label in the seat colour
// is what drops first on a short tile (placeReminders).
/** @param {number} index @param {import('../state/history.js').Toast} toast */
function toastChip(index, toast) {
  const words = element('span', 'reminder-words', element('b', 'reminder-label', `${toast.verb} `), toast.words);
  if (!toast.redo) {
    const chip = element('button', 'chip reminder-chip toast-chip', icon('redo'), words);
    chip.type = 'button';
    chip.setAttribute('aria-label', `${toast.verb} ${toast.words}. Dismiss`);
    bindRelease(chip, () => badgeActions.dismissUndoToast(index));
    return chip;
  }
  const redo = element('button', 'toast-redo', icon('redo'), 'Redo');
  redo.type = 'button';
  redo.setAttribute('aria-label', `Redo ${toast.words}`);
  bindRelease(redo, () => badgeActions.redo());
  return element('div', 'chip reminder-chip toast-chip', icon('undo'), words, redo);
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

// Whether a tile's strip shows: while its pool has mana or its player has Treasure (MANA-SPEC-v2's as-built note, alpha.20),
// and while either is being tapped.
function stripShows(index) {
  return game.manaPool && (hasMana(game, index) || treasureShows(index) || stripHolds.has(index));
}

// Whether a tile's strip holds its Treasure: while the count is above 0, and while it's being tapped, dimmed at 0.
function treasureShows(index) {
  return game.treasure[index] > 0 || tokenHolds.has(index);
}

// A tile's mana strip at rest: each colour its pool holds, with its amount (tap to spend one), then Treasure, set apart
// because it stays (a tap uses one), then the eraser, which empties the colours only. With only Treasure, the strip holds
// just that, led by Keep's lock where it shows. While the strip is being tapped, its colours keep their places, at 0 once
// spent or erased (actions/mana.js), and Treasure at 0, dimmed, so a quick extra tap lands where it was aimed.
/** @returns {Keyed[]} */
function stripItems(index) {
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
      // It never touches Treasure, so its name says what it empties.
      button.setAttribute('aria-label', `Empty floating mana, Player ${index + 1}`);
      bindTap(button, () => badgeActions.clearPool(index));
      return button;
    },
  };
  return [...(keptShows(index) ? [keepLockItem()] : []), ...spends, ...(treasureShows(index) ? [treasureItem(index)] : []),
    ...(spends.length ? [eraser] : []), stripChipItem(index)];
}

// Whether a tile's strip and folded chip show Keep's small lock at rest (MANA-SPEC-v2 §4.2): Keep is on and pools can
// empty as the turn passes; the strip shows only while there's mana. It's not a target: Keep is changed in mana mode.
function keptShows(index) {
  return game.keepMana[index] && poolsCanEmpty(game);
}

/** @returns {Keyed} */
function keepLockItem() {
  return { key: 'keep-lock', create: () => element('span', 'keep-lock', icon('lock'), visuallyHidden('Kept')) };
}

// The strip folded into one chip, where the strip can't fit: the pool's colours and amounts with a caret, which opens
// mana mode.
/** @returns {Keyed} */
function stripChipItem(index) {
  return {
    key: 'strip-chip',
    create: () => {
      const chip = element('button', 'chip strip-chip');
      chip.type = 'button';
      bindRelease(chip, () => badgeActions.setBoardMode('mana'));
      return chip;
    },
    update: (chip) => {
      // One colour and its amount, or several colours' symbols stacked before the pool's total, so the chip stays short,
      // then Treasure's gold counter and count.
      const held = manaColours.map((colour, at) => ({ colour, amount: game.pools[index][at] })).filter(({ amount }) => amount > 0);
      const pip = (colour) => {
        const symbol = element('span', 'pip');
        symbol.dataset.pip = colour.id;
        return symbol;
      };
      const parts = held.length > 1
        ? [element('span', 'summary-item', ...held.map(({ colour }) => pip(colour)), String(held.reduce((sum, { amount }) => sum + amount, 0)))]
        : held.map(({ colour, amount }) => element('span', 'summary-item', pip(colour), String(amount)));
      const treasure = game.treasure[index];
      if (treasure > 0) parts.push(element('span', 'summary-item summary-token', manaIcon('treasure'), String(treasure)));
      const kept = keptShows(index);
      chip.replaceChildren(...(kept ? [element('span', 'keep-lock', icon('lock'))] : []), ...parts, icon('caret-right'));
      const total = held.reduce((sum, { amount }) => sum + amount, 0);
      const words = [...(total ? [`${total} mana${kept ? ', kept' : ''}`] : []), ...(treasure ? [`${treasure} Treasure`] : [])].join(' and ');
      chip.setAttribute('aria-label', `${words || 'No mana'}. Player ${index + 1}${total ? `'s pool: ${poolText(game, index)}` : ''}. Open mana`);
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

// Close to lethal is said, not only shown in amber (ACCESSIBILITY.md L4): "8 poison, 2 from lethal".
/**
 * @param {string} level
 * @param {number} left
 */
const fromLethal = (level, left) => (level === 'warn' ? `, ${left} from lethal` : '');

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
      const level = kind === 'poison' ? dangerLevel(value, poisonWarning, poisonLethal) : '';
      chip.replaceChildren(...(kind === 'casts' ? [visuallyHidden('Commander tax '), counterIcon(kind), `+${value * 2}`]
        : [counterIcon(kind), String(value), visuallyHidden(` ${kind}${fromLethal(level, poisonLethal - value)}`)]));
      if (level) chip.dataset.level = level;
      else delete chip.dataset.level;
    },
  };
}

// Treasure on the strip (MANA-SPEC-v2 §1.3, moved from the near row): the gold counter and the count, a button whose tap
// uses one. Used to 0, it stays, dimmed, while it's being tapped (actions/mana.js), then goes.
/** @returns {Keyed} */
function treasureItem(index) {
  return {
    key: 'treasure',
    create: () => {
      const chip = element('button', 'strip-token', manaIcon('treasure'), '');
      chip.type = 'button';
      chip.dataset.token = 'treasure';
      bindTap(chip, () => badgeActions.useTreasure(index));
      return chip;
    },
    update: (chip) => {
      const count = game.treasure[index];
      /** @type {Text} */ (chip.lastChild).data = String(count);
      chip.setAttribute('aria-label', count ? `Treasure, Player ${index + 1}, ${count}. Use one` : `Treasure, Player ${index + 1}, none left`);
      // Not disabled, which would drop keyboard focus from it.
      if (count) chip.removeAttribute('aria-disabled');
      else chip.setAttribute('aria-disabled', 'true');
    },
  };
}

// The near row: the turn chips, the identity, each counter that's set, then the holder's designations. Treasure is on
// the mana strip.
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
  // The strip's chip at the end, which shows only when the strip can go nowhere at the far edge.
  if (stripShows(index)) items.push(stripChipItem(index));
  return items;
}

// The far row: the sword, then one chip per opponent's commander damage, largest first. It's theirs alone: the mana
// strip goes under it, or folds.
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
      const level = dangerLevel(amount, commanderWarning, commanderLethal);
      chip.replaceChildren(String(amount), visuallyHidden(` commander damage from Player ${attacker + 1}${fromLethal(level, commanderLethal - amount)}`));
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
  return items;
}

// ---- Keyboard focus as chips come and go ----------------------------------------------------------------------------

// Where focus was when a redraw took away the badge control it was on (a reminder ending, "Undo clear" running out,
// the last mana spent), so it can move to a control nearby in the same tile rather than to <body> or the pill
// (docs/review/ACCESSIBILITY.md M4): the next control in its row, else the one before, else one that took its place
// there, else another badge control on the same edge of the tile (the near row's before the mana strip's), then on the
// other edge, else the tile's subtract button. A turn chip that passed the turn
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
  // The near edge's controls start with its near row's, then the mana strip's above it.
  /** @param {boolean} near */
  const edge = near => [...lost.player.querySelectorAll(near ? '.badges.near button' : '.far-edge button'), ...lost.player.querySelectorAll(near ? '.near-edge > .mana-strip button' : '.far-edge button')];
  const target = (lost.turn ? [...board.querySelectorAll('.active-chip')].find(usable) : undefined)
    ?? inRow(lost.after) ?? inRow(lost.before) ?? children.find(usable)
    ?? edge(lost.near).find(usable)
    ?? edge(!lost.near).find(usable)
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
  far.hidden = farRow.length === 0;
  player.toggleAttribute('data-active', game.turns === 'turns' && game.turn.active === index);
  // While a pool has mana, or while it's being tapped, its strip shows on its own row above the near row, and
  // both rows stay. Its folded chip waits under the far row too, for a tile with no room for that row (fit.js).
  const strip = player.querySelector('.mana-strip');
  const floating = stripShows(index);
  syncChildren(strip, floating ? stripItems(index) : []);
  strip.hidden = !floating;
  const farMana = player.querySelector('.mana-far');
  syncChildren(farMana, floating ? [stripChipItem(index)] : []);
  farMana.hidden = !floating;
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
