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
import type { ManifoldModule } from './helpers.js';
import { makeNode, type OpNode } from './opGraph.js';
import { wrap, nodeOf, asManifoldShape } from './meshHandle.js';
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

/** Segments used to approximate a full circle; arcs scale by angle span. */
const FULL_CIRCLE_SEGMENTS = 48;
/** Bezier sampling segments per edge. */
const BEZIER_SEGMENTS = 24;

const ZERO3: Vec3 = [0, 0, 0];
const EPS_JOIN = 1e-6;

type Pts = Vec3[];

// delete() is a no-op (safe to share); isEmpty reports non-empty so isNull()
// treats the handle as a valid shape.
const PLACEHOLDER: unknown = { delete: () => {}, isEmpty: () => false };

function at3(pts: Pts, i: number): Vec3 {
  return pts[i] ?? ZERO3;
}

function arcSegments(angleSpan: number): number {
  return Math.max(2, Math.ceil((Math.abs(angleSpan) / (2 * Math.PI)) * FULL_CIRCLE_SEGMENTS));
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
  const segs = arcSegments(span);
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
  makeWire(edges: KernelShape[]): KernelShape;
  makeWireFromMixed(items: KernelShape[]): KernelShape;
  makeFace(wire: KernelShape, planar?: boolean): KernelShape;
  makePolygonFace(points: Vec3[]): KernelShape;
}

export function makeProfileBuilders(_module: ManifoldModule): ProfileBuilders {
  function edge(pts: Pts): KernelShape {
    return wrap(PLACEHOLDER, makeNode('profileEdge', { pts }, [])) as KernelShape;
  }

  // Edge handles carry `pts`; wire handles carry `ring` (already chained).
  function ringOrPts(shape: KernelShape): Pts {
    const ms = asManifoldShape(shape);
    const params = (ms?.node as { params?: { ring?: Pts; pts?: Pts } } | undefined)?.params;
    return params?.ring ?? params?.pts ?? [];
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
    return wrap(PLACEHOLDER, makeNode('profileWire', { ring }, inputNodes(items))) as KernelShape;
  }

  function faceFromRing(ring: Pts, input?: OpNode): KernelShape {
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
    return wrap(
      PLACEHOLDER,
      makeNode('profileFace', { outline, origin, xAxis, yAxis }, input ? [input] : [])
    ) as KernelShape;
  }

  function makeFace(wire: KernelShape): KernelShape {
    const ms = asManifoldShape(wire);
    const ring = (ms?.node as { params?: { ring?: Pts } } | undefined)?.params?.ring ?? [];
    return faceFromRing(ring, ms ? nodeOf(ms) : undefined);
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
    for (let i = 0; i <= FULL_CIRCLE_SEGMENTS; i++) {
      const a = (2 * Math.PI * i) / FULL_CIRCLE_SEGMENTS;
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
    makeLineEdge: (p1, p2) => edge([p1, p2]),
    makeCircleEdge: (center, normal, radius) =>
      edge(sampleArc(center, normal, radius, 0, 2 * Math.PI)),
    makeCircleArc: (center, normal, radius, startAngle, endAngle) =>
      edge(sampleArc(center, normal, radius, startAngle, endAngle)),
    makeArcEdge: (p1, p2, p3) => edge(circleFrom3(p1, p2, p3)),
    makeEllipseEdge: (center, normal, majorRadius, minorRadius, xDir) =>
      edge(ellipsePts(center, normal, majorRadius, minorRadius, xDir)),
    makeBezierEdge: (points) => edge(sampleBezier(points)),
    // Tangent arcs are rare in gridfinity profiles; approximate as a chord for
    // now (TODO: sample the true tangent-constrained arc when a profile needs it).
    makeTangentArc: (startPoint, _startTangent, endPoint) => edge([startPoint, endPoint]),
    makeWire: (edges) => wireFrom(edges),
    makeWireFromMixed: (items) => wireFrom(items),
    makeFace,
    makePolygonFace: (points) => faceFromRing(points),
  };
}
