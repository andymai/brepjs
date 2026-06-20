// This package imports only the public `brepjs` surface (never `.wrapped` or `@/` internals),
// so the root config's `no-restricted-syntax` rules banning those are intentionally not applied here.
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Never lint build output — `eslint src tests viewer` walks viewer/ which contains the emitted
  // viewer/dist after a build; type-checked rules choke on those un-projected .js chunks.
  { ignores: ['dist/**', 'viewer/dist/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    // The resolve hook is a hand-authored ESM file loaded off-thread by node:module
    // `register` — it is intentionally not part of any tsconfig project, so type-aware
    // rules can't run on it. Lint it with syntax-only rules.
    files: ['src/loader/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: { console: 'readonly' },
    },
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/prefer-readonly': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },
  {
    // The eval harness is a dev-only tsx script (never shipped in dist); its scorecard prints
    // to stdout, so `console.log` is allowed here unlike the published `src/`.
    files: ['bench/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './bench/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/prefer-readonly': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.test.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/prefer-readonly': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },
  {
    files: ['viewer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        HTMLCanvasElement: 'readonly',
      },
      parserOptions: {
        project: './viewer/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/prefer-readonly': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },
  {
    files: ['viewer/tests/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: './viewer/tsconfig.test.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/prefer-readonly': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  }
);
