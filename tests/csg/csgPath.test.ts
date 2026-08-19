/**
 * Path node — golden wire lengths for every segment kind, transform
 * composition, parametric cache reuse, serialization round-trip, optimizer
 * folding, builder immutability, and error paths.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from '../setup.js';
import { skipIfDiverges } from '../helpers/kernelDivergences.js';
import {
  path,
  lineTo,
  arcTo,
  bezierTo,
  ellipseArcTo,
  translate,
  param,
  optimize,
  outputKindOf,
  toJSON,
  fromJSON,
  Evaluator,
  add,
  numLit,
  type Segment2D,
} from '@/csg/index.js';
import { isOk, unwrap, measureLength } from '@/index.js';
import { curvePointAt, curveStartPoint, curveEndPoint } from '@/topology/curveFns.js';
import type { AnyShape, Dimension, Edge, Wire } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function len(s: AnyShape<Dimension>): number {
  return unwrap(measureLength(s));
}

// The manifold preview kernel is mesh-CSG only; B-rep wires are out of its
// scope (same divergence class as the other feature-node tests).
const itBrep = it.skipIf(currentKernel === 'manifold');

// Direction probes need faithful curvePointAt/locate on edges; the divergence
// registry ('csgPath.orientationProbes') skips them per kernel.

describe('Path node', () => {
  it('reports Wire output kind', () => {
    expect(outputKindOf(path([0, 0], [lineTo([10, 0])]))).toBe('Wire');
  });

  itBrep('polyline path has exact length', () => {
    using ev = new Evaluator();
    const node = path([0, 0], [lineTo([40, 0]), lineTo([40, 30]), lineTo([0, 30])]);
    const r = ev.evaluate(node);
    expect(isOk(r)).toBe(true);
    expect(len(unwrap(r))).toBeCloseTo(40 + 30 + 40, 1);
  });

  itBrep('circular arc segment has exact length (half circle)', () => {
    using ev = new Evaluator();
    const node = path([-10, 0], [arcTo([10, 0], 10)]);
    const r = ev.evaluate(node);
    expect(isOk(r)).toBe(true);
    expect(len(unwrap(r))).toBeCloseTo(Math.PI * 10, 1);
  });

  itBrep('stadium path: lines + half-circle caps, exact perimeter', () => {
    using ev = new Evaluator();
    const node = path(
      [0, 0],
      [lineTo([40, 0]), arcTo([40, 20], 10), lineTo([0, 20]), arcTo([0, 0], 10)]
    );
    const r = ev.evaluate(node);
    expect(isOk(r)).toBe(true);
    expect(len(unwrap(r))).toBeCloseTo(2 * 40 + 2 * Math.PI * 10, 1);
  });

  itBrep('ellipse-arc segment has the exact half-ellipse arc length', () => {
    using ev = new Evaluator();
    const a = 30;
    const b = 20;
    const node = path([a, 0], [ellipseArcTo([-a, 0], [a, b])]);
    const r = ev.evaluate(node);
    expect(isOk(r)).toBe(true);
    // Half-ellipse perimeter via numeric integration oracle.
    const steps = 100000;
    let arc = 0;
    for (let i = 0; i < steps; i++) {
      const t0 = (Math.PI * i) / steps;
      const t1 = (Math.PI * (i + 1)) / steps;
      arc += Math.hypot(a * (Math.cos(t1) - Math.cos(t0)), b * (Math.sin(t1) - Math.sin(t0)));
    }
    expect(len(unwrap(r))).toBeCloseTo(arc, 1);
  });

  it('ellipse-arc direction: side selection and parametric order per flags', (ctx) => {
    skipIfDiverges(ctx, 'csgPath.orientationProbes');
    using ev = new Evaluator();
    const cases = [
      // [radii, clockwise, expected midpoint y sign]
      { radii: [30, 20] as const, clockwise: false, midY: 20 },
      { radii: [30, 20] as const, clockwise: true, midY: -20 },
      // ry > rx exercises the major/minor axis swap
      { radii: [20, 30] as const, clockwise: false, midY: 30 },
      { radii: [20, 30] as const, clockwise: true, midY: -30 },
    ];
    for (const c of cases) {
      const rx = c.radii[0];
      const node = path([rx, 0], [ellipseArcTo([-rx, 0], c.radii, { clockwise: c.clockwise })]);
      const r = ev.evaluate(node);
      expect(isOk(r)).toBe(true);
      const wire = unwrap(r) as Edge | Wire;
      const mid = curvePointAt(wire, 0.5);
      expect(mid[1]).toBeCloseTo(c.midY, 1);
      // Parametric direction must follow path order: from -> to.
      const start = curveStartPoint(wire);
      const end = curveEndPoint(wire);
      expect(start[0]).toBeCloseTo(rx, 1);
      expect(end[0]).toBeCloseTo(-rx, 1);
    }
  });

  it('clockwise circular arc keeps path-order parametric direction', (ctx) => {
    skipIfDiverges(ctx, 'csgPath.orientationProbes');
    using ev = new Evaluator();
    // Clockwise from 9 o'clock (-10,0) to 3 o'clock (10,0) passes 12 o'clock.
    const node = path([-10, 0], [arcTo([10, 0], 10, { clockwise: true })]);
    const r = ev.evaluate(node);
    expect(isOk(r)).toBe(true);
    const wire = unwrap(r) as Edge | Wire;
    expect(curvePointAt(wire, 0.5)[1]).toBeCloseTo(10, 1);
    expect(curveStartPoint(wire)[0]).toBeCloseTo(-10, 1);
    expect(curveEndPoint(wire)[0]).toBeCloseTo(10, 1);
  });

  it('rotated ellipse-arc lands endpoints on the rotated frame', (ctx) => {
    skipIfDiverges(ctx, 'csgPath.orientationProbes');
    using ev = new Evaluator();
    // Half-ellipse (a=30, b=20) rotated 30 deg: endpoints on the rotated
    // major axis, on-arc midpoint at the rotated minor apex.
    const phi = Math.PI / 6;
    const a = 30;
    const b = 20;
    const p: [number, number] = [a * Math.cos(phi), a * Math.sin(phi)];
    const q: [number, number] = [-p[0], -p[1]];
    const node = path(p, [ellipseArcTo(q, [a, b], { rotation: 30 })]);
    const r = ev.evaluate(node);
    expect(isOk(r)).toBe(true);
    const wire = unwrap(r) as Edge | Wire;
    const start = curveStartPoint(wire);
    expect(start[0]).toBeCloseTo(p[0], 1);
    expect(start[1]).toBeCloseTo(p[1], 1);
    const mid = curvePointAt(wire, 0.5);
    expect(mid[0]).toBeCloseTo(-b * Math.sin(phi), 1);
    expect(mid[1]).toBeCloseTo(b * Math.cos(phi), 1);
  });

  itBrep('bezier segment evaluates and composes with transforms', () => {
    using ev = new Evaluator();
    const node = translate(path([0, 0], [bezierTo([[20, 30]], [40, 0])]), [0, 0, 50]);
    const r = ev.evaluate(node);
    expect(isOk(r)).toBe(true);
    expect(len(unwrap(r))).toBeGreaterThan(40);
  });

  itBrep('parametric endpoint: cache re-evaluates only the path', () => {
    using ev = new Evaluator();
    const inner = path([0, 0], [lineTo([param('w'), 0])]);
    const node = translate(inner, [5, 5, 5]);
    expect(len(unwrap(ev.evaluate(node, { w: 10 })))).toBeCloseTo(10, 1);
    const s1 = ev.cacheStats();
    expect(len(unwrap(ev.evaluate(node, { w: 25 })))).toBeCloseTo(25, 1);
    const s2 = ev.cacheStats();
    // Both the Path and the dependent Translate re-evaluate; nothing hits.
    expect(s2.misses - s1.misses).toBe(2);
    expect(s2.hits - s1.hits).toBe(0);
  });

  it('serialize round-trip preserves the structural hash for every segment kind', () => {
    const node = path(
      [0, 0],
      [
        lineTo([param('w'), 0]),
        arcTo([40, 20], add(param('r'), numLit(2)), { largeArc: true, clockwise: true }),
        bezierTo(
          [
            [10, 10],
            [20, 20],
          ],
          [0, 20]
        ),
        ellipseArcTo([0, 0], [30, 20], { rotation: 15, clockwise: true }),
      ]
    );
    const back = fromJSON(toJSON(node));
    expect(isOk(back)).toBe(true);
    expect(unwrap(back).structuralHash).toBe(node.structuralHash);
  });

  it('optimize() folds expressions inside segments', () => {
    const node = path([0, 0], [arcTo([40, 0], add(numLit(15), numLit(5)))]);
    const opt = optimize(node);
    expect(opt.kind).toBe('Path');
    expect(opt.structuralHash).toBe(path([0, 0], [arcTo([40, 0], 20)]).structuralHash);
  });

  it('copies the segments array at construction', () => {
    const segments: Segment2D[] = [lineTo([10, 0])];
    const node = path([0, 0], segments);
    segments.push(lineTo([20, 0]));
    expect(node.segments).toHaveLength(1);
    expect(node.structuralHash).toBe(path([0, 0], [lineTo([10, 0])]).structuralHash);
  });

  it('rejects an empty path with a Result error', () => {
    using ev = new Evaluator();
    expect(isOk(ev.evaluate(path([0, 0], [])))).toBe(false);
  });

  it('rejects an arc whose radius cannot span the chord', () => {
    using ev = new Evaluator();
    expect(isOk(ev.evaluate(path([0, 0], [arcTo([100, 0], 10)])))).toBe(false);
  });
});
