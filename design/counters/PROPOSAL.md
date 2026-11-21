# Commander, poison and player colours: design proposal

**Status:** design complete, ready to build. Where the text below disagrees with the decisions, the decisions win.

## Decisions (20 November 2026)

- **Colour identity is separate from tile colour.** Players often share colours, so identity never changes the tile. It shows as small coloured dots in a row on the tile. Tile colour is its own choice.
- **Commander is a separate switch**, not tied to 40 life. It is saved, so it stays on across launches and new games until it's turned off. The same goes for Poison.
- **No partners.** One commander per player.
- **Badge row placement is undecided.** Mock both the far edge and the near edge.
- **Tax shows the extra cost.** Each tap adds one cast, which adds 2 to the cost shown (+2, +4, +6).

## Decisions from the design review (20 November 2026)

These replace anything below that disagrees. The mock-ups behind them are in `OPTIONS.md`, and the research is in `RESEARCH.md`.

- **Commander damage entry is the table map (option D).**
  - The sword turns every tile into a map of the table.
  - The player who was hit taps the attacker's seat: +1 commander damage and −1 life, in one save.
  - Holding a seat takes 1 away, then keeps repeating while held, like holding − or +.
  - Your own seat shows your life with the change, for example "28 −6".
- **The centre controls during commander damage mode and counters mode are Undo · ✓ · ✕** (round 3). ✓ is filled and sits in the middle, where the old check was.
  - Undo uses Phosphor's counter-clockwise arrow. It stays dimmed until something changes.
  - ✓ saves without asking.
  - ✕ discards every change made in the mode, after an in-app confirmation.
  - Undo steps back through each change, like Ctrl-Z.
  - ✕ with no changes closes straight away. With changes it asks, for example, "Discard 6 changes?", and Keep editing is the default.
  - Seat rotation keeps its single ✓.
- **Commander damage is always linked to life.** There is no infect or toxic handling: players add poison by hand and fix life by hand for infect.
- **The mode stays open until ✓ or ✕.**
- **Badge rows:**
  - The far edge, toward the table, holds commander damage only.
  - The near edge holds poison, colour identity and tax.
  - The rows are display-only, and each appears only when it has something to show.
- **Warnings:** amber tinted text from 15 commander damage or 7 poison. At 21 or 10, red text, a thin red ring and a red life total. There is no reason line.
- **Poison icon:** Phosphor flask, with no tint.
- **Counters mode:** each tile shows a poison row and a tax row, each laid out as − symbol count +. Tax + adds a cast, which raises the tax by 2.
  - Holding − or + repeats, like the life buttons.
  - A palette button opens colour and identity in a sheet facing that player.
- **Tile colours:** nine swatches: today's six, plus Rose, Indigo and Slate.
  - **No two players can have the same colour.** A swatch another player is using can't be chosen.
- **Setup:** a Counters group with Commander and Poison switches, saved across launches.
- **The centre pill** has four buttons: sword, counters, dice and setup.
- **Setting colours:** a Colours button in Game setup, next to Rotate seats, opens a board mode. Each tile shows its nine swatches, facing its player, so everyone picks at once, and ✓ ends it. This works whether or not the switches are on. With Commander on, the counters-mode palette button also opens colour and identity.

## Decisions from round 4 (21 November 2026)

These follow feedback on v0.1.0-alpha.9. The mock-ups are in OPTIONS.md, Round 4.

- **Map seats (C):** at 0, a seat is the attacker's panel colour inside a 2px ring in their seat colour. Once it has damage, it fills solid with the seat colour. No transparency anywhere.
- **Taken swatches (B):** full colour, with the owner ("P2") in place of the seat dot. No transparency.
- **Sword (S1):** a sword in its own circle starts the far (commander damage) badge row.
- **Pips (a):** the same thin light ring on every pip. Unchosen identity toggles show at full colour.
- **Colour identity is any combination of W U B R G.** Colourless (C) is removed, so a colourless commander has no identity set. The white pip must read as white, not grey.
- **Game setup** must fit without scrolling on a landscape phone about 427px tall, such as a Pixel 10 Pro.

## Goals

