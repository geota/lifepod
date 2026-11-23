# LifePod deep-dive review

Reviewed on 22 November 2026 against `main` at `ac0e0b8` (v0.1.0-alpha.15), just after `app.js` was split into ES modules under `web/js/`. I didn't change any code or commit anything.

**How the findings were checked.** I read all of `web/` (app.js, the 26 modules, dice.js, index.html and the outline of styles.css), `MainActivity.kt`, `LifePodApp.swift`, the manifest, the CI workflow, the test harness and the earlier reviews. Each bug below was reproduced in Chromium and WebKit with playwright-core 1.65, using scratch scripts that import `tests/helpers.mjs` and drive the app over http. The scratch scripts are not in the repo; the important parts are copied into each bug's **Reproduce** step. Timings come from an Apple-silicon Mac, so a phone will be slower. Anything I couldn't run is listed under "Unverified risks", not as a bug.

The baseline is healthy. `npm test` passes all 232 tests in 172 s. `npm run typecheck` is clean in 0.65 s (TypeScript 7).

## Short version

- **The split worked.** Imports run one way, there are no cycles, the pure layer (`logic/`) really is pure, and every bug from ARCHITECTURE.md (B1–B5) is fixed. Most TESTING.md recommendations have landed.
- **Three verified bugs remain, and they share one cause with the old B2 and B5.** Press state lives on DOM nodes that any re-render can replace, and the screen moves under a finger that's still tapping:
  - an extra tap on the mana strip spends another colour, clears the whole pool, or takes a life;
  - a Turn tap is lost when the row is redrawn during the press;
  - a hold keeps counting under a dialog that just opened.
- **The hot spot is still badge fitting.** On a busy six-player board, one tap on the mana strip forces 113 layouts. That costs 27–35 ms in Chromium and about 90 ms in WebKit, on a fast Mac.
- **Refactors worth doing, in this order:**
  1. a tiny `commit()` (save and redraw in one call);
  2. update the badge rows in place;
  3. skip the fit when nothing changed width, and measure once per resize.

  Split `styles.css` later, after the JS changes, as plain files. Skip `@scope`, nesting and a general "fewer setters" project.
- **TypeScript:** stay with JSDoc and `tsc --checkJs`. Turn on `strict` now, which costs nothing (0 new errors). Add `noImplicitAny` only for `logic/` and `state/` (42 errors).
- **Flutter or native:** stay with the web view. Section 7 lists what would change that.

---

## 0. What changed since the earlier reviews

| Earlier finding | Status now |
|---|---|
| ARCHITECTURE B1–B5 (press and turn bugs) | Fixed (`0823676`), with tests. |
| R1: state changes spread out | **Open.** 48 places change `game`, in 7 files. 24 call `saveGame()`, and 18 call `renderBadges()`. I found no drift bug today (§4.3), but nothing structural prevents one. |
| R2: badge rows rebuilt on every change | **Open.** Only the reminder chips are kept in place (`syncReminderChips`). This is the root of bugs D1 and D2 below. |
| R3: badge fitting is the hot spot | **Open, and the numbers are higher** now that the strip lives on the far edge: 113 forced layouts per strip tap (§4.1, P1). |
| R4: repeated measuring | **Open.** One viewport resize still runs `measureBoard` twice (ResizeObserver and `resize`). |
| R5: ordering assumptions in layout | Open, unchanged (§4.4). |
| R6: one global click window | Partly fixed: `bindTap` now refreshes the window on `pointerup`. The window is still global. |
| R7: accessibility gaps | **Open.** The near row is still `role="list"` with `<button>` children. "Me first" is still offered on tiles whose player is out. |
| R8: loose iOS bridge detection | **Open, verified again** (§4.1, D4). The "R8" in the guard-rails merge was Android's R8 shrinker, not this. |
| R9: no save-format version | Open. Only `identity` carries a version. |
| R11: SPEC §3.1 is stale | Open. SPEC.md line 156 still says `layoutBoard()` sets `--ui`. |
| TESTING 1–5 (contract tests, shared harness, pinned font, fake clock, CI split) | Done. `harness.test.mjs` enforces them. |
| TESTING 6 (unit tests for pure logic) | **Not done, and now unblocked.** `logic/save.js` and `logic/rules.js` import and run in plain Node; I checked. |
| TESTING 7–8 (a little visual regression, the design sweep in CI) | Not done. |
| MODERNIZATION do-now list | Done: JSDoc types, the compat lint, AGENTS.md, R8, the font subset, the renderer-gone handler, debug inspection, and the iOS 18 floor. |

---

## 1. Complexity map

The app is about 6,500 lines of web code: 3,838 in `web/js/`, plus app.js, dice.js, 1,991 lines of CSS and 330 of HTML. Add 540 lines of Kotlin and Swift, and 6,669 lines of tests. The complexity is not spread evenly. Two areas, layout and fitting, and the press lifecycle, hold most of the risk.

