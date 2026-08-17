/**
 * Path node — golden wire lengths for every segment kind, transform
 * composition, parametric cache reuse, serialization round-trip, optimizer
 * folding, builder immutability, and error paths.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from '../setup.js';
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
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function len(s: AnyShape<Dimension>): number {
  return unwrap(measureLength(s));
}

// The manifold preview kernel is mesh-CSG only; B-rep wires are out of its
// scope (same divergence class as the other feature-node tests).
const itBrep = it.skipIf(currentKernel === 'manifold');

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
