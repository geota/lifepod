// The board's fixed elements (index.html), and the helpers that build elements: element(), the Phosphor icons and the
// Mana font's symbols. No app state.

export const board = /** @type {HTMLParent} */ (document.querySelector('#board'));
export const playerTemplate = /** @type {HTMLTemplateElement} */ (document.querySelector('#player-template'));
export const boardControls = /** @type {HTMLDivElement} */ (document.querySelector('#board-controls'));
export const setupButton = /** @type {HTMLButtonElement} */ (document.querySelector('#setup-button'));
export const diceButton = /** @type {HTMLButtonElement} */ (document.querySelector('#dice-button'));
export const lookupButton = /** @type {HTMLButtonElement} */ (document.querySelector('#lookup-button'));
export const damageButton = /** @type {HTMLButtonElement} */ (document.querySelector('#damage-button'));
export const countersButton = /** @type {HTMLButtonElement} */ (document.querySelector('#counters-button'));
export const roundButton = /** @type {HTMLButtonElement} */ (document.querySelector('#round-button'));
export const roundBackButton = /** @type {HTMLButtonElement} */ (document.querySelector('#round-back'));
export const manaButton = /** @type {HTMLButtonElement} */ (document.querySelector('#mana-button'));
// Track (design/polish/PILL-SPEC.md): one button for commander damage, counters and mana where the pill can't hold
// three, and its mode's tabs, each keyed by its mode in data-tab.
export const trackButton = /** @type {HTMLButtonElement} */ (document.querySelector('#track-button'));
export const trackTabList = /** @type {HTMLDivElement} */ (document.querySelector('#track-tabs'));
export const trackTabButtons = /** @type {HTMLButtonElement[]} */ ([...trackTabList.querySelectorAll('[role="tab"]')]);
export const shuffleButton = /** @type {HTMLButtonElement} */ (document.querySelector('#shuffle-button'));
export const undoButton = /** @type {HTMLButtonElement} */ (document.querySelector('#undo-button'));
export const redoButton = /** @type {HTMLButtonElement} */ (document.querySelector('#redo-button'));
export const saveButton = /** @type {HTMLButtonElement} */ (document.querySelector('#save-button'));
export const cancelButton = /** @type {HTMLButtonElement} */ (document.querySelector('#cancel-button'));
export const discardDialog = /** @type {HTMLDialogElement} */ (document.querySelector('#discard'));
export const announcer = /** @type {HTMLParagraphElement} */ (document.querySelector('#announcer'));

