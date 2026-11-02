import {
  type AnyShape,
  type ValidSolid,
  box,
  chamfer,
  cone,
  cut,
  cylinder,
  exportSTL,
  fillet,
  fuse,
  mesh,
  sphere,
  torus,
  translate,
  unwrap,
} from 'brepjs';

export interface CorpusCase {
  readonly name: string;
  readonly build: () => ValidSolid;
  /** Exact face count when every face of the source is planar. */
  readonly planarFaces?: number;
  /** Calls the tier 2 program should contain, as written. */
  readonly code: readonly string[];
  /** Surfaces Tier 1 should fit, by kind. */
  readonly surfaces: Readonly<
    Partial<Record<'plane' | 'cylinder' | 'sphere' | 'cone' | 'torus', number>>
  >;
}

type Owned = { [Symbol.dispose](): void };

function owned(fn: (keep: <S extends Owned>(s: S) => S) => ValidSolid): ValidSolid {
  const temps: Owned[] = [];
  try {
    return fn((s) => {
      temps.push(s);
      return s;
    });
  } finally {
    for (const t of temps) t[Symbol.dispose]();
  }
}

export const CAD_CORPUS: readonly CorpusCase[] = [
  {
    name: 'box',
    build: () => box(40, 30, 10),
    planarFaces: 6,
    surfaces: { plane: 6 },
    code: ['box(40, 30, 10)'],
  },
  {
    name: 'stepped block',
    build: () =>
      owned((keep) =>
        unwrap(fuse(keep(box(40, 20, 10)), keep(translate(keep(box(20, 20, 10)), [0, 0, 10]))))
      ),
    planarFaces: 8,
    surfaces: { plane: 8 },
    code: ['extrude('],
  },
  {
    name: 'plate with hole',
    build: () =>
      owned((keep) =>
        unwrap(cut(keep(box(40, 30, 6)), keep(translate(keep(cylinder(5, 20)), [20, 15, -5]))))
      ),
    surfaces: { plane: 6, cylinder: 1 },
    code: ['box(40, 30, 6)', 'cylinder(5, 6, { at: [20, 15, 0] })'],
  },
  {
    name: 'L-bracket with two holes',
    build: () =>
      owned((keep) => {
        const base = keep(unwrap(fuse(keep(box(60, 30, 6)), keep(box(6, 30, 40)))));
        const h1 = keep(translate(keep(cylinder(3, 20)), [40, 15, -5]));
        const h2 = keep(translate(keep(cylinder(3, 20)), [20, 15, -5]));
        return unwrap(cut(keep(unwrap(cut(base, h1))), h2));
      }),
    surfaces: { plane: 8, cylinder: 2 },
    code: ['cylinder(3, 6, { at: [40, 15, 0] })', 'cylinder(3, 6, { at: [20, 15, 0] })', 'fuse('],
  },
  {
    name: 'filleted box',
    build: () => owned((keep) => unwrap(fillet(keep(box(30, 20, 15)), 3))),
    surfaces: { plane: 6, cylinder: 12, sphere: 8 },
    code: ['box(30, 20, 15)', 'fillet(slab1, 3)'],
  },
  {
    name: 'cylinder',
    build: () => cylinder(10, 25),
    surfaces: { plane: 2, cylinder: 1 },
    code: ['cylinder(10, 25)'],
  },
  {
    name: 'cone frustum',
    build: () => cone(12, 6, 20),
    surfaces: { plane: 2, cone: 1 },
    code: ['revolve('],
  },
  {
    name: 'pointed cone',
    build: () => cone(10, 0, 20),
    surfaces: { plane: 1, cone: 1 },
    code: ['revolve('],
  },
  { name: 'sphere', build: () => sphere(15), surfaces: { sphere: 1 }, code: ['sphere(15)'] },
  { name: 'torus', build: () => torus(20, 5), surfaces: { torus: 1 }, code: ['torus(20, 5)'] },
  {
    name: 'hollow cube',
    build: () =>
      owned((keep) =>
        unwrap(cut(keep(box(20, 20, 20)), keep(translate(keep(box(6, 6, 6)), [7, 7, 7]))))
      ),
    surfaces: { plane: 12 },
    code: ['box(20, 20, 20)', 'box(6, 6, 6, { at: [10, 10, 10] })', 'cut('],
  },
  {
    name: 'chamfered box',
    build: () => owned((keep) => unwrap(chamfer(keep(box(30, 20, 10)), 2))),
    surfaces: { plane: 26 },
    code: ['box(30, 20, 10)', 'chamfer(slab1, 2)'],
  },
  {
    name: 'countersunk plate',
    build: () =>
      owned((keep) => {
        const drilled = keep(
          unwrap(cut(keep(box(40, 30, 8)), keep(cylinder(3, 20, { at: [20, 15, -5] }))))
        );
        return unwrap(cut(drilled, keep(cone(3, 6, 3, { at: [20, 15, 5] }))));
      }),
    surfaces: { plane: 6, cylinder: 1, cone: 1 },
    code: [
      'box(40, 30, 8)',
      'cylinder(3, 8, { at: [20, 15, 0] })',
      'cone(3, 6, 3, { at: [20, 15, 5] })',
    ],
  },
  {
    name: 'hollow sphere',
    build: () => owned((keep) => unwrap(cut(keep(sphere(15)), keep(sphere(10))))),
    surfaces: { sphere: 2 },
    code: ['sphere(15)', 'sphere(10)', 'cut('],
  },
];

