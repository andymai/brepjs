import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  line2d,
  circle2d,
  arc2d,
  arc2dTangent,
  ellipse2d,
  ellipseArc2d,
  bezier2d,
  bspline2d,
  translateCurve2d,
  rotateCurve2d,
  scaleCurve2d,
  mirrorCurve2d,
  mirrorCurve2dAcrossAxis,
  offsetCurve2d,
  evaluateCurve2d,
  tangentCurve2d,
  boundsCurve2d,
  typeCurve2d,
  intersectCurves2d,
  projectPointOnCurve2d,
  distanceBetweenCurves2d,
  liftCurve2dToPlane,
  extractCurve2dFromEdge,
} from '@/2d/curve2dGeometryFns.js';
import { unwrap, isOk, isErr } from '@/core/result.js';
import { makePlane } from '@/core/planeOps.js';
import { box } from '@/topology/primitiveFns.js';
import { getFaces, getEdges } from '@/topology/shapeFns.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

// ═══════════════════════════════════════════════════════════════════════════
// Constructors
// ═══════════════════════════════════════════════════════════════════════════

describe('2D curve constructors', () => {
  it('creates a 2D line segment', () => {
    const result = line2d([0, 0], [10, 5]);
    expect(isOk(result)).toBe(true);
    using curve = unwrap(result);
    expect(curve.disposed).toBe(false);
  });

  it('creates a 2D circle', () => {
    using curve = unwrap(circle2d([0, 0], 5));
    const type = unwrap(typeCurve2d(curve));
    expect(type.toUpperCase()).toContain('CIRCLE');
  });

  it('rejects circle with non-positive radius', () => {
    expect(isErr(circle2d([0, 0], 0))).toBe(true);
    expect(isErr(circle2d([0, 0], -1))).toBe(true);
  });

  it('creates a 2D arc from 3 points', () => {
    using curve = unwrap(arc2d([0, 0], [5, 5], [10, 0]));
    expect(curve.disposed).toBe(false);
  });

  it('creates a 2D tangent arc', () => {
    using curve = unwrap(arc2dTangent([0, 0], [1, 0], [5, 5]));
    expect(curve.disposed).toBe(false);
  });

  it('creates a 2D ellipse', () => {
    using curve = unwrap(ellipse2d([0, 0], 10, 5));
    const type = unwrap(typeCurve2d(curve));
    expect(type.toUpperCase()).toContain('ELLIPSE');
  });

  it('rejects ellipse with minor > major', () => {
    expect(isErr(ellipse2d([0, 0], 5, 10))).toBe(true);
  });

  it('creates a 2D ellipse arc', () => {
    using curve = unwrap(ellipseArc2d([0, 0], 10, 5, 0, Math.PI / 2));
    expect(curve.disposed).toBe(false);
  });

  it('creates a 2D Bezier curve', () => {
    using curve = unwrap(
      bezier2d([
        [0, 0],
        [3, 5],
        [7, 3],
        [10, 0],
      ])
    );
    expect(curve.disposed).toBe(false);
  });

  it('rejects Bezier with fewer than 2 points', () => {
    expect(isErr(bezier2d([[0, 0]]))).toBe(true);
  });

  it('creates a 2D B-spline through points', () => {
    using curve = unwrap(
      bspline2d([
        [0, 0],
        [3, 5],
        [7, 3],
        [10, 0],
      ])
    );
    expect(curve.disposed).toBe(false);
  });

  it('rejects B-spline with fewer than 2 points', () => {
    expect(isErr(bspline2d([[0, 0]]))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Transforms
// ═══════════════════════════════════════════════════════════════════════════

describe('2D curve transforms', () => {
  it('translates a 2D curve', () => {
    const curve = unwrap(line2d([0, 0], [10, 0]));
    const moved = unwrap(translateCurve2d(curve, 5, 3));
    const pt = unwrap(evaluateCurve2d(moved, 0));
    expect(pt[0]).toBeCloseTo(5, 5);
    expect(pt[1]).toBeCloseTo(3, 5);
    curve[Symbol.dispose]();
    moved[Symbol.dispose]();
  });

  it('rotates a 2D curve by 90 degrees', () => {
    const curve = unwrap(line2d([1, 0], [2, 0]));
    const rotated = unwrap(rotateCurve2d(curve, Math.PI / 2));
    const pt = unwrap(evaluateCurve2d(rotated, 0));
    expect(pt[0]).toBeCloseTo(0, 5);
    expect(pt[1]).toBeCloseTo(1, 5);
    curve[Symbol.dispose]();
    rotated[Symbol.dispose]();
  });

  it('scales a 2D curve', () => {
    const curve = unwrap(line2d([1, 0], [2, 0]));
    const scaled = unwrap(scaleCurve2d(curve, 3));
    const pt = unwrap(evaluateCurve2d(scaled, 0));
    expect(pt[0]).toBeCloseTo(3, 5);
    expect(pt[1]).toBeCloseTo(0, 5);
    curve[Symbol.dispose]();
    scaled[Symbol.dispose]();
  });

  it('mirrors a 2D curve across a point', () => {
    const curve = unwrap(line2d([1, 0], [2, 0]));
    const mirrored = unwrap(mirrorCurve2d(curve, [0, 0]));
    const pt = unwrap(evaluateCurve2d(mirrored, 0));
    expect(pt[0]).toBeCloseTo(-1, 5);
    expect(pt[1]).toBeCloseTo(0, 5);
    curve[Symbol.dispose]();
    mirrored[Symbol.dispose]();
  });

  it('mirrors a 2D curve across an axis', () => {
    const curve = unwrap(line2d([1, 1], [2, 1]));
    const mirrored = unwrap(mirrorCurve2dAcrossAxis(curve, [0, 0], [1, 0]));
    const pt = unwrap(evaluateCurve2d(mirrored, 0));
    expect(pt[0]).toBeCloseTo(1, 5);
    expect(pt[1]).toBeCloseTo(-1, 5);
    curve[Symbol.dispose]();
    mirrored[Symbol.dispose]();
  });

  it('offsets a 2D circle', () => {
    const curve = unwrap(circle2d([0, 0], 5));
    const offset = unwrap(offsetCurve2d(curve, 2));
    expect(offset.disposed).toBe(false);
    curve[Symbol.dispose]();
    offset[Symbol.dispose]();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Queries
// ═══════════════════════════════════════════════════════════════════════════

describe('2D curve queries', () => {
  it('evaluates a point on a 2D line', () => {
    const curve = unwrap(line2d([0, 0], [10, 0]));
    const bounds = unwrap(boundsCurve2d(curve));
    const midParam = (bounds.first + bounds.last) / 2;
    const pt = unwrap(evaluateCurve2d(curve, midParam));
    expect(pt[0]).toBeCloseTo(5, 5);
    expect(pt[1]).toBeCloseTo(0, 5);
    curve[Symbol.dispose]();
  });

  it('evaluates tangent on a 2D line', () => {
    const curve = unwrap(line2d([0, 0], [10, 0]));
    const bounds = unwrap(boundsCurve2d(curve));
    const result = unwrap(tangentCurve2d(curve, bounds.first));
    expect(result.point[0]).toBeCloseTo(0, 5);
    expect(result.point[1]).toBeCloseTo(0, 5);
    // Tangent direction should be along X
    expect(result.tangent[1]).toBeCloseTo(0, 5);
    curve[Symbol.dispose]();
  });

  it('gets parameter bounds of a 2D curve', () => {
    const curve = unwrap(line2d([0, 0], [10, 0]));
    const bounds = unwrap(boundsCurve2d(curve));
    expect(bounds.first).toBeDefined();
    expect(bounds.last).toBeDefined();
    expect(bounds.last).toBeGreaterThan(bounds.first);
    curve[Symbol.dispose]();
  });

  it('gets the type of a 2D curve', () => {
    const line = unwrap(line2d([0, 0], [10, 0]));
    const lineType = unwrap(typeCurve2d(line));
    expect(lineType.toUpperCase()).toContain('LINE');
    line[Symbol.dispose]();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Intersection
// ═══════════════════════════════════════════════════════════════════════════

describe('2D curve intersection', () => {
  it('finds intersection of two crossing lines', () => {
    const c1 = unwrap(line2d([0, 0], [10, 10]));
    const c2 = unwrap(line2d([0, 10], [10, 0]));
    const result = unwrap(intersectCurves2d(c1, c2));
    expect(result.points.length).toBeGreaterThanOrEqual(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length asserted above
    const pt = result.points[0]!;
    expect(pt[0]).toBeCloseTo(5, 4);
    expect(pt[1]).toBeCloseTo(5, 4);
    result.segments.forEach((s) => {
      s[Symbol.dispose]();
    });
    c1[Symbol.dispose]();
    c2[Symbol.dispose]();
  });

  it('finds no intersection for parallel lines', () => {
    const c1 = unwrap(line2d([0, 0], [10, 0]));
    const c2 = unwrap(line2d([0, 5], [10, 5]));
    const result = unwrap(intersectCurves2d(c1, c2));
    expect(result.points).toHaveLength(0);
    c1[Symbol.dispose]();
    c2[Symbol.dispose]();
  });

  it('projects a point onto a 2D curve', () => {
    const curve = unwrap(line2d([0, 0], [10, 0]));
    const result = unwrap(projectPointOnCurve2d(curve, [5, 3]));
    expect(result).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- asserted above
    expect(result!.distance).toBeCloseTo(3, 5);
    curve[Symbol.dispose]();
  });

  it('computes distance between two circles', () => {
    // Circles have well-defined bounds, avoiding infinite-range issues with lines
    const c1 = unwrap(circle2d([0, 0], 2));
    const c2 = unwrap(circle2d([10, 0], 3));
    const dist = unwrap(distanceBetweenCurves2d(c1, c2));
    // Distance between circles: gap = 10 - 2 - 3 = 5
    expect(dist).toBeCloseTo(5, 4);
    c1[Symbol.dispose]();
    c2[Symbol.dispose]();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2D-3D Bridge
// ═══════════════════════════════════════════════════════════════════════════

describe('2D-3D bridge', () => {
  it('lifts a 2D line to a 3D edge on XY plane', () => {
    const curve = unwrap(line2d([0, 0], [10, 0]));
    const plane = makePlane('XY');
    const result = liftCurve2dToPlane(curve, plane);
    expect(isOk(result)).toBe(true);
    curve[Symbol.dispose]();
  });

  it('lifts a 2D line to an offset plane', () => {
    const curve = unwrap(line2d([0, 0], [10, 0]));
    const plane = makePlane('XY', [0, 0, 5]);
    const result = liftCurve2dToPlane(curve, plane);
    expect(isOk(result)).toBe(true);
    curve[Symbol.dispose]();
  });

  it('extracts a 2D curve from a 3D edge on a face', () => {
    const solid = box(10, 10, 10);
    const faces = getFaces(solid);
    expect(faces.length).toBeGreaterThan(0);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length asserted above
    const face = faces[0]!;
    const edges = getEdges(face);
    expect(edges.length).toBeGreaterThan(0);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length asserted above
    const edge = edges[0]!;
    const result = extractCurve2dFromEdge(edge, face);
    expect(isOk(result)).toBe(true);
    const curve = unwrap(result);
    // Verify the extracted curve is usable
    const type = unwrap(typeCurve2d(curve));
    expect(type).toBeDefined();
    const bounds = unwrap(boundsCurve2d(curve));
    expect(bounds.last).toBeGreaterThan(bounds.first);
    curve[Symbol.dispose]();
  });
});
