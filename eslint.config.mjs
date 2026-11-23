import js from '@eslint/js';
import compat from 'eslint-plugin-compat';
import globals from 'globals';

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
  // app.js and web/js/ are ES modules; dice.js is still a classic script, which sets window.lifePodDice.
  {
    files: ['web/dice.js'],
    languageOptions: { sourceType: 'script' },
  },
];
