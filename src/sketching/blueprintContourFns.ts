/**
 * One-way, lossy Blueprint -> Contour bridge: converts a kernel-handle-backed
 * Blueprint into the pure-data contour vocabulary of the CSG IR.
 *
 * The walk consumes the blueprint's ORIGINAL curves (orientation-agnostic: a
 * curve may be stored reversed relative to path order). SVG-native types map
 * directly; anything else (bsplines, interpolations) is approximated per
 * curve. Full closed circles/ellipses split analytically into two antipodal
 * halves — the shared approximation pass is not trusted for them (it splits
 * at a wrong parametric midpoint and reports trim bounds in a normalized
 * range, so bounds-derived sweep flags would be wrong).
 */

import type Blueprint from '@/2d/blueprints/blueprint.js';
import { approximateAsSvgCompatibleCurve } from '@/2d/lib/approximations.js';
import type { Curve2D } from '@/2d/lib/curve2D.js';
import { ellipseArcFlags } from '@/2d/lib/ellipseArcFlags.js';
import { getKernel2D } from '@/kernel/index.js';
import { ok, err, type Result } from '@/core/result.js';
import { validationError } from '@/core/errors.js';
import {
  contour,
  lineTo,
  arcTo,
  bezierTo,
  ellipseArcTo,
  type Contour,
  type Segment2D,
} from '@/csg/index.js';

type Pt = readonly [number, number];

const EPS = 1e-6;

function p2(p: readonly number[]): Pt {
  return [p[0] ?? 0, p[1] ?? 0];
}

function near(a: Pt, b: Pt): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < EPS;
}

function fail(msg: string): Result<never> {
  return err(validationError('BLUEPRINT_CONTOUR', `blueprintToContour: ${msg}`));
}

function midSample(c: Curve2D): Pt {
  return p2(c.value((c.firstParameter + c.lastParameter) / 2));
}

/** Recover endpoint-arc data (radius + flags) from three on-arc points. */
function threePointsToArc(from: Pt, mid: Pt, to: Pt): Result<Segment2D> {
  const [ax, ay] = from;
  const [bx, by] = mid;
  const [cx, cy] = to;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return fail('arc: collinear sample points');
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const radius = Math.hypot(ax - ux, ay - uy);
  const cross = (v: Pt, w: Pt): number => v[0] * w[1] - v[1] * w[0];
  const clockwise = cross([bx - ax, by - ay], [cx - bx, cy - by]) < 0;
  const chord: Pt = [cx - ax, cy - ay];
  const sideMid = cross(chord, [bx - ax, by - ay]);
  const sideCenter = cross(chord, [ux - ax, uy - ay]);
  const largeArc = sideMid * sideCenter > 0;
  return ok(arcTo(to, radius, { largeArc, clockwise }));
}

interface EllipseFrame {
  readonly a: number;
  readonly b: number;
  readonly phi: number;
}

/** Endpoint-parametrized ellipse-arc flags via SVG F.6.5 candidate centers
 *  (shared with the SVG emitter), disambiguated by an on-arc interior sample. */
function ellipseArcSegment(from: Pt, to: Pt, mid: Pt, frame: EllipseFrame): Result<Segment2D> {
  const flags = ellipseArcFlags(from, to, mid, frame.a, frame.b, frame.phi);
  if (!flags) return fail('ellipse: coincident endpoints');
  return ok(
    ellipseArcTo(to, [frame.a, frame.b], {
      rotation: (frame.phi * 180) / Math.PI,
      largeArc: flags.largeArc,
      clockwise: !flags.ccw,
    })
  );
}

/** A closed CIRCLE/ELLIPSE curve becomes two half segments between antipodal
 *  points (an endpoint-parametrized segment cannot represent coincident
 *  endpoints). */
function splitClosedCurve(c: Curve2D, out: Segment2D[]): Result<Pt> {
  const k2d = getKernel2D();
  const f = p2(c.firstPoint);
  if (c.geomType === 'CIRCLE') {
    const data = k2d.getCurve2dCircleData(c.wrapped);
    if (!data) return fail('circle: kernel returned no circle data');
    const m: Pt = [2 * data.cx - f[0], 2 * data.cy - f[1]];
    const clockwise = !data.isDirect;
    out.push(arcTo(m, data.radius, { clockwise }), arcTo(f, data.radius, { clockwise }));
    return ok(f);
  }
  const data = k2d.getCurve2dEllipseData(c.wrapped);
  if (!data) return fail('ellipse: kernel returned no ellipse data');
  // Ellipse data carries no center; a FULL ellipse's bounding box does.
  const center = p2(c.boundingBox.center);
  const m: Pt = [2 * center[0] - f[0], 2 * center[1] - f[1]];
  const clockwise = !data.isDirect;
  const rotation = (data.xAxisAngle * 180) / Math.PI;
  const radii: Pt = [data.majorRadius, data.minorRadius];
  out.push(
    ellipseArcTo(m, radii, { rotation, clockwise }),
    ellipseArcTo(f, radii, { rotation, clockwise })
  );
  return ok(f);
}