| Area | Where | Lines | Why it's hard | Risk |
|---|---|---|---|---|
| **Layout and fitting** | `layout/board.js` (`measureBoard`, `placePill`, `centreClearance`, `fitModeGrids`, `sizeMapSeats`), `layout/fit.js` (`fitBadgeRows`, `fitBadgeSide`, `fitStrips`, `placeReminders`), and most of `styles.css` | 224 + 359, about 900 CSS | One size for every tile, set by the smallest one. A pill that may not cover anything. Sideways faces that swap axes. Text measured in two engines with two fonts. All of it is imperative DOM measurement that mixes reads and writes. | **High.** The bugs this project has fought live here (FINAL-REVIEW.md). Well guarded by the size, centring and auto-drop tests in both engines and both styles. |
| **Auto-drop** | `fit.js` `dropSteps`, `fitBadgeSide` (about 80 lines), `fitStrips` (about 100 lines) | about 250 | A board-wide level per side, hysteresis (`dropSlack` 1.15), wrap-or-shrink chosen by measuring (`wrapFirst`), type shrunk 0.25 px at a time with a measure each step, four candidate places per strip, then near → far → strips → far again. Levels are module state that only `resetDrops` clears. | **High** for change, low for bugs today. It's the code most likely to break when the chips change, and the most expensive at runtime (P1). |
| **Pill placement** | `placePill`, `centreClearance`, `syncPill` (`render/pill.js`) | about 90 | The pill is placed for its widest state. It clears only the face edges it reaches, at the cheapest edge per tile. A change in button count re-measures the whole board (`pillShape`). | Medium. Its correctness depends on `syncPill` having run before `measureBoard` (R5). |
| **Board modes** | `actions/mode.js` (`setBoardMode`, `maybeAskFirst`, `chooseFirst`, `shuffleFirst`), `render/modes.js` | 159 + 305 | One mode variable with one writer, which is good. But opening a mode rebuilds every layer and every badge row, sets inert, changes focus and back handling, and may then start "Who goes first?". `askFirst` is a flag with three writers. | Medium. B3 lived here and is fixed. Transitions have no rules table, which is fine at eight modes. |
| **Edits and undo** | `actions/edits.js` (`commitEdit`, `undoEdit`, `showEdit`), `logic/rules.js` (`applyEdit`, `leavingTransfers`) | 118 + 60 | Each edit can carry designation transfers, which are undone last first. A handoff when someone goes out is added inside the same edit. Discard replays the stack backwards. | Low to medium. `applyEdit` is pure and could be unit-tested in Node today. |
| **Turns and handoffs** | `actions/turns.js`, `rules.js` (`nextTurn`, `previousTurn`, `heir`, `leavingTransfers`, `needsPassing`) | 92 + 100 | Play order is clockwise on screen. Out players are skipped. Rounds go up when play crosses the first seat. A hold steps back exactly through `turnSteps`, restoring emptied pools. CR 726.4 and 727.4 decide who inherits. | Medium. These are rules a tester can't eyeball, and today they're only reachable through a browser. Worth Node unit tests. |
| **Reminders** | `actions/reminders.js`, `fit.js` `placeReminders`/`restingBox` | 45 + 30 | Timers keyed by player and kind. Placement depends on the near edge's measured height. The entrance animation is cancelled with an `!important` inline transform while measuring. | Low. But each reminder's expiry redraws its tile's rows, which is how D2 happens. |
| **Press handling** | `ui/press.js` (`bindCounter`, `bindTap`, `bindSeat`, `bindStep`) | 244 | Four binders with tap-on-down, tap-on-up, hold-repeat and hold-once. Pointer capture, a shared `ignoreClicksUntil`, `activePresses` for cancelling, and keyboard clicks. Each press is a closure on one DOM node. | **High** for subtle bugs. Every verified bug in §4 involves a press and a re-render. |
| **Native bridges** | `state/platform.js`, `MainActivity.kt` (`GameBridge`, `assetPath`, back handling), `LifePodApp.swift` (`WebFolderSchemeHandler`, message handlers) | 109 + 319 + 221 | Synchronous Android reads against an iOS game injected at document start. Back handling registered on demand (API 33+). Two scheme handlers that must agree on MIME types. R8 shrinking. | Low. Small, well locked down, and guarded by `native.test.mjs` and `check-bridge.sh`. Device-only behaviour (back gesture timing, process death) is untested. |
| **Settings** | `sheets/settings.js`, `sheets/options.js`, `sheets/slider.js`, `layout/settings.js` | 219 + 233 + 95 + 65 | A pending new game (P1). The life field kept clear of the keyboard on both platforms. A flip for the far side of the table. Compact switch groups measured after layout. Every save-at-once setting decides by hand what to redraw. | Medium. `options.js` holds game logic (turn-mode rules, tracker handoffs) that belongs in `actions/` (§3). |

**Where the risk concentrates:** a change to what a chip shows touches badges.js, fit.js's `dropSteps` selectors and the CSS drop rules, and needs the auto-drop tests in both engines. A change to what a press does touches press.js, and today it can be undone by any code that redraws that row.

---

## 2. Maintainability refactors

Each refactor below is sized for one AI-assisted developer: S is under half a day, M is one to two days and L is several days. Every step keeps `npm run check` green and can ship on its own.

### 2.1 One place where state changes: a `commit()`

**Today.** Each action mutates `game`, then calls its own mix of `saveGame`, `renderScore`, `renderBadges`, `syncPill`, `measureBoard` and `requestFit`. `options.js` has its own `renderAllBadges`.

**Proposal: keep it explicit and synchronous, with no Proxy and no reactive store.** Put `commit(dirty)` in `actions/commit.js`. It can't live in `state/`, because it calls renderers, which sit above state. Each action mutates `game` inline as now, then calls `commit({ tiles: [i] | 'all', pill: true, layout: false })`. That one call saves, redraws those tiles' score and badges, syncs the pill, and measures if asked. Editing modes keep `showEdit`, which becomes a thin wrapper around `commit`.

| | |
|---|---|
| Benefit | No action can save without redrawing, or redraw without saving. A reviewer checks one call per action, not five. It's also the place to add batching later (one redraw per tile per burst) without touching any action. |
| Risk | Low, if `commit` stays synchronous at first, so no test sees a timing change. A later microtask version would change what `page.evaluate` sees right after an action, and the focus code in `showTurn` and `renderBadges` relies on a synchronous redraw. |
| Size | M. About 25 call sites. Migrate one action file per PR: `mana.js`, `reminders.js`, `turns.js`, `edits.js`, `board.js`, then `options.js`. |
| Verdict | **Do.** It's the cheapest structural fix for R1. |

### 2.2 Update badges and chips in place

**Today.** `renderBadges` (`render/badges.js:177`) builds every chip again, with new listeners, on every change: `far.replaceChildren`, `strip.replaceChildren` at line 205 and `near.replaceChildren` at line 235. `syncReminderChips` already shows the pattern that fixes it.

