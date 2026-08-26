import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'node:fs';

// The resolve hook must ship as a hand-authored ESM file (not bundled): node:module's
// `register` loads it as an off-thread loader, so it has to stay a clean standalone module.
function copyResolveHook() {
  return {
    name: 'copy-brepjs-resolve-hook',
    closeBundle() {
      const outDir = resolve(import.meta.dirname, 'dist/loader');
      mkdirSync(outDir, { recursive: true });
      copyFileSync(
        resolve(import.meta.dirname, 'src/loader/brepjsResolve.mjs'),
        resolve(outDir, 'brepjsResolve.mjs')
      );
    },
  };
}

export default defineConfig({
  plugins: [
    dts({ rollupTypes: false, compilerOptions: { declarationMap: false } }),
    copyResolveHook(),
  ],
  build: {
    target: 'es2022',
    minify: false,
    lib: {
      entry: {
        'brepjs-cad': resolve(import.meta.dirname, 'src/index.ts'),
        'cli/main': resolve(import.meta.dirname, 'src/cli/main.ts'),
        // Pinned so the CLI's dynamic imports land on stable dist/snapshot/*.js paths
        // (preserves the ../../viewer/dist sibling-depth invariant static.ts relies on).
        'snapshot/static': resolve(import.meta.dirname, 'src/snapshot/static.ts'),
        'snapshot/registry': resolve(import.meta.dirname, 'src/snapshot/registry.ts'),
        'snapshot/shoot': resolve(import.meta.dirname, 'src/snapshot/shoot.ts'),
        'snapshot/serve': resolve(import.meta.dirname, 'src/snapshot/serve.ts'),
        'preview/preview': resolve(import.meta.dirname, 'src/preview/preview.ts'),
        'mcp/server': resolve(import.meta.dirname, 'src/mcp/server.ts'),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [
        'brepjs',
        // Resolved at runtime from the USER's project (preview element trees); never bundled.
        'brepjs-families',
        'occt-wasm',
        'commander',
        'puppeteer',
        'typescript',
        /^@modelcontextprotocol\/sdk/,
        // Optional MCP telemetry — kept external so src/mcp/telemetry.ts can dynamic-import them at
        // runtime and gracefully no-op when they're absent (the shipped MCP never hard-requires them).
        /^@langfuse\//,
        /^@opentelemetry\//,
        /^node:/,
      ],
    },
  },
});
