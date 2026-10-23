/* eslint-disable @typescript-eslint/no-non-null-assertion -- test array indexing */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from './setup.js';
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
  cylinder,
  getBounds,
  isValid,
} from '@/index.js';
import { shell as shellFn } from '@/topology/modifierFns.js';
import type { Face, Shape3D } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function faceAtHeight(solid: Shape3D, z: number): Face {
  const face = getFaces(solid).find((f) => {
    const b = getBounds(f);
    return Math.abs(b.zMin - z) < 1e-6 && Math.abs(b.zMax - z) < 1e-6;
  });
  if (!face) throw new Error(`no planar face at z=${z}`);
  return face;
}

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

  it('keeps a wall just under half the width', () => {
    const b = box(10, 10, 10);
    const vol = unwrap(measureVolume(unwrap(shell(b, [faceAtHeight(b, 10)], 4.9))));
    expect(vol).toBeCloseTo(1000 - 0.2 * 0.2 * 5.1, 6);
  });

  it('rejects a wall the body cannot take instead of returning it unchanged', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.shellNoEffect');
    const b = box(10, 10, 10);
    const error = unwrapErr(shell(b, [faceAtHeight(b, 10)], 6));
    expect(error.code).toBe('SHELL_NO_EFFECT');
    expect(error.suggestion).toBeDefined();
  });

  it('keeps a valid shell whose cavity is a sliver of the volume', () => {
    const b = box(10, 10, 10);
    const shelled = unwrap(shell(b, [faceAtHeight(b, 10)], 4.999, { tolerance: 1e-6 }));
    expect(isValid(shelled)).toBe(true);
    expect(unwrap(measureVolume(shelled))).toBeLessThan(1000);
  });

  it('rejects an inverted curved wall on the no-history path too', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.shellInvertedCurvedWall');
    const c = cylinder(5, 10);
    const result = shellFn(c, [faceAtHeight(c, 10)], 6, 1e-3, { trackEvolution: false });
    expect(unwrapErr(result).metadata?.['reason']).toBe('wall-distance');
  });

  it('rejects an unchanged result on the no-history path too', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.shellNoEffect');
    const b = box(10, 10, 10);
    const result = shellFn(b, [faceAtHeight(b, 10)], 6, 1e-3, {
      trackEvolution: false,
    });
    expect(unwrapErr(result).code).toBe('SHELL_NO_EFFECT');
  });

  it('rejects a wall that leaves no valid body', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.shellOverThickWall');
    const b = box(10, 10, 10);
    expect(unwrapErr(shell(b, [faceAtHeight(b, 10)], 5)).code).toBe('SHELL_INVALID_RESULT');
  });

  it('rejects a wall past a curved face that comes back inverted', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.shellInvertedCurvedWall');
    const c = cylinder(5, 10);
    const opened = faceAtHeight(c, 10);
    const thin = unwrap(shell(c, [opened], 1));
    expect(isValid(thin)).toBe(true);

    // The r=5 cylinder at wall 6 comes back from the kernel as a valid solid
    // with an r=1 inverted cavity; only the wall distance exposes it.
    const error = unwrapErr(shell(c, [opened], 6));
    expect(error.code).toBe('SHELL_INVALID_RESULT');
    expect(error.metadata?.['reason']).toBe('wall-distance');
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

  it('offsets a box inward by just under half its width', () => {
    const vol = unwrap(measureVolume(unwrap(offset(box(10, 10, 10), -4.9))));
    expect(vol).toBeCloseTo(0.2 ** 3, 6);
  });

  it('rejects an inward offset that consumes the body', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.offsetConsumesBody');
    for (const distance of [-5, -6]) {
      // occt-wasm hands back a null shape; opencascade.js throws from the kernel.
      expect(['OFFSET_INVALID_RESULT', 'OFFSET_FAILED']).toContain(
        unwrapErr(offset(box(10, 10, 10), distance)).code
      );
    }
  });
});

describe('defeature', () => {
  it('removes the fillet face and heals back to the original box volume', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.defeatureFilletFace');
    const b = box(20, 20, 20);
    const edges = getEdges(b);
    const filleted = unwrap(fillet(b, [edges[0]!], 2));
    expect(unwrap(measureVolume(filleted))).toBeLessThan(8000);

    const kernel = getKernel();
    const volumes = getFaces(filleted).map((f) =>
      unwrap(measureVolume(castShape(kernel.defeature(filleted.wrapped, [f.wrapped]))))
    );

    // Only the fillet surface is a removable feature; every other face is left
    // untouched, so exactly one removal restores the original box.
    expect(volumes.filter((v) => Math.abs(v - 8000) < 1e-6)).toHaveLength(1);
  });
});

describe('fillet with array radius', () => {
  it('fillets a specific edge with variable radius [r1, r2]', (ctx) => {
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

  it('callback returning [r1, r2] applies variable fillet', (ctx) => {
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

// occt-wasm gained a linear (<=2-point) variable fillet: its primitive takes an
// edge arena id (the caller passes a stable hash to resolve) and wraps the result
// in a single-solid compound (uniform fillet returns a bare solid). Gated to
// occt-wasm — occt (opencascade.js) doesn't implement it and brepkit's variable
// fillet reports a physically-impossible volume (its own divergence).
describe.skipIf(currentKernel !== 'occt-wasm')('variableFillet on occt-wasm', () => {
  it('applies a linear (2-point) taper, yielding a valid smaller solid', () => {
    const b = box(10, 10, 10);
    const result = variableFillet(b, getEdges(b)[0]!, [
      { param: 0, radius: 1 },
      { param: 1, radius: 3 },
    ]);
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(isSolid(solid)).toBe(true);
    const vol = unwrap(measureVolume(solid));
    expect(vol).toBeLessThan(1000);
    expect(vol).toBeGreaterThan(900);
  });

  it('a constant profile matches a uniform fillet of the same radius', () => {
    const b = box(10, 10, 10);
    const edge = getEdges(b)[0]!;
    const variable = variableFillet(b, edge, [{ param: 0, radius: 2 }]);
    const uniform = fillet(b, [edge], 2);
    expect(isOk(variable)).toBe(true);
    expect(isOk(uniform)).toBe(true);
    expect(unwrap(measureVolume(unwrap(variable)))).toBeCloseTo(
      unwrap(measureVolume(unwrap(uniform))),
      3
    );
  });

  it('rejects a multi-point (>2) profile as unsupported', () => {
    const b = box(10, 10, 10);
    const result = variableFillet(b, getEdges(b)[0]!, [
      { param: 0, radius: 1 },
      { param: 0.5, radius: 5 },
      { param: 1, radius: 1 },
    ]);
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
