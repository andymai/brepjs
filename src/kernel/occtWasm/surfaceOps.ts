/**
 * Surface query operations for the occt-wasm adapter.
 *
 * @module
 */

import type { KernelShape, SurfaceType } from '@/kernel/types.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import { handle, unwrap } from './helpers.js';
import { shapeOrientation } from './topologyOps.js';

export function vertexPosition(k: OcctKernelWasm, vertex: KernelShape): [number, number, number] {
  const vec = k.vertexPosition(unwrap(vertex));
  try {
    return [vec.get(0), vec.get(1), vec.get(2)];
  } finally {
    vec.delete();
  }
}

export function surfaceType(k: OcctKernelWasm, face: KernelShape): SurfaceType {
  return k.surfaceType(unwrap(face)).toLowerCase() as SurfaceType;
}

export function uvBounds(
  k: OcctKernelWasm,
  face: KernelShape
): { uMin: number; uMax: number; vMin: number; vMax: number } {
  const vec = k.uvBounds(unwrap(face));
  try {
    return { uMin: vec.get(0), uMax: vec.get(1), vMin: vec.get(2), vMax: vec.get(3) };
  } finally {
    vec.delete();
  }
}

export function outerWire(k: OcctKernelWasm, face: KernelShape): KernelShape {
  return handle('wire', k.outerWire(unwrap(face)));
}

/**
 * Reverse a surface's U parametrization. Surfaces are face proxies here, so this
 * returns a new face carrying the U-reversed geometric surface — evaluating
 * `pointOnSurface` on it yields the original surface at `UReversedParameter(u)`.
 */
export function reverseSurfaceU(k: OcctKernelWasm, surface: KernelShape): KernelShape {
  return handle('face', k.reverseSurfaceU(unwrap(surface)));
}

export function surfaceNormal(
  k: OcctKernelWasm,
  face: KernelShape,
  u: number,
  v: number
): [number, number, number] {
  const vec = k.surfaceNormal(unwrap(face), u, v);
  try {
    return [vec.get(0), vec.get(1), vec.get(2)];
  } finally {
    vec.delete();
  }
}

export function pointOnSurface(
  k: OcctKernelWasm,
  face: KernelShape,
  u: number,
  v: number
): [number, number, number] {
  const vec = k.pointOnSurface(unwrap(face), u, v);
  try {
    return [vec.get(0), vec.get(1), vec.get(2)];
  } finally {
    vec.delete();
  }
}

type V3 = [number, number, number];
const subV = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dotV = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lenV = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const crossV = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * Derive a cylindrical face's analytic parameters from the primitives occt-wasm
 * exposes — it has no `gp_Cylinder` accessor.
 *
 * Two surface samples at the same height v give radial unit normals n1,n2 (lying
 * in the plane perpendicular to the axis), so `n1 x n2` is parallel to the axis.
 * The points satisfy `p1 - p2 = ±r(n1 - n2)`, giving the radius
 * `r = |p1-p2| / |n1-n2|`; the axis point is then `p - r·n` with the normal's
 * sign chosen so both samples agree.
 *
 * `isDirect` mirrors OCCT's `gp_Cylinder::Direct()` — the handedness of the
 * cylinder's coordinate system, independent of face orientation. occt-wasm's
 * `surfaceNormal` is orientation-aware (a REVERSED face reports an inward
 * normal), so we undo the face orientation before the outward test; otherwise an
 * inner bore (a reversed face on an otherwise-direct cylinder) would wrongly
 * report `isDirect: false`. Exact for full and partial cylinders; null otherwise.
 */
