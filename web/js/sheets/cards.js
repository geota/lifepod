// Card lookup, behind the pill's magnifier: the data loaded the first time it opens, the search field over the
// results and its notes, and a card's text. Importing this module wires the sheet and the button; the searching itself
// is sheets/cardsearch.js.

import { showDialog } from '../actions/dialog.js';
import { indexCards } from '../logic/cards.js';
import { cardNodes, closeGroup, noteNodes, resultRow } from '../render/card.js';
import { syncBackHandling } from '../state/state.js';
import { lookupButton } from '../ui/dom.js';
import { onFound, search, setCards } from './cardsearch.js';

/** @typedef {import('../logic/cards.js').CardData} CardData */
/** @typedef {import('../logic/cards.js').CardIndex} CardIndex */
/** @typedef {import('./cardsearch.js').Found} Found */

const cardsDialog = /** @type {HTMLDialogElement} */ (document.querySelector('#cards'));
const cardsSheet = /** @type {HTMLDivElement} */ (document.querySelector('#cards-sheet'));
const queryField = /** @type {HTMLInputElement} */ (document.querySelector('#card-query'));
const textToggle = /** @type {HTMLButtonElement} */ (document.querySelector('#card-text'));
const statusLine = /** @type {HTMLParagraphElement} */ (document.querySelector('#card-status'));
const notesBlock = /** @type {HTMLDivElement} */ (document.querySelector('#card-notes'));
const countRegion = /** @type {HTMLParagraphElement} */ (document.querySelector('#card-count'));
const resultList = /** @type {HTMLDivElement} */ (document.querySelector('#card-results'));
const cardSheet = /** @type {HTMLDivElement} */ (document.querySelector('#card-sheet'));
const backButton = /** @type {HTMLButtonElement} */ (document.querySelector('#card-back'));
const helpButton = /** @type {HTMLButtonElement} */ (document.querySelector('#card-help-button'));
const helpBack = /** @type {HTMLButtonElement} */ (document.querySelector('#help-back'));
const helpTitle = /** @type {HTMLHeadingElement} */ (document.querySelector('#card-help-title'));
const helpBody = /** @type {HTMLDivElement} */ (document.querySelector('#help-body'));

// The data file, gzipped, next to index.html: a same-origin fetch, which the CSP's connect-src 'self' allows, unpacked
// with DecompressionStream (docs/DEVELOPING.md, "Card data").
const dataUrl = new URL('../../data/cards.json.gz', import.meta.url);
// How many results the list draws at a time: a screenful or more, few enough to draw within a keystroke. Scrolling
// near the end, or arrowing past it, draws the next lot.
const pageSize = 25;
// Screen readers hear the count once typing pauses, not at every keystroke.
const countDelay = 500;
// Below this height, as with a phone's keyboard open in landscape, the sheet drops its header and credit so the field
// and a few results fit.
const compactHeight = 260;

/** @type {CardIndex | null} */
let index = null;
/** @type {Promise<void> | null} */
let loading = null;
let loadFailed = false;
/** @type {Found | null} */
let found = null;
// The cards drawn, in the list's order: the matches, then any close spellings.
/** @type {number[]} */
let shown = [];
let active = -1;
// The card open beside the list, by its place in the data, or -1.
let openAt = -1;
let openQuery = '';
let countTimer = 0;

// ---- Opening --------------------------------------------------------------------------------------------------------

// The magnifier opens the sheet on the results, with focus in the search field (which brings up a phone's keyboard)
// and the last query selected to type over.
function openLookup() {
  loadCards();
  showList();
  showDialog(cardsDialog);
  fitToView();
  queryField.focus();
  queryField.select();
}
lookupButton.addEventListener('click', openLookup);
cardsDialog.querySelector('[data-close]')?.addEventListener('click', () => cardsDialog.close());

// ---- Loading --------------------------------------------------------------------------------------------------------

