import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  createBlueprint,
  createCompoundBlueprint,
  getBounds2D,
  getOrientation2D,
  isInside2D,
  toSVGPathD,
  translate2D,
  rotate2D,
  scale2D,
  mirror2D,
  drawRectangle,
  drawCircle,
  unwrap,
  isOk,
  isErr,
} from '../src/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

/** Helper: centered rectangle blueprint. */
function rect(w = 10, h = 20): ReturnType<typeof drawRectangle>['blueprint'] {
  return drawRectangle(w, h).blueprint;
}

describe('blueprintFns', () => {
  describe('createBlueprint', () => {
    it('creates a blueprint from curves of an existing blueprint', () => {
      const original = rect();
      const result = createBlueprint(original.curves);
      expect(isOk(result)).toBe(true);
      const copy = unwrap(result);
      expect(copy.curves).toHaveLength(original.curves.length);
      copy.delete();
      original.delete();
    });

    it('returns error for empty curves array', () => {
      const result = createBlueprint([]);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('createCompoundBlueprint', () => {
    it('creates a compound blueprint from outer + hole', () => {
      const outer = rect(20, 20);
      const hole = rect(5, 5);
      const result = createCompoundBlueprint([outer, hole]);
      expect(isOk(result)).toBe(true);
      const compound = unwrap(result);
      expect(compound.blueprints).toHaveLength(2);
    });

    it('returns error for empty blueprints array', () => {
      const result = createCompoundBlueprint([]);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('getBounds2D', () => {
    it('returns correct bounding box for a rectangle', () => {
      const bp = rect(10, 20);
      const bb = getBounds2D(bp);
      expect(bb.width).toBeCloseTo(10, 0);
      expect(bb.height).toBeCloseTo(20, 0);
      expect(bb.center[0]).toBeCloseTo(0, 1);
      expect(bb.center[1]).toBeCloseTo(0, 1);
      bp.delete();
    });

    it('returns correct bounds min/max', () => {
      const bp = rect(10, 20);
      const bb = getBounds2D(bp);
      const [min, max] = bb.bounds;
      expect(min[0]).toBeCloseTo(-5, 0);
      expect(min[1]).toBeCloseTo(-10, 0);
      expect(max[0]).toBeCloseTo(5, 0);
      expect(max[1]).toBeCloseTo(10, 0);
      bp.delete();
    });
  });

  describe('getOrientation2D', () => {
    it('returns CW or CCW for a rectangle', () => {
      const bp = rect();
      const ori = getOrientation2D(bp);
      expect(['clockwise', 'counterClockwise']).toContain(ori);
      bp.delete();
    });

    it('returns CW or CCW for a circle', () => {
      const bp = drawCircle(5).blueprint;
      const ori = getOrientation2D(bp);
      expect(['clockwise', 'counterClockwise']).toContain(ori);
      bp.delete();
    });
  });

  describe('isInside2D', () => {
    it('returns true for a point inside', () => {
      const bp = rect(10, 10);
      expect(isInside2D(bp, [0, 0])).toBe(true);
      bp.delete();
    });

    it('returns false for a point outside', () => {
      const bp = rect(10, 10);
      expect(isInside2D(bp, [100, 100])).toBe(false);
      bp.delete();
    });
  });

  describe('toSVGPathD', () => {
    it('produces a string containing SVG move command', () => {
      const bp = rect();
      const d = toSVGPathD(bp);
      expect(typeof d).toBe('string');
      expect(d.length).toBeGreaterThan(0);
      expect(d).toContain('M');
      bp.delete();
    });
  });

  describe('translate2D', () => {
    it('shifts bounds by dx, dy', () => {
      const bp = rect(10, 10);
      const moved = translate2D(bp, 20, 30);
      const bb = getBounds2D(moved);
      expect(bb.center[0]).toBeCloseTo(20, 0);
      expect(bb.center[1]).toBeCloseTo(30, 0);
      moved.delete();
      bp.delete();
    });

    it('accepts a vector overload', () => {
      const bp = rect(10, 10);
      const moved = translate2D(bp, [7, 3]);
      const bb = getBounds2D(moved);
      expect(bb.center[0]).toBeCloseTo(7, 0);
      expect(bb.center[1]).toBeCloseTo(3, 0);
      moved.delete();
      bp.delete();
    });
  });

  describe('rotate2D', () => {
    it('rotates 90 degrees swapping width and height', () => {
      const bp = rect(10, 20);
      const rotated = rotate2D(bp, 90);
      const bb = getBounds2D(rotated);
      // After 90-degree rotation: width ↔ height
      expect(bb.width).toBeCloseTo(20, 0);
      expect(bb.height).toBeCloseTo(10, 0);
      rotated.delete();
      bp.delete();
    });

    it('rotates around a custom center', () => {
      const bp = rect(10, 10);
      const rotated = rotate2D(bp, 180, [0, 0]);
      const bb = getBounds2D(rotated);
      // 180° around origin of a centered rect: same bounds
      expect(bb.center[0]).toBeCloseTo(0, 0);
      expect(bb.center[1]).toBeCloseTo(0, 0);
      rotated.delete();
      bp.delete();
    });
  });

  describe('scale2D', () => {
    it('doubles dimensions when factor is 2', () => {
      const bp = rect(10, 20);
      const scaled = scale2D(bp, 2);
      const bb = getBounds2D(scaled);
      expect(bb.width).toBeCloseTo(20, 0);
      expect(bb.height).toBeCloseTo(40, 0);
      scaled.delete();
      bp.delete();
    });

    it('halves dimensions when factor is 0.5', () => {
      const bp = rect(10, 20);
      const scaled = scale2D(bp, 0.5);
      const bb = getBounds2D(scaled);
      expect(bb.width).toBeCloseTo(5, 0);
      expect(bb.height).toBeCloseTo(10, 0);
      scaled.delete();
      bp.delete();
    });
  });

  describe('mirror2D', () => {
    it('reflects across the Y axis in plane mode', () => {
      const bp = translate2D(rect(10, 10), 10, 0);
      // direction [0, 1] = Y-axis → mirror across the vertical axis
      const mirrored = mirror2D(bp, [0, 1], [0, 0], 'plane');
      const bb = getBounds2D(mirrored);
      // Original center at (10, 0), reflected across Y-axis → (-10, 0)
      expect(bb.center[0]).toBeCloseTo(-10, 0);
      expect(bb.center[1]).toBeCloseTo(0, 0);
      mirrored.delete();
      bp.delete();
    });

    it('reflects through a center point in center mode', () => {
      const bp = translate2D(rect(10, 10), 10, 0);
      const mirrored = mirror2D(bp, [0, 0]);
      const bb = getBounds2D(mirrored);
      // Point symmetry around origin: center (10, 0) → (-10, 0)
      expect(bb.center[0]).toBeCloseTo(-10, 0);
      expect(bb.center[1]).toBeCloseTo(0, 0);
      mirrored.delete();
      bp.delete();
    });
  });
});
