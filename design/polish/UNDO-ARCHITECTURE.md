# Undo history: how to store game steps

**Status:** proposal, 23 November 2026, against main `1a9cdb5`. This is the storage half of [MANA-UNDO-SPEC.md](MANA-UNDO-SPEC.md) §6; the behaviour (what a step is, merging, placement) is there.

**The owner asked:** "what does that mean about more efficiently, or intelligently storing the game step. Essentially there you have an append only log, that is likely overkill."

**Short answer:**

- **Store each step as a per-field delta,** only the cells it changed, with before and after values: `{ "d": { "scores": { "2": [38, 37] } } }`.
- **Record it in `commit()`** by diffing the board against the last commit.
- **Merge quick taps** into one step as they happen.
- **Cap the history** at 500 steps and 64 KB.
- **Save it inside the game's own save.** At these sizes the extra write costs under 1ms a tap, and keeping one save means the game and its history can never disagree.

An append-only log, event sourcing and SQLite all solve problems this app doesn't have yet (§5).

---

## 1. What happens today

- **No history exists.** Every action changes `game` in place and calls `commit()` (`web/js/actions/commit.js`), which saves and redraws.
- **The save** is `saveGame()`, which calls `writeSavedGame(JSON.stringify(game))` (`web/js/state/state.js`, `state/platform.js`). It writes the whole game every commit, so every tap.
  - **Android:** `GameBridge.writeGame`, `SharedPreferences.edit().putString(…).apply()`. The in-memory map updates at once, and the XML file is rewritten off the main thread. Writes queued close together are skipped in favour of the newest.
  - **iOS:** `ios.game.postMessage(snapshot)` → `UserDefaults.standard.set`. The plist is flushed asynchronously.
  - **Browser and tests:** `localStorage.setItem`.
- **The only "merging" today** is the screen reader. `announce()` (`render/announce.js`) collapses changes to one tile and kind within 700ms into one message with the final value.
- The mode edit stacks (`edits` in `state/state.js`, applied by `applyEdit` in `logic/rules.js`) live only while a mode is open and aren't saved.

---

## 2. Measurements

**How they were measured:**

- `tools/sizes.mjs` and `tools/timing.mjs` in this session's `design-mana-undo/` scratchpad folder.
- **Sizes** come from a busy 6-player game run through the real `loadGame`: every tracker on, two-digit counters, commander damage from everyone, pools, Turn by turn, the monarch and the initiative, plus the proposed `treasure`, `gold` and `keepMana`.
- **Timings** were taken in the app's own origin in Playwright: 300 runs each, p50 and p95.
  - Chromium, at 1× and at 4× CPU throttle (a mid-range phone).
  - WebKit too, but its `performance.now()` is rounded to 1ms, so it only shows that nothing reached 1ms.

### 2.1 Sizes (bytes of JSON)

| What | Bytes |
|---|---|
| **The whole save today** (busy 6 players) | **986** |
| The whole save with the new fields | 1,081 |
| The board only (the 18 fields that undo restores, §3) | 639 |
| **One tap, per-field delta** `{"t":…,"d":{"scores":{"2":[38,37]}}}` | **48** |
| One tap, patch list `{"t":…,"c":[{"f":"scores","i":2,"b":38,"a":37}]}` | 60 |
| One tap, RFC 6902 JSON Patch, forward and inverse | 129 |
| One tap, a command `{"t":…,"k":"life","i":2,"d":-1}` | 43 |
| Commander damage with a monarch transfer, as a delta | 100 |
| A turn pass that empties six pools, as a delta | 289 |
| A New game, as a delta (every board field, before and after) | 1,163 |

- `t` as milliseconds since the epoch is 13 of each step's bytes. Seconds since the history began would save about 9 bytes a step.
- Merging bursts (MANA-UNDO-SPEC §6.2) makes steps fewer, not bigger: a merged tap is the same 48 bytes.

### 2.2 500 steps, by option

Mix: 448 taps, 30 commander-damage steps with transfers, 20 turn passes that empty pools, and 2 New games.

