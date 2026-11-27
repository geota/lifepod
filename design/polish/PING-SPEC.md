# Ping the board: group life changes, Again, and one Undo

**Status:** design only, 26 November 2026, against main `fa1066b` (v0.1.0-alpha.20). Nothing is built.

- The mock-ups are drawn on the real app: Playwright with `bypassCSP`, over the page `scripts/serve.mjs` serves, with the panel and the chip injected as CSS and DOM. The totals, the running deltas' placement (`placeLifeDelta`), History, the toasts and Undo are the app's own; the History rows and toasts marked "proposed" have their words replaced. The images and the review page are `design-ping/index.html` in the session's scratchpad; the tools are beside them in `design-ping/tools/`.

**The owner's words:**

> "I am thinking about pinging the board. This should be a design session. Idea is for some game actions, all enemies (sometimes everyone) gets pinged 1. Is there a design that's better than the current just click everyone... this is worse with the ninja commander and the all enemies are getting pinged by mana cost and they are dropping bombs. We may not build this, but just thinking of a way that someone could easily ping all enemies and repeat that game action, plus roll it back all at once."

## 1. The problem

Today a group effect is a tap or a hold on every target's −. Yuriko, the Tiger's Shadow revealing a 9 at 4 players is 27 taps, and three ninjas connecting is 60 or more. Each target gets its own running delta and its own History row, so rolling the trigger back is three Undos (one per tile), and a mistake mid-way leaves the table unsure which totals are right (`today-*`, `today-history`).

What the cards ask for (Oracle text from the Scryfall data in `data/cards.json`, 26 November 2026):

| Shape | Cards | What the panel does |
|---|---|---|
| Each opponent loses N | Yuriko ("Each opponent loses life equal to that card's mana value"), Mirkwood Bats; as damage, Impact Tremors, Purphoros | **Each opponent**, −N |
| Each opponent loses N **and you gain N** | Zulaport Cutthroat, Cruel Celebrant, Bastion of Remembrance ("each opponent loses 1 life and you gain 1 life") | Each opponent, −N, **You +N** |
| Each opponent loses N, **you gain the total** | Gray Merchant of Asphodel, Kokusho, Exsanguinate ("You gain life equal to the life lost this way") | Each opponent, −N, **You +total** |
| Each player loses N | Pestilence, Earthquake (damage to each player), Putrid Warrior | **Each player**, −N |
| Each player gains N | Centaur Peacemaker, Fall to Earth, Putrid Warrior | Each player, +N |
| One player loses N, you gain N | **Blood Artist** ("target player loses 1 life and you gain 1 life"), Sanguine Bond, Vito | **Pick** one seat, −N, You +N |

The brief lists Blood Artist under "each opponent". It targets one player; the panel covers it with Pick and Again, which is the common case (a sacrifice loop aimed at one opponent).

## 2. The recommendation

1. **A group-life chip on each tile's near row** opens a **panel on that tile**, facing its player. The tile it came from is "me".
2. The panel holds **who** (each opponent, each player, or the seats picked on a map of the table), **how much** (a stepper that starts at −1, with a keypad for big numbers) and **what you gain** (nothing, the same N, or the total lost). One solid-lime button applies it.
3. After the first press the button reads **Again** and the panel stays open. Each target's running delta shows the whole run (−19), and the panel counts it (×3 · −19 each). The amount can change between presses (Yuriko's 7, 3 and 9).
4. **A run is one history step** across every tile it touched: one Undo rolls the whole run back, and History shows one row ("each opponent −19 over 3").
5. The undo toast goes on **the actor's tile**, with Redo; each target shows the change going back as its running delta (+19).
6. It's opt-in: **Settings → Track → Group life**, off by default. Off, nothing changes.

## 3. Entry points considered

*Mocks: `entry-A-chip-*`, `entry-B-hold`, `entry-C-delta`, `entry-D-counters`.*

| | **A. A chip on the near row** (recommended) | B. Hold your own total | C. From the running delta | D. A cell in counters mode, or a Track tab | E. History's toolbar |
|---|---|---|---|---|---|
| Who is "me" | The tile the chip is on | The tile held | Unknown: the burst is on an opponent | The tile the cell is on | Unknown: History faces the phone |
| Taps to the first ping | 2 (chip, Apply) | 2 | Taps on one opponent first, then 1 | 3 (mode, cell, Apply) | 3 or more (hold Undo, button, pick a seat) |
| The pill | Untouched | Untouched | Untouched | A fourth mode button where the pill isn't collapsed, which doesn't fit at 568 × 320 | Untouched |
| The table sees it | Yes: the board stays at rest, the deltas show on every target | Yes | Yes | **No:** a mode hides every total, and nobody else can tap life until ✓ | Under a modal scrim |
| Conflicts | Costs one chip in the near row | **The total isn't a target.** The − and + halves cover the whole tile, a press counts the moment the finger lands, and a hold repeats after 500ms, so a hold on the total is already −1, −1, −1. Carving a hold zone out of the halves takes the middle of the most-used target. | The capsule isn't a target and sits inside the halves' tap area; it needs one opponent done by hand first, and "every other opponent" depends on whose effect it was, which the capsule doesn't know | Mode Undo stops at the mode's start; the totals the run changes are hidden while it runs | Buried behind a hold, faces the wrong way |

