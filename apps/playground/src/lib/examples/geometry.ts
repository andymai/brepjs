/**
 * Geometry / mathematical examples — space-filling tetrahedra, dissections,
 * and packing demos that show off polyhedron, convexHull, and measurement.
 */
import type { Example } from './types';

const hillTetrahedron = `import { polyhedron, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// The Hill tetrahedron — a space-filling right tetrahedron with vertices
// V0=(0,0,0), V1=(L,0,0), V2=(L,L,0), V3=(L,L,L). Volume = L^3 / 6.
// Two face types: 2 isoceles right (L, L, L*sqrt2) and 2 scalene right
// (L, L*sqrt2, L*sqrt3). Every dihedral angle is a rational multiple of pi,
// so its Dehn invariant is zero — i.e. it's scissors-congruent to a cube.

const L = 30;

// Right-handed tet with V3 above the z=0 base triangle.
const right = unwrap(polyhedron(
  [[0, 0, 0], [L, 0, 0], [L, L, 0], [L, L, L]],
  [[0, 2, 1], [1, 2, 3], [0, 3, 2], [0, 1, 3]],
));

// Mirror through z=0 → left-handed tet sharing the base triangle.
// Mirroring flips chirality, so every face winding reverses to keep
// outward normals consistent. The pair forms a 5-vertex bipyramid.
const left = unwrap(polyhedron(
  [[0, 0, 0], [L, 0, 0], [L, L, 0], [L, L, -L]],
  [[1, 2, 0], [3, 2, 1], [2, 3, 0], [3, 1, 0]],
));

export default [color(right, '#e85d5d'), color(left, '#f5f5f5')];
`;

const hillTetrahedronCube = `import { polyhedron, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Six Hill tetrahedra tile a cube exactly — one per permutation of the
// cube's three edge vectors. Even perms give right-handed pieces, odd
// perms give left-handed. All six share the cube's space diagonal.

const L = 30;
const e = [[L, 0, 0], [0, L, 0], [0, 0, L]];
const perms = [
  { idx: [0, 1, 2], chir: 'R' }, { idx: [1, 2, 0], chir: 'R' }, { idx: [2, 0, 1], chir: 'R' },
  { idx: [0, 2, 1], chir: 'L' }, { idx: [2, 1, 0], chir: 'L' }, { idx: [1, 0, 2], chir: 'L' },
];

function tetFromPts(pts) {
  const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
  const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
  const cz = (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4;
  const ringIdx = [[1,2,3], [0,3,2], [0,1,3], [0,2,1]];
  const faces = ringIdx.map(([i, j, k]) => {
    const Vi = pts[i], Vj = pts[j], Vk = pts[k];
    const ux = Vj[0]-Vi[0], uy = Vj[1]-Vi[1], uz = Vj[2]-Vi[2];
    const vx = Vk[0]-Vi[0], vy = Vk[1]-Vi[1], vz = Vk[2]-Vi[2];
    const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    const fx = (Vi[0]+Vj[0]+Vk[0])/3, fy = (Vi[1]+Vj[1]+Vk[1])/3, fz = (Vi[2]+Vj[2]+Vk[2])/3;
    return ((fx - cx) * nx + (fy - cy) * ny + (fz - cz) * nz) >= 0 ? [i, j, k] : [i, k, j];
  });
  return unwrap(polyhedron(pts, faces));
}

export default perms.map(({ idx: [a, b, c], chir }) => {
  const V0 = [0, 0, 0];
  const V1 = [V0[0]+e[a][0], V0[1]+e[a][1], V0[2]+e[a][2]];
  const V2 = [V1[0]+e[b][0], V1[1]+e[b][1], V1[2]+e[b][2]];
  const V3 = [V2[0]+e[c][0], V2[1]+e[c][1], V2[2]+e[c][2]];
  const piece = translate(tetFromPts([V0, V1, V2, V3]), [-L/2, -L/2, -L/2]);
  return color(piece, chir === 'R' ? '#e85d5d' : '#f5f5f5');
});
`;

