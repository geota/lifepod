# Dice as a full page for the whole table, with a roll ledger and a coin

**Status:** built (26 November 2026), on main after 460e7fd (v0.1.0-alpha.19). The owner approved the table-facing design with four changes: tapping the die rolls it, Roll sits at the foot of the left column under the picker, the flip turns the whole page, and a coin joins the dice. The as-built notes are in §6. The mock-ups, the review page and the tools that make them are outside the repo.

The owner asked for Dice to be "full page like the settings and other pages instead of a popup", with "a small ledger that keeps track of rolls. So can look back at other rolls". Then they set the direction: **landscape and table-facing, not like the settings page**, because the whole table uses the dice mid-game, rather than one person setting up. The ledger may face just one side.

## Recommendation

Make Dice a full-screen page that lies the way the board does, in three columns. **The die is at the centre of the phone**, and its result is printed for both long sides of the table; a tap on it rolls it. **The six dice, the coin and Roll** are on the left, the picker together above Roll at the foot of the column. **The ledger** is on the right: one card of the last 50 rolls, newest first, which faces the near side. The flip turns the whole page for the far side, as settings' flip does. With two players, who sit at the short ends, the die and its result face each end instead.

## 1. Layout

- **In the board's frame.** The page's frame takes the board's turn, the same `data-board-turn` as `.app`, copied to `#dice` as `data-turn`. So with the phone stood upright the page stays landscape like the board, and every side of it stays with the side of the table it faces. Because the frame can be turned, the layout reads its own size through container queries (`dice-page`), not viewport media queries. Each pair of opposite edges keeps the larger of its two safe-area insets, so the die stays centred.
- **No header bar.** A title bar is laid out for one reader. ✕ sits alone in the top-left corner, and "Dice" stays as a visually hidden `<h2>` for `aria-labelledby`.
- **The columns:** `side | stage | side`. Both side columns are `clamp(188px, 28%, 300px)` wide (`clamp(260px, 28%, 380px)` on tablets), so the die lands at the centre of the phone, where the pill was. 188px is four 44px choices and their gaps.
  - **Left:** ✕ at the top, then the picker together above Roll at the foot. The picker is **four over three**: d4, d6, d8 and d10, then d12, d20 and the coin, each row filling the column (a 12-column grid: the first four span three, the last three span four). Each choice has its icon over its label, at least 44px wide and 52px (small phones), 60px (phones) or 76px (tablets) tall, with the chosen one in the L3 lime tint. Roll is the solid-lime primary, 52–64px tall, labelled "Roll d20" or "Flip coin".
  - **Centre:** the stage, a card-coloured well and a button: a tap on the die rolls it. The die is `min(80%, 60%)` of the stage's width and height. Its own face shows the result toward the near side. **The result is printed again at both long edges**, at 13% of the stage's smaller side: upright for the near side, and turned 180° for the far side. Screen readers hear the result once, from `#dice-result`.
  - **Right:** the Rolls card (§2).
- **Two players** sit at the opposite short ends, so the die and both copies of the result turn a quarter: one copy faces each end, and the die's face goes with the left one. The turn uses the CSS `rotate` property, which leaves the roll's `transform` animation alone. The die is then `min(60%, 80%)` of the stage's width and height. The picker and Roll stay facing the near long side, since their labels are short and the dice are told apart by shape and colour.
- **Sizes:**

  | Screen | Stage | Die | Side columns |
  |---|---|---|---|
  | 952 × 427 (the target, Pixel 11 Pro) | 396 × 411 | 247px | 262px |
  | 852 × 393 | 352 × 377 | 226px | 234px |
  | 640 × 360 | 232 × 344 | 186px | 188px |
  | 568 × 320 | 160 × 304 | 128px | 188px |
  | iPad, 1366 × 1024 | 555 × 992 | 444px | 374px |

  A phone stood upright (393 × 852, 320 × 568) turns with the board and gets the landscape layout of its long side. The page never scrolls; only the ledger's list does.
- **Both styles** come from the tokens. Glass gets its grouped rows split by hairlines, and Material its filled rows. With no header there's no glass layer; the cards and controls stay solid, as in both styles' settings cards.
- **44px targets everywhere:** ✕ and the flip are 44px, the choices at least 44 × 52 and Roll at least 52px tall. Ledger rows aren't controls.
- **Text size:** the page's type grows with the system text size only to 130%, because the page doesn't scroll: past that the choices' labels and the ledger's rows would no longer fit.

