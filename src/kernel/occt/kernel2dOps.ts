/**
 * 2D geometry operations for OCCT.
 *
 * Provides 2D curve construction, transformation, querying, intersection,
 * bounding box, and 2D-to-3D projection operations.
 *
 * Used by DefaultAdapter to implement Kernel2DCapability.
 */

import type { KernelInstance, KernelShape, KernelType } from '@/kernel/types.js';
import { iterShapes } from './topologyOps.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapContinuity(oc: KernelInstance, continuity: 'C0' | 'C1' | 'C2' | 'C3'): KernelType {
  switch (continuity) {
    case 'C0':
      return oc.GeomAbs_Shape.GeomAbs_C0;
    case 'C1':
      return oc.GeomAbs_Shape.GeomAbs_C1;
    case 'C2':
      return oc.GeomAbs_Shape.GeomAbs_C2;
    case 'C3':
      return oc.GeomAbs_Shape.GeomAbs_C3;
  }
}

// ---------------------------------------------------------------------------
// 2D Handle wrapping
// ---------------------------------------------------------------------------

/** Wrap a raw Geom2d_Curve in a Handle_Geom2d_Curve. */
export function wrapCurve2dHandle(oc: KernelInstance, handle: KernelType): KernelType {
  const inner = handle.get();
  return new oc.Handle_Geom2d_Curve_2(inner);
}

/** Create a Geom2dAdaptor_Curve for algorithmic queries. Caller must delete. */
export function createCurve2dAdaptor(oc: KernelInstance, handle: KernelType): KernelType {
  return new oc.Geom2dAdaptor_Curve_2(handle);
}

// ---------------------------------------------------------------------------
// 2D Point/Vector factories
// ---------------------------------------------------------------------------

export function createPoint2d(oc: KernelInstance, x: number, y: number): KernelType {
  return new oc.gp_Pnt2d_3(x, y);
}

export function createDirection2d(oc: KernelInstance, x: number, y: number): KernelType {
  return new oc.gp_Dir2d_5(x, y);
}

export function createVector2d(oc: KernelInstance, x: number, y: number): KernelType {
  return new oc.gp_Vec2d_4(x, y);
}

export function createAxis2d(
  oc: KernelInstance,
  px: number,
  py: number,
  dx: number,
  dy: number
): KernelType {
  const pnt = new oc.gp_Pnt2d_3(px, py);
  const dir = new oc.gp_Dir2d_5(dx, dy);
  const axis = new oc.gp_Ax2d_2(pnt, dir);
  pnt.delete();
  dir.delete();
  return axis;
}

// ---------------------------------------------------------------------------
// 2D Curve construction
// ---------------------------------------------------------------------------

export function makeLine2d(
  oc: KernelInstance,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): KernelType {
  const p1 = new oc.gp_Pnt2d_3(x1, y1);
  const p2 = new oc.gp_Pnt2d_3(x2, y2);
  const maker = new oc.GCE2d_MakeSegment_1(p1, p2);
  const curve = maker.Value();
  maker.delete();
  p1.delete();
  p2.delete();
  return curve;
}

export function makeCircle2d(
  oc: KernelInstance,
  cx: number,
  cy: number,
  radius: number,
  sense = true
): KernelType {
  const center = new oc.gp_Pnt2d_3(cx, cy);
  const maker = new oc.GCE2d_MakeCircle_7(center, radius, sense);
  const curve = maker.Value();
  maker.delete();
  center.delete();
  return curve;
}

export function makeArc2dThreePoints(
  oc: KernelInstance,
  x1: number,
  y1: number,
  xm: number,
  ym: number,
  x2: number,
  y2: number
): KernelType {
  const p1 = new oc.gp_Pnt2d_3(x1, y1);
  const pm = new oc.gp_Pnt2d_3(xm, ym);
  const p2 = new oc.gp_Pnt2d_3(x2, y2);
  const maker = new oc.GCE2d_MakeArcOfCircle_4(p1, pm, p2);
  const curve = maker.Value();
  maker.delete();
  p1.delete();
  pm.delete();
  p2.delete();
  return curve;
}

