# Notes for AI-assisted changes

LifePod is one offline web page in `web/`, wrapped by a Kotlin WebView app (`android/`) and a SwiftUI WKWebView app (`ios/`). There's no build step for the web code. `design/polish/SPEC.md` describes how the board behaves, and `README.md` has the rules players see.

Run `npm run check` before every commit. It runs ESLint, the compatibility lint, ktlint, swift-format and every test. There's no commit hook, so nothing else runs them before CI. For Android changes, also run `npm run lint:android` and `./android/build.sh`.

## Invariants

- **Offline, with no network.** The Android manifest has no `INTERNET` permission, and nothing may load from a URL. Bundle every file, including fonts and icons.
- **The CSP is `default-src 'none'`** (the `<meta>` in `web/index.html`). There are no inline scripts, `style` attributes, `<style>` blocks or `on…` handlers. Styles go in `styles.css` or are set from script through `element.style`/CSSOM, and scripts are files.
- **The floor is iOS 16.0 and Android 11.** WKWebView on iOS 16 is the binding limit, and the Android System WebView is treated as Chrome 111. CI's WebKit is current, so it doesn't catch newer features. `npm run lint:compat` does, through the `browserslist` in `package.json`. Feature-detect anything newer and give it a fallback. Don't raise the floor in passing.
- **Old saves must keep loading.** `loadGame` in `web/app.js` validates every field of the saved game and falls back to a default when a field is missing or wrong. Keep that for every new field. When a field's meaning changes, add a version and migrate older saves (see `identitySettingsVersion`). Never make an old save throw or reset the game.
- **Every touch target is at least 44px** (`--tap-min`), at every board size down to the 320 × 568 stress test. Shrink type before a target shrinks.

## Adding a file to `web/`

The page loading a new file isn't enough. List it in all three places, or it will 404 inside the Android app only:

1. `MIME_TYPES` in `android/src/dev/maceiras/lifepod/MainActivity.kt`, the Android asset allowlist;
2. the `zip` line of the "Bundle offline web app" step in `.github/workflows/ci.yml`;
3. the expected file list in `tests/native.test.mjs`, whose contract test checks the other two.

## Tests

- Tests use `node:test` with Playwright. Start every test name with `chromium:` or `webkit:`. CI runs each engine in its own job with `--test-name-pattern`, so a test without the prefix never runs in CI.
- CI's web job makes `system-ui` and `sans-serif` resolve to **Roboto**, as on Android. Tests that measure text, such as badge fitting and auto-drop, assume Roboto metrics. If one fails locally but not in CI, check the font before changing the layout.
- If you add or rename a `@JavascriptInterface` method, update `androidMethods` in `tests/helpers.mjs`. R8 shrinks the Android code, and `android/check-bridge.sh` (run by `build.sh` and CI) fails if a bridge method is missing from the built dex.
