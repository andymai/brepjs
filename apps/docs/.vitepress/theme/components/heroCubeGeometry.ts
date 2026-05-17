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

export function shrunkTets(pieces: readonly Tet[], inset: number): Tet[] {
  if (inset <= 0) return pieces.map((p) => ({ ...p }));
  const s = 1 - inset;
  return pieces.map((p) => {
    const [v0, v1, v2, v3] = p.verts;
    const cx = (v0[0] + v1[0] + v2[0] + v3[0]) / 4;
    const cy = (v0[1] + v1[1] + v2[1] + v3[1]) / 4;
    const cz = (v0[2] + v1[2] + v2[2] + v3[2]) / 4;
    const shrink = (v: Vec3): Vec3 => [
      cx + (v[0] - cx) * s,
      cy + (v[1] - cy) * s,
      cz + (v[2] - cz) * s,
    ];
    return {
      verts: [shrink(v0), shrink(v1), shrink(v2), shrink(v3)],
      faces: p.faces,
    };
  });
}

export function explodeTets(pieces: readonly Tet[], amount: number): Tet[] {
  if (amount === 0) return pieces.map((p) => ({ ...p }));
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let n = 0;
  for (const p of pieces) {
    for (const v of p.verts) {
      cx += v[0];
      cy += v[1];
      cz += v[2];
      n++;
    }
  }
  cx /= n;
  cy /= n;
  cz /= n;
  return pieces.map((p) => {
    let pcx = 0;
    let pcy = 0;
    let pcz = 0;
    for (const v of p.verts) {
      pcx += v[0];
      pcy += v[1];
      pcz += v[2];
    }
    pcx /= 4;
    pcy /= 4;
    pcz /= 4;
    const dx = pcx - cx;
    const dy = pcy - cy;
    const dz = pcz - cz;
    const len = Math.hypot(dx, dy, dz) || 1;
    const ox = (dx / len) * amount;
    const oy = (dy / len) * amount;
    const oz = (dz / len) * amount;
    const newVerts = p.verts.map(
      (v) => [v[0] + ox, v[1] + oy, v[2] + oz] as Vec3
    ) as unknown as readonly [Vec3, Vec3, Vec3, Vec3];
    return { verts: newVerts, faces: p.faces };
  });
}
