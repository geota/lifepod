import assert from 'node:assert/strict';
import { button, engines, eventually, hold, openPage, saved, test } from './helpers.mjs';

// The fixes from docs/review/ACCESSIBILITY.md: accessible names that start with what a control shows (2.5.3), one-press
// buttons that act when the finger lifts on them (2.5.2), Escape in an editing mode with changes, focus going back to
// what opened a dialog or a mode, Rotate seats keeping focus off the tiles under it, the announcements, the seats'
// names, the hidden "Remove one" buttons' own focus ring, the badge rows' semantics and the system text size.

// A busy game, like sizes-checks.mjs's: every counter on, commander damage, Turn by turn with Player 2 active, mana in
// Player 1's pool, Player 2 the monarch, and the initiative held by Player 4, who is out on poison, so their row shows
// "Pass it on".
function busyGame(extra = {}) {
  return {
    startingLife: 40, scores: [40, 33, 25, 5], rotations: [0, 0, 0, 0], keepAwake: true, landscapeAngle: 90,
    counters: { commander: true, poison: true, energy: true, experience: true, rad: true, monarch: true, initiative: true },
    monarch: 1, initiative: 3,
    poison: [0, 1, 7, 10], casts: [1, 2, 0, 0], energy: [2, 0, 0, 0], experience: [0, 0, 1, 0], rad: [0, 0, 0, 2],
    identities: ['WUBRG', 'UB', 'R', 'BG'],
    commanderDamage: [[0, 3, 0, 0], [0, 0, 4, 0], [5, 0, 0, 0], [0, 0, 0, 0]],
    turns: 'turns', turn: { first: 0, active: 1, round: 3 },
    manaPool: true, pools: [[0, 1, 0, 3, 0, 1], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]],
    ...extra,
  };
}

const mode = page => page.locator('#board').getAttribute('data-mode');
const tile = (page, number) => page.locator(`.player:nth-child(${number})`);
const announced = page => page.locator('#announcer').textContent();
// A pill button by the words it shows. The mana button's name goes on to say how much is floating ("Mana pool, 5 mana
// floating").
const pillButton = (page, name) => page.locator('#board-controls').getByRole('button', { name: new RegExp(`^${name}(,|$)`) });
const focused = page => page.evaluate(() => {
  const active = document.activeElement;
  return active?.getAttribute('aria-label') ?? active?.id ?? active?.tagName;
});

// Every visible, enabled button whose own words show on screen, and the ones whose accessible name doesn't contain
// them. Their words are what's drawn: text that isn't visually hidden, in a part that shows.
function labelProblems(page) {
  return page.evaluate(() => {
    const scope = document.querySelector('dialog[open]') ?? document;
    const shown = (node) => {
      for (let at = node; at && at !== document.body; at = at.parentElement) {
        if (at.classList.contains('visually-hidden') || getComputedStyle(at).display === 'none' || getComputedStyle(at).visibility === 'hidden') return false;
      }
      return true;
    };
    const flat = text => text.replace(/\s+/g, ' ').replace(/−/g, '-').trim().toLowerCase();
    const problems = [];
    for (const control of scope.querySelectorAll('button, [role="slider"]')) {
      if (!control.getClientRects().length || !shown(control) || control.closest('[inert]')) continue;
      const name = control.getAttribute('aria-label');
      if (!name) continue;
      const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
      let words = '';
      for (let node = walker.nextNode(); node; node = walker.nextNode()) if (shown(node.parentElement)) words += ` ${node.textContent}`;
      // The round prints its number twice, so each shown word must be in the name.
      const missing = flat(words).split(' ').filter(word => word && !flat(name).includes(word));
      if (missing.length) problems.push(`"${flat(words)}" isn't in "${name}"`);
    }
    return problems;
  });
}

