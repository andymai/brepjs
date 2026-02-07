import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { makeBox, getEdges, measureVolume, castShape } from '../src/index.js';
import { getKernel } from '../src/kernel/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('variable fillet via kernel', () => {
  it('applies constant fillet via kernel adapter', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const edges = getEdges(box);
    const kernel = getKernel();

    const filleted = kernel.fillet(box.wrapped, [edges[0].wrapped], 1);
    const result = castShape(filleted);
    const vol = measureVolume(result);
    // Filleted volume should be less than original box volume (1000)
    expect(vol).toBeLessThan(1000);
    expect(vol).toBeGreaterThan(900);
  });

  it('applies variable fillet with [r1, r2] via kernel adapter', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const edges = getEdges(box);
    const kernel = getKernel();

    // Variable radius: starts at 0.5, ends at 2
    const filleted = kernel.fillet(box.wrapped, [edges[0].wrapped], [0.5, 2]);
    const result = castShape(filleted);
    const vol = measureVolume(result);
    expect(vol).toBeLessThan(1000);
    expect(vol).toBeGreaterThan(900);
  });

  it('variable fillet produces different result than constant fillet', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const edges = getEdges(box);
    const kernel = getKernel();

    const constFilleted = kernel.fillet(box.wrapped, [edges[0].wrapped], 1.5);
    const varFilleted = kernel.fillet(box.wrapped, [edges[0].wrapped], [0.5, 2.5]);

    const constVol = measureVolume(castShape(constFilleted));
    const varVol = measureVolume(castShape(varFilleted));

    // Both should reduce volume but by different amounts
    expect(constVol).toBeLessThan(1000);
    expect(varVol).toBeLessThan(1000);
    expect(Math.abs(constVol - varVol)).toBeGreaterThan(0.01);
  });

  it('applies per-edge callback returning variable radius', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const edges = getEdges(box);
    const kernel = getKernel();

    let callCount = 0;
    const filleted = kernel.fillet(
      box.wrapped,
      edges.slice(0, 2).map((e) => e.wrapped),
      () => {
        callCount++;
        return [0.5, 1.5] as [number, number];
      }
    );

    const result = castShape(filleted);
    const vol = measureVolume(result);
    expect(vol).toBeLessThan(1000);
    expect(callCount).toBe(2);
  });
});
