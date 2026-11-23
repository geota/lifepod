# Logic properties and static analysis

Review of v0.1.0-alpha.15 (`main` at 71e3014). Part 1 runs property-based tests (fast-check 3.23.2) against `web/js/logic/` in plain Node. Part 2 runs Semgrep 1.186.0 and ESLint security rules over the web, Kotlin and Swift code, then reviews the risky sinks by hand. No app code was changed. The prototype tests live outside the repo; the full file is in the appendix.

## Short version

- **The pure logic holds up.** 15 properties ran at 500 and 20,000 cases each. 14 pass. The one failure is a bug that was already known: `loadGame` accepts a `startingLife` above 999 (SPEC-COMPLIANCE **B4**). A second property found the other half of B4: a bad `scores` or `startingLife` resets the whole game, settings included. It passes once those two fields are excluded. I found no new logic bugs.
- **Confirmed, with properties:**
  - `loadGame` never throws and always returns a valid `Game`, whatever the input: arbitrary strings, any JSON, corrupted saves and a `read` that throws.
  - A valid save round-trips exactly, and loading is idempotent.
  - Corrupting any field other than `scores` or `startingLife` changes only that field.
  - Play order is a permutation. `nextTurn` and `previousTurn` undo each other, round included. Skipping lands only on players who are in, and the round goes up exactly when play passes the first player.
  - The heir matches a reference written from the text of CR 726.4 and 727.4.
  - Any sequence of mode edits, undone in reverse, restores the game exactly. Counts stay within 0–99.
- **Static analysis found no true positives.** Semgrep: 7 results, all false positives. ESLint `security/*`: 146 `detect-object-injection` results, all false positives, because every index is a constant, a loop index or a validated seat. There is no `innerHTML`, `eval` or `Function` anywhere. The hand review of the native sinks found that the path handling and navigation locks are sound. Three hardening notes are ranked below.

## Ranked findings

| # | Severity | Finding | Status |
|---|---|---|---|
| L1 | Low | `loadGame` keeps a `startingLife` above `maxStartingLife` (999), such as 1000 or 2^53−1 | Confirms **B4**. Shrunk counterexample: a valid 2-player save with `startingLife: 1000` |
| L2 | Low | One bad `scores` entry, or a bad `startingLife`, resets every field, including style, tile set, reminders, colours and identities | Confirms **B4**, the reset half. Shrunk: deleting `startingLife` from a valid save also resets `scores`, so `[161,7,-3,3]` becomes `[40,40,40,40]` |
| L3 | Info | In Rounds, at round 999, `stepTurn` holds at 999 but a step back after a relaunch, with no `turnSteps`, goes to 998 | Found by reading, while writing the inverse property. Round arithmetic lives in `actions/turns.js:40,64`, outside the pure layer. Harmless |
| S1 | Low (hardening) | iOS has no network-level block: offline relies on the CSP alone | New angle on **B6**. See below |
| S2 | Low (hardening) | Android `replaceTracker` has no back-off: a page that kills its renderer on load loops forever | Reading only |
| S3 | Info | The CSP's `file:` sources | Already **B6** and DEEP-DIVE 4.3 #9. Not repeated |

### L1 and L2: `loadGame` and B4

`web/js/logic/save.js:231-233` checks `scores` and `startingLife` as a gate and returns `defaults` when either fails. There is no upper bound on `startingLife`.