**Proposal.** Write a small keyed `syncChildren(row, items)` helper of about 40 lines. Each item has a key (`turn`, `flag`, `identity`, `poison`, `monarch`, `damage-2`, `spend-U`, `eraser`, `strip-chip`), a `create()` and an `update(node)`. Nodes with the same key are kept and updated, and the order is fixed with `insertBefore` only when it changes. Do the mana strip first (fixes D1 properly), then the turn chips (fixes D2), then the rest.

| | |
|---|---|
| Benefit | A press survives other players' changes (D1, D2, and the old B2/B5 for good). The focus-restoring code in `renderBadges` and `showTurn` can go. It also allows "skip the fit when no width changed" (2.3). |
| Risk | Medium. Fitting reads the DOM structure, and the drop selectors and CSS rules depend on chip classes. The auto-drop and size tests cover this well in both engines. |
| Size | M. About 150 lines changed in badges.js, plus the helper. |
| Verdict | **Do, right after 2.1.** It fixes real bugs, not just style. |

### 2.3 Batch measurement and skip fits that can't change anything

**Today.** Measuring and fitting forces a lot of layout work (P1):

- a strip tap on a busy board forces 113 layouts and 134 style recalcs;
- one resize runs `measureBoard` twice;
- inside `measureBoard`, each tile's `--clear-*` write (`layout/board.js:57`) is followed by the next tile's `offsetWidth` read (line 60), a forced layout per tile.

**Owner's idea: one rAF.** That coalesces the resize, orientation change, media query and ResizeObserver triggers into one measure per frame. But it has two costs:

- **Playwright's clock pauses `requestAnimationFrame`** (`tests/helpers.mjs` says so). Every `clock: true` test would then have to advance the clock before it could read the layout. That's a harness-wide change.
- It doesn't touch the 113 layouts, which are inside one fit.

**What I recommend instead, in three small steps:**

1. **Read, then write, inside `measureBoard`.** Collect every face's and tile's offsets first, then set all the properties. This is S and low risk.
2. **Skip a measure whose inputs haven't changed.** Key it on board width and height, player count, rotations, pill shape, badge size and gesture hints. The second trigger of a resize then costs nothing. No timing changes, so no test changes. This is S and low risk.
3. **Skip a fit whose rows haven't changed width.** Before fitting, compute each row's signature: its chip keys and their text with every digit replaced by `0`. If the signatures and the board size match the last fit, stop. Spending 3 → 2 doesn't change any width. Spending 1 → 0 removes a chip, so it fits as before. This is S to M, and safest after 2.2, when nodes are stable. Risk is medium: a missed signature input leaves a stale fit. The auto-drop tests would catch most of that.

Make `fitStrips` cheaper by measurement, not arithmetic. The current code measures deliberately, because the type doesn't shrink in proportion. Measure each strip's natural width once per level, not once per candidate place. That's M, and only worth it if step 3 isn't enough.

| | |
|---|---|
| Benefit | Strip taps drop from about 30/90 ms to near zero in the common case. A rotation does one measure, not up to four. |
| Verdict | **Do steps 1–3. Skip rAF batching** unless a device trace shows frames dropping during rotation. |

### 2.4 Fewer cross-module setters

**Today.** There are five setters:

- `setBadgeActions` and `setModeActions` (renderers given actions at boot);
- `setAskFirst`;
- `openBoardMode`;
- `resetDrops`.

**Assessment.** The two action injections are the right shape: dependency inversion with a typed contract, and the renderers never import upward. The weak spots are:

- `askFirst` logic sits in `sheets/options.js:129`. It reads `askFirst` and decides a new value, but that rule belongs to `actions/mode.js`. Move it into one function there, such as `turnsChanged(was, now)`.
- `badgeActions` and `modeActions` are `undefined` until app.js boots. A renderer called earlier would throw on the first tap. Today nothing renders before boot; a one-line guard or an assertion in `renderBoard` would make that explicit.

| | |
|---|---|
| Verdict | **Skip as a project.** Do the `askFirst` move inside 2.1, when `options.js`'s logic moves to `actions/`. |

### 2.5 Split `styles.css` by area

**Today.** It's one file of 1,991 lines, by far the largest file. Parallel agents editing it is the most likely merge conflict in this repo, and agents read it in chunks.

**Proposal.** Split it into about eight files, as plain `<link>`s in today's order: `tokens.css`, `palettes.css`, `base.css`, `board.css`, `tile.css`, `badges.css`, `modes.css` and `settings.css` (plus dice). Move the rules without changing them. Keep the trailing `@media (hover: hover)`, reduced-motion and max-height blocks **in their own last file**, rather than spreading them among the area files. That avoids the only real cascade risk: those blocks override earlier rules by coming later.

**Test plumbing the split needs.** Several tools read `styles.css` as one file:

- `helpers.mjs`: `stylesCss`, and the route that appends the test font to `/styles.css`;
- `font.test.mjs`, which finds the sheet by path;
- `palette`, `colours` and `style` tests;
- `scripts/mana-codepoints.mjs` and `subset-mana.mjs`;
- `design/polish/*.mjs`.

Give them one helper that lists the sheets in `index.html` order. Inject the test font with `page.addStyleTag` after load, or route the last sheet.

**Nesting and `@scope`.** Both are on the floor now (Safari 17.2+ and 17.4+, Chrome 120+ and 118+).

- **`@scope`: skip.** There's one `!important` in the whole file and no specificity war. Its proximity rules are unfamiliar to both people and agents.
- **Nesting: skip, or allow it only inside one component's state variants.** Nested selectors can't be found by grep. Agents and tests grep for selectors such as `.badges.near` and `data-drop~="name"`, and `&` brings `:is()` specificity.
- **`@layer`: skip.** Moving existing rules into layers changes which rule wins wherever a later, less specific rule beats an earlier one today.

