# The centre pill stays one row: design spec

**Status:** proposal for the owner's review, 24 November 2026, against main `8b98903`. Nothing here is built.

- The mock-ups are drawn on the real app (CSS and DOM injected with Playwright, served by `scripts/serve.mjs`). Undo, the magnifier and the classic-T mana button are injected as MANA-UNDO-SPEC.md and the `card-lookup` branch draw them. The review page is `design-pill/index.html` in this session's scratchpad, and each figure below names its image there.
- The pill's lengths below are measured on those mocks, not computed.

**The owner's words:**

> "i want the center board to be a single row. need to think of other ways to save space, maybe collapsing other things into one tabbed page."

Wrapping the pill onto two rows was rejected.

---

## 1. The problem

The pill at rest shows one button per feature that's on: the round (Turns), commander damage (Commander), counters (any counter or designation), mana (Mana pool), the d20 and settings. Two more are coming, and both always show: **Undo** (MANA-UNDO-SPEC.md §6.6, placement B, being built on main) and the **magnifier** (card lookup, branch `card-lookup`).

| Pill | Buttons, everything on | 568 × 320, 2 players (upright, 312px usable) | 568 × 320, 3 players (283px seam column) | 952 × 427, 4–6 players | iPad 1366 × 1024 |
|---|---|---|---|---|---|
| Today | 6 | 288px at 48px | 288px, 5px into the end seat | 288px | 384px at 64px |
| Today + Undo | 7 | 308px, **only at 44px** | 336px, 53px into the end seat | 336px | 448px |
| **Today + Undo + magnifier** | **8** | **352px at 44px: doesn't fit** (`today8-rest-568x320-2p-*`) | **384px, 100px into the end seat** (`today8-rest-568x320-3p-material`) | 384px | 512px |

- The 2-player pill at 568 × 320 is the binding case, as the brief says.
- **A second one turned up in the mocks:** with 3 players at 568 × 320 the pill keeps to the left column, where seats 1 and 2 split, which is 283px wide. Eight buttons reach 100px into seat 3. `measureBoard()` gives that seat a clearance, so nothing is covered, but seat 3 loses that much of its face.
- Every size from 640 × 360 up fits eight. The owner wants one design everywhere, so the options below are judged at 568 × 320.

## 2. The options at a glance

| | **A. Track** (recommended) | B. Track + Tools | C. One tabbed page behind settings | D. The round leaves the pill |
|---|---|---|---|---|
| What merges | Commander damage, counters and mana become one **Track** mode with tabs in the pill | A, plus dice and card lookup in one **Tools** sheet | Dice, card lookup and settings become one page with tabs | Nothing. The round button goes, because the tiles' turn and flag chips already step it. |
| At rest, worst case | **6**: round · Track · Undo · magnifier · d20 · settings | **5**: round · Track · Undo · Tools · settings | **6**: round · damage · counters · mana · Undo · menu | **7**: damage · counters · mana · Undo · magnifier · d20 · settings |
| At rest, typical (Commander only) | 5: damage · Undo · magnifier · d20 · settings | 4 | 3: damage · Undo · menu | 5 |
| In a mode | ≤ 6: up to 3 tabs · Undo · ✓ · ✕ | ≤ 6 | 3: Undo · ✓ · ✕ (as today) | 3 |
| 568 × 320, 2 players | 288px at **48px**, 24px spare | 240px at 48px | 288px at 48px | 308px at **44px**, 4px spare |
| 568 × 320, 3 players | 288px, as today | 240px, inside the column | 288px, as today | 336px, 53px into the end seat |
| 952 × 427, 4–6 players | 288px | 240px | 288px | 336px |
| iPad | 384px (64px buttons) | 320px | 384px | 448px |
| Room for more buttons at 568 × 320 | 1 (7 at 44px) | 2 | 1 | 0 |
| Taps that get longer | A mode that isn't Track's last tab: 2 instead of 1 | As A; dice or lookup: 2 when the sheet last showed the other | Dice, lookup or settings: 2 when the page last showed another tab | None, but the round can only be stepped from one player's chip |
| Taps that get shorter | Damage to counters to mana inside one visit: 1 instead of 2 (✓, then the other button) | As A | None | None |
| What's lost | The three mode icons at rest; the mana dot in the centre (it stays on the tiles) | A's losses, and the magnifier the owner chose for visibility | One-tap dice and card lookup, and the magnifier | The round control both sides can reach and read; no room left at 568 × 320 |

