import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import { h } from 'vue';
import Layout from './Layout.vue';
import './custom.css';

/**
 * Recover from stale lazy-loaded chunks after a redeploy.
 *
 * Vite emits content-hashed chunks (e.g. `VPLocalSearchBox.<hash>.js`) and
 * serves them `immutable`, so each deploy renames them and drops the old ones.
 * A long-lived tab (or HTTP-cached `app.js`) still references the previous
 * hashes; when a lazy `import()` — the local search box, mermaid diagrams —
 * fires, the chunk 404s and Vite raises `vite:preloadError`.
 *
 * Reloading re-fetches `index.html` (served `must-revalidate`, always fresh),
 * which points at the current hashes. The sessionStorage guard reloads at most
 * once per ~10s window so a genuinely-broken deploy surfaces the error instead
 * of looping forever.
 */
function registerPreloadErrorRecovery(): void {
  if (typeof window === 'undefined') return;

  const RELOAD_KEY = 'brepjs:docs:preload-error-reloaded-at';
  const RELOAD_DEBOUNCE_MS = 10_000;

  window.addEventListener('vite:preloadError', (event) => {
    let lastReload = 0;
    try {
      lastReload = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    } catch {
      // sessionStorage may be unavailable (privacy mode); fall through to reload.
    }

    // Already reloaded recently → likely a real broken deploy, not a stale
    // tab. Let the error propagate so it's visible instead of looping.
    if (Date.now() - lastReload < RELOAD_DEBOUNCE_MS) return;

    try {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      // Ignore — a missing guard only risks a single extra reload.
    }

    // Suppress Vite's default rethrow, then reload to pick up fresh hashes.
    event.preventDefault();
    window.location.reload();
  });
}

const theme: Theme = {
  extends: DefaultTheme,
  Layout: () => h(Layout),
  enhanceApp() {
    // VitePress prerenders pages, so guard against SSR. inject() wraps
    // history.pushState — VitePress's own router uses it, so route changes
    // emit pageviews automatically once mounted.
    if (typeof window !== 'undefined') {
      void import('@vercel/analytics').then(({ inject }) => inject());
      registerPreloadErrorRecovery();
    }
  },
};

export default theme;
