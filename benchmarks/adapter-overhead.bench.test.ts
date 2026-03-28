/**
 * Adapter overhead phase-breakdown benchmarks.
 *
 * Decomposes kernel operations into phases:
 *   - dispatch: getKernel() + method lookup
 *   - wasm: raw kernel WASM call
 *   - typeCast: shapeType() + downcast() calls
 *   - wrap: handle creation + branding
 *
 * Runs all 3 kernels: occt, occt-wasm, brepkit.
 */
import { describe, it, beforeAll } from 'vitest';
import {
  getKernel,
  box,
  fuse,
  translate,
  cylinder,
  unwrap,
} from '../src/index.js';
import { castShape, isVertex, isEdge, isFace, isSolid } from '../src/core/shapeTypes.js';
import { createHandle } from '../src/core/disposal.js';
import { getCachedIsValid, getCachedSurfaceType } from '../src/topology/topologyQueryFns.js';
import { getFaces } from '../src/topology/shapeFns.js';
import { initBenchKernels, benchAll } from './setup.js';
import { bench, collectResults, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBenchKernels();
}, 60000);

// ---------------------------------------------------------------------------
// Phase-breakdown helpers
// ---------------------------------------------------------------------------

/** Time a function in microseconds (averaged over N iterations). */
function timeUs(fn: () => void, iterations: number): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return ((performance.now() - start) / iterations) * 1000; // ms → μs
}

interface PhaseBreakdown {
  dispatch: number; // μs
  wasm: number; // μs
  typeCast: number; // μs
  wrap: number; // μs
  total: number; // μs
}

