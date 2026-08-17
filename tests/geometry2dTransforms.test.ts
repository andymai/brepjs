/**
 * Pure-TS geometry2d transform contract: transforming a curve must commute
 * with evaluation — evaluate(T(c), t) === T(evaluate(c, t)) for every t in
 * the parameter range. Trimmed circles are the hard case: the circle model
 * carries no frame angle, so rotations and mirrors must land in the trim
 * range instead of being silently dropped (the toSVGPathD reversed-arc bug).
 */

import { describe, expect, it } from 'vitest';
import {
  evaluateCurve2d,
  makeCircle2d,
  makeEllipse2d,
  makeLine2d,
  mirrorAtPoint,
  mirrorAcrossAxis,
  rotateCurve2d,
  type Curve2dObj,
} from '@/kernel/geometry2d.js';

type Pt = [number, number];

function trimmed(basis: Curve2dObj, tStart: number, tEnd: number): Curve2dObj {
  return { __bk2d: 'trimmed', basis, tStart, tEnd };
}

const SAMPLES = [0, 0.2, 0.5, 0.8, 1];

function expectCommutes(
  c: Curve2dObj,
  transform: (c: Curve2dObj) => Curve2dObj,
  mapPoint: (p: Pt) => Pt
): void {
  const tc = transform(c);
  for (const t of SAMPLES) {
    const [ex, ey] = mapPoint(evaluateCurve2d(c, t));
    const [ax, ay] = evaluateCurve2d(tc, t);
    expect(ax, `x at t=${t}`).toBeCloseTo(ex, 9);
    expect(ay, `y at t=${t}`).toBeCloseTo(ey, 9);
  }
}

const rotatePt =
  (angle: number, cx: number, cy: number) =>
  ([x, y]: Pt): Pt => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
  };

const reflectPt =
  (ox: number, oy: number, dx: number, dy: number) =>
  ([x, y]: Pt): Pt => {
    const len = Math.hypot(dx, dy);
    const nx = dx / len;
    const ny = dy / len;
    const rx = x - ox;
    const ry = y - oy;
    const dot = rx * nx + ry * ny;
    return [ox + 2 * dot * nx - rx, oy + 2 * dot * ny - ry];
  };

const pointReflect =
  (cx: number, cy: number) =>
  ([x, y]: Pt): Pt => [2 * cx - x, 2 * cy - y];

describe('rotateCurve2d', () => {
  it('rotates a trimmed circle arc about the circle center (not a no-op)', () => {
    const arc = trimmed(makeCircle2d(10, 5, 3), 0.3, 1.4);
    expectCommutes(arc, (c) => rotateCurve2d(c, Math.PI / 2, 10, 5), rotatePt(Math.PI / 2, 10, 5));
  });

  it('rotates a trimmed circle arc about an external point', () => {
    const arc = trimmed(makeCircle2d(-4, 2, 5), -0.5, 2.0);
    expectCommutes(arc, (c) => rotateCurve2d(c, 1.1, 7, -3), rotatePt(1.1, 7, -3));
  });

  it('rotates a clockwise (sense=false) trimmed circle arc', () => {
    const arc = trimmed(makeCircle2d(0, 0, 2, false), 0.2, 1.0);
    expectCommutes(arc, (c) => rotateCurve2d(c, 0.7, 1, 1), rotatePt(0.7, 1, 1));
  });
});

describe('mirrorAtPoint', () => {
  it('point-mirrors a trimmed circle arc exactly', () => {
    const arc = trimmed(makeCircle2d(-15, -10, 5), 0, 1);
    expectCommutes(arc, (c) => mirrorAtPoint(c, 0, 0), pointReflect(0, 0));
  });

  it('point-mirrors a trimmed ellipse arc exactly', () => {
    const arc = trimmed(makeEllipse2d(3, 2, 6, 2, 0.4), 0.1, 1.3);
    expectCommutes(arc, (c) => mirrorAtPoint(c, 1, -2), pointReflect(1, -2));
  });

  it('point-mirrors a line exactly', () => {
    const line = makeLine2d(1, 1, 5, 3);
    expectCommutes(line, (c) => mirrorAtPoint(c, 2, 2), pointReflect(2, 2));
  });
});

describe('mirrorAcrossAxis', () => {
  it('mirrors a trimmed circle arc across the x-axis (the SVG y-flip)', () => {
    const arc = trimmed(makeCircle2d(-15, 10, 5), 0.4, 1.9);
    expectCommutes(arc, (c) => mirrorAcrossAxis(c, 0, 0, 1, 0), reflectPt(0, 0, 1, 0));
  });

  it('mirrors a trimmed circle arc across a diagonal axis', () => {
    const arc = trimmed(makeCircle2d(4, 1, 2.5), -0.3, 1.1);
    expectCommutes(arc, (c) => mirrorAcrossAxis(c, 1, 2, 1, 1), reflectPt(1, 2, 1, 1));
  });

  it('mirrors a clockwise trimmed circle arc across a diagonal axis', () => {
    const arc = trimmed(makeCircle2d(0, 3, 4, false), 0.5, 2.2);
    expectCommutes(arc, (c) => mirrorAcrossAxis(c, -1, 0, 2, 1), reflectPt(-1, 0, 2, 1));
  });

  it('mirrors a trimmed ellipse arc across a diagonal axis', () => {
    const arc = trimmed(makeEllipse2d(2, -1, 5, 2, 0.9), 0.2, 1.5);
    expectCommutes(arc, (c) => mirrorAcrossAxis(c, 0, 1, 3, 2), reflectPt(0, 1, 3, 2));
  });
});
