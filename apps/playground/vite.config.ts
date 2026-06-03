import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createReadStream, existsSync, mkdirSync, copyFileSync, readFileSync } from 'fs';

const reactRequire = createRequire(import.meta.url);

interface PackageJson {
  version?: string;
}
// Resolve relative to this config file, not cwd, so the build works regardless
// of where vite is invoked from (e.g. monorepo root vs `apps/playground/`).
const brepjsPkgPath = fileURLToPath(new URL('../../package.json', import.meta.url));
const brepjsPkg = JSON.parse(readFileSync(brepjsPkgPath, 'utf8')) as PackageJson;
const BREPJS_VERSION = brepjsPkg.version ?? '0.0.0-dev';

const WASM_FILES = ['occt-wasm.js', 'occt-wasm.wasm'];

const BASE = '/playground/';

function occtWasm(): Plugin {
  // Resolve the occt-wasm dist dir (the package's exports map exposes
  // ./dist/occt-wasm.js and ./dist/occt-wasm.wasm).
  const wasmDir = dirname(reactRequire.resolve('occt-wasm/dist/occt-wasm.js'));

  let base = BASE;

  return {
    name: 'occt-wasm',
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      // Listen under the configured base so dev URLs match production (`/playground/wasm/...`)
      const wasmPath = `${base.replace(/\/$/, '')}/wasm`;
      server.middlewares.use(wasmPath, (req, res, next) => {
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
  base: BASE,
  define: {
    // Surfaced in the playground status bar so users can include the running
    // brepjs version in bug reports without needing devtools.
    __BREPJS_VERSION__: JSON.stringify(BREPJS_VERSION),
  },
  plugins: [react(), tailwindcss(), occtWasm()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['occt-wasm'],
  },
  resolve: {
    // Pin react/react-dom to a single physical copy so vite 8 + rolldown's stricter
    // module resolution can't pick up two instances across hoist boundaries. The copy
    // may live at the workspace root or nested in apps/playground depending on how npm
    // hoists once sibling workspaces (brepjs-viewer) pull the same React major, so
    // resolve the package dir at config time rather than hardcoding either location.
    alias: {
      react: dirname(reactRequire.resolve('react/package.json')),
      'react-dom': dirname(reactRequire.resolve('react-dom/package.json')),
    },
  },
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        // Keep monaco split out so it doesn't bloat the entry bundle. Three /
        // R3F / drei are deliberately NOT named here — pinning them to a
        // single chunk would also pull a `<link rel="modulepreload">` for
        // the chunk into the entry HTML, defeating the lazy-import on
        // ViewerPanel. Letting Vite default-split lets the three subtree
        // load only when the viewer mounts.
        manualChunks(id) {
          if (id.includes('monaco-editor') || id.includes('@monaco-editor/react')) return 'monaco';
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
});
