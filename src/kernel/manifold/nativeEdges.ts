/**
 * Native B-rep-like edge extraction from a Manifold mesh — no OCCT replay.
 *
 * A B-rep edge is the boundary between two faces. In the mesh that is the set
 * of triangle edges whose two adjacent triangles carry different `faceID`s
 * (faces being coplanar-triangle groups — see {@link ./nativeFaces.js}).
 * Grouping those feature edges by their faceID-pair and chaining them into
 * ordered polylines recovers edges with tangent/length/bbox, so `edgeFinder`
 * (parallelTo / inDirection / atDistance / ofLength) runs natively instead of
 * replaying the op-graph onto OCCT.
 *
 * Edges are polylines: straight runs classify as LINE, curved runs as CIRCLE
 * (an approximation adequate for the planar/axis selections gridfinity makes —
 * e.g. vertical lip edges). Callers needing exact curve parametrization fall
 * back to the OCCT replay path.
 * @module
 */

import type { KernelShape } from '@/kernel/types.js';

type Vec3 = [number, number, number];

export interface NativeEdge {
  readonly __nativeEdge: true;
  /** Sorted faceID pair the edge bounds (provenance / identity). */
  readonly faces: readonly [number, number];
  /** Ordered polyline points (flat triples). */
  readonly pts: Float32Array;
  /** Cumulative arc length at each point (length === arc[arc.length-1]). */
  readonly arc: Float32Array;
  readonly length: number;
  readonly min: Vec3;
  readonly max: Vec3;
  /** 'LINE' when the polyline is straight, else 'CIRCLE'. */
  readonly curveType: 'LINE' | 'CIRCLE';
}

interface ManifoldMesh {
  readonly numProp: number;
  readonly vertProperties: Float32Array;
  readonly triVerts: Uint32Array;
  readonly faceID?: Uint32Array;
}

// Dihedral threshold: triangles whose normals deviate by less than 45° are
// treated as one smooth surface (not a crease), so a coarse cylinder/fillet's
// facets (≤30° apart at the 30° min-circular-angle used for preview) merge into
// one surface instead of fanning into spurious edges, while real sharp edges
// (90° box/rim corners) are kept. Tangent-continuous fillet↔wall joins (G1) also
// fall below it and stay un-split.
const CREASE_COS = Math.cos((45 * Math.PI) / 180);

