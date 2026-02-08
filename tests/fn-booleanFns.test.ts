import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  sphere as _sphere,
  translate,
  compound,
  fuse,
  cut,
  intersect,
  section,
  split,
  fuseAll,
  cutAll,
  isOk,
  isErr as _isErr,
  unwrap as _unwrap,
  unwrapErr,
  isSolid as _isSolid,
  isCompound,
  isShape3D,
  getShapeKind as _getShapeKind,
  getEdges as _getEdges,
  getWires as _getWires,
  getKernel,
  createSolid,
  measureVolume as _measureVolume,
} from '../src/index.js';
import type { Shape3D } from '../src/core/shapeTypes.js';

beforeAll(async () => {
  await initOC();
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
    expect(measureVolume(shape)).toBeCloseTo(2000, 0);
  });

  it('fuses overlapping boxes', () => {
    const result = fuse(boxAt(0, 0, 0, 10, 10, 10), boxAt(5, 0, 0, 15, 10, 10));
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(1500, 0);
  });
});

describe('cut', () => {
  it('cuts a box', () => {
    const result = cut(boxAt(0, 0, 0, 10, 10, 10), boxAt(5, 0, 0, 15, 10, 10));
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(500, 0);
  });
});

describe('intersect', () => {
  it('intersects two overlapping boxes', () => {
    const result = intersect(boxAt(0, 0, 0, 10, 10, 10), boxAt(5, 0, 0, 15, 10, 10));
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(500, 0);
  });
});

