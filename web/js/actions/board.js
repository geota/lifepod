// The board itself: drawing every tile with its life buttons and seat rotation, a life change and what it hands on
// when a player goes out, and starting a new game.

import { layoutBoard, syncBoardTurn } from '../layout/board.js';
import { resetDrops } from '../layout/fit.js';
import { clockwiseEdges, countKinds, tileSets } from '../logic/data.js';
import { isOut, leavingTransfers, outPlayers, shuffledColours } from '../logic/rules.js';
import { fitColors, fitCounts, fitDamage, fitFlags, fitIdentities, fitPools, fitTurn } from '../logic/save.js';
import { announce, announceDesignation, announceLife, clearAnnouncements } from '../render/announce.js';
import { renderBadges, renderPassHints } from '../render/badges.js';
import { paintColours, renderScore } from '../render/tile.js';
import { currentLandscapeAngle, haptic, reducedMotion } from '../state/platform.js';
import { clearToasts, closeBurst } from '../state/history.js';
import { game, stripHolds, tokenHolds, turnSteps } from '../state/state.js';
import { board, playerTemplate } from '../ui/dom.js';
import { bindCounter, cancelPresses } from '../ui/press.js';
import { commit } from './commit.js';
import { endStripHolds } from './mana.js';
import { maybeAskFirst, setAskFirst } from './mode.js';
import { clearReminders, remind } from './reminders.js';

// Hands on whatever a change at rest (a life total, or a Track switch) took out of the game with its holder, in the
// game, and returns the tiles it touched. The caller's commit records it with the change, so one Undo takes back both
// (MANA-UNDO-SPEC §6.2).
function handOn(wasOut) {
  const transfers = leavingTransfers(game, wasOut);
  for (const transfer of transfers) game[transfer.kind] = transfer.to;
  return transfers;
}

// Announces handoffs, and reminds a new initiative holder to venture.
function announceHandOn(transfers) {
  for (const transfer of transfers) {
    announceDesignation(transfer.kind);
    if (transfer.kind === 'initiative') remind(transfer.to, 'initiative');
  }
}

/** @param {{ from: number | null, to: number | null }[]} transfers */
const handOnTiles = transfers => transfers.flatMap(({ from, to }) => [from, to]).filter(player => player !== null);

// A Track switch that put a holder out of the game (sheets/options.js): the handoff is a step of its own, since the
// switch itself isn't one.
export function handOnLeavers(wasOut) {
  const transfers = handOn(wasOut);
  if (!transfers.length) return;
  commit({ badges: handOnTiles(transfers) });
  announceHandOn(transfers);
}

export function renderBoard() {
  cancelPresses();
  clearAnnouncements();
  clearToasts();
  const players = game.scores.map((_, index) => {
    const player = /** @type {HTMLElement} */ (/** @type {Element} */ (playerTemplate.content.firstElementChild).cloneNode(true));
    const name = `Player ${index + 1}`;
    player.setAttribute('aria-label', name);
    const score = player.querySelector('.score');

    function changeLife(delta) {
      const next = game.scores[index] + delta;
      if (!Number.isSafeInteger(next)) return;
      const out = outPlayers(game);
      game.scores[index] = next;
      // A player who is out has no chip to start a turn, and hands on the monarch and the initiative, in the same step.
      // Quick taps merge into one step (MANA-UNDO-SPEC §6.2a); a tap that puts the player out ends the burst after it.
      const leaving = isOut(game, index) !== out.has(index);
      const transfers = leaving ? handOn(out) : [];
      commit({ scores: [index], badges: leaving ? [index, ...handOnTiles(transfers)] : [], step: { key: `life:${index}` } });
      if (leaving) {
        if (isOut(game, index)) closeBurst(index);
        announceHandOn(transfers);
        renderPassHints();
      }
      if (!reducedMotion.matches) score.animate([{ transform: 'scale(1.08)' }, { transform: 'none' }], 160);
      haptic();
      announceLife(index);
    }

    // While the strip is being tapped (a colour or its Treasure), a touch on the life buttons under it is a tap meant for
    // the strip (mana.js).
    const stripTapped = () => stripHolds.has(index) || tokenHolds.has(index);
    bindCounter(player.querySelector('.subtract'), () => changeLife(-1), `Subtract one life from ${name}`, stripTapped);
    bindCounter(player.querySelector('.add'), () => changeLife(1), `Add one life to ${name}`, stripTapped);
    const rotateSeat = player.querySelector('.rotate-seat');
    rotateSeat.setAttribute('aria-label', `Rotate ${name} clockwise`);
    rotateSeat.addEventListener('click', () => {
      game.rotations[index] = (game.rotations[index] + 1) % clockwiseEdges.length;
      // Seating isn't a game step (MANA-UNDO-SPEC §6.3).
      commit({ layout: true, step: false });
    });
    return player;
  });
  board.replaceChildren(...players);
  layoutBoard();
  paintColours();
  game.scores.forEach((_, index) => {
    renderScore(index);
    renderBadges(index);
  });
}

/**
 * @param {number} playerCount
 * @param {number} startingLife
 */
export function startGame(playerCount, startingLife) {
  if (playerCount !== game.scores.length) game.rotations = Array(playerCount).fill(0);
  // A new game keeps every setting, the seats' rotations (for the same player count) and the tile colours, or deals
  // each player a random one from the tile set when Shuffle tile colours each game is on (SPEC §10.2). It resets life,
  // every count, commander damage, floating mana, Treasure and Keep, the colour identities and the dice rolls.
  game.colors = game.shuffleColours ? shuffledColours(playerCount, tileSets[game.tileColours].families) : fitColors(game.colors, playerCount);
  for (const kind of countKinds) game[kind] = fitCounts([], playerCount);
  game.identities = fitIdentities([], playerCount);
  game.commanderDamage = fitDamage([], playerCount);
  // Pools and Treasure empty, nobody's pool is kept, and the game starts at round 1 with nobody first, until "Who goes
  // first?" picks someone.
  game.pools = fitPools([], playerCount);
  game.treasure = fitCounts([], playerCount);
  game.keepMana = fitFlags([], playerCount);
  game.turn = fitTurn(null, playerCount);
  // Nobody is the monarch or has the initiative until an effect says so.
  game.monarch = null;
  game.initiative = null;
  // The dice ledger empties; the die the page opens on stays. Rolls aren't in the history, so undoing the new game
  // doesn't bring them back (DICE-SPEC.md §2).
  game.dice.rolls = [];
  clearReminders();
  turnSteps.length = 0;
  endStripHolds();
  game.startingLife = startingLife;
  game.scores = Array(playerCount).fill(startingLife);
  // A new game takes the screen's current landscape as upright.
  game.landscapeAngle = currentLandscapeAngle();
  // A new game starts with every badge at full size.
  resetDrops();
  syncBoardTurn();
  renderBoard();
  // A new game is one step, which Undo can take back (MANA-UNDO-SPEC §6.9); the history carries on through it.
  commit({ pill: true, step: { kind: 'newGame' } });
  announce(-1, 'game', () => `New game, ${playerCount} players at ${startingLife} life`);
  setAskFirst(game.turns !== 'off');
  maybeAskFirst();
}
