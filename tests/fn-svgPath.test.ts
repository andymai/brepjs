import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { adaptedCurveToPathElem } from '../src/2d/lib/svgPath.js';
import { approximateAsSvgCompatibleCurve } from '../src/2d/lib/approximations.js';
import {
  make2dSegmentCurve,
  make2dCircle,
  make2dEllipse,
  make2dThreePointArc,
  make2dBezierCurve,
  make2dEllipseArc,
} from '../src/2d/lib/makeCurves.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('adaptedCurveToPathElem', () => {
  describe('LINE', () => {
    it('produces an L command for a line segment', () => {
      const curve = make2dSegmentCurve([0, 0], [10, 5]);
      const result = adaptedCurveToPathElem(curve, curve.lastPoint);
      expect(result).toMatch(/^L\s/);
      expect(result).toContain('10');
      expect(result).toContain('5');
    });
  });

  describe('BEZIER_CURVE', () => {
    it('produces an L command for degree-1 Bezier (linear)', () => {
      // A degree-1 Bezier is essentially a line
      const curve = make2dBezierCurve([0, 0], [], [10, 5]);
      const result = adaptedCurveToPathElem(curve, curve.lastPoint);
      expect(result).toMatch(/^L\s/);
    });

    it('produces a Q command for degree-2 Bezier (quadratic)', () => {
      const curve = make2dBezierCurve([0, 0], [[5, 10]], [10, 0]);
      const result = adaptedCurveToPathElem(curve, curve.lastPoint);
      expect(result).toMatch(/^Q\s/);
    });

    it('produces a C command for degree-3 Bezier (cubic)', () => {
      const curve = make2dBezierCurve(
        [0, 0],
        [
          [3, 10],
          [7, 10],
        ],
        [10, 0]
      );
      const result = adaptedCurveToPathElem(curve, curve.lastPoint);
      expect(result).toMatch(/^C\s/);
    });
  });

  describe('CIRCLE', () => {
    it('produces an A command for a circular arc', () => {
      const curve = make2dThreePointArc([5, 0], [0, 5], [-5, 0]);
      const result = adaptedCurveToPathElem(curve, curve.lastPoint);
      expect(result).toMatch(/^A\s/);
    });

    it('produces an A command for a full circle (360 degree nudge)', () => {
      const circle = make2dCircle(5);
      // Full circles are split by approximateAsSvgCompatibleCurve
      const curves = approximateAsSvgCompatibleCurve([circle]);
      // Full circle should be split into 2 arcs
      expect(curves.length).toBe(2);
      for (const c of curves) {
        const result = adaptedCurveToPathElem(c, c.lastPoint);
        expect(result).toMatch(/^A\s/);
      }
    });
  });

  describe('ELLIPSE', () => {
    it('produces an A command for an ellipse arc', () => {
      const curve = make2dEllipseArc(10, 5, 0, Math.PI / 2, [0, 0], [1, 0]);
      const result = adaptedCurveToPathElem(curve, curve.lastPoint);
      expect(result).toMatch(/^A\s/);
      // Should contain two different radii
      const parts = result.split(/\s+/);
      expect(parts[1]).not.toBe(parts[2]); // major != minor
    });

    it('handles a full ellipse (split into arcs)', () => {
      const ellipse = make2dEllipse(10, 5);
      const curves = approximateAsSvgCompatibleCurve([ellipse]);
      // Full ellipse should be split into 2 arcs
      expect(curves.length).toBe(2);
      for (const c of curves) {
        const result = adaptedCurveToPathElem(c, c.lastPoint);
        expect(result).toMatch(/^A\s/);
      }
    });

    it('includes rotation angle for rotated ellipse arc', () => {
      // Rotated ellipse: xDir = [cos45, sin45]
      const cos45 = Math.SQRT2 / 2;
      const curve = make2dEllipseArc(10, 5, 0, Math.PI / 2, [0, 0], [cos45, cos45]);
      const result = adaptedCurveToPathElem(curve, curve.lastPoint);
      expect(result).toMatch(/^A\s/);
      // The rotation angle should be non-zero for a rotated ellipse
      const parts = result.split(/\s+/);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test array index
      const rotationAngle = parseFloat(parts[3]!);
      expect(rotationAngle).not.toBe(0);
    });
  });
});
