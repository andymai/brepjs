import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { box } from 'brepjs';
import * as brepjs from 'brepjs';
import { initKernel } from '../../../tests/setup.js';
import { deriveWallQuantities } from '../src/serialize/wallQuantities.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);
afterEach(() => vi.restoreAllMocks());

it('returns a quantity error when temporary union release fails after native release', () => {
  using a = box(1, 1, 1);
  using b = box(1, 1, 1, { at: [2, 0, 0] });
  const fuse = brepjs.fuseAll;
  const releases: ReturnType<typeof vi.spyOn>[] = [];
  vi.spyOn(brepjs, 'fuseAll').mockImplementation((...args) => {
    const result = fuse(...args);
    if (result.ok) {
      const release = result.value[Symbol.dispose].bind(result.value);
      releases.push(
        vi.spyOn(result.value, Symbol.dispose).mockImplementation(() => {
          release();
          throw new Error('temporary release failure');
        })
      );
    }
    return result;
  });
  try {
    expect(
      deriveWallQuantities({
        spec: {
          length: 3,
          height: 1,
          thickness: 1,
          origin: [0, 0, 0],
          axisX: [1, 0, 0],
          axisZ: [0, 0, 1],
          materialName: 'Concrete',
        },
        solids: [a, b],
      })
    ).toMatchObject({ ok: false });
    expect(a.disposed).toBe(false);
    expect(b.disposed).toBe(false);
    expect(releases).toHaveLength(1);
    for (const release of releases) expect(release).toHaveBeenCalledTimes(1);
  } finally {
    vi.restoreAllMocks();
  }
});
