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
        query: resolve(__dirname, 'src/query.ts'),
        measurement: resolve(__dirname, 'src/measurement.ts'),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['brepjs-opencascade', 'opentype.js'],
    },
  },
});
