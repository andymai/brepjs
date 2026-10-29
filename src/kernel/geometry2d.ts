/* v8 ignore file -- excluded from coverage reports; prevents V8 instrumentation
   overhead that causes 2D-heavy tests to timeout under coverage mode. */
/**
 * Pure-TypeScript 2D geometry implementation for Kernel2DCapability.
 *
 * All 2D curves are represented as plain objects with a `type` discriminant
 * and `evaluate(t)` method. No WASM boundary crossing required.
 *
 * ADR-0006: Inline math here (distance, rotation, normalization, dot/cross
 * products) operates on curve struct fields, not Point2D tuples. The canonical
 * tuple-based functions live in src/utils/vec2d.ts. The struct-field patterns
 * are not worth converting to tuple form — the temporary array allocations
 * would degrade both readability and performance.
 *
 * @module
 */

import { asBSpline2d, bezierSegments2d, fitBSpline2d, subBSpline2d } from './bspline2dFit.js';

// ---------------------------------------------------------------------------
// 2D Curve types
// ---------------------------------------------------------------------------

export interface Line2d {
  readonly __bk2d: 'line';
  readonly ox: number;
  readonly oy: number;
  readonly dx: number;
  readonly dy: number;
  readonly len: number;
}

export interface Circle2d {
  readonly __bk2d: 'circle';
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly sense: boolean; // true = CCW
}

export interface Ellipse2d {
  readonly __bk2d: 'ellipse';
  readonly cx: number;
  readonly cy: number;
  readonly majorRadius: number;
  readonly minorRadius: number;
  readonly xDirAngle: number; // angle of major axis from X
  readonly sense: boolean;
}

export interface Bezier2d {
  readonly __bk2d: 'bezier';
  readonly poles: [number, number][];
}

export interface BSpline2d {
  readonly __bk2d: 'bspline';
  readonly poles: [number, number][];
  readonly knots: number[];
  readonly multiplicities: number[];
  readonly degree: number;
  readonly isPeriodic: boolean;
}

export interface TrimmedCurve2d {
  readonly __bk2d: 'trimmed';
  readonly basis: Curve2dObj;
  readonly tStart: number;
  readonly tEnd: number;
}

export type Curve2dObj = Line2d | Circle2d | Ellipse2d | Bezier2d | BSpline2d | TrimmedCurve2d;

// ---------------------------------------------------------------------------
// 2D BBox
// ---------------------------------------------------------------------------