function deriveCylinder(
  k: OcctKernelWasm,
  face: KernelShape
): { origin: V3; direction: V3; radius: number; isDirect: boolean } | null {
  if (surfaceType(k, face) !== 'cylinder') return null;
  const b = uvBounds(k, face);
  const vMid = 0.5 * (b.vMin + b.vMax);
  const u1 = b.uMin + 0.25 * (b.uMax - b.uMin);
  const u2 = b.uMin + 0.5 * (b.uMax - b.uMin);
  const n1 = surfaceNormal(k, face, u1, vMid);
  const n2 = surfaceNormal(k, face, u2, vMid);
  const p1 = pointOnSurface(k, face, u1, vMid);
  const p2 = pointOnSurface(k, face, u2, vMid);

  const axis = crossV(n1, n2);
  const axisLen = lenV(axis);
  const dnLen = lenV(subV(n1, n2));
  if (axisLen < 1e-9 || dnLen < 1e-9) return null; // samples too close to resolve
  const direction: V3 = [axis[0] / axisLen, axis[1] / axisLen, axis[2] / axisLen];
  const radius = lenV(subV(p1, p2)) / dnLen;

  // Axis point is p - r·n; pick the normal sign that makes both samples agree.
  const minus1: V3 = [p1[0] - radius * n1[0], p1[1] - radius * n1[1], p1[2] - radius * n1[2]];
  const minus2: V3 = [p2[0] - radius * n2[0], p2[1] - radius * n2[1], p2[2] - radius * n2[2]];
  const origin: V3 =
    lenV(subV(minus1, minus2)) < 1e-6
      ? minus1
      : [p1[0] + radius * n1[0], p1[1] + radius * n1[1], p1[2] + radius * n1[2]];
  const orientSign = shapeOrientation(k, face) === 'reversed' ? -1 : 1;
  const isDirect = orientSign * dotV(n1, subV(p1, origin)) > 0;
  return { origin, direction, radius, isDirect };
}

/** Circumcenter of three points (the center of the unique circle through them). */
function circumcenter(a: V3, p: V3, q: V3): V3 | null {
  const ab = subV(p, a);
  const ac = subV(q, a);
  const m = crossV(ab, ac);
  const mSq = dotV(m, m);
  if (mSq < 1e-18) return null; // collinear samples
  const abSq = dotV(ab, ab);
  const acSq = dotV(ac, ac);
  const d: V3 = [
    abSq * ac[0] - acSq * ab[0],
    abSq * ac[1] - acSq * ab[1],
    abSq * ac[2] - acSq * ab[2],
  ];
  const dxm = crossV(d, m);
  const inv = 1 / (2 * mSq);
  return [a[0] + dxm[0] * inv, a[1] + dxm[1] * inv, a[2] + dxm[2] * inv];
}

/** Center of the iso-v circle at height v (three u-samples → circumcenter). */
function isoCircleCenter(
  k: OcctKernelWasm,
  face: KernelShape,
  uMin: number,
  uMax: number,
  v: number
): V3 | null {
  return circumcenter(
    pointOnSurface(k, face, uMin + 0.1 * (uMax - uMin), v),
    pointOnSurface(k, face, uMin + 0.45 * (uMax - uMin), v),
    pointOnSurface(k, face, uMin + 0.8 * (uMax - uMin), v)
  );
}

/**
 * Axis of a surface of revolution (cone, torus, general revolution) by sampling.
 * occt-wasm exposes no analytic accessor for these. Their U parameter is the
 * angle of revolution, so the iso-v curve at a fixed v is a circle centered on
 * the axis; two such centers at different heights span the axis.
 *
 * Samples three v-levels and uses the farthest-apart pair of centers. Two levels
 * suffice for a cone or general revolution (v is monotonic along the axis), but
 * a torus parameterizes v as the tube angle: on a v-symmetric partial torus (a
 * half-torus, v in [0, pi]) two symmetric samples land at equal heights and
 * their centers coincide. A third level breaks that symmetry. Avoids the v
 * extremes so a cone apex (a degenerate zero-radius circle) is not sampled.
 */
function deriveAxisBySampling(
  k: OcctKernelWasm,
  face: KernelShape
): {
  origin: V3;
  direction: V3;
} | null {
  const b = uvBounds(k, face);
  const centers = [0.2, 0.5, 0.8]
    .map((f) => isoCircleCenter(k, face, b.uMin, b.uMax, b.vMin + f * (b.vMax - b.vMin)))
    .filter((c): c is V3 => c !== null);
  if (centers.length < 2) return null;

  let best: { origin: V3; direction: V3 } | null = null;
  let bestLen = 1e-9; // require a resolvable separation between centers
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      const ci = centers[i];
      const cj = centers[j];
      if (!ci || !cj) continue;
      const d = subV(cj, ci);
      const len = lenV(d);
      if (len > bestLen) {
        bestLen = len;
        best = { origin: ci, direction: [d[0] / len, d[1] / len, d[2] / len] };
      }
    }
  }
  return best;
}

