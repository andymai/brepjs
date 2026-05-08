import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { kernelConfigs } from './tests/helpers/kernelRegistry.js';

/**
 * Tests excluded from all kernel projects:
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
  'apps/**',
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
    testTimeout: 90000,
    pool: 'forks',
    execArgv: ['--max-old-space-size=6144'],
    maxWorkers: 4,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/kernel/brepkit/**',
        'src/kernel/occtWasm/**',
        // geometry2d.ts is pure-TS 2D used by brepkit/occt-wasm, not by OCCT.
        // Excluded from OCCT coverage (the only enforced project). Covered
        // informally by brepkit/occt-wasm test runs.
        'src/kernel/geometry2d.ts',
      ],
      reporter: ['text', 'text-summary', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        statements: 84,
        // 74 reflects intentional skips for V8 RC4 regressions (PRs #605, #639, #641, commit 8c857d65).
        // Restore to 84 once those skips are removed.
        branches: 74,
        functions: 90,
        lines: 84,
      },
    },
    projects: kernelConfigs.map((k) => ({
      extends: true,
      test: {
        name: k.id,
        env: { TEST_KERNEL: k.id, ...(k.envOverrides ?? {}) },
        exclude: [...alwaysExclude, ...(k.excludeTests ?? [])],
        coverage: {
          reportsDirectory: `./coverage/${k.id}`,
          ...(k.coverageThresholds !== 'informational' && k.coverageThresholds
            ? { thresholds: k.coverageThresholds }
            : {}),
        },
      },
    })),
  },
});
