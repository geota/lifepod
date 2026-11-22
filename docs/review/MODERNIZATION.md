# Modernization review

Reviewed 22 November 2026, against the code in `web/`, `android/`, `ios/`, `tests/` and `.github/workflows/ci.yml` at commit `0629ddf`. Nothing in the repo was changed.

The question: would libraries, TypeScript, a build step, newer platform features or different native wrappers make LifePod smaller, safer or easier to change, while it stays free, offline, fast and minimal?

The short answer is that the architecture is already right. The best gains are in **guard rails** that stop an AI-assisted change from breaking the iOS 16 floor or the asset lists, and in **two size fixes** outside the JavaScript. Adding frameworks or a build step would cost more than it saves.

## Summary

### Do now

1. **Type-check the JavaScript with JSDoc and `tsc --checkJs --noEmit`.** There is no build step. Start with the saved-game shape, the board modes and the native bridge ([§2](#2-typescript)).
2. **Add browser-compatibility linting with a stated floor of iOS 16.** Use `eslint-plugin-compat` for JS and a doiuse-based Stylelint check for CSS. Today nothing automated catches a feature that is newer than Safari 16: CI's WebKit is current WebKit, not iOS 16 ([§6](#6-developer-experience)).
3. **Add one `npm run check` and a short `AGENTS.md`.** The file lists the invariants: offline, CSP, the iOS 16 floor, the three places a new asset must be listed, and which tests to run ([§6](#6-developer-experience)).
4. **Add two guard tests:**
   - an asset manifest test: every file the page loads is in the Android `MIME_TYPES` map and in the CI zip list;
   - a global "no page errors, no CSP violations" check in `tests/helpers.mjs`. Today some tests collect `pageerror` and some don't ([§6](#6-developer-experience)).
5. **Shrink the Android dex with R8.** `classes.dex` is 2.4 MB, or 727 KB compressed, which is **73% of the 997 KB APK**. It is almost all Kotlin stdlib from `-include-runtime`. R8 ships in the same `d8.jar` the build already uses ([§5](#5-native-wrappers)).
6. **Subset the Mana font.** It is 187 KB, or 19% of the APK, and blocks rendering of its symbols. The CSS uses 38 code points ([§3](#3-build-tooling)).
7. **Handle a crashed WebView renderer on Android with `onRenderProcessGone`.** iOS already reloads after a crash; Android currently lets the app die ([§5](#5-native-wrappers)).
8. **Test iPad in resizable windows.** `UIRequiresFullScreen` is deprecated in iPadOS 26, and Apple's TN3192 says it stops preventing resizing from iPadOS 27. CI already builds with the iOS 27 SDK ([§5](#5-native-wrappers)).
9. **Enable web inspection in debug builds:**
   - `isInspectable` on iOS 16.4 and later;
   - `WebView.setWebContentsDebuggingEnabled` on debuggable Android builds.

### Do later

- **Raise the iOS minimum to 18** when the iOS 16 share is negligible. Going to 18 drops the same iPhones as going to 17 (8, 8 Plus and X). It unlocks View Transitions, Popover, `@scope`, `@starting-style`, style queries, relaxed CSS nesting, `Object.groupBy` and Set methods ([§4](#4-modern-platform-features)).
  - *Done after this review: iOS 18.0 is the floor, and the Android WebView floor moved from Chrome 111 to Chrome 129, its September 2024 counterpart, so everything listed here is usable on both (AGENTS.md). `MainActivity.kt` asks players with an older WebView to update it from Google Play.*
- **Split `app.js` into several classic `defer` scripts, the way `dice.js` already works, if it keeps growing.** Use esbuild only if real `import`s become worth a build step. Its output would be one IIFE, so `file://`, the CSP and the Android map stay as they are ([§3](#3-build-tooling)).
- **Decide whether tile content should avoid camera cutouts.** Android WebView now forwards cutout insets to `env(safe-area-inset-*)`, but `MainActivity` consumes the insets before the WebView sees them ([§4](#4-modern-platform-features)).
- **Move the Swift file to Swift 6 language mode.** It is small and already `@MainActor`.

### Don't

- **No UI frameworks:**
  - Preact with htm, Lit, Solid and Svelte cost a dependency, a rewrite and usually a build step, and they don't help with the hard parts (measuring and fitting);
  - Alpine and petite-vue need `unsafe-eval` or a restricted CSP build;
  - XState is far bigger than the eight-mode switch it would replace.
- **No Vite, no cache-busting and no minification step.** There is no HTTP cache in play. JS, CSS and HTML are about 60 KB of the APK.
- **No Capacitor, Tauri Mobile, PWA-only or TWA.**
- **No Gradle and no `WebViewAssetLoader`.**
- **No Navigation API, `closedby` or anchor positioning yet.** Each is missing on iOS 16, and the app doesn't need them.
- **Don't switch ESLint for Biome, and don't add a reformatting tool.**

## What the recommendations rest on

**The binding constraint is iOS 16 WKWebView, which is Safari 16.0 to 16.7.**

- Android is effectively evergreen. Chrome 139 raised its minimum to Android 10 and WebView ships alongside Chrome, so Android 11 devices still get current WebView ([chromium-dev](https://groups.google.com/a/chromium.org/g/chromium-dev/c/vEZz0721rUY), [WebView compatibility doc](https://chromium.googlesource.com/chromium/src/+/main/android_webview/docs/web-platform-compatibility.md)).
- The web ZIP opens from `file://` in any browser.
- The code respects the Safari 16 floor with care. It uses no media-query range syntax (it writes `max-height: 359.98px` instead), no `Object.groupBy` and no nesting. Its `color-mix()` has a `@supports not` fallback for iOS 16.0–16.1.

That discipline is manual today. **Playwright's WebKit is current WebKit**, so the `webkit` test run in CI cannot catch an iOS 16 regression.

**Where the bytes are.** These are compressed sizes inside `android/build/lifepod-debug.apk`, measured with `unzip -lv`:

| Part | Compressed | Share |
|---|---|---|
| `classes.dex` (MainActivity plus the whole Kotlin stdlib) | 727 KB | 73% |
| `fonts/mana.woff2` (stored, already compressed) | 187 KB | 19% |
| `app.js` | 32 KB | 3% |
| `styles.css` | 19 KB | 2% |
| `index.html` and `dice.js` | 10 KB | 1% |

Any JavaScript-side optimization works on 6% of the package. The dex and the font are the levers.

**Shape of `app.js`.** It has 2,474 lines in one classic script.

- It holds about 50 element lookups at the top and about 130 top-level functions.
- Its single mode variable (`boardMode`, eight values) is written only in `setBoardMode`.
- The saved-game format is validated field by field in `loadGame` and the `fit*` functions. This is the riskiest contract, because a mistake loses a player's game.
- The DOM is built imperatively: 7 `createElement` calls, `<template>` cloning, no `innerHTML`, 77 `dataset` uses and 61 `setAttribute` calls.
- The hardest code is measurement and fitting: `measureBoard`, `fitBadgeSide`, `fitStrips` and the auto-drop ladder.

## 1. Libraries and frameworks

**Recommendation: don't.** Stay vanilla.

| Option | Size (project's own figure) | Build step | Works under `default-src 'none'`? | Fit for LifePod |
|---|---|---|---|---|
| Preact + htm | about 3 KB plus under 1 KB ([preactjs.com](https://preactjs.com/), [htm](https://github.com/developit/htm)) | No, if vendored as a UMD file. Its ESM build can't load from `file://` (§3) | Yes, htm doesn't use eval | The best of the set, but a rewrite of every render function |
| Lit / lit-html | about 5 KB ([lit.dev](https://lit.dev/)) | Shipped as ESM, so in practice yes | Yes | Shadow DOM by default would cut tiles off the global stylesheet and the test selectors, unless every component overrides `createRenderRoot` ([docs](https://lit.dev/docs/components/shadow-dom/)) |
| Solid | about 7 KB | Yes, it needs the JSX compiler | Yes | Fine-grained reactivity, but a build step and a rewrite |
| Svelte 5 | Small runtime, compiled | Yes | Yes | Same as Solid, plus a new file format for an AI to learn per change |
| Alpine | about 15 KB | No | **Only with the CSP build**, which allows a restricted expression syntax ([alpinejs.dev/advanced/csp](https://alpinejs.dev/advanced/csp)) | Puts logic into HTML attributes, which is the opposite of this code's well-commented functions |
| petite-vue | about 6 KB | No | **No.** It evaluates expressions with `new Function()`, and its README says there is no plan for a CSP build ([README](https://github.com/vuejs/petite-vue#security-and-csp)). Its last release was in 2024 | Out |
| XState v5 | Much larger than the code it replaces ([bundlephobia](https://bundlephobia.com/package/xstate)) | No | Yes | Out (see below) |

Why staying vanilla wins here:

- **The hard code isn't rendering.** The bugs this app has fought, as the `design/polish/FINAL-REVIEW.md` items show, are about what fits where: `getBoundingClientRect`, `ResizeObserver`, auto-drop levels and strip placement. A reactive library re-renders DOM; you still measure it by hand afterwards. Frameworks also tend to batch or defer DOM updates, which makes "render, then measure" sequencing harder, not easier.
- **The pointer code is deliberately low-level.** `bindCounter` counts on `pointerdown`, has a shared click-suppression window and lets several players hold buttons at once. A framework's event abstraction doesn't help, and can hurt.
- **The rewrite risk is real, and the gain is modest.** Roughly the render functions (`renderBadges`, `renderModeLayer`, `stripItems`, the setup sheet) would shrink. Everything else stays. The 70-odd Playwright tests would catch most regressions, but a rewrite of 2,500 lines is weeks of churn for a solo developer.
- **Every option except a vendored Preact adds a build step or breaks the CSP.**

If a framework is ever needed, for example if the setup sheets grow into a large form, use **vendored Preact plus htm UMD files as classic scripts.** Each new file joins the Android `MIME_TYPES` map, `index.html` and the CI zip list.

### State machine for board modes

**Recommendation: don't add XState. Make the existing machine explicit instead.**

The board has one mode variable with eight values (`null`, `rotate`, `colours`, `identity`, `damage`, `counters`, `mana` and `first`). Dialogs layer on top, and one function, `setBoardMode`, performs every transition. That already is a state machine, with one writer.

What would make it safer for AI-driven changes costs nothing at runtime:

- a JSDoc type `/** @typedef {null | 'rotate' | 'colours' | 'identity' | 'damage' | 'counters' | 'mana' | 'first'} BoardMode */`, so a typo'd mode fails the type check;
- if transitions ever get rules (for example, "you can't open mana from first"), a small `allowedFrom` table checked in `setBoardMode`, plus a test.

### CSS approach

- **Cascade layers (`@layer`): don't, for now.**
  - Layers are supported since Safari 15.4 ([caniuse](https://caniuse.com/css-cascade-layers)), so they are safe on the floor.
  - But `styles.css` has **zero `!important`** and uses `:is()` and `:where()` 28 times. It has no specificity war to solve and no third-party CSS to wall off.
  - Layers would help only to state the existing order (tokens, base, board, modes, sheets, overrides) explicitly. Revisit if specificity bugs start appearing.
- **Native nesting: don't until the iOS minimum is 17.2 or later.**
  - Safari 16.5 shipped only the strict form, and relaxed nesting arrived in 17.2 ([caniuse](https://caniuse.com/css-nesting)).
  - On iOS 16.0–16.4 nested rules are dropped silently, which would break layouts with no error.
- **Container queries: already used.** The code uses `container-type: size` and `cqw`/`cqh`, which have been supported since Safari 16.0. Keep using them.

## 2. TypeScript

**Recommendation: adopt JSDoc type-checking now, with `tsc --checkJs --noEmit`. Don't move to `.ts` files with a build step.**

- **It needs no build.** The shipped files stay exactly what is written, so there is nothing to keep in sync and nothing to rebuild before testing. The app stays debuggable in Web Inspector as written.
- **Its one dependency is dev-only.** TypeScript 7.0, the native Go port, shipped on 8 July 2026, about 10 times faster ([announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)). It type-checks JavaScript with JSDoc. A few legacy JSDoc forms (postfix `T?`, Closure-style function types) are no longer accepted ([CHANGES.md](https://github.com/microsoft/typescript-go/blob/main/CHANGES.md)). The code uses none of them today.
- **It catches the mistakes AI edits make:**
  - a misspelled `game` field;
  - a mode string that doesn't exist;
  - a bridge method that doesn't exist on `window.LifePodAndroid`;
  - a wrong argument order in a `fit*` function.
- **`lib` doubles as a guard for JS built-ins.** Setting `"lib": ["es2022", "dom", "dom.iterable"]` makes `Object.groupBy` (ES2024) a type error. It does not guard DOM APIs, because `dom` is always the latest; the compat linter covers those (§6).
- **Full `.ts` would add a compile step to every edit and test run, for little extra safety over JSDoc.** Node's type stripping doesn't help, because the code runs in WebViews.

A plan that keeps the change incremental:

1. Add a `tsconfig.json` with `allowJs`, `checkJs`, `noEmit` and `strict: false`, including `web/*.js` and a `web/types.d.ts`.
2. In `types.d.ts`, declare the native bridge:
   - `interface Window { LifePodAndroid?: { readGame(): string | null; writeGame(s: string): void; keepAwake(b: boolean): void; haptic(): void; setBackHandling?(b: boolean): void }; lifePodDice: …; initialGame?: string; closeOpenDialog(): boolean }`;
   - the iOS message handlers.

   This is also the one place an agent can read the Kotlin, Swift and JS contract.
3. Add `@typedef Game` for the saved-game shape and annotate `loadGame`, `saveGame` and the `fit*` functions.
4. Wrap the element lookups in a typed helper, for example ``/** @returns {HTMLElement} */ const $ = s => document.querySelector(s)``. `querySelector('#id')` returns `Element`, which has no `dataset`.
5. Turn on `strictNullChecks` once the error count is low.

I could not measure the initial error count, because installing TypeScript into a scratch folder was blocked in this session. Expect the first run to report mostly `Element` versus `HTMLElement` errors from the lookups at the top of `app.js`.

## 3. Build tooling

**Recommendation: no build step now. esbuild later, and only if `app.js` is split with real imports. Never Vite.**

Each benefit, checked against this app:

- **Module splitting: blocked without a bundler.**
  - The web ZIP is opened from `file://`. Chromium blocks module scripts there, because a `file://` page has an opaque origin and module loading needs CORS ([MDN modules guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules#other_differences_between_modules_and_classic_scripts)).
  - So `<script type="module">` would break the ZIP. Splitting needs a bundler that emits a classic IIFE, or several classic scripts.
  - esbuild's code splitting works only with `format: 'esm'` ([esbuild docs](https://esbuild.github.io/api/#splitting)). So "ES module splitting" as a shipped feature is not available here; esbuild would only stitch modules back into one IIFE `app.js`.
- **Splitting without a build: possible today.** `dice.js` already shows the pattern: a classic `defer` script that hangs one namespace on `window`. Each new file costs three edits: `index.html`, `MIME_TYPES` in `MainActivity.kt`, and the zip line in `ci.yml`. The manifest test in §6 makes forgetting one a test failure.
- **Minification: a small gain.**
  - JS, CSS and HTML are 60 KB compressed in the APK. Minifying would save perhaps 25–35 KB, and most of that is comments.
  - The comments are the design record an AI reads before changing code.
  - The dex (727 KB) and the font (187 KB) are the real levers.
  - Parse time for 113 KB of local JS is a few milliseconds on a current phone.
- **Cache-busting: not needed.**
  - Android serves assets from the APK through `shouldInterceptRequest`, and iOS loads them with `loadFileURL` from the app bundle.
  - Both are replaced whole on update, and the web ZIP is opened from disk.
  - No HTTP cache sits in between.
- **The Android MIME map works against a build.** Hashed file names such as `app.3f9a.js` would need the map to be generated. A bundler that keeps the output names (`app.js`, `styles.css`) avoids that.
- **Vite: don't.** It brings a dev server and HMR that a page you open from disk doesn't need, and ESM output by default.

**When esbuild would pay for itself:** when `app.js` is split into five or more files that genuinely import each other, and keeping a hand-ordered `defer` list becomes error-prone.

- Use one binary devDependency: `esbuild web/src/main.js --bundle --format=iife --target=safari16 --outfile=web/app.js`.
- The `--target=safari16` flag also down-levels syntax that is too new.
- Run the tests against the output, and keep source maps out of the shipped bundle.

### The Mana font (do now)

`web/fonts/mana.woff2` is 187 KB and declared `font-display: block`. `styles.css` uses 38 of its code points (`U+E600`–`U+EA73`). A subset with fontTools would keep those glyphs:

```sh
pyftsubset web/fonts/mana.woff2 --unicodes=U+e600,… --flavor=woff2 --output-file=web/fonts/mana.woff2
```

- The result should be a small fraction of the current size. I could not run the subsetter here, so measure it.
- Commit the subsetting script under `design/`, along with a test that every `--glyph` code point in `styles.css` exists in the font.
- The OFL in `web/fonts/OFL.txt` declares no Reserved Font Name, so a subset may keep the name "Mana". Keep `OFL.txt` alongside it.
- This is a one-off generated asset, not a build step.

## 4. Modern platform features

The floor is Safari 16 for iOS and the web ZIP; Android is current Chromium. Versions come from caniuse and MDN browser-compat data (links in [Sources](#sources)).

| Feature | Safari | Chrome | On iOS 16? | Recommendation |
|---|---|---|---|---|
| `:has()` | 15.4 | 105 | Yes | Already used. Keep |
| `color-mix()` | 16.2 | 111 | 16.2 and later | Already used with a fallback. Keep; drop the fallback when the minimum is 17 |
| Container size queries | 16.0 | 105 | Yes | Already used. Keep |
| Cascade layers | 15.4 | 99 | Yes | Not needed (§1) |
| CSS nesting | 16.5 strict, 17.2 relaxed | 112/120 | Partly | Don't until the minimum is 17.2 or later |
| `@property` | 16.4 | 85 | 16.4 and later | Only with a fallback |
| Media query range syntax | 16.4 | 104 | 16.4 and later | Keep avoiding, as the code does |
| Container **style** queries | 18.0 | 111 | No | Later (iOS 18 minimum). Would let tiles react to `--mode` without `data-*` selectors, but the selectors work fine |
| `@scope` | 17.4 | 118 | No | Later; low value with one stylesheet |
| Anchor positioning | 26.0 partial, 27 full | 125 (caniuse marks it partial) | No | Don't. The pill and strip placement depends on measured clearances that anchors can't express |
| View Transitions (same-document) | 18.0 | 111 | No | Later, as progressive enhancement only: `document.startViewTransition?.(…) ?? update()` for opening and closing modes. Respect `prefers-reduced-motion`, as the code already does |
| Popover API | 17.0 | 114 | No | Don't need. Every overlay is a modal `<dialog>`; popover is for non-modal layers |
| `<dialog>` | 15.4 | 37 | Yes | Already used well (`showModal`, `returnValue`, `close(value)`) |
| `<dialog closedby>` | Not supported | 134 | No | Don't; the sheets close explicitly ([web-features](https://web-platform-dx.github.io/web-features-explorer/features/dialog-closedby/)) |
| `@starting-style` and `transition-behavior: allow-discrete` | 17.5 / 17.4 | 117 | No | Later, for dialog entry and exit animation as pure enhancement. Older engines just don't animate |
| `inert` | 15.5 | 102 | Yes | Already used |
| `dvh` | 15.4 | 108 | Yes | Already used |
| `text-wrap: balance` | 17.5 | 114 | No | Optional enhancement for sheet headings; harmless where unsupported |
| `structuredClone` | 15.4 | 98 | Yes | Available. Use it for the `editStartScores` and edit snapshots if they grow past flat arrays; today spread copies are enough |
| Screen Wake Lock | 16.4 | 84 | Web only | Already used for the browser ZIP. The native wrappers correctly use `FLAG_KEEP_SCREEN_ON` and `isIdleTimerDisabled`, which are more reliable than the web API inside a WebView. Keep |
| Navigation API | 26.2 (partial) | 102 | No | Don't. There are no navigations, and Android back goes through the native bridge |
| `Object.groupBy` and Set methods | 17.4 / 17.0 | 117 / 122 | No | Don't use. The compat linter should flag them |
| `env(safe-area-inset-*)` | 11.0 | 69 | Yes | Decide (below) |

**Safe areas and cutouts.**

- `index.html` sets `viewport-fit=cover`, but no CSS uses `env(safe-area-inset-*)`.
- **iOS** would report the insets, because SwiftUI `.ignoresSafeArea(.container)` lets the page draw under the notch or Dynamic Island in landscape.
- **Android** WebView forwards display-cutout and system-bar insets to these variables from M136 for full-screen WebViews, and from M144 for all WebViews ([Android docs](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets), [Chromium insets.md](https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/insets.md)). But `MainActivity`'s root listener returns `WindowInsets.CONSUMED` after padding only for `captionBar() | ime()`, so the WebView never sees the cutout.

That may be intended: full-bleed tiles, with the centred content well clear of a punch-hole. Check on a phone with a landscape cutout whether any badge row or − and + glyph can sit under it. If one can, pass the cutout through, so the WebView gets it, and pad the face edges with `env()`.

## 5. Native wrappers

### Android: is building without Gradle still sound?

**Yes. Keep it.** `build.sh` uses only the official tools: aapt2, kotlinc, d8, zipalign, apksigner and bundletool. It produces the App Bundle Play requires, and CI verifies both signatures. Gradle would buy dependency management for AndroidX, and the app needs none of AndroidX.

**Target SDK and Play deadlines:**

- Since 31 August 2026, new apps and updates must target API 36 ([Play target API policy](https://support.google.com/googleplay/android-developer/answer/11926878), [Android docs](https://developer.android.com/google/play/requirements/target-sdk)). The manifest already targets 36.
- Expect API 37 (Android 17) to be required around 31 August 2027, following the yearly pattern.
- Play's 16 KB page-size rule applies only to native code. LifePod has none.

**Android 16 (API 36) changes, checked against `MainActivity.kt`** ([behavior changes](https://developer.android.com/about/versions/16/behavior-changes-16)):

- **Edge-to-edge:** the `windowOptOutEdgeToEdgeEnforcement` opt-out is gone. LifePod never used it. It draws edge-to-edge itself with `setDecorFitsSystemWindows(false)`, `LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS` and hidden system bars. ✔
- **Predictive back:** for target 36, the system back animations are on, and `onBackPressed` and `KEYCODE_BACK` no longer arrive. LifePod sets `enableOnBackInvokedCallback="true"` and registers its `OnBackInvokedCallback` *only while a dialog or board mode is open*. That is exactly Google's recommended pattern, so back-to-home animates at rest. It keeps `onBackPressed` only for Android 11–12, where it is still delivered. ✔
- **Large screens:** orientation and resizability restrictions are ignored when the smallest width is 600dp or more. Android 17 removes the opt-out for target 37 ([Android 17 change](https://developer.android.com/about/versions/17/changes/ff-restrictions-ignored)). LifePod uses `screenOrientation="fullUser"` and lays out any size, so it isn't affected. ✔

**`WebViewAssetLoader`: don't.**

- It ships in `androidx.webkit` ([reference](https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader)), an AAR with its own dependencies. Without Gradle, you would unpack and version it by hand.
- It serves a whole asset directory and guesses MIME types from extensions.
- The custom interceptor is about 30 lines. It serves the same `https://appassets.androidplatform.net` origin Google recommends ([load local content](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)) and is a strict **allowlist**: anything not in `MIME_TYPES` gets a 404. That is better security than the library default. Google's strong recommendation of the loader is against `file://` URLs, which have an opaque origin; LifePod already avoids those on Android.
- The only weakness is that a new file must be added by hand. Cover it with the manifest test (§6).

**Do now:**

1. **R8 for the dex.**
   - `-include-runtime` puts the whole Kotlin stdlib into `classes.dex` (2.4 MB, or 727 KB compressed). R8 is in `build-tools/36.1.0/lib/d8.jar` (`com.android.tools.r8.R8`).
   - Run it in place of d8 with `--release --min-api 30 --lib android.jar`, plus a rules file:
     - keep `MainActivity`; `aapt2 link --proguard` generates those rules from the manifest;
     - `-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }`.
   - Expect the dex to fall to tens of KB, and the APK to a few hundred KB.
   - **Risk:** if the keep rule is wrong, R8 strips the bridge methods silently, and the page loses saving and back handling.
   - Add a CI check that `apkanalyzer` or `dexdump` still lists `readGame`, `writeGame`, `keepAwake`, `haptic` and `setBackHandling`.
   - The alternative, rewriting the activity in Java to drop the stdlib, removes the risk but changes language and lint setup. R8 is the smaller change. ([App optimization with R8](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization))
2. **`onRenderProcessGone`.**
   - `LocalWebViewClient` doesn't override it. If the renderer is killed under memory pressure, which is more likely on Android 17 with its new per-device memory limits ([Android 17 changes](https://developer.android.com/about/versions/17/behavior-changes-all)), the default return of `false` crashes the app.
   - Return `true`, destroy the old WebView and create a new one. The game is in `SharedPreferences`, so nothing is lost.
   - iOS already does the equivalent in `webViewWebContentProcessDidTerminate`.
3. **Debug inspection.** Call `WebView.setWebContentsDebuggingEnabled(true)` when `ApplicationInfo.FLAG_DEBUGGABLE` is set. Mark debug builds debuggable with `aapt2 link --debug-mode`. This makes `chrome://inspect` work for on-device debugging.

**Distribution note.** Android developer verification for sideloaded apps takes effect on 30 September 2026 in Brazil, Indonesia, Singapore and Thailand, and globally from 2027 ([developer verification](https://developer.android.com/developer-verification)). The GitHub and Obtainium APK channel depends on registering the release key. `RELEASING.md` already has the fingerprint command for this.

### iOS: SwiftUI and WKWebView

`ios/LifePodApp.swift` already follows current practice:

- the SwiftUI `App` life cycle, which satisfies Apple's UIScene requirement;
- a `UIViewRepresentable` with a `@MainActor` coordinator;
- removing script handlers in `dismantleUIView`;
- main-frame checks on messages and navigation;
- reloading after the content process dies;
- injecting the saved game as a JSON-encoded literal at document start.

Uploads have needed the iOS 26 SDK since 28 April 2026 ([upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)). From April 2027, uploads will need the iOS 27 SDK and a deployment target of iOS 15 or later ([submit](https://developer.apple.com/ios/submit/)). Xcode 26 supports deployment targets from iOS 15 ([Xcode support](https://developer.apple.com/support/xcode/)). CI already builds with Xcode 27, and the iOS 16 target meets both rules. ✔

**Do now:**

- **iPad windowing.** `Info.plist` sets `UIRequiresFullScreen`.
  - Apple deprecated it in iPadOS 26 and says it will be ignored. TN3192 states that from iOS and iPadOS 27 it no longer opts the app out of resizing ([TN3192](https://developer.apple.com/documentation/technotes/tn3192-migrating-your-app-from-the-deprecated-uirequiresfullscreen-key)).
  - In a resizable window, the window's aspect no longer follows the device's orientation, and the board's "seats stay fixed to the device" logic (`currentLandscapeAngle`, `boardTurn`) reads both.
  - Add a sizes-test case for a portrait-shaped window on a landscape device, and try Stage Manager or windowed mode on iPadOS 26 and 27.
- **`isInspectable`.** Add `#if DEBUG` plus `if #available(iOS 16.4, *) { view.isInspectable = true }` ([docs](https://developer.apple.com/documentation/webkit/wkwebview/isinspectable), [WebKit blog](https://webkit.org/blog/13936/enabling-the-inspection-of-web-content-in-apps/)). Since iOS 16.4, Safari's Web Inspector attaches to an app's WebView only when this is set.

**Do later or don't:**

- **SwiftUI's native `WebView` and `WebPage` (iOS 26): don't until the minimum is 26.** It requires iOS 26 ([WebPage](https://developer.apple.com/documentation/webkit/webpage)), and the representable already works.
- **Swift 6 language mode: later.** `SWIFT_VERSION = 5.0` today, and the file is small and already main-actor-isolated, so the move should be trivial.
- **Raising the iOS minimum from 16 to 18: later.**
  - iOS 17 dropped iPhone 8, 8 Plus and X. iOS 18 kept iOS 17's iPhone list (XS and XR and later), so 18 costs no more iPhones than 17.
  - Apple's June 2026 figures put everything older than iOS 18 at about 7% of active iPhones ([Apple's App Store figures](https://developer.apple.com/support/app-store/)). Check the iPadOS lists separately.
  - Moving to 18 unlocks the "No on iOS 16" rows in §4 that matter: View Transitions, `@starting-style`, style queries and relaxed nesting.

### Capacitor, Tauri Mobile or PWA-only?

**Recommendation: keep the hand-rolled wrappers.** The current wrappers are about 180 lines of Kotlin and 120 of Swift, cover exactly four needs (storage, keep-awake, haptics and back), and have no dependencies.

| Option | What it would add | Verdict |
|---|---|---|
| [Capacitor](https://capacitorjs.com/docs) | Gradle and an Xcode project generated from npm; a JS runtime and bridge; plugins for Preferences, Haptics and keep-awake; version churn on three ecosystems | Worse: more code and more updates, for the same WebView |
| [Tauri Mobile](https://v2.tauri.app/start/prerequisites/) | A Rust toolchain plus Gradle plus Xcode; a Rust core you don't need | Worse |
| PWA only | No App Store listing on iOS. On Android, Play needs a [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity), which needs a hosted HTTPS origin with Digital Asset Links and runs in the user's browser | Worse: breaks "no network" and gives up the iOS store |

## 6. Developer experience

**Linting: keep ESLint. Add compat checks. Don't switch to Biome.**

- `eslint.config.mjs` runs `js.configs.recommended` with `ecmaVersion: 2022`. That already rejects syntax newer than ES2022 at parse time, which is a useful floor guard.
- **Add [`eslint-plugin-compat`](https://github.com/amilajack/eslint-plugin-compat).** Use `compat.configs['flat/recommended']` with a `browserslist` in `package.json`, such as `["iOS >= 16", "Safari >= 16", "Chrome >= 111"]`. It flags DOM and JS APIs that are missing on the floor, such as `Object.groupBy`, `navigator.wakeLock` without a guard, or Popover methods. These are exactly what an AI reaches for.
- **Add a CSS compat check.** Use Stylelint with [`stylelint-no-unsupported-browser-features`](https://github.com/RJWadley/stylelint-no-unsupported-browser-features), which is based on doiuse and reads the same browserslist.
  - Expect a few false positives where a `@supports` fallback exists (`color-mix`). Ignore those lines explicitly, with a comment saying why.
  - Biome's CSS `useBaseline` rule is a Baseline-tier check, not a browserslist one, and is still a nursery rule ([Biome CSS rules](https://biomejs.dev/linter/css/rules/)).
- **Biome would buy speed this repo doesn't need.** ESLint over two files is instant. It would lose the compat plugin and replace a working setup.

**Formatting: don't add Prettier or the Biome formatter.**

- The code uses aligned data tables, such as `swatches`, `identityNames` and `seatLayouts`, and 120-column lines. A formatter would reflow them, making a large diff and losing readability.
- An `.editorconfig` (indent, final newline, max line length 120) gives editors and agents the basics without reformatting.

**Pre-commit:** add [lefthook](https://github.com/evilmartians/lefthook) or prek running `npm run lint:web` and the type check. These take seconds.

- Leave browser tests to CI and to `npm run check`.
- jj does not run git hooks, so an agent working through jj skips them. That makes `npm run check` and CI the real gate, and the hook a convenience.

**What makes AI-assisted changes safer (do now):**

1. **`npm run check`:** `lint:web` + `tsc` + compat lint + `npm test`, as one documented command for every agent.
2. **`AGENTS.md`, or `CLAUDE.md`, at the repo root**, a page or less:
   - **Invariants:**
     - no network;
     - CSP `default-src 'none'`, so no inline scripts, styles or handlers;
     - the iOS 16 floor;
     - every 44px target rule;
     - save-format changes must keep old saves loading (`loadGame` and the `fit*` functions).
   - **The three places a new web file must be listed:** `index.html`, `MIME_TYPES` in `MainActivity.kt`, and the zip line in `ci.yml`.
   - Pointers to `design/polish/SPEC.md` for behaviour and `README.md` for the user-visible rules.
3. **Manifest test.**
   - Parse the `<script>`, `<link>` and `url()` references in `index.html` and `styles.css`.
   - Assert that each is in the `MIME_TYPES` map in `MainActivity.kt` and in the `zip` line of `ci.yml`, and that each file exists.
   - Today a missing entry works in the browser and only 404s inside the Android app.
4. **Global error guard.** Move the `pageerror` collection that 10 of 13 test files do by hand into a `tests/helpers.mjs` page factory. Have it also listen for `securitypolicyviolation` in the page and fail the test. A CSP break then fails loudly in Chromium and WebKit.
5. **Saved-game fixtures.** Add a few snapshots from older versions, such as one with the removed `'C'` identity that `normalizeIdentity` mentions. Assert that they load and render. This protects the one contract where a bug costs a player their game.
6. **An occasional iOS 16 run.** Before a release, open the app on an iOS 16 simulator runtime or an old device. Compat linting catches most issues, but not engine bugs.

## Sources

**Repo evidence:**

- sizes from `wc -c`, `gzip -9` and `unzip -lv android/build/lifepod-debug.apk`;
- glyph count from the `--glyph` declarations in `styles.css`;
- API and feature usage from grep over `web/`.

**Android**

- Play target API policy: https://support.google.com/googleplay/android-developer/answer/11926878 and https://developer.android.com/google/play/requirements/target-sdk
- Android 16 behavior changes (edge-to-edge, predictive back, large screens): https://developer.android.com/about/versions/16/behavior-changes-16
- Android 17 behavior changes: https://developer.android.com/about/versions/17/behavior-changes-17 and https://developer.android.com/about/versions/17/behavior-changes-all
- Android 17 orientation and resizability: https://developer.android.com/about/versions/17/changes/ff-restrictions-ignored
- WebView insets: https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets and https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/insets.md
- WebViewAssetLoader: https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader and https://developer.android.com/develop/ui/views/layout/webapps/load-local-content
- Chrome 139 and Android 10 minimum: https://groups.google.com/a/chromium.org/g/chromium-dev/c/vEZz0721rUY
- WebView release policy: https://chromium.googlesource.com/chromium/src/+/main/android_webview/docs/web-platform-compatibility.md
- R8: https://developer.android.com/topic/performance/app-optimization/enable-app-optimization
- Developer verification: https://developer.android.com/developer-verification

**iOS and WebKit**

- SDK requirements: https://developer.apple.com/news/upcoming-requirements/
- TN3192, UIRequiresFullScreen: https://developer.apple.com/documentation/technotes/tn3192-migrating-your-app-from-the-deprecated-uirequiresfullscreen-key
- isInspectable: https://developer.apple.com/documentation/webkit/wkwebview/isinspectable and https://webkit.org/blog/13936/enabling-the-inspection-of-web-content-in-apps/
- SwiftUI WebPage: https://developer.apple.com/documentation/webkit/webpage
- iOS adoption: https://developer.apple.com/support/app-store/
- WebKit features in Safari 26.0 and 26.2: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ and https://webkit.org/?p=17640

**Web platform support (caniuse, MDN and web-features)**

- https://caniuse.com/css-cascade-layers, https://caniuse.com/css-nesting, https://caniuse.com/css-container-queries, https://caniuse.com/css-container-queries-style, https://caniuse.com/css-cascade-scope, https://caniuse.com/css-has, https://caniuse.com/css-anchor-positioning, https://caniuse.com/view-transitions, https://caniuse.com/mdn-api_htmlelement_popover, https://caniuse.com/wf-dialog-closedby, https://caniuse.com/mdn-css_at-rules_starting-style, https://caniuse.com/mdn-css_properties_transition-behavior, https://caniuse.com/mdn-css_types_color_color-mix, https://caniuse.com/mdn-api_structuredclone, https://caniuse.com/wake-lock, https://caniuse.com/wf-navigation, https://caniuse.com/css-text-wrap-balance, https://caniuse.com/mdn-javascript_builtins_object_groupby, https://caniuse.com/mdn-css_at-rules_property, https://caniuse.com/css-media-range-syntax
- `<dialog closedby>`: https://web-platform-dx.github.io/web-features-explorer/features/dialog-closedby/
- Modules and `file://`: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules

**Libraries and tools**

- Preact: https://preactjs.com/
- htm: https://github.com/developit/htm
- Lit: https://lit.dev/ and https://lit.dev/docs/components/shadow-dom/
- Alpine CSP build: https://alpinejs.dev/advanced/csp
- petite-vue: https://github.com/vuejs/petite-vue
- Solid: https://www.solidjs.com/
- Svelte: https://svelte.dev/docs
- XState: https://stately.ai/docs/xstate and https://bundlephobia.com/package/xstate
- esbuild: https://esbuild.github.io/api/#splitting and https://esbuild.github.io/api/#format
- TypeScript 7: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ and https://github.com/microsoft/typescript-go/blob/main/CHANGES.md
- JSDoc in TypeScript: https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html
- eslint-plugin-compat: https://github.com/amilajack/eslint-plugin-compat
- stylelint-no-unsupported-browser-features: https://github.com/RJWadley/stylelint-no-unsupported-browser-features
- Biome: https://biomejs.dev/linter/css/rules/ and https://biomejs.dev/blog/biome-v2-4
- lefthook: https://github.com/evilmartians/lefthook
- Capacitor: https://capacitorjs.com/docs
- Tauri: https://v2.tauri.app/start/prerequisites/
- Trusted Web Activity: https://developer.chrome.com/docs/android/trusted-web-activity

**Limits of this review**

- Library sizes are each project's own published figure, not measured here.
- Two measurements could not be run in this session, because tool installs were blocked:
  - the TypeScript error count;
  - the font-subset size.
- Some feature versions were read from caniuse and MDN data rather than tested on devices.
- The Android 17 large-screen details come from Google's 2026 pre-release posts and docs.