for (const [name, engine] of Object.entries(engines)) {
  test(`${name}: every accessible name contains the words its control shows`, async (t) => {
    for (const viewport of [{ width: 952, height: 427 }, { width: 568, height: 320 }]) {
      const page = await openPage(t, engine, { viewport, game: busyGame() });
      const view = `${viewport.width} × ${viewport.height}`;
      assert.deepEqual(await labelProblems(page), [], `${view}: the board at rest`);
      // Names that start with what's shown (WCAG 2.5.3).
      assert.equal(await tile(page, 2).locator('.turn-chip').getAttribute('aria-label'), "Turn 3. Player 2's turn, pass it");
      assert.equal(await tile(page, 4).locator('.pass-chip').getAttribute('aria-label'),
        'Pass it on: Player 4 is out and still has the initiative. Give the initiative to someone in counters');
      assert.match(await tile(page, 1).locator('.badges.near .strip-chip').getAttribute('aria-label'), /^5 mana\. Player 1's pool: 1 blue, 3 red, 1 colourless\. Open mana$/);
      for (const [entry, layer] of [['Counters', 'counters'], ['Commander damage', 'damage'], ['Mana pool', 'mana']]) {
        await pillButton(page, entry).click();
        assert.equal(await mode(page), layer);
        assert.deepEqual(await labelProblems(page), [], `${view}: ${layer} mode`);
        await button(page, 'Cancel').click();
      }
      await button(page, 'Counters').click();
      assert.equal(await tile(page, 1).locator('.counter-cell[data-kind="casts"]').getAttribute('aria-label'), '+2 commander tax, Player 1, 1 cast. Add one cast');
      await button(page, 'Cancel').click();
      await button(page, 'Settings').click();
      assert.deepEqual(await labelProblems(page), [], `${view}: settings`);
      await button(page, 'Choose tile colours on the board').click();
      assert.deepEqual(await labelProblems(page), [], `${view}: colours mode`);
      assert.equal(await tile(page, 2).locator('.swatch:disabled').first().getAttribute('aria-label'), 'P1, Jade, taken by Player 1');
      await button(page, 'Done choosing colours').click();
      await page.evaluate(() => window.closeOpenDialog());
      await button(page, 'Settings').click();
      await page.locator('#players-track').focus();
      await page.keyboard.press('ArrowRight');
      await page.locator('#save-setup').click();
      await eventually(() => mode(page), 'first', 'a new game asks who goes first');
      assert.deepEqual(await labelProblems(page), [], `${view}: who goes first`);
      assert.equal(await tile(page, 1).locator('.first-go').getAttribute('aria-label'), 'Me first, Player 1');
      await page.close();
    }
  });

  // WCAG 2.5.2: "Me first" and "Pick at random" act when the finger lifts on them, so sliding off cancels.
  test(`${name}: sliding off Me first or Pick at random cancels them`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: { ...busyGame(), turn: { first: null, active: null, round: 1 } } });
    await button(page, 'Round 1. Choose who goes first').click();
    assert.equal(await mode(page), 'first');
    const drag = async (target, away) => {
      const box = await target.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      if (away) await page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 4 });
      await page.mouse.up();
      await page.clock.runFor(1000);
    };
    for (const target of [button(page, 'Me first, Player 3'), button(page, 'Pick at random')]) {
      await drag(target, true);
      assert.equal(await mode(page), 'first', 'a press that slides off does nothing');
      assert.equal((await saved(page)).turn.first, null);
    }
    // Lifting on the button picks.
    await drag(button(page, 'Me first, Player 3'), false);
    assert.equal((await saved(page)).turn.first, 2, 'a press that lifts on Me first picks that player');
    assert.equal(await mode(page), null);
  });

  test(`${name}: sliding off Pass it on cancels it`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: busyGame() });
    const chip = tile(page, 4).locator('.pass-chip');
    const box = await chip.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 80, { steps: 4 });
    await page.mouse.up();
    await page.clock.runFor(1000);
    assert.equal(await mode(page), null, 'counters mode stays closed');
    await chip.tap();
    assert.equal(await mode(page), 'counters', 'a tap opens it');
  });

  // ACCESSIBILITY.md M1: the key press that opens the Discard dialog no longer closes it as well.
  test(`${name}: Escape in an editing mode with changes asks before discarding`, async (t) => {
    const page = await openPage(t, engine, { game: busyGame() });
    await button(page, 'Counters').click();
    const cell = tile(page, 3).locator('.counter-cell[data-kind="poison"]');
    await cell.focus();
    await page.keyboard.press('Enter');
    assert.equal(await cell.locator('b').textContent(), '8');
    await page.keyboard.press('Escape');
    await eventually(() => page.locator('#discard').evaluate(dialog => dialog.open), true, 'Escape opens Discard, which stays open');
    assert.equal(await page.locator('#discard-title').textContent(), 'Discard 1 change?');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Keep editing');
    // Escape again closes it as Keep editing, and focus goes back to the cell Escape was pressed on.
    await page.keyboard.press('Escape');
    await eventually(() => page.locator('#discard').evaluate(dialog => dialog.open), false, 'settles');
    assert.equal(await mode(page), 'counters', 'still editing');
    assert.equal(await focused(page), 'Player 3 poison, 8. Add one', 'focus is back on the cell');
    // Escape, then Discard.
    await page.keyboard.press('Escape');
    await eventually(() => page.locator('#discard').evaluate(dialog => dialog.open), true, 'settles');
    await button(page, 'Discard').click();
    await eventually(() => mode(page), null, 'settles');
    assert.equal((await saved(page)).poison[2], 7, 'the change is undone');
    await eventually(() => announced(page), 'Changes discarded', 'Discard is announced');
  });

  // Focus goes back to what opened a dialog or a mode, and an opening sheet puts it on a sensible first control.
  test(`${name}: focus returns to what opened a dialog or a mode`, async (t) => {
    const page = await openPage(t, engine, { game: busyGame() });
    const closeWith = async (opener, first, close) => {
      await button(page, opener).focus();
      await page.keyboard.press('Enter');
      await eventually(() => page.evaluate(() => document.activeElement?.textContent?.trim() || document.activeElement?.getAttribute('aria-label')), first, `${opener} opens with focus on ${first}`);
      await close();
      await eventually(() => page.evaluate(() => document.querySelector('dialog[open]') === null), true, 'settles');
      assert.equal(await focused(page), opener, `focus returns to ${opener}`);
    };
    await closeWith('Roll dice', 'Roll d20', () => page.keyboard.press('Escape'));
    await closeWith('Roll dice', 'Roll d20', () => button(page, 'Close dice').click());
    await closeWith('Settings', 'Close settings', () => page.keyboard.press('Escape'));
    await closeWith('Settings', 'Close settings', () => button(page, 'Close settings').click());
    // New game's confirmation, over settings: Cancel returns to New game.
    await button(page, 'Settings').click();
    await button(page, 'New game').focus();
    await page.keyboard.press('Enter');
    await eventually(() => page.evaluate(() => document.activeElement?.textContent), 'Cancel');
    await page.keyboard.press('Escape');
    await eventually(() => page.locator('#restart').evaluate(dialog => dialog.open), false, 'settles');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'restart-button', 'focus returns to New game');
    await page.keyboard.press('Escape');
    await eventually(() => page.evaluate(() => document.querySelector('dialog[open]') === null), true, 'settles');

    // A mode gives focus back to the pill button that opened it, on Save and on Cancel.
    for (const [entry, leave] of [['Commander damage', 'Save'], ['Counters', 'Cancel'], ['Mana pool', 'Save']]) {
      await pillButton(page, entry).focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement?.closest('.mode-layer') !== null), true, `${entry} puts focus on its first cell`);
      await button(page, leave).click();
      assert.equal(await mode(page), null);
      assert.equal((await focused(page)).split(',')[0], entry, `${leave} gives focus back to ${entry}`);
    }
  });

  // ACCESSIBILITY.md M5: nothing on a tile but its rotate button takes focus or a press in Rotate seats.
  test(`${name}: Rotate seats makes the rest of each tile inert, and is announced`, async (t) => {
    const page = await openPage(t, engine, { game: busyGame() });
    await button(page, 'Settings').click();
    await button(page, 'Rotate seats on the board').click();
    assert.equal(await mode(page), 'rotate');
    assert.equal(await focused(page), 'Rotate Player 1 clockwise');
    const reachable = await page.evaluate(() => [...document.querySelectorAll('.player button')]
      .filter(control => control.getClientRects().length && !control.closest('[inert]')).map(control => control.className));
    assert.deepEqual(reachable, ['rotate-seat', 'rotate-seat', 'rotate-seat', 'rotate-seat'], 'only the rotate buttons can take focus');
    // The turn chip under the overlay can't be focused, so Enter can't pass the turn.
    await tile(page, 2).locator('.turn-chip').evaluate(chip => chip.focus());
    assert.equal(await focused(page), 'Rotate Player 1 clockwise');
    await eventually(() => announced(page), 'Rotate seats. Press a tile to turn it clockwise, then Done in the centre');
    await button(page, 'Done rotating seats').click();
    assert.equal(await tile(page, 2).locator('.turn-chip').evaluate(chip => chip.closest('[inert]') === null), true, 'the tiles work again');
    await eventually(() => announced(page), 'Rotate seats closed');
  });

  // ACCESSIBILITY.md M7: modes, a new game, who goes first and the turn are announced, once each.
  test(`${name}: entering and leaving modes, a new game, who goes first and the turn are announced`, async (t) => {
    const page = await openPage(t, engine, { clock: true, game: busyGame({ turns: 'turns', turn: { first: 0, active: 1, round: 3 } }) });
    await button(page, 'Commander damage').click();
    assert.equal(await announced(page), 'Commander damage. Press a commander on a tile to add one damage. Undo goes back one step. Save or Cancel in the centre');
    await button(page, 'Save').click();
    assert.equal(await announced(page), 'Saved');
    await button(page, 'Counters').click();
    await button(page, 'Cancel').click();
    assert.equal(await announced(page), 'Counters closed');

    // The turn: once it settles, with the seat's colour.
    await tile(page, 2).locator('.turn-chip').click();
    await page.clock.runFor(700);
    // With the monarch's reminder, as before.
    assert.match(await announced(page), /^Player 3, Coral's turn, round 3\. Player 2, Monarch: draw a card$/);

    // A hold says the settled total once, after it ends.
    const before = await announced(page);
    const changes = [];
    await page.evaluate(() => {
      window.announcements = [];
      new MutationObserver(() => window.announcements.push(document.querySelector('#announcer').textContent))
        .observe(document.querySelector('#announcer'), { childList: true, characterData: true, subtree: true });
    });
    await hold(page, tile(page, 1).locator('.add'), 2000);
    assert.equal(await announced(page), before, 'nothing during the hold');
    await page.clock.runFor(700);
    changes.push(...await page.evaluate(() => window.announcements));
    assert.equal(changes.length, 1, `one announcement for the hold: ${changes.join(' | ')}`);
    assert.match(changes[0], /^Player 1, Jade, \d+ life$/);

    // A new game, then who goes first.
    await button(page, 'Settings').click();
    await page.locator('#players-track').focus();
    await page.keyboard.press('ArrowRight');
    await page.locator('#save-setup').click();
    await eventually(() => mode(page), 'first', 'a new game asks who goes first');
    assert.equal(await announced(page), 'New game, 5 players at 40 life. Who goes first? Press Me first on a tile, or Pick at random in the centre');
    await button(page, 'Me first, Player 2').click();
    assert.equal(await announced(page), 'Player 2, Sky, goes first');
    await page.clock.runFor(1000);
    assert.equal(await mode(page), null);
    assert.equal(await announced(page), 'Player 2, Sky, goes first', 'the mode closes quietly after the pick');
  });

  // ACCESSIBILITY.md M8, M9 and M6.
  test(`${name}: seats are named by their colour, badge rows are groups, and Remove one has its own ring`, async (t) => {
    const page = await openPage(t, engine, { game: busyGame() });
    assert.deepEqual(await page.locator('.player').evaluateAll(players => players.map(player => player.getAttribute('aria-label'))),
      ['Player 1, Jade', 'Player 2, Sky', 'Player 3, Coral', 'Player 4, Violet']);
    assert.equal(await page.getByRole('region', { name: 'Player 2, Sky' }).count(), 1);
    // Another tile set names the same colours for itself.
    await button(page, 'Settings').click();
    await page.locator('#tile-set-choices [data-set="classic"]').click();
    await page.keyboard.press('Escape');
    assert.equal(await tile(page, 1).getAttribute('aria-label'), 'Player 1, Sage');

    // No lists holding buttons: the rows are labelled groups.
    assert.equal(await page.locator('.player [role="list"], .player [role="listitem"]').count(), 0);
    assert.deepEqual(await tile(page, 2).locator('.badges').evaluateAll(rows => rows.map(row => [row.getAttribute('role'), row.getAttribute('aria-label')])),
      [['group', 'Commander damage'], ['group', 'Status']]);

    // The hidden Remove one button rings its cell dashed, with a −1 tab, where Add one's ring is solid. WebKit on macOS
    // only Tab-focuses form fields.
    if (name === 'webkit') return;
    await button(page, 'Counters').click();
    const ring = () => tile(page, 3).locator('.counter-cell[data-kind="poison"]').evaluate(cell => ({
      style: getComputedStyle(cell).outlineStyle, tab: getComputedStyle(cell, '::after').content,
    }));
    await tile(page, 3).locator('.counter-cell[data-kind="poison"]').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    assert.deepEqual(await ring(), { style: 'solid', tab: 'none' }, 'Add one');
    await page.keyboard.press('Tab');
    assert.equal(await focused(page), 'Remove one poison counter from Player 3');
    assert.deepEqual(await ring(), { style: 'dashed', tab: '"−1"' }, 'Remove one');
  });

  // ACCESSIBILITY.md H1: the system text size reaches settings and the dialogs, which still fit or scroll at 200%.
  for (const native of ['ios', 'android']) {
    if ((native === 'ios') !== (name === 'webkit')) continue;
    test(`${name}: a ${native} text size of 200% grows settings and the dialogs, and the board still fits`, async (t) => {
      const sizes = async page => page.evaluate(() => ({
        label: parseFloat(getComputedStyle(document.querySelector('.setting-label')).fontSize),
        total: parseFloat(getComputedStyle(document.querySelector('.score')).fontSize),
      }));
      const plain = await openPage(t, engine, { viewport: { width: 568, height: 320 }, native, game: busyGame() });
      const base = await sizes(plain);
      await plain.close();
      const page = await openPage(t, engine, { viewport: { width: 568, height: 320 }, native, nativeOptions: { textScale: 2.5 }, game: busyGame() });
      const large = await sizes(page);
      assert.equal(large.label, base.label * 2, 'settings type doubles, the most it grows');
      // The badge rows grow as far as Larger, and the totals give way only to make room for P1's mana row, never below
      // two thirds of their size (design/polish/SPEC.md §9).
      assert.ok(large.total <= base.total && large.total >= base.total * 2 / 3 - 0.1, `the board keeps its fitted type (${large.total}px against ${base.total}px)`);
      await button(page, 'Settings').click();
      const body = await page.locator('#settings-body').evaluate(node => ({ scrolls: node.scrollHeight > node.clientHeight, overflow: getComputedStyle(node).overflowY }));
      assert.deepEqual(body, { scrolls: true, overflow: 'auto' }, 'settings scrolls');
      assert.equal(await page.locator('#settings').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true, 'and never sideways');
      await page.keyboard.press('Escape');
      for (const [opener, dialog] of [['Roll dice', '#dice']]) {
        await button(page, opener).click();
        const fits = await page.locator(dialog).evaluate((node) => {
          const box = node.getBoundingClientRect();
          return box.top >= 0 && box.bottom <= window.innerHeight + 0.5 && (node.scrollHeight <= node.clientHeight || getComputedStyle(node).overflowY !== 'visible');
        });
        assert.equal(fits, true, `${dialog} fits the screen or scrolls`);
        await page.keyboard.press('Escape');
      }
      // A change from the app applies at once, and 1 or less is the default.
      await button(page, 'Settings').click();
      await page.evaluate(() => window.setTextScale(1.5));
      assert.equal((await sizes(page)).label, base.label * 1.5);
      await page.evaluate(() => window.setTextScale(0.8));
      assert.equal((await sizes(page)).label, base.label);
    });
  }
}

