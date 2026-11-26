# Developing LifePod

How to build, check and test LifePod. Code conventions and invariants are in [AGENTS.md](../AGENTS.md), the review checklist in [REVIEWING.md](REVIEWING.md), and signing and store uploads in [RELEASING.md](../RELEASING.md).

## Setup

Install Node.js, then from the project root:

```sh
npm ci
npx playwright-core install chromium webkit
```

The full check also needs ktlint (or [mise](https://mise.jdx.dev), which `lint:kotlin` falls back to) and full Xcode for `swift-format`. Android Lint needs Kotlin (`kotlinc`) and Android SDK Command-line Tools 23.0.

## Shared code

`web/` contains the interface, seat layouts, rotations, scoring and saved-game format, as native ES modules with no build step: `app.js` is the entry and `web/js/` holds the modules, layered as [AGENTS.md](../AGENTS.md) describes. Android and iOS bundle the whole folder and serve it to their web view from inside the app, Android at `https://appassets.androidplatform.net/` and iOS at `lifepod://app/`, with no network access. Either app serves any file in `web/` with an allowed extension (html, css, js or mjs, json, png, svg, woff2 or txt), so a new file needs no native change. Their Kotlin and Swift wrappers handle screen-awake behaviour, local storage and fullscreen presentation; the browser preview uses the equivalent browser APIs. App icons, build settings and package metadata live in the platform projects.

## Browser preview

Run `npm run preview` and open http://127.0.0.1:8080/ to try the app on your computer (`PORT=…` picks another port). The page is ES modules, which browsers don't run from a file, so opening `web/index.html` directly shows no board. The preview uses browser storage and requests a screen wake lock where supported.

## Lint and test

Run `npm run check` before committing. It runs, in order: `lint:web` (ESLint), `lint:compat`, `typecheck` (TypeScript over `web/`), `lint:kotlin` (ktlint, through mise when it isn't on the path), `lint:ios` (swift-format) and `npm test`. It leaves out Android Lint, which needs the Android SDK; run `npm run lint:android` for that. `npm run lint:web`, `npm run lint:android` or `npm run lint:ios` checks one platform, and `npm run lint` all three.

`npm run lint:compat` checks `web/` against the oldest browsers LifePod supports, listed in `browserslist` in `package.json`: iOS 18 (WKWebView) and the Android System WebView, as Chrome 129 and later. `eslint.compat.config.mjs` uses `eslint-plugin-compat` and a list of newer JavaScript APIs the plugin misses. `stylelint.config.mjs` uses `stylelint-no-unsupported-browser-features`. Both list the findings that are only warnings for now.

Android Lint runs without Gradle through `android/lint.sh`, which describes the app in a lint project file; `android/lint.xml` lists the checks LifePod deliberately ignores and why.

`npm test` checks seat placement and facing as the screen turns each way, simultaneous taps and holds by several players, and that the board fits and scales from a 320 × 568 phone through foldables to a 13-inch iPad. The smallest real phone the design targets is 360 × 640; 320 × 568 is kept as a stress test. `LIFEPOD_TESTS=webkit npm test` runs one engine. AGENTS.md's Tests section has the harness rules.

## Android

The debug APK is built at `android/build/lifepod-debug.apk`. Copy it to an Android 11 or newer phone and open it to install, or, with a device connected and USB debugging on, run `adb install -r android/build/lifepod-debug.apk`.

To rebuild, install JDK 21, Kotlin 2.2.x (`kotlinc`), Android SDK Platform 36 and Android SDK Build-Tools 36.1.0. Set `ANDROID_HOME` to the SDK directory and run `./android/build.sh` from the project root. To also build the App Bundle that Google Play requires, download [bundletool](https://github.com/google/bundletool/releases) and set `LIFE_POD_BUNDLETOOL` to its jar.

The build shrinks the Kotlin code with R8, using `android/proguard-rules.pro`, and then `android/check-bridge.sh` makes sure the page's bridge methods survived. Builds signed with the debug key are debuggable, so you can inspect the page from `chrome://inspect` on a connected computer. Release-signed builds aren't.

LifePod needs Android System WebView 129 or later, which Google Play keeps updated; on an older WebView the app asks you to update it.

Before the first prerelease, download the `lifepod-android` artifact from a successful [CI run](https://github.com/geota/lifepod/actions/workflows/ci.yml), unzip it, and open `lifepod-debug.apk` on your phone. Debug builds are signed with the committed, non-secret `android/debug.keystore`, so each newer debug build installs over the last one and keeps the saved game. A phone with a debug build must uninstall it before installing the first signed release.

## iOS

Open `ios/LifePod.xcodeproj` in Xcode and run the **LifePod** target on a simulator or device running iOS 18 or later. For a physical device, select your development team under **Signing & Capabilities** first. In the Debug configuration, Safari's **Develop** menu can inspect the page; Release builds can't be inspected.

## GitHub Actions

[CI](../.github/workflows/ci.yml) runs lint, the browser tests and the builds for pull requests and pushes to `main`. Each successful run produces a static web ZIP of all of `web/`, a debug-signed Android APK and App Bundle, and an iOS Simulator ZIP. CI also compiles the iPhone target with signing disabled.

A version tag such as `v0.1.0-alpha.1` publishes a GitHub prerelease with the signed APK, uploads the App Bundle to Google Play once its secrets are set, and uploads the iOS app to TestFlight once the App Store Connect key is set. [RELEASING.md](../RELEASING.md) has the commands for creating the keys and secrets.

## Images

- `npm run screenshots:readme` renders the README's screenshots into `screenshots/readme/` from the real app (`scripts/readme-screenshots.mjs`). Name files to render just those: `npm run screenshots:readme -- turn.png`.
- `npm run store:images` renders the Google Play and App Store images into `store/`.

## Card data

Card lookup reads `web/data/cards.json.gz`, a gzipped copy of `data/cards.json`: every paper card in Scryfall's Oracle cards bulk file, without art cards, tokens (but Treasure, Food, Clue and the other predefined artifact tokens), emblems, planes, schemes, Vanguard, Jumpstart theme cards, helper cards, the memorabilia and playtest cards Scryfall hides by default, and digital-only cards. A card counts as paper if its Oracle printing is, or if a paper format lists it as legal, banned or restricted: the Oracle file holds an MTGO printing for about a thousand paper cards, such as the original dual lands and Mox Diamond (design/polish/SCRYFALL-SYNTAX-SPEC.md §5.1). That's 33,454 cards on 23 November 2026 (Scryfall's own `game:paper` search finds 33,377): 10.80 MB as JSON, 2.37 MB gzipped, with the query language's fields (legalities, produced mana, layout, flags, the exact EDHREC rank, the land nicknames Scryfall names and every printing's rarity). Each card keeps its name, folded search key, mana cost, type line, rules text, stats, faces, colour identity and, for a later structured query, mana value, colours, rarity and keywords (the `Card` typedef in `web/js/logic/cards.js`). The query fields cost 0.79 MB raw and 0.17 MB gzipped.

- `npm run cards:update` downloads the latest file (with the User-Agent `LifePod/<version>` and nothing else about you), keeps it in `node_modules/.cache/lifepod-cards/`, and writes the data and the credit dates. `npm run cards:update -- --offline` rebuilds from the cache. A failed or slow request is tried three times in all; only a failure repeats it, so a run downloads the bulk file once.
- A version tag refreshes the data for its release in CI and falls back to the committed data if Scryfall or a check fails (`scripts/cards-release.mjs`, RELEASING.md "Card data in a release"); a weekly workflow proposes the change to main. Everything else, CI on main and pull requests included, uses the committed `data/cards.json`, so a build is reproducible from its commit. `LIFEPOD_SCRYFALL_API=http://127.0.0.1:9 node scripts/cards-release.mjs` tries the fallback locally.
- Each card's printed rarities, for `r:` and `in:`, come from Scryfall's `default_cards` file (every printing, about 80 MB gzipped), which the same `npm run cards:update` downloads into the cache, streamed to disk, and reads; only two short fields ship (`rp` and `ri`, 14 KB gzipped). `--offline` needs it in the cache like the Oracle file.
- Scryfall's Oracle tags, for `otag:` and `function:`, are `data/tags.json` (one tag per line) and `web/data/tags.json.gz` (336 KB), written by the same `npm run cards:update` from the `oracle_tags` bulk file: each tag's parents, aliases and its cards' places in `data/cards.json` as gaps, so the two files go together (`about.cards` is the card count they were written for). The page fetches the tags the first time a query uses one.
- Memory: the board alone is about 1.3 MB of JavaScript heap; with the cards loaded and their search data built, about 55 MB. Card lookup lets go of all of it (the cards, the search columns, the close-spellings index, the tags and the rows drawn) two minutes after the sheet closes (`evictDelay` in `web/js/sheets/cards.js`), and at once when the app goes to the background with the sheet closed (`visibilitychange`, which app.js already uses to end a held press; neither app has a pause bridge to the page). With the sheet open, everything stays until it closes. That brings the heap back to about 3 MB; the next open loads the cards again (about 0.2 s), keeping the query and the rules text toggle. `tests/cardevict.test.mjs` checks the eviction and, in Chromium, the heap after it.
- `data/cards.json` has one card per line, sorted by name, so an update's diff shows the cards that changed. It isn't shipped: only `web/` is.
- The page fetches `web/data/cards.json.gz` the first time card lookup opens (the CSP's `connect-src 'self'`) and unpacks it with `DecompressionStream` (iOS 16.4, Chrome 80). Both apps serve `.gz` as `application/gzip` with no `Content-Encoding`, so the WebView passes the bytes through as they are. aapt2 stores it in the APK without compressing it again, and iOS keeps it at 2.1 MB in the app rather than 10 MB. The gzip header carries no time and an "unknown" OS byte, so a Mac and Linux write the same file.

**Search speed**, measured in Chromium with the CPU slowed 4×, as `tests/cards.test.mjs` does:

| Step | Time |
|---|---|
| Fetch, unpack and decode the file | 115–125 ms, once (the same as the plain file: unpacking costs no more than reading 10 MB) |
| `JSON.parse` | 65–95 ms, once |
| Index the names | 5–6 ms, once |
| Name search, per keystroke | 3–5 ms median; 12 ms for one letter, which matches 25,000 names |
| Drawing 25 results | about 7 ms |
| Rules text index (one joined string) | 35 ms, the first time rules text is searched |
| Rules text, a fresh query | 6–15 ms (`indexOf` over the joined text) |
| Rules text, as the query grows | 1–2 ms (it checks only the last query's matches) |

Rules text runs in its own task after the names are drawn, so each keystroke's work stays under a frame. A trigram index, as SQLite's FTS5 uses, answers a rules-text query in under 2 ms but took 670 ms to build and 20 MB of memory at load, so it isn't used. SQLite itself isn't: it would need WebAssembly, which needs `'wasm-unsafe-eval'` in the CSP, and about 1 MB more, for read-only data that a scan already searches within a frame.

## The Mana font

`web/fonts/mana.woff2` (33.8 KB, from 28.2 KB before card lookup's symbols) is a subset of [Mana](https://github.com/andrewgioia/mana) 1.18 with only the symbols LifePod draws, made by `scripts/subset-mana.mjs` (`npm run font:subset`) from the original release in `design/fonts/`. The font is under the SIL Open Font License 1.1 (`web/fonts/OFL.txt`).
