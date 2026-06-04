/**
 * Native 2D curve algebra for the manifold kernel (no OCCT).
 *
 * brepjs's 2D model is parametric curves; Manifold is a mesh/region kernel with
 * no parametric curves. So the *construction* path (draw → sketch → extrude) is
 * served here with a tiny JS curve algebra: lines, conics (circle/arc/ellipse as
 * center + two conjugate axes U,V so any affine maps them uniformly), and
 * beziers. Curves sample to polylines; `liftCurve2dToPlane` maps the polyline
 * onto the 3D plane and emits a native manifold edge (a `profileEdge` op-node,
 * consumed by makeWire/makeFace). Exact/NURBS/introspection ops that have no
 * native form fall back to OCCT (see kernel2dOps).
 * @module
 */

import type { Curve2dHandle, BBox2dHandle, Kernel2DCapability } from '@/kernel/kernel2dTypes.js';
import type { KernelShape, KernelType } from '@/kernel/types.js';
import type { ManifoldModule } from './helpers.js';
import { makeNode } from './opGraph.js';
import { wrap } from './meshHandle.js';

type Vec2 = [number, number];

interface LineC {
  k: 'line';
  p1: Vec2;
  p2: Vec2;
}
interface ConicC {
  // point(t) = C + U cos t + V sin t, t in [a0,a1]. circle/arc/ellipse uniformly.
  k: 'conic';
  c: Vec2;
  u: Vec2;
  v: Vec2;
  a0: number;
  a1: number;
}
interface BezierC {
  k: 'bezier';
  pts: Vec2[];
}
type NativeCurve = (LineC | ConicC | BezierC) & { __nativeC2d: true };

/** 2×3 affine: [[a,b,tx],[c,d,ty]]. */
interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

const CIRCLE_SEGMENTS = 64; // full-circle sampling (arcs scale by angle span)

function isNative(x: unknown): x is NativeCurve {
  return !!x && typeof x === 'object' && (x as { __nativeC2d?: boolean }).__nativeC2d === true;
}
function line(p1: Vec2, p2: Vec2): NativeCurve {
  return { __nativeC2d: true, k: 'line', p1, p2 };
}
function conic(c: Vec2, u: Vec2, v: Vec2, a0: number, a1: number): NativeCurve {
  return { __nativeC2d: true, k: 'conic', c, u, v, a0, a1 };
}

function applyPt(m: Affine, [x, y]: Vec2): Vec2 {
  return [m.a * x + m.b * y + m.tx, m.c * x + m.d * y + m.ty];
}
function applyVec(m: Affine, [x, y]: Vec2): Vec2 {
  return [m.a * x + m.b * y, m.c * x + m.d * y];
}
function compose(p: Affine, q: Affine): Affine {
  // p∘q
  return {
    a: p.a * q.a + p.b * q.c,
    b: p.a * q.b + p.b * q.d,
    c: p.c * q.a + p.d * q.c,
    d: p.c * q.b + p.d * q.d,
    tx: p.a * q.tx + p.b * q.ty + p.tx,
    ty: p.c * q.tx + p.d * q.ty + p.ty,
  };
}

function transform(curve: NativeCurve, m: Affine): NativeCurve {
  if (curve.k === 'line') return line(applyPt(m, curve.p1), applyPt(m, curve.p2));
  if (curve.k === 'bezier')
    return { __nativeC2d: true, k: 'bezier', pts: curve.pts.map((p) => applyPt(m, p)) };
  return conic(applyPt(m, curve.c), applyVec(m, curve.u), applyVec(m, curve.v), curve.a0, curve.a1);
}

function bezierAt(pts: Vec2[], t: number): Vec2 {
  const tmp = pts.map((p) => [p[0], p[1]] as Vec2);
  for (let k = 1; k < tmp.length; k++)
    for (let i = 0; i < tmp.length - k; i++) {
      const a = tmp[i] ?? [0, 0];
      const b = tmp[i + 1] ?? [0, 0];
      tmp[i] = [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t];
    }
  return tmp[0] ?? [0, 0];
}

