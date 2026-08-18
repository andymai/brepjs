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
      reporter: ['text-summary', 'lcov'],
      // Floored at the measured coverage (2026-08-18), rounded down to whole
      // percents — the root-repo policy: measured numbers, not aspirations.
      // Re-measure and re-floor (npm run test:coverage) when the suite grows.
      thresholds: {
        statements: 81,
        branches: 63,
        functions: 91,
        lines: 85,
      },
    },
  },
});
