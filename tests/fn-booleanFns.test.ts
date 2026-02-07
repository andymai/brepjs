import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeSphere,
  // functional API
  castShape,
  fuseShape,
  cutShape,
  intersectShape,
  sectionShape,
  fuseAll,
  cutAll,
  buildCompound,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  isSolid,
  isCompound,
  isShape3D,
  getShapeKind,
  getEdges,
  getWires,
  getKernel,
  createSolid,
  splitShape,
} from '../src/index.js';
import { measureVolume } from '../src/index.js';
import type { Shape3D } from '../src/core/shapeTypes.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function box(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
  return castShape(makeBox([x1, y1, z1], [x2, y2, z2]).wrapped);
}

describe('fuseShape', () => {
  it('fuses two boxes', () => {
    const result = fuseShape(box(0, 0, 0, 10, 10, 10), box(10, 0, 0, 20, 10, 10));
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    expect(isShape3D(shape)).toBe(true);
    expect(measureVolume(shape)).toBeCloseTo(2000, 0);
  });

  it('fuses overlapping boxes', () => {
    const result = fuseShape(box(0, 0, 0, 10, 10, 10), box(5, 0, 0, 15, 10, 10));
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(1500, 0);
  });
});

describe('cutShape', () => {
  it('cuts a box', () => {
    const result = cutShape(box(0, 0, 0, 10, 10, 10), box(5, 0, 0, 15, 10, 10));
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(500, 0);
  });
});

describe('intersectShape', () => {
  it('intersects two overlapping boxes', () => {
    const result = intersectShape(box(0, 0, 0, 10, 10, 10), box(5, 0, 0, 15, 10, 10));
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(500, 0);
  });
});

describe('fuseAll', () => {
  it('fuses multiple boxes', () => {
    const result = fuseAll([box(0, 0, 0, 10, 10, 10), box(10, 0, 0, 20, 10, 10)]);
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(2000, 0);
  });

  it('fuses single box', () => {
    const result = fuseAll([box(0, 0, 0, 10, 10, 10)]);
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
    const result = cutAll(box(0, 0, 0, 20, 10, 10), [box(0, 0, 0, 5, 10, 10)]);
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(1500, 0);
  });

  it('returns base shape for empty tools', () => {
    const result = cutAll(box(0, 0, 0, 10, 10, 10), []);
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(1000, 0);
  });
});

