/**
 * Helpers for the voxel-domain parity suite.
 *
 * The voxel domain is a parallel domain (ADR-0013), NOT a `KernelAdapter`: its
 * ops take a triangle-soup {@link VoxelMeshInput} and return a {@link KernelMeshResult}
 * mesh, never a B-rep `ShapeHandle`. So the kernel-swap parity harness in
 * `tests/parity/*.ts` (which runs B-rep specs through `getKernel`) does not apply.
 * Voxel parity is instead **mesh-based and resolution-bound**: closed-form math
 * is the reference, tolerances are coarse and resolution-dependent, and the
 * watertight / 2-manifold invariants are the real guard (see ./README.md).
 *
 * These helpers provide what the manifold harness's `compareMetrics` cannot:
 * volume / area / bbox / topology computed directly from a triangle mesh.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import initWasm, * as voxelWasm from 'brepjs-voxel-wasm';
import { initVoxel, shapeToMeshInput, type VoxelMeshInput } from '@/voxel/index.js';
import { mesh as meshShape } from '@/topology/meshFns.js';
import { unwrap } from '@/core/result.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import type { KernelMeshResult } from '@/kernel/types.js';
import { currentKernel, initOC } from '../../setup.js';

type Vec3 = [number, number, number];

/**
 * Voxel parity runs only under an exact B-rep gate kernel. Primitives are built
 * on the active kernel and tessellated as the voxel input, so a mesh kernel
 * (manifold) would double-approximate; brepkit's tessellation differs too. We
 * pin to the `occt-wasm` CI gate — the same init-and-skip posture the vault plan
 * prescribes (reuse the `manifold.test.ts` guard; reserve `alwaysExclude` for
 * pure invariant tests).
 */
export const RUN_VOXEL_PARITY = currentKernel === 'occt-wasm';

/**
 * Resolution-dependent tolerance policy (the voxel analog of the B-rep parity
 * tolerance tiers). Every band is a property of discretization + Surface Nets,
 * not a bug — calibrated against measured output (see ./README.md). Bands carry
 * generous margin over observed error so the suite is not flaky.
 *
 * Measured at the default resolution: cube volErr ~0.3–0.9%, bbox exact;
 * cylinder volErr ~0.4%; box-union volErr ~0.8%; area inflated ~5% (Surface
 * Nets is staircase-ish, so area runs looser than volume).
 */
export const VOXEL = {
  /** Default longest-axis voxel count. Cube/box ops at this res run in <100ms. */
  resolution: 40,
  /** Air-margin ring Surface Nets needs (>= 1). */
  padding: 2,
  /** Volume relative tolerance (observed max ~1.2% at res 24; margin to 3%). */
  volTol: 0.03,
  /** Area relative tolerance (Surface Nets inflates area; observed ~5%). */
  areaTol: 0.12,
  /** Bbox corner absolute tolerance, in multiples of voxel size h. */
  bboxVoxels: 1.5,
  /**
   * Upper bound on the fraction of output triangles that may be degenerate or
   * touch a non-manifold edge. This is a DOCUMENTED DIVERGENCE: Surface Nets v1
   * is closed (no boundary edges) but not strictly 2-manifold and emits some
   * sliver/degenerate triangles except on grid-aligned geometry (ADR-0013 §6).
   * The bound is a regression guard, NOT a 2-manifold guarantee — the manifold
   * dual-contouring `Contourer` is the eventual fix. Observed max ~5%.
   */
  badTriFraction: 0.08,
} as const;

let wasmReady = false;

/** Load the voxel WASM engine + register it + init the B-rep kernel. Idempotent.
 *  No-op under non-gate kernels — the whole suite skips there, so don't pay the
 *  WASM load. */
export async function setupVoxelParity(): Promise<void> {
  if (!RUN_VOXEL_PARITY) return;
  if (!wasmReady) {
    const wasmPath = resolve(__dirname, '../../../packages/brepjs-voxel-wasm/pkg/index_bg.wasm');
    await initWasm({ module_or_path: readFileSync(wasmPath) });
    initVoxel(voxelWasm);
    wasmReady = true;
  }
  await initOC();
}

/** Tessellate a B-rep primitive into the voxel ops' triangle-soup input. */
export function meshInputOf(shape: AnyShape<Dimension>, deflection = 1e-3): VoxelMeshInput {
  return unwrap(shapeToMeshInput(shape, deflection));
}

/**
 * Tessellate a B-rep shape into a {@link KernelMeshResult} for use as an exact
 * reference in {@link hausdorff} comparisons. Only `vertices`/`triangles` carry
 * meaning here; the other fields are present to satisfy the type.
 */
export function kernelMeshOf(shape: AnyShape<Dimension>, deflection = 0.2): KernelMeshResult {
  const m = meshShape(shape, { tolerance: deflection });
  return {
    vertices: m.vertices,
    triangles: m.triangles,
    normals: new Float32Array(0),
    uvs: new Float32Array(0),
    faceGroups: [],
  };
}

