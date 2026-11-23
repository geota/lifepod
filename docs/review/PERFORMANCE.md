# LifePod performance audit

Main at v0.1.0-alpha.15, November 2026. This is a review: nothing in `web/` was changed. Every fix below was prototyped in a scratch copy of `web/` and measured there.

## Summary

- **Taps are fast.** A life tap, a hold-repeat tick, a counter cell and a mana cell each cost 1–4 ms of main-thread work at ×4 CPU throttling (a mid-range Android stand-in). That is under the 8 ms budget, even on a busy six-player board.
- **Transitions are slow.** Any action that changes what a badge row holds runs a full badge fit. That includes passing the turn, stepping back, leaving a mode, the eraser and its undo, and a strip spend. On the busy board at 568 × 320, at ×4:
  - a turn pass costs 100 ms;
  - a step back costs 280 ms;
  - leaving a mode costs 320 ms.

  At ×6 these reach 175, 530 and 450 ms. The budget is 50 ms. WebKit, unthrottled, takes 58–145 ms for the same actions.
- **Style recalculation is most of a fit's cost, not layout.** A fit writes drop tokens and type sizes on `#board`, and every write restyles the whole board, about 900 elements. The deep dive's "113 layouts" is real, but it isn't the cost. A prototype that cut layouts from 118 to 37 didn't change the time at all. A prototype that moved the type sizes from `#board` to each tile's edges cut 35–50%.
- **Rotation runs the fit 3–5 times.** Chromium fires `loading` and `loadingdone` on every viewport resize, even though no font loads. app.js answers with `resetDrops()` and two more full fits. The test harness hides this, because it suppresses trusted `loadingdone` events.
  - A rotation on a busy board costs 330–720 ms at ×4 in Chromium.
  - WebKit spends 150–400 ms fitting.
  - With prototypes P1, P3 and P7, a rotation runs one real fit: 130–220 ms at ×4, and 36–79 ms in WebKit.
- **The deep dive's step 3 works for the case it targeted.** "Skip a fit whose rows haven't changed width" takes a strip spend from 56 layouts and 42 ms to 1 layout and 5 ms at ×4. It doesn't help the eraser, undo, turn passes or modes, which do change the rows.
- **Startup fits twice.** The ResizeObserver's first callback repeats the boot fit. The board is painted at 320 ms at ×4 and 510 ms at ×6. Skipping the repeat gives 220 ms and 370 ms. Module loading isn't the bottleneck, and `modulepreload` doesn't help.
- **Memory is flat.** A scripted 4,000-tap game (360 turns) showed:
  - DOM nodes stay within 1,643–1,661;
  - listeners stay at 225;
  - no detached nodes are retained;
  - the heap levels off at 2.3 MB.
- **Glass costs nothing on the main thread.** It costs the compositor 5–6× more whenever the content under the blur changes, for example while settings scrolls or the die rolls. On this Mac no frames dropped. Only a low-end phone can say whether that matters.

## How this was measured

**Machine.** An Apple M3 Max with playwright-core 1.65:
- Chromium 1254, headless shell, with SwiftShader as the GPU;
- WebKit 2388.

Other agents were running on the machine (load average 7–15), so timings are medians of 10 runs and still carry about ±20% noise. Layout and style-recalc counts are exact and repeat run to run. Where time and counts disagree, trust the counts for mechanism and the time for cost.

**Pages.** Pages were served by `tests/server.mjs`'s `startServer`, pointed at `web/` or at a scratch copy. They were opened through `tests/helpers.mjs`'s `openPage`: mobile and touch contexts, pinned Roboto in Chromium, and San Francisco in WebKit. The startup and font-event runs used plain contexts with the system font and no harness.

**The busy board.** Six players with everything on:
- every tracker, including the monarch and the initiative, with two-digit counts;
- long identities showing indicator, symbol and name;
- commander damage from every opponent;
- Turn by turn at round 5, with automatic emptying on;
- a pool on every tile.

"Full" pools have four colours, so every strip folds. "Short" pools have two colours, so the strips stay unfolded at 952 × 427 and a strip spend can be measured. At 568 × 320 and 640 × 360 even the short pools fold on this board.

