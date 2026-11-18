# LifePod

An ad-free, offline life counter for tabletop games. A fresh install opens with four players at 40 life. Tap **−** or **+** to adjust a total by one, or hold to make a larger change.

Set the phone in the middle of the table. Players in the same row read their totals from the same direction, with **−** and **+** on either side. A seat that fills a side of the board in landscape faces that side. The board fills the screen, and one seat spans two slots when there are 3, 5, or 7 players.

Tap the sliders in the center to choose 2–8 players, set the starting life, restart, or toggle **Keep awake**. Changing the player count or starting life starts a new game. **Keep awake** is on by default. Scores and settings are saved between launches.

Choose **Rotate seats** in Setup, then tap a tile to turn it 90° clockwise. Tap the center check mark when finished. Rotation choices carry over when restarting with the same player count.

## Android

The debug APK is built at `android/build/lifepod-debug.apk`. Copy it to an Android 11 or newer phone and open it to install. With a device connected and USB debugging enabled, you can also install it using `adb install -r android/build/lifepod-debug.apk`.

To rebuild, install JDK 21, Kotlin 2.2.x (`kotlinc`), Android SDK Platform 36, and Android SDK Build-Tools 36.1.0. Set `ANDROID_HOME` to the SDK directory and run `./android/build-apk.sh` from this directory.

## iOS

Open `ios/LifePod.xcodeproj` in Xcode and run the **LifePod** target on a simulator or device running iOS 16 or later. For a physical device, select your development team under **Signing & Capabilities** first. Both apps bundle the UI in `web/` and use their platform’s screen-awake and local storage APIs.

## Browser preview

Open `web/index.html` to try the tracker on your computer. The preview uses browser storage and requests a screen wake lock where supported.

## Lint

Install ktlint and select full Xcode for `swift-format`. Then run `npm ci` and `npm run lint` from the project root. Run `npm run lint:web`, `npm run lint:android`, or `npm run lint:ios` to check one platform.

## Shared code

`web/` contains the interface, seat layouts, rotations, scoring, and saved-game format. Android and iOS bundle those files directly. Their Kotlin and Swift wrappers handle native screen-awake behavior, local storage, and fullscreen presentation. Browser preview uses the equivalent browser APIs. App icons, build settings, and package metadata live in the platform projects.

## GitHub Actions

[CI](.github/workflows/ci.yml) runs lint and builds for pull requests and pushes to `main`. Each successful run produces a static web ZIP, a debug-signed Android APK, and an iOS Simulator ZIP. CI also compiles the iPhone target with signing disabled.

To publish a preview from a tested commit, push a version tag. GitHub Actions builds the tag and attaches all three files to a GitHub prerelease.

```sh
git tag v1.0.0
git push origin v1.0.0
```

The Android preview uses a fresh debug signing key per build. Installing these APKs as updates requires a shared signing key. The iOS ZIP is for Simulator, and physical devices require an Xcode build with your development team selected.
