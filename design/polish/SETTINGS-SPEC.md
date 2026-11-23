# Settings page: build spec

**Status:** ready to build, 22 November 2026, from the owner's picks on [SETTINGS.md](SETTINGS.md):

| Question | Pick |
|---|---|
| Q1 layout | B |
| Q2 groups | G1, with Keep awake moved into Game |
| Q3 pending game | P1 |
| Q4 orientation | O1 |
| Q5 About | Inline |

- This spec covers layout and behaviour only.
- Anything that depends on the styling round ([STYLE.md](STYLE.md)) is marked **[STYLE Qn]**, pointing to the question there. Build the structure first, and the styling drops in.
- Mock-up: `renders/settings-b.png` shows the layout. The `renders/style7-*.png` images show it with Keep awake in Game and the slider variant.

---

## 1. What it replaces

- One full-screen `<dialog id="settings">` replaces four dialogs: `#setup`, `#track`, `#identity-sheet` and `#privacy`.
- `#restart` (the New game confirmation), `#discard` and `#dice` stay as they are.
- The saved data doesn't change. Every setting and its default are as in [SPEC.md](SPEC.md) §10.
- The ids of the controls inside stay the same where the control survives (`#player-choices`, `#life-presets`, `#commander-switch` … `#auto-empty-switch`, `#identity-show`, `#identity-background`, `#keep-awake`). The existing tests and app.js wiring keep working.

## 2. Structure

```
dialog#settings.fs
  header.fs-head      ✕ · "Settings" · flip ⟲ · Done (or "Start new game")
  div.fs-body         scrolls
    div.fs-content
      section#settings-game      Game
      section#settings-track     Track
      section#settings-identity  Identity
      section#settings-table     Table
      section#settings-reminders Reminders (added after the build, §8)
      section#settings-about     About
```

| Section | Contents, in order |
|---|---|
| **Game** | Players **[STYLE Q4]**; Starting life **[STYLE Q5]**; then a footer row with **New game** (secondary button) and **Keep awake** (switch row) side by side |
| **Track** | Eight switch rows (Commander, Poison, Energy, Experience, Rad, Mana pool, Monarch, Initiative), two to a line; Turns (Off · Rounds · Turn by turn); "Empty mana pools when the turn passes", shown only while Mana pool is on and Turns isn't Off |
| **Identity** | Show on tiles (three compact switches: Indicator, Symbol, Name); Background (Symbol · Default · Off); the note line; **Choose identities** (board action) |
| **Table** | **Colours** and **Rotate seats** (board actions), side by side |
| **Reminders** | Turn reminders, Pass-it-on hints and Gesture hints, compact switch rows (§8) |
| **About** | Privacy and credits, today's text, in small muted type |

- Each section has a small caps title with its icon:
  - Game: Phosphor users-three;
  - Track: the flag;
  - Identity: Mana's colour pie;
  - Table: squares-four;
  - Reminders: Phosphor bell;
  - About: info.
- **The section card** (border, fill or neither) is **[STYLE Q1]**.

## 3. Layout

