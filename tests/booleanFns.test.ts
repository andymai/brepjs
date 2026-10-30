import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';
import {
  box,
  sphere,
  translate,
  compound,
  fuse,
  cut,
  intersect,
  section,
  sectionToFace,
  split,
  slice,
  fuseAll,
  cutAll,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  isFace,
  isCompound,
  isShape3D,
  getShapeKind,
  getEdges,
  getFaces,
  getKernel,
  createSolid,
  measureVolume,
  measureArea,
  tagFaces,
  findFacesByTag,
  getBounds,
} from '@/index.js';
import type { BooleanOptions } from '@/index.js';
import type { Shape3D } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function boxAt(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): Shape3D {
  const b = box(x2 - x1, y2 - y1, z2 - z1);
  if (x1 === 0 && y1 === 0 && z1 === 0) return b;
  return translate(b, [x1, y1, z1]);
}

describe('fuse', () => {
  it('fuses two boxes', () => {
    const result = fuse(boxAt(0, 0, 0, 10, 10, 10), boxAt(10, 0, 0, 20, 10, 10));
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    expect(isShape3D(shape)).toBe(true);
    expect(unwrap(measureVolume(shape))).toBeCloseTo(2000, 0);
  });

  // Two face-adjacent 30 x 40 x 10 boxes fuse into a 60 x 40 x 10 solid whose
  // four side faces stay split at x = 0 until simplify merges them (10 faces to
  // 6). The tags on both operands' faces follow them onto the merged faces.
  it('simplifies a tracked fuse and keeps both operands face tags', () => {
    using a = box(30, 40, 10);
    using twin = box(30, 40, 10);
    using b = translate(twin, [-30, 0, 0]);
    tagFaces(a, (f) => getBounds(f).zMin > 9.9, 'top');
    tagFaces(b, (f) => getBounds(f).xMax < -29.9, 'far');
    using merged = unwrap(fuse(a, b, { simplify: true }));
    expect(getFaces(merged)).toHaveLength(6);
    expect(unwrap(measureVolume(merged))).toBeCloseTo(24000, 6);
    const [top] = findFacesByTag(merged, 'top');
    if (!top) throw new Error('no face kept the top tag');
    expect(unwrap(measureArea(top))).toBeCloseTo(60 * 40, 6);
    const far = findFacesByTag(merged, 'far');
    expect(far).toHaveLength(1);
    expect(getBounds(far[0] ?? top).xMax).toBeCloseTo(-30, 6);
    using untracked = unwrap(fuse(a, b, { simplify: true, trackEvolution: false }));
    expect(getFaces(untracked)).toHaveLength(6);
  });

  it('fuses overlapping boxes', () => {
    const result = fuse(boxAt(0, 0, 0, 10, 10, 10), boxAt(5, 0, 0, 15, 10, 10));
    expect(isOk(result)).toBe(true);
    expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(1500, 0);
  });
});

describe('cut', () => {
  it('cuts a box', () => {
    const result = cut(boxAt(0, 0, 0, 10, 10, 10), boxAt(5, 0, 0, 15, 10, 10));
    expect(isOk(result)).toBe(true);
    expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(500, 0);
  });
});

describe('intersect', () => {
  it('intersects two overlapping boxes', () => {
    const result = intersect(boxAt(0, 0, 0, 10, 10, 10), boxAt(5, 0, 0, 15, 10, 10));
    expect(isOk(result)).toBe(true);
    expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(500, 0);
  });
});

