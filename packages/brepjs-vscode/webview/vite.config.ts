import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, '../dist/webview'),
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
  optimizeDeps: { exclude: ['brepjs', 'brepjs-opencascade'] },
});
