// The board itself: drawing every tile with its life buttons and seat rotation, a life change and what it hands on
// when a player goes out, and starting a new game.

import { layoutBoard, syncBoardTurn } from '../layout/board.js';
import { resetDrops } from '../layout/fit.js';
import { clockwiseEdges, countKinds, tileSets } from '../logic/data.js';
import { isOut, leavingTransfers, outPlayers, shuffledColours } from '../logic/rules.js';
import { fitColors, fitCounts, fitDamage, fitIdentities, fitPools, fitTurn } from '../logic/save.js';
import { announce, announceDesignation, announceLife, clearAnnouncements } from '../render/announce.js';
import { renderBadges, renderPassHints } from '../render/badges.js';
import { paintColours, renderScore } from '../render/tile.js';
import { currentLandscapeAngle, haptic, reducedMotion } from '../state/platform.js';
import { clearedPools, game, turnSteps } from '../state/state.js';
import { board, playerTemplate } from '../ui/dom.js';
import { bindCounter, cancelPresses } from '../ui/press.js';
import { commit } from './commit.js';
import { maybeAskFirst, setAskFirst } from './mode.js';
import { clearReminders, remind } from './reminders.js';

// Hands on whatever a change at rest (a life total, or a Track switch) took out of the game with its holder, announces
// it, and reminds a new initiative holder to venture.
export function handOnLeavers(wasOut) {
  const transfers = leavingTransfers(game, wasOut);
  if (!transfers.length) return;
  for (const transfer of transfers) game[transfer.kind] = transfer.to;
  commit({ badges: transfers.flatMap(({ from, to }) => [from, to]).filter(player => player !== null) });
  for (const transfer of transfers) {
    announceDesignation(transfer.kind);
    if (transfer.kind === 'initiative') remind(transfer.to, 'initiative');
  }
}

export function renderBoard() {
  cancelPresses();
  clearAnnouncements();
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
      // A player who is out has no chip to start a turn, and hands on the monarch and the initiative.
      const leaving = isOut(game, index) !== out.has(index);
      commit({ scores: [index], badges: leaving ? [index] : [] });
      if (leaving) {
        handOnLeavers(out);
        renderPassHints();
      }
      if (!reducedMotion.matches) score.animate([{ transform: 'scale(1.08)' }, { transform: 'none' }], 160);
      haptic();
      announceLife(index);
    }

    bindCounter(player.querySelector('.subtract'), () => changeLife(-1), `Subtract one life from ${name}`);
    bindCounter(player.querySelector('.add'), () => changeLife(1), `Add one life to ${name}`);
    const rotateSeat = player.querySelector('.rotate-seat');
    rotateSeat.setAttribute('aria-label', `Rotate ${name} clockwise`);
    rotateSeat.addEventListener('click', () => {
      game.rotations[index] = (game.rotations[index] + 1) % clockwiseEdges.length;
      commit({ layout: true });
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
  // every count, commander damage and the colour identities.
  game.colors = game.shuffleColours ? shuffledColours(playerCount, tileSets[game.tileColours].families) : fitColors(game.colors, playerCount);
  for (const kind of countKinds) game[kind] = fitCounts([], playerCount);
  game.identities = fitIdentities([], playerCount);
  game.commanderDamage = fitDamage([], playerCount);
  // Pools empty, and the game starts at round 1 with nobody first, until "Who goes first?" picks someone.
  game.pools = fitPools([], playerCount);
  game.turn = fitTurn(null, playerCount);
  // Nobody is the monarch or has the initiative until an effect says so.
  game.monarch = null;
  game.initiative = null;
  clearReminders();
  turnSteps.length = 0;
  for (const { timer } of clearedPools.values()) clearTimeout(timer);
  clearedPools.clear();
  game.startingLife = startingLife;
  game.scores = Array(playerCount).fill(startingLife);
  // A new game takes the screen's current landscape as upright.
  game.landscapeAngle = currentLandscapeAngle();
  // A new game starts with every badge at full size.
  resetDrops();
  syncBoardTurn();
  renderBoard();
  commit({ pill: true });
  announce(-1, 'game', () => `New game, ${playerCount} players at ${startingLife} life`);
  setAskFirst(game.turns !== 'off');
  maybeAskFirst();
}
