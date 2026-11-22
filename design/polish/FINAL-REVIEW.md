# Polish round: final design review

**Reviewed:** main at 2331f4d, 22 November 2026, against [SPEC.md](SPEC.md).

**How:**

- [final-review.mjs](final-review.mjs) opens the shipped `web/index.html` in Chromium and WebKit with seeded games, and drives every mode and dialog through the real controls.
- It measures each state for:
  - overlaps between a tile's parts;
  - content cut off by its tile or sitting under the centre pill;
  - targets under 44px;
  - sizes that differ between tiles;
  - text cut off or squeezed to nothing;
  - contrast;
  - controls without an accessible name;
  - sheets that scroll.
- **Sweep:** 1,736 states. That's 8 sizes × 2–6 players × 6 seeds (the 8 "Show on tiles" combinations and the 3 backgrounds are spread across the seeds) × every board mode, plus every dialog at every size.
- **Screenshots:** 99 in [renders/final/](renders/final/). Every mode is rendered at 952 × 427 and 568 × 320 with everything on, plus a spread of mixed combinations at the other sizes. Each image is at 2×, or at the largest scale under 1800px wide (952 → 1.88×, 1366 → 1.31×).
- **Data:**
  - [renders/final/findings.json](renders/final/findings.json) has every measured problem, with its size, seed and mode.
  - [renders/final/shots.json](renders/final/shots.json) has each screenshot's sizes, drop tokens, focus and lowest contrast.
  - [renders/final/accessibility.txt](renders/final/accessibility.txt) has the tab order and the ARIA trees.
- **Re-run:**
  - `node design/polish/final-review.mjs` does everything (about 75 seconds).
  - `--shots` or `--sweep` runs one part.

**Seeds used below** (all in the script):

| Seed | What it holds |
|---|---|
| `everything` | Every counter on with two-digit counts, totals 112 and −3, P2 out on poison, commander damage from every opponent, the full chip, Turn by turn, and mana in P1's and P4's pools |
| `commander` | Commander and Poison, the default chip, Rounds |
| `counters` | Four counters, a symbol-only chip, the Indicator background, mana floating |
| `rotated` | Seat rotations `[1, 2, 3, 0, 1, 3]`, a name-only chip, Rounds, a total of 140, one player out on commander damage |
| `startTurns` | Turn by turn with nobody's turn yet |
| `minimal` | Nothing tracked, identity off |

---

## Must fix

### 1. The centre pill covers the life totals in 2- and 3-player games on smaller screens

![](renders/final/stress-2p-everything-rest.png)

- **What:** With five or six pill buttons, the pill is 240–288px wide (384px on the foldable). In 2-player games it sits across both sideways tiles. In 3-player games it reaches into P3's tile. Both times it covers the middle of the total.
- **Evidence:**
  - [stress-2p-everything-rest.png](renders/final/stress-2p-everything-rest.png): P1's "112" and P2's "−3" each lose 933px² under the pill.
  - [stress-3p-everything-rest.png](renders/final/stress-3p-everything-rest.png): P3's "27" loses 933px².
  - [fold-2p-everything-rest.png](renders/final/fold-2p-everything-rest.png): 1,913px² per total.
  - [small-2p-everything-rest.png](renders/final/small-2p-everything-rest.png): 421px².
  - [se-3p-everything-rest.png](renders/final/se-3p-everything-rest.png): 230px².
  - Across the sweep, 54 states have a total under the pill.
- **Reproduce:**
  - Sizes: 568 × 320, 640 × 360, 375 × 667, 320 × 568 or 841 × 701.
  - 2 or 3 players.
  - Turns on, Commander on and any counter on gives five buttons. That's enough at 568 × 320, 320 × 568 and 841 × 701.
  - Adding Mana pool gives six buttons, which also covers 640 × 360 and 375 × 667.
  - 952 × 427 and 852 × 393 just clear it.
- **Fix:** Place the pill by layout instead of always at the board centre.
  - **2 players:** turn the pill vertical, along the middle seam. Both tiles face outward, so their far rows already keep `--setup-button / 2 + 2px` clear of that seam, and their totals sit mid-tile.
  - **3 players:** centre the pill on the seam between P1 and P2 (at 25% of the board width), where both tiles' far rows already leave room.
  - **Test:** add a check to `sizes.test` that no `.score` or `.controls .icon` box intersects `#board-controls` for 2–6 players, with the pill at its widest.

### 2. Rotating seats puts glyphs, chips and mode controls under the pill, at every size

