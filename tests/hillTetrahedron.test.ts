import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { polyhedron, unwrap, isSolid, measureVolume, measureArea, convexHull } from '@/index.js';
import type { Solid, Vec3 } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

type Chirality = 'R' | 'L';

function hillVertices(
  L: number,
  chirality: Chirality,
  origin: Vec3 = [0, 0, 0]
): [Vec3, Vec3, Vec3, Vec3] {
  const [ox, oy, oz] = origin;
  const s = chirality === 'R' ? 1 : -1;
  return [
    [ox, oy, oz],
    [ox + s * L, oy, oz],
    [ox + s * L, oy + L, oz],
    [ox + s * L, oy + L, oz + L],
  ];
}

// Right-handed face winding (outward normals). Mirroring through x=0 flips
// the handedness of every face, so the left-handed tet uses the reverse winding.
const HILL_FACES_R: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 2, 1],
  [1, 2, 3],
  [0, 3, 2],
  [0, 1, 3],
];
const HILL_FACES_L: ReadonlyArray<ReadonlyArray<number>> = HILL_FACES_R.map((f) =>
  [...f].reverse()
);

function hillTet(L: number, chirality: Chirality = 'R', origin: Vec3 = [0, 0, 0]): Solid {
  const verts = hillVertices(L, chirality, origin);
  const faces = chirality === 'R' ? HILL_FACES_R : HILL_FACES_L;
  return unwrap(polyhedron(verts, faces));
}

