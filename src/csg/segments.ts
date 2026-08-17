/**
 * Serializable 2D segment vocabulary — endpoint-parametrized (SVG-style)
 * curve segments shared by the Path node (open spines) and, later, Profile
 * contours. Positions and radii are expressions, so `freeParams` propagates
 * and segment data hashes with the same FNV machinery as every node field.
 */

import {
  asScalarExpr,
  asVec2Expr,
  type Expr,
  type ScalarInput,
  type Vec2Input,
} from './expressions.js';
import { fnvMixString, fnvMixBool, fnvMixInt32, fnvMixHash } from './hash.js';

// ---------------------------------------------------------------------------
// Node-side segment data (expressions, canonicalized flags)
// ---------------------------------------------------------------------------

export interface LineSegment {
  readonly kind: 'Line';
  /** Vec2 endpoint. */
  readonly to: Expr;
}

export interface ArcSegment {
  readonly kind: 'Arc';
  readonly to: Expr;
  readonly radius: Expr;
  readonly largeArc: boolean;
  readonly clockwise: boolean;
}

export interface BezierSegment {
  readonly kind: 'Bezier';
  /** Control poles (SVG Q/C semantics), 1 or 2 entries. */
  readonly controls: readonly Expr[];
  readonly to: Expr;
}

export interface EllipseArcSegment {
  readonly kind: 'EllipseArc';
  readonly to: Expr;
  /** Vec2 (rx, ry). */
  readonly radii: Expr;
  /** Rotation of the ellipse x-axis, degrees (matching Rotate). */
  readonly rotation: Expr;
  readonly largeArc: boolean;
  readonly clockwise: boolean;
}

export type Segment2D = LineSegment | ArcSegment | BezierSegment | EllipseArcSegment;

// ---------------------------------------------------------------------------
// Authoring inputs (plain numbers accepted, flags optional)
// ---------------------------------------------------------------------------

export interface SegmentOptions {
  readonly largeArc?: boolean | undefined;
  readonly clockwise?: boolean | undefined;
}

export interface EllipseArcOptions extends SegmentOptions {
  readonly rotation?: ScalarInput | undefined;
}

export function lineTo(to: Vec2Input): Segment2D {
  return { kind: 'Line', to: asVec2Expr(to) };
}

export function arcTo(to: Vec2Input, radius: ScalarInput, options?: SegmentOptions): Segment2D {
  return {
    kind: 'Arc',
    to: asVec2Expr(to),
    radius: asScalarExpr(radius),
    largeArc: options?.largeArc ?? false,
    clockwise: options?.clockwise ?? false,
  };
}

export function bezierTo(controls: ReadonlyArray<Vec2Input>, to: Vec2Input): Segment2D {
  return { kind: 'Bezier', controls: controls.map(asVec2Expr), to: asVec2Expr(to) };
}

export function ellipseArcTo(
  to: Vec2Input,
  radii: Vec2Input,
  options?: EllipseArcOptions
): Segment2D {
  return {
    kind: 'EllipseArc',
    to: asVec2Expr(to),
    radii: asVec2Expr(radii),
    rotation: asScalarExpr(options?.rotation ?? 0),
    largeArc: options?.largeArc ?? false,
    clockwise: options?.clockwise ?? false,
  };
}

// ---------------------------------------------------------------------------
// Hashing and dependency collection
// ---------------------------------------------------------------------------

export function hashSegments(h0: bigint, segments: readonly Segment2D[]): bigint {
  let h = fnvMixInt32(h0, segments.length);
  const mix = (acc: bigint, e: Expr): bigint => fnvMixHash(acc, e.structuralHash);
  for (const s of segments) {
    h = fnvMixString(h, s.kind);
    h = mix(h, s.to);
    if (s.kind === 'Arc') {
      h = mix(h, s.radius);
      h = fnvMixBool(fnvMixBool(h, s.largeArc), s.clockwise);
    } else if (s.kind === 'Bezier') {
      h = fnvMixInt32(h, s.controls.length);
      for (const c of s.controls) h = mix(h, c);
    } else if (s.kind === 'EllipseArc') {
      h = mix(h, s.radii);
      h = mix(h, s.rotation);
      h = fnvMixBool(fnvMixBool(h, s.largeArc), s.clockwise);
    }
  }
  return h;
}

export function segmentFreeParams(segments: readonly Segment2D[]): Expr[] {
  const out: Expr[] = [];
  for (const s of segments) {
    out.push(s.to);
    if (s.kind === 'Arc') out.push(s.radius);
    else if (s.kind === 'Bezier') out.push(...s.controls);
    else if (s.kind === 'EllipseArc') out.push(s.radii, s.rotation);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Folding (used by optimize)
// ---------------------------------------------------------------------------

export function foldSegment(s: Segment2D, foldExpr: (e: Expr) => Expr): Segment2D {
  switch (s.kind) {
    case 'Line':
      return lineTo(foldExpr(s.to));
    case 'Arc':
      return arcTo(foldExpr(s.to), foldExpr(s.radius), {
        largeArc: s.largeArc,
        clockwise: s.clockwise,
      });
    case 'Bezier':
      return bezierTo(s.controls.map(foldExpr), foldExpr(s.to));
    case 'EllipseArc':
      return ellipseArcTo(foldExpr(s.to), foldExpr(s.radii), {
        rotation: foldExpr(s.rotation),
        largeArc: s.largeArc,
        clockwise: s.clockwise,
      });
  }
}
