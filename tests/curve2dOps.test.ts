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
import { draw, measureArea, reverseCurve, unwrap } from '@/index.js';
import type { Drawing } from '@/index.js';
import { Curve2D } from '@/2d/lib/curve2D.js';
import {
  make2dBezierCurve,
  make2dEllipseArc,
  make2dSegmentCurve,
  make2dThreePointArc,
} from '@/2d/lib/makeCurves.js';
import {
  evaluateCurve2d,
  makeCircle2d,
  reverseCurve2d,
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
});
