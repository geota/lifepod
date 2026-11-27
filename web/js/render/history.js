// What the undo history draws on the board: the running delta on a total while its life burst is open
// (MANA-UNDO-SPEC §6.2b), such as −3 centred above the total, which is exactly what one Undo would take back.
// The toasts an undo leaves are badge-row chips (render/badges.js).

import { placeLifeDelta } from '../layout/delta.js';
import { deltaFade } from '../logic/data.js';
import { openBurst } from '../state/history.js';
import { reducedMotion } from '../state/platform.js';
import { board, element } from '../ui/dom.js';

/** @type {Map<number, ReturnType<typeof setTimeout>>} */
const fades = new Map();

// A tile's running delta, from its open burst: shown from the burst's second tap while its net change isn't nothing,
// updated on each tap, and faded out deltaFade after the burst ends (at once with reduced motion). It's only for life
// at rest; it takes no room, isn't a target and isn't announced, since the total's own announcement says the result.
/** @param {number} tile */
export function renderLifeDelta(tile) {
  const controls = board.children[tile]?.querySelector('.controls');
  if (!controls) return;
  const burst = openBurst(tile);
  const pair = burst?.key === `life:${tile}` && burst.n > 1 ? burst.step?.d.scores?.[tile] : undefined;
  let delta = /** @type {HTMLElement | null} */ (controls.querySelector('.life-delta'));
  if (pair) {
    if (!delta) {
      delta = element('span', 'life-delta', element('span', 'life-delta-value'));
      delta.setAttribute('aria-hidden', 'true');
      controls.append(delta);
    }
    clearTimeout(fades.get(tile));
    fades.delete(tile);
    const change = pair[1] - pair[0];
    /** @type {HTMLElement} */ (delta.firstElementChild).textContent = `${change > 0 ? '+' : '−'}${Math.abs(change)}`;
    delta.dataset.sign = change > 0 ? 'gain' : 'loss';
    delete delta.dataset.fading;
    delta.hidden = false;
    placeLifeDelta(/** @type {Element} */ (board.children[tile]));
    return;
  }
  if (!delta || delta.hidden || fades.has(tile)) return;
  const shown = delta;
  shown.dataset.fading = '';
  const hide = () => {
    fades.delete(tile);
    shown.hidden = true;
    delete shown.dataset.fading;
  };
  if (reducedMotion.matches) hide();
  else fades.set(tile, setTimeout(hide, deltaFade));
}
