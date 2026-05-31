import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      brepjs: resolve(__dirname, '../../src/index.ts'),
    },
  },
  test: {
    globals: true,
    testTimeout: 90000,
    pool: 'forks',
    execArgv: ['--max-old-space-size=6144'],
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['tests/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'viewer',
          include: ['viewer/tests/**/*.test.ts'],
          environment: 'jsdom',
        },
      },
    ],
  },
});
