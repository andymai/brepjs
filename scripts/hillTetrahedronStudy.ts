/**
 * Hill tetrahedron volume study — random face-to-face assemblies.
 *
 * Builds assemblies of N Hill tets by attaching one at a time to a random
 * free face (same edge-length signature, both chiralities allowed),
 * rejecting overlapping placements. Reports V (convex hull volume — the
 * vacuum-bag shrink-wrap upper bound), Vstar = N L^3 / 6 (sum of part
 * volumes), and the packing efficiency Vstar/V averaged over many seeds.
 *
 * Usage:  npx tsx scripts/hillTetrahedronStudy.ts [--N 50] [--trials 25] [--seed 1]
 */

import { initOC } from '../tests/setup.js';
import { convexHull, measureVolume, polyhedron, unwrap } from '../src/index.js';
import type { Vec3 } from '../src/index.js';

type Tri = readonly [Vec3, Vec3, Vec3];
type Tet = { verts: readonly [Vec3, Vec3, Vec3, Vec3]; chirality: 'R' | 'L' };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): number => Math.sqrt(dot(a, a));
const unit = (a: Vec3): Vec3 => scale(a, 1 / norm(a));
const centroid = (...vs: Vec3[]): Vec3 =>
  scale(vs.reduce((acc, v) => add(acc, v), [0, 0, 0] as Vec3), 1 / vs.length);

// Faces of a Hill T in vertex-index space, oriented outward (right-handed verts).
// Same indices work for left-handed by reversing each face's winding.
const HILL_FACE_IDX_R: ReadonlyArray<readonly [number, number, number]> = [
  [0, 2, 1],
  [1, 2, 3],
  [0, 3, 2],
  [0, 1, 3],
];

function hillVerts(L: number, chirality: 'R' | 'L'): [Vec3, Vec3, Vec3, Vec3] {
  const s = chirality === 'R' ? 1 : -1;
  return [
    [0, 0, 0],
    [s * L, 0, 0],
    [s * L, L, 0],
    [s * L, L, L],
  ];
}

function tetFaces(t: Tet): Tri[] {
  return HILL_FACE_IDX_R.map(([i, j, k]) => {
    if (t.chirality === 'R') return [t.verts[i], t.verts[j], t.verts[k]] as Tri;
    return [t.verts[k], t.verts[j], t.verts[i]] as Tri;
  });
}

function faceNormal(tri: Tri): Vec3 {
  return unit(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])));
}

function edgeLenSig(tri: Tri): [number, number, number] {
  const a = norm(sub(tri[1], tri[0]));
  const b = norm(sub(tri[2], tri[1]));
  const c = norm(sub(tri[0], tri[2]));
  return [a, b, c].sort((x, y) => x - y) as [number, number, number];
}

const EPS = 1e-7;
function sigsEqual(a: [number, number, number], b: [number, number, number]): boolean {
  return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS && Math.abs(a[2] - b[2]) < EPS;
}

// Cyclic rotations of a triangle that preserve its edge-length sequence.
// Returns the index permutations to apply to triangle B to align it with A.
function matchingRotations(A: Tri, B: Tri): number[][] {
  const [a01, a12, a20] = [
    norm(sub(A[1], A[0])),
    norm(sub(A[2], A[1])),
    norm(sub(A[0], A[2])),
  ];
  const Bedges = [
    norm(sub(B[1], B[0])),
    norm(sub(B[2], B[1])),
    norm(sub(B[0], B[2])),
  ];
  const matches: number[][] = [];
  // Try each of 3 cyclic shifts of B
  for (let s = 0; s < 3; s++) {
    const e0 = Bedges[s];
    const e1 = Bedges[(s + 1) % 3];
    const e2 = Bedges[(s + 2) % 3];
    if (Math.abs(e0! - a01) < EPS && Math.abs(e1! - a12) < EPS && Math.abs(e2! - a20) < EPS) {
      matches.push([s, (s + 1) % 3, (s + 2) % 3]);
    }
  }
  return matches;
}

// Compute the 3x3 rotation matrix that maps template frame to target frame.
// Both frames are orthonormal {u, v, w}. R = M_target * M_template^T.
function frameToFrame(
  tU: Vec3, tV: Vec3, tW: Vec3,
  sU: Vec3, sV: Vec3, sW: Vec3
): [number, number, number, number, number, number, number, number, number] {
  // Columns of target M_t are tU, tV, tW; columns of source M_s are sU, sV, sW.
  // R = M_t * M_s^T  (since M_s is orthonormal, inverse = transpose).
  // (R * sU = tU, etc.)
  const r = (i: number, j: number): number =>
    tU[i] * sU[j] + tV[i] * sV[j] + tW[i] * sW[j];
  return [r(0,0), r(0,1), r(0,2), r(1,0), r(1,1), r(1,2), r(2,0), r(2,1), r(2,2)];
}

