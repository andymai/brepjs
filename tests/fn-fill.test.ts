import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { fill, getWires, measureArea, polygon } from '../src/index.js';
import { makeFace } from '../src/topology/surfaceBuilders.js';
import { outerWire } from '../src/topology/faceFns.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('fill', () => {
  it('removes holes from a face', () => {
    // Outer 10x10 square
    const outerResult = polygon([
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
      [0, 10, 0],
    ]);
    expect(outerResult.ok).toBe(true);
    if (!outerResult.ok) return;
    const outerFace = outerResult.value;
    const outer = outerWire(outerFace);

    // Inner 4x4 square (hole)
    const holeResult = polygon([
      [3, 3, 0],
      [7, 3, 0],
      [7, 7, 0],
      [3, 7, 0],
    ]);
    expect(holeResult.ok).toBe(true);
    if (!holeResult.ok) return;
    const holeWire = outerWire(holeResult.value);

    // Face with hole
    const faceWithHoleResult = makeFace(outer, [holeWire]);
    expect(faceWithHoleResult.ok).toBe(true);
    if (!faceWithHoleResult.ok) return;
    const faceWithHole = faceWithHoleResult.value;
    expect(getWires(faceWithHole).length).toBe(2);

    // fill should remove the hole
    const filled = fill(faceWithHole);
    expect(filled.ok).toBe(true);
    if (!filled.ok) return;
    expect(getWires(filled.value).length).toBe(1);
    expect(measureArea(filled.value)).toBeCloseTo(100, 0);
  });

  it('returns unchanged face when no holes exist', () => {
    const result = polygon([
      [0, 0, 0],
      [5, 0, 0],
      [5, 5, 0],
      [0, 5, 0],
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const filled = fill(result.value);
    expect(filled.ok).toBe(true);
    if (!filled.ok) return;
    expect(measureArea(filled.value)).toBeCloseTo(25, 0);
  });
});