export async function stlOf(shape: AnyShape, tolerance?: number): Promise<Uint8Array> {
  const blob = unwrap(exportSTL(shape, { binary: true, ...(tolerance ? { tolerance } : {}) }));
  return new Uint8Array(await blob.arrayBuffer());
}

function writeBinarySTL(pos: Float64Array, tris: Uint32Array): Uint8Array {
  const n = tris.length / 3;
  const out = new DataView(new ArrayBuffer(84 + 50 * n));
  out.setUint32(80, n, true);
  for (let t = 0; t < n; t++) {
    const base = 84 + 50 * t + 12;
    for (let k = 0; k < 3; k++) {
      const v = tris[3 * t + k] ?? 0;
      for (let c = 0; c < 3; c++) out.setFloat32(base + 12 * k + 4 * c, pos[3 * v + c] ?? 0, true);
    }
  }
  return new Uint8Array(out.buffer);
}

/** Deterministic standard normal samples (xorshift + Box-Muller). */
function gaussian(seed: number): () => number {
  let s = seed >>> 0 || 1;
  const uniform = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) + 0.5) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
}

/**
 * A scan-like mesh of `shape`: welded, uniformly subdivided so triangle sizes
 * resemble a scanner's, with Gaussian noise of `sigma` mm along vertex normals.
 */
