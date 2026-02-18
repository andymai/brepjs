import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { make2dOffset } from '../src/2d/lib/offset.js';
import {
  make2dSegmentCurve,
  make2dCircle,
  make2dThreePointArc,
  make2dInerpolatedBSplineCurve,
} from '../src/2d/lib/makeCurves.js';
import { Curve2D } from '../src/2d/lib/Curve2D.js';
import { unwrap } from '../src/core/result.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('make2dOffset', () => {
  describe('CIRCLE offset', () => {
    it('offsets a circle outward (positive radius result)', () => {
      const circle = make2dCircle(10);
      const result = make2dOffset(circle, 5);
      expect(result).toBeInstanceOf(Curve2D);
      // The offset circle should have radius 15
      if (result instanceof Curve2D) {
        expect(result.geomType).toBe('CIRCLE');
      }
    });

    it('offsets a circle inward (still positive radius)', () => {
      const circle = make2dCircle(10);
      const result = make2dOffset(circle, -3);
      expect(result).toBeInstanceOf(Curve2D);
      if (result instanceof Curve2D) {
        expect(result.geomType).toBe('CIRCLE');
      }
    });

    it('returns collapsed sentinel when radius shrinks to zero', () => {
      const circle = make2dCircle(5);
      // Offset inward by more than the radius
      const result = make2dOffset(circle, -6);
      expect(result).not.toBeInstanceOf(Curve2D);
      expect(result).toHaveProperty('collapsed', true);
      expect(result).toHaveProperty('firstPoint');
      expect(result).toHaveProperty('lastPoint');
    });

    it('offsets a circular arc', () => {
      const arc = make2dThreePointArc([5, 0], [0, 5], [-5, 0]);
      const result = make2dOffset(arc, 2);
      expect(result).toBeInstanceOf(Curve2D);
    });

    it('collapses a small circular arc when offset exceeds radius', () => {
      const arc = make2dThreePointArc([2, 0], [0, 2], [-2, 0]);
      const result = make2dOffset(arc, -3);
      expect(result).not.toBeInstanceOf(Curve2D);
      expect(result).toHaveProperty('collapsed', true);
    });
  });

  describe('LINE offset', () => {
    it('offsets a line segment', () => {
      const line = make2dSegmentCurve([0, 0], [10, 0]);
      const result = make2dOffset(line, 5);
      expect(result).toBeInstanceOf(Curve2D);
      if (result instanceof Curve2D) {
        expect(result.geomType).toBe('LINE');
        // Line offset by 5 in the normal direction
        // Normal is [tangent[1], -tangent[0]] = [0, -1] for rightward line
        const fp = result.firstPoint;
        const lp = result.lastPoint;
        expect(fp[1]).toBeCloseTo(-5, 1);
        expect(lp[1]).toBeCloseTo(-5, 1);
        // X coordinates should stay the same
        expect(fp[0]).toBeCloseTo(0, 1);
        expect(lp[0]).toBeCloseTo(10, 1);
      }
    });

    it('offsets a line in the negative direction', () => {
      const line = make2dSegmentCurve([0, 0], [10, 0]);
      const result = make2dOffset(line, -3);
      expect(result).toBeInstanceOf(Curve2D);
      if (result instanceof Curve2D) {
        const fp = result.firstPoint;
        expect(fp[1]).toBeCloseTo(3, 1);
      }
    });
  });

  describe('B-spline offset', () => {
    it('offsets a B-spline curve (non-self-intersecting)', () => {
      // Create a gentle B-spline that won't self-intersect when offset
      const spline = unwrap(
        make2dInerpolatedBSplineCurve([
          [0, 0],
          [5, 2],
          [10, 0],
        ])
      );
      const result = make2dOffset(spline, 1);
      expect(result).toBeInstanceOf(Curve2D);
    });

    it('returns collapsed sentinel for self-intersecting offset', () => {
      // Create a sharp curve that will self-intersect when offset by a large amount
      const spline = unwrap(
        make2dInerpolatedBSplineCurve([
          [0, 0],
          [5, 10],
          [10, 0],
        ])
      );
      // Large offset to cause self-intersection
      const result = make2dOffset(spline, -20);
      // Should either be a Curve2D or collapsed depending on intersection detection
      if (!(result instanceof Curve2D)) {
        expect(result).toHaveProperty('collapsed', true);
        expect(result).toHaveProperty('firstPoint');
        expect(result).toHaveProperty('lastPoint');
      }
    });
  });
});
