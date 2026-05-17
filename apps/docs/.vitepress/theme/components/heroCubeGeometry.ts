export type Vec3 = readonly [number, number, number];
export type TriIdx = readonly [number, number, number];

export interface Tet {
  verts: readonly [Vec3, Vec3, Vec3, Vec3];
  faces: readonly [TriIdx, TriIdx, TriIdx, TriIdx];
}

const RING_IDX: ReadonlyArray<TriIdx> = [
  [1, 2, 3],
  [0, 3, 2],
  [0, 1, 3],
  [0, 2, 1],
];

function tetFromPts(pts: readonly [Vec3, Vec3, Vec3, Vec3]): Tet {
  const [v0, v1, v2, v3] = pts;
  const cx = (v0[0] + v1[0] + v2[0] + v3[0]) / 4;
  const cy = (v0[1] + v1[1] + v2[1] + v3[1]) / 4;
  const cz = (v0[2] + v1[2] + v2[2] + v3[2]) / 4;
  const faces = RING_IDX.map(([i, j, k]) => {
    const vi = pts[i] as Vec3;
    const vj = pts[j] as Vec3;
    const vk = pts[k] as Vec3;
    const ux = vj[0] - vi[0];
    const uy = vj[1] - vi[1];
    const uz = vj[2] - vi[2];
    const wx = vk[0] - vi[0];
    const wy = vk[1] - vi[1];
    const wz = vk[2] - vi[2];
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    const fx = (vi[0] + vj[0] + vk[0]) / 3;
    const fy = (vi[1] + vj[1] + vk[1]) / 3;
    const fz = (vi[2] + vj[2] + vk[2]) / 3;
    const outward = (fx - cx) * nx + (fy - cy) * ny + (fz - cz) * nz >= 0;
    return outward ? ([i, j, k] as TriIdx) : ([i, k, j] as TriIdx);
  }) as unknown as readonly [TriIdx, TriIdx, TriIdx, TriIdx];
  return { verts: pts, faces };
}

export function cubeTiling(L: number): Tet[] {
  const e: readonly [Vec3, Vec3, Vec3] = [
    [L, 0, 0],
    [0, L, 0],
    [0, 0, L],
  ];
  const perms: ReadonlyArray<readonly [number, number, number]> = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  const h = L / 2;
  return perms.map(([a, b, c]) => {
    const ea = e[a] as Vec3;
    const eb = e[b] as Vec3;
    const ec = e[c] as Vec3;
    const v0: Vec3 = [-h, -h, -h];
    const v1: Vec3 = [v0[0] + ea[0], v0[1] + ea[1], v0[2] + ea[2]];
    const v2: Vec3 = [v1[0] + eb[0], v1[1] + eb[1], v1[2] + eb[2]];
    const v3: Vec3 = [v2[0] + ec[0], v2[1] + ec[1], v2[2] + ec[2]];
    return tetFromPts([v0, v1, v2, v3]);
  });
}