**An interaction** is the event the app acts on, dispatched in the page: `pointerdown` for life, `bindTap` and strip buttons, `pointerup` for counter cells and the turn chip, and `click` for the pill and the sheets. Each one reports:
- `work`: from dispatch through the handlers and the fit microtask, plus a forced style and layout flush;
- `render`: from the next `requestAnimationFrame` callback to the task after it, which is the frame's own style, layout, paint and commit on the main thread;
- `total`: `work` plus `render`, the main-thread cost the tap adds before its frame can be shown.

In Chromium each interaction is wrapped in `Performance.getMetrics`, which gives `LayoutCount`, `RecalcStyleCount` and their durations. Traces with `devtools.timeline.stack` attribute every forced layout and restyle to the function that forced it.

**Other runs.**
- *Frame drops* are counted from `requestAnimationFrame` intervals while each animated interaction runs: an interval over 25 ms is a missed 60 Hz frame. Headless browsers run at 60 Hz, so 120 Hz is judged against an 8.3 ms budget, not observed.
- *Hold-repeat* times each repeat's `setTimeout` task, including its microtasks and the layout flush. A wrapper installed before the app loads does the timing.
- *Rotation and resize* resize the viewport and turn the faked `screen.orientation`. An instrumented copy of `web/` counts and times every `measureBoard` and `fitBadgeRows` call, and records the event that triggered it.

**CPU throttling.** `Emulation.setCPUThrottlingRate` at ×4 stands in for a mid-range Android phone and ×6 for a low-end one. It slows only the renderer's main thread; GPU, memory bandwidth and the bridge aren't emulated. WebKit can't be throttled. Unthrottled WebKit on an M3 is roughly a recent iPhone. WebKit's `performance.now()` is coarsened to 1 ms, so WebKit figures under about 3 ms are rounding.

**Scripts.** The scratch scripts (harness, interactions, traces, resize, startup, glass, session and the prototype builder) are not in the repo. The important parts are described in each finding.

## Budgets

The budgets apply at Chromium ×4 and to WebKit unthrottled. ×6 is reported so the low-end margin is visible.

| Class | Interactions | Budget (main thread per input) | Why |
|---|---|---|---|
| Tap | life tap, counter cell, mana cell, strip spend | ≤ 8 ms total | Fits one 120 Hz frame (8.3 ms) and leaves a 60 Hz frame half free for paint |
| Hold-repeat tick | life hold, every 100 ms | ≤ 8 ms | The same, ten times a second, with frames in between |
| Transition | turn pass, step back, open or close a mode, eraser, undo clear | ≤ 50 ms | One visible step, under half of RAIL's 100 ms response window, so the haptic and the change land together |
| Sheet | open or close settings, open dice, roll | ≤ 50 ms, and no dropped frames during the sheet's or the die's animation | The same, plus smooth motion |
| Rotation or resize | turning the phone, a toolbar or split screen | ≤ 100 ms from the resize to settled, with one measure and one fit | Rotation already animates natively; the board shouldn't add a visible stall |
| Startup | cold load of a saved busy game | Board painted ≤ 300 ms at ×4 and ≤ 500 ms at ×6, with one fit | Below the native splash's fade |
| Memory | a long game | Flat DOM nodes, listeners and heap; no retained detached nodes | A game runs for hours with the screen kept awake |

## Measured against the budgets

### Interactions, Chromium (busy board, Material)

Median `total` in ms, with p95 for the ×4 column. The full tables, including Glass, are reproducible from the scratch results; Glass is within noise of Material on the main thread for every row.