function openSegment(c: Curve2D, cur: Pt, to: Pt, reversed: boolean): Result<Segment2D> {
  const type = c.geomType;
  if (type === 'LINE') return ok(lineTo(to));
  if (type === 'CIRCLE') {
    return threePointsToArc(cur, midSample(c), to);
  }
  if (type === 'BEZIER_CURVE') {
    const poles = getKernel2D().getCurve2dBezierPoles(c.wrapped);
    if (!poles) return fail('bezier: kernel returned no poles');
    const pts = poles.map(p2);
    if (reversed) pts.reverse();
    const controls = pts.slice(1, -1);
    if (controls.length === 0) return ok(lineTo(to));
    if (controls.length > 2) return fail(`bezier: unsupported degree ${pts.length - 1}`);
    return ok(bezierTo(controls, to));
  }
  if (type === 'ELLIPSE') {
    const data = getKernel2D().getCurve2dEllipseData(c.wrapped);
    if (!data) return fail('ellipse: kernel returned no ellipse data');
    return ellipseArcSegment(cur, to, midSample(c), {
      a: data.majorRadius,
      b: data.minorRadius,
      phi: data.xAxisAngle,
    });
  }
  return fail(`unsupported curve type: ${type}`);
}

const DIRECT_TYPES = new Set(['LINE', 'CIRCLE', 'BEZIER_CURVE', 'ELLIPSE']);

export interface BlueprintContourOptions {
  /** Approximation tolerance for non-SVG curves (bsplines). Default 1e-4. */
  readonly tolerance?: number | undefined;
}

/**
 * Convert a Blueprint outline to a pure-data {@link Contour} for the Profile
 * IR node. One-way and lossy: bsplines are approximated per curve (SVG-
 * compatible pass) and kernel handles never enter the result.
 */
export function blueprintToContour(
  bp: Blueprint,
  options?: BlueprintContourOptions
): Result<Contour> {
  const tolerance = options?.tolerance ?? 1e-4;
  const first = bp.curves[0];
  if (!first) return fail('blueprint has no curves');
  const start = p2(first.firstPoint);
  let cur = start;
  const segments: Segment2D[] = [];
  for (const c of bp.curves) {
    const pieces: Curve2D[] = DIRECT_TYPES.has(c.geomType)
      ? [c]
      : approximateAsSvgCompatibleCurve([c], { tolerance, continuity: 'C0', maxSegments: 300 });
    const owned = pieces[0] !== c;
    try {
      // A reversed source curve decomposes into pieces whose parametric order
      // runs against the path; if the head does not chain to the current
      // point, walk the pieces back to front (each piece is itself consumed
      // endpoint-agnostically).
      const head = pieces[0];
      if (
        pieces.length > 1 &&
        head !== undefined &&
        !near(p2(head.firstPoint), cur) &&
        !near(p2(head.lastPoint), cur)
      ) {
        pieces.reverse();
      }
      for (const piece of pieces) {
        const r = consumePiece(piece, cur, segments);
        if (!r.ok) return r;
        cur = r.value;
      }
    } finally {
      if (owned) for (const piece of pieces) piece.delete();
    }
  }
  return ok(contour(start, segments));
}

/** Consume one chained curve piece: append its segment(s) and return the new
 *  current point. */
function consumePiece(piece: Curve2D, cur: Pt, segments: Segment2D[]): Result<Pt> {
  const f = p2(piece.firstPoint);
  const l = p2(piece.lastPoint);
  if (near(f, l) && (piece.geomType === 'CIRCLE' || piece.geomType === 'ELLIPSE')) {
    return splitClosedCurve(piece, segments);
  }
  let to: Pt;
  let reversed: boolean;
  if (near(f, cur)) {
    to = l;
    reversed = false;
  } else if (near(l, cur)) {
    to = f;
    reversed = true;
  } else {
    return fail(`curve is not chained to the current point (${piece.geomType})`);
  }
  const seg = openSegment(piece, cur, to, reversed);
  if (!seg.ok) return seg;
  segments.push(seg.value);
  return ok(to);
}
