/**
 * V8 CPU profile of Blueprint boolean operations.
 *
 * Measures where time is spent during 2D boolean operations (fuse/cut/intersect)
 * to identify hot-path functions in vectorOperations.ts.
 *
 * Usage:
 *   npx tsx benchmarks/profile-blueprint-booleans.ts
 *
 * Outputs:
 *   - Console: timing data, micro-benchmarks, per-function CPU profile breakdown
 *   - File: benchmarks/results/blueprint-boolean-profile.cpuprofile (loadable in Chrome DevTools)
 *   - File: benchmarks/results/blueprint-boolean-profile.md (summary report)
 *
 * ADR-0006 context: identifies which vectorOperations functions are hot-path
 * candidates that should remain as direct TS calls rather than migrating to kernel.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Session } from 'node:inspector/promises';
import { fileURLToPath } from 'node:url';
import { initOC } from '../tests/setup.js';
import {
  drawRectangle,
  drawCircle,
  fuse2D,
  cut2D,
  intersect2D,
} from '../src/index.js';
import { BlueprintSketcher } from '../src/sketching/Sketcher2d.js';
import * as vecOps from '../src/2d/lib/vectorOperations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, 'results');

// ---------------------------------------------------------------------------
// Blueprint construction helpers
// ---------------------------------------------------------------------------

function simpleRectOverlap() {
  const a = drawRectangle(20, 20).blueprint;
  const b = drawRectangle(20, 20).blueprint.translate(5, 5);
  return { a, b };
}

function rectCircleOverlap() {
  const a = drawRectangle(20, 20).blueprint;
  const b = drawCircle(8).blueprint;
  return { a, b };
}

function twoCircles() {
  const a = drawCircle(10).blueprint;
  const b = drawCircle(10).blueprint.translate(10, 0);
  return { a, b };
}

function starShape() {
  const r1 = 20;
  const r2 = 8;
  const points = 8;
  let sk = new BlueprintSketcher([r1, 0]);
  for (let i = 1; i < points * 2; i++) {
    const angle = (i * Math.PI) / points;
    const r = i % 2 === 1 ? r2 : r1;
    sk = sk.lineTo([r * Math.cos(angle), r * Math.sin(angle)]);
  }
  return sk.close();
}

function complexScenario() {
  const star = starShape();
  const circles = [
    drawCircle(5).blueprint.translate(10, 0),
    drawCircle(5).blueprint.translate(-10, 0),
    drawCircle(5).blueprint.translate(0, 10),
    drawCircle(5).blueprint.translate(0, -10),
  ];
  return { star, circles };
}

// ---------------------------------------------------------------------------
// Timing harness
// ---------------------------------------------------------------------------

interface TimingResult {
  label: string;
  msPerOp: number;
  iterations: number;
  totalMs: number;
}

function timeIt(label: string, fn: () => void, iterations: number): TimingResult {
  for (let i = 0; i < 3; i++) fn(); // warmup

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  const perIter = elapsed / iterations;

  console.log(`  ${label}: ${perIter.toFixed(2)}ms/op (${iterations} iters, ${elapsed.toFixed(0)}ms total)`);
  return { label, msPerOp: perIter, iterations, totalMs: elapsed };
}

// ---------------------------------------------------------------------------
// CPU profile analysis
// ---------------------------------------------------------------------------

interface ProfileNode {
  id: number;
  callFrame: {
    functionName: string;
    scriptId: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
  hitCount: number;
  children?: number[];
}

interface CpuProfile {
  nodes: ProfileNode[];
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
}

/** Target functions from vectorOperations we want to find in the profile. */
const VECTOR_OPS_FUNCTIONS = new Set([
  'samePoint', 'add2d', 'subtract2d', 'scalarMultiply2d',
  'distance2d', 'squareDistance2d', 'crossProduct2d', 'dotProduct2d',
  'angle2d', 'polarAngle2d', 'normalize2d', 'rotate2d',
  'polarToCartesian', 'cartesianToPolar',
]);