export interface BBox2d {
  readonly __bk2d_bbox: true;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export function evaluateCurve2d(c: Curve2dObj, t: number): [number, number] {
  switch (c.__bk2d) {
    case 'line':
      return [c.ox + c.dx * t, c.oy + c.dy * t];
    case 'circle': {
      const angle = c.sense ? t : -t;
      return [c.cx + c.radius * Math.cos(angle), c.cy + c.radius * Math.sin(angle)];
    }
    case 'ellipse': {
      const angle = c.sense ? t : -t;
      const cos = Math.cos(c.xDirAngle);
      const sin = Math.sin(c.xDirAngle);
      const x = c.majorRadius * Math.cos(angle);
      const y = c.minorRadius * Math.sin(angle);
      return [c.cx + x * cos - y * sin, c.cy + x * sin + y * cos];
    }
    case 'bezier':
      return evaluateBezier(c.poles, t);
    case 'bspline':
      return evaluateBSpline2d(c, t);
    case 'trimmed': {
      const mapped = c.tStart + t * (c.tEnd - c.tStart);
      return evaluateCurve2d(c.basis, mapped);
    }
  }
}

export function tangentCurve2d(c: Curve2dObj, t: number): [number, number] {
  switch (c.__bk2d) {
    case 'line':
      return [c.dx, c.dy];
    case 'circle': {
      const angle = c.sense ? t : -t;
      const sign = c.sense ? 1 : -1;
      return [-c.radius * Math.sin(angle) * sign, c.radius * Math.cos(angle) * sign];
    }
    case 'ellipse': {
      const angle = c.sense ? t : -t;
      const sign = c.sense ? 1 : -1;
      const cos = Math.cos(c.xDirAngle);
      const sin = Math.sin(c.xDirAngle);
      const dx = -c.majorRadius * Math.sin(angle) * sign;
      const dy = c.minorRadius * Math.cos(angle) * sign;
      return [dx * cos - dy * sin, dx * sin + dy * cos];
    }
    case 'bezier': {
      // Numerical differentiation
      const h = 1e-8;
      const p0 = evaluateBezier(c.poles, Math.max(0, t - h));
      const p1 = evaluateBezier(c.poles, Math.min(1, t + h));
      const dt = Math.min(1, t + h) - Math.max(0, t - h);
      return [(p1[0] - p0[0]) / dt, (p1[1] - p0[1]) / dt];
    }
    case 'bspline': {
      const h = 1e-8;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- known-valid
      const kFirst = c.knots[0]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- known-valid
      const kLast = c.knots[c.knots.length - 1]!;
      const p0 = evaluateBSpline2d(c, Math.max(kFirst, t - h));
      const p1 = evaluateBSpline2d(c, Math.min(kLast, t + h));
      const dt = Math.min(kLast, t + h) - Math.max(kFirst, t - h);
      return [(p1[0] - p0[0]) / dt, (p1[1] - p0[1]) / dt];
    }
    case 'trimmed': {
      const mapped = c.tStart + t * (c.tEnd - c.tStart);
      const tan = tangentCurve2d(c.basis, mapped);
      const scale = c.tEnd - c.tStart;
      return [tan[0] * scale, tan[1] * scale];
    }
  }
}

export function curveBounds(c: Curve2dObj): { first: number; last: number } {
  switch (c.__bk2d) {
    case 'line':
      return { first: 0, last: c.len };
    case 'circle':
    case 'ellipse':
      return { first: 0, last: 2 * Math.PI };
    case 'bezier':
      return { first: 0, last: 1 };
    case 'bspline':
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- known-valid
      return { first: c.knots[0]!, last: c.knots[c.knots.length - 1]! };
    case 'trimmed':
      return { first: 0, last: 1 };
  }
}

export function curveTypeName(c: Curve2dObj): string {
  switch (c.__bk2d) {
    case 'line':
      return 'LINE';
    case 'circle':
      return 'CIRCLE';
    case 'ellipse':
      return 'ELLIPSE';
    case 'bezier':
      return 'BEZIER_CURVE';
    case 'bspline':
      return 'BSPLINE_CURVE';
    case 'trimmed':
      return 'TRIMMED_' + curveTypeName(c.basis);
  }
}

/**
 * Collapse nested trimmed wrappers into a single trimmed curve over a
 * non-trimmed basis (or return the curve itself when it is not trimmed).
 * Evaluation is unchanged: both forms map t in [0, 1] to the same basis point.
 */
export function flattenTrimmed(c: Curve2dObj): Curve2dObj {
  if (c.__bk2d !== 'trimmed') return c;
  const inner = flattenTrimmed(c.basis);
  if (inner.__bk2d !== 'trimmed') return c;
  const span = inner.tEnd - inner.tStart;
  return {
    __bk2d: 'trimmed',
    basis: inner.basis,
    tStart: inner.tStart + c.tStart * span,
    tEnd: inner.tStart + c.tEnd * span,
  };
}

/** Basis parameter of the reversed basis that lands on the point at `u` of the original. */
function reversedBasisParam(c: Curve2dObj, u: number): number {
  switch (c.__bk2d) {
    case 'circle':
    case 'ellipse':
      return -u;
    default: {
      const { first, last } = curveBounds(c);
      return first + last - u;
    }
  }
}

/**
 * The same geometry traversed in the opposite direction (OCCT `Geom2d_Curve::Reversed`).
 * Trimmed curves keep an increasing trim range: the basis is reversed and the
 * range is remapped onto it.
 */
export function reverseCurve2d(c: Curve2dObj): Curve2dObj {
  switch (c.__bk2d) {
    case 'line':
      return {
        ...c,
        ox: c.ox + c.dx * c.len,
        oy: c.oy + c.dy * c.len,
        dx: -c.dx,
        dy: -c.dy,
      };
    case 'circle':
    case 'ellipse':
      return { ...c, sense: !c.sense };
    case 'bezier':
      return { ...c, poles: [...c.poles].reverse() };
    case 'bspline': {
      const lo = c.knots[0] ?? 0;
      const hi = c.knots[c.knots.length - 1] ?? 1;
      return {
        ...c,
        poles: [...c.poles].reverse(),
        knots: c.knots.map((k) => lo + hi - k).reverse(),
        multiplicities: [...c.multiplicities].reverse(),
      };
    }
    case 'trimmed': {
      const flat = flattenTrimmed(c);
      if (flat.__bk2d !== 'trimmed') return reverseCurve2d(flat);
      return {
        __bk2d: 'trimmed',
        basis: reverseCurve2d(flat.basis),
        tStart: reversedBasisParam(flat.basis, flat.tEnd),
        tEnd: reversedBasisParam(flat.basis, flat.tStart),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Construction helpers
// ---------------------------------------------------------------------------

export function makeLine2d(x1: number, y1: number, x2: number, y2: number): Line2d {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  return {
    __bk2d: 'line',
    ox: x1,
    oy: y1,
    dx: len > 0 ? dx / len : 1,
    dy: len > 0 ? dy / len : 0,
    len,
  };
}

export function makeCircle2d(cx: number, cy: number, radius: number, sense = true): Circle2d {
  return { __bk2d: 'circle', cx, cy, radius, sense };
}

export function makeArc2dThreePoints(
  x1: number,
  y1: number,
  xm: number,
  ym: number,
  x2: number,
  y2: number
): Curve2dObj {
  // Circumscribed circle through 3 points
  const d = 2 * (x1 * (ym - y2) + xm * (y2 - y1) + x2 * (y1 - ym));
  if (Math.abs(d) < 1e-12) {
    // Degenerate (collinear): return a line
    return makeLine2d(x1, y1, x2, y2);
  }
  const cx =
    ((x1 * x1 + y1 * y1) * (ym - y2) +
      (xm * xm + ym * ym) * (y2 - y1) +
      (x2 * x2 + y2 * y2) * (y1 - ym)) /
    d;
  const cy =
    ((x1 * x1 + y1 * y1) * (x2 - xm) +
      (xm * xm + ym * ym) * (x1 - x2) +
      (x2 * x2 + y2 * y2) * (xm - x1)) /
    d;
  const radius = Math.sqrt((x1 - cx) ** 2 + (y1 - cy) ** 2);

  // Compute angles for start (p1), mid (pm), and end (p2)
  const a1 = Math.atan2(y1 - cy, x1 - cx);
  const am = Math.atan2(ym - cy, xm - cx);
  const a2 = Math.atan2(y2 - cy, x2 - cx);

  // Determine sense: CCW if mid-point angle is between start and end going CCW
  let da1m = am - a1;
  if (da1m < 0) da1m += 2 * Math.PI;
  let da12 = a2 - a1;
  if (da12 < 0) da12 += 2 * Math.PI;
  const sense = da1m < da12; // CCW if midpoint comes before endpoint

  const circle = makeCircle2d(cx, cy, radius, sense);
  if (!sense) {
    // CW circle evaluates angle = -t, so parameter t = -angle.
    const tStart = -a1;
    let tEnd = -a2;
    if (tEnd < tStart - 1e-9) tEnd += 2 * Math.PI;
    return { __bk2d: 'trimmed', basis: circle, tStart, tEnd };
  }
  // CCW: ensure tEnd >= tStart
  let tEnd = a2;
  if (tEnd < a1 - 1e-9) tEnd += 2 * Math.PI;
  return { __bk2d: 'trimmed', basis: circle, tStart: a1, tEnd };
}

export function makeArc2dTangent(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  ex: number,
  ey: number
): Curve2dObj {
  const len = Math.sqrt(tx * tx + ty * ty);
  const ntx = len > 0 ? tx / len : 0;
  const nty = len > 0 ? ty / len : 0;

  const dx = sx - ex;
  const dy = sy - ey;
  const denom = 2 * (dy * ntx - dx * nty);

  if (Math.abs(denom) < 1e-12) {
    return makeLine2d(sx, sy, ex, ey);
  }

  const chord2 = dx * dx + dy * dy;
  const t = -chord2 / denom;
  const cx = sx - t * nty;
  const cy = sy + t * ntx;
  const radius = Math.abs(t);

  const a1 = Math.atan2(sy - cy, sx - cx);
  const a2 = Math.atan2(ey - cy, ex - cx);

  const ccwTanX = -(sy - cy) / radius;
  const ccwTanY = (sx - cx) / radius;
  const dotCcw = ntx * ccwTanX + nty * ccwTanY;

  let aMid: number;
  if (dotCcw > 0) {
    let da = a2 - a1;
    if (da <= 0) da += 2 * Math.PI;
    aMid = a1 + da / 2;
  } else {
    let da = a2 - a1;
    if (da >= 0) da -= 2 * Math.PI;
    aMid = a1 + da / 2;
  }

  const mx = cx + radius * Math.cos(aMid);
  const my = cy + radius * Math.sin(aMid);

  return makeArc2dThreePoints(sx, sy, mx, my, ex, ey);
}

export function makeEllipse2d(
  cx: number,
  cy: number,
  majorRadius: number,
  minorRadius: number,
  xDirX = 1,
  xDirY = 0,
  sense = true
): Ellipse2d {
  return {
    __bk2d: 'ellipse',
    cx,
    cy,
    majorRadius,
    minorRadius,
    xDirAngle: Math.atan2(xDirY, xDirX),
    sense,
  };
}

export function makeBezier2d(poles: [number, number][]): Bezier2d {
  return { __bk2d: 'bezier', poles: [...poles] };
}

// ---------------------------------------------------------------------------
// Transform helpers
// ---------------------------------------------------------------------------

export function translateCurve2d(c: Curve2dObj, dx: number, dy: number): Curve2dObj {
  switch (c.__bk2d) {
    case 'line':
      return { ...c, ox: c.ox + dx, oy: c.oy + dy };
    case 'circle':
      return { ...c, cx: c.cx + dx, cy: c.cy + dy };
    case 'ellipse':
      return { ...c, cx: c.cx + dx, cy: c.cy + dy };
    case 'bezier':
      return { ...c, poles: c.poles.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
    case 'bspline':
      return { ...c, poles: c.poles.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
    case 'trimmed':
      return { ...c, basis: translateCurve2d(c.basis, dx, dy) };
  }
}

export function rotateCurve2d(c: Curve2dObj, angle: number, cx: number, cy: number): Curve2dObj {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotatePoint = (x: number, y: number): [number, number] => {
    const rx = x - cx;
    const ry = y - cy;
    return [cx + rx * cos - ry * sin, cy + rx * sin + ry * cos];
  };

  switch (c.__bk2d) {
    case 'line': {
      const [ox, oy] = rotatePoint(c.ox, c.oy);
      const ndx = c.dx * cos - c.dy * sin;
      const ndy = c.dx * sin + c.dy * cos;
      return { ...c, ox, oy, dx: ndx, dy: ndy };
    }
    case 'circle': {
      const [ncx, ncy] = rotatePoint(c.cx, c.cy);
      return { ...c, cx: ncx, cy: ncy };
    }
    case 'ellipse': {
      const [ncx, ncy] = rotatePoint(c.cx, c.cy);
      return { ...c, cx: ncx, cy: ncy, xDirAngle: c.xDirAngle + angle };
    }
    case 'bezier':
      return { ...c, poles: c.poles.map(([x, y]) => rotatePoint(x, y)) };
    case 'bspline':
      return { ...c, poles: c.poles.map(([x, y]) => rotatePoint(x, y)) };
    case 'trimmed': {
      const basis = rotateCurve2d(c.basis, angle, cx, cy);
      // A circle carries no frame angle, so its rotation must land in the
      // trim range: parameter IS the geometric angle (negated when
      // sense=false). Without this shift, rotating an arc about its own
      // circle center was a silent no-op.
      if (basis.__bk2d === 'circle') {
        const shift = basis.sense ? angle : -angle;
        return { ...c, basis, tStart: c.tStart + shift, tEnd: c.tEnd + shift };
      }
      return { ...c, basis };
    }
  }
}

export function scaleCurve2d(c: Curve2dObj, factor: number, cx: number, cy: number): Curve2dObj {
  const scalePoint = (x: number, y: number): [number, number] => [
    cx + (x - cx) * factor,
    cy + (y - cy) * factor,
  ];

  switch (c.__bk2d) {
    case 'line': {
      // Scale BOTH endpoints and recompute direction/length. Scaling only the
      // origin (keeping dx/dy/len) left the endpoint wrong for factor != 1 —
      // most damagingly for mirror (factor = -1, via mirrorAtPoint), which
      // reflected the origin but kept the original direction, so the line
      // pointed the wrong way. Consecutive glyph lines then no longer shared a
      // vertex, leaving font wires disconnected/invalid (engraved-text bug).
      const [ox, oy] = scalePoint(c.ox, c.oy);
      const [ex, ey] = scalePoint(c.ox + c.dx * c.len, c.oy + c.dy * c.len);
      const ndx = ex - ox;
      const ndy = ey - oy;
      const nlen = Math.sqrt(ndx * ndx + ndy * ndy);
      return {
        ...c,
        ox,
        oy,
        dx: nlen > 0 ? ndx / nlen : c.dx,
        dy: nlen > 0 ? ndy / nlen : c.dy,
        len: nlen,
      };
    }
    case 'circle': {
      const [ncx, ncy] = scalePoint(c.cx, c.cy);
      return { ...c, cx: ncx, cy: ncy, radius: c.radius * Math.abs(factor) };
    }
    case 'ellipse': {
      const [ncx, ncy] = scalePoint(c.cx, c.cy);
      return {
        ...c,
        cx: ncx,
        cy: ncy,
        majorRadius: c.majorRadius * Math.abs(factor),
        minorRadius: c.minorRadius * Math.abs(factor),
        // A negative factor is a half-turn on top of |factor|; the frame carries it.
        xDirAngle: factor < 0 ? c.xDirAngle + Math.PI : c.xDirAngle,
      };
    }
    case 'bezier':
      return { ...c, poles: c.poles.map(([x, y]) => scalePoint(x, y)) };
    case 'bspline':
      return { ...c, poles: c.poles.map(([x, y]) => scalePoint(x, y)) };
    case 'trimmed': {
      const basis = scaleCurve2d(c.basis, factor, cx, cy);
      // Lines are parameterised by arc length, so the trim range scales too.
      if (basis.__bk2d === 'line') {
        const s = Math.abs(factor);
        return { ...c, basis, tStart: c.tStart * s, tEnd: c.tEnd * s };
      }
      // A frameless circle cannot carry the half-turn of a negative factor, so
      // it lands in the trim range (as in rotateCurve2d).
      if (basis.__bk2d === 'circle' && factor < 0) {
        const shift = basis.sense ? Math.PI : -Math.PI;
        return { ...c, basis, tStart: c.tStart + shift, tEnd: c.tEnd + shift };
      }
      return { ...c, basis };
    }
  }
}

export function mirrorAtPoint(c: Curve2dObj, cx: number, cy: number): Curve2dObj {
  // A point mirror IS a half-turn. Routing through rotate keeps every curve
  // type's parameterization exact: scale(-1) reflected conic centers but left
  // their angular parameterization behind, so trimmed-arc endpoints came back
  // point-reflected through the center.
  return rotateCurve2d(c, Math.PI, cx, cy);
}

export function mirrorAcrossAxis(
  c: Curve2dObj,
  ox: number,
  oy: number,
  dx: number,
  dy: number
): Curve2dObj {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-15) return c;
  const nx = dx / len;
  const ny = dy / len;

  const reflectPoint = (x: number, y: number): [number, number] => {
    const rx = x - ox;
    const ry = y - oy;
    const dot = rx * nx + ry * ny;
    return [ox + 2 * dot * nx - rx, oy + 2 * dot * ny - ry];
  };

  switch (c.__bk2d) {
    case 'line': {
      const [nox, noy] = reflectPoint(c.ox, c.oy);
      const ndx = 2 * (c.dx * nx + c.dy * ny) * nx - c.dx;
      const ndy = 2 * (c.dx * nx + c.dy * ny) * ny - c.dy;
      return { ...c, ox: nox, oy: noy, dx: ndx, dy: ndy };
    }
    case 'circle': {
      const [ncx, ncy] = reflectPoint(c.cx, c.cy);
      return { ...c, cx: ncx, cy: ncy, sense: !c.sense };
    }
    case 'ellipse': {
      const [ncx, ncy] = reflectPoint(c.cx, c.cy);
      // Reflect the major-axis direction angle across the mirror axis
      const cos2 = nx * nx - ny * ny;
      const sin2 = 2 * nx * ny;
      const newAngle = Math.atan2(
        sin2 * Math.cos(c.xDirAngle) - cos2 * Math.sin(c.xDirAngle),
        cos2 * Math.cos(c.xDirAngle) + sin2 * Math.sin(c.xDirAngle)
      );
      return { ...c, cx: ncx, cy: ncy, xDirAngle: newAngle, sense: !c.sense };
    }
    case 'bezier':
      return { ...c, poles: c.poles.map(([x, y]) => reflectPoint(x, y)) };
    case 'bspline':
      return { ...c, poles: c.poles.map(([x, y]) => reflectPoint(x, y)) };
    case 'trimmed': {
      const basis = mirrorAcrossAxis(c.basis, ox, oy, dx, dy);
      // Reflection maps a circle's geometric angle theta to 2*phi - theta
      // (phi = axis angle). The sense flip on the basis absorbs the negation;
      // the 2*phi rotation has nowhere to live on a frameless circle, so it
      // lands in the trim range (sign follows the ORIGINAL sense).
      if (c.basis.__bk2d === 'circle' && basis.__bk2d === 'circle') {
        const phi = Math.atan2(ny, nx);
        const shift = c.basis.sense ? -2 * phi : 2 * phi;
        return { ...c, basis, tStart: c.tStart + shift, tEnd: c.tEnd + shift };
      }
      return { ...c, basis };
    }
  }
}

// ---------------------------------------------------------------------------
// Affine maps, offsets, curve-curve distance
// ---------------------------------------------------------------------------

/** The affine map x' = a*x + b*y + tx, y' = c*x + d*y + ty. */
export interface Affine2d {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
}

function applyAffine(m: Affine2d, x: number, y: number): [number, number] {
  return [m.a * x + m.b * y + m.tx, m.c * x + m.d * y + m.ty];
}

interface MappedCurve {
  curve: Curve2dObj;
  /** Parameter on the image that lands on the image of the point at `u`. */
  mapParam: (u: number) => number;
}

/**
 * Image of the conic C + M0 * (cos psi, sin psi), psi = sense ? t : -t.
 * The closed-form 2x2 SVD M = R(phi) * diag(sx, sy) * R(theta) gives the new
 * frame (phi), radii (sx, |sy|) and the angular shift (theta); sy < 0 means the
 * map reflects, which flips the sense.
 */
function affineConic(
  cx: number,
  cy: number,
  m0: [number, number, number, number],
  sense: boolean,
  m: Affine2d
): MappedCurve {
  const [ncx, ncy] = applyAffine(m, cx, cy);
  const m00 = m.a * m0[0] + m.b * m0[2];
  const m01 = m.a * m0[1] + m.b * m0[3];
  const m10 = m.c * m0[0] + m.d * m0[2];
  const m11 = m.c * m0[1] + m.d * m0[3];
  const e = (m00 + m11) / 2;
  const f = (m00 - m11) / 2;
  const g = (m10 + m01) / 2;
  const h = (m10 - m01) / 2;
  const q = Math.hypot(e, h);
  const r = Math.hypot(f, g);
  const sx = q + r;
  const sy = q - r;
  const a1 = Math.atan2(g, f);
  const a2 = Math.atan2(h, e);
  const theta = (a2 - a1) / 2;
  const phi = (a2 + a1) / 2;
  const newSense = sy < 0 ? !sense : sense;
  const shift = sense ? theta : -theta;
  if (Math.min(q, r) <= 1e-12 * Math.max(q, r)) {
    const circleShift = shift + (newSense ? phi : -phi);
    return {
      curve: { __bk2d: 'circle', cx: ncx, cy: ncy, radius: sx, sense: newSense },
      mapParam: (u) => u + circleShift,
    };
  }
  return {
    curve: {
      __bk2d: 'ellipse',
      cx: ncx,
      cy: ncy,
      majorRadius: sx,
      minorRadius: Math.abs(sy),
      xDirAngle: phi,
      sense: newSense,
    },
    mapParam: (u) => u + shift,
  };
}

function affineBasis(c: Curve2dObj, m: Affine2d): MappedCurve {
  switch (c.__bk2d) {
    case 'line': {
      const ldx = m.a * c.dx + m.b * c.dy;
      const ldy = m.c * c.dx + m.d * c.dy;
      const speed = Math.hypot(ldx, ldy);
      const [ox, oy] = applyAffine(m, c.ox, c.oy);
      if (speed < 1e-300) return { curve: { ...c, ox, oy, len: 0 }, mapParam: () => 0 };
      return {
        curve: { __bk2d: 'line', ox, oy, dx: ldx / speed, dy: ldy / speed, len: c.len * speed },
        mapParam: (u) => u * speed,
      };
    }
    case 'circle':
      return affineConic(c.cx, c.cy, [c.radius, 0, 0, c.radius], c.sense, m);
    case 'ellipse': {
      const cos = Math.cos(c.xDirAngle);
      const sin = Math.sin(c.xDirAngle);
      const m0: [number, number, number, number] = [
        c.majorRadius * cos,
        -c.minorRadius * sin,
        c.majorRadius * sin,
        c.minorRadius * cos,
      ];
      return affineConic(c.cx, c.cy, m0, c.sense, m);
    }
    case 'bezier':
    case 'bspline':
      return {
        curve: { ...c, poles: c.poles.map(([x, y]) => applyAffine(m, x, y)) },
        mapParam: (u) => u,
      };
    case 'trimmed':
      return { curve: affineCurve2d(c, m), mapParam: (u) => u };
  }
}

/**
 * Exact image of a curve under an affine map (OCCT `Geom2d_Curve::Transformed`
 * with a `gp_GTrsf2d`): lines stay lines, circles and ellipses become ellipses
 * (or circles), and pole-based curves map their poles.
 */
export function affineCurve2d(c: Curve2dObj, m: Affine2d): Curve2dObj {
  const flat = flattenTrimmed(c);
  if (flat.__bk2d !== 'trimmed') return affineBasis(flat, m).curve;
  const { curve, mapParam } = affineBasis(flat.basis, m);
  return {
    __bk2d: 'trimmed',
    basis: curve,
    tStart: mapParam(flat.tStart),
    tEnd: mapParam(flat.tEnd),
  };
}

function unitTangent(c: Curve2dObj, t: number, first: number, last: number): [number, number] {
  let [tx, ty] = tangentCurve2d(c, t);
  let len = Math.hypot(tx, ty);
  // A degenerate derivative (coincident end poles, cusp): borrow the direction
  // from just inside the domain.
  for (let k = 1; len < 1e-12 && k <= 6; k++) {
    const h = (last - first) * 10 ** (-9 + k);
    [tx, ty] = tangentCurve2d(c, t + h <= Math.max(first, last) ? t + h : t - h);
    len = Math.hypot(tx, ty);
  }
  return len < 1e-300 ? [1, 0] : [tx / len, ty / len];
}

function curveExtent(c: Curve2dObj): number {
  const box = createBBox2d();
  addCurveToBBox(box, c, 0);
  return Math.hypot(box.xMax - box.xMin, box.yMax - box.yMin);
}

/**
 * Parameters of `c`, in its own parameter range, at the interior knots of its
 * B-spline basis: where a fit of the curve (or of its offset) must sample.
 */
export function curveKnotParams(c: Curve2dObj): number[] {
  const flat = flattenTrimmed(c);
  const basis = flat.__bk2d === 'trimmed' ? flat.basis : flat;
  if (basis.__bk2d !== 'bspline') return [];
  const inner = basis.knots.slice(1, -1);
  if (flat.__bk2d !== 'trimmed') return inner;
  const { tStart, tEnd } = flat;
  return inner
    .filter((k) => k > Math.min(tStart, tEnd) && k < Math.max(tStart, tEnd))
    .map((k) => (k - tStart) / (tEnd - tStart));
}

/**
 * Offset `distance` to the right of the direction of travel (OCCT
 * `Geom2d_OffsetCurve`: a counter-clockwise circle grows). Lines and circles
 * are offset exactly; other curves are fitted within `tolerance` (by default
 * relative to the curve's size).
 */
export function offsetCurve2d(c: Curve2dObj, distance: number, tolerance?: number): Curve2dObj {
  const flat = flattenTrimmed(c);
  const trimmed = flat.__bk2d === 'trimmed' ? flat : null;
  const basis = trimmed ? trimmed.basis : flat;
  // A decreasing trim range runs against its basis, which swaps the right side.
  const d = trimmed && trimmed.tEnd < trimmed.tStart ? -distance : distance;

  if (basis.__bk2d === 'line') {
    const shifted: Line2d = { ...basis, ox: basis.ox + basis.dy * d, oy: basis.oy - basis.dx * d };
    return trimmed ? { ...trimmed, basis: shifted } : shifted;
  }
  if (basis.__bk2d === 'circle') {
    const radius = basis.radius + (basis.sense ? d : -d);
    if (Math.abs(radius) <= 1e-12 * Math.max(1, basis.radius)) {
      throw new Error('offsetCurve2d: the offset collapses the circle to its center');
    }
    const circle: Circle2d = { ...basis, radius: Math.abs(radius) };
    if (!trimmed) return circle;
    if (radius > 0) return { ...trimmed, basis: circle };
    // Past the center, each point lands on the far side of the offset circle.
    const shift = basis.sense ? Math.PI : -Math.PI;
    return {
      ...trimmed,
      basis: circle,
      tStart: trimmed.tStart + shift,
      tEnd: trimmed.tEnd + shift,
    };
  }

  const { first, last } = curveBounds(flat);
  const tol = tolerance ?? 1e-9 * Math.max(1, curveExtent(flat) + Math.abs(distance));
  return fitBSpline2d(
    (t) => {
      const [px, py] = evaluateCurve2d(flat, t);
      const [ux, uy] = unitTangent(flat, t, first, last);
      return [px + uy * distance, py - ux * distance];
    },
    first,
    last,
    tol,
    { breaks: curveKnotParams(flat) }
  );
}

function sampleCurve(c: Curve2dObj, from: number, to: number, n: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) pts.push(evaluateCurve2d(c, from + ((to - from) * i) / n));
  return pts;
}

/** Second derivative by central differences, kept inside [lo, hi] for clamped curves. */
function secondDerivative(c: Curve2dObj, t: number, lo: number, hi: number): [number, number] {
  const h = 1e-4 * Math.max(hi - lo, 1e-9);
  const mid = Math.min(hi - h, Math.max(lo + h, t));
  const [ax, ay] = evaluateCurve2d(c, mid - h);
  const [bx, by] = evaluateCurve2d(c, mid);
  const [cx, cy] = evaluateCurve2d(c, mid + h);
  return [(ax - 2 * bx + cx) / (h * h), (ay - 2 * by + cy) / (h * h)];
}

/**
 * Newton step for f(s, t) = |c1(s) - c2(t)|^2 / 2. The closest pair of two
 * disjoint curves has parallel tangents, so the curvature terms of the Hessian
 * are what make it converge; where the Hessian is not positive definite the
 * step falls back to Gauss-Newton, then to projecting c1(s) onto c2.
 */
function closestPairStep(
  c1: Curve2dObj,
  c2: Curve2dObj,
  s: number,
  t: number,
  box1: [number, number],
  box2: [number, number]
): [number, number] {
  const [px, py] = evaluateCurve2d(c1, s);
  const [qx, qy] = evaluateCurve2d(c2, t);
  const dx = px - qx;
  const dy = py - qy;
  const t1 = tangentCurve2d(c1, s);
  const t2 = tangentCurve2d(c2, t);
  const g1 = t1[0] * dx + t1[1] * dy;
  const g2 = -(t2[0] * dx + t2[1] * dy);
  const a11 = t1[0] * t1[0] + t1[1] * t1[1];
  const a22 = t2[0] * t2[0] + t2[1] * t2[1];
  const a12 = -(t1[0] * t2[0] + t1[1] * t2[1]);
  const k1 = secondDerivative(c1, s, box1[0], box1[1]);
  const k2 = secondDerivative(c2, t, box2[0], box2[1]);
  const h11 = a11 + k1[0] * dx + k1[1] * dy;
  const h22 = a22 - (k2[0] * dx + k2[1] * dy);
  const detH = h11 * h22 - a12 * a12;
  if (h11 > 0 && detH > 1e-12 * Math.abs(h11 * h22)) {
    return [(-g1 * h22 + g2 * a12) / detH, (-g2 * h11 + g1 * a12) / detH];
  }
  const detGN = a11 * a22 - a12 * a12;
  if (detGN > 1e-12 * a11 * a22) {
    return [(-g1 * a22 + g2 * a12) / detGN, (-g2 * a11 + g1 * a12) / detGN];
  }
  if (a22 > 0) return [0, -g2 / a22];
  return a11 > 0 ? [-g1 / a11, 0] : [0, 0];
}

/** Refine a seed pair, halving each step until it lowers the distance; returns the squared distance. */
function refineClosestPair(
  c1: Curve2dObj,
  c2: Curve2dObj,
  seed: [number, number],
  box1: [number, number],
  box2: [number, number]
): number {
  const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));
  const distSq = (a: number, b: number) => {
    const [px, py] = evaluateCurve2d(c1, a);
    const [qx, qy] = evaluateCurve2d(c2, b);
    return (px - qx) ** 2 + (py - qy) ** 2;
  };
  let [s, t] = seed;
  let f = distSq(s, t);
  for (let iter = 0; iter < 60 && f > 0; iter++) {
    const [ds, dt] = closestPairStep(c1, c2, s, t, box1, box2);
    let lambda = 1;
    let ns = s;
    let nt = t;
    let nf = f;
    for (; lambda > 1e-6 && nf >= f; lambda /= 2) {
      ns = clamp(s + lambda * ds, box1);
      nt = clamp(t + lambda * dt, box2);
      nf = distSq(ns, nt);
    }
    if (nf >= f || (ns === s && nt === t)) break;
    [s, t, f] = [ns, nt, nf];
  }
  return f;
}

/** Whether grid cell (i, j) is no larger than any of its eight neighbours. */
function isGridMinimum(at: (i: number, j: number) => number, i: number, j: number, n: number) {
  const d = at(i, j);
  for (let ni = Math.max(0, i - 1); ni <= Math.min(n, i + 1); ni++) {
    for (let nj = Math.max(0, j - 1); nj <= Math.min(n, j + 1); nj++) {
      if (at(ni, nj) < d) return false;
    }
  }
  return true;
}

/**
 * Minimum distance between c1 over [from1, to1] and c2 over [from2, to2]
 * (OCCT `Geom2dAPI_ExtremaCurveCurve`): every local minimum of a sampled
 * distance grid seeds a Gauss-Newton refinement.
 */
export function distanceBetweenCurves2d(
  c1: Curve2dObj,
  c2: Curve2dObj,
  from1: number,
  to1: number,
  from2: number,
  to2: number
): number {
  const n = 32;
  const p1 = sampleCurve(c1, from1, to1, n);
  const p2 = sampleCurve(c2, from2, to2, n);
  const grid = new Float64Array((n + 1) * (n + 1));
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      /* eslint-disable @typescript-eslint/no-non-null-assertion -- i, j within 0..n */
      const a = p1[i]!;
      const b = p2[j]!;
      /* eslint-enable @typescript-eslint/no-non-null-assertion */
      grid[i * (n + 1) + j] = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
    }
  }
  const at = (i: number, j: number) => grid[i * (n + 1) + j] ?? Infinity;
  const seeds: { i: number; j: number; d: number }[] = [];
  let best = Infinity;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const d = at(i, j);
      best = Math.min(best, d);
      if (isGridMinimum(at, i, j, n)) seeds.push({ i, j, d });
    }
  }
  seeds.sort((x, y) => x.d - y.d);
  const box1: [number, number] = [Math.min(from1, to1), Math.max(from1, to1)];
  const box2: [number, number] = [Math.min(from2, to2), Math.max(from2, to2)];
  for (const { i, j } of seeds.slice(0, 8)) {
    const seed: [number, number] = [
      from1 + ((to1 - from1) * i) / n,
      from2 + ((to2 - from2) * j) / n,
    ];
    best = Math.min(best, refineClosestPair(c1, c2, seed, box1, box2));
  }
  return Math.sqrt(best);
}

