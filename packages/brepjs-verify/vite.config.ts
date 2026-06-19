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
      const outDir = resolve(__dirname, 'dist/loader');
      mkdirSync(outDir, { recursive: true });
      copyFileSync(
        resolve(__dirname, 'src/loader/brepjsResolve.mjs'),
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
        'brepjs-verify': resolve(__dirname, 'src/index.ts'),
        'cli/main': resolve(__dirname, 'src/cli/main.ts'),
        // Pinned so the CLI's dynamic imports land on stable dist/snapshot/*.js paths
        // (preserves the ../../viewer/dist sibling-depth invariant static.ts relies on).
        'snapshot/static': resolve(__dirname, 'src/snapshot/static.ts'),
        'snapshot/registry': resolve(__dirname, 'src/snapshot/registry.ts'),
        'snapshot/shoot': resolve(__dirname, 'src/snapshot/shoot.ts'),
        'snapshot/serve': resolve(__dirname, 'src/snapshot/serve.ts'),
        'mcp/server': resolve(__dirname, 'src/mcp/server.ts'),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [
        'brepjs',
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
