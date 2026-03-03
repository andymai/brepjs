/* v8 ignore file -- brepkit WASM kernel not available in OCCT test suite */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- array indices are bounded by algorithm invariants */
/**
 * Pure-TypeScript 2D geometry implementation for brepkit's Kernel2DCapability.
 *
 * All 2D curves are represented as plain objects with a `type` discriminant
 * and `evaluate(t)` method. No WASM boundary crossing required.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// 2D Curve types
// ---------------------------------------------------------------------------

export interface Line2d {
  readonly __bk2d: 'line';
  readonly ox: number;
  readonly oy: number;
  readonly dx: number;
  readonly dy: number;
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
      const kFirst = c.knots[0]!;
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
      return { first: -1e10, last: 1e10 };
    case 'circle':
    case 'ellipse':
      return { first: 0, last: 2 * Math.PI };
    case 'bezier':
      return { first: 0, last: 1 };
    case 'bspline':
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
      return 'BEZIER';
    case 'bspline':
      return 'BSPLINE';
    case 'trimmed':
      return 'TRIMMED_' + curveTypeName(c.basis);
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
  };
}

export function makeCircle2d(cx: number, cy: number, radius: number, sense = true): Circle2d {
  return { __bk2d: 'circle', cx, cy, radius, sense };
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
    case 'trimmed':
      return { ...c, basis: rotateCurve2d(c.basis, angle, cx, cy) };
  }
}

export function scaleCurve2d(c: Curve2dObj, factor: number, cx: number, cy: number): Curve2dObj {
  const scalePoint = (x: number, y: number): [number, number] => [
    cx + (x - cx) * factor,
    cy + (y - cy) * factor,
  ];

  switch (c.__bk2d) {
    case 'line': {
      const [ox, oy] = scalePoint(c.ox, c.oy);
      return { ...c, ox, oy };
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
      };
    }
    case 'bezier':
      return { ...c, poles: c.poles.map(([x, y]) => scalePoint(x, y)) };
    case 'bspline':
      return { ...c, poles: c.poles.map(([x, y]) => scalePoint(x, y)) };
    case 'trimmed':
      return { ...c, basis: scaleCurve2d(c.basis, factor, cx, cy) };
  }
}

export function mirrorAtPoint(c: Curve2dObj, cx: number, cy: number): Curve2dObj {
  return scaleCurve2d(c, -1, cx, cy);
}

export function mirrorAcrossAxis(
  c: Curve2dObj,
  ox: number,
  oy: number,
  dx: number,
  dy: number
): Curve2dObj {
  const len = Math.sqrt(dx * dx + dy * dy);
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
    case 'trimmed':
      return { ...c, basis: mirrorAcrossAxis(c.basis, ox, oy, dx, dy) };
  }
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

export function addCurveToBBox(bbox: BBox2d, c: Curve2dObj, _tol: number): void {
  const bounds = curveBounds(c);
  // Guard against infinite-extent curves (e.g. untrimmed Line2d)
  if (!isFinite(bounds.first) || !isFinite(bounds.last)) return;
  const nSamples = 20;
  const dt = (bounds.last - bounds.first) / nSamples;
  for (let i = 0; i <= nSamples; i++) {
    const t = bounds.first + i * dt;
    const [x, y] = evaluateCurve2d(c, t);
    if (x < bbox.xMin) bbox.xMin = x;
    if (y < bbox.yMin) bbox.yMin = y;
    if (x > bbox.xMax) bbox.xMax = x;
    if (y > bbox.yMax) bbox.yMax = y;
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function evaluateBezier(poles: [number, number][], t: number): [number, number] {
  // De Casteljau
  const n = poles.length;
  const work = poles.map(([x, y]) => [x, y] as [number, number]);
  for (let r = 1; r < n; r++) {
    for (let i = 0; i < n - r; i++) {
      const wi = work[i]!;
      const wi1 = work[i + 1]!;
      wi[0] = (1 - t) * wi[0] + t * wi1[0];
      wi[1] = (1 - t) * wi[1] + t * wi1[1];
    }
  }
  return work[0]!;
}

function evaluateBSpline2d(c: BSpline2d, t: number): [number, number] {
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
}