| Option | 500 steps |
|---|---|
| Full snapshots of the whole save | 540 KB |
| Full snapshots of the board only | 320 KB |
| Patch list, before and after | 42 KB |
| **Per-field deltas, before and after** | **33 KB** |
| Hybrid: deltas plus a board checkpoint every 50 steps | 39 KB |
| Commands (inverse edits) | 25 KB |
| An event log from the start of a long game (2,000 events, no cap) | 101 KB, or 114 KB with checkpoints every 100 |

### 2.3 Cost per tap (stringify and `localStorage.setItem`)

| What's written each tap | Bytes | Chromium 1× p50 / p95 | Chromium 4× p50 / p95 |
|---|---|---|---|
| **Today:** the game | 1.0 KB | 0.0 / 0.0ms | 0.0 / 0.1ms |
| The game with 500 deltas inside | 25.5 KB | 0.1 / 0.2ms | **0.5 / 0.9ms** |
| The game with 500 board snapshots inside | 278 KB | 0.5 / 0.6ms | 2.0 / 2.5ms |
| Diffing the board and copying the baseline (no write) | | 0.0 / 0.1ms | 0.0 / 0.1ms |
| 500 deltas alone, under a separate key (one debounced write) | 25 KB | 0.1 / 0.2ms | 0.4 / 0.9ms |
| 500 snapshots alone, under a separate key | 277 KB | 0.4 / 0.5ms | 1.9 / 2.5ms |

(The benchmark's 500 steps were all taps, so 25.5 KB rather than §2.2's mixed 33 KB.)

**What this says:**

- **Deltas in the same save** add about 0.5–0.9ms a tap on a throttled CPU, far inside a frame. A tap already spends far more than that on redrawing and fitting.
- **Snapshots** cost about 2.5ms a tap, and 300–540 KB per save.
- **Write amplification** for a game of about 1,000 commits:
  - today: about 1 MB through the bridge;
  - deltas in the save: about 25–33 MB;
  - snapshots in the save: about 280–540 MB.
  - Writing tens of megabytes to flash over an evening is trivial. Hundreds of megabytes isn't harmful, but it's wasteful, and it's 280 KB crossing JNI or `postMessage` on every tap.
- **Not measured here: the native bridges on a device.** A JNI string copy and an `apply()` of 33 KB, or a 33 KB `postMessage` to UserDefaults, should cost about the same as the page side. Measure it on the Pixel and an iPhone before M4 ships (§8), against the budget in §6.

---

## 3. What's stored, whatever the option

- **The board fields** are what undo restores: `startingLife`, `scores`, `rotations`, `colors`, `poison`, `casts`, `energy`, `experience`, `rad`, `identities`, `commanderDamage`, `pools`, `treasure`, `gold`, `keepMana`, `turn`, `monarch` and `initiative`.
- **Never stored:** settings, `landscapeAngle` and the history itself.
- **Why this list:** New game can change any of these, and undoing a New game must bring them all back. Settings are never steps (MANA-UNDO-SPEC §6.3).

---

## 4. The options compared

