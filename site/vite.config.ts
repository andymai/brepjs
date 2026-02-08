import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { createReadStream, existsSync, mkdirSync, copyFileSync } from 'fs';

const WASM_FILES = [
  'brepjs_threaded.js',
  'brepjs_threaded.wasm',
  'brepjs_threaded.worker.js',
  'brepjs_single.js',
  'brepjs_single.wasm',
];

function opencascadeWasm(): Plugin {
  // Prefer local monorepo path, fall back to node_modules
  const local = resolve('../packages/brepjs-opencascade/src');
  const wasmDir = existsSync(resolve(local, WASM_FILES[0]))
    ? local
    : resolve('node_modules/brepjs-opencascade/src');

  return {
    name: 'opencascade-wasm',
    configureServer(server) {
      server.middlewares.use('/wasm', (req, res, next) => {
        const file = req.url?.slice(1) ?? '';
        if (!WASM_FILES.includes(file)) return next();
        const filePath = resolve(wasmDir, file);
        if (!existsSync(filePath)) return next();

        // Set COEP/COOP headers required for SharedArrayBuffer
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
      for (const f of WASM_FILES) {
        copyFileSync(resolve(wasmDir, f), resolve(out, f));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), opencascadeWasm()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['brepjs-opencascade'],
  },
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ['monaco-editor', '@monaco-editor/react'],
          three: ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
});