/** The voxel size h for a mesh of given world extent at a given resolution. */
export function voxelSize(longestExtent: number, resolution: number = VOXEL.resolution): number {
  return longestExtent / resolution;
}

// ---------------------------------------------------------------------------
// Mesh metrics — computed from the triangle mesh, since voxel output is a bare
// KernelMeshResult, not a kernel shape that `compareMetrics` could measure.
// ---------------------------------------------------------------------------

function vertexAt(m: KernelMeshResult, i: number): Vec3 {
  const b = i * 3;
  return [m.vertices[b] ?? 0, m.vertices[b + 1] ?? 0, m.vertices[b + 2] ?? 0];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Enclosed volume of a closed triangle mesh via the divergence theorem:
 * V = (1/6) Σ v0 · (v1 × v2). Returns the magnitude so winding orientation
 * never flips the sign.
 */
export function meshVolume(m: KernelMeshResult): number {
  let sixV = 0;
  for (let t = 0; t < m.triangles.length; t += 3) {
    const a = vertexAt(m, m.triangles[t] ?? 0);
    const b = vertexAt(m, m.triangles[t + 1] ?? 0);
    const c = vertexAt(m, m.triangles[t + 2] ?? 0);
    sixV +=
      a[0] * (b[1] * c[2] - b[2] * c[1]) +
      a[1] * (b[2] * c[0] - b[0] * c[2]) +
      a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return Math.abs(sixV) / 6;
}

/** Total surface area = Σ ½·‖(v1−v0) × (v2−v0)‖. */
export function meshArea(m: KernelMeshResult): number {
  let area = 0;
  for (let t = 0; t < m.triangles.length; t += 3) {
    const a = vertexAt(m, m.triangles[t] ?? 0);
    const b = vertexAt(m, m.triangles[t + 1] ?? 0);
    const c = vertexAt(m, m.triangles[t + 2] ?? 0);
    const n = cross(sub(b, a), sub(c, a));
    area += 0.5 * Math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2);
  }
  return area;
}

export interface Bbox {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly size: Vec3;
}

export function meshBbox(m: KernelMeshResult): Bbox {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.vertices.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const v = m.vertices[i + axis] ?? 0;
      if (v < (min[axis] ?? Infinity)) min[axis] = v;
      if (v > (max[axis] ?? -Infinity)) max[axis] = v;
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/** Relative error |actual − expected| / max(|expected|, ε). */
export function relErr(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-9);
}

// ---------------------------------------------------------------------------
// Topology — the real guard. A repaired/contoured surface must be a closed
// 2-manifold (every edge shared by exactly two triangles) for downstream use.
// ---------------------------------------------------------------------------

export interface MeshTopology {
  readonly triangleCount: number;
  readonly vertexCount: number;
  /** Edges incident to exactly one triangle — a hole/boundary. */
  readonly boundaryEdges: number;
  /** Edges incident to three or more triangles — non-manifold. */
  readonly nonManifoldEdges: number;
  /** Triangles with a repeated index or ~zero area. */
  readonly degenerateTriangles: number;
  /** Triangle indices pointing outside the vertex array. */
  readonly outOfRangeIndices: number;
  /** No boundary and no non-manifold edges → closed 2-manifold. */
  readonly isWatertight: boolean;
  /** No edge shared by >2 triangles (manifold, boundary allowed). */
  readonly isEdgeManifold: boolean;
}

export function meshTopology(m: KernelMeshResult): MeshTopology {
  const vertexCount = m.vertices.length / 3;
  const edgeCounts = new Map<string, number>();
  let degenerateTriangles = 0;
  let outOfRangeIndices = 0;
  const triangleCount = m.triangles.length / 3;

  for (let t = 0; t < m.triangles.length; t += 3) {
    const i = m.triangles[t] ?? 0;
    const j = m.triangles[t + 1] ?? 0;
    const k = m.triangles[t + 2] ?? 0;
    if (i >= vertexCount || j >= vertexCount || k >= vertexCount) outOfRangeIndices++;
    if (i === j || j === k || i === k) {
      degenerateTriangles++;
      continue;
    }
    const a = vertexAt(m, i);
    const b = vertexAt(m, j);
    const c = vertexAt(m, k);
    const n = cross(sub(b, a), sub(c, a));
    if (Math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) < 1e-12) degenerateTriangles++;
    for (const [u, v] of [
      [i, j],
      [j, k],
      [k, i],
    ] as const) {
      const key = u < v ? `${u}_${v}` : `${v}_${u}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edgeCounts.values()) {
    if (count === 1) boundaryEdges++;
    else if (count > 2) nonManifoldEdges++;
  }

  return {
    triangleCount,
    vertexCount,
    boundaryEdges,
    nonManifoldEdges,
    degenerateTriangles,
    outOfRangeIndices,
    isWatertight: boundaryEdges === 0 && nonManifoldEdges === 0,
    isEdgeManifold: nonManifoldEdges === 0,
  };
}
