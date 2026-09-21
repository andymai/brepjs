import { describe, expect, it } from 'vitest';
import { isAbsolute, join } from 'node:path';
import { existsSync } from 'node:fs';
import { initManifold } from 'brepjs-manifold';

describe('initManifold', () => {
  it('passes the native filename and prefix to a custom locator and caches the initialized module', async () => {
    const calls: Array<{ path: string; prefix: string }> = [];
    const wasm = await initManifold({
      locateFile(path, prefix) {
        calls.push({ path, prefix });
        return join(prefix, path);
      },
    });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    if (call === undefined) throw new Error('Native loader did not invoke the locator');
    expect(call.path).toBe('manifold.wasm');
    expect(isAbsolute(call.prefix)).toBe(true);
    expect(existsSync(join(call.prefix, call.path))).toBe(true);
    const cube = wasm.Manifold.cube([1, 2, 3]);
    try {
      expect(cube.volume()).toBeCloseTo(6, 10);
    } finally {
      cube.delete();
    }
    expect(await initManifold()).toBe(wasm);
  });
});