const hillTetrahedronReptile = `import { polyhedron, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// The 8-reptile dissection: a 2L Hill tetrahedron splits into 8 congruent
// unit Hill tetrahedra — 4 corner pieces (same chirality as the parent)
// plus 4 octahedral pieces (opposite chirality, sharing the M02-M13
// diagonal of the central octahedron). Matousek & Safernova (2010) proved
// the m^3-reptile family is the *only* k-reptile family for tetrahedra.
// Exploded outward from the centroid so each sub-tet reads individually.

const L = 20;
const OFFSET = 4;

function tetFromPts(pts) {
  const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
  const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
  const cz = (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4;
  const ringIdx = [[1,2,3], [0,3,2], [0,1,3], [0,2,1]];
  const faces = ringIdx.map(([i, j, k]) => {
    const Vi = pts[i], Vj = pts[j], Vk = pts[k];
    const ux = Vj[0]-Vi[0], uy = Vj[1]-Vi[1], uz = Vj[2]-Vi[2];
    const vx = Vk[0]-Vi[0], vy = Vk[1]-Vi[1], vz = Vk[2]-Vi[2];
    const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    const fx = (Vi[0]+Vj[0]+Vk[0])/3, fy = (Vi[1]+Vj[1]+Vk[1])/3, fz = (Vi[2]+Vj[2]+Vk[2])/3;
    return ((fx - cx) * nx + (fy - cy) * ny + (fz - cz) * nz) >= 0 ? [i, j, k] : [i, k, j];
  });
  return unwrap(polyhedron(pts, faces));
}

const W0 = [0, 0, 0], W1 = [2*L, 0, 0], W2 = [2*L, 2*L, 0], W3 = [2*L, 2*L, 2*L];
const mid = (a, b) => [(a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2];
const M01 = mid(W0, W1), M02 = mid(W0, W2), M03 = mid(W0, W3);
const M12 = mid(W1, W2), M13 = mid(W1, W3), M23 = mid(W2, W3);
const bigC = [(W0[0]+W1[0]+W2[0]+W3[0])/4, (W0[1]+W1[1]+W2[1]+W3[1])/4, (W0[2]+W1[2]+W2[2]+W3[2])/4];

function place(pts, chir) {
  const cx = (pts[0][0]+pts[1][0]+pts[2][0]+pts[3][0])/4;
  const cy = (pts[0][1]+pts[1][1]+pts[2][1]+pts[3][1])/4;
  const cz = (pts[0][2]+pts[1][2]+pts[2][2]+pts[3][2])/4;
  const dx = cx - bigC[0], dy = cy - bigC[1], dz = cz - bigC[2];
  const norm = Math.hypot(dx, dy, dz) || 1;
  const shifted = translate(tetFromPts(pts), [OFFSET*dx/norm, OFFSET*dy/norm, OFFSET*dz/norm]);
  return color(shifted, chir === 'R' ? '#e85d5d' : '#f5f5f5');
}

export default [
  // 4 corner sub-tets — same chirality (R) as the parent.
  place([W0, M01, M02, M03], 'R'),
  place([M01, W1, M12, M13], 'R'),
  place([M02, M12, W2, M23], 'R'),
  place([M03, M13, M23, W3], 'R'),
  // 4 octahedral sub-tets — opposite chirality (L), splitting along M02-M13.
  place([M02, M13, M01, M03], 'L'),
  place([M02, M13, M03, M23], 'L'),
  place([M02, M13, M23, M12], 'L'),
  place([M02, M13, M12, M01], 'L'),
];
`;

