// Browser compatibility for web/ against the browserslist floor in package.json: iOS 18 for WKWebView, and the
// Android System WebView as Chrome 111 and later. `npm run lint:compat` runs it, separately from eslint.config.mjs.
//
// compat/compat is an error. A line that uses a newer API behind a feature check says so in a
// `// eslint-disable-next-line compat/compat -- <the guard>` comment.
import compat from 'eslint-plugin-compat';
import globals from 'globals';

// eslint-plugin-compat misses these, which are errors now since web/ uses none of them. Each is newer than iOS 18.0 or
// Chrome 111; the note names the engine that lacks it and the version that added it (MDN browser-compat-data).
// ecmaVersion 2023 already rejects newer syntax, such as the regular expression v flag (Chrome 112). stylelint's doiuse
// data has gaps too: it doesn't know color-mix(), view transitions, @starting-style or text-wrap, so check those
// against the floor by hand.
const newerStatics = [
  ['Object', 'groupBy', 'Chrome 117'], ['Map', 'groupBy', 'Chrome 117'], ['Promise', 'withResolvers', 'Chrome 119'],
  ['Promise', 'try', 'Safari 18.2 and Chrome 128'], ['Array', 'fromAsync', 'Chrome 121'],
  ['URL', 'canParse', 'Chrome 120'], ['URL', 'parse', 'Chrome 126'], ['AbortSignal', 'any', 'Chrome 116'],
];
const newerMethods = [
  ['Set methods', 'Chrome 122', ['union', 'intersection', 'difference', 'symmetricDifference', 'isSubsetOf',
    'isSupersetOf', 'isDisjointFrom']],
  ['Popover', 'Chrome 114', ['showPopover', 'hidePopover', 'togglePopover']],
];
const floor = 'LifePod supports iOS 18.0 and Chrome 111';

export default [
  {
    files: ['web/**/*.js'],
    plugins: { compat },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: globals.browser,
    },
    rules: {
      'compat/compat': 'error',
      'no-restricted-properties': ['error', ...newerStatics.map(([object, property, version]) => (
        { object, property, message: `Needs ${version}; ${floor}.` }))],
      'no-restricted-globals': ['error',
        { name: 'Iterator', message: `Iterator helpers need Safari 18.4 and Chrome 122; ${floor}.` }],
      'no-restricted-syntax': ['error', ...newerMethods.map(([feature, version, names]) => ({
        selector: `CallExpression > MemberExpression.callee > Identifier.property[name=/^(${names.join('|')})$/]`,
        message: `${feature}: needs ${version}; ${floor}.`,
      }))],
    },
  },
];
