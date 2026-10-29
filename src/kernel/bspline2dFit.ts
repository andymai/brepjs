/* v8 ignore file -- pure-math hot path for 2D curve ops; excluded from coverage for the
   same reason as geometry2d.ts (instrumentation overhead times out 2D-heavy tests). */
/**
 * B-spline interpolation, fitting and knot operations for the pure-TS 2D
 * curve model.
 *
 * `interpolateBSpline2d` solves for the poles of a clamped B-spline that passes
 * through every input point (The NURBS Book, A9.1, averaged knots).
 * `fitBSpline2d` samples a parametric function and refines the sampling until
 * the interpolant stays within a tolerance of it. `subBSpline2d` and
 * `bezierSegments2d` cut a B-spline exactly by knot insertion.
 *
 * @module
 */

import type { Bezier2d, BSpline2d } from './geometry2d.js';

type Pt = [number, number];

/* eslint-disable @typescript-eslint/no-non-null-assertion -- knot/pole indices bounded by the B-spline invariants (|U| = n + p + 2) */

function findSpan(U: readonly number[], p: number, n: number, u: number): number {
  if (u >= U[n + 1]!) return n;
  if (u <= U[p]!) return p;
  let low = p;
  let high = n + 1;
  let mid = (low + high) >> 1;
  while (u < U[mid]! || u >= U[mid + 1]!) {
    if (u < U[mid]!) high = mid;
    else low = mid;
    mid = (low + high) >> 1;
  }
  return mid;
}

function basisFuns(U: readonly number[], span: number, u: number, p: number): number[] {
  const N = new Array<number>(p + 1).fill(0);
  const left = new Array<number>(p + 1).fill(0);
  const right = new Array<number>(p + 1).fill(0);
  N[0] = 1;
  for (let j = 1; j <= p; j++) {
    left[j] = u - U[span + 1 - j]!;
    right[j] = U[span + j]! - u;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      const denom = right[r + 1]! + left[j - r]!;
      const temp = denom === 0 ? 0 : N[r]! / denom;
      N[r] = saved + right[r + 1]! * temp;
      saved = left[j - r]! * temp;
    }
    N[j] = saved;
  }
  return N;
}

function evaluateFull(U: readonly number[], poles: readonly Pt[], p: number, u: number): Pt {
  const n = poles.length - 1;
  const span = findSpan(U, p, n, u);
  const N = basisFuns(U, span, u, p);
  let x = 0;
  let y = 0;
  for (let j = 0; j <= p; j++) {
    const pole = poles[span - p + j]!;
    x += N[j]! * pole[0];
    y += N[j]! * pole[1];
  }
  return [x, y];
}

/**
 * Gaussian elimination without pivoting on a banded system. B-spline collocation
 * matrices are totally positive, so elimination in natural order is stable.
 */
function solveBanded(rows: { start: number; vals: number[] }[], rhs: Pt[]): Pt[] {
  const n = rows.length;
  let kl = 0;
  let ku = 0;
  rows.forEach((row, k) => {
    kl = Math.max(kl, k - row.start);
    ku = Math.max(ku, row.start + row.vals.length - 1 - k);
  });
  const width = kl + ku + 1;
  const band = rows.map((row, k) => {
    const r = new Float64Array(width);
    row.vals.forEach((v, j) => {
      r[row.start + j - k + kl] = v;
    });
    return r;
  });
  const bx = rhs.map((q) => q[0]);
  const by = rhs.map((q) => q[1]);
  const at = (r: number, c: number): number => band[r]![c - r + kl]!;

  for (let i = 0; i < n; i++) {
    const pivot = at(i, i);
    if (Math.abs(pivot) < 1e-300) throw new Error('interpolateBSpline2d: singular system');
    for (let r = i + 1; r <= Math.min(n - 1, i + kl); r++) {
      const f = at(r, i) / pivot;
      if (f === 0) continue;
      const rowR = band[r]!;
      for (let c = i; c <= Math.min(n - 1, i + ku); c++) {
        rowR[c - r + kl] = rowR[c - r + kl]! - f * at(i, c);
      }
      bx[r] = bx[r]! - f * bx[i]!;
      by[r] = by[r]! - f * by[i]!;
    }
  }
  const out: Pt[] = new Array<Pt>(n);
  for (let i = n - 1; i >= 0; i--) {
    let sx = bx[i]!;
    let sy = by[i]!;
    for (let c = i + 1; c <= Math.min(n - 1, i + ku); c++) {
      const a = at(i, c);
      sx -= a * out[c]![0];
      sy -= a * out[c]![1];
    }
    const d = at(i, i);
    out[i] = [sx / d, sy / d];
  }
  return out;
}

