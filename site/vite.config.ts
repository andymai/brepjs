import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' blob: https://cdn.jsdelivr.net; worker-src 'self' blob:; connect-src 'self' ws: https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:",
    },
  },
  optimizeDeps: {
    exclude: ['brepjs-opencascade'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ['monaco-editor'],
          three: ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
});