// ---------------------------------------------------------------------------
// 2D Curve-Curve Intersection
// ---------------------------------------------------------------------------

/**
 * Compute intersection points (and overlapping segments) between two 2D curves.
 * Handles analytic cases (line-line, line-circle, circle-circle) and falls back
 * to numerical sampling + Newton refinement for general curves.
 */
export function intersectCurves2dFn(
  c1: Curve2dObj,
  c2: Curve2dObj,
  tolerance: number
): { points: [number, number][]; segments: Curve2dObj[] } {
  const b1 = unwrapCurve(c1);
  const b2 = unwrapCurve(c2);

  // Analytic: line-line
  if (b1.__bk2d === 'line' && b2.__bk2d === 'line') {
    return intersectLineLine(c1, b1, c2, b2, tolerance);
  }
  // Analytic: line-circle / circle-line
  if (b1.__bk2d === 'line' && b2.__bk2d === 'circle') {
    return { points: intersectLineCircle(c1, b1, c2, b2, tolerance), segments: [] };
  }
  if (b1.__bk2d === 'circle' && b2.__bk2d === 'line') {
    return { points: intersectLineCircle(c2, b2, c1, b1, tolerance), segments: [] };
  }
  // Analytic: circle-circle
  if (b1.__bk2d === 'circle' && b2.__bk2d === 'circle') {
    return { points: intersectCircleCircle(c1, b1, c2, b2, tolerance), segments: [] };
  }
  // General: numerical (with self-intersection handling)
  const isSelf = c1 === c2;
  return numericalIntersect(c1, c2, tolerance, isSelf);
}

