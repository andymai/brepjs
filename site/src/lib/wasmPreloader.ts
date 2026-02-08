import { WASM_CACHE_NAME, WASM_FILES } from './wasmConfig.js';

/**
 * Preloads WASM files in the background to speed up playground initialization.
 * Uses requestIdleCallback to avoid blocking the main thread.
 */
export async function preloadWASM(): Promise<void> {
  // Check if browser supports necessary APIs
  if (typeof window === 'undefined' || !('caches' in window)) {
    return;
  }

  try {
    const cache = await caches.open(WASM_CACHE_NAME);

    // List of WASM files to preload (threaded version for multi-core performance)
    const urls = WASM_FILES.map((file) => `/wasm/${file}`);

    // Fetch and cache each file if not already cached
    await Promise.all(
      urls.map(async (url) => {
        const cached = await cache.match(url);
        if (!cached) {
          const response = await fetch(url);
          if (response.ok) {
            // Clone response before caching to avoid consuming it
            await cache.put(url, response.clone());
          }
        }
      })
    );
  } catch (error) {
    // Silently fail - preloading is an optimization, not critical
    console.debug('WASM preload failed:', error);
  }
}

/**
 * Start preloading WASM files when the browser is idle.
 * Safe to call on landing page without blocking user interaction.
 */
export function startWASMPreload(): void {
  if (typeof window === 'undefined') return;

  if ('requestIdleCallback' in window) {
    requestIdleCallback(
      () => {
        void preloadWASM();
      },
      { timeout: 2000 }
    );
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(() => {
      void preloadWASM();
    }, 2000);
  }
}