// Phosphor Icons (MIT, phosphoricons.com), Bold weight, for controls drawn by the scripts. Experience's graduation
// cap and the initiative's castle turret are Fill weight, so they hold up at badge size. The crown is the monarch's.
const iconPaths = {
  'castle-turret': 'M216,216H200V115.31L211.31,104A15.86,15.86,0,0,0,216,92.69V48a16,16,0,0,0-16-16H180a8,8,0,0,0-8,8V64H148V40a8,8,0,0,0-8-8H116a8,8,0,0,0-8,8V64H84V40a8,8,0,0,0-8-8H56A16,16,0,0,0,40,48V92.69A15.86,15.86,0,0,0,44.69,104L56,115.31V216H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16ZM112,168a16,16,0,0,1,32,0v48H112Z',
  'arrow-bend-up-right': 'M232.49,112.49l-48,48a12,12,0,0,1-17-17L195,116H128a84.09,84.09,0,0,0-84,84,12,12,0,0,1-24,0A108.12,108.12,0,0,1,128,92h67L167.51,64.48a12,12,0,0,1,17-17l48,48A12,12,0,0,1,232.49,112.49Z',
  minus: 'M228,128a12,12,0,0,1-12,12H40a12,12,0,0,1,0-24H216A12,12,0,0,1,228,128Z',
  plus: 'M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z',
  crown: 'M232.63,70a19.82,19.82,0,0,0-23.55,4.71l-29.52,31.82L146.22,31.76l-.06-.14a20,20,0,0,0-36.32,0l-.06.14L76.44,106.52,46.92,74.7a20,20,0,0,0-34.6,16.81c0,.16.06.31.09.47L35.07,195.76A20,20,0,0,0,54.71,212H201.29a20,20,0,0,0,19.64-16.24L243.59,92c0-.16.07-.31.09-.47A19.82,19.82,0,0,0,232.63,70ZM198.06,188H57.94L39.06,101.51,71.2,136.16A12,12,0,0,0,91,132.89l37-83.07,37,83.07a12,12,0,0,0,19.76,3.27l32.14-34.65Z',
  'graduation-cap': 'M176,207.24a119,119,0,0,0,16-7.73V240a8,8,0,0,1-16,0Zm11.76-88.43-56-29.87a8,8,0,0,0-7.52,14.12L171,128l17-9.06Zm64-29.87-120-64a8,8,0,0,0-7.52,0l-120,64a8,8,0,0,0,0,14.12L32,117.87v48.42a15.91,15.91,0,0,0,4.06,10.65C49.16,191.53,78.51,216,128,216a130,130,0,0,0,48-8.76V130.67L171,128l-43,22.93L43.83,106l0,0L25,96,128,41.07,231,96l-18.78,10-.06,0L188,118.94a8,8,0,0,1,4,6.93v73.64a115.63,115.63,0,0,0,27.94-22.57A15.91,15.91,0,0,0,224,166.29V117.87l27.76-14.81a8,8,0,0,0,0-14.12Z',
  sword: 'M216,28H152a12,12,0,0,0-9.33,4.45L79.5,110.51l-4.66-4.65a20,20,0,0,0-28.29,0L29.86,122.55a20,20,0,0,0,0,28.29h0L45,166,23.86,187.17a20,20,0,0,0,0,28.28l16.69,16.69a20,20,0,0,0,28.28,0L90,211l15.17,15.16a20,20,0,0,0,28.29,0l16.69-16.69a20,20,0,0,0,0-28.3l-4.65-4.65,78.06-63.17A12,12,0,0,0,228,104V40A12,12,0,0,0,216,28ZM54.69,212.34l-11-11L62,183l11,11Zm64.61-6L49.65,136.7l11.05-11,69.65,69.65ZM204,98.27l-75.58,61.17L121,152l47.51-47.5a12,12,0,0,0-17-17L104,135l-7.45-7.44L157.73,52H204Z',
  // Fill weight, like the Track icon.
  flag: 'M232,56V176a8,8,0,0,1-2.76,6c-15.28,13.23-29.89,18-43.82,18-18.91,0-36.57-8.74-53-16.85C105.87,170,82.79,158.61,56,179.77V224a8,8,0,0,1-16,0V56a8,8,0,0,1,2.77-6h0c36-31.18,68.31-15.21,96.79-1.12C167,62.46,190.79,74.2,218.76,50A8,8,0,0,1,232,56Z',
  'hand-tap': 'M228,156v36c0,13.85-1.63,26.52-4.58,35.68a12,12,0,1,1-22.84-7.36c2.14-6.65,3.42-17.24,3.42-28.32V156a8,8,0,0,0-16,0v4a12,12,0,0,1-24,0V140a8,8,0,0,0-16,0v12a12,12,0,0,1-24,0V84a8,8,0,0,0-16,0V192a12,12,0,0,1-22.18,6.34l-18.68-30-.21-.34A8,8,0,0,0,53,175.92L78.27,217.8a12,12,0,0,1-20.56,12.39l-25.31-42-.12-.2A32,32,0,0,1,84,150.83V84a32,32,0,0,1,64,0v25a32,32,0,0,1,36.78,17A32,32,0,0,1,228,156ZM56,96A12,12,0,0,0,68,84a48,48,0,0,1,96,0,12,12,0,0,0,24,0A72,72,0,0,0,44,84,12,12,0,0,0,56,96Z',
  eraser: 'M216,204H141l86.84-86.84a28,28,0,0,0,0-39.6L186.43,36.19a28,28,0,0,0-39.6,0L28.19,154.82a28,28,0,0,0,0,39.6l30.06,30.07A12,12,0,0,0,66.74,228H216a12,12,0,0,0,0-24ZM163.8,53.16a4,4,0,0,1,5.66,0l41.38,41.38a4,4,0,0,1,0,5.65L160,151l-47-47ZM71.71,204,45.16,177.45a4,4,0,0,1,0-5.65L96,121l47,47-36,36Z',
  undo: 'M228,128a100,100,0,0,1-98.66,100H128a99.39,99.39,0,0,1-68.62-27.29,12,12,0,0,1,16.48-17.45,76,76,0,1,0-1.57-109c-.13.13-.25.25-.39.37L54.89,92H72a12,12,0,0,1,0,24H24a12,12,0,0,1-12-12V56a12,12,0,0,1,24,0V76.72L57.48,57.06A100,100,0,0,1,228,128Z',
  redo: 'M244,56v48a12,12,0,0,1-12,12H184a12,12,0,1,1,0-24H201.1l-19-17.38c-.13-.12-.26-.24-.38-.37A76,76,0,1,0,127,204h1a75.53,75.53,0,0,0,52.15-20.72,12,12,0,0,1,16.49,17.45A99.45,99.45,0,0,1,128,228h-1.37A100,100,0,1,1,198.51,57.06L220,76.72V56a12,12,0,0,1,24,0Z',
  check: 'M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z',
  'caret-right': 'M184.49,136.49l-80,80a12,12,0,0,1-17-17L159,128,87.51,56.49a12,12,0,1,1,17-17l80,80A12,12,0,0,1,184.49,136.49Z',
  play: 'M234.49,111.07,90.41,22.94A20,20,0,0,0,60,39.87V216.13a20,20,0,0,0,30.41,16.93l144.08-88.13a19.82,19.82,0,0,0,0-33.86ZM84,208.85V47.15L216.16,128Z',
  // Card lookup's notes: a cut keyword or caveat, and an error.
  info: 'M108,84a16,16,0,1,1,16,16A16,16,0,0,1,108,84Zm128,44A108,108,0,1,1,128,20,108.12,108.12,0,0,1,236,128Zm-24,0a84,84,0,1,0-84,84A84.09,84.09,0,0,0,212,128Zm-72,36.68V132a20,20,0,0,0-20-20,12,12,0,0,0-4,23.32V168a20,20,0,0,0,20,20,12,12,0,0,0,4-23.32Z',
  warning: 'M240.26,186.1,152.81,34.23h0a28.74,28.74,0,0,0-49.62,0L15.74,186.1a27.45,27.45,0,0,0,0,27.71A28.31,28.31,0,0,0,40.55,228h174.9a28.31,28.31,0,0,0,24.79-14.19A27.45,27.45,0,0,0,240.26,186.1Zm-20.8,15.7a4.46,4.46,0,0,1-4,2.2H40.55a4.46,4.46,0,0,1-4-2.2,3.56,3.56,0,0,1,0-3.73L124,46.2a4.77,4.77,0,0,1,8,0l87.44,151.87A3.56,3.56,0,0,1,219.46,201.8ZM116,136V104a12,12,0,0,1,24,0v32a12,12,0,0,1-24,0Zm28,40a16,16,0,1,1-16-16A16,16,0,0,1,144,176Z',
};

