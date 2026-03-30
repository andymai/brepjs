/**
 * 2D geometry benchmarks — compares native OCCT 2D (Geom2d) vs pure-TS (geometry2d.ts).
 *
 * OCCT uses native C++ Geom2d classes. brepkit and occt-wasm use the shared
 * pure-TypeScript geometry2d.ts. This benchmark measures the performance
 * difference for common 2D operations.
 */
import { describe, it, beforeAll } from 'vitest';
import {
  line2d,
  circle2d,
  bezier2d,
  evaluateCurve2d,
  tangentCurve2d,
  translateCurve2d,
  rotateCurve2d,
  scaleCurve2d,
  intersectCurves2d,
  boundsCurve2d,
} from '../src/2d/curve2dGeometryFns.js';
import { unwrap } from '../src/core/result.js';
import { initBenchKernels, benchBoth } from './setup.js';
import { collectResults, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBenchKernels();
}, 30000);

describe('2D geometry benchmarks', () => {
  const results: BenchResult[] = [];

  // ── Curve construction ──

  it('makeLine2d x1000', async () => {
    collectResults(
      results,
      await benchBoth('makeLine2d x1000', () => {
        for (let i = 0; i < 1000; i++) {
          unwrap(line2d([0, 0], [10, i * 0.01]));
        }
      })
    );
  });

  it('makeCircle2d x1000', async () => {
    collectResults(
      results,
      await benchBoth('makeCircle2d x1000', () => {
        for (let i = 0; i < 1000; i++) {
          unwrap(circle2d([i * 0.1, 0], 5 + i * 0.001));
        }
      })
    );
  });

  it('makeBezier2d x1000', async () => {
    collectResults(
      results,
      await benchBoth('makeBezier2d x1000', () => {
        for (let i = 0; i < 1000; i++) {
          unwrap(
            bezier2d([
              [0, 0],
              [3, 5 + i * 0.001],
              [7, 3],
              [10, 0],
            ])
          );
        }
      })
    );
  });

  // ── Evaluation ──

  it('evaluateCurve2d (line) x10000', async () => {
    collectResults(
      results,
      await benchBoth('evaluate line x10k', () => {
        using ln = unwrap(line2d([0, 0], [10, 5]));
        const { first, last } = unwrap(boundsCurve2d(ln));
        const dt = (last - first) / 10000;
        for (let i = 0; i < 10000; i++) {
          unwrap(evaluateCurve2d(ln, first + i * dt));
        }
      })
    );
  });

  it('evaluateCurve2d (circle) x10000', async () => {
    collectResults(
      results,
      await benchBoth('evaluate circle x10k', () => {
        using circ = unwrap(circle2d([0, 0], 5));
        for (let i = 0; i < 10000; i++) {
          unwrap(evaluateCurve2d(circ, (i / 10000) * Math.PI * 2));
        }
      })
    );
  });

  it('evaluateCurve2d (bezier) x10000', async () => {
    collectResults(
      results,
      await benchBoth('evaluate bezier x10k', () => {
        using bez = unwrap(
          bezier2d([
            [0, 0],
            [3, 5],
            [7, 3],
            [10, 0],
          ])
        );
        for (let i = 0; i < 10000; i++) {
          unwrap(evaluateCurve2d(bez, i / 10000));
        }
      })
    );
  });

  // ── Tangent ──

  it('tangentCurve2d (line) x10000', async () => {
    collectResults(
      results,
      await benchBoth('tangent line x10k', () => {
        using ln = unwrap(line2d([0, 0], [10, 5]));
        const { first, last } = unwrap(boundsCurve2d(ln));
        const dt = (last - first) / 10000;
        for (let i = 0; i < 10000; i++) {
          unwrap(tangentCurve2d(ln, first + i * dt));
        }
      })
    );
  });

  // ── Transforms ──

  it('translateCurve2d x1000', async () => {
    collectResults(
      results,
      await benchBoth('translate x1k', () => {
        using ln = unwrap(line2d([0, 0], [10, 5]));
        for (let i = 0; i < 1000; i++) {
          unwrap(translateCurve2d(ln, i * 0.1, i * 0.1));
        }
      })
    );
  });

  it('rotateCurve2d x1000', async () => {
    collectResults(
      results,
      await benchBoth('rotate x1k', () => {
        using ln = unwrap(line2d([0, 0], [10, 5]));
        for (let i = 0; i < 1000; i++) {
          unwrap(rotateCurve2d(ln, (i / 1000) * Math.PI * 2));
        }
      })
    );
  });

  it('scaleCurve2d x1000', async () => {
    collectResults(
      results,
      await benchBoth('scale x1k', () => {
        using ln = unwrap(line2d([0, 0], [10, 5]));
        for (let i = 0; i < 1000; i++) {
          unwrap(scaleCurve2d(ln, 1 + i * 0.001));
        }
      })
    );
  });

  // ── Intersection ──

  it('intersectCurves2d (line-line) x100', async () => {
    collectResults(
      results,
      await benchBoth('intersect line-line x100', () => {
        using l1 = unwrap(line2d([0, 0], [10, 10]));
        using l2 = unwrap(line2d([0, 10], [10, 0]));
        for (let i = 0; i < 100; i++) {
          const result = unwrap(intersectCurves2d(l1, l2));
          result.segments.forEach((s) => s[Symbol.dispose]());
        }
      })
    );
  });

  it('intersectCurves2d (line-circle) x100', async () => {
    collectResults(
      results,
      await benchBoth('intersect line-circle x100', () => {
        using ln = unwrap(line2d([0, 0], [10, 0]));
        using circ = unwrap(circle2d([5, 0], 3));
        for (let i = 0; i < 100; i++) {
          const result = unwrap(intersectCurves2d(ln, circ));
          result.segments.forEach((s) => s[Symbol.dispose]());
        }
      })
    );
  });

  it('prints results', () => {
    printResults(results);
  });
});
