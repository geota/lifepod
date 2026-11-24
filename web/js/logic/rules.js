// The game's rules, as pure functions of a game (the Game in save.js) and their arguments: the seat grid, who is out and
// why, play order and the next and previous turn, the monarch's and the initiative's handoffs, and applying an editing
// mode's edits forwards and back. No DOM and no state of their own.

import {
  commanderLethal, countKinds, counterKinds, designations, identityColours, identityNames, manaColours, maxCount, maxRound,
  pillTools, playOrders, poisonLethal, seatLayouts, topRowPlayers, trackTabKinds,
} from './data.js';

/** @typedef {import('./data.js').CountKind} CountKind */
/** @typedef {import('./data.js').DesignationKind} DesignationKind */
/** @typedef {import('./data.js').TrackTab} TrackTab */
/** @typedef {import('./save.js').Game} Game */
/** @typedef {import('./save.js').Turn} Turn */

/**
 * One change made in an editing mode (damage, counters or mana), kept until the mode closes so it can be undone.
 *
 * @typedef {object} Edit
 * @property {CountKind | 'mana' | 'damage' | 'designation'} kind
 * @property {number} index The player it changes: the defender, for commander damage.
 * @property {number} [delta] How much it adds, or takes away when negative.
 * @property {number} [attacker] For commander damage, whose commander dealt it.
 * @property {number} [colour] For mana, an index into manaColours.
 * @property {Transfer[]} [transfers] Designations it moved, in order.
 */
/**
 * @typedef {object} Transfer
 * @property {DesignationKind} kind
 * @property {number | null} from
 * @property {number | null} to
 */

// ---- Seats ----------------------------------------------------------------------------------------------------------

/**
 * @param {number} index
 * @returns {'top' | 'bottom'}
 */
export function seatRow(index) {
  return topRowPlayers.includes(index) ? 'top' : 'bottom';
}

// The board's seats as rows and columns of the landscape grid, with the cells each seat spans, for count players.
// rows and columns are typed any only because render/modes.js passes them to style.setProperty as numbers; once it passes
// String(rows), they can be number.
/**
 * @param {number} count
 * @returns {{ rows: any, columns: any, areas: Map<number, { top: number, bottom: number, left: number, right: number }> }}
 */
export function seatGrid(count) {
  const rows = seatLayouts[count].map(row => row.split(' ').map(seat => Number(seat.split('-')[1]) - 1));
  const areas = new Map();
  rows.forEach((row, y) => row.forEach((player, x) => {
    const area = areas.get(player) ?? { top: y, bottom: y, left: x, right: x };
    areas.set(player, {
      top: Math.min(area.top, y), bottom: Math.max(area.bottom, y), left: Math.min(area.left, x), right: Math.max(area.right, x),
    });
  }));
  return { rows: rows.length, columns: rows[0].length, areas };
}

// Where a board cell lands in a tile's own frame, which is turned clockwise by angle. Drawing the map there
// makes it match the table from every seat.
/**
 * @param {number} angle
 * @param {number} rows
 * @param {number} columns
 * @param {number} row
 * @param {number} column
 * @returns {[number, number]}
 */
export function toFace(angle, rows, columns, row, column) {
  if (angle === 90) return [columns - 1 - column, row];
  if (angle === 180) return [rows - 1 - row, columns - 1 - column];
  if (angle === 270) return [column, rows - 1 - row];
  return [row, column];
}

// ---- What's tracked -------------------------------------------------------------------------------------------------

// The counters that are on, in order.
/** @param {Game} game */
export function shownCounters(game) {
  return counterKinds.filter(counter => game.counters[counter.tracker]);
}

// The designations that are on, in order: the monarch, then the initiative.
/** @param {Game} game */
export function trackedDesignations(game) {
  return designations.filter(({ kind }) => game.counters[kind]);
}

// Counters mode has something to show: a counter or a designation is on.
/** @param {Game} game */
export function hasCountersMode(game) {
  return shownCounters(game).length > 0 || trackedDesignations(game).length > 0;
}

// ---- The centre pill ------------------------------------------------------------------------------------------------