| Interaction | 952×427 ×1 | 952×427 ×4 (p95) | 952×427 ×6 | 568×320 ×1 | 568×320 ×4 (p95) | 568×320 ×6 | Layouts / recalcs (568) | Verdict |
|---|---|---|---|---|---|---|---|---|
| Life tap | 0.8 | 2.1 (3.8) | 3.4 | 1.4 | 2.7 (3.2) | 4.3 | 1 / 2 | Pass |
| Life hold-repeat tick | 0.2 | 0.8 (1.1) | 1.1 | 0.3 | 0.6 (1.0) | 0.9 | – | Pass (single 17–20 ms outliers at ×6) |
| Counter cell | 1.2 | 3.3 (4.3) | 5.7 | 3.8 | 3.9 (4.6) | 7.7 | 1 / 3 | Pass |
| Mana cell (mana mode) | 1.1 | 4.0 (5.0) | 4.6 | 1.6 | 4.2 (5.4) | 7.5 | 1 / 3 | Pass |
| Strip spend (short pools) | 11 | 54 (65) | 88 | folds | folds | folds | 56 / 120 (952) | **Fail** (tap budget 8) |
| Eraser (short pools) | 11 | 54 (60) | 83 | folds | folds | folds | 56 / 120 (952) | **Fail** |
| Undo clear (short pools) | 10 | 62 (83) | 74 | folds | folds | folds | 56 / 120 (952) | **Fail** |
| Turn pass (empties six pools) | 4.9 | 23 (25) | 29 | 19 | 104 (107) | 175 | 14 / 27 | Pass at 952; **fail** at 568 |
| Step back (pools come back) | 22 | 110 (116) | 164 | 39 | 277 (292) | 529 | 118 / 150 | **Fail** |
| Open commander damage | 3.9 | 20 (21) | 31 | 6.1 | 55 (61) | 76 | 6 / 27 | Pass at 952; marginal fail at 568 |
| Open counters | 4.3 | 20 (23) | 34 | 6.3 | 54 (61) | 73 | 6 / 27 | Pass at 952; marginal fail at 568 |
| Leave a mode (✕, no edits) | 23 | 107 (114) | 175 | 38 | 321 (355) | 448 | 121 / 159 | **Fail** |
| Open settings | 4.1 | 17 (29) | 25 | 4.1 | 17 (27) | 28 | 1 / 9 | Pass |
| Close settings | 2.2 | 8.4 (16) | 14 | 2.4 | 8.3 (14) | 13 | 1 / 3 | Pass |
| Open dice | 3.0 | 9.9 (18) | 16 | 2.7 | 12 (20) | 15 | 1 / 3 | Pass |
| Roll | 0.9 | 2.5 (3.0) | 4.1 | 0.7 | 3.0 (4.1) | 3.8 | 1 / 2 | Pass |

### Interactions, WebKit unthrottled (busy board, Material)

| Interaction | 952×427 | 568×320 | Verdict |
|---|---|---|---|
| Life tap, counter cell, mana cell | 1–3 | 1–3 | Pass |
| Hold-repeat tick | < 1 (1 ms resolution) | < 1 | Pass |
| Strip spend / eraser / undo (short pools) | 21 / 23 / 23 | folds | **Fail** |
| Turn pass | 13 | 58 | Pass / **fail** |
| Step back | 71 | 140 | **Fail** |
| Open a mode | 10 | 19–20 | Pass |
| Leave a mode | 61 | 145 | **Fail** |
| Settings open / close | 12 / 6 | 14 / 6 | Pass |
| Dice open / roll | 8 / 2 | 10 / 2 | Pass |

A fit takes WebKit 2–4× as long as unthrottled Chromium. On an iPhone the transitions will feel like Chromium at about ×3.

### Frame drops

On this Mac, animations ran at a steady 60 Hz in both engines and both styles:
- the score's pop;
- settings and dice opening and closing;
- the roll;
- settings scrolling.

The only dropped frames come from the long tasks above, which block the frame that follows them:

- **A turn pass at 568 × 320.** It leaves one gap of 83–100 ms at ×4 (4–5 missed frames at 60 Hz, 9–11 at 120 Hz) and 133 ms at ×6.
- **Opening a mode at 568 × 320.** One gap of 33–50 ms at ×4 and ×6.
- **Step back and leaving a mode.** They block for 280–320 ms at ×4, which is 16–19 frames at 60 Hz.

At 120 Hz, every transition over 8 ms misses at least one frame. That's every turn pass, every mode and every strip action, even at 952 × 427 unthrottled.

### Rotation and resize (busy board)

These figures are the main-thread task time from the resize until settled, from `TaskDuration`, with the measure and fit counts from the instrumented copy. Chromium in the harness runs four fits per rotation, because the harness suppresses the font-event refit. Chromium in a plain page runs five: see F2.

| Change | Chromium ×1 | Chromium ×4 | Fits (Chromium, harness) | WebKit fit time | Fits (WebKit) | Verdict |
|---|---|---|---|---|---|---|
| Rotate 952×427 → portrait | 89 ms | 333 ms | 4 | 146 ms | 3 | **Fail** |
| Toolbar 952×427 → 952×380 | 70 ms | 307 ms | 3 | 105 ms | 2 | **Fail** |
| Resize 952×427 → 568×320 | 158 ms | 685 ms | 3 | 277 ms | 2 | **Fail** |
| Rotate 568×320 → portrait | 153 ms | 720 ms | 4 | 404 ms | 3 | **Fail** |

