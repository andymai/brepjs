import {
  type Edge,
  type Face,
  type Shell,
  type Solid,
  type ValidSolid,
  type Vec3,
  createPlane,
  curvePointAt,
  cut,
  extrude,
  flipFaceOrientation,
  getBounds,
  getEdges,
  getFaces,
  getKernel,
  getShells,
  getWires,
  isShell,
  isSolid,
  measureVolume,
  normalAt,
  polygon,
  removeFaces,
  sectionToFace,
  sewShells,
  solidFromShell,
} from 'brepjs';
import { type AnalyticSurface, surfaceDistance } from './analyticFns.js';
import { type Removable, removableFaces } from './defeatureFns.js';

export type Vec2 = readonly [number, number];

export type Segment =
  | { readonly kind: 'line'; readonly from: Vec2; readonly to: Vec2 }
  | { readonly kind: 'arc'; readonly from: Vec2; readonly via: Vec2; readonly to: Vec2 }
  | { readonly kind: 'circle'; readonly center: Vec2; readonly r: number };

/** A closed chain of segments, or a single circle. */
export type Loop = readonly Segment[];

export interface Profile {
  readonly outer: Loop;
  readonly holes: readonly Loop[];
}

/** Right-handed frame; profiles live in its xy plane. */
export interface Frame {
  readonly origin: Vec3;
  readonly x: Vec3;
  readonly y: Vec3;
  readonly z: Vec3;
}

export type BaseFeature =
  /** A profile in `frame`, extruded `height` along its z. */
  | {
      readonly op: 'extrude';
      readonly frame: Frame;
      readonly profile: Profile;
      readonly height: number;
    }
  /** A profile in `frame` (x radial, y along the axis), revolved a full turn about its y axis. */
  | { readonly op: 'revolve'; readonly frame: Frame; readonly profile: Profile }
  | { readonly op: 'sphere'; readonly center: Vec3; readonly r: number }
  | {
      readonly op: 'torus';
      readonly center: Vec3;
      readonly axis: Vec3;
      readonly major: number;
      readonly minor: number;
    };

/** A constant-radius fillet on the edges through these points (one point per edge). */
export interface FilletFeature {
  readonly op: 'fillet';
  readonly radius: number;
  readonly edges: readonly Vec3[];
}

/** A symmetric chamfer on the edges through these points (one point per edge). */
export interface ChamferFeature {
  readonly op: 'chamfer';
  readonly distance: number;
  readonly edges: readonly Vec3[];
}

/** A conical countersink, cut as a cone from its narrow end on the axis. */
export interface CountersinkFeature {
  readonly op: 'countersink';
  readonly at: Vec3;
  readonly axis: Vec3;
  readonly narrow: number;
  readonly wide: number;
  readonly depth: number;
}

export interface FeatureModel {
  /** Fused in order. */
  readonly base: readonly BaseFeature[];
  /** Internal voids, each its own feature model, cut from the part. */
  readonly cavities: readonly FeatureModel[];
  readonly countersinks: readonly CountersinkFeature[];
  readonly chamfers: readonly ChamferFeature[];
  readonly fillets: readonly FilletFeature[];
}

const only = (base: BaseFeature[]): FeatureModel => ({
  base,
  cavities: [],
  countersinks: [],
  chamfers: [],
  fillets: [],
});

export type FeatureResult = { ok: true; value: FeatureModel } | { ok: false; reason: string };

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

/** Plane normals this close to a direction count as parallel or perpendicular to it. */
const ALIGNED = 1e-9;

function frameFor(z: Vec3, origin: Vec3): Frame {
  const helper: Vec3 = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const x = unit(sub(helper, scale(z, dot(helper, z))));
  return { origin, x, y: cross(z, x), z };
}

const to2 = (f: Frame, p: Vec3): Vec2 => {
  const d = sub(p, f.origin);
  return [dot(d, f.x), dot(d, f.y)];
};

const near2 = (a: Vec2, b: Vec2, tol: number): boolean =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;