// The editing modes that are on, in Track's order: commander damage, counters, mana (design/polish/PILL-SPEC.md §3).
/**
 * @param {Game} game
 * @returns {TrackTab[]}
 */
export function trackTabs(game) {
  const on = { damage: game.counters.commander, counters: hasCountersMode(game), mana: game.manaPool };
  return trackTabKinds.filter(tab => on[tab]);
}

// The tab Track opens on: the one it last showed, or the first that's still on.
/** @param {Game} game */
export function openingTab(game) {
  const tabs = trackTabs(game);
  return tabs.includes(game.trackTab) ? game.trackTab : tabs[0] ?? game.trackTab;
}

/**
 * How the pill is laid out: `collapsed` when commander damage, counters and mana are one Track button, and `tools`,
 * the buttons that always show at rest (pillTools in data.js).
 *
 * @typedef {{ collapsed?: boolean, tools?: number }} PillShape
 */

// How many buttons the pill holds at rest: the round, then commander damage, counters and mana when they're on, as
// three buttons or one Track button, then the tools (Undo, dice and setup).
/**
 * @param {Game} game
 * @param {PillShape} [shape]
 */
export function restPillButtons(game, { collapsed = false, tools = pillTools } = {}) {
  const tabs = trackTabs(game).length;
  return tools + Number(game.turns !== 'off') + (collapsed ? Math.min(1, tabs) : tabs);
}

// The most buttons the pill holds at rest or in an editing mode: Undo, save and ✕, after Track's tabs when it has two
// or more.
/**
 * @param {Game} game
 * @param {PillShape} [shape]
 */
export function widestPill(game, shape = {}) {
  const tabs = trackTabs(game).length;
  return Math.max(restPillButtons(game, shape), 3 + (shape.collapsed && tabs > 1 ? tabs : 0));
}

// Which pill the board takes (PILL-SPEC.md, as built): three buttons for commander damage, counters and mana wherever
// every button the pill can show fits `room` (the length of the seam it sits on, in px) at their full size, `natural`;
// otherwise one Track button. Only if even that doesn't fit do the buttons shrink to 44px (`tight`).
/**
 * @param {Game} game
 * @param {number} room
 * @param {number} natural
 * @param {number} [tools]
 */
export function pillFit(game, room, natural, tools = pillTools) {
  const collapsed = trackTabs(game).length > 1 && !pillFits(game, { collapsed: false, tools }, room, natural);
  return { collapsed, tight: !pillFits(game, { collapsed, tools }, room, natural) };
}

// Whether every button the pill can show, laid out one way, fits `room` at `natural` px each.
/**
 * @param {Game} game
 * @param {PillShape} shape
 * @param {number} room
 * @param {number} natural
 */
export function pillFits(game, shape, room, natural) {
  return widestPill(game, shape) * natural <= room;
}

/**
 * @param {Game} game
 * @param {number} index
 */
export function hasMana(game, index) {
  return game.pools[index].some(amount => amount > 0);
}

// ---- Out of the game ------------------------------------------------------------------------------------------------

// Close to losing: a warning from 15 commander damage or 7 poison, and out at 21 or 10.
/**
 * @param {number} value
 * @param {number} warning
 * @param {number} lethal
 */
export function dangerLevel(value, warning, lethal) {
  return value >= lethal ? 'out' : value >= warning ? 'warn' : '';
}

/**
 * @param {Game} game
 * @param {number} index
 */
export function isOut(game, index) {
  return outReason(game, index) !== null;
}

// Why a player is out: 'life' at 0 or below, then 'poison' at 10, then 'commander' at 21 commander damage, or null.
/**
 * @param {Game} game
 * @param {number} index
 * @returns {keyof typeof import('./data.js').outLabels | null}
 */
export function outReason(game, index) {
  if (game.scores[index] <= 0) return 'life';
  if (game.counters.poison && game.poison[index] >= poisonLethal) return 'poison';
  if (game.counters.commander && game.commanderDamage[index].some(damage => damage >= commanderLethal)) return 'commander';
  return null;
}

/** @param {Game} game */
export function outPlayers(game) {
  return new Set(game.scores.map((_, index) => index).filter(index => isOut(game, index)));
}

