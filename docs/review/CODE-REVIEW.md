# LifePod module split: code review

Reviewed on 23 November 2026. The range is `a5005c5..ac0e0b8`, the 27 commits that turned the classic script `web/app.js` into ES modules under `web/js/`. I didn't change any code or commit anything.

**How this was checked.** The `code-review` skill ran at high effort on the range. Two cleanup passes followed: reuse and simplification, then efficiency and altitude. Every bug below was reproduced with playwright-core 1.65. Each repro ran against `web/` at `ac0e0b8` and against an export of `web/` at `a5005c5`, served the same way through `design/serve.mjs`. The scratch scripts aren't in the repo. Each bug's **Evidence** step gives the important parts. Anything I couldn't run is listed under Risks.

This review doesn't repeat `docs/review/DEEP-DIVE.md`: D1–D4, P1, the refactors in §2 and the layering list in §3. Where a finding overlaps, it points there.

## Short version

- **The app itself came through the split intact.** I found no correctness bug in `web/`. I checked the areas most likely to break:
  - **Listener order.** I recorded every `addEventListener` made during load, before and after the split. The order per target is identical, including each dialog's own `close` listener running before `maybeAskFirst`.
  - **Strict mode.** The old file already started with `'use strict'`, so `this` and strict mode are unchanged.
  - **Live bindings.** Importers read every `let` live, and only the declaring module assigns one. The import-time snapshots (`selectedPlayerCount`, `selectedLife`) were snapshots in the old file too, and `openSettings` resets them.
  - **Native bridges.** The shells call only `closeOpenDialog` and `setReduceTransparency`, and both are still on `window`. `initialGame` and `initialReduceTransparency` are injected at document start, before any module runs.
- **One real bug, outside `web/`: six design scripts now throw a `ReferenceError`.** They call the app's functions as page globals, and a module's names aren't globals. Only `final-review.mjs` was moved to `?debug`. AGENTS.md says the design scripts all go through `?debug`, but six don't.
- **Cleanups worth doing:**
  - one `renderOptions()` in place of options.js's seven exports;
  - a lint rule that enforces the one-way imports AGENTS.md describes;
  - drop `?debug` for `await import()` in `page.evaluate`;
  - one shared http server for the tests, design and store scripts;
  - a handful of repeated helpers in `fit.js`, `press.js` and `modes.js`.

---

## Bugs

Numbered S1, S2 (for "split") so they don't collide with ARCHITECTURE.md's B1–B5 or DEEP-DIVE.md's D1–D4.

### S1 — Medium (tooling): six design scripts throw `ReferenceError`, because they call module-scoped names as page globals

- **Where.**

  | Script | Line | What it calls |
  |---|---|---|
  | `design/polish/glass.mjs` | 42–43 | `setBoardMode` |
  | `design/polish/style7.mjs` | 169 | `setBoardMode` |
  | `design/polish/tiles-render.mjs` | 36 | `setBoardMode` |
  | `design/polish/render.mjs` | 59, 83, 89, 96, 151, 217, 221, 231, 425 | `renderBadges`, `element`, `icon`, `board` |
  | `design/polish/spec.mjs` | 154, 348–354 | `renderBadges`, `syncIdentity`, `game` |
  | `design/counters/r4.mjs` | 69–78 | `syncSwatches`, `syncAllSwatches`, `element`, `game` |

  Under the classic script, every top-level `function` was a `window` property, and every top-level `const` and `let` was a global lexical binding, so `page.evaluate("setBoardMode('counters')")` worked. Under modules, none of them reach the global scope. The split moved only `final-review.mjs` to `window.lifePodDebug` (`design/polish/final-review.mjs:157-161`).
