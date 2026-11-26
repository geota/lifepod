# Treasure, Gold, Keep and lighter floating mana (M2 and M3): design spec v2

**Status:** built (see the as-built note below), 26 November 2026; first a proposal for the owner's review, against main `90aa09e` (v0.1.0-alpha.18). It replaces MANA-UNDO-SPEC.md §2 (Treasure and Gold), §3 (floating mana), §4 (Keep) and §7–§10 for the parts M2 and M3 build. MANA-UNDO-SPEC's §1 (the rules), §5 (the icon, built as M1) and §6 (Undo, built as M4 and M5) still stand.

- The mock-ups are drawn on the real app: Playwright with `bypassCSP`, CSS and DOM injected over the page that `scripts/serve.mjs` serves, with page code run through `inPage()` from `design/polish/lib.mjs`. The fit, the pill, Track, Undo, the toast and the History sheet are the app's own code. Only the new cells, chips and pips are injected. The review page is `design-mana-v2/index.html` in this session's scratchpad, and each figure below names its image there.
- The cell sizes and life totals below were measured on those mocks in Chromium. The fit (`layout/fit.js`) placed every mana row itself.

**The owner's words:**

> "we should add treasure and gold. It should be under the mana page, but not get cleared like floating mana. … in reality its rare to have more than one floating mana. And even then it fizzles quickly (usually). On the mana page it should also support a very lightweight check box (per player), so a player can enable something so their mana doesnt fizzle …"

---

> **Owner decisions, 26 November 2026** (these override the sections below where they differ):
> - **No Gold for now.** Build Treasure only. Its icon is the Mana font's gold counter (U+E934) in white. Gold, its switch, its cell, the five-column layout (§2.3) and the "corner" lock toggle (Q8) are all dropped; with Gold gone, mana mode never needs more than eight controls, so Keep always has its cell.
> - **Keep is on/off only.** No "keep as colourless" state, and no extra switch.
> - **No pips (§3.1 dropped).** Floating mana shows **each colour with its count, at every amount** ("R 1", "R 1 G 2"…), the same everywhere on the board, as today's strip does. §3.2's measurements were for pips; the build re-measures the totals with colour-and-count chips at chip height.
> - Still open: Q1 (rename the switch), Q2 (a tap on the Treasure chip uses one), Q9 (Keep as a toggle cell).
> - **Final, 26 November:** Q1 yes ("Mana and Treasure"), Q2 yes (a tap uses one), Q9 yes (the toggle cell).

