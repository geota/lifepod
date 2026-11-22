// Browser compatibility for web/ against the browserslist floor in package.json: iOS 16 for WKWebView, and the
// Android System WebView as Chrome 111 and later. `npm run lint:compat` runs it, separately from eslint.config.mjs.
//
// compat/compat is an error. A line that uses a newer API behind a feature check says so in a
// `// eslint-disable-next-line compat/compat -- <the guard>` comment.
import compat from 'eslint-plugin-compat';
import globals from 'globals';

// eslint-plugin-compat misses these, which are errors now since web/ uses none of them. Each is newer than iOS 16.0;
// the number is the Safari version that added it. ecmaVersion 2022 already rejects newer syntax, such as the regular
// expression v flag. stylelint's doiuse data has gaps too: it doesn't know color-mix(), view transitions,
// @starting-style or text-wrap, so check those against the floor by hand.
const newerStatics = [
  ['Object', 'groupBy', '17.4'], ['Map', 'groupBy', '17.4'], ['Promise', 'withResolvers', '17.4'],
  ['Promise', 'try', '18.2'], ['Array', 'fromAsync', '16.4'], ['URL', 'canParse', '17'], ['URL', 'parse', '18'],
  ['AbortSignal', 'any', '17.4'], ['document', 'startViewTransition', '18'],
];
const newerMethods = [
  ['Set methods', '17', ['union', 'intersection', 'difference', 'symmetricDifference', 'isSubsetOf', 'isSupersetOf',
    'isDisjointFrom']],
  ['Popover', '17', ['showPopover', 'hidePopover', 'togglePopover']],
  ['checkVisibility', '17.4', ['checkVisibility']],
  ['isWellFormed and toWellFormed', '16.4', ['isWellFormed', 'toWellFormed']],
];

export default [
  {
    files: ['web/**/*.js'],
    plugins: { compat },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: globals.browser,
    },
    rules: {
      'compat/compat': 'error',
      'no-restricted-properties': ['error', ...newerStatics.map(([object, property, version]) => (
        { object, property, message: `Needs Safari ${version}; LifePod supports iOS 16.0.` }))],
      'no-restricted-globals': ['error',
        { name: 'Iterator', message: 'Iterator helpers need Safari 18.4; LifePod supports iOS 16.0.' }],
      'no-restricted-syntax': ['error', ...newerMethods.map(([feature, version, names]) => ({
        selector: `CallExpression > MemberExpression.callee > Identifier.property[name=/^(${names.join('|')})$/]`,
        message: `${feature}: needs Safari ${version}; LifePod supports iOS 16.0.`,
      }))],
    },
  },
];