- **A second failure mode, which doesn't throw.** `render.mjs:92` and `r4.mjs:70` wrap an app function by assigning `window.syncIdentity` or `window.syncSwatches`. The classic app called those through the global, so the wrapper took effect. The modules call their own binding, so a wrapper on `window` is never called, even after the ReferenceError is fixed.
- **Evidence.** A scratch script opened the app through the real `design/polish/lib.mjs` `open()` and evaluated each script's injected snippet:

  | Snippet (from) | `a5005c5` (classic) | `ac0e0b8` (modules) |
  |---|---|---|
  | `setBoardMode('counters')` (glass.mjs:42, style7.mjs:169) | ok | `ReferenceError: setBoardMode is not defined` |
  | `setBoardMode('colours')` (tiles-render.mjs:36) | ok | `ReferenceError: setBoardMode is not defined` |
  | `[...board.children].forEach((p, i) => renderBadges(i))` (render.mjs:96) | ok | `ReferenceError: renderBadges is not defined` |
  | `element('button', '', icon('plus'))` (render.mjs:231) | ok | `ReferenceError: element is not defined` |
  | `syncIdentity()` (spec.mjs:354) | ok | `ReferenceError: syncIdentity is not defined` |
  | `syncAllSwatches()` (r4.mjs:78) | ok | `ReferenceError: syncAllSwatches is not defined` |

- **Why nothing caught it.** No test runs the design scripts. `lib.mjs` collects page errors only into its own `errors` list, and `page.evaluate` rejects before that list matters.
- **Fix.**
  1. In each script, reach the page's own module instances with a dynamic import inside `page.evaluate`. I checked this in Chromium and WebKit under the page's real CSP: it returns the same instances the page uses (`game === lifePodDebug.game` is true), `setBoardMode('counters')` opens the mode, and there are no errors.

     ```js
     await page.evaluate(async () => {
       const { setBoardMode } = await import('/js/actions/mode.js');
       setBoardMode('counters');
     });
     ```

     For the string snippets, put the imports in front, e.g. `const { renderBadges } = await import('/js/render/badges.js'); const { board } = await import('/js/ui/dom.js'); …`, and wrap it in an async function.
  2. The two wrapping mock-ups (`render.mjs:92`, `r4.mjs:70`) can't patch a module binding from outside. Do the extra work after the real call instead (call `syncIdentity()`, then rename the shown names), or drop those strips if the design question they answered is closed.
  3. Add one cheap guard: a `node:` test that runs each design script's injected snippets against a page, or one Chromium test that evaluates every snippet string the design scripts export. Without it, the next rename breaks them silently. DEEP-DIVE §4.4 ("Two hidden contracts") already flags the `?debug` half of this.

### S2 — Low (docs): AGENTS.md and lib.mjs describe the design scripts' contract wrongly

- **`AGENTS.md:34`.** It says "the design scripts reach a few internals through `?debug` (`window.lifePodDebug`)". Only `final-review.mjs` does. Six others call bare names (S1). Someone renaming an export would trust this line and break them. **Fix:** after S1, say "the design scripts import the modules they drive inside `page.evaluate` (`await import('/js/…')`)", and drop the `?debug` mention if cleanup C3 lands.
- **`design/polish/lib.mjs:7` and `design/polish/GLASS.md:8`.** These say `LIFEPOD_APP` points at "another copy of web/". But `design/serve.mjs:9` takes `dirname(LIFEPOD_APP)`, so it expects the path of `index.html`, as `serve.mjs:2` says. **Evidence:** `LIFEPOD_APP=<export>/web node …` serves the export's parent folder. `/index.html` returns 404, and `open()` waits 30 s for `#board .player`, then times out. `LIFEPOD_APP=<export>/web/index.html` works. **Fix:** accept either form in `serveApp`: use the path if it's a folder, or its `dirname` if it ends in `.html`. Then make the two comments say "a copy of web/ (the folder, or its index.html)".

---

## Risks (not verified)

### R1 — iOS cold launch now loads 31 files on the main thread

- **Where.** `ios/LifePodApp.swift:177-191`. `WebFolderSchemeHandler` answers each request on the main thread with a synchronous `Data(contentsOf:)`. A launch made 5 requests before the split and makes 31 now.
- **What I measured.** Median DOMContentLoaded on localhost (Apple-silicon Mac, Playwright, from the efficiency pass):

  | Engine | Classic script | Modules | Modules + `modulepreload` for all 26 |
  |---|---|---|---|
  | Chromium | 23 ms | 30 ms | 24 ms |
  | WebKit | 30 ms | 52 ms | 48 ms |

  WebKit's cost is per module, not per round trip, so `modulepreload` barely helps there.