function breakdownToAux(b: PhaseBreakdown): Record<string, unknown> {
  return {
    dispatch_us: b.dispatch.toFixed(1),
    wasm_us: b.wasm.toFixed(1),
    typeCast_us: b.typeCast.toFixed(1),
    wrap_us: b.wrap.toFixed(1),
    total_us: b.total.toFixed(1),
    overhead_pct: (((b.total - b.wasm) / b.total) * 100).toFixed(1),
  };
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe('Adapter overhead — phase breakdown', () => {
  const results: BenchResult[] = [];

  // ─── Phase 1: Dispatch cost ─────────────────────────────────────────

  it('getKernel() dispatch — 100k calls', async () => {
    collectResults(
      results,
      await benchAll(
        'getKernel() x100k',
        () => {
          for (let i = 0; i < 100_000; i++) {
            getKernel();
          }
        },
        { warmup: 3, iterations: 10 }
      )
    );
  });

  it('getKernel(id) dispatch — 100k calls', async () => {
    collectResults(
      results,
      await benchAll(
        'getKernel(id) x100k',
        () => {
          const id = getKernel().kernelId;
          for (let i = 0; i < 100_000; i++) {
            getKernel(id);
          }
        },
        { warmup: 3, iterations: 10 }
      )
    );
  });

  // ─── Phase 2: Type resolution WASM cost ────────────────────────────

  it('shapeType() — 10k calls per kernel', async () => {
    collectResults(
      results,
      await benchAll(
        'shapeType() x10k',
        () => {
          const b = box(10, 10, 10);
          const k = getKernel();
          for (let i = 0; i < 10_000; i++) {
            k.shapeType(b.wrapped);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  it('downcast() — 10k calls per kernel', async () => {
    collectResults(
      results,
      await benchAll(
        'downcast(solid) x10k',
        () => {
          const b = box(10, 10, 10);
          const k = getKernel();
          for (let i = 0; i < 10_000; i++) {
            k.downcast(b.wrapped, 'solid');
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  it('shapeType() + downcast() combined — 10k (castShape cost)', async () => {
    collectResults(
      results,
      await benchAll(
        'shapeType+downcast x10k',
        () => {
          const b = box(10, 10, 10);
          const k = getKernel();
          for (let i = 0; i < 10_000; i++) {
            const st = k.shapeType(b.wrapped);
            k.downcast(b.wrapped, st);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  // ─── Phase 3: Type guard overhead ──────────────────────────────────

  it('cascading type guards — 1k shapes', async () => {
    collectResults(
      results,
      await benchAll(
        'type guard chain x1k',
        () => {
          const solid = box(10, 10, 10);
          for (let i = 0; i < 1_000; i++) {
            if (isVertex(solid)) {
              /* */
            } else if (isEdge(solid)) {
              /* */
            } else if (isFace(solid)) {
              /* */
            } else if (isSolid(solid)) {
              /* */
            }
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  it('single type guard — 10k calls', async () => {
    collectResults(
      results,
      await benchAll(
        'isSolid() x10k',
        () => {
          const solid = box(10, 10, 10);
          for (let i = 0; i < 10_000; i++) {
            isSolid(solid);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  // ─── Phase 4: castShape full pipeline ──────────────────────────────

  it('castShape() — 10k calls per kernel', async () => {
    collectResults(
      results,
      await benchAll(
        'castShape() x10k',
        () => {
          const b = box(10, 10, 10);
          const raw = b.wrapped;
          for (let i = 0; i < 10_000; i++) {
            castShape(raw);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  it('castShape() + isSolid guard — 1k (real-world pattern)', async () => {
    collectResults(
      results,
      await benchAll(
        'castShape+isSolid x1k',
        () => {
          const b = box(10, 10, 10);
          const raw = b.wrapped;
          for (let i = 0; i < 1_000; i++) {
            const shape = castShape(raw);
            isSolid(shape); // redundant shapeType() call
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  // ─── Phase 5: Handle creation overhead ─────────────────────────────

  it('createHandle() wrapping — 10k', async () => {
    collectResults(
      results,
      await benchAll(
        'createHandle() x10k',
        () => {
          const b = box(10, 10, 10);
          const k = getKernel();
          for (let i = 0; i < 10_000; i++) {
            const dc = k.downcast(b.wrapped, 'solid');
            const h = createHandle(dc);
            h.delete();
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  // ─── Phase 6: Real-world bulk operations ───────────────────────────

  it('bulk boolean: fuse 10 boxes (end-to-end with casting)', async () => {
    collectResults(
      results,
      await benchAll(
        'fuse 10 boxes (e2e)',
        () => {
          let result = box(10, 10, 10);
          for (let i = 1; i < 10; i++) {
            result = unwrap(fuse(result, translate(box(10, 10, 10), [i * 8, 0, 0])));
          }
        },
        { warmup: 1, iterations: 3 }
      )
    );
  });

  it('bulk topology: extract faces + edges from fused solid', async () => {
    const b = box(10, 10, 10);
    const cyl = translate(cylinder(3, 10), [5, 5, 0]);
    const fused = unwrap(fuse(b, cyl));
    collectResults(
      results,
      await benchAll(
        'getFaces+getEdges on fused',
        () => {
          const k = getKernel();
          const faces = k.iterShapes(fused.wrapped, 'face');
          const edges = k.iterShapes(fused.wrapped, 'edge');
          // Cast each to branded type (the overhead we want to measure)
          for (const f of faces) castShape(f);
          for (const e of edges) castShape(e);
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  // ─── Phase 7: Cached isValid + surfaceType ──────────────────────────

  it('isValid() — 1k calls on same shape (cached)', async () => {
    collectResults(
      results,
      await benchAll(
        'isValid() x1k (cached)',
        () => {
          const solid = box(10, 10, 10);
          for (let i = 0; i < 1_000; i++) {
            getCachedIsValid(solid);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  it('isValid() — 1k calls uncached (raw kernel)', async () => {
    collectResults(
      results,
      await benchAll(
        'isValid() x1k (uncached)',
        () => {
          const solid = box(10, 10, 10);
          const k = getKernel();
          for (let i = 0; i < 1_000; i++) {
            k.isValid(solid.wrapped);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  it('surfaceType() — per-face on 10 boxes (cached vs uncached)', async () => {
    const shapes = Array.from({ length: 10 }, (_, i) =>
      translate(box(5 + i * 0.5, 5, 5), [i * 10, 0, 0])
    );

    // Cached: uses getCachedSurfaceType
    collectResults(
      results,
      await benchAll(
        'surfaceType cached (10 boxes x faces x2)',
        () => {
          for (const s of shapes) {
            const faces = getFaces(s);
            // Query twice per face to measure cache benefit
            for (const f of faces) {
              getCachedSurfaceType(f);
              getCachedSurfaceType(f);
            }
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );

    // Uncached: raw kernel.surfaceType()
    collectResults(
      results,
      await benchAll(
        'surfaceType uncached (10 boxes x faces x2)',
        () => {
          const k = getKernel();
          for (const s of shapes) {
            const faces = getFaces(s);
            for (const f of faces) {
              k.surfaceType(f.wrapped);
              k.surfaceType(f.wrapped);
            }
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  // ─── Phase 8: Decomposed phase timing ──────────────────────────────

  it('phase breakdown: boolean + cast (per-kernel)', async () => {
    for (const kernelId of ['occt', 'occt-wasm', 'brepkit'] as const) {
      let k;
      try {
        k = getKernel(kernelId);
      } catch {
        continue; // kernel not available
      }

      const N = 100;
      // Create shapes using the target kernel so handles are compatible
      const b1raw = k.makeBox(10, 10, 10);
      const b2raw = k.translate(k.makeBox(10, 10, 10), 8, 0, 0);

      // Phase: dispatch
      const dispatchUs = timeUs(() => {
        getKernel(kernelId);
      }, N * 100);

      // Phase: raw WASM fuse
      const wasmUs = timeUs(() => {
        const fused = k.fuse(b1raw, b2raw, {});
        fused?.delete?.();
      }, N);

      // Phase: shapeType + downcast (type casting)
      const typeCastUs = timeUs(() => {
        const st = k.shapeType(b1raw);
        k.downcast(b1raw, st);
      }, N);

      // Phase: handle wrapping
      const wrapUs = timeUs(() => {
        const h = createHandle(k.downcast(b1raw, 'solid'));
        h.delete();
      }, N);

      const breakdown: PhaseBreakdown = {
        dispatch: dispatchUs,
        wasm: wasmUs,
        typeCast: typeCastUs,
        wrap: wrapUs,
        total: dispatchUs + wasmUs + typeCastUs + wrapUs,
      };

      results.push({
        name: `[${kernelId}] phase breakdown (boolean+cast)`,
        kernel: kernelId,
        min: breakdown.total,
        median: breakdown.total,
        mean: breakdown.total,
        max: breakdown.total,
        stddev: 0,
        p95: breakdown.total,
        rme: 0,
        iterations: N,
        aux: breakdownToAux(breakdown),
      });
    }
  });

  // ─── Results ───────────────────────────────────────────────────────

  it('prints results', () => {
    printResults(results);

    // Print phase breakdowns separately
    const phaseResults = results.filter((r) => r.name.includes('phase breakdown'));
    if (phaseResults.length > 0) {
      console.log('\n--- Phase breakdown (μs per operation) ---');
      for (const r of phaseResults) {
        const a = r.aux as Record<string, string>;
        console.log(
          `  ${r.name}: dispatch=${a['dispatch_us']} wasm=${a['wasm_us']} ` +
            `typeCast=${a['typeCast_us']} wrap=${a['wrap_us']} | overhead=${a['overhead_pct']}%`
        );
      }
      console.log('');
    }
  });
});