describe('buildCompound', () => {
  it('builds a compound from shapes', () => {
    const result = buildCompound([box(0, 0, 0, 10, 10, 10), box(20, 0, 0, 30, 10, 10)]);
    expect(isCompound(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge case tests
// ---------------------------------------------------------------------------

describe('boolean edge cases', () => {
  describe('non-overlapping shapes', () => {
    it('fuse disjoint boxes preserves total volume', () => {
      const result = fuseShape(box(0, 0, 0, 10, 10, 10), box(100, 0, 0, 110, 10, 10));
      expect(isOk(result)).toBe(true);
      // Total volume should be 2000 (two separate 1000 unit boxes)
      expect(measureVolume(unwrap(result))).toBeCloseTo(2000, 0);
    });

    it('intersect disjoint boxes produces empty or negligible volume', () => {
      const result = intersectShape(box(0, 0, 0, 10, 10, 10), box(100, 0, 0, 110, 10, 10));
      // OCCT may return an empty shell or compound
      expect(isOk(result) || isErr(result)).toBe(true);
      if (isOk(result)) {
        const vol = measureVolume(unwrap(result));
        expect(vol).toBeLessThan(1); // Essentially zero
      }
    });

    it('cut with disjoint tool preserves base volume', () => {
      const result = cutShape(box(0, 0, 0, 10, 10, 10), box(100, 0, 0, 110, 10, 10));
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(1000, 0);
    });
  });

  describe('self operations', () => {
    it('fuse shape with itself', () => {
      const b = box(0, 0, 0, 10, 10, 10);
      const result = fuseShape(b, b);
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(1000, 0);
    });

    it('intersect shape with itself preserves volume', () => {
      const b = box(0, 0, 0, 10, 10, 10);
      const result = intersectShape(b, b);
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(1000, 0);
    });
  });

  describe('options', () => {
    it('fuseShape with simplify option', () => {
      const result = fuseShape(box(0, 0, 0, 10, 10, 10), box(10, 0, 0, 20, 10, 10), {
        simplify: true,
      });
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(2000, 0);
    });

    it('fuseShape with commonFace optimisation', () => {
      const result = fuseShape(box(0, 0, 0, 10, 10, 10), box(10, 0, 0, 20, 10, 10), {
        optimisation: 'commonFace',
      });
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(2000, 0);
    });

    it('fuseShape with sameFace optimisation', () => {
      const result = fuseShape(box(0, 0, 0, 10, 10, 10), box(10, 0, 0, 20, 10, 10), {
        optimisation: 'sameFace',
      });
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(2000, 0);
    });

    it('cutShape with simplify option', () => {
      const result = cutShape(box(0, 0, 0, 20, 10, 10), box(5, 0, 0, 15, 10, 10), {
        simplify: true,
      });
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(1000, 0);
    });

    it('intersectShape with simplify option', () => {
      const result = intersectShape(box(0, 0, 0, 10, 10, 10), box(5, 0, 0, 15, 10, 10), {
        simplify: true,
      });
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(500, 0);
    });
  });

  describe('fuseAll strategies', () => {
    it('fuseAll with pairwise strategy', () => {
      const result = fuseAll(
        [box(0, 0, 0, 10, 10, 10), box(10, 0, 0, 20, 10, 10), box(20, 0, 0, 30, 10, 10)],
        { strategy: 'pairwise' }
      );
      expect(isOk(result)).toBe(true);
      expect(measureVolume(unwrap(result))).toBeCloseTo(3000, 0);
    });

    it('fuseAll with native strategy (default)', () => {
      const result = fuseAll([
        box(0, 0, 0, 10, 10, 10),
        box(10, 0, 0, 20, 10, 10),
        box(20, 0, 0, 30, 10, 10),
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
        [box(0, 0, 0, 10, 10, 10), box(100, 0, 0, 110, 10, 10)], // disjoint
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
      const result = cutAll(box(0, 0, 0, 30, 10, 10), [
        box(0, 0, 0, 10, 10, 10),
        box(20, 0, 0, 30, 10, 10),
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
        box(0, 0, 0, 10, 10, 10),
        box(50, 0, 0, 60, 10, 10),
        box(100, 0, 0, 110, 10, 10),
      ]);
      expect(isOk(result)).toBe(true);
      const shape = unwrap(result);
      expect(isShape3D(shape)).toBe(true);
      expect(measureVolume(shape)).toBeCloseTo(3000, 0);
    });

    it('four disjoint boxes at corners returns valid Shape3D', () => {
      const result = fuseAll([
        box(0, 0, 0, 10, 10, 10),
        box(50, 0, 0, 60, 10, 10),
        box(0, 50, 0, 10, 60, 10),
        box(50, 50, 0, 60, 60, 10),
      ]);
      expect(isOk(result)).toBe(true);
      const shape = unwrap(result);
      expect(isShape3D(shape)).toBe(true);
      expect(measureVolume(shape)).toBeCloseTo(4000, 0);
    });

    it('mixed disjoint and overlapping boxes returns valid Shape3D', () => {
      // Two boxes touch (fuse to solid) + one disjoint = compound
      const result = fuseAll([
        box(0, 0, 0, 10, 10, 10),
        box(10, 0, 0, 20, 10, 10), // touches first box
        box(100, 0, 0, 110, 10, 10), // disjoint
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
      const result = cutAll(box(0, 0, 0, 30, 10, 10), [box(10, 0, 0, 20, 10, 10)]);
      expect(isOk(result)).toBe(true);
      const shape = unwrap(result);
      expect(isShape3D(shape)).toBe(true);
      expect(measureVolume(shape)).toBeCloseTo(2000, 0); // 3000 - 1000 removed
    });

    it('multiple cuts creating three pieces returns valid Shape3D', () => {
      const result = cutAll(box(0, 0, 0, 50, 10, 10), [
        box(10, 0, 0, 20, 10, 10),
        box(30, 0, 0, 40, 10, 10),
      ]);
      expect(isOk(result)).toBe(true);
      const shape = unwrap(result);
      expect(isShape3D(shape)).toBe(true);
      expect(measureVolume(shape)).toBeCloseTo(3000, 0); // 5000 - 2000 removed
    });
  });

  describe('pairwise strategy compound results', () => {
    it('pairwise strategy with disjoint boxes returns valid Shape3D', () => {
      const result = fuseAll([box(0, 0, 0, 10, 10, 10), box(100, 0, 0, 110, 10, 10)], {
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

describe('sectionShape', () => {
  it('sections a box at mid-height with XY plane', () => {
    // Box from (0,0,0) to (10,10,10), section at z=5
    const b = box(0, 0, 0, 10, 10, 10);
    const result = sectionShape(b, {
      origin: [0, 0, 5],
      xDir: [1, 0, 0],
      yDir: [0, 1, 0],
      zDir: [0, 0, 1],
    });
    expect(isOk(result)).toBe(true);
    const section = unwrap(result);
    // Section of a box at mid-height should produce edges/wires forming a square
    const kind = getShapeKind(section);
    expect(kind === 'compound' || kind === 'wire' || kind === 'edge').toBe(true);
    // Should have edges (the outline of the square cross-section)
    const edges = getEdges(section);
    expect(edges.length).toBeGreaterThanOrEqual(4);
  });

  it('sections a box with named XY plane at z=0 origin', () => {
    // Box from (-5,-5,-5) to (5,5,5), section with XY plane at z=0
    const b = box(-5, -5, -5, 5, 5, 5);
    const result = sectionShape(b, 'XY');
    expect(isOk(result)).toBe(true);
    const section = unwrap(result);
    const edges = getEdges(section);
    expect(edges.length).toBeGreaterThanOrEqual(4);
  });

  it('sections a box with XZ plane', () => {
    const b = box(-5, -5, -5, 5, 5, 5);
    const result = sectionShape(b, 'XZ');
    expect(isOk(result)).toBe(true);
    const section = unwrap(result);
    const edges = getEdges(section);
    expect(edges.length).toBeGreaterThanOrEqual(4);
  });

  it('sections a sphere producing a circular cross-section', () => {
    const s = castShape(makeSphere(10).wrapped);
    const result = sectionShape(s, 'XY');
    expect(isOk(result)).toBe(true);
    const section = unwrap(result);
    // A sphere sectioned at its equator should produce edges
    const edges = getEdges(section);
    expect(edges.length).toBeGreaterThanOrEqual(1);
  });

  it('returns result for plane not intersecting shape', () => {
    // Box at z=0..10, plane at z=100 — no intersection
    const b = box(0, 0, 0, 10, 10, 10);
    const result = sectionShape(b, {
      origin: [0, 0, 100],
      xDir: [1, 0, 0],
      yDir: [0, 1, 0],
      zDir: [0, 0, 1],
    });
    // Should succeed but produce empty or minimal result
    expect(isOk(result)).toBe(true);
    const section = unwrap(result);
    const edges = getEdges(section);
    expect(edges.length).toBe(0);
  });

  it('accepts custom planeSize option', () => {
    const b = box(0, 0, 0, 10, 10, 10);
    const result = sectionShape(b, 'XY', { planeSize: 1e6 });
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

  it('fuseShape rejects null first operand', () => {
    const result = fuseShape(makeNullShape(), box(0, 0, 0, 10, 10, 10));
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
    expect(unwrapErr(result).message).toContain('first operand');
  });

  it('fuseShape rejects null second operand', () => {
    const result = fuseShape(box(0, 0, 0, 10, 10, 10), makeNullShape());
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
    expect(unwrapErr(result).message).toContain('second operand');
  });

  it('cutShape rejects null base', () => {
    const result = cutShape(makeNullShape(), box(0, 0, 0, 10, 10, 10));
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('cutShape rejects null tool', () => {
    const result = cutShape(box(0, 0, 0, 10, 10, 10), makeNullShape());
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('intersectShape rejects null operand', () => {
    const result = intersectShape(makeNullShape(), box(0, 0, 0, 10, 10, 10));
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('fuseAll rejects null shape in array', () => {
    const result = fuseAll([box(0, 0, 0, 10, 10, 10), makeNullShape()]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
    expect(unwrapErr(result).message).toContain('index 1');
  });

  it('cutAll rejects null base', () => {
    const result = cutAll(makeNullShape(), [box(0, 0, 0, 10, 10, 10)]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('splitShape rejects null shape', () => {
    const result = splitShape(makeNullShape(), [box(0, 0, 0, 10, 10, 10)]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });

  it('sectionShape rejects null shape', () => {
    const result = sectionShape(makeNullShape(), 'XY');
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
  });
});