function sample(curve: NativeCurve): Vec2[] {
  if (curve.k === 'line') return [curve.p1, curve.p2];
  if (curve.k === 'bezier') {
    const out: Vec2[] = [];
    for (let i = 0; i <= 24; i++) out.push(bezierAt(curve.pts, i / 24));
    return out;
  }
  const span = curve.a1 - curve.a0;
  const n = Math.max(2, Math.ceil((Math.abs(span) / (2 * Math.PI)) * CIRCLE_SEGMENTS));
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = curve.a0 + (span * i) / n;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    pts.push([
      curve.c[0] + curve.u[0] * ct + curve.v[0] * st,
      curve.c[1] + curve.u[1] * ct + curve.v[1] * st,
    ]);
  }
  return pts;
}

/** Circle/arc through param helpers. */
function circleThrough3(p1: Vec2, pm: Vec2, p2: Vec2): NativeCurve {
  const ax = p1[0];
  const ay = p1[1];
  const bx = pm[0];
  const by = pm[1];
  const cx2 = p2[0];
  const cy2 = p2[1];
  const d = 2 * (ax * (by - cy2) + bx * (cy2 - ay) + cx2 * (ay - by));
  if (Math.abs(d) < 1e-12) return line(p1, p2);
  const ux =
    ((ax * ax + ay * ay) * (by - cy2) +
      (bx * bx + by * by) * (cy2 - ay) +
      (cx2 * cx2 + cy2 * cy2) * (ay - by)) /
    d;
  const uy =
    ((ax * ax + ay * ay) * (cx2 - bx) +
      (bx * bx + by * by) * (ax - cx2) +
      (cx2 * cx2 + cy2 * cy2) * (bx - ax)) /
    d;
  const center: Vec2 = [ux, uy];
  const r = Math.hypot(ax - ux, ay - uy);
  const ang = (p: Vec2): number => Math.atan2(p[1] - uy, p[0] - ux);
  let a0 = ang(p1);
  let am = ang(pm);
  let a1 = ang(p2);
  // Choose sweep direction so the arc passes through pm.
  const norm = (x: number): number => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const dm = norm(am - a0);
  const d1 = norm(a1 - a0);
  if (dm <= d1) {
    a1 = a0 + d1; // CCW
  } else {
    a1 = a0 - norm(a0 - a1); // CW
  }
  void am;
  return conic(center, [r, 0], [0, r], a0, a1);
}