// ---- Turns ----------------------------------------------------------------------------------------------------------

/** @param {Game} game */
export function playOrder(game) {
  return playOrders[game.scores.length];
}

// Turn by turn, from the active player: the next player in play order who isn't out (or, with everyone else out, the
// last one tried), and whether play passed the first player's seat on the way, which starts a new round.
/** @param {Game} game */
export function nextTurn(game) {
  const { active, first } = game.turn;
  const order = playOrder(game);
  const position = order.indexOf(/** @type {number} */ (active));
  let next = active;
  let crossed = false;
  for (let step = 1; step <= order.length; step++) {
    const player = order[(position + step) % order.length];
    if (player === first) crossed = true;
    if (!isOut(game, player) || step === order.length) {
      next = player;
      break;
    }
  }
  return { next, crossed };
}

// The same, stepping back: the previous player in play order who isn't out, and whether that goes back past the first
// player's seat into the round before.
/** @param {Game} game */
export function previousTurn(game) {
  const { active, first } = game.turn;
  const order = playOrder(game);
  const position = order.indexOf(/** @type {number} */ (active));
  let previous = active;
  let crossed = false;
  for (let step = 1; step <= order.length; step++) {
    if (order[(position - step + 1 + order.length) % order.length] === first) crossed = true;
    const player = order[(position - step + order.length) % order.length];
    if (!isOut(game, player) || step === order.length) {
      previous = player;
      break;
    }
  }
  return { previous, crossed };
}

// The turn after one step forward (SPEC §8), or null when it can't move. Rounds: the next round. Turn by turn: the next
// player in play order who isn't out, and the next round when play passes the first player's seat. It doesn't move
// with nobody's turn yet, when nobody else can take it, or past maxRound: in the last round, play holds rather than pass
// the first player's seat, so turnBack always takes a step back exactly. actions/turns.js records a step only when this
// moves, and its stepBack takes turnBack when there's no step to undo.
/**
 * @param {Game} game
 * @returns {Turn | null}
 */
export function turnForward(game) {
  const { turn } = game;
  if (game.turns === 'rounds') return turn.round < maxRound ? { ...turn, round: turn.round + 1 } : null;
  if (game.turns !== 'turns' || turn.active === null) return null;
  const { next, crossed } = nextTurn(game);
  if ((crossed && turn.round === maxRound) || (next === turn.active && !crossed)) return null;
  return { ...turn, active: next, round: turn.round + Number(crossed) };
}

// The turn one step back when there's no step to undo (after a relaunch), or null when it can't move: the previous
// round, or the previous player in play order who isn't out. The round never goes below 1.
/**
 * @param {Game} game
 * @returns {Turn | null}
 */
export function turnBack(game) {
  const { turn } = game;
  if (game.turns === 'rounds') return turn.round > 1 ? { ...turn, round: turn.round - 1 } : null;
  if (game.turns !== 'turns' || turn.active === null) return null;
  const { previous, crossed } = previousTurn(game);
  if ((crossed && turn.round === 1) || (previous === turn.active && !crossed)) return null;
  return { ...turn, active: previous, round: turn.round - Number(crossed) };
}

// A random whole number below count, from the same crypto RNG as the dice, without modulo bias.
/** @param {number} count */
export function randomBelow(count) {
  const limit = Math.floor(0x100000000 / count) * count;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= limit);
  return value[0] % count;
}

// Settings → Table → Shuffle tile colours each game: a random, distinct swatch for each of count players. families is the
// tile set's (tileSets in data.js): one family number per swatch id. The ids are shuffled uniformly (Fisher–Yates, from
// below, which is randomBelow's crypto RNG unless a test passes its own), and each seat takes the next id whose family
// no seat has yet, so the table is spread while families last (six, so up to six players); any seat left takes the next
// unused id.
/**
 * @param {number} count
 * @param {number[]} families
 * @param {(count: number) => number} [below]
 * @returns {number[]}
 */
