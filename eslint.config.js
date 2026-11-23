import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'web/dist/**', 'web/public/**', 'art/build/**', 'artifacts/**', 'archive/**', '.worktrees/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ['web/src/**/*.{js,ts,tsx}'], languageOptions: { globals: globals.browser } },
  { files: ['server/**/*.ts', 'scripts/*.mjs', 'docs/evidence/**/*.mjs', '*.js', 'web/vite.config.ts'], languageOptions: { globals: globals.node } },
  { files: ['tests/**/*.{ts,mjs}'], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  { files: ['**/*.{js,mjs}'], rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
  {
    files: ['web/src/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['three', 'three/*', '**/engine/scene*', '**/engine/places/*', '**/engine/FocusBlur*'], message: 'Use the typed engine/index.ts facade from the UI.' }] }],
    },
  },
];
