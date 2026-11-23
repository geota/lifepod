// The platform under the page: the Android and iOS bridges (types/globals.d.ts) or the browser's storage, wake lock and
// vibration in their place, and the screen's orientation and the media queries the board follows. Every call the page
// makes to a native bridge is here.

/** @typedef {import('../logic/data.js').QuarterTurn} QuarterTurn */

const storageKey = 'lifepod-game';
export const android = window.LifePodAndroid;
// The iOS app is the WKWebView with LifePodApp's game handler. Another WKWebView host, such as an in-app browser, can
// have message handlers of its own, and the page then runs as in a browser (DEEP-DIVE D4).
export const ios = window.webkit?.messageHandlers?.game ? window.webkit.messageHandlers : undefined;
export const portraitQuery = window.matchMedia('(orientation: portrait)');
export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
// The Style setting's default until the player picks one (data.js's styleOrder): Glass in the iOS app, and Material on
// Android and in browsers.
export const defaultStyle = ios ? 'glass' : 'material';
let lock;
let requestingLock = false;

// Read the size directly. Media queries can lag a resize in WebKit.
export function isPortraitWindow() {
  return window.innerHeight > window.innerWidth;
}

function normalizeAngle(angle) {
  return ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
}

// The angle the OS has turned the screen clockwise from the device's natural orientation.
export function readScreen() {
  const { angle, type } = window.screen.orientation;
  return { angle: normalizeAngle(angle), landscape: type.startsWith('landscape') };
}

// The screen angle that shows the board upright in landscape, so the seats can stay fixed to the device.
/** @returns {QuarterTurn} */
export function currentLandscapeAngle() {
  const { angle, landscape } = readScreen();
  return /** @type {QuarterTurn} */ (landscape ? angle : (angle + 90) % 360);
}

// Keeps the screen awake while keepAwake() says so. It's asked again once a browser's wake lock arrives, since the
// setting can change while the request is pending.
/** @param {() => boolean} keepAwake */
export async function syncWakeLock(keepAwake) {
  if (android) {
    android.keepAwake(keepAwake());
    return;
  }
  if (ios) {
    ios.keepAwake.postMessage(keepAwake());
    return;
  }
  if (!keepAwake() || document.hidden) {
    if (lock) await lock.release();
    return;
  }
  if (lock || requestingLock) return;
  try {
    requestingLock = true;
    // Outside a secure context there is no navigator.wakeLock; that throws here and is caught like a refusal.
    const acquired = await navigator.wakeLock.request('screen');
    if (keepAwake() && !document.hidden) {
      lock = acquired;
      acquired.addEventListener('release', () => { lock = undefined; }, { once: true });
    } else {
      await acquired.release();
    }
  } catch {
    // A browser or device may decline a screen wake lock.
  } finally {
    requestingLock = false;
  }
}

// A light tick for each counted change. Phones follow their own system haptics settings.
export function haptic() {
  if (android) android.haptic?.();
  else if (ios) ios.haptic?.postMessage(null);
  else navigator.vibrate?.(8);
}

// Reduce Transparency on iOS, whose WebKit has no prefers-reduced-transparency: LifePodApp.swift injects
// window.initialReduceTransparency before the page loads and calls window.setReduceTransparency when it changes. Glass
// treats data-reduce-transparency like the media query, with solid surfaces.
/**
 * @param {boolean | undefined} reduce
 */
export function setReduceTransparency(reduce) {
  document.documentElement.toggleAttribute('data-reduce-transparency', reduce === true);
}

// The system's text size, as a scale of the default (ACCESSIBILITY.md H1): Dynamic Type on iOS, which LifePodApp.swift
// injects as window.initialTextScale and passes to window.setTextScale when it changes, and the font scale on Android,
// which the bridge reports (the WebView's own text zoom is off, so it can't scale the fitted board). Settings and
// dialogs grow their type with it (--text-scale in styles.css), up to twice the size; smaller sizes keep the default.
/** @returns {number | undefined} */
export function systemTextScale() {
  return android ? android.textScale?.() : window.initialTextScale;
}
/** @param {number | undefined} scale */
export function setTextScale(scale) {
  const clamped = Number.isFinite(scale) ? Math.min(2, Math.max(1, /** @type {number} */ (scale))) : 1;
  document.documentElement.style.setProperty('--text-scale', String(clamped));
}

// The saved game's JSON, from wherever the platform keeps it: null or undefined before the first save.
export function readSavedGame() {
  return android ? android.readGame() : ios ? window.initialGame : localStorage.getItem(storageKey);
}

export function writeSavedGame(snapshot) {
  if (android) android.writeGame(snapshot);
  else if (ios) ios.game.postMessage(snapshot);
  else {
    try { localStorage.setItem(storageKey, snapshot); }
    catch { /* The current game still works if browser storage is disabled. */ }
  }
}

// Whether Android's back gesture goes to the page (window.closeOpenDialog) rather than leaving the app.
/** @param {boolean} enabled */
export function setBackHandling(enabled) {
  android?.setBackHandling?.(enabled);
}
