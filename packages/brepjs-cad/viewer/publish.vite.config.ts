import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `brep publish` copies this directory as the root of a published page, so its entry is index.html.
function asIndex(): Plugin {
  return {
    name: 'publish-as-index',
    apply: 'build',
    writeBundle({ dir }) {
      if (dir) renameSync(join(dir, 'publish.html'), join(dir, 'index.html'));
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Relative, so the page works below any path of a static host.
  base: './',
  plugins: [react(), asIndex()],
  resolve: { dedupe: ['react', 'react-dom', '@react-three/fiber', '@react-three/drei', 'three'] },
  build: {
    // Beside the preview page's build, which runs first and clears dist/.
    outDir: 'dist/publish',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: fileURLToPath(new URL('./publish.html', import.meta.url)) },
  },
  worker: { format: 'es' },
});