export function shuffledColours(count, families, below = randomBelow) {
  const order = [...families.keys()];
  for (let at = order.length - 1; at > 0; at--) {
    const other = below(at + 1);
    [order[at], order[other]] = [order[other], order[at]];
  }
  const picked = [];
  const taken = new Set();
  for (const id of order) {
    if (picked.length < count && !taken.has(families[id])) {
      picked.push(id);
      taken.add(families[id]);
    }
  }
  for (const id of order) if (picked.length < count && !picked.includes(id)) picked.push(id);
  return picked;
}

// ---- The monarch and the initiative ---------------------------------------------------------------------------------

// Whose designations pass on by themselves when their holder leaves the game: only in Turn by turn, once somebody's turn
// has started, since the rules start from the active player.
/** @param {Game} game */
function handsOnByItself(game) {
  return game.turns === 'turns' && game.turn.active !== null;
}

// Who takes a designation when its holder leaves the game (CR 726.4 and 727.4): the active player, or, if the active
// player is the one leaving or has already left, the next player in turn order who is still in. Nobody can take the
// monarch if everyone else has left, and the game goes on without one; the initiative always has a holder, so it stays.
/**
 * @param {Game} game
 * @param {DesignationKind} kind
 * @param {number} leaver
 */
function heir(game, kind, leaver) {
  // Only called once somebody's turn has started (handsOnByItself).
  const active = /** @type {number} */ (game.turn.active);
  if (active !== leaver && !isOut(game, active)) return active;
  const order = playOrder(game);
  const position = order.indexOf(active);
  for (let step = 1; step < order.length; step++) {
    const player = order[(position + step) % order.length];
    if (player !== leaver && !isOut(game, player)) return player;
  }
  return kind === 'monarch' ? null : leaver;
}

// The handoffs that are due now that a change has put players out who weren't out before (wasOut): each designation
// whose holder has just left the game moves to its heir, when designations pass on by themselves. Otherwise the out
// holder's tile shows a "Pass it on" hint until someone takes it in counters mode.
/**
 * @param {Game} game
 * @param {Set<number>} wasOut
 */
export function leavingTransfers(game, wasOut) {
  if (!handsOnByItself(game)) return [];
  return trackedDesignations(game).flatMap(({ kind }) => {
    const holder = game[kind];
    if (holder === null || wasOut.has(holder) || !isOut(game, holder)) return [];
    const to = heir(game, kind, holder);
    return to === holder ? [] : [{ kind, from: holder, to }];
  });
}

// Whether an out player's tile should ask for its designation to be passed on: they hold it, someone is still in to take
// it, and the hint is on.
/**
 * @param {Game} game
 * @param {DesignationKind} kind
 * @param {number} index
 */
export function needsPassing(game, kind, index) {
  return game.reminders.passOn && game[kind] === index && isOut(game, index) && game.scores.some((_, player) => player !== index && !isOut(game, player));
}

// ---- Edits ----------------------------------------------------------------------------------------------------------

// Applies an edit forwards (1) or takes it back (-1). An edit can carry transfers: the monarch or the initiative moving
// from one player to another (or to nobody) as part of the same change, such as commander damage to the monarch, which
// is combat damage and makes the attacker the monarch. They're undone with it, last first.
/**
 * @param {Game} game
 * @param {Edit} edit
 * @param {1 | -1} direction
 */
export function applyEdit(game, edit, direction) {
  // Every edit but a designation's has a delta, mana's a colour and commander damage's an attacker.
  const delta = /** @type {number} */ (edit.delta);
  if (countKinds.includes(edit.kind)) game[/** @type {CountKind} */ (edit.kind)][edit.index] += delta * direction;
  else if (edit.kind === 'mana') game.pools[edit.index][/** @type {number} */ (edit.colour)] += delta * direction;
  else if (edit.kind === 'damage') {
    // Commander damage is damage, so the defender loses the same life in the same save.
    game.commanderDamage[edit.index][/** @type {number} */ (edit.attacker)] += delta * direction;
    game.scores[edit.index] -= delta * direction;
  }
  const transfers = edit.transfers ?? [];
  for (const transfer of direction > 0 ? transfers : [...transfers].reverse()) {
    game[transfer.kind] = direction > 0 ? transfer.to : transfer.from;
  }
}

