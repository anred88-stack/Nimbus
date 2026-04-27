// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'build/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'storybook-static/**',
      '.vite/**',
      '.pnpm-store/**',
      'public/**',
    ],
  },

  // Base JS + TS strict type-checked + stylistic
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Project-wide TS/TSX rules
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      // react-hooks (explicit to avoid plugin API drift across versions)
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // react-refresh (HMR safety)
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // jsx-a11y recommended (WCAG AA critical) — spread the flat recommended rules
      ...jsxA11y.flatConfigs.recommended.rules,

      // Type imports: force `import type` for types
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports' },
      ],

      // Hard bans
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Allow intentional void-returning expressions (useful for async event handlers)
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
    },
  },

  // LAYER 2 ISOLATION: src/physics/** must be headless.
  // Blocks React, ReactDOM, Cesium, Three, @react-three/* imports.
  // See docs/ARCHITECTURE.md for rationale.
  {
    files: ['src/physics/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message:
                'Physics layer must be headless (no React). Move UI state to src/store/ or src/ui/.',
            },
            {
              name: 'react-dom',
              message: 'Physics layer must be headless (no ReactDOM).',
            },
            {
              name: 'cesium',
              message: 'Physics layer must be headless (no Cesium). Move to src/scene/globe/.',
            },
            {
              name: 'three',
              message: 'Physics layer must be headless (no Three). Move to src/scene/stage/.',
            },
          ],
          patterns: [
            {
              group: ['@react-three/*'],
              message:
                'Physics layer must be headless (no R3F/drei/postprocessing). Move to src/scene/stage/.',
            },
            {
              group: ['cesium/*'],
              message: 'Physics layer must be headless (no Cesium subpaths).',
            },
            {
              group: ['three/*'],
              message: 'Physics layer must be headless (no Three subpaths).',
            },
          ],
        },
      ],
    },
  },

  // Test files: relaxations
  {
    files: ['**/*.test.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  // Config files: not part of project tsconfig include -> disable type-checked rules
  {
    files: ['**/*.config.{js,ts,mjs,cjs}', 'eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  }
);
