# Notes for AI-assisted changes

LifePod is one offline web page in `web/`, wrapped by a Kotlin WebView app (`android/`) and a SwiftUI WKWebView app (`ios/`). There's no build step for the web code. `design/polish/SPEC.md` describes how the board behaves, and `README.md` has the rules players see.

Run `npm run check` before every commit. It runs ESLint, the compatibility lint, the type check, ktlint, swift-format and every test. There's no commit hook, so nothing else runs them before CI. For Android changes, also run `npm run lint:android` and `./android/build.sh`.

## Invariants

- **Offline, with no network.** The Android manifest has no `INTERNET` permission, and nothing may load from a URL. Bundle every file, including fonts and icons.
- **The CSP is `default-src 'none'`** (the `<meta>` in `web/index.html`). There are no inline scripts, `style` attributes, `<style>` blocks or `on…` handlers. Styles go in `styles.css` or are set from script through `element.style`/CSSOM, and scripts are files.
- **The floor is iOS 18.0, and Android 11 with WebView 129.** WKWebView on iOS 18 (Safari 18.0) and the Android System WebView as Chrome 129 (the same month, September 2024) are the binding limits; a feature needs both. The WebView updates through Google Play, so the device minimum stays Android 11 (minSdk 30), and `MainActivity.kt` checks the installed WebView at launch: below `MIN_WEBVIEW_MAJOR` it shows a native notice with a button to its Play page instead of the board. Keep `MIN_WEBVIEW_MAJOR` and the browserslist's Chrome entry in step. CI's WebKit is current, so it doesn't catch newer features. `npm run lint:compat` does, through the `browserslist` in `package.json`. Feature-detect anything newer and give it a fallback. Don't raise the floor in passing.
- **Old saves must keep loading.** `loadGame` in `web/app.js` validates every field of the saved game and falls back to a default when a field is missing or wrong. Keep that for every new field. When a field's meaning changes, add a version and migrate older saves (see `identitySettingsVersion`). Never make an old save throw or reset the game.
- **Every touch target is at least 44px** (`--tap-min`), at every board size down to the 320 × 568 stress test. Shrink type before a target shrinks.

## Adding a file to `web/`

A new file just needs an allowed extension: html, css, js or mjs, json, png, svg, woff2 or txt. Both apps serve any file under `web/` by its extension, and CI zips the whole folder. The Android app serves `web/` from its assets at `https://appassets.androidplatform.net/` (the interceptor in `MainActivity.kt`), and the iOS app serves it from the bundle at `lifepod://app/` (`WebFolderSchemeHandler` in `LifePodApp.swift`). Both give the page a real origin, so `'self'` in the CSP matches and module scripts load. Any other type, a path with `..` or a hidden file gets a 404.

For a new type, add it to `MIME_TYPES` in `MainActivity.kt` and `mimeTypes` in `LifePodApp.swift`. `tests/native.test.mjs` checks that the two tables match and that every file the page loads has a listed extension. Scripts must stay `text/javascript`, because both WebViews refuse a module script without a JavaScript type.

## Types

`npm run typecheck` runs TypeScript over `web/*.js` through JSDoc comments, with no build step and nothing emitted (`tsconfig.json`). The saved game is `@typedef Game` above `loadGame` in `app.js`, and the board modes are `BoardMode`. `types/globals.d.ts` declares the Android and iOS bridges and the dice API; change it with the native code. It's outside `web/` because the native builds package every file there. A new `game` field goes in the typedef as well as `loadGame`. Prefer a JSDoc cast, such as `/** @type {HTMLInputElement} */ (…)`, over changing code to satisfy the checker.

## The Mana font

`web/fonts/mana.woff2` is a subset with only the symbols the page draws. After adding or removing a Mana code point in `styles.css` or the scripts, run `npm run font:subset`, which rebuilds it from the original in `design/fonts/`. `tests/font.test.mjs` fails until you do.

## Tests

- Tests use `node:test` with Playwright. Start every test name with `chromium:` or `webkit:`. CI runs each engine in its own job with `--test-name-pattern`, so a test without the prefix never runs in CI.
- CI's web job makes `system-ui` and `sans-serif` resolve to **Roboto**, as on Android. Tests that measure text, such as badge fitting and auto-drop, assume Roboto metrics. If one fails locally but not in CI, check the font before changing the layout.
- If you add or rename a `@JavascriptInterface` method, update `androidMethods` in `tests/helpers.mjs`. R8 shrinks the Android code, and `android/check-bridge.sh` (run by `build.sh` and CI) fails if a bridge method is missing from the built dex.
