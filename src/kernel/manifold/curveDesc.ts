/**
 * Analytic descriptors for the manifold kernel's standalone profile edges.
 *
 * Profile edges (makeLineEdge / makeCircleEdge / makeArcEdge / makeEllipseEdge /
 * makeBezierEdge) also record an analytic {@link CurveDesc} alongside their
 * sampled polyline, so 1D curve queries (length, type, point/tangent at param,
 * closed/periodic) are answered *exactly* on the mesh kernel — no OCCT replay,
 * no polyline approximation. Conics (circle/arc/ellipse) are unified as a center
 * plus two in-plane unit axes and per-axis radii: `point(θ) = C + rx·cosθ·X +
 * ry·sinθ·Y`, parametrized by angle; lines by signed distance (OCCT convention).
 * @module
 */

type Vec3 = [number, number, number];
type RVec3 = readonly [number, number, number];

export type CurveDesc =
  | { k: 'line'; p1: RVec3; p2: RVec3 }
  | {
      k: 'conic';
      center: RVec3;
      x: RVec3; // in-plane unit axis (cos direction)
      y: RVec3; // in-plane unit axis (sin direction)
      rx: number;
      ry: number; // rx === ry ⇒ circle
      a0: number;
      a1: number;
    }
  | { k: 'bezier'; points: readonly RVec3[] }
  | {
      // point(θ) = C + r(cosθ·X + sinθ·Y) + (pitch·θ/2π)·axis, θ ∈ [0, 2π·turns]
      k: 'helix';
      center: RVec3;
      axis: RVec3; // unit
      x: RVec3; // unit, ⟂ axis
      y: RVec3; // unit = axis × x
      radius: number;
      pitch: number;
      turns: number;
    };

