import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    dts({
      rollupTypes: false,
    }),
  ],
  build: {
    target: 'es2022',
    minify: false,
    lib: {
      entry: {
        brepjs: resolve(__dirname, 'src/index.ts'),
        core: resolve(__dirname, 'src/core.ts'),
        topology: resolve(__dirname, 'src/topology.ts'),
        operations: resolve(__dirname, 'src/operations.ts'),
        '2d': resolve(__dirname, 'src/2d.ts'),
        sketching: resolve(__dirname, 'src/sketching.ts'),
        query: resolve(__dirname, 'src/query.ts'),
        measurement: resolve(__dirname, 'src/measurement.ts'),
        io: resolve(__dirname, 'src/io.ts'),
        worker: resolve(__dirname, 'src/worker.ts'),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['brepjs-opencascade', 'opentype.js'],
    },
  },
});
