/**
 * Manifold-native B-rep-builder shims for planar profiles.
 *
 * Manifold has no wire/face topology, so brepjs's `sketch().extrude()` lowering
 * (edges -> wire -> face -> prism) otherwise dies at `makeWire`/`makeFace`. These
 * shims record the profile's 2D outline + plane frame in the op-graph so the
 * existing native `extrude`/`revolve` (which read it via `profileCrossSection`)
 * fire — turning sketch-based construction into fast mesh CSG instead of an OCCT
 * round-trip. Curves with no exact polygon (arc, circle, ellipse, bezier) are
 * sampled to a polyline at preview resolution; lines are exact.
 *
 * Edge/wire/face handles are consumed only via their op-node params (`pts`,
 * `ring`, `outline`) — never unwrapped to a real solid — so they share one inert
 * sentinel in the `manifold` slot.
 * @module
 */

import type { KernelShape } from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import type { ManifoldModule } from './helpers.js';
import { makeNode, type OpNode } from './opGraph.js';
import { type CurveDesc, descPointAt } from './curveDesc.js';
import { wrap, nodeOf, asManifoldShape, resolveOcct } from './meshHandle.js';
import {
  add,
  cross,
  dot,
  ensureCCW,
  normalize3,
  scaleVec,
  sub,
  length3,
  type Vec2,
  type Vec3,
} from './approximations.js';

/** Fallback full-circle segment count when the kernel exposes no quality fn. */
const FULL_CIRCLE_SEGMENTS = 24;
/** Bezier sampling segments per edge. */
const BEZIER_SEGMENTS = 24;

/**
 * Full-circle segment count, following the Manifold global quality setting
 * (`getCircularSegments`) when available so profile-curve fidelity scales with
 * the kernel's tessellation quality — fine for accuracy-sensitive callers,
 * coarse for fast preview — instead of a hardcoded constant. Set by
 * {@link makeProfileBuilders}.
 */
let circularSegmentsFor: ((radius: number) => number) | null = null;

function fullCircleSegments(radius: number): number {
  const r = Math.max(Math.abs(radius), 1e-6);
  const n = circularSegmentsFor ? circularSegmentsFor(r) : FULL_CIRCLE_SEGMENTS;
  return Math.max(FULL_CIRCLE_SEGMENTS, n);
}

const ZERO3: Vec3 = [0, 0, 0];
const EPS_JOIN = 1e-6;

type Pts = Vec3[];

// delete() is a no-op (safe to share); isEmpty reports non-empty so isNull()
// treats the handle as a valid shape.
const PLACEHOLDER: unknown = { delete: () => {}, isEmpty: () => false };

function at3(pts: Pts, i: number): Vec3 {
  return pts[i] ?? ZERO3;
}

function arcSegments(angleSpan: number, radius = 1): number {
  return Math.max(2, Math.ceil((Math.abs(angleSpan) / (2 * Math.PI)) * fullCircleSegments(radius)));
}

function pickPerp(n: Vec3): Vec3 {
  const a: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return normalize3(cross(n, a));
}

/** Sample a circular arc in the plane framed by `normal` about `center`. */
function sampleArc(
  center: Vec3,
  normal: Vec3,
  radius: number,
  startAngle: number,
  endAngle: number,
  xDir?: Vec3
): Pts {
  const n = normalize3(normal);
  const x = xDir ? normalize3(xDir) : pickPerp(n);
  const y = normalize3(cross(n, x));
  const span = endAngle - startAngle;
  const segs = arcSegments(span, radius);
  const pts: Pts = [];
  for (let i = 0; i <= segs; i++) {
    const a = startAngle + (span * i) / segs;
    pts.push(
      add(center, add(scaleVec(x, radius * Math.cos(a)), scaleVec(y, radius * Math.sin(a))))
    );
  }
  return pts;
}

