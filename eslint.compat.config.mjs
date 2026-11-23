// Browser compatibility for web/ against the browserslist floor in package.json: iOS 18 for WKWebView, and the
// Android System WebView as Chrome 129 and later. `npm run lint:compat` runs it, separately from eslint.config.mjs.
//
// compat/compat is an error. A line that uses a newer API behind a feature check says so in a
// `// eslint-disable-next-line compat/compat -- <the guard>` comment.
import compat from 'eslint-plugin-compat';
import globals from 'globals';

// eslint-plugin-compat misses these, which are errors now since web/ uses none of them. Each is newer than iOS 18.0 or
// Chrome 129; the note names what lacks it and the version that added it (MDN browser-compat-data). ecmaVersion 2024
// already rejects newer syntax, such as regular expression modifiers. stylelint's doiuse data has gaps too: it doesn't
// know color-mix(), view transitions, @starting-style or text-wrap, so check those against the floor by hand.
const newerStatics = [
  ['Promise', 'try', 'Safari 18.2'], ['RegExp', 'escape', 'Safari 18.2 and Chrome 136'],
  ['Error', 'isError', 'Safari 18.4 and Chrome 134'], ['Uint8Array', 'fromBase64', 'Safari 18.2 and Chrome 140'],
  ['Uint8Array', 'fromHex', 'Safari 18.2 and Chrome 140'], ['Math', 'f16round', 'Safari 18.2 and Chrome 135'],
];
const newerMethods = [
  ['Uint8Array base64 and hex', 'Safari 18.2 and Chrome 140', ['toBase64', 'toHex', 'setFromBase64', 'setFromHex']],
];
const floor = 'LifePod supports iOS 18.0 and Chrome 129';

export default [
  {
    files: ['web/**/*.js'],
    plugins: { compat },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      'compat/compat': 'error',
      'no-restricted-properties': ['error', ...newerStatics.map(([object, property, version]) => (
        { object, property, message: `Needs ${version}; ${floor}.` }))],
      'no-restricted-globals': ['error',
        { name: 'Iterator', message: `Iterator helpers need Safari 18.4; ${floor}.` },
        { name: 'Float16Array', message: `Needs Safari 18.2 and Chrome 135; ${floor}.` }],
      'no-restricted-syntax': ['error', ...newerMethods.map(([feature, version, names]) => ({
        selector: `CallExpression > MemberExpression.callee > Identifier.property[name=/^(${names.join('|')})$/]`,
        message: `${feature}: needs ${version}; ${floor}.`,
      }))],
    },
  },
  {
    files: ['web/dice.js'],
    languageOptions: { sourceType: 'script' },
  },
];
