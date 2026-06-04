import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createReadStream, existsSync, mkdirSync, copyFileSync } from 'node:fs';

const viewerRequire = createRequire(import.meta.url);

const WASM_FILES = ['occt-wasm.js', 'occt-wasm.wasm'];

// Serve/copy the occt-wasm WASM under `wasm/` — the worker fetches
// `wasm/occt-wasm.js` relative to the viewer base. Mirrors apps/playground/vite.config.ts:24-65.
function occtWasm(): Plugin {
  // Resolve the occt-wasm dist dir (the package's exports map exposes
  // ./dist/occt-wasm.js and ./dist/occt-wasm.wasm).
  const wasmDir = dirname(viewerRequire.resolve('occt-wasm/dist/occt-wasm.js'));
  return {
    name: 'occt-wasm',
    configureServer(server) {
      server.middlewares.use('/wasm', (req, res, next) => {
        const file = req.url?.slice(1) ?? '';
        if (!WASM_FILES.includes(file)) return next();
        const filePath = resolve(wasmDir, file);
        if (!existsSync(filePath)) return next();
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader(
          'Content-Type',
          file.endsWith('.wasm') ? 'application/wasm' : 'application/javascript'
        );
        createReadStream(filePath).pipe(res);
      });
    },
    writeBundle({ dir }) {
      if (!dir) return;
      const out = resolve(dir, 'wasm');
      mkdirSync(out, { recursive: true });
      for (const f of WASM_FILES) copyFileSync(resolve(wasmDir, f), resolve(out, f));
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react(), occtWasm()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: { exclude: ['brepjs', 'occt-wasm'] },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  worker: { format: 'es' },
});
