import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const appRequire = createRequire(import.meta.url);

// `vite preview` sends the headers Vercel sends for the page, so a check
// against the preview also proves the page works under the deployed CSP.
function deployedHeaders(): Record<string, string> {
  const config = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../vercel.json'), 'utf8')
  ) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
  const rule = config.headers.find((h) => h.source === '/mesh-to-solid(/.*)?');
  if (rule === undefined) throw new Error('vercel.json has no headers for /mesh-to-solid');
  return Object.fromEntries(rule.headers.map((h) => [h.key, h.value]));
}

// The site build (`build:site`) copies the build output under /mesh-to-solid.
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
  preview: { headers: deployedHeaders() },
  optimizeDeps: {
    // Emscripten glue: the dep optimizer would rewrite its import.meta.url lookups.
    exclude: ['occt-wasm'],
  },
});
