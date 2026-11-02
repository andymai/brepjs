import {
  type AnyShape,
  type Compound,
  type Dimension,
  type Face,
  type Shell,
  type Solid,
  type Vec3,
  compound,
  cone,
  cylinder,
  fuseAll,
  getFaces,
  getKernel,
  isSolid,
  isValid,
  mesh,
  polygon,
  simplify,
  sphere,
  torus,
} from 'brepjs';
import { type Built, type Owned, cutCavities, outwardSolid } from './solidFns.js';
import type { ConversionReport } from './types.js';

/** Engine surface encoding: kind code plus eight parameter slots (see `Tier1Session`). */
export type AnalyticSurface =
  | { readonly kind: 'plane'; readonly n: Vec3; readonly d: number }
  | { readonly kind: 'cylinder'; readonly o: Vec3; readonly a: Vec3; readonly r: number }
  | { readonly kind: 'sphere'; readonly c: Vec3; readonly r: number }
  | { readonly kind: 'cone'; readonly apex: Vec3; readonly a: Vec3; readonly halfAngle: number }
  | {
      readonly kind: 'torus';
      readonly c: Vec3;
      readonly a: Vec3;
      readonly major: number;
      readonly minor: number;
    };

export interface Segmentation {
  readonly surfaces: readonly AnalyticSurface[];
  /** Bounding box of each surface's mesh region: [min, max]. */
  readonly bounds: readonly (readonly [Vec3, Vec3])[];
  readonly tolerance: number;
  readonly unfitTriangles: number;
  /** Share of the mesh area no fitted surface covers. */
  readonly unfitArea: number;
  /** For flat xyz points: [surface id or -1, distance to the mesh] per point. */
  readonly nearest: (points: Float64Array) => Float64Array;
  /** For flat xyz points: the mesh body nearest each point, or -1. */
  readonly bodiesOf: (points: Float64Array) => Float64Array;
  /** Per mesh body: the body whose cavity it is, or -1. */
  readonly bodyParent: Int32Array;
  /** Per mesh body: 1 when closed. */
  readonly bodyClosed: Uint8Array;
  /** Deviation JSON between the input mesh and a triangulation. */
  readonly deviation: (positions: Float64Array, indices: Uint32Array) => string;
}

export interface AnalyticOutcome {
  readonly shape: Solid | Shell | Compound;
  readonly stats: {
    readonly patches: number;
    readonly pieces: number;
    readonly kept: number;
    readonly faces: number;
  };
  /** Input mesh against the result, in the report's format. */
  readonly deviation: ConversionReport['deviation'];
}

export type AnalyticResult = { ok: true; value: AnalyticOutcome } | { ok: false; reason: string };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => scale(a, 1 / (len(a) || 1));

export function decodeSurfaces(kinds: Uint8Array, params: Float64Array): AnalyticSurface[] {
  const out: AnalyticSurface[] = [];
  for (let i = 0; i < kinds.length; i++) {
    const p = (k: number): number => params[8 * i + k] ?? 0;
    const v = (k: number): Vec3 => [p(k), p(k + 1), p(k + 2)];
    switch (kinds[i]) {
      case 0:
        out.push({ kind: 'plane', n: v(0), d: p(3) });
        break;
      case 1:
        out.push({ kind: 'cylinder', o: v(0), a: v(3), r: p(6) });
        break;
      case 2:
        out.push({ kind: 'sphere', c: v(0), r: p(3) });
        break;
      case 3:
        out.push({ kind: 'cone', apex: v(0), a: v(3), halfAngle: p(6) });
        break;
      default:
        out.push({ kind: 'torus', c: v(0), a: v(3), major: p(6), minor: p(7) });
    }
  }
  return out;
}

