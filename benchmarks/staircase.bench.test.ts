/**
 * Benchmark test for spiral staircase generation.
 * Profiles each phase of the staircase build with comparative before/after timings.
 */
/* eslint-disable no-console -- benchmark output */
import { describe, it, beforeAll } from 'vitest';
import { initBothKernels, benchBoth } from './setup.js';
import { bench, collectResults, printResults, type BenchResult } from './harness.js';
import {
  box,
  cylinder,
  sphere,
  shape,
  clone,
  rotate,
  translate,
  mesh,
  meshEdges,
  helix,
  circle,
  wire,
  unwrap,
  fuseAll,
  describe as describeShape,
} from '../src/index.js';
import type { Shape3D } from '../src/index.js';
import { sweep } from '../src/operations/extrudeFns.js';

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('staircase benchmark', () => {
  // Shared parameters
  const stepCount = 16;
  const stepRise = 18;
  const rotationPerStep = 22.5;
  const stepWidth = 70;
  const stepDepth = 25;
  const columnRadius = 12;
  const stepThickness = 4;
  const railHeight = 90;
  const railRadius = columnRadius + stepWidth - 4;
  const postRadius = 1.5;

  /** Build all staircase parts (primitives + transforms). */
  function buildParts() {
    const landingRadius = columnRadius + stepWidth;
    const bottomLanding = cylinder(landingRadius, stepThickness);
    const colHeight = stepCount * stepRise + stepThickness;
    const column = cylinder(columnRadius, colHeight);

    const transformedPieces: Shape3D[] = [];
    for (let i = 0; i < stepCount; i++) {
      const step = translate(box(columnRadius + stepWidth, stepDepth, stepThickness), [
        0,
        -stepDepth / 2,
        0,
      ]);
      const post = translate(cylinder(postRadius, railHeight), [railRadius, 0, stepThickness]);
      const piece = shape(step).fuse(post).val;
      const lifted = translate(piece, [0, 0, stepRise * (i + 1)]);
      const rotated = rotate(lifted, rotationPerStep * i, {
        at: [0, 0, 0],
        axis: [0, 0, 1],
      });
      transformedPieces.push(rotated);
    }
    return { column, bottomLanding, transformedPieces };
  }

  /** Build handrail sweep inputs. */
  function buildSweepInputs() {
    const firstPostTop = stepRise + stepThickness + railHeight;
    const helixPitch = stepCount * stepRise;
    const helixHeight = (stepCount - 1) * stepRise;
    const railProfileEdge = circle(2, {
      at: [railRadius, 0, firstPostTop],
      normal: [0, 1, 0],
    });
    const railProfile = unwrap(wire([railProfileEdge]));
    const helixSpine = helix(helixPitch, helixHeight, railRadius, {
      at: [0, 0, firstPostTop],
    });
    return { railProfile, helixSpine, firstPostTop };
  }

  it('compares boolean strategies: sequential vs fuseAll', async () => {
    const results: BenchResult[] = [];

    // --- Sequential fuse ---
    results.push(
      await bench('sequential .fuse() chain', () => {
        const { column, bottomLanding, transformedPieces } = buildParts();
        let staircaseSeq = shape(column).fuse(bottomLanding).val;
        for (let i = 0; i < stepCount; i++) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          staircaseSeq = shape(staircaseSeq).fuse(transformedPieces[i]!).val;
        }
      }, { warmup: 1, iterations: 3 })
    );

    // --- fuseAll native ---
    results.push(
      await bench('fuseAll({ strategy: "native" })', () => {
        const parts = buildParts();
        const nativeResult = fuseAll(
          [parts.column, parts.bottomLanding, ...parts.transformedPieces],
          { strategy: 'native' }
        );
        if (!nativeResult.ok) throw new Error('fuseAll native failed');
      }, { warmup: 1, iterations: 3 })
    );

    // --- fuseAll pairwise ---
    results.push(
      await bench('fuseAll({ strategy: "pairwise" })', () => {
        const parts = buildParts();
        const pairwiseResult = fuseAll(
          [parts.column, parts.bottomLanding, ...parts.transformedPieces],
          { strategy: 'pairwise' }
        );
        if (!pairwiseResult.ok) throw new Error('fuseAll pairwise failed');
      }, { warmup: 1, iterations: 3 })
    );

    // --- chain .fuseAll() ---
    results.push(
      await bench('shape().fuseAll([...])', () => {
        const parts = buildParts();
        const _chainResult = shape(parts.column).fuseAll([
          parts.bottomLanding,
          ...parts.transformedPieces,
        ]).val;
      }, { warmup: 1, iterations: 3 })
    );

    printResults(results);

    const seqTime = results[0]?.median ?? 0;
    const natTime = results[1]?.median ?? 1;
    console.log(
      `\nSpeedup: sequential -> fuseAll native = ${(seqTime / natTime).toFixed(1)}x faster\n`
    );
  });

  it('compares sweep strategies: MakePipeShell vs simple pipe vs tuned', async () => {
    const results: BenchResult[] = [];
    const sweepResults: Record<string, boolean> = {};

    // --- MakePipeShell + frenet ---
    results.push(
      await bench('MakePipeShell + frenet: true', () => {
        const { railProfile, helixSpine } = buildSweepInputs();
        try {
          const result = sweep(railProfile, helixSpine, { frenet: true });
          sweepResults['MakePipeShell+frenet'] = result.ok;
        } catch {
          sweepResults['MakePipeShell+frenet'] = false;
        }
      }, { warmup: 1, iterations: 3 })
    );

    // --- MakePipeShell no frenet ---
    results.push(
      await bench('MakePipeShell (no frenet)', () => {
        const { railProfile, helixSpine } = buildSweepInputs();
        try {
          const result = sweep(railProfile, helixSpine);
          sweepResults['MakePipeShell no frenet'] = result.ok;
        } catch {
          sweepResults['MakePipeShell no frenet'] = false;
        }
      }, { warmup: 1, iterations: 3 })
    );

    // --- MakePipeShell tuned tolerances ---
    results.push(
      await bench('MakePipeShell (tuned tol/deg/seg)', () => {
        const { railProfile, helixSpine } = buildSweepInputs();
        try {
          const result = sweep(railProfile, helixSpine, {
            tolerance: 0.01,
            maxDegree: 5,
            maxSegments: 100,
          });
          sweepResults['Tuned MakePipeShell'] = result.ok;
        } catch {
          sweepResults['Tuned MakePipeShell'] = false;
        }
      }, { warmup: 1, iterations: 3 })
    );

    // --- Simple pipe ---
    results.push(
      await bench('BRepOffsetAPI_MakePipe (simple)', () => {
        const { railProfile, helixSpine } = buildSweepInputs();
        try {
          const result = sweep(railProfile, helixSpine, { mode: 'simple' });
          sweepResults['Simple pipe'] = result.ok;
          if (result.ok) {
            console.log('Simple pipe shape:', describeShape(result.value as Shape3D));
          }
        } catch {
          sweepResults['Simple pipe'] = false;
        }
      }, { warmup: 1, iterations: 3 })
    );

    printResults(results);

    const frenetTime = results[0]?.median ?? 1;
    for (const r of results.slice(1)) {
      console.log(`  ${r.name}: ${(frenetTime / r.median).toFixed(1)}x vs frenet`);
    }

    console.log('\nHandrail results:');
    for (const [label, ok] of Object.entries(sweepResults)) {
      console.log(`  ${label}: ${ok ? 'OK' : 'FAILED'}`);
    }
    console.log('');
  });

  it('full staircase end-to-end (optimized vs original)', async () => {
    const results: BenchResult[] = [];

    // --- ORIGINAL APPROACH (OCCT-only, sequential fuse is too slow for dual-kernel) ---
    results.push(
      await bench('ORIGINAL (sequential fuse)', () => {
        const { column, bottomLanding, transformedPieces } = buildParts();
        const ball = sphere(4);
        const { railProfile, helixSpine, firstPostTop } = buildSweepInputs();

        let staircase = shape(column).fuse(bottomLanding).val;
        for (let i = 0; i < stepCount; i++) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          staircase = shape(staircase).fuse(transformedPieces[i]!).val;
        }

        try {
          const handrail = shape(railProfile).sweep(helixSpine, { frenet: true }).val;
          staircase = shape(staircase).fuse(handrail).val;
        } catch {
          /* skip */
        }

        const end1 = translate(ball, [railRadius, 0, firstPostTop]);
        staircase = shape(staircase).fuse(end1).val;
        const lastPostTop = firstPostTop + stepRise * (stepCount - 1);
        const end2 = rotate(
          translate(clone(ball), [railRadius, 0, lastPostTop]),
          rotationPerStep * (stepCount - 1),
          { at: [0, 0, 0], axis: [0, 0, 1] }
        );
        staircase = shape(staircase).fuse(end2).val;

        mesh(staircase, { tolerance: 2, angularTolerance: 1.5 });
        meshEdges(staircase, { tolerance: 2, angularTolerance: 1.5 });
      }, { warmup: 0, iterations: 2 })
    );

    // --- OPTIMIZED via dual-kernel ---
    const { occt, brepkit } = await benchBoth('OPTIMIZED (fuseAll native)', () => {
      const { column, bottomLanding, transformedPieces } = buildParts();
      const ball = sphere(4);
      const { railProfile, helixSpine, firstPostTop } = buildSweepInputs();

      let handrail: Shape3D | undefined;
      try {
        const result = sweep(railProfile, helixSpine, { frenet: true });
        if (result.ok) handrail = result.value as Shape3D;
      } catch {
        /* skip */
      }

      const end1 = translate(ball, [railRadius, 0, firstPostTop]);
      const lastPostTop = firstPostTop + stepRise * (stepCount - 1);
      const end2 = rotate(
        translate(clone(ball), [railRadius, 0, lastPostTop]),
        rotationPerStep * (stepCount - 1),
        { at: [0, 0, 0], axis: [0, 0, 1] }
      );

      const allParts: Shape3D[] = [column, bottomLanding, ...transformedPieces, end1, end2];
      if (handrail) allParts.push(handrail);

      const fuseResult = fuseAll(allParts, { strategy: 'native' });
      if (!fuseResult.ok) throw new Error('fuseAll failed');
      const staircase = fuseResult.value;

      mesh(staircase, { tolerance: 2, angularTolerance: 1.5 });
      meshEdges(staircase, { tolerance: 2, angularTolerance: 1.5 });
    }, { warmup: 0, iterations: 2 });
    collectResults(results, { occt, brepkit });

    printResults(results);

    const orig = results[0]?.median ?? 1;
    const opt = results[1]?.median ?? 1;
    console.log(`\nSpeedup: ${(orig / opt).toFixed(1)}x faster\n`);
  });
});