function applyR(R: number[], v: Vec3): Vec3 {
  return [
    R[0]! * v[0] + R[1]! * v[1] + R[2]! * v[2],
    R[3]! * v[0] + R[4]! * v[1] + R[5]! * v[2],
    R[6]! * v[0] + R[7]! * v[1] + R[8]! * v[2],
  ];
}

// Mate template tet so that template face index `tfIdx` lies on target face `target`
// with opposite normal and vertex permutation `perm` (length 3).
function mateTet(template: Tet, tfIdx: number, target: Tri, perm: number[]): Tet | null {
  const tFaces = tetFaces(template);
  const F = tFaces[tfIdx];
  if (!F) return null;

  // Source frame from template face F (after permutation)
  const Fperm: Tri = [F[perm[0]!], F[perm[1]!], F[perm[2]!]];
  const sC = centroid(Fperm[0], Fperm[1], Fperm[2]);
  const sN = faceNormal(Fperm);
  const sU = unit(sub(Fperm[1], Fperm[0]));
  const sW = sN; // outward
  const sV = cross(sW, sU);

  // Target frame from face (we want template's outward normal flipped to point INTO target tet)
  // so map sW -> -tN, sU -> tU, sV -> -tV (to keep right-handed frame with flipped normal).
  const tC = centroid(target[0], target[1], target[2]);
  const tN = faceNormal(target);
  const tU = unit(sub(target[1], target[0]));
  const tWflip: Vec3 = scale(tN, -1);
  const tVflip = cross(tWflip, tU); // = -tN x tU = -(tN x tU)

  const R = frameToFrame(tU, tVflip, tWflip, sU, sV, sW);
  // After rotating template, translate so that sC -> tC
  const newVerts = template.verts.map((v) => {
    const rotated = applyR(R, sub(v, sC));
    return add(rotated, tC);
  }) as [Vec3, Vec3, Vec3, Vec3];

  // Rotation may flip chirality — but if both frames are right-handed and we flip
  // exactly one axis (the normal), determinant is +1 so chirality preserved.
  // (We flipped W AND V, so det = +1.)
  return { verts: newVerts, chirality: template.chirality };
}

// ---------------------------------------------------------------------------
// Overlap test: AABB-based fast reject + barycentric tet-tet intersection
// ---------------------------------------------------------------------------

function aabb(verts: readonly Vec3[]): [Vec3, Vec3] {
  let lo: Vec3 = [Infinity, Infinity, Infinity];
  let hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const v of verts) {
    lo = [Math.min(lo[0], v[0]), Math.min(lo[1], v[1]), Math.min(lo[2], v[2])];
    hi = [Math.max(hi[0], v[0]), Math.max(hi[1], v[1]), Math.max(hi[2], v[2])];
  }
  return [lo, hi];
}

function aabbOverlap(a: [Vec3, Vec3], b: [Vec3, Vec3]): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[1][i]! < b[0][i]! - EPS || b[1][i]! < a[0][i]! - EPS) return false;
  }
  return true;
}

// Volume of tetrahedron from 4 points.
function tetVol(v: readonly [Vec3, Vec3, Vec3, Vec3]): number {
  const a = sub(v[1], v[0]);
  const b = sub(v[2], v[0]);
  const c = sub(v[3], v[0]);
  return Math.abs(dot(a, cross(b, c))) / 6;
}

// Strictly-inside test: all barycentric coords > `margin`. A POSITIVE margin
// means "must be at least `margin` inside" — so points on a shared face
// (margin ~ 0) don't count as overlap.
function pointStrictlyIn(
  p: Vec3,
  t: readonly [Vec3, Vec3, Vec3, Vec3],
  margin: number
): boolean {
  const v0 = sub(t[1], t[0]);
  const v1 = sub(t[2], t[0]);
  const v2 = sub(t[3], t[0]);
  const denom = dot(v0, cross(v1, v2));
  if (Math.abs(denom) < 1e-12) return false;
  const r = sub(p, t[0]);
  const c1 = dot(r, cross(v1, v2)) / denom;
  const c2 = dot(v0, cross(r, v2)) / denom;
  const c3 = dot(v0, cross(v1, r)) / denom;
  const c0 = 1 - c1 - c2 - c3;
  return c0 > margin && c1 > margin && c2 > margin && c3 > margin;
}