export function makeArc2dTangent(
  oc: KernelInstance,
  startX: number,
  startY: number,
  tangentX: number,
  tangentY: number,
  endX: number,
  endY: number
): KernelType {
  const start = new oc.gp_Pnt2d_3(startX, startY);
  const tangent = new oc.gp_Vec2d_4(tangentX, tangentY);
  const end = new oc.gp_Pnt2d_3(endX, endY);
  const maker = new oc.GCE2d_MakeArcOfCircle_5(start, tangent, end);
  const curve = maker.Value();
  maker.delete();
  start.delete();
  tangent.delete();
  end.delete();
  return curve;
}

export function makeEllipse2d(
  oc: KernelInstance,
  cx: number,
  cy: number,
  majorRadius: number,
  minorRadius: number,
  xDirX = 1,
  xDirY = 0,
  sense = true
): KernelType {
  const center = new oc.gp_Pnt2d_3(cx, cy);
  const dir = new oc.gp_Dir2d_5(xDirX, xDirY);
  const ax = new oc.gp_Ax2d_2(center, dir);
  const elips = new oc.gp_Elips2d_2(ax, majorRadius, minorRadius, sense);
  const maker = new oc.GCE2d_MakeEllipse_1(elips);
  const curve = maker.Value();
  maker.delete();
  elips.delete();
  ax.delete();
  dir.delete();
  center.delete();
  return curve;
}

export function makeEllipseArc2d(
  oc: KernelInstance,
  cx: number,
  cy: number,
  majorRadius: number,
  minorRadius: number,
  startAngle: number,
  endAngle: number,
  xDirX = 1,
  xDirY = 0,
  sense = true
): KernelType {
  const center = new oc.gp_Pnt2d_3(cx, cy);
  const dir = new oc.gp_Dir2d_5(xDirX, xDirY);
  const ax = new oc.gp_Ax2d_2(center, dir);
  const elips = new oc.gp_Elips2d_2(ax, majorRadius, minorRadius, true);
  const maker = new oc.GCE2d_MakeArcOfEllipse_1(elips, startAngle, endAngle, sense);
  const curve = maker.Value();
  maker.delete();
  elips.delete();
  ax.delete();
  dir.delete();
  center.delete();
  return curve;
}

export function makeBezier2d(oc: KernelInstance, points: [number, number][]): KernelType {
  const arr = new oc.TColgp_Array1OfPnt2d_2(1, points.length);
  for (let i = 0; i < points.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- loop index within bounds
    const p = points[i]!;
    const gpPnt = new oc.gp_Pnt2d_3(p[0], p[1]);
    arr.SetValue_1(i + 1, gpPnt);
    gpPnt.delete();
  }

  const bezier = new oc.Geom2d_BezierCurve_1(arr);
  arr.delete();

  return new oc.Handle_Geom2d_Curve_2(bezier);
}

export function makeBSpline2d(
  oc: KernelInstance,
  points: [number, number][],
  options: {
    degMin?: number;
    degMax?: number;
    continuity?: 'C0' | 'C1' | 'C2' | 'C3';
    tolerance?: number;
    smoothing?: [number, number, number] | null;
  } = {}
): KernelType {
  const { degMin = 1, degMax = 3, continuity = 'C2', tolerance = 1e-3, smoothing = null } = options;

  const pnts = new oc.TColgp_Array1OfPnt2d_2(1, points.length);
  for (let i = 0; i < points.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- loop index within bounds
    const p = points[i]!;
    const gpPnt = new oc.gp_Pnt2d_3(p[0], p[1]);
    pnts.SetValue_1(i + 1, gpPnt);
    gpPnt.delete();
  }

  let splineBuilder: KernelType;
  if (smoothing) {
    splineBuilder = new oc.Geom2dAPI_PointsToBSpline_6(
      pnts,
      smoothing[0],
      smoothing[1],
      smoothing[2],
      degMax,
      mapContinuity(oc, continuity),
      tolerance
    );
  } else {
    splineBuilder = new oc.Geom2dAPI_PointsToBSpline_2(
      pnts,
      degMin,
      degMax,
      mapContinuity(oc, continuity),
      tolerance
    );
  }
  pnts.delete();

  if (!splineBuilder.IsDone()) {
    splineBuilder.delete();
    throw new Error('B-spline 2D approximation failed');
  }

  const curve = splineBuilder.Curve();
  splineBuilder.delete();
  return curve;
}

// ---------------------------------------------------------------------------
// 2D Curve queries
// ---------------------------------------------------------------------------

