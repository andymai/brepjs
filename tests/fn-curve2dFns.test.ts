import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { drawRectangle, drawCircle } from '../src/index.js';
import {
  reverseCurve,
  curve2dBoundingBox,
  curve2dFirstPoint,
  curve2dLastPoint,
  curve2dSplitAt,
  curve2dParameter,
  curve2dTangentAt,
  curve2dIsOnCurve,
  curve2dDistanceFrom,
} from '../src/2d/lib/curve2dFns.js';

beforeAll(async () => {
  await initOC();
}, 30000);

/** Get the first curve from a rectangle drawing */
function getLineCurve() {
  const drawing = drawRectangle(10, 10);
   
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return drawing.blueprint.curves[0]!;
}

/** Get a circular curve */
function _getCircleCurve() {
  const drawing = drawCircle(5);

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return drawing.blueprint.curves[0]!;
}

describe('reverseCurve', () => {
  it('reverses a curve without mutating original', () => {
    const curve = getLineCurve();
    const firstPt = curve2dFirstPoint(curve);
    const lastPt = curve2dLastPoint(curve);
    const reversed = reverseCurve(curve);
    // Original unchanged
    expect(curve2dFirstPoint(curve)).toEqual(firstPt);
    // Reversed has swapped endpoints
    expect(curve2dFirstPoint(reversed)[0]).toBeCloseTo(lastPt[0], 3);
    expect(curve2dFirstPoint(reversed)[1]).toBeCloseTo(lastPt[1], 3);
    expect(curve2dLastPoint(reversed)[0]).toBeCloseTo(firstPt[0], 3);
    expect(curve2dLastPoint(reversed)[1]).toBeCloseTo(firstPt[1], 3);
  });
});

describe('curve2dBoundingBox', () => {
  it('returns a bounding box', () => {
    const curve = getLineCurve();
    const bb = curve2dBoundingBox(curve);
    expect(bb).toBeDefined();
    expect(bb.width).toBeGreaterThanOrEqual(0);
  });
});

describe('curve2dFirstPoint / curve2dLastPoint', () => {
  it('returns Point2D tuples', () => {
    const curve = getLineCurve();
    const first = curve2dFirstPoint(curve);
    const last = curve2dLastPoint(curve);
    expect(first).toHaveLength(2);
    expect(last).toHaveLength(2);
    expect(typeof first[0]).toBe('number');
    expect(typeof last[0]).toBe('number');
  });
});

describe('curve2dSplitAt', () => {
  it('splits a line at a parameter', () => {
    const curve = getLineCurve();
    const mid = (curve.firstParameter + curve.lastParameter) / 2;
    const parts = curve2dSplitAt(curve, [mid]);
    expect(parts.length).toBe(2);
  });
});

describe('curve2dParameter', () => {
  it('finds parameter for first point', () => {
    const curve = getLineCurve();
    const result = curve2dParameter(curve, curve2dFirstPoint(curve));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeCloseTo(curve.firstParameter, 3);
    }
  });

  it('returns err for distant point', () => {
    const curve = getLineCurve();
    const result = curve2dParameter(curve, [9999, 9999]);
    expect(result.ok).toBe(false);
  });
});

describe('curve2dTangentAt', () => {
  it('returns a tangent vector at midpoint', () => {
    const curve = getLineCurve();
    const tangent = curve2dTangentAt(curve, 0.5);
    expect(tangent).toHaveLength(2);
    // Tangent should be non-zero for a line
    expect(Math.abs(tangent[0]) + Math.abs(tangent[1])).toBeGreaterThan(0);
  });
});

describe('curve2dIsOnCurve', () => {
  it('first point is on curve', () => {
    const curve = getLineCurve();
    expect(curve2dIsOnCurve(curve, curve2dFirstPoint(curve))).toBe(true);
  });

  it('distant point is not on curve', () => {
    const curve = getLineCurve();
    expect(curve2dIsOnCurve(curve, [9999, 9999])).toBe(false);
  });
});

describe('curve2dDistanceFrom', () => {
  it('first point has zero distance', () => {
    const curve = getLineCurve();
    expect(curve2dDistanceFrom(curve, curve2dFirstPoint(curve))).toBeCloseTo(0, 3);
  });

  it('distant point has large distance', () => {
    const curve = getLineCurve();
    expect(curve2dDistanceFrom(curve, [1000, 1000])).toBeGreaterThan(10);
  });
});