const TAU = 2 * Math.PI;
const hypot3 = (a: RVec3): number => Math.hypot(a[0], a[1], a[2]);
const sub3 = (a: RVec3, b: RVec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

function lineLen(d: { p1: RVec3; p2: RVec3 }): number {
  return hypot3(sub3(d.p2, d.p1));
}

function bezierAt(points: readonly RVec3[], t: number): Vec3 {
  const tmp = points.map((p) => [p[0], p[1], p[2]] as Vec3);
  for (let k = 1; k < tmp.length; k++)
    for (let i = 0; i < tmp.length - k; i++) {
      const a = tmp[i] ?? [0, 0, 0];
      const b = tmp[i + 1] ?? [0, 0, 0];
      tmp[i] = [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t];
    }
  return tmp[0] ?? [0, 0, 0];
}

export function descType(d: CurveDesc): string {
  if (d.k === 'line') return 'LINE';
  if (d.k === 'bezier') return 'BEZIER';
  if (d.k === 'helix') return 'BSPLINE';
  return Math.abs(d.rx - d.ry) < 1e-9 * Math.max(1, d.rx) ? 'CIRCLE' : 'ELLIPSE';
}

/** Parameter bounds: line → [0, length]; conic → [a0, a1]; helix → [0, 2π·turns]; bezier → [0, 1]. */
export function descBounds(d: CurveDesc): { first: number; last: number } {
  if (d.k === 'line') return { first: 0, last: lineLen(d) };
  if (d.k === 'conic') return { first: d.a0, last: d.a1 };
  if (d.k === 'helix') return { first: 0, last: TAU * d.turns };
  return { first: 0, last: 1 };
}

export function descPointAt(d: CurveDesc, param: number): Vec3 {
  if (d.k === 'line') {
    const len = lineLen(d) || 1;
    const t = param / len;
    return [
      d.p1[0] + (d.p2[0] - d.p1[0]) * t,
      d.p1[1] + (d.p2[1] - d.p1[1]) * t,
      d.p1[2] + (d.p2[2] - d.p1[2]) * t,
    ];
  }
  if (d.k === 'bezier') return bezierAt(d.points, param);
  if (d.k === 'helix') {
    const ct = Math.cos(param);
    const st = Math.sin(param);
    const z = (d.pitch * param) / TAU;
    return [
      d.center[0] + d.radius * (ct * d.x[0] + st * d.y[0]) + z * d.axis[0],
      d.center[1] + d.radius * (ct * d.x[1] + st * d.y[1]) + z * d.axis[1],
      d.center[2] + d.radius * (ct * d.x[2] + st * d.y[2]) + z * d.axis[2],
    ];
  }
  const ct = Math.cos(param);
  const st = Math.sin(param);
  return [
    d.center[0] + d.rx * ct * d.x[0] + d.ry * st * d.y[0],
    d.center[1] + d.rx * ct * d.x[1] + d.ry * st * d.y[1],
    d.center[2] + d.rx * ct * d.x[2] + d.ry * st * d.y[2],
  ];
}

export function descTangent(d: CurveDesc, param: number): Vec3 {
  let t: Vec3;
  if (d.k === 'line') {
    t = sub3(d.p2, d.p1);
  } else if (d.k === 'bezier') {
    const a = bezierAt(d.points, Math.max(0, param - 1e-4));
    const b = bezierAt(d.points, Math.min(1, param + 1e-4));
    t = sub3(b, a);
  } else if (d.k === 'helix') {
    const ct = Math.cos(param);
    const st = Math.sin(param);
    // d/dθ: r(−sinθ X + cosθ Y) + (pitch/2π) axis
    const k = d.pitch / TAU;
    t = [
      d.radius * (-st * d.x[0] + ct * d.y[0]) + k * d.axis[0],
      d.radius * (-st * d.x[1] + ct * d.y[1]) + k * d.axis[1],
      d.radius * (-st * d.x[2] + ct * d.y[2]) + k * d.axis[2],
    ];
  } else {
    const ct = Math.cos(param);
    const st = Math.sin(param);
    // d/dθ (C + rx cosθ X + ry sinθ Y) = −rx sinθ X + ry cosθ Y
    t = [
      -d.rx * st * d.x[0] + d.ry * ct * d.y[0],
      -d.rx * st * d.x[1] + d.ry * ct * d.y[1],
      -d.rx * st * d.x[2] + d.ry * ct * d.y[2],
    ];
  }
  const l = hypot3(t) || 1;
  return [t[0] / l, t[1] / l, t[2] / l];
}

/** Exact length where closed-form exists; Ramanujan for full ellipses; numeric otherwise. */
export function descLength(d: CurveDesc): number {
  if (d.k === 'line') return lineLen(d);
  if (d.k === 'helix') {
    const c = TAU * d.radius;
    return d.turns * Math.sqrt(c * c + d.pitch * d.pitch);
  }
  if (d.k === 'conic') {
    const span = Math.abs(d.a1 - d.a0);
    if (Math.abs(d.rx - d.ry) < 1e-9 * Math.max(1, d.rx)) return d.rx * span; // circular arc
    if (Math.abs(span - TAU) < 1e-9) {
      // Ramanujan II for a full ellipse perimeter
      const a = d.rx;
      const b = d.ry;
      const h = ((a - b) * (a - b)) / ((a + b) * (a + b));
      return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    }
    return numericLength((t) => descPointAt(d, t), d.a0, d.a1, 256);
  }
  return numericLength((t) => descPointAt(d, t), 0, 1, 128);
}

export function descIsClosed(d: CurveDesc): boolean {
  if (d.k === 'conic') return Math.abs(Math.abs(d.a1 - d.a0) - TAU) < 1e-9;
  return false;
}

export function descIsPeriodic(d: CurveDesc): boolean {
  return descIsClosed(d);
}

export function descPeriod(d: CurveDesc): number {
  return d.k === 'conic' ? TAU : 0;
}

function numericLength(at: (t: number) => Vec3, t0: number, t1: number, n: number): number {
  let len = 0;
  let prev = at(t0);
  for (let i = 1; i <= n; i++) {
    const p = at(t0 + ((t1 - t0) * i) / n);
    len += hypot3(sub3(p, prev));
    prev = p;
  }
  return len;
}