| | |
|---|---|
| Benefit | Smaller files to read and review, and fewer conflicts. |
| Risk | Low to medium: cascade order. Run the full suite in both styles and both engines. The size and centring tests catch layout drift. |
| Size | S to M, including the test plumbing. |
| Verdict | **Do, but last**, after 2.1–2.3 settle, so the moves don't collide with the JS work. |

### 2.6 Order that keeps every step shippable

1. Fix D1–D4 (§4.1) with a regression test each. These are small and independent.
2. Turn on `strict` in `tsconfig.json`, and add Node unit tests for `logic/save.js` and `logic/rules.js` (§6). These are the safety net for the next steps.
3. `commit()`, one action file per PR (2.1). Move `options.js`'s game logic into `actions/` in the same pass.
4. Badge rows in place: strip first, then turn chips, then the rest (2.2).
5. Read-then-write in `measureBoard`, skip unchanged measures, skip unchanged fits (2.3).
6. Make `dice.js` a module and drop `window.lifePodDice` and its defer-order assumption (§3).
7. Split `styles.css` (2.5).

---

## 3. Module split review

**The boundaries and the direction are right.** I printed the import graph:

- every module imports only from its own folder or earlier ones;
- `actions/` imports among itself only one way (`board` and `turns` → `mode` → `mana` and `reminders`), with no cycles;
- `logic/` has no DOM and runs in Node.

`render/pill.js` → `layout/board.js` and `render/tile.js` → `layout/board.js` go from render to layout, which is allowed by the stated order.

**Leaky abstractions and functions in the wrong layer:**

