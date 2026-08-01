import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import next from 'eslint-config-next'
import prettier from 'eslint-config-prettier'

/**
 * Orbit — lint configuration.
 *
 * Beyond the usual hygiene, two rule groups exist to protect guarantees the
 * earlier phases committed to and which ordinary review would not reliably catch:
 *
 *   §domain purity   the interest engine must be deterministic (PRD E-02), so
 *                    ambient time and randomness are banned outright inside
 *                    src/domain. `asOf` is always an input.
 *
 *   §money safety    money is bigint minor units (PRD M-01). Float arithmetic
 *                    and float parsing are banned wherever amounts are handled.
 */
export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'out/**', 'build/**', 'coverage/**', 'src/generated/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...next,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // -------------------------------------------------------------------------
  // domain purity — PRD E-02, E-13; Phase 4 §6.1
  // -------------------------------------------------------------------------
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'domain is deterministic: take an `asOf` input rather than reading the clock (PRD E-02).' },
        { name: 'fetch', message: 'domain performs no I/O.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'domain is deterministic: take an `asOf` input rather than reading the clock (PRD E-02).',
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'domain is deterministic: take an `asOf` input rather than reading the clock (PRD E-02).',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'domain is deterministic: randomness must be injected, never sourced.',
        },
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message: 'Money is bigint minor units. Float parsing is banned in domain (PRD M-01).',
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // money safety — PRD M-01
  // -------------------------------------------------------------------------
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "BinaryExpression[operator=/^[*/]$/] > Identifier[name=/[Mm]inor$/]",
          message:
            'Multiplying or dividing a minor-unit amount risks precision loss. Use the helpers in @/domain/money (PRD M-04).',
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // Tests may do what production code may not
  // -------------------------------------------------------------------------
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-globals': 'off',
      'no-console': 'off',
    },
  },

  prettier,
)
