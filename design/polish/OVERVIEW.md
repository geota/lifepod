# Polish round: usability walk-through and button sizes

21 November 2026. I walked the app (`web/index.html` from d129917 to 2f28705) in Playwright at 852×393 (phone), 640×360 (smallest real phone, landscape) and 1366×1024 (tablet), with 2–6 players and Commander and Poison on. The decisions in [PROPOSAL.md](../counters/PROPOSAL.md) stand unless noted. The options to pick from are in [OPTIONS.md](OPTIONS.md), and the policy research is in [RESEARCH.md](RESEARCH.md).

Re-run the measurements with `node design/polish/measure.mjs [screenshot-folder]`.

---

## 1. Flows

| Flow | Taps today | Verdict |
|---|---|---|
| First launch | 0. Four players at 40, Commander off. | Fine. A Commander table needs Setup → Commander → Done (3 taps), once ever, because the switch is saved. |
| New game, same settings | Setup → New game → Start new game (3) | Fine. The confirmation defaults to cancel. |
| Player count or starting life | Setup → choice → Start new game (3) | Fine. The button relabelling from Done to "Start new game" is clear. |
| Custom starting life | Setup → text field → keyboard → Start new game | The keyboard covers most of the sheet on a landscape phone. Rare, so low. |
| Life ±1 / large swing | 1 tap per point. A hold repeats after 0.5s at 10 per second. | Excellent. A 20-point swing takes about 2.4s of holding. |
| Commander damage, 6 from one opponent | Sword → hold the seat (or tap 6×) → ✓ (3 to 8) | Good. "Tap +1 · hold −1" is on every tile. |
| Poison or tax +1 | Counters → + → ✓ (3) | Fine for something that changes rarely. Five counters don't fit as stepper rows (OPTIONS §2K). |
| Tile colour and identity | Setup → Colours → pick → ✓ (4+) | Fine. Everyone picks at once, facing themselves. |
| Rotate seats | Setup → Rotate seats → tap tile(s) → ✓ | Clockwise only, so an over-rotation costs 3 more taps. Rare. |
| Dice | Dice → Roll (or tap the die) → ✕ (3) | Works, but the sheet and the die face one side of the table only. |
| Undo / cancel in a mode | Undo per step. ✕ asks "Discard N changes?" and defaults to Keep editing. | Good. |
| Android back | Closes the open dialog, then leaves a mode the way ✕ does. At rest the system handles it and the app goes to the background. | Good. The game is saved, so leaving by accident costs nothing. |
| Who goes first, turn number, floating mana | Not supported | See OPTIONS §5 and §6. |

## 2. Friction, by severity

### High

**H1. With 2 or 3 players, the centre pill covered the commander damage row.** Sideways tiles (both tiles at 2 players, P3 at 3) have their far edge at the board's centre, so their far badge row sat under the pill.

- **Fixed in 2f28705.** I re-checked every count from 2 to 6 players at four screen sizes, and nothing is covered now.

### Medium

**M1. Two players on a phone get a small total.** The total is capped at 19% of the screen's short side, so it's 75px in a 425px tile.

- **Fix (quick):** let it grow to 38% of a tall tile's height, but never below today's size. That gives 160px at 2 players and 160px or 107px on the end seat at 3 or 5 players, and leaves 4 and 6 players unchanged at every size (OPTIONS Z2).

**M2. Nothing says the whole half is the target.** The bordered button suggests you have to hit it. The owner found out by accident.

- **Fix:** the button style (OPTIONS §3, direction B).

**M3. The board doesn't show a recent change.** After a hold, or when someone across the table taps, others can't see what happened (−6? −7?). The commander map already shows "28 −6"; the board at rest doesn't.

- **Fix (bigger):** show the running change ("−6") small beside the total while taps keep coming, and fade it about 2s after the last one. It needs a design pass.

**M4. Setup has no room for more switches on a landscape phone.** Energy, Experience, Rad, Turns and Mana pool would join Commander and Poison: seven trackers. Inline, they push the sheet past 393px.

- **Fix:** a Track row that opens its own sheet keeps setup at today's 354px (OPTIONS §2S, option S2).

### Low

**L1. Counter steppers are only their button.** At 6 players on a phone that's exactly 44×44, below Android's 48dp. With five counters they no longer fit at all.

- **Fix:** tap +1 / hold −1 cells, like the map (OPTIONS §2K, option K3). The smallest is 64×61.