1. **`layout/board.js` lays out the settings page.** `syncBoardTurn` calls `placeSettingsSections`, `syncSettingsCue` and `keepLifeEditorInView` (lines 24–32), so the board's layout imports the settings page's. Move those three calls to app.js's window listeners (or to `sheets/settings.js`'s own resize listener). Then `layout/board.js` knows only the board.
2. **`sheets/options.js` holds game rules.** The Turns choice (line 119: clears `turnSteps`, nulls `active`, decides `askFirst`), the tracker switches (line 216: computes who's out, hands designations on, re-measures) and the mana switch (line 136) are state changes with rules. Move them to `actions/turns.js` (`setTurnMode`), `actions/board.js` or a new `actions/tracking.js` (`setTracker`), and `actions/mana.js` (`setManaPool`). Then `options.js` only wires inputs. This also deletes its private `renderAllBadges`.
3. **`changeLife` is a closure inside `renderBoard`** (`actions/board.js:42`). The most important action in the app can't be called or tested on its own. Make it a top-level `changeLife(index, delta)` and bind it in `renderBoard`. Pass the score element for the pop animation, or look it up.
4. **`syncPill` measures the board** (`render/pill.js:43`). A renderer triggers layout as a side effect, which is the R5 ordering trap. With 2.3's "skip unchanged measures", `syncPill` can call `measureBoard()` unconditionally (it becomes cheap), or `commit` can do it.
5. **State is stored in DOM attributes and read back as logic:**
   - `chooseFirst` and `shuffleFirst` guard on `board.hasAttribute('data-picked'/'data-shuffling')`;
   - `fitBadgeRows` decides from `strip.hidden`;
   - `measureBadgeRoom` parses `--clear-*` back out of `player.style`.

   None is a bug today. Each one means a CSS or markup change can alter behaviour. Move `picked` and `shuffling` into `mode.js` variables. Leave the fit's reads, which are what fitting is.
6. **`state/state.js` `syncBackHandling` queries the DOM** (`dialog[open]`). That's small. The real issue is that every dialog opener must remember to call it (`settings.js:159`, `:210`, `dice.js:57`, `mode.js:142`). See D3's fix: one `showDialog(dialog)` helper in `ui/` or `state/` that cancels presses, shows the modal and syncs back handling.

**Hidden shared state** (module `let`s that aren't in `state/`):

| State | Where | Comment |
|---|---|---|
| `ignoreClicksUntil` | `ui/press.js:19` | Global by design: a press can redraw what's under the finger. With 2.2 it can become per-press. |
| `pillShape` | `render/pill.js` | Decides when to re-measure. Folds into 2.3's measure key. |
| `dropLevels`, `wrapFirst`, `fitQueued` | `layout/fit.js` | Hysteresis state. Fine where it is. `resetDrops` is called from four places: new game, badge size, `loadingdone` and app.js. |
| `selectedPlayerCount`, `selectedLife` | `sheets/settings.js` | Pending new game. Fine. |
| `askFirst`, `shuffleTimer` | `actions/mode.js` | See 2.4. |

**Init-order assumptions:**

- **`sheets/dice.js` reads `window.lifePodDice` at import.** That works only because the classic `defer` dice.js runs before the module app.js. Both are in the "after parsing" list in document order, but nothing checks it. Making dice.js a module removes the assumption. `tests/dice.test.mjs` would read the dice through `?debug`.
- **Listener order is load-bearing in two places:**
  - the sheets' `close` listeners must run before app.js's `maybeAskFirst` (documented in AGENTS.md, enforced only by import order);
  - the test harness's `loadingdone` stopper must be registered before app.js's listener (an init script).
- **`state/state.js` builds `game` at import** (`loadGame(readSavedGame, …)`). It needs the Android bridge or iOS's `initialGame` before any module evaluates. Both shells guarantee that. Note it in AGENTS.md, so nobody moves `loadGame` behind an async step.
- **`ui/dom.js` queries elements at import.** A missing id is cast to non-null and fails later, far from the cause. Consider a `required(selector)` helper that throws at import with the selector's name.

---

## 4. Bugs and brittleness

### 4.1 Verified bugs

All four reproduce in both Chromium and WebKit.

#### D1 — Medium: an extra tap on the mana strip spends another colour, clears the pool, or takes a life

- **Where.** `spendMana` (`actions/mana.js:25`) calls `renderBadges`, which rebuilds the strip (`render/badges.js:205`). When a colour reaches 0, its button disappears, and the next button slides into its place. When the pool empties, the whole strip disappears and the life half under it is exposed. Every strip button and the life buttons act on `pointerdown`, so the click-suppression window doesn't help.
- **Failure.** P1 taps their blue (3) four times, one more than needed, which is easy when tapping fast:

  | P1's pool (W U B R G C) | After 4 taps on blue |
  |---|---|
  | 0 3 0 0 0 0 | Pool empty, **and P1's life 40 → 39** |
  | 0 3 0 2 0 0 | **One red spent** (no undo for spending) |
  | 2 3 0 0 0 0 | **The eraser was hit: both whites gone** (Undo clear for 5 s) |

- **Reproduce.** `openPage(t, engine, { game: savedGame(4, { manaPool: true, pools: [[2,3,0,0,0,0], …zeros] }), url: '…?debug' })`. Take the centre of `.player:first-child .strip-spend[data-colour="U"]` and `page.touchscreen.tap(x, y)` four times there. Then read `lifePodDebug.game.pools[0]` and `.scores[0]`.
- **Fix.**
  - Keep the strip's slots stable during a burst. A colour that reaches 0 stays as a disabled "0" until about 800 ms after the tile's last strip tap, then the strip redraws. This falls out of 2.2's keyed update.
  - Also ignore `pointerdown` on that tile's life halves for the same window after a strip tap.
  - Add a test: four taps on a three-count colour change nothing else.

#### D2 — Low: a Turn tap is lost when its row is redrawn during the press

- **Where.** `bindStep` counts a tap on `pointerup` and refuses it if the chip is no longer connected (`ui/press.js:205`). That check was the right fix for B2. But any redraw of the tile's near row during a press replaces the chip, and the tap is silently dropped. Redraws come from:
  - a reminder expiring (`dismissReminder`);
  - "Undo clear" ending;
  - `renderPassHints` when someone else goes out while this player holds the monarch.
- **Failure.** Turn by turn, P1 is active and has the initiative, so "Initiative: venture into Undercity" shows for 3 s. P1 presses Turn at 2.95 s and lifts at 3.05 s. The turn doesn't pass. Control run without the reminder: it passes to P2.
- **Reproduce.** Seed `savedGame(4, { turns: 'turns', turn: { first: 0, active: 0, round: 1 }, counters: { initiative: true }, initiative: 0 })` with `clock: true` and `?debug`. Call `lifePodDebug.remind(0, 'initiative')`, then `clock.runFor(2950)`. Then `mouse.down()` on `.active-chip`, `runFor(100)`, `mouse.up()`. `game.turn.active` stays 0.
- **Fix.** Keep the turn chip's node across redraws, updating its text and label, as `syncReminderChips` already does for reminders. Then `isConnected` stays true and the press completes. Add the test above.

#### D3 — Low: a press keeps counting under a dialog that just opened, and Discard shows the wrong count

- **Where.** None of the dialog openers call `cancelPresses()`: `cancelEditing` (`actions/mode.js:130`), `openSettings`, the dice button, New game.
- **Failure.**
  - In counters mode, P1 holds their poison cell, which is removing one every 100 ms. Another player taps ✕ (or Android back): "Discard 10 changes?" opens, but the hold keeps removing under the modal. Poison went 6 → 2 in 400 ms, so there were 14 changes by the time anyone answered.
  - The same happens with a life hold when someone opens Settings or the dice: the total kept climbing (44 → 47) until the finger lifted.
  - Lifting does end the hold, so nothing runs away.
- **Reproduce.** Counters mode with poison on. Tap P1's poison cell 8 times. `mouse.down()` on it, `runFor(650)`, `evaluate(() => closeOpenDialog())`, `runFor(400)`. Compare `#discard-title` with `game.poison[0]`.
- **Fix.** One `showDialog(dialog)` helper that runs `cancelPresses()`, then `showModal()`, then `syncBackHandling()`. Use it for all four dialogs. It also removes a step every new dialog must remember (ARCHITECTURE §2.3, Android watch item 4).

#### D4 — Low: a WKWebView host with any message handler breaks saving (ARCHITECTURE R8, still open)

- **Where.** `state/platform.js:9`: `ios = window.webkit?.messageHandlers`. Then line 49 calls `ios.keepAwake.postMessage` and line 98 `ios.game.postMessage`, unguarded. `defaultStyle` already checks `ios?.game`.
- **Failure.** Load the web build in an in-app browser that registers some other handler. Every save throws `undefined is not an object (evaluating 'ios.game.postMessage')`, and nothing persists. Verified by defining `window.webkit = { messageHandlers: { other: … } }` before load.
- **Fix.** `export const ios = window.webkit?.messageHandlers?.game ? window.webkit.messageHandlers : undefined;`. Add a test with that stand-in.

#### P1 — Performance (verified, not a bug): one strip tap costs 113 layouts

These numbers come from a busy six-player board at 640 × 360: every counter on, every identity part shown, commander damage from everyone, and a pool on every tile.

| Action | Chromium | WebKit |
|---|---|---|
| Spend one mana from a strip | 27–35 ms, **113 forced layouts**, 134 style recalcs, 1 fit | about 90 ms |
| Life +1 (no badge change) | 0.6 ms, 2 layouts, no fit | 2 ms |
| Pass the turn from the chip | 5.7 ms, 8 layouts | 16 ms |
| Resize the viewport | `measureBoard` ran **twice**, 2 fits | twice, 2 fits |

The fit runs in a microtask inside the tap's task, so it delays the next paint by that much. A mid-range Android phone is several times slower than this Mac. 2.3 is the fix.

### 4.2 Checked and fine

These were on the list of things to look for. I checked each one and found no problem.

- **Font timing.** I delayed `mana.woff2` by 1.5 s and compared the drop tokens with an undelayed load: 4 sizes, 4 and 6 players, a busy board. Both engines came out the same. WebKit fired only `loading` and never `loadingdone`, which confirms why app.js also refits on `document.fonts.ready`.
- **Pixel ratio.** At DPR 1, 2.625 and 3, I checked 2–6 players at 952 × 427, 640 × 360 and 568 × 320. Both engines had no target under 44 px, no part outside its tile, no strip problem and no overflowing row. The tests run at DPR 1 only, and that's fine.
- **Odd window shapes.** 320 × 1000, 700 × 700, 1000 × 320, 390 × 844 and 500 × 1100 at DPR 2 showed no problems in either engine.
- **Saved-vs-shown drift.** I traced every mutation of `game` to its redraw. Every one that changes the pill or a badge redraws them, including auto-empty and step back, `endUndoClear`, and the turn-mode switch. I found no drift today. The risk is structural (2.1).
- **Measure–render loops.** The ResizeObserver on `#board` writes only properties that size its children. The settings observer toggles rows inside a scroller that doesn't resize. Neither loops.
- **Dialog stacking and back.** `closeOpenDialog` closes the last open dialog in document order. That matches the top layer today, because only `#restart` stacks, over `#settings`, and it comes later in index.html. Escape is ignored by the board while a dialog is open.
- **Timers.** Reminders, undo-clear, the shuffle and announcements are all cleared on a new game and on the switches that end them.
- **The old B1–B5.** All fixed, with tests.

### 4.3 Unverified risks

These follow from reading the code. I couldn't confirm them by running the app.

1. **`fitStrips` measures the total with `getBoundingClientRect` during its 160 ms pop (`scale(1.08)`).** A fit runs during the pop only when a life change puts someone out. That's ARCHITECTURE R5; still unprovoked.
2. **Back closes the last dialog in DOM order, not the top one.** A future dialog placed before `#settings` in index.html but opened over it would be closed second. Keep a stack in the `showDialog` helper (D3), or document the rule.
3. **The renderers' injected actions are `undefined` before boot.** Any future render before `setBadgeActions` would throw on the first tap.
4. **A real rotation can measure up to four times:** `orientationchange`, `resize`, the portrait media query and the ResizeObserver. Playwright showed two for a plain resize. 2.3's measure key makes the extras free.
5. **A life tap at rest that puts the monarch out hands it on, and tapping the life back doesn't return it.** That follows the rules (leaving the game is permanent), but a mis-tap at 1 life now needs a trip to counters mode. It's a design question, not a code bug.
6. **Rotate seats leaves the badge rows interactive.** The turn chips and strip are reachable by keyboard under the full-tile `.rotate-seat` buttons. Touch can't reach them.
7. **Android.** `configChanges` still lacks `uiMode`, `fontScale`, `density` and `keyboard`, so a dark-mode switch or a keyboard attach recreates the activity. The game survives, but an open mode's undo stack and the turn step-back buffer are lost.
8. **iOS.** `UISelectionFeedbackGenerator` is never `prepare()`d, so the first tick of a burst can lag.
9. **CSP.** It still lists `file:` in five directives. Nothing loads from `file://` any more, so it can come out.

### 4.4 Test brittleness that's left

The harness is in good shape. It enforces the fake clock, no own browsers and no copied colours (`harness.test.mjs`). What's left:

- **The tests take a font path production doesn't.**
  - `fontsReady` dispatches a synthetic `loadingdone` in both engines, and afterwards the harness stops trusted ones. So WebKit tests run `resetDrops()` on load, which WebKit production never does: it never fires `loadingdone`.
  - Chromium production can reset drops on a late `loadingdone` that the tests stop.
  - My late-font sweep showed no difference today. Add one test per engine that loads the page with the Mana font delayed and without `fontsReady`'s event, and checks the board is fitted. That tests the path phones take.
- **WebKit measures San Francisco from the runner's macOS.** A macOS image update can move SF's metrics. Most auto-drop tests find their thresholds by searching widths, which is robust. Expect the odd re-baseline when the image changes.
- **The suite's wall time is one test long.** The slowest test is `webkit: the near row drops names, then the symbol, then wraps…` at 50 s, followed by the 40 s pill matrices. Splitting that one test by player count would cut the WebKit job's critical path.
- **No fast layer yet.** Turn order, handoffs, `applyEdit` and `loadGame` are only tested through a browser reload (0.3–1 s each). Node unit tests would run in milliseconds (§6).
- **Two hidden contracts.** The design scripts rely on `?debug`'s `lifePodDebug = { game, remind }`, and my repro scripts did too. Adding to it is harmless. Renaming it breaks `design/polish/final-review.mjs` with no test failing.

---

## 5. Review checklist for every change

A short list to keep beside AGENTS.md. Each item names what to look at, not just what to think about.

**Invariants**

- [ ] Nothing new loads from a URL. There's no inline script, `style=` attribute, `<style>` block or `on…` attribute, and the CSP is unchanged.
- [ ] New JS or CSS features are on the floor (iOS 18.0, Chrome 129), or detected with a fallback. `npm run lint:compat` passes, with no new disable comments that lack a reason.
- [ ] Every new touch target is at least 44 px at 568 × 320. Type shrinks before a target does.

**State and saving**

- [ ] Every change to `game` is followed by a save and a redraw of everything that reads it: score, badges, pill, mode cells. With `commit()`, check that the `dirty` argument names the right tiles.
- [ ] A new `game` field is in the `Game` typedef, in `loadGame` with a fallback, and in `startGame`'s reset or keep list (SPEC §10.2).
- [ ] An old save still loads. If a field's meaning changed, there's a version and a migration, and a test that loads the old shape.
- [ ] Nothing new that should survive a relaunch is kept outside `game`. Nothing that shouldn't (undo stacks, timers) is put in it.

**Presses and redraws**

- [ ] A redraw doesn't replace a node a finger may be pressing: turn chips, strip buttons, cells. If it must, the press is ended on purpose.
- [ ] A new dialog or mode cancels presses, syncs Android back handling and closes with back and Escape.
- [ ] A new button that acts on `pointerdown` can't be hit by a tap meant for something that just moved away (D1).

**Layout**

- [ ] A change to what a chip shows updates `dropSteps` selectors, the `data-drop` CSS rules and the auto-drop tests together.
- [ ] A change that can change the pill's length or a face's size triggers a measure.
- [ ] No new interleaved style write and layout read in a loop over tiles.
- [ ] Both styles (Material and Glass), both engines, and 952 × 427, 640 × 360 and 568 × 320 at 2–6 players. The `sizes-*` and `centring` tests cover this; read their failures, don't loosen them.

**Native bridges**

- [ ] A new bridge method is in `types/globals.d.ts`, `androidMethods` or `iosMessages` in `tests/helpers.mjs`, and both wrappers. `check-bridge.sh` passes after an Android build.
- [ ] A new file type is in `MIME_TYPES` (Kotlin) and `mimeTypes` (Swift). `native.test.mjs` passes.
- [ ] Platform detection checks the specific handler or method, not just the object.

**Assets**

- [ ] A Mana code point added or removed: run `npm run font:subset`, and `font.test.mjs` passes.
- [ ] Icons are Phosphor or Mana with their licence lines intact.

**Tests**

- [ ] Every bug fix has a test that fails without it.
- [ ] Time comes from `page.clock`, colours from `token()`, targets from `tileProblems`.
- [ ] Run the targeted tests while iterating, then the full `npm run check` once before review.
- [ ] Mutation-check only rules that are behaviour-critical: who's out, play order, handoffs, `loadGame`.

**Docs**

- [ ] The README describes what players see. SPEC or SETTINGS-SPEC has an "as built" note if the build differs. AGENTS.md's Modules section matches any moved file.

---

## 6. TypeScript

**Today** the project uses JSDoc plus `tsc --checkJs --noEmit` (TypeScript 7, 0.65 s), with `strictNullChecks` on, `noImplicitAny` off, and no build step. Types sit next to their code (`Game`, `BoardMode`, `Edit`), and the bridges live in `types/globals.d.ts`.

**Is that "TypeScript where it makes sense"? Yes.**

- **What a `.ts` move would add.** Nicer syntax for types: interfaces inline, `satisfies`, enums (don't), and generics without `@template`. The checker is the same.
- **What it would cost, in this repo:**
  - **The shipped folder stops being the source.** Android packs `web/` straight into the APK (`aapt2 -A ../web`), iOS copies it as a folder reference, and CI zips it. Each would need an output folder, a build before packaging, and a rule that nobody edits the output.
  - **Every test run needs a build first,** or `tests/server.mjs` transpiles `.ts` on request. That's possible, but then the tests and the apps run different pipelines.
  - **Web Inspector shows compiled code** unless source maps ship. They'd have to stay out of the release bundles.
  - **An AI agent edits a `.ts` file as easily as a JSDoc file,** so tooling skill doesn't decide this. What matters is what a mistake costs. A forgotten build step ships stale JS. A forgotten JSDoc type just reads as `any`.
- **Type-stripping options don't change that.** `--erasableSyntaxOnly` with a blank-space stripper would keep line numbers, but it's still a build step in front of three packagers.

**Recommendation: keep JSDoc. Tighten where it's free or where the risk is.** I measured each option:

| Option | New errors | Cost | Do it? |
|---|---|---|---|
| `strict: true` with `noImplicitAny: false` (adds `strictFunctionTypes`, `strictBindCallApply`, `noImplicitThis`, `useUnknownInCatchVariables`, `alwaysStrict`) | **0** | One line | **Yes, now.** |
| `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch` | **0** | Four lines | Yes, now. They keep it at 0. |
| `noImplicitAny` everywhere | **358**: 216 untyped parameters (TS7006), 40 string indexes such as `game[kind]` (TS7053), 54 untyped `let`s (TS7005/7034), and others. Worst files: press.js 49, fit.js 42, layout/board.js 41, slider.js 28, rules.js 26, dice.js 25. | About a day of mechanical `@param` lines, and more comment weight in DOM code where the types say little. | **No.** |
| `noImplicitAny` for `logic/` and `state/` only, through a second `tsconfig.strict.json` that `npm run typecheck` also runs | **42** | One to two hours | **Yes.** The save format and the rules are where a wrong type loses a game. |
| `noUncheckedIndexedAccess` | 71 | Noisy: every `game.scores[i]` becomes `number \| undefined` | No. |

Pair it with what types can't do: **Node unit tests for `logic/`**. `loadGame` against malformed saves (property tests suit it), `nextTurn` and `previousTurn` against every count and out-set, `leavingTransfers` and `heir` against the CR cases, and `applyEdit` forwards and back. They need no browser. I checked that the modules import in plain Node. Node prints a harmless typeless-module warning. Silence it by adding `"type": "module"` to `package.json`, but first check that the `.js` scripts under `design/` still run, since that setting changes how Node reads them. That's about half a day.

---

## 7. Flutter, native, or the web view

**What the app is:**

- one landscape board of 2–6 tiles;
- a full-screen settings page and a dice sheet;
- about 6,500 lines of web code and 540 lines of native wrapper;
- a 140 KB debug APK.

Its hard problems are layout (one size per board, fitting text in two engines), multi-touch press semantics, and seats fixed to the device as it rotates. Its platform needs are four: storage, keep-awake, haptics and back. They take five Android bridge methods and three iOS messages.

**What each option would mean:**

| | Web view (today) | Flutter | Compose + SwiftUI |
|---|---|---|---|
| Code to write | 0 | A full rewrite: the UI, layout and fitting, presses, settings, dice, about 6,500 lines, and the 232 Playwright tests become widget and golden tests | Two full rewrites |
| Rendering engines to support | Two (WebKit, Chromium). That's the source of most measuring work. | One (Impeller), the same on both platforms | Two native toolkits |
| App size | 140 KB debug APK | Typically several MB per ABI (not measured here) | Compose typically 1–3 MB with R8 (not measured); SwiftUI small |
| Platform features | Through small bridges | Plugins, or platform channels | Direct |
| Test story | Playwright in both engines, fast to write | Widget and golden tests, one engine | XCUITest and Espresso, slow and device-bound |

**Recommendation now: stay with the web view.** The app isn't expected to grow much. The wrappers are small and rarely change. A rewrite buys one rendering engine and gives up a working, well-tested app. The two-engine cost is real but already paid: the tests run both engines, and the compat lint guards the floor.

**When to revisit.** Any one of these is a reason to look again. Two together are a reason to plan a move.

1. **A core feature needs a native surface that a bridge can't carry.** Bridges are cheap for:
   - iOS widgets and Live Activities (a lock-screen life total);
   - Android widgets;
   - Watch and Wear OS companions;
   - sync between two phones (Multipeer, Nearby).

   Add these **natively beside the web view** first. Revisit only when the native code passes about 1,500 lines, or the bridge passes about 12 methods, and keeping the two halves in step is a weekly cost. Even then, consider native for the new surface and keep the board in the web view.
2. **Speed on a low-end reference device, after 2.3.**
   - The device: a current low-end Android with WebView 129 or later, a Moto G or Galaxy A0x class phone.
   - The threshold: tap-to-paint p95 over 100 ms, a rotation that takes over 250 ms to settle, or cold start to first board over 1.5 s.
   - Measure with a `chrome://inspect` trace. Optimize the fit first. Only a failure after that counts.
3. **An accessibility gap the web view can't close.** For example:
   - VoiceOver or TalkBack can't reach or operate a control;
   - you need custom rotor actions;
   - a store or audit requires system text size and you can't honour it in CSS.

   Check first: most of this is fixable in HTML and ARIA.
4. **Store policy.** Apple rejects the app under guideline 4.2 (minimum functionality, "a repackaged website"), or Google changes WebView or asset-loader rules for apps. Neither applies today: the app is offline, bundled and uses native haptics and keep-awake. A rejection would be a hard signal.
5. **Haptics or audio beyond a tick:**
   - Core Haptics patterns and Android vibration compositions fit a bridge;
   - sound effects fit Web Audio.

   Revisit only for something like sub-20 ms audio sync to a timer.
6. **Engine-specific bugs become a regular cost.** For example, more than two a quarter that need a WebKit- or Chromium-only workaround in layout, or a new WebView floor raise forced by a bug rather than a feature.
7. **The product changes shape.** Multiple screens with navigation, offline accounts, or a desktop app. Each makes the web view's "one page" advantage smaller, and Flutter's single engine more valuable.

If a move ever happens, Flutter fits better than two native apps for a solo developer: one codebase, one engine, and a layout model (constraints down, sizes up) that would make the fitting code simpler. Compose plus SwiftUI makes sense only if native surfaces dominate the app.

---

## 8. Priorities

Effort is for one AI-assisted developer, including tests.

### Must

| # | What | Why | Effort |
|---|---|---|---|
| 1 | **D1**: stable strip slots during a burst, and a short tap shield over the life halves after a strip tap | An extra tap spends another colour (no undo), clears the pool, or takes a life | S (half a day). The full fix comes with 2.2. |
| 2 | **D3**: one `showDialog()` that cancels presses and syncs back handling, used by all four dialogs | Presses run on under modals, and each new dialog repeats three steps | S (2 hours) |
| 3 | **D4**: detect iOS by the `game` handler | Saving throws in any other WKWebView host | S (30 minutes) |
| 4 | `strict` plus the `noUnused*` flags in `tsconfig.json` | Free: 0 new errors | S (15 minutes) |

### Should

| # | What | Why | Effort |
|---|---|---|---|
| 5 | Node unit tests for `logic/save.js` and `logic/rules.js`, and `noImplicitAny` for `logic/` and `state/` | The rules and the save format are the riskiest contracts. The tests run in milliseconds. | M (1 day) |
| 6 | `commit()`, one action file per PR, moving `options.js`'s game logic into `actions/` | Removes the save and redraw drift class (R1) | M (1–2 days) |
| 7 | Badge rows updated in place, strip first, then turn chips (fixes **D2**) | Presses survive redraws, and focus code goes | M (1–2 days) |
| 8 | Read-then-write in `measureBoard`, skip unchanged measures, skip unchanged fits | P1: 113 layouts per strip tap, two measures per resize | M (1 day) |
| 9 | Move the settings layout out of `layout/board.js`, and make `changeLife` a top-level action | Wrong-layer code | S (2 hours) |
| 10 | A late-font test per engine without the harness's synthetic `loadingdone` | The tests take a font path phones don't | S (2 hours) |

### Nice

| # | What | Why | Effort |
|---|---|---|---|
| 11 | Split `styles.css` into plain files in today's order, with the shared test helper. No `@scope`, nesting or layers. | Fewer merge conflicts for parallel agents | S–M (half a day to a day) |
| 12 | Make `dice.js` a module, and drop `window.lifePodDice` | Removes a defer-order assumption | S (2 hours) |
| 13 | Near row `role="group"` or list items around buttons; no "Me first" on out tiles; drop `file:` from the CSP | Leftovers from R7 and from module plumbing | S (1 hour) |
| 14 | Split the 50 s WebKit auto-drop test by player count | It sets the WebKit job's wall time | S (1 hour) |
| 15 | Save-format `version: 1` (R9); prepare the iOS haptics generator; add `uiMode` and `fontScale` to Android `configChanges` | Cheap insurance | S (2 hours) |
| 16 | Update SPEC §3.1's "How", and add the checklist in §5 next to AGENTS.md | Docs match the code | S (1 hour) |