export function evaluateCurve2d(
  _oc: KernelInstance,
  curve: KernelType,
  param: number
): [number, number] {
  const inner = curve.get();
  const p = inner.Value(param);
  const result: [number, number] = [p.X(), p.Y()];
  p.delete();
  return result;
}

export function evaluateCurve2dD1(
  oc: KernelInstance,
  curve: KernelType,
  param: number
): { point: [number, number]; tangent: [number, number] } {
  const inner = curve.get();
  const pnt = new oc.gp_Pnt2d_1();
  const vec = new oc.gp_Vec2d_1();
  inner.D1(param, pnt, vec);
  const result = {
    point: [pnt.X(), pnt.Y()] as [number, number],
    tangent: [vec.X(), vec.Y()] as [number, number],
  };
  pnt.delete();
  vec.delete();
  return result;
}

export function getCurve2dBounds(
  _oc: KernelInstance,
  curve: KernelType
): { first: number; last: number } {
  const inner = curve.get();
  return {
    first: inner.FirstParameter(),
    last: inner.LastParameter(),
  };
}

export function getCurve2dType(oc: KernelInstance, curve: KernelType): string {
  const adaptor = new oc.Geom2dAdaptor_Curve_2(curve);
  const typeVal = adaptor.GetType();
  adaptor.delete();

  // OCCT Emscripten returns enum objects with a .value property, not raw numbers
  const idx = typeof typeVal === 'number' ? typeVal : Number(typeVal?.value ?? typeVal);

  // Map GeomAbs_CurveType enum to string
  const typeMap: Record<number, string> = {
    0: 'LINE',
    1: 'CIRCLE',
    2: 'ELLIPSE',
    3: 'HYPERBOLA',
    4: 'PARABOLA',
    5: 'BEZIER_CURVE',
    6: 'BSPLINE_CURVE',
    7: 'OFFSET_CURVE',
    8: 'OTHER_CURVE',
  };
  return typeMap[idx] ?? 'OTHER_CURVE';
}

// ---------------------------------------------------------------------------
// 2D Curve modification
// ---------------------------------------------------------------------------

export function trimCurve2d(
  oc: KernelInstance,
  curve: KernelType,
  start: number,
  end: number
): KernelType {
  const trimmed = new oc.Geom2d_TrimmedCurve(curve, start, end, true, true);
  return new oc.Handle_Geom2d_Curve_2(trimmed);
}

export function reverseCurve2d(_oc: KernelInstance, curve: KernelType): void {
  curve.get().Reverse();
}

export function copyCurve2d(_oc: KernelInstance, curve: KernelType): KernelType {
  return curve.get().Copy();
}

export function offsetCurve2d(oc: KernelInstance, curve: KernelType, offset: number): KernelType {
  const offsetCurve = new oc.Geom2d_OffsetCurve_1(curve, offset, true);
  return new oc.Handle_Geom2d_Curve_2(offsetCurve);
}

// ---------------------------------------------------------------------------
// 2D Transformations
// ---------------------------------------------------------------------------

function transformCurve(oc: KernelInstance, curve: KernelType, trsf: KernelType): KernelType {
  const gtrsf = new oc.gp_GTrsf2d_2(trsf);
  const result = oc.GeomLib_GTransform(curve, gtrsf);
  gtrsf.delete();
  trsf.delete();
  return result;
}

export function translateCurve2d(
  oc: KernelInstance,
  curve: KernelType,
  dx: number,
  dy: number
): KernelType {
  const v = new oc.gp_Vec2d_4(dx, dy);
  const trsf = new oc.gp_Trsf2d_1();
  trsf.SetTranslation_1(v);
  v.delete();
  return transformCurve(oc, curve, trsf);
}

export function rotateCurve2d(
  oc: KernelInstance,
  curve: KernelType,
  angle: number,
  cx: number,
  cy: number
): KernelType {
  const center = new oc.gp_Pnt2d_3(cx, cy);
  const trsf = new oc.gp_Trsf2d_1();
  trsf.SetRotation(center, angle);
  center.delete();
  return transformCurve(oc, curve, trsf);
}

export function scaleCurve2d(
  oc: KernelInstance,
  curve: KernelType,
  factor: number,
  cx: number,
  cy: number
): KernelType {
  const center = new oc.gp_Pnt2d_3(cx, cy);
  const trsf = new oc.gp_Trsf2d_1();
  trsf.SetScale(center, factor);
  center.delete();
  return transformCurve(oc, curve, trsf);
}