- **Not verified.** I didn't measure device launch time. A phone's flash reads and the main-thread handler could add to this.
- **What to do.** Time a cold launch to first board on a real iPhone. Do something only if the modules add more than about 50 ms. Then, in order of preference:
  1. read the file off the main thread in the handler;
  2. bundle the modules into one file at app build time, as a last resort, since it adds a build step (DEEP-DIVE §6).

  Don't add a hand-kept `modulepreload` list.

### R2 — Nothing enforces the one-way import order

- **Where.** `eslint.config.mjs:6-17`. AGENTS.md's "Modules" section states two rules: imports go one way, from `logic/` through `sheets/`, and modules stay under about 500 lines. Nothing checks either. The graph is clean today: 27 modules, no cycles, no upward imports (DEEP-DIVE §3 checked this too).
- **The risk.** The first upward import or cycle lands without a warning. A cycle between modules with top-level side effects, such as `ui/dom.js`'s queries or `state/state.js`'s `loadGame`, can fail as a TDZ `ReferenceError` at load. Today's order makes that impossible.
- **Fix.** About 15 lines of config, with no plugin:
  - one `files: ['web/js/<folder>/**']` block per folder, with core `no-restricted-imports` `patterns` naming the later folders;
  - `max-lines: ['error', { max: 500, skipComments: true }]` for `web/js/**`.

### R3 — The design scripts have no test

This is S1's root cause, and it outlasts the fix. Any rename in `web/js/` can break a design script with no failure in `npm run check`. See S1, fix 3.

---

## Cleanups

None of these changes behaviour. They're ranked by value, and each names the cheaper form. "[split]" marks what the split introduced. The rest came over from the old app.js unchanged, but the split makes it cheap to fix now. **Dead code: none.** All 208 exports in `web/app.js` and `web/js/**` have an importer, and no import goes unused.

### C1 — [split] options.js exports seven names that only `openSettings` uses

- **Where.** Six `render*` functions and `wakeInput`, at `web/js/sheets/options.js:27, 37, 70, 93, 102, 151, 176`. They're used only at `web/js/sheets/settings.js:13-16` and `:148-157`, which also sets `wakeInput.checked`, though the switch's listener is in options.js.
- **Cost.** Every new save-at-once section adds an export, an import and a call. Keep awake is synced in a different file from where it's wired.
- **Fix.** options.js exports one `renderOptions()`, which runs the six renders and sets `wakeInput.checked = game.keepAwake`. settings.js calls it once. This fits with DEEP-DIVE §3.2, which moves the rules out of options.js: do both in the same pass.

### C2 — [split] `syncWakeLock(keepAwake)` takes a getter only because platform.js can't import state.js

- **Where.** `web/js/state/platform.js:42-43`. All three callers pass the same `() => game.keepAwake`: `web/app.js:83`, `web/app.js:119` and `web/js/sheets/options.js:213`.
- **Fix.** Add a no-argument `syncWakeLock()` in `state/state.js` that calls the platform one with `game.keepAwake`. The callers then import that.

### C3 — [split] `?debug` puts a test-only global in the shipped page

- **Where.** `web/app.js:108`, `types/globals.d.ts:76`, and its one user, `design/polish/final-review.mjs:28-29, 157-161`.
- **Fix.** Use S1's `await import('/js/state/state.js')` and `await import('/js/actions/reminders.js')` in `final-review.mjs`. Then delete the hook, its type and the `?debug` suffix. That gives every design script one way in, and DEEP-DIVE §4.4's hidden `?debug` contract goes away.

### C4 — `loadGame(read, angle)` handles a platform failure in `logic/`

