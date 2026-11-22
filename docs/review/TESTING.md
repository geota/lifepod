# LifePod testing review

Reviewed on 2026-11-22 against `main` at `0629ddf`. Nothing in `web/`, `tests/`, `android/`, `ios/` or CI was changed. Experiments (timings and mutations of a copy of `web/app.js`) ran in a scratch folder outside the repo.

## Summary

- The suite is 101 Playwright tests in 13 files: 64 in Chromium, 37 in WebKit. All pass. They are behaviour-rich and read like the spec: most features have a happy path, an undo or discard path, a "fits the smallest phone" check, a load-validation check and an Android-back check.
- The gaps are around the edges of the web page: keep-awake, haptics and the whole iOS bridge have no test at all, and the Android bridge is only mocked from the JavaScript side. Seeded mutations in those areas all survived (see [Mutation spot-checks](#mutation-spot-checks)).
- One file, `tests/sizes.test.mjs`, runs for 140 s of the suite's 154 s, so it alone sets the wall time of `npm test`. Every other file finishes within 43 s.
- The suite has no fast layer. Pure rules such as save validation, play order and who is out are only reachable through a browser reload, so each case costs 0.3 to 1 second instead of microseconds.
- Setup is copied rather than shared: ten `openPage`-style helpers, seven copies of the Android bridge mock, six copies of `eventually`, about a dozen copies of the "44px target inside its tile and clear of the pill" check.
- Top recommendations, in order: native contract tests that need no device, a shared test harness, a pinned test font, `page.clock` for every timing-based test, splitting `sizes.test.mjs`, then extracting pure logic into a module with unit tests. Visual regression and the design sweep are worth adding in a narrow form. Device automation (Espresso, XCUITest) is not worth its cost yet.

Headline numbers:

- `npm test`: 101 tests pass in 154 s wall time on a 14-core Mac (CPU 131 s user). Run one file at a time, the files add up to 412 s. `sizes.test.mjs` alone takes 140 s.
- Mutation spot-checks: 24 seeded bugs in a copy of `app.js`. All 10 that I expected to be caught were caught, one of them only by an unrelated test. All 14 bugs in keep-awake, haptics, the iOS bridge, caps, save validation, the shuffle, font loading and backgrounding survived both engines.

## 1. What's covered

Every test file opens `web/index.html` from disk in a fresh browser, seeds a game through `localStorage` (or through a mock `LifePodAndroid` that keeps the game in `sessionStorage`), and drives the page with taps, mouse holds or keyboard presses. Tests named `chromium: …` and `webkit: …` are split between the two CI jobs by `--test-name-pattern`.

| Feature (SPEC section) | What is tested | Where |
|---|---|---|
| Life totals | Tap counts on pointerdown, exactly once; hold repeats; three players holding or tapping at once (Chromium CDP multi-touch); each half of the tile is a target, including over the total; a hold stops when the finger slides off; a lost `pointerup` on Android; tap, click, Enter and Space each count once; the announcer speaks the settled total; `touch-action: none` | `counters.test.mjs` |
| Life display (§1) | Red at 0 and below; the press wash and its inner-corner radius; "Out" tag, label reason (life, poison, commander damage) and dimmed badges | `counters.test.mjs` |
| Seating and orientation | Seat layout and facing for 2 to 6 players at three phone sizes, portrait and landscape; rotating one seat; the board stays fixed to the device through 0°, 90°, 180°, 270°; reload keeps the upright angle; split-screen portrait window on a landscape screen | `seating.test.mjs` |
| Setup (§4.2) | Player count; life presets; the custom stepper (hold accelerates, floor at 1); an old save at 25 life opens with Custom; "Start new game" versus "Done"; About and its privacy text; About's scroll fade | `setup.test.mjs`, `seating.test.mjs` (About text) |
| Track sheet (§4.3) | Switch order; each switch saves at once; ‹, Escape and ✕; the summary icons and "+N"; the row keeps its label and caret at five sizes; Turns choices; auto-empty row visibility | `setup.test.mjs`, `turns.test.mjs`, `mana.test.mjs` |
| Setup fit | Setup, Track and Identity sheets fit without scrolling from 952 × 427 to 320 × 568, every control 44px, header folds below 360 tall | `sizes.test.mjs` (`checkSetup`) |
| Counters (§6, §7) | Poison, tax, energy, experience, rad: circles, tap +1, hold −1, hidden remove buttons, Undo, discard prompt with count, Save, badges in order, two-digit counts, switch off keeps counts, new game resets counts and keeps switches; fit with six players; icon and count size ratios | `counters-mode.test.mjs` |
| Commander damage | Table map per tile, linked to life; hold −1; keyboard; Undo; discard; chips in attacker colour, largest first; new colour updates chips; new game resets; maps in board coordinates for 2 to 6 players and rotated seats; equal seat sizes; warn at 15 and 7 poison, out at 21 and 10; switches off stop knock-outs; wide-font robustness | `commander-damage.test.mjs` |
| Tile colours (§5) | Twelve swatches, taken swatches, owner tags, no duplicates (even with a forced click), bottom-row darker variant, save, new game and player-count changes keep colours; fit at every count and size, and with rotated seats; palette matches `palette.mjs` and meets its contrast minimums; indicator rim 3:1 | `colours.test.mjs`, `palette.test.mjs` |
| Colour identity (§2) | All 31 identities × 8 chip combinations × 3 backgrounds; round chip versus capsule; the Identity sheet; identity mode (toggles face the player, W U B R G order, saves at once, Escape and back end it); new game keeps identities; fit at every count; explanations and checks | `identity.test.mjs` |
| Turns (§8) | Play order for 2 to 6; pass, step back, across rounds; skipping players who are out, including the first player; Rounds flag and pill; no history after relaunch; "Back one turn" for keyboards; who goes first (Me first, shuffle with `crypto.getRandomValues`, Skip, when it asks and when it doesn't) | `turns.test.mjs` |
| Floating mana (§9) | Mana mode with Undo, Save, discard; the strip spends, clears, "Undo clear" for 5 seconds (with `page.clock`); auto-empty on pass and restore on step back; fit at six players; the strip never covers a total, glyph or near row at 3 sizes × 2 counts × 2 pools × turn chip on/off | `mana.test.mjs` |
| Auto-drop (§3.2) | The busiest board stays within the drop table on phones; the far row drops the sword, then shrinks, then wraps; the near row drops names, then the symbol, then shrinks; hysteresis (no blinking back at 9); "Turn" goes first; every badge fits at 640 × 360 | `autodrop.test.mjs` |
| One size per board (§3.1) | Every tile draws its total, glyphs and badges at the same size; nothing clipped; 44px targets in every mode; tablets keep phone proportions; the pill covers nothing at 8 sizes × 5 counts × 5 rotations; rotated seats clear the pill | `sizes.test.mjs` |
| Dice | Every die draws its faces and rolls in range; the result matches the die; the crypto generator with rejection sampling; animation settles once; Escape and back close; fits small screens | `dice.test.mjs` |
| Android back, web side (§10.3) | `window.closeOpenDialog()` return values and `setBackHandling` calls for setup, Track, Identity, dice, colours, identity mode, counters, damage, mana and who goes first | spread over 8 files |
| Save validation (§10.1) | Field-by-field fallbacks for colours, counters, identities, identity settings, commander damage, turns, pools and auto-empty; "a save from before X" cases | one "saved … are checked when a game loads" test in each of 5 files |

Every WebKit test runs the same function as a Chromium test. The 27 Chromium-only tests are load validation, Android back (the bridge only exists on Android, which is Chromium), multi-touch (only Chromium can drive it), the palette and a few fit checks. That split is sensible for an app that ships in both WebView engines.

## 2. What's missing

### Features and states with no test

- **Keep awake.** Nothing toggles the Keep awake switch or checks its effect. The web Wake Lock path (`syncWakeLock`: request, release when hidden, re-request when visible, a rejected request), the Android `keepAwake(bool)` call and the iOS `keepAwake` message are all untested.
- **Haptics.** No test checks that a counted change calls `haptic()`, or that nothing else does.
- **The whole iOS bridge.** No test defines `window.webkit.messageHandlers`, so the iOS branches of `loadGame` (`window.initialGame`), `saveGame` (`game.postMessage`), `syncWakeLock` and `haptic` never run. The Android branch has a mock in seven files; iOS has none.
- **New game dialog.** "Start new game" is tested many times; its ✕ ("Cancel new game") and its message are not.
- **Rotations across a new game.** SPEC §10.2 says rotations are kept when the player count is unchanged. No test starts a new game after rotating a seat.
- **Caps.** Counters, commander damage and mana stop at 99 and starting life at 999 in the UI. Only the load-time caps are tested.
- **Shuffle fairness.** `randomBelow` (who goes first) has its own rejection sampling, separate from the dice. Only the dice have the "values past the last whole multiple are drawn again" test.
- **Font-load refit.** The `loadingdone` listener that re-fits badge rows once the Mana font arrives has no test. Tests wait for `document.fonts.ready` first, so the board is always measured with the font already loaded.
- **Backgrounding.** `visibilitychange` cancels presses in progress (a hold should not keep counting while the app is in the background). Untested.
- **Announcements** for counters, mana, turns and colours. Only life and commander damage announcements are checked.
- **Devices with DPR above 1.** Every test runs at device pixel ratio 1. Phones run at 2.6 to 3, where layout rounding differs.

### Native bridge behaviour

The Android mock checks the web half of each contract: what the page calls and what `closeOpenDialog()` returns. Nothing checks the native half, and nothing checks that the two halves agree.

| Behaviour | Android (`MainActivity.kt`) | iOS (`LifePodApp.swift`) |
|---|---|---|
| Saving | `writeGame` with `SharedPreferences.apply()`; `readGame` at load. Mocked only. | `game` message to `UserDefaults`; saved game injected as `window.initialGame` before load. Not mocked at all. |
| Keep awake | `FLAG_KEEP_SCREEN_ON` on the UI thread. Mock is a no-op. | `isIdleTimerDisabled`, only while the scene is active. Not mocked. |
| Back | Two paths: `onBackPressed` on Android 11 to 12L (minSdk is 30), `OnBackInvokedCallback` registered and unregistered by `setBackHandling` on 13+. Both run `window.closeOpenDialog?.()` and compare the result with the string `"true"`. Neither path is tested; the string is not checked against `app.js`. | No back gesture. |
| Orientation | `configChanges` keeps the activity alive on rotation; the page turns the board itself. Tests fake `screen.orientation`, which is fine for the page but says nothing about the WebView. | Same. |
| Asset serving | `shouldInterceptRequest` serves only the seven paths in `MIME_TYPES`. A new file in `web/` works in every test and on iOS, and 404s on Android. Nothing checks the list. | `loadFileURL` with read access to the folder, so any file works. |
| Process death | Prefs survive. Untested. | `webViewWebContentProcessDidTerminate` reloads with the saved game. Untested. |

### Save migration across versions

The five "saved … are checked when a game loads" tests are good at field-level fallbacks, but:

- The "old saves" are hand-written literals of what the tests think an older version wrote. No save produced by a released build (`v0.1.0-alpha.*`) is kept as a fixture.
- No test checks the round trip: that loading any save and saving it again gives a save that loads to the same game, and that a current save is a fixed point.
- The top-level gate in `loadGame` is untested: malformed JSON, `scores` of the wrong length (1 or 7 players), non-integer scores, a missing or zero `startingLife`. A mutation that dropped the `startingLife < 1` check survived.
- Android saves live under `currentGame` in SharedPreferences and iOS saves under `currentGame` in UserDefaults; a page update that changes `storageKey` handling on one platform would not be noticed.

### Error paths

- `localStorage.setItem` throwing (private mode, quota): caught in `saveGame`, untested.
- `navigator.wakeLock` missing or rejecting: caught, untested.
- `screen.orientation`, `ResizeObserver` or `document.fonts` missing (older WebViews): the code guards each with `?.`, untested.
- Script errors are collected with a `pageerror` listener in ten files, but not in `counters.test.mjs`, `seating.test.mjs` or `palette.test.mjs`. An exception in those flows passes unless it also breaks an assertion.

## 3. Quality

### Timings

Measured on a 14-core Apple Silicon Mac with Node 26.13 and `playwright-core` 1.65.0. Other sessions were using the machine at the time (load average 12 to 18), so treat the numbers as relative. First `npm test` as CI's two jobs would see it in one go, then each file on its own with `node --test <file>`:

| | |
|---|---|
| `npm test`, all 101 tests, files in parallel | **154 s** wall, 131 s user CPU |
| Sum of each file run on its own | 412 s (213 s in Chromium tests, 195 s in WebKit tests) |
| Browser launch, first load of the page, close | 0.18 s Chromium, 0.56 s WebKit |

| File | Tests (Chromium, WebKit) | Wall alone (s) | Chromium tests (s) | WebKit tests (s) | Slowest test |
|---|---|---|---|---|---|
| `sizes.test.mjs` | 8 (4, 4) | **139.6** | 62.7 | 76.7 | WebKit pill clearance, 41.5 s; Chromium 40.8 s; board fit 39.0 s WebKit, 24.6 s Chromium |
| `turns.test.mjs` | 13 (8, 5) | 42.8 | 22.4 | 20.1 | Turn by turn pass and step back, 7.1 s |
| `counters-mode.test.mjs` | 8 (6, 2) | 36.1 | 24.1 | 11.3 | Energy, experience and rad, 16.7 s (6.7 s in the parallel run) |
| `mana.test.mjs` | 11 (7, 4) | 33.0 | 14.7 | 18.1 | WebKit strip clearance, 10.9 s |
| `autodrop.test.mjs` | 12 (6, 6) | 32.0 | 10.1 | 21.6 | WebKit near-row steps, 10.0 s |
| `colours.test.mjs` | 7 (5, 2) | 26.3 | 17.7 | 8.2 | Colours fits every player count, 7.8 s |
| `commander-damage.test.mjs` | 9 (6, 3) | 26.1 | 13.0 | 12.7 | WebKit damage entry, 4.8 s |
| `identity.test.mjs` | 10 (7, 3) | 19.3 | 15.0 | 4.0 | Identity mode fits every player count, 9.0 s |
| `setup.test.mjs` | 9 (5, 4) | 18.1 | 8.6 | 9.2 | WebKit custom stepper, 6.3 s |
| `dice.test.mjs` | 4 (3, 1) | 16.1 | 8.8 | 7.0 | WebKit dice, 7.0 s |
| `counters.test.mjs` | 6 (4, 2) | 11.0 | 9.3 | 1.4 | Multi-touch, 8.3 s |
| `seating.test.mjs` | 2 (1, 1) | 10.9 | 5.8 | 4.6 | Chromium seating, 5.8 s |
| `palette.test.mjs` | 2 (2, 0) | 1.0 | 0.6 | 0 | 0.3 s |

What this shows:

- **`sizes.test.mjs` is the critical path.** Node runs files in parallel but the tests inside a file one after another, so the 140 s of this file is the 154 s of the suite. The pill matrix (8 sizes × 5 counts × 5 rotations = 200 reloads per engine, plus modes at two sizes) and the board-fit matrix (10 screens × 2 orientations × up to 5 counts, each a new page) are 80% of it.
- **In CI the tests have less room.** The Chromium job runs on a 4-vCPU Ubuntu runner, where Node runs three files at a time, so its 213 s of tests need at least 71 s even if perfectly spread, on slower cores. The WebKit job runs its tests on the macOS preview runner before the two Xcode builds, so they add straight to that job's length.
- **Most time is in reloads, not launches.** Launches cost about 130 × 0.2–0.6 s, roughly 40 s of the 412 s. Reload-heavy matrices (identity's 48 reloads, the pill's 200, colours' rotated seats) are the rest.
- **Real-time waits** add a floor: the multi-touch test is 8.3 s of mostly `wait()`; the stepper test is 7.3 s of mostly holding; dice tests sleep through animations.

### Brittle tests

**Timing.** There are 31 `waitForTimeout` calls in 10 files, plus 15 `wait(ms)` calls in the multi-touch test. They fall into three groups:

- *Storage flush sleeps.* "Chromium writes page storage in the background", so 500 ms waits come before about a dozen reloads (`reload()` in three files, inline elsewhere). `seating.test.mjs` also re-reports the screen angle after a reload because the fake orientation in `sessionStorage` "occasionally" vanishes on CI. Both are workarounds for a race, not fixes, and each costs half a second.
- *Real-time holds.* Every hold test (life, counters, damage, mana, turn chip, pill, stepper) holds the mouse for a real number of milliseconds and then asserts a loose range: "at least 4 steps after 1.2 s", "at most 7 left", "at least 20 more after 1.7 s". The ranges are loose because CI machines vary, and that looseness is why a mutation that made life holds 2.5 times slower survived (see below).
- *Animation sleeps.* The dice tests sleep 200, 900 and 300 ms around the roll animation; the who-goes-first test sleeps 1.6 s for the shuffle.

The mana strip test already shows the fix: `page.clock.install()` and `page.clock.runFor(4900)` make the 5-second "Undo clear" exact and instant. The same works for holds, repeats, the shuffle and the dice.

**Font metrics.** Auto-drop, the pill checks, the Track row "+N", the identity chip shape and the badge-fit tests measure text. The CI Chromium job installs Roboto and maps `system-ui` to it; the WebKit job measures San Francisco on macOS; a developer's Mac measures San Francisco in Chromium too; a Linux machine without that fontconfig gets DejaVu Sans and fails (the CI comment says so). So "passes locally" and "passes in CI" are measuring different fonts. `commander-damage.test.mjs` has a good robustness check that forces a wide monospace font; the auto-drop tests have exact step limits ("at most step 1 at 952 × 427") that only hold for today's fonts.

**Pixel tolerances.** Mostly sensible: 0.5px for rounding, 43.5 for a 44px target, 2px for the "Out" tag centring, `>= 0.98` of the screen covered. The risk is that they were tuned at DPR 1 only.

**Exact style values.** 29 `rgb(…)` literals in four test files copy values from `styles.css` (seat panels, the red of a life at 0, the amber warning, the text colour). The box-shadow regex `rgba(243, 241, 229, 0.65\d*) 0px 0px 0px 1.5px`, the radius `'28px 0px 0px 28px'` and the SVG path prefix `M232,56V176` (to tell the flag icon from the checklist) are the same kind. A palette tweak fails tests in four files for reasons unrelated to behaviour. `palette.test.mjs` shows the better pattern: read the custom property, then check the relationship (contrast, equality with the token), not the literal.

### Duplicated setup

| Copy | Count | Differences between copies |
|---|---|---|
| `openPage` / `openBoard` | 10 files | Viewport (852 × 393, 952 × 427 or default), whether it installs the Android mock, seeds a game, installs a clock, fakes orientation, listens for `pageerror` |
| `LifePodAndroid` mock | 7 files | Identical |
| `eventually(read, expected)` | 6 files | Timeouts of 2, 3 and 5 seconds |
| `reload()` with a 500 ms sleep | 3 files, plus inline copies | Identical |
| `savedGame(count, extra)` | 2 files, plus about 20 inline game literals | Field sets differ |
| "44px, inside its tile, clear of the pill" in `page.evaluate` | about 13 copies in 7 files | The pill is inset by 6px, by 1/8 of its size, or not at all; tolerances 0, 0.5 or 1px |
| `stripProblems`, `fakeScreenOrientation`, `startGame`, `setSwitches` | shared in `helpers.mjs` | — |

The geometry checks matter most: three different definitions of "clear of the pill" mean three slightly different rules, and the design sweep in `final-review.mjs` has a fourth.

Each test also launches its own browser. `autodrop.test.mjs` launches a new browser for every board it opens (17 per engine) and `turns.test.mjs` launches five for the play-order test. A shared browser per file, with a new context per test, gives the same isolation.

### Assertions that are too weak or too strong

Too weak:

- Hold tests assert ranges, not counts (see timing above).
- `commander-damage.test.mjs` checks the discard title with `/^Discard \d+ changes\?$/` where the count is knowable.
- `dice.test.mjs` checks that six dice have six different front colours, not which colours.
- `counters.test.mjs` checks that the announcer says the right total after a settle, but not that it stayed quiet during the hold.
- Android-back tests check `backHandling.at(-1)`, the last call, not the sequence. Extra calls or a wrong intermediate value pass.

Too strong:

- Exact computed colours and CSS strings, as above.
- `sizes.test.mjs` asserts exactly 18 visible setup controls, 12 in Track and 9 in Identity. Adding any control fails three counts at five sizes with a message about counts rather than about fit.
- Auto-drop step limits per size, as above.

### Mutation spot-checks

I copied `web/` and `tests/` to a scratch folder, changed one thing in `app.js`, ran the Chromium tests that should notice, and restored the file. Bugs I expected to survive I applied all at once and ran against the full Chromium suite (64 tests) and the full WebKit suite (37 tests); both passed, so each of those bugs is unnoticed by every test.

Caught:

| Bug seeded | Caught by |
|---|---|
| Hysteresis slack 1.15 → 1 (rows blink back) | `autodrop`: badge rows give way…, a dropped name doesn't blink back |
| Six-player play order swaps seats 5 and 6 | `turns`: play order for 2 to 6 players (only this test) |
| Poison is lethal at 11, not 10 | `commander-damage` warnings; `counters` out tag |
| "Undo clear" lasts 6 s, not 5 | `mana`: the strip … undoes a clear for 5 seconds |
| Commander damage knocks players out with Commander off | `commander-damage` warnings |
| Android back at rest says "handled" | `colours` and `commander-damage` Android back |
| Saved colours may repeat | `colours`: saved colours are checked |
| A saved identity with colourless "C" is kept | `counters-mode`: saved counters are checked |
| Commander damage warns at 16, not 15 | `commander-damage` warnings |
| Life holds repeat every 250 ms, not 100 ms | **Not by any life test.** Caught only by the setup stepper test, which happens to share `bindCounter`. The life hold test asserts "at least 4 steps in 1.2 s", which a 2.5× slower repeat still meets |

Survived every test in both engines:

| Bug seeded | What it means |
|---|---|
| Android `keepAwake` always `true` | Keep awake can't be turned off on Android |
| Web wake lock ignores the switch | Same in the browser |
| No Android haptics | Haptics gone |
| iOS `saveGame` posts nothing | **Every iOS game is lost on relaunch** |
| iOS `loadGame` ignores `window.initialGame` | Same, the other way |
| A new game resets rotations even with the same player count | SPEC §10.2 broken |
| Counters, commander damage and mana have no upper cap in the UI | Counts past 99, which `loadGame` then resets to 0 on the next launch |
| Starting life capped at 99,999, not 999 | SPEC §4.2 broken |
| `randomBelow` without rejection sampling | Who goes first is biased (slightly) |
| `loadGame` accepts `startingLife` of 0 or below | A bad save loads instead of falling back to a fresh game |
| Font-load refit listener removed | Rows fitted before the Mana font loaded keep the fallback font's drop steps |
| Backgrounding no longer cancels presses | A hold keeps counting after the app is switched away |

Two of the survivors, the iOS save and load, would lose every game on iPhone. The first recommendation below catches all of the bridge survivors.

## 4. Recommendations

In priority order. The first five are small and each removes a class of risk or a chunk of CI time.

### 1. Native contract tests that need no device (do first)

Most native bugs that could slip through are a mismatch between the page and the wrapper, and those can be caught in Node and Playwright:

- **Asset list.** A Node test that reads the files `index.html` and `styles.css` reference (and anything `app.js` loads) and checks each one is in `MIME_TYPES` in `MainActivity.kt` and in the CI web bundle's `zip` list. This would have to be updated anyway when a `web/logic.js` is added (recommendation 6).
- **Bridge shape.** A Node test that greps the method names in `GameBridge` (`readGame`, `writeGame`, `keepAwake`, `haptic`, `setBackHandling`) and the message names in `LifePodApp.swift` (`game`, `keepAwake`, `haptic`, plus `window.initialGame`), and checks that the mocks in the shared harness have exactly those. Then the mocks can't drift from the wrappers.
- **Back string.** The same test checks that `CLOSE_DIALOG` is `window.closeOpenDialog?.()` and that `app.js` defines `window.closeOpenDialog` returning a boolean.
- **Record the calls.** Make the shared Android mock record every call, and add an iOS mock of `window.webkit.messageHandlers` that does the same and serves `window.initialGame`. Then assert: `keepAwake(true)` at start, `keepAwake(false)` when the switch is turned off, `haptic` once per counted change and not on a hold's release, `writeGame` with a payload that `loadGame` reads back, and the full `setBackHandling` sequence rather than its last value. Run the iOS mock in WebKit.

- **Stub the Wake Lock API** (`navigator.wakeLock.request` recording calls and returning a releasable sentinel, plus a rejecting variant) to test the browser's keep-awake path, including release when the page is hidden.

This catches all five surviving bridge and keep-awake mutations (Android keep-awake, web keep-awake, haptics, iOS save, iOS load) for about a day's work.

### 2. A shared test harness

Move into `tests/harness.mjs` (or grow `helpers.mjs`): one `openPage({ engine, viewport, game, bridge: 'android' | 'ios' | null, clock, orientation })` that always collects `pageerror`, one `eventually`, one `reloadAfterSave`, one `savedGame(count, extra)`, the two bridge mocks, and one geometry auditor (`targetProblems(page, selector, { pill })`) with a single definition of "inside its tile" and "clear of the pill". Share one browser per file: launch in `before`, close in `after`, and give each test its own context. That keeps isolation and saves a launch per test (0.2 s in Chromium, 0.6 s in WebKit; `autodrop.test.mjs` alone launches 17 browsers per engine).

### 3. Pin the test font

Give the UI type a custom property in `styles.css` (for example `--font-ui: system-ui, sans-serif`), and have the harness set it to a bundled font (Roboto is Apache-licensed) loaded with `@font-face` from `tests/fonts/`. Then layout tests measure the same glyphs on a Mac, on Linux and in both CI jobs, `npm test` works on a Linux machine without the fontconfig step, CI can drop the `apt-get install fonts-roboto` step, and screenshots become stable (recommendation 7). Keep a small number of tests on the real system font, like the existing wide-font check, to catch "fits only with Roboto".

### 4. Control time with `page.clock`

Use `page.clock.install()` in every test that waits on time: life, counter, damage and mana holds; the turn chip and pill holds; the stepper's acceleration; the shuffle; the dice roll; the announcer settle. Then the assertions can be exact (a 1.2-second hold on a life half gives one known count, not "at least 4"), the 500 ms delay and 100 ms repeat become real requirements, and these tests stop depending on machine speed. The storage-flush sleeps before reloads can mostly go too: tests that check "the game survives a reload" can read the saved snapshot and open a new page seeded with it, which tests the same thing with no race.

### 5. CI speed

- **Split `sizes.test.mjs`** into board sizes, setup fit and pill clearance. Node runs files in parallel and tests within a file one after another, so this one file is the critical path; split three ways, its longest part is the pill matrix.
- **Cache the Playwright browsers** (`~/.cache/ms-playwright` on Linux, `~/Library/Caches/ms-playwright` on macOS), keyed on the `playwright-core` version. Both jobs download a browser on every run.
- **Shard if needed.** Node 24 supports `--test-shard=1/2`. With the split above it shouldn't be needed for Chromium.
- **Run the WebKit tests in their own macOS job**, in parallel with the Xcode builds, so a WebKit failure shows before the 10-minute builds finish and a build failure doesn't hide test results.
- **Watch for flakes.** Node's runner has no retries, which is good for honesty. A scheduled workflow that runs the suite five times and reports any test that failed once would show which waits are too tight before they bite on a PR.
- **Mind the name filter.** CI runs only tests whose names contain `chromium` or `webkit`. A test without either word runs nowhere in CI and nothing says so. The unit tests from recommendation 6 need their own CI step (`node --test tests/unit/`), or a name prefix.

### 6. Extract pure logic into a module with unit tests

Worth it, for the rules where a mistake loses or corrupts a game, and where today every case costs a browser reload:

| Logic | Today | As a unit |
|---|---|---|
| `loadGame` and the `fit*` validators | 5 browser tests, ~40 reloads | One table of input → output cases per field, plus property-based tests: for any JSON, `loadGame` returns a valid game; `load(save(game))` equals `game`; and a committed fixture of a real save from each released tag loads to a known game |
| Play order, pass, step back, skipping players who are out, round counting | Browser tests per player count | Pure `nextTurn(state, scores, counters)` and `previousTurn(…)`; check every count, every first seat, every set of players out |
| `outReason`, `dangerLevel` | Through seeded saves | Direct, at the boundaries (14/15/20/21 damage, 6/7/9/10 poison, life 1/0/−1, switches off) |
| `randomBelow` | Not tested | The same rejection test the dice have |
| Identity names and glyph tables | 31 identities × 8 combinations, rendered | The table itself, plus one browser test that the chip renders a name and a glyph |
| Starting-life stepper acceleration and caps | Real-time holds | `stepStartingLife(value, direction, heldMs)` |
| Auto-drop level choice | Browser only | Split `fitBadgeSide` into measuring (browser) and choosing (`chooseLevel({ fitsAt, current, slack })`, pure). Hysteresis and step order become unit tests; the browser tests keep checking that the measurement is right |

How: `web/logic.js` as a classic script (Playwright opens the page from `file://`, where ES modules are blocked, and Android serves only its listed files), in the same pattern as `dice.js`: an IIFE that sets `window.lifePodLogic`, and also assigns `module.exports` when `module` exists, so `node:test` can `require` it. Add it to `index.html`, `MIME_TYPES` and the CI zip list (the contract test in recommendation 1 checks the last two). Then the five browser "saved … are checked" tests can shrink to one smoke test that a bad save still opens a board.

Not worth extracting: the layout fitting, the board turn and the strip placement. Their logic is measurement, and a unit test with fake sizes would test the fake.

### 7. Visual regression: yes, small and in one place

Geometric checks catch overlap and size but not a wrong glyph, a wrong colour token, a missing icon or a broken SVG. The 29 hard-coded colours in the tests are a sign that this is being tested by hand. A small screenshot set would catch these and let some of the colour literals go:

- About 15 shots: the target (952 × 427) and the stress size (568 × 320), with the `everything` seed from `final-review.mjs`, at rest and in each mode and sheet. `final-review.mjs` already takes these shots.
- Chromium on Linux only, with the pinned font (recommendation 3), `deviceScaleFactor: 2`, `reducedMotion: 'reduce'`, and the dice result masked. Do not take baselines from WebKit on macOS: its text rendering changes with macOS versions.
- Generate and update baselines in the same environment CI uses (the `mcr.microsoft.com/playwright:v1.65.0-noble` image, or a CI job that uploads new baselines as an artifact), never on a developer's Mac.
- `playwright-core` has no `toHaveScreenshot`, so either compare with `pixelmatch` and `pngjs` (a per-pixel threshold around 0.1 and a small allowed ratio of changed pixels) or move to `@playwright/test`. The first keeps the current runner.

Expect each intentional design change to update a handful of PNGs. That cost is the point: the diff shows what changed.

### 8. Fold the design sweep into CI: yes, as an auditor

`final-review.mjs` audits 1,736 states (8 sizes × 5 counts × 6 seeds × every mode and dialog) and today reports zero problems, so it can gate on zero without a baseline. It also checks two things no test does: contrast of every rendered text and icon, and accessible names. But it is a script with its own copy of the geometry rules, it doesn't exit non-zero on findings, and it takes about 75 seconds.

- Move `audit()` into the shared harness as the one geometry, target, contrast and naming auditor, and use it in `sizes.test.mjs` instead of the ad-hoc checks there.
- Add a test, `chromium: the design sweep finds no problems`, that runs a reduced matrix on every PR (target, stress and 320 × 568 portrait; every count; the `everything` and `minimal` seeds; every mode) and fails on any finding.
- Run the full matrix nightly and on `main`, with its `findings.json` as an artifact. Keep the screenshot part of the script out of CI unless it becomes the visual regression set.
- Most of the pill matrix in `sizes.test.mjs` (the slowest test in the suite) overlaps with the sweep. Folding it in should keep CI time about where it is.

### 9. Native wrapper tests on devices: not yet

- **Android instrumentation** needs a test APK, `AndroidJUnitRunner`, Espresso-Web or UI Automator, and an emulator in CI (a KVM-enabled Ubuntu runner, several minutes to boot). The Android build is a hand-written `build.sh` with `kotlinc`, `d8` and `aapt2`, not Gradle, so even adding a test APK is real work. All that to cover 180 lines of Kotlin, most of which is configuration.
- **XCUITest** needs a UI test target in the hand-made Xcode project and a Simulator boot on the preview `xcode-27` runner, for 121 lines of Swift.

Better value now:

1. The contract tests in recommendation 1.
2. A release checklist in the repo, run by hand on one Android 12 or earlier device, one Android 13+ device and one iPhone before each tag: back gesture at rest, in a sheet and in a mode with edits; keep awake on and off; force-stop and relaunch keeps the game; rotate all four ways and split screen; airplane mode (no network requests); after a long background on iOS, the game is still there.
3. If a native bug does slip through, add one smoke test for that platform, scripted rather than instrumented: install the APK on an emulator, tap with `adb shell input`, `force-stop`, relaunch, and read `shared_prefs/lifepod.xml` with `run-as`; or on iOS, `simctl launch`, then `simctl spawn booted defaults read` for `currentGame`. That checks saving end to end without a test framework.

Revisit device tests when the native code grows (widgets, Health, Watch) or when a second native bug reaches users.

### 10. Target test pyramid

| Layer | What | How many | Time | Runs |
|---|---|---|---|---|
| Unit | `web/logic.js`: save validation, migrations from fixtures, turn rules, out and danger rules, random draws, stepper, drop-level choice; property-based tests for load and save | 80–120 | under 2 s | every push |
| Contract | Bridge shape, back string, asset lists, palette tokens against `palette.mjs` (the palette test can read `styles.css` directly instead of launching Chromium) | 5–10 | under 1 s | every push |
| Behaviour | Playwright flows in Chromium and WebKit, with the shared harness and `page.clock`: today's tests minus what moved to units | 70–80 | about a minute per engine | every push |
| Layout audit | The shared auditor over a reduced matrix; the full sweep nightly | 2 tests | 1–2 min | PR / nightly |
| Visual | About 15 Chromium screenshots on Linux with the pinned font | 15 | under 30 s | every push |
| Native | Contract mocks in the behaviour layer; a manual checklist per release; scripted smoke tests only after a native bug | — | — | per release |

Today the pyramid is upside down: everything is at the behaviour layer, and the slowest tests (layout matrices) are where most of the time goes.
