import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, '../dist/webview'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Fixed names so the extension's HTML template can reference them without hashing
        entryFileNames: 'main.js',
        chunkFileNames: 'chunk-[hash].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  // Exclude brepjs so it doesn't accidentally get bundled into the webview
  optimizeDeps: { exclude: ['brepjs', 'occt-wasm'] },
});