### Startup (cold load, busy saved game, 952 × 427)

All figures are in ms from navigation start, as medians of 5 cold contexts.

| | Chromium ×1 | Chromium ×4 | Chromium ×6 | WebKit |
|---|---|---|---|---|
| First contentful paint (the pill and empty board) | 16 | 48 | 72 | 171* |
| All 28 scripts fetched (`jsLastEnd`) | 21 | 58 | 88 | 28 |
| Board inserted (renderBoard ran) | 37 | 130 | 200 | 67 |
| Boot done (app.js and its first fit) | 60 | 230 | 375 | 123 |
| Board painted (frame after the last fit) | 81 | **319** | **513** | 174 |
| Fits during startup | 2 | 2 | 2 | 2 |
| Time in fits | 39 | 173 | 273 | 103 |
| Fresh 4-player game: board painted | 31 | 104 | 162 | 53 |

\*WebKit's first paint varied from 34 to 171 ms between runs and variants, and usually arrived with the board.

- **Verdict.** The busy board marginally fails ×4 (319 against 300 ms) and fails ×6 (513 against 500 ms), with two fits instead of one. A fresh game passes easily.
- **Mana font.** `mana.woff2` (28 KB, `font-display: block`) is fetched by 47 ms at ×4, well before boot, so no symbol shows blank on a local load.
- **Modules.** The modules load in three waves: app.js, then 20 modules, then 6. Locally the scripts take 42 ms of fetch time at ×4. With 5 ms added per request, standing in for a native request interceptor, they arrive 27 ms later and boot moves by about 29 ms.

### Memory over a long session

The script played 360 turns, about 4,000 taps, on the busy board in each engine:
- six life taps a turn;
- a four-repeat hold every 7 turns;
- three mana-mode taps and a save every turn;
- counters every 3 turns, commander damage every 4;
- settings every 30 turns and dice every 20;
- a strip spend and eraser-plus-undo when a strip was open;
- a turn pass.

Chromium sampled after a double GC every 60 turns:

| | Start | Turn 60 | 120 | 180 | 240 | 300 | 360 |
|---|---|---|---|---|---|---|---|
| Live DOM elements | 956 | 820 | 820 | 820 | 820 | 820 | 820 |
| DOM nodes (incl. text, detached) | 1,852 | 1,643 | 1,661 | 1,661 | 1,661 | 1,643 | 1,643 |
| JS event listeners | 425 | 225 | 225 | 225 | 225 | 225 | 225 |
| JS heap used | 1.3 MB | 2.0 | 2.1 | 2.2 | 2.3 | 2.3 | 2.3 |
| Life tap (ms) | 0.3 | 0.4 | 0.3 | 0.3 | 0.3 | 0.3 | 0.4 |

- **Detached nodes.** Heap snapshots found 0 detached DOM nodes at the start and at the end.
- **WebKit.** The live DOM stayed at 820 elements from turn 60 to turn 360, and the tap cost didn't drift.
- **Heap.** The 1 MB of growth levels off. It fits `turnSteps`, which is capped at 200 entries, each with a pool copy.
- **Verdict.** Pass. Rebuilding badge rows with fresh listeners on every render leaks nothing; the old nodes and closures are collected.

## Findings, ranked

### F1. Transitions run a full badge fit, and each fit step restyles the whole board (high)

- **Evidence.** A Chromium trace of a step back at 568 × 320, ×1, on the busy board shows the split:
  - **Restyles.** 138 forced style recalcs take 33 ms, and 15 of them come from `rowFits` inside `fitBadgeSide`'s `fitsAt`.
  - **Layouts.** 118 forced layouts take 12 ms.

  `fitsAt` writes `data-drop` and `--near-badge-size` / `--far-badge-size` on `#board` (`layout/fit.js:189–191`). The type sizes are inherited custom properties, so each write invalidates every element on the board, and the next `rowFits` read pays a restyle of about 1 ms at ×1 and 5 ms at ×4.

  The fit takes that step many times:
  - `fitBadgeSide` searches levels from 0 every time (line 201);
  - it probes wrapping (line 198);
  - its shrink loop steps the type down 0.25 px per restyle (line 229);
  - `fitStrips` walks every strip level with `data-drop` changes (lines 291–325).
