/**
 * Measurement operations for the occt-wasm adapter.
 *
 * Includes simple wrappers (volume/area/length/COM/bbox) and the more
 * involved `distance` and `surfaceCurvature` paths, which sample geometry
 * and reconstruct principal directions via finite-difference fundamental
 * forms. The C++ facade returns scalars (distance value, k1/k2); JS recovers
 * witness points and direction vectors.
 *
 * @module
 */

import type { DistanceResult, KernelShape } from '@/kernel/types.js';
import type { BulkMeasurement } from '@/kernel/interfaces/measureOps.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import { noop, unwrap } from './helpers.js';

export function volume(k: OcctKernelWasm, shape: KernelShape): number {
  return k.getVolume(unwrap(shape));
}

export function area(k: OcctKernelWasm, shape: KernelShape): number {
  return k.getSurfaceArea(unwrap(shape));
}

export function length(k: OcctKernelWasm, shape: KernelShape): number {
  return k.getLength(unwrap(shape));
}

export function centerOfMass(k: OcctKernelWasm, shape: KernelShape): [number, number, number] {
  const vec = k.getCenterOfMass(unwrap(shape));
  try {
    return [vec.get(0), vec.get(1), vec.get(2)];
  } finally {
    vec.delete();
  }
}

export function linearCenterOfMass(
  k: OcctKernelWasm,
  shape: KernelShape
): [number, number, number] {
  const vec = k.getLinearCenterOfMass(unwrap(shape));
  try {
    return [vec.get(0), vec.get(1), vec.get(2)];
  } finally {
    vec.delete();
  }
}

export function boundingBox(
  k: OcctKernelWasm,
  shape: KernelShape
): { min: [number, number, number]; max: [number, number, number] } {
  const bb = k.getBoundingBox(unwrap(shape), true);
  return {
    min: [bb.xmin, bb.ymin, bb.zmin],
    max: [bb.xmax, bb.ymax, bb.zmax],
  };
}

export function surfaceCenterOfMass(
  k: OcctKernelWasm,
  face: KernelShape
): [number, number, number] {
  // Delegates to occt-wasm's exact `BRepGProp::SurfaceProperties.CentreOfMass()`
  // (added in occt-wasm 2.0). The previous tessellation-triangle centroid
  // diverged from brepjs-occt for non-planar faces.
  try {
    const v = k.getSurfaceCenterOfMass(unwrap(face));
    try {
      return [v.get(0), v.get(1), v.get(2)];
    } finally {
      v.delete();
    }
  } catch {
    // Degenerate or unmeshable face — preserve previous behavior of
    // returning origin rather than propagating the WASM exception.
    return [0, 0, 0];
  }
}

export function measureBulk(
  k: OcctKernelWasm,
  shape: KernelShape,
  includeLinear?: boolean
): BulkMeasurement {
  return {
    volume: volume(k, shape),
    area: area(k, shape),
    length: includeLinear ? length(k, shape) : 0,
    centerOfMass: centerOfMass(k, shape),
    boundingBox: boundingBox(k, shape),
  };
}

export function createDistanceQuery(
  k: OcctKernelWasm,
  referenceShape: KernelShape
): {
  distanceTo(shape: KernelShape): {
    value: number;
    point1: [number, number, number];
    point2: [number, number, number];
  };
  dispose(): void;
} {
  const refId = unwrap(referenceShape);
  return {
    distanceTo(shape: KernelShape) {
      const d = k.distanceBetween(refId, unwrap(shape));
      return { value: d, point1: [0, 0, 0], point2: [0, 0, 0] };
    },
    dispose: noop,
  };
}

// Cap mesh samples so distance()'s nested O(N·M) loop stays bounded
// (~65k pair comparisons at the cap × cap product). Stride-sample by
// vertex (3 floats) when the mesh exceeds the cap; the closest-pair
// approximation degrades gracefully because every retained sample is
// still on the surface.
const MAX_MESH_SAMPLES = 256;

/**
 * Collect 3D sample points from a shape for nearest-pair queries: every
 * topological vertex, plus tessellation vertices when the shape carries
 * surfaces. Used by distance() to approximate witness points.
 */
