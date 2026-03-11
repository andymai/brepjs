/**
 * Benchmarks for brepkit-wasm extended capabilities (v1.0.5).
 *
 * Measures performance of newly wired methods: I/O formats, advanced modeling,
 * topology queries, NURBS operations, feature detection, and batch execution.
 *
 * Run with: BENCH_KERNELS=both npx vitest run benchmarks/brepkit-extended.bench.test.ts
 */

import { describe, it, beforeAll } from 'vitest';
import {
  box,
  sphere,
  cylinder,
  fuse,
  fillet,
  castShape,
  getEdges,
  getFaces,
  unwrap,
} from '../src/index.js';
import { getKernel, withKernel } from '../src/kernel/index.js';
import { initBothKernels, benchKernel, hasBrepkit } from './setup.js';
import { collectResults, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('brepkit extended benchmarks', () => {
  const results: BenchResult[] = [];

  // ---------------------------------------------------------------------------
  // I/O Formats
  // ---------------------------------------------------------------------------

  it('export3MF - box', async () => {
    if (!hasBrepkit()) return;
    const r = await benchKernel('brepkit', 'export3MF box(10,10,10)', () => {
      const b = box(10, 10, 10);
      getKernel().export3MF(b.wrapped, 0.1);
    });
    if (r) results.push(r);
  });

  it('exportGLB - box', async () => {
    if (!hasBrepkit()) return;
    const r = await benchKernel('brepkit', 'exportGLB box(10,10,10)', () => {
      const b = box(10, 10, 10);
      getKernel().exportGLB(b.wrapped, 0.1);
    });
    if (r) results.push(r);
  });

  it('exportOBJ - box', async () => {
    if (!hasBrepkit()) return;
    const r = await benchKernel('brepkit', 'exportOBJ box(10,10,10)', () => {
      const b = box(10, 10, 10);
      getKernel().exportOBJ(b.wrapped, 0.1);
    });
    if (r) results.push(r);
  });

  it('exportPLY - box', async () => {
    if (!hasBrepkit()) return;
    const r = await benchKernel('brepkit', 'exportPLY box(10,10,10)', () => {
      const b = box(10, 10, 10);
      getKernel().exportPLY(b.wrapped, 0.1);
    });
    if (r) results.push(r);
  });

  it('3MF round-trip - box', async () => {
    if (!hasBrepkit()) return;
    const r = await benchKernel('brepkit', '3MF round-trip box(10,10,10)', () => {
      const kernel = getKernel();
      const b = box(10, 10, 10);
      const data = kernel.export3MF(b.wrapped, 0.1);
      kernel.import3MF(data);
    });
    if (r) results.push(r);
  });

  // ---------------------------------------------------------------------------
  // Advanced Modeling
  // ---------------------------------------------------------------------------

  it('draft - box face', async () => {
    if (!hasBrepkit()) return;
    const r = await benchKernel('brepkit', 'draft box face 5°', () => {
      const kernel = getKernel();
      const b = box(10, 10, 10);
      const faces = kernel.iterShapes(b.wrapped, 'face');
      kernel.draft(b.wrapped, [faces[0]!], [0, 0, 1], [0, 0, 0], 5);
    });
    if (r) results.push(r);
  });

  it('defeature - filleted box', async () => {
    if (!hasBrepkit()) return;
    const r = await benchKernel('brepkit', 'defeature filleted box', () => {
      const kernel = getKernel();
      const b = box(20, 20, 20);
      const edges = kernel.iterShapes(b.wrapped, 'edge');
      const filleted = kernel.fillet(b.wrapped, [edges[0]!], 2);
      const faces = kernel.iterShapes(filleted, 'face');
      kernel.defeature(filleted, [faces[faces.length - 1]!]);
    });
    if (r) results.push(r);
  });

  // ---------------------------------------------------------------------------
  // Feature Detection
  // ---------------------------------------------------------------------------

  it('recognizeFeatures - box', async () => {
    if (!hasBrepkit()) return;
    const r = await benchKernel('brepkit', 'recognizeFeatures box', () => {
      const kernel = getKernel();
      const b = box(10, 10, 10);
      kernel.recognizeFeatures(b.wrapped, 0.1);
    });
    if (r) results.push(r);
  });

  it('detectSmallFeatures - filleted box', async () => {
    if (!hasBrepkit()) return;
    const r = await benchKernel('brepkit', 'detectSmallFeatures filleted box', () => {
      const kernel = getKernel();
      const b = box(20, 20, 20);
      const edges = kernel.iterShapes(b.wrapped, 'edge');
      const filleted = kernel.fillet(b.wrapped, [edges[0]!], 0.5);
      kernel.detectSmallFeatures(filleted, 5.0, 0.01);
    });
    if (r) results.push(r);
  });

  // ---------------------------------------------------------------------------
  // Topology Queries
  // ---------------------------------------------------------------------------

  it('edgeToFaceMap - box', async () => {
    if (!hasBrepkit()) return;
    const r = await benchKernel('brepkit', 'edgeToFaceMap box', () => {
      const kernel = getKernel();
      const b = box(10, 10, 10);
      kernel.edgeToFaceMap(b.wrapped);
    });
    if (r) results.push(r);
  });

  it('adjacentFaces - box', async () => {
    if (!hasBrepkit()) return;
    const r = await benchKernel('brepkit', 'adjacentFaces box face', () => {
      const kernel = getKernel();
      const b = box(10, 10, 10);
      const faces = kernel.iterShapes(b.wrapped, 'face');
      kernel.adjacentFaces(b.wrapped, faces[0]!);
    });
    if (r) results.push(r);
  });

  // ---------------------------------------------------------------------------
  // NURBS Operations
  // ---------------------------------------------------------------------------

  it('curveSplit - NURBS edge', async () => {
    if (!hasBrepkit()) return;
    const r = await benchKernel('brepkit', 'curveSplit NURBS edge', () => {
      const kernel = getKernel();
      const edge = kernel.interpolatePoints(
        [
          [0, 0, 0],
          [5, 5, 0],
          [10, 0, 0],
          [15, -5, 0],
          [20, 0, 0],
        ],
        { periodic: false }
      );
      const params = kernel.curveParameters(edge);
      const mid = (params[0] + params[1]) / 2;
      kernel.curveSplit(edge, mid);
    });
    if (r) results.push(r);
  });

  it('curveDegreeElevate - line edge', async () => {
    if (!hasBrepkit()) return;
    const r = await benchKernel('brepkit', 'curveDegreeElevate line→degree 3', () => {
      const kernel = getKernel();
      const edge = kernel.makeLineEdge([0, 0, 0], [10, 0, 0]);
      kernel.curveDegreeElevate(edge, 2);
    });
    if (r) results.push(r);
  });

  // ---------------------------------------------------------------------------
  // Validation / Repair
  // ---------------------------------------------------------------------------

  it('mergeCoincidentVertices - box', async () => {
    if (!hasBrepkit()) return;
    const r = await benchKernel('brepkit', 'mergeCoincidentVertices box', () => {
      const kernel = getKernel();
      const b = box(10, 10, 10);
      kernel.mergeCoincidentVertices(b.wrapped, 1e-6);
    });
    if (r) results.push(r);
  });

  it('fixFaceOrientations - box', async () => {
    if (!hasBrepkit()) return;
    const r = await benchKernel('brepkit', 'fixFaceOrientations box', () => {
      const kernel = getKernel();
      const b = box(10, 10, 10);
      kernel.fixFaceOrientations(b.wrapped);
    });
    if (r) results.push(r);
  });

  // ---------------------------------------------------------------------------
  // Classification
  // ---------------------------------------------------------------------------

  it('classifyPointRobust - 100 points in box', async () => {
    if (!hasBrepkit()) return;
    const r = await benchKernel('brepkit', 'classifyPointRobust 100 points', () => {
      const kernel = getKernel();
      const b = box(10, 10, 10);
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * 20 - 5;
        const y = Math.random() * 20 - 5;
        const z = Math.random() * 20 - 5;
        kernel.classifyPointRobust(b.wrapped, [x, y, z], 1e-6);
      }
    });
    if (r) results.push(r);
  });

  // ---------------------------------------------------------------------------
  // Batch Execution
  // ---------------------------------------------------------------------------

  it('executeBatch - 10 boxes', async () => {
    if (!hasBrepkit()) return;
    const r = await benchKernel('brepkit', 'executeBatch 10 boxes', () => {
      const kernel = getKernel();
      const ops = [];
      for (let i = 0; i < 10; i++) {
        ops.push({ op: 'makeBox', args: [10 + i, 10 + i, 10 + i] });
      }
      kernel.executeBatch(JSON.stringify({ ops }));
    });
    if (r) results.push(r);
  });

  // ---------------------------------------------------------------------------
  // Print results
  // ---------------------------------------------------------------------------

  it('prints results', () => {
    if (results.length > 0) {
      printResults(results);
    } else {
      console.log('\n  [brepkit extended] No results (brepkit kernel not loaded)');
    }
  });
});
