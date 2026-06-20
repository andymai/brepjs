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

const BASE = '/playground/';

// WASM assets the playground worker fetches from `${base}wasm/<file>`: the OCCT
// kernel (occt-wasm) and web-ifc (used by brepjs-bim's IFC export). Each maps a
// served filename to its source in node_modules.
function wasmFileMap(): Record<string, string> {
  const occtDir = dirname(reactRequire.resolve('occt-wasm/dist/occt-wasm.js'));
  // web-ifc's main entry sits alongside its .wasm files in the package root.
  const webIfcDir = dirname(reactRequire.resolve('web-ifc'));
  return {
    'occt-wasm.js': resolve(occtDir, 'occt-wasm.js'),
    'occt-wasm.wasm': resolve(occtDir, 'occt-wasm.wasm'),
    'web-ifc.wasm': resolve(webIfcDir, 'web-ifc.wasm'),
  };
}

function wasmAssets(): Plugin {
  const files = wasmFileMap();
  let base = BASE;

  return {
    name: 'wasm-assets',
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      // Listen under the configured base so dev URLs match production (`/playground/wasm/...`)
      const wasmPath = `${base.replace(/\/$/, '')}/wasm`;
      server.middlewares.use(wasmPath, (req, res, next) => {
        const file = req.url?.slice(1) ?? '';
        const filePath = files[file];
        if (filePath === undefined || !existsSync(filePath)) return next();

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
      for (const [file, src] of Object.entries(files)) {
        if (existsSync(src)) copyFileSync(src, resolve(out, file));
      }
    },
  };
}

// index.html references its favicons with root-absolute paths (`/favicon.ico`).
// Vite rewrites those to `${base}favicon.ico` at build time — correct for
// production, including deep `/playground/examples/<id>` permalinks — but the dev
// server doesn't rewrite them, and browsers also probe `/favicon.ico` at the
// origin root regardless. Serve those image files at root during dev to match
// production's behaviour.
//
// site.webmanifest is deliberately NOT served here: it's reached via the
// base-rewritten `<link rel="manifest">` (`/playground/site.webmanifest`), and
// its icon `src`s are relative to the manifest URL — serving it from root would
// make those resolve to `/icon-*.png` (404) instead of `/playground/icon-*.png`.
function devRootIcons(): Plugin {
  const publicDir = fileURLToPath(new URL('./public', import.meta.url));
  const types: Record<string, string> = {
    '/favicon.ico': 'image/x-icon',
    '/favicon.svg': 'image/svg+xml',
    '/apple-touch-icon.png': 'image/png',
  };
  return {
    name: 'dev-root-icons',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const type = req.url && types[req.url];
        const filePath = req.url && resolve(publicDir, req.url.slice(1));
        if (!type || !filePath || !existsSync(filePath)) return next();
        res.setHeader('Content-Type', type);
        createReadStream(filePath).pipe(res);
      });
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
  plugins: [react(), tailwindcss(), wasmAssets(), devRootIcons()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    // Both are Emscripten glue: running them through esbuild's dep optimizer
    // corrupts the WASM import object, so serve them as native ESM instead.
    exclude: ['occt-wasm', 'web-ifc'],
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
