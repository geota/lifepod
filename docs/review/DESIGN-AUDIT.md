# LifePod design audit

**Scope:** the shipped web app at v0.1.0-alpha.15 (`main`), judged against `design/polish/SPEC.md`, `SETTINGS-SPEC.md`, `STYLE.md`, `TILES.md` and `GLASS.md`. This is a review only: nothing in `web/` or `tests/` changed.

**Method:** the impeccable critique, run as a single-context delegated review: a design review plus the bundled detector, with no sub-agents. It doesn't repeat [ACCESSIBILITY.md](ACCESSIBILITY.md) or [DEEP-DIVE.md](DEEP-DIVE.md); where a finding overlaps one of them, it links to it.

## How this was checked

- **Renders:** Chromium (playwright-core 1.65) with games seeded through `localStorage`, as `design/polish/final-review.mjs` does. Each screenshot is at 2× density, or the largest scale that keeps it under 1800px wide (1.88× at 952 × 427, 1.31× at 1366 × 1024). There are 88 states plus crops, in `design/polish/renders/audit/` (git-ignored).
- **File names:** `<style>-<size>-<players>p-<seed>-<mode>-<tiles>.png`, where size is `target` (952 × 427), `stress` (568 × 320) or `tablet` (1366 × 1024).
- **Seeds:**
  - **all:** every tracker on (Commander, Poison, Energy, Experience, Rad, Mana pool, Monarch, Initiative), Turn by turn at round 5, mana floating in player 1's pool, and commander damage from every opponent (16, 12, 8, 3, 1).
  - Also in **all:** Show on tiles set to Indicator + Name, Background set to Symbol and Badge size set to Default.
  - **plain:** Commander only, with the default chip.
  - **nofirst:** like **all**, with no first player chosen.
  - **fresh-install:** no save at all.
- **Coverage:**
  - Material and Glass.
  - The Clear tile set (the default), plus Classic, Soft and Jewel.
  - 2, 4 and 6 players at all three sizes.
  - Every mode: commander damage, counters, mana, colours, identity, rotate and "Who goes first?".
  - Settings at the top, the middle and the end, with a new game pending, and with the life field open.
  - Dice (open and rolled), New game, Discard, and a pressed life half.
- **Measured:**
  - The type sizes on the tiles at each size and player count.
  - Whether Glass's backdrop blur takes effect, using a striped probe under the pill.
  - The motion rules in `web/styles.css` and `web/js`.
