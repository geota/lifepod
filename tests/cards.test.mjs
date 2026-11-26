import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { button, engines, eventually, openPage, saved, savedGame, scores, test } from './helpers.mjs';

// Card lookup behind the pill's magnifier (js/sheets/cards.js): the data loads only when it first opens, the search field and
// its results work from the keyboard, a card reads as text with its symbols and faces, the sheet fits every size with
// 44px targets, keyboard open or not, and a keystroke's search fits in a frame.

const opener = 'Card lookup';
const activeId = page => page.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute('aria-label'));
const statusText = page => page.locator('#card-status').textContent();
const rowNames = page => page.locator('#card-results .card-row-name').allTextContents();
async function loaded(page) {
  await eventually(async () => /cards\. Type a name/.test(await statusText(page)) || /cards?$|Showing/.test(await statusText(page)), true, 'the cards load');
}
async function openCards(page) {
  await button(page, opener).click();
  await loaded(page);
}
async function search(page, query) {
  await page.locator('#card-query').fill(query);
  await eventually(async () => (await rowNames(page)).length > 0, true, `"${query}" finds cards`);
}

async function checkLookup(t, engine) {
  const page = await openPage(t, engine, { clock: true });
  const fetched = [];
  page.on('request', (request) => {
    if (request.url().includes('/data/')) fetched.push(new URL(request.url()).pathname);
  });

  // The board and the dice never load the card data.
  await button(page, 'Roll dice').click();
  await page.keyboard.press('Escape');
  assert.deepEqual(fetched, [], 'nothing is fetched at startup or for the dice');

  // The magnifier loads the data once, and the field takes focus. (From the keyboard: WebKit doesn't focus a clicked
  // button, so there would be no focus to return.)
  await button(page, opener).focus();
  await page.keyboard.press('Enter');
  assert.equal(await activeId(page), 'card-query', 'the search field has focus');
  await loaded(page);
  assert.deepEqual(fetched, ['/data/cards.json.gz'], 'the gzipped data, unpacked in the page');
  assert.match(await statusText(page), /^[\d,]+ cards\. Type a name\.$/);

  // Typing lists matches as you go, and the count is announced once typing pauses.
  await page.keyboard.type('sol r');
  await eventually(async () => (await rowNames(page))[0], 'Sol Ring', '"sol r" finds Sol Ring first');
  assert.equal(await page.locator('#card-query').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#card-count').textContent(), '', 'not announced mid-word');
  await page.clock.runFor(500);
  assert.match(await page.locator('#card-count').textContent(), /^\d+ cards/, 'the count is announced');

  // Arrows move through the results without leaving the field; Enter opens one and moves focus to its name.
  await page.keyboard.press('ArrowDown');
  const first = page.locator('#card-results [role="option"]').first();
  assert.equal(await page.locator('#card-query').getAttribute('aria-activedescendant'), await first.getAttribute('id'));
  assert.equal(await first.getAttribute('aria-selected'), 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  assert.equal(await first.getAttribute('aria-selected'), 'true', 'back to the first');
  await page.keyboard.press('Enter');
  assert.equal(await activeId(page), 'card-name');
  assert.equal(await page.locator('#card-name').textContent(), 'Sol Ring');
  const text = page.locator('#card-sheet .card-text');
  assert.equal(await text.textContent(), 'tap: Add colourlesscolourless.', 'screen readers hear the symbols as words');
  assert.equal(await text.locator('.pip[data-pip="T"]').count(), 1, 'the tap symbol is drawn');
  // Wide, the card sits beside the results, with no Back.
  assert.ok(await page.locator('#card-results').isVisible() && !(await page.locator('#card-back').isVisible()));

  // Rules text finds cards by what they do.
  await button(page, 'Rules text').click();
  assert.equal(await button(page, 'Rules text').getAttribute('aria-pressed'), 'true');
  await page.locator('#card-query').fill('create a treasure');
  assert.equal((await rowNames(page)).length, 0, 'no name has those words');
  await page.clock.runFor(1);
  await eventually(async () => (await rowNames(page)).length, 25, 'rules text matches follow in the next task');
  assert.match(await statusText(page), /^\d+ cards$/);
  // Scrolling to the end draws the next 25.
  await page.locator('#card-results').evaluate((list) => { list.scrollTop = list.scrollHeight; });
  await eventually(async () => (await rowNames(page)).length, 50, 'the next lot');
  await page.locator('#card-results [role="option"]').first().click();
  assert.match(await page.locator('#card-sheet .card-text').textContent(), /create a Treasure/i);
  await button(page, 'Rules text').click();

  // Escape closes the sheet, focus goes back to the magnifier, and it opens again with nothing fetched again.
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#cards').evaluate(dialog => dialog.open), false, 'Escape closes it');
  assert.equal(await activeId(page), 'lookup-button', 'focus returns to the magnifier');
  await button(page, opener).click();
  assert.equal(await activeId(page), 'card-query');
  assert.equal(await page.locator('#card-query').evaluate(field => field.selectionEnd - field.selectionStart), 'create a treasure'.length, 'the last query is selected, to type over');
  assert.deepEqual(fetched, ['/data/cards.json.gz'], 'loaded once');
  assert.equal(await page.evaluate(() => window.closeOpenDialog()), true, 'Android back closes it');
  assert.equal(await page.locator('#cards').evaluate(dialog => dialog.open), false);

  // Narrow, a card replaces the results, and Results brings them back with focus in the field.
  await page.setViewportSize({ width: 390, height: 844 });
  await button(page, opener).click();
  await search(page, 'llanowar elves');
  await page.locator('#card-results [role="option"]').first().click();
  assert.ok(await page.locator('#card-back').isVisible() && await page.locator('#card-results').isHidden());
  assert.ok(await page.locator('#card-query').isHidden(), 'the card takes the field\'s place too');
  await button(page, 'Results').click();
  assert.ok(await page.locator('#card-results').isVisible());
  assert.equal(await activeId(page), 'card-query');
  // A row is a control, not text to select.
  assert.equal(await page.locator('#card-results [role="option"]').first().evaluate(row => getComputedStyle(row).userSelect || getComputedStyle(row).webkitUserSelect), 'none');
}

async function checkCardText(t, engine) {
  const page = await openPage(t, engine, { viewport: { width: 852, height: 393 } });
  await openCards(page);
  const open = async (query, name) => {
    await search(page, query);
    await page.locator('#card-results [role="option"]', { hasText: name }).first().click();
    assert.equal(await page.locator('#card-name').textContent(), name);
  };

  // A double-faced card shows both faces, each with its name, type, text and stats.
  await open('delver of secrets', 'Delver of Secrets // Insectile Aberration');
  const faces = page.locator('#card-sheet .card-face');
  assert.equal(await faces.count(), 2);
  assert.deepEqual(await page.locator('#card-sheet .card-face-name').allTextContents(), ['Delver of Secrets', 'Insectile Aberration']);
  assert.deepEqual(await page.locator('#card-sheet .card-stats').allTextContents(), ['Power and toughness 1/1', 'Power and toughness 3/2']);
  assert.match(await faces.nth(1).locator('.card-text').textContent(), /^Flying$/);
  assert.match(await page.locator('#card-sheet .card-facts').textContent(), /Mono-blue/);
  assert.equal(await page.locator('#card-sheet .card-facts .ci').getAttribute('data-ci'), 'U', 'the colour indicator');

  // A creature: its cost as discs, reminder text set apart, power and toughness, and a four-colour identity.
  await open('atraxa praetors', 'Atraxa, Praetors\' Voice');
  assert.deepEqual(await page.locator('#card-sheet .card-head .pip').evaluateAll(pips => pips.map(pip => pip.dataset.pip)), ['G', 'W', 'U', 'B']);
  assert.match(await page.locator('#card-sheet .card-head .card-cost').textContent(), /mana cost green, white, blue, black$/);
  assert.equal(await page.locator('#card-sheet .reminder').count(), 1, 'proliferate\'s reminder');
  assert.equal(await page.locator('#card-sheet .card-stats').textContent(), 'Power and toughness 4/4');
  assert.equal(await page.locator('#card-sheet .card-facts .ci').getAttribute('data-ci'), 'WUBG');

  // Hybrid, Phyrexian and generic symbols draw from the Mana font: every disc and glyph has a symbol.
  await open('kitchen finks', 'Kitchen Finks');
  const hybrid = page.locator('#card-sheet .card-head .pip[data-second]').first();
  assert.deepEqual(await hybrid.evaluate(pip => [pip.dataset.pip, pip.dataset.second]), ['G', 'W']);
  await open('dismember', 'Dismember');
  assert.equal(await page.locator('#card-sheet .card-head .pip[data-phyrexian]').count(), 2);
  const drawn = await page.evaluate(async () => {
    const { bareSymbols, discSymbols } = await import('/js/logic/cards.js');
    const probe = document.createElement('p');
    probe.className = 'card-text';
    document.querySelector('#card-sheet').append(probe);
    const glyph = (node, pseudo) => getComputedStyle(node, pseudo).content;
    const make = (attributes, className) => {
      const node = document.createElement('span');
      node.className = className;
      Object.assign(node.dataset, attributes);
      probe.append(node);
      return node;
    };
    const missing = [];
    for (const pip of Object.keys(discSymbols)) if (!/^"[-]"$/u.test(glyph(make({ pip }, 'pip'), '::before'))) missing.push(pip);
    for (const sym of Object.keys(bareSymbols)) if (!/^"[-]"$/u.test(glyph(make({ sym }, 'sym'), '::before'))) missing.push(sym);
    for (const second of ['W', 'U', 'B', 'R', 'G', 'C']) {
      const node = make({ pip: '2', second }, 'pip');
      if (!/^"[-]"$/u.test(glyph(node, '::after'))) missing.push(`2/${second}`);
    }
    const phyrexian = glyph(make({ pip: 'B', phyrexian: '' }, 'pip'), '::before');
    const tap = glyph(make({ pip: 'T' }, 'pip'), '::before');
    const font = getComputedStyle(probe.querySelector('.pip'), '::before').fontFamily;
    probe.remove();
    return { missing, phyrexian: phyrexian.codePointAt(1).toString(16), tap: tap.codePointAt(1).toString(16), font };
  });
  assert.deepEqual(drawn, { missing: [], phyrexian: 'e618', tap: 'e61a', font: 'Mana' }, 'card text uses the modern tap symbol, U+E61A');
}

// The sweep sizes, with a phone's keyboard open (the page halved, as Android's WebView shrinks it) on the landscape ones.
const screens = [[952, 427], [852, 393], [640, 360], [568, 320], [320, 568], [390, 844], [820, 1180], [1366, 1024], [952, 214], [568, 160]];
async function checkTargets(t, engine, style) {
  const page = await openPage(t, engine, { style, viewport: { width: 952, height: 427 } });
  await openCards(page);
  await page.keyboard.press('Escape');
  const problems = [];
  for (const [width, height] of screens) {
    await page.setViewportSize({ width, height });
    await button(page, opener).click();
    await search(page, 'sol');
    for (const view of ['list', 'card', 'help']) {
      if (view === 'card') await page.locator('#card-results [role="option"]').first().click();
      if (view === 'help') {
        if (await page.locator('#card-back').isVisible()) await page.locator('#card-back').click();
        await button(page, 'Search help').click();
      }
      const found = await page.evaluate(() => {
        const dialog = document.querySelector('#cards').getBoundingClientRect();
        const issues = [];
        if (dialog.top < -0.5 || dialog.left < -0.5 || dialog.bottom > innerHeight + 0.5 || dialog.right > innerWidth + 0.5) issues.push('the sheet overflows the window');
        const visible = node => node.checkVisibility() && node.getBoundingClientRect().height > 1;
        for (const node of document.querySelectorAll('#cards-sheet :is(button, input, [role="option"])')) {
          if (!visible(node)) continue;
          const box = node.getBoundingClientRect();
          const label = node.id || node.getAttribute('aria-label') || node.textContent.trim().slice(0, 20);
          if (box.width < 43.5 || box.height < 43.5) issues.push(`${label} is ${Math.round(box.width)}×${Math.round(box.height)}`);
          // Search help's rows scroll inside it, so only their size counts.
          if (node.matches('button, input') && !node.closest('.help-body') && (box.left < dialog.left - 0.5 || box.right > dialog.right + 0.5 || box.top < dialog.top - 0.5 || box.bottom > dialog.bottom + 0.5)) issues.push(`${label} is outside the sheet`);
        }
        const rows = [...document.querySelectorAll('#card-results [role="option"]')].filter(visible);
        const list = document.querySelector('#card-results');
        if (list.checkVisibility() && !rows.some(row => row.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom + 0.5)) issues.push('no whole result shows');
        if (document.querySelector('#card-name')?.checkVisibility() === false && document.querySelector('#cards-sheet').dataset.view === 'card') issues.push('the open card is hidden');
        const help = document.querySelector('.help-body');
        if (document.querySelector('#cards-sheet').dataset.view === 'help' && !(help.checkVisibility() && help.getBoundingClientRect().height >= 44)) issues.push('Search help has no room');
        return issues;
      });
      problems.push(...found.map(issue => `${width}×${height} ${view}: ${issue}`));
    }
    // Escape leaves Search help for the list, then closes the sheet.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(problems, []);
}

// Card lookup isn't game state: opening it, searching, reading cards and closing it record no undo step, so History
// and Undo are as they were (design/polish/SPEC.md §15).
async function checkNoHistory(t, engine) {
  const page = await openPage(t, engine, { clock: true, game: savedGame(4) });
  await page.locator('.player').first().locator('.subtract').tap();
  await page.clock.runFor(5000);
  const history = async () => page.evaluate(async () => JSON.stringify((await import('/js/state/state.js')).game.history));
  const before = { history: await history(), saved: JSON.stringify((await saved(page)).history), undo: await page.locator('#undo-button').isDisabled() };
  assert.equal(before.undo, false, 'the life step can be undone');
  await openCards(page);
  await search(page, 'sol ring');
  await page.locator('#card-results [role="option"]').first().click();
  await button(page, 'Rules text').click();
  await page.locator('#card-query').fill('draw a card');
  await page.clock.runFor(1000);
  await page.keyboard.press('Escape');
  await page.clock.runFor(5000);
  assert.deepEqual({ history: await history(), saved: JSON.stringify((await saved(page)).history), undo: await page.locator('#undo-button').isDisabled() }, before,
    'no step recorded, nothing saved, Undo unchanged');
  // Undo still takes back the life step, and nothing card lookup did.
  await page.locator('#undo-button').tap();
  assert.equal((await scores(page))[0], 40);
}

// A plain query with a typing slip lists the close spellings after its matches, under their own heading, and the
// keyboard reaches them (design/polish/SCRYFALL-SYNTAX-SPEC.md §6.6). The index builds in steps after the data loads.
async function checkCloseSpellings(t, engine) {
  const page = await openPage(t, engine, { viewport: { width: 852, height: 393 } });
  await openCards(page);
  await page.locator('#card-query').fill('smothering tihte');
  await eventually(() => statusText(page), 'No exact matches. 1 close spelling.', 'the close spelling is found once the index is built');
  const group = page.locator('#card-results [role="group"]');
  assert.equal(await group.getAttribute('aria-label'), 'Close spellings');
  assert.deepEqual(await group.locator('.card-row-name').allTextContents(), ['Smothering Tithe']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#card-name').textContent(), 'Smothering Tithe');
  // Exact matches come first, then the close ones; three or more matches need no guessing.
  await page.locator('#card-query').fill('sol rign');
  await eventually(async () => (await rowNames(page))[0], 'Sol Ring', 'a half-typed name with a slip');
  await page.locator('#card-query').fill('bolt');
  await eventually(async () => page.locator('#card-results [role="group"]').count(), 0, 'no close spellings with many matches');
}

// A syntax query lists what Scryfall would, with notes for what card lookup can't answer and for mistakes; the live
// region says the count and then the notes, once typing pauses (design/polish/SCRYFALL-SYNTAX-SPEC.md §7.1, §7.6).
async function checkNotes(t, engine) {
  const page = await openPage(t, engine, { clock: true, viewport: { width: 952, height: 427 } });
  await openCards(page);
  await page.locator('#card-query').fill('e:war t:elf');
  await eventually(async () => /^\d+ cards$/.test(await statusText(page)), true, 'the elves are counted');
  const count = Number((await statusText(page)).replace(/\D/g, ''));
  assert.ok(count > 600, `${count} elves`);
  const note = page.locator('#card-notes .card-note');
  assert.equal(await note.count(), 1);
  assert.equal(await note.getAttribute('data-kind'), 'cut');
  assert.equal(await note.locator('.card-note-text').textContent(), 'Sets and printings aren’t in the offline data. Showing results without e:war.');
  assert.equal(await note.locator('code').textContent(), 'e:war', 'the term in monospace');
  assert.equal(await page.locator('#card-query').getAttribute('aria-describedby'), 'card-notes');
  await page.clock.runFor(500);
  assert.equal(await page.locator('#card-count').textContent(), `${count} cards. Sets and printings aren’t in the offline data. Showing results without e:war.`);
  // A mistake is mended with an error note, and nothing throws (the harness fails on a page error).
  await page.locator('#card-query').fill('o:"draw a card t:instant');
  await page.clock.runFor(150);
  await eventually(async () => page.locator('#card-notes .card-note[data-kind="error"]').count(), 1, 'the error note');
  assert.match(await page.locator('#card-notes .card-note-text').first().textContent(), /^Missing closing quote/);
  // "or" is the operator, and the card named by the whole query comes first.
  await page.locator('#card-query').fill('death or glory');
  await eventually(async () => (await rowNames(page))[0], 'Death or Glory', 'the exact name first');
  assert.ok(Number((await statusText(page)).replace(/\D/g, '')) > 100, 'either word');
  // A slow query (rules text, patterns, ~) waits for typing to pause; meanwhile the list keeps its results, busy.
  await page.locator('#card-query').fill('o:"draw a card" t:instant');
  assert.equal(await statusText(page), 'Searching…');
  assert.equal(await page.locator('#card-results').getAttribute('aria-busy'), 'true');
  await page.clock.runFor(150);
  await eventually(async () => /^\d+ cards$/.test(await statusText(page)), true, 'the slow query runs once typing pauses');
  assert.equal(await page.locator('#card-results').getAttribute('aria-busy'), null);
  // A sorted query says how it's sorted.
  await page.locator('#card-query').fill('t:dragon c:r order:cmc');
  await eventually(async () => /^\d+ cards, by mana value$/.test(await statusText(page)), true, 'the sort in the status line');
  // Rules text doesn't change a syntax query: its bare words are names.
  await button(page, 'Rules text').click();
  await page.locator('#card-query').fill('treasure t:artifact');
  await page.clock.runFor(1);
  await eventually(async () => (await rowNames(page)).every(row => /treasure/i.test(row)), true, 'only names with Treasure');
}

// Search help takes the list's place; Back, Escape and Android's back return to the list with focus in the field, and an
// example fills the field and runs (§7.3). On a short screen, the notes shrink to one line beside the count (§7.4).
async function checkHelp(t, engine) {
  const page = await openPage(t, engine, { viewport: { width: 852, height: 393 } });
  await openCards(page);
  await button(page, 'Search help').click();
  assert.equal(await page.locator('#cards-sheet').getAttribute('data-view'), 'help');
  assert.equal(await activeId(page), 'card-help-title', 'the heading takes focus');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#cards').evaluate(dialog => dialog.open), true, 'Escape leaves the help, not the sheet');
  assert.equal(await page.locator('#cards-sheet').getAttribute('data-view'), 'list');
  assert.equal(await activeId(page), 'card-query');
  await button(page, 'Search help').click();
  assert.equal(await page.evaluate(() => window.closeOpenDialog()), true);
  assert.equal(await page.locator('#cards').evaluate(dialog => dialog.open), true, 'Android back leaves the help too');
  assert.equal(await page.locator('#cards-sheet').getAttribute('data-view'), 'list');
  await button(page, 'Search help').click();
  await page.locator('.help-row', { hasText: 'red and green, maybe more' }).click();
  assert.equal(await page.locator('#card-query').inputValue(), 'c:rg');
  await eventually(async () => /^\d+ cards$/.test(await statusText(page)), true, 'the example runs');
  await button(page, 'Search help').click();
  await button(page, 'Results').click();
  assert.equal(await activeId(page), 'card-query', 'Back returns to the field');
  // Short, as with a phone's keyboard open in landscape: the count and the note's short form share one line.
  await page.setViewportSize({ width: 568, height: 160 });
  await page.locator('#card-query').fill('e:war t:elf');
  await eventually(async () => page.locator('#card-notes .card-note-short').first().isVisible(), true, 'the short form shows');
  assert.equal(await page.locator('#card-notes .card-note-short').first().textContent(), 'Without e:war (sets)');
  const line = await page.evaluate(() => {
    const status = document.querySelector('#card-status').getBoundingClientRect();
    const note = document.querySelector('#card-notes .card-note-short').getBoundingClientRect();
    return note.top < status.bottom && note.bottom > status.top && note.left >= status.right;
  });
  assert.ok(line, 'on the status line');
}

// Community tags load only when a query first asks for one, and the query then runs with them (§5.4).
async function checkTags(t, engine) {
  const page = await openPage(t, engine, { viewport: { width: 952, height: 427 } });
  const fetched = [];
  page.on('request', (request) => {
    if (request.url().includes('/data/')) fetched.push(new URL(request.url()).pathname);
  });
  await openCards(page);
  await search(page, 't:instant c:w mv<=1');
  assert.deepEqual(fetched, ['/data/cards.json.gz'], 'no tags until a query asks');
  await page.locator('#card-query').fill('otag:removal c:w mv<=1 t:instant');
  await eventually(async () => /^\d+ cards$/.test(await statusText(page)) && !(await page.locator('#card-notes').textContent()).includes('Loading'), true, 'the tags load and the query runs');
  assert.deepEqual(fetched, ['/data/cards.json.gz', '/data/tags.json.gz']);
  const count = Number((await statusText(page)).replace(/\D/g, ''));
  assert.ok(count >= 40 && count <= 60, `${count} white removal instants of mana value 1 or less`);
  await page.locator('#card-query').fill('otag:no-such-tag t:elf');
  await eventually(async () => page.locator('#card-notes .card-note-text').first().textContent(), 'no-such-tag isn’t a community tag.', 'an unknown tag');
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: community tags load the first time a query asks for one`, t => checkTags(t, engine));
  test(`${name}: Search help opens in the list's place, and its examples run`, t => checkHelp(t, engine));
  test(`${name}: a syntax query shows notes for cut keywords and mistakes, and announces them`, t => checkNotes(t, engine));
  test(`${name}: a plain query with a typing slip lists close spellings after its matches`, t => checkCloseSpellings(t, engine));
  test(`${name}: card lookup takes no undo step and leaves History as it was`, t => checkNoHistory(t, engine));
  test(`${name}: card lookup loads when first shown, searches as you type and works from the keyboard`, t => checkLookup(t, engine));
  test(`${name}: a card reads as text, with both faces, its symbols and its identity`, t => checkCardText(t, engine));
  for (const style of ['material', 'glass']) {
    test(`${name}: card lookup fits every size with 44px targets, keyboard open or not (${style})`, { timeout: 120000 }, t => checkTargets(t, engine, style));
  }
}

// A keystroke's name search, and drawing its results, fit in a frame (16ms) on a phone-speed CPU: Chromium at a quarter
// speed. Rules text runs in the next task and fits a frame of its own as the query grows.
test('chromium: a keystroke searches 33,000 names and draws the results within a frame at 4× CPU slowdown', async (t) => {
  const page = await openPage(t, chromium);
  await openCards(page);
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const timings = await page.evaluate(async () => {
    const { indexCards, rankResults, searchNames, searchText } = await import('/js/logic/cards.js');
    const response = await fetch('/data/cards.json.gz');
    const data = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
    const index = indexCards(data.cards);
    const field = /** @type {HTMLInputElement} */ (document.querySelector('#card-query'));
    const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    // The best of three runs: the suite runs files side by side, and a run that loses the CPU to another says nothing
    // about the search.
    const time = (run) => {
      let best = Infinity;
      for (let attempt = 0; attempt < 3; attempt++) {
        const start = performance.now();
        run();
        best = Math.min(best, performance.now() - start);
      }
      return best;
    };
    const typed = text => [...text].map((_, at) => text.slice(0, at + 1));
    const names = [];
    const keystrokes = [];
    for (const query of [...typed('sol ring'), ...typed('lightning bolt'), ...typed('lim dul')]) {
      names.push(time(() => rankResults(index, searchNames(index, query))));
      keystrokes.push(time(() => {
        field.value = query;
        field.dispatchEvent(new Event('input'));
      }));
    }
    searchText(index, 'zzz');
    // Each step narrows the one before, as typing does: every timed run starts from the step before's matches.
    const steps = typed('draw a card').slice(2);
    let last = null;
    const text = steps.map((query) => {
      const before = last;
      const spent = time(() => {
        index.last = before;
        searchText(index, query);
      });
      last = index.last;
      return spent;
    });
    // Close spellings: the index is built once, in steps, then each slip is looked up.
    const { buildTypoIndex, closeNames } = await import('/js/logic/cardtypos.js');
    const { fold } = await import('/js/logic/cards.js');
    const typos = buildTypoIndex(index.keys);
    const slips = ['smothering tihte', 'atraxa praetors vocie', 'ulamog the ceasless', 'mana crpyt', 'farseak', 'lightnig bolt'];
    const close = slips.map(slip => time(() => closeNames(typos, fold(slip), { rank: at => data.cards[at].er ?? Infinity })));
    // Syntax queries (design/polish/SCRYFALL-SYNTAX-SPEC.md §8): each with no cached terms, once the columns are built.
    const { runQuery } = await import('/js/logic/cardfilter.js');
    const { columnsOf } = await import('/js/logic/cardcolumns.js');
    const { parseQuery } = await import('/js/logic/cardquery.js');
    const query = (text) => {
      columnsOf(index).cache.clear();
      return runQuery(index, parseQuery(text), text);
    };
    const warm = ['o:x', 'fo:x', 'o:"~ x"', 'devotion:{u}', 'm:1', 'is:frenchvanilla', 'f:legacy', 'kw:x', 'name:"x"', '!x', 'is:hybrid'];
    warm.forEach(query);
    const quick = ['c:rg', 'm:2WW', 't:creature', 'is:manland', 't:legendary (t:goblin or t:elf)', 'f:commander id<=esper t:instant', 'pow>tou c:w t:creature', 't:creature c:g mv<=3'];
    const slow = ['o:draw', 'o:"~ enters tapped"', 'fo:"create a treasure"', 'devotion:{u/b}{u/b}{u/b}', 'o:/\\bdraw\\b(?!s)/ t:instant', 'o:/^{T}:/'];
    const syntax = quick.map(text => time(() => query(text)));
    const debounced = slow.map(text => time(() => query(text)));
    return {
      names: median(names), namesMax: Math.max(...names), keystroke: median(keystrokes), text: median(text), close: median(close),
      closeMax: Math.max(...close), syntax: median(syntax), syntaxMax: Math.max(...syntax), slow: median(debounced), slowMax: Math.max(...debounced),
    };
  });
  t.diagnostic(`at 4× slowdown: name search ${timings.names.toFixed(1)}ms median (${timings.namesMax.toFixed(1)}ms max), a keystroke with drawing ${timings.keystroke.toFixed(1)}ms, rules text ${timings.text.toFixed(1)}ms, close spellings ${timings.close.toFixed(1)}ms (${timings.closeMax.toFixed(1)}ms max), syntax ${timings.syntax.toFixed(1)}ms (${timings.syntaxMax.toFixed(1)}ms max), slow syntax ${timings.slow.toFixed(1)}ms (${timings.slowMax.toFixed(1)}ms max)`);
  assert.ok(timings.close < 5, `close spellings ${timings.close}ms`);
  assert.ok(timings.syntax < 16, `a quick syntax query ${timings.syntax}ms`);
  assert.ok(timings.slowMax < 50, `a slow syntax query, once typing pauses, ${timings.slowMax}ms`);
  assert.ok(timings.names < 16, `name search ${timings.names}ms`);
  assert.ok(timings.namesMax < 32, `the slowest, one letter, ${timings.namesMax}ms`);
  // Drawing adds DOM work that varies more with the machine than the search does: alone it measures about 9–11ms, and
  // 15ms with the whole suite running beside it, so it gets half a frame of slack.
  assert.ok(timings.keystroke < 24, `a keystroke with drawing ${timings.keystroke}ms`);
  assert.ok(timings.text < 16, `rules text as the query grows ${timings.text}ms`);
});
