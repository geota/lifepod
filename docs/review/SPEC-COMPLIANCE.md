# Spec-to-code compliance review

**Scope.** This review checks the code at `main`, `v0.1.0-alpha.15` (ac0e0b8), against four documents:

- `design/polish/SPEC.md`
- `design/polish/SETTINGS-SPEC.md`
- the player-facing rules in `README.md`
- the invariants in `AGENTS.md`

The code checked is `web/app.js`, `web/js/**`, `web/styles.css`, `web/index.html`, `android/src/**` and `ios/LifePodApp.swift`. Where a later decision supersedes earlier text, the latest decision is the requirement and the earlier text is reported as stale. The later decisions are a 22 November block, an "As built" table or a superseded banner. Examples are Background as Symbol · Default · Off, the strip at the far edge, the 22 November overflow order, the settings page replacing the sheets, and the 10% cell press.

**Method.**

- **Requirements.** Requirements were taken from the four documents and grouped by area: board layout and fitting; rules, modes and saves; settings, identity, style and platform. Each area got its own checker, which read the enforcing code and its callers.
- **Running the app.** Behavioural divergences were run in Chromium through `tests/helpers.mjs`, with the Roboto test font. The settings checks ran in Chromium only.
- **Confirming the bugs.** For the behaviour bugs below, the lead reviewer re-read the code path and re-ran the digit-change probe on their own.
- **Gaps.** The native apps were not built or run. Their requirements rest on reading `MainActivity.kt`, `AndroidManifest.xml` and `LifePodApp.swift`, and the WebKit-only paths were not run.

## Summary

| Verdict | Count | Meaning |
|---|---|---|
| Implemented | 67 | Holds on every path checked |
| Stale (implemented per the latest decision) | 4 | The code follows a later decision; the older text still reads as a requirement |
| Partial | 9 | Holds on the common paths and fails on one |
| Stronger than spec | 3 | An extra constraint that nothing documents |
| Contradicted | 2 | The spec or README states something the code doesn't do; both are documentation errors |
| Undecidable | 1 | Defined only relative to an older build |
| Absent | 0 | |
| **Total** | **86** | |

**Behaviour bugs (ranked):**

1. Badge rows aren't refitted when a total's digit count changes. Far rows can overlap the totals.
2. The first player's initiative reminder is lost if "Who goes first?" is closed during the "Goes first" pause.
3. The initiative reminder fires on saving counters or damage mode even when no turn has started.
4. `loadGame` resets the whole game on any of a few bad fields, and accepts a starting life above 999.
5. Skipping "Who goes first?" after Turns goes Off → on keeps the old round.
6. The CSP still allows `file:` sources.

