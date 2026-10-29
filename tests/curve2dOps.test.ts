/**
 * 2D curve operations against analytic values: offsets, reversal, bounding
 * boxes, scaling, affinities, interpolation, curve distance and lifting. The
 * reference semantics are OCCT's Geom2d ones (an offset goes to the right of
 * the direction of travel, a reversal swaps the ends without moving the curve).
 * They pin occt-wasm's 2D ops; the opencascade.js and brepkit adapters keep
 * their own sampled implementations of several of them.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { currentKernel, initKernel } from './setup.js';
import {
  createNamedPlane,
  draw,
  drawCircle,
  drawEllipse,
  drawPointsInterpolation,
  drawRectangle,
  drawRoundedRectangle,
  drawSingleCircle,
  getKernel,
  measureArea,
  measureLength,
  reverseCurve,
  unwrap,
} from '@/index.js';
import type { Drawing } from '@/index.js';
import {
  bspline2d,
  circle2d,
  createCurve2DHandle,
  distanceBetweenCurves2d,
  evaluateCurve2d as evaluateHandle,
  liftCurve2dToPlane,
  offsetCurve2d as offsetHandle,
  projectPointOnCurve2d,
  trimCurve2d,
  typeCurve2d,
} from '@/2d.js';
import { Curve2D } from '@/2d/lib/curve2D.js';
import { make2dOffset } from '@/2d/lib/offset.js';
import {
  make2dBezierCurve,
  make2dEllipseArc,
  make2dSegmentCurve,
  make2dThreePointArc,
} from '@/2d/lib/makeCurves.js';
import {
  addCurveToBBox,
  affineCurve2d,
  createBBox2d,
  evaluateCurve2d,
  makeCircle2d,
  makeEllipse2d,
  makeLine2d,
  offsetCurve2d,
  reverseCurve2d,
  scaleCurve2d,
  type Affine2d,
  type BSpline2d,
  type Curve2dObj,
} from '@/kernel/geometry2d.js';

type Pt = [number, number];

beforeAll(async () => {
  await initKernel();
}, 30000);

const describeOcctWasm = describe.skipIf(currentKernel !== 'occt-wasm');

function faceArea(d: Drawing): number {
  const sketch = d.sketchOnPlane('XY');
  if (!('face' in sketch)) throw new Error('expected a single sketch');
  return unwrap(measureArea(sketch.face()));
}

function trimmed(basis: Curve2dObj, tStart: number, tEnd: number): Curve2dObj {
  return { __bk2d: 'trimmed', basis, tStart, tEnd };
}

const SAMPLES = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

function expectClose(actual: Pt, expected: Pt, digits = 9): void {
  expect(actual[0]).toBeCloseTo(expected[0], digits);
  expect(actual[1]).toBeCloseTo(expected[1], digits);
}

/** Perimeter of an ellipse by the trapezoid rule (spectrally accurate for a periodic integrand). */
function ellipsePerimeter(a: number, b: number): number {
  const n = 4096;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    sum += Math.hypot(a * Math.sin(t), b * Math.cos(t));
  }
  return (sum * 2 * Math.PI) / n;
}

/** Area between a 90 degree corner of a line and an arc (radius R) and a fillet of radius r. */
function lineArcFilletLoss(R: number, r: number): number {
  const alpha = Math.asin(r / (R - r));
  const fx = Math.sqrt((R - r) ** 2 - r * r);
  const t1: Pt = [fx, 0];
  const f: Pt = [fx, -r];
  const t2: Pt = [R * Math.cos(alpha), -R * Math.sin(alpha)];
  const corner: Pt = [R, 0];
  const poly = [corner, t1, f, t2];
  let twice = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i] as Pt;
    const [x2, y2] = poly[(i + 1) % poly.length] as Pt;
    twice += x1 * y2 - x2 * y1;
  }
  const filletSector = (r * r * (Math.PI / 2 + alpha)) / 2;
  const arcSegment = (R * R * (alpha - Math.sin(alpha))) / 2;
  return Math.abs(twice) / 2 - filletSector + arcSegment;
}

