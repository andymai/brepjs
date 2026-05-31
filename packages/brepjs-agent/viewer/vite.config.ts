import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream, existsSync, mkdirSync, copyFileSync } from 'node:fs';

const WASM_FILES = ['brepjs_single.js', 'brepjs_single.wasm'];
const WASM_PROBE = 'brepjs_single.js';

// Serve/copy the brepjs-opencascade WASM under `wasm/` — the worker fetches
// `wasm/brepjs_single.js` relative to the viewer base. Mirrors apps/playground/vite.config.ts:21-63.
function opencascadeWasm(): Plugin {
  const local = resolve(fileURLToPath(new URL('../../brepjs-opencascade/src', import.meta.url)));
  const wasmDir = existsSync(resolve(local, WASM_PROBE))
    ? local
    : resolve(fileURLToPath(new URL('../node_modules/brepjs-opencascade/src', import.meta.url)));
  return {
    name: 'opencascade-wasm',
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
  plugins: [react(), opencascadeWasm()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: { exclude: ['brepjs', 'brepjs-opencascade'] },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  worker: { format: 'es' },
});