## 2. The ledger

- **Its form:** one Rolls card that reads from one side (the owner's call), in the right-hand column, always on screen. The other options:
  - (a) a strip of result chips in the middle: drops the time and shows only about six rolls;
  - (b) a ledger split between the two sides: dropped by the owner;
  - (c) a panel that opens on demand: hides the history behind a tap.
  The always-on card is the simplest of these, and the page's flip covers the far side.
- **The heading** reads "ROLLS", then the count, then the flip (a 44px button), which turns **the whole page** 180° to face the far side, like settings' flip, and resets each time the page opens.
  - With two players, the card turns a quarter to face the right-hand end wherever its column is at least 240px wide (952 × 427 and up), and the page's flip then turns it, with everything else, to the left-hand end.
  - On small phones it stays facing the near long side, because turned it would show only two rows.
- **A row** has the die's small icon in its colour, "d20" in soft text, the result in heavy tabular figures (20px), and the time in History's words ("just now", "2 min ago", "1 h ago", and "1 d ago" for a roll kept from another day). A coin flip reads "Coin · Heads · just now", and the result's column widens for Heads and Tails while the list holds a flip. The newest row is a tone above the others (`--raised` mixed with 6% text, so it shows in Material too), not lime.
  - Where the card is narrower than 220px (small phones), the die's name sits over the time, with the result on the right.
  - The empty card reads "No rolls yet this game. Each roll shows here, newest first."
- **Rules (decided by the owner):**
  - The ledger keeps the rolls of the current game, saved with the game so they survive an app restart.
  - **New game clears it.** The die last picked stays.
  - It keeps the **last 50** rolls, and the 51st drops the oldest.
  - Rolls never make an undo step and don't show in History.
  - New game's confirmation lists "Dice rolls" among what it resets while there are any. Undoing a New game doesn't bring the rolls back, because they aren't game state.
  - There's no Clear button: New game clears it.
- **Accessibility:** an `<ol aria-label="Rolls, newest first">` under the card's `<h3>`. Each row reads "17 on a d20, 2 minutes ago", or "Coin: Heads, just now". The list isn't a live region, because `#dice-result` already announces "Rolled 17 on a d20" or "Coin: Heads" once. The rows aren't buttons. The flip is `aria-pressed`, named "Turn dice to face the other side".
- **Not included:** who rolled or whose turn it was (the page can't know, and the active player is often the wrong guess), and copy or share.

## 3. Behaviour

- **The row appears when the die lands**, in `onLand`, so the list never gives the result away first.
- **Rolling scrolls the list to the top.** The new row slides in from 8px above over 200ms, and appears in place under reduced motion.
- **Roll with one tap:** a tap on the die or on Roll rolls at once, and taps during a roll are ignored, as before. The stage is a `<button>` named like Roll ("Roll d20", "Flip coin"), so it takes Enter and Space too.
- **Haptics:** one when the die lands. **Reduced motion:** the 250ms fade roll, for the coin too.
- **The times** refresh every 30 seconds while the page is open, and when it opens.
- **Back and Escape** close the page (`showDialog`, `syncBackHandling`; SPEC §10.3's order doesn't change), and so does ✕. The pill's d20 opens it. Focus starts on Roll, and goes back to the d20 when the page closes.
- **The last die is remembered** (`dice.sides`), the coin included, so the page opens on the die picked last.

## 4. The coin

A seventh choice, after the d20, because coin-flip cards are the one other random thing Magic needs.

- **Its shape** follows the dice: a round front face inside a bevelled rim, lit from the upper left, the rim's lit half in the first side tone and its far half in the third (as on the d6), with a fine ring inside the rim. It's silver, a hue none of the six dice use: `--die-front` `#e6e8eb` with ink at 13.6:1 and the quieter "Coin" label at 5.0:1. The picker's icon is the same coin without the ring.
- **Its face** reads "Coin" before a flip, then "Heads" or "Tails", and both edges of the stage print the word as they print a number.
- **The flip:** the coin rises and falls back over the tumble's 720ms, landing at 78%, while it turns end over end, drawn as its height squashing to an edge and back: seven half turns, slowing as it comes down. Its face changes each time it's edge-on, ending on the result as it lands. The shadow stays on the table, shrinking and fading while the coin is up. Only transforms and opacity move. Under reduced motion it fades like the dice.
- **The result** comes from the same `crypto.getRandomValues` draw as the dice, `randomFace(2)`: 1 is Heads and 2 is Tails. It's announced "Coin: Heads".

## 5. Save format and code

`game.dice = { sides, rolls }` goes in `settingsFields` (not `historyFields`), so it makes no undo step.

| Field | Type | Default | `loadGame` (`fitDice`) |
|---|---|---|---|
| `dice.sides` | 4, 6, 8, 10, 12, 20, or 2 for the coin | 20 | anything else is 20 |
| `dice.rolls` | oldest first, each `{ d, r, t }`: sides (2 is the coin), a whole result from 1 to `d` (on the coin, 1 is Heads and 2 is Tails), and whole Unix seconds | `[]` | not an array gives `[]`. Each entry that doesn't fit is dropped, extra keys go, and only the newest 50 are kept. |

A save from before this change has no `dice`, so it loads with an empty ledger and the d20.

The code:

- `index.html`: `#dice` is `class="fs"`, with a `.dice-frame` (turned with the board) around a `.dice-layout` grid: the side column (✕, picker, Roll), the stage button and the Rolls card. The ids stay.
- `css/dice.css`: the page layout (the turned frame, the three columns, the container queries, the two-player quarter turns), the ledger rows, and the coin's colours. The flip is settings' `dialog.fs[data-flipped]`.
- `dice.js`: the coin's geometry, its flip and `label(count, value)`, and `coin` (2) beside `sides`.
- `js/sheets/dice.js`: `onLand` pushes the roll, caps the list, calls `saveGame()`, renders the list and scrolls it to the top. The page renders the list when it opens and keeps the 30-second timer while it's open, copies `data-board-turn` from `.app` (following it while open), sets `data-ends` with two players, keeps both copies of the result, and saves `sides` when a die is picked.
- `logic/data.js`: `diceSides`, `coinSides`, `diceChoices` and `diceLedgerCap = 50`, and `'dice'` in `settingsFields`. A test checks that `diceSides` and `coinSides` match `window.lifePodDice`.
- `logic/save.js`: the `Game`, `Dice` and `Roll` typedefs and `fitDice`. `startGame` empties `dice.rolls` and keeps `sides`. The settings page's `resetList()` adds "Dice rolls" while there are any.
- Tests: the validator and generator in `tests/logic.test.mjs` and a `fitDice` test; in `tests/dice.test.mjs`, in both engines: a roll joins the ledger as it lands, newest first, the cap of 50, the ledger across `reload`, New game empties it, no undo step, the coin's result and announcement, the last die remembered, the flip, a tap on the die and Enter and Space on it, the coin's flip and its reduced-motion fade, and the page's layout (the die centred, 44px targets, nothing scrolls) at nine sizes in landscape and portrait, both styles, with 4 and 2 players.

## 6. As built

- **The owner's changes to the table-facing proposal:** the die is a roll target (the stage is a button named like Roll); Roll sits at the foot of the left column, under the picker, rather than on the middle line between two rows of dice; the flip turns the whole page (`data-flipped`, as settings), so the ledger's own `data-rolls-flipped` is gone; and the coin is a seventh choice.
- **Side columns of at least 188px**, not 156px: four choices at 44px across need it. At 568 × 320 that leaves a 160px stage and a 128px die.
- **The die** is `min(80cqw, 60cqh)` of the stage (247px on the target, against the proposal's 230px), so a tall, narrow stage on a small phone still gets a large die.
- **Text size** grows on this page only to 130% (§1).
- **New game clears the ledger**; there's no "New game" divider in the list. An undone New game doesn't bring the rolls back.

## Questions for the owner (answered)

- *The ledger across restarts:* kept with the game; New game clears it; 50 rolls.
- *Remember the last die picked:* yes, the coin included.
- *With two players, which end does the ledger face first:* the right-hand end, and the page's flip turns everything to the left.
- *A coin, a d100 or two dice at once:* the coin, as a seventh choice (§4). No d100 or multiple dice.
- *Show whose turn a roll was on:* no.
- *A flip button:* yes, and it turns the whole page.
- *A Clear button:* no.
