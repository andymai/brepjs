import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [dts({ rollupTypes: false, compilerOptions: { declarationMap: false } })],
  build: {
    target: 'es2022',
    minify: false,
    lib: {
      entry: { 'brepjs-mesh2cad': resolve(import.meta.dirname, 'src/index.ts') },
      // ESM only: the loader needs import.meta.url, and the wasm engine is ESM.
      formats: ['es'],
    },
    rollupOptions: {
      external: ['brepjs', 'brepjs-mesh2cad-wasm', /^node:/],
    },
  },
});
