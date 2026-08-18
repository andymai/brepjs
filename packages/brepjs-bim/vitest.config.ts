import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '../../src'),
      brepjs: resolve(__dirname, '../../src/index.ts'),
      'brepjs-families': resolve(__dirname, '../brepjs-families/src/index.ts'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 90000,
    pool: 'forks',
    execArgv: ['--max-old-space-size=6144'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Pure generated data (the IDS audit schema table): no logic to cover.
      exclude: ['src/ids/idsSchema.generated.ts'],
      reporter: ['text-summary', 'lcov'],
      // Floored at the measured coverage (2026-08-18), rounded down to whole
      // percents — the root-repo policy: measured numbers, not aspirations.
      // Re-measure and re-floor (npm run test:coverage) when the suite grows.
      // Re-floored 2026-08-18 after the IDS conformance engine landed: the
      // engine's primary gate is the official 334-case buildingSMART suite
      // run in CI (see packages-bim), which vitest coverage cannot see.
      thresholds: {
        statements: 78,
        branches: 58,
        functions: 89,
        lines: 82,
      },
    },
  },
});