function makeNativeKernel2DOps(
  module: ManifoldModule,
  occt: () => Partial<Kernel2DCapability> | undefined
): Partial<Kernel2DCapability> {
  // Inert placeholder for the lifted edge handle (consumed via op-node params).
  const PLACEHOLDER: unknown = { delete: () => {}, isEmpty: () => false };
  void module;

  function delegate<T>(method: keyof Kernel2DCapability, ...args: unknown[]): T {
    const o = occt();
    const fn = o?.[method] as ((...a: unknown[]) => T) | undefined;
    if (!fn)
      throw new Error(`manifold 2D: ${String(method)} needs an OCCT kernel (none registered)`);
    return fn(...args);
  }

  const asC = (h: Curve2dHandle): NativeCurve => h as unknown as NativeCurve;

  return {
    createPoint2d: (x, y) => ({ x, y }) as KernelType,
    createDirection2d: (x, y) => ({ x, y }) as KernelType,
    createVector2d: (x, y) => ({ x, y }) as KernelType,
    createAxis2d: (px, py, dx, dy) => ({ px, py, dx, dy }) as KernelType,
    wrapCurve2dHandle: (h) => h,
    createCurve2dAdaptor: (h) => h as unknown as KernelType,

    makeLine2d: (x1, y1, x2, y2) => line([x1, y1], [x2, y2]) as unknown as Curve2dHandle,
    makeCircle2d: (cx, cy, r, sense = true) =>
      conic([cx, cy], [r, 0], sense ? [0, r] : [0, -r], 0, 2 * Math.PI) as unknown as Curve2dHandle,
    makeArc2dThreePoints: (x1, y1, xm, ym, x2, y2) =>
      circleThrough3([x1, y1], [xm, ym], [x2, y2]) as unknown as Curve2dHandle,
    makeArc2dTangent: (sx, sy, tx, ty, ex, ey) => {
      // Arc from start tangent to (tx,ty), ending at end. Center is on the
      // perpendicular to the tangent at start, equidistant from start & end.
      const tlen = Math.hypot(tx, ty) || 1;
      const nx = -ty / tlen;
      const ny = tx / tlen; // normal at start
      const mx = (sx + ex) / 2;
      const my = (sy + ey) / 2;
      const chord: Vec2 = [ex - sx, ey - sy];
      const denom = 2 * (nx * chord[0] + ny * chord[1]);
      if (Math.abs(denom) < 1e-12) return line([sx, sy], [ex, ey]) as unknown as Curve2dHandle;
      const t = ((mx - sx) * chord[0] + (my - sy) * chord[1]) / denom;
      const cx = sx + nx * t;
      const cy = sy + ny * t;
      const r = Math.hypot(sx - cx, sy - cy);
      const a0 = Math.atan2(sy - cy, sx - cx);
      let a1 = Math.atan2(ey - cy, ex - cx);
      // pick the sweep matching the tangent direction
      const ccw = nx * tx + ny * ty < 0 ? false : true;
      void ccw;
      const norm = (x: number): number => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      // tangent at start for CCW is perpendicular (+90°); choose direction by dot
      const tangCCW: Vec2 = [-(sy - cy), sx - cx];
      if (tangCCW[0] * tx + tangCCW[1] * ty >= 0) a1 = a0 + norm(a1 - a0);
      else a1 = a0 - norm(a0 - a1);
      return conic([cx, cy], [r, 0], [0, r], a0, a1) as unknown as Curve2dHandle;
    },
    makeEllipse2d: (cx, cy, maj, min, xdx = 1, xdy = 0, sense = true) => {
      const xl = Math.hypot(xdx, xdy) || 1;
      const ux = (xdx / xl) * maj;
      const uy = (xdy / xl) * maj;
      const vx = (-xdy / xl) * min * (sense ? 1 : -1);
      const vy = (xdx / xl) * min * (sense ? 1 : -1);
      return conic([cx, cy], [ux, uy], [vx, vy], 0, 2 * Math.PI) as unknown as Curve2dHandle;
    },
    makeEllipseArc2d: (cx, cy, maj, min, a0, a1, xdx = 1, xdy = 0, sense = true) => {
      const xl = Math.hypot(xdx, xdy) || 1;
      const ux = (xdx / xl) * maj;
      const uy = (xdy / xl) * maj;
      const vx = (-xdy / xl) * min * (sense ? 1 : -1);
      const vy = (xdx / xl) * min * (sense ? 1 : -1);
      return conic([cx, cy], [ux, uy], [vx, vy], a0, a1) as unknown as Curve2dHandle;
    },
    makeBezier2d: (points) =>
      ({
        __nativeC2d: true,
        k: 'bezier',
        pts: points.map((p) => [p[0], p[1]]),
      }) as unknown as Curve2dHandle,

    evaluateCurve2d: (h, param) => {
      const c = asC(h);
      if (c.k === 'line')
        return [c.p1[0] + (c.p2[0] - c.p1[0]) * param, c.p1[1] + (c.p2[1] - c.p1[1]) * param];
      if (c.k === 'bezier') return bezierAt(c.pts, param);
      return [
        c.c[0] + c.u[0] * Math.cos(param) + c.v[0] * Math.sin(param),
        c.c[1] + c.u[1] * Math.cos(param) + c.v[1] * Math.sin(param),
      ];
    },
    getCurve2dBounds: (h) => {
      const c = asC(h);
      if (c.k === 'conic') return { first: c.a0, last: c.a1 };
      return { first: 0, last: 1 };
    },
    getCurve2dType: (h) => {
      const c = asC(h);
      return c.k === 'line' ? 'LINE' : c.k === 'bezier' ? 'BEZIER' : 'CIRCLE';
    },
    reverseCurve2d: (h) => {
      const c = asC(h);
      if (c.k === 'line') {
        const t = c.p1;
        c.p1 = c.p2;
        c.p2 = t;
      } else if (c.k === 'bezier') {
        c.pts.reverse();
      } else {
        const t = c.a0;
        c.a0 = c.a1;
        c.a1 = t;
      }
    },
    copyCurve2d: (h) => structuredClone(asC(h)) as unknown as Curve2dHandle,
    trimCurve2d: (h, start, end) => {
      const c = asC(h);
      if (c.k === 'conic') return conic(c.c, c.u, c.v, start, end) as unknown as Curve2dHandle;
      return structuredClone(c) as unknown as Curve2dHandle;
    },

    // --- general transforms (affine on descriptors) ---
    createIdentityGTrsf2d: () => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }) as KernelType,
    createTranslationGTrsf2d: (dx, dy) =>
      ({ a: 1, b: 0, c: 0, d: 1, tx: dx, ty: dy }) as KernelType,
    createRotationGTrsf2d: (angle, cx, cy) => {
      const co = Math.cos(angle);
      const si = Math.sin(angle);
      return {
        a: co,
        b: -si,
        c: si,
        d: co,
        tx: cx - (co * cx - si * cy),
        ty: cy - (si * cx + co * cy),
      } as KernelType;
    },
    createScaleGTrsf2d: (f, cx, cy) =>
      ({ a: f, b: 0, c: 0, d: f, tx: cx - f * cx, ty: cy - f * cy }) as KernelType,
    createMirrorGTrsf2d: (cx, cy, mode, ox = 0, oy = 0, dx = 1, dy = 0) => {
      if (mode === 'point')
        return { a: -1, b: 0, c: 0, d: -1, tx: 2 * cx, ty: 2 * cy } as KernelType;
      const l = Math.hypot(dx, dy) || 1;
      const ux = dx / l;
      const uy = dy / l;
      const a = ux * ux - uy * uy;
      const b = 2 * ux * uy;
      // reflection across line through (ox,oy) dir (ux,uy)
      return {
        a,
        b,
        c: b,
        d: -a,
        tx: ox - (a * ox + b * oy),
        ty: oy - (b * ox - a * oy),
      } as KernelType;
    },
    createAffinityGTrsf2d: (ox, oy, dx, dy, ratio) => {
      const l = Math.hypot(dx, dy) || 1;
      const ux = dx / l;
      const uy = dy / l;
      // scale by `ratio` along the direction perpendicular to (ux,uy): keep axis, scale normal
      const nx = -uy;
      const ny = ux;
      // M = I along axis, ratio along normal: M = u u^T + ratio * n n^T
      const a = ux * ux + ratio * nx * nx;
      const b = ux * uy + ratio * nx * ny;
      const c = uy * ux + ratio * ny * nx;
      const d = uy * uy + ratio * ny * ny;
      return { a, b, c, d, tx: ox - (a * ox + b * oy), ty: oy - (c * ox + d * oy) } as KernelType;
    },
    setGTrsf2dTranslationPart: (g, dx, dy) => {
      const m = g as unknown as Affine;
      m.tx = dx;
      m.ty = dy;
    },
    multiplyGTrsf2d: (base, other) => {
      const r = compose(base as unknown as Affine, other as unknown as Affine);
      Object.assign(base as unknown as Affine, r);
    },
    transformCurve2dGeneral: (h, g) =>
      transform(asC(h), g as unknown as Affine) as unknown as Curve2dHandle,
    translateCurve2d: (h, dx, dy) =>
      transform(asC(h), { a: 1, b: 0, c: 0, d: 1, tx: dx, ty: dy }) as unknown as Curve2dHandle,
    rotateCurve2d: (h, angle, cx, cy) => {
      const co = Math.cos(angle);
      const si = Math.sin(angle);
      return transform(asC(h), {
        a: co,
        b: -si,
        c: si,
        d: co,
        tx: cx - (co * cx - si * cy),
        ty: cy - (si * cx + co * cy),
      }) as unknown as Curve2dHandle;
    },
    scaleCurve2d: (h, f, cx, cy) =>
      transform(asC(h), {
        a: f,
        b: 0,
        c: 0,
        d: f,
        tx: cx - f * cx,
        ty: cy - f * cy,
      }) as unknown as Curve2dHandle,
    mirrorCurve2dAtPoint: (h, cx, cy) =>
      transform(asC(h), {
        a: -1,
        b: 0,
        c: 0,
        d: -1,
        tx: 2 * cx,
        ty: 2 * cy,
      }) as unknown as Curve2dHandle,

    // --- bounding box (mutable JS box) ---
    createBoundingBox2d: () =>
      ({ min: [Infinity, Infinity], max: [-Infinity, -Infinity] }) as unknown as BBox2dHandle,
    addCurveToBBox2d: (bb, h) => {
      const box = bb as unknown as { min: Vec2; max: Vec2 };
      for (const [x, y] of sample(asC(h))) {
        if (x < box.min[0]) box.min[0] = x;
        if (y < box.min[1]) box.min[1] = y;
        if (x > box.max[0]) box.max[0] = x;
        if (y > box.max[1]) box.max[1] = y;
      }
    },
    getBBox2dBounds: (bb) => {
      const box = bb as unknown as { min: Vec2; max: Vec2 };
      return { xMin: box.min[0], yMin: box.min[1], xMax: box.max[0], yMax: box.max[1] };
    },
    mergeBBox2d: (t, o) => {
      const a = t as unknown as { min: Vec2; max: Vec2 };
      const b = o as unknown as { min: Vec2; max: Vec2 };
      a.min[0] = Math.min(a.min[0], b.min[0]);
      a.min[1] = Math.min(a.min[1], b.min[1]);
      a.max[0] = Math.max(a.max[0], b.max[0]);
      a.max[1] = Math.max(a.max[1], b.max[1]);
    },
    isBBox2dOut: (a, b) => {
      const x = a as unknown as { min: Vec2; max: Vec2 };
      const y = b as unknown as { min: Vec2; max: Vec2 };
      return (
        x.max[0] < y.min[0] || x.min[0] > y.max[0] || x.max[1] < y.min[1] || x.min[1] > y.max[1]
      );
    },
    isBBox2dOutPoint: (bb, x, y) => {
      const box = bb as unknown as { min: Vec2; max: Vec2 };
      return x < box.min[0] || x > box.max[0] || y < box.min[1] || y > box.max[1];
    },

    getCurve2dCircleData: (h) => {
      const c = asC(h);
      if (c.k !== 'conic') return null;
      const ru = Math.hypot(c.u[0], c.u[1]);
      const rv = Math.hypot(c.v[0], c.v[1]);
      if (Math.abs(ru - rv) > 1e-6) return null;
      return { cx: c.c[0], cy: c.c[1], radius: ru, isDirect: true };
    },

    // --- 2D→3D lift: sample onto the plane, emit a native manifold edge ---
    liftCurve2dToPlane: (h, origin, zDir, xDir): KernelShape => {
      const zx = zDir[0];
      const zy = zDir[1];
      const zz = zDir[2];
      const xx = xDir[0];
      const xy = xDir[1];
      const xz = xDir[2];
      const yx = zy * xz - zz * xy;
      const yy = zz * xx - zx * xz;
      const yz = zx * xy - zy * xx; // yDir = z × x
      const pts3d = sample(asC(h)).map(([u, v]) => [
        origin[0] + xx * u + yx * v,
        origin[1] + xy * u + yy * v,
        origin[2] + xz * u + yz * v,
      ]);
      return wrap(PLACEHOLDER, makeNode('profileEdge', { pts: pts3d }, [])) as KernelShape;
    },

    // --- OCCT-delegated (no native form): NURBS, exact intersection, etc. ---
    makeBSpline2d: (...a) => delegate('makeBSpline2d', ...a),
    offsetCurve2d: (...a) => delegate('offsetCurve2d', ...a),
    intersectCurves2d: (...a) => delegate('intersectCurves2d', ...a),
    projectPointOnCurve2d: (...a) => delegate('projectPointOnCurve2d', ...a),
    distanceBetweenCurves2d: (...a) => delegate('distanceBetweenCurves2d', ...a),
    approximateCurve2dAsBSpline: (...a) => delegate('approximateCurve2dAsBSpline', ...a),
    decomposeBSpline2dToBeziers: (...a) => delegate('decomposeBSpline2dToBeziers', ...a),
    serializeCurve2d: (...a) => delegate('serializeCurve2d', ...a),
    deserializeCurve2d: (...a) => delegate('deserializeCurve2d', ...a),
    splitCurve2d: (...a) => delegate('splitCurve2d', ...a),
    buildEdgeOnSurface: (...a) => delegate('buildEdgeOnSurface', ...a),
    extractSurfaceFromFace: (...a) => delegate('extractSurfaceFromFace', ...a),
    extractCurve2dFromEdge: (...a) => delegate('extractCurve2dFromEdge', ...a),
    buildCurves3d: (...a) => delegate('buildCurves3d', ...a),
    fixWireOnFace: (...a) => delegate('fixWireOnFace', ...a),
    fillSurface: (...a) => delegate('fillSurface', ...a),
  };
}

export { makeNativeKernel2DOps, isNative };