describeOcctWasm('circle offsets', () => {
  it('offsets a full circle drawn as two arcs', () => {
    expect(faceArea(drawCircle(10).offset(2))).toBeCloseTo(144 * Math.PI, 6);
  });

  it('offsets a rounded rectangle (Steiner formula)', () => {
    const area = 800 - 25 * (4 - Math.PI);
    const perimeter = 2 * (40 + 20) - 8 * 5 + 2 * Math.PI * 5;
    expect(faceArea(drawRoundedRectangle(40, 20, 5).offset(1))).toBeCloseTo(
      area + perimeter + Math.PI,
      6
    );
  });

  it('offsets an arc radially, keeping its sweep', () => {
    const arc = make2dThreePointArc([10, 0], [0, 10], [-10, 0]);
    const out = make2dOffset(arc, 2);
    expect(out).toBeInstanceOf(Curve2D);
    const c = out as Curve2D;
    expectClose(c.firstPoint, [12, 0]);
    expectClose(c.lastPoint, [-12, 0]);
    expectClose(c.value((c.firstParameter + c.lastParameter) / 2), [0, 12]);
  });

  it('offsets a clockwise arc to the right of travel (towards its center)', () => {
    const arc = make2dThreePointArc([-10, 0], [0, 10], [10, 0]);
    const c = make2dOffset(arc, 2) as Curve2D;
    expectClose(c.firstPoint, [-8, 0]);
    expectClose(c.value((c.firstParameter + c.lastParameter) / 2), [0, 8]);
  });

  it('fillets both corners of a semicircle', () => {
    const semicircle = draw().hLine(20).sagittaArc(-20, 0, 10).close();
    expect(faceArea(semicircle.fillet(1))).toBeCloseTo(
      50 * Math.PI - 2 * lineArcFilletLoss(10, 1),
      6
    );
  });

  it('offsets a single closed circle curve', () => {
    expect(faceArea(drawSingleCircle(10).offset(2))).toBeCloseTo(144 * Math.PI, 6);
    expect(faceArea(drawSingleCircle(10).offset(-2))).toBeCloseTo(64 * Math.PI, 6);
  });
});

describeOcctWasm('reversal', () => {
  const curves: Record<string, () => Curve2D> = {
    line: () => make2dSegmentCurve([1, 2], [7, -3]),
    arc: () => make2dThreePointArc([10, 0], [0, 10], [-10, 0]),
    'ellipse arc': () => make2dEllipseArc(8, 3, 0.3, 2.5, [1, 1], [1, 1]),
    bezier: () =>
      make2dBezierCurve(
        [0, 0],
        [
          [2, 5],
          [6, -4],
        ],
        [9, 1]
      ),
    bspline: () =>
      new Curve2D({
        __bk2d: 'bspline',
        poles: [
          [0, 0],
          [3, 4],
          [7, 1],
          [9, 6],
          [12, 2],
        ],
        knots: [0, 0.3, 1],
        multiplicities: [4, 1, 4],
        degree: 3,
        isPeriodic: false,
      }),
  };

  it.each(Object.keys(curves))('reverses a %s in place, keeping its geometry', (name) => {
    const curve = (curves[name] as () => Curve2D)();
    const reversed = reverseCurve(curve);
    const { firstParameter: a, lastParameter: b } = curve;
    const { firstParameter: ra, lastParameter: rb } = reversed;
    for (const s of SAMPLES) {
      expectClose(reversed.value(ra + s * (rb - ra)), curve.value(b - s * (b - a)));
    }
    expectClose(reversed.firstPoint, curve.lastPoint);
    expectClose(reversed.lastPoint, curve.firstPoint);
  });

  it('closes a mirrored profile with edges that chain head to tail', () => {
    const profile = draw().hLine(10).vLine(10).hLine(-5).closeWithMirror();
    const cs = profile.blueprint.curves;
    for (let i = 0; i < cs.length; i++) {
      const cur = cs[i] as Curve2D;
      const next = cs[(i + 1) % cs.length] as Curve2D;
      expectClose(cur.value(cur.lastParameter), next.value(next.firstParameter));
    }
  });

  // Corners A (0,0) and D (5,10) both turn by atan(4/3): A is convex and D is
  // reflex, so their fillets cancel and only the four right angles count.
  it('fillets every corner of a mirrored profile', () => {
    const profile = draw().hLine(10).vLine(10).hLine(-5).closeWithMirror();
    expect(faceArea(profile.fillet(1))).toBeCloseTo(150 - 4 * (1 - Math.PI / 4), 6);
  });

  it('offsets a mirrored profile', () => {
    const profile = draw().hLine(10).vLine(10).hLine(-5).closeWithMirror();
    const turn = Math.atan2(4, 3);
    const convexTurns = 2 * Math.PI + turn;
    const expected = 150 + 50 + convexTurns / 2 - Math.tan(turn / 2);
    expect(faceArea(profile.offset(1))).toBeCloseTo(expected, 6);
  });

  it('reverses trimmed curves onto an increasing range without touching the basis', () => {
    const basis = makeCircle2d(1, 2, 5, true);
    const arc = trimmed(basis, 0.5, 2);
    const rev = reverseCurve2d(arc);
    expect(rev.__bk2d).toBe('trimmed');
    if (rev.__bk2d !== 'trimmed') return;
    expect(rev.tEnd).toBeGreaterThan(rev.tStart);
    expect(basis.sense).toBe(true);
    for (const s of SAMPLES) expectClose(evaluateCurve2d(rev, s), evaluateCurve2d(arc, 1 - s));
  });

  it('leaves an earlier trim in place when its source curve is reversed', () => {
    const circle = makeCircle2d(0, 0, 10, true);
    const arc = unwrap(trimCurve2d(createCurve2DHandle(circle), 0, Math.PI / 2));
    const before = SAMPLES.map((s) => unwrap(evaluateHandle(arc, s)));
    new Curve2D(circle).reverse();
    expect(circle.sense).toBe(false);
    SAMPLES.forEach((s, i) => {
      expectClose(unwrap(evaluateHandle(arc, s)), before[i] as Pt);
    });
  });
});

