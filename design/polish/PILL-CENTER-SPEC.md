# The round near the pill's centre, Undo on a flank: design spec

**Status:** proposal with option A built in its own commit (§6), 26 November 2026, against main `460e7fd` (v0.1.0-alpha.19) plus the Treasure-strip and centred-delta commits.

- The mocks are drawn on the real app by `design/polish/pill-center.mjs`: Playwright with `bypassCSP`, over the page `scripts/serve.mjs` serves. A mock only moves the pill's buttons in the DOM (and, for option B, shifts the pill). Which buttons show, Track, the 44px fallback and the tiles' clearances are the app's own. The images are `pill/<option>-<view>-<style>.png` on the review page (`polish-19/index.html` in the session's scratchpad).
- Every figure below was measured on those mocks in Chromium, in both styles (they match to the pixel: the styles change the pill's look, not its geometry).

**The owner's words:**

> "It would be nice if the turn number was what was centred and the undo button on one of the flanks."

And, on the first question back: the turn number **doesn't need to be exactly centred, just near the centre**, with Undo on a flank.

## 1. Today

At rest the pill reads **round · (damage · counters · mana | Track) · Undo · magnifier · d20 · settings**, and in an editing mode **[Track's tabs] · Undo · ✓ · ✕**. The round leads, so it sits at the pill's end: 120px from the seam's centre on the 2-player Track pill at 568 × 320, 168px on the 8-button pill at 952 × 427, 224px on the iPad. Undo is in the middle of the pill.

The pill is centred on its seam (`placePill` in `layout/board.js`), and Track's fit (`pillFit`) asks only whether the widest pill fits the seam's length, centred. Neither depends on the order of the buttons.

## 2. The options at a glance

| | **A. Round in the middle, Undo leads** (recommended, built) | A′. Round in the middle, Undo ends the tools | B. Round exactly on the seam's centre |
|---|---|---|---|
| At rest | **Undo · modes (or Track) · round · magnifier · d20 · settings** | modes (or Track) · round · magnifier · d20 · settings · Undo | As A, with the pill moved so the round sits on the centre |
| In a mode | **Undo · [tabs] · ✓ · ✕** | [tabs] · Undo · ✓ · ✕ (today's) | As A |
| The pill's centre | On the seam, as today | On the seam | Off the seam by half a button per button of imbalance |
| The round's distance from the seam's centre | 0 or half a button | Up to one and a half buttons | 0 |
| Track's fit and the 44px fallback | Unchanged: the same count, centred | Unchanged | **Broken at 568 × 320:** the 2-player Track pill passes its seam by 12px, so it would need 44px buttons where today it has 48px |
| Tiles' clearances | Unchanged | Unchanged | Asymmetric: one side's tiles lose more of their faces |

## 3. Option A: the round in the middle, Undo leading (recommended)

*Mocks: `A-568x320-2p`, `A-568x320-2p-track`, `A-952x427-4p`, `A-952x427-4p-commander`, `A-952x427-4p-mode`, `A-952x427-6p`, `A-ipad-4p`, each in both styles; today's as `today-…`.*

- **The order:** Undo leads one flank, then the game's modes (commander damage, counters, mana, or Track where the pill collapses), then the **round**, then the tools: card lookup, the d20 and settings. The modes and the tools are the two flanks; the round sits between them.
- **The pill stays centred on its seam,** so the round lands exactly on the centre when the two flanks have the same count, and half a button off when they differ by one. No count leaves it further than half a button off.
- **In a mode:** **Undo · [Track's tabs] · ✓ · ✕**. Undo keeps its end of the pill at rest and in every mode, so a thumb finds it in one place; Track's tabs open where Track was, between Undo and ✓. Without tabs it's **Undo · ✓ · ✕**, today's, with ✓ exactly in the middle where the round was.
- **"Who goes first?"** keeps shuffle · ✕; the rotate, colours and identity modes keep their lone Done disc.

### 3.1 Where the round sits, measured

| Board | Pill at rest | Buttons per flank | The round from the seam's centre |
|---|---|---|---|
| **568 × 320, 2 players** (Track, upright) | Undo · Track · **round** · magnifier · d20 · settings | 2 │ 3 | 24px toward Undo's end (was 120px) |
| **952 × 427, 4 or 6 players**, everything on (separate buttons) | Undo · damage · counters · mana · **round** · magnifier · d20 · settings | 4 │ 3 | 24px toward the tools (was 168px) |
| 952 × 427, Commander only (damage and counters) | Undo · damage · counters · **round** · magnifier · d20 · settings | 3 │ 3 | **0px** (was 144px) |
| **iPad 1366 × 1024, 4 players** (64px buttons) | as 952 × 427 | 4 │ 3 | 32px (was 224px) |
| Turns off | no round: Undo · modes · tools | — | — |

- **Unequal counts** are the common case with every feature on: the modes' flank has Undo plus three modes against three tools (separate buttons), or Undo plus Track against three tools (collapsed). The round is then half a button off, on the longer side's edge of the centre. That's what "near the centre" asks for.
- **Equal counts** come with Commander alone, the most common Commander setup, where the round sits exactly on the centre.
- In every mock no pill button covers a total, a glyph, a badge or the mana strip, every button is 48px (64px on the iPad), and nothing passes its seam.

### 3.2 What it keeps

- **The board's seams:** the pill's centre stays exactly where `placePill` puts it today, on the seam between the rows (4 and 6 players) or along the middle seam (2 players), so every tile keeps the clearance it has today, and both sides of the table lose the same.
- **Track's logic:** the counts are unchanged at rest and in every mode, so `restPillButtons`, `widestPill`, `pillFit` and `data-tight` decide exactly as today; only the order changes. The tabs move from the pill's start to after Undo; their tablist, roving tabindex and arrow keys are untouched.
- **44px targets:** no button changes size; the 44px fallback is still taken only where even Track doesn't fit (3 players at 568 × 320).
- **Keyboard and screen-reader order** follows the visible order, because the build moves the buttons in the markup rather than reordering them with CSS: Undo (and its hidden Redo) first, the modes, the round (and its hidden step-back), then the tools.

### 3.3 Costs

- **Muscle memory:** players who reach for the round at the pill's end, or Undo in its middle, have to learn the new places. The round is now the pill's landmark, which is the point.
- **The 2-player upright pill:** Undo is at the end nearer the board's top edge, read sideways by both players, as the round was. Both players reach it equally, as both flanks sit on the seam between them.

## 4. Option A′: Undo ends the tools' flank

*Mocks: `A-prime-…`.*

**modes · round · magnifier · d20 · settings · Undo**, and in a mode today's **[tabs] · Undo · ✓ · ✕**.

- It puts Undo next to settings, at the far end from the modes, which reads as "a tool".
- **It centres the round worse** wherever the flanks are uneven the other way: the collapsed pill at 568 × 320 has Track alone before the round and four buttons after it, so the round is **72px** off (A: 24px). Commander alone puts it 48px off (A: 0).
- In a mode, Undo moves from the pill's end at rest to its middle, so it isn't in one place.

## 5. Option B: the round exactly on the seam's centre

*Mocks: `B-568x320-2p`, `B-952x427-4p`, `B-952x427-6p`, `B-ipad-4p`.*

The order of A, with the pill moved along its seam until the round sits exactly on the board's centre; the pill then reaches further on its longer side.

- **At 952 × 427 and on the iPad** it fits: the pill moves 24px (32px) toward the shorter flank, still well inside the seam.
- **At 568 × 320 with 2 players it doesn't:** Track's six buttons reach 12px past the seam's end, which today's rules answer with 44px buttons. Keeping 48px would mean counting the imbalance in `pillFit`, `widestPill` and the clearances: the room is no longer the seam's length but twice the longer half.
- **The tiles lose unevenly:** the pill reaches further into one side's tiles, so their faces keep more clearance than their neighbours across the seam, and the 3-player board's 283px seam column at 568 × 320 has no room to offset into.
- **The owner's clarification removes the need:** the round only has to be near the centre.

## 6. As built (option A)

Built in its own commit, so it can be dropped:

- `web/index.html`: the pill's markup in A's order (Undo and Redo first, then the modes, Track and its tabs, the round and its step-back, then lookup, dice, settings, shuffle, save and ✕). No script changes: `syncPill` shows and hides by id, and `measureBoard` counts buttons.
- `web/css/board.css`: Track's tabs no longer lead the pill, so the first tab gets the ordinary divider after Undo and never the pill's end inset; the 2px rule that set the tabs off from Undo now sets them off from ✓.
- Tests: the pill's order at rest and in each mode, the round within half a button of the seam's centre at every sweep size, Undo at an end, and the existing Track, 44px and focus-order tests.
- Docs: SPEC.md §14 and PILL-SPEC.md's pill rows, MANA-UNDO-SPEC §6.6's placement, and GUIDE.md.

## 7. Questions for the owner

| # | Question | Recommendation |
|---|---|---|
| C1 | **A, A′ or B?** | A: the round half a button from the centre at most, Undo at one end in every state, and nothing about the fit changes. |
| C2 | **Which end for Undo?** A puts it at the modes' end (left on the landscape pill, the board's top on the upright one). Mirroring A puts it at the tools' end, beside settings. | The modes' end, so the tabs open beside it in Track and the pill reads "fix, change, then turn" from Undo. |
| C3 | **In a mode, should ✓ take the round's place in the middle?** Today's Undo · ✓ · ✕ already has ✓ in the middle; with Track's tabs it's Undo · tabs · ✓ · ✕, where ✓ is the fifth of six. | Keep ✓ after the tabs. Moving the tabs after ✓ would split them from Undo, the control they're used with. |
| C4 | **With Turns off** there's no round, so nothing is centred: Undo · modes · tools. Is that fine, or should something (the d20?) take the middle? | Fine: the order stays the same with or without Turns, so nothing jumps when Turns is switched. |
