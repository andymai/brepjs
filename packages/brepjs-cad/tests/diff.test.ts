import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runDiff } from '@/verify/diff.js';

const fix = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));

describe('runDiff', () => {
  it('reports zero deltas for identical parts', async () => {
    const { volumeDelta, areaDelta, symmetricDifferenceVolume, errors } = await runDiff(
      fix('validBox.brep.ts'),
      fix('validBox.brep.ts'),
    );
    expect(errors).toEqual([]);
    expect(volumeDelta).toBeCloseTo(0, 3);
    expect(areaDelta).toBeCloseTo(0, 3);
    expect(symmetricDifferenceVolume).toBeCloseTo(0, 1);
  }, 30000);

  it('reports volume/area/bbox deltas and symmetric difference between two parts', async () => {
    const { volumeDelta, areaDelta, bboxDelta, symmetricDifferenceVolume, errors } = await runDiff(
      fix('validBox.brep.ts'),
      fix('bigBox.brep.ts'),
    );
    expect(errors).toEqual([]);
    expect(volumeDelta).toBeCloseTo(1000, 1);
    expect(areaDelta).toBeCloseTo(400, 1);
    expect(bboxDelta.zMax).toBeCloseTo(10, 3);
    expect(symmetricDifferenceVolume).toBeCloseTo(1000, 1);
  }, 30000);

  it('reports a null volume delta when one side is not a 3D shape', async () => {
    const { volumeDelta, symmetricDifferenceVolume, bboxDelta, errors } = await runDiff(
      fix('validBox.brep.ts'),
      fix('lineEdge.brep.ts'),
    );
    expect(volumeDelta).toBeNull();
    expect(symmetricDifferenceVolume).toBeNull();
    expect(bboxDelta.yMax).toBeCloseTo(-10, 3);
    expect(errors).toEqual([
      'volume: b is an edge, which has no volume, so volumeDelta and symmetricDifferenceVolume are null',
    ]);
  }, 30000);
});
