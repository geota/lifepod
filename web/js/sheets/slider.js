// Settings' notched sliders: Players, Starting life and Badge size.

import { settings } from '../layout/settings.js';
import { element } from '../ui/dom.js';

// A notched slider (design/polish/STYLE.md §4): a track from min to max whose labelled stops are buttons, so a tap works
// as well as a drag (WCAG 2.5.7). A tap on the track or a drag snaps to multiples of snap. The arrow keys step by step
// and Page Up and Page Down by page, within lowest and highest, which may reach past the track: a value off the track,
// such as a starting life of 100, pins the thumb to that end and marks it (data-pinned).
export function notchedSlider({ root, min, max, snap, step, page, lowest, highest, get, set, describe }) {
  const track = root.querySelector('.k-track');
  const clamp = value => Math.min(highest, Math.max(lowest, value));
  const at = value => `${((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100}%`;
  const change = (value) => {
    if (value !== get()) set(value);
  };
  // The value under a point on the track. Turned to face the other side, the page runs right to left on screen.
  const valueAt = (x) => {
    const box = track.getBoundingClientRect();
    let along = Math.min(1, Math.max(0, (x - box.left) / box.width));
    if (settings.hasAttribute('data-flipped')) along = 1 - along;
    return Math.min(max, Math.max(min, Math.round((min + along * (max - min)) / snap) * snap));
  };
  const stopValue = stop => Number(stop.dataset.value ?? (stop.value || stop.dataset.life));
  for (const stop of root.querySelectorAll('.k-stop')) stop.style.left = at(stopValue(stop));
  const ticks = root.querySelector('.k-ticks');
  for (let value = min; value <= max; value += snap) {
    const tick = element('span', 'k-tick');
    tick.style.left = at(value);
    tick.dataset.value = value;
    if ([...root.querySelectorAll('.k-stop')].some(stop => stopValue(stop) === value)) tick.dataset.stop = '';
    ticks.append(tick);
  }
  // A press only picks a value once it lifts without moving (a tap) or moves sideways (a drag). A vertical swipe is
  // left to the page, which scrolls (touch-action: pan-y), so the slider never traps a scroll; and where the browser
  // doesn't take the swipe over, it still isn't a tap. A tap on a stop is left to the stop's own click.
  let pointer;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let swiping = false;
  let onStop = false;
  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || pointer !== undefined) return;
    pointer = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dragging = false;
    swiping = false;
    onStop = event.target.closest('.k-stop') !== null;
  });
  root.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointer || swiping) return;
    const across = Math.abs(event.clientX - startX);
    const down = Math.abs(event.clientY - startY);
    if (!dragging) {
      if (across < 6 && down < 6) return;
      if (down > across) {
        swiping = true;
        return;
      }
      dragging = true;
      root.setPointerCapture?.(event.pointerId);
    }
    change(valueAt(event.clientX));
  });
  const end = (event, lifted) => {
    if (event.pointerId !== pointer) return;
    if (lifted && !dragging && !swiping && !onStop) change(valueAt(event.clientX));
    pointer = undefined;
  };
  root.addEventListener('pointerup', event => end(event, true));
  root.addEventListener('pointercancel', event => end(event, false));
  track.addEventListener('keydown', (event) => {
    const value = get();
    const next = {
      ArrowRight: value + step, ArrowUp: value + step, ArrowLeft: value - step, ArrowDown: value - step,
      PageUp: value + page, PageDown: value - page, Home: min, End: max,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    change(clamp(next));
  });
  return {
    render() {
      const value = get();
      track.style.setProperty('--p', at(value));
      track.toggleAttribute('data-min', value <= min);
      track.setAttribute('aria-valuenow', String(value));
      track.setAttribute('aria-valuetext', describe(value));
      for (const tick of ticks.children) tick.toggleAttribute('data-filled', Number(tick.dataset.value) <= value);
      if (value < min || value > max) track.dataset.pinned = value < min ? 'low' : 'high';
      else delete track.dataset.pinned;
    },
  };
}