![](renders/final/target-2p-rotated-rest.png)

- **What:** A rotated tile can end up with its near row or one end facing the board centre. Nothing then keeps that edge clear of the pill. Only the far row has a clearance.
- **Evidence:**
  - [target-2p-rotated-rest.png](renders/final/target-2p-rotated-rest.png) is at the primary target.
    - P1's − glyph is entirely under the pill (1,656px²): the half still works, but nobody can see it.
    - P2's identity chip shows only "Gl" and "ye" around the pill (941px²).
  - [tablet-2p-rotated-rest.png](renders/final/tablet-2p-rotated-rest.png): 3,928px² and 2,003px².
  - [stress-2p-rotated-damage.png](renders/final/stress-2p-rotated-damage.png): commander damage seats under the pill (1,566px²).
  - Sweep totals:
    - 21 states with a ± glyph under the pill;
    - 52 with an identity chip;
    - 47 with a map seat;
    - 23 with a swatch;
    - 8 with an identity toggle;
    - 7 with the rotate badge.
- **Reproduce:**
  - 952 × 427 (or any size), 2 players, rotations `[1, 2]`, Commander on, Rounds.
  - 3 players with P3 rotated: P3's glyph goes under the pill.
  - 5–6 players with P2 rotated twice: P2's near row goes under the pill.
- **Fix:**
  - `layoutBoard()` already knows each face's angle. Have it also mark which face edge touches the board centre: `data-centre="near | start | end"` on `.player`.
  - Give that side the far row's clearance. That means `bottom: calc(var(--setup-button) / 2 + 2px)` for `.badges.near` and `.mana-strip`, and matching `padding-inline` on `.controls` and `.mode-layer`.
  - Add rotations to the same `sizes.test` pill check.

### 3. Floating mana hides the player's counters and identity

![](renders/final/target-6p-everything-rest.png)

- **What:** While a pool has mana, the strip replaces the whole near row. Poison, tax, energy, experience, rad and the identity chip disappear from that tile until the pool empties.
  - SPEC §9 asks for this. But it contradicts §3.2, which says every count is never dropped.
  - It also hides game-critical numbers at exactly the moment players check them: P4 can be at 9 poison with mana floating and the tile won't show it.
- **Evidence:**
  - [target-6p-everything-rest.png](renders/final/target-6p-everything-rest.png):
    - P4 (bottom middle, life 5) shows only "(G) 4". Its poison 2, tax +10, energy 8, rad 2 and Golgari chip are gone.
    - P1 (top left) loses tax +2, energy 12, experience 10, rad 14 and its Ink-Treader chip.
  - The sweep flags 271 states at every size and player count.
- **Reproduce:** Any size, any player count, Mana pool on, a pool with mana, any counter above 0.
- **Fix:**
  - Keep the near row, and set the strip on its own line between the total and the near row.
  - Add the near row to the blockers `fitStrips()` keeps clear of, next to `.score` and the glyphs.
  - Where both can't fit, fold the strip into its summary button sooner. The counts should stay.

### 4. The Track row loses its label once four or more trackers are on

![](renders/final/target-6p-everything-setup.png)

- **What:** `.nav-summary` never shrinks, and `.nav-label` has `min-width: 0`. So the summary icons squeeze "Track" down to nothing.
  - With everything on, the row is a flag icon and eight small icons, with no word on it.
  - At six or more icons, the caret runs out of the row: 18px past it at 568 × 320, into the Identity button.
- **Evidence:**
  - [target-6p-everything-setup.png](renders/final/target-6p-everything-setup.png) and [stress-6p-everything-setup.png](renders/final/stress-6p-everything-setup.png).
  - "Track" is measured at 0px wide in 19 sweep states, at every landscape size.

  | Icons in the summary | 952 × 427 | 640 × 360 | 568 × 320 |
  |---|---|---|---|
  | 3 | 38/38px | 38/38px | 25/38px |
  | 4 | 31/38px | 31/38px | 7/38px |
  | 5 | 13/38px | 13/38px | 0px |
  | 6 | 0px | 0px | 0px, caret 18px outside the row |

- **Reproduce:** Any landscape size; Commander, Poison, Energy and Experience on (with Rounds, Mana pool and Rad it gets worse).
- **Fix:**
  - `.nav-label { flex: none; }` and `.nav-summary { min-width: 0; overflow: hidden; }`.
  - Show at most three icons, then "+N".
  - Add a setup test that every `.nav-label` keeps its full width.

---

## Should fix

### 5. Colour swatches are cut off on sideways (rotated) tiles at 640 × 360 and below

