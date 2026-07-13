/**
 * Regression tests for gh #1755 — completing the castResultShape /
 * disposeResultShape migration across the remaining topology/operations ops.
 *
 * Before the fix each of these ops cast a fresh kernel result with the raw
 * castShape(), orphaning the pre-downcast handle on occt-wasm (a handle's own
 * delete() is a no-op there), and several reject branches dropped the cast
 * result entirely. Two kinds of assertion:
 *  - Correctness: each op still produces valid geometry — proving the added
 *    disposals release only owned temporaries, never a shape still in use.
 *  - occt-wasm arena: repeated calls do not grow the arena once results are
 *    released, proving the orphaned pre-downcast handles are reclaimed.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from './setup.js';
import {
  box,
  sphere,
  translate,
  getEdges,
  isOk,
  unwrap,
  measureVolume,
  measureArea,
  minkowski,
  polyhedron,
  interpolateCurve,
  approximateCurve,
  flipOrientation,
  surfaceFromGrid,
  hull,
  convexHull,
  linearPattern,
  circularPattern,
  gridPattern,
  positionOnCurve,
  section,
  split,
  booleanPipeline,
} from '@/index.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import type { Result } from '@/core/result.js';
import { getKernel } from '@/kernel/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

/** Reach occt-wasm's live-shape counter, or undefined on other kernels. */
function occtWasmShapeCount(): number | undefined {
  const adapter = getKernel() as unknown as {
    k?: { getShapeCount?: () => number };
    retainedKernelOwner?: { getRawKernel?: () => { getShapeCount?: () => number } };
  };
  const raw = adapter.retainedKernelOwner?.getRawKernel?.() ?? adapter.k;
  return typeof raw?.getShapeCount === 'function' ? raw.getShapeCount() : undefined;
}

/** A tetrahedron for polyhedron(). */
const TETRA_POINTS: [number, number, number][] = [
  [0, 0, 0],
  [1, 0, 0],
  [0.5, Math.sqrt(3) / 2, 0],
  [0.5, Math.sqrt(3) / 6, Math.sqrt(6) / 3],
];
const TETRA_FACES = [
  [0, 2, 1],
  [0, 1, 3],
  [1, 2, 3],
  [0, 3, 2],
];

// These ops are occt-specific (interpolatePoints/section/minkowski require the
// occt kernel), and the source-orphan leak they fix is occt-wasm's arena; the
// universal disposeResultShape safety is covered by errorPathDisposal.test.ts.
describe.skipIf(currentKernel !== 'occt-wasm')(
  'migrated ops stay geometrically correct (#1755)',
  () => {
    it('minkowski sphere fast path grows the box', () => {
      const r = minkowski(box(4, 4, 4), sphere(1));
      expect(isOk(r)).toBe(true);
      expect(unwrap(measureVolume(unwrap(r)))).toBeGreaterThan(64);
    });

    it('minkowski general (hull) path produces a solid', () => {
      const r = minkowski(box(4, 4, 4), box(2, 2, 2));
      expect(isOk(r)).toBe(true);
      expect(unwrap(measureVolume(unwrap(r)))).toBeGreaterThan(0);
    });

    it('polyhedron builds a solid with positive volume', () => {
      const r = polyhedron(TETRA_POINTS, TETRA_FACES);
      expect(isOk(r)).toBe(true);
      expect(unwrap(measureVolume(unwrap(r)))).toBeGreaterThan(0.05);
    });

    it('interpolateCurve / approximateCurve build edges', () => {
      const pts: [number, number, number][] = [
        [0, 0, 0],
        [5, 2, 0],
        [10, 0, 0],
      ];
      expect(isOk(interpolateCurve(pts))).toBe(true);
      expect(isOk(approximateCurve(pts))).toBe(true);
    });

    it('flipOrientation returns an edge', () => {
      const edge = getEdges(box(10, 10, 10))[0];
      expect(edge).toBeDefined();
      if (edge) expect(flipOrientation(edge).disposed).toBe(false);
    });

    it('surfaceFromGrid builds a surface with positive area', () => {
      const r = surfaceFromGrid([
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0],
      ]);
      expect(isOk(r)).toBe(true);
      expect(unwrap(measureArea(unwrap(r)))).toBeGreaterThan(0);
    });

    it('hull / convexHull produce solids', () => {
      const h = hull([box(4, 4, 4), translate(box(4, 4, 4), [6, 0, 0])]);
      expect(isOk(h)).toBe(true);
      expect(unwrap(measureVolume(unwrap(h)))).toBeGreaterThan(0);

      const ch = convexHull([
        [0, 0, 0],
        [10, 0, 0],
        [0, 10, 0],
        [0, 0, 10],
        [5, 5, 5],
      ]);
      expect(isOk(ch)).toBe(true);
      expect(unwrap(measureVolume(unwrap(ch)))).toBeGreaterThan(0);
    });

    it('linear / circular / grid patterns fuse copies', () => {
      const lp = linearPattern(box(2, 2, 2), [1, 0, 0], 3, 5);
      expect(isOk(lp)).toBe(true);
      expect(unwrap(measureVolume(unwrap(lp)))).toBeCloseTo(24, 3);

      const cp = circularPattern(translate(box(1, 1, 1), [5, 0, 0]), [0, 0, 1], 4);
      expect(isOk(cp)).toBe(true);
      expect(unwrap(measureVolume(unwrap(cp)))).toBeCloseTo(4, 3);

      const gp = gridPattern(box(1, 1, 1), [1, 0, 0], [0, 1, 0], 2, 2, 5, 5);
      expect(isOk(gp)).toBe(true);
      expect(unwrap(measureVolume(unwrap(gp)))).toBeCloseTo(4, 3);
    });

    it('positionOnCurve repositions a shape along a spine', () => {
      const spine = unwrap(
        interpolateCurve([
          [0, 0, 0],
          [0, 0, 5],
          [0, 0, 10],
        ])
      );
      const r = positionOnCurve(box(1, 1, 1), spine, 0.5);
      expect(isOk(r)).toBe(true);
      expect(unwrap(measureVolume(unwrap(r)))).toBeCloseTo(1, 3);
    });

    it('section / split / booleanPipeline over a box', () => {
      expect(isOk(section(box(10, 10, 10), 'XY'))).toBe(true);

      const sp = split(box(10, 10, 10), [translate(box(20, 1, 20), [-5, 5, -5])]);
      expect(isOk(sp)).toBe(true);

      const bp = booleanPipeline(box(10, 10, 10), [
        { op: 'cut', tool: translate(box(4, 4, 4), [8, 3, 3]) },
        { op: 'fuse', tool: translate(box(4, 4, 4), [-2, 3, 3]) },
      ]);
      expect(isOk(bp)).toBe(true);
      expect(unwrap(measureVolume(unwrap(bp)))).toBeGreaterThan(0);
    });
  }
);

