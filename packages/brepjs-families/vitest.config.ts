import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Array form: the jsx-runtime entry must win before the bare package
    // prefix, so the automatic-JSX import resolves to source.
    alias: [
      {
        find: 'brepjs-families/jsx-dev-runtime',
        replacement: resolve(import.meta.dirname, 'src/jsxRuntime.ts'),
      },
      {
        find: 'brepjs-families/jsx-runtime',
        replacement: resolve(import.meta.dirname, 'src/jsxRuntime.ts'),
      },
      { find: 'brepjs-families', replacement: resolve(import.meta.dirname, 'src/index.ts') },
      { find: 'brepjs', replacement: resolve(import.meta.dirname, '../../src/index.ts') },
      { find: '@', replacement: resolve(import.meta.dirname, '../../src') },
    ],
  },
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'brepjs-families' },
  },
  test: {
    globals: true,
    testTimeout: 90000,
    pool: 'forks',
    execArgv: ['--max-old-space-size=6144'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
