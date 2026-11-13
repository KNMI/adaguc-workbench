// ESLint 9 flat config. Replaces the old .eslintrc, which was built on
// eslint-config-airbnb - that config never supported ESLint 9, which kept
// this project on ESLint 8 (end of life since October 2024) and on old
// majors of typescript-eslint and eslint-plugin-react-hooks.
//
// Instead of airbnb's very large style rule set this uses each plugin's own
// recommended config, plus the handful of airbnb rules that catch real
// mistakes rather than enforce a style (see the "rules" section below).
// Formatting stays Prettier's job.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['coverage/**', 'dist/**', 'storybook-static/**', 'src/static/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'stories/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      react.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended,
    ],
    plugins: {
      'react-hooks': reactHooks,
      import: importPlugin,
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        // Runtime config, injected by webpack (see webpack.config.js).
        config: 'readonly',
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        node: { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
      },
    },
    rules: {
      // The classic hook rules plus the React Compiler ones (refs, purity,
      // immutability, ...), all as errors.
      ...Object.fromEntries(
        Object.keys(reactHooks.configs.flat.recommended.rules).map((rule) => [
          rule,
          'error',
        ]),
      ),
      // Off on purpose: it flags any state set synchronously in an effect,
      // which here is mostly deliberate - clearing old results before a
      // fetch the effect starts, or resetting local fields when a key
      // changes - in the larger panels (AutoWMS, QueryPanel, TimePanel,
      // WCSPanel). Satisfying it would mean restructuring those (e.g.
      // fetching through React Query instead) for one fewer render, in an
      // app that doesn't use the React Compiler.
      'react-hooks/set-state-in-effect': 'off',

      // Kept from airbnb: rules that catch actual bugs or real confusion.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'warn',
      'no-param-reassign': [
        'error',
        // Redux Toolkit reducers mutate an immer draft on purpose.
        { props: true, ignorePropertyModificationsForRegex: ['^draft'] },
      ],
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-use-before-define': [
        'error',
        { functions: false, classes: true, variables: true },
      ],
      'react/function-component-definition': [
        'error',
        {
          namedComponents: 'arrow-function',
          unnamedComponents: 'arrow-function',
        },
      ],
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: [
            '**/*.test.ts',
            '**/*.test.tsx',
            'src/setupTests.ts',
            'src/testUtils/**',
            'stories/**',
          ],
        },
      ],
      'import/no-duplicates': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@opengeoweb/webmap',
              importNames: ['getWMLayerById'],
              message:
                'Use getWMLayer (src/utils/getWMLayer.ts): it is typed to return undefined for an unknown layer id, which getWMLayerById also does.',
            },
          ],
        },
      ],
      'import/first': 'error',

      // Same as before: the codebase leans on loosely typed third-party
      // data (WMS capabilities, OpenLayers internals).
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: {
      // jest.mock() factories can't reference the file's own imports, so
      // pulling a module in with require() inside one is the standard
      // pattern there.
      '@typescript-eslint/no-require-imports': 'off',
      // Tests mock getWMLayerById itself (getWMLayer goes through it).
      'no-restricted-imports': 'off',
    },
  },
  // Must stay last: turns off every rule that conflicts with Prettier and
  // reports formatting differences as lint errors.
  prettierRecommended,
);
