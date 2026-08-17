/**
 * Spike B prototype — a pure-data 2D contour that round-trips to a kernel Face.
 * Test-local on purpose: evidence for the Profile IR node, not shipping code.
 *
 * Segment vocabulary mirrors the architecture doc §4 (endpoint-parametrized,
 * SVG-compatible): Line, Arc, Bezier, EllipseArc. Positions are plain numbers
 * here; the real node uses Expr, which hashes the same way (see hashContour).
 */

import { DisposalScope } from '@/index.js';
import {
  makeLine,
  makeThreePointArc,
  makeBezierCurve,
  makeEllipseArc,
  assembleWire,
} from '@/topology/curveBuilders.js';
import { face as makeFace } from '@/topology/primitiveFns.js';
import {
  closedWire,
  isPlanarWire,
  type ClosedWire,
  type PlanarWire,
} from '@/core/validityTypes.js';
import type { OrientedFace, PlanarFace, Edge, Wire } from '@/core/shapeTypes.js';
import { ok, err, type Result } from '@/core/result.js';
import { validationError } from '@/core/errors.js';
import type { Vec3 } from '@/core/types.js';
import { fnvInit, fnvMixString, fnvMixNumber, fnvMixBool, fnvMixInt32 } from '@/csg/hash.js';

export type Vec2 = readonly [number, number];

export type Segment2D =
  | { readonly kind: 'Line'; readonly to: Vec2 }
  | {
      readonly kind: 'Arc';
      readonly to: Vec2;
      readonly radius: number;
      readonly largeArc: boolean;
      readonly clockwise: boolean;
    }
  | { readonly kind: 'Bezier'; readonly controls: readonly Vec2[]; readonly to: Vec2 }
  | {
      readonly kind: 'EllipseArc';
      readonly to: Vec2;
      readonly radii: Vec2;
      /** Radians. Math convention: counter-clockwise positive, y-up. */
      readonly rotation: number;
      readonly largeArc: boolean;
      readonly clockwise: boolean;
    };

export interface Contour {
  readonly start: Vec2;
  readonly segments: readonly Segment2D[];
}

// ---------------------------------------------------------------------------
// Hashing — same FNV machinery as the IR builders
// ---------------------------------------------------------------------------

export function hashContour(c: Contour): bigint {
  let h = fnvMixString(fnvInit(), 'Contour');
  h = fnvMixNumber(fnvMixNumber(h, c.start[0]), c.start[1]);
  h = fnvMixInt32(h, c.segments.length);
  for (const s of c.segments) {
    h = fnvMixString(h, s.kind);
    h = fnvMixNumber(fnvMixNumber(h, s.to[0]), s.to[1]);
    if (s.kind === 'Arc') {
      h = fnvMixNumber(h, s.radius);
      h = fnvMixBool(fnvMixBool(h, s.largeArc), s.clockwise);
    } else if (s.kind === 'Bezier') {
      h = fnvMixInt32(h, s.controls.length);
      for (const p of s.controls) h = fnvMixNumber(fnvMixNumber(h, p[0]), p[1]);
    } else if (s.kind === 'EllipseArc') {
      h = fnvMixNumber(fnvMixNumber(h, s.radii[0]), s.radii[1]);
      h = fnvMixNumber(h, s.rotation);
      h = fnvMixBool(fnvMixBool(h, s.largeArc), s.clockwise);
    }
  }
  return h;
}

// ---------------------------------------------------------------------------
// Contour -> kernel geometry
// ---------------------------------------------------------------------------

const EPS = 1e-9;

function v3(p: Vec2): Vec3 {
  return [p[0], p[1], 0];
}

function fail(msg: string): Result<never> {
  return err(validationError('SPIKE_CONTOUR', `contourToFace: ${msg}`));
}

/** SVG-style endpoint arc -> three points (start, on-arc midpoint, end). */
function circularArcMidpoint(from: Vec2, seg: Extract<Segment2D, { kind: 'Arc' }>): Result<Vec2> {
  const [x1, y1] = from;
  const [x2, y2] = seg.to;
  const r = seg.radius;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  if (d < EPS) return fail('Arc: coincident endpoints');
  if (d > 2 * r + 1e-6) return fail(`Arc: radius ${r} too small for chord ${d}`);
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
  const ux = dx / d;
  const uy = dy / d;
  // Left normal of the directed chord. A ccw small arc has its center on the
  // left; the sign flips with each of the two flags.
  const sign = seg.clockwise === seg.largeArc ? 1 : -1;
  const cx = (x1 + x2) / 2 + sign * h * -uy;
  const cy = (y1 + y2) / 2 + sign * h * ux;
  const a0 = Math.atan2(y1 - cy, x1 - cx);
  let a1 = Math.atan2(y2 - cy, x2 - cx);
  if (seg.clockwise) {
    while (a1 >= a0 - EPS) a1 -= 2 * Math.PI;
  } else {
    while (a1 <= a0 + EPS) a1 += 2 * Math.PI;
  }
  const amid = (a0 + a1) / 2;
  return ok([cx + r * Math.cos(amid), cy + r * Math.sin(amid)]);
}

