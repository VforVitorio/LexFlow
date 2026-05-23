// ESLint v9 flat config. Replaces the legacy `.eslintrc.cjs`.
// Keeps the same rule surface as before: TS recommended, react-hooks,
// react-refresh, plus the project-specific tweaks for unused vars and
// fast-refresh-friendly exports.

import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default [
  { ignores: ['dist', 'node_modules', 'eslint.config.js'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2020 },
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // TypeScript handles "is this identifier in scope?" — leaving the
      // ESLint rule on would flag every DOM type (`RequestInit`) and the
      // implicit `React` namespace used by TSX.
      'no-undef': 'off',
      // The codebase uses `cond && <JSX/>` and ternaries freely; both are
      // legitimate in render functions.
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowShortCircuit: true, allowTernary: true },
      ],
      // The mock API client exposes an async generator that yields via a
      // delegated for-await; ESLint cannot see through to the inner yield.
      'require-yield': 'off',
      // Pragmatic: a few `any`s remain in the mock layer until the typed
      // OpenAPI client lands (issue #65). Demote to warning so legitimate
      // typing work is still surfaced, not blocked.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
