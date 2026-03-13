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
  'benchmarks/**',
  'node_modules/**',
  'site/**',
  '.worktrees/**',
];

export default defineConfig({
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
      exclude: ['src/**/*.d.ts', 'src/**/index.ts', 'src/kernel/brepkit*.ts'],
      reporter: ['text', 'text-summary', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        statements: 84,
        branches: 73,
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