- **What:** A sideways face in a short tile has a face width of 159–179px. The 4-column grid at its 44px floor needs 185px, so the top and bottom rows are cut by the tile.
- **Evidence:**
  - [stress-6p-rotated-colours.png](renders/final/stress-6p-rotated-colours.png): rows cut by 26px on P1, P3, P4 and P6. The "P4" owner labels sit outside the tile.
  - [small-4p-rotated-colours.png](renders/final/small-4p-rotated-colours.png): 6px.
  - 163 sweep states.
- **Reproduce:** 640 × 360, 568 × 320 or 320 × 568; 3–6 players; seed `rotated`; Colours mode.
- **Fix:** When `--ui` is under `4 × 44 + 3 × 3 + 2` = 187px, lay the swatches out 3 wide × 4 tall. Every tile has the height for that.

### 6. The black, green and blue indicator discs nearly vanish on their chips

![](renders/final/target-4p-commander-rest.png)

- **What:** The one-colour discs sit on the translucent dark chip. Black (`#383431`) measures 1.17–1.33:1 against it, green 2.25–2.56:1, blue 2.60–2.96:1 (red passes at 3.27:1 and up). Non-text marks need 3:1.
  - With "Indicator" alone selected, a mono-black player looks as if they have no identity.
- **Evidence:**
  - [target-4p-commander-rest.png](renders/final/target-4p-commander-rest.png): P4's Mono-black chip.
  - The script computes these ratios from `styles.css` for all 24 panels; they're in `findings.json → indicators`.
- **Reproduce:** Any size, identity B (or G or U), Show on tiles set to Indicator.
- **Fix:** Give `.ci` a real rim, `box-shadow: 0 0 0 1.5px color-mix(in oklab, var(--text) 65%, transparent)`, in place of the 1px blurred inset. Then every slice has a visible edge without changing the official colours.

### 7. Turn by turn with nobody's turn yet: every tile says "Turn 1"

![](renders/final/target-6p-startTurns-rest.png)

- **What:** After "Who goes first?" is skipped, every live tile shows an outlined "Turn 1" chip. It reads as a status ("it's everyone's turn"), not an action. The screen reader label says "Start Player N's turn", but the visible text doesn't.
- **Evidence:** [target-6p-startTurns-rest.png](renders/final/target-6p-startTurns-rest.png).
- **Reproduce:** Any size, seed `startTurns` (Turn by turn, `turn.active: null`).
- **Fix:** Label start chips with a verb, such as "Start" or "My turn" with the untap symbol, and keep "Turn N" for the active chip only.

### 8. The folded mana strip looks like the spend strip but does something else, and the turn chip leaves the strip

- **What:** On 640 × 360 and smaller screens, a busy pool folds into one summary button.
  - It looks exactly like the normal strip without its eraser, but a tap opens mana mode instead of spending.
  - Separately, the `strip-turn` step removes the turn chip and first-player flag from the strip. That breaks SPEC §3.2, which lists the turn chip under "never dropped". On those tiles the pill is the only way to pass.
- **Evidence:**
  - [stress-6p-everything-rest.png](renders/final/stress-6p-everything-rest.png): P1's strip is folded and its flag is gone.
  - Folds in 47 sweep states (568 × 320, 640 × 360, 852 × 393, both portraits). The turn chip is dropped in 18.
- **Reproduce:** 568 × 320, 6 players, seed `everything` (P1 holds W, B, R and C).
- **Fix:**
  - Give the folded button a visible "open" cue: a trailing caret, or the tap symbol in a filled disc. Label it "Mana ›".
  - Keep the turn chip, and fold the strip before dropping it.

### 9. Identity toggles: on and off look almost the same

![](renders/final/target-6p-everything-identity.png)

- **What:** Both states show the full-colour mana symbol. "On" adds only a thin light ring and a slightly lighter disc. At a glance, and for colour-blind players, P1's four-of-five reads like five-of-five.
- **Evidence:** [target-6p-everything-identity.png](renders/final/target-6p-everything-identity.png), [stress-6p-everything-identity.png](renders/final/stress-6p-everything-identity.png).
- **Reproduce:** Any size, identity mode.
- **Fix:**
  - Mute the off state the way mana mode mutes a zero (`.pip { filter: saturate(.3) brightness(.85); opacity: .7 }`).
  - Give the on state a small check badge.
  - Add the one-line hint the other modes have ("Tap your colours").

### 10. The Identity sheet doesn't explain itself