export function mirrorCurve2dAtPoint(
  oc: KernelInstance,
  curve: KernelType,
  cx: number,
  cy: number
): KernelType {
  const center = new oc.gp_Pnt2d_3(cx, cy);
  const trsf = new oc.gp_Trsf2d_1();
  trsf.SetMirror_1(center);
  center.delete();
  return transformCurve(oc, curve, trsf);
}

export function mirrorCurve2dAcrossAxis(
  oc: KernelInstance,
  curve: KernelType,
  originX: number,
  originY: number,
  dirX: number,
  dirY: number
): KernelType {
  const origin = new oc.gp_Pnt2d_3(originX, originY);
  const dir = new oc.gp_Dir2d_5(dirX, dirY);
  const ax = new oc.gp_Ax2d_2(origin, dir);
  const trsf = new oc.gp_Trsf2d_1();
  trsf.SetMirror_2(ax);
  ax.delete();
  dir.delete();
  origin.delete();
  return transformCurve(oc, curve, trsf);
}

export function affinityTransform2d(
  oc: KernelInstance,
  curve: KernelType,
  axisOriginX: number,
  axisOriginY: number,
  axisDirX: number,
  axisDirY: number,
  ratio: number
): KernelType {
  const origin = new oc.gp_Pnt2d_3(axisOriginX, axisOriginY);
  const dir = new oc.gp_Dir2d_5(axisDirX, axisDirY);
  const ax = new oc.gp_Ax2d_2(origin, dir);
  const gtrsf = new oc.gp_GTrsf2d_1();
  gtrsf.SetAffinity(ax, ratio);
  ax.delete();
  dir.delete();
  origin.delete();
  const result = oc.GeomLib_GTransform(curve, gtrsf);
  gtrsf.delete();
  return result;
}

// ---------------------------------------------------------------------------
// 2D General transforms (gp_GTrsf2d)
// ---------------------------------------------------------------------------

/** Helper: wrap a gp_Trsf2d in a gp_GTrsf2d and delete the trsf. */
function wrapTrsf2dAsGTrsf2d(oc: KernelInstance, trsf: KernelType): KernelType {
  const gtrsf = new oc.gp_GTrsf2d_2(trsf);
  trsf.delete();
  return gtrsf;
}

export function createIdentityGTrsf2d(oc: KernelInstance): KernelType {
  return new oc.gp_GTrsf2d_1();
}

export function createAffinityGTrsf2d(
  oc: KernelInstance,
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  ratio: number
): KernelType {
  const origin = new oc.gp_Pnt2d_3(originX, originY);
  const dir = new oc.gp_Dir2d_5(dirX, dirY);
  const ax = new oc.gp_Ax2d_2(origin, dir);
  const gtrsf = new oc.gp_GTrsf2d_1();
  gtrsf.SetAffinity(ax, ratio);
  ax.delete();
  dir.delete();
  origin.delete();
  return gtrsf;
}

export function createTranslationGTrsf2d(oc: KernelInstance, dx: number, dy: number): KernelType {
  const v = new oc.gp_Vec2d_4(dx, dy);
  const trsf = new oc.gp_Trsf2d_1();
  trsf.SetTranslation_1(v);
  v.delete();
  return wrapTrsf2dAsGTrsf2d(oc, trsf);
}

export function createMirrorGTrsf2d(
  oc: KernelInstance,
  cx: number,
  cy: number,
  mode: 'point' | 'axis',
  originX = 0,
  originY = 0,
  dirX = 1,
  dirY = 0
): KernelType {
  const trsf = new oc.gp_Trsf2d_1();
  if (mode === 'point') {
    const p = new oc.gp_Pnt2d_3(cx, cy);
    trsf.SetMirror_1(p);
    p.delete();
  } else {
    const p = new oc.gp_Pnt2d_3(originX, originY);
    const dir = new oc.gp_Dir2d_5(dirX, dirY);
    const ax = new oc.gp_Ax2d_2(p, dir);
    trsf.SetMirror_2(ax);
    ax.delete();
    dir.delete();
    p.delete();
  }
  return wrapTrsf2dAsGTrsf2d(oc, trsf);
}

export function createRotationGTrsf2d(
  oc: KernelInstance,
  angle: number,
  cx: number,
  cy: number
): KernelType {
  const p = new oc.gp_Pnt2d_3(cx, cy);
  const trsf = new oc.gp_Trsf2d_1();
  trsf.SetRotation(p, angle);
  p.delete();
  return wrapTrsf2dAsGTrsf2d(oc, trsf);
}