// The data loads the first time card lookup opens, never at startup, so the board doesn't wait for data it may not
// need. A failed load is tried again the next time it opens.
function loadCards() {
  if (index || loading) return;
  loadFailed = false;
  showStatus();
  loading = fetch(dataUrl)
    .then((response) => {
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const unpacked = response.body.pipeThrough(new DecompressionStream('gzip'));
      return /** @type {Promise<CardData>} */ (new Response(unpacked).json());
    })
    .then((data) => {
      index = indexCards(data.cards);
      setCards(index, runSearch);
      runSearch();
    })
    .catch(() => {
      loadFailed = true;
      showStatus();
    })
    .finally(() => {
      loading = null;
    });
}

// ---- Results --------------------------------------------------------------------------------------------------------

const textOn = () => textToggle.getAttribute('aria-pressed') === 'true';
function runSearch() {
  if (!index) {
    showStatus();
    return;
  }
  search(queryField.value, textOn());
}
onFound((next) => {
  found = next;
  resultList.removeAttribute('aria-busy');
  showResults(true);
}, () => {
  resultList.setAttribute('aria-busy', 'true');
  statusLine.textContent = 'Searching…';
});

// Draws the first page of results, or (`fresh` false) adds the next page below the ones shown. Close spellings, when
// there are any, follow the matches (which are then fewer than a page) in a group of their own.
/** @param {boolean} fresh */
function showResults(fresh) {
  if (!index || !found) return;
  const cards = index.cards;
  const before = fresh ? 0 : matchesShown();
  const page = found.page(before + pageSize);
  const added = page.slice(before).map(at => resultRow(cards[at], at));
  if (!fresh) {
    shown = page;
    resultList.append(...added);
    return;
  }
  shown = [...page, ...found.close];
  // A card that isn't in the new results leaves the panel beside them, which asks for a card again.
  if (openAt >= 0 && found.query !== openQuery && !shown.includes(openAt)) {
    cardSheet.replaceChildren();
    openAt = -1;
  }
  const close = found.close.length ? [closeGroup(found.close.map(at => resultRow(cards[at], at)))] : [];
  resultList.replaceChildren(...added, ...close);
  resultList.scrollTop = 0;
  setActive(-1);
  queryField.setAttribute('aria-expanded', String(shown.length > 0));
  notesBlock.replaceChildren(...noteNodes(found.notes));
  showStatus(found.query.trim() ? found.count : null, found.close.length, found.sort);
  showList();
}
const matchesShown = () => shown.length - (found?.close.length ?? 0);
const moreToShow = () => matchesShown() < (found?.count ?? 0);

// The line under the field, and what screen readers hear once typing pauses: the count, then the notes, errors first.
// The live region speaks only when that text changes.
/** @param {number | null} [count] @param {number} [close] @param {string | null} [sort] */
function showStatus(count = null, close = 0, sort = null) {
  const spellings = close === 1 ? '1 close spelling.' : `${close} close spellings.`;
  const text = loadFailed ? 'The cards couldn’t load. Close and open card lookup to try again.'
    : !index ? 'Loading cards…'
      : count === null ? `${index.cards.length.toLocaleString('en')} cards. Type a name${textOn() ? ' or rules text' : ''}.`
        : count === 0 && close ? `No exact matches. ${spellings}`
          : count === 0 ? 'No cards match'
            : `${count === 1 ? '1 card' : `${count.toLocaleString('en')} cards`}${sort ? `, by ${sort}` : ''}${close ? `. ${spellings}` : ''}`;
  statusLine.textContent = text;
  const spoken = [text, ...(count === null ? [] : found?.notes ?? []).map(note => note.text)].join('. ').replace(/\.\./g, '.');
  clearTimeout(countTimer);
  countTimer = setTimeout(() => {
    if (countRegion.textContent !== spoken) countRegion.textContent = spoken;
  }, countDelay);
}

/** @param {number} next */
function setActive(next) {
  resultList.querySelector('[aria-selected="true"]')?.setAttribute('aria-selected', 'false');
  active = next;
  const row = active >= 0 ? resultList.querySelectorAll('[role="option"]')[active] : null;
  if (row) {
    row.setAttribute('aria-selected', 'true');
    queryField.setAttribute('aria-activedescendant', row.id);
    row.scrollIntoView({ block: 'nearest' });
  } else queryField.removeAttribute('aria-activedescendant');
}

// ---- The card -------------------------------------------------------------------------------------------------------

