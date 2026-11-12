'use strict';
const js = require('@eslint/js');
const globals = require('globals');

// One ESLint setup for the whole project: the Node.js backend and its tests,
// the browser code in public/, the offline service worker, and the k6 load
// tests. Third party files (public/vendor) are not ours and are skipped.
module.exports = [
  { ignores: ['node_modules/**', 'coverage/**', 'reports/**', 'public/vendor/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node, ...globals.jest } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    // Browser code: plain scripts loaded by the pages.
    files: ['public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
  },
  {
    // The ticket check rule runs in the browser and in the Node tests.
    files: ['public/handheld/verify.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.commonjs } },
  },
  {
    files: ['public/tte-sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    // k6 load tests: ES modules with k6's own globals.
    files: ['load/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { __ENV: 'readonly', __VU: 'readonly', __ITER: 'readonly', console: 'readonly' } },
  },
];
