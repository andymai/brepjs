import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, '../../src') },
  },
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 90000,
    pool: 'forks',
    execArgv: ['--max-old-space-size=6144'],
    include: ['tests/**/*.test.ts'],
  },
});