/** Circular arc through three points, sampled as a polyline p1..p2..p3. */
function circleFrom3(p1: Vec3, p2: Vec3, p3: Vec3): Pts {
  const v1 = sub(p2, p1);
  const v2 = sub(p3, p1);
  const n = cross(v1, v2);
  if (length3(n) < 1e-12) return [p1, p2, p3]; // collinear → straight polyline
  const nn = normalize3(n);
  const b = dot(v1, v1);
  const c = dot(v2, v2);
  const d = dot(v1, v2);
  const denom = 2 * (b * c - d * d);
  if (Math.abs(denom) < 1e-18) return [p1, p2, p3];
  const s = (c * (b - d)) / denom;
  const t = (b * (c - d)) / denom;
  const center = add(p1, add(scaleVec(v1, s), scaleVec(v2, t)));
  const radius = length3(sub(p1, center));
  const x = normalize3(sub(p1, center));
  const y = normalize3(cross(nn, x));
  const angleOf = (p: Vec3): number => Math.atan2(dot(sub(p, center), y), dot(sub(p, center), x));
  let a3 = angleOf(p3);
  if (a3 < 0) a3 += 2 * Math.PI;
  return sampleArc(center, nn, radius, 0, a3, x);
}

/** De Casteljau sampling of a Bezier of arbitrary degree. */
function sampleBezier(points: Pts): Pts {
  const out: Pts = [];
  for (let i = 0; i <= BEZIER_SEGMENTS; i++) {
    const t = i / BEZIER_SEGMENTS;
    const tmp = points.map((p) => [...p] as Vec3);
    for (let k = 1; k < tmp.length; k++) {
      for (let j = 0; j < tmp.length - k; j++) {
        const a = at3(tmp, j);
        const bnext = at3(tmp, j + 1);
        tmp[j] = [
          a[0] * (1 - t) + bnext[0] * t,
          a[1] * (1 - t) + bnext[1] * t,
          a[2] * (1 - t) + bnext[2] * t,
        ];
      }
    }
    out.push(at3(tmp, 0));
  }
  return out;
}

/** Newell's method: area-weighted normal of a (possibly non-convex) planar ring. */
function ringNormal(ring: Pts): Vec3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = at3(ring, i);
    const b = at3(ring, (i + 1) % ring.length);
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const n: Vec3 = [nx, ny, nz];
  return length3(n) < 1e-12 ? [0, 0, 1] : normalize3(n);
}

function coincident(a: Vec3, b: Vec3): boolean {
  return length3(sub(a, b)) < EPS_JOIN;
}

/** Chain edge polylines head-to-tail into one closed ring (flipping as needed). */
function chainEdges(edgePts: Pts[]): Pts {
  const first = edgePts[0];
  if (!first) return [];
  const ring: Pts = [...first];
  for (let i = 1; i < edgePts.length; i++) {
    let pts = edgePts[i] ?? [];
    if (pts.length === 0) continue;
    const end = at3(ring, ring.length - 1);
    const startsAtEnd = coincident(at3(pts, 0), end);
    const endsAtEnd = coincident(at3(pts, pts.length - 1), end);
    if (!startsAtEnd && endsAtEnd) pts = [...pts].reverse();
    const startSame = coincident(at3(pts, 0), end);
    for (let k = startSame ? 1 : 0; k < pts.length; k++) ring.push(at3(pts, k));
  }
  if (ring.length > 1 && coincident(at3(ring, 0), at3(ring, ring.length - 1))) ring.pop();
  return ring;
}

/** Project a planar 3D ring onto its own plane → 2D outline + world frame. */
function frameFromRing(ring: Pts): { outline: Vec2[]; origin: Vec3; xAxis: Vec3; yAxis: Vec3 } {
  const normal = ringNormal(ring);
  const origin = at3(ring, 0);
  let xAxis = ring.length > 1 ? normalize3(sub(at3(ring, 1), origin)) : pickPerp(normal);
  xAxis = normalize3(sub(xAxis, scaleVec(normal, dot(xAxis, normal))));
  if (length3(xAxis) < 1e-9) xAxis = pickPerp(normal);
  const yAxis = normalize3(cross(normal, xAxis));
  const outline: Vec2[] = ensureCCW(
    ring.map((p) => {
      const rel = sub(p, origin);
      return [dot(rel, xAxis), dot(rel, yAxis)] as Vec2;
    })
  );
  return { outline, origin, xAxis, yAxis };
}