function chordLengthParams(points: readonly Pt[]): number[] {
  const n = points.length - 1;
  const d: number[] = [0];
  for (let k = 1; k <= n; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    d.push(d[k - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = d[n]!;
  if (total < 1e-300) return d.map((_, k) => k / n);
  return d.map((v) => v / total);
}

function compressKnots(U: readonly number[]): { knots: number[]; multiplicities: number[] } {
  const knots: number[] = [];
  const multiplicities: number[] = [];
  for (const u of U) {
    const last = knots.length - 1;
    if (last >= 0 && u === knots[last]) multiplicities[last] = multiplicities[last]! + 1;
    else {
      knots.push(u);
      multiplicities.push(1);
    }
  }
  return { knots, multiplicities };
}

/**
 * Interpolate `points` with a clamped B-spline of `degree` (capped at
 * `points.length - 1`). `params` are the increasing curve parameters assigned to
 * the points, normalised to [0, 1]; chord length when omitted.
 */
export function interpolateBSpline2d(
  points: readonly Pt[],
  degree = 3,
  params?: readonly number[]
): BSpline2d {
  const n = points.length - 1;
  if (n < 1) throw new Error('interpolateBSpline2d: need at least 2 points');
  const p = Math.max(1, Math.min(degree, n));
  const ub = params ? [...params] : chordLengthParams(points);

  const U: number[] = [];
  for (let i = 0; i <= p; i++) U.push(0);
  for (let j = 1; j <= n - p; j++) {
    let sum = 0;
    for (let i = j; i < j + p; i++) sum += ub[i]!;
    U.push(sum / p);
  }
  for (let i = 0; i <= p; i++) U.push(1);

  const rows = ub.map((u) => {
    const span = findSpan(U, p, n, u);
    return { start: span - p, vals: basisFuns(U, span, u, p) };
  });
  const poles = solveBanded(
    rows,
    points.map((q) => [q[0], q[1]] as Pt)
  );
  poles[0] = [points[0]![0], points[0]![1]];
  poles[n] = [points[n]![0], points[n]![1]];

  const { knots, multiplicities } = compressKnots(U);
  return { __bk2d: 'bspline', poles, knots, multiplicities, degree: p, isPeriodic: false };
}

interface FitOptions {
  readonly degree?: number;
  readonly minSegments?: number;
  readonly maxSegments?: number;
  /**
   * Parameters in (s0, s1) where the curve may change abruptly, such as a
   * source B-spline's knots. Each piece between them is fitted on its own, so
   * a feature narrower than the sample spacing cannot fall between samples.
   */
  readonly breaks?: readonly number[];
}

function fitPiece(
  evaluate: (s: number) => Pt,
  s0: number,
  s1: number,
  tolerance: number,
  degree: number,
  minSegments: number,
  maxSegments: number
): BSpline2d {
  let segments = Math.min(maxSegments, Math.max(2, minSegments));
  for (;;) {
    const params: number[] = [];
    const points: Pt[] = [];
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      params.push(u);
      points.push(evaluate(s0 + (s1 - s0) * u));
    }
    const curve = interpolateBSpline2d(points, degree, params);
    if (segments >= maxSegments) return curve;

    const U: number[] = [];
    curve.knots.forEach((k, i) => {
      for (let m = 0; m < (curve.multiplicities[i] ?? 1); m++) U.push(k);
    });
    let maxErr = 0;
    for (let i = 0; i < segments && maxErr <= tolerance; i++) {
      const u = (i + 0.5) / segments;
      const [fx, fy] = evaluateFull(U, curve.poles, curve.degree, u);
      const [tx, ty] = evaluate(s0 + (s1 - s0) * u);
      maxErr = Math.max(maxErr, Math.hypot(fx - tx, fy - ty));
    }
    if (maxErr <= tolerance) return curve;
    segments = Math.min(maxSegments, segments * 2);
  }
}

/**
 * Concatenate clamped B-splines of one degree, each running over [0, 1], onto
 * the consecutive intervals of `cuts`. Joints are C0 (knot multiplicity =
 * degree); each piece starts on the pole the previous one ended on.
 */
function joinPieces(pieces: readonly BSpline2d[], cuts: readonly number[]): BSpline2d {
  const p = pieces[0]!.degree;
  const knots: number[] = [];
  const multiplicities: number[] = [];
  const poles: Pt[] = [];
  pieces.forEach((piece, i) => {
    const a = cuts[i]!;
    const b = cuts[i + 1]!;
    if (i === 0) {
      knots.push(a);
      multiplicities.push(p + 1);
      poles.push(...piece.poles);
    } else {
      poles.push(...piece.poles.slice(1));
    }
    for (let j = 1; j < piece.knots.length - 1; j++) {
      knots.push(a + piece.knots[j]! * (b - a));
      multiplicities.push(piece.multiplicities[j]!);
    }
    knots.push(b);
    multiplicities.push(i === pieces.length - 1 ? p + 1 : p);
  });
  return { __bk2d: 'bspline', poles, knots, multiplicities, degree: p, isPeriodic: false };
}

/**
 * Approximate the parametric curve `evaluate` over [s0, s1] by interpolating
 * uniformly spaced samples, doubling the sample count until the interpolant is
 * within `tolerance` of the curve at every mid-sample parameter (or the
 * segment cap is reached). With `breaks`, each piece between them is fitted
 * separately and the pieces are joined. The B-spline runs over [0, 1] in step
 * with s.
 */
export function fitBSpline2d(
  evaluate: (s: number) => Pt,
  s0: number,
  s1: number,
  tolerance: number,
  options: FitOptions = {}
): BSpline2d {
  const degree = options.degree ?? 3;
  const maxSegments = Math.max(2, options.maxSegments ?? 1024);
  const lo = Math.min(s0, s1);
  const hi = Math.max(s0, s1);
  const margin = 1e-12 * (hi - lo);
  const inner = [...new Set(options.breaks ?? [])]
    .filter((b) => b > lo + margin && b < hi - margin)
    .sort((a, b) => (s0 <= s1 ? a - b : b - a));
  if (!inner.length) {
    return fitPiece(evaluate, s0, s1, tolerance, degree, options.minSegments ?? 8, maxSegments);
  }
  const cuts = [s0, ...inner, s1];
  const pieces = cuts
    .slice(1)
    .map((end, i) =>
      fitPiece(evaluate, cuts[i]!, end, tolerance, degree, Math.max(degree, 2), maxSegments)
    );
  return joinPieces(
    pieces,
    cuts.map((c) => (c - s0) / (s1 - s0))
  );
}

function fullKnotVector(c: BSpline2d): number[] {
  const U: number[] = [];
  c.knots.forEach((k, i) => {
    for (let m = 0; m < (c.multiplicities[i] ?? 1); m++) U.push(k);
  });
  return U;
}

/** The B-spline form of a Bezier; a B-spline is returned as is. */
export function asBSpline2d(c: Bezier2d | BSpline2d): BSpline2d {
  if (c.__bk2d === 'bspline') return c;
  const degree = c.poles.length - 1;
  return {
    __bk2d: 'bspline',
    poles: c.poles.map(([x, y]) => [x, y] as Pt),
    knots: [0, 1],
    multiplicities: [degree + 1, degree + 1],
    degree,
    isPeriodic: false,
  };
}

/** Insert `u` once (Boehm, The NURBS Book A5.1 with r = 1). */
function insertKnot(U: number[], P: Pt[], p: number, u: number): { U: number[]; P: Pt[] } {
  const n = P.length - 1;
  const k = findSpan(U, p, n, u);
  const Q: Pt[] = [];
  for (let i = 0; i <= n + 1; i++) {
    if (i <= k - p) Q.push(P[i]!);
    else if (i > k) Q.push(P[i - 1]!);
    else {
      const alpha = (u - U[i]!) / (U[i + p]! - U[i]!);
      const a = P[i]!;
      const b = P[i - 1]!;
      Q.push([alpha * a[0] + (1 - alpha) * b[0], alpha * a[1] + (1 - alpha) * b[1]]);
    }
  }
  return { U: [...U.slice(0, k + 1), u, ...U.slice(k + 1)], P: Q };
}

/**
 * The part of a clamped B-spline over [lo, hi] (inside its knot range, lo < hi)
 * as a clamped B-spline of its own, exact by knot insertion.
 */
export function subBSpline2d(c: BSpline2d, lo: number, hi: number): BSpline2d {
  const p = c.degree;
  let U = fullKnotVector(c);
  let P = c.poles.map(([x, y]) => [x, y] as Pt);
  const first = U[p]!;
  const last = U[U.length - 1 - p]!;
  const a = Math.min(last, Math.max(first, lo));
  const b = Math.min(last, Math.max(first, hi));
  for (const u of [a, b]) {
    if (u <= first || u >= last) continue;
    while (U.filter((k) => k === u).length < p) ({ U, P } = insertKnot(U, P, p, u));
  }
  const kLo = a <= first ? p : U.lastIndexOf(a);
  const kHi = b >= last ? U.length - 1 - p : U.indexOf(b);
  const sub: number[] = [];
  for (let i = 0; i <= p; i++) sub.push(a);
  sub.push(...U.slice(kLo + 1, kHi));
  for (let i = 0; i <= p; i++) sub.push(b);
  const { knots, multiplicities } = compressKnots(sub);
  return {
    __bk2d: 'bspline',
    poles: P.slice(kLo - p, kHi),
    knots,
    multiplicities,
    degree: p,
    isPeriodic: false,
  };
}

/**
 * Bezier poles of every non-empty knot span (The NURBS Book A5.6). A malformed
 * knot vector yields the whole control polygon as one segment, which still
 * bounds the curve.
 */
export function bezierSegments2d(c: BSpline2d): Pt[][] {
  const poles = c.poles;
  const p = c.degree;
  const U = fullKnotVector(c);
  const n = poles.length - 1;
  const m = n + p + 1;
  const clone = (pt: Pt): Pt => [pt[0], pt[1]];
  if (p < 1 || U.length !== m + 1) return [poles.map(clone)];

  const segments: Pt[][] = [];
  let a = p;
  let b = p + 1;
  let segPoles: Pt[] = [];
  for (let i = 0; i <= p; i++) segPoles[i] = clone(poles[i]!);
  let nextPoles: Pt[] = [];
  while (b < m) {
    const i0 = b;
    while (b < m && U[b + 1] === U[b]) b++;
    const mult = b - i0 + 1;
    if (mult > p && b < m) return [poles.map(clone)];
    if (mult < p) {
      const numer = U[b]! - U[a]!;
      const alphas: number[] = [];
      for (let j = p; j > mult; j--) alphas[j - mult - 1] = numer / (U[a + j]! - U[a]!);
      const r = p - mult;
      for (let j = 1; j <= r; j++) {
        const save = r - j;
        const s = mult + j;
        for (let k = p; k >= s; k--) {
          const alpha = alphas[k - s]!;
          const cur = segPoles[k]!;
          const prev = segPoles[k - 1]!;
          segPoles[k] = [
            alpha * cur[0] + (1 - alpha) * prev[0],
            alpha * cur[1] + (1 - alpha) * prev[1],
          ];
        }
        if (b < m) nextPoles[save] = clone(segPoles[p]!);
      }
    }
    segments.push(segPoles);
    if (b < m) {
      for (let i = p - mult; i <= p; i++) nextPoles[i] = clone(poles[b - p + i]!);
      segPoles = nextPoles;
      nextPoles = [];
      a = b;
      b++;
    }
  }
  return segments;
}

/* eslint-enable @typescript-eslint/no-non-null-assertion */