/** Unwrap trimmed wrappers to get the basis curve type. */
function unwrapCurve(c: Curve2dObj): Curve2dObj {
  let cur = c;
  while (cur.__bk2d === 'trimmed') cur = cur.basis;
  return cur;
}

/** Check if parameter t is within the curve's domain. */
function inDomain(c: Curve2dObj, t: number, tol: number): boolean {
  const b = curveBounds(c);
  return t >= b.first - tol && t <= b.last + tol;
}

/** Find the parameter on curve c closest to point (px, py), searching near tGuess. */
function refineParam(c: Curve2dObj, px: number, py: number): number | null {
  const bounds = curveBounds(c);
  if (!isFinite(bounds.first) || !isFinite(bounds.last)) return null;
  const N = 80;
  const dt = (bounds.last - bounds.first) / N;
  let bestT = bounds.first;
  let bestD = Infinity;
  for (let i = 0; i <= N; i++) {
    const t = bounds.first + i * dt;
    const [ex, ey] = evaluateCurve2d(c, t);
    const d = (ex - px) ** 2 + (ey - py) ** 2;
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  // bestD is squared geometric distance. Derive a scale-relative threshold
  // from the curve's geometric extent (not parameter span, which has different units).
  const [sx, sy] = evaluateCurve2d(c, bounds.first);
  const [ex, ey] = evaluateCurve2d(c, bounds.last);
  const [mx, my] = evaluateCurve2d(c, (bounds.first + bounds.last) / 2);
  const geomExtent = Math.max(
    Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2),
    Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2),
    1e-6
  );
  const maxDist = geomExtent * 0.1;
  return bestD < maxDist * maxDist
    ? refineFootPoint(c, px, py, bestT, bounds.first, bounds.last)
    : null;
}

