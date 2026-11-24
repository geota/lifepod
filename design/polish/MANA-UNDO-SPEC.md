# Treasure, lighter floating mana, Keep, the mana icon, and Undo: design spec

**Status:** proposal for the owner's review, 23 November 2026, against main `1a9cdb5` (v0.1.0-alpha.17). Nothing here is built.

- The mock-ups are drawn on the real app (CSS and DOM injected with Playwright, served by `scripts/serve.mjs`) and laid out with captions on the review page: `design-mana-undo/index.html` in this session's scratchpad. Each figure below names its image there.
- Rules are quoted from the Comprehensive Rules effective 6 November 2026 and card text from Scryfall's Oracle text, both read on 23 November 2026.
- Sizes follow SPEC.md: design at 952 × 427 first; 640 × 360 and 568 × 320 must keep working; tablets scale through `--grow`.

**The owner's words this answers:**

> "we should add treasure and gold. It should be under the mana page, but not get cleared like floating mana. … in reality its rare to have more than one floating mana. And even then it fizzles quickly (usually). On the mana page it should also support a very lightweight check box (per player), so a player can enable something so their mana doesnt fizzle …"
>
> "I like the classic T on a pip."
>
> "I think the undo should be one for one, but you should be able to hit backwards. Ideally you can hit backwards and forwards (until a new game action is taken)."

Later the owner agreed that quick taps on one tile **can merge** into one undo step (§6.2a), and asked for the storage architecture, which is in [UNDO-ARCHITECTURE.md](UNDO-ARCHITECTURE.md).

---

## Goals

1. **Treasure (and Gold) counts that persist,** live in mana mode, show at rest, and never empty with the pool.
2. **Floating mana sized for the common case:** one to three mana, gone within a phase. One tap to add (in mana mode), one tap to spend, and as little board space as possible.
3. **A one-tap per-player Keep** for the few cards that stop mana emptying.
4. **The classic tap symbol on a pip** for the pill's mana button.
5. **Game-wide Undo and Redo,** one step per action (quick taps on one tile merge), linear, saved with the game, and New game undoable.
6. **Nothing regresses:** 44px targets at 568 × 320, one size per board, old saves load, both styles, screen readers.

## Decisions at a glance

| # | Decision | Section |
|---|---|---|
| D1 | Treasure is a per-player count in mana mode, on whenever Mana pool is on. Gold is the same, behind its own Track switch (off by default): four cards make Gold. Powerstones, Vibranium, Heartwood and Eldrazi Spawn are out. | §2 |
| D2 | Using a Treasure just lowers the count. **No colour pick:** the mana is spent as it's made (a mana ability, CR 605.3a–b). To float it, add the colour in mana mode. | §2.2 |
| D3 | At rest, Treasure and Gold are counts in the near row (never dropped). A tap on the chip uses one. | §2.4 |
| D4 | Floating mana of one to three shows as **one pip per mana** on a chip-height row, each colour one tap target, with no counts or eraser. The current strip (counts and eraser) becomes the exception, for four or more. | §3 |
| D5 | Pools still empty only as the turn passes. The app can't see steps and phases (CR 106.4, 500.5), and the turn pass never empties mana the rules would keep. | §3.3 |
| D6 | **Keep** is a two-state checkbox per player: "don't empty this pool when the turn passes". It has no colour or colourless variants; the guide covers those cards. It shows only while auto-empty can happen. | §4 |
| D7 | The mana button is Mana's U+E61C (classic tilted T) in ink on a `--pip-c` disc, 56% of the button. Floating: a 9px lime dot with a 2px ring in the pill's colour. The disc itself never turns lime. | §5 |
| D8 | **One history** for the whole game: one step per action, Back and Forward along a line, and Forward discarded by the next action. **Quick taps on one tile and one count merge** into one step while they come within 1.5s of each other, with a running delta (−3) on the total. Per-field deltas are recorded at `commit()`, capped at 500 steps and 64 KB, and saved in the game's own save ([UNDO-ARCHITECTURE.md](UNDO-ARCHITECTURE.md)). New game is a step. | §6 |
| D9 | **Placement B:** one Undo button in the pill. Redo is on the toast that follows an undo and in the History sheet; holding Undo opens History. Placement A (Back and Forward buttons) doesn't fit the 2-player pill on a 568 × 320 phone. | §6.6 |
| D10 | Modes keep their Undo · ✓ · ✕ pill, but on the one history: Undo stops at the mode's start, and ✕ undoes the mode's steps, which can then be redone. "Undo clear" is retired. | §6.5 |

---

## 1. The rules this rests on

**Mana pools** (CR 106.4): "Each player's mana pool empties at the end of each step and phase, and the player is said to lose this mana." CR 500.5 repeats it ("Then any unspent mana left in a player's mana pool empties"), as the turn-based action in 703.4q. *The brief cites 500.4; in the 6 November 2026 rules 500.4 is about effects that last until a step or phase begins, and the emptying rule is 500.5.* CR 106.4a–b make unspent mana public: a player announces what's left after paying a cost and when passing priority. A pool shown facing its player fits that.

**Treasure and Gold** (CR 111.10):

- 111.10a: "A Treasure token is a colorless Treasure artifact token with '{T}, Sacrifice this token: Add one mana of any color.'"
- 111.10c: "A Gold token is a colorless Gold artifact token with 'Sacrifice this token: Add one mana of any color.'"
- Both are mana abilities (605.1a: no target, could add mana, not loyalty). 605.3a: "A player may activate an activated mana ability … whenever they are casting a spell or activating an ability that requires a mana payment …". 605.3b: it "doesn't go on the stack … it resolves immediately". A Treasure is normally cracked while paying, so its mana never sits in the pool.

**Left out** (CR 111.10h, 111.10w, 111.10x, and creature tokens):

| Token | Text | Why it's out |
|---|---|---|
| Powerstone (111.10h) | "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell." | It taps and stays, like a land, so there's no count to run down. Its restriction (CR 106.6) would need a second, restricted pool. |
| Vibranium (111.10w) | The same ability, and indestructible | The same reasons. |
| Heartwood (111.10x) | "{T}: Add {R} or {G}." | It taps and stays. |
| Eldrazi Spawn and Scion | "Sacrifice this creature: Add {C}." | They're creatures that attack and block, so players track them on the table with dice or tokens. Their mana is colourless and they're not artifacts. |

**How common they are** (Scryfall, 23 November 2026): 376 non-token cards mention a Treasure token; four make Gold: Gild; King Macar, the Gold-Cursed; Curse of Opulence; and The First Iroan Games. Goldspan Dragon makes Treasures give "two mana of any one color", which is one more reason not to model a Treasure as exactly one mana of a picked colour.

**Cards that keep mana** (every Oracle match for "lose unspent", 12 cards, and "lose this mana", 26):