/**
 * Axis of symmetry (point on axis + unit direction) for an analytic face that
 * has one. Cylinders use the exact normal-cross derivation; cones, tori, and
 * surfaces of revolution fall back to circle-center sampling. Null otherwise.
 */
export function getSurfaceAxis(
  k: OcctKernelWasm,
  face: KernelShape
): { origin: V3; direction: V3 } | null {
  const type = surfaceType(k, face);
  if (type === 'cylinder') {
    const cyl = deriveCylinder(k, face);
    return cyl ? { origin: cyl.origin, direction: cyl.direction } : null;
  }
  if (type === 'cone' || type === 'torus' || type === 'revolution') {
    return deriveAxisBySampling(k, face);
  }
  return null;
}

/** Cylinder radius + handedness for a cylindrical surface. Null for non-cylinders. */
export function getSurfaceCylinderData(
  k: OcctKernelWasm,
  surface: KernelShape
): { radius: number; isDirect: boolean } | null {
  // OCCT's exact gp_Cylinder accessor (radius + Direct()) — cheaper and more
  // robust than sampling the surface, which returned NaN for degenerate inputs.
  const vec = k.getFaceCylinderData(unwrap(surface));
  try {
    if (vec.size() < 2) return null; // non-cylinder → facade returns an empty vector
    return { radius: vec.get(0), isDirect: vec.get(1) === 1 };
  } finally {
    vec.delete();
  }
}

export function uvFromPoint(
  k: OcctKernelWasm,
  face: KernelShape,
  point: [number, number, number]
): [number, number] | null {
  const vec = k.uvFromPoint(unwrap(face), point[0], point[1], point[2]);
  try {
    if (vec.size() < 2) return null;
    return [vec.get(0), vec.get(1)];
  } finally {
    vec.delete();
  }
}

export function projectPointOnFace(
  k: OcctKernelWasm,
  face: KernelShape,
  point: [number, number, number]
): [number, number, number] {
  const vec = k.projectPointOnFace(unwrap(face), point[0], point[1], point[2]);
  try {
    return [vec.get(0), vec.get(1), vec.get(2)];
  } finally {
    vec.delete();
  }
}

export function classifyPointOnFace(
  k: OcctKernelWasm,
  face: KernelShape,
  u: number,
  v: number,
  _tolerance?: number
): 'in' | 'on' | 'out' {
  return k.classifyPointOnFace(unwrap(face), u, v).toLowerCase() as 'in' | 'on' | 'out';
}

export function projectEdges(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  cameraOrigin: [number, number, number],
  cameraDirection: [number, number, number],
  cameraXAxis?: [number, number, number]
): {
  visible: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
  hidden: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
} {
  const [ox, oy, oz] = cameraOrigin;
  const [dx, dy, dz] = cameraDirection;
  const hasXAxis = !!cameraXAxis;
  const [xx, xy, xz] = cameraXAxis ?? [1, 0, 0];
  const proj = k.projectEdges(unwrap(shape), ox, oy, oz, dx, dy, dz, xx, xy, xz, hasXAxis);
  const wrapOrNull = (id: number): KernelShape =>
    id === 0
      ? handle('compound', k.makeCompound(new Module.VectorUint32()))
      : handle('compound', id);
  return {
    visible: {
      outline: wrapOrNull(proj.visibleOutline),
      smooth: wrapOrNull(proj.visibleSmooth),
      sharp: wrapOrNull(proj.visibleSharp),
    },
    hidden: {
      outline: wrapOrNull(proj.hiddenOutline),
      smooth: wrapOrNull(proj.hiddenSmooth),
      sharp: wrapOrNull(proj.hiddenSharp),
    },
  };
}
