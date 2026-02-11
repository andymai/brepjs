/**
 * Benchmark test for spiral staircase generation.
 * Profiles each phase of the staircase build with comparative before/after timings.
 */
/* eslint-disable no-console -- benchmark output */
import { describe, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
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

describe('staircase benchmark', () => {
  beforeAll(async () => {
    await initOC();
  });

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
        around: [0, 0, 0],
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

  it('compares boolean strategies: sequential vs fuseAll', () => {
    const timings: Record<string, number> = {};

    // Build parts once
    const { column, bottomLanding, transformedPieces } = buildParts();

    // --- Sequential fuse (BEFORE) ---
    let t0 = performance.now();
    let staircaseSeq = shape(column).fuse(bottomLanding).val;
    for (let i = 0; i < stepCount; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      staircaseSeq = shape(staircaseSeq).fuse(transformedPieces[i]!).val;
    }
    timings['sequential .fuse() chain'] = performance.now() - t0;

    // --- fuseAll native (AFTER) ---
    const parts2 = buildParts();
    t0 = performance.now();
    const nativeResult = fuseAll(
      [parts2.column, parts2.bottomLanding, ...parts2.transformedPieces],
      { strategy: 'native' }
    );
    if (!nativeResult.ok) throw new Error('fuseAll native failed');
    timings['fuseAll({ strategy: "native" })'] = performance.now() - t0;

    // --- fuseAll pairwise (AFTER) ---
    const parts3 = buildParts();
    t0 = performance.now();
    const pairwiseResult = fuseAll(
      [parts3.column, parts3.bottomLanding, ...parts3.transformedPieces],
      { strategy: 'pairwise' }
    );
    if (!pairwiseResult.ok) throw new Error('fuseAll pairwise failed');
    timings['fuseAll({ strategy: "pairwise" })'] = performance.now() - t0;

    // --- chain .fuseAll() (AFTER) ---
    const parts4 = buildParts();
    t0 = performance.now();
    const _chainResult = shape(parts4.column).fuseAll([
      parts4.bottomLanding,
      ...parts4.transformedPieces,
    ]).val;
    timings['shape().fuseAll([...])'] = performance.now() - t0;

    printTable('Boolean Operation Comparison', timings);
    const seqTime = timings['sequential .fuse() chain'];
    const natTime = timings['fuseAll({ strategy: "native" })'];
    console.log(
      `\nSpeedup: sequential → fuseAll native = ${(seqTime / natTime).toFixed(1)}x faster\n`
    );
  });

  it('compares sweep strategies: MakePipeShell vs simple pipe vs tuned', () => {
    const timings: Record<string, number> = {};
    const { railProfile, helixSpine } = buildSweepInputs();

    // --- MakePipeShell + frenet (BEFORE) ---
    let t0 = performance.now();
    let handrailShell: Shape3D | undefined;
    try {
      const result = sweep(railProfile, helixSpine, { frenet: true });
      if (result.ok) handrailShell = result.value as Shape3D;
    } catch {
      /* sweep may fail */
    }
    timings['MakePipeShell + frenet: true'] = performance.now() - t0;

    // --- MakePipeShell no frenet (intermediate) ---
    t0 = performance.now();
    let handrailNoFrenet: Shape3D | undefined;
    try {
      const result = sweep(railProfile, helixSpine);
      if (result.ok) handrailNoFrenet = result.value as Shape3D;
    } catch {
      /* sweep may fail */
    }
    timings['MakePipeShell (no frenet)'] = performance.now() - t0;

    // --- MakePipeShell tuned tolerances (AFTER) ---
    t0 = performance.now();
    let handrailTuned: Shape3D | undefined;
    try {
      const result = sweep(railProfile, helixSpine, {
        tolerance: 0.01,
        maxDegree: 5,
        maxSegments: 100,
      });
      if (result.ok) handrailTuned = result.value as Shape3D;
    } catch {
      /* sweep may fail */
    }
    timings['MakePipeShell (tuned tol/deg/seg)'] = performance.now() - t0;

    // --- Simple pipe (AFTER) ---
    t0 = performance.now();
    let handrailSimple: Shape3D | undefined;
    try {
      const result = sweep(railProfile, helixSpine, { mode: 'simple' });
      if (result.ok) {
        handrailSimple = result.value as Shape3D;
        console.log('Simple pipe shape:', describeShape(handrailSimple));
      }
    } catch {
      /* sweep may fail */
    }
    timings['BRepOffsetAPI_MakePipe (simple)'] = performance.now() - t0;

    printTable('Sweep Operation Comparison', timings);

    const shellTime = timings['MakePipeShell + frenet: true'];
    for (const [label, time] of Object.entries(timings)) {
      if (label !== 'MakePipeShell + frenet: true' && time > 0) {
        console.log(`  ${label}: ${(shellTime / time).toFixed(1)}x vs frenet`);
      }
    }

    console.log('\nHandrail results:');
    console.log(`  MakePipeShell+frenet:    ${handrailShell ? 'OK' : 'FAILED'}`);
    console.log(`  MakePipeShell no frenet: ${handrailNoFrenet ? 'OK' : 'FAILED'}`);
    console.log(`  Tuned MakePipeShell:     ${handrailTuned ? 'OK' : 'FAILED'}`);
    console.log(`  Simple pipe:             ${handrailSimple ? 'OK' : 'FAILED'}`);
    console.log('');
  });

  it('full staircase end-to-end (optimized vs original)', () => {
    const timings: Record<string, number> = {};

    // ── ORIGINAL APPROACH ──
    const origStart = performance.now();
    {
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
        { around: [0, 0, 0], axis: [0, 0, 1] }
      );
      staircase = shape(staircase).fuse(end2).val;

      mesh(staircase, { tolerance: 2, angularTolerance: 1.5 });
      meshEdges(staircase, { tolerance: 2, angularTolerance: 1.5 });
    }
    timings['ORIGINAL (sequential fuse)'] = performance.now() - origStart;

    // ── OPTIMIZED APPROACH ──
    const optStart = performance.now();
    {
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
        { around: [0, 0, 0], axis: [0, 0, 1] }
      );

      const allParts: Shape3D[] = [column, bottomLanding, ...transformedPieces, end1, end2];
      if (handrail) allParts.push(handrail);

      const fuseResult = fuseAll(allParts, { strategy: 'native' });
      if (!fuseResult.ok) throw new Error('fuseAll failed');
      const staircase = fuseResult.value;

      mesh(staircase, { tolerance: 2, angularTolerance: 1.5 });
      meshEdges(staircase, { tolerance: 2, angularTolerance: 1.5 });
    }
    timings['OPTIMIZED (fuseAll native)'] = performance.now() - optStart;

    printTable('Full Staircase: Original vs Optimized', timings);
    const orig = timings['ORIGINAL (sequential fuse)'];
    const opt = timings['OPTIMIZED (fuseAll native)'];
    console.log(`\nSpeedup: ${(orig / opt).toFixed(1)}x faster\n`);
  });
});

function printTable(title: string, timings: Record<string, number>) {
  const maxLabel = Math.max(...Object.keys(timings).map((k) => k.length), title.length);
  const width = maxLabel + 2;
  const line = '─'.repeat(width);

  console.log(`\n┌─${line}─┬────────────┐`);
  console.log(`│ ${title.padEnd(width)} │   Time (s) │`);
  console.log(`├─${line}─┼────────────┤`);
  for (const [phase, ms] of Object.entries(timings)) {
    const label = phase.padEnd(width);
    const time = (ms / 1000).toFixed(3).padStart(10);
    console.log(`│ ${label} │ ${time} │`);
  }
  console.log(`└─${line}─┴────────────┘`);
}