/**
 * Gauss-Newton the foot point of (px, py) on c from a sampled start parameter, staying
 * within [from, to] (either order). A sampling grid alone leaves the point up to
 * ~r*pi/N off an arc, while intersection and split callers treat a point as on the
 * curve only within ~1e-8, so an unrefined sample rejects nearly every real crossing.
 */
export function refineFootPoint(
  c: Curve2dObj,
  px: number,
  py: number,
  start: number,
  from: number,
  to: number
): number {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  let t = start;
  let [x, y] = evaluateCurve2d(c, t);
  let distSq = (x - px) ** 2 + (y - py) ** 2;
  for (let iter = 0; iter < 30 && distSq > 0; iter++) {
    const [tx, ty] = tangentCurve2d(c, t);
    const speedSq = tx * tx + ty * ty;
    if (speedSq < 1e-300) break;
    const next = Math.min(hi, Math.max(lo, t + ((px - x) * tx + (py - y) * ty) / speedSq));
    const [nx, ny] = evaluateCurve2d(c, next);
    const nextDistSq = (nx - px) ** 2 + (ny - py) ** 2;
    if (nextDistSq >= distSq) break;
    t = next;
    x = nx;
    y = ny;
    distSq = nextDistSq;
  }
  return t;
}

function intersectLineLine(
  c1: Curve2dObj,
  l1: Line2d,
  c2: Curve2dObj,
  l2: Line2d,
  tol: number
): { points: [number, number][]; segments: Curve2dObj[] } {
  const det = l1.dx * l2.dy - l1.dy * l2.dx;
  if (Math.abs(det) >= 1e-14) {
    // Non-parallel: solve for intersection
    const ex = l2.ox - l1.ox;
    const ey = l2.oy - l1.oy;
    const t1 = (ex * l2.dy - ey * l2.dx) / det;
    const t2 = (ex * l1.dy - ey * l1.dx) / det;
    if (!inDomain(c1, t1, tol) || !inDomain(c2, t2, tol)) return { points: [], segments: [] };
    return { points: [[l1.ox + t1 * l1.dx, l1.oy + t1 * l1.dy]], segments: [] };
  }

  // Parallel — check if collinear and overlapping
  const ex = l2.ox - l1.ox;
  const ey = l2.oy - l1.oy;
  const cross = ex * l1.dy - ey * l1.dx;
  if (Math.abs(cross) > tol) return { points: [], segments: [] }; // parallel but not collinear

  // Project c2 endpoints onto c1's parameter space
  const b1 = curveBounds(c1);
  const b2 = curveBounds(c2);
  const p2s = evaluateCurve2d(c2, b2.first);
  const p2e = evaluateCurve2d(c2, b2.last);
  const t2sOn1 = (p2s[0] - l1.ox) * l1.dx + (p2s[1] - l1.oy) * l1.dy;
  const t2eOn1 = (p2e[0] - l1.ox) * l1.dx + (p2e[1] - l1.oy) * l1.dy;
  const overlapStart = Math.max(b1.first, Math.min(t2sOn1, t2eOn1));
  const overlapEnd = Math.min(b1.last, Math.max(t2sOn1, t2eOn1));
  if (overlapEnd - overlapStart < tol) return { points: [], segments: [] }; // no meaningful overlap

  // Return the overlapping segment as a line
  const sx = l1.ox + overlapStart * l1.dx;
  const sy = l1.oy + overlapStart * l1.dy;
  const ex2 = l1.ox + overlapEnd * l1.dx;
  const ey2 = l1.oy + overlapEnd * l1.dy;
  const seg = makeLine2d(sx, sy, ex2, ey2);
  return { points: [], segments: [seg] };
}

