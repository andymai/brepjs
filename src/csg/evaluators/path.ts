import {
  makeLine,
  makeThreePointArc,
  makeBezierCurve,
  makeEllipseArc,
  assembleWire,
} from '@/topology/curveBuilders.js';
import { DisposalScope } from '@/core/disposal.js';
import { ok, err, type Result } from '@/core/result.js';
import { validationError } from '@/core/errors.js';
import type { AnyShape, Dimension, Edge } from '@/core/shapeTypes.js';
import type { Vec2, Vec3 } from '@/core/types.js';
import { evalScalar, evalVec2 } from '../expressions.js';
import type { Segment2D } from '../segments.js';
import type { PathNode } from '../types.js';
import type { EvalContext } from './context.js';

const EPS = 1e-9;

function v3(p: Vec2): Vec3 {
  return [p[0], p[1], 0];
}

function fail(msg: string): Result<never> {
  return err(validationError('CSG_PATH_SEGMENT', `Path: ${msg}`));
}

/** SVG-style endpoint circular arc: recover the on-arc midpoint so the edge
 *  can be built as a three-point arc. */
function circularArcMidpoint(
  from: Vec2,
  to: Vec2,
  r: number,
  largeArc: boolean,
  clockwise: boolean
): Result<Vec2> {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  if (d < EPS) return fail('Arc: coincident endpoints');
  if (d > 2 * r + 1e-6) return fail(`Arc: radius ${r} too small for chord ${d}`);
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
  const ux = dx / d;
  const uy = dy / d;
  // A ccw small arc has its center on the left of the directed chord; the
  // side flips with each of the two flags.
  const sign = clockwise === largeArc ? 1 : -1;
  const cx = (x1 + x2) / 2 + sign * h * -uy;
  const cy = (y1 + y2) / 2 + sign * h * ux;
  const a0 = Math.atan2(y1 - cy, x1 - cx);
  let a1 = Math.atan2(y2 - cy, x2 - cx);
  if (clockwise) {
    while (a1 >= a0 - EPS) a1 -= 2 * Math.PI;
  } else {
    while (a1 <= a0 + EPS) a1 += 2 * Math.PI;
  }
  const amid = (a0 + a1) / 2;
  return ok([cx + r * Math.cos(amid), cy + r * Math.sin(amid)]);
}

interface EllipseParams {
  readonly center: Vec2;
  readonly theta1: number;
  readonly theta2: number;
  readonly rx: number;
  readonly ry: number;
}

/** SVG F.6.5 endpoint-to-center conversion (math y-up; sweep = !clockwise).
 *  Angles are relative to the rotated x-axis. */
function ellipseArcParams(
  from: Vec2,
  to: Vec2,
  radii: Vec2,
  phi: number,
  largeArc: boolean,
  clockwise: boolean
): Result<EllipseParams> {
  const sweep = !clockwise;
  let [rx, ry] = radii;
  if (rx <= 0 || ry <= 0) return fail('EllipseArc: non-positive radius');
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const hx = (from[0] - to[0]) / 2;
  const hy = (from[1] - to[1]) / 2;
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
  const coef = (largeArc !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);
  const cx = cosPhi * cxp - sinPhi * cyp + (from[0] + to[0]) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (from[1] + to[1]) / 2;
  const theta1 = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
  let dTheta = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx) - theta1;
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
  // The kernel draws ccw from theta1 to theta2; a clockwise arc is the same
  // point set traversed backwards, so swap.
  const t1 = dTheta >= 0 ? theta1 : theta1 + dTheta;
  const t2 = dTheta >= 0 ? theta1 + dTheta : theta1;
  return ok({ center: [cx, cy], theta1: t1, theta2: t2, rx, ry });
}

function ellipseEdge(from: Vec2, seg: Segment2D, ctx: EvalContext): Result<Edge> {
  if (seg.kind !== 'EllipseArc') return fail('internal: not an ellipse segment');
  const to = evalVec2(seg.to, ctx.env, 'Path.EllipseArc.to');
  if (!to.ok) return to;
  const radii = evalVec2(seg.radii, ctx.env, 'Path.EllipseArc.radii');
  if (!radii.ok) return radii;
  const rotDeg = evalScalar(seg.rotation, ctx.env, 'Path.EllipseArc.rotation');
  if (!rotDeg.ok) return rotDeg;
  const phi = (rotDeg.value * Math.PI) / 180;
  const p = ellipseArcParams(from, to.value, radii.value, phi, seg.largeArc, seg.clockwise);
  if (!p.ok) return p;
  const { center, theta1, theta2, rx, ry } = p.value;
  if (rx >= ry) {
    const xDir: Vec3 = [Math.cos(phi), Math.sin(phi), 0];
    return makeEllipseArc(rx, ry, theta1, theta2, v3(center), [0, 0, 1], xDir);
  }
  // Kernel wants major >= minor: swap axes (major along the rotated y-axis)
  // and shift angles by -90 deg relative to the new major axis.
  const yDir: Vec3 = [-Math.sin(phi), Math.cos(phi), 0];
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

function segmentEnd(seg: Segment2D, ctx: EvalContext): Result<Vec2> {
  return evalVec2(seg.to, ctx.env, `Path.${seg.kind}.to`);
}

function segmentToEdge(from: Vec2, seg: Segment2D, ctx: EvalContext): Result<Edge> {
  switch (seg.kind) {
    case 'Line': {
      const to = segmentEnd(seg, ctx);
      if (!to.ok) return to;
      if (Math.hypot(to.value[0] - from[0], to.value[1] - from[1]) < EPS) {
        return fail('Line: zero length');
      }
      return ok(makeLine(v3(from), v3(to.value)));
    }
    case 'Arc': {
      const to = segmentEnd(seg, ctx);
      if (!to.ok) return to;
      const r = evalScalar(seg.radius, ctx.env, 'Path.Arc.radius');
      if (!r.ok) return r;
      const mid = circularArcMidpoint(from, to.value, r.value, seg.largeArc, seg.clockwise);
      if (!mid.ok) return mid;
      return ok(makeThreePointArc(v3(from), v3(mid.value), v3(to.value)));
    }
    case 'Bezier': {
      const to = segmentEnd(seg, ctx);
      if (!to.ok) return to;
      const controls: Vec3[] = [];
      for (const c of seg.controls) {
        const cv = evalVec2(c, ctx.env, 'Path.Bezier.control');
        if (!cv.ok) return cv;
        controls.push(v3(cv.value));
      }
      return makeBezierCurve([v3(from), ...controls, v3(to.value)]);
    }
    case 'EllipseArc':
      return ellipseEdge(from, seg, ctx);
  }
}

export function evalPath(node: PathNode, ctx: EvalContext): Result<AnyShape<Dimension>> {
  if (node.segments.length === 0) return fail('at least one segment required');
  const start = evalVec2(node.start, ctx.env, 'Path.start');
  if (!start.ok) return start;
  // Edges are intermediates consumed by wire assembly; the wire is the fresh
  // handle handed to the evaluator cache.
  using scope = new DisposalScope();
  const edges: Edge[] = [];
  let cur = start.value;
  for (const seg of node.segments) {
    const e = segmentToEdge(cur, seg, ctx);
    if (!e.ok) return e;
    scope.register(e.value);
    edges.push(e.value);
    const end = segmentEnd(seg, ctx);
    if (!end.ok) return end;
    cur = end.value;
  }
  return assembleWire(edges);
}