function circumcenter(a: Vec2, b: Vec2, c: Vec2): Vec2 | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (d === 0) return null;
  const a2 = a[0] * a[0] + a[1] * a[1];
  const b2 = b[0] * b[0] + b[1] * b[1];
  const c2 = c[0] * c[0] + c[1] * c[1];
  return [
    (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d,
    (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d,
  ];
}

/** One edge as a 2D segment in `f`, in the edge curve's own direction. */
function segmentOf(e: Edge, f: Frame, tol: number): Segment | null {
  const type = getKernel().curveType(e.wrapped).toUpperCase();
  const a = to2(f, curvePointAt(e, 0));
  const m = to2(f, curvePointAt(e, 0.5));
  const b = to2(f, curvePointAt(e, 1));
  if (type === 'LINE') return { kind: 'line', from: a, to: b };
  if (type !== 'CIRCLE') return null;
  if (near2(a, b, tol)) {
    const center = circumcenter(a, to2(f, curvePointAt(e, 1 / 3)), m);
    if (center === null) return null;
    return { kind: 'circle', center, r: Math.hypot(a[0] - center[0], a[1] - center[1]) };
  }
  return { kind: 'arc', from: a, via: m, to: b };
}

const reversed = (s: Segment): Segment =>
  s.kind === 'line'
    ? { kind: 'line', from: s.to, to: s.from }
    : s.kind === 'arc'
      ? { kind: 'arc', from: s.to, via: s.via, to: s.from }
      : s;

const startOf = (s: Segment): Vec2 => (s.kind === 'circle' ? s.center : s.from);
const endOf = (s: Segment): Vec2 => (s.kind === 'circle' ? s.center : s.to);

/** Chain segments end to start (wire order is not guaranteed), then merge collinear runs. */
function chain(segs: Segment[], tol: number): Loop | null {
  const circle = segs.find((s) => s.kind === 'circle');
  if (circle !== undefined) return segs.length === 1 ? [circle] : null;
  const rest = [...segs];
  const first = rest.shift();
  if (first === undefined) return null;
  const out: Segment[] = [first];
  let tail = endOf(first);
  while (rest.length > 0) {
    const i = rest.findIndex((s) => near2(startOf(s), tail, tol) || near2(endOf(s), tail, tol));
    const next = rest.splice(i, 1)[0];
    if (i < 0 || next === undefined) return null;
    const oriented = near2(startOf(next), tail, tol) ? next : reversed(next);
    out.push(oriented);
    tail = endOf(oriented);
  }
  if (!near2(tail, startOf(first), tol)) return null;
  return mergeCollinear(out, tol);
}

function collinear(a: Vec2, b: Vec2, c: Vec2, tol: number): boolean {
  const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return l > 0 && Math.abs(area) / l <= tol;
}

function mergeCollinear(loop: Segment[], tol: number): Segment[] {
  const out: Segment[] = [];
  for (const s of loop) {
    const prev = out[out.length - 1];
    if (prev?.kind === 'line' && s.kind === 'line' && collinear(prev.from, prev.to, s.to, tol)) {
      out[out.length - 1] = { kind: 'line', from: prev.from, to: s.to };
    } else out.push(s);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (
    out.length > 2 &&
    first?.kind === 'line' &&
    last?.kind === 'line' &&
    collinear(last.from, last.to, first.to, tol)
  ) {
    out[0] = { kind: 'line', from: last.from, to: first.to };
    out.pop();
  }
  return out;
}

/** A planar section face as a profile in `f`. */
function profileOf(face: Face, f: Frame, tol: number): Profile | null {
  const k = getKernel();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- kernel handles are untyped WASM objects
  const outerWire = k.outerWire(face.wrapped);
  let outer: Loop | null = null;
  const holes: Loop[] = [];
  for (const w of getWires(face)) {
    const segs: Segment[] = [];
    for (const e of getEdges(w)) {
      const s = segmentOf(e, f, tol);
      if (s === null) return null;
      segs.push(s);
    }
    const loop = chain(segs, tol);
    if (loop === null) return null;
    if (k.isSame(w.wrapped, outerWire)) outer = loop;
    else holes.push(loop);
  }
  return outer === null ? null : { outer, holes };
}

/** A cylinder's axis: perpendicular to its normals at two points around it. */
function cylinderAxis(f: Face): Vec3 | null {
  const k = getKernel();
  const b = k.uvBounds(f.wrapped);
  const v = (b.vMin + b.vMax) / 2;
  const n0 = k.surfaceNormal(f.wrapped, b.uMin, v);
  for (const t of [0.25, 0.5, 0.75]) {
    const n1 = k.surfaceNormal(f.wrapped, b.uMin + t * (b.uMax - b.uMin), v);
    const a = cross(n0, n1);
    if (len(a) > 1e-6) return unit(a);
  }
  return null;
}

/**
 * Cap heights along `d` when every face is a cap (plane square to `d`) or a
 * wall (plane containing `d`, or cylinder along it); null otherwise.
 */
function capHeights(solid: Solid, d: Vec3): number[] | null {
  const k = getKernel();
  const caps: number[] = [];
  for (const f of getFaces(solid)) {
    const probe = getEdges(f)[0];
    if (probe === undefined) return null;
    const t = k.surfaceType(f.wrapped);
    if (t === 'plane') {
      const c = Math.abs(dot(normalAt(f), d));
      if (c > 1 - ALIGNED) caps.push(dot(curvePointAt(probe, 0), d));
      else if (c > ALIGNED) return null;
    } else if (t === 'cylinder') {
      const axis = cylinderAxis(f);
      if (axis === null || Math.abs(dot(axis, d)) < 1 - ALIGNED) return null;
    } else return null;
  }
  return caps;
}

function distinct(values: number[], tol: number): number[] {
  const out: number[] = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last === undefined || v - last > tol) out.push(v);
  }
  return out;
}