/** Additional functions of interest in the boolean pipeline. */
const BOOLEAN_PIPELINE_FUNCTIONS = new Set([
  'booleanOperation', 'fuseBlueprints', 'cutBlueprints', 'intersectBlueprints',
  'findAllIntersections', 'removeNonCrossingPoints', 'selectSegments',
  'blueprintsIntersectionSegments', 'isInside',
  'hashPoint', 'removeDuplicatePoints', 'reprPnt',
  'findCurveIndexByStartPoint', 'rotateToStartAt',
  'intersectCurves2d', 'evaluateCurve2d',
]);

function analyzeProfile(profile: CpuProfile): {
  vectorOps: { name: string; selfTime: number; hitCount: number; pct: number }[];
  pipelineFns: { name: string; selfTime: number; hitCount: number; pct: number }[];
  topFunctions: { name: string; url: string; selfTime: number; hitCount: number; pct: number }[];
} {
  const totalDuration = profile.endTime - profile.startTime; // microseconds
  const nodeMap = new Map<number, ProfileNode>();
  for (const node of profile.nodes) {
    nodeMap.set(node.id, node);
  }

  // Calculate self-time per node from samples + timeDeltas
  const selfTimeMap = new Map<number, number>();
  for (let i = 0; i < profile.samples.length; i++) {
    const nodeId = profile.samples[i]!;
    const delta = profile.timeDeltas[i] ?? 0;
    selfTimeMap.set(nodeId, (selfTimeMap.get(nodeId) ?? 0) + delta);
  }

  // Build results
  const vectorOps: { name: string; selfTime: number; hitCount: number; pct: number }[] = [];
  const pipelineFns: { name: string; selfTime: number; hitCount: number; pct: number }[] = [];
  const allFunctions: { name: string; url: string; selfTime: number; hitCount: number; pct: number }[] = [];

  for (const node of profile.nodes) {
    const selfTime = selfTimeMap.get(node.id) ?? 0;
    if (selfTime === 0 && node.hitCount === 0) continue;

    const name = node.callFrame.functionName || '(anonymous)';
    const url = node.callFrame.url;
    const pct = totalDuration > 0 ? (selfTime / totalDuration) * 100 : 0;
    const entry = { name, url, selfTime, hitCount: node.hitCount, pct };

    allFunctions.push(entry);

    if (VECTOR_OPS_FUNCTIONS.has(name)) {
      vectorOps.push(entry);
    }
    if (BOOLEAN_PIPELINE_FUNCTIONS.has(name)) {
      pipelineFns.push(entry);
    }
  }

  vectorOps.sort((a, b) => b.selfTime - a.selfTime);
  pipelineFns.sort((a, b) => b.selfTime - a.selfTime);
  allFunctions.sort((a, b) => b.selfTime - a.selfTime);

  return {
    vectorOps,
    pipelineFns,
    topFunctions: allFunctions.slice(0, 30),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Initializing OCCT kernel...');
  await initOC();

  console.log('\n=== Blueprint Boolean V8 CPU Profile ===');
  console.log('ADR-0006: Identifying hot-path vectorOperations functions\n');

  // Start V8 CPU profiler via inspector session
  const session = new Session();
  session.connect();
  await session.post('Profiler.enable');

  // -----------------------------------------------------------------------
  // Phase A: Timing benchmarks (without profiler — avoids overhead)
  // -----------------------------------------------------------------------
  const timings: TimingResult[] = [];

  console.log('--- Scenario 1: Simple rectangle overlap ---');
  timings.push(timeIt('fuse (rect+rect)', () => {
    const { a, b } = simpleRectOverlap();
    fuse2D(a, b);
  }, 200));
  timings.push(timeIt('cut (rect-rect)', () => {
    const { a, b } = simpleRectOverlap();
    cut2D(a, b);
  }, 200));

  console.log('\n--- Scenario 2: Rectangle + circle ---');
  timings.push(timeIt('fuse (rect+circle)', () => {
    const { a, b } = rectCircleOverlap();
    fuse2D(a, b);
  }, 200));
  timings.push(timeIt('cut (rect-circle)', () => {
    const { a, b } = rectCircleOverlap();
    cut2D(a, b);
  }, 200));

  console.log('\n--- Scenario 3: Two circles ---');
  timings.push(timeIt('fuse (circle+circle)', () => {
    const { a, b } = twoCircles();
    fuse2D(a, b);
  }, 200));
  timings.push(timeIt('intersect (circle+circle)', () => {
    const { a, b } = twoCircles();
    intersect2D(a, b);
  }, 200));

  console.log('\n--- Scenario 4: Star + multiple circle cuts ---');
  timings.push(timeIt('sequential cuts (star - 4 circles)', () => {
    const { star, circles } = complexScenario();
    let result = star as Parameters<typeof cut2D>[0];
    for (const c of circles) {
      const next = cut2D(result, c);
      if (next) result = next;
    }
  }, 50));
  timings.push(timeIt('sequential fuses (star + 4 circles)', () => {
    const { star, circles } = complexScenario();
    let result = star as Parameters<typeof fuse2D>[0];
    for (const c of circles) {
      const next = fuse2D(result, c);
      if (next) result = next;
    }
  }, 50));

  // -----------------------------------------------------------------------
  // Phase B: Micro-benchmark — isolated vectorOperations
  // -----------------------------------------------------------------------
  console.log('\n--- Scenario 5: Isolated vectorOperations micro-benchmark ---');
  const { samePoint, distance2d, add2d, normalize2d, crossProduct2d, dotProduct2d } = vecOps;
  const p1: [number, number] = [3.14159, 2.71828];
  const p2: [number, number] = [1.41421, 1.73205];
  const N = 1_000_000;

  const microResults: { name: string; totalMs: number; usPerCall: number }[] = [];
  for (const [name, fn, args] of [
    ['samePoint', samePoint, [p1, p2]],
    ['distance2d', distance2d, [p1, p2]],
    ['add2d', add2d, [p1, p2]],
    ['normalize2d', normalize2d, [p1]],
    ['crossProduct2d', crossProduct2d, [p1, p2]],
    ['dotProduct2d', dotProduct2d, [p1, p2]],
  ] as const) {
    const start = performance.now();
    for (let i = 0; i < N; i++) (fn as (...a: unknown[]) => unknown)(...args);
    const elapsed = performance.now() - start;
    const usPerCall = (elapsed / N) * 1000;
    microResults.push({ name, totalMs: elapsed, usPerCall });
    console.log(`  ${name} ×${N}: ${elapsed.toFixed(1)}ms (${usPerCall.toFixed(3)}µs/call)`);
  }

  // -----------------------------------------------------------------------
  // Phase C: Profiled run — capture CPU profile of boolean operations
  // -----------------------------------------------------------------------
  console.log('\n--- Profiled run (all scenarios combined) ---');
  await session.post('Profiler.start');

  // Run enough iterations for statistical significance in the profile.
  // Target ~2-3 seconds of profiled time for good sample coverage.
  for (let i = 0; i < 500; i++) {
    const { a: r1, b: r2 } = simpleRectOverlap();
    fuse2D(r1, r2);

    const { a: rc1, b: rc2 } = rectCircleOverlap();
    cut2D(rc1, rc2);

    const { a: c1, b: c2 } = twoCircles();
    fuse2D(c1, c2);
  }
  // Complex scenario — fewer iterations since it's heavier
  for (let i = 0; i < 100; i++) {
    const { star, circles } = complexScenario();
    let result = star as Parameters<typeof cut2D>[0];
    for (const c of circles) {
      const next = cut2D(result, c);
      if (next) result = next;
    }
  }

  const { profile } = await session.post('Profiler.stop') as { profile: CpuProfile };
  await session.post('Profiler.disable');
  session.disconnect();

  console.log(`  Profile captured: ${profile.samples.length} samples, ${((profile.endTime - profile.startTime) / 1000).toFixed(0)}ms`);

  // Save raw .cpuprofile for Chrome DevTools
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const cpuProfilePath = path.join(RESULTS_DIR, 'blueprint-boolean-profile.cpuprofile');
  fs.writeFileSync(cpuProfilePath, JSON.stringify(profile));
  console.log(`  Saved: ${cpuProfilePath}`);

  // -----------------------------------------------------------------------
  // Phase D: Analysis
  // -----------------------------------------------------------------------
  console.log('\n=== Profile Analysis ===\n');
  const analysis = analyzeProfile(profile);

  console.log('Vector operations (from vectorOperations.ts):');
  if (analysis.vectorOps.length === 0) {
    console.log('  (none found in profile — too fast to sample)');
  } else {
    for (const fn of analysis.vectorOps) {
      console.log(`  ${fn.name.padEnd(24)} ${fn.pct.toFixed(2)}% self-time  (${fn.hitCount} samples)`);
    }
  }

  console.log('\nBoolean pipeline functions:');
  for (const fn of analysis.pipelineFns) {
    console.log(`  ${fn.name.padEnd(36)} ${fn.pct.toFixed(2)}% self-time  (${fn.hitCount} samples)`);
  }

  console.log('\nTop 20 functions by self-time:');
  for (const fn of analysis.topFunctions.slice(0, 20)) {
    const shortUrl = fn.url.replace(/.*\/src\//, 'src/').replace(/.*\/node_modules\//, 'node_modules/');
    console.log(`  ${fn.name.padEnd(36)} ${fn.pct.toFixed(2)}%  ${shortUrl}`);
  }

  // -----------------------------------------------------------------------
  // Phase E: Generate summary report
  // -----------------------------------------------------------------------
  const report = generateReport(timings, microResults, analysis);
  const reportPath = path.join(RESULTS_DIR, 'blueprint-boolean-profile.md');
  fs.writeFileSync(reportPath, report);
  console.log(`\nReport saved: ${reportPath}`);
}

function generateReport(
  timings: TimingResult[],
  microResults: { name: string; totalMs: number; usPerCall: number }[],
  analysis: ReturnType<typeof analyzeProfile>,
): string {
  const lines: string[] = [
    '# Blueprint Boolean CPU Profile — ADR-0006 Hot-Path Analysis',
    '',
    `**Date:** ${new Date().toISOString().split('T')[0]}`,
    `**Node:** ${process.version}`,
    `**Purpose:** Identify which vectorOperations functions are hot-path candidates`,
    'that should remain as direct TS calls (ADR-0006 hot-path exception).',
    '',
    '## Boolean Operation Timing',
    '',
    '| Scenario | ms/op | Iterations |',
    '| --- | --- | --- |',
  ];

  for (const t of timings) {
    lines.push(`| ${t.label} | ${t.msPerOp.toFixed(2)} | ${t.iterations} |`);
  }

  lines.push('', '## Isolated vectorOperations Micro-benchmark (1M calls each)', '');
  lines.push('| Function | Total (ms) | Per call (µs) |');
  lines.push('| --- | --- | --- |');
  for (const m of microResults) {
    lines.push(`| ${m.name} | ${m.totalMs.toFixed(1)} | ${m.usPerCall.toFixed(3)} |`);
  }

  lines.push('', '## CPU Profile: vectorOperations Self-Time', '');
  if (analysis.vectorOps.length === 0) {
    lines.push('No vectorOperations functions appeared in V8 profiler samples.');
    lines.push('This confirms they are **too fast to register** at the sampling interval (~1ms).');
    lines.push('They are not hot-path bottlenecks in boolean operations.');
  } else {
    lines.push('| Function | Self-time % | Samples |');
    lines.push('| --- | --- | --- |');
    for (const fn of analysis.vectorOps) {
      lines.push(`| ${fn.name} | ${fn.pct.toFixed(2)}% | ${fn.hitCount} |`);
    }
  }

  lines.push('', '## CPU Profile: Boolean Pipeline Functions', '');
  lines.push('| Function | Self-time % | Samples |');
  lines.push('| --- | --- | --- |');
  for (const fn of analysis.pipelineFns) {
    lines.push(`| ${fn.name} | ${fn.pct.toFixed(2)}% | ${fn.hitCount} |`);
  }

  lines.push('', '## CPU Profile: Top 20 Functions by Self-Time', '');
  lines.push('| Function | Self-time % | Location |');
  lines.push('| --- | --- | --- |');
  for (const fn of analysis.topFunctions.slice(0, 20)) {
    const shortUrl = fn.url.replace(/.*\/src\//, 'src/').replace(/.*\/node_modules\//, 'node_modules/');
    lines.push(`| ${fn.name} | ${fn.pct.toFixed(2)}% | ${shortUrl} |`);
  }

  lines.push('', '## Conclusions', '');
  lines.push('<!-- Fill in after reviewing the data above -->');
  lines.push('');

  return lines.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
