import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

/**
 * Tests excluded from both kernel projects:
 * - brepkit-only tests that use a mock BrepKernel or brepkit-only setup
 * - cross-kernel comparison tests that manage their own dual-kernel init
 * - standard non-test directories
 */
const alwaysExclude = [
  'tests/brepkitAdapter.test.ts',
  'tests/brepkit-adapter.test.ts',
  'tests/brepkit-validation.test.ts',
  'tests/kernel-agreement.test.ts',
  'tests/io-stress.test.ts',
  'benchmarks/**',
  'node_modules/**',
  'site/**',
  '.worktrees/**',
];

export default defineConfig({
  resolve: {
    alias: {
      // Vite resolves the "import" exports condition by default, hitting the ESM
      // bundler entry that uses the unsupported WASM ESM integration proposal.
      // Alias to the Node CJS entry so brepkit tests run under vitest.
      '@': resolve(__dirname, 'src'),
      'brepkit-wasm': resolve(__dirname, 'node_modules/brepkit-wasm/brepkit_wasm_node.cjs'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    pool: 'forks',
    execArgv: ['--max-old-space-size=6144'],
    maxWorkers: 4,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts', 'src/kernel/brepkit/**'],
      reporter: ['text', 'text-summary', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        statements: 84,
        branches: 76,
        functions: 90,
        lines: 84,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'occt',
          env: { TEST_KERNEL: 'occt' },
          exclude: [...alwaysExclude],
        },
      },
      {
        extends: true,
        test: {
          name: 'brepkit',
          env: { TEST_KERNEL: 'brepkit' },
          exclude: [...alwaysExclude],
        },
      },
    ],
  },
});
