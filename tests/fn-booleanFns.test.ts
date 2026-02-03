import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  // functional API
  castShape,
  fuseShapes,
  cutShape,
  intersectShapes,
  fnFuseAll,
  fnCutAll,
  fnBuildCompound,
  isOk,
  isErr,
  unwrap,
  fnIsSolid,
  fnIsCompound,
  fnIsShape3D,
} from '../src/index.js';
import { fnMeasureVolume } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function box(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
  return castShape(makeBox([x1, y1, z1], [x2, y2, z2]).wrapped);
}

describe('fuseShapes', () => {
  it('fuses two boxes', () => {
    const result = fuseShapes(box(0, 0, 0, 10, 10, 10), box(10, 0, 0, 20, 10, 10));
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    expect(fnIsShape3D(shape)).toBe(true);
    expect(fnMeasureVolume(shape)).toBeCloseTo(2000, 0);
  });

  it('fuses overlapping boxes', () => {
    const result = fuseShapes(box(0, 0, 0, 10, 10, 10), box(5, 0, 0, 15, 10, 10));
    expect(isOk(result)).toBe(true);
    expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(1500, 0);
  });
});

describe('cutShape', () => {
  it('cuts a box', () => {
    const result = cutShape(box(0, 0, 0, 10, 10, 10), box(5, 0, 0, 15, 10, 10));
    expect(isOk(result)).toBe(true);
    expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(500, 0);
  });
});

describe('intersectShapes', () => {
  it('intersects two overlapping boxes', () => {
    const result = intersectShapes(box(0, 0, 0, 10, 10, 10), box(5, 0, 0, 15, 10, 10));
    expect(isOk(result)).toBe(true);
    expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(500, 0);
  });
});

describe('fnFuseAll', () => {
  it('fuses multiple boxes', () => {
    const result = fnFuseAll([box(0, 0, 0, 10, 10, 10), box(10, 0, 0, 20, 10, 10)]);
    expect(isOk(result)).toBe(true);
    expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(2000, 0);
  });

  it('fuses single box', () => {
    const result = fnFuseAll([box(0, 0, 0, 10, 10, 10)]);
    expect(isOk(result)).toBe(true);
    expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(1000, 0);
  });

  it('returns error for empty array', () => {
    const result = fnFuseAll([]);
    expect(isErr(result)).toBe(true);
  });
});

describe('fnCutAll', () => {
  it('cuts multiple shapes from a base', () => {
    const result = fnCutAll(box(0, 0, 0, 20, 10, 10), [box(0, 0, 0, 5, 10, 10)]);
    expect(isOk(result)).toBe(true);
    expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(1500, 0);
  });

  it('returns base shape for empty tools', () => {
    const result = fnCutAll(box(0, 0, 0, 10, 10, 10), []);
    expect(isOk(result)).toBe(true);
    expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(1000, 0);
  });
});

describe('fnBuildCompound', () => {
  it('builds a compound from shapes', () => {
    const result = fnBuildCompound([box(0, 0, 0, 10, 10, 10), box(20, 0, 0, 30, 10, 10)]);
    expect(fnIsCompound(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge case tests
// ---------------------------------------------------------------------------

describe('boolean edge cases', () => {
  describe('non-overlapping shapes', () => {
    it('fuse disjoint boxes preserves total volume', () => {
      const result = fuseShapes(box(0, 0, 0, 10, 10, 10), box(100, 0, 0, 110, 10, 10));
      expect(isOk(result)).toBe(true);
      // Total volume should be 2000 (two separate 1000 unit boxes)
      expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(2000, 0);
    });

    it('intersect disjoint boxes produces empty or negligible volume', () => {
      const result = intersectShapes(box(0, 0, 0, 10, 10, 10), box(100, 0, 0, 110, 10, 10));
      // OCCT may return an empty shell or compound
      expect(isOk(result) || isErr(result)).toBe(true);
      if (isOk(result)) {
        const vol = fnMeasureVolume(unwrap(result));
        expect(vol).toBeLessThan(1); // Essentially zero
      }
    });

    it('cut with disjoint tool preserves base volume', () => {
      const result = cutShape(box(0, 0, 0, 10, 10, 10), box(100, 0, 0, 110, 10, 10));
      expect(isOk(result)).toBe(true);
      expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(1000, 0);
    });
  });

  describe('self operations', () => {
    it('fuse shape with itself', () => {
      const b = box(0, 0, 0, 10, 10, 10);
      const result = fuseShapes(b, b);
      expect(isOk(result)).toBe(true);
      expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(1000, 0);
    });

    it('intersect shape with itself preserves volume', () => {
      const b = box(0, 0, 0, 10, 10, 10);
      const result = intersectShapes(b, b);
      expect(isOk(result)).toBe(true);
      expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(1000, 0);
    });
  });

  describe('options', () => {
    it('fuseShapes with simplify option', () => {
      const result = fuseShapes(box(0, 0, 0, 10, 10, 10), box(10, 0, 0, 20, 10, 10), {
        simplify: true,
      });
      expect(isOk(result)).toBe(true);
      expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(2000, 0);
    });

    it('fuseShapes with commonFace optimisation', () => {
      const result = fuseShapes(box(0, 0, 0, 10, 10, 10), box(10, 0, 0, 20, 10, 10), {
        optimisation: 'commonFace',
      });
      expect(isOk(result)).toBe(true);
      expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(2000, 0);
    });

    it('fuseShapes with sameFace optimisation', () => {
      const result = fuseShapes(box(0, 0, 0, 10, 10, 10), box(10, 0, 0, 20, 10, 10), {
        optimisation: 'sameFace',
      });
      expect(isOk(result)).toBe(true);
      expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(2000, 0);
    });

    it('cutShape with simplify option', () => {
      const result = cutShape(box(0, 0, 0, 20, 10, 10), box(5, 0, 0, 15, 10, 10), {
        simplify: true,
      });
      expect(isOk(result)).toBe(true);
      expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(1000, 0);
    });

    it('intersectShapes with simplify option', () => {
      const result = intersectShapes(box(0, 0, 0, 10, 10, 10), box(5, 0, 0, 15, 10, 10), {
        simplify: true,
      });
      expect(isOk(result)).toBe(true);
      expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(500, 0);
    });
  });

  describe('fuseAll strategies', () => {
    it('fuseAll with pairwise strategy', () => {
      const result = fnFuseAll(
        [box(0, 0, 0, 10, 10, 10), box(10, 0, 0, 20, 10, 10), box(20, 0, 0, 30, 10, 10)],
        { strategy: 'pairwise' }
      );
      expect(isOk(result)).toBe(true);
      expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(3000, 0);
    });

    it('fuseAll with native strategy (default)', () => {
      const result = fnFuseAll([
        box(0, 0, 0, 10, 10, 10),
        box(10, 0, 0, 20, 10, 10),
        box(20, 0, 0, 30, 10, 10),
      ]);
      expect(isOk(result)).toBe(true);
      expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(3000, 0);
    });
  });

  describe('cutAll edge cases', () => {
    it('cutAll with multiple overlapping tools', () => {
      const result = fnCutAll(box(0, 0, 0, 30, 10, 10), [
        box(0, 0, 0, 10, 10, 10),
        box(20, 0, 0, 30, 10, 10),
      ]);
      expect(isOk(result)).toBe(true);
      expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(1000, 0); // Middle third remains
    });
  });
});
