# Final pre-release review: v0.1.0-alpha.15..main (for alpha.16)

**Reviewed:** main at f6680fe, 23 November 2026, against v0.1.0-alpha.15: eight merged batches, 51 commits.

**How:**

- The review was read-only on app code.
- Suspected bugs were reproduced in Playwright through `tests/helpers.mjs` (`openPage`, `seedGame`, `saved`, the fake clock), in Chromium and WebKit.
- The probes ran in a clean `git archive` of main with `npm ci`, and in a `git archive` of v0.1.0-alpha.15 to tell regressions from older bugs.
- The probe scripts were throwaway and aren't in the repo. The UI sweep also ran in the clean copy.

## Verdict

- **Nothing blocks alpha.16.**
- No regression reproduced at any of the batch seams listed in §1.2.
- The two verified bugs below were already in alpha.15. They behave the same there.
- The docs have drifted in several places (§2).
- One small visual regression came with the New game move: the Keep awake row is still capped (§3, U2).

## Must fix before alpha.16 vs can wait

**Must fix:** none.

**Worth doing before the tag if it's cheap (about 10 minutes each):**

- **U2, the Keep awake row's width cap:** drop the `max-width` at `web/css/settings.css:339`. The New game move made it stale, so this is the only visual regression found this cycle.
- **README.md, two lines players and contributors see:**
  - Glass doesn't have "frosted" centre controls (README.md:60).
  - `npm run check` runs the type check too (README.md:93).

**Can wait:**

- B1, the double tap on Settings that changes a setting (from before alpha.15).
- B2, board announcements made while settings is open (from before alpha.15).
- The rest of the doc drift in §2.
- U1 and U3–U7 in §3.
- The APK growth in §4.

## 1. Correctness

### 1.1 Verified bugs, ranked

#### B1. A double tap on the pill's Settings button changes a setting. Medium; from before alpha.15

**What happens:** the setup button opens settings on `click`, so the second tap of a double tap, or a repeated tap on a slow phone, lands on whatever control sits under the pill in the open settings page. That control then changes, and Track switches and Style save at once.

**Repro** (fresh 4-player game, Turns Rounds, Material): tap the Settings button's centre twice, 180ms apart. Read the saved game.

| Engine, size | What the second tap changed |
|---|---|
| Chromium 952 × 427 | Rad switched on |
| Chromium 841 × 701 | Turns set to Off, which clears the turn |
| Chromium 1366 × 1024 | Identity's colour disc switched off |
| WebKit 952 × 427 and 841 × 701 | The player count, now a pending new game ("Start new game") |
| WebKit 1366 × 1024 | Style switched to Glass |

- alpha.15 gives the same results with the same probe.
- The dice button has the same hazard, but there the second tap only rolls the die.

**Where:** `web/js/sheets/settings.js:188`, where `setupButton`'s `click` opens settings, and `web/js/actions/dialog.js:10`, `showDialog`.

**Suggested fix:** in `showDialog`, ignore pointer input inside the dialog for about 350ms after `showModal()`. For example, set a `data-opening` attribute that CSS maps to `pointer-events: none` and remove it on a timer. Only pointer input should be blocked: keyboard focus and clicks with no detail must still work, so `inert` isn't the right tool. A test would tap twice and assert that `saved(page)` hasn't changed.

#### B2. Board announcements made while settings is open are never heard. Low; from before alpha.15

**What happens:** a Track switch can put a holder out of the game. For example, Poison on with a player at 10 poison passes the monarch on through `handOnLeavers` (`web/js/sheets/options.js:240`). The monarch moves to the right player, but:

- `announceDesignation` writes "Player 1 is the monarch" into `#announcer` (`web/js/render/announce.js:58`).
- `#announcer` (`web/index.html:48`) sits outside the modal settings dialog, so it is out of the accessibility tree while settings is open.
- Nothing repeats the announcement once settings closes.

**Repro:**

1. Seed a 4-player game with Turns Turn by turn, player 1 active, the Monarch on and held by player 2, Poison off, and poison `[0, 10, 0, 0]`.
2. Open Settings and switch Poison on.
3. Run the clock 1s.
4. The announcer's text is set, but CDP `Accessibility.getFullAXTree` has no node for `#announcer`. Settings' own live region says nothing.