- Nothing new shows on the board until a game uses it. A plain 20-life game looks exactly as it does today, and players who keep counters on dice never see these features.
- Every count can be changed from the tile, in the player's own orientation. A centre sheet faces only one side of the table.
- Commander damage takes as few taps as possible: one tap per point of damage once a combat is set up, with life updated at the same time.
- Reuse what players already know. Each tile's left half is −, its right half is +, and the centre pill holds the board controls. Board-wide modes (seat rotation is the existing one) end with the ✓ in the centre.

## Rules this has to model

These come from the Magic Comprehensive Rules, checked against the current rules before building.

| Counter | Rule | What it means for the app |
|---|---|---|
| Commander damage | CR 903.10a: a player dealt 21 or more **combat** damage by the **same commander** over the game loses. | Track it per defender, per commander, not as one total per player. It is damage, so the defender also loses that much life. Only combat damage counts, so it is entered on purpose and is never inferred from life changes. |
| Whose commander | Commander damage follows the commander card, whoever controls it. | When choosing the attacker, the question is "whose commander?" (its owner), even if another player has taken control of it. |
| Partners | Two partner commanders are tracked separately: 21 from one of them, not 21 combined. | Out of scope: one commander per player. |
| Infect | Damage from a commander with infect still counts as commander damage, but it gives poison counters instead of causing life loss. | Rare. The first version leaves it to manual life and poison corrections. |
| Poison | CR 704.5c: a player with 10 or more poison counters loses. | One number per player, with no link to who gave it. |
| Commander tax | CR 903.8: casting a commander from the command zone costs {2} more for each previous time it was cast from there. | One count per player. Each tap adds one cast, and the tile shows the extra cost: +2, +4, +6. |

## Turning features on

Setup gets one new group, **Counters**, with two switches, both off by default:

- **Commander:** commander damage and commander tax.
- **Poison.**

They are separate because poison turns up outside Commander, and some tables track commander damage in the app but poison on dice. Both switches are saved, so they stay on across launches. Starting a new game resets every count and keeps the switches, tile colours and colour identities.

## The board at rest: badges only when a count is above zero

A thin row along the **far edge** of each tile, the top as its player reads it, shows only the counts that are above zero:

```
┌──────────────────────────────┐
│ ●6  ●12        ☠3   ♛+4      │  ← only counts above zero
│                              │
│      −        34        +    │
│                              │
└──────────────────────────────┘
```

- **Commander damage:** a dot in the attacking player's tile colour, then the amount. There is one chip per opponent who has dealt damage, sorted by amount, with the most first.
- **Poison:** an icon and the count. The icon is a Phosphor icon (skull or drop, to be chosen).
- **Tax:** a crown and the extra cost (+2 per cast).
- **Colour identity:** small coloured dots (W U B R G, or grey for colourless), first in the row. They show only when the player has set an identity.
- **Close to losing:** a chip turns amber at 15 and up for commander damage and 7 and up for poison. It turns the same red as a life total at 0 when it reaches the losing amount (21 or 10), and the tile's life total turns red too, because the player is out.

The chips are information only, not buttons, so they never take a tap meant for − or +.

## Commander damage mode

This is a new button in the centre pill: a sword, shown only when Commander is on.

1. **Tap the sword.** The board asks "Whose commander?"
   - Each tile dims slightly and shows the prompt in its own orientation.
   - The pill's sword becomes ✓.
2. **Tap the attacking player's tile.** That tile lights up in its colour and reads "Attacking". Every other tile switches to commander damage from that attacker:
   - The large number becomes the damage from that commander, for example 6. Life moves to a smaller number underneath, for example "34 life".
   - The halves keep their sides: + adds 1 commander damage **and** subtracts 1 life, and − undoes one point.
   - Holding repeats, as it does for life.
   - A small dot in the attacker's colour sits next to the number, so it is clear whose damage is being counted.
3. **Tap + on each player who was hit.** Several defenders can be hit in one combat without leaving the mode.
4. **Tap ✓, or the attacker's tile again, to finish.** Tapping the attacker again goes back to "Whose commander?" so a second attacker can deal damage without leaving the mode.

Taps for 6 damage to one player: sword, attacker, six taps of + (or a hold), ✓. That is 9 taps, and 3 of them set up the mode.