| | 1 · Snapshots, ring buffer | **2 · Per-field deltas** | 3 · Inverse edits (commands) | 4 · Append-only event log | 5 · Checkpoints + deltas |
|---|---|---|---|---|---|
| **500 steps** | 320–540 KB | **33 KB** | 25 KB | Unbounded unless capped; capping it makes it option 3 or 5 | 39 KB |
| **Per-tap save, with history in the save** | 2.0 / 2.5ms at 4×, 278 KB written | **0.5 / 0.9ms, 26–33 KB** | About the same as deltas | About the same, growing all game | About deltas |
| **Recording** | Copy the board each commit | Diff the board at `commit()`: one place, automatic | Each action builds its own command with an inverse: about 15 actions, each its own code | Each action emits an event; the state is a fold over them | Diff, plus a copy every N |
| **Forgetting a field** | Can't: everything is copied | Can't, if the field is a board field. A test fails if a new `Game` field is in neither the board list nor the settings list (§7). | **Easy:** a new effect inside an action (a handoff, auto-empty) with no inverse silently isn't undone | **Easy,** and worse: replay diverges from what happened | As deltas |
| **Undo** | Restore the snapshot before the step. But that also restores excluded fields (a colour changed since), so it needs field filtering anyway. | Apply the step's before-values to its cells only | Run the inverse | Replay from the start (or a checkpoint) up to step − 1 | Apply deltas back from the nearest checkpoint, or the before-values directly |
| **Redo branch discard** | Truncate the ring at `at` | Truncate `steps` at `at` | Truncate the command list | Branches need extra structure; a log is append-only | Truncate deltas; drop checkpoints past `at` |
| **Merging a burst** | Keep the first snapshot, drop the rest: easy | Keep the first before-values, update the after-values: easy, and the net change is exact | Sum the deltas: easy for counts; a handoff inside a burst needs care | Merge events or leave raw; replay is unaffected | As deltas |
| **New game** | One snapshot | One delta of every board field (1.2 KB) | Needs a snapshot anyway: there's no inverse for "reset everything" | A checkpoint | A checkpoint |
| **Old saves and schema changes** | A snapshot is a whole old board, so a field whose meaning changes poisons every snapshot | Only the fields a step touched; validate each cell with that field's own check | Commands encode rules: a rules fix changes what an old command's inverse does | **Replay depends on today's rules giving yesterday's results.** A fix to the monarch's handoff, or a random shuffle not stored as its outcome, rewrites history. | As deltas |
| **Corrupt history** | Validate 500 boards | Validate cells; stop at the first bad step | Validate commands; an inverse may still throw at undo time | A bad event breaks every state after it | Validate checkpoints and cells |
| **Layout cost of an undo** | Restoring the whole board means redrawing every tile unless it's diffed first | Only the cells changed, so `dirtyFrom(changes)`: one tile for a life tap | One tile | Recompute everything | As deltas |
| **Testability** | Simple | Pure diff and apply functions, property-testable on random games | One test per command and its inverse | Replay determinism tests | As deltas, plus checkpoint tests |
| **Complexity** | Lowest | Low: three pure functions, one hook | Medium–high | High | Medium |

**Why the event log (option 4) is overkill here:**

- **What it's for:** an audit trail, sync between devices, or replaying and analysing a game.
- **What undo needs:** only the last few hundred steps and their before-values.
- **Its costs:**
  - deterministic replay, which means storing every random outcome and keeping old rules runnable forever;
  - unbounded growth, unless you add checkpoints (option 5), at which point you've built deltas with extra steps;
  - a longer path for every undo.
