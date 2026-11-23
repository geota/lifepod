// Opening a dialog. It lives here, the first folder that can import both ui/ (the presses) and state/ (back
// handling), which sit side by side and don't import each other.

import { syncBackHandling } from '../state/state.js';
import { cancelPresses } from '../ui/press.js';

// Every dialog opens through here: a press held on the board ends first, so a hold can't keep counting under the
// modal (docs/review/DEEP-DIVE.md D3), and Android's back gesture comes to the page while it's open.
/** @param {HTMLDialogElement} dialog */
export function showDialog(dialog) {
  cancelPresses();
  dialog.showModal();
  syncBackHandling();
}
