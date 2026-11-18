import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    files: ['web/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: globals.browser,
    },
    rules: js.configs.recommended.rules,
  },
];
