/* eslint-disable @typescript-eslint/no-non-null-assertion -- test array indexing */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from './setup.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';
import {
  sketchRectangle,
  box,
  sphere,
  castShape,
  isShape3D,
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
  cut,
  fuse,
  translate,
  removeFaces,
  shape,
  curveStartPoint,
} from '@/index.js';
import { fillet as filletFn, shell as shellFn } from '@/topology/modifierFns.js';
import { castResultShape } from '@/core/shapeTypes.js';
import type { Dimension, Edge, Face, Shape3D, ValidSolid } from '@/core/shapeTypes.js';

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

describe('fillet and chamfer failures name their edges', () => {
  // On a 20x20x2 plate a 3 mm round fits a vertical corner edge (its side faces
  // are 20 wide) but not a top edge (its side face is only 2 tall).
  function plateEdges(plate: Shape3D) {
    const edges = getEdges(plate);
    const span = (e: Edge) => getBounds(e);
    const vertical = edges.find((e) => span(e).zMax - span(e).zMin > 1);
    const top = edges.find((e) => span(e).zMax - span(e).zMin < 1e-6 && span(e).zMin > 1.9);
    if (!vertical || !top) throw new Error('plate edges not found');
    return { vertical, top };
  }

  it('fillet puts the edge it could not round in metadata.failedEdges', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.edgeTreatmentFailedEdges');
    using plate = box(20, 20, 2);
    const { vertical, top } = plateEdges(plate);
    using rounded = unwrap(fillet(plate, [vertical], 3));
    expect(isSolid(rounded)).toBe(true);

    const error = unwrapErr(fillet(plate, [vertical, top], 3));
    expect(error.code).toBe('FILLET_FAILED');
    const failed = error.metadata?.['failedEdges'] as Edge[];
    expect(failed).toHaveLength(1);
    expect(failed[0]).toBe(top);
    expect(error.suggestion).toContain('failedEdges');
  });

  it('chamfer puts the edge it could not bevel in metadata.failedEdges', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.edgeTreatmentFailedEdges');
    using plate = box(20, 20, 2);
    const { vertical, top } = plateEdges(plate);
    const error = unwrapErr(chamfer(plate, [vertical, top], 3));
    expect(error.code).toBe('CHAMFER_FAILED');
    const failed = error.metadata?.['failedEdges'] as Edge[];
    expect(failed).toHaveLength(1);
    expect(failed[0]).toBe(top);
  });
});

