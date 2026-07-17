/**
 * Metadata-propagation input face-hash collection.
 *
 * `collectInputFaceHashes` runs on the inputs of *every* WithHistory boolean /
 * transform / modifier / evolution op — it drives face-tag, color, and origin
 * propagation. Since #1846 it uses `subShapeHashes`, which on occt-wasm >= 3.7.0
 * reads all face hashes natively with no per-face handle. The pre-#1846 baseline
 * (`iterShapes` + `hashCode` + `dispose` per face) is kept inline here to track
 * the win and catch a regression back to per-face handle churn.
 *
 * The native speedup shows on occt-wasm (occt falls back to the same iterate-
 * and-release path, so OLD ~= NEW there):
 *   BENCH_KERNELS=occt-wasm npx vitest run benchmarks/metadata-propagation.bench.test.ts
 */
import { describe, it, beforeAll } from 'vitest';
import { box, cylinder, fuseAll, translate, getKernel, unwrap } from '../src/index.js';
import { collectInputFaceHashes } from '../src/topology/metadata/metadataPropagation.js';
import { setShapeOrigin } from '../src/topology/metadata/originTrackingFns.js';
import { HASH_CODE_MAX } from '../src/core/constants.js';
import type { AnyShape, Dimension } from '../src/core/shapeTypes.js';
import { initBenchKernels } from './setup.js';
import { bench, printResults, writeResultsJSON, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBenchKernels();
}, 30000);

/** Pre-#1846 implementation: one arena handle allocated + released per face. */
function collectInputFaceHashesOld(inputs: readonly AnyShape<Dimension>[]): number[] {
  const kernel = getKernel();
  const hashes: number[] = [];
  for (const input of inputs) {
    for (const face of kernel.iterShapes(input.wrapped, 'face')) {
      hashes.push(kernel.hashCode(face, HASH_CODE_MAX));
      kernel.dispose(face);
    }
  }
  return hashes;
}

describe('Metadata propagation — input face-hash collection', () => {
  const results: BenchResult[] = [];
  const CALLS = 2000; // per timed iteration; per-call cost = reported ms / CALLS

  const cases: { label: string; make: () => AnyShape<Dimension> }[] = [
    { label: 'cyl-3f', make: () => cylinder(5, 10) },
    { label: 'box-6f', make: () => box(10, 10, 10) },
    {
      label: 'fused-12-boxes-72f',
      make: () => {
        const parts = Array.from({ length: 12 }, (_, i) => {
          using b = box(3, 3, 3);
          return translate(b, [i * 4, 0, 0]);
        });
        const fused = unwrap(fuseAll(parts));
        for (const p of parts) p[Symbol.dispose]();
        return fused;
      },
    },
  ];

  for (const { label, make } of cases) {
    it(`${label}: subShapeHashes vs iterShapes loop`, async () => {
      using shape = make();
      setShapeOrigin(shape, 1); // arm the metadata guard so the collection iterates
      results.push(
        await bench(
          `metadata-collect NEW ${label} (x${CALLS})`,
          () => {
            for (let i = 0; i < CALLS; i++) collectInputFaceHashes([shape]);
          },
          { warmup: 8, iterations: 10 }
        )
      );
      results.push(
        await bench(
          `metadata-collect OLD ${label} (x${CALLS})`,
          () => {
            for (let i = 0; i < CALLS; i++) collectInputFaceHashesOld([shape]);
          },
          { warmup: 8, iterations: 10 }
        )
      );
    });
  }

  it('prints results', () => {
    printResults(results);
    writeResultsJSON(results);
  });
});
