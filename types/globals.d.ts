// Types for `npm run typecheck` (tsconfig.json): the globals that web/ shares with the native wrappers and between its
// own scripts. Nothing loads this file. It lives outside web/ because the Android and iOS builds package every file
// in web/.
//
// This is the contract in one place. Change it along with android/src/dev/maceiras/lifepod/MainActivity.kt,
// ios/LifePodApp.swift and the bridge lists in tests/helpers.mjs, which tests/native.test.mjs checks.

/** `window.LifePodAndroid`: MainActivity's GameBridge, one `@JavascriptInterface` method each. */
interface LifePodAndroidBridge {
  /** The saved game, as the JSON string writeGame last stored, or null before the first save. */
  readGame(): string | null;
  writeGame(game: string): void;
  /** Sets or clears FLAG_KEEP_SCREEN_ON. */
  keepAwake(enabled: boolean): void;
  /** A light tick, through the system's haptic settings. */
  haptic(): void;
  /** Whether the back gesture goes to the page (closeOpenDialog) rather than leaving the app. */
  setBackHandling(enabled: boolean): void;
}

/** A WKScriptMessageHandler that LifePodApp.swift registers with `controller.add(_:name:)`. */
interface LifePodMessageHandler<Message> {
  postMessage(message: Message): void;
}

/** `window.webkit.messageHandlers` in the iOS app. Elsewhere `window.webkit` is undefined. */
interface LifePodIosHandlers {
  /** Saves the game, as a JSON string. */
  game: LifePodMessageHandler<string>;
  /** Sets isIdleTimerDisabled. */
  keepAwake: LifePodMessageHandler<boolean>;
  /** A light tick, from a UISelectionFeedbackGenerator. */
  haptic: LifePodMessageHandler<null>;
}

/** The die on the dice sheet's stage, from `lifePodDice.stageDie`. */
interface LifePodDie {
  count: number;
  shadow: SVGSVGElement;
  die: SVGSVGElement;
  number: SVGElement;
  show(value: number): void;
  showIdle(): void;
}

/** web/dice.js, a classic script that loads before app.js, the module entry, and sets window.lifePodDice. */
interface LifePodDice {
  /** The dice the sheet offers, by their number of sides. */
  sides: number[];
  icon(count: number): SVGSVGElement;
  stageDie(count: number): LifePodDie;
  /** A uniform whole number from 1 to count. */
  randomFace(count: number): number;
  /** Rolls the stage die and returns a function that stops the roll early. */
  roll(stage: LifePodDie, options: { reducedMotion: boolean; onLand(result: number): void; done(): void }): () => void;
}

interface Window {
  /** The Android bridge, only in the Android app. */
  LifePodAndroid?: LifePodAndroidBridge;
  /** WebKit's message handlers, only in a WKWebView (the iOS app). */
  webkit?: { messageHandlers: LifePodIosHandlers };
  /** The saved game's JSON, injected at document start by the iOS app when it has one. */
  initialGame?: string;
  /** UIAccessibility.isReduceTransparencyEnabled, injected at document start by the iOS app. */
  initialReduceTransparency?: boolean;
  /** Set by app.js. The iOS app calls it when Reduce Transparency changes. */
  setReduceTransparency(reduce: boolean | undefined): void;
  /**
   * Set by app.js. The Android app calls it for the back gesture: it closes the top dialog, or leaves the open board
   * mode, and returns whether it handled the gesture.
   */
  closeOpenDialog(): boolean;
  lifePodDice: LifePodDice;
  /** Set by app.js only when the page's URL has ?debug: the internals the design scripts drive. */
  lifePodDebug?: { game: unknown; remind(index: number | null, kind: 'monarch' | 'initiative'): void };
}

// Lookups by selector. Every element the scripts look up by selector is an HTML element (the inline SVG icons are only
// reached as the children of one), so a string selector gives HTMLElement rather than the lib's Element. And the page's
// structure is fixed by index.html and its templates, so a lookup is typed as finding its element: one that misses is a
// bug that throws either way, and a check for a match that may be missing, such as `dialog[open]`, still compiles.
// strictNullChecks then covers what can really be null, such as a seat in the saved game.
// A bare tag name still gives its own element type, as in the lib.
interface ParentNode {
  querySelector<K extends keyof HTMLElementTagNameMap>(selectors: K): HTMLElementTagNameMap[K];
  querySelector<E extends Element = HTMLElement>(selectors: string): E;
  querySelectorAll<K extends keyof HTMLElementTagNameMap>(selectors: K): NodeListOf<HTMLElementTagNameMap[K]>;
  querySelectorAll<E extends Element = HTMLElement>(selectors: string): NodeListOf<E>;
}
interface Element {
  closest<K extends keyof HTMLElementTagNameMap>(selectors: K): HTMLElementTagNameMap[K];
  closest<E extends Element = HTMLElement>(selectors: string): E;
}

/** An element whose children are all E, such as the board's tiles or a row of choice buttons. */
interface HTMLParent<E extends HTMLElement = HTMLElement> extends HTMLElement {
  readonly children: HTMLCollectionOf<E>;
}