---

## 3. Option A: Track (recommended)

*Mocks: `A-rest-*`, `track-damage-*`, `track-counters-*`, `track-mana-*`, `A-face-*`, `todaymode-counters-*`.*

### 3.1 At rest

**round · Track · Undo · magnifier · d20 · settings**

- **Track** stands where commander damage is today. It shows whenever Commander, a counter or designation, or Mana pool is on.
  - **With only one of the three on,** it *is* today's button: the same icon, name and mode, and no tabs. A player who only tracks commander damage sees no change.
  - **With two or three on,** its face is **the icon of the tab it will open,** with **page dots** under it: one dot per tab, the one it opens lit (`A-face-damage`, `A-face-counters`, `A-face-mana`).
  - **The mana dot** (lime, ringed, MANA-UNDO-SPEC §5) shows on Track only while its face is Mana. Each tile's own pips still show floating mana at rest.
- **Undo** follows Track, as MANA-UNDO-SPEC §6.6 placed it after the modes and before the tools. It always shows, dimmed when there's nothing to undo, so the pill's length never changes mid-game.
- **The magnifier, the d20 and settings** are unchanged.

### 3.2 In Track mode: the tabs live in the pill

**[damage | counters | mana] ‖ Undo · ✓ · ✕**

- **Why the pill:** a mode already replaces the rest buttons with Undo · ✓ · ✕, so three slots are free. Up to three tabs fill them and the mode's pill is exactly as long as the rest pill (6), so nothing moves when Track opens.
  - There's no other room along the board's centre: with 2 players the middle seam *is* the pill, and with 4 or 6 the seam is shared by the far rows.
  - A tab strip on each tile would repeat four to six times and push the mode grids.
- **The tabs:**
  - Icon buttons, 48px (44–64px with the pill), in today's order: damage, counters, mana.
  - Only the tabs whose features are on show. With one, there are no tabs and the mode pill is Undo · ✓ · ✕ as today.
  - The open tab takes the **chosen tint** (Accent L3: `--chosen-fill`, `--chosen-ink`, `--chosen-ring`), never solid lime, which stays for ✓.
  - A 2px rule in `--text-soft` at 45% separates the tabs from Undo, which is stronger than the 1px dividers between buttons.
- **Switching tabs:** one tap. The board's mode layer changes in place: the map, the counter cells or the mana cells. The tile content is sized as before, since a longer pill doesn't change the far rows' clearance.
  - Measured: the 4- and 6-player mode layers are laid out the same with today's 3-button mode pill and Track's 6-button one (`todaymode-counters-952x427-4p-material` against `track-counters-952x427-4p-material`).
- **Undo · ✓ · ✕ cover the whole visit,** across tabs:
  - **Undo** steps back through this visit's steps in any tab, newest first, and stops at the visit's start (MANA-UNDO-SPEC §6.5). If the step it undoes belongs to another tab, Track switches to that tab first, so the change is visible.
  - **✓** saves and closes.
  - **✕** asks "Discard N changes?" for the visit as a whole, naming what goes back: "Commander damage, life and poison go back to how they were when you opened Track." Then it undoes them, and Redo can bring them back.
  - Android back is ✕, as today.
  - A tab switch isn't a step, and it doesn't save.
- **Re-entry remembers the last tab:**
  - It's saved as `game.trackTab`, so it survives a relaunch.
  - If that tab's feature has been switched off, Track opens on the first tab that's still on.
  - Track's face at rest shows the remembered tab (§3.1).
