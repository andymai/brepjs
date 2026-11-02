import {
  type Edge,
  type Face,
  type Solid,
  type Vec3,
  curvePointAt,
  facesOfEdge,
  getEdges,
  getFaces,
  getKernel,
  normalAt,
} from 'brepjs';

/** What a removed face put on the part, so the program can put it back. */
export type Removal =
  | { readonly kind: 'fillet'; readonly radius: number }
  | { readonly kind: 'chamfer'; readonly distance: number }
  | {
      readonly kind: 'countersink';
      /** Center of the narrow end, on the axis. */
      readonly at: Vec3;
      /** Axis pointing from the narrow end to the wide end. */
      readonly axis: Vec3;
      readonly narrow: number;
      readonly wide: number;
      readonly depth: number;
    };

export interface Removable {
  readonly face: Face;
  readonly removal: Removal;
}

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

/** Same tangency test the engine's snap uses (about a degree). */
const TANGENT_COS = 0.99985;

function neighbours(solid: Solid, face: Face, e: Edge): Face[] {
  const k = getKernel();
  return facesOfEdge(solid, e).filter((f) => !k.isSame(f.wrapped, face.wrapped));
}

/** A curved face tangent to every neighbour it shares an edge with: a fillet or corner blend. */
function blendRadius(solid: Solid, face: Face): number | null {
  const k = getKernel();
  const t = k.surfaceType(face.wrapped);
  if (t !== 'cylinder' && t !== 'sphere' && t !== 'torus') return null;
  let seen = 0;
  for (const e of getEdges(face)) {
    const others = neighbours(solid, face, e);
    if (others.length === 0) continue;
    seen++;
    const p = curvePointAt(e, 0.5);
    for (const o of others) {
      if (Math.abs(dot(normalAt(face, p), normalAt(o, p))) < TANGENT_COS) return null;
    }
  }
  if (seen === 0) return null;
  const b = k.uvBounds(face.wrapped);
  const c = k.surfaceCurvature(face.wrapped, (b.uMin + b.uMax) / 2, (b.vMin + b.vMax) / 2);
  const kmax = Math.max(Math.abs(c.max), Math.abs(c.min));
  return kmax > 0 ? 1 / kmax : null;
}

const isLine = (e: Edge) => getKernel().curveType(e.wrapped).toUpperCase() === 'LINE';
const endpoints = (e: Edge): [Vec3, Vec3] => [curvePointAt(e, 0), curvePointAt(e, 1)];
const direction = (e: Edge): Vec3 => {
  const [a, b] = endpoints(e);
  return unit(sub(b, a));
};

/** Distance from `p` to the infinite line through `o` along `d` (unit). */
function lineDistance(p: Vec3, o: Vec3, d: Vec3): number {
  const v = sub(p, o);
  return len(sub(v, scale(d, dot(v, d))));
}

/**
 * The line where two planes meet, as a point and direction, or null when parallel.
 * Planes are given by a point and a normal.
 */
function planeLine(p1: Vec3, n1: Vec3, p2: Vec3, n2: Vec3): { o: Vec3; d: Vec3 } | null {
  const d = cross(n1, n2);
  const l = len(d);
  if (l < 1e-9) return null;
  const h1 = dot(n1, p1);
  const h2 = dot(n2, p2);
  // Point on both planes, closest to the origin: o = (h1 (n2 x d) + h2 (d x n1)) / |d|^2.
  const o = scale(add(scale(cross(n2, d), h1), scale(cross(d, n1), h2)), 1 / (l * l));
  return { o, d: unit(d) };
}

/**
 * A planar strip between two planes whose sharp edge it cut away: two of its
 * edges are parallel lines, each shared with one side face, and the side
 * faces' planes meet along a line parallel to them, outside the part, at an
 * equal setback from both.
 */
function chamferStrip(
  solid: Solid,
  face: Face,
  tol: number
): { distance: number; long: [Edge, Edge] } | null {
  const k = getKernel();
  if (k.surfaceType(face.wrapped) !== 'plane') return null;
  const edges = getEdges(face).filter(isLine);
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const ei = edges[i];
      const ej = edges[j];
      if (ei === undefined || ej === undefined) continue;
      if (Math.abs(dot(direction(ei), direction(ej))) < 1 - 1e-9) continue;
      const [ni] = neighbours(solid, face, ei);
      const [nj] = neighbours(solid, face, ej);
      if (ni === undefined || nj === undefined) continue;
      if (k.surfaceType(ni.wrapped) !== 'plane' || k.surfaceType(nj.wrapped) !== 'plane') continue;
      const pi = curvePointAt(ei, 0.5);
      const pj = curvePointAt(ej, 0.5);
      const sharp = planeLine(pi, normalAt(ni, pi), pj, normalAt(nj, pj));
      if (sharp === null || Math.abs(dot(sharp.d, direction(ei))) < 1 - 1e-9) continue;
      const di = lineDistance(pi, sharp.o, sharp.d);
      const dj = lineDistance(pj, sharp.o, sharp.d);
      // The sharp edge must lie off the part, beyond the strip, not inside it.
      const fn = normalAt(face, pi);
      const toSharp = sub(sharp.o, pi);
      const ahead = dot(sub(toSharp, scale(sharp.d, dot(toSharp, sharp.d))), fn);
      if (ahead <= 0 || Math.abs(di - dj) > Math.max(tol, 1e-6)) continue;
      // A main face between two chamfers also looks like a strip; a real
      // chamfer's setback is narrower than the faces on either side of it.
      const d = (di + dj) / 2;
      if (widthAcross(ni, sharp.d) <= d || widthAcross(nj, sharp.d) <= d) continue;
      return { distance: d, long: [ei, ej] };
    }
  }
  return null;
}

