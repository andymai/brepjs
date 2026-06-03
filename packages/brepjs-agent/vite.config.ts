import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [dts({ rollupTypes: false, compilerOptions: { declarationMap: false } })],
  build: {
    target: 'es2022',
    minify: false,
    lib: {
      entry: {
        'brepjs-agent': resolve(__dirname, 'src/index.ts'),
        'cli/main': resolve(__dirname, 'src/cli/main.ts'),
        // Pinned so the CLI's dynamic imports land on stable dist/snapshot/*.js paths
        // (preserves the ../../viewer/dist sibling-depth invariant static.ts relies on).
        'snapshot/static': resolve(__dirname, 'src/snapshot/static.ts'),
        'snapshot/registry': resolve(__dirname, 'src/snapshot/registry.ts'),
        'snapshot/shoot': resolve(__dirname, 'src/snapshot/shoot.ts'),
        'snapshot/serve': resolve(__dirname, 'src/snapshot/serve.ts'),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['brepjs', 'occt-wasm', 'commander', 'puppeteer', /^node:/],
    },
  },
});
