/* eslint-disable @typescript-eslint/no-non-null-assertion -- test array indexing */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';
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
  draft,
  variableFillet,
  getKernel,
  createSolid,
} from '@/index.js';
import type { Face, Shape3D } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
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
    const vol = unwrap(measureVolume(solid));
    expect(Math.abs(vol)).toBeCloseTo(600, 0);
  });
});

describe('fillet', () => {
  it('fillets all edges of a box with constant radius', () => {
    const b = box(10, 10, 10);
    const result = fillet(b, 1);
    expect(isOk(result)).toBe(true);
    const filleted = unwrap(result);
    const vol = unwrap(measureVolume(filleted));
    expect(vol).toBeLessThan(1000);
    expect(vol).toBeGreaterThan(800);
  });

  it('fillets specific edges', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = fillet(b, [edges[0]!], 1);
    expect(isOk(result)).toBe(true);
    const vol = unwrap(measureVolume(unwrap(result)));
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
    const vol = unwrap(measureVolume(unwrap(result)));
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
    const vol = unwrap(measureVolume(unwrap(result)));
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
    const originalArea = unwrap(measureArea(s));
    const result = offset(s, 1);
    expect(isOk(result)).toBe(true);
    const area = unwrap(measureArea(unwrap(result)));
    expect(area).toBeGreaterThan(originalArea);
  });

  it('offsets a sphere inward', () => {
    const s = sphere(5);
    const originalArea = unwrap(measureArea(s));
    const result = offset(s, -1);
    expect(isOk(result)).toBe(true);
    const area = unwrap(measureArea(unwrap(result)));
    expect(area).toBeLessThan(originalArea);
  });

  it('returns error for zero distance', () => {
    const s = sphere(5);
    const result = offset(s, 0);
    expect(isErr(result)).toBe(true);
  });
});

describe('fillet with array radius', () => {
  // OCCT V8 RC4: variable radius fillet crashes with memory access out of bounds
  it.skip('fillets a specific edge with variable radius [r1, r2]', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.variableFilletRadius');
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = fillet(b, [edges[0]!], [1, 2]);
    expect(isOk(result)).toBe(true);
    const vol = unwrap(measureVolume(unwrap(result)));
    expect(vol).toBeLessThan(1000);
    expect(vol).toBeGreaterThan(900);
  });

  it('returns error when one radius in array is zero', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = fillet(b, [edges[0]!], [1, 0]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('INVALID_FILLET_RADIUS');
  });

  it('returns error when one radius in array is negative', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = fillet(b, [edges[0]!], [0, -1]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('INVALID_FILLET_RADIUS');
  });
});

describe('fillet with callback returning null or array', () => {
  it('callback returning null skips all edges (kernel errors with no edges added)', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = fillet(b, edges, () => null);
    // When all edges are skipped (null -> 0, which fails the > 0 check),
    // kernel builder has no edges and throws on Shape()
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('FILLET_NO_EDGES');
  });

  // OCCT V8 RC4: variable radius fillet crashes with memory access out of bounds
  it.skip('callback returning [r1, r2] applies variable fillet', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.variableFilletCallback');
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = fillet(b, edges.slice(0, 2), () => [1, 2]);
    expect(isOk(result)).toBe(true);
    const vol = unwrap(measureVolume(unwrap(result)));
    expect(vol).toBeLessThan(1000);
  });
});

describe('chamfer with array distance', () => {
  it('chamfers a specific edge with asymmetric distances [d1, d2]', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = chamfer(b, [edges[0]!], [1, 2]);
    expect(isOk(result)).toBe(true);
    const vol = unwrap(measureVolume(unwrap(result)));
    expect(vol).toBeLessThan(1000);
  });

  it('returns error when one distance in array is zero', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = chamfer(b, [edges[0]!], [0, 1]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('INVALID_CHAMFER_DISTANCE');
  });

  it('returns error when one distance in array is negative', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = chamfer(b, [edges[0]!], [-1, 1]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('INVALID_CHAMFER_DISTANCE');
  });
});

describe('chamfer with callback returning null or array', () => {
  it('callback returning null skips all edges (kernel errors with no edges added)', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = chamfer(b, edges, () => null);
    // When all edges are skipped (null -> 0, which fails the > 0 check),
    // kernel builder has no edges and throws on Shape()
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('CHAMFER_NO_EDGES');
  });

  it('callback returning [d1, d2] applies asymmetric chamfer', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = chamfer(b, edges.slice(0, 2), () => [1, 2]);
    expect(isOk(result)).toBe(true);
    const vol = unwrap(measureVolume(unwrap(result)));
    expect(vol).toBeLessThan(1000);
  });
});

// ---------------------------------------------------------------------------
// Draft validation
// ---------------------------------------------------------------------------

describe('draft validation errors', () => {
  it('rejects empty faces list', () => {
    const b = box(10, 10, 10);
    const result = draft(b, [], [0, 0, 1], [0, 0, 0], 5);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('DRAFT_NO_FACES');
  });
});

// ---------------------------------------------------------------------------
// Variable-radius fillet validation
// ---------------------------------------------------------------------------

describe('variableFillet validation', () => {
  it('rejects empty radii array', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = variableFillet(b, edges[0]!, []);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('VARIABLE_FILLET_FAILED');
  });

  it('rejects negative radius', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = variableFillet(b, edges[0]!, [{ param: 0, radius: -1 }]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('VARIABLE_FILLET_FAILED');
  });

  it('rejects zero radius', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = variableFillet(b, edges[0]!, [{ param: 0, radius: 0 }]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('VARIABLE_FILLET_FAILED');
  });
});

// ---------------------------------------------------------------------------
// Null-shape pre-validation tests
// ---------------------------------------------------------------------------

describe('null-shape pre-validation', () => {
  function makeNullShape(): Shape3D {
    const oc = getKernel().oc;
    return createSolid(new oc.TopoDS_Solid());
  }

  it('fillet rejects null shape', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.nullShapeValidation');
    const result = fillet(makeNullShape(), 1);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('chamfer rejects null shape', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.nullShapeValidation');
    const result = chamfer(makeNullShape(), 1);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('shell rejects null shape', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.nullShapeValidation');
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const result = shell(makeNullShape(), [faces[0]!], 1);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('offset rejects null shape', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.nullShapeValidation');
    const result = offset(makeNullShape(), 1);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });
});