**A, because** it's the only one that knows who "me" is without asking, faces that player, leaves every other tile live, and needs nothing from the pill.

The chip is round like the flag and outlined in the seat colour like a Start chip, with a "ping" glyph (a dot with waves to both sides), at the **end** of the near row. It's a control, so it's never dropped (SPEC §3.2), with the turn chip's 64 × 44 target. In the mocks it fits every near row on one line at 952 × 427, 568 × 320 with 2 and 6 players, and alongside a poison count.

## 4. The panel

*Mocks: `panel-*`.*

The panel covers the actor's own face (their total, rows and halves) inside the pill's clearances, as a mode layer does, but only on that tile. Every other tile stays at rest and can be tapped.

### 4.1 Layouts, measured in the mocks

| Layout | Where (the face as its player reads it) | Seen at |
|---|---|---|
| **Wide** | 400px wide or more, 180px tall | 952 × 427 at 2–4 players, every iPad board (scaled up to 2×) |
| **Compact** | 280–400px wide, 180px tall | 952 × 427 at 5–6; 852 × 393, 640 × 360 and 568 × 320 at 2–3 |
| **Narrow** | anything smaller | 852 × 393 and 640 × 360 at 4–6, 568 × 320 at 4–6 |

- **Wide and compact:** two columns. On the left, the presets (**Each opponent · Each player**; "Opponents · Everyone" in compact) over **the map**: the table as this player sees it, each seat in that player's own tile colours (the damage map's seats), the targets lit with what they'll lose (−3), the others dimmed with their number (P1), and "You" dashed, showing your gain (+9). A tap on a seat toggles it, which is Pick. On the right, the amount, **You**, and the commit row. ✕ ends the top row in wide and starts the commit row in compact.
- **Narrow:** three rows of exactly 44px: the presets as three mini maps (opponents lit, everyone lit, Pick) and ✕; the amount; You and Apply. Pick replaces the lower two rows with the map until a preset is chosen again (`panel-small-6-pick`).
- Checked across 952 × 427, 852 × 393, 640 × 360, 568 × 320 and 1366 × 1024 at 2–6 players, in the rest, Again, keypad and Pick states: every control is 44px or more, inside the face and clear of the pill, **except at 5 players**, where the actor's seat beside the pill (the mocks used seat 4) puts Pick and the compact layout under the pill. The build's layout pass has to cover 5 players' end and split seats.

### 4.2 Who

- **Each opponent** (the default): every other player who isn't out (`isOut`), worked out again at each press, so a player who goes out mid-run drops out of the next press.
- **Each player:** everyone still in, you included. You is hidden (you lose too).
- **Pick:** the seats tapped on the map. A seat that goes out leaves the pick. An out seat is drawn "Out" and can't be picked.

### 4.3 How much

