// Card lookup, behind the pill's magnifier: the data loaded the first time it opens, the search field over the
// results, and a card's text. Importing this module wires the sheet and the button.

import { showDialog } from '../actions/dialog.js';
import { fold, foldText, indexCards, rankResults, searchNames, searchText, textMinimum } from '../logic/cards.js';
import { closeNames, typoBelow, typoBuilder, typoMinimum } from '../logic/cardtypos.js';
import { cardNodes, closeGroup, resultRow } from '../render/card.js';
import { syncBackHandling } from '../state/state.js';
import { lookupButton } from '../ui/dom.js';

/** @typedef {import('../logic/cards.js').CardData} CardData */
/** @typedef {import('../logic/cards.js').CardIndex} CardIndex */
/** @typedef {import('../logic/cardtypos.js').TypoIndex} TypoIndex */

const cardsDialog = /** @type {HTMLDialogElement} */ (document.querySelector('#cards'));
const cardsSheet = /** @type {HTMLDivElement} */ (document.querySelector('#cards-sheet'));
const queryField = /** @type {HTMLInputElement} */ (document.querySelector('#card-query'));
const textToggle = /** @type {HTMLButtonElement} */ (document.querySelector('#card-text'));
const statusLine = /** @type {HTMLParagraphElement} */ (document.querySelector('#card-status'));
const countRegion = /** @type {HTMLParagraphElement} */ (document.querySelector('#card-count'));
const resultList = /** @type {HTMLDivElement} */ (document.querySelector('#card-results'));
const cardSheet = /** @type {HTMLDivElement} */ (document.querySelector('#card-sheet'));
const backButton = /** @type {HTMLButtonElement} */ (document.querySelector('#card-back'));

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
/** @type {{ names: number[][], texts: number[], query: string, close: number[] } | null} */
let found = null;
// The cards drawn, in the list's order: the matches, then any close spellings.
/** @type {number[]} */
let shown = [];
/** @type {TypoIndex | null} */
let typos = null;
let matches = 0;
let active = -1;
let textTimer = 0;
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
      search();
      buildTypos(index);
    })
    .catch(() => {
      loadFailed = true;
      showStatus();
    })
    .finally(() => {
      loading = null;
    });
}

// The close-spellings index, built in steps of 2,000 names, one task each, so the sheet stays responsive while it's
// built (about 230 ms in all on a phone-speed CPU). A query that wanted close spellings before it was ready runs again.
/** @param {CardIndex} built */
function buildTypos(built) {
  const builder = typoBuilder(built.keys);
  const step = () => {
    if (built !== index) return;
    const ready = builder.step();
    if (!ready) {
      setTimeout(step, 0);
      return;
    }
    typos = ready;
    if (found && !found.close.length && wantsTypos(found.query, matches)) search();
  };
  setTimeout(step, 0);
}
/** @param {string} query @param {number} count */
const wantsTypos = (query, count) => count < typoBelow && fold(query).length >= typoMinimum;

// ---- Search ---------------------------------------------------------------------------------------------------------

const textOn = () => textToggle.getAttribute('aria-pressed') === 'true';

// Names are searched at once; rules text, the slower search, runs in its own task just after, so neither keeps a
// keystroke waiting longer than a frame (docs/DEVELOPING.md, "Card data").
function search() {
  clearTimeout(textTimer);
  if (!index) {
    showStatus();
    return;
  }
  const query = queryField.value;
  const names = searchNames(index, query);
  found = { names, texts: [], query, close: [] };
  addCloseSpellings(found);
  showResults(true);
  if (textOn() && foldText(query).length >= textMinimum) {
    const searched = found;
    textTimer = setTimeout(() => {
      if (searched !== found || !index) return;
      searched.texts = searchText(index, query);
      addCloseSpellings(searched);
      showResults(true);
    }, 0);
  }
}

// A plain query that finds fewer than 3 cards also lists the names within a few typing slips of it, after the
// matches (design/polish/SCRYFALL-SYNTAX-SPEC.md §6.6), popular cards first among equals.
/** @param {{ names: number[][], texts: number[], query: string, close: number[] }} search */
function addCloseSpellings(search) {
  search.close = [];
  if (!index || !typos) return;
  const cards = index.cards;
  const count = search.names.reduce((sum, bucket) => sum + bucket.length, 0) + search.texts.length;
  if (!wantsTypos(search.query, count)) return;
  const skip = new Set([...search.names.flat(), ...search.texts]);
  search.close = closeNames(typos, fold(search.query), { limit: pageSize, skip, rank: at => cards[at].er ?? Infinity });
}

// Draws the first page of results, or (`fresh` false) adds the next page below the ones shown. Close spellings, when
// there are any, follow the matches (which are then fewer than a page) in a group of their own.
/** @param {boolean} fresh */
function showResults(fresh) {
  if (!index || !found) return;
  const ranked = rankResults(index, found.names, found.texts, fresh ? pageSize : matchesShown() + pageSize);
  const cards = index.cards;
  const added = ranked.results.slice(fresh ? 0 : matchesShown()).map(at => resultRow(cards[at], at));
  matches = ranked.count;
  if (!fresh) {
    shown = ranked.results;
    resultList.append(...added);
    return;
  }
  shown = [...ranked.results, ...found.close];
  const close = found.close.length ? [closeGroup(found.close.map(at => resultRow(cards[at], at)))] : [];
  resultList.replaceChildren(...added, ...close);
  resultList.scrollTop = 0;
  setActive(-1);
  queryField.setAttribute('aria-expanded', String(shown.length > 0));
  showStatus(found.query.trim() ? matches : null, found.close.length);
  showList();
}
const matchesShown = () => shown.length - (found?.close.length ?? 0);
const moreToShow = () => matchesShown() < matches;

// The line under the field, and what screen readers hear once typing pauses.
/** @param {number | null} [count] @param {number} [close] */
function showStatus(count = null, close = 0) {
  const spellings = close === 1 ? '1 close spelling.' : `${close} close spellings.`;
  const text = loadFailed ? 'The cards couldn’t load. Close and open card lookup to try again.'
    : !index ? 'Loading cards…'
      : count === null ? `${index.cards.length.toLocaleString('en')} cards. Type a name${textOn() ? ' or rules text' : ''}.`
        : count === 0 && close ? `No exact matches. ${spellings}`
          : count === 0 ? 'No cards match'
            : `${count === 1 ? '1 card' : `${count.toLocaleString('en')} cards`}${close ? `. ${spellings}` : ''}`;
  statusLine.textContent = text;
  clearTimeout(countTimer);
  countTimer = setTimeout(() => {
    countRegion.textContent = text;
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
  cardsSheet.dataset.view = 'card';
  const place = shown.indexOf(at);
  if (place >= 0) setActive(place);
  /** @type {HTMLElement} */ (cardSheet.querySelector('#card-name')).focus();
  cardSheet.scrollTop = 0;
}
function showList() {
  cardsSheet.dataset.view = 'list';
}

queryField.addEventListener('input', search);
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
backButton.addEventListener('click', () => {
  showList();
  queryField.focus();
});
textToggle.addEventListener('click', () => {
  textToggle.setAttribute('aria-pressed', String(!textOn()));
  queryField.placeholder = textOn() ? 'Name or rules text' : 'Card name';
  search();
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