**Suggested fix:** while a dialog is open, have `announce` write to that dialog's own live region instead (`#settings-status` for settings). Or hold the pending text and flush it on the dialog's `close` event.

**Also:** `announceDesignation` and `announcePool` say "Player N" without the seat's colour, while the life and turn announcements use `seatName` ("Player 3, Sky"). That's a consistency nit.

### 1.2 Seams probed and found correct

Each of these was driven in the real UI and checked against the saved game and the DOM:

- **`commit()` vs `sheets/options.js`:** options.js still saves and redraws by hand. Each handler draws what `commit()` would:
  - Track: scores, badges, pill, measure.
  - Turns and Mana: scores, badges and the pill, which re-measures when its shape changes.
  - Identity: badges.
  - Tile colours: `paintColours`, which renames each tile's region.
  - Badge size: `resetDrops` and `requestFit`.

  A Style switch fits the board exactly as a reload in that style does: same drop tokens, same per-tile styles, same strips (5 players, everything on, 568 × 320).
- **`showDialog` vs act-on-release:**
  - `cancelPresses` doesn't track `bindRelease` presses. A release over an open modal still does nothing, because `elementFromPoint` returns the dialog.
  - Escape on the New game confirm returns to settings with `returnValue` `cancel`.
  - Android back closes the topmost dialog first: `#restart` comes after `#settings` in the DOM.
- **In-place badges vs a11y names and groups:**
  - Every keyed chip that changes has an `update` that refreshes its `aria-label` or hidden text: round, turn, strip spend, strip chip, counters and damage.
  - With 6 players at 568, 952 and 1366, each tile exposes exactly one strip form to the accessibility tree: "Open mana" when folded, or the spends and Clear when below. The visible forms match the role queries in both engines.
- **Round 999:**
  - In Rounds, the flag holds at 999 and saves 999.
  - In Turn by turn, play moves within round 999 (seat 3 → 2) and then holds on the seat before the first player's. Six taps leave `{ first: 0, active: 2, round: 999 }`. There is no "can't go further" announcement, which the spec doesn't ask for.
- **New game:**
  - It clears everything in progress: a showing turn reminder, an "Undo clear", a strip hold, turn steps, pools, the turn, and the monarch and the initiative. Nothing comes back after 10s of timers.
  - Shuffle deals new colours, and the tiles' region names follow.
  - The announcement reads "New game, 4 players at 40 life", followed by "Who goes first?" when Turns is on, in both engines.
  - After the confirm, focus goes to Settings in Chromium.
- **Text scale vs fitting:**
  - `setTextScale` only scales settings and the dialogs. Its `resetDrops()` with no `requestFit()` leaves the board as fitted until the next change, which then fits from full size, with no visible effect.
  - At scale 2 neither settings nor the header scrolls sideways (568 × 320 and 952 × 427, both styles, both engines). The header's title truncates at 568 × 320 (U7).

**Not bugs:**

- WebKit's `style-src-elem` CSP violation during `page.screenshot()` comes from Playwright injecting its own style. It doesn't happen without the screenshot.
- Swatch ids such as `data-colour="olive"` differ from a set's display names such as "Lime" by design: each set names its own colours.

## 2. Docs that disagree with the code

In every case the doc is stale, not the code. Each line gives the doc's location, what it says, and what the code does.

### design/polish/SPEC.md