describe('removeFaces', () => {
  const inside = (f: Face, [x0, x1]: [number, number], [z0, z1]: [number, number]) => {
    const b = getBounds(f);
    const eps = 1e-6;
    return (
      b.xMin >= x0 - eps &&
      b.xMax <= x1 + eps &&
      b.yMin >= x0 - eps &&
      b.yMax <= x1 + eps &&
      b.zMin >= z0 - eps &&
      b.zMax <= z1 + eps
    );
  };
  const facesInside = (part: Shape3D, xs: [number, number], zs: [number, number]) =>
    getFaces(part).filter((f) => inside(f, xs, zs));
  const bottomOf = (part: Shape3D) => {
    const bottom = getFaces(part).find((f) => getBounds(f).zMax < 1e-6);
    if (!bottom) throw new Error('bottom face not found');
    return bottom;
  };

  function pocketed() {
    using base = box(20, 20, 10);
    using tool0 = box(4, 4, 5);
    using tool = translate(tool0, [8, 8, 5]);
    return unwrap(cut(base, tool));
  }

  function holed() {
    using base = box(20, 20, 10);
    using tool0 = cylinder(2, 20);
    using tool = translate(tool0, [10, 10, -5]);
    return unwrap(cut(base, tool));
  }

  it('removes a pocket and closes the face it was cut into', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.removeFaces');
    using part = pocketed();
    const pocket = facesInside(part, [8, 12], [5, 10]);
    expect(pocket).toHaveLength(5);
    using healed = unwrap(removeFaces(part, pocket));
    expect(isSolid(healed)).toBe(true);
    expect(isValid(healed)).toBe(true);
    expect(unwrap(measureVolume(healed))).toBeCloseTo(4000, 6);
    expect(getFaces(healed)).toHaveLength(6);
  });

  it('removes a cylindrical hole', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.removeFaces');
    skipIfDiverges(ctx, 'modifierFns.removeFacesCurved');
    using part = holed();
    using healed = unwrap(removeFaces(part, facesInside(part, [8, 12], [0, 10])));
    expect(unwrap(measureVolume(healed))).toBeCloseTo(4000, 6);
  });

  it('reports a face whose neighbours cannot close its gap', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.removeFaces');
    skipIfDiverges(ctx, 'modifierFns.removeFacesKept');
    using part = pocketed();
    const error = unwrapErr(removeFaces(part, [bottomOf(part)]));
    expect(error.code).toBe('REMOVE_FACES_INCOMPLETE');
    expect(error.metadata?.['keptFaceIndexes']).toEqual([0]);
  });

  it('names every pick when the kernel hands the body back unchanged', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.removeFaces');
    skipIfDiverges(ctx, 'modifierFns.removeFacesCurved');
    skipIfDiverges(ctx, 'modifierFns.removeFacesKept');
    // OCCT removes nothing when one pick cannot close: the hole stays too.
    using part = holed();
    const [hole] = facesInside(part, [8, 12], [0, 10]);
    if (!hole) throw new Error('hole face not found');
    const error = unwrapErr(removeFaces(part, [hole, bottomOf(part)]));
    expect(error.code).toBe('REMOVE_FACES_INCOMPLETE');
    expect(error.metadata?.['keptFaceIndexes']).toEqual([0, 1]);
  });

  it('keeps a filled hole apart from a collar of equal area and centroid', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.removeFaces');
    skipIfDiverges(ctx, 'modifierFns.removeFacesCurved');
    // A spool: an r=4 x 5 collar between two plates, bored r=2 through all 10.
    // The bore and the collar are both cylinders of area 40 pi centred at z=5.
    using lower = box(20, 20, 2.5);
    using upper0 = box(20, 20, 2.5);
    using upper = translate(upper0, [0, 0, 7.5]);
    using collar0 = cylinder(4, 5);
    using collar = translate(collar0, [10, 10, 2.5]);
    using bore0 = cylinder(2, 20);
    using boreTool = translate(bore0, [10, 10, -5]);
    using plates = unwrap(fuse(lower, upper));
    using spool = unwrap(fuse(plates, collar));
    using part = unwrap(cut(spool, boreTool));
    using filled = unwrap(removeFaces(part, facesInside(part, [8, 12], [0, 10])));
    expect(unwrap(measureVolume(filled))).toBeCloseTo(2 * 20 * 20 * 2.5 + Math.PI * 16 * 5, 6);
  });

  it('rejects a face of another shape', () => {
    using part = pocketed();
    using other0 = box(5, 5, 5);
    using other = translate(other0, [100, 0, 0]);
    const [foreign] = getFaces(other);
    if (!foreign) throw new Error('no face');
    const error = unwrapErr(removeFaces(part, [foreign]));
    expect(error.code).toBe('FACE_NOT_IN_SHAPE');
    expect(error.metadata?.['faceIndex']).toBe(0);
  });

  it('rejects an empty face list', () => {
    using b = box(10, 10, 10);
    expect(unwrapErr(removeFaces(b, [])).code).toBe('NO_FACES');
  });

  it('is chainable on the fluent wrapper', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.removeFaces');
    using part = pocketed();
    using healed = shape(part).removeFaces(facesInside(part, [8, 12], [5, 10])).val;
    expect(unwrap(measureVolume(healed))).toBeCloseTo(4000, 6);
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
    const volumes = getFaces(filleted).map((f) => {
      const defeatured = castShape(kernel.defeature(filleted.wrapped, [f.wrapped]));
      if (!isShape3D(defeatured)) throw new Error('expected a 3D shape');
      return unwrap(measureVolume(defeatured));
    });

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

// The four vertical edges of a 10 mm cube share no vertex, so each one removes
// its own prism: (1 - π/4)·r²·10 for a fillet of radius r, d1·d2/2·10 for a
// chamfer set back d1 and d2.
describe('per-edge fillet radii and chamfer distances', () => {
  const FILLET_LOSS = 1 - Math.PI / 4;

  function verticalEdges(solid: Shape3D): Edge[] {
    return getEdges(solid).filter((e) => getBounds(e).zMax - getBounds(e).zMin > 5);
  }

  /** The value for a vertical edge on the x = 0 side, or on the x = 10 side. */
  function bySide<V>(nearSide: V, farSide: V): (edge: Edge<Dimension>) => V {
    return (edge) => (getBounds(edge).xMin < 5 ? nearSide : farSide);
  }

  it('fillets each edge at its own radius', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.perEdgeValues');
    using b = box(10, 10, 10);
    using rounded = unwrap(fillet(b, verticalEdges(b), bySide(1, 3)));
    expect(unwrap(measureVolume(rounded))).toBeCloseTo(1000 - FILLET_LOSS * 10 * 20, 6);
  });

  it('fillets each edge at its own radius without tracking evolution', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.perEdgeValues');
    using b = box(10, 10, 10);
    using rounded = unwrap(filletFn(b, verticalEdges(b), bySide(1, 3), { trackEvolution: false }));
    expect(unwrap(measureVolume(rounded))).toBeCloseTo(1000 - FILLET_LOSS * 10 * 20, 6);
  });

  it('tapers a fillet from the start radius at the edge start to the end radius', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.perEdgeValues');
    using b = box(10, 10, 10);
    const edge = verticalEdges(b)[0]!;
    using tapered = unwrap(fillet(b, [edge], [1, 3]));
    const vol = unwrap(measureVolume(tapered));
    expect(vol).toBeLessThan(1000 - FILLET_LOSS * 10 * 1);
    expect(vol).toBeGreaterThan(1000 - FILLET_LOSS * 10 * 9);
    // Each cap keeps its square less the corner its end radius rounds off.
    const startZ = curveStartPoint(edge)[2];
    const startCap = unwrap(measureArea(faceAtHeight(tapered, startZ)));
    const endCap = unwrap(measureArea(faceAtHeight(tapered, 10 - startZ)));
    expect(startCap).toBeCloseTo(100 - FILLET_LOSS * 1, 6);
    expect(endCap).toBeCloseTo(100 - FILLET_LOSS * 9, 6);
  });

  it('sets an asymmetric chamfer back by both distances', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.perEdgeValues');
    using b = box(10, 10, 10);
    using chamfered = unwrap(chamfer(b, [verticalEdges(b)[0]!], [1, 2]));
    expect(unwrap(measureVolume(chamfered))).toBeCloseTo(1000 - 10, 6);
  });

  it('chamfers each edge at its own distances', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.perEdgeValues');
    using b = box(10, 10, 10);
    using symmetric = unwrap(chamfer(b, verticalEdges(b), bySide(1, 2)));
    expect(unwrap(measureVolume(symmetric))).toBeCloseTo(1000 - 10 * (0.5 + 0.5 + 2 + 2), 6);
    const mixed = bySide<number | [number, number]>([1, 2], 1);
    using both = unwrap(chamfer(b, verticalEdges(b), mixed));
    expect(unwrap(measureVolume(both))).toBeCloseTo(1000 - 10 * (1 + 1 + 0.5 + 0.5), 6);
  });

  it("chamfers each edge at its own distances through the kernel's chamfer", (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.perEdgeValues');
    using b = box(10, 10, 10);
    const edges = verticalEdges(b);
    const near = new Set(edges.filter((e) => getBounds(e).xMin < 5).map((e) => e.wrapped));
    using chamfered = castResultShape(
      getKernel().chamfer(
        b.wrapped,
        edges.map((e) => e.wrapped),
        (edge) => (near.has(edge) ? 1 : 2)
      )
    );
    expect(unwrap(measureVolume(chamfered as Shape3D))).toBeCloseTo(1000 - 10 * 5, 6);
  });
});

// ---------------------------------------------------------------------------
// Draft validation
// ---------------------------------------------------------------------------

describe('draft validation errors', () => {
  it('rejects empty faces list', () => {
    const b = box(10, 10, 10);
    const result = draft(b, [], { pullDirection: [0, 0, 1], neutralPlane: [0, 0, 0], angle: 5 });
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
  function makeNullShape(): ValidSolid {
    const oc = getKernel().oc;
    return createSolid(new oc.TopoDS_Solid()) as ValidSolid;
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
