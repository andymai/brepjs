/**
 * JS ↔ WASM bridge overhead benchmarks.
 *
 * Isolates the cost of crossing the JS/WASM boundary by comparing:
 *   - Per-call kernel method invocations vs batch equivalents
 *   - TypedArray allocation + data copy from WASM heap
 *   - Shape handle creation / disposal overhead
 *   - Mesh data transfer (isolated from triangulation)
 */
import { describe, it, beforeAll } from 'vitest';
import {
  box,
  cylinder,
  sphere,
  translate,
  fuse,
  mesh,
  meshEdges,
  getKernel,
  unwrap,
  measureVolume,
  measureArea,
  measureLength,
} from '../src/index.js';
import { getEdges, getFaces } from '../src/topology/shapeFns.js';
import { castShape } from '../src/core/shapeTypes.js';
import { initBothKernels, benchBoth } from './setup.js';
import { bench, collectResults, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('JS ↔ WASM bridge overhead', () => {
  const results: BenchResult[] = [];

  // ─── Per-call overhead: getKernel() method calls ───────────────────

  it('getKernel().shapeType() — 10k calls (minimal WASM round-trip)', async () => {
    const b = box(10, 10, 10);
    results.push(
      await bench(
        'shapeType() x10k',
        () => {
          const k = getKernel();
          for (let i = 0; i < 10_000; i++) {
            k.shapeType(b.wrapped);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  it('getKernel().boundingBox() — 1k calls (moderate data return)', async () => {
    const b = box(10, 10, 10);
    results.push(
      await bench(
        'boundingBox() x1k',
        () => {
          const k = getKernel();
          for (let i = 0; i < 1_000; i++) {
            k.boundingBox(b.wrapped);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  // ─── Batch vs per-item: topology iteration ─────────────────────────

  it('iterShapes per-face vs getKernel().iterShapes (batch)', async () => {
    const b = box(10, 10, 10);
    const cyl = translate(cylinder(3, 10), [5, 5, 0]);
    const fused = unwrap(fuse(b, cyl));

    // Per-face: iterate and call shapeType on each
    results.push(
      await bench(
        'per-face shapeType on fused',
        () => {
          const k = getKernel();
          const faces = k.iterShapes(fused.wrapped, 'face');
          for (const f of faces) {
            k.shapeType(f);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );

    // Batch: just iterate (the iteration itself crosses the bridge per item)
    results.push(
      await bench(
        'iterShapes("face") only on fused',
        () => {
          const k = getKernel();
          const faces = k.iterShapes(fused.wrapped, 'face');
          // Force iteration to complete
          let count = 0;
          for (const _f of faces) count++;
          void count;
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  // ─── Shape handle creation / disposal ──────────────────────────────

  it('box() creation + implicit disposal — 100 iterations', async () => {
    collectResults(
      results,
      await benchBoth(
        'box() x100 (create+dispose)',
        () => {
          for (let i = 0; i < 100; i++) {
            box(10, 10, 10);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  it('castShape() — 10k calls (handle wrapping overhead)', async () => {
    const b = box(10, 10, 10);
    const raw = b.wrapped;
    results.push(
      await bench(
        'castShape() x10k',
        () => {
          for (let i = 0; i < 10_000; i++) {
            castShape(raw);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  // ─── Mesh data transfer: triangulation vs extraction ───────────────

  it('mesh() full pipeline vs pre-triangulated re-extract', async () => {
    const s = sphere(10);
    // Prime triangulation
    mesh(s, { tolerance: 0.5, angularTolerance: 0.2 });

    // Cold mesh (includes triangulation)
    collectResults(
      results,
      await benchBoth(
        'mesh sphere cold (triangulate+extract)',
        () => {
          const fresh = sphere(10);
          mesh(fresh, { tolerance: 0.5, angularTolerance: 0.2 });
        },
        { warmup: 1, iterations: 5 }
      )
    );

    // Hot mesh (triangulation cached, only extraction)
    collectResults(
      results,
      await benchBoth(
        'mesh sphere hot (extract only)',
        () => {
          mesh(s, { tolerance: 0.5, angularTolerance: 0.2 });
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  // ─── Measurement: per-call vs batched ──────────────────────────────

  it('individual measurements vs batch on same shape', async () => {
    const shapes = Array.from({ length: 20 }, (_, i) =>
      translate(box(5 + i * 0.1, 5, 5), [i * 10, 0, 0])
    );

    // Per-shape: call volume + area individually
    collectResults(
      results,
      await benchBoth(
        'measureVolume+Area x20 (per-shape)',
        () => {
          for (const s of shapes) {
            measureVolume(s);
            measureArea(s);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  // ─── Edge iteration: high-count shapes ─────────────────────────────

  it('getEdges + getKernel().length — per-edge measurement', async () => {
    const b = box(10, 10, 10);
    const cyl = translate(cylinder(3, 10), [5, 5, 0]);
    const fused = unwrap(fuse(b, cyl));

    collectResults(
      results,
      await benchBoth(
        'getEdges + measureLength per edge',
        () => {
          const edges = getEdges(fused);
          for (const e of edges) {
            measureLength(e);
          }
        },
        { warmup: 2, iterations: 5 }
      )
    );
  });

  // ─── TypedArray overhead: mesh vertex data sizes ───────────────────

  it('mesh data sizes (aux metric — not timed)', async () => {
    const shapes = [
      { name: 'box', shape: box(10, 10, 10) },
      { name: 'sphere', shape: sphere(10) },
      { name: 'fused', shape: unwrap(fuse(box(10, 10, 10), translate(cylinder(3, 10), [5, 5, 0]))) },
    ];

    for (const { name, shape: s } of shapes) {
      const m = mesh(s, { tolerance: 0.5, angularTolerance: 0.2 });
      const em = meshEdges(s, { tolerance: 0.5, angularTolerance: 0.2 });
      results.push({
        name: `[data] ${name} mesh`,
        min: 0,
        median: 0,
        mean: 0,
        max: 0,
        stddev: 0,
        p95: 0,
        rme: 0,
        iterations: 1,
        aux: {
          vertices: m.vertices.length / 3,
          triangles: m.triangles.length / 3,
          vertexBytes: m.vertices.byteLength,
          normalBytes: m.normals.byteLength,
          triangleBytes: m.triangles.byteLength,
          totalMeshBytes: m.vertices.byteLength + m.normals.byteLength + m.triangles.byteLength,
          edgeLineVerts: em.lines.length / 3,
          edgeBytes: em.lines.byteLength,
        },
      });
    }
  });

  it('prints results', () => {
    printResults(results);

    // Print aux data separately
    const dataResults = results.filter((r) => r.name.startsWith('[data]'));
    if (dataResults.length > 0) {
      console.log('\n--- Mesh data transfer sizes ---');
      for (const r of dataResults) {
        const a = r.aux as Record<string, number>;
        console.log(
          `  ${r.name}: ${a.vertices} verts, ${a.triangles} tris, ` +
            `${(a.totalMeshBytes / 1024).toFixed(1)} KB mesh + ${(a.edgeBytes / 1024).toFixed(1)} KB edges`
        );
      }
      console.log('');
    }
  });
});