**L2. The pill doesn't grow on tablets.** It's 48px everywhere (36px visible) on a 13-inch screen.

- **Fix (quick):** scale it with `--grow` up to 64px (OPTIONS Z1).

**L3. The dice sheet faces one side.** Players on the far side read the result upside down.

- **Fix (bigger):** print the rolled number again, turned 180°, at the far edge of the stage. Or leave it: one person usually rolls.

**L4. Colour identities carry over to every new game.** That's right for the same decks, but stale when people switch.

- **Fix (quick):** add a "Keep colour identities" checkbox to the New game confirmation, ticked by default.

**L5. Hold repeat is linear.** It's fine up to 20 points. A 40-point lifegain takes 4.4s.

- **Fix (optional):** after 2s of holding, step by 5. Overshoot is easy to correct with a tap.

**L6. The counters button icon (stacked layers) doesn't suggest poison or tax.**

- **Fix (optional):** use the flask when only Poison is on. Otherwise, leave it.

**L7. Rotate seats turns clockwise only.**

- **Fix (optional):** hold a tile to turn it back. It's rare enough to leave alone.

### Quick wins vs bigger changes

- **Quick wins (CSS or a few lines each):** M1, L2, L4. The button style (M2) is mostly CSS too.
- **Bigger changes:** M3 (recent change), L3 (dice), the counters layout and Track sheet (M4, L1), turn tracking and floating mana (OPTIONS §5–6).

---

## 3. Button sizes

### Measured (CSS px, smallest – largest on the board)

| Screen | − / + drawn | − / + touch half | Life type | Pill button | Map seat | Counter stepper | Swatch / toggle | Setup controls | Dice picker |
|---|---|---|---|---|---|---|---|---|---|
| Phone 852×393, 2p | 71×57 | 197×425 | 75 | 48×48 | 120×78 | 55×44 | 60×60 | 47×44 min | 84×48 |
| Phone, 4p | 74×57 | 213×196 | 75 | 48×48 | 118×69 | 60×44 | 44×44 | 47×44 | 84×48 |
| Phone, 6p | 51×44 | 142×196 | 75 | 48×48 | 88×69 | 44×44 | 44×44 | 47×44 | 84×48 |
| Small 640×360, 2p | 65×54 | 180×319 | 68 | 48×48 | 120×78 | 50×44 | 60×60 | 47×44 | 79×48 |
| Small, 4p | 57×48 | 160×179 | 68 | 48×48 | 118×61 | 45×44 | 44×44 | 47×44 | 79×48 |
| Small, 6p | 44×44 | 106×179 | 68 | 48×48 | 64×73 | **44×44** | **44×44** | 47×44 | 79×48 |
| Tablet 1366×1024, 2p | 148×114 | 512×682 | 195 | **48×48** | 240×158 | 120×88 | 120×120 | 71×44 | 84×48 |
| Tablet, 4p | 123×102 | 341×511 | 195 | **48×48** | 238×158 | 95×68 | 120×120 | 71×44 | 84×48 |
| Tablet, 6p | 82×68 | 227×511 | 191 | **48×48** | 145×158 | 64×45 | 83×83 | 71×44 | 84×48 |

Switch rows are 44px tall, and the whole label is the target. [renders/size-targets.png](renders/size-targets.png) draws the touch areas on the real layout.

### Against the guidance

Apple asks for 44×44pt, Android for 48×48dp, WCAG AA for 24px and AAA for 44px ([RESEARCH §2](RESEARCH.md#2-touch-target-guidance)).

- **Life − / +:** the real target is the half tile, 106×179 at its smallest, 2–4× Android's minimum in each direction. **Don't make the drawn buttons bigger.** Make it obvious that the half is the target (§3 in OPTIONS).
- **Map seats:** 64×73 at the smallest. Fine.
- **Counter steppers:** 44×44 at 6 players on phones. That meets Apple but not Android, and five rows don't fit. **Recommend tap/hold cells** (K3): at least 64×61 with all five counters on.
- **Pill:** 48×48 meets both on phones. On a tablet it's the one control that doesn't scale. **Recommend growing it to 64px** (Z1).
- **Swatches and identity toggles:** 44 on phones. They're used once per game with no time pressure, so **keep them**.
- **Setup and dice:** 44–48 tall, and they don't scale on tablets. That's fine: one person uses them, close up.
- **Life type:** fine everywhere except tall tiles: 2 players, and the end seat at 3 and 5 players (M1, Z2).
