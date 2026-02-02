/**
 * Curve and 1D shape functions — functional replacements for _1DShape/Curve methods.
 * All functions accept branded Edge or Wire handles and return plain values.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT adaptor types are untyped
type CurveAdaptor = any;

import { getKernel } from '../kernel/index.js';
import type { Vec3 } from '../core/types.js';
import type { Edge, Wire } from '../core/shapeTypes.js';
import { castShape } from '../core/shapeTypes.js';
import { findCurveType, type CurveType } from '../core/definitionMaps.js';
import { type Result, ok, err, unwrap } from '../core/result.js';
import { typeCastError } from '../core/errors.js';
import { isWire as isWireGuard } from '../core/shapeTypes.js';

// ---------------------------------------------------------------------------
// Internal: adaptor creation
// ---------------------------------------------------------------------------

function getAdaptor(shape: Edge | Wire): CurveAdaptor {
  const oc = getKernel().oc;
  const st = shape.wrapped.ShapeType();
  const e = oc.TopAbs_ShapeEnum;
  if (st === e.TopAbs_WIRE) {
    return new oc.BRepAdaptor_CompCurve_2(shape.wrapped, false);
  }
  return new oc.BRepAdaptor_Curve_2(shape.wrapped);
}

function mapParam(adaptor: CurveAdaptor, t: number): number {
  const first = Number(adaptor.FirstParameter());
  const last = Number(adaptor.LastParameter());
  return first + (last - first) * t;
}

// ---------------------------------------------------------------------------
// Curve properties
// ---------------------------------------------------------------------------

/** Get the geometric curve type of an edge or wire. */
export function getCurveType(shape: Edge | Wire): CurveType {
  const adaptor = getAdaptor(shape);
  const technicalType = adaptor.GetType && adaptor.GetType();
  const result = unwrap(findCurveType(technicalType));
  adaptor.delete();
  return result;
}

/** Get the start point of a curve. */
export function curveStartPoint(shape: Edge | Wire): Vec3 {
  const adaptor = getAdaptor(shape);
  const pnt = adaptor.Value(adaptor.FirstParameter());
  const result: Vec3 = [pnt.X(), pnt.Y(), pnt.Z()];
  pnt.delete();
  adaptor.delete();
  return result;
}

/** Get the end point of a curve. */
export function curveEndPoint(shape: Edge | Wire): Vec3 {
  const adaptor = getAdaptor(shape);
  const pnt = adaptor.Value(adaptor.LastParameter());
  const result: Vec3 = [pnt.X(), pnt.Y(), pnt.Z()];
  pnt.delete();
  adaptor.delete();
  return result;
}

/** Get a point at parameter position (0 = start, 1 = end). */
export function curvePointAt(shape: Edge | Wire, position = 0.5): Vec3 {
  const adaptor = getAdaptor(shape);
  const pnt = adaptor.Value(mapParam(adaptor, position));
  const result: Vec3 = [pnt.X(), pnt.Y(), pnt.Z()];
  pnt.delete();
  adaptor.delete();
  return result;
}

/** Get the tangent vector at parameter position. */
export function curveTangentAt(shape: Edge | Wire, position = 0.5): Vec3 {
  const oc = getKernel().oc;
  const adaptor = getAdaptor(shape);
  const param = mapParam(adaptor, position);

  const tmpPnt = new oc.gp_Pnt_1();
  const tmpVec = new oc.gp_Vec_1();
  adaptor.D1(param, tmpPnt, tmpVec);

  const result: Vec3 = [tmpVec.X(), tmpVec.Y(), tmpVec.Z()];
  tmpPnt.delete();
  tmpVec.delete();
  adaptor.delete();
  return result;
}

/** Get the arc length of an edge or wire. */
export function curveLength(shape: Edge | Wire): number {
  const oc = getKernel().oc;
  const props = new oc.GProp_GProps_1();
  oc.BRepGProp.LinearProperties(shape.wrapped, props, true, false);
  const len = props.Mass();
  props.delete();
  return len;
}

/** Check if the curve is closed. */
export function curveIsClosed(shape: Edge | Wire): boolean {
  const adaptor = getAdaptor(shape);
  const result = adaptor.IsClosed();
  adaptor.delete();
  return result;
}

/** Check if the curve is periodic. */
export function curveIsPeriodic(shape: Edge | Wire): boolean {
  const adaptor = getAdaptor(shape);
  const result = adaptor.IsPeriodic();
  adaptor.delete();
  return result;
}

/** Get the period of a periodic curve. */
export function curvePeriod(shape: Edge | Wire): number {
  const adaptor = getAdaptor(shape);
  const result = adaptor.Period();
  adaptor.delete();
  return result;
}

/** Get the topological orientation of an edge or wire. */
export function getOrientation(shape: Edge | Wire): 'forward' | 'backward' {
  const oc = getKernel().oc;
  const orient = shape.wrapped.Orientation_1();
  return orient === oc.TopAbs_Orientation.TopAbs_FORWARD ? 'forward' : 'backward';
}

/** Flip the orientation of an edge or wire. Returns a new shape. */
export function flipOrientation(shape: Edge | Wire): Edge | Wire {
  return castShape(shape.wrapped.Reversed()) as Edge | Wire;
}

/** Offset a wire in 2D. Returns a new wire. Does NOT dispose the input. */
export function offsetWire2D(
  wire: Wire,
  offset: number,
  kind: 'arc' | 'intersection' | 'tangent' = 'arc'
): Result<Wire> {
  const oc = getKernel().oc;
  const kinds = {
    arc: oc.GeomAbs_JoinType.GeomAbs_Arc,
    intersection: oc.GeomAbs_JoinType.GeomAbs_Intersection,
    tangent: oc.GeomAbs_JoinType.GeomAbs_Tangent,
  };

  const offsetter = new oc.BRepOffsetAPI_MakeOffset_3(wire.wrapped, kinds[kind], false);
  offsetter.Perform(offset, 0);

  const resultShape = offsetter.Shape();
  const wrapped = castShape(resultShape);
  offsetter.delete();

  if (!isWireGuard(wrapped)) {
    return err(typeCastError('OFFSET_NOT_WIRE', 'Offset did not produce a Wire'));
  }
  return ok(wrapped);
}
