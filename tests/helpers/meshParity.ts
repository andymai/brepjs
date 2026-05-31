/**
 * Mesh + metric parity helpers for the manifold↔occt kernel comparison.
 *
 * The manifold kernel previews on a triangle mesh while occt is an exact B-rep.
 * These helpers compare the two representations two ways:
 *
 * 1. {@link compareMetrics} — scalar agreement on volume/area/bbox/centroid,
 *    the cheapest and tightest signal for primitives and booleans.
 * 2. {@link hausdorff} — a symmetric vertex-to-mesh deviation between two
 *    {@link KernelMeshResult} triangle sets, bounding how far the two surfaces
 *    drift apart (curved faces tessellate differently, so this is loose).
 * 3. {@link expectReplayMatchesDirect} — the replay oracle: build a shape on
 *    manifold, replay its recorded op-graph onto occt, build the *same* shape
 *    directly on occt, and assert the two occt results agree near-exactly.
 *
 * @module
 */

import { expect } from 'vitest';
import type { KernelAdapter, KernelMeshResult, KernelShape } from '@/kernel/types.js';
import { replay } from '@/kernel/manifold/replay.js';
import { nodeOf, type ManifoldShape } from '@/kernel/manifold/meshHandle.js';

type Vec3 = readonly [number, number, number];

interface BBox {
  readonly min: Vec3 | number[];
  readonly max: Vec3 | number[];
}

// ---------------------------------------------------------------------------
// Mesh distance (Hausdorff)
// ---------------------------------------------------------------------------

/** Squared distance from point p to triangle (a,b,c). */
function pointTriangleDistanceSq(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  // Ericson, Real-Time Collision Detection — closest point on triangle.
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap: Vec3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (u: Vec3, v: Vec3): number => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];

  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return dot(ap, ap);

  const bp: Vec3 = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return dot(bp, bp);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const q: Vec3 = [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]];
    const qp: Vec3 = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
    return dot(qp, qp);
  }

  const cp: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return dot(cp, cp);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const q: Vec3 = [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]];
    const qp: Vec3 = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
    return dot(qp, qp);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    const q: Vec3 = [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])];
    const qp: Vec3 = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
    return dot(qp, qp);
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const q: Vec3 = [
    a[0] + ab[0] * v + ac[0] * w,
    a[1] + ab[1] * v + ac[1] * w,
    a[2] + ab[2] * v + ac[2] * w,
  ];
  const qp: Vec3 = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  return dot(qp, qp);
}

function vertexAt(m: KernelMeshResult, i: number): Vec3 {
  const base = i * 3;
  return [m.vertices[base] ?? 0, m.vertices[base + 1] ?? 0, m.vertices[base + 2] ?? 0];
}

function triAt(m: KernelMeshResult, t: number): readonly [number, number, number] {
  const base = t * 3;
  return [m.triangles[base] ?? 0, m.triangles[base + 1] ?? 0, m.triangles[base + 2] ?? 0];
}

/** Max over every vertex of `from` of its min distance to any triangle of `to`. */
function directedDeviation(from: KernelMeshResult, to: KernelMeshResult): number {
  const triCount = to.triangles.length / 3;
  const vertCount = from.vertices.length / 3;
  let worst = 0;
  for (let i = 0; i < vertCount; i++) {
    const p = vertexAt(from, i);
    let best = Infinity;
    for (let t = 0; t < triCount; t++) {
      const [ia, ib, ic] = triAt(to, t);
      const d = pointTriangleDistanceSq(p, vertexAt(to, ia), vertexAt(to, ib), vertexAt(to, ic));
      if (d < best) best = d;
      if (best === 0) break;
    }
    if (best > worst) worst = best;
  }
  return Math.sqrt(worst);
}

/**
 * Symmetric Hausdorff distance between two meshes: the larger of the two
 * directed vertex-to-surface deviations. O(Va·Tb + Vb·Ta) — keep meshes small.
 */
export function hausdorff(a: KernelMeshResult, b: KernelMeshResult): number {
  return Math.max(directedDeviation(a, b), directedDeviation(b, a));
}

/** Tessellate a shape on its kernel into a {@link KernelMeshResult}. */
export function tessellate(
  kernel: KernelAdapter,
  shape: KernelShape,
  tolerance = 0.05,
  angularTolerance = 0.3
): KernelMeshResult {
  return kernel.mesh(shape, { tolerance, angularTolerance, skipNormals: true });
}

// ---------------------------------------------------------------------------
// Scalar metric comparison
// ---------------------------------------------------------------------------