- **When it would be worth it:** if the owner later wants to replay or share whole games, or stats across games, or sync between two devices. Then an event log (stored as in §5's option b) is the right base, and the undo history can stay as it is beside it.

**Why not snapshots (option 1)** even though they're simplest:

- They're 10–16 times larger, about 2.5ms per tap with history in the save, and 280 KB across the bridge per tap.
- They still need per-field filtering, so that undoing a life tap doesn't revert a colour picked since. Once you filter by field, you've written option 2.

**Why not commands (option 3):**

- They're the smallest, and `rules.js` already has `damageEdit`, `countEdit`, `designationEdit` and `manaEdit`.
- But most steps aren't Edits: life at rest, spends, the eraser, turn steps with auto-empty, handoffs at rest, "Who goes first?" and New game. Each would need a hand-written inverse.
- Forgetting a side effect is the classic command-pattern bug, and it fails silently.
- Deltas get every side effect for free, because they look at what changed, not at what was meant.

---

## 5. SQLite

| | (a) SQLite in the page (WebAssembly) | (b) The platforms' SQLite through the bridge |
|---|---|---|
| What it needs | `'wasm-unsafe-eval'` in the CSP, which AGENTS.md forbids (`default-src 'none'`, every fetch directive `'self'`); about 1 MB of wasm; OPFS or a file to persist in, which WKWebView makes awkward | New bridge methods on both apps (append a step, truncate after `at`, read a range, clear): `GameBridge` in `MainActivity.kt` (and `androidMethods`, `check-bridge.sh`), a message handler and an initial-history injection in `LifePodApp.swift`, a `localStorage` stand-in for the browser and the tests, and `types/globals.d.ts` |
| What it buys | Nothing (b) doesn't, at a cost the invariants rule out | Appends of about 48 bytes instead of rewriting a 33 KB blob; crash-safe transactions; queries over a long log |
| Verdict | **No** | **Not now.** At 33 KB and under 1ms a tap there's nothing to fix. |

**Where the line is:**

- SQLite (b) becomes worth it if the owner wants **game history or stats across games** (a log that outlives New game and grows past about 1 MB), **search and filtering** over it, or a **sync and export** feature.
- At that point the event log (§4 option 4) belongs in SQLite. Undo would stay as deltas over the current game, or move into the same database as one more table.

---

## 6. Recommendation

**Per-field deltas, recorded in `commit()`, merged as they happen, capped, and saved in the game's own save.**

| Decision | Choice | Why |
|---|---|---|
| Format | `{ "t": seconds since the history began, "k"?: kind, "n"?: taps merged, "d": { field: delta } }`. A per-player field's delta is `{ "index": [before, after] }`, a grid's (`pools`, `commanderDamage`) is `{ "i": { "j": [before, after] } }`, and a scalar, `turn` or an array whose length changed is `[before, after]`. | It's the smallest form that undoes and redoes without the rules, and readable in a save. |
| Recording | `commit({ …, step })`: diff the board fields against the last commit's copy, record unless `step === false`, then copy the board as the new baseline | One choke point already exists. Side effects are caught automatically. The diff and copy measured 0.1ms p95 at 4×. |
| Merging | Stored merged (§6.1) | |
| Cap | 500 steps **and** 64 KB serialised; drop the oldest first | 500 typical steps are 25–33 KB; 64 KB bounds a game of many New games or huge turn passes. |
| Where it's saved | **In the same save** as `game.history`, written with the game on every commit | **Measured:** 0.5–0.9ms a tap at 4× CPU. One write means the game and its history can never disagree after a kill, and it needs no native changes. |
| Fallback | If the device check (§8) shows commit p95 above 4ms, or the bridge write above 2ms: move history to a **second key written on idle** (1.5s after the last step) and on `pagehide` or `visibilitychange`. The game stores `historySeq`, the history stores `seq`, and on load a mismatch (a kill before the flush) drops the history, never the game. | Same API (`state/history.js`), so only the store changes. Costs two bridge methods per app. |

### 6.1 Merged steps or raw taps?

| | **Store merged steps** (recommended) | Store raw taps, group them at undo time |
|---|---|---|
| Size | One step per burst | One step per tap: 3–10 times more steps, and 500 steps cover much less of the game |
| The merge rule | Decided once, when the context is known (open mode, turn, which tile, the timer) | Re-derived from timestamps and kinds at undo time; a mode opening or a turn pass between taps must also be logged to know where bursts end |
| What one Undo does | Exactly what the toast and the running delta showed | Must match the same grouping, or the delta lies |
| Fine-grained undo later | Lost within a burst | Possible |
| Code | `record` merges into the open step: keep before, update after, count `n`, and drop the step if the net change is zero | Grouping logic in two places (the delta display and undo) |

Merged wins. Its one loss, undoing a single tap inside a burst, is what the owner has accepted by allowing the merge.

### 6.2 Module placement (AGENTS.md import order)

| Module | What | Imports |
|---|---|---|
| `logic/data.js` | `historyFields`, `settingsFields`, `historyCap` (500), `historyBytes` (64 KB), `mergeWindow` (1500ms), `historyVersion` (1) | — |
| `logic/history.js` (new, pure) | `boardOf(game)`, `diffBoard(before, after)`, `applyStep(game, step, 'b' \| 'a')`, `mergeStep(open, next)`, `trimHistory(history)`, `describeStep(step, game)` and `fitHistory(saved, game)` | `data.js`, `save.js` (the `fit*` checks) |
| `logic/save.js` | `loadGame` calls `fitHistory` for `game.history`; the `Game` and `History` typedefs | `data.js`, `history.js` |
| `state/history.js` (new) | The baseline copy, the open bursts and their timers, and `record()`. If the fallback is taken, the second key's read and write through `state/platform.js`. | `logic/*`, `state/state.js`, `state/platform.js` |
| `actions/commit.js` | The hook: `record(diffBoard(baseline, game), step)` before `saveGame()` | `state/history.js` |
| `actions/history.js` (new) | `undo()`, `redo()`, `jumpTo(at)`: `cancelPresses()`, `applyStep`, `commit({ step: false, …dirtyFrom })`, the toast and the announcement | `logic/`, `state/`, `render/`, `ui/` |
| `render/history.js` (new) | The History sheet's rows, the toast and the running delta | `logic/`, `state/`, `ui/` |
| `app.js` | Wires the Undo button (`bindStep`: tap undo, hold History) | everything |

`logic/history.js` is about 200 lines, `state/history.js` about 80 and `actions/history.js` about 120, all under the 500-line cap.

---

## 7. Correctness and tests

**Risks and how each is closed:**

| Risk | Guard |
|---|---|
| A new `Game` field nobody classified, so undo forgets it | A `node:` test asserts that every key of `loadGame`'s defaults is in exactly one of `historyFields` or `settingsFields`. A new field fails the build until someone decides. |
| An action that changes the board without `commit()` | It already breaks saving today (DEEP-DIVE §2.1). The diff sees it at the next commit anyway, and attributes it to that step. |
| An excluded action's change attributed to the next step | Excluded actions call `commit({ step: false })`, which refreshes the baseline. The test is an identity toggle, then a life tap, then undo: the identity stays. |
| A corrupt or hostile history breaking the game | `fitHistory` never throws. It validates every cell with the field's own check, walks back across player-count changes, stops at the first bad step and clamps `at`. The worst case is an empty history; the game is untouched (AGENTS.md). |
| A redo after a settings change | Redo writes only the step's cells. Excluded fields are untouched unless the step itself set them. |
| History and the game disagreeing after a kill | They're one save, written atomically. (With the fallback, `historySeq` and `seq` drop a stale history.) |

**Property tests** (fast-check, `tests/logic.test.mjs`, `PBT_RUNS`):

- **undo ∘ do = id:** for a random game and a random action (life, counter, damage with transfers, mana, Treasure, Keep, turn pass with auto-empty, New game with a count change), `applyStep(after, step, 'b')` deep-equals before.
- **redo ∘ undo = id:** `applyStep(applyStep(g, s, 'b'), s, 'a')` deep-equals g.
- **Sequences:** after k random steps, undo all gives the start, and undo j then redo j gives the same game.
- **Branch discard:** any new step after an undo leaves `steps.length === at`.
- **The cap:** `steps.length ≤ 500` and the serialised size ≤ 64 KB after any sequence.
- **Merging:** a burst's merged step equals the composition of its taps; a net-zero burst leaves no step; a merge never crosses a step that touched the same cells.
- **`fitHistory`:** arbitrary JSON never throws, and a valid history round-trips through `JSON.stringify` and `fitHistory` unchanged.

**Browser:**

- `undo.test` (MANA-UNDO-SPEC §13).
- A Chromium perf test: `commit()` with a full history under 4ms p95 at 4× throttle; a life-tap undo calls `renderScore` once and `layoutBoard` never.

---

## 8. Migration and versioning

1. **v1 ships in M4** as `game.history = { v: 1, at, base: <epoch ms>, steps }`.
   - Saves from before M4 have no `history`, so they load with an empty one.
   - No existing field changes meaning, so there's no game version bump.
2. **A board field's meaning changes later** (as `identity.background` did, with `identitySettingsVersion`):
   - bump `historyVersion`;
   - either migrate each step's cells for that field with the same function that migrates the game, or drop the history.
   - Dropping is always allowed: losing undo history on an upgrade is acceptable; losing the game isn't.
3. **A new board field** joins `historyFields`. Old steps simply don't mention it, which is correct: they didn't change it.
4. **A removed board field:** `fitHistory` drops cells for fields it doesn't know and keeps the rest of the step. A step left empty is dropped.
5. **Before M4 ships,** measure on a Pixel (Android System WebView) and an iPhone:
   - `commit()` with an empty history and with 500 steps;
   - the time in `writeGame` and `postMessage` (a timestamp around the bridge call);
   - p95 over 300 taps.
   - If commit is above 4ms or the bridge above 2ms, take the §6 fallback before shipping.