export function createScaleGTrsf2d(
  oc: KernelInstance,
  factor: number,
  cx: number,
  cy: number
): KernelType {
  const p = new oc.gp_Pnt2d_3(cx, cy);
  const trsf = new oc.gp_Trsf2d_1();
  trsf.SetScale(p, factor);
  p.delete();
  return wrapTrsf2dAsGTrsf2d(oc, trsf);
}

export function setGTrsf2dTranslationPart(
  oc: KernelInstance,
  gtrsf: KernelType,
  dx: number,
  dy: number
): void {
  const xy = new oc.gp_XY_2(dx, dy);
  gtrsf.SetTranslationPart(xy);
  xy.delete();
}

export function multiplyGTrsf2d(_oc: KernelInstance, base: KernelType, other: KernelType): void {
  base.Multiply(other);
}

export function transformCurve2dGeneral(
  oc: KernelInstance,
  curve: KernelType,
  gtrsf: KernelType
): KernelType {
  return oc.GeomLib_GTransform(curve, gtrsf);
}

// ---------------------------------------------------------------------------
// 2D Intersection & distance
// ---------------------------------------------------------------------------

export function intersectCurves2d(
  oc: KernelInstance,
  c1: KernelType,
  c2: KernelType,
  tolerance: number
): { points: [number, number][]; segments: KernelType[] } {
  const intersector = new oc.Geom2dAPI_InterCurveCurve_1();
  intersector.Init_1(c1, c2, tolerance);

  const points: [number, number][] = [];
  const nPoints = intersector.NbPoints();
  for (let i = 1; i <= nPoints; i++) {
    const p = intersector.Point(i);
    points.push([p.X(), p.Y()]);
    p.delete();
  }

  const segments: KernelType[] = [];
  const nSegments = intersector.NbSegments();
  for (let i = 1; i <= nSegments; i++) {
    const h1 = new oc.Handle_Geom2d_Curve_1();
    const h2 = new oc.Handle_Geom2d_Curve_1();
    try {
      intersector.Segment(i, h1, h2);
      segments.push(h1);
      h2.delete();
    } catch {
      // Known OCCT bug: NbSegments() may report unfetchable segments
      h1.delete();
      h2.delete();
    }
  }

  intersector.delete();
  return { points, segments };
}

export function projectPointOnCurve2d(
  oc: KernelInstance,
  curve: KernelType,
  x: number,
  y: number
): { param: number; distance: number } | null {
  const pnt = new oc.gp_Pnt2d_3(x, y);
  const projector = new oc.Geom2dAPI_ProjectPointOnCurve_2(pnt, curve);
  pnt.delete();

  let result: { param: number; distance: number } | null = null;
  try {
    if (projector.NbPoints() > 0) {
      result = {
        param: projector.LowerDistanceParameter(),
        distance: projector.LowerDistance(),
      };
    }
  } catch {
    // Projection failed — return null
  }

  projector.delete();
  return result;
}

export function distanceBetweenCurves2d(
  oc: KernelInstance,
  c1: KernelType,
  c2: KernelType,
  p1Start: number,
  p1End: number,
  p2Start: number,
  p2End: number
): number {
  const extrema = new oc.Geom2dAPI_ExtremaCurveCurve(c1, c2, p1Start, p1End, p2Start, p2End);

  let distance: number;
  try {
    distance = extrema.LowerDistance();
  } catch {
    distance = Infinity;
  }

  extrema.delete();
  return distance;
}

// ---------------------------------------------------------------------------
// 2D Approximation
// ---------------------------------------------------------------------------

export function approximateCurve2dAsBSpline(
  oc: KernelInstance,
  curve: KernelType,
  tolerance: number,
  continuity: 'C0' | 'C1' | 'C2' | 'C3',
  maxSegments: number
): KernelType {
  const adaptor = new oc.Geom2dAdaptor_Curve_2(curve);
  const convert = new oc.Geom2dConvert_ApproxCurve_2(
    adaptor.ShallowCopy(),
    tolerance,
    mapContinuity(oc, continuity),
    maxSegments,
    3
  );
  const result = convert.Curve();
  convert.delete();
  adaptor.delete();
  return result;
}