export interface MetricTolerances {
  /** Relative tolerance for volume (default 1e-3). */
  readonly volTol?: number;
  /** Relative tolerance for area (default 1e-3). */
  readonly areaTol?: number;
  /** Absolute tolerance for each bbox corner coordinate (default 1e-3). */
  readonly bboxAbs?: number;
  /** Absolute tolerance for each centroid coordinate (default 1e-2). */
  readonly centroidAbs?: number;
  /** Skip the centroid check (manifold centroid is AABB-center, not mass center). */
  readonly skipCentroid?: boolean;
}

function expectRel(actual: number, expected: number, relTol: number, label: string): void {
  const tol = Math.max(1e-6, Math.abs(expected) * relTol);
  expect(
    Math.abs(actual - expected),
    `${label}: manifold=${actual} occt=${expected} tol=${tol}`
  ).toBeLessThanOrEqual(tol);
}

/**
 * Compare scalar metrics (volume, area, bbox extents, centroid) of the same
 * conceptual shape built on two kernels.
 */
export function compareMetrics(
  km: KernelAdapter,
  shapeM: KernelShape,
  ko: KernelAdapter,
  shapeO: KernelShape,
  tol: MetricTolerances = {}
): void {
  const {
    volTol = 1e-3,
    areaTol = 1e-3,
    bboxAbs = 1e-3,
    centroidAbs = 1e-2,
    skipCentroid = false,
  } = tol;

  expectRel(km.volume(shapeM), ko.volume(shapeO), volTol, 'volume');
  expectRel(km.area(shapeM), ko.area(shapeO), areaTol, 'area');

  const bm: BBox = km.boundingBox(shapeM);
  const bo: BBox = ko.boundingBox(shapeO);
  for (let axis = 0; axis < 3; axis++) {
    expect(
      Math.abs((bm.min[axis] ?? 0) - (bo.min[axis] ?? 0)),
      `bbox.min[${axis}]: manifold=${bm.min[axis]} occt=${bo.min[axis]}`
    ).toBeLessThanOrEqual(bboxAbs);
    expect(
      Math.abs((bm.max[axis] ?? 0) - (bo.max[axis] ?? 0)),
      `bbox.max[${axis}]: manifold=${bm.max[axis]} occt=${bo.max[axis]}`
    ).toBeLessThanOrEqual(bboxAbs);
  }

  if (!skipCentroid) {
    const cm = km.centerOfMass(shapeM);
    const co = ko.centerOfMass(shapeO);
    for (let axis = 0; axis < 3; axis++) {
      expect(
        Math.abs((cm[axis] ?? 0) - (co[axis] ?? 0)),
        `centroid[${axis}]: manifold=${cm[axis]} occt=${co[axis]}`
      ).toBeLessThanOrEqual(centroidAbs);
    }
  }
}

// ---------------------------------------------------------------------------
// Replay oracle
// ---------------------------------------------------------------------------

export interface ReplayOracleTolerances {
  readonly volTol?: number;
  readonly areaTol?: number;
  readonly bboxAbs?: number;
}

/**
 * Replay oracle: build a shape on the manifold kernel, replay its recorded
 * op-graph onto the occt kernel, build the same shape *directly* on occt, and
 * assert the replayed B-rep matches the directly-built B-rep near-exactly.
 *
 * This validates that the op-graph captured exact intent (the recorded params
 * map to the right occt method) — independent of any mesh approximation. Both
 * sides are real B-reps, so tolerances are tight by default.
 *
 * @param buildManifold builds the shape on the manifold adapter
 * @param buildOcctDirect builds the same shape directly on the occt adapter
 */
export function expectReplayMatchesDirect(
  manifold: KernelAdapter,
  occt: KernelAdapter,
  buildManifold: (k: KernelAdapter) => KernelShape,
  buildOcctDirect: (k: KernelAdapter) => KernelShape,
  tol: ReplayOracleTolerances = {}
): void {
  const { volTol = 1e-4, areaTol = 1e-4, bboxAbs = 1e-4 } = tol;

  const manifoldShape = buildManifold(manifold);
  const node = nodeOf(manifoldShape as ManifoldShape);
  expect(node.replayable, `op '${node.op}' must be replayable for the oracle`).toBe(true);

  const replayed = replay(node, occt);
  const direct = buildOcctDirect(occt);

  expectRel(occt.volume(replayed), occt.volume(direct), volTol, 'replay volume');
  expectRel(occt.area(replayed), occt.area(direct), areaTol, 'replay area');

  const br: BBox = occt.boundingBox(replayed);
  const bd: BBox = occt.boundingBox(direct);
  for (let axis = 0; axis < 3; axis++) {
    expect(
      Math.abs((br.min[axis] ?? 0) - (bd.min[axis] ?? 0)),
      `replay bbox.min[${axis}]`
    ).toBeLessThanOrEqual(bboxAbs);
    expect(
      Math.abs((br.max[axis] ?? 0) - (bd.max[axis] ?? 0)),
      `replay bbox.max[${axis}]`
    ).toBeLessThanOrEqual(bboxAbs);
  }
}
