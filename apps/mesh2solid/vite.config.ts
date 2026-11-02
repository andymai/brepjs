import { createRequire } from 'module';
import { dirname } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const appRequire = createRequire(import.meta.url);

// Served under brepjs.dev/mesh-to-solid once released; until then the site
// build (`build:site`) does not include it.
export default defineConfig({
  base: '/mesh-to-solid/',
  plugins: [react()],
  worker: { format: 'es' },
  resolve: {
    // One physical copy of React and react-three-fiber, as in the playground:
    // brepjs-viewer imports them too, and npm may hoist either copy.
    alias: {
      react: dirname(appRequire.resolve('react/package.json')),
      'react-dom': dirname(appRequire.resolve('react-dom/package.json')),
      '@react-three/fiber': dirname(appRequire.resolve('@react-three/fiber/package.json')),
    },
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    // Emscripten glue: the dep optimizer would rewrite its import.meta.url lookups.
    exclude: ['occt-wasm'],
  },
});