- **Evidence.** Property `startingLife stays within the slider range 1-999` fails after 2 cases and shrinks to `startingLife: 1000`. Property `corrupting one field keeps every other field` fails after 8 cases and shrinks to deleting `startingLife`; the result has `scores` reset to `[40,40,40,40]` and every setting back to its default.
- **This is the same root cause as B4.** No released build wrote such saves (see B4's impact note), so it remains hardening.
- **Fix.**
  - Bound it: `saved.startingLife <= maxStartingLife`, or clamp it with `Math.min`.
  - Split the gate. Use the scores only to decide the player count. On a bad `startingLife`, fall back to 40 and keep everything else. On bad `scores` with a valid length, fit each entry to `startingLife`. Only an unknown length needs the default board, and even then the settings fields (`keepAwake`, `tileColours`, `badgeSize`, `style`, `reminders`, `identity`, `counters`, `turns`, `manaPool`, `autoEmpty`, `landscapeAngle`) don't depend on the count and can be kept.
  - The prototype's `corrupting one field…` property, run with `PBT_STRICT=1`, is the test for this fix.

### Properties that pass, and what they rule out

- **`loadGame` never throws, and always returns a valid `Game`.** The input mixes several generators:
  - arbitrary strings and arbitrary JSON;
  - valid saves with one leaf replaced, deleted or swapped for a near-miss: an off-by-one int, `-0`, `0.5`, `1e21`, `'1'`, `'C'`, `'WW'`, `'GW'`, another field's enum, `[]` or `{}`;
  - "messy" saves with about one leaf in eight corrupted at once;
  - a `read` that throws or returns `undefined`.

  The validator (`gameProblems`) is written from the `@typedef Game`. It checks distinct colours, a zero diagonal for commander damage, enums, seats within the board, the round within 1–999 and counts within 0–99.
- **Round trip: `load(JSON.stringify(g))` deep-equals `g` for every valid `g`.** It also holds for every player count, and for `style: null` and every identity version-2 setting.
- **Idempotence: `load(save(load(x))) == load(x)`.** Saves are compared as JSON, because a saved `-0` score loads as `-0` and writes back as `0`. That's harmless and not a bug.
- **Turns.** The generator covers 2–6 players, any active seat, `first` as any seat or null, and any subset of players out by life.
  - `nextTurn` lands on a player who is in unless nobody else is, and it skips only out players.
  - `crossed` is true exactly when the walk, excluding the start and including the end, contains `first`.
  - `previousTurn∘nextTurn` and `nextTurn∘previousTurn` are the identity on `{active, first, round}` when the active player is in.
  - A lap of n-in steps visits each player who is in once and adds exactly one round.
  - When the active player is out, the inverse doesn't hold, and shouldn't: you can't step back onto an out player. The generator filters this case out.
- **Heirs.** For each player who is in and leaves (life set to 0) in Turn by turn, `leavingTransfers` moves each designation the leaver held to the reference heir: the active player, otherwise the next player in turn order who is still in (CR 726.4, 727.4). With no heir, the monarch goes to `null` and the initiative stays. Nothing moves for a holder who stayed in. Uniqueness is structural: each designation is one seat or null, so the properties check that it is always a valid seat or null after every edit.
- **Edits.** The model copies `commitEdit`'s handoffs and the guards of `stepCount`, `stepMana` and `stepDamage` from `actions/edits.js`. For any sequence of up to 60 edits of every kind, undoing in LIFO order restores the game deep-equal. After every step, every count, damage cell and pool stays within 0–99.

### Mutation check (turn order, heirs, load validation)

The prototype ran against five hand mutants of copies of `logic/`:

| Mutant | Killed by |
|---|---|
| `heir` returns the active player even when they're out | heir property |
| `previousTurn` checks the wrong seat for crossing | both inverse properties |
| `fitColors` allows duplicate colours | `loadGame` validity (needs the messy-save generator; the one-field generator missed it) |
| `fitDamage` allows self-damage | `loadGame` validity (same) |
| `applyEdit` undoes transfers in forward order, not reversed | **survives**, and it's an equivalent mutant: no reachable edit carries two transfers of the same kind. Damage moves each kind from the defender once, and a handoff needs a holder the edit just put out, which the attacker or the toggled player never is. Keep the reverse; it's what makes future multi-transfer edits safe |

## Recommendations for `tests/`

Add one file, `tests/logic.test.mjs`, that imports `test` from `./helpers.mjs` and names every test `node:`. Add `fast-check` as an exact-version dev dependency (`"fast-check": "3.23.2"`). At 500 runs the file takes about 1 s, so it fits the fast layer DEEP-DIVE §4.4 asked for. Adopt in this order:

1. **`loadGame` never throws / always valid**, with the messy and one-field generators. This guards the AGENTS.md "old saves must keep loading" invariant for every future field. A new field that isn't added to `gameProblems` and `gameOf` will fail the round trip, which is the reminder you want.
2. **Round trip and idempotence.**
3. **Turn order:** the two inverse properties, the "lands on someone in" property and the crossed-exactly-at-first property.
4. **The heir reference property.**
5. **The edit undo property and the 0–99 bound.** The model duplicates the guards in `actions/edits.js`. To avoid that drift, move `commitEdit`'s pure core (the guards, `applyEdit`, `leavingTransfers`) into `logic/rules.js` as a function `commit(game, edit) → edit | null`. Then the test calls the real thing.
6. **After fixing B4:** the `startingLife` bound and the strict corruption property.

Skip the play-order permutation check as a property. It is a five-row table, and an example test covers it.

Determinism: let fast-check pick a seed and print it on failure, which it does by default. Set `numRuns` from `PBT_RUNS` so CI can run more cases nightly if wanted.

---

## Part 2: static analysis

### Tools and coverage

- **Semgrep 1.186.0**, through `uvx`, with metrics off, over `web/`, `android/`, `ios/`, `scripts/` and `tests/`. 55 tracked files scanned.
  - Run 1, 147 rules: `p/javascript`, `p/security-audit`, `p/secrets`, `p/kotlin`, `p/swift`, `p/xss`, `p/owasp-top-ten`.
  - Run 2, 279 rules: `p/default`, `r/javascript`, `r/kotlin`, `r/swift`, `r/html`.
  - Semgrep Pro (cross-file taint) isn't available, so the taint question was answered by hand below.
- **ESLint 9.39.5** with `eslint-plugin-security` 3.0.1 (recommended), `eslint-plugin-no-unsanitized` 4.1.4 (`method` and `property`) and the core rules `no-eval`, `no-implied-eval`, `no-new-func` and `no-script-url`. Run on a copy of `web/` with `--no-save` installs.

### Triage

| Tool / rule | Where | Verdict | Why |
|---|---|---|---|
| semgrep `exported_activity` | `android/AndroidManifest.xml:8` | False positive | The launcher activity must be exported. It takes only `MAIN`/`LAUNCHER`, reads nothing from its intent (`onCreate` never touches `intent`), and has no other filters |
| semgrep `missing-template-string-indicator` ×5 | `web/js/logic/rules.js:275` | False positive | The line is already a template literal; the rule matches the nested `${…}` inside a `.map` in a template |
| eslint `security/detect-object-injection` ×146 | `logic/`, `actions/`, `layout/`, `dice.js` | False positive (all) | Every computed key is a loop index, a seat validated by `fitSeat`, a constant from `data.js` (`countKinds`, `trackers`, `designationKinds`) or an identity normalized to `WUBRG` letters. Keys read from a save are only the fixed names in `loadGame`. `JSON.parse` makes `__proto__` an own data property, so there's no prototype pollution |
| eslint `no-unsanitized/*`, `no-eval`, `no-implied-eval`, `no-new-func` | — | No results | — |

### Manual review of risky sinks

- **`innerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `Function`, string `setTimeout`.** None in `web/`. Text goes in through `textContent`, and elements are built with `element()` and templates.
- **`element.style` from data.** Every write (`layout/board.js`, `layout/fit.js`, `render/modes.js`, `sheets/slider.js`) sets a number computed from measurements, or a grid string built from `seatLayouts` in `data.js`. No save string reaches a style. `tileColours`, `style` and `badgeSize` go to `data-*` attributes only after `loadGame` has checked them against their enums.
- **URL loading.** The only use of `location` is `?debug` (`app.js:108`), which puts `game` and `remind` on `window`. Both native apps load a fixed start URL with no query, so a user can't reach it. That's fine, and it's a hidden test contract (DEEP-DIVE §4.4).
- **Message handlers.**
  - iOS `userContentController` drops anything that isn't from the main frame and switches on fixed names with typed bodies.
  - Android's `GameBridge` methods take a `String` or a `Boolean`.
  - The saved game goes back into the page as `window.initialGame = <JSONEncoder string literal>`. That encoding is safe for any string, including `"`, `\`, `</script>` and U+2028, which is legal in a string literal since ES2019.
  - Native calls into JS (`closeOpenDialog`, `setReduceTransparency(Bool)`) interpolate only constants and booleans.
- **WebView settings (Android).** JavaScript is on, file and content access are off, and zoom is off. `shouldOverrideUrlLoading` returns `true` for everything. `shouldInterceptRequest` serves only `https://appassets.androidplatform.net/` and returns 404 for every other URL. There's no `INTERNET` permission, and debugging is on only for debuggable builds. `addJavascriptInterface` is exposed to every frame. That's acceptable here because no other origin can load: navigation is refused and every other request gets a 404.
- **Scheme handler path handling.**
  - Android `assetPath`: works on the decoded `Uri.path`, checks scheme and authority exactly (a port fails the check), and refuses empty segments, dot segments and backslashes.
  - iOS `file(for:)`: does the same, plus a component-wise `resolvingSymlinksInPath` containment check.
  - I found no bypass. Encoded `%2F` decodes before the split; `..` and `.` are refused; hidden files are refused.
- **Navigation (iOS).** `decidePolicyFor` allows only the exact start URL, in the main frame.
- **Intent handling (Play).** `openWebViewInPlay` builds `market://details?id=<provider>` from `WebView.getCurrentWebViewPackage()`, which is system data, not input. It falls back to the https Play page and catches `ActivityNotFoundException`. It's an implicit `ACTION_VIEW`, which is right for Play, and nothing comes back.

**S1 — iOS offline depends on the CSP alone.**
- **Why.** The iOS app has no counterpart to Android's missing `INTERNET` permission or 404 interceptor. `WKURLSchemeHandler` sees only `lifepod:` requests, and `decidePolicyFor` sees only navigations, so a `fetch('https://…')` or `<img src=https://…>` is stopped only by `default-src 'none'`.
- **Today.** The CSP holds and nothing in the code makes such a request.
- **Risk.** An edit that loosened the CSP, say to fix a font, would silently let the iOS build reach the network.
- **Fix.** Add a `WKContentRuleList` that blocks every URL except `lifepod://` and `about:`. It's one compiled rule list at configuration time. Or at least add a `tests/native.test.mjs` assertion that the CSP has no `https:`, `http:`, `*` or `data:` in its fetch directives.

**S2 — No back-off on renderer loss (Android).**
- **Why.** `onRenderProcessGone` calls `replaceTracker()` every time. A page that crashes its renderer during load would recreate the WebView in a tight loop. iOS has the same shape: `webViewWebContentProcessDidTerminate` calls `loadTracker`.
- **Today.** It isn't exploitable, and no such crash is known. It's a reliability note.
- **Fix.** After, say, three restarts within 10 s, show a native notice.

### Not run

- **CodeQL.** The Kotlin build goes through `android/build.sh` without Gradle, so building a database needs a custom build command. The Semgrep and hand review cover the surface: two native files of about 540 lines in all.
- **ktlint and swift-format.** These are style checks, already in `npm run check`.

---

## Appendix: prototype property tests

Run it from a folder with fast-check installed (`npm install --no-save fast-check@3.23.2`):

```
LIFEPOD_REPO=/path/to/lifepod node --test logic.property.test.mjs   # PBT_RUNS=20000 for a deep run, PBT_STRICT=1 for the post-B4 check
```

To adopt it, swap `import { test } from 'node:test'` for `import { test } from './helpers.mjs'`, and import the logic modules by relative path.

```js
// Property tests for web/js/logic (prototype). Run: node --test logic.property.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fc from 'fast-check';

const repo = process.env.LIFEPOD_REPO ?? '/Users/adrianmaceiras/code/lifepod';
const data = await import(`${repo}/web/js/logic/data.js`);
const { loadGame } = await import(`${repo}/web/js/logic/save.js`);
const rules = await import(`${repo}/web/js/logic/rules.js`);

const {
  badgeSizeOrder, countKinds, designationKinds, identityBackgrounds, identityParts, identitySettingsVersion, manaColours,
  maxCount, maxRound, playOrders, playerCounts, reminderKinds, styleOrder, swatches, tileSetOrder, trackers, turnModes,
} = data;
const { applyEdit, isOut, leavingTransfers, nextTurn, outPlayers, playOrder, previousTurn, trackedDesignations } = rules;

const runs = Number(process.env.PBT_RUNS ?? 500);
const opts = { numRuns: runs };

// ---- A validator for Game, written from the @typedef in save.js ---------------------------------------------------

const seatOrNull = (v, n) => v === null || (Number.isInteger(v) && v >= 0 && v < n);
const countRow = (row, n) => Array.isArray(row) && row.length === n && row.every(v => Number.isInteger(v) && v >= 0 && v <= maxCount);
function gameProblems(g) {
  const p = [];
  const n = g?.scores?.length;
  if (!playerCounts.includes(n) || !g.scores.every(Number.isSafeInteger)) return ['scores'];
  if (!Number.isSafeInteger(g.startingLife) || g.startingLife < 1) p.push('startingLife');
  if (!(g.rotations.length === n && g.rotations.every(r => [0, 1, 2, 3].includes(r)))) p.push('rotations');
  if (typeof g.keepAwake !== 'boolean') p.push('keepAwake');
  if (![0, 90, 180, 270].includes(g.landscapeAngle)) p.push('landscapeAngle');
  if (!(g.colors.length === n && new Set(g.colors).size === n && g.colors.every(c => Number.isInteger(c) && c >= 0 && c < swatches.length))) p.push('colors');
  if (!trackers.every(t => typeof g.counters[t] === 'boolean')) p.push('counters');
  for (const k of countKinds) if (!countRow(g[k], n)) p.push(k);
  if (!(g.identities.length === n && g.identities.every(s => typeof s === 'string' && /^W?U?B?R?G?$/.test(s)))) p.push('identities');
  if (!(identityParts.every(k => typeof g.identity.show[k] === 'boolean') && identityBackgrounds.includes(g.identity.background) && g.identity.version === identitySettingsVersion)) p.push('identity');
  if (!(g.commanderDamage.length === n && g.commanderDamage.every((row, d) => countRow(row, n) && row[d] === 0))) p.push('commanderDamage');
  if (typeof g.manaPool !== 'boolean' || typeof g.autoEmpty !== 'boolean') p.push('mana switches');
  if (!(g.pools.length === n && g.pools.every(row => countRow(row, manaColours.length)))) p.push('pools');
  if (!turnModes.includes(g.turns)) p.push('turns');
  if (!(seatOrNull(g.turn.first, n) && seatOrNull(g.turn.active, n) && Number.isInteger(g.turn.round) && g.turn.round >= 1 && g.turn.round <= maxRound)) p.push('turn');
  if (!tileSetOrder.includes(g.tileColours)) p.push('tileColours');
  if (!badgeSizeOrder.includes(g.badgeSize)) p.push('badgeSize');
  if (!(g.style === null || styleOrder.includes(g.style))) p.push('style');
  if (!seatOrNull(g.monarch, n) || !seatOrNull(g.initiative, n)) p.push('designations');
  if (!reminderKinds.every(k => typeof g.reminders[k] === 'boolean')) p.push('reminders');
  return p;
}

// ---- Generators ---------------------------------------------------------------------------------------------------

const count = fc.integer({ min: 0, max: maxCount });
const seat = n => fc.option(fc.nat(n - 1), { nil: null });
const rowOf = (arb, n) => fc.array(arb, { minLength: n, maxLength: n });
const boolRecord = keys => fc.record(Object.fromEntries(keys.map(k => [k, fc.boolean()])));
const identity = fc.subarray(['W', 'U', 'B', 'R', 'G']).map(a => a.join(''));

// A valid Game, field by field, for a given player count.
const gameOf = n => fc.record({
  startingLife: fc.integer({ min: 1, max: 999 }),
  scores: rowOf(fc.integer({ min: -50, max: 200 }), n),
  rotations: rowOf(fc.nat(3), n),
  keepAwake: fc.boolean(),
  landscapeAngle: fc.constantFrom(0, 90, 180, 270),
  colors: fc.shuffledSubarray([...swatches.keys()], { minLength: n, maxLength: n }),
  counters: boolRecord(trackers),
  ...Object.fromEntries(countKinds.map(k => [k, rowOf(count, n)])),
  identities: rowOf(identity, n),
  identity: fc.record({ show: boolRecord(identityParts), background: fc.constantFrom(...identityBackgrounds), version: fc.constant(identitySettingsVersion) }),
  commanderDamage: rowOf(rowOf(count, n), n).map(m => m.map((row, d) => row.map((v, a) => (a === d ? 0 : v)))),
  manaPool: fc.boolean(),
  autoEmpty: fc.boolean(),
  pools: rowOf(rowOf(count, manaColours.length), n),
  turns: fc.constantFrom(...turnModes),
  turn: fc.record({ first: seat(n), active: seat(n), round: fc.integer({ min: 1, max: maxRound }) }),
  tileColours: fc.constantFrom(...tileSetOrder),
  badgeSize: fc.constantFrom(...badgeSizeOrder),
  style: fc.constantFrom(null, ...styleOrder),
  monarch: seat(n),
  initiative: seat(n),
  reminders: boolRecord(reminderKinds),
});
const anyGame = fc.constantFrom(...playerCounts).chain(gameOf);

// A valid save with one field (possibly nested) replaced by arbitrary JSON, or deleted.
const fieldPaths = g => {
  const out = [];
  const walk = (v, path) => {
    out.push(path);
    if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], [...path, k]);
  };
  walk(g, []);
  return out.filter(p => p.length);
};
// Replacement values: arbitrary JSON, and near-misses that a validator can get wrong (off-by-one ints, other enums,
// floats, numeric strings), so the generator reaches past the scores gate and into each fit* check.
const nearMiss = fc.oneof(
  fc.jsonValue(),
  fc.integer({ min: -2, max: 13 }), fc.integer({ min: 95, max: 1002 }),
  fc.constantFrom(0.5, -0, 1e21, '1', '', 'C', 'WW', 'GW', true, false, null, [], {}, 'off', 'turns', 'glass', 'large', 'jewel'),
);
const corrupted = anyGame.chain(g => fc.tuple(fc.constant(g), fc.constantFrom(...fieldPaths(g)), fc.option(nearMiss, { nil: undefined })))
  .map(([g, path, value]) => {
    const copy = structuredClone(g);
    let at = copy;
    for (const k of path.slice(0, -1)) at = at[k];
    if (value === undefined) delete at[path.at(-1)];
    else at[path.at(-1)] = value;
    return { original: g, path, value, text: JSON.stringify(copy) };
  });

// A save with many leaves corrupted at once (about one in eight): duplicate colours, self-damage, bad enums and so on.
const messy = fc.tuple(anyGame, fc.infiniteStream(fc.tuple(fc.nat(7), nearMiss))).map(([g, stream]) => {
  const it = stream[Symbol.iterator]();
  const mess = v => {
    if (Array.isArray(v)) return v.map(mess);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mess(x)]));
    const [roll, value] = it.next().value;
    return roll === 0 ? value : v;
  };
  const { scores, startingLife, ...rest } = g;
  return JSON.stringify({ scores, startingLife, ...mess(rest) });
});

const load = text => loadGame(() => text, 0);
const json = v => JSON.stringify(v); // compares like the save does (and treats -0 as 0)

// ---- loadGame ----------------------------------------------------------------------------------------------------

test('node: loadGame never throws and returns a valid Game for any string, any JSON, or a throwing read', () => {
  fc.assert(fc.property(fc.oneof(fc.string(), fc.json(), fc.jsonValue().map(v => JSON.stringify(v)), corrupted.map(c => c.text), messy, messy), text => {
    const g = load(text);
    assert.deepEqual(gameProblems(g), []);
  }), opts);
  assert.deepEqual(gameProblems(loadGame(() => { throw new Error('no storage'); }, 90)), []);
  assert.deepEqual(gameProblems(loadGame(() => undefined, 90)), []);
});

test('node: round trip: a valid game saves and loads unchanged', () => {
  fc.assert(fc.property(anyGame, g => {
    assert.deepEqual(load(JSON.stringify(g)), g);
  }), opts);
});

test('node: loading is idempotent: load(save(load(x))) equals load(x)', () => {
  fc.assert(fc.property(fc.oneof(corrupted.map(c => c.text), messy, fc.json()), text => {
    const once = load(text);
    assert.equal(json(load(json(once))), json(once));
  }), opts);
});

// AGENTS.md: "falls back to a default when a field is missing or wrong ... Never make an old save throw or reset the game."
// So corrupting one field should leave every other top-level field as it was.
// Known exception (SPEC-COMPLIANCE B4): a bad scores or startingLife still resets the whole game, so they're left out
// here and pinned by the next test. Set PBT_STRICT=1 to include them.
const strict = process.env.PBT_STRICT === '1';
test('node: corrupting one field keeps every other field (AGENTS.md)', () => {
  fc.assert(fc.property(corrupted.filter(c => strict || !['scores', 'startingLife'].includes(c.path[0])), ({ original, path, text }) => {
    const g = load(text);
    for (const key of Object.keys(original)) {
      if (key === path[0]) continue;
      assert.equal(json(g[key]), json(original[key]), `field ${key} after corrupting ${path.join('.')}`);
    }
  }), opts);
});

test('node: startingLife stays within the slider range 1-999 (SETTINGS §4)', () => {
  fc.assert(fc.property(anyGame, fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), (g, life) => {
    const g2 = load(JSON.stringify({ ...g, startingLife: life }));
    assert.ok(g2.startingLife >= 1 && g2.startingLife <= 999, `startingLife ${g2.startingLife}`);
  }), opts);
});

// ---- Play order and turns ----------------------------------------------------------------------------------------

test('node: play order is a permutation of the seats for every player count', () => {
  for (const n of playerCounts) {
    assert.deepEqual([...playOrders[n]].sort(), [...Array(n).keys()]);
  }
});

// A game in Turn by turn with an active player, and some players out by life.
const turnGame = fc.constantFrom(...playerCounts).chain(n => fc.tuple(gameOf(n), fc.nat(n - 1), seat(n), fc.subarray([...Array(n).keys()])))
  .map(([g, active, first, outs]) => {
    g.turns = 'turns';
    g.turn = { first, active, round: 5 };
    g.scores = g.scores.map((_, i) => (outs.includes(i) ? 0 : 20));
    g.counters.poison = false;
    g.counters.commander = false;
    return g;
  });

// Positions walked from active, exclusive of the start, to the result, inclusive.
const walk = (order, from, to, dir) => {
  const seats = [];
  let i = order.indexOf(from);
  do {
    i = (i + dir + order.length) % order.length;
    seats.push(order[i]);
  } while (order[i] !== to || seats.length === 0);
  return seats;
};

test('node: nextTurn lands on a player who is in, unless nobody else is, and skips exactly the out players between', () => {
  fc.assert(fc.property(turnGame, g => {
    const { next } = nextTurn(g);
    const order = playOrder(g);
    const othersIn = order.filter(p => p !== g.turn.active && !isOut(g, p));
    if (othersIn.length) {
      assert.ok(!isOut(g, next), `landed on out player ${next}`);
      const path = walk(order, g.turn.active, next, 1);
      assert.ok(path.slice(0, -1).every(p => isOut(g, p)), 'skipped a player who is in');
    } else {
      assert.equal(next, g.turn.active);
    }
  }), opts);
});

test('node: the round goes up exactly when play passes the first player (nextTurn)', () => {
  fc.assert(fc.property(turnGame, g => {
    const { next, crossed } = nextTurn(g);
    const path = walk(playOrder(g), g.turn.active, next, 1);
    assert.equal(crossed, g.turn.first !== null && path.includes(g.turn.first));
  }), opts);
});

test('node: previousTurn undoes nextTurn, round included, for an active player who is in', () => {
  fc.assert(fc.property(turnGame.filter(g => !isOut(g, g.turn.active)), g => {
    const start = { ...g.turn };
    const { next, crossed } = nextTurn(g);
    g.turn.active = next;
    if (crossed) g.turn.round += 1;
    const back = previousTurn(g);
    g.turn.active = back.previous;
    if (back.crossed) g.turn.round -= 1;
    assert.deepEqual(g.turn, start);
  }), opts);
});

test('node: nextTurn undoes previousTurn too', () => {
  fc.assert(fc.property(turnGame.filter(g => !isOut(g, g.turn.active)), g => {
    const start = { ...g.turn };
    const back = previousTurn(g);
    g.turn.active = back.previous;
    if (back.crossed) g.turn.round -= 1;
    const { next, crossed } = nextTurn(g);
    g.turn.active = next;
    if (crossed) g.turn.round += 1;
    assert.deepEqual(g.turn, start);
  }), opts);
});

test('node: a full lap of nextTurn visits every player who is in once and raises the round by one', () => {
  fc.assert(fc.property(turnGame.filter(g => !isOut(g, g.turn.active) && g.turn.first !== null), g => {
    const inPlayers = playOrder(g).filter(p => !isOut(g, p));
    const seen = [];
    const startRound = g.turn.round;
    for (let i = 0; i < inPlayers.length; i++) {
      const { next, crossed } = nextTurn(g);
      g.turn.active = next;
      if (crossed) g.turn.round += 1;
      seen.push(next);
    }
    assert.deepEqual([...seen].sort(), [...inPlayers].sort());
    assert.equal(g.turn.round, startRound + 1);
  }), opts);
});

// ---- The monarch and the initiative: CR 726.4 and 727.4 -----------------------------------------------------------

// Reference heir, written from the rules text rather than the code: the active player; if the active player is leaving
// (or has left), the next player in turn order who is still in.
function referenceHeir(g, leaver) {
  const order = playOrder(g);
  const { active } = g.turn;
  if (active !== leaver && !isOut(g, active)) return active;
  const start = order.indexOf(active);
  for (let s = 1; s < order.length; s++) {
    const p = order[(start + s) % order.length];
    if (p !== leaver && !isOut(g, p)) return p;
  }
  return undefined; // nobody can take it
}

const handoffGame = fc.constantFrom(...playerCounts).chain(n => fc.tuple(turnGame.filter(g => g.scores.length === n), fc.nat(n - 1), fc.nat(n - 1)))
  .map(([g, monarch, initiative]) => {
    g.counters.monarch = true;
    g.counters.initiative = true;
    g.monarch = monarch;
    g.initiative = initiative;
    return g;
  });

test('node: a holder who leaves hands on to the heir CR 726.4 and 727.4 name, and nobody else changes', () => {
  fc.assert(fc.property(handoffGame, fc.nat(5), (g, pick) => {
    const n = g.scores.length;
    const leaver = pick % n;
    fc.pre(!isOut(g, leaver));
    const wasOut = outPlayers(g);
    g.scores[leaver] = 0;
    const transfers = leavingTransfers(g, wasOut);
    for (const kind of designationKinds) {
      const t = transfers.filter(x => x.kind === kind);
      assert.ok(t.length <= 1);
      if (g[kind] !== leaver) { assert.equal(t.length, 0, `${kind} moved though its holder stayed`); continue; }
      const heir = referenceHeir(g, leaver);
      if (heir === undefined) {
        // Monarch: nobody (726.4 has no one to take it). Initiative: stays (the code's choice; see report).
        if (kind === 'monarch') assert.deepEqual(t, [{ kind, from: leaver, to: null }]);
        else assert.equal(t.length, 0);
      } else {
        assert.deepEqual(t, [{ kind, from: leaver, to: heir }]);
      }
    }
  }), opts);
});

// ---- Edits: a pure model of commitEdit/undoEdit from actions/edits.js, with its 0..maxCount guards ----------------

// One step: the same guards as stepCount, stepMana, stepDamage and toggleDesignation, then commitEdit's handoffs.
function commit(game, stack, step) {
  const n = game.scores.length;
  const index = step.index % n;
  let edit;
  if (step.kind === 'damage') {
    const attacker = step.other % n;
    if (attacker === index) return;
    const next = game.commanderDamage[index][attacker] + step.delta;
    if (next < 0 || next > maxCount) return;
    const transfers = step.delta > 0 ? trackedDesignations(game).filter(({ kind }) => game[kind] === index).map(({ kind }) => ({ kind, from: index, to: attacker })) : [];
    edit = { kind: 'damage', index, attacker, delta: step.delta, transfers };
  } else if (step.kind === 'mana') {
    const colour = step.other % manaColours.length;
    const next = game.pools[index][colour] + step.delta;
    if (next < 0 || next > maxCount) return;
    edit = { kind: 'mana', index, colour, delta: step.delta };
  } else if (step.kind === 'designation') {
    const kind = designationKinds[step.other % 2];
    const from = game[kind];
    edit = { kind: 'designation', index, transfers: [{ kind, from, to: from === index ? null : index }] };
  } else {
    const next = game[step.kind][index] + step.delta;
    if (next < 0 || next > maxCount) return;
    edit = { kind: step.kind, index, delta: step.delta };
  }
  const out = outPlayers(game);
  applyEdit(game, edit, 1);
  const handoffs = leavingTransfers(game, out);
  if (handoffs.length) {
    edit.transfers = [...(edit.transfers ?? []), ...handoffs];
    for (const t of handoffs) game[t.kind] = t.to;
  }
  stack.push(edit);
}

const stepArb = fc.record({
  kind: fc.constantFrom(...countKinds, 'mana', 'damage', 'designation'),
  index: fc.nat(5), other: fc.nat(11), delta: fc.constantFrom(1, -1, 1, 1),
});
const editGame = anyGame.map(g => {
  // Nearer the thresholds, so players go out and designations hand on.
  g.scores = g.scores.map(s => Math.min(Math.max(s, 1), 25));
  g.turns = 'turns';
  if (g.turn.active === null) g.turn.active = 0;
  return g;
});

test('node: every edit, undone in reverse, restores the game exactly (applyEdit forward then back is the identity)', () => {
  fc.assert(fc.property(editGame, fc.array(stepArb, { maxLength: 60 }), (g, steps) => {
    const before = structuredClone(g);
    const stack = [];
    for (const s of steps) commit(g, stack, s);
    while (stack.length) applyEdit(g, stack.pop(), -1);
    assert.deepEqual(g, before);
  }), opts);
});

test('node: applyEdit forward then back is the identity for one edit of each kind, on any valid game', () => {
  fc.assert(fc.property(anyGame, stepArb, (g, s) => {
    const before = structuredClone(g);
    const stack = [];
    commit(g, stack, s);
    if (stack.length) applyEdit(g, stack[0], -1);
    assert.deepEqual(g, before);
  }), opts);
});

test('node: counts, damage and pools stay within 0..maxCount, and each designation has at most one valid holder', () => {
  fc.assert(fc.property(editGame, fc.array(stepArb, { maxLength: 80 }), (g, steps) => {
    const stack = [];
    for (const s of steps) {
      commit(g, stack, s);
      const p = gameProblems(g).filter(x => x !== 'scores');
      assert.deepEqual(p, []);
    }
  }), opts);
});
```
