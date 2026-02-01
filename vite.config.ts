import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    dts({
      rollupTypes: true,
    }),
  ],
  build: {
    target: 'es2022',
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'brepjs',
      formats: ['es', 'cjs'],
      fileName: 'brepjs',
    },
    rollupOptions: {
      external: ['brepjs-opencascade', 'opentype.js'],
    },
  },
});
