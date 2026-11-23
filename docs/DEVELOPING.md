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

## The Mana font

`web/fonts/mana.woff2` is a subset of [Mana](https://github.com/andrewgioia/mana) 1.18 with only the symbols LifePod draws, made by `scripts/subset-mana.mjs` (`npm run font:subset`) from the original release in `design/fonts/`. The font is under the SIL Open Font License 1.1 (`web/fonts/OFL.txt`).