Your idea was to pick the attacker, then the defender, then add damage. This version drops the step of choosing a defender, because every opponent gets a stepper at once. It also handles one combat that damages several players.

The 21-damage threshold shows as the chip and life total turning red, as described above. Nothing pops up, because the players decide what happens next.

Screen reader announcements, for example: "Player 2's commander, 6 damage to Player 3. Player 3, 34 life."

## Counters mode: poison, tax and colour

This is a second new pill button (a stack or tally icon), shown only when Poison or Commander is on. Each tile flips to a small counter panel in its own orientation, and the pill shows ✓:

```
┌──────────────────────────────┐
│  ☠ Poison     −   3   +      │   shown when Poison is on
│  ♛ Cast       −   2   +  +4  │   shown when Commander is on
│  ● ● ● ● ● ●   W U B R G C   │   colour row
└──────────────────────────────┘
```

- **Steppers:** each has 48px targets. Holding does not repeat here, because these counts are small.
- **Commander tax:** the count is how many times the commander has been cast, and the extra cost (+4) is shown beside it.
- **Commander damage:** is not edited here. Commander damage mode is the only way in, so every change goes through the linked life change. The panel does list the damage taken from each commander for reference.

Poison takes three taps: Counters, +, ✓. That's fine for something that changes less often than life.

## Tile colour and colour identity

These are two separate choices, both in the counters panel.

**Tile colour:** a strip of 12 swatches.

- Each swatch is a full tile palette: panel, rim, seat colour and button.
- They are generated in OKLCH at the current palettes' lightness, the same way the dice ramps were, so every option keeps the life total, the −/+ buttons and the pressed state readable.
- Today's six seat palettes are the first six.
- A free colour wheel is left out on purpose. Arbitrary colours can make the life total or pressed buttons unreadable, and fixed hues are faster to tap.
- Two players may pick the same colour. The top row stays lighter and the bottom row darker, so neighbouring tiles still differ for colour-blind players.

**Colour identity:** five toggles, W U B R G, plus C for colourless.

- They never change the tile colour.
- The chosen colours show as small dots in the badge row, in W U B R G order.
- When the panel is closed and no identity is set, nothing shows.

### Mana symbols: use our own pips

The Fan Content Policy (last updated 15 November 2017) lists the mana symbols image among the trademarks that need **prior written permission**. It doesn't clearly cover apps either; it names art, videos, podcasts, blogs, websites and streams. Wizards can also withdraw permission at any time.

So:

- Draw our own pips: plain filled circles in the five colours (white, blue, black, red, green, and grey for colourless) with a thin rim, and no sun, drop, skull, flame or tree glyphs. Those motifs are what the trademarked symbols depict, so leave them out.
- Use generic game terms such as commander, poison and tax. Don't use Wizards logos, card art, set symbols or "Magic: The Gathering" in the app's UI.

If you want the real symbols, the way to get them is written permission from Wizards. The Fan Content Policy alone isn't enough for them. This isn't legal advice, but avoiding the trademarks costs us very little.

## Data model

New saved fields, checked in `loadGame` the same way `rotations` is. Unknown or malformed values fall back to empty:

```js
{
  counters: { commander: false, poison: false },
  // commanderDamage[defender][attacker]
  commanderDamage: [[0, 0, 0, 0], …],
  poison: [0, 0, 0, 0],
  casts: [0, 0, 0, 0],          // tax shown is 2 × casts
  colors: [null, …],            // swatch index; null means the seat default
  identities: ['', …],          // like 'UB' or 'C'
}
```

- Changing the player count resizes these arrays.
- A new game zeroes the counts and keeps `counters`, `colors` and `identities`.
- A commander damage + changes `commanderDamage` and `scores` in one save, so the two can't drift apart.

## Build order

Each step ships on its own:

1. Tile colours and identity dots. These are independent and the easiest to try at the table.
2. Counters setup switches, poison, and the counters panel.
3. Commander damage mode and its badges.
4. Commander tax.
5. Later, if wanted: infect. Partners are out of scope.

## Open questions

- Should the badge row sit on the far edge or the near edge? Mock-ups of both are coming from the design session.
