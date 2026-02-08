import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  sketchRectangle,
  box,
  sphere,
  castShape,
  isSolid,
  getEdges,
  getFaces,
  measureVolume,
  measureArea,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  thicken,
  fillet,
  chamfer,
  shell,
  offset,
  getKernel,
  createSolid,
} from '../src/index.js';
import type { Face, Shape3D } from '../src/core/shapeTypes.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('thicken', () => {
  it('thickens a planar face into a solid', () => {
    const sketch = sketchRectangle(10, 10);
    const f = castShape(sketch.face().wrapped) as Face;
    const result = thicken(f, 5);

    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(isSolid(solid)).toBe(true);
  });

  it('thickens with negative thickness (offsets in opposite direction)', () => {
    const sketch = sketchRectangle(10, 10);
    const f = castShape(sketch.face().wrapped) as Face;
    const result = thicken(f, -5);

    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(isSolid(solid)).toBe(true);
  });

  it('produces expected volume for a rectangular face thickened by a known amount', () => {
    const sketch = sketchRectangle(10, 20);
    const f = castShape(sketch.face().wrapped) as Face;
    const result = thicken(f, 3);

    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(isSolid(solid)).toBe(true);
    // 10 x 20 face thickened by 3 => |volume| ≈ 600
    const vol = measureVolume(solid);
    expect(Math.abs(vol)).toBeCloseTo(600, 0);
  });
});

describe('fillet', () => {
  it('fillets all edges of a box with constant radius', () => {
    const b = box(10, 10, 10);
    const result = fillet(b, 1);
    expect(isOk(result)).toBe(true);
    const filleted = unwrap(result);
    const vol = measureVolume(filleted);
    expect(vol).toBeLessThan(1000);
    expect(vol).toBeGreaterThan(800);
  });

  it('fillets specific edges', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = fillet(b, [edges[0]!], 1);
    expect(isOk(result)).toBe(true);
    const vol = measureVolume(unwrap(result));
    // Single edge fillet removes less material
    expect(vol).toBeLessThan(1000);
    expect(vol).toBeGreaterThan(990);
  });

  it('returns error for zero radius', () => {
    const b = box(10, 10, 10);
    const result = fillet(b, 0);
    expect(isErr(result)).toBe(true);
  });

  it('returns error for negative radius', () => {
    const b = box(10, 10, 10);
    const result = fillet(b, -1);
    expect(isErr(result)).toBe(true);
  });

  it('supports per-edge callback', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    let callCount = 0;
    const result = fillet(b, edges.slice(0, 2), () => {
      callCount++;
      return 1;
    });
    expect(isOk(result)).toBe(true);
    expect(callCount).toBe(2);
  });
});

describe('chamfer', () => {
  it('chamfers all edges of a box', () => {
    const b = box(10, 10, 10);
    const result = chamfer(b, 1);
    expect(isOk(result)).toBe(true);
    const vol = measureVolume(unwrap(result));
    expect(vol).toBeLessThan(1000);
    expect(vol).toBeGreaterThan(800);
  });

  it('chamfers specific edges', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = chamfer(b, [edges[0]!], 1);
    expect(isOk(result)).toBe(true);
  });

  it('returns error for zero distance', () => {
    const b = box(10, 10, 10);
    const result = chamfer(b, 0);
    expect(isErr(result)).toBe(true);
  });
});

describe('shell', () => {
  it('hollows a box by removing one face', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const result = shell(b, [faces[0]!], 1);
    expect(isOk(result)).toBe(true);
    const vol = measureVolume(unwrap(result));
    // Shell removes interior, leaving walls of thickness 1
    expect(vol).toBeLessThan(1000);
    expect(vol).toBeGreaterThan(200);
  });

  it('returns error for zero thickness', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const result = shell(b, [faces[0]!], 0);
    expect(isErr(result)).toBe(true);
  });

  it('returns error for empty faces list', () => {
    const b = box(10, 10, 10);
    const result = shell(b, [], 1);
    expect(isErr(result)).toBe(true);
  });
});

describe('offset', () => {
  it('offsets a sphere outward', () => {
    const s = sphere(5);
    const originalArea = measureArea(s);
    const result = offset(s, 1);
    expect(isOk(result)).toBe(true);
    const area = measureArea(unwrap(result));
    expect(area).toBeGreaterThan(originalArea);
  });

  it('offsets a sphere inward', () => {
    const s = sphere(5);
    const originalArea = measureArea(s);
    const result = offset(s, -1);
    expect(isOk(result)).toBe(true);
    const area = measureArea(unwrap(result));
    expect(area).toBeLessThan(originalArea);
  });

  it('returns error for zero distance', () => {
    const s = sphere(5);
    const result = offset(s, 0);
    expect(isErr(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Null-shape pre-validation tests
// ---------------------------------------------------------------------------

describe('null-shape pre-validation', () => {
  function makeNullShape(): Shape3D {
    const oc = getKernel().oc;
    return createSolid(new oc.TopoDS_Solid()) as Shape3D;
  }

  it('fillet rejects null shape', () => {
    const result = fillet(makeNullShape(), 1);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('chamfer rejects null shape', () => {
    const result = chamfer(makeNullShape(), 1);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('shell rejects null shape', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const result = shell(makeNullShape(), [faces[0]!], 1);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('offset rejects null shape', () => {
    const result = offset(makeNullShape(), 1);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });
});
