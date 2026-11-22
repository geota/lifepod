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
      section#settings-about     About
```

| Section | Contents, in order |
|---|---|
| **Game** | Players **[STYLE Q4]**; Starting life **[STYLE Q5]**; then a footer row with **New game** (secondary button) and **Keep awake** (switch row) side by side |
| **Track** | Six switch rows (Commander, Poison, Energy, Experience, Rad, Mana pool), two to a line; Turns (Off · Rounds · Turn by turn); "Empty mana pools when the turn passes", shown only while Mana pool is on and Turns isn't Off |
| **Identity** | Show on tiles (three compact switches: Indicator, Symbol, Name); Background (Symbol · Default · Off); the note line; **Choose identities** (board action) |
| **Table** | **Colours** and **Rotate seats** (board actions), side by side |
| **About** | Privacy and credits, today's text, in small muted type |

- Each section has a small caps title with its icon:
  - Game: Phosphor users-three;
  - Track: the flag;
  - Identity: Mana's colour pie;
  - Table: squares-four;
  - About: info.
- **The section card** (border, fill or neither) is **[STYLE Q1]**.

## 3. Layout

| Viewport | Layout |
|---|---|
| **Landscape, at least 620px wide** (952 × 427 target, 852 × 393, 1366 × 1024) | Two columns, each `minmax(0, 1fr)`, 12px apart, inside a container at most `min(1180px, 100%)` wide: Game and Table in the left column, Track and Identity in the right, About across both. Inside a column, each row stacks its label above its control. |
| **Under 620px wide** (568 × 320, 640 × 360 portrait-ish splits) | One column, in the order Game, Track, Identity, Table, About. Inside a section, labels sit beside their controls when the card is at least 480px wide, otherwise above. |
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

- Track switches, Turns, auto-empty, Show on tiles, Background and Keep awake save the moment they change, as today.
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