/** A planar face's extent across `along`, within its own plane. */
function widthAcross(face: Face, along: Vec3): number {
  const pts = getEdges(face).flatMap(endpoints);
  const first = pts[0];
  if (first === undefined) return 0;
  const across = unit(cross(normalAt(face, first), along));
  const hs = pts.map((p) => dot(p, across));
  return Math.max(...hs) - Math.min(...hs);
}

/**
 * The face where chamfer strips meet at a corner: each of its edges is the
 * short end of a strip (a main face between strips touches their long edges).
 */
function isChamferCorner(
  solid: Solid,
  face: Face,
  strips: readonly { face: Face; long: [Edge, Edge] }[]
): boolean {
  const k = getKernel();
  if (k.surfaceType(face.wrapped) !== 'plane') return false;
  const edges = getEdges(face);
  return (
    edges.length >= 3 &&
    edges.every((e) => {
      const [n] = neighbours(solid, face, e);
      const strip = n && strips.find((s) => k.isSame(s.face.wrapped, n.wrapped));
      return strip !== undefined && !strip.long.some((l) => k.isSame(l.wrapped, e.wrapped));
    })
  );
}

/**
 * The circle an edge runs along, from three of its points, checked against
 * more. Kernel intersections of coaxial surfaces can come back as splines that
 * are circles to within tolerance.
 */
function circleOf(e: Edge, tol: number): { c: Vec3; r: number; n: Vec3 } | null {
  const type = getKernel().curveType(e.wrapped).toUpperCase();
  if (type === 'LINE') return null;
  const a = curvePointAt(e, 0);
  const b = curvePointAt(e, 1 / 3);
  const c = curvePointAt(e, 2 / 3);
  const ab = sub(b, a);
  const ac = sub(c, a);
  const n = cross(ab, ac);
  const nn = dot(n, n);
  if (nn === 0) return null;
  const center = add(
    a,
    scale(add(scale(cross(n, ab), dot(ac, ac)), scale(cross(ac, n), dot(ab, ab))), 1 / (2 * nn))
  );
  const r = len(sub(a, center));
  const nu = unit(n);
  for (const t of [0.125, 0.25, 0.5, 0.75, 0.875]) {
    const p = sub(curvePointAt(e, t), center);
    if (Math.abs(len(p) - r) > tol || Math.abs(dot(p, nu)) > tol) return null;
  }
  return { c: center, r, n: nu };
}

/**
 * A concave cone opening onto a cap from a coaxial hole: the countersink's
 * two rims are the cone's circular edges.
 */
function countersink(face: Face, tol: number): Removal | null {
  const k = getKernel();
  if (k.surfaceType(face.wrapped) !== 'cone') return null;
  const edges = getEdges(face);
  const first = edges[0];
  if (first === undefined) return null;
  const rims = edges.map((e) => circleOf(e, tol)).filter((x) => x !== null);
  if (rims.length !== 2) return null;
  const [r0, r1] = rims;
  if (r0 === undefined || r1 === undefined) return null;
  const [narrow, wide] = r0.r < r1.r ? [r0, r1] : [r1, r0];
  const axis = unit(sub(wide.c, narrow.c));
  // Concave: the surface faces the axis (a hole), not away from it (a boss).
  const probe = curvePointAt(first, 0.5);
  const radial = sub(probe, add(narrow.c, scale(axis, dot(sub(probe, narrow.c), axis))));
  if (dot(normalAt(face, probe), radial) >= 0) return null;
  return {
    kind: 'countersink',
    at: narrow.c,
    axis,
    narrow: narrow.r,
    wide: wide.r,
    depth: len(sub(wide.c, narrow.c)),
  };
}

/**
 * Faces that defeaturing can remove and a feature can put back: fillets and
 * corner blends, chamfer strips and their corners, and countersinks.
 */
export function removableFaces(solid: Solid, tol: number): Removable[] {
  const out: Removable[] = [];
  const faces = getFaces(solid);
  for (const f of faces) {
    const r = blendRadius(solid, f);
    if (r !== null) out.push({ face: f, removal: { kind: 'fillet', radius: r } });
  }
  const strips: { face: Face; long: [Edge, Edge]; distance: number }[] = [];
  for (const f of faces) {
    const s = chamferStrip(solid, f, tol);
    if (s !== null) strips.push({ face: f, ...s });
  }
  for (const s of strips)
    out.push({ face: s.face, removal: { kind: 'chamfer', distance: s.distance } });
  for (const f of faces) {
    if (strips.some((s) => s.face === f) || !isChamferCorner(solid, f, strips)) continue;
    const first = strips[0];
    if (first !== undefined) {
      out.push({ face: f, removal: { kind: 'chamfer', distance: first.distance } });
    }
  }
  for (const f of faces) {
    const c = countersink(f, Math.max(tol, 1e-6));
    if (c !== null) out.push({ face: f, removal: c });
  }
  return out;
}