- **Opening from a tile goes straight to a tab:**
  - A counter chip opens Track on Counters, and the mana chip or the strip's caret opens it on Mana, as both open their modes today (`badges.js`).
  - A tile opening a tab also makes it the remembered tab.

### 3.3 Taps from rest

| To | Today | A |
|---|---|---|
| Commander damage | 1 | 1 when Track remembers it (the usual case in Commander), 2 otherwise |
| Counters | 1 | 1 from a counter chip on a tile, or 1–2 from the pill |
| Mana | 1 | 1 from the pips or chip on a tile, or 1–2 from the pill |
| Damage, then poison in the same combat | 3 (damage, ✓, counters) | 2 (Track, the Counters tab) |
| Undo, magnifier, d20, settings, round | 1 | 1 |

### 3.4 What's lost

- **Three icons at rest become one,** so a player who uses counters or mana often learns a new place for them. The page dots and the tiles' own chips soften this.
- **One tap more** when the mode you want isn't the remembered tab.
- **The mana dot in the centre** is gone unless Track's face is Mana. The tiles show floating mana anyway.

### 3.5 Accessibility

- **Track's name** says where it goes: "Track: commander damage" (or counters, or mana). With one feature on, it's today's name ("Commander damage"). Its `aria-haspopup` stays unset: it opens a board mode, not a dialog.
- **The tabs:**
  - A `div role="tablist" aria-label="Track"` holds `button role="tab"` elements, each with `aria-selected` and `aria-controls="board"`. Their names are "Commander damage", "Counters" and "Mana pool"; Mana adds ", 3 mana floating" while it does.
  - Only the open tab is in the Tab order (a roving tabindex). The arrow keys move along the tabs and open them, and Home and End jump to the first and last. Both axes work, because the 2-player pill stands upright.
  - Tab moves on from the tab list to Undo.
- **Announcements** (polite, through `announceNow`):
  - Opening: "Track, commander damage, tab 1 of 3. Press a commander on a tile to add one damage. Switch tabs, Undo, Save or Cancel in the centre."
  - Switching: "Counters, tab 2 of 3. Press a counter to add one."
  - Closing: "Saved", "Changes discarded" or "Track closed", as today.
- **Focus:** opening Track moves focus to the first mode cell, as opening a mode does today. A tab switch leaves focus on the tab (the APG tabs pattern), and closing returns it to Track.
- **The open tab isn't shown by colour alone:** it has the tint, its ring, `aria-selected`, and the board's content changes.
- **Contrast:** the chosen tint's figures (SETTINGS-SPEC.md §9). Every target is 44px or larger: 48px buttons at 568 × 320.
- **Reduced motion:** no change. The tabs don't animate.

---

## 4. Option B: Track and a Tools sheet