> **As built (26 November 2026)**, on main after `0e32a0e`. Where this differs from the sections below, this is what shipped; SPEC.md §9 has the same note.
> - **Treasure** (`game.treasure`, 0–99, `fitCounts`) and **Keep** (`game.keepMana`, booleans, a new `fitFlags` that keeps only `true`) are board fields: in `historyFields`, checked by `fitHistory`, worded by `describeStep` ("Treasure 3 → 2", "Keep mana on"), and sent to Track's mana tab by `stepTab`. Old saves load with no Treasure and nobody's pool kept. No Gold anywhere.
> - **Mana mode:** [W U B │ Treasure] over [R G C │ Keep], on the seven-cell grid (§2.1's formulas), placed by CSS grid areas; three to a row with Treasure and Keep as a third row only on a face too narrow for four (none of the sweep sizes needs it). The 1px rule shows where the gap is 6px or more (`data-mana-rule`). Keep is a 2px-outlined cell with the Phosphor Lock Simple (Fill) and "Keep", the seat colour with the designation cells' check when on, `aria-pressed`, named "Keep mana, Player 4"; it's in the grid only while `poolsCanEmpty` (Mana and Treasure on, auto-empty on, Turns not Off). Treasure's cell is named "Treasure, Player 2, 3. Add one".
> - **Cell sizes, measured** (Chromium, the default Badge size): Pixel 11 Pro (952 × 427) 78px at 3–4 players (unchanged) and 69px at 5–6 (78px before); 852 × 393 69 / 60px; 640 × 360 61px at 4 players and 44px with 8px gaps at 6 (61px before); 568 × 320 51px at 3–4 and 44px with 2px gaps at 5–6 (51px before); Track's mana tab at 568 × 320 with 2 players 70px, four to a row along the turned faces (92px, two to a row, before); iPad 1366 × 1024 160px at 4 players (184px before) and 103px at 6.
> - **At rest:** Treasure's chip comes after rad and before the crown, while the count is above 0: the gold counter in `--text` and the count, the button fill, a 1.5px `--rim` ring and a 44 × 44 touch area. A tap uses one (key `token:i:treasure`, so quick uses merge, as do the mode cell's taps), announced "Player 3, Coral, Treasure 3 → 2"; at 0 it stays dimmed (`aria-disabled`) for `stripHoldTime`, then goes. It doesn't light the pill's dot. A kept pool's strip, and its folded chip, are led by a small lock in `--text-soft`, while pools can empty; it isn't a target.
> - **Floating mana:** no pips. The strip shows each colour with its count at every amount, as before, and keeps its places and fold rules, but it's one chip tall: 1.7em of the near row's full type (27px at 4 players on the target, 21px at 12.5px type), 1.38em pips, and each button at least 44px wide with a 44 × 44 touch area through `::after`. The totals with one floating mana on every tile, against the 44px strip: 952 × 427 81px at every count (76 / 74px at 3 / 4 before); 852 × 393 75px (63 / 60 / 69px before); 640 × 360 68px (54px before); 568 × 320 a row with its spend buttons at 59px (3 players) and 57px (4–6), where the strip used to fold at the same sizes; iPad unchanged. SPEC.md §9 has the table.
> - **The turn pass** empties only the pools nobody kept (`turnPassPools` in `logic/rules.js`); its step and the turn chip's hold store only those, and the announcement adds "Player 4's mana kept". Treasure never empties but at a new game, which also turns every Keep off.
> - **Words and Track:** History rows and toasts read "Treasure 3 → 2" and "Keep mana on/off"; Track's ✕ says "… mana pools and Treasure go back …", and mana mode's "Every mana pool and Treasure count goes back to how it was when you opened mana." Mana mode's announcement says "Press a colour to add one mana, or Treasure, after the colours, to add one".
> - **Deviations:** the strip takes the near row's full type with no floor of its own, so at 12.5px type its pips are 17px (they were at least 18.5px); a strip button's touch area, like the folded chip's, can overlap the near row's top by a few pixels, where the strip wins. Treasure on the busiest near rows (every counter, the turn chip and the crown at 640 × 360) can make the row wrap, as any count would.

## What's new since the first spec, and what that changes

| Landed on main | What it changes here |
|---|---|
| **The classic-T mana button** (M1) | Nothing. Treasure doesn't light the floating dot: the dot means mana that will empty. |
| **Game-wide Undo and History** (M4, M5) | Every Treasure, Gold and Keep change is a history step with a merge key, wording, a toast and a History row (§5). Mana mode's own edit stacks are gone, so the first spec's "new Edit kinds" are dropped. `stepTab` must send the new fields to the mana tab (§5.3). |
| **Track** (PILL-SPEC.md, built only where needed) | Mana mode is also Track's mana tab, so the new grid has to work on the 2-player 568 × 320 board's turned faces (§2.4). Track's discard message has to name Treasure (§5.3). |
| **Floating mana's own row above the near row** (alpha.17), with totals that shrink to a floor and fold to a chip | The first spec's chip-height pips now matter far more. Measured, one floating mana costs today's totals 7–15px on every board from 952 × 427 down to 640 × 360, and folds away its spend button at 568 × 320. Pips cost nothing on those boards and keep the spend button at 568 × 320 (§3.2). |
| **Mana mode is three to a row** (W U B over R G C), sized like counter cells | The first spec's "wide" row of six and its four-column "compact" form rearranged the colours by board size. v2 keeps today's block everywhere and adds a column beside it, using the counters mode's seven-cell grid rules, which are already built and tested (§2). |
| **Designation cells** (the crown and castle are toggles in the counter grid) | Keep becomes a toggle cell in that language, lighter when off, instead of the first spec's bespoke checkbox (§4). |
| **Offline card lookup** (the magnifier) | Only through Track: with the magnifier counted, more boards collapse to Track (SPEC.md §14), so the mana tab is the mana mode more often on small phones. |

## Decisions at a glance