// The edits a mode's taps make (actions/edits.js), or null for a tap that would take a count below 0 or above maxCount.
// Commander damage is combat damage: adding it to the monarch makes the attacker the monarch (CR 726.3), and adding it to
// the player with the initiative gives the attacker the initiative (CR 727.3). Taking damage away moves nothing.
/**
 * @param {Game} game
 * @param {number} defender
 * @param {number} attacker
 * @param {number} delta
 * @returns {Edit | null}
 */
export function damageEdit(game, defender, attacker, delta) {
  const next = game.commanderDamage[defender][attacker] + delta;
  if (defender === attacker || next < 0 || next > maxCount) return null;
  const transfers = delta > 0 ? trackedDesignations(game).filter(({ kind }) => game[kind] === defender)
    .map(({ kind }) => ({ kind, from: defender, to: attacker })) : [];
  return { kind: 'damage', index: defender, attacker, delta, transfers };
}

// Counters mode's designation cells: a tap gives it to that player, taking it from whoever had it, and a tap on the
// holder's own cell clears it.
/**
 * @param {Game} game
 * @param {DesignationKind} kind
 * @param {number} index
 * @returns {Edit}
 */
export function designationEdit(game, kind, index) {
  const from = game[kind];
  return { kind: 'designation', index, transfers: [{ kind, from, to: from === index ? null : index }] };
}

/**
 * @param {Game} game
 * @param {CountKind} kind
 * @param {number} index
 * @param {number} delta
 * @returns {Edit | null}
 */
export function countEdit(game, kind, index, delta) {
  const next = game[kind][index] + delta;
  return next >= 0 && next <= maxCount ? { kind, index, delta } : null;
}

// Mana mode's edit: one colour in one player's pool, one up or down.
/**
 * @param {Game} game
 * @param {number} index
 * @param {number} colour
 * @param {number} delta
 * @returns {Edit | null}
 */
export function manaEdit(game, index, colour, delta) {
  const next = game.pools[index][colour] + delta;
  return next >= 0 && next <= maxCount ? { kind: 'mana', index, colour, delta } : null;
}

// Applies a new edit forwards, as a mode's tap does, and returns it. Anyone it puts out of the game hands on what they
// hold (CR 726.4 and 727.4) in the same edit: the handoffs join its transfers, so applyEdit(game, edit, -1) undoes them
// with it. actions/edits.js's commitEdit calls this for every tap.
/**
 * @param {Game} game
 * @param {Edit} edit
 * @returns {Edit}
 */
export function applyNewEdit(game, edit) {
  const out = outPlayers(game);
  applyEdit(game, edit, 1);
  const handoffs = leavingTransfers(game, out);
  if (handoffs.length) {
    edit.transfers = [...(edit.transfers ?? []), ...handoffs];
    for (const transfer of handoffs) game[transfer.kind] = transfer.to;
  }
  return edit;
}

// Every player an edit shows on: its own, and anyone a designation moved to or from.
/**
 * @param {Edit} edit
 * @returns {number[]}
 */
export function editPlayers(edit) {
  return [...new Set([edit.index, ...(edit.transfers ?? []).flatMap(({ from, to }) => [from, to])])]
    .filter(index => index !== null && index !== undefined);
}

// ---- Words for screen readers ---------------------------------------------------------------------------------------

// How a screen reader hears an identity, such as "Selesnya, colour identity white, green", whatever the chip shows.
/** @param {string} identity */
export function identityText(identity) {
  if (!identity) return 'no colour identity';
  return `${identityNames[identity]}, colour identity ${[...identity].map(id => /** @type {{ id: string, name: string }} */ (identityColours.find(colour => colour.id === id)).name).join(', ')}`;
}

/**
 * @param {Game} game
 * @param {number} index
 */
export function poolText(game, index) {
  const held = manaColours.map((colour, at) => ({ colour, amount: game.pools[index][at] })).filter(({ amount }) => amount > 0);
  return held.length ? held.map(({ colour, amount }) => `${amount} ${colour.name}`).join(', ') : 'empty';
}