function collectDistanceSamples(
  k: OcctKernelWasm,
  mod: OcctWasmModule,
  shapeId: number
): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];

  const verts = k.getSubShapes(shapeId, 'vertex');
  try {
    const n = verts.size();
    for (let i = 0; i < n; i++) {
      const p = k.vertexPosition(verts.get(i));
      out.push([p.get(0), p.get(1), p.get(2)]);
      p.delete();
    }
  } finally {
    verts.delete();
  }

  // Tessellation samples — coarse linear deflection (≈1% of bbox diagonal)
  // is enough to seed a witness-point search; refinement comes from picking
  // the closest pair, not from sample density per se.
  // useTriangulation=true matches brepjs-occt's BRepBndLib.Add(shape, box, true)
  // semantics — refines the bound via surface analysis when triangulation is
  // present, falls back to surface-precise AddOptimal otherwise.
  const bb = k.getBoundingBox(shapeId, true);
  const diag = Math.sqrt(
    (bb.xmax - bb.xmin) ** 2 + (bb.ymax - bb.ymin) ** 2 + (bb.zmax - bb.zmin) ** 2
  );
  const linDef = Math.max(diag * 1e-2, 1e-4);
  let mesh: ReturnType<OcctKernelWasm['tessellate']> | undefined;
  try {
    mesh = k.tessellate(shapeId, linDef, 0.5);
  } catch {
    return out;
  }
  try {
    const posCount = mesh.positionCount;
    if (posCount > 0) {
      const ptr = mesh.getPositionsPtr() >> 2;
      const heap = mod.HEAPF32;
      const vertexCount = Math.floor(posCount / 3);
      const stride = vertexCount > MAX_MESH_SAMPLES ? Math.ceil(vertexCount / MAX_MESH_SAMPLES) : 1;
      const step = stride * 3;
      for (let i = 0; i < posCount; i += step) {
        out.push([heap[ptr + i] ?? 0, heap[ptr + i + 1] ?? 0, heap[ptr + i + 2] ?? 0]);
      }
    }
  } finally {
    mesh.delete();
  }

  return out;
}

export function distance(
  k: OcctKernelWasm,
  mod: OcctWasmModule,
  shape1: KernelShape,
  shape2: KernelShape
): DistanceResult {
  const id1 = unwrap(shape1);
  const id2 = unwrap(shape2);
  const value = k.distanceBetween(id1, id2);
  // Witness points: the C++ facade returns only a scalar distance, so we
  // sample each shape (topological vertices + face tessellation) and pick
  // the closest pair. The `value` above stays exact (from BRepExtrema);
  // `point1`/`point2` are an approximation whose error scales with the
  // tessellation deflection.
  const samples1 = collectDistanceSamples(k, mod, id1);
  const samples2 = collectDistanceSamples(k, mod, id2);
  if (samples1.length === 0 || samples2.length === 0) {
    return { value, point1: [0, 0, 0], point2: [0, 0, 0] };
  }
  let bestD2 = Infinity;
  let bestP1: [number, number, number] = samples1[0] ?? [0, 0, 0];
  let bestP2: [number, number, number] = samples2[0] ?? [0, 0, 0];
  for (const p1 of samples1) {
    for (const p2 of samples2) {
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const dz = p2[2] - p1[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestP1 = p1;
        bestP2 = p2;
      }
    }
  }
  return { value, point1: bestP1, point2: bestP2 };
}

function pointAt(
  k: OcctKernelWasm,
  faceId: number,
  u: number,
  v: number
): [number, number, number] {
  const p = k.pointOnSurface(faceId, u, v);
  const r: [number, number, number] = [p.get(0), p.get(1), p.get(2)];
  p.delete();
  return r;
}

/**
 * Sample a 9-point stencil around (u, v) and return central-difference
 * partial derivatives Pu, Pv, Puu, Pvv, Puv. Step size is 1e-3 of the
 * parametric range (clamped at 1e-6) — the sweet spot between truncation
 * error and float-eval noise. Near the boundary the stencil shifts inward
 * so all sample points stay in the domain.
 */