| # | Decision | Section |
|---|---|---|
| V1 | **Treasure** is a per-player count, on whenever Mana pool is on. **Gold** is the same, behind its own Gold tokens switch (off by default). They're never emptied by auto-empty, the eraser or Keep. New game resets them. | §1 |
| V2 | **At rest, Treasure and Gold are count chips in the near row**, after rad and before the crown. A tap uses one, with no colour pick. They never drop, and they don't open the mana row. | §1.3 |
| V3 | **Mana mode keeps today's colour block and adds a column for what stays:** [W U B │ Treasure] over [R G C │ Keep or Gold]. This is the counters mode's seven-cell grid: four to a row, gaps closing to 2px before a cell goes under 44px, and three to a row on a turned narrow face. | §2 |
| V4 | **With Gold and Keep both showing,** Keep takes a slim fifth column (44px). On the four boards with no room for that (640 × 360 and 568 × 320 at 5–6 players), Keep moves to the pool at rest, as a lock toggle. | §2.3 |
| V5 | **One to three floating mana are pips:** one 44px button per mana on a chip-height capsule, with no counts and no eraser. A tap spends that one. Four or more keep today's strip, unchanged. | §3 |
| V6 | **Keep** is a per-player toggle, "don't empty this pool when the turn passes". It's a designation-style cell: an outline when off, the seat colour and a check when on. It shows only while auto-empty can happen. At rest a small lock leads that player's floating mana. | §4 |
| V7 | **Undo:** a Treasure or Gold use merges per token (`token:i:kind`), a mode tap merges per cell (the same key), and a Keep toggle is its own step and breaks bursts. Wording follows today's spends: "Treasure 3 → 2", "Keep mana on". | §5 |
| V8 | **Track:** the mana tab is the same layer. Treasure, Gold and Keep steps belong to the mana tab, and the discard message says "mana pools and Treasure". | §5.3 |

---

## 1. Treasure and Gold

### 1.1 What's tracked

- **`treasure[i]` and `gold[i]`:** whole numbers from 0 to 99 (`maxCount`). Auto-empty, the eraser and Keep never touch them. New game sets them to 0.
- **Treasure** is on whenever Settings → Track → Mana pool is on. The switch is renamed **Mana and Treasure** (Q1).
- **Gold** has its own switch, **Gold tokens**, shown under Mana and Treasure while that's on, after "Empty mana pools when the turn passes", and off by default (`game.counters.gold`). Four cards make Gold, and its cell is what overfills the smallest boards (§2.3).
- The rules are unchanged from MANA-UNDO-SPEC §1. Powerstones, Vibranium, Heartwood and Eldrazi Spawn stay out.

### 1.2 Using one: no colour pick (unchanged)

A Treasure is sacrificed while paying (CR 605.3a–b), so its mana is spent as it's made. A tap lowers the count, and that's all. To float a Treasure's mana anyway, use it, then add the colour in mana mode: two taps for the rare case. Goldspan Dragon's two mana stays right, because only the count changes.

### 1.3 At rest

*Mocks: `rest-952-4`, `rest-952-4-detail`, `use-952-4`.*