export function decomposeBSpline2dToBeziers(oc: KernelInstance, curve: KernelType): KernelType[] {
  const adaptor = new oc.Geom2dAdaptor_Curve_2(curve);
  const handle = adaptor.BSpline();
  adaptor.delete();

  const convert = new oc.Geom2dConvert_BSplineCurveToBezierCurve_1(handle);
  const arcs: KernelType[] = [];
  const nArcs = convert.NbArcs();
  for (let i = 1; i <= nArcs; i++) {
    arcs.push(convert.Arc(i));
  }
  convert.delete();
  return arcs;
}

// ---------------------------------------------------------------------------
// 2D Bounding box
// ---------------------------------------------------------------------------

export function createBoundingBox2d(oc: KernelInstance): KernelType {
  return new oc.Bnd_Box2d();
}

export function addCurveToBBox2d(
  oc: KernelInstance,
  bbox: KernelType,
  curve: KernelType,
  tolerance: number
): void {
  oc.BndLib_Add2dCurve.Add_3(curve, tolerance, bbox);
}

export function getBBox2dBounds(
  _oc: KernelInstance,
  bbox: KernelType
): { xMin: number; yMin: number; xMax: number; yMax: number } {
  return {
    xMin: bbox.GetXMin(),
    yMin: bbox.GetYMin(),
    xMax: bbox.GetXMax(),
    yMax: bbox.GetYMax(),
  };
}

export function mergeBBox2d(_oc: KernelInstance, target: KernelType, other: KernelType): void {
  target.Add_1(other);
}

export function isBBox2dOut(_oc: KernelInstance, a: KernelType, b: KernelType): boolean {
  return a.IsOut_4(b);
}

export function isBBox2dOutPoint(
  oc: KernelInstance,
  bbox: KernelType,
  x: number,
  y: number
): boolean {
  const pnt = new oc.gp_Pnt2d_3(x, y);
  const result = bbox.IsOut_1(pnt);
  pnt.delete();
  return result;
}

// ---------------------------------------------------------------------------
// 2D Type extraction
// ---------------------------------------------------------------------------

export function getCurve2dCircleData(
  oc: KernelInstance,
  curve: KernelType
): { cx: number; cy: number; radius: number; isDirect: boolean } | null {
  const adaptor = new oc.Geom2dAdaptor_Curve_2(curve);
  const typeVal = adaptor.GetType();
  // OCCT Emscripten returns enum objects with .value property
  const typeIdx = typeof typeVal === 'number' ? typeVal : Number(typeVal?.value ?? typeVal);
  // 1 = GeomAbs_Circle
  if (typeIdx !== 1) {
    adaptor.delete();
    return null;
  }
  const circle = adaptor.Circle();
  const center = circle.Location();
  const result = {
    cx: center.X(),
    cy: center.Y(),
    radius: circle.Radius(),
    isDirect: circle.IsDirect(),
  };
  center.delete();
  circle.delete();
  adaptor.delete();
  return result;
}

export function getCurve2dEllipseData(
  oc: KernelInstance,
  curve: KernelType
): { majorRadius: number; minorRadius: number; xAxisAngle: number; isDirect: boolean } | null {
  const adaptor = new oc.Geom2dAdaptor_Curve_2(curve);
  const typeVal = adaptor.GetType();
  const typeIdx = typeof typeVal === 'number' ? typeVal : Number(typeVal?.value ?? typeVal);
  // 2 = GeomAbs_Ellipse
  if (typeIdx !== 2) {
    adaptor.delete();
    return null;
  }
  const elips = adaptor.Ellipse();
  const xDir = elips.XAxis().Direction();
  const result = {
    majorRadius: elips.MajorRadius(),
    minorRadius: elips.MinorRadius(),
    xAxisAngle: Math.atan2(xDir.Y(), xDir.X()),
    isDirect: elips.IsDirect(),
  };
  xDir.delete();
  elips.delete();
  adaptor.delete();
  return result;
}

export function getCurve2dBezierPoles(
  oc: KernelInstance,
  curve: KernelType
): [number, number][] | null {
  const adaptor = new oc.Geom2dAdaptor_Curve_2(curve);
  const typeVal = adaptor.GetType();
  const typeIdx = typeof typeVal === 'number' ? typeVal : Number(typeVal?.value ?? typeVal);
  // 5 = GeomAbs_BezierCurve
  if (typeIdx !== 5) {
    adaptor.delete();
    return null;
  }
  const bezier = adaptor.Bezier().get();
  const poles: [number, number][] = [];
  const nbPoles = bezier.NbPoles();
  for (let i = 1; i <= nbPoles; i++) {
    const p = bezier.Pole(i);
    poles.push([p.X(), p.Y()]);
    p.delete();
  }
  adaptor.delete();
  return poles;
}

