# Player statuses: design spec

**Status:** proposal for the owner's review, 26 November 2026, against main `fa1066b` (v0.1.0-alpha.20). Not built.

- The mock-ups are drawn on the real app (CSS and DOM injected with Playwright, served by `scripts/serve.mjs`, page code through `design/polish/lib.mjs`'s `inPage()`). The review page is `design-status/index.html` in this session's scratchpad, and each figure below names its image there.
- The whole Mana 1.18 font (`design/fonts/mana.woff2`) is injected for the glyphs the subset lacks; nothing in `web/` changed.

**The owner's words:**

> "another design spec for protection by X color, player hexproof and other player tracking chars"

"Chars" here means characteristics: statuses a player has. Group life changes ("ping the board") are a separate spec.

---

## Decisions at a glance

| | Decision |
|---|---|
| **v1 statuses** | Protection (from colours, or from everything), hexproof, shroud, can't lose the game, life can't change, can't gain life, the Ring's temptations (1–4), speed (1–4), the city's blessing. |
| **Not in v1** | Day/night, dungeon rooms, emblems, phasing, extra or skipped turns, protection from a player (§1.2). |
| **Switch** | Settings → Track → **Player status**, off by default, like every tracker. |
| **Where you set them** | A **Status** cell in counters mode (the eighth cell, so the grid stays 4 × 2) opens the **Status sheet** for that player, turned to face them. At rest, a tap on a player's status chip opens the same sheet. No new pill button and no new Track tab. |
| **Durations** | Each temporary status: **End of turn · Next turn · Ongoing**. Turn by turn ends them by itself at the right pass; Rounds ends the end-of-turn ones at each round; Off ends nothing. |
| **At rest** | One chip per player at the end of the near row: an icon per status, protection's colour pips, the Ring's and speed's number, a small clock on temporary ones. A tap opens the sheet. |
| **Overflow** | A new auto-drop step, after the identity symbol and before wrap: a chip with two or more statuses folds to ⛉ n (with the clock if any is temporary). |
| **Undo** | Every set, change and clear is a history step; what a turn pass ends is in that pass's step, so Undo and the turn chip's hold bring it back. |
| **Rules** | The app tracks and reminds; it never blocks a tap. One exception it can't avoid: **can't lose the game** keeps a player from being shown Out (§8). |

---

## 1. Research: what players track

### 1.1 The candidates, counted

Counts are cards whose Oracle text matches, from the committed `data/cards.json` (Scryfall's Oracle data, 26 November 2026); rules are the Comprehensive Rules of 6 November 2026.

| Status | Cards | Rule | Duration in the card text | v1 |
|---|---|---|---|---|
| **Protection from a colour, or everything** | 11 give a player protection (Teferi's Protection, The One Ring, Perch Protection, Seht's Tiger, Faith's Shield, Runed Halo, Absolute Virtue…) | 702.16b–e, 702.16j | Mostly "until your next turn" (Teferi's, One Ring) or "until end of turn" (Seht's Tiger) | **Yes**, the owner's first ask |
| **Hexproof (player)** | 18+ (Leyline of Sanctity, Shalai, Aegis of the Gods, Imperial Mask, Blossoming Calm, Dawn's Truce…) | 702.11c | Mostly ongoing; some until your next turn or end of turn | **Yes**, the owner's second ask |
| **Shroud (player)** | 5 (True Believer, Ivory Mask, Gilded Light…) | 702.18a | Ongoing or end of turn | **Yes**: one more row, and "can't be targeted even by you" matters |
| **Can't lose the game** | 9 (Platinum Angel, Angel's Grace, Lich's Mastery, Darksteel Angel…) | 104.3b with a "can't" effect | Ongoing, or "this turn" (Angel's Grace) | **Yes**: the app decides who is Out, so it must know (§8) |
| **Life total can't change** | 5 (Platinum Emperion, Teferi's Protection, Flare of Fortitude, Teferi's Reproach, Perch Protection) | 119.7–119.8 | Ongoing, until your next turn, end of turn | **Yes**: half of Teferi's Protection |
| **Can't gain life** | 24 (Erebos, Sulfuric Vortex, Leyline of Punishment, Archfiend of Despair…) | 119.7 | Ongoing while the source stays | **Yes**: common in Commander and easy to forget |
| **The Ring tempts you** | 54 | 701.54c: abilities at 1, 2, 3 and 4+ temptations | For the game | **Yes**, a level 1–4 (4 means four or more) |
| **Speed** ("Start your engines!") | 41 | 702.179: 1–4, rises at most once per turn, max speed at 4 | For the game | **Yes**, a level 1–4 |
| **The city's blessing** (Ascend) | 27 | 702.131c | For the rest of the game | **Yes**: a flag, cheap, and players lose track of it |
| Day/night | 47 daybound or "it becomes day/night" cards | 732: a designation of the **game**, not a player | Changes at untap from spells cast | No (§1.2) |
| Dungeon progress (venture) | 38 venture, 23 initiative | 309, 701.49 | For the game | No (§1.2) |
| Emblems | 93 | 114 | For the game | No (§1.2) |
| Phased out | — | 702.26: **permanents** phase, players never do | — | No: Teferi's Protection phases out permanents, which the board doesn't track |
| Extra turn queued | 61 | 500.7 | One turn | No, v1.1 candidate (Q6) |
| Skip next turn | 10 | 614.10 | One turn | No: rare |
| Protection from a player | 3 (Absolute Virtue, Guardian Archon, Noble Heritage) | 702.16k | Ongoing or until your next turn | No, v1.1 candidate (Q4) |

### 1.2 Why the rest wait

- **Day/night is the game's, not a player's.** It would need its own place (the pill is full) and the app can't flip it, since the rule counts spells cast. If wanted later: a sun or moon chip beside the active player's turn chip, tapped to flip (Q5).
- **Dungeons** branch, there are four, and players keep the physical dungeon card. A room tracker is a feature of its own.
- **Emblems** are free text, and the app avoids the keyboard everywhere but the life field.
- **Extra turns** change the turn order, not a player's state; they belong with Turns (Q6). Until then, a player taking an extra turn passes the turn chip and holds it back, as today.

---

## 2. The model

Three shapes, all per player:

| Shape | Statuses | Value |
|---|---|---|
| **Flag with a duration** | hexproof, shroud, can't lose, life can't change, can't gain life | `'turn'` (until end of turn), `'next'` (until your next turn) or `'on'` (ongoing) |
| **Protection** | protection | the colours (any of W U B R G, in that order) or everything, and one duration |
| **Level** | the Ring, speed | 1–4; absent is none |
| **Flag for the game** | the city's blessing | on |

- **One duration for protection,** whatever its colours: adding green to "red until your next turn" makes it "red and green until your next turn". A rare mix (red until end of turn, white ongoing) takes the longer one; that's the price of one row.
- **"Your" is the player who has the status.** Every card above words it that way, including Teferi's Reproach ("until that player's next turn").
- **Global state** (day/night) has no place in v1 (§1.2).

## 3. Durations and expiry

| Turns setting | End of turn | Next turn | Ongoing |
|---|---|---|---|
| **Turn by turn** | Ends at the next turn pass, whoever's turn it is (514.2: the cleanup step). | Ends when that player's turn starts: a pass to them, their Start chip, or "Who goes first?" picking them. If they're out, it ends when play passes their seat (800.4m). | Stays until turned off. |
| **Rounds** | Ends at the next round step (a turn has certainly ended). | Ends at a round step for the first player (their turn starts); for everyone else it stays, with its clock, until turned off. | Stays. |
| **Off** | Stays until turned off; the sheet says so. | Stays until turned off. | Stays. |

- **What ends is part of the pass's step** (MANA-UNDO-SPEC §6.2), next to the pools it emptied: Undo, History and the turn chip's hold bring it back. `turnSteps` keeps `expired` beside `emptied`.
- **The reminder** (*`expiry-952-4`, `expiry-568-6`, `expiry-ipad-4`*): a turn reminder chip on the player's own tile, in the monarch's reminder language: the status's icon, the bold reason as its label, then what ended. "**Your turn:** protection ended" when a Next turn status ends, "**End of turn:** can't lose ended" when an End of turn status ends. On a short tile the label gives way, as built, and "protection ended" still says it all. Two or more on one tile: "**Your turn:** 2 statuses ended". 3 seconds or a tap, announced ("Player 3, protection from red and green ended"). It follows Settings → Reminders → Turn reminders, whose row now also shows while Player status is on and Turns is Turn by turn.
- **An extra turn is a "next turn"** for the rules too, so when Q6's extra turn lands it ends Next turn statuses correctly with no new rule.

## 4. Where you set them

### 4.1 The choice: a Status cell in counters mode, opening a sheet

*Mocks: `settings-track`, `counters-952-4`, `counters-952-4-typical`, `counters-952-6`, `counters-568-6`, `counters-568-2`, `counters-ipad-4`, `counters-952-4-glass`.*

- **Settings → Track → Player status** (Phosphor shield-star, fill), off by default, saved in `game.counters.status`. While it's on, counters mode shows and the counters button (or Track's counters tab) is there even with no counter on.
- **The Status cell** comes last in counters mode, after the crown and castle: a counter cell with the shield-star in the seat colour over the number of statuses that player has (muted at 0). A tap opens that player's Status sheet. With every counter and both designations on it's the eighth cell, so the seven-cell grid's four columns hold it as a full 4 × 2 (78px cells at 952 × 427 with 4 players, 69px with 6, 44px at 568 × 320 with 6). `fitModeGrids`' "more than six" counts it.
- **The Status sheet** (*`sheet-*`*): a dialog for one player, turned to face their seat (0°, 90°, 180° or 270°, the seat's face angle), so the player whose status it is reads it. It closes with Done, Escape or Android back, back to counters mode.

**Why not the alternatives:**

| Option | Against it |
|---|---|
| A new pill button or Track tab | The pill is full (PILL-SPEC.md): a fourth Track tab makes Track's mode seven buttons, which breaks the 2-player pill at 568 × 320. |
| Cells in counters mode for every status | Nine statuses plus durations don't fit a tile: at 568 × 320 with 6 players a face holds about twelve 44px controls. |
| A per-tile long press | The life halves already use the hold, and it's undiscoverable. |
| Inline on the tile, swapping its layer | The same space problem as cells; the sheet works the same at every size. |

### 4.2 The sheet

| Row | Control |
|---|---|
| Header | The seat's dot, **Status**, "Player 3 · Coral", **Done** |
| **Protection from** | Six toggles in the identity toggles' style: W U B R G pips and Everything (the protection glyph). Everything clears the colours and a colour clears Everything. |
| Lasts | Segmented **Off · End of turn · Next turn · Ongoing**. A colour turned on from Off starts at Next turn, the common case (Teferi's Protection, The One Ring); Off clears protection. |
| **Hexproof**, **Shroud**, **Can't lose the game**, **Life can't change**, **Can't gain life** | The same four-way segmented: one tap sets the status and how long it lasts; Off clears it. |
| **The Ring tempts you**, **Speed** | Segmented **– · 1 · 2 · 3 · 4** |
| **The city's blessing** | Segmented **Off · For the game** |
| Note | "Statuses with a clock end by themselves as the turn passes. Ongoing ones stay until you turn them off." (Rounds and Off say what they do instead.) |

- **Off, when chosen, stays quiet** (a neutral ring, no accent), so only what's on lights up; an on row's icon takes the seat colour.
- **Layout:** two columns of five rows where the sheet is wider than 640px (952 × 427, 852 × 393, the iPad), fitting with no scroll at 952 × 427; one column below that, labels beside the controls down to 470px and above them in a sideways sheet. At 568 × 320 the body scrolls (3½ rows show; 6 players' sheet is 530 × 308, a 2-player seat's sideways sheet 312 × 556).
- **"Setting protection from red and green until your next turn, and hexproof ongoing":** red, green (Lasts moves to Next turn by itself), Hexproof's Ongoing: three taps.
- **Each tap is a history step,** as in counters mode: the sheet is part of the counters visit, so the mode's Undo, ✓ and ✕ cover it, and ✕'s message adds "statuses".

## 5. At rest

*Mocks: `rest-952-4`, `rest-952-4-detail`, `rest-952-4-levels`, `rest-952-6`, `rest-568-2`, `rest-568-6`, `rest-ipad-4`, `rest-ipad-6`, glass versions, `cantlose-952-4`.*

- **One chip per player, at the end of the near row,** after the crown and castle (and before the mana strip's last-resort chip). It's a button with the Treasure chip's look (the chip fill and a 1.5px `--rim` ring) and a 44px touch area through `::after`.
- **Inside, in this order:** protection, hexproof, shroud, can't lose, life can't change, can't gain life, the Ring, speed, the city's blessing. Each is its icon:
  - protection: the protection glyph, then its colours as mana pips (`.pip`, 0.98em), or "All" for everything ("All" goes with the identity names at drop step 1, leaving the glyph);
  - the Ring and speed: the icon and the number;
  - a temporary status: a small clock (0.64em, `--text-soft`) raised after its icon.
- **A tap opens the Status sheet** for that player, which explains each status in words and turns it off. Not a one-tap remove: a stray tap on a crowded table would quietly drop hexproof, and the sheet costs only one more tap.
- **Out players' chips dim** with their badges, as today.

### 5.1 Overflow: the fold

*Mocks: `fold-568-6-typical-before`, `fold-568-6-typical-after` (and glass), `fold-568-6-before`, `fold-568-6-after`, `fold-640-6-after`.*

- **A new near-row step, `status`, third:** names (1), the identity symbol (2), **the status fold (3)**, then wrap and shrink as today. The chip folds to the shield-star, the number of statuses and, if any is temporary, the clock. Still a button that opens the sheet.
- **Only a chip with two or more statuses folds:** one status is already as short as the fold, and folding it would lose what it is. The level is board-wide, as every drop is.
- **Statuses never leave the row:** they count as counts for §3.2's "never dropped" list.
- **Why before wrapping:** the fold keeps one line and full type, and the details are one tap away; wrapping or shrinking costs every count on the row.

Measured in Chromium with Roboto. *Typical*: identity chip, poison, the turn chip on Player 3, and Player 3 with protection and hexproof. *Worst*: every counter but rad with two-digit energy, the monarch, the turn chip, Player 3 with five statuses and three others with two.

| Screen | Players | Typical: before → with statuses | Worst: with statuses → folded |
|---|---|---|---|
| 952 × 427 | 4 | unchanged | names, wraps → one line, names kept |
| | 6 | unchanged | names, wraps → names, one line |
| 852 × 393 | 4 | unchanged | names, type 12.7px → one line at full 15.3px, names kept |
| | 6 | unchanged | names, wraps → names, one line |
| 640 × 360 | 4 | unchanged | names, wraps → names, one line |
| | 6 | names dropped | wraps either way (the counters alone wrap) |
| 568 × 320 | 4 | unchanged | names, wrap at 11.5px → names, one line at 12.5px |
| | 6 | **folds** | wraps at 10.75px → wraps at 11.5px |

The fold shows only on the 568 × 320 stress size in a typical game, and on crowded boards elsewhere.

## 6. Icons

| Status | Icon | Source |
|---|---|---|
| Protection | shield with a star | Mana `ms-ability-protection` `\ea84` |
| Hexproof | the hexproof roundel | Mana `ms-ability-hexproof` `\e954` |
| Shroud | the shroud swirl | Mana `ms-ability-shroud` `\ea88` (in Mana 1.18 it's the same shape as `ms-ability-duels-hexproof`; distinct from `\e954`, which is what matters here) |
| The Ring | the One Ring | Mana `ms-ability-the-ring-tempts-you` `\e9e1` |
| The city's blessing | the Ascend sunburst | Mana `ms-ability-ascend` `\e94a` |
| Speed | a gauge | Phosphor `gauge` (fill): Mana has no speed symbol |
| Can't lose the game | a skull, struck through | Phosphor `skull` (fill) with a slash, composed |
| Can't gain life | a heart, struck through | Phosphor `heart` (fill) with a slash, composed |
| Life can't change | a heart with a small lock | Phosphor `heart` and `lock-simple` (fill), composed |
| Temporary | a clock | Phosphor `clock-countdown` (fill) |
| Status (cell, switch, fold) | a shield with a star | Phosphor `shield-star` (fill) |

- **Font subset:** five Mana code points join `web/fonts/mana.woff2`: `\e954 \ea88 \ea84 \e9e1 \e94a` (all in `design/fonts/mana.woff2`), through `npm run font:subset`. Mana has per-colour protection shields (`\ea7f`–`\ea83`), but one glyph and pips reads better with two or more colours.
- **Phosphor:** `gauge`, `skull`, `heart`, `clock-countdown` and `shield-star` (fill) join `iconPaths`; the composed icons are two paths with a mask, drawn once each.
- Mana's `ms-dfc-day`/`ms-dfc-night` (`\e906`, `\e905`) and `ms-dungeon` (`\e995`) exist for later.

## 7. Undo and History

*Mocks: `history-952`, `history-568`, `history-ipad`, `history-952-glass`.*

- **Every set, change and clear is a step** (`commit` with a step key `status:i:kind`); quick taps on one status merge within the 1.5s window, so red then green is one step. Each step belongs to Track's counters tab (`stepTab`).
- **Words** (`describeStep`), using the sheet's own labels so the rows stay short:
  - "hexproof on" / "hexproof off"; "hexproof: end of turn → ongoing";
  - "protection from red and green, next turn"; "protection from everything, next turn";
  - "can't lose the game, end of turn";
  - "the Ring tempts you 1 → 2"; "speed 2 → 3"; "the city's blessing on";
  - in a turn pass's step: "turn pass, round 3, protection ended, Player 4: can't lose ended".
- "Ended", not "expired": it matches the reminder and the plain words used elsewhere.
- Undo's toast reads the same: "Undid hexproof on", with Redo.

## 8. Rules accuracy: what the app does and doesn't do

The app tracks and reminds; it doesn't enforce. One line each:

- **Can't lose the game:** while it's on, the player isn't Out: no "Out" tag, the total stays red at 0, their turn isn't skipped and the monarch and initiative don't hand on (*`cantlose-952-4`*). When it ends with the player at 0 life, 10 poison or 21 commander damage, they go out in that same step, with the handoffs (SPEC.md §13). This isn't enforcement: the app already decides "Out" from the rules (`isOut`), and getting it wrong would skip a Platinum Angel player's turn.
- **Can't gain life / life can't change:** the + and − halves still work. They're also how players fix mistakes, and the source may have just left. Recommend no block; an opt-in "respect statuses" setting could dim + later (Q3).
- **Protection and hexproof/shroud:** nothing to enforce: the app doesn't track spells or sources. Adding commander damage to a player with protection from everything isn't blocked (the damage would be prevented, so players won't add it).
- **Speed:** rises "once on each of your turns"; the app doesn't police it (some cards raise it directly).
- **The Ring:** 4 means four or more, all the emblem's abilities; the Ring-bearer is a creature and isn't tracked.
- **Out players** keep their statuses (an Undo can bring them back in); a new game clears every status, and so does a change of player count.
- **Phasing:** not a player status (702.26 is permanents only).

## 9. Accessibility

- **The chip's name** says everything: "Status, Player 3: protection from red and green until your next turn; hexproof. Edit". Folded, the same name.
- **The Status cell:** "Status, Player 3, 2 on. Open".
- **The sheet:** a modal `dialog` labelled by its title; the protection toggles a `group` of `aria-pressed` buttons named White … Everything; each segmented choice a `group` of `aria-pressed` buttons named by its row ("Hexproof, Ongoing"), with full words for the short labels ("Until end of turn", "Until your next turn", "Ongoing, until you turn it off"). Focus goes to Done on open and back to the cell or chip on close. Every target is 44px.
- **Announcements** (polite): each change ("Player 3, hexproof on"), and each expiry with its turn ("Player 3's turn, round 3. Player 3's protection from red and green ended").
- **Not by colour alone:** on rows light their icon and take the accent; protection's colours are pips with their symbols; temporary has the clock shape.

## 10. Save format

- `game.status`: one object per player, `{ prot?: { from: 'all' | 'RG'…, until }, hexproof?: until, shroud?: until, cantLose?: until, lifeFixed?: until, cantGain?: until, ring?: 1–4, speed?: 1–4, blessing?: true }`, `until` one of `'turn' | 'next' | 'on'`.
- `fitStatuses(saved, count)` in `logic/save.js`: anything not an array of objects gives empty statuses; an unknown key, a wrong value, or colours outside W U B R G (or not in that order, normalized) drop that one entry. Old saves have no `status`, so every player starts with none.
- `status` joins `historyFields`, the `Game` typedef, the `logic.test.mjs` validator and generator, and `fitHistory`'s per-field check. `copy` and `same` in `logic/history.js` learn plain objects (they handle arrays and `turn` today).
- `game.counters.status` (the switch) is a settings field, strict `=== true` like the others.

## 11. Build estimate

About 5–7 agent-days, in three milestones that each ship on their own:

| | Work | Size |
|---|---|---|
| **S1. Model** | `data.js` (kinds, order, words), `fitStatuses`, history words and shapes, expiry in `turnForward`'s callers (`stepTurn`, `startTurn`, the first pick, `stepBack`'s restore), `isOut` with can't lose. Property tests: load, expiry at every turn mode, Undo round trip. | 1.5–2 days |
| **S2. Setting** | The Track switch, the Status cell, the sheet (layout, rotation, controls, its place in the counters visit), font subset and icons. Tests: sizes at every screen in `sizes-checks.mjs`, 44px targets, the sheet facing each seat. | 2–2.5 days |
| **S3. Showing** | The chip, the `status` fold step in `fit.js`, the expiry reminders and announcements, GUIDE.md and SPEC.md. Tests: auto-drop with statuses, reminders, a11y names. | 1.5–2 days |

## 12. Questions for the owner

| # | Question | Recommendation |
|---|---|---|
| Q1 | Is the v1 list right: protection (colours or everything), hexproof, shroud, can't lose, life can't change, can't gain life, the Ring, speed, the city's blessing? | Yes. |
| Q2 | Duration names: **End of turn · Next turn · Ongoing**, or the brief's "Permanent"? | End of turn · Next turn · Ongoing: "permanent" is a card on the battlefield in Magic. |
| Q3 | Block + on a "can't gain life" tile, or + and − on "life can't change"? | No, tracking only; an opt-in later if players ask. |
| Q4 | Protection from **opponents** or a **player** (Absolute Virtue, Guardian Archon, Noble Heritage)? | v1.1: a seventh toggle "Opponents" covers Absolute Virtue; per-player picks wait. |
| Q5 | Day/night as a chip beside the active player's turn chip, tapped to flip? | Later, only if asked: it's the game's state and the app can't flip it by itself. |
| Q6 | An **Extra turn** status, so the next pass returns the turn to the same player? | v1.1, with Turns: it fixes the turn chip for extra-turn decks and ends Next turn statuses correctly. |
| Q7 | A tap on the at-rest chip: open the sheet, or remove? | Open the sheet. |
| Q8 | One clock for both durations, or a second mark for End of turn? | One clock; the sheet and the screen reader say which. |
| Q9 | A one-tap **Teferi's Protection** shortcut in the sheet (protection from everything and life can't change, until your next turn)? | Not in v1: two taps already, and card names in the UI would invite a list of them. |
