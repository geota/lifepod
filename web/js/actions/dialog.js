// Opening a dialog. It lives here, the first folder that can import both ui/ (the presses) and state/ (back
// handling), which sit side by side and don't import each other.

import { dialogOpenGuard } from '../logic/data.js';
import { syncBackHandling } from '../state/state.js';
import { cancelPresses } from '../ui/press.js';

// Every dialog opens through here: a press held on the board ends first, so a hold can't keep counting under the
// modal (docs/review/DEEP-DIVE.md D3), and Android's back gesture comes to the page while it's open. For its first
// moments it ignores pointer input, so the second tap of a double tap on the button that opened it, or a repeated tap
// on a slow phone, can't change whatever control opened under the finger (docs/review/FINAL.md B1). Only pointers wait:
// focus, keys and a click with no pointer work at once. The wait is an animation of pointer-events rather than a timer:
// it ends on the document's timeline, which the tests' fake clock doesn't pause.
/** @param {HTMLDialogElement} dialog */
export function showDialog(dialog) {
  cancelPresses();
  dialog.showModal();
  dialog.animate({ pointerEvents: ['none', 'none'] }, { duration: dialogOpenGuard });
  syncBackHandling();
}
