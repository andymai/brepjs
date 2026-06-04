/**
 * Native B-rep-like face extraction from a Manifold mesh — no OCCT replay.
 *
 * Manifold tags every triangle with a `faceID` (coplanar triangles share one)
 * and maintains it through booleans, plus `runOriginalID` recording which
 * construction op each triangle came from. Grouping triangles by `faceID`
 * recovers planar faces with stable identity and provenance, so `faceFinder`
 * predicates (parallelTo / atDistance / ofSurfaceType) can run against native
 * face geometry instead of replaying the whole op-graph onto OCCT — the
 * previous behaviour that made the manifold kernel catastrophically slow for
 * face-finder-heavy generators (shell, scoops).
 *
 * Faces here are planar by construction (a faceID groups coplanar triangles).
 * Curved B-rep faces tessellate into many faceIDs; those still surface as
 * (many small) planar facets — acceptable for the planar selections gridfinity
 * relies on, and callers needing exact curved-surface queries fall back to the
 * OCCT replay path.
 * @module
 */

import type { KernelShape } from '@/kernel/types.js';

type Vec3 = [number, number, number];

export interface NativeFace {
  readonly __nativeFace: true;
  /** manifold faceID (stable through booleans). */
  readonly faceId: number;
  /** runOriginalID of the construction op these triangles came from (provenance). */
  readonly originId: number;
  /** Unit outward normal (area-weighted). */
  readonly normal: Vec3;
  /** Area-weighted centroid. */
  readonly center: Vec3;
  /** Total area. */
  readonly area: number;
  /** Axis-aligned bounds. */
  readonly min: Vec3;
  readonly max: Vec3;
  /** Triangle vertex positions (flat triples) for exact point-distance queries. */
  readonly tris: Float32Array;
}

interface ManifoldMesh {
  readonly numProp: number;
  readonly vertProperties: Float32Array;
  readonly triVerts: Uint32Array;
  readonly faceID?: Uint32Array;
  readonly runOriginalID?: Uint32Array;
  readonly runIndex?: Uint32Array;
}

/** runOriginalID for a triangle index, via the runIndex run boundaries. */
function originOfTri(mesh: ManifoldMesh, triIndex: number): number {
  const { runIndex, runOriginalID } = mesh;
  if (!runIndex || !runOriginalID) return 0;
  const vertPos = triIndex * 3;
  // runIndex is sorted; find the run whose [start,end) contains vertPos.
  for (let r = 0; r < runOriginalID.length; r++) {
    const start = runIndex[r] ?? 0;
    const end = runIndex[r + 1] ?? Number.MAX_SAFE_INTEGER;
    if (vertPos >= start && vertPos < end) return runOriginalID[r] ?? 0;
  }
  return 0;
}

/**
 * Extract planar faces from a manifold solid by grouping triangles on `faceID`.
 * Returns one {@link NativeFace} per group with normal/center/area/bbox/origin.
 */