/** Unsigned distance from `p` to the surface. */
export function surfaceDistance(s: AnalyticSurface, p: Vec3): number {
  switch (s.kind) {
    case 'plane':
      return Math.abs(dot(s.n, p) - s.d);
    case 'sphere':
      return Math.abs(len(sub(p, s.c)) - s.r);
    case 'cylinder': {
      const v = sub(p, s.o);
      return Math.abs(len(sub(v, scale(s.a, dot(v, s.a)))) - s.r);
    }
    case 'cone': {
      const v = sub(p, s.apex);
      const h = dot(v, s.a);
      const rho = len(sub(v, scale(s.a, h)));
      return Math.abs(rho * Math.cos(s.halfAngle) - h * Math.sin(s.halfAngle));
    }
    case 'torus': {
      const v = sub(p, s.c);
      const h = dot(v, s.a);
      const rho = len(sub(v, scale(s.a, h)));
      return Math.abs(Math.hypot(rho - s.major, h) - s.minor);
    }
  }
}

function corners(b: readonly [Vec3, Vec3]): Vec3[] {
  const [lo, hi] = b;
  const out: Vec3[] = [];
  for (const x of [lo[0], hi[0]])
    for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) out.push([x, y, z]);
  return out;
}

function axialRange(origin: Vec3, axis: Vec3, b: readonly [Vec3, Vec3]): [number, number] {
  const hs = corners(b).map((c) => dot(sub(c, origin), axis));
  return [Math.min(...hs), Math.max(...hs)];
}

/** An oversized face on `s` that covers its region plus `margin`. */
function patch(
  s: AnalyticSurface,
  b: readonly [Vec3, Vec3],
  margin: number,
  owned: Owned[]
): Face | null {
  const keep = <T extends Owned>(x: T): T => {
    owned.push(x);
    return x;
  };
  const lateral = (solid: Solid, type: string): Face | null => {
    keep(solid);
    return getFaces(solid).find((f) => getKernel().surfaceType(f.wrapped) === type) ?? null;
  };
  switch (s.kind) {
    case 'plane': {
      const center = scale(add(b[0], b[1]), 0.5);
      const onPlane = sub(center, scale(s.n, dot(s.n, center) - s.d));
      const half = len(sub(b[1], b[0])) / 2 + margin;
      const helper: Vec3 = Math.abs(s.n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u = unit(cross(helper, s.n));
      const v = cross(s.n, u);
      const pts: Vec3[] = [
        add(add(onPlane, scale(u, -half)), scale(v, -half)),
        add(add(onPlane, scale(u, half)), scale(v, -half)),
        add(add(onPlane, scale(u, half)), scale(v, half)),
        add(add(onPlane, scale(u, -half)), scale(v, half)),
      ];
      const f = polygon(pts);
      return f.ok ? keep(f.value) : null;
    }
    case 'cylinder': {
      const [h0, h1] = axialRange(s.o, s.a, b);
      const base = add(s.o, scale(s.a, h0 - margin));
      return lateral(cylinder(s.r, h1 - h0 + 2 * margin, { at: base, axis: s.a }), 'cylinder');
    }
    case 'cone': {
      const [h0, h1] = axialRange(s.apex, s.a, b);
      // A region that reaches the apex gets a pointed patch; otherwise a frustum below it.
      const start = Math.max(h0 - margin, 0);
      const end = h1 + margin;
      const t = Math.tan(s.halfAngle);
      return lateral(
        cone(start * t, end * t, end - start, { at: add(s.apex, scale(s.a, start)), axis: s.a }),
        'cone'
      );
    }
    case 'sphere':
      return lateral(sphere(s.r, { at: s.c }), 'sphere');
    case 'torus':
      return lateral(torus(s.major, s.minor, { at: s.c, axis: s.a }), 'torus');
  }
}

/** Points on `face`: centroids of a coarse triangulation, projected onto the face. */
function samplePoints(face: Face, coarse: number): Vec3[] {
  const m = mesh(face, {
    tolerance: coarse,
    angularTolerance: 0.5,
    skipNormals: true,
    cache: false,
  });
  const k = getKernel();
  const out: Vec3[] = [];
  for (let t = 0; t < m.triangles.length; t += 3) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let j = 0; j < 3; j++) {
      const v = 3 * (m.triangles[t + j] ?? 0);
      x += (m.vertices[v] ?? 0) / 3;
      y += (m.vertices[v + 1] ?? 0) / 3;
      z += (m.vertices[v + 2] ?? 0) / 3;
    }
    out.push(k.projectPointOnFace(face.wrapped, [x, y, z]));
  }
  return out.length > 0 ? out : gridSamples(face);
}