// Opens a card. Narrow, it replaces the list, with a button back; wide, it sits beside the list. Focus moves to its
// name, so a screen reader reads it next and a phone's keyboard gets out of the way.
/** @param {number} at The card's place in the data. */
function openCard(at) {
  if (!index) return;
  const card = index.cards[at];
  cardSheet.replaceChildren(...cardNodes(card));
  openAt = at;
  openQuery = found?.query ?? '';
  cardsSheet.dataset.view = 'card';
  const place = shown.indexOf(at);
  if (place >= 0) setActive(place);
  /** @type {HTMLElement} */ (cardSheet.querySelector('#card-name')).focus();
  cardSheet.scrollTop = 0;
}
function showList() {
  cardsSheet.dataset.view = 'list';
}

queryField.addEventListener('input', runSearch);
queryField.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!shown.length) return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    if (step > 0 && active === shown.length - 1 && moreToShow()) showResults(false);
    setActive(Math.max(0, Math.min(shown.length - 1, active + step)));
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (shown.length) openCard(shown[Math.max(active, 0)]);
  } else if (event.key === 'Escape') {
    // A search field's own Escape clears it and keeps the sheet open; here Escape closes the sheet, as everywhere else,
    // and the query stays for next time.
    event.preventDefault();
    cardsDialog.close();
  }
});
resultList.addEventListener('scroll', () => {
  if (moreToShow() && resultList.scrollTop + resultList.clientHeight > resultList.scrollHeight - 200) showResults(false);
}, { passive: true });
resultList.addEventListener('click', (event) => {
  const row = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[role="option"]'));
  if (row) openCard(Number(row.dataset.at));
});
backButton.addEventListener('click', backToList);
function backToList() {
  showList();
  queryField.focus();
}

// Search help (design/polish/SCRYFALL-SYNTAX-SPEC.md §7.3) takes the list's place; its heading takes focus. Back,
// Escape and Android's back return to the list with focus in the field; an example runs and returns too.
helpButton.addEventListener('click', () => {
  cardsSheet.dataset.view = 'help';
  helpBody.scrollTop = 0;
  helpTitle.focus();
});
helpBack.addEventListener('click', backToList);
helpBody.addEventListener('click', (event) => {
  const row = /** @type {HTMLButtonElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-example]'));
  if (!row) return;
  queryField.value = /** @type {string} */ (row.dataset.example);
  backToList();
  runSearch();
});
// Escape, or Android's back (app.js sends a cancel event first), in the help leaves the help, not the sheet.
cardsDialog.addEventListener('cancel', (event) => {
  if (cardsSheet.dataset.view !== 'help') return;
  event.preventDefault();
  backToList();
});
textToggle.addEventListener('click', () => {
  textToggle.setAttribute('aria-pressed', String(!textOn()));
  queryField.placeholder = textOn() ? 'Name or rules text' : 'Card name';
  runSearch();
});

// ---- Fitting the keyboard ---------------------------------------------------------------------------------------------

// Android's WebView shrinks the page for the keyboard, so the sheet's own size follows. iOS shrinks only the visual
// viewport, so the sheet is sized and placed to it (--view-height, --view-top) while the keyboard is up. Either way a
// short view gets the compact layout.
function fitToView() {
  if (!cardsDialog.open) return;
  const view = window.visualViewport;
  const height = view ? view.height : window.innerHeight;
  const covered = view ? window.innerHeight - view.height : 0;
  cardsDialog.toggleAttribute('data-keyboard', covered > 80);
  if (covered > 80 && view) {
    cardsDialog.style.setProperty('--view-height', `${Math.round(view.height)}px`);
    cardsDialog.style.setProperty('--view-top', `${Math.round(view.offsetTop)}px`);
  } else {
    cardsDialog.style.removeProperty('--view-height');
    cardsDialog.style.removeProperty('--view-top');
  }
  cardsDialog.toggleAttribute('data-compact', height < compactHeight);
}
window.visualViewport?.addEventListener('resize', fitToView);
window.addEventListener('resize', fitToView);
cardsDialog.addEventListener('close', () => {
  clearTimeout(countTimer);
  countRegion.textContent = '';
  syncBackHandling();
});
