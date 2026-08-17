/**
 * Canned profile builders matching the brepjs-bim parametric profile set
 * (IfcProfileDef vocabulary). Parameter names mirror the bim specs 1:1 so a
 * downstream adapter can desugar spec -> node without translation. Every
 * profile is bounding-box centered at the origin in the XY plane; fillet
 * radii from the specs are not yet modeled (sharp sections).
 */

import { profile } from './builders.js';
import { contour, lineTo, arcTo, ellipseArcTo, type Contour } from './segments.js';
import type { ProfileNode } from './types.js';

type Pt2 = readonly [number, number];

/** Closed polyline contour from points, shifted so the bounding box centers
 *  on the origin. */
function centeredPoly(points: ReadonlyArray<Pt2>): Contour {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const shifted = points.map(([x, y]) => [x - cx, y - cy] as const);
  const first = shifted[0] ?? [0, 0];
  return contour(
    first,
    shifted.slice(1).map((p) => lineTo(p))
  );
}

function circleContour(radius: number, cx = 0, cy = 0): Contour {
  return contour(
    [cx - radius, cy],
    [arcTo([cx + radius, cy], radius), arcTo([cx - radius, cy], radius)]
  );
}

export function rectangularProfile(width: number, height: number): ProfileNode {
  const hw = width / 2;
  const hh = height / 2;
  return profile(
    centeredPoly([
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ])
  );
}

export function circularProfile(radius: number): ProfileNode {
  return profile(circleContour(radius));
}

export interface IBeamParams {
  readonly overallWidth: number;
  readonly overallDepth: number;
  readonly flangeThickness: number;
  readonly webThickness: number;
}

export function iBeamProfile(p: IBeamParams): ProfileNode {
  const w = p.overallWidth;
  const d = p.overallDepth;
  const tf = p.flangeThickness;
  const tw = p.webThickness;
  const wx0 = (w - tw) / 2;
  const wx1 = (w + tw) / 2;
  return profile(
    centeredPoly([
      [0, 0],
      [w, 0],
      [w, tf],
      [wx1, tf],
      [wx1, d - tf],
      [w, d - tf],
      [w, d],
      [0, d],
      [0, d - tf],
      [wx0, d - tf],
      [wx0, tf],
      [0, tf],
    ])
  );
}

export interface AsymmetricIParams {
  readonly overallDepth: number;
  readonly webThickness: number;
  readonly topFlangeWidth: number;
  readonly topFlangeThickness: number;
  readonly bottomFlangeWidth: number;
  readonly bottomFlangeThickness: number;
}

export function asymmetricIProfile(p: AsymmetricIParams): ProfileNode {
  const d = p.overallDepth;
  const tw = p.webThickness;
  const bw = p.bottomFlangeWidth;
  const bt = p.bottomFlangeThickness;
  const uw = p.topFlangeWidth;
  const ut = p.topFlangeThickness;
  const half = Math.max(bw, uw) / 2;
  return profile(
    centeredPoly([
      [half - bw / 2, 0],
      [half + bw / 2, 0],
      [half + bw / 2, bt],
      [half + tw / 2, bt],
      [half + tw / 2, d - ut],
      [half + uw / 2, d - ut],
      [half + uw / 2, d],
      [half - uw / 2, d],
      [half - uw / 2, d - ut],
      [half - tw / 2, d - ut],
      [half - tw / 2, bt],
      [half - bw / 2, bt],
    ])
  );
}

export interface LShapeParams {
  readonly depth: number;
  readonly width: number;
  readonly legThickness: number;
}

export function lShapeProfile(p: LShapeParams): ProfileNode {
  const t = p.legThickness;
  return profile(
    centeredPoly([
      [0, 0],
      [p.width, 0],
      [p.width, t],
      [t, t],
      [t, p.depth],
      [0, p.depth],
    ])
  );
}

export interface TShapeParams {
  readonly depth: number;
  readonly flangeWidth: number;
  readonly webThickness: number;
  readonly flangeThickness: number;
}

export function tShapeProfile(p: TShapeParams): ProfileNode {
  const b = p.flangeWidth;
  const d = p.depth;
  const tf = p.flangeThickness;
  const tw = p.webThickness;
  return profile(
    centeredPoly([
      [(b - tw) / 2, 0],
      [(b + tw) / 2, 0],
      [(b + tw) / 2, d - tf],
      [b, d - tf],
      [b, d],
      [0, d],
      [0, d - tf],
      [(b - tw) / 2, d - tf],
    ])
  );
}

export interface UShapeParams {
  readonly depth: number;
  readonly flangeWidth: number;
  readonly webThickness: number;
  readonly flangeThickness: number;
}

