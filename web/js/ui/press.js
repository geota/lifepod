// How a press counts (design/polish/SPEC.md): the binders for the life buttons (bindCounter), one-press buttons that
// act as a finger lands (bindTap) or as it lifts on them (bindRelease), counter and map cells that count a tap when it
// ends and step back on a hold (bindSeat), and the turn chip and round button (bindStep). They share one window that skips the click after a press, and the set of presses held
// now, which cancelPresses ends. No app state: each binder is given what a press does.

import { holdDelay } from '../logic/data.js';

// Every held counter button, so several players can hold buttons at the same time.
const activePresses = new Set();

export function cancelPresses() {
  for (const press of [...activePresses]) press.end();
}

// A press counts on pointerdown (or, for map seats and turn steps, when it ends), so the click that follows is skipped.
// Presses often redraw what's under the finger, such as a mana strip that shrinks or a turn chip that moves to the
// next player, and that click can land on a different button. So the window that skips it is shared by every
// button, not kept per button. Keyboard clicks have no detail and always count.
let ignoreClicksUntil = 0;

// A press counts the moment a finger lands, so a tap can't be lost to a finger drifting off the button
// or to Android cancelling touches when several fingers land at once. Holding repeats after a pause.
// Clicks still handle keyboards and assistive technology.
// adjust gets how long the press has been held, in milliseconds (0 for a tap or a click).
/**
 * @param {HTMLElement} button
 * @param {(held: number) => void} adjust
 * @param {string} label
 */
export function bindCounter(button, adjust, label) {
  button.setAttribute('aria-label', label);
  const tile = button.closest('.player') ?? button;
  let press;
  // The last pointer that pressed this button. A press that ended when the finger left the tile still owns the click
  // that follows its pointerup.
  let pressPointer;

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    pressPointer = event.pointerId;
    // A new touch ends any earlier press on this button, even if that press never got its pointerup.
    press?.end();
    const current = {
      pointerId: event.pointerId,
      start: performance.now(),
      end() {
        clearTimeout(current.timer);
        activePresses.delete(current);
        if (press !== current) return;
        press = undefined;
        delete button.dataset.pressed;
      },
    };
    function repeat() {
      adjust(performance.now() - current.start);
      current.timer = setTimeout(repeat, 100);
    }
    press = current;
    activePresses.add(current);
    button.dataset.pressed = '';
    ignoreClicksUntil = performance.now() + 800;
    adjust(0);
    current.timer = setTimeout(repeat, 500);
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone. The press still counted, and the next touch ends it.
    }
  });
  // A hold stops when the finger leaves the player's tile.
  button.addEventListener('pointermove', (event) => {
    if (event.pointerId !== press?.pointerId) return;
    const bounds = tile.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) {
      press.end();
    }
  });
  for (const type of /** @type {const} */ (['pointerup', 'pointercancel', 'lostpointercapture'])) {
    button.addEventListener(type, (event) => {
      if (event.pointerId === pressPointer) ignoreClicksUntil = performance.now() + 800;
      if (event.pointerId !== press?.pointerId) return;
      press.end();
    });
  }
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  // Skip the click that follows a press already counted on pointerdown. Keyboard clicks have no detail.
  button.addEventListener('click', (event) => {
    if (event.detail === 0 || performance.now() >= ignoreClicksUntil) adjust(0);
  });
}

// For buttons that act once per press: a press counts the moment a finger lands, as on the life buttons.
/**
 * @param {HTMLElement & { disabled?: boolean }} button
 * @param {() => void} action
 */
export function bindTap(button, action) {
  let pointerId;
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || button.disabled) return;
    pointerId = event.pointerId;
    ignoreClicksUntil = performance.now() + 800;
    action();
  });
  // However long the press, the click that follows it is skipped.
  for (const type of /** @type {const} */ (['pointerup', 'pointercancel'])) {
    button.addEventListener(type, (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = undefined;
      ignoreClicksUntil = performance.now() + 800;
    });
  }
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  button.addEventListener('click', (event) => {
    if (event.detail === 0 || performance.now() >= ignoreClicksUntil) action();
  });
}

// For one-press buttons with no undo, such as "Me first", "Pick at random" and "Pass it on" (WCAG 2.5.2): the press
// acts when the finger lifts while still on the button, so sliding off before lifting cancels it. These don't need the
// life buttons' multi-touch reliability. The click after a press is skipped through the shared window, so a redraw
// under the finger can't act twice, and a press on a button that's gone by the time it lifts does nothing.
/**
 * @param {HTMLElement & { disabled?: boolean }} button
 * @param {() => void} action
 */
