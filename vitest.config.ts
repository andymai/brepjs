import { defineConfig } from 'vitest/config';

/**
 * OCCT-only tests — use `getKernel().oc` to access raw Emscripten/OCCT objects.
 * Excluded from the brepkit project.
 */
const occtOnlyTests = [
  // --- Raw oc.* API usage (getKernel().oc) ---
  'tests/fn-applyMatrix.test.ts',
  // 'tests/fn-booleanFns.test.ts', // unblocked for brepkit
  'tests/fn-cast.test.ts',
  // 'tests/fn-compoundOpsFns.test.ts', // unblocked for brepkit
  'tests/fn-disposal.test.ts',
  'tests/fn-extrudeFns.test.ts',
  'tests/fn-guidedSweepFns.test.ts',
  'tests/fn-hullFns.test.ts',
  'tests/fn-igesFns.test.ts',
  'tests/fn-interferenceFns.test.ts',
  'tests/fn-kernelExpansion.test.ts',
  'tests/fn-measureFns.test.ts',
  'tests/fn-meshFns.test.ts',
  'tests/fn-minkowskiFns.test.ts',
  // 'tests/fn-modifierFns.test.ts', // unblocked for brepkit
  'tests/fn-multiSweepFns.test.ts',
  'tests/geometry.test.ts',
  // --- 0% brepkit pass rate (fully unimplemented features) ---
  'tests/fn-blueprintFns.test.ts',
  'tests/fn-examples.test.ts',
  'tests/fn-exporterFns.test.ts',
  'tests/fn-occtBoundary.test.ts',
  'tests/fn-offsetWire2D.test.ts',
  'tests/fn-sectionToFace.test.ts',
  'tests/fn-variableFillet.test.ts',
  // --- Direct kernel-ops imports (OCCT-specific transformOps/measureOps) ---
  'tests/fn-batchOps.test.ts',
];

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
          exclude: [...occtOnlyTests, ...alwaysExclude],
        },
      },
    ],
  },
});