- **SPEC.md:252 and :412:** the strip tries "four places", then shrinks its type to an 11px floor, then wraps. fit.js:23-29 and :335-410 have three places (below, folded, near) and one `strip-wrap` step, and the strip's type never shrinks. The doc also contradicts its own :409.
- **SPEC.md:219:** the `data-drop` tokens live on `#board`, and CSS hides from there. fit.js:144-165 writes the tokens and sizes on `.near-edge` and `.far-edge`, and badges.css:96 and :191 read them there. `#board`'s copy is only for the tests (fit.js:158).
- **SPEC.md:161:** badges are `clamp(.78rem, 3.6u, …)`. tile.css:151 now has `max(3.6u, min(5u, 4.4·ub/100))`, the tablet sizing.
- **SPEC.md:182:** 952 × 427 with 2 players gives 15.4px badges. The new formula gives 16px; this needs a measurement to confirm.
- **SPEC.md:11:** cites `tests/sizes.test.mjs`. That file was split into `tests/sizes-*.test.mjs` (see `tests/sizes-checks.mjs:14`).
- **SPEC.md:318:** Colours is always a 4 × 3 grid. On narrow or short boards it takes the first of 4 × 3, 3 × 4, 6 × 2 and 2 × 6 that fits (layout/board.js:12 and :208, modes.css:42).
- **SPEC.md:138, :251 and :332:** toggles go 3 + 2, and cells three to a row. Both fall back to two to a row (layout/board.js:225 and :234).
- **SPEC.md:336 (nit):** names `.ms-commander`. No such class exists; the glyph is `data-glyph="commander"`.

### design/polish/SETTINGS-SPEC.md

- **:206 and :237:** toggles have an accent ring and an accent check. In both styles they have a light ring and a check in the seat's colour (modes.css:118-131, tokens.css:181 and :323).
- **:263:** "styles.css sets --badge-scale". tile.css:156-161 sets it; styles.css no longer exists.
- **:259, and README.md:58:** Default badge size is the size from before the setting. The system text size now raises Default and Large up to ×1.4 (tile.css:156 and :160). No doc covers the text scale (platform.js:98-105, `window.setTextScale`) or zoom outside the board (index.html:6-7).
- **:46 and :257, the Table order:** the doc has the actions first, then Style, Tile colours and Badge size. index.html:156-197 has Style, Tile colours, Shuffle and Badge size, with the actions last.
- **:43 and :91:** New game is in the Game section's footer. It's in the header (index.html:106). §11 records the move, but §2 and §4 aren't marked.
- **:101:** the pending line says "when you leave settings". It says "when you press Start new game" (settings.js:209).
- **:149:** the pending line is the live region. The live region is the hidden `#settings-status`, 700ms after the last change (index.html:142 and :145, settings.js:217-233).
- **:126 (minor):** the slider announces "Starting life 40". It announces "40 life" (settings.js:195).
- **:231:** the pill is blurred glass. It has no blur, just a 90% tint (tokens.css:279-284). §11 notes this, but the §9 row isn't marked.
- **:183, :223 and :253:** cite `tests/sizes.test.mjs` and `tests/sizes-glass.test.mjs`. Both were split.
- **:247 and :250 (nit):** app.js sets `data-reduce-transparency` and `data-style`. platform.js:89-91 and appearance.js:20-22 set them.

### AGENTS.md

- **:28:** the press.js binder list leaves out `bindRelease` (press.js:134).
- **:36:** the list of `window` globals leaves out `setTextScale` (app.js:97).
- The rest matches the code, including the module map, the seven stylesheets, the CSP and the iOS detection.

### README.md

- **:93:** the list of what `npm run check` runs leaves out the type check (package.json:13).
- **:60:** Glass has "frosted" centre controls. The pill has no blur (tokens.css:279-284, board.css:85).

### design/polish/STYLE.md

- **:362:** the accent check is kept. The check is in the seat's colour (modes.css:121-131).
- **:354-355:** the pill uses the blur recipe. It has no blur.
- **:368:** cites `tests/sizes*.test.mjs`, which were split.
- **:212-213:** an invalid starting life reverts, and closing settings commits it. An invalid Enter or ✓ keeps the field open with an error, and ✕ or Escape doesn't commit (settings.js:129-150 and :203-208).

### design/polish/TILES.md

- **:3:** "Nothing in web/ has changed". Four sets shipped, with Clear the default (data.js:46-66).
- **:102-107 (historical):** the `tileScheme` proposal shipped as `tileColours`, with `data-tiles` on `<html>`.

### Stale code comments

- **index.html:93-97:** leaves out Reminders, and says app.js moves the sections.
- The header comments of tile.css:3 and badges.css:8 are also stale.