// Two tets overlap iff their interiors share volume. We treat any of:
//   - a centroid strictly inside the other tet
//   - a vertex strictly inside (margin-deep) the other tet
//   - an edge of one crossing a face of the other in interior of both
// as overlap. Shared faces / edges / vertices are allowed (margin > 0).
function segPlaneIntersect(
  p0: Vec3,
  p1: Vec3,
  fa: Vec3,
  fb: Vec3,
  fc: Vec3
): { t: number; pt: Vec3 } | null {
  const n = cross(sub(fb, fa), sub(fc, fa));
  const denom = dot(n, sub(p1, p0));
  if (Math.abs(denom) < 1e-12) return null;
  const t = dot(n, sub(fa, p0)) / denom;
  if (t <= 1e-6 || t >= 1 - 1e-6) return null;
  const pt: Vec3 = [
    p0[0] + t * (p1[0] - p0[0]),
    p0[1] + t * (p1[1] - p0[1]),
    p0[2] + t * (p1[2] - p0[2]),
  ];
  return { t, pt };
}

function pointInTri(p: Vec3, a: Vec3, b: Vec3, c: Vec3, margin: number): boolean {
  const v0 = sub(c, a);
  const v1 = sub(b, a);
  const v2 = sub(p, a);
  const d00 = dot(v0, v0),
    d01 = dot(v0, v1),
    d02 = dot(v0, v2),
    d11 = dot(v1, v1),
    d12 = dot(v1, v2);
  const denom = d00 * d11 - d01 * d01;
  if (Math.abs(denom) < 1e-15) return false;
  const u = (d11 * d02 - d01 * d12) / denom;
  const v = (d00 * d12 - d01 * d02) / denom;
  return u > margin && v > margin && u + v < 1 - margin;
}

function tetsOverlap(
  A: readonly [Vec3, Vec3, Vec3, Vec3],
  B: readonly [Vec3, Vec3, Vec3, Vec3]
): boolean {
  if (!aabbOverlap(aabb(A), aabb(B))) return false;
  const L = Math.max(
    norm(sub(A[1], A[0])),
    norm(sub(A[2], A[0])),
    norm(sub(A[3], A[0]))
  );
  const margin = L * 1e-3;
  // Centroid + vertex tests (catches deep overlaps)
  if (pointStrictlyIn(centroid(...A), B, margin)) return true;
  if (pointStrictlyIn(centroid(...B), A, margin)) return true;
  for (const v of A) if (pointStrictlyIn(v, B, margin)) return true;
  for (const v of B) if (pointStrictlyIn(v, A, margin)) return true;
  // Edge-face crossing test (catches shallow interpenetration)
  const tetEdges: ReadonlyArray<readonly [number, number]> = [
    [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3],
  ];
  const tetFaceIdx: ReadonlyArray<readonly [number, number, number]> = [
    [1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1],
  ];
  for (const [i, j] of tetEdges) {
    for (const [fi, fj, fk] of tetFaceIdx) {
      const hit = segPlaneIntersect(A[i]!, A[j]!, B[fi]!, B[fj]!, B[fk]!);
      if (hit && pointInTri(hit.pt, B[fi]!, B[fj]!, B[fk]!, 1e-3)) return true;
    }
  }
  for (const [i, j] of tetEdges) {
    for (const [fi, fj, fk] of tetFaceIdx) {
      const hit = segPlaneIntersect(B[i]!, B[j]!, A[fi]!, A[fj]!, A[fk]!);
      if (hit && pointInTri(hit.pt, A[fi]!, A[fj]!, A[fk]!, 1e-3)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 1; }
  next(): number {
    this.s = (this.s * 1664525 + 1013904223) >>> 0;
    return this.s / 0x100000000;
  }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]!; }
}

interface AssemblyResult {
  N: number;
  V: number;        // convex hull volume of all tet vertices (vacuum-bag bound)
  Vstar: number;    // sum of tet volumes = N * L^3 / 6
  efficiency: number; // Vstar / V (1 = perfect tiling, <1 = voids)
  tetsPlaced: number;
}

