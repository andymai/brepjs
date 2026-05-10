/**
 * CI performance regression gate — gridfinity-style bin benchmark.
 *
 * Exercises the workload from issue #740 (box + shell + sweep lip + fuse + mesh)
 * using OCCT-only for deterministic single-kernel results.
 *
 * Run: BENCH_KERNELS=occt npx vitest run benchmarks/regression.bench.test.ts
 */
import { describe, it, beforeAll } from 'vitest';
import {
  drawRoundedRectangle,
  draw,
  shell,
  fuse,
  mesh,
  unwrap,
  faceFinder,
} from '../src/index.js';
import { DisposalScope } from '../src/core/disposal.js';
import { initBenchKernels } from './setup.js';
import { bench, printResults, writeResultsJSON, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBenchKernels();
}, 30000);

describe('Regression benchmark — gridfinity bin', () => {
  const results: BenchResult[] = [];

  it('gridfinity bin: box + shell + sweep lip + fuse + mesh', async () => {
    const result = await bench(
      'gridfinity-bin-v2',
      () => {
        using _scope = new DisposalScope();
        const width = 42;
        const height = 42;
        const depth = 30;
        const cornerRadius = 2;
        const wallThickness = 1.5;
        const lipWidth = 2.5;
        const lipHeight = 4;

        // 1. Create a rounded box via sketch extrusion
        const boxSketch = drawRoundedRectangle(width, height, cornerRadius).sketchOnPlane('XY');
        const solid = _scope.register(boxSketch.extrude(depth));

        // 2. Shell it (remove top face) to create a hollow bin
        const topFace = unwrap(
          faceFinder().inDirection('Z').atDistance(depth, [0, 0, 0]).findUnique(solid)
        );
        const shelled = _scope.register(unwrap(shell(solid, [topFace], wallThickness)));

        // 3. Build stacking lip via sweepSketch with an L-shaped profile
        const lipPath = drawRoundedRectangle(width, height, cornerRadius).sketchOnPlane(
          'XY',
          depth
        );

        const lipped = _scope.register(lipPath.sweepSketch(
          (plane, origin) =>
            draw([0, 0])
              .lineTo([lipWidth, 0])
              .lineTo([lipWidth, lipHeight])
              .lineTo([0, lipHeight])
              .lineTo([0, 0])
              .close()
              .sketchOnPlane(plane, origin),
          { frenet: true }
        ));

        // 4. Fuse the lip onto the shelled box (lip sweeps inward after #753 fix)
        const combined = _scope.register(unwrap(fuse(shelled, lipped)));

        // 5. Mesh the result
        mesh(combined);
      },
      // Median-of-15 keeps a single outlier from skewing the result; observed
      // run-to-run variance on shared CI runners is ~9% with the previous
      // 5-iteration setup, which sat right under the 10% gate threshold.
      { warmup: 3, iterations: 15 }
    );

    results.push(result);
  });

  it('prints results', () => {
    printResults(results);
    writeResultsJSON(results);
  });
});
