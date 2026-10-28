/**
 * The playground versions its WASM URLs and kernel cache by content hash so a
 * browser never pairs a cached occt-wasm.js with a newer occt-wasm.wasm. The
 * hashes are a Vite build-time define, stubbed here as a global.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const HASHES = {
  'occt-wasm.js': 'aaaaaaaaaaaa',
  'occt-wasm.wasm': 'bbbbbbbbbbbb',
  'web-ifc.wasm': 'cccccccccccc',
};

async function loadWasmConfig(hashes: Record<string, string>) {
  vi.stubGlobal('__WASM_ASSET_HASHES__', hashes);
  vi.resetModules();
  return import('../apps/playground/src/lib/wasmConfig.js');
}

function stubCaches(names: string[]): Set<string> {
  const store = new Set(names);
  vi.stubGlobal('caches', {
    keys: () => Promise.resolve([...store]),
    delete: (name: string) => Promise.resolve(store.delete(name)),
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('playground wasmConfig', () => {
  it('versions each served file by its own content hash', async () => {
    const { wasmUrl } = await loadWasmConfig(HASHES);
    expect(wasmUrl('occt-wasm.js')).toMatch(/\/wasm\/occt-wasm\.js\?v=aaaaaaaaaaaa$/);
    expect(wasmUrl('occt-wasm.wasm')).toMatch(/\/wasm\/occt-wasm\.wasm\?v=bbbbbbbbbbbb$/);
    expect(wasmUrl('web-ifc.wasm')).toMatch(/\/wasm\/web-ifc\.wasm\?v=cccccccccccc$/);
    expect(wasmUrl('unknown.wasm')).toMatch(/\/wasm\/unknown\.wasm$/);
  });

  it('names the kernel cache after the kernel hashes', async () => {
    const before = (await loadWasmConfig(HASHES)).WASM_CACHE_NAME;
    const after = (await loadWasmConfig({ ...HASHES, 'occt-wasm.wasm': 'dddddddddddd' }))
      .WASM_CACHE_NAME;
    const webIfcOnly = (await loadWasmConfig({ ...HASHES, 'web-ifc.wasm': 'eeeeeeeeeeee' }))
      .WASM_CACHE_NAME;
    expect(before).toBe('brepjs-wasm-occt-wasm-aaaaaaaaaaaa-bbbbbbbbbbbb');
    expect(after).not.toBe(before);
    expect(webIfcOnly).toBe(before);
  });

  it('deletes kernel caches from earlier builds and keeps everything else', async () => {
    const { WASM_CACHE_NAME, deleteStaleWasmCaches } = await loadWasmConfig(HASHES);
    const store = stubCaches([
      WASM_CACHE_NAME,
      'brepjs-wasm-v2-occt-wasm',
      'brepjs-wasm-occt-wasm-111111111111-222222222222',
      'unrelated-cache',
    ]);
    await deleteStaleWasmCaches();
    expect([...store].sort()).toEqual([WASM_CACHE_NAME, 'unrelated-cache'].sort());
  });
});