describeOcctWasm('bounding boxes', () => {
  it('includes the bottom of an arc through (0, -10)', () => {
    const r = 10 / Math.SQRT2;
    const bounds = make2dThreePointArc([-r, -r], [0, -10], [r, -r]).boundingBox.bounds;
    expectClose(bounds[0], [-r, -10]);
    expectClose(bounds[1], [r, -r]);
  });

  it('bounds a rotated filleted square', () => {
    const extent = 5 * Math.SQRT2 + 5;
    const [[xMin, yMin], [xMax, yMax]] = drawRectangle(20, 20).rotate(45).fillet(5)
      .boundingBox.bounds;
    expect(xMin).toBeCloseTo(-extent, 9);
    expect(yMin).toBeCloseTo(-extent, 9);
    expect(xMax).toBeCloseTo(extent, 9);
    expect(yMax).toBeCloseTo(extent, 9);
  });

  it('bounds a rotated ellipse analytically', () => {
    const [[xMin, yMin], [xMax, yMax]] = drawEllipse(20, 10).rotate(30).boundingBox.bounds;
    expect(xMax).toBeCloseTo(Math.sqrt(400 * 0.75 + 100 * 0.25), 9);
    expect(xMin).toBeCloseTo(-Math.sqrt(400 * 0.75 + 100 * 0.25), 9);
    expect(yMax).toBeCloseTo(Math.sqrt(400 * 0.25 + 100 * 0.75), 9);
    expect(yMin).toBeCloseTo(-Math.sqrt(400 * 0.25 + 100 * 0.75), 9);
  });

  it.each([
    ['ccw arc past 2pi', trimmed(makeCircle2d(0, 0, 3, true), 5, 5 + Math.PI)],
    ['cw arc', trimmed(makeCircle2d(1, 1, 2, false), -1, 3)],
    ['negative range', trimmed(makeCircle2d(0, 0, 1, true), -7, -5)],
    ['reversed range', trimmed(makeCircle2d(0, 0, 1, true), 2, -2)],
    ['ellipse arc', trimmed(makeEllipse2d(0, 0, 6, 2, 1, 2, false), -4, 1)],
    ['nested trim', trimmed(trimmed(makeCircle2d(0, 0, 4, true), 1, 5), 0.2, 0.9)],
  ] as [string, Curve2dObj][])('matches dense sampling for a %s', (_name, c) => {
    const box = createBBox2d();
    addCurveToBBox(box, c, 0);
    let [xMin, yMin, xMax, yMax] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i <= 20000; i++) {
      const [x, y] = evaluateCurve2d(c, i / 20000);
      [xMin, yMin, xMax, yMax] = [
        Math.min(xMin, x),
        Math.min(yMin, y),
        Math.max(xMax, x),
        Math.max(yMax, y),
      ];
    }
    expect(box.xMin).toBeCloseTo(xMin, 6);
    expect(box.yMin).toBeCloseTo(yMin, 6);
    expect(box.xMax).toBeCloseTo(xMax, 6);
    expect(box.yMax).toBeCloseTo(yMax, 6);
  });
});

