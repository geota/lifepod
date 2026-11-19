# LifePod design audit

**Status:** all findings (A1–A8) are applied in the app, the icons, and the store art. The tokens now live in `web/styles.css`; `design/tokens.css` keeps the reasoning for each value. The icons are Phosphor Bold (MIT), matching Crema.

Scope: the web UI in `web/` (board, setup dialog, seat rotation), the app icon (iOS master, Android adaptive layers, web icon) and the store art in `store/`. Checked from the CSS and markup, renders of the real app through Playwright Chromium (including a deuteranopia simulation), and measured contrast (WCAG 2.2) and OKLab colour distance (ΔE × 100).

The direction is sound: muted, dark, warm-neutral, with one pale-lime accent. Every fix below keeps it. No colour gets brighter or more saturated.

## What already works (keep it)

- Life totals are ≥ 9:1 on every player panel and body text is 13.5:1 on the dialog surface. That is AAA, and it holds up when the phone is read upside down from across a table.
- All six panels share one lightness and chroma (OKLCH L ≈ 0.34, C ≈ 0.04), so no seat looks favoured. Hue is the only thing that changes.
- The score shrinks with digit count (`--digits`) and uses tabular numerals, so totals don't jump around as they change. Each half tile is a touch target, every control is at least 44 px, focus rings use the accent, and the score bump respects `prefers-reduced-motion`.
- The icon mark sits inside Android's 66 dp safe zone (its corners are 31.1 dp from the centre; the limit is 33 dp), so circle, squircle and teardrop masks never clip it. The iOS master has no alpha channel, which App Store Connect requires.

## Findings, in priority order

### P1. Fix before the next release

**A1. Neighbouring seats merge for colour-blind players, and seams are hard to see at a distance.**
In the default four-player Commander layout, the vertical neighbours are green/red (seats 1 and 3) and blue/violet (seats 2 and 4). Simulated for deuteranopia (the deutan type of red-green colour blindness, which in milder or full form affects about 1 in 16 men), their colour difference drops to ΔE 0.8 and 1.1, so the board looks like two tall tiles instead of four. The only divider is a 1 px seam with 1.3–1.7:1 contrast against the panels.
*Fix:* keep every hue and chroma, but shift lightness by ±0.025 OKLab L: the top-row seats (1, 2, 5) get lighter and the bottom-row seats (3, 4, 6) darker. Their rims and buttons move with them. Widen the seam to 2 px (`.board { gap: var(--seam-width) }`). The smallest colour-blind difference between neighbours rises from 0.8 to 3.2, ordinary vision still sees ΔE ≥ 5.3 between neighbours, and totals stay ≥ 9:1. New values are in `tokens.css` under `--p1-*` to `--p6-*`.

**A2. The themed (monochrome) Android icon draws a broken plus.**
`ic_launcher_monochrome.xml` knocks out the + with `fillType="evenOdd"` but draws it as two overlapping rectangles. Where they overlap, the fill comes back, so on Android 13+ themed icons the plus shows a solid square in the middle.
*Fix:* replace it with `design/logo/android/ic_launcher_monochrome.xml`, which draws the plus as one 12-point outline.

**A3. The setup button is the lowest-contrast control, and it is the only way into settings.**
Its ring (`#627266`) is 2.2–2.4:1 against the panels around it, below the 3:1 that WCAG 1.4.11 requires for controls. Its fill is the page background, 1.3–1.7:1. Its 15 px slider icon is drawn with 1 px lines.
*Fix:* draw the ring in `--control-border` `#819084`, the colour the switch outline already uses (3.05:1 minimum against every panel), and draw the slider lines at 2 px (`.setup-icon i { height: var(--setup-icon-stroke) }`).

### P2. Next pass