| Card | Oracle text | What it keeps |
|---|---|---|
| Upwelling | "Players don't lose unspent mana as steps and phases end." | Everything, for **every** player |
| Omnath, Locus of Mana; Fangorn, Tree Shepherd | "You don't lose unspent green mana as steps and phases end." | Green only, yours |
| Leyline Tyrant; Ashling, Flame Dancer; Electro, Assaulting Battery | "You don't lose unspent red mana as steps and phases end." | Red only, yours |
| Kruphix, God of Horizons; Horizon Stone; Omnath, Locus of the Void | "If you would lose unspent mana, that mana becomes colorless instead." | The amount, as colourless |
| Omnath, Locus of All | "… that mana becomes black instead." | The amount, as black |
| Ozai, the Phoenix King | "… that mana becomes red instead." | The amount, as red |
| The Last Agni Kai, Savage Ventmaw, Grand Warlord Radha, Klauth, Sakiko and 22 more | "Until end of turn, you don't lose this mana as steps and phases end." (Fire Lord Ozai and Avatar Roku: until end of combat) | Only until the turn ends |

The last row needs nothing: the app already keeps a pool until the turn passes. Keep (§4) is only for the first five rows.

---

## 2. Treasure and Gold

*Mock: Mana mode, 952 × 427 (`mode-952-4.png`).*

### 2.1 What's tracked

- **`treasure[i]` and `gold[i]`:** whole numbers from 0 to 99 (`maxCount`) per player. They're never emptied: not when the turn passes, not by the eraser, and not by Keep. New game sets them to 0.
- **Treasure** is on whenever Settings → Track → Mana pool is on. This spec proposes renaming that switch **Mana and Treasure** (Q1).
- **Gold** has its own switch, **Gold tokens**, shown under Mana pool while that's on (like "Empty mana pools when the turn passes"). It's off by default, saved in `game.counters.gold`. Four cards make Gold, and its cell is what pushes the smallest boards past eight controls (§2.3).

### 2.2 Using one: no colour pick

We weighed tap → pick a colour → it floats against tap → the count goes down.

| | Pick a colour, then it floats | **Just lower the count** (chosen) |
|---|---|---|
| Taps | Two, plus a six-colour picker on a tile | One |
| Matches play | Rarely: a Treasure is sacrificed while paying (CR 605.3a), so its mana is spent at once | Yes |
| Goldspan Dragon (two mana of one colour) | Wrong amount | Right: the count is all that changes |
| Floating it anyway | Built in | Hold Treasure −1, then tap the colour +1 in mana mode: two taps, the rare case |

### 2.3 Mana mode

Floating mana sits above, and what stays sits below it:

- **Row 1:** the six colour cells, W U B R G C, unchanged in style and gestures.
- **A hairline, then row 2:** Treasure, Gold (when its switch is on) and the Keep checkbox (§4).
- **Treasure and Gold cells** are counter cells: a seat-coloured icon over the count, tap +1, hold −1 with repeat, and the hidden "Remove one" button for keyboards.
  - **Icons:** Treasure is a chest and Gold a bar. The mock draws both in Phosphor's bold style; ship Phosphor's `coins` for Treasure if the chest reads poorly at 44px (Q6). Mana's U+EA52 looks like an ingot but has no published name in the font, so it isn't used.

**Two layouts, chosen board-wide** (one size per board, SPEC §3.1):

| Layout | When | Cell size |
|---|---|---|
| **Wide:** one row of six, then Treasure · Gold · Keep | Six cells fit at 46px or more: `(ui − 32px) / 6 ≥ 46px` | `clamp(44px, min((ui − 32px) / 6, (ub − 28px − pill) / 2), 92 × grow)` |
| **Compact:** four columns, two rows: W U B R / G C Treasure Keep | Otherwise | `clamp(44px, min((ui − 18px) / 4, (ub − 14px − pill) / 2), 78 × grow)`, with 2px column gaps |

Measured on the mock (Chromium, Roboto):

| Screen | 2 players | 3–4 | 5–6 |
|---|---|---|---|
| **952 × 427** | wide, 66px | wide, 66–69px | wide, 47px |
| 852 × 393 | wide, 60px | wide, 60px | compact, 66px |
| 640 × 360 | wide, 55px | wide, 48px | compact, 49px |
| 568 × 320 | wide, 48px | compact, 49px | compact, 44px |
| 1366 × 1024 | wide (capped like counter cells) | wide, 108px | wide, 70px |

No mana-mode layer overflows its face at any of these sizes. The hint ("Tap +1 · hold −1") stays where it is and hides by the existing rule.

**Nine controls in compact.** With Gold on, Keep showing and a compact board, four columns no longer hold everything:

- Where five columns fit at 44px or more (`(ui − 20px) / 5 ≥ 44px`: 852 × 393 at 5–6 players, 568 × 320 at 3–4), compact takes five columns: W U B R G / C Treasure Gold Keep.
- Otherwise (640 × 360 and 568 × 320 at 5–6 players), Keep moves to the tile at rest: the lock that leads the pips (§4.2) becomes a 44px toggle.

Gold on, Turns on and a 5–6-player game on the smallest phones is a corner, so it gets a rule rather than a new layout.

*Mock: Compact, 568 × 320, 6 players (`mode-568-6.png`).*

### 2.4 At rest

*Mock: At rest, 952 × 427, 4 players (`rest-952-4.png`).*