- **What triggers it.** Any badge row change, through `requestFit`:
  - a turn pass with automatic emptying, through `showTurn`, which re-renders every tile;
  - a step back that puts pools back;
  - leaving a mode, which re-renders every tile;
  - the eraser and undo clear, where the strip's chips change;
  - a strip spend, where the count changes but the width doesn't (F3).
- **Why the layout count misleads.** Prototype P8 batches the strips so every strip tries a place at once. It cut a step back from 118 to 37 layouts, and the time didn't move (37 → 39 ms at ×1). The per-strip layouts were cheap because each touched one tile. The board-wide restyles are the cost.
- **Fix.** In order:
  1. Write the fit's type sizes on each tile's `.far-edge` and `.near-edge`, not on `#board` (P10). This measured −35% to −50%.
  2. Batch the strip placement (P8). It halves the eraser and undo, because their cost is the strip walk.
  3. Not prototyped: move the drop tokens to the rows too, and keep the last two or three fit results keyed by the P3 signature. Pass/back and mode open/close alternate between two board states, so a small cache would turn most transitions into a lookup.

  These are the steps most likely to bring the transitions under 50 ms at ×4.

### F2. A rotation or resize runs the fit 3–5 times; in Chromium, font events reset and refit it on every resize (high)

- **Evidence.** The instrumented copy logged every call and the event behind it.
  - **Chromium, in a plain page with no test harness:**
    - a rotation runs `loadingdone` (`resetDrops`, then a measure and a fit), the `loading` handler's `document.fonts.ready` refit, the orientation `change`, `resize` and the portrait media query's `change`: **five measures and five fits** of 16–24 ms each at ×1;
    - a toolbar-sized resize runs four.
  - **WebKit:**
    - a rotation runs orientation `change`, `resize` and the media query: three fits of 47–51 ms each;
    - a toolbar resize runs `resize` and the ResizeObserver: two fits.
- **The font events.** Chromium fires `loading` (with no faces) and `loadingdone` (listing Mana, already loaded) on every viewport resize, without fetching anything. `mana.woff2` stays at one resource entry. This reproduced in headless shell, full Chromium headless and headed Chromium.

  app.js treats each `loadingdone` as a new font: it resets the drop levels and refits from full size (`app.js:93–104`). That throws away the hysteresis on every rotation.
- **Why the tests don't see it.** `tests/helpers.mjs` stops trusted `loadingdone` events once fonts are settled, so the suite can't see it.
- **Cost.** 330–720 ms of main thread per rotation at ×4 in the harness (four fits). WebKit spends 146–404 ms fitting.
- **Fix.** Three prototypes, measured together:
  - P7: refit on a font event only when the number of loaded faces has changed;
  - P3: skip a fit whose inputs match the last one;
  - P1: read, then write, in `measureBoard`.

  The results:
  - a rotation runs one real fit, and the rest are skipped;
  - 568 × 320 rotate: 720 → 220 ms at ×4 (P2+P3+P7), and 175 ms with P8–P10 too;
  - 952 × 427 rotate: 333 → 115 → 129 ms (noise);
  - WebKit fit time: 404 → 134 → 79 ms.

  The deep dive's rAF batching isn't needed.

### F3. A strip spend refits the whole board although no width changed (medium; confirms the deep dive)

- **Evidence.** A spend from 4 to 3 at 952 × 427 with short pools costs:
  - 56 layouts and 120 restyles;
  - 9–11 ms at ×1, 38–54 ms at ×4 and 88 ms at ×6;
  - 21 ms in WebKit.

  The trace puts the forced work in `fitStrips`: `lineWidth`'s nowrap toggle (`fit.js:259–264`) and `place` (lines 273–288).
- **Fix.** The deep dive's step 3, prototyped as P3. A signature covers:
  - each row's chips, with every digit read as 0;
  - the board, tile and root attributes;
  - the drop levels;
  - the count of loaded font faces.

  If the signature matches the last fit's, the fit is skipped. A spend then costs 1 layout: 1.1 ms at ×1 and 3.6–5 ms at ×4. Chips use `tabular-nums` (styles.css line 1199), so treating every digit as 0 is safe. A count that changes its number of digits, or a colour that runs out, changes the signature and refits.

  The font-face count is needed because WebKit's late-font path, `loading` followed by `document.fonts.ready`, doesn't reset the drop levels.

### F4. Startup fits twice, and font events can add more (medium)

