import js from '@eslint/js';
import globals from 'globals';

const sharedRules = {
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
};

export default [
  js.configs.recommended,
  {
    ignores: ['dist/', 'node_modules/'],
  },
  {
    files: ['src/background/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.serviceworker,
        chrome: 'readonly',
        AbortController: 'readonly',
      },
    },
    rules: sharedRules,
  },
  {
    files: [
      'src/content/**/*.js',
      'src/shared/**/*.js',
      'src/nexus/**/*.js',
      'src/storage/**/*.js',
      'src/options/**/*.js',
      'src/popup/**/*.js',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        chrome: 'readonly',
      },
    },
    rules: sharedRules,
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        chrome: 'readonly',
      },
    },
    rules: sharedRules,
  },
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: sharedRules,
  },
];
