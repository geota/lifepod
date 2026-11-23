# LifePod accessibility review

Reviewed on 2026-11-22 against `main` at `39e5b9c` (v0.1.0-alpha.15 plus two commits that only touch docs and `.gitignore`). Nothing in `web/`, `tests/`, `android/` or `ios/` was changed. The audit scripts ran from a scratch folder outside the repo, against `npm run preview` on port 8080.

## Summary

LifePod is in good shape for an alpha. Every control has a name, every icon is hidden from assistive technology, the dialogs are native modals, and the announcer turns a burst of presses into one message in seat order. Every hold has a keyboard alternative, the focus ring is a 2px accent outline at 7.45:1 or better wherever it was measured, and no touch target came in under 44px. No text contrast failure was found in 1,625 text runs. Reduced motion and reduced transparency are both honoured.

What's left is mostly about how things behave, not how they look:

1. **High.** Text can't be enlarged: pinch zoom is turned off in the page and in the Android WebView, and nothing responds to Dynamic Type (1.4.4).
2. **Medium.** Pressing Escape in an editing mode with unsaved changes does nothing. The Discard dialog opens and the same key press cancels it, in Chromium and in WebKit.
3. **Medium.** Seven controls fail Label in Name (2.5.3), including the turn chip ("Turn 2"), "Me first" and "Pass it on". Voice Control users can't say what they see.
4. **Medium.** One-press buttons act on `pointerdown` (2.5.2). For the life buttons that's defensible, but not for "Me first", "Pick at random" or "Pass it on".
5. **Medium.** Focus is lost or jumps to Settings when something it was on disappears: a reminder chip timing out, the undo-clear window closing, or the last mana being spent.
6. **Medium.** In Rotate seats, the badge-row and mana-strip buttons are still focusable and still work under the rotate overlay.
7. **Medium.** The hidden "Remove one" buttons in the board modes show exactly the same focus ring as "Add one", so a sighted keyboard user can't tell which one Enter will do.
8. **Medium.** Board modes, a new game and "Who goes first?" start silently. The on-screen instructions are `aria-hidden`.
9. **Medium.** Players are announced as "Player 3", but no number is shown on screen and the tile colour isn't exposed, so a screen reader user can't match a voice to a seat.
10. **Medium.** The badge rows use `role="list"` with buttons as direct children, and the folded mana chip sits inside the list labelled "Commander damage".

Nothing has been tested with a real screen reader. VoiceOver and TalkBack scripts are at the end.

## How this was checked

The chrome-devtools-mcp skill's browser was already in use by another session, and axe-core and Lighthouse aren't installed (no network installs), so the same checks were scripted with playwright-core 1.65:

