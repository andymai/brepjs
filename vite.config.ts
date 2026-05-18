import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    dts({
      rollupTypes: false,
      compilerOptions: { declarationMap: false },
    }),
  ],
  build: {
    target: 'es2022',
    // minify: false — library convention; consumers handle minification in their own build
    minify: false,
    lib: {
      entry: {
        brepjs: resolve(__dirname, 'src/index.ts'),
        core: resolve(__dirname, 'src/core.ts'),
        result: resolve(__dirname, 'src/result.ts'),
        vectors: resolve(__dirname, 'src/vectors.ts'),
        topology: resolve(__dirname, 'src/topology.ts'),
        operations: resolve(__dirname, 'src/operations.ts'),
        '2d': resolve(__dirname, 'src/2d.ts'),
        sketching: resolve(__dirname, 'src/sketching.ts'),
        text: resolve(__dirname, 'src/text.ts'),
        projection: resolve(__dirname, 'src/projection.ts'),
        query: resolve(__dirname, 'src/query.ts'),
        measurement: resolve(__dirname, 'src/measurement.ts'),
        io: resolve(__dirname, 'src/io.ts'),
        worker: resolve(__dirname, 'src/worker.ts'),
        shapeRef: resolve(__dirname, 'src/shapeRef.ts'),
        'kernel/occtWasm/occtWasmAdapter': resolve(
          __dirname,
          'src/kernel/occtWasm/occtWasmAdapter.ts'
        ),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['brepjs-opencascade', 'occt-wasm', 'opentype.js'],
    },
  },
});