const GRID = 8;

/** UV grid samples inside the face, for pieces the mesher returns nothing for. */
function gridSamples(face: Face): Vec3[] {
  const k = getKernel();
  const b = k.uvBounds(face.wrapped);
  const out: Vec3[] = [];
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const u = b.uMin + ((i + 0.5) / GRID) * (b.uMax - b.uMin);
      const v = b.vMin + ((j + 0.5) / GRID) * (b.vMax - b.vMin);
      if (k.classifyPointOnFace(face.wrapped, u, v) === 'in')
        out.push(k.pointOnSurface(face.wrapped, u, v));
    }
  }
  return out;
}

function nearestSurface(
  surfaces: readonly AnalyticSurface[],
  pts: readonly Vec3[],
  skip: ReadonlySet<number>
): number {
  let best = -1;
  let bestErr = Infinity;
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    if (s === undefined || skip.has(i)) continue;
    let err = 0;
    for (const p of pts) err = Math.max(err, surfaceDistance(s, p));
    if (err < bestErr) {
      bestErr = err;
      best = i;
    }
  }
  return best;
}

function triangulate(
  shape: AnyShape<Dimension>,
  tolerance: number
): { positions: Float64Array; indices: Uint32Array } {
  const m = mesh(shape, { tolerance, angularTolerance: 0.2, skipNormals: true, cache: false });
  return { positions: Float64Array.from(m.vertices), indices: Uint32Array.from(m.triangles) };
}

/** Input mesh against a shape, triangulated at `tolerance`, in the report's format. */
export function deviationOf(
  shape: AnyShape<Dimension>,
  deviation: Segmentation['deviation'],
  tolerance: number
): ConversionReport['deviation'] {
  const tri = triangulate(shape, tolerance);
  return JSON.parse(deviation(tri.positions, tri.indices)) as ConversionReport['deviation'];
}

