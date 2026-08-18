import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ rollupTypes: false, compilerOptions: { declarationMap: false } })],
  build: {
    target: 'es2022',
    minify: false,
    lib: {
      entry: {
        'brepjs-families': 'src/index.ts',
        jsxRuntime: 'src/jsxRuntime.ts',
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['brepjs', 'zod'],
    },
  },
});