- **A count chip in the near row,** shown only while the count is above 0: the icon, then the count. The icon (owner, 26 November) is the Mana font's gold counter, `ms-counter-gold` (U+E934), for both tokens: **Treasure's in white** (`--text`), **Gold's in gold** (a new `--token-gold` token, about `#e2b84a`, checked at 3:1 against the chip and tile fills in both styles). Add U+E934 to the font subset. The order becomes: turn chips, identity, poison, tax, energy, experience, rad, **Treasure, Gold**, monarch, initiative.
- **It's a button,** so it has the folded chip's look: the `--button` fill, a 1.5px `--rim` ring and a 44 × 44 target through `::after`, as the turn chip has. The plain counts beside it have no ring, so the ring is what says "tap me".
- **A tap uses one,** with a haptic and a polite announcement: "Player 3, Treasure 3 → 2". When the count reaches 0, the chip stays in place, dimmed, for `stripHoldTime` (800ms), so a quick second tap can't land on the crown sliding under the finger. Then it goes.
- **Never dropped** (SPEC §3.2's list of counts). It shrinks with the near row's type like any count.
- **Why the near row, not the mana row:** Treasure lasts for turns. On the mana row it would keep that row open, and every total small, all game. Floating mana has the row for seconds. This is truer since alpha.17, where the mana row costs the totals real size.
- **Making Treasure is in mana mode** (or Track's mana tab), because making it happens as something resolves, when there's time to open a mode.

## 2. Mana mode

*Mocks: `mode-952-4`, `mode-952-6`, `mode-952-4-glass`, `mode-952-4-noturns`, `mode-568-6`, `mode-ipad-4`; today: `today-mode-952-4`.*

### 2.1 The grid

- **The colours keep today's block:** W U B over R G C, in the same cells, gestures and style (tap +1, hold −1 with repeat, the hidden "Remove one" buttons).
- **What stays takes a fourth column:** Treasure on top. Under it is Keep when Keep shows, Gold when Gold is on and Keep doesn't show, or nothing.
- **A 1px rule** in `--text` at 22% sits in the gap between the colours and that column wherever the gap is 6px or more, so "this empties" and "this stays" read as two groups. Where the gap closes to 2px the rule hides, and the different cells (mana symbols against icons) carry the split.
- **Treasure and Gold cells are counter cells:** the gold-counter icon (Treasure white, Gold gold, as at rest) over the count, 0 muted, and a hidden "Remove one Treasure from Player 2" button.
- **The layout follows the counters mode's seven-cell grid** (`fitModeGrids` in `layout/board.js`, `.board[data-cell-grid="4"]` in `modes.css`):
  - **The cell:** `clamp(44px, min((ui − 42px) / 4, (ub − 10px − pill) / 2), 92 × grow)`.
  - **The gaps:** `clamp(2px, (ui − 12px − 4 × cell) / 3, 10px)`. They close before a cell would go under 44px.
  - **On a face too narrow for four** (a turned seat), it's three to a row and what stays becomes a third row: W U B / R G C / Treasure, Keep.
  - The hint ("Tap +1 · hold −1") keeps its place and hides by its existing rule.

### 2.2 Sizes, measured

| Screen | Players | Today (3 to a row) | v2 (Treasure and Keep) | v2, Gold on as well |
|---|---|---|---|---|
| **952 × 427** | 3–4 | 78px | **78px** (unchanged) | 78px, 5 columns |
| | 5–6 | 78px | 69px | 57px, 5 columns (`mode-952-6-gold`) |
| 852 × 393 | 3–4 | 69px | 69px | 69px, 5 columns |
| | 5–6 | 69px | 60px | 49px, 5 columns |
| 640 × 360 | 3–4 | 61px | 61px | 58px, 5 columns |
| | 5–6 | 61px | 44px (2px gaps) | **corner** (§2.3) |
| 568 × 320 | 2 (Track, turned faces) | 92px (2 to a row) | 70px, 4 to a row along the turned face (`track-mana-568-2`) | 58px, 5 columns (`track-mana-568-2-gold`) |
| | 3–4 | 51px | 51px | 49px, 5 columns |
| | 5–6 | 51px | 44px (2px gaps) (`mode-568-6`) | **corner** (`mode-568-6-gold`) |
| 1366 × 1024 | 4 | 184px | 160px | 149px, 5 columns |

- On the 4-player target, the commonest Commander table, nothing shrinks.
- Every cell is 44px or more at every size, and no layer leaves its face in any mock.

### 2.3 Nine controls: Gold and Keep together

- **Where a slim fifth column fits** (`4 × cell + 44px + gaps ≤ room` with cells of 44px or more), Keep takes it: the outline, the lock and the word stacked in a 44px-wide capsule, centred across both rows. The four cell columns share what's left (the cell formula less 46px of width).
- **The corner:** 640 × 360 and 568 × 320 at 5 or 6 players, with Gold on and auto-empty on.
  - Four 44px columns over two rows is all that fits there. A third row is 136px against the 134px a face keeps beside the mode pill, and a fifth column is 228px against 188–212px.
  - So mana mode shows [W U B │ Treasure] over [R G C │ Gold], and **Keep moves to the pool at rest:** while that player's pool has mana, a 44px lock toggle leads their pips, their strip or their folded chip, outlined when off and in the seat colour when on (`rest-568-6-corner`).
  - Keep matters only when mana is left at the turn pass, so a toggle that shows exactly while mana floats is enough. Q8 asks whether to accept this corner.

### 2.4 Inside Track (568 × 320, 2 players)

*Mocks: `track-pill-material`, `track-mana-568-2`, `track-mana-568-2-glass`, `track-mana-568-2-gold`; today: `today-mode-568-2`.*

- **At rest the pill is collapsed:** round · Track · Undo · magnifier · d20 · settings. Track's face is the T-on-pip while the remembered tab is mana, with the lime dot while mana floats and its page dots. Treasure doesn't light the dot.
- **The mana tab is the same layer.** The 2-player faces are turned, and each fits four columns along its length at 70px (58px with Gold and Keep), so it's the same grid as the separate-buttons form.
- **The open tab** keeps the chosen tint (Accent L3: `--chosen-fill`, `--chosen-ring`, and the accent ring on the pip). Keep's on state is the seat colour, never lime, so solid lime still means only ✓.
- **Undo crossing tabs:** a Treasure, Gold or Keep step opens the mana tab first (§5.3), as a pool step does today.
- **A tile opens the mana tab directly:** the folded chip's caret does today. A Treasure chip doesn't, because its tap uses one (Q2).

## 3. Floating mana for the common case

*Mocks: `rest-952-4`, `rest-952-6`, `rest-568-6`, `rest-568-2`, `rest-ipad-4`, `rest-952-4-detail`; today: `today-rest-952-4`, `today-rest-568-6`.*

### 3.1 The pips

- **One to three mana in the pool:** one button per mana, each drawn as that colour's pip, so a pool of {R}{R}{G} is three buttons and reads like a mana cost. The order is W U B R G C.
- **The capsule is chip-height:** 1.7em of the near row's full type (about 27px at the default badge size), on `--chip-background`. Pips are 1.38em. Each button is 44px wide, and its target is 44 × 44 through `::after`, reaching past the capsule as the folded chip's does.
- **A tap spends that one,** saved at once. The pip stays as a dimmed ghost until 800ms after the row's last tap (today's `stripHolds`), then the row reflows. The life halves under it ignore touches for that time, as today (`use-952-4`).
- **No counts and no eraser.** Tapping the pips empties a small pool, and Undo covers a slip.
- **Four or more:** today's strip ((R)2 (C)2, then the eraser) with its fold and fallbacks, unchanged. It's now the exception.
- **The fit doesn't change.** fit.js measures the row as it finds it, so the pips simply take less room: the same places in order (row, fold, under the far row, end of the near row) and the same floors (three quarters for spend buttons on the row, two thirds for the chip).
- **Screen readers:** "Player 1, red mana. Spend one", and the pool is announced after a spend, as today (`announcePool`).

### 3.2 What the lighter row buys, measured

The mana row and the smallest life total, with one floating mana on every tile (alternating red and blue, plus a poison count, an identity chip and commander damage from every opponent):

| Screen | Players | No mana | Today | Pips |
|---|---|---|---|---|
| 952 × 427 | 3 / 4 | 81px | row, 76 / 74px | **row, 81px** |
| | 5–6 | 81px | row, 81px | row, 81px |
| 852 × 393 | 3 / 4 | 75px | row, 63 / 60px | **row, 75px** |
| | 5–6 | 75px | row, 69px | row, 75px |
| 640 × 360 | 3–6 | 68px | row, 54px | **row, 68px** |
| 568 × 320 | 3–6 | 61px | **folded**, 57–59px: the spend button is gone | **row, 56–58px: the spend button stays** |

- From 640 × 360 up, one floating mana no longer costs the totals anything.
- At 568 × 320, where today's strip folds into a chip that opens mana mode, the pip stays a one-tap spend. The totals pay 1px more than for the chip.

### 3.3 When pools empty (unchanged)

They empty as the turn passes, while "Empty mana pools when the turn passes" is on and Turns isn't Off. The app doesn't see steps or phases, and a timer would silently lose mana the rules keep. Mid-turn emptying is a tap per pip, or the eraser for four or more.

## 4. Keep: "my mana doesn't empty"

*Mocks: `mode-952-4` (off and on), `mode-952-6-gold` (the slim column), `rest-952-4` (the lock at rest), `rest-568-6-corner`.*

### 4.1 What it means (unchanged)

"Don't empty this pool when the turn passes": a two-state toggle per player.

- It covers Upwelling exactly.
- For a card that keeps one colour (Omnath, Locus of Mana; Leyline Tyrant), or turns the amount colourless, black or red (Kruphix, Horizon Stone; Omnath, Locus of All; Ozai), the player taps away or re-adds what changes, which is one or two taps.
- The "until end of turn" cards need nothing, since pools already last until the turn passes.

### 4.2 Where it shows

- **In mana mode, as a cell in the grid** (§2.1), in the designation cells' language:
  - **Off:** no fill, a 2px ring in `--text-soft` at 55%, the lock and the word **Keep** in `--text-soft`. It's the lightest thing in the grid.
  - **On:** the seat colour fills it, the lock and word in `--button`, with the identity toggles' check badge on its corner, so the state doesn't rest on colour.
  - A tap toggles it, and each toggle is one undo step.
- **Only while auto-empty can happen:** Turns isn't Off and "Empty mana pools when the turn passes" is on. Otherwise nothing would empty, the cell hides, and its slot is empty or Gold's (`mode-952-4-noturns`). The saved values stay.
- **At rest:** a small lock in `--text-soft` leads that player's pips or strip while Keep is on and the pool has mana. It isn't a target, except in the corner (§2.3). With no mana there's nothing to keep, and nothing shows.
- **As the turn passes:** kept pools stay, and the announcement adds "Player 4's mana kept". The turn step stores only what it emptied, so Undo and the turn chip's hold put back exactly that.
- **Upwelling keeps everyone's mana:** tick each player's Keep. One player's toggle never changes another tile.
- The eraser and spends ignore Keep, since they're deliberate. New game turns every Keep off.

## 5. Undo and History

### 5.1 Steps and merging

| Action | Step | Merge key |
|---|---|---|
| A Treasure or Gold chip tap at rest | −1 | `token:i:treasure`, `token:i:gold`, so quick uses merge, like spends |
| A Treasure or Gold cell tap or hold in mana mode or the mana tab | ±1, or the hold | The same key. Opening and closing a mode already breaks bursts, so rest and mode can't merge. |
| A pip spend | −1 | `spend:i:colour`, as today |
| The Keep cell, or the corner's lock | On or off | None. It's a moment, like a designation cell, and it breaks every open burst. |
| A turn pass with a kept pool | The turn and the pools it emptied | As today. A kept pool isn't in the step, since it didn't change. |
| New game | Also resets `treasure`, `gold` and `keepMana` | As today. Undoing New game brings them back. |

### 5.2 Words

These come from `describeStep` in `logic/history.js`, through the same paths as today's toasts, History rows and Undo's name:

- **Treasure and Gold:** "Treasure 3 → 2", "Gold 0 → 1". This replaces the first spec's "Treasure used, 2 left", to match how M4 words a spend ("red mana 1 → 0"). One wording works for rest and mode, and needs no new step kind.
- **Keep:** "Keep mana on" or "Keep mana off".
- **A step touching several of one tile's cells** joins them, as today: "Treasure 0 → 3, Gold 0 → 1".
- **The toast:** "↶ Undid Treasure 3 → 2 [↷ Redo]" on that tile, facing its player (`toast-952-4`, `toast-568-6`). On a short tile it takes the near edge for its 4 seconds, as built, so the restored chip shows when it goes.
- **Undo's name:** "Undo: Player 3, Coral, Treasure 3 → 2".
- **History rows:** seat dot, "Player 3 · Coral", the words, and the time. A Redo row is struck through above Now (`history-952`, `history-568`, `history-952-glass`).

### 5.3 Track and the mode Undo

- **`stepTab`** (`logic/history.js`) returns `'mana'` for a step with `pools`, `treasure`, `gold` or `keepMana`. Today anything that isn't damage or pools falls to `'counters'`, so without this change an undo of a Treasure tap would switch Track to the counters tab.
- **Track's discard message** (`trackTabInfo.mana.discard`) becomes "mana pools and Treasure", or "mana pools, Treasure and Gold" while Gold is on. Mana mode's own `discardMessages.mana` becomes "Every mana pool and Treasure count goes back to how it was when you opened mana." Keep's toggles go back with them.
- **"Discard N changes?"** counts steps, so quick Treasure taps on one cell are one change, as for mana cells today.

## 6. By board size

| | 952 × 427 (Pixel 11 Pro) | 568 × 320 (stress) | iPad 1366 × 1024 |
|---|---|---|---|
| Mana mode | 4 columns, 78px (3–4 players), 69px (5–6). 5 columns with Gold and Keep. | Track's mana tab at 2 players (70px). 4 columns at 51px (3–4) or 44px (5–6). Corner rule with Gold and Keep at 5–6. | 4 columns, 160px at 4 players |
| Pips at rest | Totals untouched | One-tap spend kept where today folds | Totals untouched |
| Treasure and Gold chips | Near row, full type | Near row, shrinking with it | Near row |
| Toast, History | As built | As built: the label drops, and History's buttons move to the header | As built |

## 7. Both styles

- Everything reads existing tokens: counter-cell and chip tokens, `--seat`, `--button`, `--rim`, `--text-soft`, `--chip-background`, and the pip tokens.
- **Glass** gets its frosted pill, sheet and press shrink from what's built. There are no per-style rules for the new parts (`mode-952-4-glass`, `rest-952-4-glass`, `track-mana-568-2-glass`, `history-952-glass`).
- **Accent L3 holds:** Keep's on state is the seat colour, the open Track tab is the chosen tint, and only ✓ is solid lime.

## 8. Accessibility

- **Targets:** every new target is 44 × 44 or more: the cells, Keep (the slim column is 44px wide), each pip, the Treasure and Gold chips, and the corner's lock.
- **Names start with the visible words** (WCAG 2.5.3): "Treasure, Player 2, 3. Add one" and "Remove one Treasure from Player 2"; the chip "Treasure, Player 3, 3. Use one"; "Keep mana, Player 4".
- **Keep is a toggle button with `aria-pressed`,** like the designation cells and identity toggles. That changes the first spec's `role="checkbox"`, for one toggle pattern across the grid. It looks like a checkbox through its outline and check, and reads as "Keep mana, Player 4, toggle button, pressed".
- **Announcements:**
  - A use: "Player 3, Treasure 3 → 2".
  - A turn pass: "… Player 4's mana kept".
  - Mana mode's intro adds "Treasure below the colours" where it describes the cells.
- **Colour is never the only signal:** Keep's check and outline, the dimmed ghost, and the struck-through Redo rows.
- **Reduced motion:** nothing new animates.

## 9. Save format

New `Game` fields go in the typedef above `loadGame`, its validator, the fast-check generator in `tests/logic.test.mjs`, and `historyFields`:

| Field | Type | Default | Validation |
|---|---|---|---|
| `treasure`, `gold` | int[players], 0–99 | zeros | `fitCounts` |
| `keepMana` | boolean[players] | all false | each `=== true` (a new `fitFlags`) |
| `counters.gold` | boolean (a `Tracker`) | false | `=== true`, like every tracker; it's under `counters`, already a settings field |

- **`historyFields`** gains `treasure`, `gold` and `keepMana`, and `fitHistory`'s per-field checks gain their ranges.
- **Old saves** lack all four and get the defaults. A history saved before M2 has no cells for them, which is valid.
- No version bump: no existing field changes meaning.

## 10. What changes in code

| File | Change |
|---|---|
| `logic/data.js` | `historyFields` += `treasure`, `gold`, `keepMana`; the token kinds and icons; `trackTabInfo.mana.discard` and `discardMessages.mana`. |
| `logic/save.js` | The fields above, and `fitFlags`. |
| `logic/rules.js` | `autoEmptyPools`'s rule moves here or takes `keepMana`: kept pools aren't emptied. |
| `logic/history.js` | `describeStep` words for the three fields; `stepTab` → `'mana'`; `fitHistory` checks. |
| `actions/mana.js` | `useToken(index, kind)` (key `token:i:kind`, the 800ms chip hold); `autoEmptyPools` honours Keep and reports kept pools for the announcement. |
| `actions/edits.js` | `stepToken(index, kind, delta)` and `toggleKeep(index)`, through `commit()`. |
| `render/modes.js` | `buildTokenCell` and `buildKeepCell` in the mana layer, and syncing them. |
| `render/badges.js` | `stripItems`: pips for a total of 1–3 (`pip-spend` buttons, no eraser), the lock, and in the corner the lock toggle; `nearItems`: Treasure and Gold chips after rad. |
| `layout/board.js` | `fitModeGrids`: mana uses the four-column cell and gap (or five with Gold and Keep), three to a row on a narrow face, and sets the corner flag on `#board`. |
| `css/modes.css`, `css/badges.css` | The mana grid's placement and rule, token and Keep cells; the pips' capsule, the lock and the token chip. |
| `sheets/settings.js` | The Mana and Treasure label, the Gold tokens switch, New game's list. |
| Docs | SPEC.md §3.2 (never dropped), §7 (near row order), §9 (the pips, the grid, Keep), §10.1–§10.2; SETTINGS-SPEC §2 and §11; GUIDE.md's Mana pool section; README. |

## 11. Tests

- **`logic.test.mjs`:** the generators and validators gain the fields; round trips of `diffBoard` and `applyChanges` with them; `autoEmptyPools` with Keep stores only what it emptied; `stepTab` returns mana for each new field; `describeStep` wording (a table test).
- **`mana.test`:**
  - Treasure and Gold cells: tap +1, hold −1.
  - The chip uses one, holds 800ms at 0, and is announced.
  - Gold is hidden until its switch is on. Keep shows only with Turns on and auto-empty on.
  - A kept pool survives a pass, its lock shows, and Undo of the pass restores only the emptied pools.
  - Pips for 1–3 mana, one button per mana, a ghost for 800ms; the strip and eraser from 4.
  - New game resets all three.
- **`undo.test`:** quick uses merge into one step; a Keep toggle breaks a burst; the toast's words and Redo; undo of a Treasure step in Track opens the mana tab.
- **`sizes-*` (and `-glass`):** the mana grid at every sweep size and 2–6 players: every target 44px or more, nothing outside its face, the fifth column where it fits, and the corner flag exactly at 640 × 360 and 568 × 320 with 5–6 players, Gold and auto-empty.
- **`autodrop.test`:** Treasure and Gold chips never hidden. **`centring.test`:** the four-column mana grid centred.
- **A fit test** pinning §3.2's table: with one mana per tile, totals at full size from 640 × 360 up, and a row (not a fold) at 568 × 320.
- Mutation checks only on `autoEmptyPools`' Keep rule and `fitHistory`'s new checks.

## 12. Build plan

1. **M3 first: the pips.** They're independent of the new fields, smaller, and pay off on every board (§3.2). Covers `badges.js`, `badges.css`, the fit test, `mana.test` and `sizes`.
2. **M2: Treasure, Gold and Keep.** The fields and history, the mana grid (with the corner), the chips, Keep in auto-empty, Settings and New game, then the docs.

## 13. Questions for the owner

Carried from the first spec where they're still open, and new ones from the current app:

| # | Question | Recommendation |
|---|---|---|
| Q1 | Rename Settings → Track → "Mana pool" to **"Mana and Treasure"**, so players who only want Treasure find it? | Yes. Track's name keeps saying "mana". |
| Q2 | At rest, should a tap on a Treasure chip **use one**, or **open mana mode**? | Use one. Undo makes a stray tap cheap, and its toast names it. |
| Q3 | ~~Keep: a third "keep as colourless" state?~~ | **Decided (owner):** on and off only. |
| Q6 | ~~Treasure's icon?~~ | **Decided (owner):** the Mana font's gold counter (U+E934), in white. |
| Q7 | ~~Gold behind its own switch?~~ | **Decided (owner):** no Gold for now. |
| Q8 | ~~The corner's lock toggle?~~ | Moot: without Gold, every board fits Keep's cell. |
| Q9 *(new)* | **Keep's look:** a designation-style cell, outlined when off (mocked), or a smaller checkbox-and-word control? | The cell. It's the same toggle language as the crown and castle, it's a full 44px target everywhere, and outlined it's the lightest thing in the grid. |
| Q10 | ~~Pips up to three or four?~~ | **Decided (owner):** no pips; colour and count at every amount. |
