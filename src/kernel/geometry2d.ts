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
  return bestD < maxDist * maxDist ? bestT : null;
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

  // Find segment pairs where curves are close
  const crossTol = Math.max(tolerance * 100, 0.5);
  const candidates: { t1: number; t2: number }[] = [];
  for (let i = 0; i < N; i++) {
    /* eslint-disable @typescript-eslint/no-non-null-assertion -- WASM array indices */
    const p1a = pts1[i]!;
    const p1b = pts1[i + 1]!;
    for (let j = 0; j < N; j++) {
      const p2a = pts2[j]!;
      const p2b = pts2[j + 1]!;
      /* eslint-enable @typescript-eslint/no-non-null-assertion */
      // Quick AABB check
      const x1min = Math.min(p1a.x, p1b.x) - crossTol;
      const x1max = Math.max(p1a.x, p1b.x) + crossTol;
      const y1min = Math.min(p1a.y, p1b.y) - crossTol;
      const y1max = Math.max(p1a.y, p1b.y) + crossTol;
      const x2min = Math.min(p2a.x, p2b.x);
      const x2max = Math.max(p2a.x, p2b.x);
      const y2min = Math.min(p2a.y, p2b.y);
      const y2max = Math.max(p2a.y, p2b.y);
      if (x1max < x2min || x2max < x1min || y1max < y2min || y2max < y1min) continue;

      const t1mid = (p1a.t + p1b.t) / 2;
      const t2mid = (p2a.t + p2b.t) / 2;
      // For self-intersection, skip pairs where t1 ≈ t2 (trivial overlap)
      if (isSelf && Math.abs(t1mid - t2mid) < (b1.last - b1.first) / 5) continue;
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
  /* eslint-disable @typescript-eslint/no-non-null-assertion -- WASM array indices */
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
  /* eslint-disable @typescript-eslint/no-non-null-assertion -- WASM array indices */
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