export function scanLike(
  shape: AnyShape,
  opts: { targetTriangles: number; sigma: number; seed: number }
): Uint8Array {
  const m = mesh(shape, { tolerance: 0.05 });
  const key = (i: number) =>
    `${m.vertices[3 * i]?.toFixed(5)},${m.vertices[3 * i + 1]?.toFixed(5)},${m.vertices[3 * i + 2]?.toFixed(5)}`;
  const ids = new Map<string, number>();
  const base: number[] = [];
  const remap: number[] = [];
  for (let i = 0; i < m.vertices.length / 3; i++) {
    const k = key(i);
    let id = ids.get(k);
    if (id === undefined) {
      id = base.length / 3;
      ids.set(k, id);
      base.push(m.vertices[3 * i] ?? 0, m.vertices[3 * i + 1] ?? 0, m.vertices[3 * i + 2] ?? 0);
    }
    remap.push(id);
  }
  const srcTris = Array.from(m.triangles, (v) => remap[v] ?? 0);
  // Split every edge longer than `h` at its midpoint (one midpoint per edge,
  // shared by both its triangles) until none is, so sampling follows area as a
  // scanner's does rather than the CAD tessellation: a filleted part's flat
  // faces are two triangles each, its fillets hundreds.
  const pos: number[] = [...base];
  const at = (v: number): [number, number, number] => [
    pos[3 * v] ?? 0,
    pos[3 * v + 1] ?? 0,
    pos[3 * v + 2] ?? 0,
  ];
  const edgeLength = (a: number, b: number): number => {
    const [x, y, z] = at(a);
    const [u, v, w] = at(b);
    return Math.hypot(x - u, y - v, z - w);
  };
  let area = 0;
  for (let t = 0; t < srcTris.length / 3; t++) {
    const [a, b, c] = [srcTris[3 * t] ?? 0, srcTris[3 * t + 1] ?? 0, srcTris[3 * t + 2] ?? 0];
    const [pa, pb, pc] = [at(a), at(b), at(c)];
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const w = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    area +=
      Math.hypot(
        (u[1] ?? 0) * (w[2] ?? 0) - (u[2] ?? 0) * (w[1] ?? 0),
        (u[2] ?? 0) * (w[0] ?? 0) - (u[0] ?? 0) * (w[2] ?? 0),
        (u[0] ?? 0) * (w[1] ?? 0) - (u[1] ?? 0) * (w[0] ?? 0)
      ) / 2;
  }
  const h = 2 * Math.sqrt(area / opts.targetTriangles);
  const mids = new Map<string, number>();
  const mid = (a: number, b: number): number => {
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    let m = mids.get(k);
    if (m === undefined) {
      m = pos.length / 3;
      const [x, y, z] = at(a);
      const [u, v, w] = at(b);
      pos.push((x + u) / 2, (y + v) / 2, (z + w) / 2);
      mids.set(k, m);
    }
    return m;
  };
  let tris: number[] = srcTris;
  for (let pass = 0; pass < 40; pass++) {
    const next: number[] = [];
    let split = false;
    for (let t = 0; t < tris.length / 3; t++) {
      const v = [tris[3 * t] ?? 0, tris[3 * t + 1] ?? 0, tris[3 * t + 2] ?? 0];
      const long = [0, 1, 2].map((i) => edgeLength(v[i] ?? 0, v[(i + 1) % 3] ?? 0) > h);
      const count = long.filter(Boolean).length;
      const [a0, b0, c0] = v as [number, number, number];
      if (count === 0) {
        next.push(a0, b0, c0);
        continue;
      }
      split = true;
      if (count === 3) {
        const [x, y, z] = [mid(a0, b0), mid(b0, c0), mid(c0, a0)];
        next.push(a0, x, z, x, b0, y, z, y, c0, x, y, z);
        continue;
      }
      // Rotate so edge (a, b) is the split one (one long edge) or (c, a) the
      // kept one (two long edges); the winding stays the same.
      const pick = count === 1 ? long.indexOf(true) : (long.indexOf(false) + 1) % 3;
      const [a, b, c] = [v[pick] ?? 0, v[(pick + 1) % 3] ?? 0, v[(pick + 2) % 3] ?? 0];
      if (count === 1) {
        const m = mid(a, b);
        next.push(a, m, c, m, b, c);
      } else {
        const [x, y] = [mid(a, b), mid(b, c)];
        next.push(x, b, y, a, x, y, a, y, c);
      }
    }
    tris = next;
    if (!split) break;
  }

  const normals = new Float64Array(pos.length);
  for (let t = 0; t < tris.length / 3; t++) {
    const [a, b, c] = [tris[3 * t] ?? 0, tris[3 * t + 1] ?? 0, tris[3 * t + 2] ?? 0];
    const u = [0, 1, 2].map((k) => (pos[3 * b + k] ?? 0) - (pos[3 * a + k] ?? 0));
    const w = [0, 1, 2].map((k) => (pos[3 * c + k] ?? 0) - (pos[3 * a + k] ?? 0));
    const cr = [
      (u[1] ?? 0) * (w[2] ?? 0) - (u[2] ?? 0) * (w[1] ?? 0),
      (u[2] ?? 0) * (w[0] ?? 0) - (u[0] ?? 0) * (w[2] ?? 0),
      (u[0] ?? 0) * (w[1] ?? 0) - (u[1] ?? 0) * (w[0] ?? 0),
    ];
    for (const v of [a, b, c])
      for (let k = 0; k < 3; k++) normals[3 * v + k] = (normals[3 * v + k] ?? 0) + (cr[k] ?? 0);
  }
  const g = gaussian(opts.seed);
  const out = new Float64Array(pos);
  for (let v = 0; v < pos.length / 3; v++) {
    const nx = normals[3 * v] ?? 0;
    const ny = normals[3 * v + 1] ?? 0;
    const nz = normals[3 * v + 2] ?? 0;
    const len = Math.hypot(nx, ny, nz) || 1;
    const d = g() * opts.sigma;
    out[3 * v] = (out[3 * v] ?? 0) + (nx / len) * d;
    out[3 * v + 1] = (out[3 * v + 1] ?? 0) + (ny / len) * d;
    out[3 * v + 2] = (out[3 * v + 2] ?? 0) + (nz / len) * d;
  }
  return writeBinarySTL(out, Uint32Array.from(tris));
}