describe('fuseAll', () => {
  it('fuses multiple boxes', () => {
    const result = fuseAll([boxAt(0, 0, 0, 10, 10, 10), boxAt(10, 0, 0, 20, 10, 10)]);
    expect(isOk(result)).toBe(true);
    expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(2000, 0);
  });

  it('fuses single box', () => {
    const result = fuseAll([boxAt(0, 0, 0, 10, 10, 10)]);
    expect(isOk(result)).toBe(true);
    expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(1000, 0);
  });

  // Disposing the result must leave the caller's shape alive: a single shape
  // used to come back as the input handle itself.
  it.each([
    ['native', {}],
    ['pairwise', { strategy: 'pairwise' }],
    ['untracked', { trackEvolution: false }],
  ] as [string, BooleanOptions][])(
    'fuses one shape (%s) into a copy the caller can dispose without losing the input',
    (_name, options) => {
      using b = box(2, 2, 2);
      const result = unwrap(fuseAll([b], options));
      expect(result).not.toBe(b);
      expect(result.wrapped).not.toBe(b.wrapped);
      result[Symbol.dispose]();
      expect(unwrap(measureVolume(b))).toBeCloseTo(8, 6);
    }
  );

  it('keeps face tags on the copy of a single shape', () => {
    using b = box(10, 10, 10);
    const first = getFaces(b)[0];
    if (!first) throw new Error('box has no faces');
    tagFaces(b, [first], 'kept');
    using result = unwrap(fuseAll([b]));
    const kept = findFacesByTag(result, 'kept');
    expect(kept).toHaveLength(1);
    expect(unwrap(measureArea(kept[0] ?? result))).toBeCloseTo(100, 6);
  });

  it('returns error for empty array', () => {
    const result = fuseAll([]);
    expect(isErr(result)).toBe(true);
  });
});

describe('cutAll', () => {
  it('cuts multiple shapes from a base', () => {
    const result = cutAll(boxAt(0, 0, 0, 20, 10, 10), [boxAt(0, 0, 0, 5, 10, 10)]);
    expect(isOk(result)).toBe(true);
    expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(1500, 0);
  });

  it('returns a copy of the base for empty tools', () => {
    const result = cutAll(boxAt(0, 0, 0, 10, 10, 10), []);
    expect(isOk(result)).toBe(true);
    expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(1000, 0);
  });

  // Disposing the result must leave the caller's base alive: empty tools used to
  // hand back the base handle itself.
  it.each([
    ['tracked', {}],
    ['untracked', { trackEvolution: false }],
  ] as [string, BooleanOptions][])(
    'cuts nothing (%s) into a copy the caller can dispose without losing the base',
    (_name, options) => {
      using b = box(2, 2, 2);
      const result = unwrap(cutAll(b, [], options));
      expect(result).not.toBe(b);
      expect(result.wrapped).not.toBe(b.wrapped);
      result[Symbol.dispose]();
      expect(unwrap(measureVolume(b))).toBeCloseTo(8, 6);
    }
  );

  it('keeps face tags on the copy of the base for empty tools', () => {
    using b = box(10, 10, 10);
    const first = getFaces(b)[0];
    if (!first) throw new Error('box has no faces');
    tagFaces(b, [first], 'kept');
    using result = unwrap(cutAll(b, []));
    const kept = findFacesByTag(result, 'kept');
    expect(kept).toHaveLength(1);
    expect(unwrap(measureArea(kept[0] ?? result))).toBeCloseTo(100, 6);
  });
});