/** Plane normals, one per direction (sign fixed), most common first. */
function directions(solid: Solid): Vec3[] {
  const k = getKernel();
  const found: { d: Vec3; n: number }[] = [];
  for (const f of getFaces(solid)) {
    if (k.surfaceType(f.wrapped) !== 'plane') continue;
    const n = unit(normalAt(f));
    const hit = found.find((x) => Math.abs(dot(x.d, n)) > 1 - ALIGNED);
    if (hit) hit.n++;
    else {
      const lead = n.find((c) => Math.abs(c) > ALIGNED) ?? 1;
      found.push({ d: lead < 0 ? scale(n, -1) : n, n: 1 });
    }
  }
  return found.sort((a, b) => b.n - a.n).map((x) => x.d);
}

/** Fewest slabs first; on a tie, extrude up Z (then Y), the way parts are usually drawn. */
function better(a: { d: Vec3; hs: number[] }, b: { d: Vec3; hs: number[] }): boolean {
  if (a.hs.length !== b.hs.length) return a.hs.length < b.hs.length;
  if (Math.abs(a.d[2]) !== Math.abs(b.d[2])) return Math.abs(a.d[2]) > Math.abs(b.d[2]);
  return Math.abs(a.d[1]) > Math.abs(b.d[1]);
}

/** A stack of slabs along the best direction where every face is a cap or a wall. */
function extrusions(solid: Solid, tol: number): BaseFeature[] | null {
  let best: { d: Vec3; hs: number[] } | null = null;
  for (const d of directions(solid)) {
    const caps = capHeights(solid, d);
    if (caps === null) continue;
    const cand = { d, hs: distinct(caps, tol) };
    if (cand.hs.length >= 2 && (best === null || better(cand, best))) best = cand;
  }
  if (best === null) return null;
  const out: BaseFeature[] = [];
  for (let i = 0; i + 1 < best.hs.length; i++) {
    const h0 = best.hs[i] ?? 0;
    const h1 = best.hs[i + 1] ?? 0;
    const frame = frameFor(best.d, scale(best.d, h0));
    const sec = sectionToFace(solid, createPlane(scale(best.d, (h0 + h1) / 2), frame.x, best.d));
    if (!sec.ok) return null;
    try {
      const profile = profileOf(sec.value, frame, tol);
      if (profile === null) return null;
      out.push({ op: 'extrude', frame, profile, height: h1 - h0 });
    } finally {
      sec.value[Symbol.dispose]();
    }
  }
  return out;
}

function uvOf(f: Face, p: Vec3): [number, number] {
  return getKernel().uvFromPoint(f.wrapped, [p[0], p[1], p[2]]) ?? [Number.NaN, Number.NaN];
}

