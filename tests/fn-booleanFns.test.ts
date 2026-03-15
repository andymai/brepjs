import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { isBrepkit } from './helpers/kernelEnv.js';
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
  getKernel,
  createSolid,
  measureVolume,
  measureArea,
} from '../src/index.js';
import type { Shape3D } from '../src/core/shapeTypes.js';

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

  it('returns base shape for empty tools', () => {
    const result = cutAll(boxAt(0, 0, 0, 10, 10, 10), []);
    expect(isOk(result)).toBe(true);
    expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(1000, 0);
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

    it('intersect disjoint boxes produces empty or negligible volume', (ctx) => {
      // brepkit throws on disjoint intersection instead of returning empty shape
      if (isBrepkit) ctx.skip();
      const result = intersect(boxAt(0, 0, 0, 10, 10, 10), boxAt(100, 0, 0, 110, 10, 10));
      // OCCT returns Ok with an empty/near-zero-volume result for disjoint intersection
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

  it('returns result for plane not intersecting shape', (ctx) => {
    // brepkit returns Err for non-intersecting section; OCCT returns Ok with empty edges
    if (isBrepkit) ctx.skip();
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

// brepkit skip: these tests use raw OCCT API (oc.TopoDS_Solid) to construct null shapes
describe('null-shape pre-validation', () => {
  function makeNullShape(): Shape3D {
    const oc = getKernel().oc;
    return createSolid(new oc.TopoDS_Solid()) as Shape3D;
  }

  it('fuse rejects null first operand', (ctx) => {
    if (isBrepkit) ctx.skip(); // oc.TopoDS_Solid unavailable
    const result = fuse(makeNullShape(), boxAt(0, 0, 0, 10, 10, 10));
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
    expect(unwrapErr(result).message).toContain('first operand');
  });

  it('fuse rejects null second operand', (ctx) => {
    if (isBrepkit) ctx.skip(); // oc.TopoDS_Solid unavailable
    const result = fuse(boxAt(0, 0, 0, 10, 10, 10), makeNullShape());
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
    expect(unwrapErr(result).message).toContain('second operand');
  });

  it('cut rejects null base', (ctx) => {
    if (isBrepkit) ctx.skip(); // oc.TopoDS_Solid unavailable
    const result = cut(makeNullShape(), boxAt(0, 0, 0, 10, 10, 10));
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('cut rejects null tool', (ctx) => {
    if (isBrepkit) ctx.skip(); // oc.TopoDS_Solid unavailable
    const result = cut(boxAt(0, 0, 0, 10, 10, 10), makeNullShape());
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('intersect rejects null operand', (ctx) => {
    if (isBrepkit) ctx.skip(); // oc.TopoDS_Solid unavailable
    const result = intersect(makeNullShape(), boxAt(0, 0, 0, 10, 10, 10));
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('fuseAll rejects null shape in array', (ctx) => {
    if (isBrepkit) ctx.skip(); // oc.TopoDS_Solid unavailable
    const result = fuseAll([boxAt(0, 0, 0, 10, 10, 10), makeNullShape()]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
    expect(unwrapErr(result).message).toContain('index 1');
  });

  it('cutAll rejects null base', (ctx) => {
    if (isBrepkit) ctx.skip(); // oc.TopoDS_Solid unavailable
    const result = cutAll(makeNullShape(), [boxAt(0, 0, 0, 10, 10, 10)]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('split rejects null shape', (ctx) => {
    if (isBrepkit) ctx.skip(); // oc.TopoDS_Solid unavailable
    const result = split(makeNullShape(), [boxAt(0, 0, 0, 10, 10, 10)]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('section rejects null shape', (ctx) => {
    if (isBrepkit) ctx.skip(); // oc.TopoDS_Solid unavailable
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
    // brepkit sectionToFace produces degenerate face for sphere cross-sections
    if (isBrepkit) ctx.skip();
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
  it('returns base shape when tools array is empty', () => {
    const b = box(10, 10, 10);
    const result = split(b, []);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toBe(b);
  });
});

describe('section with approximation: false', () => {
  it('sections without curve approximation', () => {
    const b = box(10, 10, 10);
    const result = section(b, 'XY', { approximation: false });
    expect(isOk(result)).toBe(true);
  });
});