export function getCurve2dBezierDegree(oc: KernelInstance, curve: KernelType): number | null {
  const adaptor = new oc.Geom2dAdaptor_Curve_2(curve);
  const typeVal = adaptor.GetType();
  const typeIdx = typeof typeVal === 'number' ? typeVal : Number(typeVal?.value ?? typeVal);
  // 5 = GeomAbs_BezierCurve
  if (typeIdx !== 5) {
    adaptor.delete();
    return null;
  }
  const bezier = adaptor.Bezier().get();
  const degree = bezier.Degree();
  adaptor.delete();
  return degree;
}

export function getCurve2dBSplineData(
  oc: KernelInstance,
  curve: KernelType
): {
  poles: [number, number][];
  knots: number[];
  multiplicities: number[];
  degree: number;
  isPeriodic: boolean;
} | null {
  const adaptor = new oc.Geom2dAdaptor_Curve_2(curve);
  const type = adaptor.GetType();
  // 6 = GeomAbs_BSplineCurve
  if (type !== 6) {
    adaptor.delete();
    return null;
  }
  const bspline = adaptor.BSpline().get();

  const poles: [number, number][] = [];
  const polesArr = bspline.Poles_2();
  for (let i = polesArr.Lower(); i <= polesArr.Upper(); i++) {
    const p = polesArr.Value(i);
    poles.push([p.X(), p.Y()]);
  }

  const knots: number[] = [];
  const knotsArr = bspline.Knots_2();
  for (let i = knotsArr.Lower(); i <= knotsArr.Upper(); i++) {
    knots.push(knotsArr.Value(i));
  }

  const multiplicities: number[] = [];
  const multsArr = bspline.Multiplicities_2();
  for (let i = multsArr.Lower(); i <= multsArr.Upper(); i++) {
    multiplicities.push(multsArr.Value(i));
  }

  const result = {
    poles,
    knots,
    multiplicities,
    degree: bspline.Degree(),
    isPeriodic: bspline.IsPeriodic(),
  };
  adaptor.delete();
  return result;
}

// ---------------------------------------------------------------------------
// 2D Serialization
// ---------------------------------------------------------------------------

export function serializeCurve2d(oc: KernelInstance, curve: KernelType): string {
  return oc.GeomToolsWrapper.Write(curve);
}

export function deserializeCurve2d(oc: KernelInstance, data: string): KernelType {
  return oc.GeomToolsWrapper.Read(data);
}

// ---------------------------------------------------------------------------
// 2D Curve splitting
// ---------------------------------------------------------------------------

export function splitCurve2d(
  oc: KernelInstance,
  curve: KernelType,
  params: number[]
): KernelType[] {
  const inner = curve.get();
  const first = inner.FirstParameter();
  const last = inner.LastParameter();

  const sorted = [...params].sort((a, b) => a - b);
  const boundaries: [number, number][] = [];

  let prev = first;
  for (const p of sorted) {
    if (p > first && p < last) {
      boundaries.push([prev, p]);
      prev = p;
    }
  }
  boundaries.push([prev, last]);

  // Detect curve type via adaptor for type-specific splitting
  const adaptor = new oc.Geom2dAdaptor_Curve_2(curve);
  const geomType = adaptor.GetType() as number;

  const results = boundaries.map(([start, end]) => {
    // 5 = GeomAbs_BezierCurve
    if (geomType === 5) {
      const curveCopy = new oc.Geom2d_BezierCurve_1(adaptor.Bezier().get().Poles_2());
      curveCopy.Segment(start, end);
      return new oc.Handle_Geom2d_Curve_2(curveCopy);
    }
    // 6 = GeomAbs_BSplineCurve
    if (geomType === 6) {
      const bspline = adaptor.BSpline().get();
      const curveCopy = new oc.Geom2d_BSplineCurve_1(
        bspline.Poles_2(),
        bspline.Knots_2(),
        bspline.Multiplicities_2(),
        bspline.Degree(),
        bspline.IsPeriodic()
      );
      curveCopy.Segment(start, end, 1e-9);
      return new oc.Handle_Geom2d_Curve_2(curveCopy);
    }
    // Default: TrimmedCurve
    const trimmed = new oc.Geom2d_TrimmedCurve(curve, start, end, true, true);
    return new oc.Handle_Geom2d_Curve_2(trimmed);
  });

  adaptor.delete();
  return results;
}

