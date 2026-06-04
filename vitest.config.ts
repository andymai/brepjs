import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import {
  kernelConfigs,
  coverageExcludesFor,
  defaultKernelId,
} from './tests/helpers/kernelRegistry.js';

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
  'packages/**/node_modules/**',
  // brepjs-verify aliases `@` to its own src and runs via its own vitest config + CI job.
  'packages/brepjs-verify/**',
  // brepjs-viewer likewise aliases `@`→its own src and runs via its own vitest config + CI job.
  'packages/brepjs-viewer/**',
  'apps/**',
  '.worktrees/**',
];

// Default 4 — CI's sharded `test` job runs on 16 GB runners where OCCT WASM
// linear memory grows monotonically across a fork's files; more forks over-commit
// into swap and trip the per-test timeout (#1102). Overridable so a many-core,
// high-RAM machine can raise it locally without changing the CI default.
const parsedMaxWorkers = Number(process.env['VITEST_MAX_WORKERS']);
const maxWorkers =
  Number.isInteger(parsedMaxWorkers) && parsedMaxWorkers > 0 ? parsedMaxWorkers : 4;

export default defineConfig({
  resolve: {
    alias: {
      // Vite resolves the "import" exports condition by default, hitting the ESM
      // bundler entry that uses the unsupported WASM ESM integration proposal.
      // Alias to the Node CJS entry so brepkit tests run under vitest.
      '@': resolve(__dirname, 'src'),
      'brepkit-wasm': resolve(__dirname, 'node_modules/brepkit-wasm/brepkit_wasm_node.cjs'),
      // The voxel engine ships as a committed wasm-pack artifact; point the bare
      // specifier at the built ESM entry so voxel tests resolve it under vitest.
      'brepjs-voxel-wasm': resolve(__dirname, 'packages/brepjs-voxel-wasm/pkg/index.js'),
      // node_modules/brepjs is a stale published copy; route to live src.
      brepjs: resolve(__dirname, 'src/index.ts'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 90000,
    pool: 'forks',
    execArgv: ['--max-old-space-size=6144'],
    maxWorkers,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'text-summary', 'lcov'],
      reportsDirectory: './coverage',
      // Default-kernel excludes are applied at the root because vitest's
      // project-level coverage.exclude does not override the root list (yet);
      // see PR description. Source of truth lives in kernelRegistry.ts (the
      // default kernel) so adding/flipping a kernel doesn't require a vitest edit.
      exclude: ['src/**/*.d.ts', 'src/**/index.ts', ...coverageExcludesFor(defaultKernelId())],
      // Floored at the occt-wasm (default kernel) measured coverage, rounded down
      // to the nearest whole percent. These are the *measured* numbers for the
      // default project, not hand-tuned targets — branches at 71 is what occt-wasm
      // actually achieves, not a relaxed floor. occt-wasm's adapter-dir denominator
      // differs from occt's (different excluded files, different branch population),
      // so the 71 is NOT comparable to the prior occt 74 floor and does not imply a
      // coverage regression in shared code. Re-measure and re-floor (npm run
      // test:full) if the default kernel changes.
      thresholds: {
        statements: 85,
        branches: 71,
        functions: 91,
        lines: 88,
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
