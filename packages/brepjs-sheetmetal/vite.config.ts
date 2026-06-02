import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [dts({ rollupTypes: false, compilerOptions: { declarationMap: false } })],
  build: {
    target: 'es2022',
    minify: false,
    lib: {
      entry: { 'brepjs-sheetmetal': resolve(__dirname, 'src/index.ts') },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['brepjs'],
    },
  },
});
