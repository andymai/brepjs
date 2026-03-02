import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  approximateAsBSpline,
  BSplineToBezier,
  approximateAsSvgCompatibleCurve,
} from '../src/2d/lib/approximations.js';
import {
  make2dSegmentCurve,
  make2dCircle,
  make2dThreePointArc,
  make2dBezierCurve,
  make2dEllipse,
  make2dEllipseArc,
  make2dInerpolatedBSplineCurve,
} from '../src/2d/lib/makeCurves.js';
import { unwrap } from '../src/core/result.js';
import type { Curve2D } from '../src/2d/lib/Curve2D.js';

beforeAll(async () => {
  await initOC();
}, 30000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A full circle curve (firstPoint === lastPoint). */
function makeFullCircle(): Curve2D {
  return make2dCircle(5);
}

/** A partial arc of a circle (not closed). */
function makeArc(): Curve2D {
  return make2dThreePointArc([5, 0], [0, 5], [-5, 0]);
}

/** A full ellipse curve (firstPoint === lastPoint). */
function makeFullEllipse(): Curve2D {
  return make2dEllipse(10, 5);
}

/** A partial ellipse arc. */
function makeEllipseArc(): Curve2D {
  return make2dEllipseArc(10, 5, 0, Math.PI / 2, [0, 0], [1, 0]);
}

/** A line segment. */
function makeLine(): Curve2D {
  return make2dSegmentCurve([0, 0], [10, 5]);
}

/** A Bezier curve of the given degree. */
function makeBezier(degree: number): Curve2D {
  const controls: [number, number][] = [];
  for (let i = 1; i < degree; i++) {
    controls.push([i * 2, 5]);
  }
  return make2dBezierCurve([0, 0], controls, [degree * 2, 0]);
}

/** A B-spline curve built via point interpolation. */
function makeBSpline(): Curve2D {
  return unwrap(
    make2dInerpolatedBSplineCurve([
      [0, 0],
      [2, 4],
      [5, 1],
      [8, 3],
    ])
  );
}

// ---------------------------------------------------------------------------
// approximateAsBSpline
// ---------------------------------------------------------------------------

describe('approximateAsBSpline', () => {
  it('converts a circular arc to a BSpline with default options', () => {
    const arc = makeArc();
    const result = approximateAsBSpline(arc);
    expect(result).toBeDefined();
    expect(result.geomType).toBe('BSPLINE_CURVE');
  });

  it('converts a line to a BSpline', () => {
    const line = makeLine();
    const result = approximateAsBSpline(line);
    expect(result).toBeDefined();
    expect(result.geomType).toBe('BSPLINE_CURVE');
    // Should be geometrically close to the original endpoints
    expect(result.firstPoint[0]).toBeCloseTo(line.firstPoint[0], 2);
    expect(result.lastPoint[0]).toBeCloseTo(line.lastPoint[0], 2);
  });

  it('respects a tight tolerance (1e-6)', () => {
    const arc = makeArc();
    const result = approximateAsBSpline(arc, 1e-6);
    expect(result.geomType).toBe('BSPLINE_CURVE');
  });

  it('respects a loose tolerance (1)', () => {
    const arc = makeArc();
    const result = approximateAsBSpline(arc, 1);
    expect(result.geomType).toBe('BSPLINE_CURVE');
  });

  it('uses C1 continuity', () => {
    const arc = makeArc();
    const result = approximateAsBSpline(arc, 1e-4, 'C1');
    expect(result.geomType).toBe('BSPLINE_CURVE');
  });

  it('uses C2 continuity', () => {
    const arc = makeArc();
    const result = approximateAsBSpline(arc, 1e-4, 'C2');
    expect(result.geomType).toBe('BSPLINE_CURVE');
  });

  it('uses C0 continuity (explicit)', () => {
    const arc = makeArc();
    const result = approximateAsBSpline(arc, 1e-4, 'C0');
    expect(result.geomType).toBe('BSPLINE_CURVE');
  });

  it('respects custom maxSegments', () => {
    const arc = makeArc();
    const result = approximateAsBSpline(arc, 1e-4, 'C1', 50);
    expect(result.geomType).toBe('BSPLINE_CURVE');
  });

  it('handles a full circle as input', () => {
    const circle = makeFullCircle();
    const result = approximateAsBSpline(circle);
    expect(result.geomType).toBe('BSPLINE_CURVE');
  });
});

// ---------------------------------------------------------------------------
// BSplineToBezier
// ---------------------------------------------------------------------------

describe('BSplineToBezier', () => {
  it('decomposes a BSpline into Bezier arcs', () => {
    const bspline = makeBSpline();
    const beziers = BSplineToBezier(bspline);
    expect(beziers).toBeInstanceOf(Array);
    expect(beziers.length).toBeGreaterThan(0);
    for (const b of beziers) {
      expect(b.geomType).toBe('BEZIER_CURVE');
    }
  });

  it('throws when passed a non-BSpline curve', () => {
    const line = makeLine();
    expect(() => BSplineToBezier(line)).toThrow();
  });

  it('throws when passed a circle curve', () => {
    const circle = makeFullCircle();
    expect(() => BSplineToBezier(circle)).toThrow();
  });

  it('decomposes an approximated BSpline (from approximateAsBSpline)', () => {
    const arc = makeArc();
    const bspline = approximateAsBSpline(arc);
    const beziers = BSplineToBezier(bspline);
    expect(beziers.length).toBeGreaterThan(0);
    for (const b of beziers) {
      expect(b.geomType).toBe('BEZIER_CURVE');
    }
  });
});

// ---------------------------------------------------------------------------
// approximateAsSvgCompatibleCurve
// ---------------------------------------------------------------------------

describe('approximateAsSvgCompatibleCurve', () => {
  it('returns empty array for empty input', () => {
    const result = approximateAsSvgCompatibleCurve([]);
    expect(result).toEqual([]);
  });

  it('passes through a LINE curve unchanged (same geomType)', () => {
    const line = makeLine();
    const result = approximateAsSvgCompatibleCurve([line]);
    expect(result).toHaveLength(1);
    expect(result[0]?.geomType).toBe('LINE');
  });

  it('splits a full circle into 2 arcs', () => {
    const circle = makeFullCircle();
    const result = approximateAsSvgCompatibleCurve([circle]);
    expect(result).toHaveLength(2);
    for (const c of result) {
      expect(c.geomType).toBe('CIRCLE');
    }
  });

  it('passes through a partial circle arc unchanged', () => {
    const arc = makeArc();
    const result = approximateAsSvgCompatibleCurve([arc]);
    expect(result).toHaveLength(1);
    expect(result[0]?.geomType).toBe('CIRCLE');
  });

  it('splits a full ellipse into 2 arcs', () => {
    const ellipse = makeFullEllipse();
    const result = approximateAsSvgCompatibleCurve([ellipse]);
    expect(result).toHaveLength(2);
    for (const c of result) {
      expect(c.geomType).toBe('ELLIPSE');
    }
  });

  it('splits a partial ellipse arc because ellipses always split', () => {
    // The source code splits ELLIPSE unconditionally (line 120), so a
    // partial arc is also split at the 0.5 parameter.
    const arc = makeEllipseArc();
    const result = approximateAsSvgCompatibleCurve([arc]);
    // Split at 0.5 parameter → 2 segments
    expect(result).toHaveLength(2);
    for (const c of result) {
      expect(c.geomType).toBe('ELLIPSE');
    }
  });

  it('passes through a degree-1 Bezier (linear)', () => {
    const bez = makeBezier(1);
    const result = approximateAsSvgCompatibleCurve([bez]);
    expect(result).toHaveLength(1);
    expect(result[0]?.geomType).toBe('BEZIER_CURVE');
  });

  it('passes through a degree-2 Bezier (quadratic)', () => {
    const bez = makeBezier(2);
    const result = approximateAsSvgCompatibleCurve([bez]);
    expect(result).toHaveLength(1);
    expect(result[0]?.geomType).toBe('BEZIER_CURVE');
  });

  it('passes through a degree-3 Bezier (cubic)', () => {
    const bez = makeBezier(3);
    const result = approximateAsSvgCompatibleCurve([bez]);
    expect(result).toHaveLength(1);
    expect(result[0]?.geomType).toBe('BEZIER_CURVE');
  });

  it('approximates a degree-4 Bezier into lower-degree pieces', () => {
    // Degree-4 Bezier is not SVG-compatible → falls through to BSpline approximation
    const bez = makeBezier(4);
    const result = approximateAsSvgCompatibleCurve([bez]);
    expect(result.length).toBeGreaterThan(0);
    // All output curves should be SVG-compatible (degree ≤ 3 Bezier or line/arc)
    for (const c of result) {
      const type = c.geomType;
      expect(['LINE', 'CIRCLE', 'ELLIPSE', 'BEZIER_CURVE']).toContain(type);
    }
  });

  it('decomposes a BSpline curve into Bezier segments', () => {
    const bspline = makeBSpline();
    const result = approximateAsSvgCompatibleCurve([bspline]);
    expect(result.length).toBeGreaterThan(0);
    for (const c of result) {
      expect(c.geomType).toBe('BEZIER_CURVE');
    }
  });

  it('handles a mix of curve types in one call', () => {
    const line = makeLine();
    const arc = makeArc();
    const bspline = makeBSpline();
    const result = approximateAsSvgCompatibleCurve([line, arc, bspline]);
    // line → 1, arc → 1, bspline → N≥1 Beziers
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result[0]?.geomType).toBe('LINE');
    expect(result[1]?.geomType).toBe('CIRCLE');
  });

  it('accepts custom tolerance option', () => {
    const bspline = makeBSpline();
    const result = approximateAsSvgCompatibleCurve([bspline], { tolerance: 1e-6 });
    expect(result.length).toBeGreaterThan(0);
  });

  it('accepts custom continuity option', () => {
    const bspline = makeBSpline();
    const result = approximateAsSvgCompatibleCurve([bspline], { continuity: 'C2' });
    expect(result.length).toBeGreaterThan(0);
  });

  it('accepts custom maxSegments option', () => {
    const bspline = makeBSpline();
    const result = approximateAsSvgCompatibleCurve([bspline], { maxSegments: 50 });
    expect(result.length).toBeGreaterThan(0);
  });

  it('all output curves have valid endpoints', () => {
    const curves: Curve2D[] = [makeLine(), makeArc(), makeBSpline(), makeBezier(2)];
    const result = approximateAsSvgCompatibleCurve(curves);
    for (const c of result) {
      expect(c.firstPoint).toHaveLength(2);
      expect(c.lastPoint).toHaveLength(2);
      expect(isFinite(c.firstPoint[0])).toBe(true);
      expect(isFinite(c.firstPoint[1])).toBe(true);
      expect(isFinite(c.lastPoint[0])).toBe(true);
      expect(isFinite(c.lastPoint[1])).toBe(true);
    }
  });

  it('preserves endpoints of a line under approximation', () => {
    const line = makeLine();
    const result = approximateAsSvgCompatibleCurve([line]);
    expect(result[0]?.firstPoint[0]).toBeCloseTo(line.firstPoint[0], 3);
    expect(result[0]?.firstPoint[1]).toBeCloseTo(line.firstPoint[1], 3);
    expect(result[0]?.lastPoint[0]).toBeCloseTo(line.lastPoint[0], 3);
    expect(result[0]?.lastPoint[1]).toBeCloseTo(line.lastPoint[1], 3);
  });
});
