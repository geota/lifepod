import js from '@eslint/js';
import compat from 'eslint-plugin-compat';
import globals from 'globals';

export default [
  {
    files: ['web/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: globals.browser,
    },
    // compat/compat checks web/ against the browserslist floor, as in eslint.compat.config.mjs. It runs here too, so
    // the comments that allow it on a feature-detected line are used in both runs rather than reported as unused.
    plugins: { compat },
    rules: { ...js.configs.recommended.rules, 'compat/compat': 'error' },
  },
];
