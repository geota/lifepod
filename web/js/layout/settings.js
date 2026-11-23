// Laying out the settings page (design/polish/SETTINGS-SPEC.md): its sections in one or two columns, the scroll cue,
// the compact switch groups that stack where a label would be cut short, and the life field kept clear of the keyboard.
// The board's layout calls these when the window turns while settings is open.

export const settingsDialog = /** @type {HTMLDialogElement} */ (document.querySelector('#settings'));
export const settingsBody = /** @type {HTMLDivElement} */ (document.querySelector('#settings-body'));
const settingsContent = /** @type {HTMLDivElement} */ (document.querySelector('#settings-content'));
const settingsHead = /** @type {HTMLElement} */ (settingsDialog.querySelector('.fs-head'));
const settingsCue = /** @type {HTMLDivElement} */ (settingsDialog.querySelector('.scroll-cue'));
export const lifeEditor = /** @type {HTMLSpanElement} */ (document.querySelector('#life-editor'));

// Compact switch rows (css/settings.css) put their label over the mark and the switch where a row is too narrow for all three
// on one line. Container queries cover the usual widths; this catches whatever they miss with the font and style in
// use: a group with a label cut short stacks every row. It's checked whenever the settings body changes size, as when
// settings opens or the window turns (the body, a scroller, doesn't change size when its rows stack, so its observer
// can't loop), when the fonts arrive, and when the style changes, which changes the rows inside a group of the same
// size.
const compactGroups = [.../** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#settings :is(.compact-switches, .tracker-grid)'))];
function fitCompactSwitches(/** @type {HTMLElement} */ group) {
  group.removeAttribute('data-stacked');
  const labels = [.../** @type {NodeListOf<HTMLElement>} */ (group.querySelectorAll('.nav-label'))];
  group.toggleAttribute('data-stacked', labels.some(label => label.offsetWidth && label.scrollWidth > label.clientWidth + 0.5));
}
export function fitAllCompactSwitches() {
  compactGroups.forEach(fitCompactSwitches);
}
new ResizeObserver(fitAllCompactSwitches).observe(settingsBody);

// Keeps the field clear of the keyboard and the header. Android's WebView shrinks the page for the keyboard; iOS shrinks
// only the visual viewport, so the body gets that much extra room (--keyboard) to scroll the field up into. Turned to
// face the other side, the header is at the bottom of the screen and scrolling moves the field the other way.
export function keepLifeEditorInView() {
  if (lifeEditor.hidden || !settingsDialog.open) return;
  const view = window.visualViewport;
  const viewTop = view ? view.offsetTop : 0;
  const viewBottom = view ? view.offsetTop + view.height : window.innerHeight;
  const flipped = settingsDialog.hasAttribute('data-flipped');
  settingsDialog.style.setProperty('--keyboard', `${Math.max(0, Math.round(window.innerHeight - viewBottom))}px`);
  const head = settingsHead.getBoundingClientRect();
  const top = (flipped ? viewTop : Math.max(viewTop, head.bottom)) + 8;
  const bottom = (flipped ? Math.min(viewBottom, head.top) : viewBottom) - 8;
  const box = lifeEditor.getBoundingClientRect();
  const move = box.bottom > bottom ? bottom - box.bottom : box.top < top ? top - box.top : 0;
  if (move) settingsBody.scrollTop += flipped ? move : -move;
}

// Layout B: two columns from 620px wide, Game, Table and Reminders then Track and Identity; one column below, in the
// order Game, Track, Identity, Table, Reminders. The sections move rather than being reordered by CSS, so the reading and
// focus order always match what shows. They stay put while the life field is open, so a resize from the keyboard can't
// close it.
const settingsSections = ['game', 'table', 'reminders', 'track', 'identity'].map(name => document.querySelector(`#settings-${name}`));
export function placeSettingsSections() {
  if (!lifeEditor.hidden) return;
  const columns = window.innerWidth >= 620;
  const [game, table, reminderSection, track, identity] = settingsSections;
  const [start, end] = settingsContent.querySelectorAll('.fs-col');
  const wanted = columns ? [[game, table, reminderSection], [track, identity]] : [[game, track, identity, table, reminderSection], []];
  settingsContent.toggleAttribute('data-columns', columns);
  if (wanted[0].every((section, index) => start.children[index] === section) && end.children.length === wanted[1].length) return;
  const focused = settingsDialog.contains(document.activeElement) ? /** @type {HTMLElement} */ (document.activeElement) : null;
  start.replaceChildren(...wanted[0]);
  end.replaceChildren(...wanted[1]);
  focused?.focus({ preventScroll: true });
}

// A fade along the bottom of the body while there's more below: content, not just the page's bottom padding, so it never
// sits over the last row (DESIGN-AUDIT N6).
export function syncSettingsCue() {
  const padding = parseFloat(getComputedStyle(settingsContent).paddingBottom) + parseFloat(getComputedStyle(settingsBody).paddingBottom);
  settingsCue.toggleAttribute('data-more', settingsBody.scrollTop + settingsBody.clientHeight < settingsBody.scrollHeight - padding - 1);
}