The L3 tint contrast figures in SETTINGS-SPEC §11 check out: 8.47, 7.46, 4.42 and 4.69.

## 3. UI sweep

### The sweep

`node design/polish/final-review.mjs --sweep`, then `--shots`, run in the clean copy:

- **States:** 7,232, in both styles, at all 8 sizes and all three Badge sizes. 0 problems, 0 page errors.
- **Shots:** 123, with 0 audit problems in `shots.json`. The lowest contrast is about 4.8:1, an out player's red total.
- **Extra shots:** the shot set had no Glass at the foldable or the tablet, and no settings scrolled to Table. 78 extra shots fill that in, in `/private/tmp/claude-501/-Users-adrianmaceiras-code/b7451517-c6e8-4805-9bed-cc6e63f905e4/scratchpad/final/ui/shots/`.
- **The script itself:** `--shots` overwrites `renders/final/findings.json` with `runs: 0`. Run `--sweep` last, or have `--shots` leave that file alone.

### Issues

The screenshots are in the scratchpad, which a reboot clears. Re-run the scripts to regenerate them.

- **U1. At Badge size Larger, a busy near row comes out smaller than at Large, and sometimes smaller than at Default.** Material, 952 × 427. The numbers are measured; whether it's intended is a design question.
  - Near-row type at Default / Large / Larger:
    - everything on, 5–6 players: 12.5 / 15 / 12.25px;
    - mana floating, 5–6 players: 12.5 / 15 / 13.85px;
    - everything on, 4 players: 16 / 19.2 / 19.1px.
  - Large wraps the row onto two lines, while Larger keeps one line by shrinking the type.
  - At 568 × 320 neither Large nor Larger grows the near row.
  - Evidence: `/private/tmp/claude-501/-Users-adrianmaceiras-code/b7451517-c6e8-4805-9bed-cc6e63f905e4/scratchpad/final/ui/crop-5p-nearrow-default-large-larger.png` and `/private/tmp/claude-501/-Users-adrianmaceiras-code/b7451517-c6e8-4805-9bed-cc6e63f905e4/scratchpad/final/repo/design/polish/renders/final/target-5p-floating-rest-badge-larger.png`.
  - Can wait. One option is to prefer wrapping over shrinking at Larger, or to floor Larger's type at Large's.
- **U2. The Keep awake row is still capped at 18rem** (`web/css/settings.css:339`, `.fs-gamefoot > .fs-awake`). The cap dates from when the row shared the footer with New game.
  - In Glass its switch sits mid-card, while every other switch is on the card's right edge. In Material its tile stops about two thirds of the way across.
  - This is in both styles at every size, and it's a regression from the New game move.
  - Evidence: `/private/tmp/claude-501/-Users-adrianmaceiras-code/b7451517-c6e8-4805-9bed-cc6e63f905e4/scratchpad/final/ui/shots/glass-target-4p-everything-settings.png` and `/private/tmp/claude-501/-Users-adrianmaceiras-code/b7451517-c6e8-4805-9bed-cc6e63f905e4/scratchpad/final/ui/shots/glass-tablet-6p-everything-settings.png`.
- **U3. The Glass settings header shows no blur in Chromium at DPR 3 or in Playwright's WebKit.** Chromium at DPR 1 blurs fine, and the computed `backdrop-filter` is right in both. This is probably a limit of the test renderers, but Glass is the iOS default, so check it on an iPhone before the tag.
  - Evidence: `/private/tmp/claude-501/-Users-adrianmaceiras-code/b7451517-c6e8-4805-9bed-cc6e63f905e4/scratchpad/final/ui/webkit-glass-settings-header-dpr2.png`.
- **U4 (nit). The Glass pill still shows the seams and the active tile's ring faintly**, rgb(49, 44, 46) over rgb(34, 30, 31). tokens.css says the 90% tint prevents this.
  - Evidence: `/private/tmp/claude-501/-Users-adrianmaceiras-code/b7451517-c6e8-4805-9bed-cc6e63f905e4/scratchpad/final/ui/glass-target-pill-crop.png`.
