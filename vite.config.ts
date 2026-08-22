import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
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
        brepjs: resolve(import.meta.dirname, 'src/index.ts'),
        core: resolve(import.meta.dirname, 'src/core.ts'),
        result: resolve(import.meta.dirname, 'src/result.ts'),
        vectors: resolve(import.meta.dirname, 'src/vectors.ts'),
        topology: resolve(import.meta.dirname, 'src/topology.ts'),
        operations: resolve(import.meta.dirname, 'src/operations.ts'),
        '2d': resolve(import.meta.dirname, 'src/2d.ts'),
        sketching: resolve(import.meta.dirname, 'src/sketching.ts'),
        text: resolve(import.meta.dirname, 'src/text.ts'),
        projection: resolve(import.meta.dirname, 'src/projection.ts'),
        query: resolve(import.meta.dirname, 'src/query.ts'),
        measurement: resolve(import.meta.dirname, 'src/measurement.ts'),
        io: resolve(import.meta.dirname, 'src/io.ts'),
        worker: resolve(import.meta.dirname, 'src/worker.ts'),
        shapeRef: resolve(import.meta.dirname, 'src/shapeRef.ts'),
        'kernel/occtWasm/occtWasmAdapter': resolve(
          import.meta.dirname,
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