function intersectLineCircle(
  cLine: Curve2dObj,
  line: Line2d,
  cCirc: Curve2dObj,
  circ: Circle2d,
  tol: number
): [number, number][] {
  // Vector from circle center to line origin
  const fx = line.ox - circ.cx;
  const fy = line.oy - circ.cy;
  // Quadratic: |f + t*d|^2 = r^2
  const a = line.dx * line.dx + line.dy * line.dy; // = 1 for normalized
  const b = 2 * (fx * line.dx + fy * line.dy);
  const c = fx * fx + fy * fy - circ.radius * circ.radius;
  const disc = b * b - 4 * a * c;
  if (disc < -tol) return [];

  const results: [number, number][] = [];
  const sqrtDisc = Math.sqrt(Math.max(0, disc));
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);

  for (const tLine of disc < tol * tol ? [t1] : [t1, t2]) {
    if (!inDomain(cLine, tLine, tol)) continue;
    const px = line.ox + tLine * line.dx;
    const py = line.oy + tLine * line.dy;
    // Check that the point is in the circle's domain
    const tCirc = refineParam(cCirc, px, py);
    if (tCirc === null) continue;
    const [cx2, cy2] = evaluateCurve2d(cCirc, tCirc);
    if ((cx2 - px) ** 2 + (cy2 - py) ** 2 > tol * tol * 1e6) continue;
    results.push([px, py]);
  }
  return results;
}

function intersectConcentricArcs(c1: Curve2dObj, c2: Curve2dObj, tol: number): [number, number][] {
  const b1 = curveBounds(c1);
  const b2 = curveBounds(c2);

  const isFullCircle1 = Math.abs(b1.last - b1.first - 2 * Math.PI) < 1e-10;
  const isFullCircle2 = Math.abs(b2.last - b2.first - 2 * Math.PI) < 1e-10;

  if (isFullCircle1 && isFullCircle2) return [];
  if (isFullCircle1) {
    return [evaluateCurve2d(c2, b2.first), evaluateCurve2d(c2, b2.last)];
  }
  if (isFullCircle2) {
    return [evaluateCurve2d(c1, b1.first), evaluateCurve2d(c1, b1.last)];
  }

  const pts: [number, number][] = [];
  const checks: [Curve2dObj, [number, number]][] = [
    [c2, evaluateCurve2d(c1, b1.first)],
    [c2, evaluateCurve2d(c1, b1.last)],
    [c1, evaluateCurve2d(c2, b2.first)],
    [c1, evaluateCurve2d(c2, b2.last)],
  ];

  for (const [target, pt] of checks) {
    const t = refineParam(target, pt[0], pt[1]);
    if (t !== null) {
      const [ex, ey] = evaluateCurve2d(target, t);
      if ((ex - pt[0]) ** 2 + (ey - pt[1]) ** 2 < tol * tol * 100) pts.push(pt);
    }
  }

  const deduped: [number, number][] = [];
  for (const p of pts) {
    if (!deduped.some(([ddx, ddy]) => (ddx - p[0]) ** 2 + (ddy - p[1]) ** 2 < tol * tol * 100)) {
      deduped.push(p);
    }
  }
  return deduped;
}