| Viewport | Layout |
|---|---|
| **Landscape, at least 620px wide** (952 × 427 target, 852 × 393, 1366 × 1024) | Two columns, each `minmax(0, 1fr)`, 12px apart, inside a container at most `min(1180px, 100%)` wide: Game, Table and Reminders in the left column, Track and Identity in the right, About across both. Inside a column, each row stacks its label above its control. |
| **Under 620px wide** (568 × 320, 640 × 360 portrait-ish splits) | One column, in the order Game, Track, Identity, Table, Reminders, About. Inside a section, labels sit beside their controls when the card is at least 480px wide, otherwise above. |
| **Portrait** (375 × 667, 320 × 568) | One column. Labels go above their controls. The compact switches put the label over the switch (today's portrait rule). |

- **Header:**
  - fixed at the top while the body scrolls;
  - 44px buttons, 8px padding, which shrinks to 4px when the viewport is under 360px tall;
  - its look is **[STYLE Q1]** (direction B makes it a floating glass bar).
- **Padding:**
  - The page pads by `env(safe-area-inset-*)` on all four sides; the viewport is `viewport-fit=cover`.
  - The content adds 16px at the sides, or 12px under 360px tall.
- **Scrolling:**
  - The body scrolls with `overscroll-behavior: contain`.
  - No scroll position is kept: settings always open at the top.
- **Targets:** every interactive element is at least 44 × 44px at every size, including 568 × 320 and 320 × 568.

## 4. Behaviour

### Open and close

| Action | Result |
|---|---|
| Pill setup button | Opens settings at the top. Focus goes to ✕. Pending choices start from the current game: players and starting life as saved. |
| **Done** | Closes settings. |
| **Start new game** (Done's label while a change is pending) | Starts the new game with the chosen players and life (as `startGame` does today), then closes. No confirmation, because the button says what it does. |
| ✕, Escape, Android back | Closes settings and **drops a pending players or life change**. Everything else was saved already. If the inline life editor is open, the first back closes the keyboard (the system's job), and the next one closes settings. |
| **New game** (Game section) | Opens today's `#restart` confirmation over settings. Confirming starts a new game with the current settings and closes both. Cancelling returns to settings. Hidden while a change is pending. |

### Pending new game (P1)

A change is pending when the chosen players or starting life differ from the current game.

While a change is pending:

- **Done** reads **Start new game**.
- **New game** hides.
- A line in the Game section says what will happen: "Starts a new game with 6 players at 40 life when you leave settings."
- **Board actions start the new game first, then their mode.** For example, Colours right after choosing 6 players starts a 6-player game and opens Colours on it.
- Undoing the change (choosing the old values again) clears the pending state.

### Instant settings

- Track switches, Turns, auto-empty, Show on tiles, Background, the Reminders switches and Keep awake save the moment they change, as today.
- Turns going from Off to on doesn't open "Who goes first?" while settings is open; it opens when settings closes (SPEC §8).

### Board actions

**Choose identities, Colours and Rotate seats:**

1. One tap closes settings (starting a pending new game first).
2. It starts the board mode.
3. The mode's ✓ returns to the board, not to settings, as today.

Each is a row with its icon, its label and an out-to-the-board arrow. The row's look is **[STYLE Q1]**.

### Players and starting life

- Players: 2–6.
- Starting life: presets 20 · 30 · 40, or any whole number from 1 to 999.
- Either control **[STYLE Q4, Q5]** follows these rules:
  - It changes `selectedPlayerCount` and `selectedLife` only (pending until Done).
  - It announces its value to screen readers ("4 players", "Starting life 40").
  - It works by tap as well as by drag (WCAG 2.5.7).
- Arrow keys step the value; Page Up and Page Down step life by 5.

### Orientation (O1)

- The page faces the phone's own orientation, the way today's dialogs do. It isn't inside the rotated `.app`, so it doesn't turn with the board.
- The **flip ⟲** button turns the whole page 180° (`transform: rotate(180deg)` on the dialog), for a player across the table.
  - Its label is "Turn settings to face the other side".
  - The flip resets every time settings opens.

### About (inline)

- The About section shows today's privacy and credits text.
- The old About button in the header goes.
- The scroll cue (the fade at the bottom) moves from `#privacy` to the settings body. It shows while there is more below.

## 5. Accessibility

- The dialog is `aria-labelledby` "Settings". Each section is a `<section>` with an `<h3>`.
- Switch rows stay `<label>` with `role="switch"` inputs.
- Board actions are buttons named for what they do: "Choose identities on the board", "Choose tile colours on the board", "Rotate seats on the board".
- Done's accessible name follows its label.
- The pending line is `aria-live="polite"`.
- Focus is visible on every control (2px ring at 3:1, WCAG 2.4.13). The fixed header must never cover the focused control (2.4.11), so the body gets `scroll-padding-top` equal to the header's height.

## 6. Build steps and tests

1. **Markup and wiring:**
   - Build `#settings`.
   - Move the controls in.
   - Delete the three sub-dialogs.
   - Point `syncBackHandling`, `closeOpenDialog` and the pill button at `#settings`.
2. **Behaviour:** the pending state, board actions starting a pending game, the flip, the scroll cue.
3. **Styling** **[STYLE Q1–Q6]:** once picked.

**Tests** (in the existing Playwright suites):

- `setup.test.mjs` becomes `settings.test.mjs`:
  - opens full screen at 952 × 427, 640 × 360, 568 × 320, 375 × 667 and 1366 × 1024;
  - two columns at 620px wide and up, one below;
  - every target is at least 44px;
  - the safe-area padding is applied (fake insets through a CSS variable override);
  - Done and ✕ close it; ✕ drops a pending change;
  - Start new game appears when players or life change, and disappears when changed back;
  - New game opens the confirmation and is hidden while a change is pending;
  - Colours, Rotate seats and Choose identities each close settings and start their mode, and with a pending change they start the new game first (the player count is checked);
  - the flip turns the dialog and resets on reopen;
  - Android back (`closeOpenDialog()`) closes settings;
  - switches save instantly and survive a reload.
- `sizes.test.mjs`: replace the setup-fits-without-scrolling checks with "the header stays visible and the body scrolls".
- Remove the Track and Identity sub-sheet tests. Their switch behaviour checks move into `settings.test.mjs`.

---

## 7. As built (22 November 2026)

Built with [STYLE.md](STYLE.md)'s picks: direction A (tonal) on every control type, Graphite + lime for the chrome, the notched players and life sliders with the inline life field, and a solid pill whose fill is one token (`--pill-background`) so a glass pill can replace it. The tiles, the life halves and the twelve tile palettes are unchanged. Tests: `tests/settings.test.mjs` replaces `setup.test.mjs`; `sizes.test.mjs` checks the page on every screen it lists.

**Theme tokens.** Direction A's colours, fills and edges, state layers, focus ring, motion, corner radii, elevation, switch and slider geometry are custom properties in one block, `:root, [data-style="material"]` at the top of `web/styles.css` (`<html data-style="material">`). Component rules read only those tokens, so a second style, such as STYLE.md's direction B, can be a block of overrides under `[data-style="glass"]` without touching a component rule. Text is the Graphite chrome's (`#f2f2ef`, soft `#dedfe2`) on the tiles as well, which TILES.md checked against every tile set.

Where the build differs from the spec above, and why:

| Spec | As built | Why |
|---|---|---|
| The pill's button opens settings (its name was "Game setup") | It's named **Settings**, and ✕ is "Close settings" | The name matches the page it opens. |
| Board actions keep their visible labels | Colours, Rotate seats and Choose identities show those labels; their accessible names are the spec's longer ones | The names contain the visible labels (WCAG 2.5.3). |
| One column: labels beside controls in cards at least 480px wide | True for Turns and Background. The sliders and Show on tiles keep their label above at every width. | A slider needs the full width for 44px stops; beside a 7.5rem label the life stops crowd. |
| Compact switches put the label over the switch in portrait | They do so whenever their card is narrow: under 460px for Show on tiles, under 340px for Track's switches | At 640 × 360 and 667 × 375 the two columns are narrower than a portrait phone, and "Indicator" or "Experience" would be cut short. A container query decides. |
| Two columns in landscape from 620px wide | Two columns whenever the window is at least 620px wide, portrait tablets included | The width is what matters; a portrait tablet has room. |
| Section order by layout | app.js moves the sections between the columns (and keeps focus) rather than reordering them with CSS | The reading and focus order always match what shows. The move waits while the life field is open, so a keyboard resize can't close it. |
| `scroll-padding-top` equal to the header | The header is its own grid row above the scrolling body, so it can't cover anything; the body has 8px scroll padding | Covering is impossible by construction; a test tabs through every control at 568 × 320 to check it. |
| Arrow keys step, Page Up and Page Down step life by 5 | As specified. Home and End go to the ends of the track (2 and 6; 10 and 60). Life's ARIA range is 1 to 999, and keys can step past the track, where the handle pins and is marked with an arrow. | Keyboard users can reach every life the field allows. |
| Each stop is a target | Stops are buttons with `tabindex="-1"`: the slider is one tab stop, and screen readers can still reach each stop | Five extra tab stops per slider would be noise next to the arrow keys. |
| A press on the slider | A value is picked when a press lifts without moving (a tap) or moves sideways (a drag); a vertical swipe scrolls the page (`touch-action: pan-y`) | No scroll trap: a swipe that starts on a slider never changes it. |
| Inline life field | Enter, ✓, Done in the iOS keyboard bar or leaving the field commits; Escape cancels and leaves settings open. Letters are dropped as they're typed. | Escape would otherwise close settings and lose the typing. |
| The field scrolls clear of the keyboard | It also gets extra bottom room (`--keyboard`) from the visual viewport where the page doesn't shrink for the keyboard (iOS), and it works when the page is flipped | The field could otherwise sit under an iOS keyboard with nothing left to scroll. |
| New game's confirmation over settings | Android back and Escape close the top dialog first (the confirmation), then settings | `closeOpenDialog` now closes the last open dialog. |
| Header at 320 × 568 | Under 400px wide the header tightens, and "Start new game" may wrap onto two lines | So the title stays whole beside it. |
| Mode cells' pressed state | Counter and mana cells press with the 10% state layer (direction A); the turn chip and Me first keep their seat wash | Cells are controls in the chrome's style; the chip and Me first belong to the tile, like the life halves. |
| Identity toggles | Off is a raised disc with the symbol muted; on keeps the symbol in full colour inside a 2px accent ring, with the check | Direction A's selected style without filling the symbol, which is the information. |
| The pill | No border; the solid `--raised` fill and a soft two-layer shadow | Direction A. The fill is `--pill-background`, the shadow `--pill-shadow`. |
| Table: Colours and Rotate seats | Table also holds **Tile colours**, a four-stop slider in the players slider's style: Classic · Soft · Jewel · Clear, default Clear (design/polish/TILES.md) | Added after the spec, at the owner's request. It saves at once, like the switches; it isn't part of a pending new game. `tileColours` is validated in `loadGame()`, and a save without it gets Clear. The sets come from `tiles7.json`; `palette.test.mjs` checks each against it and the contrast minimums. |

## 8. Reminders (added 22 November 2026)

With the monarch and the initiative (SPEC.md §13), Settings gains a **Reminders** section, titled with the Phosphor bell:

| Switch | Icon | Shown | Controls |
|---|---|---|---|
| **Turn reminders** | bell-ringing | while Monarch or Initiative is on and Turns is Turn by turn | "Monarch: draw a card" and "Initiative: venture into Undercity" on the tiles |
| **Pass-it-on hints** | arrow-bend-up-right | while Monarch or Initiative is on | the "Pass it on" chip on an out holder's tile |
| **Gesture hints** | hand-tap | always | the "Tap +1 · hold −1" and "Tap your colours" lines in counters, mana, commander damage and identity modes (Colours' "Your tile colour" is a label, so it stays) |

- All on by default and saved the moment they change, in `game.reminders` (`loadGame()` keeps each on unless it was saved as exactly false). Gesture hints always shows, so the section always has something in it.
- **Placement (layout B):** the left column, after Table: Game, Table and Reminders are about as tall as Track and Identity, and Reminders is the least-used section. In one column it comes after Table, before About. app.js moves it with the others.
- **Rows:** compact switch rows like Track's, two to a line where each row has room for its whole label (13rem), otherwise one, so no label is ever cut short (a container's auto-fit grid rather than Track's label-over-switch rule).
- Tests: `tests/monarch.test.mjs` (which rows show when, the order of the sections in both layouts, 44px rows, saving) and `sizes.test.mjs` (every screen, no label cut short).

## 9. Style (added 22 November 2026)

At the owner's request, Settings → **Table** gains **Style: Material · Glass**, a segmented control above Tile colours. It switches the whole app between [STYLE.md](STYLE.md)'s direction A (Material, as in §7) and direction B (Glass, iOS 26).

| | Material | Glass |
|---|---|---|
| Floating chrome: the pill, the settings header, dialogs (dice, New game, discard) | Solid, as in §7 | Tinted glass ([GLASS.md](GLASS.md)'s recipe): the surface at 68% over `blur(18px) saturate(1.3)`, a 1px light edge and a top highlight |
| Settings header | Its own row above the body | Floats 8px in from the top and sides, rounded 22px; the body scrolls under it |
| Cards and rows | Filled rows on 24px cards | Grouped lists: rows share a 20px card, split by hairlines, with switches on the right edge |
| Segmented controls, dice picker | Accent fill on the chosen one | One track; the chosen segment or die is a neutral raised thumb (#707379, white text) |
| Switches | 36 × 20, outlined off, accent on | 40 × 24: a grey track (3.6:1 on the card) with a white thumb off; the accent with an ink thumb on |
| Sliders | 16px track, dot notches, 4px bar handle | 4px track, tick lines, a round white 28px thumb |
| Identity toggles | Accent ring | Light ring; the accent stays on the check |
| Map seats, swatches | 16px corners | 12px corners |
| Pressed | 10% layer | 10% layer and a shrink to 96% |
| Motion | 200ms emphasised easing | A 250ms spring with a gentle overshoot |

- **Unchanged in both:** the tiles, the life halves, the twelve tile palettes and Tile colours (a separate setting), chips, the Graphite + lime palette, the 2px accent focus ring and 44px targets.
- **The default:** until the player picks, the iOS app (WKWebView with the app's `game` message handler) starts on Glass, and Android and browsers on Material. A pick, including picking the default back, is saved in `game.style` at once and wins from then on. `loadGame()` keeps `style` only if it's `material` or `glass`; anything else, or a save from before the setting, means the platform's default.
- **Fallbacks to solid surfaces:**
  - no `backdrop-filter` (`@supports not`, for both the prefixed and unprefixed property);
  - `prefers-reduced-transparency: reduce`;
  - iOS Reduce Transparency, which WebKit doesn't expose as the media query: `LifePodApp.swift` injects `window.initialReduceTransparency` before the page loads and calls `window.setReduceTransparency(…)` on `UIAccessibility.reduceTransparencyStatusDidChangeNotification`; app.js sets `data-reduce-transparency` on `<html>`, which CSS treats like the media query;
  - `prefers-contrast: more`, which also gives each surface a 2px `--control-border` outline (5.3:1).
- **Reduced motion:** no transitions in either style, and Glass's presses don't shrink.
- **How it's built:** Glass is one block of token overrides, `[data-style="glass"]`, after Material's in `web/styles.css`; app.js sets `data-style` on `<html>`. Where Material hard-coded a value (row fill and spacing, the segment track, the dice pick, slider ticks, the header's place, the press scale, the backdrop filter, edge colours), it's now a token both styles set. The fallbacks are token overrides too. There are no per-style component rules.
- **Focus under the floating header:** the body's `scroll-padding-top` and the content's top padding both include the header's height (`--head-clear`), so the header can't cover the focused control (WCAG 2.4.11), and the life field still scrolls clear of the header and the keyboard.

Tests: `tests/style.test.mjs` (the default on the web, Android and iOS, the pick persisting and winning, Glass on the key surfaces, each fallback and reduced motion); `tests/native.test.mjs` (the Reduce Transparency bridge, in the contract and in WebKit); `tests/settings.test.mjs` (the header never covers focus and the life field, in both styles); `tests/sizes.test.mjs` and `tests/sizes-glass.test.mjs` (every screen, one style each). `node design/polish/final-review.mjs --sweep` sweeps both styles.

## 10. Badge size (added 22 November 2026)

At the owner's request, Settings → **Table** gains **Badge size: Default · Large · Larger**, a three-stop notched slider in the Tile colours slider's style, after Tile colours.

- **What it scales:** the near and far badge rows and the mana strip, their chips, counts, icons and the colour indicator, by 1.2 (Large) and 1.4 (Larger). Default is the size from before the setting. Mode cells (map seats, counter and mana cells, swatches, identity toggles) and totals stay as they are.
- **Room:** a row grows no taller than one row fits between its edge (or the pill's clearance) and the life total, its glyphs and the "Out" tag, on every tile (`measureBadgeRoom()` in app.js sets `--far-room` and `--near-room`), and never below the default. So on a small board a row may stay at the default size: at 568 × 320 with 6 players the far row has no room to grow.
- **Overflow:** the same order at every size (SPEC.md §3.2): names, then the symbol, then a second line, then smaller type down to 9px, or the type first where two lines would cover a total. A change of size fits the rows again from full size, as a new game does.
- **The strip:** its type scales, and its capsule grows from 32px toward its targets' 44px so the larger symbols stay inside it. Its targets stay 44px.
- **Saving:** it saves at once, like the switches, and isn't part of a pending new game. `badgeSize` is validated in `loadGame()`: anything but `default`, `large` or `larger`, or a save from before the setting, gets Default. app.js sets `data-badge-size` on `#board` for Large and Larger, and styles.css sets `--badge-scale` from it.
- Tests: `tests/badge-size.test.mjs` (the slider, saving and loading, what scales and what doesn't, every size fitting 2–6 players on the target and the stress size in both engines) and `tests/autodrop.test.mjs` (the overflow order at each size). `node design/polish/final-review.mjs --sweep` sweeps the board at rest, rotating and with reminders at Large and Larger.

## 11. New game in the header, and the design audit's fixes (added 23 November 2026)

From the owner's requests and [DESIGN-AUDIT.md](../../docs/review/DESIGN-AUDIT.md):

| Where | Change |
|---|---|
| **Header** | **New game** moves from the Game section's footer into the fixed header, beside Done (✕ · Settings · flip · New game · Done), so it's one tap from anywhere in settings. It hides while a players or life change is pending, when Done reads **Start new game** and starts it without asking (P1, as in §4). Under 400px wide, while New game shows, the "Settings" title is left to screen readers so the four buttons fit at 320px. Keep awake stays in the Game footer on its own. |
| **New game's confirmation** | `#restart` takes Discard's layout and style (S4), one `dialog.confirm` style for both: the title, a line ("For 4 players. This resets:"), a list of what resets, naming only what this game shows (life back to the starting life, counters and commander tax, commander damage, floating mana, turns back to round 1, the monarch and the initiative, colour identities, and "Tile colours, shuffled" when the shuffle is on), and what stays ("Settings, seats and tile colours stay."). The destructive **Start new game** is a secondary button in the danger tint (`--danger-fill`, `--danger-text`); **Cancel** is the primary and has focus, so Enter, Escape and back all cancel. The ✕ in its header goes. What a new game resets is SPEC.md §10.2. |
| **Table → Tile colours** | A segmented control in Style's pattern instead of the four-stop slider (S2): each segment shows a strip of its set's tiles for players 1–4 (panel and rim, written into styles.css by `design/polish/tiles7.mjs`) over its name. |
| **Table → Shuffle tile colours each game** | A wide switch row after Tile colours, off by default and saved at once in `game.shuffleColours` (`loadGame` keeps only exactly `true`). When on, each new game deals every player a random, distinct swatch, one per colour family (SPEC.md §10.2; TILES.md). |
| **Accent** | Row icons and section-title icons are soft text, not lime (S3); the accent stays on Done, switches that are on, the chosen segment and slider fills. |
| **Sliders** | At the minimum the fill is hidden (`data-min` on the track), so no sliver shows beside Material's bar handle (S9). |
| **Glass** | A group's last row has no hairline (a 1px cover in the card's colour, `--group-end`, whatever the columns or hidden rows), a row on its own has none, and the board actions are one full-width list (`--action-min: 100%`). Under 360px tall the header is a solid row, as in Material (`--head-overlay: 0`). The board's pill drops its blur and takes a 90% tint (`--pill-tint`); settings and the dialogs keep the blur (S10). Glass's spring is now only for press scale (`--ease-press`); fades and the switch thumb use Material's easing (N5). |
| **Scroll cue** | It shows only while content is below, not just the bottom padding, so it never sits over the last row (N6). |

Tests: `tests/new-game.test.mjs` (what a new game resets and keeps, the shuffle switch, and shuffled colours being distinct, one per family, random and from the crypto generator through a seeded stand-in), `tests/settings.test.mjs` (New game in the header, the confirmation's list and buttons, the Tile colours segments and their previews, the slider's minimum), `tests/style.test.mjs` (soft icons, Glass's group ends and actions, the inline header under 360px tall, the unblurred pill) and `tests/palette.test.mjs` (the default seats' spread).