const OCCT_CURVE_SEGMENTS = 12;

/** Sample an OCCT edge into a polyline (line → endpoints, curve → 24 segments). */
function sampleOcctEdge(occt: KernelAdapter, edge: KernelShape): Pts {
  const [t0, t1] = occt.curveParameters(edge);
  let segs = OCCT_CURVE_SEGMENTS;
  try {
    if (occt.curveType(edge) === 'line') segs = 1;
  } catch {
    /* unknown curve type → fall back to dense sampling */
  }
  const pts: Pts = [];
  for (let i = 0; i <= segs; i++) {
    pts.push(occt.curvePointAtParam(edge, t0 + ((t1 - t0) * i) / segs));
  }
  return pts;
}

/** Discretize an OCCT wire (from the 2D-delegated blueprint path) into a ring. */
function discretizeOcctWire(occt: KernelAdapter, wire: KernelShape): Pts {
  const edges = occt.iterShapes(wire, 'edge');
  return chainEdges(edges.map((e) => sampleOcctEdge(occt, e)));
}

export interface ProfileBuilders {
  makeVertex(x: number, y: number, z: number): KernelShape;
  makeLineEdge(p1: Vec3, p2: Vec3): KernelShape;
  makeCircleEdge(center: Vec3, normal: Vec3, radius: number): KernelShape;
  makeCircleArc(
    center: Vec3,
    normal: Vec3,
    radius: number,
    startAngle: number,
    endAngle: number
  ): KernelShape;
  makeArcEdge(p1: Vec3, p2: Vec3, p3: Vec3): KernelShape;
  makeEllipseEdge(
    center: Vec3,
    normal: Vec3,
    majorRadius: number,
    minorRadius: number,
    xDir?: Vec3
  ): KernelShape;
  makeBezierEdge(points: Vec3[]): KernelShape;
  makeTangentArc(startPoint: Vec3, startTangent: Vec3, endPoint: Vec3): KernelShape;
  makeHelixWire(
    pitch: number,
    height: number,
    radius: number,
    center?: Vec3,
    direction?: Vec3,
    leftHanded?: boolean
  ): KernelShape;
  makeWire(edges: KernelShape[]): KernelShape;
  makeWireFromMixed(items: KernelShape[]): KernelShape;
  makeFace(wire: KernelShape, planar?: boolean): KernelShape;
  addHolesInFace(face: KernelShape, holeWires: KernelShape[]): KernelShape;
  makePolygonFace(points: Vec3[]): KernelShape;
}

