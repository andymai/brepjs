/**
 * Blueprint -> Contour bridge — exact area oracles per curve branch (lines,
 * arcs, beziers, ellipses incl. closed-curve splitting), reversed-curve
 * handling, composition into Profile/Extrude, and pure-data guarantees.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from './setup.js';
import {
  blueprintToContour,
  roundedRectangleBlueprint,
  polysidesBlueprint,
  reverseCurve,
  isOk,
  unwrap,
  measureArea,
  measureVolume,
} from '@/index.js';
import Blueprint from '@/2d/blueprints/blueprint.js';
import { Curve2D } from '@/2d/lib/curve2D.js';
import { bezier2d, line2d, ellipse2d, bspline2d } from '@/2d/curve2dGeometryFns.js';
import { profile, extrude, Evaluator, toJSON, fromJSON } from '@/csg/index.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function area(s: AnyShape<Dimension>): number {
  return unwrap(measureArea(s));
}

const itBrep = it.skipIf(currentKernel === 'manifold');

function evalArea(c: ReturnType<typeof blueprintToContour>): number {
  using ev = new Evaluator();
  const r = ev.evaluate(profile(unwrap(c)));
  expect(isOk(r)).toBe(true);
  return area(unwrap(r));
}

/** Run `fn` against a blueprint, disposing its kernel curves afterwards. */
function withBlueprint(bp: Blueprint, fn: (bp: Blueprint) => void): void {
  try {
    fn(bp);
  } finally {
    bp.delete();
  }
}

function c2d(handle: { readonly raw: unknown }): Curve2D {
  return new Curve2D(handle.raw as ConstructorParameters<typeof Curve2D>[0]);
}

describe('blueprintToContour', () => {
  itBrep('rounded rectangle (lines + corner arcs) bridges with exact area', () => {
    withBlueprint(roundedRectangleBlueprint(40, 30, 5), (bp) => {
      const c = blueprintToContour(bp);
      expect(isOk(c)).toBe(true);
      // Pure data: the contour serializes through the csg envelope and
      // rebuilds to the identical content address (no kernel handles inside).
      const node = profile(unwrap(c));
      expect(unwrap(fromJSON(toJSON(node))).structuralHash).toBe(node.structuralHash);
      expect(evalArea(c)).toBeCloseTo(40 * 30 - (4 - Math.PI) * 25, 1);
    });
  });

  itBrep('regular polygon bridges with exact area', () => {
    withBlueprint(polysidesBlueprint(20, 6), (bp) => {
      const c = blueprintToContour(bp);
      expect(isOk(c)).toBe(true);
      expect(evalArea(c)).toBeCloseTo(0.5 * 6 * 400 * Math.sin((2 * Math.PI) / 6), 1);
    });
  });

  itBrep('bezier curves bridge with exact pole-area', () => {
    // Quadratic bezier arch over a straight chord: bulge = w * P / 3.
    const arch = c2d(
      unwrap(
        bezier2d([
          [0, 0],
          [20, 30],
          [40, 0],
        ])
      )
    );
    const base = c2d(unwrap(line2d([40, 0], [0, 0])));
    withBlueprint(new Blueprint([arch, base]), (bp) => {
      const c = blueprintToContour(bp);
      expect(isOk(c)).toBe(true);
      expect(evalArea(c)).toBeCloseTo((40 * 30) / 3, 1);
    });
  });

  itBrep('a closed ellipse splits into two halves with exact area', () => {
    withBlueprint(new Blueprint([c2d(unwrap(ellipse2d([0, 0], 30, 20)))]), (bp) => {
      const c = blueprintToContour(bp);
      expect(isOk(c)).toBe(true);
      expect(evalArea(c)).toBeCloseTo(Math.PI * 600, 1);
    });
  });

  itBrep('bspline curves approximate per curve and bridge faithfully', () => {
    // Closed bspline with control POLES on a circle of radius 20: the curve
    // lies inside the poles' convex hull, so its area sits strictly between a
    // loose inner bound and the circle area. All kernels agree on the bridged
    // area to 4 decimals, pinning the approximation chain rather than an
    // unavailable closed form.
    const r = 20;
    const n = 16;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= n; i++) {
      const t = (2 * Math.PI * i) / n;
      pts.push([r * Math.cos(t), r * Math.sin(t)]);
    }
    withBlueprint(new Blueprint([c2d(unwrap(bspline2d(pts)))]), (bp) => {
      const c = blueprintToContour(bp);
      expect(isOk(c)).toBe(true);
      const a = evalArea(c);
      expect(a).toBeGreaterThan(1100);
      expect(a).toBeLessThan(Math.PI * r * r);
    });
  });

  itBrep('a reversed mid-chain bspline bridges to the same area as forward', () => {
    const splinePts: Array<[number, number]> = [
      [10, 0],
      [15, 10],
      [25, 10],
      [30, 0],
    ];
    const outline = (spline: Curve2D): Curve2D[] => [
      c2d(unwrap(line2d([0, 0], [10, 0]))),
      spline,
      c2d(unwrap(line2d([30, 0], [40, 0]))),
      c2d(unwrap(line2d([40, 0], [40, 20]))),
      c2d(unwrap(line2d([40, 20], [0, 20]))),
      c2d(unwrap(line2d([0, 20], [0, 0]))),
    ];
    let forwardArea = 0;
    withBlueprint(new Blueprint(outline(c2d(unwrap(bspline2d(splinePts))))), (bp) => {
      const c = blueprintToContour(bp);
      expect(isOk(c)).toBe(true);
      forwardArea = evalArea(c);
    });
    // Same outline with the bspline stored REVERSED: its approximation pieces
    // arrive in anti-path order and must be re-chained.
    withBlueprint(new Blueprint(outline(reverseCurve(c2d(unwrap(bspline2d(splinePts)))))), (bp) => {
      const c = blueprintToContour(bp);
      expect(isOk(c)).toBe(true);
      expect(evalArea(c)).toBeCloseTo(forwardArea, 3);
    });
  });

  itBrep('bridged contour composes into profile + extrude', () => {
    withBlueprint(roundedRectangleBlueprint(40, 30, 5), (bp) => {
      using ev = new Evaluator();
      const c = blueprintToContour(bp);
      const r = ev.evaluate(extrude(profile(unwrap(c)), [0, 0, 10]));
      expect(isOk(r)).toBe(true);
      expect(unwrap(measureVolume(unwrap(r)))).toBeCloseTo((40 * 30 - (4 - Math.PI) * 25) * 10, 0);
    });
  });
});