**A4. Unicode characters stand in for icons.**
`−`, `+`, `↻`, `×` and `✓` take their shape from whatever font each platform falls back to. Android, iOS and desktop draw `↻` and `✓` from different symbol fonts, with different weights and baselines, so the rotate badge and the done mark look different on each.
*Fix:* use inline SVG icons drawn with one stroke (2 px on a 24 px grid, `stroke="currentColor"`, butt caps to match the logo's plus). Inline `<svg>` markup is allowed under the current CSP. Use presentation attributes rather than `style=""`.

**A5. The icon outline gets too thin at small sizes.**
The open seats use a 1.433-unit stroke on a 44-unit mark (3.3%). At the 24 dp size Android uses in Settings, that is about 1.4 px, and at the 16 px favicon size it disappears. The plus is 7.3 units long.
*Fix:* `design/logo/mark.svg` uses a 2-unit stroke, an 8-unit plus, and centres the plus exactly (it sat 0.07 units high). `mark-small.svg` (3-unit stroke) is for 32 px and below. Adopt `design/logo/android/ic_launcher_foreground.xml` and `png/app-icon-1024.png` for iOS. Replace `web/icon.png` (176 px) with `png/app-icon-192.png`, and add `png/favicon-32.png` as a second `<link rel="icon" sizes="32x32">`.

**A6. In the feature graphic, the icon tile disappears and the name is live system text.**
The icon's field (`#283621`) sits on a gradient starting at `#2b3a25`, a 1.06:1 contrast, so the rounded tile shows only as a smudge around the mark. The headline "LifePod" is rendered in whatever system font the rendering machine has, so it changes between machines.
*Fix:* in `store/feature-graphic.html`, replace the `<img>` and `<h1>` with `design/logo/lockup-horizontal.svg` at about 96 px high, and keep the tagline in `--muted`. If the tile stays, give it a 1 px `--border` edge.

### P3. Polish

**A7. Colours are hard-coded outside `:root`.** There are 13 literal values in `styles.css`, plus the player colours on `nth-child` rules. *Fix:* adopt `tokens.css`. Two near-duplicates merge: `#d4ded0` becomes `--text-soft` `#d6e1d5`, and `#3c4b3f` becomes `--surface-pressed` `#354137`. Both differences are below what anyone would notice.

**A8. Radius and spacing are off-grid.** Counter buttons use a 9 px radius and sheet buttons 10 px. Spacing uses 5, 7 and 19 px. *Fix:* use 10 px for all buttons (`--radius-md`) and a 4 px spacing scale (5 → 4, 7 → 8, 19 → 20).

## Detector notes

- "Hairline border with wide shadow" on the dialogs is a false positive. Each dialog is a single floating sheet over a scrim, which justifies both the border and the shadow.
- "Repeating-gradient stripes" refers to the seat ripple rings at 8% opacity. They are a deliberate, quiet texture that echoes the "pod" in the name. Keep them.

## Values changed in `design/tokens.css`

| Token | Was | Now | Finding |
|---|---|---|---|
| `--p1…p6-panel/rim/button` | see `tokens.css` comments | ±0.025 OKLab L | A1 |
| `--seam-width` | 1px | 2px | A1 |
| setup ring → `--control-border` | `#627266` | `#819084` | A3 |
| `--setup-icon-stroke` | 1px | 2px | A3 |
| `--text-soft` | `#d4ded0` / `#d6e1d5` | `#d6e1d5` | A7 |
| `--surface-pressed` | `#3c4b3f` / `#354137` | `#354137` | A7 |
| `--radius-md` | 9px / 10px | 10px | A8 |
| `--space-1/2/5` | 5 / 7 / 19px | 4 / 8 / 20px | A8 |
| logo stroke, plus | 1.433, 7.31 units | 2, 8 units (centred) | A5 |

Seat (glyph) colours, the accent, ink, surfaces, text, muted text and the brand field are unchanged.

## Regenerating the logo

`node design/logo/build.mjs` rebuilds every SVG, the Android vector drawables in `design/logo/android/`, and the PNG exports in `design/logo/png/` from one shared geometry.