- **Coverage.** Two styles (Material and Glass, seeded through the saved game's `style`) × two sizes (952 × 427 and 568 × 320) × 13 states: the board at rest; commander damage; counters; mana; colours; identity; rotate seats; "Who goes first?"; settings (scrolled end to end); the life editor; and the dice, New game and Discard dialogs. That makes 52 combinations. The seeded game has every tracker on, Turn by turn, mana pools on two tiles, commander damage up to 18, poison at 8, a monarch, and an out player who still holds the initiative, so every chip kind and the "Pass it on" hint show.
- **Names, roles and states.** The Chromium accessibility tree (CDP `Accessibility.getFullAXTree`) and Playwright ARIA snapshots in Chromium and WebKit.
- **Focus.** A Tab walk of every state (1,216 focus stops). At each stop the script recorded `:focus-visible`, compared the pixels with focus on and off (the size of the changed area and the contrast of the change), and hit-tested the focused element's centre and corners to see whether anything covered it. In settings it also checked whether the Glass floating header or the scroll fade covered the focused control.
- **Targets.** For every enabled, visible control (inside the open modal when there is one), the script hit-tested a 24px square and 44px axis points around the control's centre with `elementFromPoint`. That catches `::after` touch areas and border-radius clipping.
- **Text contrast.** For each text run, the script took a screenshot with all text made transparent, then compared the text colour (with ancestor opacity applied) against the most common background pixel and the 10th-percentile pixel inside the text box. Glass blur and tile gradients are measured as drawn. Non-text pairs were computed from the tokens in `styles.css`.
- **Behaviour.** Keyboard-only scripts drove every mode and dialog while a `MutationObserver` logged every live-region change. Focus was checked after each open and close. Escape handling ran in both engines.
- **Media and spacing.** Reduced motion (`document.getAnimations()` after each action), reduced transparency (the CDP media feature, and `window.setReduceTransparency(true)` as the iOS bridge calls it), `prefers-contrast: more`, and the WCAG 1.4.12 text-spacing overrides.

WebKit on macOS only Tab-focuses form fields unless Full Keyboard Access is on, so the WebKit runs cover ARIA snapshots and Escape handling, not Tab order.

## Findings

Ranked by severity. Each finding gives the WCAG 2.2 criterion and level, how to reproduce it, the evidence and a fix.

### High

#### H1. Text can't be enlarged: zoom is disabled and Dynamic Type is ignored

- **WCAG:** 1.4.4 Resize Text (AA).
- **Where:** `web/index.html:6` has `maximum-scale=1, user-scalable=no`. `android/src/dev/maceiras/lifepod/MainActivity.kt:148` has `setSupportZoom(false)`. iOS Safari ignores `user-scalable=no`, but WKWebView honours it unless `ignoresViewportScaleLimits` is set, and it doesn't. Text is sized in `px` and `rem` from a fixed 16px root, so iOS Larger Text has no effect.
- **Reproduce:** iOS, either style, any size. Turn on Settings → Accessibility → Display & Text Size → Larger Text at the largest size, open LifePod's Settings, and try to pinch-zoom. Nothing changes. Settings text is 13–16px (`--type-label` .875rem, `--type-small` .8125rem).
- **Evidence:** Code only. Needs confirmation on a device. On Android, the WebView may apply the system font scale through its default `textZoom` (Chromium's `AwSettings` multiplies by `fontScale`). If it does, check that the fitted board and settings still fit at 200% (see the TalkBack script).
- **Mitigation already present:** the life totals are very large, and Settings → Table → Badge size enlarges the badge rows and the mana strip.
- **Fix:** The board needs multi-touch without zoom gestures, so keep it unzoomable. Make the text scale instead:
  - iOS: read `UIApplication.shared.preferredContentSizeCategory` (and listen for `UIContentSizeCategory.didChangeNotification`) in `LifePodApp.swift`, and pass a scale to the page, as is already done for Reduce Transparency. In the page, set the root `font-size` from it for settings, dialogs and badges.
  - Android: leave `textZoom` following the system font scale, or read `resources.configuration.fontScale` and pass it the same way.
  - Cap the board's own type so fitting still works, and let settings and dialogs grow and scroll.
  - At minimum, map the system's larger text sizes to Badge size Large and Larger by default.

### Medium

#### M1. Escape in an editing mode with unsaved changes does nothing

- **WCAG:** 2.1.1 Keyboard (A), 3.2.1 On Focus/3.2.2 On Input (A, unexpected change).
- **Where:** `web/app.js:76`. The document `keydown` handler calls `leaveBoardMode()` → `cancelEditing()` → `discardDialog.showModal()`. The browser's default action for that same Escape key is a close request, and it goes to the dialog that just opened.
- **Reproduce:** Either style, either size. Open Counters, press Enter on a cell (one change), then press Escape.
- **Evidence (Chromium and WebKit):**
  ```
  Escape with 1 change -> { mode: 'counters', discard: false }  focus: Cancel
  Enter on Cancel      -> { mode: 'counters', discard: true }   focus: Keep editing
  ```
  The dialog opens and closes within one event, and its close handler moves focus to Cancel. With no changes, Escape leaves the mode correctly. Android's back button (`closeOpenDialog`) is unaffected.
- **Fix:** Call `event.preventDefault()` in the handler before `leaveBoardMode()`.

#### M2. Visible labels aren't part of the accessible name

- **WCAG:** 2.5.3 Label in Name (A). This affects iOS Voice Control, Android Voice Access, and Switch Control users who pick by spoken name.
- **Reproduce:** The board at rest (952 × 427 and 568 × 320), counters mode, colours mode and "Who goes first?", in both styles.

  | Control | Visible | Accessible name | Code |
  |---|---|---|---|
  | Turn chip | "Turn 2" | "Player 3's turn, round 2. Pass the turn" | `render/badges.js` `turnChips` |
  | Pass hint | "Pass it on" | "Player 4 is out and still has the initiative. Pass the initiative on in counters" | `designationChip` |
  | Who goes first? | "Me first" | "Player 1 goes first" | `render/modes.js:270` |
  | Folded mana chip (568 × 320) | "3" | "Player 1, mana pool 1 white, 2 blue. Open mana" | `stripChip` |
  | Commander tax cell | "+2" | "Player 1 commander tax, 2, 1 cast. Add one cast" | `syncCounterCells` |
  | Taken swatch (disabled) | "P2" | "Copper, taken by Player 2" | `syncSwatches` |
  | Round button | "2" (twice) | "Round 2, Player 3's turn. Pass the turn" | passes: "2" is in the name |
- **Fix:** Start each name with the visible words:
  - "Turn 2. Player 3's turn, pass it"
  - "Pass it on: Player 4 is out and still has the initiative"
  - "Me first, Player 1"
  - "3 mana. Player 1's pool: 1 white, 2 blue. Open mana"
  - "+2 commander tax, Player 1, 1 cast. Add one cast"
  - "P2, Copper, taken"

#### M3. One-press buttons act on pointerdown

- **WCAG:** 2.5.2 Pointer Cancellation (A).
- **Where:** `bindTap` in `web/js/ui/press.js:98` runs the action on `pointerdown`. It's used for "Me first", "Pick at random", "Pass it on", reminder chips (Dismiss), mana spend and clear, the folded strip chip, colour swatches and identity toggles. `bindCounter` (the life buttons) also counts on down, by design.
- **Reproduce:** Either style and size. In "Who goes first?", touch "Me first", then slide off before lifting. The choice is already made and the board leaves the mode after `firstBeat`.
- **Assessment:** For the life buttons, counting on down is a deliberate reliability choice for several fingers at once (`design/polish/SPEC.md`), and the opposite button undoes it, which meets the "undo" exception. Mana clear has Undo, and swatches and identity toggles can be changed back. "Me first", "Pick at random" and "Pass it on" (which changes mode) have no abort or undo. A screen-reader double-tap synthesizes a complete press, so those users aren't affected.
- **Fix:** Use a `bindTap` variant that acts on `pointerup` when the pointer is still over the button, for buttons that don't need multi-touch reliability: "Me first", the shuffle, "Pass it on", Dismiss, and the strip chip. Keep the shared click-skip window so a redraw under the finger can't double-fire. Keep life, counters and map seats as they are.

#### M4. Focus is lost or jumps across the board when the element it was on goes away

- **WCAG:** 2.4.3 Focus Order (A). The undo window also touches 2.2.1 Timing Adjustable (A).
- **Reproduce (Chromium, 952 × 427, either style):**
  ```
  focused reminder chip "Monarch: draw a card. Dismiss"  -> after 3 s timeout: <body>
  Enter on "Clear Player 1's mana pool" -> focus "Undo clearing…" -> after 5 s: Settings (pill)
  Spend the last mana on Player 3's strip -> focus Settings (pill)
  ```
- **Where:**
  - `syncReminderChips` (`render/badges.js:47`) replaces the chip and doesn't move focus anywhere.
  - `renderBadges` (`render/badges.js:212`) falls back to `setupButton.focus()` when the strip empties.
  - `undoClearTime` is 5000 and `reminderTime` is 3000 (`logic/data.js:96,137`).
- **Fix:**
  - When a focused chip or strip goes away, focus something in the same tile (the folded strip chip, the next chip, or the tile's subtract button), not the pill.
  - Pause the undo-clear and reminder timers while focus is inside them, which meets 2.2.1's "extend" option.
  - Say how long the undo lasts in the announcement: "mana pool cleared, undo for 5 seconds".

#### M5. Rotate seats leaves the badge and mana-strip buttons operable under the overlay

- **WCAG:** 2.4.3 Focus Order (A). The keyboard and touch behaviour also don't match.
- **Reproduce:** Rotate seats, either style, 952 × 427. Press Tab. Focus visits the turn chip, the mana-strip Spend and Clear buttons and "Pass it on", all under the `.rotate-seat` buttons. Hit-testing their centres returns `button.rotate-seat`. Pressing Enter on the turn chip passes the turn while you're rotating seats. At 568 × 320 the folded strip chips behave the same.
- **Where:** `setBoardMode` (`actions/mode.js:103`) makes only `.controls` inert. The other modes hide the edges with CSS, but rotate mode shows them.
- **Fix:** Also set `inert` on `.far-edge` and `.near-edge` while `mode === 'rotate'`. Or use `inert` on everything in the tile except `.rotate-seat` during any mode.

#### M6. The hidden "Remove one" buttons look exactly like "Add one" when focused

- **WCAG:** 2.4.7 Focus Visible (AA) is met, but the indicator doesn't say what will happen. 3.3.2 Labels or Instructions (A) and 2.4.6 also apply.
- **Where:** `.map-remove` and `.counter-remove` are `.visually-hidden` buttons placed after each cell. CSS rings the cell itself (`styles.css:1048`, `:1096`) when they're focused.
- **Reproduce:** Commander damage, counters or mana mode, either style and size. Tab from a cell to the next stop. The same ring stays on the same cell, but Enter now removes one.
- **Evidence:** The cell's outline is `solid rgb(217, 240, 138)` in both cases. Tab order alternates "Player 3's commander, 0 damage. Add one" and "Remove one commander damage from Player 3's commander" with no visual difference.
- **Fix:** Use the round-back pattern (`#round-back:focus-visible`, `styles.css:497`). While the remove button has focus, show it as a "−1" badge on the cell's edge, or switch the cell's ring to a dashed style and show "−1" in place of the count.

#### M7. Modes, a new game and "Who goes first?" start without telling a screen reader user

- **WCAG:** 4.1.3 Status Messages (AA), 3.3.2 Labels or Instructions (A).
- **Reproduce (keyboard, either style):** Each of these changes the screen without an announcement:
  - Enter commander damage, counters, mana, colours, identity or rotate seats: nothing is announced, and focus lands on the first cell.
  - Save a mode: nothing is announced.
  - Settings → change Players → Done ("Start new game"): nothing is announced, and focus lands on "Player 1 goes first".
  - Choose a tile colour, toggle an identity colour, or rotate a seat: only the button's own pressed state changes.

  The gesture hints ("Tap +1 · hold −1", "Tap your colours", "or the centre button picks at random") are `aria-hidden` (`render/modes.js:227–232`, `:274`).
- **What is announced (works):**
  - Life ("Player 1, 41 life"), settled once after a hold.
  - Turns ("Player 3's turn, round 2"), with the monarch's reminder in the same message.
  - Commander damage with its life effect and handoff: "Player 3 is the monarch. Player 3's commander, 21 damage to Player 2. Player 2, 9 life".
  - Undo, mana spend and clear, "Player 1 goes first", "Changes discarded", and dice rolls.
- **Fix:** Announce through `announce(-1, 'mode', …)`:
  - On entering a mode: "Commander damage. Each tile lists its opponents' commanders; press to add one. Save or Cancel in the centre."
  - On Save: "Saved".
  - On a new game: "New game, 5 players at 40 life. Who goes first? Choose a player or Pick at random."
  - After an identity toggle: "Player 1, Azorius".

  Drop `aria-hidden` from hints that carry instructions, or copy them into the announcement.

#### M8. "Player 3" isn't shown anywhere, and tile colours aren't exposed

- **WCAG:** 1.3.1 Info and Relationships (A).
- **Reproduce:** The board at rest, either style or size. The regions are named "Player 1"…"Player 6" (`actions/board.js:39`), and every announcement uses those numbers. Sighted players see colours and seats, never numbers. The seat map in commander damage mode is spatial and coloured, with names like "Player 3's commander".
- **Impact:** A blind player at a real table hears "Player 3, 12 life" and can't tell which friend that is. Touch exploration shows where a tile is, but not its colour.
- **Fix:** Include the tile colour name in each region's label and in announcements: "Player 3, Sky". The names are already in `tileSets[game.tileColours].names`. Update them in `paintColours()` when a colour changes. Consider letting players name seats later.

#### M9. Badge-row list semantics are invalid and mislabelled

- **WCAG:** 1.3.1 Info and Relationships (A), 4.1.2 Name, Role, Value (A).
- **Where:** `render/badges.js:94,192,232`. Chips that are buttons (turn, Start, "Pass it on", the folded strip chip) are placed directly inside `role="list"` with no `listitem` wrapper (axe rule `list`/`aria-required-children`). The folded mana chip is a child of the far row, which is labelled "Commander damage" (`foldedChip`, `:188`). The near row is labelled "Counters" but also holds the turn chip, the went-first flag, the identity and the monarch or initiative.
- **Evidence (ARIA snapshot, 568 × 320):**
  ```
  list "Commander damage":
    - listitem: 5 commander damage from Player 2
    - button "Player 1, mana pool 1 white, 2 blue. Open mana"
  list "Counters":
    - button "Player 2's turn, round 2. Pass the turn"
    - listitem: Jund, colour identity black, red, green
  ```
- **Fix:** Wrap each button chip in a `<span role="listitem">`. Move the folded mana chip out of the damage list (into the `.mana-strip` group, or a group of its own). Rename the near row "Status" or "Turn and counters".

### Low

#### L1. The settings live region is chatty, and its message is inaccurate

- **WCAG:** 4.1.3 Status Messages (AA), best practice; 3.3.2 Labels or Instructions (A).
- **Evidence:**
  - Each slider key press announces both the value text and the full sentence: Home, End and Page Up gave three "Starts a new game with 5 players at … life when you leave settings." messages.
  - The sentence says "when you leave settings", but ✕ and Escape leave settings and silently drop the pending game (`sheets/settings.js:172,180`). Only Done, Colours, Rotate seats and Choose identities start it.
- **Fix:** Debounce `#settings-pending` like the board announcer. Reword it to "Starts a new game with 5 players at 40 life when you press Start new game. Close keeps the current game."

#### L2. Slider value text repeats its label

- **WCAG:** 4.1.2 Name, Role, Value (A), quality.
- **Evidence:** The life slider is named "Starting life" and its `aria-valuetext` is "Starting life 40", so it's read as "Starting life, Starting life 40, adjustable". Badge size and tile colours read "Default badges" and "Clear tile colours", which is fine.
- **Fix:** Make the life slider's `describe` return "40" (or "40 life").

#### L3. Single-choice groups are exposed as toggle buttons

- **WCAG:** 4.1.2 Name, Role, Value (A), quality; 2.1.1 Keyboard (A), efficiency.
- **Evidence:**
  - Colour swatches, the Style, Turns and Background segmented controls, the dice picker and the slider stops are buttons with `aria-pressed`.
  - In colours mode with four players there are 36 Tab stops before Done (glass 568 × 320).
  - The slider stops have `tabindex="-1"`, but screen-reader swipe still reaches them, so each slider is preceded by up to five extra "N players" buttons.
- **Fix:** Use `role="radiogroup"` and `role="radio"` with `aria-checked` and a roving `tabindex` (arrow keys move within the group). Do this for the swatches at least. Hide the slider stops from AT (`aria-hidden="true"` on `.k-stops`), since the slider already offers every value.

#### L4. "Close to lethal" is shown by colour and weight only

- **WCAG:** 1.4.1 Use of Color (A).
- **Evidence:** 8 poison and 18 commander damage get `data-level="warn"`, which is amber and heavy (`styles.css:1211–1213`, `:1373`). Their names are just "8 poison" and "18 commander damage from Player 3". "Out" is spoken ("0 life, out"), so the lethal case is fine.
- **Fix:** Add the level to the hidden text: "8 poison, 2 from lethal".

#### L5. Leaving a mode returns focus to Settings, not to the button that opened it

- **WCAG:** 2.4.3 Focus Order (A).
- **Evidence:** Commander damage → Save gives focus to "Settings", not "Commander damage" (`actions/mode.js:119–122`). Dialogs restore focus correctly: the dice, settings and New game dialogs all return focus to their opener.
- **Fix:** Remember `document.activeElement` when a mode opens, and focus it again on `setBoardMode(null)` if it's still connected and visible. If not, fall back to Settings.

#### L6. The life editor silently rejects invalid values

- **WCAG:** 3.3.1 Error Identification (A).
- **Evidence:** Typing 0 and pressing Enter puts back the previous value (10), with no message.
- **Fix:** Say "Starting life must be 1 to 999" through `#settings-pending` or `aria-describedby` on the field, and keep the field open.

#### L7. Text spacing truncates two settings labels

- **WCAG:** 1.4.12 Text Spacing (AA).
- **Evidence:** With the WCAG overrides applied at 952 × 427, "Pass-it-on hints" and "Choose identities" end in an ellipsis (`.nav-label`, `styles.css:1534`). There's no loss at 568 × 320 (one column), and none on the board or in the dice dialog.
- **Fix:** Let `.nav-label` wrap (`white-space: normal`), as `.wide-switch .nav-label` already does. Or run `fitCompactSwitches` again on resize and font changes.

#### L8. Low-contrast boundaries that WCAG allows but that are worth knowing

- **WCAG:** 1.4.11 Non-text Contrast (AA). These pass on the exceptions.
- **Evidence:**
  - The Material slider's unfilled track (`--raised` #242528 on the card #1b1c1e) is 1.11:1. The value is carried by the accent fill and thumb, and the ends by the muted ticks at 7.54:1, so it passes.
  - Material's filled buttons and segments have the same 1.11:1 fill against the card. Their text identifies them, so they pass.
  - The Glass switch-off fill is 3.59:1, and the Glass segmented thumb is 3.22:1 on its track: both pass.
- **Fix:** Optional. A 1px `--control-border` line along the Material slider track would make its extent visible to low-vision players.

#### L9. Minor semantics

- **Rotate seat:** no state. "Rotate Player 1 clockwise" doesn't say which way the seat faces now. Add "faces left" or similar to the label.
- **Score:** `<output class="score" aria-live="off">` has the implicit role `status`. That's fine with `aria-live="off"`, but check on VoiceOver that it isn't treated as live (see the script).
- **Headings:** there's no `<h1>`. The page title "LifePod" and `main`'s label cover it.
- **Uppercase:** settings section headings are uppercase through CSS. Chromium exposes "GAME", "TRACK" and so on, and some voices spell short uppercase words.
- **Seat map:** the self cell is read as "Your life, 40". With a shared device, "Player 1's life, 40" is clearer.

## What works well

- **Names everywhere.** No unnamed button, switch, slider or field in any of the 52 combinations. Every icon-only button has an `aria-label`: the pill, ✕, flip, undo, save and cancel, commit, mana-strip spend and clear, and identity toggles named by colour. Every Phosphor SVG and Mana glyph is `aria-hidden`. `lang="en"` is set.
- **Native dialogs.** `showModal()`, `aria-labelledby`, and `aria-describedby` on Discard and New game. Initial focus goes to a safe choice ("Keep editing", "Cancel new game", Close settings, Roll). Escape closes, and focus returns to the opener in both engines.
- **The announcer.** Bursts are debounced (700ms) and read in seat order with the settled value. One hold of six steps gave one message. Turns, monarch and initiative reminders, commander damage with its life effect, designation handoffs, mana changes, undo and discard are all announced. Dice results have their own live region in the dialog.
- **Keyboard alternatives for every hold.** The round button's back step is a real button that appears only while it has keyboard focus. Map seats and counter and mana cells have hidden "Remove one" buttons. Holding Enter on a life button repeats through the OS key repeat. Escape leaves a mode with no changes. While a mode is open, `inert` keeps focus off the life buttons.
- **Focus visibility.** `:focus-visible` only, a 2px solid accent outline offset 2px: 13.6:1 on surfaces and at least 7.45:1 on every tile panel measured. Rings around switch rows use `:has()`, and rings for the hidden buttons go on their cell. No focused control in settings was covered by the Glass floating header or the scroll fade at either size (2.4.11 passes).
- **Touch targets.** Nothing measured under 44px of effective target:
  - Each life button covers half its tile through `::after` (about 237 × 212 at 952 × 427).
  - Chips get 44px-tall touch areas.
  - Mana strip buttons are 44–49 × 44.
  - Pill buttons are 48px circles.
  - Every slider stop, switch row and segment is at least 44 tall.

  2.5.8 (24px) passes everywhere. The only targets that don't hit-test are the M5 case.
- **Text contrast.** No failure in 1,625 text runs across both styles and sizes, including the Glass pill and dialogs over the board. The palette is built for it (life totals at least 9:1 and small text at least 7.6:1 on every tile, per `styles.css`).
- **Sliders and switches.**
  - Sliders: `role="slider"` with min, max, now and `aria-valuetext`; arrows, Page Up and Down, Home and End all work, and every stop can also be tapped (2.5.7).
  - Switches: native checkboxes with `role="switch"`, and the whole row is the label.
  - Segmented controls are labelled groups.
  - The flip button is a toggle with `aria-pressed`.
- **Reading order.** Settings' DOM order follows the visual order at both widths: Game, Table, Reminders, then Track and Identity in two columns, and Game, Track, Identity, Table, Reminders in one column.
- **Rotated tiles.** The DOM stays in seat order and names never depend on rotation ("Subtract one life from Player 1" stays correct when that tile is upside down). On a tile turned 180°, Tab moves right to left on screen, which matches that player's own reading direction.
- **Reduced motion.**
  - No board animation runs under `prefers-reduced-motion: reduce`: no life pulse, no reminder slide, transitions forced to `none`, and pressed controls keep their size.
  - The dice skip the tumble and only fade the number.
  - "Pick at random" chooses at once, without the light chase.
- **Reduced transparency and contrast.** Glass goes solid under `prefers-reduced-transparency`, under the iOS bridge (`setReduceTransparency(true)`), and under `prefers-contrast: more`, which also thickens the edges. The checks: the pill `::before` and the dialog fill become opaque `#242528` and `#1b1c1e`, with `backdrop-filter: none`.

## What can't be judged without a real screen reader

- Whether VoiceOver and TalkBack activate the life buttons, chips and cells exactly once per double-tap. The page counts on `pointerdown` and skips the click that follows within 800ms, and screen readers synthesize their events differently.
- Double-tap-and-hold as a hold: whether life repeats and the turn chip steps back.
- How polite announcements queue against the speech of the focused element, and whether a 700ms burst makes speech lag behind during fast play.
- Whether the four `<output role="status" aria-live="off">` totals stay silent.
- Touch exploration of rotated tiles and of the whole board turned 90° in portrait: whether the reported frames match what's drawn.
- How uppercase headings, "d20", "+2" and the em-dash minus "−" are spoken.
- The modal behaviour of `<dialog>` in WKWebView and Android WebView: whether swipe navigation stays inside the dialog.
- Dynamic Type and the Android font scale (H1), and iOS Full Keyboard Access and Switch Control.

### VoiceOver (iOS) test script

Run each step in Material and in Glass, on an iPhone in landscape. Then repeat steps 1–4 in portrait, where the board is turned.

1. **Board.** Turn VoiceOver on and open LifePod with a four-player game.
   - Swipe right from the top. Expect "LifePod", then "Player life totals", then "Player 1" (region), its subtract button, "40 life", its add button, and so on for each player. The pill comes last.
   - Expect no player's total to be spoken by itself when a different player changes life.
2. **Life.** On "Add one life to Player 1", double-tap. Expect +1 exactly, then "Player 1, 41 life" after a short pause. Double-tap and hold for 2 s: expect life to repeat and one announcement when you let go. Try the same with the subtract button on a tile that is upside down.
3. **Rotor.** Use the Headings and Landmarks rotors. Expect every player region to be reachable.
4. **Touch exploration.** Drag a finger across a rotated tile. Expect its total and buttons to be found where they're drawn.
5. **Turns.** In Settings → Turns choose Turn by turn, then Done. In "Who goes first?":
   - Expect an announcement or a clear first focus.
   - Double-tap "Player 1 goes first". Expect "Player 1 goes first".
   - Double-tap the turn chip. Expect "Player 2's turn, round 1" and focus to follow the chip.
   - Double-tap and hold the chip. Expect one step back.
   - In the pill, swipe to "Back one turn" and double-tap.
6. **Commander damage.** Open the pill's Commander damage.
   - Expect focus on the first seat cell.
   - Double-tap a cell: expect "+1" and the damage-and-life message.
   - Swipe right once: expect "Remove one commander damage…", and double-tap it.
   - Double-tap Undo, then Save.
   - Repeat, then use the two-finger scrub (Z gesture) on the board. Expect "Discard N changes?" with focus on "Keep editing".
7. **Monarch handoff.** Give a player the monarch in counters mode, then deal them lethal commander damage. Expect "Player N is the monarch" as part of the message.
8. **Mana.** Turn on Mana pool, add mana in mana mode, then Save.
   - On the tile, double-tap a spend button: expect "Player 1, mana pool …".
   - Double-tap Clear, then Undo within 5 s.
   - Spend the last mana and check where focus goes.
9. **Settings.**
   - Swipe through every control: expect each switch's state, each segmented button's selected state, and each slider's value.
   - On Players, swipe up and down. Expect "5 players" with each swipe, and check how often the pending sentence is read.
   - Double-tap the starting-life number, type 25 with the keyboard, then tap Done.
   - Flip settings and check reading.
   - Close with ✕, and check that the pending game is dropped.
10. **Dialogs.** Open Dice. Expect focus on "Roll d20". Double-tap: expect "Rolled N on a d20". Swipe past the last control: VoiceOver must not leave the dialog. Scrub to close: expect focus back on "Roll dice". Do the same for New game and its Cancel.
11. **Reduce Motion and Reduce Transparency.** Turn both on and repeat steps 2 and 10. Expect no life pulse or die tumble, and a solid pill and sheets in Glass.
12. **Larger Text.** Set it to maximum. Note whether any text grows (expected: none, per H1).

### TalkBack (Android) test script

Run each step in Material and in Glass, on a phone in landscape. Then repeat steps 1–3 in portrait.

1. **Board.** Turn TalkBack on and open LifePod.
   - Swipe right through the board. Expect the same order as in VoiceOver step 1.
   - Check that the life totals aren't announced unprompted.
2. **Life.** Double-tap "Add one life to Player 1". Expect exactly +1 and "Player 1, 41 life". Double-tap and hold: expect repeat and one announcement. Explore by touch on an upside-down tile.
3. **Reading controls.** Use the TalkBack menu → Navigation → Headings and Controls to move between controls.
4. **Turns.** Follow VoiceOver step 5. Also check that the hidden "Back one turn" button is reachable by swiping.
5. **Commander damage, counters and mana.** Follow VoiceOver steps 6–8.
   - Press the system Back button with changes: expect the Discard dialog.
   - Press Back again: expect "Keep editing".
   - Back with no changes: expect it to leave the mode.
6. **Settings.**
   - Slider: double-tap and hold, then slide, or use volume keys if TalkBack offers "adjust". Expect the value spoken.
   - Switches: expect "on" or "off".
   - The life field: expect the numeric keyboard, and Enter to commit.
   - Back closes settings.
7. **Dialogs.** Dice, New game and Discard: focus starts inside, can't swipe out, Back closes, and focus returns to the opener.
8. **Font size and Display size.** Set both to maximum and reopen the app.
   - Note whether text scales.
   - If it does, check that the board still fits, every target stays usable, and settings scroll.
   - Then try Accessibility → Magnification (triple tap). That's the only zoom available while `setSupportZoom(false)` is set.
9. **Remove animations and high-contrast text.** Turn both on. Expect no life pulse and no die tumble.
10. **Switch Access and Voice Access.** With Voice Access, say "Tap Turn" and "Tap Me first". These are expected to fail until M2 is fixed. Then say "Tap Settings" and "Tap Commander damage", which are expected to work.