- **Detector:** `impeccable detect` on `web/index.html` and `web/styles.css`, and on the live preview at 952 × 427, 568 × 320 and 1366 × 1024 (see [Detector](#detector)).

## Summary

The board is strong. The life totals dominate every layout and every tile faces its player. The commander damage map mirrors the table, and the one-size-per-board rule keeps six tiles calm. The Material/Glass split is carried through by tokens without per-style component rules.

The problems are about colour and secondary information, not structure:

1. **The default tile set makes the default table its least distinct** (must). Clear and Soft give seats 1–6 six hue-adjacent colours, so a fresh install shows four dark, warm, muddy tiles.
2. **Secondary counts are small for a shared table** (should). The badge type is set from tile *width*: 12.5px at 6 players on the target, and 16px on a tablet where each tile has 500px of height to spare.
3. **The controls in settings drift** (should). Tile colours is a slider for four unordered choices, with no preview. Lime marks about 30 things on one settings screen. The two confirmation dialogs style their destructive action in opposite ways.
4. **Glass is done carefully, but it barely shows on the board** (should). Its character lives in settings and the dialogs, where it's good, apart from a few unfinished hairlines.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | The active turn, the pending new game and floating mana are all shown. A mode switch is an instant swap that hides the totals with no transition. |
| 2 | Match with the real world | 3 | MTG language, mana symbols and a seat map shaped like the table. The tile set names (Soft, Jewel, Clear) mean nothing without swatches. |
| 3 | User control and freedom | 3 | Undo, ✓ and ✕ in every editing mode, Discard confirms, and Undo clear. |
| 4 | Consistency and standards | 2 | A slider and segmented controls are used for the same kind of choice. Danger styling differs between dialogs. The designation cells are grey. The Glass hairlines are inconsistent. |
| 5 | Error prevention | 3 | Pending new games are labelled ("Start new game") and life halves are whole-half targets. |
| 6 | Recognition rather than recall | 2 | Icon-only counters and pill buttons. Damage chips are identified by colour alone, with hue-adjacent defaults (see also ACCESSIBILITY M8). |
| 7 | Flexibility and efficiency | 3 | Badge size, two styles, four tile sets, seat rotation and the settings flip. |
| 8 | Aesthetic and minimalist design | 3 | The board is clean at rest. Settings is a sea of lime, and the 6-player near rows carry up to 7 chips. |
| 9 | Error recovery | 3 | Undo stacks, hold to step a turn back, and Undo clear. |
| 10 | Help and documentation | 2 | Gesture hints exist, but nothing explains the counter icons, and "Who goes first?" never asks its question at small sizes. |
| **Total** | | **27/40** | **Acceptable, at the top of the band.** The fixes below are mostly polish, plus one real colour default. |

---

## Must

### M1. The default tile set gives the default table its least distinct colours

![Fresh install](../../design/polish/renders/audit/material-target-fresh-install.png)

- **Screenshots:**
  - `design/polish/renders/audit/material-target-fresh-install.png`: Material, no save, 952 × 427, 4 players.
  - `F-default-seats-2p-clear-vs-classic.png`: 2 players, **all** seed. Clear (top) against Classic (bottom).
  - `F-default-seats-4p-clear-vs-soft.png`: 4 players. Clear (**all** seed) against Soft (**plain** seed).
  - `material-tablet-fresh-install.png`: the same as the first, at 1366 × 1024.
- **What's wrong:**
  - `fitColors` gives player *n* swatch *n* (`web/js/logic/save.js:37`, "Players 1–6 default to the first six" in `logic/data.js:31`).
  - In Classic, the ids 0–5 (Sage, Sky, Coral, Violet, Amber, Teal) were picked to spread round the hue circle.
  - Clear and Soft name the same ids in **hue order**: Coral, Copper, Olive, Lime, Jade, Cyan (`logic/data.js:42–44`). So with Clear, the shipped default:
    - a 2-player game is Coral against Copper, two dark reds;
    - a 4-player game is maroon, rust, mustard and dark olive.
  - Soft is worse: at 4 players its four tiles are hard to tell apart at a glance.
  - TILES.md chose Clear because it maximises the *worst* pair over all twelve swatches. The default seats then take the *nearest-neighbour* run of that set.
- **Why it matters:**
  - Tile colour is how players find their own seat, and how they read commander damage: chips and map seats are drawn in the attacker's colours.
  - The board also looks drab on first launch, the moment that sells the app.
  - **A second effect:** switching the Tile colours setting re-hues every player. Classic's id 0 is Sage (green), but Clear's id 0 is Coral (red).
- **Fix:** re-slot Clear's and Soft's twelve palettes onto the swatch ids by hue family, not by hue order. Each id then keeps its family in every set, and seats 1–6 stay spread. For Clear:

  | id | Classic | Clear |
  |---|---|---|
  | 0 | sage | Jade |
  | 1 | sky | Sky |
  | 2 | coral | Coral |
  | 3 | violet | Violet |
  | 4 | amber | Olive |
  | 5 | teal | Cyan |
  | 6 | rose | Orchid |
  | 7 | indigo | Indigo |
  | 8 | slate | Pale plum |
  | 9 | copper | Copper |
  | 10 | olive | Lime |
  | 11 | orchid | Deep plum |

  - Map Soft the same way.
  - Regenerate `tiles7.json` and the `data-tiles` blocks, keeping each set's contrast checks.
  - Add a `palette.test.mjs` check: in every set, the minimum OKLab distance among the default seats at 2–6 players must be at least Classic's.
  - Saved games keep their ids, so existing players see their colour move to a nearby hue only in Clear and Soft. That's acceptable at alpha.

---

## Should

### S1. Secondary counts are too small at 6 players and on tablets

![Tablet, 6 players](../../design/polish/renders/audit/glass-tablet-6p-all-rest-clear.png)

- **Screenshots:**
  - `glass-tablet-6p-all-rest-clear.png`: Glass, 1366 × 1024, 6 players, **all** seed, Clear tiles.
  - `material-target-6p-all-rest-clear.png`: 952 × 427, 6 players.
- **Measured** (the identity name's computed type against the life total):

  | Screen | Players | Badge text | Total | Tile face |
  |---|---|---|---|---|
  | 952 × 427 | 6 | 10.75px | 81px | 316 × 213 |
  | 1366 × 1024 | 6 | 14.1px (badges 16.3px) | 191px | 454 × 511 |
  | 1366 × 1024 | 4 | 21.1px | 195px | 682 × 511 |

- **What's wrong:**
  - Badge type is `clamp(.78rem, 3.6u, …)`, where `u` is the smallest tile **width** / 100 (SPEC §3.1).
  - A 6-player tablet tile is tall, but its badges are sized as if it were a phone tile.
  - About 60% of each tile's height is empty, between the total and the badge rows (see the screenshot).
  - Commander damage (21 is lethal) and poison (10 is lethal) are the counts opponents most need to read from across the table.
  - On the same tablet board, the + and − glyphs sit about 10px from the digits. The total is capped by width, and the glyphs crowd it.
- **Fix:**
  - Size badges from the smaller of the width and height budgets, `min(3.6u, 2.4ub)`, and let auto-drop handle any overflow, as it already does.
  - Or default Badge size to Large when `--grow` > 1.2 (tablets), and keep the Default/Large/Larger choice.
  - Keep a minimum gap between the glyphs and the digits of 0.25 × `--control-size` by lowering the total's width cap on tablets.
  - Related: ACCESSIBILITY H1 (text can't be enlarged), which lists Badge size as the current mitigation.

### S2. Tile colours is a slider for four unordered choices, with no preview

![Settings, Table](../../design/polish/renders/audit/material-target-4p-all-settings-mid-clear.png)

- **Screenshots:**
  - `material-target-4p-all-settings-mid-clear.png`: Material, 952 × 427, settings scrolled halfway.
  - `glass-target-4p-all-settings-mid-clear.png`: the same in Glass.
- **What's wrong:**
  - Classic, Soft, Jewel and Clear are categories, but a slider says "more or less of something". In Material the fill runs all the way to Clear, as if it were a maximum.
  - The control directly above, Style, is a segmented control for the same kind of choice.
  - None of the names says what the tiles will look like.
- **Fix:**
  - Make Tile colours a segmented control in the Style control's pattern: four segments, each with a 4-dot swatch strip of that set's seats 1–4 over its name.
  - Badge size is ordinal, so its slider can stay. Showing "Aa" at the three sizes in the stop labels would show what the choice does.

### S3. Lime is everywhere in settings

![Settings, top](../../design/polish/renders/audit/material-target-4p-all-settings-clear.png)

- **Screenshot:** `material-target-4p-all-settings-clear.png`: Material, 952 × 427, **all** seed, settings at the top.
- **What's wrong:** about 30 lime marks share one screen:
  - Done;
  - the two slider fills and their selected numbers;
  - eight switches that are on;
  - eight row icons and two section icons;
  - the selected Turns segment.

  STYLE.md §1 point 1 and §6 say the accent is used "once per group". The section and row icons carry the accent without being selected or actionable, so nothing stands out, and the page tints green next to the neutral graphite.
- **Fix:**
  - Draw the row icons (`.switch-row` and the navigation rows) and the section-title icons in `--text-soft`.
  - Keep the accent for Done, the selected segment, the slider fills and switches that are on.
  - Glass already keeps the segment thumbs neutral; do the same for its icons.

### S4. The two confirmation dialogs style their destructive action in opposite ways

![Dialogs](../../design/polish/renders/audit/F-dialog-danger-styles.png)

- **Screenshots:**
  - `F-dialog-danger-styles.png`. Top: New game over settings (Material, 952 × 427). Bottom: Discard (Glass, 952 × 427, counters mode with one edit).
  - Full frames: `material-target-4p-all-new-game-clear.png` and `glass-target-4p-all-discard-clear.png`.
- **What's wrong:**
  - New game's only action is the destructive **Start new game**, in the lime primary fill, with ✕ as the only way out.
  - In Discard, the destructive **Discard** is a coral-tinted secondary button, and the safe **Keep editing** gets the lime.
  - New game's message ("All players will go back to 40 life.") leaves out that counters, commander damage, mana and turns reset too.
- **Fix:**
  - Use one rule: destructive actions use Discard's danger-tinted style, and the primary fill goes to the safe or expected action.
  - For New game, add a **Cancel** secondary button and style **Start new game** in the danger tint.
  - Reword the message: "Life goes back to 40. Counters, commander damage, mana and turns reset; settings, colours and identities stay."

### S5. The dice result faces only one side of the table

![Dice](../../design/polish/renders/audit/material-target-4p-all-dice-rolled-clear.png)

- **Screenshots:**
  - `material-target-4p-all-dice-rolled-clear.png`: Material, 952 × 427, d20 rolled.
  - `glass-target-4p-all-dice-rolled-clear.png`: the same in Glass.
  - `material-stress-6p-all-dice-clear.png`: 568 × 320, 6 players.
- **What's wrong:**
  - The dice sheet faces the device, as settings does, but a roll is usually *for* the whole table ("roll for first player", coin-flip effects).
  - Players opposite read the number upside down.
  - Settings has a flip button; the dice sheet has none.
- **Fix:**
  - Print the result twice, like the pill's round button: the main face, plus a mirrored copy on the far edge of the die stage.
  - Or give the dice sheet the settings flip, and briefly show "d20 · 12" mirrored in the pill after the sheet closes.

### S6. With 2 players, the middle seam crowds the pill

![2 players](../../design/polish/renders/audit/material-target-2p-all-rest-clear.png)

- **Screenshot:** `material-target-2p-all-rest-clear.png`: Material, 952 × 427, 2 players, **all** seed.
- **What's wrong:**
  - The vertical pill, both far rows (the sword label and the "12" chips) and player 1's mana strip all stack along the seam within about 90px.
  - The pill loses its outline as the one control, and the damage chips read as part of it.
- **Fix:**
  - With 2 players, add at least 16px between the far rows and the pill clearance (`--clear-*` + 16px).
  - Put the mana strip on the side of the row away from the pill.

### S7. Far rows step up and down around the pill at 5–6 players

- **Screenshot:** `material-target-6p-all-rest-clear.png`: Material, 952 × 427, 6 players, **all** seed.
- **What's wrong:**
  - In one board row, the far row sits at y 330 on the tile the pill reaches and at y 365 on its neighbour (top row, 2× pixels).
  - In the bottom row it's 470 against 437.
  - The tiles' totals line up, but their rows don't, so the board looks ragged next to the one-size rule.
- **Fix:** like the one-size rule, align each board row's far rows to the deepest clearance in that row, so every far row in a row sits at the same depth.

### S8. In counters mode, the monarch and initiative cells look disabled

![Counters](../../design/polish/renders/audit/material-target-4p-all-counters-clear.png)

- **Screenshots:**
  - `material-target-4p-all-counters-clear.png`: Material, 952 × 427, **all** seed.
  - `glass-target-4p-all-counters-clear.png`: the same in Glass.
- **What's wrong:**
  - Every counter icon is drawn in the seat colour.
  - The crown and the castle, on the tiles that don't hold them, are mid-grey, the usual look of a disabled control.
  - The holder's cell is a solid seat-coloured disc, the loudest thing on the tile.
- **Fix:** draw the icons in the seat colour like the other cells. Keep the filled disc for the holder, and add the check mark that identity toggles use, so the holder doesn't depend on colour.

### S9. In Material, the slider fill peeks out at the minimum value

![Slider cap](../../design/polish/renders/audit/F-slider-min-cap.png)

- **Screenshot:** `F-slider-min-cap.png`: Material, 952 × 427, Settings → Table → Badge size at Default. The players slider at 2 and the life slider at 10 do the same.
- **What's wrong:**
  - `.k-fill { left: -8px; width: calc(var(--p, 0%) + 8px) }` (`web/styles.css:1813`) leaves an 8px rounded sliver left of the 4px bar handle at 0%.
  - It looks like a rendering glitch.
  - Glass's 28px round thumb covers it.
- **Fix:** start the fill at the track's start (`left: 0; width: var(--p)`), with the track's own rounded end showing behind it. Or hide `.k-fill` while `--p` is 0, using a `data-min` attribute on the track set by `slider.js`.

### S10. Glass: careful, but invisible on the board, and unfinished in places

![Pill, Material against Glass](../../design/polish/renders/audit/F-pill-material-vs-glass.png)

- **Screenshots:**
  - `F-pill-material-vs-glass.png`: 952 × 427, 4 players, **all** seed. Material on top, Glass below.
  - `glass-target-4p-all-settings-mid-clear.png`.
  - `glass-stress-4p-all-settings-mid-clear.png`: 568 × 320.
- **On the board:**
  - Glass changes only the pill. Over dark tiles it reads as Material's pill with the seam and the active tile's ring running through it. GLASS.md predicted this ("tinted glass looks nearly solid").
  - In Chromium the blur does draw: a striped probe under the pill comes out smooth.
- **In settings:**
  - The grouped lists, iOS-proportioned switches, white slider thumbs and floating header are clearly distinct and well made.
  - Three rough edges:
    1. **Hairlines.** A hairline sits under the last row of each group. The paired action rows (Colours | Rotate seats, and Choose identities alone at half width) get half-width hairlines that stop mid-card. This is the least iOS-like detail in an iOS style.
    2. **The header at 568 × 320.** The floating header takes about 22% of the height, and the labels scrolling under it stay readable as blurred ghosts.
    3. **Neutral segments.** The neutral `#707379` thumb makes Style, Turns and Background quieter than Material's. That's fine, but "Turn by turn" reads close to disabled on a dim screen.
- **Fix:**
  - **Hairlines:** no divider on a group's last row (`:last-child { --row-divider: transparent }`), and lay paired actions out as one full-width grouped list.
  - **Header:** under 360px tall, use the inline header (Material's row) in Glass too.
  - **Pill:** either raise the glass tint to about 80% so seams stop reading through, or drop `backdrop-filter` from the board pill. It shows no visible benefit there, and GLASS.md notes its GPU cost during hold-repeat. Keep Glass for settings and the dialogs, where it earns its place.
  - The dialogs are done well: the blur hides the board behind the text (see `glass-target-4p-all-discard-clear.png`).

---

## Nice

### N1. The four-colour identity symbol is unreadable at chip size

- **Screenshot:** `F-identity-chip-four-colour.png`, from `material-target-4p-all-identity-clear.png` (identity mode, Ink-Treader's preview chip).
- **What's wrong:** five 4px glyphs on a pentagon, with one ghosted, read as a smudge. SPEC §2.4 says the ghost "keeps the pentagon readable at chip size"; it doesn't at 952 × 427. The default chip (Indicator + Name) hides it at rest, but every preview chip shows it.
- **Fix:** for four-colour identities in a chip, show only the indicator (the 4-segment disc already says exactly which colours), and keep the pentagon for the watermark.

### N2. Identity mode puts the chrome's lime on the player tiles

- **Screenshot:** `material-target-4p-all-identity-clear.png`.
- **What's wrong:** each selected toggle gets a lime ring and a lime check: up to 20 accent marks over seat-coloured tiles. On the olive tile, the ring nearly disappears. STYLE.md keeps the tiles for the players' colours.
- **Fix:** use Glass's treatment in both styles: a `--text` ring, with the check in the seat colour.

### N3. "Who goes first?" never asks its question

- **Screenshots:**
  - `material-target-4p-nofirst-first-clear.png`: 952 × 427.
  - `glass-stress-6p-nofirst-first-classic.png`: 568 × 320, where only "Me first" buttons show.
- **What's wrong:** the totals vanish, and the only text is "Me first" and "or the centre button picks at random", which drops on small tiles. A first-time player sees the board change without being told why.
- **Fix:** make the hint "Who goes first?" (shorter, so it survives longer), and give the pill's shuffle button a visible label at 952 × 427 and up.

### N4. Rotate mode has no hint

- **Screenshot:** `material-target-4p-all-rotate-clear.png`.
- **Fix:** add a gesture hint, "Turn your tile", under Settings → Reminders → Gesture hints like the others.

### N5. Motion

- **Mode changes are instant swaps.** Opening counters, damage or mana replaces every tile's content in one frame, so players across the table see their total vanish with no cue.
  - Fix: a 120ms opacity crossfade on the mode layers (opacity only, so nothing is measured mid-way), turned off under reduced motion.
- **Glass's spring goes everywhere.** It's `cubic-bezier(.3, 1.35, .55, 1)` (`web/styles.css:303`, which the detector flags as bounce easing). It drives:
  - the switch thumb's `left`, `width`, `height` and `top` (`:1603`), a layout animation that overshoots the track;
  - the dialog fades, where overshoot means nothing.

  Fix: keep the spring only for press scale. Use `--ease` (Material's) for opacity, and move the switch thumb with `transform: translateX() scale()`.

### N6. Small settings details

- **The life slider:**
  - Its ends (10 and 60) aren't labelled.
  - About 45px separates "Starting life" from its stop labels, against about 20px for Players (`material-target-4p-all-settings-clear.png`).
  - Fix: label the ends in muted type, and use Players' rhythm.
- **The scroll fade:** at the bottom of the body, it sits over the last visible row ("Empty mana pools when the turn passes") and makes it look disabled (the same shot).
  - Fix: end the fade at the content's bottom padding.
- **Pale mana symbols at 0:** in mana mode, zero cells are only desaturated, so pale W, U and C look almost active (`material-target-4p-all-mana-clear.png`).
  - Fix: zero cells at 50% opacity, as counter zeros read.

---

## What works well

- **The life total.**
  - Heavy, tabular, tightly tracked numerals, about 81px on the target and 191px on a tablet.
  - At least 9:1 against every panel in every set (TILES.md).
  - One size for the whole board, so no tile looks more important than another.
- **Every tile faces its player.** The round button prints its number twice, and "you" in the damage map shows that player's own total.
- **The commander damage map** (`material-target-4p-all-damage-clear.png`) is the best screen in the app:
  - the seats are laid out as the table is;
  - each seat is in its owner's colours;
  - your own seat shows your life;
  - one hint line.

  It needs no learning.
- **The life halves.** No button chrome, whole-half targets and a seat-coloured press wash with rounded inner corners. It's quiet at rest and clear under a finger.
- **Auto-drop holds the stress size together.** At 568 × 320 with 6 players and every tracker on (`material-stress-6p-all-rest-clear.png`), every count stays, names drop first, and nothing overlaps.
- **The pill.**
  - One compact control at the centre, with clear dividers.
  - Mode states trade the tools for Undo · ✓ · ✕, with ✓ the only accent.
  - A dot on the mana button says a pool is floating, without opening anything.
- **The tokens.** Both styles are one token block each, with no per-style component rules. Contrast is computed, not eyeballed, for the chrome and all four tile sets.
- **Settings layout.**
  - Two columns in landscape.
  - Sections titled with icons.
  - A pending change turns Done into "Start new game" and explains itself in a live line.
  - The flip button serves the far side of the table.
- **The Glass dialogs** blur the board properly and keep the text crisp, with every fallback (no `backdrop-filter`, Reduce Transparency including the iOS bridge, and Increase Contrast).
- **Dice.** The die art and the six-die picker are a delight, with the die named in the Roll button.

## Detector

`impeccable detect` found 3 issues in the sources and 1 in the live page at each of the three viewports. None needs action as reported:

| Finding | Where | Verdict |
|---|---|---|
| Repeating-gradient stripes (advisory) | `web/styles.css:720`, the Default background's rings | Intentional: it's the "rings" watermark from SPEC §2.3. False positive. |
| Side-tab accent border (2) | `web/styles.css:1821–1822` | False positive: CSS triangles for the pinned-slider arrow. |
| Bounce or elastic easing (advisory) | `web/styles.css:303`, Glass `--ease` | Intentional (the STYLE.md B spring), but over-applied: see N5. |

The detector doesn't judge colour defaults, hierarchy or layout; the findings above come from the renders.

## Who it fails, briefly

- **A first-time player:**
  - opens to four muddy tiles (M1);
  - can't tell what the sword, layers and tap-arrow pill icons do until pressing them;
  - sees counters by icon only (energy, experience and rad need MTG knowledge);
  - can tie a damage chip to a player only by colour (M1, and ACCESSIBILITY M8).
- **An opponent across the table** reads totals easily. At 6 players they can't read poison or commander damage (S1), and a dice result is upside down for them (S5).
- **A colour-blind player:** Clear was chosen for them, but its default seats are its closest hues (M1), and "close to lethal" is shown by colour and weight only (ACCESSIBILITY L4).
- **A tablet host** gets huge totals and phone-sized badges in the empty half of every tile (S1).