// ACCESSIBILITY.md H1: the page can zoom, but only settings and the dialogs take a pinch, and closing one zoomed in puts
// the board back at its own scale, since the board can't be pinched back out.
test('chromium: settings and the dialogs zoom, the board doesn\'t, and closing one resets the zoom', async (t) => {
  const page = await openPage(t, engines.chromium);
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  assert.doesNotMatch(viewport, /user-scalable|maximum-scale/, 'pinch zoom is allowed');
  assert.equal(await page.locator('.app').evaluate(app => getComputedStyle(app).touchAction), 'none', 'but not on the board');
  await button(page, 'Settings').click();
  assert.equal(await page.locator('#settings').evaluate(dialog => getComputedStyle(dialog).touchAction), 'auto', 'settings takes a pinch');
  // Pinched in, as far as the page can tell. Chromium's emulated scale ignores the page's viewport, so the test reads
  // the step WebKit acts on: a maximum scale of 1, for a moment.
  await page.evaluate(() => Object.defineProperty(window.visualViewport, 'scale', { configurable: true, get: () => 2 }));
  await page.keyboard.press('Escape');
  await eventually(() => page.locator('meta[name="viewport"]').getAttribute('content'), `${viewport}, maximum-scale=1`, 'closing settings zooms back out');
  await eventually(() => page.locator('meta[name="viewport"]').getAttribute('content'), viewport, 'then zoom is allowed again');
});

// ACCESSIBILITY.md L4: close to lethal is said as well as shown in amber.
test('chromium: a count close to lethal says how far it is', async (t) => {
  const page = await openPage(t, engines.chromium, {
    game: {
      startingLife: 40, scores: [40, 40, 40, 40], counters: { commander: true, poison: true }, poison: [8, 0, 0, 0],
      commanderDamage: [[0, 18, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    },
  });
  assert.equal(await tile(page, 1).locator('.badges.near .chip[data-kind="poison"]').textContent(), '8 poison, 2 from lethal');
  assert.equal(await tile(page, 1).locator('.badges.far .chip.damage').textContent(), '18 commander damage from Player 2, 3 from lethal');
});