function intersectCircleCircle(
  c1: Curve2dObj,
  circ1: Circle2d,
  c2: Curve2dObj,
  circ2: Circle2d,
  tol: number
): [number, number][] {
  const dx = circ2.cx - circ1.cx;
  const dy = circ2.cy - circ1.cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > circ1.radius + circ2.radius + tol) return [];
  if (d < Math.abs(circ1.radius - circ2.radius) - tol) return [];
  if (d < 1e-14) {
    if (Math.abs(circ1.radius - circ2.radius) > tol) return [];
    return intersectConcentricArcs(c1, c2, tol);
  }

  const a = (circ1.radius * circ1.radius - circ2.radius * circ2.radius + d * d) / (2 * d);
  const h2 = circ1.radius * circ1.radius - a * a;
  const h = Math.sqrt(Math.max(0, h2));

  const mx = circ1.cx + (a * dx) / d;
  const my = circ1.cy + (a * dy) / d;

  const candidates: [number, number][] =
    h < tol
      ? [[mx, my]]
      : [
          [mx + (h * dy) / d, my - (h * dx) / d],
          [mx - (h * dy) / d, my + (h * dx) / d],
        ];

  // Filter candidates that lie within both curves' domains
  const results: [number, number][] = [];
  for (const [px, py] of candidates) {
    const t1 = refineParam(c1, px, py);
    const t2 = refineParam(c2, px, py);
    if (t1 === null || t2 === null) continue;
    const [x1, y1] = evaluateCurve2d(c1, t1);
    const [x2, y2] = evaluateCurve2d(c2, t2);
    // Compare squared distances against squared tolerance to avoid sqrt
    const tolSq = (tol * 10) ** 2;
    if ((x1 - px) ** 2 + (y1 - py) ** 2 > tolSq) continue;
    if ((x2 - px) ** 2 + (y2 - py) ** 2 > tolSq) continue;
    results.push([px, py]);
  }
  return results;
}

/**
 * Numerical intersection via sampling + Newton refinement.
 * Samples both curves densely, finds close point pairs, refines with Newton.
 */