async function runAssembly(N: number, L: number, rng: Rng, maxRetries = 60): Promise<AssemblyResult> {
  const seed: Tet = { verts: hillVerts(L, 'R'), chirality: 'R' };
  const tets: Tet[] = [seed];
  // Each free face is identified by (tetIndex, faceIndex) — but we also need
  // to remove it when something glues to it. Simpler: keep a list of {tri, parentVerts}.
  type FreeFace = { tri: Tri; tetIdx: number; faceIdx: number };
  const freeFaces: FreeFace[] = [];
  for (let f = 0; f < 4; f++) freeFaces.push({ tri: tetFaces(seed)[f]!, tetIdx: 0, faceIdx: f });

  while (tets.length < N) {
    let placed = false;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (freeFaces.length === 0) break;
      const ffIdx = Math.floor(rng.next() * freeFaces.length);
      const ff = freeFaces[ffIdx]!;
      const targetSig = edgeLenSig(ff.tri);

      // Pick random new tet chirality + template face that matches signature
      const chirality: 'R' | 'L' = rng.next() < 0.5 ? 'R' : 'L';
      const templateProto: Tet = { verts: hillVerts(L, chirality), chirality };
      const tFaces = tetFaces(templateProto);
      const compatible: number[] = [];
      for (let i = 0; i < 4; i++) {
        if (sigsEqual(edgeLenSig(tFaces[i]!), targetSig)) compatible.push(i);
      }
      if (compatible.length === 0) continue;
      const tfIdx = compatible[Math.floor(rng.next() * compatible.length)]!;
      const rotations = matchingRotations(ff.tri, tFaces[tfIdx]!);
      if (rotations.length === 0) continue;
      const perm = rotations[Math.floor(rng.next() * rotations.length)]!;

      const placedTet = mateTet(templateProto, tfIdx, ff.tri, perm);
      if (!placedTet) continue;

      // Reject if it overlaps any existing tet (except via the shared face).
      let overlap = false;
      for (let ti = 0; ti < tets.length; ti++) {
        if (ti === ff.tetIdx) continue; // sharing a face with this one is OK
        if (tetsOverlap(placedTet.verts, tets[ti]!.verts)) { overlap = true; break; }
      }
      if (overlap) continue;

      // Accept
      tets.push(placedTet);
      const newIdx = tets.length - 1;
      // Remove the glued free face
      freeFaces.splice(ffIdx, 1);
      // The 3 OTHER faces of the new tet are free; the face we mated isn't.
      const newFaces = tetFaces(placedTet);
      for (let f = 0; f < 4; f++) {
        if (f === tfIdx) continue;
        freeFaces.push({ tri: newFaces[f]!, tetIdx: newIdx, faceIdx: f });
      }
      placed = true;
      break;
    }
    if (!placed) break; // got stuck — return what we have
  }

  // Compute convex hull volume of all vertices. 'using' disposes the
  // WASM-backed hull when the try block exits — important when this is
  // called thousands of times in the sweep loop.
  const allVerts: Vec3[] = tets.flatMap((t) => [t.verts[0], t.verts[1], t.verts[2], t.verts[3]]);
  let V: number;
  try {
    using hull = unwrap(convexHull(allVerts));
    V = unwrap(measureVolume(hull));
  } catch {
    V = NaN;
  }
  const tetSumVol = tets.reduce((s, t) => s + tetVol(t.verts), 0);
  const Vstar = tets.length * (L * L * L) / 6;
  return {
    N: tets.length,
    V,
    Vstar: tetSumVol, // use actual sum (same as N*L^3/6 since each is exact)
    efficiency: tetSumVol / V,
    tetsPlaced: tets.length,
  };
}

async function main() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1] ?? '');
  }
  const Nmax = Number(args.get('N') ?? 30);
  const trials = Number(args.get('trials') ?? 12);
  const seed = Number(args.get('seed') ?? 1);
  const L = 1;

  await initOC();

  console.log('# Hill tetrahedron random assembly study');
  console.log(`# L=${L}, V* per tet = L^3/6 = ${(1 / 6).toFixed(6)}`);
  console.log(`# ${trials} trials per N, convex-hull V (vacuum-bag shrink-wrap upper bound)`);
  console.log('#');
  console.log('  N    mean V        mean V*       eff=V*/V     std(eff)    minN');

  for (let N of [1, 2, 3, 4, 6, 8, 12, 16, 20, 25, 30, 40, 50].filter((n) => n <= Nmax)) {
    const effs: number[] = [];
    const Vs: number[] = [];
    const Vstars: number[] = [];
    const placedN: number[] = [];
    for (let t = 0; t < trials; t++) {
      const r = await runAssembly(N, L, new Rng(seed + t * 9973));
      if (Number.isFinite(r.V) && r.V > 0) {
        effs.push(r.efficiency);
        Vs.push(r.V);
        Vstars.push(r.Vstar);
        placedN.push(r.tetsPlaced);
      }
    }
    if (effs.length === 0) {
      console.log(`  ${String(N).padStart(3)}    (no convergent trials)`);
      continue;
    }
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    const std = (a: number[]) => {
      const m = mean(a);
      return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
    };
    console.log(
      `  ${String(N).padStart(3)}    ${mean(Vs).toFixed(5)}      ${mean(Vstars).toFixed(5)}      ${mean(effs).toFixed(4)}       ${std(effs).toFixed(4)}     ${Math.min(...placedN)}`
    );
  }
}

void main();
