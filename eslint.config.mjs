import js from '@eslint/js';
import compat from 'eslint-plugin-compat';
import globals from 'globals';

// AGENTS.md "Modules": imports run one way through web/js/, from logic/ to sheets/, then app.js; ui/ and state/ sit side
// by side after logic/ and don't import each other. Each folder may import from its own folder and the ones it lists.
const importsFrom = {
  logic: [],
  ui: ['logic'],
  state: ['logic'],
  layout: ['logic', 'ui', 'state'],
  render: ['logic', 'ui', 'state', 'layout'],
  actions: ['logic', 'ui', 'state', 'layout', 'render'],
  sheets: ['logic', 'ui', 'state', 'layout', 'render', 'actions'],
};
const folders = Object.keys(importsFrom);
const boundaries = Object.entries(importsFrom).map(([folder, allowed]) => ({
  files: [`web/js/${folder}/**/*.js`],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: [...folders.filter(other => other !== folder && !allowed.includes(other)).map(other => `../${other}/*`), '../../*'],
        message: `web/js/${folder}/ imports only from its own folder${allowed.length ? ` and ${allowed.join(', ')}` : ''} (AGENTS.md, Modules).`,
      }],
    }],
  },
}));

export default [
  {
    files: ['web/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.browser,
    },
    // compat/compat checks web/ against the browserslist floor, as in eslint.compat.config.mjs. It runs here too, so
    // the comments that allow it on a feature-detected line are used in both runs rather than reported as unused.
    plugins: { compat },
    rules: { ...js.configs.recommended.rules, 'compat/compat': 'error' },
  },
  // Keep a module under about 500 lines (AGENTS.md).
  {
    files: ['web/js/**/*.js'],
    rules: { 'max-lines': ['error', { max: 500, skipComments: true, skipBlankLines: true }] },
  },
  ...boundaries,
  // app.js and web/js/ are ES modules; dice.js is still a classic script, which sets window.lifePodDice.
  {
    files: ['web/dice.js'],
    languageOptions: { sourceType: 'script' },
  },
];