/**
 * Edges of `sharp` that a removed fillet or chamfer took off, grouped by kind
 * and size. Such an edge sits off the original solid, within the feature's
 * size of the face that replaced it; an untouched edge lies on the solid.
 */
function edgeFeatures(
  sharp: Solid,
  solid: Solid,
  removed: readonly Removable[],
  tol: number
): { fillets: FilletFeature[]; chamfers: ChamferFeature[] } {
  const k = getKernel();
  const faces = getFaces(solid);
  const fillets: FilletFeature[] = [];
  const chamfers: ChamferFeature[] = [];
  for (const e of getEdges(sharp)) {
    const m = curvePointAt(e, 0.5);
    const onSolid = faces.some(
      (f) =>
        len(sub(k.projectPointOnFace(f.wrapped, [m[0], m[1], m[2]]), m)) <= tol &&
        k.classifyPointOnFace(f.wrapped, ...uvOf(f, m)) !== 'out'
    );
    if (onSolid) continue;
    let owner: { removal: Removable['removal']; d: number } | null = null;
    for (const r of removed) {
      const d = len(sub(k.projectPointOnFace(r.face.wrapped, [m[0], m[1], m[2]]), m));
      if (owner === null || d < owner.d) owner = { removal: r.removal, d };
    }
    if (owner === null) continue;
    const rm = owner.removal;
    if (rm.kind === 'fillet' && owner.d <= rm.radius) {
      const g = fillets.find((x) => Math.abs(x.radius - rm.radius) <= tol);
      if (g) (g.edges as Vec3[]).push(m);
      else fillets.push({ op: 'fillet', radius: rm.radius, edges: [m] });
    } else if (rm.kind === 'chamfer' && owner.d <= rm.distance) {
      const g = chamfers.find((x) => Math.abs(x.distance - rm.distance) <= tol);
      if (g) (g.edges as Vec3[]).push(m);
      else chamfers.push({ op: 'chamfer', distance: rm.distance, edges: [m] });
    }
  }
  return { fillets, chamfers };
}

function primitive(s: AnalyticSurface | undefined): BaseFeature | null {
  if (s?.kind === 'sphere') return { op: 'sphere', center: s.c, r: s.r };
  if (s?.kind === 'torus') {
    return { op: 'torus', center: s.c, axis: s.a, major: s.major, minor: s.minor };
  }
  return null;
}

/** A common axis for every surface, when all of them are surfaces of revolution about it. */
function revolutionAxis(
  surfaces: readonly AnalyticSurface[],
  tol: number
): { o: Vec3; a: Vec3 } | null {
  let axis: { o: Vec3; a: Vec3 } | null = null;
  for (const s of surfaces) {
    if (s.kind === 'cylinder') axis ??= { o: s.o, a: s.a };
    else if (s.kind === 'cone') axis ??= { o: s.apex, a: s.a };
    else if (s.kind === 'torus') axis ??= { o: s.c, a: s.a };
  }
  if (axis === null) {
    // Spheres and planes only: the axis runs through a sphere center along a plane normal.
    const sp = surfaces.find((s) => s.kind === 'sphere');
    const pl = surfaces.find((s) => s.kind === 'plane');
    if (sp?.kind !== 'sphere' || pl?.kind !== 'plane') return null;
    axis = { o: sp.c, a: pl.n };
  }
  const o = axis.o;
  const a = unit(axis.a);
  const onAxis = (p: Vec3) => {
    const v = sub(p, o);
    return len(sub(v, scale(a, dot(v, a)))) <= tol;
  };
  const parallel = (d: Vec3) => Math.abs(dot(unit(d), a)) > 1 - ALIGNED;
  for (const s of surfaces) {
    const fits =
      s.kind === 'plane'
        ? parallel(s.n)
        : s.kind === 'sphere'
          ? onAxis(s.c)
          : s.kind === 'cylinder'
            ? parallel(s.a) && onAxis(s.o)
            : s.kind === 'cone'
              ? parallel(s.a) && onAxis(s.apex)
              : parallel(s.a) && onAxis(s.c);
    if (!fits) return null;
  }
  return { o, a };
}

