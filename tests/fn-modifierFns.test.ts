import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  sketchRectangle,
  thickenSurface,
  castShape,
  fnIsSolid,
  makeBox,
  makeSphere,
  getEdges,
  getFaces,
  fnMeasureVolume,
  fnMeasureArea,
  isOk,
  isErr,
  unwrap,
  filletShape,
  chamferShape,
  shellShape,
  offsetShape,
} from '../src/index.js';
import { measureVolume } from '../src/measurement/measureFns.js';
import type { Shape3D } from '../src/core/shapeTypes.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('thickenSurface', () => {
  it('thickens a planar face into a solid', () => {
    const sketch = sketchRectangle(10, 10);
    const face = castShape(sketch.face().wrapped);
    const result = thickenSurface(face, 5);

    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(fnIsSolid(solid)).toBe(true);
  });

  it('thickens with negative thickness (offsets in opposite direction)', () => {
    const sketch = sketchRectangle(10, 10);
    const face = castShape(sketch.face().wrapped);
    const result = thickenSurface(face, -5);

    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(fnIsSolid(solid)).toBe(true);
  });

  it('produces expected volume for a rectangular face thickened by a known amount', () => {
    const sketch = sketchRectangle(10, 20);
    const face = castShape(sketch.face().wrapped);
    const result = thickenSurface(face, 3);

    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    // After fnIsSolid check above, safe to assert Shape3D
    expect(fnIsSolid(solid)).toBe(true);
    // 10 x 20 face thickened by 3 => |volume| ≈ 600
    const vol = measureVolume(solid as Shape3D);
    expect(Math.abs(vol)).toBeCloseTo(600, 0);
  });
});

describe('filletShape', () => {
  it('fillets all edges of a box with constant radius', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = filletShape(box, undefined, 1);
    expect(isOk(result)).toBe(true);
    const filleted = unwrap(result);
    const vol = fnMeasureVolume(filleted);
    expect(vol).toBeLessThan(1000);
    expect(vol).toBeGreaterThan(800);
  });

  it('fillets specific edges', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const edges = getEdges(box);
    const result = filletShape(box, [edges[0]], 1);
    expect(isOk(result)).toBe(true);
    const vol = fnMeasureVolume(unwrap(result));
    // Single edge fillet removes less material
    expect(vol).toBeLessThan(1000);
    expect(vol).toBeGreaterThan(990);
  });

  it('returns error for zero radius', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = filletShape(box, undefined, 0);
    expect(isErr(result)).toBe(true);
  });

  it('returns error for negative radius', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = filletShape(box, undefined, -1);
    expect(isErr(result)).toBe(true);
  });

  it('supports per-edge callback', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const edges = getEdges(box);
    let callCount = 0;
    const result = filletShape(box, edges.slice(0, 2), () => {
      callCount++;
      return 1;
    });
    expect(isOk(result)).toBe(true);
    expect(callCount).toBe(2);
  });
});

describe('chamferShape', () => {
  it('chamfers all edges of a box', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = chamferShape(box, undefined, 1);
    expect(isOk(result)).toBe(true);
    const vol = fnMeasureVolume(unwrap(result));
    expect(vol).toBeLessThan(1000);
    expect(vol).toBeGreaterThan(800);
  });

  it('chamfers specific edges', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const edges = getEdges(box);
    const result = chamferShape(box, [edges[0]], 1);
    expect(isOk(result)).toBe(true);
  });

  it('returns error for zero distance', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = chamferShape(box, undefined, 0);
    expect(isErr(result)).toBe(true);
  });
});

describe('shellShape', () => {
  it('hollows a box by removing one face', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const faces = getFaces(box);
    const result = shellShape(box, [faces[0]], 1);
    expect(isOk(result)).toBe(true);
    const vol = fnMeasureVolume(unwrap(result));
    // Shell removes interior, leaving walls of thickness 1
    expect(vol).toBeLessThan(1000);
    expect(vol).toBeGreaterThan(200);
  });

  it('returns error for zero thickness', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const faces = getFaces(box);
    const result = shellShape(box, [faces[0]], 0);
    expect(isErr(result)).toBe(true);
  });

  it('returns error for empty faces list', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = shellShape(box, [], 1);
    expect(isErr(result)).toBe(true);
  });
});

describe('offsetShape', () => {
  it('offsets a sphere outward', () => {
    const sphere = makeSphere(5);
    const originalArea = fnMeasureArea(sphere);
    const result = offsetShape(sphere, 1);
    expect(isOk(result)).toBe(true);
    const area = fnMeasureArea(unwrap(result));
    expect(area).toBeGreaterThan(originalArea);
  });

  it('offsets a sphere inward', () => {
    const sphere = makeSphere(5);
    const originalArea = fnMeasureArea(sphere);
    const result = offsetShape(sphere, -1);
    expect(isOk(result)).toBe(true);
    const area = fnMeasureArea(unwrap(result));
    expect(area).toBeLessThan(originalArea);
  });

  it('returns error for zero distance', () => {
    const sphere = makeSphere(5);
    const result = offsetShape(sphere, 0);
    expect(isErr(result)).toBe(true);
  });
});