/** SVG F.6.5 endpoint-to-center conversion for elliptical arcs (math y-up;
 *  sweep := !clockwise). Returns center, angles relative to the rotated x-axis. */
function ellipseArcParams(
  from: Vec2,
  seg: Extract<Segment2D, { kind: 'EllipseArc' }>
): Result<{ center: Vec2; theta1: number; theta2: number; rx: number; ry: number }> {
  const [x1, y1] = from;
  const [x2, y2] = seg.to;
  const phi = seg.rotation;
  const sweep = !seg.clockwise;
  let [rx, ry] = seg.radii;
  if (rx <= 0 || ry <= 0) return fail('EllipseArc: non-positive radius');
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const hx = (x1 - x2) / 2;
  const hy = (y1 - y2) / 2;
  const x1p = cosPhi * hx + sinPhi * hy;
  const y1p = -sinPhi * hx + cosPhi * hy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  if (den < EPS) return fail('EllipseArc: coincident endpoints');
  const coef = (seg.largeArc !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;
  const angleOf = (vx: number, vy: number): number => Math.atan2(vy, vx);
  const theta1 = angleOf((x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angleOf((-x1p - cxp) / rx, (-y1p - cyp) / ry) - theta1;
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
  // The kernel draws ccw from theta1 to theta2; a clockwise arc is the same
  // point set traversed backwards, so swap.
  const t1 = dTheta >= 0 ? theta1 : theta1 + dTheta;
  const t2 = dTheta >= 0 ? theta1 + dTheta : theta1;
  return ok({ center: [cx, cy], theta1: t1, theta2: t2, rx, ry });
}

function segmentToEdge(from: Vec2, seg: Segment2D): Result<Edge> {
  switch (seg.kind) {
    case 'Line': {
      if (Math.hypot(seg.to[0] - from[0], seg.to[1] - from[1]) < EPS) {
        return fail('Line: zero length');
      }
      return ok(makeLine(v3(from), v3(seg.to)));
    }
    case 'Arc': {
      const mid = circularArcMidpoint(from, seg);
      if (!mid.ok) return mid;
      return ok(makeThreePointArc(v3(from), v3(mid.value), v3(seg.to)));
    }
    case 'Bezier': {
      return makeBezierCurve([v3(from), ...seg.controls.map(v3), v3(seg.to)]);
    }
    case 'EllipseArc': {
      const p = ellipseArcParams(from, seg);
      if (!p.ok) return p;
      const { center, theta1, theta2, rx, ry } = p.value;
      const xDir: Vec3 = [Math.cos(seg.rotation), Math.sin(seg.rotation), 0];
      if (rx >= ry) {
        return makeEllipseArc(rx, ry, theta1, theta2, v3(center), [0, 0, 1], xDir);
      }
      // Kernel wants major >= minor: swap axes (major along the rotated y-axis)
      // and shift angles by -90 deg relative to the new major axis.
      const yDir: Vec3 = [-Math.sin(seg.rotation), Math.cos(seg.rotation), 0];
      return makeEllipseArc(
        ry,
        rx,
        theta1 - Math.PI / 2,
        theta2 - Math.PI / 2,
        v3(center),
        [0, 0, 1],
        yDir
      );
    }
  }
}

export function contourToWire(c: Contour, scope: DisposalScope): Result<Wire> {
  if (c.segments.length === 0) return fail('empty contour');
  const edges: Edge[] = [];
  let cur = c.start;
  for (const seg of c.segments) {
    const e = segmentToEdge(cur, seg);
    if (!e.ok) return e;
    scope.register(e.value);
    edges.push(e.value);
    cur = seg.to;
  }
  const w = assembleWire(edges);
  if (!w.ok) return w;
  scope.register(w.value);
  return w;
}

function proveClosedPlanar(w: Wire): Result<ClosedWire & PlanarWire> {
  const cw = closedWire(w);
  if (!cw.ok) return fail(cw.error);
  if (!isPlanarWire(cw.value)) return fail('wire is not planar');
  return ok(cw.value);
}

export function contourToFace(
  outline: Contour,
  holes: readonly Contour[] = []
): Result<OrientedFace & PlanarFace> {
  using scope = new DisposalScope();
  const ow = contourToWire(outline, scope);
  if (!ow.ok) return ow;
  const proven = proveClosedPlanar(ow.value);
  if (!proven.ok) return proven;
  const holeWires: Array<ClosedWire & PlanarWire> = [];
  for (const h of holes) {
    const hw = contourToWire(h, scope);
    if (!hw.ok) return hw;
    const hp = proveClosedPlanar(hw.value);
    if (!hp.ok) return hp;
    holeWires.push(hp.value);
  }
  return makeFace(proven.value, holeWires.length > 0 ? holeWires : undefined);
}

// ---------------------------------------------------------------------------
// Blueprint -> Contour (the bridge probe): walk Curve2D objects directly,
// orientation-agnostic (a curve may be stored reversed relative to path order).
// LINE and CIRCLE cover the canned-blueprint probe; bsplines would first go
// through approximateAsSvgCompatibleCurve, ellipse/bezier through the same
// kernel data readers svgPath.ts already uses.
// ---------------------------------------------------------------------------

function near(a: Vec2, b: Vec2): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
}

/** Recover endpoint-arc data (radius + flags) from three on-arc points. */
function threePointsToArc(from: Vec2, mid: Vec2, to: Vec2): Result<Segment2D> {
  const [ax, ay] = from;
  const [bx, by] = mid;
  const [cx, cy] = to;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < EPS) return fail('arc probe: collinear points');
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const radius = Math.hypot(ax - ux, ay - uy);
  const cross = (v: Vec2, w: Vec2): number => v[0] * w[1] - v[1] * w[0];
  const clockwise = cross([bx - ax, by - ay], [cx - bx, cy - by]) < 0;
  const chord: Vec2 = [cx - ax, cy - ay];
  const sideMid = cross(chord, [bx - ax, by - ay]);
  const sideCenter = cross(chord, [ux - ax, uy - ay]);
  const largeArc = sideMid * sideCenter > 0;
  return ok({ kind: 'Arc', to, radius, largeArc, clockwise });
}

export interface CurveLike {
  readonly geomType: string;
  readonly firstPoint: readonly number[];
  readonly lastPoint: readonly number[];
  readonly firstParameter: number;
  readonly lastParameter: number;
  value(parameter: number): readonly number[];
}

export function blueprintToContour(curves: readonly CurveLike[]): Result<Contour> {
  const first = curves[0];
  if (!first) return fail('bridge: blueprint has no curves');
  const p2 = (p: readonly number[]): Vec2 => [p[0] ?? 0, p[1] ?? 0];
  const start = p2(first.firstPoint);
  let cur = start;
  const segments: Segment2D[] = [];
  for (const c of curves) {
    const f = p2(c.firstPoint);
    const l = p2(c.lastPoint);
    let to: Vec2;
    if (near(f, cur)) {
      to = l;
    } else if (near(l, cur)) {
      to = f;
    } else {
      return fail(`bridge: curve is not chained to the current point (${c.geomType})`);
    }
    if (c.geomType === 'LINE') {
      segments.push({ kind: 'Line', to });
    } else if (c.geomType === 'CIRCLE') {
      const mid = p2(c.value((c.firstParameter + c.lastParameter) / 2));
      const arc = threePointsToArc(cur, mid, to);
      if (!arc.ok) return arc;
      segments.push(arc.value);
    } else {
      return fail(`bridge probe: unsupported curve type ${c.geomType}`);
    }
    cur = to;
  }
  return ok({ start, segments });
}

// ---------------------------------------------------------------------------
// SVG path -> Contour (kept as documentation of the SVG mapping; the live
// probe walks Curve2D directly because toSVGPathD emits reflected arc
// endpoints for reversed arcs — see vault note)
// ---------------------------------------------------------------------------

export function parseSvgPathToContour(d: string): Contour {
  const tokens = d
    .replace(/,/g, ' ')
    .replace(/([MLACQZmlacqz])/g, ' $1 ')
    .trim()
    .split(/\s+/);
  let i = 0;
  const next = (): number => {
    const t = tokens[i++];
    const n = Number(t);
    if (!Number.isFinite(n)) throw new Error(`parseSvgPathToContour: expected number, got '${t}'`);
    return n;
  };
  let start: Vec2 | null = null;
  let cur: Vec2 = [0, 0];
  const segments: Segment2D[] = [];
  while (i < tokens.length) {
    const cmd = tokens[i++];
    switch (cmd) {
      case 'M':
        cur = [next(), next()];
        start ??= cur;
        break;
      case 'L':
        cur = [next(), next()];
        segments.push({ kind: 'Line', to: cur });
        break;
      case 'A': {
        const rx = next();
        const ry = next();
        const rotDeg = next();
        const largeArc = next() !== 0;
        const sweep = next() !== 0;
        cur = [next(), next()];
        if (Math.abs(rx - ry) < 1e-9) {
          segments.push({ kind: 'Arc', to: cur, radius: rx, largeArc, clockwise: !sweep });
        } else {
          segments.push({
            kind: 'EllipseArc',
            to: cur,
            radii: [rx, ry],
            rotation: (rotDeg * Math.PI) / 180,
            largeArc,
            clockwise: !sweep,
          });
        }
        break;
      }
      case 'Q': {
        const c1: Vec2 = [next(), next()];
        cur = [next(), next()];
        segments.push({ kind: 'Bezier', controls: [c1], to: cur });
        break;
      }
      case 'C': {
        const c1: Vec2 = [next(), next()];
        const c2: Vec2 = [next(), next()];
        cur = [next(), next()];
        segments.push({ kind: 'Bezier', controls: [c1, c2], to: cur });
        break;
      }
      case 'Z':
      case 'z':
        if (start && Math.hypot(cur[0] - start[0], cur[1] - start[1]) > 1e-6) {
          segments.push({ kind: 'Line', to: start });
          cur = start;
        }
        break;
      default:
        throw new Error(`parseSvgPathToContour: unsupported command '${cmd}'`);
    }
  }
  if (!start) throw new Error('parseSvgPathToContour: no M command');
  return { start, segments };
}
