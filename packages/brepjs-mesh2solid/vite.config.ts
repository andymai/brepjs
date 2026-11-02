import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [dts({ rollupTypes: false, compilerOptions: { declarationMap: false } })],
  build: {
    target: 'es2022',
    minify: false,
    lib: {
      entry: { 'brepjs-mesh2solid': resolve(import.meta.dirname, 'src/index.ts') },
      // ESM only: the loader needs import.meta.url, and the wasm engine is ESM.
      formats: ['es'],
    },
    rollupOptions: {
      // The wasm-bindgen glue stays a separate file so its `new URL('index_bg.wasm',
      // import.meta.url)` keeps pointing at the wasm shipped beside it in wasm/.
      external: ['brepjs', /\/wasm\/index\.js$/, /^node:/],
    },
  },
});