export function bindRelease(button, action) {
  let pointerId;
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || button.disabled) return;
    pointerId = event.pointerId;
    ignoreClicksUntil = performance.now() + 800;
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone, and its pointerup with it.
    }
  });
  for (const type of /** @type {const} */ (['pointerup', 'pointercancel', 'lostpointercapture'])) {
    button.addEventListener(type, (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = undefined;
      ignoreClicksUntil = performance.now() + 800;
      if (type !== 'pointerup' || !button.isConnected || button.disabled) return;
      // Still over the button, or over its touch area (an ::after past its edge), whatever the tile's rotation.
      const under = document.elementFromPoint(event.clientX, event.clientY);
      if (under && button.contains(under)) action();
    });
  }
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  button.addEventListener('click', (event) => {
    if (event.detail === 0 || performance.now() >= ignoreClicksUntil) action();
  });
}

// A map seat: a tap adds one. Holding takes one away once the hold registers, then repeats on the same timing
// as the life buttons. Whether a press is a tap is only known when it ends, so a tap counts then, however
// the press ends, and a hold never adds.
export function bindSeat(button, add, remove) {
  let press;
  // As in bindCounter: a press that ended when the finger left the tile still owns the click after its pointerup.
  let pressPointer;

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    pressPointer = event.pointerId;
    press?.finish();
    const current = {
      pointerId: event.pointerId,
      held: false,
      end() {
        clearTimeout(current.timer);
        activePresses.delete(current);
        if (press !== current) return;
        press = undefined;
        delete button.dataset.pressed;
      },
      finish() {
        const tap = press === current && !current.held;
        current.end();
        if (tap) add();
      },
    };
    function repeat() {
      current.held = true;
      remove();
      current.timer = setTimeout(repeat, 100);
    }
    press = current;
    activePresses.add(current);
    button.dataset.pressed = '';
    ignoreClicksUntil = performance.now() + 800;
    current.timer = setTimeout(repeat, 500);
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone. The next touch ends this press.
    }
  });
  // A hold stops when the finger leaves the player's tile. Cells are bound before they join their tile, so the tile
  // is looked up here.
  button.addEventListener('pointermove', (event) => {
    if (event.pointerId !== press?.pointerId) return;
    const bounds = (button.closest('.player') ?? button).getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) {
      press.finish();
    }
  });
  for (const type of /** @type {const} */ (['pointerup', 'pointercancel', 'lostpointercapture'])) {
    button.addEventListener(type, (event) => {
      if (event.pointerId === pressPointer) ignoreClicksUntil = performance.now() + 800;
      if (event.pointerId !== press?.pointerId) return;
      press.finish();
    });
  }
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  button.addEventListener('click', (event) => {
    if (event.detail === 0 || performance.now() >= ignoreClicksUntil) add();
  });
}

// The turn chip and the pill's round button: a tap steps forward when the finger lifts, and a hold steps back once
// when it registers. A hold never repeats, so a long press can't rewind several turns. With `turn`, which says where the
// turn is, a press is over once anyone else steps the turn: the chip stays the same element through the redraws its
// row gets in the meantime, but stepping now would undo or repeat that other step.
/**
 * @param {HTMLElement} button
 * @param {() => void} forward
 * @param {() => void} back
 * @param {() => string} [turn]
 */
export function bindStep(button, forward, back, turn) {
  let press;
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    press?.end();
    const pressedAt = turn?.();
    // The press still counts: its button is on the page and nobody has stepped the turn since it began.
    const current_ = () => button.isConnected && turn?.() === pressedAt;
    const current = {
      pointerId: event.pointerId,
      held: false,
      end() {
        clearTimeout(current.timer);
        activePresses.delete(current);
        if (press !== current) return;
        press = undefined;
        delete button.dataset.pressed;
      },
      finish() {
        const tap = press === current && !current.held && current_();
        current.end();
        if (tap) forward();
      },
    };
    press = current;
    activePresses.add(current);
    button.dataset.pressed = '';
    ignoreClicksUntil = performance.now() + 800;
    current.timer = setTimeout(() => {
      // A turn chip goes when someone else steps the turn, and then its pointerup never arrives. Its press is over:
      // stepping back now would undo their step.
      if (!current_()) {
        current.end();
        return;
      }
      current.held = true;
      delete button.dataset.pressed;
      back();
    }, holdDelay);
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone. The next touch ends this press.
    }
  });
  for (const type of /** @type {const} */ (['pointerup', 'pointercancel', 'lostpointercapture'])) {
    button.addEventListener(type, (event) => {
      if (event.pointerId !== press?.pointerId) return;
      ignoreClicksUntil = performance.now() + 800;
      // A cancelled touch is no tap.
      if (type === 'pointerup') press.finish();
      else press.end();
    });
  }
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  button.addEventListener('click', (event) => {
    if (event.detail === 0 || performance.now() >= ignoreClicksUntil) forward();
  });
}