export function makeProfileBuilders(module: ManifoldModule): ProfileBuilders {
  // Follow the kernel's global tessellation quality for profile-curve sampling.
  const getSegs = (module as { getCircularSegments?: (r: number) => number }).getCircularSegments;
  if (typeof getSegs === 'function') circularSegmentsFor = (r) => getSegs(r);

  function edge(pts: Pts, curve?: CurveDesc): KernelShape {
    const params = curve ? { pts, curve } : { pts };
    return wrap(PLACEHOLDER, makeNode('profileEdge', params, [])) as KernelShape;
  }

  /** In-plane orthonormal frame (x, y) for a conic on a plane with the given normal. */
  function conicFrame(normal: Vec3, xDir?: Vec3): { x: Vec3; y: Vec3 } {
    const n = normalize3(normal);
    const x = xDir ? normalize3(xDir) : pickPerp(n);
    return { x, y: normalize3(cross(n, x)) };
  }

  /** Analytic conic descriptor for the circle through three points (or null if collinear). */
  function conicDescFrom3(p1: Vec3, p2: Vec3, p3: Vec3): CurveDesc | undefined {
    const v1 = sub(p2, p1);
    const v2 = sub(p3, p1);
    const n = cross(v1, v2);
    if (length3(n) < 1e-12) return undefined;
    const nn = normalize3(n);
    const b = dot(v1, v1);
    const c = dot(v2, v2);
    const dd = dot(v1, v2);
    const denom = 2 * (b * c - dd * dd);
    if (Math.abs(denom) < 1e-18) return undefined;
    const s = (c * (b - dd)) / denom;
    const t = (b * (c - dd)) / denom;
    const center = add(p1, add(scaleVec(v1, s), scaleVec(v2, t)));
    const radius = length3(sub(p1, center));
    const x = normalize3(sub(p1, center));
    const y = normalize3(cross(nn, x));
    let a1 = Math.atan2(dot(sub(p3, center), y), dot(sub(p3, center), x));
    if (a1 < 0) a1 += 2 * Math.PI;
    return { k: 'conic', center, x, y, rx: radius, ry: radius, a0: 0, a1 };
  }

  // Edge/wire handles carry `pts`/`ring`; OCCT shapes (2D-delegated blueprint
  // path) are discretized via the registered OCCT kernel.
  function ringOrPts(shape: KernelShape): Pts {
    const ms = asManifoldShape(shape);
    if (ms) {
      const params = (ms.node as { params?: { ring?: Pts; pts?: Pts } }).params;
      return params?.ring ?? params?.pts ?? [];
    }
    const occt = resolveOcct();
    return occt ? sampleOcctEdge(occt, shape) : [];
  }

  function inputNodes(items: KernelShape[]): OpNode[] {
    const nodes: OpNode[] = [];
    for (const it of items) {
      const ms = asManifoldShape(it);
      if (ms) nodes.push(nodeOf(ms));
    }
    return nodes;
  }

  function wireFrom(items: KernelShape[]): KernelShape {
    const ring = chainEdges(items.map((e) => ringOrPts(e)));
    // Record the projected 2D outline + frame on the wire too, so loft/sweep
    // (which read profileCrossSection from a wire, not a face) work directly.
    const frame = ring.length >= 3 ? frameFromRing(ring) : undefined;
    return wrap(
      PLACEHOLDER,
      makeNode('profileWire', { ring, ...frame }, inputNodes(items))
    ) as KernelShape;
  }

  function faceFromRing(ring: Pts, input?: OpNode): KernelShape {
    const { outline, origin, xAxis, yAxis } = frameFromRing(ring);
    return wrap(
      PLACEHOLDER,
      makeNode('profileFace', { outline, origin, xAxis, yAxis }, input ? [input] : [])
    ) as KernelShape;
  }

  function makeFace(wire: KernelShape): KernelShape {
    const ms = asManifoldShape(wire);
    if (ms) {
      const ring = (ms.node as { params?: { ring?: Pts } }).params?.ring ?? [];
      if (ring.length >= 3) return faceFromRing(ring, nodeOf(ms));
    }
    // OCCT wire from the 2D-delegated blueprint path → discretize its edges.
    const occt = resolveOcct();
    const ring = occt ? discretizeOcctWire(occt, wire) : [];
    return faceFromRing(ring, ms ? nodeOf(ms) : undefined);
  }

  interface FaceParams {
    outline?: Vec2[];
    holes?: Vec2[][];
    origin?: Vec3;
    xAxis?: Vec3;
    yAxis?: Vec3;
  }

  function addHolesInFace(face: KernelShape, holeWires: KernelShape[]): KernelShape {
    const fms = asManifoldShape(face);
    const fp = (fms?.node as { params?: FaceParams } | undefined)?.params ?? {};
    const origin = fp.origin ?? ZERO3;
    const xAxis = fp.xAxis ?? [1, 0, 0];
    const yAxis = fp.yAxis ?? [0, 1, 0];
    const project = (p: Vec3): Vec2 => {
      const rel = sub(p, origin);
      return [dot(rel, xAxis), dot(rel, yAxis)];
    };
    const newHoles: Vec2[][] = [];
    for (const hw of holeWires) {
      const hms = asManifoldShape(hw);
      let ring: Pts;
      if (hms) {
        ring = (hms.node as { params?: { ring?: Pts } }).params?.ring ?? [];
      } else {
        const occt = resolveOcct();
        ring = occt ? discretizeOcctWire(occt, hw) : [];
      }
      if (ring.length >= 3) newHoles.push(ring.map(project));
    }
    const holes = [...(fp.holes ?? []), ...newHoles];
    const inputs = fms ? [nodeOf(fms), ...inputNodes(holeWires)] : inputNodes(holeWires);
    return wrap(
      PLACEHOLDER,
      makeNode('profileFace', { outline: fp.outline ?? [], holes, origin, xAxis, yAxis }, inputs)
    ) as KernelShape;
  }

  function ellipsePts(
    center: Vec3,
    normal: Vec3,
    majorRadius: number,
    minorRadius: number,
    xDir?: Vec3
  ): Pts {
    const n = normalize3(normal);
    const x = xDir ? normalize3(xDir) : pickPerp(n);
    const y = normalize3(cross(n, x));
    const pts: Pts = [];
    const segs = fullCircleSegments(Math.max(majorRadius, minorRadius));
    for (let i = 0; i <= segs; i++) {
      const a = (2 * Math.PI * i) / segs;
      pts.push(
        add(
          center,
          add(scaleVec(x, majorRadius * Math.cos(a)), scaleVec(y, minorRadius * Math.sin(a)))
        )
      );
    }
    return pts;
  }

  return {
    makeVertex: (x, y, z) => edge([[x, y, z]]),
    makeLineEdge: (p1, p2) => edge([p1, p2], { k: 'line', p1, p2 }),
    makeCircleEdge: (center, normal, radius) => {
      const { x, y } = conicFrame(normal);
      return edge(sampleArc(center, normal, radius, 0, 2 * Math.PI), {
        k: 'conic',
        center,
        x,
        y,
        rx: radius,
        ry: radius,
        a0: 0,
        a1: 2 * Math.PI,
      });
    },
    makeCircleArc: (center, normal, radius, startAngle, endAngle) => {
      const { x, y } = conicFrame(normal);
      return edge(sampleArc(center, normal, radius, startAngle, endAngle), {
        k: 'conic',
        center,
        x,
        y,
        rx: radius,
        ry: radius,
        a0: startAngle,
        a1: endAngle,
      });
    },
    makeArcEdge: (p1, p2, p3) => edge(circleFrom3(p1, p2, p3), conicDescFrom3(p1, p2, p3)),
    makeEllipseEdge: (center, normal, majorRadius, minorRadius, xDir) => {
      const { x, y } = conicFrame(normal, xDir);
      return edge(ellipsePts(center, normal, majorRadius, minorRadius, xDir), {
        k: 'conic',
        center,
        x,
        y,
        rx: majorRadius,
        ry: minorRadius,
        a0: 0,
        a1: 2 * Math.PI,
      });
    },
    makeBezierEdge: (points) =>
      edge(sampleBezier(points), { k: 'bezier', points: points.map((p) => [...p]) }),
    // Tangent arcs are rare in gridfinity profiles; approximate as a chord for
    // now (TODO: sample the true tangent-constrained arc when a profile needs it).
    makeTangentArc: (startPoint, _startTangent, endPoint) =>
      edge([startPoint, endPoint], { k: 'line', p1: startPoint, p2: endPoint }),
    makeHelixWire: (
      pitch,
      height,
      radius,
      center = [0, 0, 0],
      direction = [0, 0, 1],
      leftHanded = false
    ) => {
      const axis = normalize3(direction);
      const x = pickPerp(axis);
      const y0 = normalize3(cross(axis, x));
      const y = leftHanded ? scaleVec(y0, -1) : y0;
      const turns = pitch !== 0 ? height / pitch : 0;
      const desc: CurveDesc = { k: 'helix', center, axis, x, y, radius, pitch, turns };
      const segs = Math.max(8, Math.ceil(turns * FULL_CIRCLE_SEGMENTS));
      const pts: Pts = [];
      for (let i = 0; i <= segs; i++) {
        pts.push(descPointAt(desc, (2 * Math.PI * turns * i) / segs));
      }
      return edge(pts, desc);
    },
    makeWire: (edges) => wireFrom(edges),
    makeWireFromMixed: (items) => wireFrom(items),
    makeFace,
    addHolesInFace,
    makePolygonFace: (points) => faceFromRing(points),
  };
}