function numericalIntersect(
  c1: Curve2dObj,
  c2: Curve2dObj,
  tolerance: number,
  isSelf = false
): { points: [number, number][]; segments: Curve2dObj[] } {
  const b1 = curveBounds(c1);
  const b2 = curveBounds(c2);
  if (!isFinite(b1.first) || !isFinite(b1.last) || !isFinite(b2.first) || !isFinite(b2.last)) {
    return { points: [], segments: [] };
  }

  const N = 100;
  const pts1: { t: number; x: number; y: number }[] = [];
  const pts2: { t: number; x: number; y: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const t1 = b1.first + ((b1.last - b1.first) * i) / N;
    const [x1, y1] = evaluateCurve2d(c1, t1);
    pts1.push({ t: t1, x: x1, y: y1 });
    const t2 = b2.first + ((b2.last - b2.first) * i) / N;
    const [x2, y2] = evaluateCurve2d(c2, t2);
    pts2.push({ t: t2, x: x2, y: y2 });
  }

  // Pre-compute segment bounds for curve2 (avoids recomputing N times in inner loop)
  const crossTol = Math.max(tolerance * 100, 0.5);
  const seg2Bounds = new Float64Array(N * 6); // xmin, xmax, ymin, ymax, tmid, _pad per segment
  for (let j = 0; j < N; j++) {
    /* eslint-disable @typescript-eslint/no-non-null-assertion -- known array index */
    const a = pts2[j]!,
      b = pts2[j + 1]!;
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
    const off = j * 6;
    seg2Bounds[off] = Math.min(a.x, b.x);
    seg2Bounds[off + 1] = Math.max(a.x, b.x);
    seg2Bounds[off + 2] = Math.min(a.y, b.y);
    seg2Bounds[off + 3] = Math.max(a.y, b.y);
    seg2Bounds[off + 4] = (a.t + b.t) / 2;
  }

  // Find segment pairs where curves are close
  const candidates: { t1: number; t2: number }[] = [];
  const selfMinSep = (b1.last - b1.first) / 5;
  for (let i = 0; i < N; i++) {
    /* eslint-disable @typescript-eslint/no-non-null-assertion -- known array index */
    const p1a = pts1[i]!;
    const p1b = pts1[i + 1]!;
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
    // Hoist outer segment AABB (computed once per outer iteration)
    const x1min = Math.min(p1a.x, p1b.x) - crossTol;
    const x1max = Math.max(p1a.x, p1b.x) + crossTol;
    const y1min = Math.min(p1a.y, p1b.y) - crossTol;
    const y1max = Math.max(p1a.y, p1b.y) + crossTol;
    const t1mid = (p1a.t + p1b.t) / 2;
    for (let j = 0; j < N; j++) {
      const off = j * 6;
      /* eslint-disable @typescript-eslint/no-non-null-assertion -- typed array indices known valid */
      if (x1max < seg2Bounds[off]! || seg2Bounds[off + 1]! < x1min) continue;
      if (y1max < seg2Bounds[off + 2]! || seg2Bounds[off + 3]! < y1min) continue;
      const t2mid = seg2Bounds[off + 4]!;
      /* eslint-enable @typescript-eslint/no-non-null-assertion */
      if (isSelf && Math.abs(t1mid - t2mid) < selfMinSep) continue;
      candidates.push({ t1: t1mid, t2: t2mid });
    }
  }

  // Refine candidates via Newton iteration
  const tol2 = tolerance * tolerance;
  const found: [number, number][] = [];
  for (const { t1: t1Init, t2: t2Init } of candidates) {
    let t1 = t1Init;
    let t2 = t2Init;
    for (let iter = 0; iter < 20; iter++) {
      const [x1, y1] = evaluateCurve2d(c1, t1);
      const [x2, y2] = evaluateCurve2d(c2, t2);
      const dx = x1 - x2;
      const dy = y1 - y2;
      if (dx * dx + dy * dy < tol2) break;
      const d1 = tangentCurve2d(c1, t1);
      const d2 = tangentCurve2d(c2, t2);
      // Newton system: J * [dt1, dt2]^T = -[dx, dy]
      // J = [d1x, -d2x; d1y, -d2y]
      const det = d1[0] * -d2[1] - -d2[0] * d1[1];
      if (Math.abs(det) < 1e-14) break;
      const dt1 = (-dx * -d2[1] - -dy * -d2[0]) / det;
      const dt2 = (d1[0] * -dy - d1[1] * -dx) / det;
      t1 += dt1;
      t2 += dt2;
      // Clamp to domain
      t1 = Math.max(b1.first, Math.min(b1.last, t1));
      t2 = Math.max(b2.first, Math.min(b2.last, t2));
    }
    const [x1, y1] = evaluateCurve2d(c1, t1);
    const [x2, y2] = evaluateCurve2d(c2, t2);
    // For self-intersection, only accept points where parameters are well-separated
    if (isSelf && Math.abs(t1 - t2) < (b1.last - b1.first) * 0.05) continue;
    if ((x1 - x2) ** 2 + (y1 - y2) ** 2 < tolerance * tolerance * 1e6) {
      const px = (x1 + x2) / 2;
      const py = (y1 + y2) / 2;
      // Deduplicate
      let dup = false;
      for (const [fx, fy] of found) {
        if ((fx - px) ** 2 + (fy - py) ** 2 < tolerance * tolerance * 1e4) {
          dup = true;
          break;
        }
      }
      if (!dup) found.push([px, py]);
    }
  }

  return { points: found, segments: [] };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializeCurve2d(c: Curve2dObj): string {
  return JSON.stringify(c);
}

export function deserializeCurve2d(data: string): Curve2dObj {
  return JSON.parse(data) as Curve2dObj;
}

// ---------------------------------------------------------------------------
// BBox helpers
// ---------------------------------------------------------------------------

export function createBBox2d(): BBox2d {
  return { __bk2d_bbox: true, xMin: Infinity, yMin: Infinity, xMax: -Infinity, yMax: -Infinity };
}

/** The first parameter congruent to `t` (mod 2*pi) inside [lo, hi], if any. */
function periodicParamInRange(t: number, lo: number, hi: number): number | null {
  const period = 2 * Math.PI;
  const tt = t + period * Math.ceil((lo - t) / period - 1e-12);
  return tt <= hi + 1e-12 ? tt : null;
}

/**
 * Basis parameters where a conic reaches its axis-aligned extremes. For
 * C + a*cos(psi)*U + b*sin(psi)*V (U at angle phi), dx/dpsi = 0 at
 * tan(psi) = -b*sin(phi) / (a*cos(phi)) and dy/dpsi = 0 at
 * tan(psi) = b*cos(phi) / (a*sin(phi)), each plus pi.
 */
function conicExtremeParams(c: Circle2d | Ellipse2d): number[] {
  const [a, b, phi] =
    c.__bk2d === 'circle' ? [c.radius, c.radius, 0] : [c.majorRadius, c.minorRadius, c.xDirAngle];
  const psiX = Math.atan2(-b * Math.sin(phi), a * Math.cos(phi));
  const psiY = Math.atan2(b * Math.cos(phi), a * Math.sin(phi));
  return [psiX, psiX + Math.PI, psiY, psiY + Math.PI].map((psi) => (c.sense ? psi : -psi));
}

function splitBezier1d(vals: readonly number[]): [number[], number[]] {
  const work = [...vals];
  const n = work.length;
  const left: number[] = [];
  const right: number[] = [];
  /* eslint-disable @typescript-eslint/no-non-null-assertion -- indices bounded by n */
  left.push(work[0]!);
  right.push(work[n - 1]!);
  for (let r = 1; r < n; r++) {
    for (let i = 0; i < n - r; i++) work[i] = (work[i]! + work[i + 1]!) / 2;
    left.push(work[0]!);
    right.push(work[n - 1 - r]!);
  }
  /* eslint-enable @typescript-eslint/no-non-null-assertion */
  return [left, right.reverse()];
}

/**
 * Widen `range` to the values a 1D Bezier takes. Its coefficients bound it
 * (convex hull), so a piece whose coefficients stay inside the range is done;
 * otherwise the piece is halved, adding the curve value at the split.
 */
function widenToBezier(vals: readonly number[], range: { min: number; max: number }, depth = 0) {
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const tol = 1e-12 * (1 + Math.abs(range.min) + Math.abs(range.max));
  if (lo >= range.min - tol && hi <= range.max + tol) return;
  if (depth >= 60) {
    range.min = Math.min(range.min, lo);
    range.max = Math.max(range.max, hi);
    return;
  }
  const [left, right] = splitBezier1d(vals);
  const mid = right[0] ?? lo;
  range.min = Math.min(range.min, mid);
  range.max = Math.max(range.max, mid);
  widenToBezier(left, range, depth + 1);
  widenToBezier(right, range, depth + 1);
}

/** Add the exact extent of a Bezier or B-spline over [lo, hi], span by span. */
function addPoleCurveExtent(bbox: BBox2d, c: Bezier2d | BSpline2d, lo: number, hi: number): void {
  const bs = asBSpline2d(c);
  const first = bs.knots[0] ?? 0;
  const last = bs.knots[bs.knots.length - 1] ?? 1;
  const a = Math.max(first, lo);
  const b = Math.min(last, hi);
  if (b <= a) return;
  const piece = a > first || b < last ? subBSpline2d(bs, a, b) : bs;
  const x = { min: bbox.xMin, max: bbox.xMax };
  const y = { min: bbox.yMin, max: bbox.yMax };
  for (const seg of bezierSegments2d(piece)) {
    for (const [range, axis] of [
      [x, 0],
      [y, 1],
    ] as const) {
      const vals = seg.map((pt) => pt[axis]);
      const ends = [vals[0] ?? range.min, vals[vals.length - 1] ?? range.min];
      range.min = Math.min(range.min, ...ends);
      range.max = Math.max(range.max, ...ends);
      widenToBezier(vals, range);
    }
  }
  bbox.xMin = x.min;
  bbox.xMax = x.max;
  bbox.yMin = y.min;
  bbox.yMax = y.max;
}

export function addCurveToBBox(bbox: BBox2d, c: Curve2dObj, _tol: number): void {
  const bounds = curveBounds(c);
  if (!isFinite(bounds.first) || !isFinite(bounds.last)) return;
  const addPoint = ([x, y]: [number, number]) => {
    bbox.xMin = Math.min(bbox.xMin, x);
    bbox.yMin = Math.min(bbox.yMin, y);
    bbox.xMax = Math.max(bbox.xMax, x);
    bbox.yMax = Math.max(bbox.yMax, y);
  };
  addPoint(evaluateCurve2d(c, bounds.first));
  addPoint(evaluateCurve2d(c, bounds.last));

  const flat = flattenTrimmed(c);
  const basis = flat.__bk2d === 'trimmed' ? flat.basis : flat;
  const basisBounds = curveBounds(basis);
  const [from, to] =
    flat.__bk2d === 'trimmed' ? [flat.tStart, flat.tEnd] : [basisBounds.first, basisBounds.last];
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const add = (t: number) => {
    addPoint(evaluateCurve2d(basis, t));
  };

  switch (basis.__bk2d) {
    case 'line':
      return;
    case 'circle':
    case 'ellipse':
      for (const t of conicExtremeParams(basis)) {
        const tt = periodicParamInRange(t, lo, hi);
        if (tt !== null) add(tt);
      }
      return;
    case 'bezier':
    case 'bspline':
      addPoleCurveExtent(bbox, basis, lo, hi);
      return;
    case 'trimmed':
      return;
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function evaluateBezier(poles: [number, number][], t: number): [number, number] {
  // De Casteljau
  const n = poles.length;
  const work = poles.map(([x, y]) => [x, y] as [number, number]);
  /* eslint-disable @typescript-eslint/no-non-null-assertion -- array indices known valid by loop bounds */
  for (let r = 1; r < n; r++) {
    for (let i = 0; i < n - r; i++) {
      const wi = work[i]!;
      const wi1 = work[i + 1]!;
      wi[0] = (1 - t) * wi[0] + t * wi1[0];
      wi[1] = (1 - t) * wi[1] + t * wi1[1];
    }
  }
  return work[0]!;
  /* eslint-enable @typescript-eslint/no-non-null-assertion */
}

function evaluateBSpline2d(c: BSpline2d, t: number): [number, number] {
  /* eslint-disable @typescript-eslint/no-non-null-assertion -- knot-vector indices known valid by loop bounds */
  // Expand knots with multiplicities
  const fullKnots: number[] = [];
  for (let i = 0; i < c.knots.length; i++) {
    const mult = c.multiplicities[i] ?? 1;
    for (let j = 0; j < mult; j++) {
      fullKnots.push(c.knots[i]!);
    }
  }

  // De Boor evaluation
  const p = c.degree;
  const n = c.poles.length;
  const k = fullKnots.length;

  // Clamp t to domain
  const tClamped = Math.max(fullKnots[p]!, Math.min(fullKnots[k - p - 1]!, t));

  // Find span
  let span = p;
  for (let i = p; i < k - p - 1; i++) {
    if (tClamped >= fullKnots[i]! && tClamped < fullKnots[i + 1]!) {
      span = i;
      break;
    }
  }
  if (tClamped >= fullKnots[k - p - 1]!) span = k - p - 2;

  // Extract relevant control points
  const d: [number, number][] = [];
  for (let j = 0; j <= p; j++) {
    const idx = Math.min(span - p + j, n - 1);
    const pole = c.poles[Math.max(0, idx)]!;
    d.push([pole[0], pole[1]]);
  }

  // De Boor recursion
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const i = span - p + j;
      const left = fullKnots[i] ?? 0;
      const right = fullKnots[i + p - r + 1] ?? 1;
      const denom = right - left;
      const alpha = denom > 1e-15 ? (tClamped - left) / denom : 0;
      const dj = d[j]!;
      const djPrev = d[j - 1]!;
      dj[0] = (1 - alpha) * djPrev[0] + alpha * dj[0];
      dj[1] = (1 - alpha) * djPrev[1] + alpha * dj[1];
    }
  }

  return d[p]!;
  /* eslint-enable @typescript-eslint/no-non-null-assertion */
}
