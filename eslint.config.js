import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

// ─── Shared rules (DRY: src/ and tests/ use the same base) ──────────

const sharedRules = {
  '@typescript-eslint/no-deprecated': 'warn',
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/consistent-type-imports': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
  '@typescript-eslint/no-unnecessary-condition': 'error',
  '@typescript-eslint/no-unsafe-assignment': 'off',
  '@typescript-eslint/no-unsafe-member-access': 'off',
  '@typescript-eslint/no-unsafe-call': 'off',
  '@typescript-eslint/no-unsafe-return': 'off',
  '@typescript-eslint/no-unsafe-argument': 'off',
  '@typescript-eslint/no-this-alias': 'error',
  '@typescript-eslint/prefer-readonly': 'error',
  // Require @ts-expect-error with "-- reason" format; ban @ts-ignore entirely
  '@typescript-eslint/ban-ts-comment': [
    'error',
    {
      'ts-expect-error': { descriptionFormat: '-- .+' },
      'ts-ignore': true,
      'ts-nocheck': true,
    },
  ],
  'prefer-const': 'error',
  eqeqeq: 'error',
  'no-var': 'error',
  'no-console': ['error', { allow: ['error', 'warn'] }],
};

// ─── Restricted syntax selectors ─────────────────────────────────────

const noMutableExport = {
  selector: 'ExportNamedDeclaration > VariableDeclaration[kind="let"]',
  message: 'Mutable exports (`export let`) are forbidden. Use a getter function or const instead.',
};

// ─── Config ──────────────────────────────────────────────────────────

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...sharedRules,
      'no-restricted-syntax': ['error', noMutableExport],
    },
  },
  // Kernel internal: suppress redundant-type-constituents since KernelShape=any is intentional
  {
    files: ['src/kernel/**/*.ts'],
    rules: {
      '@typescript-eslint/no-redundant-type-constituents': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.tests.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: sharedRules,
  },
  // Kernel abstraction boundary: ban direct .oc access and .wrapped calls outside kernel/ and core/
  {
    files: [
      'src/topology/**/*.ts',
      'src/operations/**/*.ts',
      'src/measurement/**/*.ts',
      'src/query/**/*.ts',
      'src/io/**/*.ts',
      'src/2d/**/*.ts',
      'src/sketching/**/*.ts',
      'src/projection/**/*.ts',
      'src/text/**/*.ts',
      'src/worker/**/*.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        noMutableExport,
        {
          selector: 'MemberExpression[property.name="oc"]',
          message:
            'Direct .oc access is banned in Layer 2+ code. Use KernelAdapter methods from getKernel() instead. See kernel/types.ts for available methods.',
        },
        {
          selector:
            'CallExpression[callee.type="MemberExpression"][callee.object.type="MemberExpression"][callee.object.property.name="wrapped"]',
          message:
            'Direct method calls on .wrapped are banned in Layer 2+ code. Use getKernel() methods instead. Shapes are opaque handles — pass them to kernel adapter methods.',
        },
      ],
    },
  },
  {
    ignores: [
      'dist/',
      'node_modules/',
      'src/kernel/wasm/',
      'vite.config.ts',
      'vitest.config.ts',
      'eslint.config.js',
    ],
  }
);
