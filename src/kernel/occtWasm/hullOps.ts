/* v8 ignore file -- occt-wasm kernel not available in brepkit test suite */
/**
 * Convex hull operations for the occt-wasm adapter.
 *
 * Implements an incremental gift-wrapping algorithm: start from a tetrahedron
 * formed by 4 non-coplanar points, then for each remaining point find the
 * faces visible from it, remove them, and stitch new faces along the horizon.
 * The resulting face list is materialised into an OCCT solid via
 * `buildSolidFromFaces`.
 *
 * @module
 */

import type { KernelShape } from '@/kernel/types.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import { buildSolidFromFaces } from './constructionOps.js';

function findHorizonEdges(
  faces: [number, number, number][],
  visible: number[]
): [number, number][] {
  const visSet = new Set(visible);
  const horizon: [number, number][] = [];
  for (const fi of visible) {
    const f = faces[fi] as [number, number, number];
    for (let ei = 0; ei < 3; ei++) {
      const a = f[ei] as number,
        b = f[(ei + 1) % 3] as number;
      const hasAdjacentNonVisible = faces.some(
        (g, fj) =>
          fj !== fi &&
          !visSet.has(fj) &&
          [0, 1, 2].some((ej) => g[ej] === b && g[(ej + 1) % 3] === a)
      );
      if (hasAdjacentNonVisible) horizon.push([a, b]);
    }
  }
  return horizon;
}

export function computeConvexHullFaces(
  pts: Array<{ x: number; y: number; z: number }>
): Array<readonly [number, number, number]> {
  type V = { x: number; y: number; z: number };
  const cross = (a: V, b: V): V => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });
  const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;

  const n = pts.length;
  const faces: Array<[number, number, number]> = [];
  const p0 = pts[0] as V;
  let i1 = 1;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounds checked by i1 < n
  while (i1 < n && Math.hypot(pts[i1]!.x - p0.x, pts[i1]!.y - p0.y, pts[i1]!.z - p0.z) < 1e-10)
    i1++;
  let i2 = i1 + 1;
  const e01 = sub(pts[i1] as V, p0);
  while (i2 < n) {
    const c = cross(e01, sub(pts[i2] as V, p0));
    if (Math.hypot(c.x, c.y, c.z) > 1e-10) break;
    i2++;
  }
  let i3 = i2 + 1;
  const norm = cross(e01, sub(pts[i2] as V, p0));
  while (i3 < n) {
    if (Math.abs(dot(norm, sub(pts[i3] as V, p0))) > 1e-10) break;
    i3++;
  }
  if (i3 >= n) return [[0, 1, 2]];
  const vol = dot(cross(sub(pts[i1] as V, p0), sub(pts[i2] as V, p0)), sub(pts[i3] as V, p0));
  if (vol > 0) {
    faces.push([0, i1, i2], [0, i2, i3], [0, i3, i1], [i1, i3, i2]);
  } else {
    faces.push([0, i2, i1], [0, i3, i2], [0, i1, i3], [i2, i3, i1]);
  }
  const used = new Set([0, i1, i2, i3]);
  for (let pi = 0; pi < n; pi++) {
    if (used.has(pi)) continue;
    const p = pts[pi] as V;
    const visible: number[] = [];
    for (let fi = 0; fi < faces.length; fi++) {
      const f = faces[fi] as [number, number, number];
      const n2 = cross(sub(pts[f[1]] as V, pts[f[0]] as V), sub(pts[f[2]] as V, pts[f[0]] as V));
      if (dot(n2, sub(p, pts[f[0]] as V)) > 1e-10) visible.push(fi);
    }
    if (visible.length === 0) continue;
    const horizon = findHorizonEdges(faces, visible);
    visible.sort((a2, b2) => b2 - a2);
    for (const fi of visible) faces.splice(fi, 1);
    for (const [a, b] of horizon) faces.push([a, b, pi]);
  }
  return faces;
}

export function hullFromPoints(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  points: Array<{ x: number; y: number; z: number }>,
  tolerance: number
): KernelShape {
  if (points.length < 4) throw new Error('hullFromPoints: need at least 4 points');
  const faces = computeConvexHullFaces(points);
  return buildSolidFromFaces(k, Module, points, faces, tolerance);
}