### Alignment matrix

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | SPEC §1 life halves: no chrome, glyphs 5u in, each half is the whole target | Implemented | styles.css:830-849 |
| 2 | SPEC §1 press wash: 17% seat, 28px inner corners, only while pressed | Implemented | styles.css:663, 843-850 |
| 3 | SPEC §1 counter and mana cells are circles, 55% fill, no border | Implemented | styles.css:664, 1075-1085 |
| 4 | SPEC §1 cell press fills 26% seat | Stale (SETTINGS §7: 10% state layer) | styles.css:1095 |
| 5 | SPEC §1 pill and map seats "unchanged" | Undecidable | Defined only relative to an older build |
| 6 | SPEC §3.1 `--ui`, `--ub`, `--board-digits` (at least 2) | Implemented | board.js:44-74, 206-209 |
| 7 | SPEC §3.1 re-run on resize, rotation, player count, seat rotation and a digit-count change | **Partial** | Finding B1 |
| 8 | SPEC §3.1 tile CSS formulas (u, control, glyph, badge, total) | Implemented | styles.css:683-696, 785, 836 |
| 9 | SPEC §3.1 "on phones, three digits still fit at full size" | **Contradicted** (the spec is wrong) | Finding S1 |
| 10 | SPEC §3.1 Centring (22 Nov) | Implemented | board.js:104-136; `tests/centring.test.mjs` passes |
| 11 | SPEC §3.2 never-dropped list | Implemented | styles.css:1186-1187, 1245 |
| 12 | SPEC §3.2 overflow order: near steps 1-4, far steps 1-3 (22 Nov) | Implemented | fit.js:16-21, 106-115, 183-201 |
| 13 | SPEC §3.2 "two lines never cover the total" (the steps swap) | Implemented | fit.js:117-123, 196-199 |
| 14 | SPEC §3.2 `fitBadgeRows()` after every badge and layout change | **Partial** | Finding B1 |
| 15 | SPEC §3.2 measured shrink in 0.25px steps, 9px floor | Implemented | fit.js:31, 186, 222-229 |
| 16 | SPEC §3.2 board-wide levels | Implemented | fit.js:37, 95-99 |
| 17 | SPEC §3.2 hysteresis: 15%; reset at a new game or a Badge size change | Stronger than spec | Also reset when fonts finish loading (app.js:93) |
| 18 | SPEC §3.2 `data-drop` tokens | Implemented | fit.js:27 adds an undocumented `strip-wrap` |
| 19 | SPEC §3.2 worst-case and typical-game tables | Implemented | Every cell matched when run |
| 20 | SPEC §3.2 threshold: mode hints (ub ≥ 200, ui ≥ 240) | Implemented | board.js:67-68 |
| 21 | SPEC §3.2 threshold: identity toggles, 5 across when ui ≥ 264, else 3 + 2 | Stronger than spec | board.js:179 can also fall to 2 columns |
| 22 | SPEC §3.2 threshold: mana strip on one line, otherwise two | Stale (§9's 22 Nov placement) | fit.js:27, 273-288 |
| 23 | SPEC §3.2 threshold: cells 78px on the target, 50px at 568 × 320 | Implemented | styles.css:1067, board.js:146 |
| 24 | SPEC §3.2 threshold: settings header 4px under 360px tall | Implemented | styles.css:1771-1772 |
| 25 | SPEC §7 near-row order | Implemented (turn chips lead, per §8) | badges.js:214-229 |
| 26 | SPEC §7 commander damage "at 26px" | Stale | The far row is 1.7em of the badge size |
| 27 | SPEC §9 strip only while there's mana, only the colours held; both rows stay | Implemented | badges.js:109-111, 204-214 |
| 28 | SPEC §9 strip at the far edge: below, inline, fold, fold-inline (22 Nov) | Implemented | fit.js:246-327 |
| 29 | SPEC §9 44px items, spend 1, eraser, 5s "Undo clear" | Implemented | mana.js:25-62; data.js:137 |
| 30 | SETTINGS §10 Badge size ×1.2 / ×1.4; totals and mode cells unchanged | Implemented | styles.css:688-693 |
| 31 | SETTINGS §10 room cap (`measureBadgeRoom`) | **Partial** | Finding B1 |
| 32 | SPEC §2.2 Show on tiles in any combination, default Indicator + Name | Implemented | save.js, tile.js:69-81 |
| 33 | SPEC §2.2 chip order and shapes; an unset identity shows no chip | Implemented | tile.js:72-78 |
| 34 | SPEC §2.3 Symbol · Default · Off, version-2 migration | Implemented | tile.js:86-94; migration verified in node |
| 35 | SPEC §2.4 symbols for all 31 identities, shards \ea0d–\ea11, 25% ghost | Implemented | styles.css:756-781; tile.js:46-60; all 31 checked |
| 36 | SPEC §2.5 name table | Implemented | data.js:107-115; all 31 checked |
| 37 | SPEC §2.6 identity mode: preview with all three, "No identity", ✓ and back | Implemented | modes.js:156-173 |
| 38 | SPEC §5 twelve swatches as a 4 × 3 grid, by the clamp formula | **Partial** | Finding D6 |
| 39 | SPEC §5 no shared colours; a taken swatch shows "P2" | Implemented | modes.js:110-124; edits.js:18 |
| 40 | SETTINGS §7 Tile colours: Classic · Soft · Jewel · Clear, default Clear | Implemented | data.js:40-47 |
| 41 | SPEC §6 order, 0–99, tax +2n, hold 500ms then 100ms, icons | Implemented | data.js:69-75; press.js:148-157 |
| 42 | SPEC §6 "three per row" | Stale (§13: seven cells go four to a row) | |
| 43 | SPEC §8 "Who goes first?" on a new game, on Off → on with no first player, after settings closes | Implemented | mode.js:35-39; options.js:129 |
| 44 | SPEC §8 shuffle with `crypto.getRandomValues`, about 0.8s | Implemented | rules.js (randomBelow); 8 × 90ms |
| 45 | SPEC §8 skip leaves no first player, round 1 | **Partial** | Finding B5 |
| 46 | SPEC §8 play order table, 2–6 players, unaffected by rotation | Implemented | data.js:133 |
| 47 | SPEC §8 Rounds: tap next, hold back, minimum 1 | Implemented | turns.js:36-49, 73-89 |
| 48 | SPEC §8 Turn by turn: pass skips `isOut`, round up on the wrap, hold back | Implemented | rules.js:140-155 |
| 49 | SPEC §8 pill round button, printed twice | Implemented | pill.js |
| 50 | SPEC §8 steps saved at once, not in Undo; Off keeps state | Implemented | turns.js:30-31; options.js:118-134 |
| 51 | SPEC §9 mana mode: six cells, edit kind `mana` | Implemented | modes.js:253-257; edits.js:115 |
| 52 | SPEC §9 auto-empty: default on, shown conditions, hold back restores | Implemented | mana.js:15-16 |
| 53 | SPEC §10.1 field validation | Implemented | save.js:138-144, 231-260 |
| 54 | SPEC §10.2 what a new game resets and keeps | Implemented | actions/board.js:84-113 |
| 55 | SPEC §10.3 Android back order | Implemented | app.js:65-74 |
| 56 | SPEC §10.4 undo summary: handoffs inside the causing edit | Implemented | edits.js:78-79, 94-106 |
| 57 | SPEC §13 switches, icons, crown and castle cells, seven cells four to a row | Implemented | |
| 58 | SPEC §13 commander damage transfer (CR 726.3, 727.3) | Implemented | edits.js:92-99 |
| 59 | SPEC §13 leaving the game: every path (life, mode edit, Track switch) | Implemented | actions/board.js:18-30; edits.js:78 |
| 60 | SPEC §13 "Pass it on" conditions; doesn't dim | Implemented | rules.js; badges.js:158-166 |
| 61 | SPEC §13 turn reminders: when they fire, 3s, announced | **Partial** | Findings B2 and B3 |
| 62 | SPEC §13 monarch and initiative validation | Implemented | Run with 4, -1 and '1' |
| 63 | SETTINGS §1–2 one dialog, ids kept, sections and title icons | Implemented | index.html:89-306 |
| 64 | SETTINGS §3 / §7 two columns from 620px wide; section placement | Implemented | layout/settings.js:44-60 |
| 65 | SETTINGS §3 header, safe-area padding, scrolling, opens at the top | Implemented | styles.css:1667-1703 |
| 66 | SETTINGS §3 every target at least 44px | Implemented | Checked at 568 × 320, 320 × 568 and 952 × 427 |
| 67 | SETTINGS §4 open, Done, Start new game, ✕ drops a pending change, New game | Implemented | sheets/settings.js:145-219 |
| 68 | SETTINGS §4 pending line (aria-live); board actions start the pending game first | Implemented | sheets/settings.js:189-197 |
| 69 | SETTINGS §4 instant settings; Turns Off → on waits for close | Implemented | options.js; mode.js:36 |
| 70 | SETTINGS §4 / §7 slider rules and keys, ARIA range 1–999 | Implemented | sheets/settings.js:61-79; slider.js |
| 71 | SETTINGS §4 flip and its label; reset on open | Implemented | sheets/settings.js:149, 175-182 |
| 72 | SETTINGS §4 About inline; scroll cue on the body | Implemented | layout/settings.js:63 |
| 73 | SETTINGS §5 accessibility (labelledby, h3, switches, names, focus ring) | Implemented | index.html:176-177, 285; styles.css:178 |
| 74 | SETTINGS §7 compact switches stack in narrow cards | Stronger than spec | Container queries plus a JS clip check (layout/settings.js:19) |
| 75 | SETTINGS §8 when the Reminders rows show; placement | Implemented | options.js:151-160 |
| 76 | SETTINGS §9 default per platform; a pick is saved and wins | Implemented | platform.js:14; options.js:105-114 |
| 77 | SETTINGS §9 fallbacks (no blur, reduced transparency, more contrast); reduced motion | Implemented | styles.css:345-351, 1984-1987; LifePodApp.swift |
| 78 | AGENTS offline: no `INTERNET` permission, nothing loads from a URL | Implemented | AndroidManifest.xml; grep of web/ |
| 79 | AGENTS CSP is `default-src 'none'`, nothing inline | **Partial** | Finding B6 |
| 80 | AGENTS floor: iOS 18, minSdk 30, `MIN_WEBVIEW_MAJOR` 129 matches browserslist | Implemented | MainActivity.kt; package.json |
| 81 | AGENTS "old saves must keep loading", never reset the game | **Partial** | Finding B4 |
| 82 | AGENTS 44px targets at every size | Implemented | Settings and mode cells checked |
| 83 | AGENTS MIME tables match; `..` and hidden files 404 | Implemented | MainActivity.kt; LifePodApp.swift (read, not run) |
| 84 | README far row: "with a dot in that opponent's colour" | **Contradicted** (the README is wrong) | Finding S2 |
| 85 | README: "If nobody went first, every tile has a turn chip" | **Partial** (the README is loose) | Finding S5 |
| 86 | README mana strip fallback order | Implemented | Matches fit.js better than SPEC §9 does (S4) |

## Findings, ranked by impact

### Behaviour bugs

**B1. A digit-count change doesn't refit the badge rows, so far rows can cover the totals.** *Medium.*

- **Spec:** SPEC §3.1 says layout runs again on "any total whose digit count changes". §3.2 says `fitBadgeRows()` runs "after every badge change and every layout change" and "two lines never cover the total". SETTINGS §10 says a row grows no taller than fits between its edge and the total.
- **Code:** `changeLife` (`web/js/actions/board.js:42-57`) calls `renderScore` (`web/js/render/tile.js:113-123`). That calls `syncBoardDigits()` (`web/js/layout/board.js:206-209`), which only sets `--board-digits`. `renderBadges` runs only when out status changes (`actions/board.js:48`). The tile's size doesn't change, so the ResizeObserver doesn't fire. `measureBadgeRoom()` (`fit.js:76`) and the drop levels keep the values from the old total size.
- **Evidence:** Re-run independently with Chromium, Roboto, 6 players at 568 × 320, Badge size Larger, scores [100, 99 × 5].
  - One − tap on P1 brings every total back from 40.4px to 60.5px.
  - `--far-room` stays at 18.2px and the far rows stay at 17.5px.
  - P2's and P4's far chips overlap their totals.
  - A window resize refits them to 12.9px, with no overlap.
  - At 640 × 360 and on the target, the room goes stale without overlapping.
- **Fix:** When `syncBoardDigits` changes the value, call `measureBoard()` (or `fitBadgeRows()`). Add an autodrop or badge-size test that crosses 99 ↔ 100.

**B2. The first player's initiative reminder is lost if "Who goes first?" is closed during the "Goes first" pause.** *Low.*

- **Spec:** SPEC §13 says "Initiative: venture into Undercity" shows when the holder's turn starts, including by "Who goes first?".
- **Code:** `chooseFirst` (`web/js/actions/mode.js:42-61`) sets `turn.active`, then calls `turnStarted()` only from the 700ms timer (`firstBeat`, data.js:141). `setBoardMode` clears that same timer (`mode.js:96`). So ✕ (`app.js:55`), Escape (`app.js:76`) or Android back (`app.js:71`) during the pause starts the turn without the reminder.
- **Evidence:** In the run, the reminder showed when the pause was left alone and didn't show after Escape. The lead reviewer confirmed the code path.
- **Fix:** Call `turnStarted()` when the mode leaves `'first'` with the pick made, or don't clear the timer in that case.

**B3. The initiative reminder fires before any turn has started.** *Low.*

- **Spec:** SPEC §13 says the reminder shows when the holder's turn starts, "or when they take the initiative mid-turn".
- **Code:** The save button (`web/app.js:47-53`) calls `remind(taker, 'initiative')` for anyone who took the initiative in the mode. `remind` (`web/js/actions/reminders.js:23-31`) checks only `game.turns === 'turns'`, not `game.turn.active !== null`.
- **Evidence:** In Turn by turn with nobody's turn started, giving the initiative in counters mode and saving shows the reminder (run). The same applies to a handoff through `handOnLeavers` (`actions/board.js:28`), though `leavingTransfers` already requires an active turn.
- **Fix:** Have the save path check that a turn has started, or treat this as intended and change the spec's wording.

**B4. `loadGame` resets the whole game on a few bad fields, and accepts a starting life above 999.** *Low.*

- **Spec:** AGENTS.md says loadGame "validates every field ... falls back to a default when a field is missing or wrong ... Never make an old save throw or reset the game". SETTINGS §4 limits starting life to 1–999.
- **Code:** `web/js/logic/save.js:231-233` returns `defaults`, which also resets settings, colours and identities, when any of these hold:
  - `scores` isn't an array of 2–6 safe integers;
  - `startingLife` is missing, not a safe integer, or below 1.
  
  It has no upper bound, so a saved `startingLife` of 1e6 loads. The life slider then clamps it to 999 on the first key press (`sheets/settings.js:72`).
- **Impact:** No released build wrote such saves. Seven- and eight-player saves existed only between 3c5ad52 and 0d2e45a, both before v0.1.0-alpha.1. So this is hardening, not a live regression.
- **Fix:** Bound `startingLife` at `maxStartingLife`. Consider keeping the settings fields when only the scores are invalid.

**B5. Skipping "Who goes first?" after Turns goes Off → on keeps the old round.** *Low.*

- **Spec:** SPEC §8 says skipping "leaves no first player: no flag, round 1".
- **Code:** In Rounds, `stepTurn` raises the round even with no first player (`web/js/actions/turns.js:39-40`). Off → on keeps `turn` (`options.js:118-134`), so a skip reopens at that round. After a new game, skip is round 1, as specified.
- **Fix:** Either reset the round on a skip with no first player, or reword §8: "Off keeps the state" makes the current behaviour defensible.

**B6. The CSP allows `file:` sources.** *Low (hardening).*

- **Spec:** AGENTS.md describes the CSP as `default-src 'none'`, with scripts as files.
- **Code:** `web/index.html:8` adds `file:` to `script-src`, `style-src`, `font-src` and `img-src`. Both apps serve the page from a real origin (`https://appassets.androidplatform.net/`, `lifepod://app/`), and browsers don't run the module scripts from `file://`, so the allowance is dead.
- **Fix:** Drop `file:`, or document why it stays.

### Stale or wrong spec text

**S1. SPEC §3.1 numbers that no longer hold.**

- "On phones, three digits still fit at full size, so nothing changes" (SPEC.md:176) is false with 6 players. A 100 shrinks every total from 68.4 to 51.6px at 640 × 360, and from 60.5 to 40.4px at 568 × 320. The code follows the formula on SPEC.md:162; the sentence is wrong. Only the target, 952 × 427, keeps 81.13px.
- "`layoutBoard()` measures every `.player-face`" (SPEC.md:156): the measuring is in `measureBoard()` (`layout/board.js:44`). It measures inside the pill clearances, not the raw face.
- The units table gives 213 for ui at 640 × 360 with 6 players; the measured value is 212.

**S2. README.md:48 says a commander damage chip has "a dot in that opponent's colour".** There is no dot. The chip is a small piece of the attacker's tile: their panel and rim, with the number in their seat colour (`styles.css:1208`; `badges.js:190`).

**S3. SPEC §1, §3.2, §6 and §7: details superseded by later decisions but not marked.**

- §1 (SPEC.md:50): cells "press with 26% seat". SETTINGS §7 changed this to the 10% state layer (`styles.css:1095`). The 26% mix survives only on the turn, strip, pass and reminder chips and on "Me first".
- §3.2 thresholds table (SPEC.md:252): "Mana strip: one line, otherwise wraps to two". The 22 Nov §9 placement has a shrink level with an 11px floor, wrapping and folding (`fit.js:27`). The `data-drop` token list (SPEC.md:219) also lacks `strip-wrap`.
- §6 (SPEC.md:332): "Three per row". §13 has seven cells four to a row.
- §7 (SPEC.md:352, 358): "on one line at full size on the target" and "at 26px (2f28705)". The worst case drops names on the target, and the far row is 1.7em of the badge size (27.2px with 4 players, 21.25px with 6).
- §2.2 (SPEC.md:75) and §7: "the chip leads the near badge row". The §8 turn chips lead it (`badges.js:214-216`).

**S4. SPEC §9 doesn't list the strip's shrink and wrap levels.** SPEC.md:406 lists four places (own line, inline, fold, fold-inline) and no shrinking. The code tries those four places at full type, then at a type shrunk to 11px, then wrapped (`fit.js:27, 273-305`). README.md:56 ("moves to the end of the commander damage row, then its type shrinks, … folds") is closer to the build than the spec is.

**S5. README.md:50 says "If nobody went first, every tile has a turn chip until someone starts theirs".** Players who are out get no Start chip (`badges.js:76`). Start chips also show when someone went first but no turn is active, after Rounds → Turn by turn (`options.js:126`).

**S6. SPEC §13 line 558: "(the row and any mana strip step aside)".** The strip has been at the far edge since 22 Nov, so only the near row steps aside (`styles.css:1283`). The same wording is in the `fit.js:330` and `styles.css:1250-1251` comments.

**S7. SETTINGS §10 points at the wrong module and has one wrong measurement.**

- `measureBadgeRoom()` is in `layout/fit.js:76`, not app.js.
- `data-badge-size` is set in `render/appearance.js:13-15`.
- The `styles.css` comments near lines 677, 687 and 882 still say app.js.
- "At 568 × 320 with 6 players the far row has no room to grow" is slightly off: it grows from 12.5 to 12.9px.

**S8. SPEC §2.1, §4 and §6 still describe sheets.** §4 carries its superseded banner (SPEC.md:258-262). But §2.1 still says "Setup → Identity ›" and "the Identity sheet" (SPEC.md:62), and §6 and §9 say "the Track sheet" and "Track → …" (SPEC.md:327, 364, 397). §10.3 says there are no sub-sheets any more. The §11 build plan (SPEC.md:467-491) is historical.

**S9. The SPEC header and contents.** The status line (SPEC.md:3) still says "ready to build". The contents list calls §12 "Open questions", while the heading is "Questions resolved".

**S10. Neither SPEC §10.1 nor the SETTINGS-SPEC §2 table lists the later settings.**

- SETTINGS §1 says every setting and its default are in SPEC §10. §10.1 lacks `tileColours`, `badgeSize` and `style`, and doesn't mention the 999 round cap (`save.js:142`; `turns.js:40, 49`).
- The SETTINGS §2 table lists only Colours and Rotate seats for Table, though Table also holds Style, Tile colours and Badge size (§7, §9, §10).

**S11. SETTINGS §3 and §5 rules that §7 overrode, still unmarked.** These are the landscape-only two-column rule, the 480px rule for labels beside controls, and `scroll-padding-top` equal to the header's height. §7 records each change, but the §3 and §5 text still reads as current. The `index.html:84-88` comment omits Reminders and About, and the `data.js:144` comment still mentions the stepper.

**S12. AGENTS.md's CSP description omits the `file:` sources** (B6). The browserslist entry "Android >= 11" resolves only to the current Android browser, not WebView 129. The binding floor comes from the Chrome entry, so the result is right, but the line misleads.

### Undocumented behaviour (code does it, no document says so)

These all work. They're listed so the next change knows something depends on them.

| # | Behaviour | Where |
|---|---|---|
| U1 | The starting-life slider snaps to fives (keys step by 1, Page Up and Page Down by 5) | sheets/settings.js:72 |
| U2 | Rounds ↔ Turn by turn clears `turn.active` and the hold-back steps, and keeps a pending "Who goes first?" | sheets/options.js:124-129 |
| U3 | A pill tap in Turn by turn with no active player opens "Who goes first?" | actions/turns.js:42-46 |
| U4 | The shuffle picks only players who are still in, but "Me first" still shows on out tiles | actions/mode.js:66-68; render/modes.js:258 |
| U5 | Hold-back history is capped at 200 steps, and the round at 999 | actions/turns.js:31, 40, 49; logic/save.js:142 |
| U6 | "Undo clear" ends early on a turn pass, on opening mana mode and on switching Mana pool off | actions/mana.js:72; actions/mode.js:100; sheets/options.js:138 |
| U7 | "Undo clear" and a step back add amounts back, capped at 99, rather than restoring the pool exactly | actions/mana.js:49-60 |
| U8 | Mode edits are saved as they happen, so after a relaunch mid-mode there is no ✕ for them | actions/edits.js:66 |
| U9 | Commander damage from an out attacker still moves the monarch or initiative to them, who then get "Pass it on" | actions/edits.js:94-99 |
| U10 | With everyone else out, a pass keeps the turn with the active player and can still raise the round | logic/rules.js:140-155 |
| U11 | The mana strip has its own 11px floor, wrap level, board-wide level and 15% hysteresis, with cost-weighted folding | layout/fit.js:27, 271-305 |
| U12 | Font `loadingdone` resets the drop levels; `fonts.ready` refits keeping them | app.js:93-104 |
| U13 | Extra swatch grids (3 × 4, 6 × 2, 2 × 6) on tight boards, and a 2-column identity toggle fallback | layout/board.js:158-179 |
| U14 | `data-wide` is set on `#board` but no CSS reads it | layout/board.js:69 |
| U15 | Commander damage ties are ordered by seat; the folded strip chip reads "Undo" during "Undo clear" | render/badges.js:107, 184 |
| U16 | Pinch zoom is disabled | index.html:6 |
| U17 | Native: backslash path segments refused on both platforms, a symlink check on iOS, main-frame-only navigation, an unknown WebView version treated as current | MainActivity.kt; LifePodApp.swift |

**D6 (for matrix row 38).** SPEC §5 asks for a 4 × 3 swatch grid sized by `clamp(44px, min((100% − 24px)/4, (100% − 40px)/3), 60 × grow)`. The build uses 4 × 3 where it fits. On tight boards it switches grids (`layout/board.js:158-160`), and its height term differs from the spec's (`styles.css:916`). Every swatch stays at least 44px, so this is a documentation gap rather than a defect.