describe('compound', () => {
  it('builds a compound from shapes', () => {
    const result = compound([boxAt(0, 0, 0, 10, 10, 10), boxAt(20, 0, 0, 30, 10, 10)]);
    expect(isCompound(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge case tests
// ---------------------------------------------------------------------------

describe('boolean edge cases', () => {
  describe('non-overlapping shapes', () => {
    it('fuse disjoint boxes preserves total volume', () => {
      const result = fuse(boxAt(0, 0, 0, 10, 10, 10), boxAt(100, 0, 0, 110, 10, 10));
      expect(isOk(result)).toBe(true);
      // Total volume should be 2000 (two separate 1000 unit boxes)
      expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(2000, 0);
    });

    it('intersect disjoint boxes produces empty or negligible volume', () => {
      const result = intersect(boxAt(0, 0, 0, 10, 10, 10), boxAt(100, 0, 0, 110, 10, 10));
      // Disjoint intersection yields a successful empty / near-zero-volume result.
      expect(isOk(result)).toBe(true);
      const vol = unwrap(measureVolume(unwrap(result)));
      expect(vol).toBeLessThan(1);
    });

    it('cut with disjoint tool preserves base volume', () => {
      const result = cut(boxAt(0, 0, 0, 10, 10, 10), boxAt(100, 0, 0, 110, 10, 10));
      expect(isOk(result)).toBe(true);
      expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(1000, 0);
    });
  });

  describe('self operations', () => {
    it('fuse shape with itself', () => {
      const b = boxAt(0, 0, 0, 10, 10, 10);
      const result = fuse(b, b);
      expect(isOk(result)).toBe(true);
      expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(1000, 0);
    });

    it('intersect shape with itself preserves volume', () => {
      const b = boxAt(0, 0, 0, 10, 10, 10);
      const result = intersect(b, b);
      expect(isOk(result)).toBe(true);
      expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(1000, 0);
    });
  });

  describe('options', () => {
    it('fuse with simplify option', () => {
      const result = fuse(boxAt(0, 0, 0, 10, 10, 10), boxAt(10, 0, 0, 20, 10, 10), {
        simplify: true,
      });
      expect(isOk(result)).toBe(true);
      expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(2000, 0);
    });

    it('fuse with commonFace optimisation', () => {
      const result = fuse(boxAt(0, 0, 0, 10, 10, 10), boxAt(10, 0, 0, 20, 10, 10), {
        optimisation: 'commonFace',
      });
      expect(isOk(result)).toBe(true);
      expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(2000, 0);
    });

    it('fuse with sameFace optimisation', () => {
      const result = fuse(boxAt(0, 0, 0, 10, 10, 10), boxAt(10, 0, 0, 20, 10, 10), {
        optimisation: 'sameFace',
      });
      expect(isOk(result)).toBe(true);
      expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(2000, 0);
    });

    it('cut with simplify option', () => {
      const result = cut(boxAt(0, 0, 0, 20, 10, 10), boxAt(5, 0, 0, 15, 10, 10), {
        simplify: true,
      });
      expect(isOk(result)).toBe(true);
      expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(1000, 0);
    });

    it('intersect with simplify option', () => {
      const result = intersect(boxAt(0, 0, 0, 10, 10, 10), boxAt(5, 0, 0, 15, 10, 10), {
        simplify: true,
      });
      expect(isOk(result)).toBe(true);
      expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(500, 0);
    });
  });

  describe('fuseAll strategies', () => {
    it('fuseAll with pairwise strategy', () => {
      const result = fuseAll(
        [boxAt(0, 0, 0, 10, 10, 10), boxAt(10, 0, 0, 20, 10, 10), boxAt(20, 0, 0, 30, 10, 10)],
        { strategy: 'pairwise' }
      );
      expect(isOk(result)).toBe(true);
      expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(3000, 0);
    });

    it('pairwise strategy honors simplify for a two-shape fuse (regression)', (ctx) => {
      // Two face-adjacent boxes fuse into a 20x10x10 solid whose four side faces
      // stay split at x=10 until simplify (BRepAlgoAPI_Fuse::SimplifyResult) merges
      // them, dropping the face count from 10 to 6. The pairwise leaf previously
      // hard-coded simplify:false for the two-input case, silently dropping the
      // caller's request — with 3+ inputs the top-level combine reapplies it, but a
      // two-input fuse is a lone leaf with no combine downstream. Kernels that
      // ignore the option on fuse skip this (see the divergence registry).
      skipIfDiverges(ctx, 'booleanFns.pairwiseSimplifyFaceMerge');
      const boxes = (): [Shape3D, Shape3D] => [
        boxAt(0, 0, 0, 10, 10, 10),
        boxAt(10, 0, 0, 20, 10, 10),
      ];
      const plain = fuseAll(boxes(), { strategy: 'pairwise', simplify: false });
      const simplified = fuseAll(boxes(), { strategy: 'pairwise', simplify: true });
      expect(isOk(plain)).toBe(true);
      expect(isOk(simplified)).toBe(true);
      const simplifiedShape = unwrap(simplified);
      expect(unwrap(measureVolume(simplifiedShape))).toBeCloseTo(2000, 0);
      expect(getFaces(simplifiedShape).length).toBeLessThan(getFaces(unwrap(plain)).length);
    });

    it('fuseAll with native strategy (default)', () => {
      const result = fuseAll([
        boxAt(0, 0, 0, 10, 10, 10),
        boxAt(10, 0, 0, 20, 10, 10),
        boxAt(20, 0, 0, 30, 10, 10),
      ]);
      expect(isOk(result)).toBe(true);
      expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(3000, 0);
    });

    it('fuseAll native strategy correctly identifies result as Shape3D', () => {
      // This test verifies that the isShape3D check works correctly by using
      // the kernel shape type enum (not constructor.name which gets minified).
      // When fusing disjoint boxes, native strategy returns a COMPOUND, which
      // must be correctly identified as a 3D shape.
      const result = fuseAll(
        [boxAt(0, 0, 0, 10, 10, 10), boxAt(100, 0, 0, 110, 10, 10)], // disjoint
        { strategy: 'native' }
      );
      expect(isOk(result)).toBe(true);
      const shape = unwrap(result);
      expect(isShape3D(shape)).toBe(true);
      // Disjoint boxes should have combined volume
      expect(unwrap(measureVolume(shape))).toBeCloseTo(2000, 0);
    });
  });

  describe('cutAll edge cases', () => {
    it('cutAll with multiple overlapping tools', () => {
      const result = cutAll(boxAt(0, 0, 0, 30, 10, 10), [
        boxAt(0, 0, 0, 10, 10, 10),
        boxAt(20, 0, 0, 30, 10, 10),
      ]);
      expect(isOk(result)).toBe(true);
      expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(1000, 0); // Middle third remains
    });
  });
});

// ---------------------------------------------------------------------------
// Compound shape verification tests (TDD for minification-resistant checks)
// ---------------------------------------------------------------------------

describe('compound shape verification', () => {
  // These tests verify that operations returning COMPOUND shapes are correctly
  // identified as 3D shapes. This is critical because class name checks would
  // fail in minified builds where "Compound" becomes something like "pc".

  describe('fuseAll compound results', () => {
    it('three disjoint boxes returns valid Shape3D', () => {
      const result = fuseAll([
        boxAt(0, 0, 0, 10, 10, 10),
        boxAt(50, 0, 0, 60, 10, 10),
        boxAt(100, 0, 0, 110, 10, 10),
      ]);
      expect(isOk(result)).toBe(true);
      const shape = unwrap(result);
      expect(isShape3D(shape)).toBe(true);
      expect(unwrap(measureVolume(shape))).toBeCloseTo(3000, 0);
    });

    it('four disjoint boxes at corners returns valid Shape3D', () => {
      const result = fuseAll([
        boxAt(0, 0, 0, 10, 10, 10),
        boxAt(50, 0, 0, 60, 10, 10),
        boxAt(0, 50, 0, 10, 60, 10),
        boxAt(50, 50, 0, 60, 60, 10),
      ]);
      expect(isOk(result)).toBe(true);
      const shape = unwrap(result);
      expect(isShape3D(shape)).toBe(true);
      expect(unwrap(measureVolume(shape))).toBeCloseTo(4000, 0);
    });

    it('mixed disjoint and overlapping boxes returns valid Shape3D', () => {
      // Two boxes touch (fuse to solid) + one disjoint = compound
      const result = fuseAll([
        boxAt(0, 0, 0, 10, 10, 10),
        boxAt(10, 0, 0, 20, 10, 10), // touches first box
        boxAt(100, 0, 0, 110, 10, 10), // disjoint
      ]);
      expect(isOk(result)).toBe(true);
      const shape = unwrap(result);
      expect(isShape3D(shape)).toBe(true);
      expect(unwrap(measureVolume(shape))).toBeCloseTo(3000, 0);
    });
  });

  describe('cutAll compound results', () => {
    it('cutting through box creates valid Shape3D compound', () => {
      // Cut a vertical slice through the middle, creating two separate pieces
      const result = cutAll(boxAt(0, 0, 0, 30, 10, 10), [boxAt(10, 0, 0, 20, 10, 10)]);
      expect(isOk(result)).toBe(true);
      const shape = unwrap(result);
      expect(isShape3D(shape)).toBe(true);
      expect(unwrap(measureVolume(shape))).toBeCloseTo(2000, 0); // 3000 - 1000 removed
    });

    it('multiple cuts creating three pieces returns valid Shape3D', () => {
      const result = cutAll(boxAt(0, 0, 0, 50, 10, 10), [
        boxAt(10, 0, 0, 20, 10, 10),
        boxAt(30, 0, 0, 40, 10, 10),
      ]);
      expect(isOk(result)).toBe(true);
      const shape = unwrap(result);
      expect(isShape3D(shape)).toBe(true);
      expect(unwrap(measureVolume(shape))).toBeCloseTo(3000, 0); // 5000 - 2000 removed
    });
  });

  describe('pairwise strategy compound results', () => {
    it('pairwise strategy with disjoint boxes returns valid Shape3D', () => {
      const result = fuseAll([boxAt(0, 0, 0, 10, 10, 10), boxAt(100, 0, 0, 110, 10, 10)], {
        strategy: 'pairwise',
      });
      expect(isOk(result)).toBe(true);
      const shape = unwrap(result);
      expect(isShape3D(shape)).toBe(true);
      expect(unwrap(measureVolume(shape))).toBeCloseTo(2000, 0);
    });
  });
});

// ---------------------------------------------------------------------------
// Section / cross-section tests
// ---------------------------------------------------------------------------

describe('section', () => {
  it('sections a box at mid-height with XY plane', () => {
    // Box from (0,0,0) to (10,10,10), section at z=5
    const b = boxAt(0, 0, 0, 10, 10, 10);
    const result = section(b, {
      origin: [0, 0, 5],
      xDir: [1, 0, 0],
      yDir: [0, 1, 0],
      zDir: [0, 0, 1],
    });
    expect(isOk(result)).toBe(true);
    const s = unwrap(result);
    // Section of a box at mid-height should produce edges/wires forming a square
    const kind = getShapeKind(s);
    expect(kind === 'compound' || kind === 'wire' || kind === 'edge').toBe(true);
    // Should have edges (the outline of the square cross-section)
    const edges = getEdges(s);
    expect(edges.length).toBeGreaterThanOrEqual(4);
  });

  it('sections a box with named XY plane at z=0 origin', () => {
    // Box from (-5,-5,-5) to (5,5,5), section with XY plane at z=0
    const b = boxAt(-5, -5, -5, 5, 5, 5);
    const result = section(b, 'XY');
    expect(isOk(result)).toBe(true);
    const s = unwrap(result);
    const edges = getEdges(s);
    expect(edges.length).toBeGreaterThanOrEqual(4);
  });

  it('sections a box with XZ plane', () => {
    const b = boxAt(-5, -5, -5, 5, 5, 5);
    const result = section(b, 'XZ');
    expect(isOk(result)).toBe(true);
    const s = unwrap(result);
    const edges = getEdges(s);
    expect(edges.length).toBeGreaterThanOrEqual(4);
  });

  it('sections a sphere producing a circular cross-section', () => {
    const s = sphere(10);
    const result = section(s, 'XY');
    expect(isOk(result)).toBe(true);
    const sec = unwrap(result);
    // A sphere sectioned at its equator should produce edges
    const edges = getEdges(sec);
    expect(edges.length).toBeGreaterThanOrEqual(1);
  });

  it('sections a far-off-origin shape without clipping (default planeSize)', (ctx) => {
    skipIfDiverges(ctx, 'booleanFns.sectionOffOrigin');
    // A 1000-unit box centred ~12500 from the world origin, straddling z=0. The old
    // fixed +/-1e4 cutting face centred on the plane origin only reached +/-10000, so
    // it silently clipped this shape to nothing; the bbox-derived, shape-centred face
    // covers it and yields the full square cross-section at its true location.
    const b = translate(boxAt(0, 0, 0, 1000, 1000, 10), [12000, 12000, -5]);
    const result = section(b, 'XY');
    expect(isOk(result)).toBe(true);
    const s = unwrap(result);
    expect(getEdges(s).length).toBeGreaterThanOrEqual(4);
    const bb = getKernel().boundingBox(s.wrapped);
    // Both in-plane axes must land on the off-origin 1000x1000 footprint (x,y in
    // [12000, 13000]); a clipped result would be empty or sit near the origin.
    expect(bb.min[0]).toBeGreaterThan(11000);
    expect(bb.max[0]).toBeLessThan(14000);
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(1000, 0);
    expect(bb.min[1]).toBeGreaterThan(11000);
    expect(bb.max[1]).toBeLessThan(14000);
    expect(bb.max[1] - bb.min[1]).toBeCloseTo(1000, 0);
  });

  it('returns result for plane not intersecting shape', () => {
    // Box at z=0..10, plane at z=100 — no intersection
    const b = boxAt(0, 0, 0, 10, 10, 10);
    const result = section(b, {
      origin: [0, 0, 100],
      xDir: [1, 0, 0],
      yDir: [0, 1, 0],
      zDir: [0, 0, 1],
    });
    // Should succeed but produce empty or minimal result
    expect(isOk(result)).toBe(true);
    const s = unwrap(result);
    const edges = getEdges(s);
    expect(edges.length).toBe(0);
  });

  it('accepts custom planeSize option', () => {
    const b = boxAt(0, 0, 0, 10, 10, 10);
    const result = section(b, 'XY', { planeSize: 1e6 });
    expect(isOk(result)).toBe(true);
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

  it('fuse rejects null first operand', (ctx) => {
    skipIfDiverges(ctx, 'booleanFns.nullShapeValidation');
    const result = fuse(makeNullShape(), boxAt(0, 0, 0, 10, 10, 10));
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
    expect(unwrapErr(result).message).toContain('first operand');
  });

  it('fuse rejects null second operand', (ctx) => {
    skipIfDiverges(ctx, 'booleanFns.nullShapeValidation');
    const result = fuse(boxAt(0, 0, 0, 10, 10, 10), makeNullShape());
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
    expect(unwrapErr(result).message).toContain('second operand');
  });

  it('cut rejects null base', (ctx) => {
    skipIfDiverges(ctx, 'booleanFns.nullShapeValidation');
    const result = cut(makeNullShape(), boxAt(0, 0, 0, 10, 10, 10));
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('cut rejects null tool', (ctx) => {
    skipIfDiverges(ctx, 'booleanFns.nullShapeValidation');
    const result = cut(boxAt(0, 0, 0, 10, 10, 10), makeNullShape());
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('intersect rejects null operand', (ctx) => {
    skipIfDiverges(ctx, 'booleanFns.nullShapeValidation');
    const result = intersect(makeNullShape(), boxAt(0, 0, 0, 10, 10, 10));
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('fuseAll rejects null shape in array', (ctx) => {
    skipIfDiverges(ctx, 'booleanFns.nullShapeValidation');
    const result = fuseAll([boxAt(0, 0, 0, 10, 10, 10), makeNullShape()]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
    expect(unwrapErr(result).message).toContain('index 1');
  });

  it('fuseAll rejects a lone null shape', (ctx) => {
    skipIfDiverges(ctx, 'booleanFns.nullShapeValidation');
    const result = fuseAll([makeNullShape()]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
    expect(unwrapErr(result).message).toContain('index 0');
  });

  it('cutAll rejects null base', (ctx) => {
    skipIfDiverges(ctx, 'booleanFns.nullShapeValidation');
    const result = cutAll(makeNullShape(), [boxAt(0, 0, 0, 10, 10, 10)]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('cutAll rejects a null base with no tools', (ctx) => {
    skipIfDiverges(ctx, 'booleanFns.nullShapeValidation');
    const result = cutAll(makeNullShape(), []);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('split rejects null shape', (ctx) => {
    skipIfDiverges(ctx, 'booleanFns.nullShapeValidation');
    const result = split(makeNullShape(), [boxAt(0, 0, 0, 10, 10, 10)]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('split rejects a null shape with no tools', (ctx) => {
    skipIfDiverges(ctx, 'booleanFns.nullShapeValidation');
    const result = split(makeNullShape(), []);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('section rejects null shape', (ctx) => {
    skipIfDiverges(ctx, 'booleanFns.nullShapeValidation');
    const result = section(makeNullShape(), 'XY');
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });
});

describe('sectionToFace', () => {
  it('sections a box at mid-height and returns a face', () => {
    const b = box(10, 10, 10);
    const result = sectionToFace(b, 'XY', { planeSize: 100 });
    expect(isOk(result)).toBe(true);
    const face = unwrap(result);
    expect(isFace(face)).toBe(true);
    expect(unwrap(measureArea(face))).toBeGreaterThan(0);
  });

  it('sections a sphere producing a circular face', (ctx) => {
    skipIfDiverges(ctx, 'booleanFns.sectionToFaceSphere');
    const s = sphere(10);
    const result = sectionToFace(s, 'XY', { planeSize: 100 });
    expect(isOk(result)).toBe(true);
    const face = unwrap(result);
    // Cross-section of sphere at origin is a circle with radius 10
    expect(unwrap(measureArea(face))).toBeCloseTo(Math.PI * 100, -1);
  });
});

describe('slice', () => {
  it('slices a box at multiple planes', () => {
    const b = box(10, 10, 20);
    const result = slice(b, ['XY', 'XZ']);
    expect(isOk(result)).toBe(true);
    const sections = unwrap(result);
    expect(sections).toHaveLength(2);
  });

  it('slices with a single plane', () => {
    const b = box(10, 10, 10);
    const result = slice(b, ['XY']);
    expect(isOk(result)).toBe(true);
    const sections = unwrap(result);
    expect(sections).toHaveLength(1);
  });

  it('empty planes array returns empty result', () => {
    const b = box(10, 10, 10);
    const result = slice(b, []);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toHaveLength(0);
  });
});

describe('split', () => {
  it('returns a copy the caller can dispose without losing the shape when tools is empty', () => {
    using b = box(10, 10, 10);
    const result = unwrap(split(b, []));
    expect(result).not.toBe(b);
    expect(result.wrapped).not.toBe(b.wrapped);
    result[Symbol.dispose]();
    expect(unwrap(measureVolume(b))).toBeCloseTo(1000, 6);
  });

  it('keeps face tags on the copy when tools is empty', () => {
    using b = box(10, 10, 10);
    const first = getFaces(b)[0];
    if (!first) throw new Error('box has no faces');
    tagFaces(b, [first], 'kept');
    using result = unwrap(split(b, []));
    expect(findFacesByTag(result, 'kept')).toHaveLength(1);
  });
});

describe('section with approximation: false', () => {
  it('sections without curve approximation', () => {
    const b = box(10, 10, 10);
    const result = section(b, 'XY', { approximation: false });
    expect(isOk(result)).toBe(true);
  });
});
