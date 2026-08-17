import {
  makeLine,
  makeThreePointArc,
  makeBezierCurve,
  makeEllipseArc,
  assembleWire,
} from '@/topology/curveBuilders.js';
import { flipOrientation } from '@/topology/curveFns.js';
import { getKernel } from '@/kernel/index.js';
import { DisposalScope } from '@/core/disposal.js';
import { ok, err, type Result } from '@/core/result.js';
import { validationError, kernelError } from '@/core/errors.js';
import {
  castShape,
  type AnyShape,
  type Dimension,
  type Edge,
  type Wire,
} from '@/core/shapeTypes.js';
import type { Vec2, Vec3 } from '@/core/types.js';
import { evalScalar, evalVec2, type Expr } from '../expressions.js';
import type { Segment2D } from '../segments.js';
import type { PathNode } from '../types.js';
import type { EvalContext } from './context.js';

const EPS = 1e-9;

function v3(p: Vec2): Vec3 {
  return [p[0], p[1], 0];
}

function fail(msg: string): Result<never> {
  return err(validationError('CSG_PATH_SEGMENT', `contour segment: ${msg}`));
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
  // Build AXIS-ALIGNED (no xDir: the kernel's makeEllipseArc silently ignores
  // it on occt-wasm) and rotate the edge into the true frame afterwards. The
  // major axis must come first, so a tall ellipse builds major-along-X with
  // angles shifted by -90 deg and picks up the extra quarter turn here.
  let arc: Result<Edge>;
  let psi: number;
  if (rx >= ry) {
    arc = makeEllipseArc(rx, ry, theta1, theta2, v3(center), [0, 0, 1]);
    psi = phi;
  } else {
    arc = makeEllipseArc(ry, rx, theta1 - Math.PI / 2, theta2 - Math.PI / 2, v3(center), [0, 0, 1]);
    psi = phi + Math.PI / 2;
  }
  if (!arc.ok) return arc;
  let edge = arc.value;
  if (Math.abs(psi) > EPS) {
    using tmp = edge;
    const rotated = rotateEdgeAbout(tmp, (psi * 180) / Math.PI, center);
    if (!rotated.ok) return rotated;
    edge = rotated.value;
  }
  if (seg.clockwise) {
    // The kernel draws ccw, so a clockwise segment was built with swapped
    // angles: right point set, reversed parametric direction. Flip so the
    // edge runs from -> to in path order (spine direction depends on it).
    using tmp = edge;
    edge = flipOrientation(tmp) as Edge;
  }
  return ok(edge);
}

/** Rotate an edge about the Z axis at `center` (degrees) via a cheap location
 *  re-tag; returns a fresh, independently-disposable handle. Kernels without
 *  an edge-relocation path (brepkit) surface as a Result error, not a throw. */
function rotateEdgeAbout(edge: Edge, angleDeg: number, center: Vec2): Result<Edge> {
  const kernel = getKernel();
  const { handle, dispose } = kernel.composeTransform([
    { type: 'rotate', angle: angleDeg, axis: [0, 0, 1], center: [center[0], center[1], 0] },
  ]);
  try {
    return ok(castShape(kernel.locate(edge.wrapped, handle)) as Edge);
  } catch (e) {
    return err(
      kernelError('CSG_PATH_ELLIPSE_ROTATE', 'Path: kernel cannot relocate ellipse-arc edges', e, {
        operation: 'evalPath',
      })
    );
  } finally {
    dispose();
  }
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

/** Build a wire from a segment list. Edges register into `scope`; the wire is
 *  returned unregistered (the caller decides its ownership). With `autoClose`,
 *  an endpoint away from start gains a closing line segment (SVG Z). */
export function buildSegmentWire(
  start: Expr,
  segments: readonly Segment2D[],
  ctx: EvalContext,
  scope: DisposalScope,
  autoClose: boolean,
  where: string
): Result<Wire> {
  if (segments.length === 0) {
    return err(validationError('CSG_PATH_SEGMENT', `${where}: at least one segment required`));
  }
  const start0 = evalVec2(start, ctx.env, `${where}.start`);
  if (!start0.ok) return start0;
  const edges: Edge[] = [];
  let cur = start0.value;
  for (const seg of segments) {
    const e = segmentToEdge(cur, seg, ctx);
    if (!e.ok) return e;
    scope.register(e.value);
    edges.push(e.value);
    const end = segmentEnd(seg, ctx);
    if (!end.ok) return end;
    cur = end.value;
  }
  if (autoClose && Math.hypot(cur[0] - start0.value[0], cur[1] - start0.value[1]) > 1e-6) {
    const closing = makeLine(v3(cur), v3(start0.value));
    scope.register(closing);
    edges.push(closing);
  }
  return assembleWire(edges);
}

export function evalPath(node: PathNode, ctx: EvalContext): Result<AnyShape<Dimension>> {
  // Edges are intermediates consumed by wire assembly; the wire is the fresh
  // handle handed to the evaluator cache.
  using scope = new DisposalScope();
  return buildSegmentWire(node.start, node.segments, ctx, scope, false, 'Path');
}