- A stepper: **−** makes it more negative, **+** less, skipping 0 (−1 → +1), so "each player gains 4" is reachable; the value is the life total's own weight, in `--life-out` for a loss and the seat colour for a gain, 40px (34px compact, 32px narrow, × the iPad's scale).
- Hold − or + to repeat, as the life halves do.
- **Tap the value to type** (dotted underline). The keypad takes the panel: 1–9, 0, ⌫ and ✓, in three columns where the face is 190px tall or more (the iPad's scale counted) and four by three where it isn't (narrow, and 952 × 427's 187px faces). Its ✓ shows the value on narrow (−9). The sign stays the stepper's. Yuriko's 9 is three taps: the value, 9, ✓.
- It remembers the last amount and recipe per seat until a new game.

### 4.4 You

Two toggles, at most one on, showing the numbers live: **+N each** (Zulaport) and **+total** (Gray Merchant: N × the targets other than you). With one opponent they're the same, so there's one ("+9 you"). Hidden for gains and wherever you're a target. **Recommended: drain is first-class through this row** rather than a separate "Drain" preset, because the two kinds of drain (the same N, the total) are both common and need the number shown before the press.

### 4.5 Apply, Again, and taking one back

- The commit button is the panel's one solid lime (`--commit-fill`; STYLE.md Accent L3). Wide: "Each opponent −1", "Each player −1" or "Player 4 −1"; compact and narrow: "Apply".
- After the first press it reads **Again** (narrow: "Again ×4"), and a **↶** appears beside it: "take one back", which applies the last press in reverse inside the run (the net change, as a life burst nets −3 then +1).
- The count line under the value says the run so far: "×4 · −4 each · you +4", or "×3 · −19 each" when the amounts differed.
- The panel closes on ✕, Android back, a board mode opening, or a new game. It doesn't close by itself (question P3).

## 5. Feedback on the board

*Mocks: `applied-*`, `again-*`, `yuriko-*`, `out-pixel-4`.*

- Each target shows **the run so far as its running delta**, centred above its total by `layout/delta.js` as built (−9, then −19), from the **first** press: one press can be 9 life, which a total alone doesn't say. A small dot in the actor's seat colour leads the capsule, so the table sees whose effect it was.
- The actor's gain shows on the panel's map seat ("You +9") and in the count line; their total is under the panel until it closes.
- The deltas fade when the run ends (deltaFade), as a life burst's do.

## 6. Undo and History

*Mocks: `toast-*` (proposed), `toast-today-*` (today's toasts on a group step), `history-proposed`, `history-group-today-words`, `today-history`.*

### 6.1 One step per run (recommended)

The owner asked to "roll it back all at once", so **a run is one step**, built on the burst rules of MANA-UNDO-SPEC §6.2a:

- A run's merge key is the actor's tile: `group:i`. Presses merge while **the panel stays open and the recipe (who, and what you gain) is the same.** Changing the amount doesn't end a run; changing who or You does, and the next press starts a new step.
- **No 1.5s window:** Yuriko's reveals and a sacrifice loop take seconds each. The run lasts while the panel is open.
- What else ends it, as for any burst: Undo, Redo or a History jump; a mode opening; any step that isn't a merging tap; and **a step that touches a target's cells** (another player tapping their own life mid-run closes the run, so nothing moves past it).
- **Undo in the pill during a run** takes back the whole run so far; the panel stays open at ×0. ↶ in the panel takes back one press.
- **The alternative, one step per press,** keeps Undo fine-grained, but seven Blood Artist presses become seven Undos, which is what the owner wants gone. ↶ covers the overshoot by one.

**A player going out** on a press hands on the monarch and the initiative inside the same step (`handOn`, CR 726.4 and 727.4, Turn by turn only, as today), so one Undo brings back the player and the crown. Unlike a life burst, the run doesn't end there: the next press skips the player.

### 6.2 How a step says it

The step gets `k: 'group'`, `n` (presses) and `g`, the recipe: `{ by: 2, to: 'o' | 'a' | [seats], you: 0 | 1 | 2 }`. `describeStep` words it from `g` and the deltas:

| Run | History row (who · what) | Toast and announcement |
|---|---|---|
| Yuriko, one reveal | Player 3 · Coral · each opponent −9 | Undid each opponent −9 |
| Yuriko, three reveals | each opponent −19 over 3 (−7, −3, −9)* | Undid each opponent −19 ×3 |
| Zulaport ×4 | each opponent −1 ×4, +4 | Undid each opponent −1 ×4, +4 |
| Gray Merchant, devotion 3 | drain 3: each opponent −3, +9 | Undid drain 3 |
| Pestilence ×2 | each player −1 ×2 | Undid each player −1 ×2 |
| Blood Artist ×4 at Player 4 | Player 4 −1 ×4, +4 | Undid Player 4 −1 ×4, +4 |

\* The per-press amounts aren't in the step (it stores only before and after); the row says "−19 over 3". Keeping the list costs a few bytes per press in `g` (question P5).

The dot is the actor's; every target's own result is in the row's accessible name and the announcement, not the row text.

### 6.3 The toast

- Today's `feedback()` puts a toast on every tile a step changed (`toast-today-*`): three to five chips, each "Undid life 15 → 24", which on short tiles take every near edge for 4 seconds.
- **Proposed:** one toast, on **the actor's tile**, facing them: "↶ Undid each opponent −19 ×3 [Redo]". Each target shows the change going back as its running delta (+19, with the actor's dot) for the toast's 4 seconds. The actor's tile has the toast even when the run didn't change their total.
- On a short tile the toast takes the near edge, and its "Undid" label drops first, as built (`toast-small-6`).

## 7. Accessibility

- The chip: "Group life, Player 3". The panel: a `group` named "Group life, Player 3", focus on Apply when it opens and back to the chip when it closes; Escape and Android back close it.
- Presets and You are toggle buttons (`aria-pressed`); map seats are "Player 2, Sky, target" toggles; the value is "Amount −9. Type an amount"; the keypad keys are plain buttons; ↶ is "Take one back".
- **Announcements** (polite, through `announce`, one kind, so quick presses collapse to the latest within its 700ms):
  - "Player 3: each opponent loses 9. Player 1, 22. Player 2, 15. Player 4, 29."
  - With You: "… Player 3 gains 9, 36."
  - Again: "Again, 4 times: each opponent −4. Player 1, 27 …"
  - Going out: "Player 2 is out", then any handoff, as today.
  - Undo: "Undid: Player 3, each opponent −19 over 3."
- The deltas stay silent (`aria-hidden`), as built.

## 8. Edge cases

| Case | Behaviour |
|---|---|
| A player already out | Not an opponent any more: skipped by the presets, drawn "Out" on the map, can't be picked. |
| Life to 0 and below | Allowed, as today; the total turns `--life-out` with "Out". "+total" counts the full N for every target, since life lost below 0 is still lost. |
| A target goes out mid-run | Their handoff joins the step; the next press skips them (`out-pixel-4`). |
| Commander damage | Not this. A group step never touches `commanderDamage`, and moves no monarch or initiative: CR 726.3 and 727.3 need combat damage. Yuriko's ninja dealing combat damage to the monarch is entered on the damage map, as today. |
| Damage, not life loss (Pestilence, Earthquake, Impact Tremors) | Entered as life loss. Prevention and lifelink aren't tracked. |
| Poison: "Each opponent gets a poison counter" (Infectious Inquiry, Infectious Bite) | Out of scope, but it belongs here later: a **Life · Poison** switch at the panel's top, the same targets and the same group step over `poison`. |
| The panel open and its player needs their own life | ✕ closes it (the run ends), and the halves are back. |
| Undo, Redo or History while the panel is open | The run ends first, then Undo takes it back whole; the panel stays open with the count at 0. |
| A mode, a new game, or Settings opens | The panel closes and its run ends. |
| Rotate seats | The panel turns with its tile, as a mode layer does. |

## 9. Data and settings

- `game.groupLife: boolean`, default false, a settings field (`settingsFields`), kept by `loadGame` only when exactly `true`. Old saves load with it off.
- History: `'group'` joins `stepKinds`; a step may carry `g`, checked by `fitHistory` (a bad `g` is dropped and the row falls back to today's per-tile words; the step stays). Old saves have no `g`, so nothing migrates. A run is one step whatever its presses, so the 500-step and 64 KB caps are unaffected (a 6-player step is about 200 bytes).
- The last recipe per seat isn't saved (a relaunch starts at each opponent −1).

## 10. Build estimate

About **six working days**, in four milestones, each shippable behind the switch:

| | Work | Days |
|---|---|---|
| G1 | `logic/rules.js`: a pure `groupChanges(game, recipe)` (targets, out players, You); `logic/history.js`: `k: 'group'`, `g`, `describeStep`, `fitHistory`; property tests (a run's step equals the presses composed; Undo restores every target; out players never change) | 1 |
| G2 | The panel: `render/` and `layout/` for the three layouts, the map (shared with the damage map's seat placement), the keypad; the 44px and pill sweep at 2–6 players (5 players needs its own pass) | 2 |
| G3 | `state/history.js`: the `group:i` run (no window, closed by the panel), the running deltas from the first press with the actor's dot, ↶, the actor-only toast, the announcements | 1.5 |
| G4 | Settings → Track switch, the chip and its fit, back and Escape, GUIDE.md and SPEC.md, the full test suites | 1.5 |

## 11. Questions for the owner

| # | Question | Recommendation |
|---|---|---|
| P1 | **Entry: the near-row chip (A)?** Or one of B–E. | A: it knows who "me" is, faces them and leaves the pill and every other tile alone. |
| P2 | **Behind a switch, off by default?** Or on for everyone. | Off by default, in Settings → Track, so tables that never ping see no new chip; the aristocrats and Yuriko player turns it on once. |
| P3 | **Should the panel close by itself?** It covers its player's own total and halves while open. | No: a run lasts while the panel is open, and Yuriko's reveals take seconds. ✕ closes it. If players forget it, close it after 30 seconds without a press. |
| P4 | **One step per run, or one per press?** | One per run, with ↶ for the overshoot: "roll it back all at once". |
| P5 | **History: "−19 over 3", or the list of amounts ("−7, −3, −9")?** The list costs a few bytes per press. | Keep the list for runs of up to 10 presses, so a Yuriko turn reads back exactly; longer runs say "over N". |
| P6 | **The toast: only on the actor's tile (deltas going back on the targets), or today's toast on every tile?** | The actor's tile only: one Redo, and the near edges of short tiles stay free. |
| P7 | **Drain as the You row (+N each / +total), or a fourth preset "Drain"?** | The You row: both drains are common, and each needs its number shown before the press. |
| P8 | **Poison later?** A Life · Poison switch at the panel's top. | Yes, once Group life ships; same targets, same step. |
| P9 | **Build it now?** The owner said it may not be built. | Build G1–G3 behind the switch first and play a Yuriko and an aristocrats game with it; the cost is about six days. |