// Build a tetrahedron from 4 arbitrary points, auto-orienting faces outward.
function tetFrom4(verts: readonly [Vec3, Vec3, Vec3, Vec3]): Solid {
  const [V0, V1, V2, V3] = verts;
  const cx = (V0[0] + V1[0] + V2[0] + V3[0]) / 4;
  const cy = (V0[1] + V1[1] + V2[1] + V3[1]) / 4;
  const cz = (V0[2] + V1[2] + V2[2] + V3[2]) / 4;
  const ringIndices: ReadonlyArray<[Vec3, Vec3, Vec3, [number, number, number]]> = [
    [V1, V2, V3, [1, 2, 3]],
    [V0, V3, V2, [0, 3, 2]],
    [V0, V1, V3, [0, 1, 3]],
    [V0, V2, V1, [0, 2, 1]],
  ];
  const faces = ringIndices.map(([Vi, Vj, Vk, idx]) => {
    const ux = Vj[0] - Vi[0],
      uy = Vj[1] - Vi[1],
      uz = Vj[2] - Vi[2];
    const vx = Vk[0] - Vi[0],
      vy = Vk[1] - Vi[1],
      vz = Vk[2] - Vi[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const fx = (Vi[0] + Vj[0] + Vk[0]) / 3;
    const fy = (Vi[1] + Vj[1] + Vk[1]) / 3;
    const fz = (Vi[2] + Vj[2] + Vk[2]) / 3;
    const dot = (fx - cx) * nx + (fy - cy) * ny + (fz - cz) * nz;
    const [i, j, k] = idx;
    return dot >= 0 ? [i, j, k] : [i, k, j];
  });
  return unwrap(polyhedron(verts, faces));
}

// 8-reptile decomposition: 4 corner sub-tets + 4 octahedron sub-tets, all
// congruent to a unit Hill T, tile a doubled Hill T (edge length 2L).
function eightReptile(L: number): Solid[] {
  // Doubled Hill T vertices (W0..W3) and their 6 edge midpoints (Mij).
  const W0: Vec3 = [0, 0, 0];
  const W1: Vec3 = [2 * L, 0, 0];
  const W2: Vec3 = [2 * L, 2 * L, 0];
  const W3: Vec3 = [2 * L, 2 * L, 2 * L];
  const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const M01 = mid(W0, W1);
  const M02 = mid(W0, W2);
  const M03 = mid(W0, W3);
  const M12 = mid(W1, W2);
  const M13 = mid(W1, W3);
  const M23 = mid(W2, W3);

  const pieces: ReadonlyArray<readonly [Vec3, Vec3, Vec3, Vec3]> = [
    // 4 corner sub-tets (each similar to a Hill T, scaled by 1/2)
    [W0, M01, M02, M03],
    [M01, W1, M12, M13],
    [M02, M12, W2, M23],
    [M03, M13, M23, W3],
    // 4 octahedron sub-tets (sharing diagonal M02-M13)
    [M02, M13, M01, M03],
    [M02, M13, M03, M23],
    [M02, M13, M23, M12],
    [M02, M13, M12, M01],
  ];
  return pieces.map(tetFrom4);
}

describe('Hill tetrahedron (Planckton)', () => {
  it('right-handed Hill T has volume L^3 / 6', () => {
    const L = 1;
    const tet = hillTet(L, 'R');
    expect(isSolid(tet)).toBe(true);
    const v = unwrap(measureVolume(tet));
    expect(v).toBeCloseTo((L * L * L) / 6, 6);
  });

  it('scales volume cubically', () => {
    for (const L of [2, 3, 5]) {
      const v = unwrap(measureVolume(hillTet(L, 'R')));
      expect(v).toBeCloseTo((L * L * L) / 6, 4);
    }
  });

  it('left-handed mirror has identical volume', () => {
    const L = 2;
    const vR = unwrap(measureVolume(hillTet(L, 'R')));
    const vL = unwrap(measureVolume(hillTet(L, 'L')));
    expect(vL).toBeCloseTo(vR, 6);
  });

  it('total surface area = (1 + sqrt(2)) * L^2  (2*(L^2/2) + 2*(L^2 * sqrt(2)/2))', () => {
    const L = 1;
    const area = unwrap(measureArea(hillTet(L, 'R')));
    // 2 isoceles right triangles each area = L^2/2 -> sum L^2
    // 2 scalene right triangles each area = (1/2) * L * (L*sqrt(2)) = L^2 * sqrt(2)/2 each -> sum L^2 * sqrt(2)
    const expected = L * L + L * L * Math.sqrt(2);
    expect(area).toBeCloseTo(expected, 6);
  });

  it('6 Hill tets tile a unit cube (volume sum = L^3)', () => {
    const L = 1;
    // 6 permutations of (x,y,z) all sharing the (0,0,0)->(1,1,1) space diagonal.
    // Each is the convex hull of (0,0,0), e_a, e_a+e_b, e_a+e_b+e_c for permutation (a,b,c).
    const perms: [number, number, number][] = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    const e: Vec3[] = [
      [L, 0, 0],
      [0, L, 0],
      [0, 0, L],
    ];
    let sumV = 0;
    for (const [a, b, c] of perms) {
      const V0: Vec3 = [0, 0, 0];
      const ea = e[a] as Vec3;
      const eb = e[b] as Vec3;
      const ec = e[c] as Vec3;
      const V1: Vec3 = [V0[0] + ea[0], V0[1] + ea[1], V0[2] + ea[2]];
      const V2: Vec3 = [V1[0] + eb[0], V1[1] + eb[1], V1[2] + eb[2]];
      const V3: Vec3 = [V2[0] + ec[0], V2[1] + ec[1], V2[2] + ec[2]];
      // tetFrom4 auto-orients faces outward, so both R and L permutations
      // produce well-formed solids (HILL_FACES_R would invert the L pieces).
      const piece = tetFrom4([V0, V1, V2, V3]);
      expect(isSolid(piece)).toBe(true);
      sumV += unwrap(measureVolume(piece));
    }
    expect(sumV).toBeCloseTo(L * L * L, 4);
  });

  it('8-reptile: 8 unit Hill tets tile a doubled Hill T, total volume = (2L)^3/6', () => {
    const L = 1;
    const pieces = eightReptile(L);
    expect(pieces).toHaveLength(8);
    const total = pieces.reduce((s, p) => s + unwrap(measureVolume(p)), 0);
    const expected = (2 * L) ** 3 / 6;
    expect(total).toBeCloseTo(expected, 4);

    // Each piece must equal L^3/6 (a unit Hill T)
    for (const p of pieces) {
      expect(unwrap(measureVolume(p))).toBeCloseTo((L * L * L) / 6, 4);
    }
  });

  it('convex hull of 1 tet equals the tet itself (sanity for V=V* with N=1)', () => {
    const L = 1;
    const tet = hillTet(L, 'R');
    const hull = unwrap(convexHull(hillVertices(L, 'R')));
    const vTet = unwrap(measureVolume(tet));
    const vHull = unwrap(measureVolume(hull));
    expect(vHull).toBeCloseTo(vTet, 5);
  });
});