function majority(values: Float64Array, start: number, count: number): number {
  const tally = new Map<number, number>();
  let best = -1;
  let bestN = 0;
  for (let j = start; j < start + count; j++) {
    const v = values[j] ?? -1;
    const n = (tally.get(v) ?? 0) + 1;
    tally.set(v, n);
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

/** A sphere or torus covered whole is one closed face with no edges to sew: use the primitive. */
function closedPrimitive(s: AnalyticSurface, owned: Owned[]): Solid | null {
  let solid: Solid;
  if (s.kind === 'sphere') solid = sphere(s.r, { at: s.c });
  else if (s.kind === 'torus') solid = torus(s.major, s.minor, { at: s.c, axis: s.a });
  else return null;
  owned.push(solid);
  return solid;
}

/** One body's covered pieces as an outward-facing solid. */
function bodySolid(
  faces: Face[],
  own: number[],
  surfaces: readonly AnalyticSurface[],
  owned: Owned[]
): Built {
  if (faces.length === 1) {
    const s = surfaces[own[0] ?? -1];
    const prim = s === undefined ? null : closedPrimitive(s, owned);
    if (prim !== null) return { ok: true, value: prim };
  }
  return outwardSolid(faces, owned);
}

function unify(s: Solid, owned: Owned[]): Solid {
  const u = simplify(s);
  if (!u.ok) return s;
  // A kernel can hand back the same shape in a new wrapper; owning both would
  // free the result when `s` is released.
  if (u.value.wrapped === s.wrapped) return s;
  owned.push(u.value);
  return isSolid(u.value) && isValid(u.value) ? u.value : s;
}

export interface AnalyticOptions {
  /** Distance from the mesh within which a sample counts as covered (≥ tessellation chord error). */
  readonly coverage: number;
  /** Largest acceptable distance between the input mesh and the result. */
  readonly maxDeviation: number;
  /** Chord tolerance for triangulating the result to measure that distance. */
  readonly triangulation: number;
  /**
   * Largest share of the mesh area allowed to fit no surface: none for a CAD
   * export, a little for a scan, whose decimated triangles bridge its creases.
   */
  readonly maxUnfitArea: number;
  /**
   * Most sphere and torus patches the arrangement takes. Each is a whole closed
   * surface that meets every other patch, so the fuse grows steeply with them;
   * a scan's noise lets small tori fit any smooth stretch of a freeform part,
   * which would arrange dozens of them for minutes and cover nothing.
   */
  readonly maxClosedPatches?: number | undefined;
  /**
   * Surfaces left out of the arrangement because `finish` puts them back
   * (blends a fillet recreates). Mesh points they own don't count for or
   * against a piece.
   */
  readonly skip?: ReadonlySet<number> | undefined;
  /** Applied to each rebuilt outer body before it is checked against the mesh. */
  readonly finish?:
    ((s: Solid) => { ok: true; value: Solid } | { ok: false; reason: string }) | undefined;
}

/**
 * Rebuild the mesh from its fitted surfaces: one oversized patch per surface,
 * a general fuse that splits every patch along its exact intersections with the
 * others (sharing the edges), then the pieces the mesh covers, sewn and unified.
 */
export function buildAnalytic(seg: Segmentation, opts: AnalyticOptions): AnalyticResult {
  if (seg.surfaces.length === 0) return { ok: false, reason: 'no surfaces were fitted' };
  if (seg.unfitTriangles > 0 && seg.unfitArea > opts.maxUnfitArea) {
    return { ok: false, reason: `${seg.unfitTriangles} triangles fit no analytic surface` };
  }
  const closed = seg.surfaces.filter(
    (s, i) => (s.kind === 'sphere' || s.kind === 'torus') && opts.skip?.has(i) !== true
  ).length;
  if (closed > (opts.maxClosedPatches ?? Infinity)) {
    return {
      ok: false,
      reason: `${closed} sphere and torus patches are past the arrangement's ${opts.maxClosedPatches} (a freeform part)`,
    };
  }
  const all = seg.bounds.reduce<[Vec3, Vec3]>(
    (acc, b) => [
      [Math.min(acc[0][0], b[0][0]), Math.min(acc[0][1], b[0][1]), Math.min(acc[0][2], b[0][2])],
      [Math.max(acc[1][0], b[1][0]), Math.max(acc[1][1], b[1][1]), Math.max(acc[1][2], b[1][2])],
    ],
    [
      [Infinity, Infinity, Infinity],
      [-Infinity, -Infinity, -Infinity],
    ]
  );
  const diag = len(sub(all[1], all[0]));
  const margin = Math.max(0.05 * diag, 20 * seg.tolerance);
  const owned: Owned[] = [];
  const keep = <T extends Owned>(x: T): T => {
    owned.push(x);
    return x;
  };
  try {
    const skip = opts.skip ?? new Set<number>();
    const patches: Face[] = [];
    for (let i = 0; i < seg.surfaces.length; i++) {
      const s = seg.surfaces[i];
      const b = seg.bounds[i];
      if (s === undefined || b === undefined || skip.has(i)) continue;
      const f = patch(s, b, margin, owned);
      if (f === null)
        return { ok: false, reason: `could not build a patch for surface ${i} (${s.kind})` };
      patches.push(f);
    }
    // One argument per patch: the general fuse intersects arguments with each other.
    const args = patches.map((f) => keep(compound([f])));
    const fused = fuseAll(args, { unsafe: true });
    if (!fused.ok)
      return { ok: false, reason: `surface arrangement failed: ${fused.error.message}` };
    owned.push(fused.value);
    const pieces = getFaces(fused.value);
    const coarse = Math.max(diag / 40, opts.coverage);
    const samples = pieces.map((p) => samplePoints(p, coarse));
    const flat = new Float64Array(samples.reduce((n, s) => n + s.length * 3, 0));
    let k = 0;
    for (const s of samples) {
      for (const p of s) {
        flat.set(p, k);
        k += 3;
      }
    }
    const near = seg.nearest(flat);
    const bodyOf = seg.bodiesOf(flat);
    const groups = new Map<number, { faces: Face[]; own: number[] }>();
    let kept = 0;
    let cursor = 0;
    for (let i = 0; i < pieces.length; i++) {
      const pts = samples[i] ?? [];
      const own = nearestSurface(seg.surfaces, pts, skip);
      const start = cursor;
      let hits = 0;
      let neutral = 0;
      for (let j = 0; j < pts.length; j++, cursor++) {
        const sid = near[2 * cursor] ?? -1;
        const d = near[2 * cursor + 1] ?? Infinity;
        if (skip.has(sid)) neutral++;
        else if (sid === own && d <= opts.coverage) hits++;
      }
      const piece = pieces[i];
      const judged = pts.length - neutral;
      if (piece === undefined || hits === 0 || hits / judged <= 0.5) continue;
      const body = majority(bodyOf, start, pts.length);
      const g = groups.get(body) ?? { faces: [], own: [] };
      g.faces.push(piece);
      g.own.push(own);
      groups.set(body, g);
      kept++;
    }
    if (kept === 0) return { ok: false, reason: 'no arrangement piece is covered by the mesh' };
    // A body with no pieces would vanish, and the distance check can't see it
    // when another body lies within the deviation limit.
    for (let b = 0; b < seg.bodyClosed.length; b++) {
      if (!groups.has(b)) return { ok: false, reason: `no arrangement piece covers body ${b}` };
    }

    const solids = new Map<number, Solid>();
    for (const [body, g] of groups) {
      // Exact surfaces would close an open body's holes; tier 0 keeps it a shell.
      if (seg.bodyClosed[body] !== 1) return { ok: false, reason: `body ${body} is open` };
      const built = bodySolid(g.faces, g.own, seg.surfaces, owned);
      if (!built.ok)
        return groups.size > 1 ? { ok: false, reason: `body ${body}: ${built.reason}` } : built;
      solids.set(body, built.value);
    }
    const hollow = cutCavities(solids, seg.bodyParent, owned);
    if (!hollow.ok) return hollow;
    const tops: Solid[] = [];
    for (const [body, s] of solids) {
      if ((seg.bodyParent[body] ?? -1) >= 0) continue;
      let u = unify(s, owned);
      if (opts.finish !== undefined && isSolid(u)) {
        const done = opts.finish(u);
        if (!done.ok) return done;
        if (done.value !== u) u = keep(done.value);
      }
      if (!isSolid(u) || !isValid(u)) return { ok: false, reason: 'rebuilt solid is not valid' };
      tops.push(u);
    }
    const first = tops[0];
    if (first === undefined) return { ok: false, reason: 'no outer body was rebuilt' };
    const result: Solid | Compound = tops.length === 1 ? first : keep(compound(tops));
    const dev = deviationOf(result, seg.deviation, opts.triangulation);
    if (!(dev.max <= opts.maxDeviation && dev.reverseMax <= opts.maxDeviation)) {
      return {
        ok: false,
        reason: `rebuilt solid deviates ${Math.max(dev.max, dev.reverseMax).toPrecision(3)} mm from the mesh`,
      };
    }
    // `result` is returned to the caller; everything else is released.
    owned.splice(owned.indexOf(result), 1);
    return {
      ok: true,
      value: {
        shape: result,
        stats: {
          patches: patches.length,
          pieces: pieces.length,
          kept,
          faces: getFaces(result).length,
        },
        deviation: dev,
      },
    };
  } finally {
    for (const o of owned) o[Symbol.dispose]();
  }
}