export function uShapeProfile(p: UShapeParams): ProfileNode {
  const b = p.flangeWidth;
  const d = p.depth;
  const tf = p.flangeThickness;
  const tw = p.webThickness;
  return profile(
    centeredPoly([
      [0, 0],
      [b, 0],
      [b, tf],
      [tw, tf],
      [tw, d - tf],
      [b, d - tf],
      [b, d],
      [0, d],
    ])
  );
}

export interface ZShapeParams {
  readonly depth: number;
  readonly flangeWidth: number;
  readonly webThickness: number;
  readonly flangeThickness: number;
}

export function zShapeProfile(p: ZShapeParams): ProfileNode {
  // Matches the brepjs-bim Z_SHAPE contract: flangeWidth reaches from the web
  // CENTER to the flange tip (each flange extends (flangeWidth - web)/2 past
  // the web), bottom flange to -X, top flange to +X.
  const halfFw = p.flangeWidth / 2;
  const halfD = p.depth / 2;
  const halfWeb = p.webThickness / 2;
  const ft = p.flangeThickness;
  return profile(
    centeredPoly([
      [-halfFw, -halfD],
      [halfWeb, -halfD],
      [halfWeb, halfD - ft],
      [halfFw, halfD - ft],
      [halfFw, halfD],
      [-halfWeb, halfD],
      [-halfWeb, -halfD + ft],
      [-halfFw, -halfD + ft],
    ])
  );
}

export interface CShapeParams {
  readonly depth: number;
  readonly width: number;
  readonly wallThickness: number;
  readonly girth: number;
}

export function cShapeProfile(p: CShapeParams): ProfileNode {
  const b = p.width;
  const d = p.depth;
  const t = p.wallThickness;
  const g = p.girth;
  return profile(
    centeredPoly([
      [0, 0],
      [b, 0],
      [b, g],
      [b - t, g],
      [b - t, t],
      [t, t],
      [t, d - t],
      [b - t, d - t],
      [b - t, d - g],
      [b, d - g],
      [b, d],
      [0, d],
    ])
  );
}

export function ellipseProfile(semiAxis1: number, semiAxis2: number): ProfileNode {
  const a = semiAxis1;
  return profile(
    contour([-a, 0], [ellipseArcTo([a, 0], [a, semiAxis2]), ellipseArcTo([-a, 0], [a, semiAxis2])])
  );
}

export interface TrapeziumParams {
  readonly bottomXDim: number;
  readonly topXDim: number;
  readonly yDim: number;
  readonly topXOffset: number;
}

export function trapeziumProfile(p: TrapeziumParams): ProfileNode {
  // Matches the brepjs-bim TRAPEZIUM contract: bottom edge centered on the
  // origin, top edge centered at topXOffset (an offset of centers, not of
  // left corners) — deliberately NOT bbox-recentered.
  const halfB = p.bottomXDim / 2;
  const halfY = p.yDim / 2;
  const topLeft = -p.topXDim / 2 + p.topXOffset;
  const topRight = p.topXDim / 2 + p.topXOffset;
  return profile(
    contour(
      [-halfB, -halfY],
      [lineTo([halfB, -halfY]), lineTo([topRight, halfY]), lineTo([topLeft, halfY])]
    )
  );
}

export interface RectangleHollowParams {
  readonly xDim: number;
  readonly yDim: number;
  readonly wallThickness: number;
}

export function rectangleHollowProfile(p: RectangleHollowParams): ProfileNode {
  const hx = p.xDim / 2;
  const hy = p.yDim / 2;
  const t = p.wallThickness;
  const outer = centeredPoly([
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ]);
  const inner = centeredPoly([
    [-(hx - t), -(hy - t)],
    [hx - t, -(hy - t)],
    [hx - t, hy - t],
    [-(hx - t), hy - t],
  ]);
  return profile(outer, [inner]);
}

export interface CircleHollowParams {
  readonly radius: number;
  readonly wallThickness: number;
}

export function circleHollowProfile(p: CircleHollowParams): ProfileNode {
  return profile(circleContour(p.radius), [circleContour(p.radius - p.wallThickness)]);
}

export function arbitraryClosedProfile(points: ReadonlyArray<Pt2>): ProfileNode {
  const first = points[0] ?? [0, 0];
  return profile(
    contour(
      first,
      points.slice(1).map((pt) => lineTo(pt))
    )
  );
}

export function arbitraryProfileWithVoids(
  outerPoints: ReadonlyArray<Pt2>,
  voids: ReadonlyArray<ReadonlyArray<Pt2>>
): ProfileNode {
  const first = outerPoints[0] ?? [0, 0];
  return profile(
    contour(
      first,
      outerPoints.slice(1).map((pt) => lineTo(pt))
    ),
    voids.map((v) => {
      const f = v[0] ?? [0, 0];
      return contour(
        f,
        v.slice(1).map((pt) => lineTo(pt))
      );
    })
  );
}