![](renders/final/target-6p-everything-identity-sheet.png)

- **What:**
  - "Show on tiles" is multi-select, but it looks exactly like the single-select segmented controls around it. Nothing says that more than one can be on, or that none at all means off.
  - "Indicator" and "Symbol" are jargon. A first-time player can't tell which is the colour disc and which is the guild mark.
- **Evidence:** [target-6p-everything-identity-sheet.png](renders/final/target-6p-everything-identity-sheet.png).
- **Fix:**
  - Use the optional 16px segment icon from §4.1: the WUBRG disc for Indicator, the pie symbol for Symbol, "Aa" for Name.
  - Show a check in each selected multi segment.
  - Make the note say what's on: "Tiles show the colour disc and name", or "Identity is hidden on tiles" when none is selected.

### 11. A player who's out is shown only by a red total

- **What:** Being out at 0 life, 10 poison or 21 commander damage only recolours the total, from about 9:1 down to 4.8:1. Nothing says "out".
  - At a real table, a red "27" next to a 10-poison chip makes you work it out.
  - Screen readers hear "−3 life" with no "out".
- **Evidence:**
  - [target-6p-everything-rest.png](renders/final/target-6p-everything-rest.png): P2 is out at −3 life and 10 poison.
  - [accessibility.txt](renders/final/accessibility.txt): `status "-3 life"`.
- **Fix:**
  - Add a small "Out" label (or a skull) under the total.
  - Dim the tile's badges.
  - Make the label "−3 life, out" (or "out on poison").

### 12. The hidden "Back one turn" button takes keyboard focus with no visible focus

- **What:** `#round-back` is visually hidden but in the tab order. A keyboard user lands on it and sees nothing, which fails WCAG 2.4.7.
- **Evidence:** [accessibility.txt](renders/final/accessibility.txt), tab stop 18: `button#round-back.visually-hidden "Back one turn"`.
- **Fix:** Show it while focused (`#round-back:focus-visible { position: static; clip-path: none; … }`, as a small "‹ Back" button beside the round), or take it out of the tab order and give the round button an `aria-keyshortcuts` step back.

### 13. The 5-player end seat gets a smaller commander damage map

![](renders/final/target-5p-everything-damage.png)

- **What:** P5's map is drawn sideways in a tall tile, so its seats come out smaller than everyone else's: 50px against 78px at the target, and 44px (the floor) against 56px at 568 × 320. It sits in a mostly empty tile.
  - §3.1 lists map seats among the things that are the same size on every tile.
- **Evidence:**
  - [target-5p-everything-damage.png](renders/final/target-5p-everything-damage.png), [stress-5p-everything-damage.png](renders/final/stress-5p-everything-damage.png).
  - "map seat differs" at every size with 5 players.
- **Fix:** Size the map from the seat's short side, so each seat is the same size on every tile. P5's tile has the room for it.

---

## Nice to have

14. **A three-digit total shrinks every total more than the spec expected.**
    - §3.1 says three digits fit at full size on phones. That holds at 952 × 427 and 852 × 393, but not below.
    - At 640 × 360 with 6 players, one total of 112 takes every total from 68px to 52px (−25%). At 568 × 320 it goes from 61px to 40px (−33%).
    - Evidence: [stress-6p-everything-rest.png](renders/final/stress-6p-everything-rest.png) against [stress-6p-counters-rest.png](renders/final/stress-6p-counters-rest.png).
    - Fix: the glyph boxes (44px each, inset 5u) are only visual, because the halves are the targets. When `--board-digits` is 3, shrink `.controls button` to the glyph's own width. That gives back about 30px for the total.
15. **Badge type is small for reading across a table.**
    - Chips are 12.5px at 952 × 427 with 5–6 players. The identity name is 0.86 of that (10.75px).
    - On the tablet, chips stay 16px in 455 × 510 tiles where the total is 128px ([tablet-6p-everything-rest.png](renders/final/tablet-6p-everything-rest.png)).
    - Fix: let the badge clamp use `min(--ui, 1.2 × --ub)` on tablets, and raise the name to 0.92em.
