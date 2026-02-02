import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    poolOptions: {
      threads: {
        execArgv: ['--max-old-space-size=6144'],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
      reporter: ['text', 'text-summary', 'lcov'],
      reportsDirectory: './coverage',
    },
  },
});