describeOcctWasm('offsetCurve2d', () => {
  it('offsets a counter-clockwise circle outward, exactly', () => {
    const offset = unwrap(offsetHandle(unwrap(circle2d([1, 2], 10)), 2));
    expect(unwrap(typeCurve2d(offset))).toBe('CIRCLE');
    for (const t of [0, 1, 2, 4, 6]) {
      const [x, y] = unwrap(evaluateHandle(offset, t));
      expect(Math.hypot(x - 1, y - 2)).toBeCloseTo(12, 12);
    }
  });

  it('offsets a line to the right of its direction', () => {
    const line = offsetCurve2d(makeLine2d(0, 0, 10, 0), 1);
    expectClose(evaluateCurve2d(line, 0), [0, -1]);
    expectClose(evaluateCurve2d(line, 10), [10, -1]);
  });

  it('offsets an ellipse onto its parallel curve', () => {
    const ellipse = makeEllipse2d(3, -1, 20, 10, 1, 1, true);
    const out = offsetCurve2d(ellipse, 2);
    const cos = Math.SQRT1_2;
    for (let i = 0; i <= 64; i++) {
      // Points of the parallel curve: P + 2 * outward unit normal.
      const t = (2 * Math.PI * i) / 64;
      const [ex, ey] = [20 * Math.cos(t), 10 * Math.sin(t)];
      const [nx, ny] = [10 * Math.cos(t), 20 * Math.sin(t)];
      const len = Math.hypot(nx, ny);
      const lx = ex + (2 * nx) / len;
      const ly = ey + (2 * ny) / len;
      const target: Pt = [3 + lx * cos - ly * cos, -1 + lx * cos + ly * cos];
      expectClose(evaluateCurve2d(out, i / 64), target, 7);
    }
  });

  it('offsets an ellipse drawing by the Steiner formula', () => {
    const expected = 200 * Math.PI + 2 * ellipsePerimeter(20, 10) + 4 * Math.PI;
    expect(faceArea(drawEllipse(20, 10).offset(2))).toBeCloseTo(expected, 5);
  });

  it('fillets a half ellipse where the fillets touch the ellipse', () => {
    const half = draw().movePointerTo([-20, 0]).halfEllipse(40, 0, 10).close();
    const filleted = half.fillet(1).blueprint.curves;
    const onEllipse = (p: Pt) => (p[0] / 20) ** 2 + (p[1] / 10) ** 2;
    const arcs = filleted.filter((c) => c.geomType === 'CIRCLE');
    expect(arcs).toHaveLength(2);
    for (const arc of arcs) {
      const ends = [arc.firstPoint, arc.lastPoint];
      expect(ends.some((p) => Math.abs(p[1]) < 1e-9)).toBe(true);
      expect(ends.some((p) => Math.abs(onEllipse(p) - 1) < 1e-9)).toBe(true);
    }
    expect(faceArea(half.fillet(1))).toBeLessThan(100 * Math.PI - 2 * (1 - Math.PI / 4));
  });
});