const hillTetrahedronGrowth = `import { polyhedron, unwrap, measureVolume, convexHull } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Grow a Hill tetrahedron assembly by mating new tets onto random free faces
// (chirality picked 50/50 per step). Compares two volumes:
//   * V* = N * L^3 / 6 — sum of part volumes, the "ideal" tight-packed bound
//   * V  = convex hull of all vertices — the "vacuum-bag" shrink-wrap upper bound
//
// Efficiency V*/V starts at 1.0 (single tet = its own hull) and drops fast as
// the cluster grows irregular. For random walks it asymptotes near ~0.25.
//
// We trust face-to-face mating to avoid overlaps for low N here — at N=12
// the chirality + face-permutation choice almost never overlaps in practice.

const L = 10;
const N = 12;
const SEED = 1;

let rngState = SEED >>> 0 || 1;
const rng = () => {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 0x100000000;
};

const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const scl = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const nrm = a => Math.sqrt(dot(a, a));
const unit = a => scl(a, 1/nrm(a));
const cent = (...vs) => scl(vs.reduce((s, v) => add(s, v), [0,0,0]), 1/vs.length);

// Canonical Hill tetrahedron at the origin (R or L).
function hillTemplate(L, chirality) {
  const s = chirality === 'R' ? 1 : -1;
  const verts = [[0,0,0], [s*L,0,0], [s*L,L,0], [s*L,L,L]];
  const idxR = [[0,2,1], [1,2,3], [0,3,2], [0,1,3]];
  const faces = chirality === 'R' ? idxR : idxR.map(f => [...f].reverse());
  return { verts, faces, chirality };
}
const faceTris = tet => tet.faces.map(([i,j,k]) => [tet.verts[i], tet.verts[j], tet.verts[k]]);

function tetFromPts(pts) {
  const c = cent(...pts);
  const ringIdx = [[1,2,3], [0,3,2], [0,1,3], [0,2,1]];
  const faces = ringIdx.map(([i,j,k]) => {
    const n = cross(sub(pts[j], pts[i]), sub(pts[k], pts[i]));
    return dot(sub(cent(pts[i], pts[j], pts[k]), c), n) >= 0 ? [i,j,k] : [i,k,j];
  });
  return unwrap(polyhedron(pts, faces));
}

// Place template so its face tfIdx (cyclically rotated by perm) lands
// on target with the opposite outward normal — the only orientation
// compatible with two solids sharing a face.
function mate(template, tfIdx, target, perm) {
  const F = faceTris(template)[tfIdx];
  const Fp = [F[perm[0]], F[perm[1]], F[perm[2]]];
  const sC = cent(...Fp), sU = unit(sub(Fp[1], Fp[0]));
  const sN = unit(cross(sub(Fp[1], Fp[0]), sub(Fp[2], Fp[0])));
  const sV = cross(sN, sU);
  const tC = cent(...target), tU = unit(sub(target[1], target[0]));
  const tN = unit(cross(sub(target[1], target[0]), sub(target[2], target[0])));
  const tWf = scl(tN, -1), tVf = cross(tWf, tU);
  const R = i => [tU[i]*sU[0] + tVf[i]*sV[0] + tWf[i]*sN[0],
                  tU[i]*sU[1] + tVf[i]*sV[1] + tWf[i]*sN[1],
                  tU[i]*sU[2] + tVf[i]*sV[2] + tWf[i]*sN[2]];
  const Rrow = j => [R(0)[j], R(1)[j], R(2)[j]];
  const apply = v => add(tC, [dot(Rrow(0), sub(v, sC)), dot(Rrow(1), sub(v, sC)), dot(Rrow(2), sub(v, sC))]);
  return { verts: template.verts.map(apply), faces: template.faces, chirality: template.chirality };
}

// Sorted edge-length signature of a triangle, and the cyclic shifts of B
// that line its edges up with A (none if the signatures differ).
const sig = tri => [nrm(sub(tri[1], tri[0])), nrm(sub(tri[2], tri[1])), nrm(sub(tri[0], tri[2]))].sort((x, y) => x - y);
const EPS = 1e-6;
const sigEq = (a, b) => Math.abs(a[0]-b[0]) < EPS && Math.abs(a[1]-b[1]) < EPS && Math.abs(a[2]-b[2]) < EPS;
function matchPerms(A, B) {
  const ae = [nrm(sub(A[1], A[0])), nrm(sub(A[2], A[1])), nrm(sub(A[0], A[2]))];
  const be = [nrm(sub(B[1], B[0])), nrm(sub(B[2], B[1])), nrm(sub(B[0], B[2]))];
  const out = [];
  for (let s = 0; s < 3; s++) {
    if (Math.abs(be[s]-ae[0]) < EPS && Math.abs(be[(s+1)%3]-ae[1]) < EPS && Math.abs(be[(s+2)%3]-ae[2]) < EPS) {
      out.push([s, (s+1)%3, (s+2)%3]);
    }
  }
  return out;
}

const seed = hillTemplate(L, 'R');
const tets = [seed];
const freeFaces = faceTris(seed).map((tri, fi) => ({ tri, tetIdx: 0, faceIdx: fi }));

while (tets.length < N && freeFaces.length > 0) {
  const ffi = Math.floor(rng() * freeFaces.length);
  const ff = freeFaces[ffi];
  const chir = rng() < 0.5 ? 'R' : 'L';
  const tmpl = hillTemplate(L, chir);
  const tF = faceTris(tmpl);
  const targetSig = sig(ff.tri);
  const compat = [];
  for (let i = 0; i < 4; i++) if (sigEq(sig(tF[i]), targetSig)) compat.push(i);
  if (compat.length === 0) continue;
  const tfIdx = compat[Math.floor(rng() * compat.length)];
  const perms = matchPerms(ff.tri, tF[tfIdx]);
  if (perms.length === 0) continue;
  const perm = perms[Math.floor(rng() * perms.length)];
  const newTet = mate(tmpl, tfIdx, ff.tri, perm);
  tets.push(newTet);
  freeFaces.splice(ffi, 1);
  const newIdx = tets.length - 1;
  faceTris(newTet).forEach((tri, f) => { if (f !== tfIdx) freeFaces.push({ tri, tetIdx: newIdx, faceIdx: f }); });
}

const Vstar = tets.length * (L*L*L) / 6;
let V;
{
  // 'using' disposes the hull's WASM allocation before the export runs —
  // the worker context persists across evals, so an undisposed hull would
  // leak on every re-run.
  using hull = unwrap(convexHull(tets.flatMap(t => t.verts)));
  V = unwrap(measureVolume(hull));
}
console.log('N =', tets.length, '  V* =', Vstar.toFixed(3), '  V_hull =', V.toFixed(3), '  V*/V =', (Vstar/V).toFixed(3));

export default tets.map(t => color(tetFromPts(t.verts), t.chirality === 'R' ? '#e85d5d' : '#f5f5f5'));
`;

export const GEOMETRY_EXAMPLES: readonly Example[] = [
  {
    id: 'hill-tetrahedron',
    label: 'Hill tetrahedron',
    description:
      'Chiral pair mated face-to-face — the space-filling right tet with 2 isoceles + 2 scalene right-triangle faces.',
    code: hillTetrahedron,
  },
  {
    id: 'hill-tetrahedron-cube',
    label: 'Hill tetrahedra: 6 tile a cube',
    description:
      'Six Hill tets (3 R + 3 L) tile a cube — one per permutation of the edge vectors. Zero void.',
    code: hillTetrahedronCube,
  },
  {
    id: 'hill-tetrahedron-reptile',
    label: 'Hill tetrahedra: 8-reptile',
    description:
      'Eight unit Hill tets tile a 2× parent: 4 corner pieces + 4 octahedral pieces. Slightly exploded.',
    code: hillTetrahedronReptile,
  },
  {
    id: 'hill-tetrahedron-growth',
    label: 'Hill tetrahedra: random face-to-face pile',
    description:
      'Grow a cluster by mating random Hill tets onto free faces. Logs V*/V hull efficiency to the console.',
    code: hillTetrahedronGrowth,
  },
];