- **Evidence.**
  - **Boot.** app.js measures three times: `syncBoardTurn` returns early, then `layoutBoard`, then `syncPill`'s shape change. That ends in one fit of 22 ms at ×1.
  - **The ResizeObserver.** Its first callback (`app.js:89`) then measures and fits again: 17 ms at ×1, 87 ms at ×4 and 140 ms at ×6.
  - **Font timing.** When the Mana font's `loadingdone` arrives after app.js has registered, it adds a reset and refit. The `modulepreload` prototype (P6) showed this: its modules ran earlier, so startup ran 3 fits and painted later (357 against 319 ms at ×4).
- **Fix.** P3 skips the observer's repeat fit, and P7 skips font events that load nothing new. With P1–P5 and P7–P9 together:
  - board painted at ×4: 319 → 219 ms;
  - at ×6: 513 → 371 ms;
  - WebKit: 174 → 114 ms;
  - time in fits halves (173 → 95 ms at ×4).

  This passes both startup budgets.

### F5. Opening a mode on a small board costs about 55 ms at ×4 (low)

- **Evidence.**
  - **Cost.** Commander damage or counters at 568 × 320 costs 55 ms at ×4 and 73–76 ms at ×6, with one dropped frame.
  - **Breakdown.** There are 6 layouts and 27 restyles, and 40 of the 55 ms is style recalc, from `data-mode` and the mode layers on `#board` and six tiles.
  - **At 952 × 427.** 20 ms.
- **Fix.** Don't fix it before F1. If it still matters, render the six layers before setting the board's mode attribute, so the board restyles once.

### F6. Glass makes the compositor 5–6× busier while blurred content changes (low until a device says otherwise)

- **Evidence.** These are compositor draw time per second of activity (viz `DrawAndSwap`/`DrawFrame` on SwiftShader), Material against Glass:

  | Activity | Material | Glass |
  |---|---|---|
  | Settings scrolling under its blurred header | 51–71 ms | 284–357 ms |
  | The dice sheet during a roll | 124–140 ms | 730–790 ms |
  | The board idle under the pill | 0 ms | 0–2 ms |
  | Taps on a total next to the pill | 14–18 ms | 14–18 ms |

  The main thread is identical within noise in every interaction table. No frame dropped in either engine at DPR 1 or 3 on this Mac.

  SwiftShader is a CPU-emulated GPU, so the ratio means more than the absolute time.
- **Risk.** An 18 px blur (`--glass-filter: blur(18px) saturate(1.3)`) is redrawn every frame on a low-end Mali or Adreno GPU at DPR 2.6–3, while the settings body scrolls or the die tumbles.
- **Fix.** Only if a device trace shows dropped frames:
  - the dice sheet's blur could drop to `none` while a roll animates;
  - the settings header could switch to its solid fill while scrolling.

  The existing Reduce Transparency fallback is already the solid version.

### F7. `measureBoard` forces a layout per tile (low; confirms the deep dive)

- **Evidence.** Each tile's `--clear-*` write (`layout/board.js:57`) is followed by the next tile's `offsetWidth` read. `fitModeGrids` reads `face.offsetWidth` and calls `growPixel()`, whose `window.innerWidth` forces a layout, after more writes.
  - A size change: 10–12 ms at ×1 and 47–52 ms at ×4 per measure.
  - With P1 (read every face first, then write; reuse the sizes and one `growPixel`): 0.3 ms at ×1 and 1.3 ms at ×4.
- **Why it ranks low.** Measures run only on size, pill or seat changes, and the fits around them cost far more.

### F8. Module loading is not the bottleneck; don't add `modulepreload` (informational)

- **Evidence.** The modules load in three waves: app.js, then 20, then 6. Preloading all 26 from index.html (P6) made them arrive by 24 ms instead of 58 ms at ×4, but boot didn't get faster (242 against 230 ms). It also moved the font event after app.js's listener, which added a fit (F4).
- **Risk.** A real per-request cost in `WebViewAssetLoader` or the iOS scheme handler could change this. With 5 ms added per request, boot moved only about 29 ms. A device trace should confirm it.

### F9. Taps, hold-repeat and memory meet their budgets (informational)