describeOcctWasm('scaling', () => {
  it('moves arcs with a negative scale', () => {
    const semicircle = draw().hLine(20).sagittaArc(-20, 0, 10).close();
    const [[xMin, yMin], [xMax, yMax]] = semicircle.scale(-1, [0, 0]).boundingBox.bounds;
    expect([xMin, yMin, xMax, yMax].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([-20, 0, 0, 10]);
  });

  it('keeps a holed rounded rectangle under a negative scale', () => {
    const holed = drawRoundedRectangle(40, 20, 5).cut(drawCircle(4)).scale(-1);
    expect(faceArea(holed)).toBeCloseTo(800 - 25 * (4 - Math.PI) - 16 * Math.PI, 6);
  });

  it('scales trimmed lines with their trim range', () => {
    const scaled = drawRectangle(20, 10).fillet(2).scale(2);
    expect(faceArea(scaled)).toBeCloseTo(4 * (200 - 4 * (4 - Math.PI)), 6);
  });

  it.each([
    ['trimmed circle', trimmed(makeCircle2d(1, 2, 3, true), 0.3, 2)],
    ['cw trimmed circle', trimmed(makeCircle2d(1, 2, 3, false), -1, 1)],
    ['trimmed line', trimmed(makeLine2d(1, 1, 5, 4), 1, 4)],
    ['ellipse', makeEllipse2d(0, 1, 4, 2, 1, 1, true)],
  ] as [string, Curve2dObj][])('commutes with evaluation for a %s', (_name, c) => {
    for (const factor of [-2, -1, 0.5, 3]) {
      const scaled = scaleCurve2d(c, factor, 1, -1);
      for (const s of SAMPLES) {
        const t = c.__bk2d === 'trimmed' ? s : s * 2 * Math.PI;
        const [x, y] = evaluateCurve2d(c, t);
        expectClose(evaluateCurve2d(scaled, t), [1 + (x - 1) * factor, -1 + (y + 1) * factor]);
      }
    }
  });
});

describeOcctWasm('affinities, interpolation, distance and lifting', () => {
  it('stretches a circle into an exact ellipse', () => {
    expect(faceArea(drawCircle(10).stretch(2, [1, 0], [0, 0]))).toBeCloseTo(200 * Math.PI, 6);
  });

  const maps: [string, Affine2d][] = [
    ['shear', { a: 1, b: 0.7, c: 0, d: 1, tx: 2, ty: -1 }],
    ['reflection', { a: -1, b: 0, c: 0, d: 1, tx: 0, ty: 3 }],
    ['rotation', { a: Math.cos(1), b: -Math.sin(1), c: Math.sin(1), d: Math.cos(1), tx: 0, ty: 0 }],
    ['stretch', { a: 2, b: 0, c: 0, d: 0.5, tx: 1, ty: 1 }],
  ];
  const conics: [string, Curve2dObj][] = [
    ['circle arc', trimmed(makeCircle2d(1, 2, 3, true), 0.3, 2.5)],
    ['cw circle arc', trimmed(makeCircle2d(0, 0, 2, false), -1, 2)],
    ['ellipse arc', trimmed(makeEllipse2d(1, 0, 5, 2, 1, 2, true), -0.5, 3)],
    ['line piece', trimmed(makeLine2d(0, 0, 6, 8), 2, 7)],
  ];
  for (const [mapName, m] of maps) {
    it.each(conics)(`maps a %s exactly under a ${mapName}`, (_name, c) => {
      const image = affineCurve2d(c, m);
      for (const s of SAMPLES) {
        const [x, y] = evaluateCurve2d(c, s);
        expectClose(evaluateCurve2d(image, s), [
          m.a * x + m.b * y + m.tx,
          m.c * x + m.d * y + m.ty,
        ]);
      }
    });
  }

  it('interpolates every point of a B-spline', () => {
    const pts: Pt[] = [
      [0, 0],
      [10, 5],
      [20, -3],
      [30, 4],
      [35, 10],
    ];
    const curve = unwrap(bspline2d(pts));
    for (const p of pts) {
      expect(unwrap(projectPointOnCurve2d(curve, p))?.distance).toBeLessThan(1e-9);
    }
    const drawn = drawPointsInterpolation(pts).blueprint.curves[0] as Curve2D;
    for (const p of pts) expect(drawn.distanceFrom(p)).toBeLessThan(1e-9);
  });

  it('measures the gap between two circles', () => {
    const a = unwrap(circle2d([0, 0], 10));
    const b = unwrap(circle2d([20.3, 0.7], 10));
    expect(unwrap(distanceBetweenCurves2d(a, b))).toBeCloseTo(Math.hypot(20.3, 0.7) - 20, 9);
  });

  it('measures the gap between offset parallel segments', () => {
    const a = make2dSegmentCurve([0, 0], [10, 0]);
    const b = make2dSegmentCurve([3.3, 2], [17.1, 2]);
    expect(a.distanceFrom(b)).toBeCloseTo(2, 12);
  });

  it('lifts a thin ellipse exactly', () => {
    expect(faceArea(drawEllipse(50, 2))).toBeCloseTo(100 * Math.PI, 6);
  });

  it('lifts a Bezier profile exactly', () => {
    // A cubic from (0,0) to (10,0) with controls (0,10) and (10,10) encloses
    // 3/10 * 10 * (10 + 10) = 60 with its chord.
    const d = draw().cubicBezierCurveTo([10, 0], [0, 10], [10, 10]).close();
    expect(faceArea(d)).toBeCloseTo(60, 9);
  });
});

describeOcctWasm('narrow features between samples', () => {
  // A degree-1 spline whose peak sits at parameter 0.05, between knots 0.049
  // and 0.051; uniform samples of the parameter all land on y = 0.
  it('bounds a narrow peak of a degree-1 spline', () => {
    const peak = drawPointsInterpolation(
      [
        [0, 0],
        [49, 0],
        [49, 1],
        [49, 0],
        [998, 0],
      ],
      { degMax: 1 }
    );
    const [[, yMin], [, yMax]] = peak.boundingBox.bounds;
    expect(yMin).toBeCloseTo(0, 12);
    expect(yMax).toBeCloseTo(1, 12);
  });

  it('lifts a trimmed spline without dropping a narrow peak', () => {
    const peak: BSpline2d = {
      __bk2d: 'bspline',
      poles: [
        [0, 0],
        [0.04, 0],
        [1 / 24, 1],
        [0.043, 0],
        [1, 0],
      ],
      knots: [0, 0.04, 1 / 24, 0.043, 1],
      multiplicities: [2, 1, 1, 1, 2],
      degree: 1,
      isPeriodic: false,
    };
    const curve = unwrap(trimCurve2d(createCurve2DHandle(peak), 0, 1));
    const edge = unwrap(liftCurve2dToPlane(curve, unwrap(createNamedPlane('XY'))));
    const length =
      0.04 + Math.hypot(1 / 24 - 0.04, 1) + Math.hypot(0.043 - 1 / 24, 1) + (1 - 0.043);
    expect(unwrap(measureLength(edge))).toBeCloseTo(length, 9);
  });

  // A C2 cubic whose bump lives on four clustered knot spans in [0.5, 0.504].
  it('offsets a narrow bump of a cubic spline', () => {
    const bump: BSpline2d = {
      __bk2d: 'bspline',
      poles: [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 5],
        [5, 0],
        [6, 0],
        [7, 0],
        [8, 0],
      ],
      knots: [0, 0.5, 0.501, 0.502, 0.503, 0.504, 1],
      multiplicities: [4, 1, 1, 1, 1, 1, 4],
      degree: 3,
      isPeriodic: false,
    };
    const top = (c: Curve2dObj) => {
      const box = createBBox2d();
      addCurveToBBox(box, c, 0);
      return box.yMax;
    };
    // The offset runs right of travel, so 0.01 below the cap of the bump.
    expect(top(offsetCurve2d(bump, 0.01))).toBeCloseTo(top(bump) - 0.01, 6);
    expect(top(bump)).toBeGreaterThan(0.5);
  });
});

describeOcctWasm('lifting without makeBSplineEdge', () => {
  // occt-wasm builds before 5.8 have no makeBSplineEdge, so the lift falls back
  // to interpolating samples merged with the curve's knots.
  it('lifts a spline whose knot lands on a uniform sample', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reach the adapter's raw occt-wasm kernel
    const raw = (getKernel() as any).k as Record<string, unknown>;
    raw['makeBSplineEdge'] = undefined;
    try {
      const line: BSpline2d = {
        __bk2d: 'bspline',
        poles: [
          [0, 0],
          [1, 0],
          [2, 0],
        ],
        knots: [0, 0.5, 1],
        multiplicities: [2, 1, 2],
        degree: 1,
        isPeriodic: false,
      };
      const edge = unwrap(
        liftCurve2dToPlane(createCurve2DHandle(line), unwrap(createNamedPlane('XY')))
      );
      expect(unwrap(measureLength(edge))).toBeCloseTo(2, 9);
    } finally {
      delete raw['makeBSplineEdge'];
    }
  });
});