function surfaceDerivatives(
  k: OcctKernelWasm,
  faceId: number,
  u: number,
  v: number
): {
  Pu: [number, number, number];
  Pv: [number, number, number];
  Puu: [number, number, number];
  Pvv: [number, number, number];
  Puv: [number, number, number];
} {
  const bounds = k.uvBounds(faceId);
  const uMin = bounds.get(0);
  const uMax = bounds.get(1);
  const vMin = bounds.get(2);
  const vMax = bounds.get(3);
  bounds.delete();

  const hu = Math.max(Math.max(uMax - uMin, 1e-12) * 1e-3, 1e-6);
  const hv = Math.max(Math.max(vMax - vMin, 1e-12) * 1e-3, 1e-6);
  const uc = Math.min(Math.max(u, uMin + hu), uMax - hu);
  const vc = Math.min(Math.max(v, vMin + hv), vMax - hv);

  const P = pointAt(k, faceId, uc, vc);
  const Pup = pointAt(k, faceId, uc + hu, vc);
  const Pum = pointAt(k, faceId, uc - hu, vc);
  const Pvp = pointAt(k, faceId, uc, vc + hv);
  const Pvm = pointAt(k, faceId, uc, vc - hv);
  const Ppp = pointAt(k, faceId, uc + hu, vc + hv);
  const Ppm = pointAt(k, faceId, uc + hu, vc - hv);
  const Pmp = pointAt(k, faceId, uc - hu, vc + hv);
  const Pmm = pointAt(k, faceId, uc - hu, vc - hv);
  const huu = hu * hu;
  const hvv = hv * hv;
  const huv4 = 4 * hu * hv;

  return {
    Pu: [(Pup[0] - Pum[0]) / (2 * hu), (Pup[1] - Pum[1]) / (2 * hu), (Pup[2] - Pum[2]) / (2 * hu)],
    Pv: [(Pvp[0] - Pvm[0]) / (2 * hv), (Pvp[1] - Pvm[1]) / (2 * hv), (Pvp[2] - Pvm[2]) / (2 * hv)],
    Puu: [
      (Pup[0] - 2 * P[0] + Pum[0]) / huu,
      (Pup[1] - 2 * P[1] + Pum[1]) / huu,
      (Pup[2] - 2 * P[2] + Pum[2]) / huu,
    ],
    Pvv: [
      (Pvp[0] - 2 * P[0] + Pvm[0]) / hvv,
      (Pvp[1] - 2 * P[1] + Pvm[1]) / hvv,
      (Pvp[2] - 2 * P[2] + Pvm[2]) / hvv,
    ],
    Puv: [
      (Ppp[0] - Ppm[0] - Pmp[0] + Pmm[0]) / huv4,
      (Ppp[1] - Ppm[1] - Pmp[1] + Pmm[1]) / huv4,
      (Ppp[2] - Ppm[2] - Pmp[2] + Pmm[2]) / huv4,
    ],
  };
}

/**
 * Return a non-zero eigenvector of the singular matrix [[a,b],[c,d]] (whose
 * eigenvalue is implicit — caller has already subtracted λ from the diagonal).
 * Picks the row with the larger magnitude for numerical stability.
 */
function eigenvector2x2(a: number, b: number, c: number, d: number): [number, number] {
  const useFirst = Math.abs(a) + Math.abs(b) >= Math.abs(c) + Math.abs(d);
  if (useFirst) {
    if (Math.abs(a) + Math.abs(b) < 1e-12) return [1, 0];
    return [-b, a];
  }
  if (Math.abs(c) + Math.abs(d) < 1e-12) return [0, 1];
  return [-d, c];
}

function liftAndNormalize(
  ab: [number, number],
  Pu: [number, number, number],
  Pv: [number, number, number]
): [number, number, number] {
  const x = ab[0] * Pu[0] + ab[1] * Pv[0];
  const y = ab[0] * Pu[1] + ab[1] * Pv[1];
  const z = ab[0] * Pu[2] + ab[1] * Pv[2];
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 1e-12) return [1, 0, 0];
  return [x / len, y / len, z / len];
}

/**
 * Fallback when curvature is direction-degenerate: return an orthonormal
 * tangent frame derived from Pu and the Gram-Schmidt-corrected Pv.
 */
