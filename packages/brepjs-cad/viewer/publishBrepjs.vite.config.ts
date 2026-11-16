import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    // After the page build, into the same directory.
    outDir: 'dist/publish',
    emptyOutDir: false,
    chunkSizeWarningLimit: 3000,
    lib: {
      entry: fileURLToPath(new URL('./publishBrepjs.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'brepjs.js',
    },
    // One file: a bare import or a sibling chunk would not resolve next to a part module.
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