- **Taps.** A life tap is 1 layout and 2–4 ms at ×4–×6. Counter and mana cells are 1 layout and 3–8 ms.
- **Hold-repeat.** Each tick is 0.6–1.1 ms at ×4–×6, with two outliers of 17–20 ms at ×6, probably GC.
- **Memory.** Flat; see the long-session table.
- **Not measured.** Each tap saves the whole game (`JSON.stringify` and a synchronous `writeGame` over the Android bridge, or `postMessage` on iOS) and calls the haptic bridge. A device trace should check the bridge cost (see the device list below).

## The deep dive's P1, confirmed or refuted

| Deep-dive claim | This audit |
|---|---|
| A strip tap forces 113 layouts, 27–35 ms in Chromium, about 90 ms in WebKit (640 × 360) | **Mechanism confirmed, numbers depend on the board.** A spend runs a full fit. On this busy board the strips fold at 640 × 360, so the spend was measured at 952 × 427: 56 layouts, 120 restyles, 9–11 ms in Chromium and 21–24 ms in WebKit. **The layout count is the wrong measure of cost**: cutting layouts by two thirds (P8) saved no time on a step back. |
| Life +1: 0.6 ms, 2 layouts | Confirmed: 0.4–0.8 ms, 1 layout and 2 recalcs. |
| Turn pass from the chip: 5.7 ms, 8 layouts | Confirmed at 952 × 427 (4–5 ms, 6 layouts). At 568 × 320 it's 12–19 ms at ×1 and about 100 ms at ×4, because emptying six pools refits. |
| A resize runs `measureBoard` twice, with 2 fits | Confirmed for WebKit and a toolbar-sized resize. Chromium runs 3–4 in the harness and 4–5 in a plain page (F2), and a rotation runs 3 (WebKit) to 5 (Chromium). |
| Step 1: read, then write, in `measureBoard` | Confirmed and quantified: a size-change measure drops from 12 to 0.3 ms at ×1 and from 52 to 1.3 ms at ×4. It's a small share of a rotation. |
| Step 2: skip a measure whose inputs haven't changed | **Refuted as a saving.** The duplicate measures already cost about 0.1 ms each, because layout is clean by then. The duplicate *fits* are the cost, and step 3 plus P7 remove them. |
| Step 3: skip a fit whose rows haven't changed width | **Confirmed for the case it targets.** A spend drops from 42 to 5 ms at ×4, and a rotation's duplicate fits disappear. It doesn't help the eraser, undo, turn passes or modes, which change the rows. The signature also needs the loaded font count (F3). |
| "Strip taps drop from about 30/90 ms to near zero in the common case" | True for spends. False for the eraser and undo (P8 halves them). |
| Measure each strip's natural width once per level | Prototyped as batching every strip per place (P8): layouts drop by 3–7×, but time drops only where the strip walk dominates (eraser and undo, −50%). |
| Skip rAF batching unless a trace shows rotation dropping frames | Agreed. P3 and P7 take a rotation to one real fit without changing timing semantics or the tests' clock. |

## Prototype savings

Each prototype is a patch applied by a script to a fresh copy of `web/` in the scratchpad. Each was measured in the same session as an unpatched copy of `web/`. The figures are median `total` at ×1 / ×4 in Chromium. The noise between runs is about ±20%, so differences smaller than that are reported as none.