/** Lead with the axis pointing up (+Z, else +Y, else +X), the way turned parts are drawn. */
function upward(a: Vec3): Vec3 {
  const lead = Math.abs(a[2]) > ALIGNED ? a[2] : Math.abs(a[1]) > ALIGNED ? a[1] : a[0];
  return lead < 0 ? scale(a, -1) : a;
}

/** The half-section through the axis, revolved: a turned part. */
function revolution(
  solid: Solid,
  surfaces: readonly AnalyticSurface[],
  tol: number
): BaseFeature | null {
  const found = revolutionAxis(surfaces, Math.max(tol, 1e-6));
  if (found === null) return null;
  const a = upward(found.a);
  const b = getBounds(solid);
  const size = 4 * Math.hypot(b.xMax - b.xMin, b.yMax - b.yMin, b.zMax - b.zMin);
  const helper: Vec3 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const x = unit(sub(helper, scale(a, dot(helper, a))));
  // The axis point nearest the world origin, so the code reads cleanly.
  const origin = sub(found.o, scale(a, dot(found.o, a)));
  const frame: Frame = { origin, x, y: a, z: cross(x, a) };
  // Cut away the half behind the axis plane; its section then ends exactly on the axis.
  const corner = (u: number, v: number): Vec3 =>
    add(add(origin, scale(a, u * size)), scale(frame.z, v * size));
  const square = polygon([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]);
  if (!square.ok) return null;
  try {
    const behind = extrude(square.value, scale(x, -size));
    if (!behind.ok) return null;
    try {
      const half = cut(solid, behind.value);
      if (!half.ok) return null;
      try {
        const sec = sectionToFace(half.value, createPlane(origin, x, frame.z));
        if (!sec.ok) return null;
        try {
          const profile = profileOf(sec.value, frame, tol);
          return profile === null ? null : { op: 'revolve', frame, profile };
        } finally {
          sec.value[Symbol.dispose]();
        }
      } finally {
        half.value[Symbol.dispose]();
      }
    } finally {
      behind.value[Symbol.dispose]();
    }
  } finally {
    square.value[Symbol.dispose]();
  }
}

/** A closed shell as an outward-facing solid. */
function shellSolid(shell: Shell): Solid | null {
  const faces = getFaces(shell);
  const flipped = faces.map((f) => flipFaceOrientation(f));
  try {
    for (const attempt of [faces, flipped]) {
      const sewn = sewShells(attempt, true);
      if (!sewn.ok) continue;
      const solid = isShell(sewn.value) ? solidFromShell(sewn.value) : null;
      sewn.value[Symbol.dispose]();
      if (solid?.ok) {
        const v = measureVolume(solid.value);
        if (v.ok && v.value > 0) return solid.value;
        solid.value[Symbol.dispose]();
      }
    }
    return null;
  } finally {
    for (const f of flipped) f[Symbol.dispose]();
  }
}

/** The fitted surfaces that carry one of `shape`'s faces. */
export function surfacesOf(
  shape: Solid,
  surfaces: readonly AnalyticSurface[],
  tol: number
): AnalyticSurface[] {
  const faces = getFaces(shape);
  return surfaces.filter((s) => onFaces(faces, s, tol));
}

const PROBES: readonly (readonly [number, number])[] = [
  [0.5, 0.5],
  [0.25, 0.25],
  [0.75, 0.75],
];

/**
 * Does `surface` carry one of `faces`? A face must be the same kind of surface
 * and lie on it at points across its parameter range: one crossing point (a
 * far-off plane through a cone's cap center) is not enough. Points are on the
 * face's own surface, not its center of mass, which sits at a sphere's center.
 */
function onFaces(faces: readonly Face[], surface: AnalyticSurface, tol: number): boolean {
  const k = getKernel();
  const near = Math.max(tol, 1e-6);
  return faces.some((f) => {
    if (k.surfaceType(f.wrapped) !== surface.kind) return false;
    const b = k.uvBounds(f.wrapped);
    return PROBES.every(([tu, tv]) => {
      const p = k.pointOnSurface(
        f.wrapped,
        b.uMin + tu * (b.uMax - b.uMin),
        b.vMin + tv * (b.vMax - b.vMin)
      );
      return surfaceDistance(surface, p) <= near;
    });
  });
}

