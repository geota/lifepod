# Review checklist

Go through this before asking for review, beside [AGENTS.md](../AGENTS.md). Each item names what to look at, not just what to think about. It comes from `docs/review/DEEP-DIVE.md` §5.

**Invariants**

- [ ] Nothing new loads from a URL. There's no inline script, `style=` attribute, `<style>` block or `on…` attribute, and the CSP is unchanged.
- [ ] New JS or CSS features are on the floor (iOS 18.0, Chrome 129), or detected with a fallback. `npm run lint:compat` passes, with no new disable comments that lack a reason.
- [ ] Every new touch target is at least 44px at 568 × 320. Type shrinks before a target does.

**State and saving**

- [ ] Every change to `game` is followed by a save and a redraw of everything that reads it: score, badges, pill, mode cells. If a `commit()` helper lands, check that its `dirty` argument names the right tiles.
- [ ] A new `game` field is in the `Game` typedef, in `loadGame` with a fallback, in `startGame`'s reset or keep list (SPEC §10.2), and in `tests/logic.test.mjs`'s validator and generator.
- [ ] An old save still loads. If a field's meaning changed, there's a version and a migration, and a test that loads the old shape.
- [ ] Nothing new that should survive a relaunch is kept outside `game`. Nothing that shouldn't (the mode edit stacks, open bursts, timers) is put in it; the undo history is, on purpose, so it's written with the game.
- [ ] A new `game` field is in exactly one of `historyFields` (undo restores it) and `settingsFields` in `logic/data.js`. A game change goes through `commit()`; one that isn't a game step passes `step: false`, and a setting saved without `commit()` rebases the history (`saveGame` in `sheets/options.js`).

**Presses and redraws**

- [ ] A redraw doesn't replace a node a finger may be pressing: turn chips, strip buttons, cells. If it must, the press is ended on purpose.
- [ ] A new dialog or mode cancels presses, syncs Android back handling and closes with back and Escape.
- [ ] A new button that acts on `pointerdown` can't be hit by a tap meant for something that just moved away.

**Layout**

- [ ] A change to what a chip shows updates the `dropSteps` selectors, the `data-drop` CSS rules and the auto-drop tests together.
- [ ] A change that can change the pill's length or a face's size triggers a measure.
- [ ] No new interleaved style write and layout read in a loop over tiles.
- [ ] Both styles (Material and Glass), both engines, and 952 × 427, 640 × 360 and 568 × 320 at 2–6 players. The `sizes-*` and `centring` tests cover this; read their failures, don't loosen them.

**Modules**

- [ ] Imports still run one way and files stay under 500 lines (`npm run lint:web` checks both). A renamed export that a design script imports is renamed there too (`tests/design.test.mjs` fails otherwise).

**Native bridges**

- [ ] A new bridge method is in `types/globals.d.ts`, in `androidMethods` or `iosMessages` in `tests/helpers.mjs`, and in both wrappers. `check-bridge.sh` passes after an Android build.
- [ ] A new file type is in `MIME_TYPES` (Kotlin) and `mimeTypes` (Swift). `native.test.mjs` passes.
- [ ] Platform detection checks the specific handler or method, not just the object.

**Assets**

- [ ] A Mana code point added or removed: run `npm run font:subset`, and `font.test.mjs` passes.
- [ ] Icons are Phosphor or Mana, with their licence lines intact.

**Tests**

- [ ] Every bug fix has a test that fails without it.
- [ ] Time comes from `page.clock`, colours from `token()`, targets from `tileProblems`.
- [ ] Run the targeted tests while iterating, then the full `npm run check` once before review.
- [ ] Mutation-check only the rules that are behaviour-critical: who's out, play order, handoffs, `loadGame`.

**Docs**

- [ ] [GUIDE.md](GUIDE.md) describes what players see, and the README's feature list still matches. SPEC or SETTINGS-SPEC has an "as built" note if the build differs. AGENTS.md's Modules section matches any moved file.
