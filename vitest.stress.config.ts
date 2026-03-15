import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'brepkit-wasm': resolve(__dirname, 'node_modules/brepkit-wasm/brepkit_wasm_node.cjs'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 60000,
    pool: 'forks',
    execArgv: ['--max-old-space-size=6144'],
    include: ['tests/io-stress.test.ts'],
    env: { TEST_KERNEL: 'occt' },
  },
});