const edgeKey = (a: number, b: number): number => (a < b ? a * 1e9 + b : b * 1e9 + a);
const pairKey = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`);

/**
 * Extract feature edges (face-pair boundaries) from a manifold solid's mesh.
 */
export function extractEdges(meshUnknown: unknown): NativeEdge[] {
  const mesh = meshUnknown as ManifoldMesh;
  const tv = mesh.triVerts;
  const vp = mesh.vertProperties;
  const stride = mesh.numProp || 3;
  const faceID = mesh.faceID;
  const triCount = tv.length / 3;
  if (!faceID) return [];

  const pos = (vi: number): Vec3 => {
    const o = vi * stride;
    return [vp[o] ?? 0, vp[o + 1] ?? 0, vp[o + 2] ?? 0];
  };

  const triNormal = (t: number): Vec3 => {
    const a = pos(tv[t * 3] ?? 0);
    const b = pos(tv[t * 3 + 1] ?? 0);
    const c = pos(tv[t * 3 + 2] ?? 0);
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };

  // For each undirected mesh-edge, record the faceID + normal of its triangles.
  const edgeFaces = new Map<number, { v: [number, number]; faces: number[]; nrm: Vec3[] }>();
  for (let t = 0; t < triCount; t++) {
    const a = tv[t * 3] ?? 0;
    const b = tv[t * 3 + 1] ?? 0;
    const c = tv[t * 3 + 2] ?? 0;
    const fid = faceID[t] ?? t;
    const n = triNormal(t);
    for (const [u, w] of [
      [a, b],
      [b, c],
      [c, a],
    ] as [number, number][]) {
      const k = edgeKey(u, w);
      let e = edgeFaces.get(k);
      if (!e) {
        e = { v: [u, w], faces: [], nrm: [] };
        edgeFaces.set(k, e);
      }
      e.faces.push(fid);
      e.nrm.push(n);
    }
  }

  // A real B-rep edge is a mesh-edge whose two triangles (a) belong to different
  // faces AND (b) meet at a sharp dihedral angle. Skipping near-tangent
  // transitions collapses the facets of a smooth surface (cylinder/fillet) so
  // they don't masquerade as a fan of spurious edges — keeping edge counts
  // tessellation- and orientation-invariant.
  const groups = new Map<string, { faces: [number, number]; segs: [number, number][] }>();
  for (const { v, faces, nrm } of edgeFaces.values()) {
    if (faces.length !== 2) continue;
    const [f0, f1] = faces as [number, number];
    if (f0 === f1) continue;
    const [n0, n1] = nrm as [Vec3, Vec3];
    const dot = n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2];
    if (dot > CREASE_COS) continue; // near-tangent → smooth surface, not an edge
    const key = pairKey(f0, f1);
    let g = groups.get(key);
    if (!g) {
      g = { faces: f0 < f1 ? [f0, f1] : [f1, f0], segs: [] };
      groups.set(key, g);
    }
    g.segs.push(v);
  }

  const edges: NativeEdge[] = [];
  for (const { faces, segs } of groups.values()) {
    for (const chain of chainSegments(segs)) {
      edges.push(buildEdge(faces, chain, pos));
    }
  }
  return edges;
}

/** Order a bag of undirected vertex-pair segments into one or more vertex chains. */
function chainSegments(segs: [number, number][]): number[][] {
  const adj = new Map<number, number[]>();
  const used = new Set<number>(); // segment indices
  const addAdj = (v: number, i: number): void => {
    let list = adj.get(v);
    if (!list) {
      list = [];
      adj.set(v, list);
    }
    list.push(i);
  };
  segs.forEach(([a, b], i) => {
    addAdj(a, i);
    addAdj(b, i);
  });

  const otherEnd = (i: number, v: number): number => {
    const s = segs[i] ?? [v, v];
    return s[0] === v ? s[1] : s[0];
  };
  const chains: number[][] = [];
  for (let start = 0; start < segs.length; start++) {
    if (used.has(start)) continue;
    used.add(start);
    const s = segs[start] ?? [0, 0];
    const chain = [s[0], s[1]];
    // extend forward from chain end
    for (let guard = 0; guard < segs.length; guard++) {
      const tail = chain[chain.length - 1] ?? 0;
      const next = (adj.get(tail) ?? []).find((i) => !used.has(i));
      if (next === undefined) break;
      used.add(next);
      chain.push(otherEnd(next, tail));
    }
    // extend backward from chain head
    for (let guard = 0; guard < segs.length; guard++) {
      const head = chain[0] ?? 0;
      const prev = (adj.get(head) ?? []).find((i) => !used.has(i));
      if (prev === undefined) break;
      used.add(prev);
      chain.unshift(otherEnd(prev, head));
    }
    chains.push(chain);
  }
  return chains;
}

function buildEdge(
  faces: [number, number],
  chain: number[],
  pos: (vi: number) => Vec3
): NativeEdge {
  const n = chain.length;
  const pts = new Float32Array(n * 3);
  const arc = new Float32Array(n);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let len = 0;
  let prev: Vec3 | null = null;
  for (let i = 0; i < n; i++) {
    const p = pos(chain[i] ?? 0);
    pts[i * 3] = p[0];
    pts[i * 3 + 1] = p[1];
    pts[i * 3 + 2] = p[2];
    if (prev) len += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
    arc[i] = len;
    prev = p;
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[2] < minZ) minZ = p[2];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
    if (p[2] > maxZ) maxZ = p[2];
  }
  return {
    __nativeEdge: true,
    faces,
    pts,
    arc,
    length: len,
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    curveType: isStraight(pts) ? 'LINE' : 'CIRCLE',
  };
}

/** Straight if every interior point lies on the chord within a small tolerance. */
function isStraight(pts: Float32Array): boolean {
  const n = pts.length / 3;
  if (n <= 2) return true;
  const ax = pts[0] ?? 0;
  const ay = pts[1] ?? 0;
  const az = pts[2] ?? 0;
  const bx = pts[(n - 1) * 3] ?? 0;
  const by = pts[(n - 1) * 3 + 1] ?? 0;
  const bz = pts[(n - 1) * 3 + 2] ?? 0;
  let dx = bx - ax;
  let dy = by - ay;
  let dz = bz - az;
  const dl = Math.hypot(dx, dy, dz) || 1;
  dx /= dl;
  dy /= dl;
  dz /= dl;
  for (let i = 1; i < n - 1; i++) {
    const px = (pts[i * 3] ?? 0) - ax;
    const py = (pts[i * 3 + 1] ?? 0) - ay;
    const pz = (pts[i * 3 + 2] ?? 0) - az;
    const t = px * dx + py * dy + pz * dz;
    const ex = px - t * dx;
    const ey = py - t * dy;
    const ez = pz - t * dz;
    if (Math.hypot(ex, ey, ez) > 1e-6 * Math.max(1, dl)) return false;
  }
  return true;
}

export interface NativeVertex {
  readonly __nativeVertex: true;
  readonly point: Vec3;
}

/**
 * Extract B-rep vertices: mesh vertices where three or more distinct faces
 * (faceID groups) meet — i.e. the corners where edges terminate. A box yields
 * its 8 corners; interior/edge-midpoint vertices (1–2 faces) are excluded.
 */
export function extractVertices(meshUnknown: unknown): NativeVertex[] {
  const mesh = meshUnknown as ManifoldMesh;
  const tv = mesh.triVerts;
  const vp = mesh.vertProperties;
  const stride = mesh.numProp || 3;
  const faceID = mesh.faceID;
  if (!faceID) return [];
  const triCount = tv.length / 3;

  const facesAtVert = new Map<number, Set<number>>();
  for (let t = 0; t < triCount; t++) {
    const fid = faceID[t] ?? t;
    for (let j = 0; j < 3; j++) {
      const v = tv[t * 3 + j] ?? 0;
      let s = facesAtVert.get(v);
      if (!s) {
        s = new Set();
        facesAtVert.set(v, s);
      }
      s.add(fid);
    }
  }

  const verts: NativeVertex[] = [];
  for (const [v, faces] of facesAtVert) {
    if (faces.size < 3) continue;
    const o = v * stride;
    verts.push({ __nativeVertex: true, point: [vp[o] ?? 0, vp[o + 1] ?? 0, vp[o + 2] ?? 0] });
  }
  return verts;
}

export function isNativeVertex(shape: KernelShape): shape is KernelShape & NativeVertex {
  return (
    !!shape &&
    typeof shape === 'object' &&
    (shape as { __nativeVertex?: boolean }).__nativeVertex === true
  );
}

export function isNativeEdge(shape: KernelShape): shape is KernelShape & NativeEdge {
  return (
    !!shape &&
    typeof shape === 'object' &&
    (shape as { __nativeEdge?: boolean }).__nativeEdge === true
  );
}

/** Point at arc-length `s` along the edge polyline. */
export function edgePointAt(edge: NativeEdge, s: number): Vec3 {
  const { pts, arc } = edge;
  const n = arc.length;
  if (n === 0) return [0, 0, 0];
  if (s <= 0) return [pts[0] ?? 0, pts[1] ?? 0, pts[2] ?? 0];
  if (s >= edge.length)
    return [pts[(n - 1) * 3] ?? 0, pts[(n - 1) * 3 + 1] ?? 0, pts[(n - 1) * 3 + 2] ?? 0];
  let i = 1;
  while (i < n && (arc[i] ?? 0) < s) i++;
  const a0 = arc[i - 1] ?? 0;
  const a1 = arc[i] ?? a0;
  const t = a1 > a0 ? (s - a0) / (a1 - a0) : 0;
  const o0 = (i - 1) * 3;
  const o1 = i * 3;
  return [
    (pts[o0] ?? 0) + ((pts[o1] ?? 0) - (pts[o0] ?? 0)) * t,
    (pts[o0 + 1] ?? 0) + ((pts[o1 + 1] ?? 0) - (pts[o0 + 1] ?? 0)) * t,
    (pts[o0 + 2] ?? 0) + ((pts[o1 + 2] ?? 0) - (pts[o0 + 2] ?? 0)) * t,
  ];
}

/** Unit tangent at arc-length `s` (direction of the containing segment). */
export function edgeTangentAt(edge: NativeEdge, s: number): Vec3 {
  const { pts, arc } = edge;
  const n = arc.length;
  if (n < 2) return [1, 0, 0];
  let i = 1;
  while (i < n - 1 && (arc[i] ?? 0) < s) i++;
  const o0 = (i - 1) * 3;
  const o1 = i * 3;
  const dx = (pts[o1] ?? 0) - (pts[o0] ?? 0);
  const dy = (pts[o1 + 1] ?? 0) - (pts[o0 + 1] ?? 0);
  const dz = (pts[o1 + 2] ?? 0) - (pts[o0 + 2] ?? 0);
  const l = Math.hypot(dx, dy, dz) || 1;
  return [dx / l, dy / l, dz / l];
}