*Mocks: `B-rest-*`, `tools-sheet-dice-material-952x427` (the `card-lookup` branch's first build, commit `41ff758`).*

- **At rest:** round · Track · Undo · **Tools** · settings (5).
  - Tools is the d20 with a small magnifier on its corner. It opens one sheet with **Dice · Cards** segments, on whichever was open last.
- **Track mode:** as A.
- **Honestly:**
  - The `card-lookup` branch built exactly this sheet first and dropped it when the owner chose the magnifier "for visibility" (SPEC.md §14 on that branch).
  - B undoes that choice to buy a second spare slot that nothing needs yet.
  - Card lookup becomes a segment that new players won't find, and dice users pay a tap whenever the sheet last showed Cards.
  - It's the right fallback only if more pill buttons are coming.
- **Accessibility:** Tools is named "Dice and card lookup". The sheet's segments are a tablist, like A's tabs, and focus returns to Tools on close.

## 5. Option C: one tabbed page behind settings

*Mocks: `C-rest-*`, `C-page-952x427-*`, `C-page-568x320-*`.*

This reads the owner's "one tabbed page" literally.

- **At rest:** round · damage · counters · mana · Undo · **menu** (6).
  - The settings button opens one full-screen page with **Dice · Cards · Settings** as segments in its header, on whichever tab was open last.
- **Modes:** unchanged.
- **Why it's weaker than A:**
  - It merges the *tools* (dice, lookup), which are used mid-game, with *preferences* (settings), which are rare.
  - Dice and lookup become 2 taps whenever the page last showed something else. And the page is settings' full-screen page facing the phone, so rolling a die hides the board, where today's dice sheet doesn't.
  - It also hides the magnifier.
  - What C keeps is one tap for every mode, which matters less because each tile already has chips that open counters and mana.
- **Accessibility:** a tablist in the header. The page keeps settings' focus and back rules.

## 6. Option D: the round leaves the pill

*Mocks: `D-rest-*`.*

- **At rest:** damage · counters · mana · Undo · magnifier · d20 · settings (7). The pill drops the round button in both Turns modes.
  - Turn by turn: the active tile's turn chip passes the turn.
  - Rounds: the first player's flag chip steps the round.
- **What it costs:**
  - It fits at 568 × 320 only at 44px, with 4px spare, so the next button breaks it again.
  - It removes the one control that every player can reach and that both sides can read. In Rounds, only the first player's chip, facing that player, steps the round.
  - At 3 players and 568 × 320 the pill still reaches 53px into the end seat.
- **Worth keeping as a lever:** in Turn by turn, the round button could leave the pill if a later feature needs the slot, because the active player passes their own turn. It isn't needed with A.

## 7. Other ideas, weighed

| Idea | Verdict |
|---|---|
| **Undo inside the settings button's hold** | No. Undo is what a player reaches for right after a mis-tap, under time pressure. A hold on an unrelated button can't be discovered, and it would leave keyboard and screen-reader users with nothing to find. Undo stays a visible button that always shows. |
| **Undo as the first button** | Possible, but not better. The ends of the pill sit closest to the 2-player seats, but the round already leads, and MANA-UNDO-SPEC §6.6's order (modes, then Undo, then tools) also puts Undo next to the mode Undo's place in Track mode (4th, against 3rd at rest). |
| **A swipe on the pill for Undo** | No. It can't be discovered, it fights with the taps and holds on 44px buttons, and it would still need a button for accessibility. |
| **An overflow "more" button** | No, as a new button. On a shared board, a menu has to face someone; its contents would change with the switches, so nobody learns where things are; and it adds a tap to whatever falls into it. Settings already *is* the pill's overflow for rare things, and C is the honest form of this idea. |
| **The round merged into the turn chip** | §6. It's a lever for later, not needed with A. |
| **Hold the d20 for card lookup** | No: it can't be discovered, and the owner wanted lookup visible. |
| **Undo hidden until there's something to undo** | Already rejected (MANA-UNDO-SPEC Q9): the pill would change length and the board would jump. |

## 8. Recommendation

**A, Track.**

- **It solves the binding case with room to spare.** Six buttons fit the 2-player 568 × 320 pill at the full 48px, so the 44px shrink isn't needed, and the 3-player pill stays as long as today's.
- **It keeps everything the owner chose** visible and one tap away: the magnifier, Undo and the d20.
- **The cost lands on the rarer modes.** Commander damage, the most common in Commander, stays one tap when it's the remembered tab. Counters and mana keep one-tap routes from their chips on the tiles.
- **It adds something:** damage, poison and mana in one visit, with one ✓.
- **The pill keeps one length at rest and in Track mode,** so nothing moves when it opens.
- **Keep B and D as levers** if the pill ever needs more slots. Don't build C.

## 9. Migration for players used to today's buttons

- **Nothing changes** for anyone with at most one of Commander, counters and Mana pool on: Track is their old button.
- **Players with two or three on** see one button with page dots where three were. The first time Track opens with tabs, the mode's hint line reads "Switch with the tabs in the centre" once, in the hint's place (the Gesture hints setting turns it off, like the others). After that, the dots and the remembered tab carry it.
- **The guide** (docs/GUIDE.md) gets a "Track" section replacing the three mode entries' "tap the … button" lines. The release notes say "Commander damage, counters and mana are now tabs of one Track button."
- **Saves:** `trackTab` is new and optional; an old save opens Track on its first tab.

## 10. What would change in code (A)

| File | Change |
|---|---|
| `web/index.html` | `#damage-button`, `#counters-button` and `#mana-button` become one `#track-button` (face icon and dots). A `div.pill-tabs[role=tablist]` with three tab buttons goes before `#undo-button`, alongside Undo (build-undo) and `#lookup-button` (card-lookup). |
| `web/js/render/pill.js` | `syncPill()`: Track shows when any of the three is on; its face, name and dots follow `trackTab`; the tabs show in Track mode when two or more are on; `aria-selected` and the roving tabindex. |
| `web/js/logic/rules.js` | `restPillButtons()`: round + Track + Undo + lookup + dice + settings. A new `trackTabs(game)` lists the tabs that are on. |
| `web/js/actions/mode.js` | `openTrack(tab?)` picks the tab. `switchTrackTab(tab)` changes the board mode without ending the visit: the history start stays, and nothing saves or announces "closed". The discard message is built from the kinds the visit changed. The mode opener is Track. |
| `web/js/state/state.js` | `openBoardMode()` keeps the visit's start when switching between editing modes. |
| `web/js/logic/save.js` | `trackTab` ('damage' · 'counters' · 'mana'), validated, defaulting to the first that's on. |
| `web/js/render/badges.js` | Counter and mana chips call `openTrack('counters' / 'mana')`. |
| `web/js/render/announce.js` | Intros gain "tab n of m" and "Switch tabs" (§3.5). |
| `web/js/logic/data.js` | `discardMessages` gains the combined Track message. |
| `web/css/board.css` | `.pill-tabs` as a flex row, with the divider and first and last rules (`:nth-child(1 of :not([hidden]))`) taking the group into account. The open tab's tint, the 2px rule before Undo, and Track's face and dots. Don't use `display: contents` on the tablist: older WebKit drops its role. |
| `web/js/layout/board.js` | No logic change: `measureBoard()` already counts nested `.pill-button`s. The branch's `--pill-fit` shrink stays as a safety net. |
| Tests | Pill counts per switch combination (`sizes-pill`), tab semantics and keys (`accessibility.test.mjs`), a tab switch keeping the visit's steps, ✕ across tabs, Undo switching tabs, `trackTab` load and save, and 48px buttons at 568 × 320 with everything on. |
| Docs | SPEC.md §6, §9 and the pill's description; MANA-UNDO-SPEC §6.6's 7-button limit (no longer binding); `card-lookup`'s SPEC §14 count; GUIDE.md; STYLE.md §2's pill row. |

## 11. Questions for the owner

| # | Question | Recommendation |
|---|---|---|
| P1 | **Which option:** A (Track), B (Track and Tools), C (one tabbed page behind settings) or D (drop the round button)? | A. |
| P2 | **Track's face:** the icon of the tab it will open, with page dots (mocked), or one fixed "Track" icon? | The tab's icon with dots. It says where you'll land, and with one feature on it's today's button. |
| P3 | **Re-entry:** always the last tab, or always Commander damage when Commander is on? | The last tab. A tile's chip already opens counters and mana directly, so the pill's Track mostly reopens damage anyway. |
| P4 | **✕ in Track:** discard the whole visit across tabs (proposed), or only the open tab's changes? | The whole visit: one mode, one ✓, one ✕. |
| P5 | **Undo crossing tabs:** when the step it undoes is in another tab, switch to that tab (proposed), or undo it out of sight? | Switch, so the change is visible. |
| P6 | **The 3-player board at 568 × 320** also overflows with eight buttons (seat 3 loses 100px of its face). Is that confirmation enough that the fix should cover every count, not only 2 players? | Yes. A covers it. |