- **A count chip in the near row:** the icon in the seat colour and the count (Treasure 3), after rad and before the crown and castle, only while the count is above 0. The near row's order becomes: turn chips, identity, poison, tax, energy, experience, rad, **Treasure, Gold**, monarch, initiative.
- **Counts are never dropped** (SPEC §3.2), so they shrink their type before they go, like every other count.
- **The chip is a button,** unlike the other counts: a 1.5px rim ring marks it as one, and its target is at least 44 × 44 (the turn chip's `::after` pattern).
  - **A tap uses one,** with a haptic and an announcement ("Player 2, Treasure used, 1 left"). Undo puts it back (§6).
  - After a tap the chip holds its place for 800ms (`stripHoldTime`), dimmed at 0 if that was the last one, so a quick second tap can't land on whatever slides under the finger.
  - **Making Treasures is in mana mode.** Making them is a resolution, with time to open a mode; using one is in the middle of paying for something (Q2).
- **Why the near row, not the mana row:** Treasure lasts for turns. On the mana row it would keep that row open, and the totals small, all game. Floating mana takes that row for seconds.

### 2.5 How Treasure and Gold interact

| With | Behaviour |
|---|---|
| New game | Both reset to 0. They're listed in New game's confirmation ("Treasure and Gold", only while Mana pool is on). |
| Undo | Every +1, −1 and use at rest is one step (§6.2). |
| Auto-empty and Keep | Never touched. |
| The folded chip | Unchanged; it's only about floating mana. Treasure is never folded into it. |
| Small tiles | A count chip like poison: the overflow order shrinks type before anything goes. With two tokens and every counter on at 568 × 320 with 6 players, the near row wraps at 9px, as it does today without them. |
| Both styles | Counter-cell and chip tokens only; no per-style rules. |
| 44px | Cells at least 44px (table above). The at-rest chip has a 44 × 44 target. |
| Screen readers | The cell: "Player 2, Treasure, 3. Add one", with a hidden "Remove one Treasure from Player 2". The chip: "Player 2, 3 Treasure. Use one". Gold the same. |
| Save | `treasure`, `gold` and `counters.gold` (§10). |

---

## 3. Floating mana for the common case

### 3.1 What changes and why

| Today | Proposed | Why |
|---|---|---|
| A strip of pips with counts and an eraser, on a 44px row | **One to three mana: one pip per mana** on a chip-height row (the folded chip's height), with no counts and no eraser | The common pool is one or two mana. A pip per mana reads like a mana cost, and the chip-height row costs the totals about 17px less. |
| The strip folds wherever it's too wide | Three pips are 132px, which fits every board's mana row, even 568 × 320 at 6 players | Spend buttons stay on the tile where today they fold away (5–6 players below 952 × 427, SPEC §9's table). |
| The eraser, and "Undo clear" for 5 seconds | The eraser only from four mana; tapping one to three pips empties the pool; "Undo clear" goes, because Undo covers it | One undo for everything (§6.5). |
| Pools empty at the turn pass | Unchanged | §3.3 |
| Mana mode adds | Unchanged: tap +1, hold −1 | It's still the full picker, and the only place to add. |

**What stays:** the mana row's place (above the near row; commander damage keeps the far row), the totals giving way to no less than two thirds of their size, the fold and fallback order for four or more, the 800ms hold after a tap, and every 44px target.

### 3.2 The pips

*Mock: At rest, 568 × 320, 6 players (`rest-568-6.png`).*

- **One button per colour held,** drawn as that many pips, so (R)(R)(G) is two buttons: red 88px wide, green 44px. Pips are 1.32em of the near row's full type, on a chip-height capsule (`1.7em`, `--chip-background`). Each button's target is at least 44 × 44, reaching past the capsule like the folded chip's.
- **A tap spends one** of that colour. The spent pip stays as a dimmed ghost until 800ms after the chip's last tap (`stripHolds`), then the chip reflows, and the life halves under it ignore touches meanwhile (as today).
- **The order is W U B R G C,** as everywhere.
- **Four mana or more:** today's strip, `(R)3 (C)1 [eraser]`, and its fold and fallbacks (SPEC §9), unchanged. The eraser's step can be undone.
- **Keep on and mana floating:** a small lock (Phosphor `lock-simple`, `--text-soft`) leads the chip (§4.2).
- **Screen readers:** "Player 1, 2 red mana floating. Spend one".

### 3.3 When pools empty

| Option | Verdict |
|---|---|
| At the end of each step and phase (CR 106.4, 500.5) | **No.** The app doesn't know steps or phases. Tracking them is a tap per step for every player, about 12 a turn. |
| A timer ("fizzles after a minute idle") | **No.** A long think in one phase would lose mana the rules keep, silently. |
| **As the turn passes** (today's "Empty mana pools when the turn passes") | **Keep.** It's a backstop that never empties mana the rules would keep, since every pool has emptied by the end of a turn unless Keep says otherwise. Mid-turn emptying is manual: one tap per pip, or the eraser for four or more. |

### 3.4 The always-visible strip

It already shows only while mana floats. Under this proposal the full strip is also the exception: one to three mana are pips.

---

## 4. Keep: "my mana doesn't empty"

### 4.1 What it means

The card texts (§1) do three different things: keep everything (Upwelling), keep one colour (Omnath, Locus of Mana; Leyline Tyrant), or keep the amount as another colour (Kruphix; Horizon Stone; Omnath, Locus of All; Ozai).

| Option | Covers | Cost |
|---|---|---|
| **Keep: don't empty this pool when the turn passes** (chosen) | Upwelling exactly. For the others, the player taps away or re-adds what doesn't stay, in one or two taps. | One checkbox |
| Off · Keep · Keep as colourless | Also Kruphix, Horizon Stone and Omnath, Locus of the Void, exactly | A three-state control, against "very lightweight" |
| Keep, with a colour filter or conversion picker | Every card | A picker per player. Too heavy for about a dozen cards. |

- **Upwelling affects every player:** tick each player's box. Keep doesn't turn on for everyone at once, because a per-player toggle that changes other tiles would surprise.
- **The guide's note:** "Keep stops this pool emptying when the turn passes, for Upwelling. For a card that keeps one colour, or turns the mana colourless, black or red, tap away or re-add what changes after the pass."
- Q3 asks whether to add "Keep as colourless" later.

### 4.2 Where it shows

- **In mana mode:** a checkbox at the end of row 2: a 20px rounded box, the lock and the word **Keep**, on a 44px transparent target, `role="checkbox"`. When it's on, the box fills with the seat colour and an ink check, and the word is `--text` (it's `--text-soft` when off). In compact it drops the word and stacks the box over the lock in a cell-sized circle. A tap toggles it, which is one step.
- **When it shows:** only while auto-empty can happen, so while Turns isn't Off and "Empty mana pools when the turn passes" is on. Otherwise nothing would empty, and the control hides.
- **At rest:** the lock leads that player's pips, or their strip, while their pool has mana. With no mana there's nothing to keep, and nothing shows.
- **As the turn passes:** kept pools stay. The announcement adds "Player 4's mana kept".

### 4.3 With the existing setting

| "Empty mana pools when the turn passes" | Turns | Keep |
|---|---|---|
| On | Rounds or Turn by turn | Shown. A kept pool survives the pass; the others empty. Holding back the step restores only what it emptied (as today). |
| Off | any | Hidden: nothing empties. The saved Keep values stay. |
| any | Off | Hidden: nothing empties. |

- The eraser and spending ignore Keep: they're deliberate.
- New game turns every Keep off.

---

## 5. The mana button's icon

*Mock: The pill, Material and Glass, rest and floating (`pill-material-floating.png`).*

- **The glyph:** Mana U+E61C, the classic tilted T, on a light circular pip as card text prints {T}.
  - It replaces U+E61A (the curved arrow) in `.mana-icon[data-glyph="tap"]`, or a new `.tap-pip` element.
  - Add U+E61C to the font subset (`npm run font:subset`; `tests/font.test.mjs`). Drop U+E61A if nothing else draws it; today only the pill does.

| Part | Material | Glass |
|---|---|---|
| Disc | `--pip-c` (#cdc8c4, the C pip's colour), 0.56 × `--setup-button` (27px on phones, 36px at 64px), flat | The same disc, with a 1px `#ffffff55` inner edge and a 1px drop shadow (the glass edge language) |
| Glyph | `--pip-ink` (#111), 0.4 × `--setup-button`, nudged −3% x, +2% y to centre the tilted T optically | The same |
| Floating | A 9px `--accent` dot at (top 0.17, right 0.15) × button, ringed 2px in `--pill-background`, so it separates from the light disc | The same; the ring is Glass's `--pill-background` (`--pill-tint`) |
| Pressed | The pill's 10% layer behind the disc | The 10% layer and the 96% shrink |

- **Contrast:** the disc is 9.2:1 on Material's pill (#242528) and 10.3:1 on Glass's (#1b1c1e). The ink is 11.4:1 on the disc. The dot is 13.6:1 on the pill, but only 1.3:1 on the disc, hence the 2px ring.
- **Rejected:** a lime ring round the disc (`pill-material-floating-ring.png`), which reads as the round button's ring; and a lime disc, since solid lime means commit (Accent L3).
- **The accessible name** adds the state: "Mana pool, 3 mana floating".

---

## 6. Undo and Redo

### 6.1 The model

- **One linear history for the game:** `steps[]` and `at`, the number of steps applied.
  - **Back** applies `steps[at − 1]`'s before-values; **Forward** applies `steps[at]`'s after-values.
  - Recording a new step drops `steps[at…]`: forward history ends when a new game action is taken.
- **One step per action, and a burst is one action:** quick taps on one tile and one count merge into one step (§6.2a). Everything else is one step per press.
- **Saved with the game,** so a relaunch keeps Back and Forward.
- **Capped at 500 steps and 64 KB,** dropping the oldest; Forward steps count toward the cap. Measured: a tap is 48 bytes and a New game 1.2 KB, so 500 mixed steps are 33 KB ([UNDO-ARCHITECTURE.md](UNDO-ARCHITECTURE.md) §2).

### 6.2 What one step is

| Action | One step | Notes |
|---|---|---|
| A tap on − or + | ±1 life | Merges with the tile's open life burst (§6.2a). |
| A hold on − or + | The whole hold | Part of the burst: its repeats are taps. |
| A player going out on that change | Joins the change's step | `handOnLeavers`'s transfers (CR 726.4, 727.4) are in the same step, so one Undo brings the player back and the crown back. |
| A counter cell tap or hold | ±1, or the hold | Merges per cell. |
| A commander damage tap or hold | Damage, the life it costs, and any monarch or initiative transfer (CR 726.3, 727.3) | Merges per seat on the map. |
| A designation cell | The give or clear | |
| A mana cell, a Treasure or Gold cell | ±1, or the hold | Merges per cell. |
| The Keep checkbox | On or off | |
| A pip or strip spend at rest; a Treasure or Gold use at rest | −1 | Merges per colour, or per token. |
| The eraser | The whole pool | Replaces "Undo clear" |
| A turn pass or round step (chip or pill) | The turn **and** the pools it emptied | Replaces the hold-back buffer's restore as the general undo (§6.5). |
| Start chip; "Who goes first?" pick or skip | The turn change | A skip that changes nothing records nothing. |
| A hold on the turn chip or pill (step back) | Its own step | So Undo can undo a step back. |
| New game (from the confirmation, or Start new game) | Everything it reset, including the player count, colours (when shuffled), rotations (when the count changed), identities and Treasure | §6.9 |

### 6.2a Merging quick taps

The owner agreed quick taps can merge. A burst of five taps on − is one step ("life 40 → 35"), shown as it happens by a running delta on the total (§6.2b).

**Which taps merge.** Taps merge only with the same **merge key**, which is the tile plus the count:

| At rest | In a mode |
|---|---|
| `life:i` | `count:kind:i` (poison, tax, energy, experience, rad) |
| `spend:i:colour` (a pip or strip spend) | `damage:i:attacker` (one seat on the map) |
| `token:i:treasure` or `token:i:gold` (a use) | `mana:i:colour`, `token:i:kind` |

Up and down merge together, so a burst is its **net** change: −3 then +1 is "life 40 → 38". A burst whose net change is zero leaves no step.

**The window resets on each tap.** A tap merges if it comes within **1.5s** of the burst's last tap (`mergeWindow` in `data.js`).

- A fixed window (1.5s from the first tap) would split a steady "take 7" burst arbitrarily.
- 1.5s is about twice the gap between deliberate taps on a phone, and twice `announce()`'s 700ms collapse.
- A hold is a run of taps every 100ms, so it stays inside one burst, and a tap before or after it within 1.5s joins it.

**What breaks a burst** (closes it, so the next tap starts a new step):

| Event | Breaks? | Why |
|---|---|---|
| 1.5s with no tap on that key | Yes | The window |
| A different count on the **same tile** (life, then a pip) | Yes, for that tile's open burst | It's a different thing to undo. |
| A tap on **another tile** | **No** | Two players tap at once all the time; neither should cut the other's burst short. Each tile keeps its own open burst. |
| Any step that isn't a merging tap: a turn pass or step back, a Start or "Who goes first?" pick, the eraser, Keep, a designation cell, New game | Yes, every open burst | These are moments; a burst on either side of one is two steps. |
| Opening or closing a board mode, or ✕ | Yes, every open burst | A mode is a context, and its Undo stops at its own start. |
| Undo, Redo or a History jump | Yes, every open burst, first | An Undo during an open burst undoes the whole burst so far. |
| A step from someone else that touched the same cells (a handoff moving the monarch onto this tile, say) | Yes | Merging across it would move a step past one it overlaps. |

**Order.** A burst sits in the history at the place of its **latest** tap: a merge moves the step to the top. Undo takes back what was touched last. This is safe because a burst can only move past steps that touched other cells (the last rule above).

**A tap that puts a player out** ends its life burst after it, with its handoff in the same step. The next tap starts afresh.

**The alternative, one step per press**, is predictable and never merges two players. But five taps then take five Undos (or one History jump). Merging is recommended because the owner asked for it, and the running delta makes each merge visible before it's undone.

**Stored merged, not grouped at undo time** ([UNDO-ARCHITECTURE.md](UNDO-ARCHITECTURE.md) §6.1). Merging keeps the first tap's before-values, updates the after-values and counts the taps (`n`). Steps stay few (500 steps cover far more of a game), and one Undo does exactly what the running delta showed.

### 6.2b The running delta

*Mock: Player 3 tapping − three times while Player 2 taps + twice (`burst-952-4.png`, `burst-568-6.png`, `burst-952-4-glass.png`).*

**Recommended.** While a life burst is open, the total carries a small capsule at its top end corner (−3 or +2), like a notification badge on the number.

- **Feedback:** players across the table see how much was taken, not just the new total.
- **A preview of Undo:** the capsule is exactly what one Undo would take back.

**Look:**

- 0.3 of the total's size, never under 14px, facing the player.
- The tile's button fill, a 1.5px ring and the number in the seat colour for a gain, or `--life-out` for a loss (the colours of the damage map's "28 −6").
- A soft shadow so it reads over the digit's corner.
- It overlaps the total's corner by about a fifth of its own width and stays clear of the − and + glyphs at every size mocked, down to 568 × 320 with 6 players.

**Behaviour:**

- It appears on the second tap of a burst. One tap says nothing new: the total already changed by one.
- It updates on each tap, and fades 300ms after the window closes (none with reduced motion).
- Only for life at rest. In damage mode the self cell already shows "28 −6".
- It isn't a target (`pointer-events: none`) and isn't announced, since `announce()` already speaks the final total.
- It takes no layout room, so nothing refits.
- Spends and Treasure uses don't get one: the pips and the chip count change in place.

### 6.3 What isn't a step

| Excluded | Why |
|---|---|
| Every setting: Track switches, Turns, the Empty setting, Gold tokens, Identity display, Style, Tile colours, Badge size, Shuffle, Reminders, Keep awake | They're preferences, not game events. They save at once and toggle back, and Settings isn't where Undo lives. An Undo of a life tap must never flip a switch. |
| Rotate seats | Physical seating that toggles back. Not a game event. |
| Colours mode choices | Picked at setup, instant and visible. Recording them would flood History at the start of a game. |
| Identity mode toggles | The same: five taps per player at setup would push real steps out of reach. |
| Reminder dismissals, dialogs, the dice | They don't change the game. |

- **Excluded actions don't clear Forward.** They aren't game actions.
- **A New game step still carries** the colours, identities and rotations it reset, so undoing New game brings them back.

### 6.4 How patches stay consistent

- A step stores only the fields and indexes it changed.
- An undo restores exactly those, so an excluded change made since (a new colour, say) survives an undo of an unrelated step. It's overwritten only by undoing the step that last set that field, which is what Undo should do.

### 6.5 Existing systems

| System | Today | Proposed |
|---|---|---|
| Mode edit stacks (counters, damage, mana) | Undo · ✓ · ✕, and edits kept until the mode closes | **The same buttons on the one history.** Each tap is a step, saved at once (as now). Undo is disabled once the mode's own steps are undone. ✓ closes. ✕ asks "Discard N changes?" as today, then undoes the mode's steps; they can be redone. Android back still behaves like ✕. The `edits`, `editStartScores` and `editStartHolders` stacks become "history `at` when the mode opened". |
| Alternative: a mode session is one step on ✓ | | Rejected: Undo at rest would take back every change made in the mode at once, across tiles. Bursts per cell (§6.2a) are the right grain. |
| The turn chip's and pill's hold (step back) | Pops `turnSteps` and restores the pools that pass emptied | Unchanged behaviour, recorded as a step. `turnSteps` stays unsaved, as today. Undo is the general tool; the hold stays because it's turn-only (it doesn't undo a life tap made since the pass). |
| "Undo clear" | 5 seconds, per pool | Retired: the eraser is a step. `clearedPools` and `undoClearTime` go. |
| Auto-empty | Stored with the turn step | Part of the turn step's patch. |

### 6.6 Placement

The pill already holds up to six buttons (round, damage, counters, mana, dice, settings), at 48px each. Measured on the mock, everything on, 2 players, with the pill upright along the 320px or 360px side:

| Pill | Length | 568 × 320 (2 players) | 640 × 360 (2 players) |
|---|---|---|---|
| Today, 6 buttons | 288px | fits | fits |
| **B: + Undo, 7 buttons** | 336px at 48px, 308px at 44px | fits **at 44px** | fits at 48px |
| A: + Back and Forward, 8 buttons | 384px, 352px at 44px | **doesn't fit at any size** | fits only at 44px |

| | A: Back and Forward | **B: Undo; Redo on the toast; hold for History** (recommended) | C: Undo; Redo appears beside it after an undo |
|---|---|---|---|
| Images | `undo-pair.png`, `undo-pair-redo.png`, `undo-board-pair-2p-568.png` | `undo-single.png`, `toast-952-4.png`, `history-material.png` | `undo-transient-redo.png` |
| Buttons | +2, always | +1 | +1, +2 after an undo |
| Forward | Always one tap | On the toast for its 4 seconds, then hold Undo → History → Forward | One tap while it's there |
| Layout | Stable, but it costs every tile near the pill 48px more clearance | Stable | The pill grows and shrinks, so `measureBoard()` moves the tiles' content as you undo |
| 568 × 320, 2 players | Overflows | Fits at 44px | Overflows after an undo |

**Recommendation: B.**

- **Undo** (Phosphor arrow-counter-clockwise, the mode Undo's icon) sits after the mana button and before the dice: game modes, then tools.
  - It always shows, dimmed (0.38) with nothing to undo, so the pill never changes length and the board never jumps.
  - Tap: back one step. Hold for 500ms (`holdDelay`, the round button's `bindStep`): open History.
- **Where the pill would pass the board's short side,** its buttons shrink from 48px to 44px (`--tap-min`). That's only the upright 2-player pill at 568 × 320 (and 320 × 568).
- **The keyboard path,** like `#round-back`: a visually hidden **Redo** button after Undo, shown while it has focus. History is also in Settings → Game, as a row button, where everyone can find it.

**With the card lookup** (being built separately, with two entry points under consideration):

| Lookup entry | Pill with every switch on | 568 × 320, 2 players (320px side) |
|---|---|---|
| (a) A magnifier in the pill, with Undo (B) | 8 buttons: 352px at 44px | **Doesn't fit** |
| **(b) A Tools sheet behind the d20 (Dice and Card lookup), with Undo (B)** | 7 buttons: 308px at 44px | Fits |
| (a) with Back and Forward (A) | 9 buttons: 396px at 44px | Doesn't fit |

- B leaves room for exactly one more pill button, and the lookup would take it.
- So with Undo B, the lookup should go behind the d20 as a Tools sheet, option (b). That keeps the pill at seven and its order unchanged (Undo, then the d20 that now opens Tools).
- With option (a), something else has to leave the pill, or the 2-player pill doesn't fit at 568 × 320.

### 6.7 Feedback

*Mock: The toast after an undo (`toast-952-4.png`).*

- **The toast:** a chip in the reminder chip's language, on the tile the step changed, facing its player: `↶ Undid life 38 → 37 [↷ Redo]`.
  - The label in the seat colour drops first when the chip is too long for its tile (`placeReminders`' `data-fit`).
  - It takes the near edge on short tiles, as reminders do. It stays 4 seconds or until tapped.
  - The **Redo** part is the chip's action, with a 64 × 44 target. A new undo replaces it.
- **Steps without one tile:**
  - A turn step: on the tile whose turn it is after the undo.
  - New game: on every tile, "Game restored".
  - A transfer: on both players' tiles.
- **Redo:** the same chip, "↷ Redid life 38 → 37", with no action.
- **Announcements** (polite, through `announce`):
  - "Undid: Player 3, Coral, life 38 → 37."
  - "Redid: Player 2, Sky, Treasure used, 1 left."
  - "Undid: turn pass. Player 1's turn, round 3."
  - "Undid: new game. 4 players restored."
- **The Undo button's name** says what it would undo ("Undo: Player 3, life 38 → 37"), or "Undo, nothing to undo" when there's nothing.
- **A haptic tick** on each undo and redo.
- **In a mode** the near rows are hidden, so the toast doesn't show; the cell changes in place and the announcement speaks.

**Wording** comes from the patch, through one pure `describeStep()`:

- Life: "life 38 → 37".
- Counters: "poison 2 → 3".
- Tax: "commander tax +2 → +4".
- Damage: "5 commander damage from Player 1, life 33 → 28".
- Mana: "red mana 1 → 0", or "mana pool emptied" for the eraser.
- Treasure: "Treasure used, 2 left" or "Treasure 1 → 2".
- Keep: "Keep on".
- Turns: "turn: Player 1 → Player 2, round 3".
- Designations: "monarch: Player 4 → Player 2".
- Labelled steps: "new game".

### 6.8 The History sheet

*Mock: History (`history-material.png`).*

- **A dialog in the dice sheet's style** (`showDialog`, its 350ms guard, `--dialog-*` tokens, Glass's frosted fill).
- **Rows,** newest first, each at least 44px: the seat's dot, "Player 2 · Sky", what changed, and how long ago.
  - Steps ahead of **Now** (redo-able) are struck through above the line.
  - New game steps are dividers ("New game · 4 players at 40").
- **Tap a row:** go back (or forward) to just after that step, one patch at a time. That's one announcement, "Back 6 steps, to Player 3, life 38 → 37", and one toast per tile touched.
- **Back and Forward** buttons span the foot. Under 360px tall (`history-material-568.png`), they move into the header beside ✕ so the list keeps at least three rows.
- **It faces the phone,** like Settings. The flip button turns it to the other side.
- **It shows** the last 100 steps, loading more as it scrolls.

### 6.9 Edge cases

| Case | Behaviour |
|---|---|
| A player going out, then Undo | The life step holds the life and any handoff. Undo restores both, and `renderPassHints()` redraws the "Pass it on" hints. |
| The monarch moved by damage or a handoff | In the same step, so it's undone with it. A new initiative holder isn't reminded again on redo (reminders aren't replayed). |
| Undo mid-press or mid-burst (someone holding +) | `cancelPresses()` first, as modes do, and every open burst closes. Then undo, which takes back the whole burst so far. |
| Two people tapping at once | Each tile keeps its own open burst, so neither cuts the other short (§6.2a). Each burst sits where its latest tap was, so Undo takes back whichever was touched last. |
| A dialog open | The pill is under the modal scrim, so Undo can't be reached. History is itself a dialog. Back closes it first (§11). |
| "Who goes first?" open after New game | The pill shows only the shuffle and ✕. Skip (which records nothing on a fresh game), then Undo undoes the New game. |
| Undo New game with a different player count | Restores the count, scores, every per-player array, colours and rotations, then rebuilds the board (`renderBoard`, `layoutBoard`, `resetDrops`), clears unsaved state (reminders, strip holds, `turnSteps`), and asks nothing. |
| Undo a turn step while Turns is now Off | `turn` changes but nothing shows. Settings aren't steps. |
| Relaunch | History, `at` and Forward load with the game. Strip holds and the turn hold-back buffer don't. |
| Undo all the way back | Undo dims at step 0, and the toast says nothing more. |
| A save written mid-undo | Each undo is one `commit()`: one save with the game and history together, so they can't disagree. |

### 6.10 How to build it

**Per-field deltas at `commit()`, not inverse edits.** [UNDO-ARCHITECTURE.md](UNDO-ARCHITECTURE.md) compares snapshots, deltas, commands, an event log, checkpoints and SQLite on measured sizes and costs. This section is the summary.

- `rules.js`'s `applyEdit(game, edit, ±1)` inverts the mode edits well. But most steps aren't Edits: life at rest, spends, the eraser, turn steps, handoffs at rest, New game (which has no clean inverse), and the keep and token taps. Inverting each would mean writing and testing an inverse per action.
- **Every action already ends in `commit()`** (DEEP-DIVE §2.1). So `commit()` is where to record:

```js
// actions/commit.js
commit({ scores, badges, pill, layout, measure, step = { kind: undefined, key: undefined } }) {
  const changes = diffBoard(baseline, game);         // logic/history.js, pure
  if (changes.length && step !== false) record(changes, step);  // state/history.js: drops Forward, merges a burst by key, caps
  baseline = boardSnapshot(game);                    // the board fields only (below)
  saveGame(); …redraw as today…
}
```

- **The board fields** (`historyFields` in `data.js`): `startingLife`, `scores`, `rotations`, `colors`, `poison`, `casts`, `energy`, `experience`, `rad`, `identities`, `commanderDamage`, `pools`, `treasure`, `gold`, `keepMana`, `turn`, `monarch`, `initiative`.
  - Settings and `landscapeAngle` aren't board fields. A New game takes the screen's current landscape, and undoing it shouldn't turn the board.
  - Excluded actions call `commit({ step: false })`, which refreshes the baseline without recording.
- **A step's delta** is `d: { field: … }`.
  - Per index for per-player arrays: `{ "scores": { "2": [38, 37] } }`.
  - `{ "i": { "j": [b, a] } }` for `pools` and `commanderDamage`.
  - `[b, a]` for scalars, `turn`, and any array whose length changed (a New game with a new count).
- **Undo** (`actions/history.js`, new):
  - `cancelPresses()`, then `applyChanges(game, step, 'b')`.
  - Then `commit({ step: false, …dirtyFrom(changes) })`. `dirtyFrom` maps fields to what to redraw: per-player fields to that seat's score and badges; `turn` and `pools` to all badges and the pill; `colors` to `paintColours`; `rotations` or a count change to the New-game render path.
  - Then the toast and the announcement.
- **Merging:** each merging action passes its key, as in `step: { key: `life:${index}` }`. `record` merges into that key's open burst under §6.2a's rules, and its timer closes the burst after 1.5s.
- **Performance:**
  - The diff compares about 18 small fields, roughly 1–2 KB as JSON: under 0.1ms.
  - An undo redraws exactly what the original action did. A life undo is one tile's score (and `measureBoard` only when its digit count changes); a mana undo is one tile's badges plus `requestFit()`, which already batches. Only an undo across a player-count change relayouts the board.
  - **Saving** (measured, UNDO-ARCHITECTURE §2.3): the save is 1.0 KB today. With 500 deltas inside it's 26–33 KB, and stringifying and writing it costs 0.5ms p50 and 0.9ms p95 a tap at 4× CPU throttle; 500 snapshots would be 278 KB and 2.5ms p95. Keeping history in the same save means the game and history can't disagree after a kill, and needs no native changes.
  - **The budget:** `commit()` at 500 steps under 4ms p95, measured on a Pixel and an iPhone before M4 ships. If that fails, history moves to a second key written on idle and on `pagehide` (UNDO-ARCHITECTURE §6's fallback).

---

## 7. By board size

| | 952 × 427 (target) | 568 × 320 (stress) | iPad 1366 × 1024 |
|---|---|---|---|
| Mana mode | Wide: 66–69px cells at 2–4 players, 47px at 5–6 | Wide at 2 players (48px), compact at 3–6 (49px, 44px) | Wide, cells as counters (70–165px) |
| At rest: pips | Fit at every count (`rest-952-4.png`, `rest-952-6.png`) | Fit; no fold for one to three mana (`rest-568-4.png`, `rest-568-6.png`) | Fit |
| At rest: Treasure chip | Near row, full type | Near row; shrinks with the row by §3.2 | Near row |
| Pill | 7 buttons, 48px | 48px; 44px only for the upright 2-player pill | 7 buttons, up to 64px |
| Toast | One line | The label drops (`toast-568-6.png`) | One line |
| History | List with the foot (`history-material.png`) | Back and Forward in the header (`history-material-568.png`) | Centred, 600px wide |

## 8. Both styles

- Everything new reads existing tokens: the cell, chip, dialog and pill tokens, and `--seat`, `--text-soft`, `--pip-c` and `--pip-ink`. There are no per-style component rules.
- **Glass's only differences** are the pip's inner edge on the mana button, the frosted History sheet, and the 96% press shrink on the new buttons. The Keep box's fill is the seat colour, not the accent, so Accent L3 (solid lime only for commit) holds.
- See `mode-952-4-glass.png`, `rest-952-4-glass.png`, `toast-952-4-glass.png`, `history-glass.png` and `pill-glass-*.png`.

## 9. Accessibility

- **Targets:** every new target is at least 44 × 44: cells (table, §2.3), the Keep checkbox, the pips, the Treasure chip, the 7-button pill at 568 × 320, the toast's Redo (64 × 44) and History rows.
- **Names start with the visible words** (WCAG 2.5.3): "Keep, Player 2", "Undo: …", "Redo", "Treasure …".
- **Keep** is `role="checkbox"` with `aria-checked`. It isn't a switch, because it reads as a box.
- **Keyboards:**
  - The hidden "Remove one" buttons for Treasure and Gold, like counters.
  - The hidden Redo after Undo, shown on focus.
  - History in Settings → Game.
  - The History sheet's rows are buttons; arrow keys move between them.
- **Announcements** for every undo and redo, use and kept pool (§6.7). In a mode, the existing intros gain "Undo goes back one step" (mana and counters) where they say "Save or Cancel".
- **Colour isn't the only signal:**
  - Keep's check and its word.
  - The struck-through redo rows, with "Now" in words.
  - The floating dot also changes the name.
- **Contrast:** §5's figures. The Keep box's 2px outline is `--text-soft` (12.8:1 on the surface).
- **Reduced motion:** the toast doesn't slide in, and Glass's shrink is off, as everywhere.

---

## 10. Save format and migration

New `Game` fields (the typedef above `loadGame`, its validator, and the fast-check generator in `tests/logic.test.mjs`):

| Field | Type | Default | Validation (anything else is the default) |
|---|---|---|---|
| `treasure`, `gold` | int[players], 0–99 | zeros | `fitCounts` |
| `keepMana` | boolean[players] | all false | each `=== true` (new `fitFlags`) |
| `counters.gold` | boolean (a `Tracker`) | false | `=== true`, like every tracker |
| `history` | `{ v: 1, at: int, base: number, steps: Step[] }` | `{ 1, 0, now, [] }` | `fitHistory(saved, game)`, below |

- **`History`** is `{ v: 1, at, base: epoch ms, steps }`.
- **`Step`** is `{ t: seconds since base, k?: 'newGame' | 'turnBack' | 'eraser' | …, n?: taps merged, d: { field: delta } }`, with deltas as in §6.10 (UNDO-ARCHITECTURE §6).
- **`fitHistory`** never throws, and the worst case is an empty history.
  1. Anything but an object, or a `v` it doesn't know, is empty.
  2. It keeps at most the newest 500 steps, and at most 64 KB of them.
  3. It walks from the newest step back, tracking the player count: a whole-value `scores` change sets the count before it to `b.length`.
  4. A step is kept only if every cell names a board field, has indexes in range for the count at that point, and both values pass that field's own check (`fitCounts`-style ranges, safe-integer scores, `fitSeat` for designations, `fitTurn`'s shape, and arrays of a known player count for whole values).
  5. The first invalid step drops itself and everything older.
  6. `at` must be an integer from 0 to `steps.length`; otherwise it's `steps.length` (no Forward).
- **Old saves:** no `history`, `treasure`, `gold`, `keepMana` or `counters.gold`, so they get the defaults. The game loads as it was, with Undo dimmed until the first action.
- **No version bump** for existing fields, since no meaning changes.
- **Changing the player count** happens only through New game, which records the whole arrays. Undoing it is §6.9.
- **What's not saved:** strip holds, the turn hold-back buffer and toasts. "Undo clear" is gone.

---

## 11. Changes to the existing specs and the guide

| Doc | Section | Change |
|---|---|---|
| SPEC.md | §3.2 | "Never dropped" adds the Treasure and Gold counts. The thresholds table's Mana strip row: one to three mana are pips on a chip-height row and never fold; four or more as today. |
| | §7 | The near row order adds Treasure and Gold after rad. |
| | §8 | "Turn steps save at once and aren't in any mode's Undo" becomes "each turn step is one history step (§6 of MANA-UNDO-SPEC)". The hold stays. |
| | §9 | The mana button icon (§5); mana mode's two rows and two layouts (§2.3); at rest, pips for one to three and the strip for four or more (§3); the eraser undoable; "Undo clear" removed; Keep (§4) in "Automatic emptying". |
| | §10.1 | The rows in §10 above. "Not saved" loses "the mode edit stacks" and "the 'Undo clear' buffer". |
| | §10.2 | Resets add Treasure, Gold and Keep. New game is one undoable step and keeps the history. |
| | §10.3 | Back closes History first (it's a dialog). Modes unchanged (✕ semantics, now undoing steps). |
| | §10.4 | Replaced by §12 below. |
| | §13 | Transfers live in the step that caused them. "Inside the edit" becomes "inside the step". |
| SETTINGS-SPEC.md | §2 Track | "Mana pool" becomes "Mana and Treasure" (Q1). A **Gold tokens** switch row, shown while it's on, after "Empty mana pools when the turn passes". |
| | §2 Game | A **History** row button (opens the sheet), beside Keep awake. |
| | §11 | New game's confirmation lists "Treasure and Gold" while shown, and adds the line "You can undo a new game from the centre." Keep the confirmation (Q5). |
| docs/GUIDE.md | Mana pool | Pips, Treasure and Gold, Keep and its note (§4.1), the new icon. |
| | Counters, Commander damage | "Undo steps back one change at a time" becomes "Undo in the centre steps back through the whole game; in a mode it stops at what you changed there". |
| | New: Undo | One step per action, with quick taps on one tile merged (the −3 on the total), the toast's Redo, hold Undo for History, what isn't undone (settings, seats, colours, identities), saved across launches, New game undoable. |
| README | Features | "Undo and redo for the whole game", "Treasure and Gold". |

## 12. Undo summary (replaces SPEC.md §10.4)

| Where | How |
|---|---|
| **Anything at rest:** life, spending floating mana, using Treasure or Gold, the eraser, turn steps (with what they emptied), "Who goes first?", New game | **Undo** in the centre: back one step per tap. Quick taps on one tile and count are one step; the running delta shows it. **Redo** on the toast after an undo, or in History. Any new game action ends Redo. |
| Counters, commander damage, mana and Treasure in their modes | The same history. The mode's Undo stops at what was changed in the mode; ✓ closes; ✕ asks, then undoes the mode's changes (which Redo can bring back). Transfers of the monarch and the initiative are in the step that caused them. |
| Many steps at once | Hold Undo (or Settings → Game → History): the list, Back and Forward, or tap a row to go back to it. |
| Turn steps, the turn chip or pill held | Steps back one turn, restoring what that pass emptied, as today. It's a step of its own, so Undo can take it back. |
| Settings, Rotate seats, tile colours, identities | Instant, and not in the history. Toggle back. A New game's resets of them are undone with the New game. |

---

## 13. Tests

**Logic** (`tests/logic.test.mjs`, `node:`, fast-check, `PBT_RUNS`):

- `diffBoard` and `applyChanges` round trip: for random games and random actions, `apply(diff(a, b), 'b')` on b gives a, and `'a'` on a gives b.
- Merging: a burst's step equals its taps composed; net-zero bursts leave none; the window resets on each tap and closes after 1.5s of silence; another tile's taps don't break it; a turn pass, mode change, New game or Undo does; a merge never moves a step past one touching the same cells.
- History properties over random action sequences (life, counters, damage with transfers, mana, Treasure, keep, turn steps, New game with a count change):
  - undo all gives the start;
  - undo k then redo k gives the same game;
  - a new step after an undo drops Forward;
  - excluded changes survive unrelated undos;
  - the cap holds at 500;
  - a burst merges only while no step since has touched the same cells.
- `fitHistory`: arbitrary JSON never throws; old saves get an empty history; bad indexes, fields and values truncate at the first bad step; walking back across a count change validates against the older count; `at` is clamped.
- `loadGame` generators and validators gain `treasure`, `gold`, `keepMana`, `counters.gold` and `history`.
- `autoEmptyPools` with Keep: kept pools survive, and the step stores only what was emptied.
- `describeStep` wording for each field (a table test).

**Browser** (`chromium:` and `webkit:`):

| File | Covers |
|---|---|
| `mana.test` | Treasure and Gold cells tap +1 and hold −1; the at-rest chip uses one, holds for 800ms, and is announced; Gold hidden until its switch is on; Keep shows only with Turns on and the setting on; a kept pool survives a pass and its lock shows; New game resets all three; pips for one to three mana, with one button per colour; the strip and eraser from four. |
| `sizes-*.test` (and `-glass`) | Mana mode's wide and compact layouts at every screen in `sizes-checks.mjs` and 2–6 players: every target at least 44px, nothing outside its face, nine controls taking five columns or moving Keep to rest where §2.3 says; the 7-button pill inside the board at 568 × 320 with 2 players (44px buttons) and at 48px elsewhere. |
| `autodrop.test` | Treasure and Gold chips never hidden; the worst case adds both tokens. |
| New `undo.test` | Five quick taps are one step and the running delta reads −5, gone 300ms after the window (fake clock); a tap 1.6s later starts a new step; two tiles tapping at once give two steps, ordered by latest tap; undo and redo of life, damage with a monarch transfer, a player going out with a handoff, a turn pass with auto-empty, the eraser, a Treasure use and New game with a 4 → 6 count change; Forward dropped by a new action but not by a settings change; the mode Undo stopping at the mode's start; ✕ undoing the mode's steps and Redo restoring them; the toast's place, text, Redo and 4s expiry (fake clock); the announcement text; persistence across `reload(page)`; Undo dimmed at step 0; `cancelPresses` on undo mid-hold. |
| New `history.test` | The sheet's rows, Now and dividers; tapping a row jumps; Back and Forward; the header layout under 360px tall; Android back closes it; focus returns to Undo. |
| `font.test` | U+E61C in the subset. |
| `perf` (new, Chromium only) | `commit()` with 500 steps under 4ms p95 at 4× CPU throttle; an undo of a life tap runs one `renderScore` and no `layoutBoard`. |

Mutation checks only on the history rules: `fitHistory`, `record`'s Forward drop and merging, and `applyStep`. UNDO-ARCHITECTURE §7 has the full property list (undo ∘ do = id, redo ∘ undo = id, the cap).

---

## 14. Build plan

Each milestone ships on its own with `npm run check` green.

1. **M1 · The mana icon.** The pip glyph, the dot ring, the accessible state, the font subset, `font.test`, and `pill-*` renders. Small.
2. **M2 · Treasure, Gold, Keep.**
   - The fields, `loadGame` and the generators.
   - The Track rename and the Gold switch.
   - Mana mode's two rows and the wide and compact layouts.
   - Treasure and Gold count chips at rest (tap to use), and Keep in auto-empty.
   - New game's resets and its confirmation's list; GUIDE.
   - Edits use today's stacks: new Edit kinds `treasure`, `gold` and `keep`.
   - Tests: `mana`, `sizes`, `autodrop`, `logic`.
3. **M3 · Lighter floating mana.** Pips for one to three mana on a chip-height row, one button per colour, the strip only from four, and the fit's thresholds (SPEC §9). "Undo clear" stays until M4. Tests: `mana`, `sizes`, `centring`.
4. **M4 · Undo core.**
   - `logic/history.js`: diff, apply, merge, describe and `fitHistory`; `state/history.js`: the baseline, open bursts and `record()` (UNDO-ARCHITECTURE §6.2).
   - `commit()` recording, with `step: false` for excluded actions.
   - The Undo pill button, with 44px buttons where needed; the running delta.
   - A device check of `commit()` and the bridge write with 500 steps (UNDO-ARCHITECTURE §8).
   - Hold to open History (a stub until M5), the hidden Redo, the toast, announcements and persistence.
   - New game undoable; the eraser a step, retiring "Undo clear"; turn steps; handoffs joining their step.
   - Tests: `undo`, `logic`, `perf`, `sizes`.
5. **M5 · Modes on the history, and the History sheet.**
   - Mode Undo, ✕ and Discard on the history; remove the `edits` stacks.
   - The sheet, with rows, Now, jump, and Back and Forward, plus Settings → Game → History.
   - GUIDE's Undo section; SPEC.md and SETTINGS-SPEC.md updated per §11.
   - Tests: `history`, plus `undo` and `counters-mode` updated.

M2 and M3 don't depend on M4. M4 could ship before them if the owner wants Undo first.

---

## 15. Questions for the owner

| # | Question | Recommendation |
|---|---|---|
| Q1 | Rename Track → "Mana pool" to **"Mana and Treasure"**, so players who only want Treasure find it? | Yes. |
| Q2 | At rest, should a tap on the Treasure chip **use one** (fast, consistent with spending a pip) or **open mana mode** (safer against stray taps)? | Use one. Undo makes a stray tap cheap. |
| Q3 | Keep: plain on/off, or a third state **"Keep as colourless"** for Kruphix, Horizon Stone and Omnath, Locus of the Void? | Plain on/off now. Add the third state only if players ask. |
| Q4 | Undo placement: **B** (one Undo button; Redo on the toast; hold for History), **A** (Back and Forward always in the pill, which doesn't fit the 2-player pill on a 568 × 320 phone) or **C** (Redo appears after an undo; the pill jumps)? | B. |
| Q5 | New game is undoable. Keep its confirmation dialog anyway? | Keep it, with "You can undo a new game from the centre". It's one tap more for a rare action, and it lists what resets. |
| Q6 | Treasure's icon: a **chest** (mocked) or Phosphor's **coins**? | Chest, if it reads at 44px on a device; coins otherwise. |
| Q7 | Gold behind its own **Gold tokens** switch (off by default), or always beside Treasure? | Its own switch. Four cards make Gold, and it's what overflows the smallest boards. |
| Q8 | *Resolved:* quick taps on one tile merge (§6.2a). Is **1.5s since the last tap** the right window? | 1.5s. Tune it on a device if steady "take 7" bursts split. |
| Q10 | Show the **running delta** (−3) on the total during a burst? | Yes, for life at rest (`burst-952-4.png`). |
| Q11 | Card lookup's entry: a magnifier in the pill, or a **Tools sheet** behind the d20? | The Tools sheet. With Undo, the pill is at its 7-button limit for 568 × 320 (§6.6). |
| Q9 | Should the Undo button hide until the first action of a fresh install? | No. It always shows, dimmed when empty, so the pill never changes length mid-game. |