- **U5 (nit). In Material, the slider's track shows past the thumb at its minimum and maximum.**
  - Evidence: `/private/tmp/claude-501/-Users-adrianmaceiras-code/b7451517-c6e8-4805-9bed-cc6e63f905e4/scratchpad/final/ui/crop-badge-slider.png`.
- **U6 (cosmetic). On the 1366 × 1024 tablet, the settings header spans the full width while the content is centred and narrower.** Done sits about 55px past the content's edge, in both styles.
  - Evidence: `/private/tmp/claude-501/-Users-adrianmaceiras-code/b7451517-c6e8-4805-9bed-cc6e63f905e4/scratchpad/final/ui/shots/material-tablet-6p-everything-settings.png`.
- **U7 (minor). At system text scale 2 and 568 × 320, the settings title truncates to "Setti…"** beside Turn, New game and Done. With a pending new game, the title fits because New game hides.
  - Evidence: `/private/tmp/claude-501/-Users-adrianmaceiras-code/b7451517-c6e8-4805-9bed-cc6e63f905e4/scratchpad/final/shots/textscale2-chromium-material-568.png`.

### Checked and clean

- **The lime accent:** solid lime appears only on commit actions:
  - Done, Start new game and Roll;
  - the ✓ discs and the switches that are on;
  - Cancel in the New game dialog, as SETTINGS-SPEC §9 says.

  Chosen segments, the chosen die and the slider fills are tints, and New game in the header is neutral.
- **The Tile colours bands:** legible, with the ring on the chosen set and no clipping at the four sizes in either style.
- **The mana strip against commander damage on the far row:** no overlap at 952 × 427 (3, 5 and 6 players floating, every Badge size), 568 × 320, 841 × 701 or 1366 × 1024, including the sideways fifth seat.
- **Glass on the board:** board shots differ from Material by under 500 pixels, all in the pill, so tile text reads the same.
- **Tablet badges:** they now scale, to 24.5px at Default for 3–4 players and 20–22.5px for 5–6. FINAL-REVIEW nice-to-have 15 had them at 16px.

## 4. Release readiness

- **Version numbers: nothing to bump** (RELEASING.md, `.github/workflows/ci.yml:134-135` and `:332-333`).
  - Android: the tag sets `versionName` (`0.1.0-alpha.16`), and `GITHUB_RUN_NUMBER` sets `versionCode`.
  - iOS: the version is `0.1.0`, and its build number is the run number.
  - Run numbers so far: alpha.15's tag was run 98, and main's latest is run 112, so the tag run will be higher than both, as Play and App Store Connect require.
- **TODO, FIXME, XXX and HACK:** none added since alpha.15, and none in web/, android/, ios/, tests/ or scripts/.
- **`npm run check`:**
  - ESLint, the compatibility lint, the type check, ktlint and swift-format pass.
  - 313 of 314 tests pass locally. The one failure is `tests/logic.test.mjs`, which can't import `fast-check`: this checkout's `node_modules` was installed before fast-check was added. It passes, 19/19, in a clean `npm ci` copy, so run `npm ci` here.
  - CI is green on f6680fe (run 112) and on every merge since alpha.15.
- **APK size:**
  - alpha.15's signed `lifepod.apk` is 170,975 bytes.
  - No release APK of main was built: `./android/build.sh` needs `KOTLIN_HOME` here, and CI's main artifact is the debug APK, 196,101 bytes.
  - From the compressed asset sizes, main's release APK should be about **195 KB, about 24 KB (14%) more**:
    - The CSS grew from 28.8 to 37.2 KB compressed. Most of that is the split into seven files, each now compressed without the others' shared text; the CSS's own source grew 111 → 124 KB.
    - The JS grew from 68.9 to 83.4 KB compressed (206 → 249 KB of source).
    - index.html grew by 0.7 KB, and the dex by about 0.6 KB.
  - That's acceptable for an alpha. If size matters, the CSS split is the cheap part to win back.
- **Repo size (not the APK):** `design/polish/renders/mana-placement.png` (1.4 MB) was committed in a17df20.