describe('migrated-op temporaries are reclaimed from the occt-wasm arena (#1755)', () => {
  it.skipIf(currentKernel !== 'occt-wasm')(
    'repeated migrated ops do not grow the arena once results are released',
    () => {
      if (occtWasmShapeCount() === undefined) return; // counter unavailable

      const dispose = (v: Result<AnyShape<Dimension>> | AnyShape<Dimension>): void => {
        const shape = isResult(v) ? (isOk(v) ? v.value : undefined) : v;
        if (shape) getKernel().dispose(shape.wrapped);
      };

      // Inputs are created once and reused, so the *only* fresh kernel handle
      // each op produces is its cast result. That isolates the pre-downcast
      // source orphan this migration fixes: ops that build additional internal
      // temporaries (hull/convexHull/polyhedron/patterns/minkowski/section) are
      // covered by the correctness suite above but excluded here, since their
      // out-of-scope intermediate leaks would swamp the signal.
      const edge = getEdges(box(10, 10, 10))[0];
      expect(edge).toBeDefined();
      if (!edge) return;
      const curvePts: [number, number, number][] = [
        [0, 0, 0],
        [5, 2, 0],
        [10, 0, 0],
      ];
      const grid = [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0],
      ];
      const splitBase = box(10, 10, 10);
      const splitTool = translate(box(20, 1, 20), [-5, 5, -5]);
      const pipeBase = box(10, 10, 10);
      const pipeTool = translate(box(4, 4, 4), [8, 3, 3]);
      const posShape = box(1, 1, 1);
      const posSpine = unwrap(
        interpolateCurve([
          [0, 0, 0],
          [0, 0, 5],
          [0, 0, 10],
        ])
      );

      const cycle = (): void => {
        dispose(flipOrientation(edge)); // curveFns reverseShape
        dispose(interpolateCurve(curvePts)); // curveFns interpolatePoints
        dispose(approximateCurve(curvePts)); // curveFns approximatePoints
        dispose(surfaceFromGrid(grid)); // surfaceFns
        dispose(split(splitBase, [splitTool])); // booleanFns split
        dispose(booleanPipeline(pipeBase, [{ op: 'cut', tool: pipeTool }])); // booleanFns pipeline
        dispose(positionOnCurve(posShape, posSpine, 0.5)); // positionFns
      };

      // Warm up one-time caches so the measured window is steady-state.
      cycle();

      const start = occtWasmShapeCount() ?? 0;
      const iterations = 15;
      for (let i = 0; i < iterations; i++) cycle();
      const growth = (occtWasmShapeCount() ?? 0) - start;

      // Before the fix each of the 7 ops orphaned its pre-downcast handle every
      // call — ~105 over the loop. With the fix, released results leave the
      // arena flat. Allow a tiny margin for lazily-populated caches.
      expect(growth).toBeLessThanOrEqual(7);
    }
  );
});

/** Narrow a value to a Result<T> by its discriminant. */
function isResult(v: unknown): v is Result<AnyShape<Dimension>> {
  return typeof v === 'object' && v !== null && 'ok' in v;
}
