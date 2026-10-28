/**
 * Shared WASM configuration constants.
 */

const WASM_CACHE_PREFIX = 'brepjs-wasm-';

/**
 * Cache name for WASM files (used by preloader and worker). Keyed by the kernel's
 * content, so a new build never reads a copy an older one cached.
 */
export const WASM_CACHE_NAME = `${WASM_CACHE_PREFIX}occt-wasm-${__WASM_ASSET_HASHES__['occt-wasm.js'] ?? ''}-${__WASM_ASSET_HASHES__['occt-wasm.wasm'] ?? ''}`;

/** WASM files to preload and serve */
export const WASM_FILES = ['occt-wasm.js', 'occt-wasm.wasm'] as const;

/** URL of a file served under `${BASE_URL}wasm/`, versioned by its content hash. */
export function wasmUrl(file: string): string {
  const hash = __WASM_ASSET_HASHES__[file];
  return `${import.meta.env.BASE_URL}wasm/${file}${hash === undefined ? '' : `?v=${hash}`}`;
}

/** Delete WASM caches left by earlier builds; each holds a full copy of the kernel. */
export async function deleteStaleWasmCaches(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(WASM_CACHE_PREFIX) && name !== WASM_CACHE_NAME)
      .map((name) => caches.delete(name))
  );
}