| | Change | Measured saving | Tests run against the copy |
|---|---|---|---|
| **P1** | `measureBoard` reads every face before writing any clearance; `fitModeGrids` and `sizeMapSeats` reuse those sizes and one `growPixel()` | Size-change measure 12 → 0.3 ms (×1) and 52 → 1.3 ms (×4). Nothing on taps or transitions. | With P2–P5 (below) |
| **P2** | Skip `measureBoard` when its inputs match the last call (it still queues a fit) | None measurable: duplicate measures were already about 0.1 ms. | With P1, P3–P5 |
| **P3** | Skip `fitBadgeRows` when a signature matches the last fit's result. The signature covers row chips with digits as 0, board/tile/root attributes, `--ui`/`--ub`, drop levels and loaded faces | Spend 10 → 1.7 ms and 42 → 5 ms. Rotation 568: 720 → 220 ms at ×4. Startup's second fit gone. | With P1, P2, P4, P5 |
| **P4** | Never rewrite a drop token, size or strip place that's already set | Within noise (turn pass 568 ×4: 97 → 74 ms, not repeatable). | With P1–P3, P5 |
| **P5** | `fitBadgeSide` searches from the current level (two measures when nothing changes, not level + 1) | None measurable. | With P1–P4 |
| **P6** | `modulepreload` for all 26 modules | Modules arrive 34 ms sooner at ×4; boot not faster; one extra fit. **Don't.** | – |
| **P7** | Font listeners refit only when the number of loaded faces changed | Chromium rotation: 5 → 4 fits on its own, and 1 real fit with P3. Toolbar resize: 4 → 1. | autodrop, font, native and harness tests, both engines: 27 pass |
| **P8** | `fitStrips` tries each place for every strip at once (one restyle per place, not per strip); stops scanning levels once none folds; skips the final re-measure when nothing changed | Eraser and undo 45 → 23 ms (×4). Layouts on a step back 118 → 38. Step-back time unchanged. | With P1–P5, P7, P9 |
| **P9** | The shrink loop searches the same 0.25 px steps by halves | None measurable on this board. | With P1–P5, P7, P8 |
| **P10** | The fit's type sizes go on each tile's `.near-edge`/`.far-edge`, not `#board` | Turn pass 568 ×4: 97 → 42 ms. Step back: 240 → 149 ms. Leave a mode: 211 → 161 ms. | **8 autodrop tests fail** in both engines. At least one reads `board.style` for the sizes. Two-line coverage and step-order checks also fail and weren't investigated, so P10's behaviour is **unproven** |
| **P1–P5** together | | Spend 42 → 5 ms (×4). Transitions unchanged. | 96 tests pass. Chromium: autodrop, mana, centring, badge-size, turns, font, sizes-fit-phones, sizes-pill-phones, counters, monarch, commander-damage, identity. WebKit: autodrop, mana, centring, badge-size, turns. |
| **P1–P5, P7–P9** | | Startup board painted at ×4: 319 → 219 ms. Eraser and undo 45 → 20 ms (×4). Spend 5 ms. | 62 pass, both engines: autodrop, mana, centring, sizes-fit-phones, badge-size, turns |
| **P1–P5, P7–P10** | | Chromium ×4: step back 568 240 → 124 ms, leave a mode 211 → 133 ms, turn pass 97 → 49 ms, eraser and undo 45 → 22 ms, spend 42 → 6 ms; rotation 568 720 → 175 ms. WebKit: step back 568 140 → 70 ms, leave a mode 149 → 81 ms, turn pass 70 → 37 ms, eraser and undo about 22 → 11–16 ms, rotation fit time 404 → 79 ms. | As P10 |

**What to do, in order.**

1. **P7, P3 and P1** fix the rotation, startup and spend findings (F2, F3, F4, F7). Each is small and passes the layout tests.
   - The test harness's `loadingdone` filter should then be narrowed, so a test can see a spurious font event.
   - Add a test that a Chromium resize runs one fit.
2. **P8** halves the eraser and undo.
3. **P10**, once the autodrop tests read the sizes from where they're written. Then move the drop tokens to the rows the same way, and add a two- or three-entry fit cache keyed by the P3 signature (F1). Only that last step is likely to bring step back and leaving a mode under 50 ms at ×4.
4. **Leave P2, P4, P5, P6 and P9 out.** They measured no saving.

## What needs a real device

- **Absolute numbers.** Android's WebView on a mid-range phone (for example a Pixel 6a) and a low-end one (Android 11 with 3–4 GB of RAM), and an iPhone at the iOS 18 floor. Take `chrome://inspect` and Safari Web Inspector timelines of a step back, leaving a mode and a rotation on the busy board. ×4 and ×6 are CPU-only stand-ins and leave out thermal throttling and memory bandwidth.
- **Chromium's font events on resize in Android System WebView.** These were reproduced only in desktop Chromium builds. The Android WebView may behave differently.
- **Glass on a real GPU.** Frame timing while settings scrolls and the die rolls, at the phone's DPR, on a Mali or Adreno GPU and on an older iPhone. SwiftShader can only show the ratio.
- **The bridges.** The cost of the synchronous `writeGame` JavaScript-interface call and the haptic call on every tap and hold tick (Android), and of `postMessage` (iOS). Neither can be measured in a desktop browser.
- **Startup on a device.** Process start to first board, and the per-request cost of `WebViewAssetLoader` and `WebFolderSchemeHandler`. This decides whether module loading ever matters (F8).
- **120 Hz.** Whether a ProMotion or 120 Hz Android display shows the transitions' missed frames as visibly as the budget predicts.
- **WebKit memory.** Heap growth over a long game in Safari Web Inspector. Only DOM size was measured here.
