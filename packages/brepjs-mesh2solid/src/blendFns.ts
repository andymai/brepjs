import {
  type Edge,
  type Solid,
  type ValidSolid,
  type Vec3,
  curvePointAt,
  facesOfEdge,
  fillet,
  getKernel,
  isSolid,
  isValid,
  normalAt,
} from 'brepjs';
import type { AnalyticSurface } from './analyticFns.js';

/** A fitted cylinder that rounds the edge between two planes. */
export interface EdgeBlend {
  readonly o: Vec3;
  readonly a: Vec3;
  readonly r: number;
}

export interface Blends {
  readonly edges: readonly EdgeBlend[];
  /** Ids of the surfaces the kernel's fillets will put back: edge blends and their corners. */
  readonly surfaces: ReadonlySet<number>;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

/** Axes within about 2° count as parallel. */
const PARALLEL = 0.035;

function axisDistance(o: Vec3, a: Vec3, p: Vec3): number {
  const v = sub(p, o);
  return len(sub(v, scale(a, dot(v, a))));
}

/**
 * Fitted surfaces a fillet would produce. A cylinder whose axis runs parallel
 * to two non-parallel planes, one radius from each, rounds the edge where they
 * meet; a sphere centered on two such axes with their radius, or any other
 * curved region centered within 1.5 radii of two of them, is the corner where
 * those fillets meet. Snapping made these relations exact on the fitted
 * surfaces, so `tol` only covers snaps that were declined.
 */
export function findBlends(
  surfaces: readonly AnalyticSurface[],
  bounds: readonly (readonly [Vec3, Vec3])[],
  tol: number
): Blends {
  const planes = surfaces.flatMap((s) => (s.kind === 'plane' ? [s] : []));
  const edges: EdgeBlend[] = [];
  const ids = new Set<number>();
  surfaces.forEach((s, i) => {
    if (s.kind !== 'cylinder') return;
    const sides = planes.filter(
      (p) =>
        Math.abs(dot(p.n, s.a)) <= PARALLEL && Math.abs(Math.abs(dot(p.n, s.o) - p.d) - s.r) <= tol
    );
    const crossed = sides.some((p, j) =>
      sides.slice(j + 1).some((q) => Math.abs(dot(p.n, q.n)) < 1 - PARALLEL)
    );
    if (!crossed) return;
    edges.push({ o: s.o, a: s.a, r: s.r });
    ids.add(i);
  });
  surfaces.forEach((s, i) => {
    if (s.kind === 'plane' || ids.has(i)) return;
    if (s.kind === 'sphere') {
      const on = edges.filter(
        (e) => Math.abs(e.r - s.r) <= tol && axisDistance(e.o, e.a, s.c) <= tol
      );
      if (on.length >= 2) ids.add(i);
    }
    // On a scan a corner where fillets meet can fit a torus or cone better
    // than its ball; the kernel's fillets rebuild the corner either way.
    const b = bounds[i];
    if (b === undefined) return;
    const mid: Vec3 = scale([b[0][0] + b[1][0], b[0][1] + b[1][1], b[0][2] + b[1][2]], 0.5);
    const near = edges.filter((e) => axisDistance(e.o, e.a, mid) <= 1.5 * e.r);
    if (near.length >= 2) ids.add(i);
  });
  return { edges: shareRadii(edges, tol), surfaces: ids };
}

/**
 * Fillets fitted to within `tol` of one radius were drawn with one radius:
 * give each such group its mean. Unequal radii meeting at a corner make the
 * kernel build a general vertex blend instead of a ball. A group spans at
 * most `tol` from its smallest radius, so no fillet's radius moves further
 * than that from its fit (a looser group would leave the fillet off the
 * edge `filletBlends` matches it to).
 */
function shareRadii(edges: readonly EdgeBlend[], tol: number): EdgeBlend[] {
  const order = edges.map((_, i) => i).sort((a, b) => (edges[a]?.r ?? 0) - (edges[b]?.r ?? 0));
  const shared = edges.map((e) => e.r);
  let start = 0;
  while (start < order.length) {
    const low = edges[order[start] ?? 0]?.r ?? 0;
    let end = start + 1;
    while (end < order.length && (edges[order[end] ?? 0]?.r ?? 0) - low <= tol) end++;
    const group = order.slice(start, end);
    const mean = group.reduce((sum, i) => sum + (edges[i]?.r ?? 0), 0) / group.length;
    for (const i of group) shared[i] = mean;
    start = end;
  }
  return edges.map((e, i) => ({ ...e, r: shared[i] ?? e.r }));
}

/**
 * Round every straight edge of `solid` between two planes that an edge blend
 * is tangent to, with that blend's radius. Corners where three rounded edges
 * meet come back as the kernel's vertex blends.
 */
export function filletBlends(
  solid: Solid,
  blends: readonly EdgeBlend[],
  tol: number
): { ok: true; value: Solid } | { ok: false; reason: string } {
  const k = getKernel();
  const radiusOf = (e: Edge): number | null => {
    if (k.curveType(e.wrapped).toUpperCase() !== 'LINE') return null;
    const p0 = curvePointAt(e, 0);
    const p1 = curvePointAt(e, 1);
    const along = sub(p1, p0);
    const l = len(along);
    if (l === 0) return null;
    const d = scale(along, 1 / l);
    const m = scale([p0[0] + p1[0], p0[1] + p1[1], p0[2] + p1[2]], 0.5);
    const faces = facesOfEdge(solid, e);
    const [fa, fb] = faces;
    if (faces.length !== 2 || fa === undefined || fb === undefined) return null;
    if (k.surfaceType(fa.wrapped) !== 'plane' || k.surfaceType(fb.wrapped) !== 'plane') return null;
    const na = normalAt(fa, m);
    const nb = normalAt(fb, m);
    for (const b of blends) {
      if (Math.abs(dot(b.a, d)) < 1 - PARALLEL) continue;
      const sa = dot(na, sub(b.o, m));
      const sb = dot(nb, sub(b.o, m));
      // Inside both faces (a convex edge) or outside both (a concave one).
      if (Math.sign(sa) !== Math.sign(sb)) continue;
      if (Math.abs(Math.abs(sa) - b.r) <= tol && Math.abs(Math.abs(sb) - b.r) <= tol) return b.r;
    }
    return null;
  };
  if (!isValid(solid)) return { ok: false, reason: 'the sharp solid is not valid' };
  const rounded = fillet(solid as ValidSolid, radiusOf);
  if (!rounded.ok)
    return { ok: false, reason: `filleting the blends failed: ${rounded.error.message}` };
  if (!isSolid(rounded.value))
    return { ok: false, reason: 'filleting the blends did not leave a solid' };
  return { ok: true, value: rounded.value };
}