describe('fuseAll', () => {
  it('fuses multiple boxes', () => {
    const result = fuseAll([boxAt(0, 0, 0, 10, 10, 10), boxAt(10, 0, 0, 20, 10, 10)]);
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(2000, 0);
  });

  it('fuses single box', () => {
    const result = fuseAll([boxAt(0, 0, 0, 10, 10, 10)]);
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(1000, 0);
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
    expect(measureVolume(unwrap(result))).toBeCloseTo(1500, 0);
  });

  it('returns base shape for empty tools', () => {
    const result = cutAll(boxAt(0, 0, 0, 10, 10, 10), []);
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(1000, 0);
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
      expect(measureVolume(unwrap(result))).toBeCloseTo(2000, 0);
    });

    it('intersect disjoint boxes produces empty or negligible volume', () => {
      const result = intersect(boxAt(0, 0, 0, 10, 10, 10), boxAt(100, 0, 0, 110, 10, 10));
      // OCCT may return an empty shell or compound
      expect(isOk(result) || isErr(result)).toBe(true);
      if (isOk(result)) {
        const vol = measureVolume(unwrap(result));
        expect(vol).toBeLessThan(1); // Essentially zero
      }
    });

    it('cut with disjoint tool preserves base volume', () => {
      const result = cut(boxAt(0, 0, 0, 10, 10, 10), boxAt(100, 0, 0, 110, 10, 10));
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(1000, 0);
    });
  });

  describe('self operations', () => {
    it('fuse shape with itself', () => {
      const b = boxAt(0, 0, 0, 10, 10, 10);
      const result = fuse(b, b);
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(1000, 0);
    });

    it('intersect shape with itself preserves volume', () => {
      const b = boxAt(0, 0, 0, 10, 10, 10);
      const result = intersect(b, b);
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(1000, 0);
    });
  });

  describe('options', () => {
    it('fuse with simplify option', () => {
      const result = fuse(boxAt(0, 0, 0, 10, 10, 10), boxAt(10, 0, 0, 20, 10, 10), {
        simplify: true,
      });
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(2000, 0);
    });

    it('fuse with commonFace optimisation', () => {
      const result = fuse(boxAt(0, 0, 0, 10, 10, 10), boxAt(10, 0, 0, 20, 10, 10), {
        optimisation: 'commonFace',
      });
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(2000, 0);
    });

    it('fuse with sameFace optimisation', () => {
      const result = fuse(boxAt(0, 0, 0, 10, 10, 10), boxAt(10, 0, 0, 20, 10, 10), {
        optimisation: 'sameFace',
      });
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(2000, 0);
    });

    it('cut with simplify option', () => {
      const result = cut(boxAt(0, 0, 0, 20, 10, 10), boxAt(5, 0, 0, 15, 10, 10), {
        simplify: true,
      });
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(1000, 0);
    });

    it('intersect with simplify option', () => {
      const result = intersect(boxAt(0, 0, 0, 10, 10, 10), boxAt(5, 0, 0, 15, 10, 10), {
        simplify: true,
      });
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(500, 0);
    });
  });

  describe('fuseAll strategies', () => {
    it('fuseAll with pairwise strategy', () => {
      const result = fuseAll(
        [boxAt(0, 0, 0, 10, 10, 10), boxAt(10, 0, 0, 20, 10, 10), boxAt(20, 0, 0, 30, 10, 10)],
        { strategy: 'pairwise' }
      );
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(3000, 0);
    });

    it('fuseAll with native strategy (default)', () => {
      const result = fuseAll([
        boxAt(0, 0, 0, 10, 10, 10),
        boxAt(10, 0, 0, 20, 10, 10),
        boxAt(20, 0, 0, 30, 10, 10),
      ]);
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(3000, 0);
    });

    it('fuseAll native strategy correctly identifies result as Shape3D', () => {
      // This test verifies that the isShape3D check works correctly by using
      // the OCCT shape type enum (not constructor.name which gets minified).
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
      expect(measureVolume(shape)).toBeCloseTo(2000, 0);
    });
  });

  describe('cutAll edge cases', () => {
    it('cutAll with multiple overlapping tools', () => {
      const result = cutAll(boxAt(0, 0, 0, 30, 10, 10), [
        boxAt(0, 0, 0, 10, 10, 10),
        boxAt(20, 0, 0, 30, 10, 10),
      ]);
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(1000, 0); // Middle third remains
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
      expect(measureVolume(shape)).toBeCloseTo(3000, 0);
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
      expect(measureVolume(shape)).toBeCloseTo(4000, 0);
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
      expect(measureVolume(shape)).toBeCloseTo(3000, 0);
    });
  });

  describe('cutAll compound results', () => {
    it('cutting through box creates valid Shape3D compound', () => {
      // Cut a vertical slice through the middle, creating two separate pieces
      const result = cutAll(boxAt(0, 0, 0, 30, 10, 10), [boxAt(10, 0, 0, 20, 10, 10)]);
      expect(isOk(result)).toBe(true);
      const shape = unwrap(result);
      expect(isShape3D(shape)).toBe(true);
      expect(measureVolume(shape)).toBeCloseTo(2000, 0); // 3000 - 1000 removed
    });

    it('multiple cuts creating three pieces returns valid Shape3D', () => {
      const result = cutAll(boxAt(0, 0, 0, 50, 10, 10), [
        boxAt(10, 0, 0, 20, 10, 10),
        boxAt(30, 0, 0, 40, 10, 10),
      ]);
      expect(isOk(result)).toBe(true);
      const shape = unwrap(result);
      expect(isShape3D(shape)).toBe(true);
      expect(measureVolume(shape)).toBeCloseTo(3000, 0); // 5000 - 2000 removed
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
      expect(measureVolume(shape)).toBeCloseTo(2000, 0);
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
    return createSolid(new oc.TopoDS_Solid()) as Shape3D;
  }

  it('fuse rejects null first operand', () => {
    const result = fuse(makeNullShape(), boxAt(0, 0, 0, 10, 10, 10));
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
    expect(unwrapErr(result).message).toContain('first operand');
  });

  it('fuse rejects null second operand', () => {
    const result = fuse(boxAt(0, 0, 0, 10, 10, 10), makeNullShape());
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
    expect(unwrapErr(result).message).toContain('second operand');
  });

  it('cut rejects null base', () => {
    const result = cut(makeNullShape(), boxAt(0, 0, 0, 10, 10, 10));
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('cut rejects null tool', () => {
    const result = cut(boxAt(0, 0, 0, 10, 10, 10), makeNullShape());
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('intersect rejects null operand', () => {
    const result = intersect(makeNullShape(), boxAt(0, 0, 0, 10, 10, 10));
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('fuseAll rejects null shape in array', () => {
    const result = fuseAll([boxAt(0, 0, 0, 10, 10, 10), makeNullShape()]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
    expect(unwrapErr(result).message).toContain('index 1');
  });

  it('cutAll rejects null base', () => {
    const result = cutAll(makeNullShape(), [boxAt(0, 0, 0, 10, 10, 10)]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('split rejects null shape', () => {
    const result = split(makeNullShape(), [boxAt(0, 0, 0, 10, 10, 10)]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('section rejects null shape', () => {
    const result = section(makeNullShape(), 'XY');
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });
});