16. **Counter icons are tiny on small boards.** At 568 × 320 with 6 players, the icon is about 12px in a 51px cell ([stress-6p-everything-counters.png](renders/final/stress-6p-everything-counters.png)). Poison, energy and rad are hard to tell apart. Fix: icon at 0.42 × cell, count at 0.3 × cell.
17. **The untap symbol reads as a "J" once "Turn" drops.** At 640 × 360 and below the chip is "↺ 12" ([stress-6p-everything-rest.png](renders/final/stress-6p-everything-rest.png), P3). Fix: keep a short "T12" or keep the word longer than the identity name in the drop order.
18. **The Track row's icon is a flag,** the same flag that marks Rounds and the first player, and it also appears inside Track's own summary. Fix: use a neutral icon for Track, such as a list or tally.
19. **The pill is icons only.** A first-time player has to guess that the layers icon is Counters and the tap arrow is Mana. Fix: a long-press tooltip, or a one-time label row the first time each button appears.
20. **About scrolls with no cue.** At 952 × 427 it holds 573px of content in 413px, and Credits starts below the fold with nothing hinting there's more ([stress-6p-everything-about.png](renders/final/stress-6p-everything-about.png)). Fix: a bottom fade or scroll shadow.
21. **The ARIA structure is mixed.**
    - The turn chip is a `button` directly inside `role="list"`.
    - "Went first" is a `listitem` inside the mana strip's `role="group"`.
    - Fix: wrap buttons in `role="listitem"`, and make the strip a list too.
22. **Motion.**
    - Nothing animates except the life bump, the dice and the first-player shuffle. Turn passes, mode changes and sheets appear instantly.
    - A 150–200ms fade of the active-turn ring would help the table notice the turn moved.
    - Under reduced motion, the "Goes first" beat is skipped (`firstBeat` becomes 0), so the confirmation is never seen. It's a static highlight, not motion, so keep it for its 700ms.
23. **Setup and dialogs face one side of the table only.** That's expected on a shared phone, and it's fine for setup. But the discard and new game questions are often answered by whoever is across the table. A control to turn the sheet toward the other side would help the player opposite.

---

## What works well

- **One system.** The tile palette, the chips, the seat-coloured glyphs, the accent pill and the six setup control types read as one family at every size and in both engines. The WebKit renders ([webkit-target-6p-everything-rest.png](renders/final/webkit-target-6p-everything-rest.png)) match Chromium and show the same problems.
- **One size per board works.**
  - Across all 1,736 states, totals, ± glyphs, badges, strip type, turn chips, counter cells, swatches, identity toggles and "Me first" are the same size on every tile (within 0.5px).
  - The only exception is the 5-player map (13).
- **Targets.** Not one target under 44px in any state at any size, including 568 × 320 and 320 × 568.
- **Contrast.** No text fails.
  - The lowest is the red life total of a player who's out, at 4.79:1 (large text needs 3:1).
  - Every icon clears 3:1, apart from the indicator discs (6).
- **Setup, Track and Identity fit without scrolling** at every size, including the folded header at 568 × 320, the stacked portrait layouts, and the custom life stepper.
- **Auto-drop does what §3.2 says.** Names, then symbols, then type, board-wide and without flicker. No count chip was ever hidden by a drop step; only the mana strip hides counts (3).
- **"Who goes first?" is the clearest screen in the app** ([target-6p-startTurns-first.png](renders/final/target-6p-startTurns-first.png)): one big "Me first" per seat, facing its player, and a one-line explanation of the shuffle.
- **Commander damage map:** seats in each opponent's own tile colour, "you" in place, with the life change shown. A first-time player gets it.
- **Screen reader labels are complete and specific.** For example: "Player 3's turn, round 12. Pass the turn", "Player 1, 3 red mana. Spend one", "Remove one poison counter from Player 1". Every visible control has a name.
- **Focus:** opening a dialog or mode moves focus into it and closing returns it. Touch never shows focus rings; keyboard always does.
- **Ergonomics:**

  | Action | Taps |
  |---|---|
  | Change life by 1 | 1 (hold repeats) |
  | Pass the turn | 1, on the chip or the pill |
  | Spend one floating mana | 1 |
  | Commander damage (it also takes the life) | pill, the seat (hold repeats), ✓: 3 for 1 damage |
  | Poison or another counter | pill, the cell, ✓: 3 |
  | Add one mana | 3 |
  | New game | 3 |

## Notes on the method

- **Not real devices.** Everything ran in Playwright's desktop Chromium and WebKit with touch emulation. Fonts are macOS `system-ui`, so Android (Roboto) widths differ by a few pixels. CI's Roboto run (80b330f) is the better check for exact fit.
- **Focus rings.** Taps use real touch events, so no focus rings appear where a touch wouldn't show them.
- **Map seats.** They're compared by their short side, because each tile's map turns with its seat.
- **About.** Its text "outside the sheet" is just scrolled out of view; it's covered by 20, not counted as clipping.
