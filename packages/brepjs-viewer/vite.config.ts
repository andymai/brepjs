import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [dts({ rollupTypes: false, compilerOptions: { declarationMap: false } })],
  build: {
    target: 'es2022',
    minify: false,
    // Ship source maps so a consuming app's bundler can chain them through its
    // own minification — error trackers then resolve viewer frames to original
    // source instead of a stack-less synthetic `e.useCache`-style report.
    sourcemap: true,
    lib: {
      entry: { 'brepjs-viewer': resolve(__dirname, 'src/index.ts') },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'three',
        '@react-three/fiber',
        '@react-three/drei',
      ],
    },
  },
});