- **Where.** `web/js/logic/save.js:217, 227-228`, called at `web/js/state/state.js:13`. `loadGame` takes a reader function so that its `try` also catches `localStorage` throwing.
- **Fix.** Put a `try`/`catch` in `readSavedGame` (`web/js/state/platform.js:92-94`), as `writeSavedGame` already has. Then `loadGame` takes the snapshot string, `loadGame(snapshot, angle)`. DEEP-DIVE §6 plans Node unit tests for `save.js`. With this change they pass a string, not a function.

### C5 — [split] One http server for tests, design and store

- **Where.**
  - `design/serve.mjs:8-10` wraps `tests/server.mjs` in 3 lines.
  - `store/render.mjs:5` imports it from `design/`, but `scripts/preview.mjs` imports `tests/server.mjs` directly.
  - `design/serve.mjs:10` returns an `origin` that no caller reads.
  - Three older scripts hand-roll unchecked `readFile` servers: `design/dice/render.mjs:12-19`, `design/counters/measure.mjs:9-13` and `design/counters/render.mjs:13-20`.
- **Cost.** Five places that have to agree on MIME types and path safety.
- **Fix.**
  - Move `startServer` and `serveApp` (with S2's `LIFEPOD_APP` handling) to `scripts/serve.mjs`.
  - Leave only `globalSetup` in `tests/server.mjs`, and delete `design/serve.mjs`.
  - Replace the three hand-rolled servers with `startServer({ web })`.
  - Drop `origin` from `serveApp`'s result.

### C6 — Compact-switch fitting is always called as a pair

- **Where.** `compactGroups.forEach(fitCompactSwitches)` appears at `web/app.js:96` and `:103`, and at `web/js/sheets/options.js:98` and `:112`. Those are the only uses of the two exports at `web/js/layout/settings.js:18-19`.
- **Fix.** Export `fitAllCompactSwitches()` from `layout/settings.js`, and stop exporting the two parts.

### C7 — [split] Ambiguous export names

- `shownReminders`, not `reminders`. `state/state.js:38` is a Map of timers, and it sits next to `game.reminders` (the Reminders switches) and the module `actions/reminders.js`. `actions/reminders.js:24-25` reads both within two lines.
- `settingsDialog`, not `settings`. `layout/settings.js:5` is the `<dialog>`, and its siblings are `diceDialog` and `discardDialog`. It's imported by `layout/board.js`, `sheets/settings.js` and `sheets/slider.js`.

### C8 — layout/fit.js repeats itself

- The visible-blockers list is built four times, at `web/js/layout/fit.js:82` (as a selector), `120-121`, `268` and `344-345`. **Fix:** `faceBlockers(face, extra)`.
- `[...row.children].filter(chip => chip.offsetWidth)` appears four times (`127`, `135`, `159`, `166`). **Fix:** `shownChips(row)`.
- The column-gap read appears twice (`139`, `160`). **Fix:** `rowGap(row)`.
- The "fewest steps, then undo a step only when there's slack" loop is written twice (`200-214`, `312-324`). **Fix:** `settleLevel(needed, current, keeps)`.

Do this with DEEP-DIVE §2.3, which touches the same functions.

### C9 — ui/press.js repeats its plumbing

- `ignoreClicksUntil = performance.now() + 800` appears eight times: `web/js/ui/press.js:61, 81, 103, 111, 156, 176, 213, 234`.
- The click guard appears four times (`89`, `116`, `183`, `242`), the left-the-tile test twice (`73-77`, `168-172`), and the press object's `end()` three times.
- The 500 ms and 100 ms repeat timings are literals (`56`, `63`, `151`, `157`), though `holdDelay` (500) is already named in `logic/data.js`.
- **Fix.**
  - Add `skipClicks()`, `clickCounts(event)` and `leftTile(button, event)` helpers.
  - Use `holdDelay`, and add `repeatInterval = 100` to `data.js`.

### C10 — The mode-layer and badge builders repeat themselves

- A cell, a visually hidden remove button and `bindSeat` are built three times: `web/js/render/modes.js:50-57, 182-189, 284-291`. **Fix:** `steppedCell()`, which returns `[cell, remove]`.
- The layer hint is built three times (`modes.js:229, 239, 274`). **Fix:** `layerHint(words)`, which `gestureHint` then wraps.
- The pip span is built four times: `modes.js:142, 281` and `render/badges.js:112, 141`. **Fix:** `pip(colourId)` in `render/tile.js`, whose header says it holds the pieces both badges and modes draw.
- `element('button', …)` followed by `.type = 'button'` appears 19 times. `modes.js:91, 97` and `sheets/dice.js:46` skip `element()` and call `document.createElement`. **Fix:** `button(className, ...children)` in `ui/dom.js`.
- The `aria-pressed` loop over a choice group appears eight times: `options.js:42, 71, 94, 103, 178-180`, `settings.js:82, 83` and `dice.js:27`. **Fix:** `syncPressed(group, isPressed)` in `ui/dom.js`.

### C11 — Mana-pool logic is repeated across modules

- The `held` list is built in `web/js/logic/rules.js:283` and `web/js/render/badges.js:139`. **Fix:** `heldMana(game, index)` in rules.js.
- A pool is refilled with `Math.min(maxCount, … + amount)` in `web/js/actions/mana.js:54-56` and `web/js/actions/turns.js:78-80`. **Fix:** `refillPool(index, amounts)` in mana.js, which turns.js already imports.
- `game.pools.some((_, index) => hasMana(game, index))` appears in `render/pill.js:40` and `actions/mana.js:18`. **Fix:** `anyMana(game)` in rules.js.
- `actions/board.js:99-100` clears the `clearedPools` timers by hand. **Fix:** `clearUndoClears()` in mana.js, to match `clearReminders`.

### C12 — Designation transfers are applied in three places

- **Where.** `game[transfer.kind] = transfer.to` is written out in `web/js/actions/board.js:25` and `web/js/actions/edits.js:79`, and `applyEdit` has its own loop at `web/js/logic/rules.js:256`.
- **Fix.** Export `applyTransfers(game, transfers, direction)` from rules.js, and use it in all three places.

### C13 — `renderModeLayer(player, index)` rebuilds every identity preview once per tile

- **Where.** `web/js/render/modes.js:235, 262`, called per tile from `web/js/actions/mode.js:102-107`. Each call runs `syncIdentity()`, which walks every tile. With 6 players, one mode change rebuilds the previews 36 times.
- **Fix.** Make it `renderModeLayer(index)` (the `player` argument can be derived from `index`), and call `syncIdentity()` once, after the loop in `setBoardMode`.

### C14 — Smaller repeats

- **The pill's buttons.** `.pill-button` is queried three times per measure (`web/js/layout/board.js:48, 79`, `render/pill.js:42`). **Fix:** export `shownPillButtons()` from `layout/board.js`, and pass `measureBoard`'s list into `placePill`.
- **Seat strings.** They're parsed three times (`rules.js:45`, `layout/board.js:88, 215-216`). **Fix:** add `parseSeat(seat)` to rules.js. `placePill` can use `seatGrid().areas` instead.
- **The dialog query.** `dialog[open]` is queried four times (`app.js:66, 76`, `actions/mode.js:36`, `state/state.js:48`). **Fix:** `topDialog()` in `state.js`. It goes naturally with DEEP-DIVE's `showDialog` (D3).
- **Slider bounds.** They're hard-coded: `options.js:64` (3), `options.js:87` (2) and `settings.js:62` (2..6). **Fix:** derive them from `tileSetOrder`, `badgeSizeOrder` and `playerCounts`.
- **The apply-settings sequence.** It's written twice, at `settings.js:190-192` and `200-202`. **Fix:** `applySettings()`.
- **Small things in badges.js.**
  - `foldedChip` at `188` and `floating` at `204` compute the same condition; compute it once.
  - The `role=listitem` branch at `94` is redone for every chip at `232`; drop it.
  - The "Undo clear" label and handler are written twice (`103-106`, `134-136`).
- **Tile colouring.** The colour/row dataset pair is written three times (`tile.js:17-18, 23-24, 30-31`). **Fix:** `colourAs(node, player)`.
- **Life text.** `String(n).replace('-', '−')` appears at `tile.js:115` and `modes.js:81`. **Fix:** `lifeText(n)`.
- **`data-lit`.** Its loop is written twice (`actions/mode.js:51, 85`). **Fix:** `lightSeat(seat)`.
- **The tight-size test.** `width < 240 || height < 200` is computed twice (`layout/board.js:67-71`). **Fix:** compute it once.
- **The announce delay.** 700 ms is inline at `render/announce.js:28`, though the split moved the other timings to `logic/data.js`, and `tests/monarch.test.mjs:9` says it's there. **Fix:** `export const announceDelay = 700`.

### C15 — [split] Leftovers in tests, scripts and comments

- **Two script walks.** Two walks list "every script in web/", with different filters:
  - `tests/native.test.mjs:16-17` matches only `.js` and doesn't normalise `\`;
  - `scripts/mana-codepoints.mjs:9-11` matches `/\.m?js$/` and normalises it.

  **Fix:** export one `webScripts()` from `mana-codepoints.mjs`, which `font.test.mjs` already imports. Rename `appJs` in `native.test.mjs`, since it now holds every script.
- **The `file://` check.** The "draws nothing from file://" half of `checkModules` (`tests/harness.test.mjs:89-91`) is the only user of `appFile` (`tests/helpers.mjs:41-42`), and it costs two page loads a run. It tests a browser rule. `tests/native.test.mjs:64` (no `loadFileURL`) already guards the apps. **Fix:** delete both, or keep them knowingly as documentation. The CSP's `file:` sources are DEEP-DIVE §4.3.9 and priority 13.
- **A no-op call.** `design/polish/lib.mjs:71` calls `window.fitAllBadges?.()`. That function existed in neither version. **Fix:** delete the line.
- **Stale comments.**
  - `design/polish/final-review.mjs:45` still places `loadGame()` in `web/app.js`; it's now in `js/logic/save.js`.
  - `scripts/subset-mana.mjs:7` still says "styles.css or app.js"; it should say `web/js/`.
- **A redundant import.** `web/app.js:31` imports `./js/sheets/options.js`, which `sheets/settings.js:16` already imports. **Fix:** delete it, or add a comment that it's there only to show load order.

### Not recommended

- **`modulepreload`.** It's a hand-kept list of 26 lines that would drift, and it saves about 4 ms in WebKit (R1).
- **Caching in the test server.** Every test gets a fresh context, so `no-store` costs nothing.
- **Sharing `randomBelow` (`rules.js:178`) with dice.js's `randomFace` (`dice.js:144`).** This is blocked until dice.js is a module (DEEP-DIVE §2.6 step 6).

---

## Checked and fine

- **The work done at run time is unchanged.** The calls to `querySelector`, `addEventListener`, `measureBoard`, `syncBoardTurn`, `requestFit`, `syncPill`, `renderBadges`, `renderScore` and `saveGame` are the same in number in the old app.js and in the new app.js plus `web/js/**`. Every top-level statement in the modules also ran at top level in the old defer script. Nothing that was lazy became eager.
- **Listener order.** I recorded every `addEventListener` during load in Chromium, on `a5005c5` and on `ac0e0b8`. The order per target is identical. On `#settings`, `#restart`, `#dice` and `#discard`, the dialog's own `close` listener comes before `maybeAskFirst`.
- **`window` surface.**
  - Android evaluates only `CLOSE_DIALOG`, and iOS calls only `window.setReduceTransparency?.()`.
  - The tests call `closeOpenDialog` and their own stand-ins (`setTestHidden`, `turnTestScreen`).
  - All of these are still on `window`.
- **Strict mode and `this`.** The classic script was already `'use strict'`, so there's no change.
- **Exports.** Every `export let` is assigned only in its own module, and ESLint's `no-import-assign` would catch an outside write.
