/**
 * Parity spec: curve construction and introspection.
 *
 * Reference values come from closed-form math — line length = |p2 - p1|,
 * circle length = 2πr, helix length = turns·√(C² + pitch²). Tests assert
 * mathematical truth so brepkit's polyline-approximation of circles
 * surfaces as a parity gap, not silently passes.
 *
 * Note: `curvePointAt(shape, position)` takes a normalized parameter in
 * [0, 1] across the curve's parameter range, **not** the kernel's raw
 * parameter. The 2π domain of a circle maps to position ∈ [0, 1).
 *
 * See `tests/parity/README.md` for the policy.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { initKernel } from '../setup.js';
import { NUM_RUNS, fcDim } from './helpers.js';
import {
  line,
  circle,
  ellipse,
  helix,
  threePointArc,
  curveStartPoint,
  curveEndPoint,
  curvePointAt,
  curveTangentAt,
  curveIsClosed,
  curveIsPeriodic,
  curvePeriod,
  measureLength,
  unwrap,
} from '@/index.js';
import type { Vec3 } from '@/core/types.js';
import { vecLen, vecSub } from './helpers.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

// ---------------------------------------------------------------------------
// Closed-form references — line
// ---------------------------------------------------------------------------

describe('SPEC: line length = |p2 - p1|', () => {
  it.each<[Vec3, Vec3, number]>([
    [[0, 0, 0], [1, 0, 0], 1],
    [[0, 0, 0], [3, 4, 0], 5],
    [[0, 0, 0], [1, 1, 1], Math.sqrt(3)],
    [[-5, -5, -5], [5, 5, 5], Math.sqrt(300)],
    [[10, 0, 0], [10, 10, 0], 10],
  ])('|line(%j, %j)| === %f', (from, to, expected) => {
    expect(unwrap(measureLength(line(from, to)))).toBeCloseTo(expected, 6);
  });
});

describe('SPEC: line start/end points equal construction args', () => {
  it('curveStartPoint(line(p, q)) === p', () => {
    const p: Vec3 = [1, 2, 3];
    const q: Vec3 = [4, 5, 6];
    const start = curveStartPoint(line(p, q));
    expect(start[0]).toBeCloseTo(p[0], 6);
    expect(start[1]).toBeCloseTo(p[1], 6);
    expect(start[2]).toBeCloseTo(p[2], 6);
  });

  it('curveEndPoint(line(p, q)) === q', () => {
    const p: Vec3 = [1, 2, 3];
    const q: Vec3 = [4, 5, 6];
    const end = curveEndPoint(line(p, q));
    expect(end[0]).toBeCloseTo(q[0], 6);
    expect(end[1]).toBeCloseTo(q[1], 6);
    expect(end[2]).toBeCloseTo(q[2], 6);
  });
});

describe('SPEC: line is open and non-periodic', () => {
  it('curveIsClosed(line) === false', () => {
    expect(curveIsClosed(line([0, 0, 0], [1, 0, 0]))).toBe(false);
  });
  it('curveIsPeriodic(line) === false', () => {
    expect(curveIsPeriodic(line([0, 0, 0], [1, 0, 0]))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Closed-form references — circle
// ---------------------------------------------------------------------------

describe('SPEC: circle circumference = 2π · r', () => {
  it.each([1, 2, 5, 10, 0.5, 100])('|circle(r=%f)| === 2π·r', (r) => {
    expect(unwrap(measureLength(circle(r)))).toBeCloseTo(2 * Math.PI * r, 4);
  });
});

describe('SPEC: circle is closed and periodic with period 2π', () => {
  it('curveIsClosed(circle) === true', () => {
    expect(curveIsClosed(circle(5))).toBe(true);
  });
  it('curveIsPeriodic(circle) === true', () => {
    expect(curveIsPeriodic(circle(5))).toBe(true);
  });
  it('curvePeriod(circle) === 2π', () => {
    expect(curvePeriod(circle(5))).toBeCloseTo(2 * Math.PI, 6);
  });
});

describe('SPEC: points on circle satisfy |p - center| = r', () => {
  it.each([1, 5, 10])('every sampled point on circle(r=%f) is at distance r from origin', (r) => {
    const c = circle(r);
    // Sample 16 evenly-spaced normalized positions; each maps to a kernel param.
    for (let i = 0; i < 16; i++) {
      const pos = i / 16;
      const p = curvePointAt(c, pos);
      expect(vecLen(p)).toBeCloseTo(r, 4);
    }
  });
});

// ---------------------------------------------------------------------------
// Closed-form references — ellipse
// ---------------------------------------------------------------------------

describe('SPEC: ellipse with majorRadius = minorRadius equals circle', () => {
  it.each([1, 2, 5])('|ellipse(r, r)| === 2π·r', (r) => {
    const e = unwrap(ellipse(r, r));
    expect(unwrap(measureLength(e))).toBeCloseTo(2 * Math.PI * r, 4);
  });
});

describe('SPEC: ellipse is closed and periodic with period 2π', () => {
  it('curveIsClosed(ellipse) === true', () => {
    expect(curveIsClosed(unwrap(ellipse(5, 3)))).toBe(true);
  });
  it('curveIsPeriodic(ellipse) === true', () => {
    expect(curveIsPeriodic(unwrap(ellipse(5, 3)))).toBe(true);
  });
  it('curvePeriod(ellipse) === 2π', () => {
    expect(curvePeriod(unwrap(ellipse(5, 3)))).toBeCloseTo(2 * Math.PI, 6);
  });
});

// ---------------------------------------------------------------------------
// Closed-form references — three-point arc
// ---------------------------------------------------------------------------

describe('SPEC: semicircular arc length = π · r', () => {
  // p1 = (r, 0, 0), p2 = (0, r, 0), p3 = (-r, 0, 0) → semicircle of radius r.
  it.each([1, 2, 5, 10])('|threePointArc| of semicircle radius %f === π·r', (r) => {
    const arc = threePointArc([r, 0, 0], [0, r, 0], [-r, 0, 0]);
    expect(unwrap(measureLength(arc))).toBeCloseTo(Math.PI * r, 4);
  });
});

// ---------------------------------------------------------------------------
// Closed-form references — helix
// ---------------------------------------------------------------------------

describe('SPEC: helix length = turns · √(circumference² + pitch²)', () => {
  it.each<[number, number, number]>([
    [1, 5, 1], // pitch=1, height=5, radius=1 → 5 turns of length √((2π)² + 1²)
    [2, 10, 2],
    [0.5, 4, 1],
    [3, 9, 2],
  ])('|helix(pitch=%f, height=%f, radius=%f)|', (pitch, height, radius) => {
    const turns = height / pitch;
    const C = 2 * Math.PI * radius;
    const expected = turns * Math.sqrt(C * C + pitch * pitch);
    const h = helix(pitch, height, radius);
    expect(unwrap(measureLength(h))).toBeCloseTo(expected, 2);
  });
});

// ---------------------------------------------------------------------------
// Algebraic invariants — line
// ---------------------------------------------------------------------------

// fast-check double arbitrary with NaN disabled.
const fcCoord = (): fc.Arbitrary<number> => fc.double({ min: -10, max: 10, noNaN: true });

describe('INVARIANT: line midpoint = (p + q) / 2', () => {
  it('curvePointAt(line, 0.5) bisects the segment', () => {
    fc.assert(
      fc.property(
        fc.tuple(fcCoord(), fcCoord(), fcCoord()),
        fc.tuple(fcCoord(), fcCoord(), fcCoord()),
        (p, q) => {
          // Guard before constructing the edge — measureLength throws on
          // zero-length lines and unwrap would propagate before fc.pre runs.
          fc.pre(vecLen(vecSub(p, q)) > 1e-3);
          const e = line(p, q);
          const mid = curvePointAt(e, 0.5);
          const expected: Vec3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
          const diff = vecLen(vecSub(mid, expected));
          expect(diff).toBeLessThan(1e-4);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: line tangent has unit length', () => {
  it('|tangent(line, anywhere)| === 1', () => {
    fc.assert(
      fc.property(
        fc.tuple(fcCoord(), fcCoord(), fcCoord()),
        fc.tuple(fcCoord(), fcCoord(), fcCoord()),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (p, q, position) => {
          fc.pre(vecLen(vecSub(p, q)) > 1e-3);
          const e = line(p, q);
          const t = curveTangentAt(e, position);
          expect(vecLen(t)).toBeCloseTo(1, 4);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});

// ---------------------------------------------------------------------------
// Algebraic invariants — circle
// ---------------------------------------------------------------------------

describe('INVARIANT: circle circumference is linear in radius', () => {
  it('|circle(λ·r)| === λ · |circle(r)|', () => {
    fc.assert(
      fc.property(fcDim(), fc.double({ min: 0.1, max: 10, noNaN: true }), (r, lambda) => {
        const base = unwrap(measureLength(circle(r)));
        const scaled = unwrap(measureLength(circle(r * lambda)));
        const expected = base * lambda;
        const relErr = Math.abs(scaled - expected) / Math.max(Math.abs(expected), 1e-9);
        // Looser bound than box volume (1e-6) — circles are tessellated by
        // many kernels including brepkit. OCCT clears 1e-4 comfortably.
        expect(relErr).toBeLessThan(1e-3);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: every point on a unit circle is at distance r from center', () => {
  it('|curvePointAt(circle(r), pos)| === r for all pos ∈ [0, 1]', () => {
    fc.assert(
      fc.property(fcDim(), fc.double({ min: 0, max: 1, noNaN: true }), (r, pos) => {
        const c = circle(r);
        const p = curvePointAt(c, pos);
        expect(vecLen(p)).toBeCloseTo(r, 3);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: circle tangent is perpendicular to position vector', () => {
  it('curveTangentAt(circle(r), pos) · curvePointAt(circle(r), pos) === 0', () => {
    fc.assert(
      fc.property(fcDim(), fc.double({ min: 0, max: 1, noNaN: true }), (r, pos) => {
        const c = circle(r);
        const p = curvePointAt(c, pos);
        const tan = curveTangentAt(c, pos);
        const dot = p[0] * tan[0] + p[1] * tan[1] + p[2] * tan[2];
        const cosAngle = dot / (vecLen(p) * vecLen(tan));
        expect(Math.abs(cosAngle)).toBeLessThan(1e-3);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

// ---------------------------------------------------------------------------
// Algebraic invariants — helix
// ---------------------------------------------------------------------------

describe('INVARIANT: helix length is linear in turns', () => {
  it('|helix(pitch, n·pitch, r)| === n · |helix(pitch, pitch, r)|', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 5, noNaN: true }), // pitch
        fc.double({ min: 0.5, max: 5, noNaN: true }), // radius
        fc.integer({ min: 2, max: 8 }), // turns
        (pitch, radius, turns) => {
          const single = unwrap(measureLength(helix(pitch, pitch, radius)));
          const multi = unwrap(measureLength(helix(pitch, turns * pitch, radius)));
          const expected = single * turns;
          const relErr = Math.abs(multi - expected) / Math.max(Math.abs(expected), 1e-9);
          // 1% relative — helix tessellation is more aggressive than circles.
          expect(relErr).toBeLessThan(1e-2);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
