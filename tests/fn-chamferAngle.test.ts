import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  chamferDistAngleShape,
  isOk,
  isErr,
  unwrap,
  measureVolume,
  isShape3D,
  getEdges,
} from '../src/index.js';
import { createSolid } from '../src/core/shapeTypes.js';
import { getKernel } from '../src/kernel/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function makeBox(w: number, h: number, d: number) {
  const kernel = getKernel();
  return createSolid(kernel.makeBox(w, h, d));
}

describe('chamferDistAngleShape', () => {
  it('chamfers a single edge of a box with distance + angle', () => {
    const box = makeBox(10, 10, 10);
    const edges = getEdges(box);
    expect(edges.length).toBe(12);

    const result = chamferDistAngleShape(box, [edges[0]!], 1, 45);
    expect(isOk(result)).toBe(true);
    const chamfered = unwrap(result);
    expect(isShape3D(chamfered)).toBe(true);

    // Chamfered box should have less volume than original
    const origVol = measureVolume(box);
    const chamfVol = measureVolume(chamfered);
    expect(chamfVol).toBeLessThan(origVol);
    expect(chamfVol).toBeGreaterThan(0);
  });

  it('chamfers multiple edges', () => {
    const box = makeBox(10, 10, 10);
    const edges = getEdges(box);
    const selected = edges.slice(0, 4);

    const result = chamferDistAngleShape(box, selected, 1, 45);
    expect(isOk(result)).toBe(true);
    const chamfered = unwrap(result);
    expect(isShape3D(chamfered)).toBe(true);

    const origVol = measureVolume(box);
    const chamfVol = measureVolume(chamfered);
    expect(chamfVol).toBeLessThan(origVol);
  });

  it('uses different angles', () => {
    const box = makeBox(20, 20, 20);
    const edges = getEdges(box);

    // A smaller angle should remove less material than a larger angle
    // at the same distance
    const result30 = unwrap(chamferDistAngleShape(box, [edges[0]!], 2, 30));
    const result60 = unwrap(chamferDistAngleShape(box, [edges[0]!], 2, 60));

    const vol30 = measureVolume(result30);
    const vol60 = measureVolume(result60);

    // Both should be valid and less than original
    const origVol = measureVolume(box);
    expect(vol30).toBeLessThan(origVol);
    expect(vol60).toBeLessThan(origVol);
    // Different angles produce different volumes
    expect(vol30).not.toBeCloseTo(vol60, 0);
  });

  it('chamfers all 12 edges of a box', () => {
    const box = makeBox(20, 20, 20);
    const edges = getEdges(box);
    expect(edges.length).toBe(12);

    const result = chamferDistAngleShape(box, edges, 1, 45);
    expect(isOk(result)).toBe(true);
    const chamfered = unwrap(result);
    expect(isShape3D(chamfered)).toBe(true);

    const origVol = measureVolume(box);
    const chamfVol = measureVolume(chamfered);
    expect(chamfVol).toBeLessThan(origVol);
    expect(chamfVol).toBeGreaterThan(origVol * 0.8); // Not too much removed
  });

  it('is immutable — does not modify original shape', () => {
    const box = makeBox(10, 10, 10);
    const origVol = measureVolume(box);
    const edges = getEdges(box);

    chamferDistAngleShape(box, [edges[0]!], 1, 45);
    expect(measureVolume(box)).toBeCloseTo(origVol, 6);
  });

  it('returns Err for empty edges array', () => {
    const box = makeBox(10, 10, 10);
    const result = chamferDistAngleShape(box, [], 1, 45);
    expect(isErr(result)).toBe(true);
  });

  it('returns Err for non-positive distance', () => {
    const box = makeBox(10, 10, 10);
    const edges = getEdges(box);
    const result = chamferDistAngleShape(box, [edges[0]!], 0, 45);
    expect(isErr(result)).toBe(true);
  });

  it('returns Err for angle out of range', () => {
    const box = makeBox(10, 10, 10);
    const edges = getEdges(box);
    expect(isErr(chamferDistAngleShape(box, [edges[0]!], 1, 0))).toBe(true);
    expect(isErr(chamferDistAngleShape(box, [edges[0]!], 1, 90))).toBe(true);
    expect(isErr(chamferDistAngleShape(box, [edges[0]!], 1, -10))).toBe(true);
  });
});
