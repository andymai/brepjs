/**
 * Recover from stale lazy-loaded chunks after a redeploy.
 *
 * Vite emits content-hashed chunks and serves them `immutable`, so each deploy
 * renames them and drops the old ones. A long-lived tab (or HTTP-cached entry
 * script) still references the previous hashes; when a lazy `import()` — the
 * viewer panel, route chunks — fires, the chunk 404s and Vite raises
 * `vite:preloadError`.
 *
 * Reloading re-fetches `index.html` (served `must-revalidate`, always fresh),
 * which points at the current hashes. The sessionStorage guard reloads at most
 * once per ~10s window so a genuinely-broken deploy surfaces the error (and the
 * viewer's ErrorBoundary fallback) instead of looping forever.
 *
 * The main-thread `vite:preloadError` listener is only half the story: the CAD
 * worker fetches its OCCT WASM (and dynamically imports the `brepjs` chunks)
 * on its own, and those failures arrive as a plain `init-error` message that
 * never fires `vite:preloadError`. `reloadForStaleBundle` /
 * `isStaleAssetError` are exported so the worker-init path can opt into the
 * same one-reload-per-10s recovery — see `useWorker`.
 */

const RELOAD_KEY = 'brepjs:playground:preload-error-reloaded-at';
const RELOAD_DEBOUNCE_MS = 10_000;

/**
 * Reload once to pick up fresh content-hashed assets, guarded to at most one
 * reload per ~10s window.
 *
 * Returns `true` if a reload was triggered, `false` if it was suppressed
 * because we already reloaded inside the debounce window — which means the
 * fresh bundle *still* couldn't load the asset, so it's a genuinely-broken
 * deploy rather than a stale tab. Callers should surface the error in that
 * case instead of looping.
 */
export function reloadForStaleBundle(): boolean {
  if (typeof window === 'undefined') return false;

  let lastReload = 0;
  try {
    lastReload = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  } catch {
    // sessionStorage may be unavailable (privacy mode); fall through to reload.
  }

  if (Date.now() - lastReload < RELOAD_DEBOUNCE_MS) return false;

  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Ignore — a missing guard only risks a single extra reload.
  }

  window.location.reload();
  return true;
}

/**
 * Recognize the error messages raised when a content-hashed asset 404s after a
 * redeploy, so a stale tab (recoverable by reload) is told apart from a genuine
 * runtime error (which must surface). Covers both the worker's own fetch
 * (`loadOcctWasmModule` throws `Failed to load …: 404`) and the browser's
 * dynamic-import failures when a now-missing `brepjs` chunk can't be loaded.
 *
 * Scoped to asset-miss statuses (404/403) and the dynamic-import failure
 * phrasings — a 500 or an unrelated init exception is left to surface as a
 * normal error rather than triggering a reload.
 */
export function isStaleAssetError(message: string): boolean {
  return (
    // Worker's own fetch guard: `Failed to load /…/occt-wasm.js: 404`.
    /Failed to load\b.*:\s*(?:404|403|no response)\b/.test(message) ||
    // Chromium/Firefox dynamic `import()` of a missing chunk.
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    // Safari's phrasing for the same failure.
    /Importing a module script failed/i.test(message)
  );
}

export function registerPreloadErrorRecovery(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('vite:preloadError', (event) => {
    // Reload to pick up fresh hashes. When the guard suppresses the reload
    // (likely a real broken deploy, not a stale tab) let the error propagate
    // so the ErrorBoundary fallback shows instead of looping.
    if (reloadForStaleBundle()) event.preventDefault();
  });
}
