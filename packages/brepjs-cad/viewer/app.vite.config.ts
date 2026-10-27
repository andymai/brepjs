import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// An MCP App is one HTML resource the host loads into a sandboxed iframe, so the bundle is inlined
// into the page rather than served beside it.
function inlineBundle(): Plugin {
  return {
    name: 'inline-bundle',
    apply: 'build',
    writeBundle({ dir }, bundle) {
      if (!dir) return;
      const htmlPath = join(dir, 'app.html');
      let html = readFileSync(htmlPath, 'utf8');
      for (const [file, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.isEntry) continue;
        const tag = new RegExp(
          `<script[^>]*src="[^"]*${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*></script>`
        );
        // A literal "</script" in the bundle would end the inline tag early.
        const code = chunk.code.replace(/<\/script/gi, '<\\/script');
        html = html.replace(tag, () => `<script type="module">${code}</script>`);
        rmSync(join(dir, file));
      }
      writeFileSync(join(dir, 'viewer-app.html'), html);
      rmSync(htmlPath);
      rmSync(join(dir, 'assets'), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react(), inlineBundle()],
  resolve: { dedupe: ['react', 'react-dom', '@react-three/fiber', '@react-three/drei', 'three'] },
  build: {
    // Beside the preview page's build, which runs first and clears dist/.
    outDir: 'dist/app',
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    modulePreload: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./app.html', import.meta.url)),
      output: { inlineDynamicImports: true },
    },
  },
});