export function extractFaces(meshUnknown: unknown): NativeFace[] {
  const mesh = meshUnknown as ManifoldMesh;
  const tv = mesh.triVerts;
  const vp = mesh.vertProperties;
  const stride = mesh.numProp || 3;
  const faceID = mesh.faceID;
  const triCount = tv.length / 3;

  const pos = (vi: number): Vec3 => {
    const o = vi * stride;
    return [vp[o] ?? 0, vp[o + 1] ?? 0, vp[o + 2] ?? 0];
  };

  // Group triangle indices by faceID (fallback: every triangle its own group).
  const groups = new Map<number, number[]>();
  for (let t = 0; t < triCount; t++) {
    const id = faceID ? (faceID[t] ?? t) : t;
    let g = groups.get(id);
    if (!g) {
      g = [];
      groups.set(id, g);
    }
    g.push(t);
  }

  const faces: NativeFace[] = [];
  for (const [faceId, tris] of groups) {
    let nx = 0;
    let ny = 0;
    let nz = 0; // Σ triangle cross products (2× area-weighted normal)
    let cx = 0;
    let cy = 0;
    let cz = 0; // Σ area·centroid
    let area = 0;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    const triData = new Float32Array(tris.length * 9);
    let w = 0;

    for (const t of tris) {
      const a = pos(tv[t * 3] ?? 0);
      const b = pos(tv[t * 3 + 1] ?? 0);
      const c = pos(tv[t * 3 + 2] ?? 0);
      const ux = b[0] - a[0];
      const uy = b[1] - a[1];
      const uz = b[2] - a[2];
      const vx = c[0] - a[0];
      const vy = c[1] - a[1];
      const vz = c[2] - a[2];
      const px = uy * vz - uz * vy;
      const py = uz * vx - ux * vz;
      const pz = ux * vy - uy * vx; // cross = 2× triangle area · normal
      nx += px;
      ny += py;
      nz += pz;
      const triArea = 0.5 * Math.hypot(px, py, pz);
      area += triArea;
      // triangle centroid
      const tcx = (a[0] + b[0] + c[0]) / 3;
      const tcy = (a[1] + b[1] + c[1]) / 3;
      const tcz = (a[2] + b[2] + c[2]) / 3;
      cx += triArea * tcx;
      cy += triArea * tcy;
      cz += triArea * tcz;
      for (const p of [a, b, c]) {
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[2] < minZ) minZ = p[2];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
        if (p[2] > maxZ) maxZ = p[2];
        triData[w++] = p[0];
        triData[w++] = p[1];
        triData[w++] = p[2];
      }
    }

    const nlen = Math.hypot(nx, ny, nz) || 1;
    const normal: Vec3 = [nx / nlen, ny / nlen, nz / nlen];
    const center: Vec3 = area > 0 ? [cx / area, cy / area, cz / area] : [0, 0, 0];
    faces.push({
      __nativeFace: true,
      faceId,
      originId: originOfTri(mesh, tris[0] ?? 0),
      normal,
      center,
      area,
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
      tris: triData,
    });
  }
  return faces;
}

export function isNativeFace(shape: KernelShape): shape is KernelShape & NativeFace {
  return (
    !!shape &&
    typeof shape === 'object' &&
    (shape as { __nativeFace?: boolean }).__nativeFace === true
  );
}

/** Minimum distance from a point to a native face's triangle mesh. */
export function pointToFaceDistance(face: NativeFace, p: Vec3): number {
  const t = face.tris;
  let best = Infinity;
  for (let i = 0; i < t.length; i += 9) {
    const d = pointTriangleDistance(
      p,
      [t[i] ?? 0, t[i + 1] ?? 0, t[i + 2] ?? 0],
      [t[i + 3] ?? 0, t[i + 4] ?? 0, t[i + 5] ?? 0],
      [t[i + 6] ?? 0, t[i + 7] ?? 0, t[i + 8] ?? 0]
    );
    if (d < best) best = d;
    if (best === 0) break;
  }
  return best;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Closest distance from point p to triangle (a,b,c) — Ericson's region method. */
function pointTriangleDistance(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return Math.hypot(ap[0], ap[1], ap[2]);
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return Math.hypot(bp[0], bp[1], bp[2]);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const q: Vec3 = [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]];
    const pq = sub(p, q);
    return Math.hypot(pq[0], pq[1], pq[2]);
  }
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return Math.hypot(cp[0], cp[1], cp[2]);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const q: Vec3 = [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]];
    const pq = sub(p, q);
    return Math.hypot(pq[0], pq[1], pq[2]);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    const q: Vec3 = [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])];
    const pq = sub(p, q);
    return Math.hypot(pq[0], pq[1], pq[2]);
  }
  // inside face region — perpendicular distance to plane
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const q: Vec3 = [
    a[0] + ab[0] * v + ac[0] * w,
    a[1] + ab[1] * v + ac[1] * w,
    a[2] + ab[2] * v + ac[2] * w,
  ];
  const pq = sub(p, q);
  return Math.hypot(pq[0], pq[1], pq[2]);
}