/** Recognize one shell on its own; a single closed face is the primitive it lies on. */
function shellModel(
  shell: Shell,
  surfaces: readonly AnalyticSurface[],
  tol: number
): FeatureResult {
  const faces = getFaces(shell);
  const own = surfaces.filter((x) => onFaces(faces, x, tol));
  const single = faces.length === 1 ? primitive(own[0]) : null;
  if (single !== null) return { ok: true, value: only([single]) };
  const solid = shellSolid(shell);
  if (solid === null) return { ok: false, reason: 'a shell of the solid does not close' };
  try {
    return recognizeFeatures(solid, own, tol);
  } finally {
    solid[Symbol.dispose]();
  }
}

function withCavities(
  shells: readonly Shell[],
  surfaces: readonly AnalyticSurface[],
  tol: number
): FeatureResult {
  // The outer shell encloses the others, so its bounding box is the largest.
  const size = (sh: Shell) => {
    const b = getBounds(sh);
    return Math.hypot(b.xMax - b.xMin, b.yMax - b.yMin, b.zMax - b.zMin);
  };
  const outer = shells.reduce((a, b) => (size(b) > size(a) ? b : a));
  const main = shellModel(outer, surfaces, tol);
  if (!main.ok) return main;
  const cavities: FeatureModel[] = [];
  for (const sh of shells) {
    if (sh === outer) continue;
    const c = shellModel(sh, surfaces, tol);
    if (!c.ok) return { ok: false, reason: `cavity: ${c.reason}` };
    cavities.push(c.value);
  }
  return { ok: true, value: { ...main.value, cavities } };
}

/**
 * Read a feature model off an exact solid: strip constant-radius fillets
 * (defeaturing restores the sharp edges they replaced), then describe what is
 * left as slabs extruded along one direction, or as a revolved profile.
 * Internal voids become cavities, recognized the same way and cut out.
 */
export function recognizeFeatures(
  solid: Solid,
  surfaces: readonly AnalyticSurface[],
  tol: number
): FeatureResult {
  const shells = getShells(solid);
  if (shells.length > 1) return withCavities(shells, surfaces, tol);
  const faces = getFaces(solid);
  if (faces.length === 1) {
    const p = primitive(surfaces[0]);
    if (p !== null) return { ok: true, value: only([p]) };
  }
  const removable = removableFaces(solid, tol);
  let sharp: Solid = solid;
  let owned: Solid | null = null;
  let removed: readonly Removable[] = [];
  try {
    // Remove every feature face at once; if the kernel can't, fall back to fillets alone.
    const fillets = removable.filter((r) => r.removal.kind === 'fillet');
    for (const attempt of [removable, fillets]) {
      if (attempt.length === 0) continue;
      const out = removeFaces(
        solid as ValidSolid,
        attempt.map((r) => r.face)
      );
      if (out.ok && isSolid(out.value)) {
        owned = out.value;
        sharp = out.value;
        removed = attempt;
        break;
      }
      if (out.ok) out.value[Symbol.dispose]();
    }
    const base = extrusions(sharp, tol);
    if (base !== null) {
      const edges =
        sharp === solid ? { fillets: [], chamfers: [] } : edgeFeatures(sharp, solid, removed, tol);
      const countersinks: CountersinkFeature[] = removed.flatMap((r) => {
        const c = r.removal;
        if (c.kind !== 'countersink') return [];
        const { at, axis, narrow, wide, depth } = c;
        return [{ op: 'countersink', at, axis, narrow, wide, depth }];
      });
      return {
        ok: true,
        value: {
          base,
          cavities: [],
          countersinks,
          chamfers: edges.chamfers,
          fillets: edges.fillets,
        },
      };
    }
    // A turned part keeps its fillets in the profile.
    const turned = revolution(solid, surfaces, tol);
    if (turned !== null) return { ok: true, value: only([turned]) };
    return { ok: false, reason: 'no extrusion direction or revolution axis describes every face' };
  } finally {
    owned?.[Symbol.dispose]();
  }
}