/**
 * @param {keyof typeof iconPaths} name
 * @returns {SVGSVGElement}
 */
export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 256 256');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.dataset.icon = name;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', iconPaths[name]);
  svg.append(path);
  return svg;
}

// A symbol from the bundled Mana font, sized and coloured like the Phosphor icons. css/board.css maps each name to its
// code point.
/** @typedef {'d20' | 'infect' | 'energy' | 'rad' | 'pie' | 'tap' | 'untap' | 'commander'} ManaGlyph */
/**
 * @param {ManaGlyph} name
 */
export function manaIcon(name) {
  const glyph = element('span', 'icon mana-icon');
  glyph.dataset.glyph = name;
  glyph.setAttribute('aria-hidden', 'true');
  return glyph;
}

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} [className]
 * @param {...(Node | string)} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function element(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

// Settings and the dialogs can be pinch-zoomed, but the board can't, so it couldn't be zoomed back out. When a dialog
// closes zoomed in, a maximum scale of 1 for a moment puts the page back at its own size (WebKit applies a viewport
// change at once), then zoom is allowed again. Android's WebView doesn't zoom at all (MainActivity.kt).
const viewportMeta = /** @type {HTMLMetaElement} */ (document.querySelector('meta[name="viewport"]'));
export function resetZoom() {
  if (!window.visualViewport || window.visualViewport.scale <= 1.01) return;
  const content = viewportMeta.content;
  viewportMeta.content = `${content}, maximum-scale=1`;
  setTimeout(() => {
    viewportMeta.content = content;
  }, 300);
}

export function visuallyHidden(text) {
  return element('span', 'visually-hidden', text);
}

/**
 * One child of a row kept by syncChildren: its key, how to make its node, and how to bring that node up to date.
 *
 * @typedef {object} Keyed
 * @property {string} key
 * @property {() => HTMLElement} create
 * @property {(node: HTMLElement) => void} [update]
 */

// Brings a row's children in line with a list of keyed items (docs/review/DEEP-DIVE.md §2.2). A node whose key is still
// listed is kept and updated in place, so a finger pressing it or keyboard focus on it survives the redraw. New keys get
// new nodes, gone keys lose theirs, and nodes move only where the order changed. A focused node that has to move gets
// its focus back.
/**
 * @param {Element} row
 * @param {Keyed[]} items
 */
export function syncChildren(row, items) {
  const kept = new Map([.../** @type {HTMLCollectionOf<HTMLElement>} */ (row.children)].map(node => [node.dataset.key, node]));
  const nodes = items.map(({ key, create, update }) => {
    let node = kept.get(key);
    if (node) kept.delete(key);
    else {
      node = create();
      node.dataset.key = key;
    }
    update?.(node);
    return node;
  });
  for (const node of kept.values()) node.remove();
  const focused = document.activeElement;
  nodes.forEach((node, at) => {
    if (row.children[at] !== node) row.insertBefore(node, row.children[at] ?? null);
  });
  if (focused instanceof HTMLElement && focused !== document.activeElement && nodes.includes(focused)) focused.focus({ preventScroll: true });
}