// ---------------------------------------------------------------------------
// 2D -> 3D projection
// ---------------------------------------------------------------------------

export function liftCurve2dToPlane(
  oc: KernelInstance,
  curve: KernelType,
  planeOrigin: [number, number, number],
  planeZ: [number, number, number],
  planeX: [number, number, number]
): KernelShape {
  const origin = new oc.gp_Pnt_3(planeOrigin[0], planeOrigin[1], planeOrigin[2]);
  const zDir = new oc.gp_Dir_5(planeZ[0], planeZ[1], planeZ[2]);
  const xDir = new oc.gp_Dir_5(planeX[0], planeX[1], planeX[2]);
  const ax = new oc.gp_Ax2_2(origin, zDir, xDir);

  const curve3d = oc.GeomLib_To3d(ax, curve);
  const edgeBuilder = new oc.BRepBuilderAPI_MakeEdge_24(curve3d);
  const edge = edgeBuilder.Edge();

  edgeBuilder.delete();
  curve3d.delete();
  ax.delete();
  xDir.delete();
  zDir.delete();
  origin.delete();
  return edge;
}

export function buildEdgeOnSurface(
  oc: KernelInstance,
  curve: KernelType,
  surface: KernelType
): KernelShape {
  const edgeMaker = new oc.BRepBuilderAPI_MakeEdge_30(curve, surface);
  const edge = edgeMaker.Edge();
  edgeMaker.delete();
  return edge;
}

export function extractSurfaceFromFace(oc: KernelInstance, face: KernelShape): KernelType {
  return oc.BRep_Tool_Surface(face);
}

export function extractCurve2dFromEdge(
  oc: KernelInstance,
  edge: KernelShape,
  face: KernelShape
): KernelType {
  const adaptor = new oc.BRepAdaptor_Curve2d_2(edge, face);
  const curveHandle = adaptor.Curve();
  const first = adaptor.FirstParameter();
  const last = adaptor.LastParameter();
  adaptor.delete();

  const trimmed = new oc.Geom2d_TrimmedCurve(curveHandle, first, last, true, true);
  return new oc.Handle_Geom2d_Curve_2(trimmed);
}

export function buildCurves3d(oc: KernelInstance, wire: KernelShape): void {
  oc.BRepLib_BuildCurves3d(wire);
}

export function fixWireOnFace(
  oc: KernelInstance,
  wire: KernelShape,
  face: KernelShape,
  tolerance: number
): KernelShape {
  const fixer = new oc.ShapeFix_Wire_2(wire, face, tolerance);
  fixer.FixEdgeCurves();
  const result = fixer.Wire();
  fixer.delete();
  return result;
}

// ---------------------------------------------------------------------------
// Surface filling
// ---------------------------------------------------------------------------

export function fillSurface(
  oc: KernelInstance,
  wires: KernelShape[],
  options: {
    order?: number;
    nbPtsOnCur?: number;
    nbIter?: number;
    tol3d?: number;
    tol2d?: number;
    maxDeg?: number;
    maxSeg?: number;
  } = {}
): KernelShape {
  const {
    order = 3,
    nbPtsOnCur = 15,
    nbIter = 2,
    tol3d = 1e-5,
    tol2d = 1e-4,
    maxDeg = 8,
    maxSeg = 9,
  } = options;

  const builder = new oc.BRepOffsetAPI_MakeFilling(
    order,
    nbPtsOnCur,
    nbIter,
    false,
    tol3d,
    tol2d,
    1e-2,
    0.1,
    maxDeg,
    maxSeg
  );

  for (let wi = 0; wi < wires.length; wi++) {
    const edges = iterShapes(oc, wires[wi], 'edge');
    for (const edge of edges) {
      builder.Add_1(edge, oc.GeomAbs_Shape.GeomAbs_C0, wi === 0);
    }
  }

  const progress = new oc.Message_ProgressRange_1();
  builder.Build(progress);
  const shape = builder.Shape();
  builder.delete();
  progress.delete();
  return shape;
}