function degenerateOrthoFrame(
  Pu: [number, number, number],
  Pv: [number, number, number]
): {
  maxDirection: [number, number, number];
  minDirection: [number, number, number];
} {
  const uLen = Math.sqrt(Pu[0] * Pu[0] + Pu[1] * Pu[1] + Pu[2] * Pu[2]);
  if (uLen < 1e-12) {
    return { maxDirection: [1, 0, 0], minDirection: [0, 1, 0] };
  }
  const ux = Pu[0] / uLen,
    uy = Pu[1] / uLen,
    uz = Pu[2] / uLen;
  const dot = ux * Pv[0] + uy * Pv[1] + uz * Pv[2];
  const vx = Pv[0] - dot * ux;
  const vy = Pv[1] - dot * uy;
  const vz = Pv[2] - dot * uz;
  const vLen = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (vLen < 1e-12) {
    const ax: [number, number, number] = Math.abs(ux) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const ox = uy * ax[2] - uz * ax[1];
    const oy = uz * ax[0] - ux * ax[2];
    const oz = ux * ax[1] - uy * ax[0];
    const oLen = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
    return {
      maxDirection: [ux, uy, uz],
      minDirection: [ox / oLen, oy / oLen, oz / oLen],
    };
  }
  return {
    maxDirection: [ux, uy, uz],
    minDirection: [vx / vLen, vy / vLen, vz / vLen],
  };
}

/**
 * Compute principal curvature directions at (u, v) via finite-difference
 * fundamental forms. The C++ facade exposes only k1 and k2 as scalars; this
 * helper recovers the corresponding tangent directions in 3D space.
 */
function computePrincipalDirections(
  k: OcctKernelWasm,
  faceId: number,
  u: number,
  v: number,
  maxK: number,
  minK: number
): {
  maxDirection: [number, number, number];
  minDirection: [number, number, number];
} {
  const { Pu, Pv, Puu, Pvv, Puv } = surfaceDerivatives(k, faceId, u, v);

  const nx = Pu[1] * Pv[2] - Pu[2] * Pv[1];
  const ny = Pu[2] * Pv[0] - Pu[0] * Pv[2];
  const nz = Pu[0] * Pv[1] - Pu[1] * Pv[0];
  const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz);
  const E = Pu[0] * Pu[0] + Pu[1] * Pu[1] + Pu[2] * Pu[2];
  const F = Pu[0] * Pv[0] + Pu[1] * Pv[1] + Pu[2] * Pv[2];
  const G = Pv[0] * Pv[0] + Pv[1] * Pv[1] + Pv[2] * Pv[2];

  if (nlen < 1e-12 || E * G - F * F < 1e-24) {
    return degenerateOrthoFrame(Pu, Pv);
  }

  const e = (Puu[0] * nx + Puu[1] * ny + Puu[2] * nz) / nlen;
  const f = (Puv[0] * nx + Puv[1] * ny + Puv[2] * nz) / nlen;
  const g = (Pvv[0] * nx + Pvv[1] * ny + Pvv[2] * nz) / nlen;

  // Shape operator W = I⁻¹ · II in the {Pu, Pv} basis. Solves the
  // generalized eigenproblem II·x = k·I·x so eigenvectors are in {Pu, Pv}.
  const det = E * G - F * F;
  const w11 = (e * G - f * F) / det;
  const w12 = (f * G - g * F) / det;
  const w21 = (f * E - e * F) / det;
  const w22 = (g * E - f * F) / det;

  // Isotropic point (k1 ≈ k2) — any direction is principal.
  if (Math.abs(maxK - minK) < 1e-9 * (Math.abs(maxK) + Math.abs(minK) + 1)) {
    return degenerateOrthoFrame(Pu, Pv);
  }

  const dirMax2D = eigenvector2x2(w11 - maxK, w12, w21, w22 - maxK);
  const dirMin2D = eigenvector2x2(w11 - minK, w12, w21, w22 - minK);

  return {
    maxDirection: liftAndNormalize(dirMax2D, Pu, Pv),
    minDirection: liftAndNormalize(dirMin2D, Pu, Pv),
  };
}

export function surfaceCurvature(
  k: OcctKernelWasm,
  face: KernelShape,
  u: number,
  v: number
): {
  gaussian: number;
  mean: number;
  max: number;
  min: number;
  maxDirection: [number, number, number];
  minDirection: [number, number, number];
} {
  const faceId = unwrap(face);
  const vec = k.surfaceCurvature(faceId, u, v);
  // C++ returns [mean, gaussian, maxK, minK]
  const mean = vec.get(0);
  const gaussian = vec.get(1);
  const maxK = vec.get(2);
  const minK = vec.get(3);
  vec.delete();

  const { maxDirection, minDirection } = computePrincipalDirections(k, faceId, u, v, maxK, minK);

  return { gaussian, mean, max: maxK, min: minK, maxDirection, minDirection };
}
