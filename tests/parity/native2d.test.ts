// @vitest-environment node
/**
 * Oracle for the manifold-NATIVE 2D construction path.
 *
 * Every shape here is built through brepjs's high-level drawing API
 * (`draw()`, `drawRoundedRectangle`, `drawPolysides`, `drawCircle`) → Blueprint
 * (Curve2D over the 2D kernel) → `sketchOnPlane` → `extrude`. On the manifold
 * kernel this now runs entirely on the native JS curve algebra (kernel2dNative):
 * lines/arcs/conics sampled to native profile edges, no OCCT round-trip. We
 * assert the manifold solid's volume matches the exact OCCT solid (the parity
 * goal) and report build timing.
 *
 *   npx vitest run tests/parity/native2d
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel, initOCCT } from '../setup.js';
import { getKernel, withKernel } from '@/kernel/index.js';
import { drawRoundedRectangle, drawPolysides, drawCircle } from '@/sketching/drawingFactories.js';
import { draw } from '@/sketching/drawingPen.js';
import { measureVolume } from '@/measurement/measureFns.js';
import { isOk, unwrap } from '@/result.js';

let haveManifold = false;
beforeAll(async () => {
  await initOCCT();
  try {
    await initKernel('manifold');
    getKernel('manifold');
    haveManifold = true;
  } catch {
    haveManifold = false;
  }
}, 60_000);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- probe the drawing/shape chain
function volumeOf(shape: any): number {
  const candidates = [shape, shape?.wrapped, shape?.wrapped?.wrapped].filter(Boolean);
  for (const c of candidates) {
    const r = measureVolume(c);
    if (isOk(r)) return unwrap(r);
  }
  throw new Error('could not measure volume');
}

const SHAPES: { name: string; build: () => unknown }[] = [
  {
    name: 'roundedRect 20×15 r2 (lines+tangentArcs)',
    build: () => drawRoundedRectangle(20, 15, 2),
  },
  { name: 'roundedRect 10×10 r4.9 (near-stadium)', build: () => drawRoundedRectangle(10, 10, 4.9) },
  { name: 'hexagon r10 (drawPolysides, lines)', build: () => drawPolysides(10, 6) },
  { name: 'octagon r8 (drawPolysides, lines)', build: () => drawPolysides(8, 8) },
  { name: 'circle r6 (drawCircle, conic)', build: () => drawCircle(6) },
  {
    name: 'L-shape (draw() pen, lines only)',
    build: () => draw([0, 0]).hLine(20).vLine(6).hLine(-12).vLine(10).hLine(-8).close(),
  },
  {
    name: 'rounded tab (draw() pen, lines + tangentArc)',
    build: () => draw([0, 0]).hLine(15).tangentArc(4, 4).vLine(6).hLine(-19).close(),
  },
];

describe('native 2D construction parity (manifold vs OCCT)', () => {
  it.each(SHAPES)('$name → extrude volume matches OCCT', ({ build }) => {
    if (!haveManifold) return;
    const run = (): number => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drawing API
      const sk = (build() as any).sketchOnPlane();
      return volumeOf(sk.extrude(5));
    };

    const occt = withKernel('occt', run);

    const t0 = performance.now();
    const man = withKernel('manifold', run);
    const ms = performance.now() - t0;

    // Relative parity: manifold meshes a polygon approximation of any conic, so
    // a tiny deficit is expected; lines are exact. 0.3% covers both.
    const relErr = Math.abs(man - occt) / Math.max(1, Math.abs(occt));
    // eslint-disable-next-line no-console -- oracle reporting
    console.log(
      `occt=${occt.toFixed(2)} manifold=${man.toFixed(2)} relErr=${(relErr * 100).toFixed(3)}% (${ms.toFixed(1)}ms)`
    );
    expect(man).toBeGreaterThan(0);
    expect(Number.isFinite(man)).toBe(true);
    expect(relErr).toBeLessThan(0.003);
  });
});
