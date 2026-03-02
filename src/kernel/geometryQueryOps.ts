/**
 * Geometry query operations for OCCT — surface, curve, and vertex queries.
 *
 * These operations extract geometric information from topology shapes
 * without modifying them. Used by DefaultAdapter.
 */

import type {
  KernelInstance,
  KernelShape,
  KernelType,
  SurfaceType,
  ShapeOrientation,
} from './types.js';

// ---------------------------------------------------------------------------
// Vertex queries
// ---------------------------------------------------------------------------

/** Extract the 3D position of a vertex. */
export function vertexPosition(oc: KernelInstance, vertex: KernelShape): [number, number, number] {
  const pnt = oc.BRep_Tool.Pnt(vertex);
  const result: [number, number, number] = [pnt.X(), pnt.Y(), pnt.Z()];
  pnt.delete();
  return result;
}

// ---------------------------------------------------------------------------
// Face / surface queries
// ---------------------------------------------------------------------------

/** Map from OCCT GeomAbs_SurfaceType enum value to SurfaceType string. */
function buildSurfaceTypeMap(oc: KernelInstance): Map<number, SurfaceType> {
  const e = oc.GeomAbs_SurfaceType;
  return new Map<number, SurfaceType>([
    [e.GeomAbs_Plane, 'plane'],
    [e.GeomAbs_Cylinder, 'cylinder'],
    [e.GeomAbs_Cone, 'cone'],
    [e.GeomAbs_Sphere, 'sphere'],
    [e.GeomAbs_Torus, 'torus'],
    [e.GeomAbs_BezierSurface, 'bezier'],
    [e.GeomAbs_BSplineSurface, 'bspline'],
    [e.GeomAbs_SurfaceOfRevolution, 'revolution'],
    [e.GeomAbs_SurfaceOfExtrusion, 'extrusion'],
    [e.GeomAbs_OffsetSurface, 'offset'],
    [e.GeomAbs_OtherSurface, 'other'],
  ]);
}

/** Per-instance surface type map cache, keyed by oc reference. */
const _surfaceTypeMaps = new WeakMap<object, Map<number, SurfaceType>>();

/** Get the geometric surface type of a face. */
export function surfaceType(oc: KernelInstance, face: KernelShape): SurfaceType {
  let map = _surfaceTypeMaps.get(oc);
  if (!map) {
    map = buildSurfaceTypeMap(oc);
    _surfaceTypeMaps.set(oc, map);
  }
  const adaptor = new oc.BRepAdaptor_Surface_2(face, false);
  const ocType = adaptor.GetType();
  adaptor.delete();
  return map.get(ocType) ?? 'other';
}

/** Get the UV parameter bounds of a face. */
export function uvBounds(
  oc: KernelInstance,
  face: KernelShape
): { uMin: number; uMax: number; vMin: number; vMax: number } {
  const uMin = { current: 0 };
  const uMax = { current: 0 };
  const vMin = { current: 0 };
  const vMax = { current: 0 };
  oc.BRepTools.UVBounds_1(face, uMin, uMax, vMin, vMax);
  return {
    uMin: uMin.current,
    uMax: uMax.current,
    vMin: vMin.current,
    vMax: vMax.current,
  };
}

/** Get the outer wire of a face. */
export function outerWire(oc: KernelInstance, face: KernelShape): KernelShape {
  return oc.BRepTools.OuterWire(face);
}

/** Get the surface normal at a UV parameter on a face. */
export function surfaceNormal(
  oc: KernelInstance,
  face: KernelShape,
  u: number,
  v: number
): [number, number, number] {
  const props = new oc.BRepGProp_Face_2(face, false);
  const pnt = new oc.gp_Pnt_1();
  const vec = new oc.gp_Vec_1();
  props.Normal(u, v, pnt, vec);
  const result: [number, number, number] = [vec.X(), vec.Y(), vec.Z()];
  props.delete();
  pnt.delete();
  vec.delete();
  return result;
}

/** Evaluate a point at UV parameters on a face's surface. */
export function pointOnSurface(
  oc: KernelInstance,
  face: KernelShape,
  u: number,
  v: number
): [number, number, number] {
  const adaptor = new oc.BRepAdaptor_Surface_2(face, false);
  const pnt = new oc.gp_Pnt_1();
  adaptor.D0(u, v, pnt);
  const result: [number, number, number] = [pnt.X(), pnt.Y(), pnt.Z()];
  adaptor.delete();
  pnt.delete();
  return result;
}

/** Project a 3D point onto a face and return UV coordinates. Null if projection fails. */
export function uvFromPoint(
  oc: KernelInstance,
  face: KernelShape,
  point: [number, number, number]
): [number, number] | null {
  const surface = oc.BRep_Tool.Surface_2(face);
  const pnt = new oc.gp_Pnt_3(point[0], point[1], point[2]);
  const proj = new oc.GeomAPI_ProjectPointOnSurf_2(
    pnt,
    surface,
    oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad
  );

  let result: [number, number] | null = null;
  if (proj.NbPoints() > 0) {
    const u = { current: 0 };
    const v = { current: 0 };
    proj.LowerDistanceParameters(u, v);
    result = [u.current, v.current];
  }

  proj.delete();
  pnt.delete();
  // surface is a handle — no delete needed
  return result;
}

/** Project a 3D point onto a face and return the closest 3D point. */
export function projectPointOnFace(
  oc: KernelInstance,
  face: KernelShape,
  point: [number, number, number]
): [number, number, number] {
  const surface = oc.BRep_Tool.Surface_2(face);
  const pnt = new oc.gp_Pnt_3(point[0], point[1], point[2]);
  const proj = new oc.GeomAPI_ProjectPointOnSurf_2(
    pnt,
    surface,
    oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad
  );

  let result: [number, number, number];
  if (proj.NbPoints() > 0) {
    const nearest = proj.NearestPoint();
    result = [nearest.X(), nearest.Y(), nearest.Z()];
    nearest.delete();
  } else {
    result = point;
  }

  proj.delete();
  pnt.delete();
  return result;
}

// ---------------------------------------------------------------------------
// Edge / curve queries
// ---------------------------------------------------------------------------

/**
 * Evaluate the tangent vector at a parameter value on an edge or wire.
 * Uses BRepAdaptor_CompCurve for wires, BRepAdaptor_Curve for edges.
 */
export function curveTangent(
  oc: KernelInstance,
  shape: KernelShape,
  param: number
): { point: [number, number, number]; tangent: [number, number, number] } {
  const isWire = shape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_WIRE;
  const adaptor = isWire
    ? new oc.BRepAdaptor_CompCurve_2(shape, false)
    : new oc.BRepAdaptor_Curve_2(shape);

  const pnt = new oc.gp_Pnt_1();
  const vec = new oc.gp_Vec_1();
  adaptor.D1(param, pnt, vec);

  const result = {
    point: [pnt.X(), pnt.Y(), pnt.Z()] as [number, number, number],
    tangent: [vec.X(), vec.Y(), vec.Z()] as [number, number, number],
  };

  adaptor.delete();
  pnt.delete();
  vec.delete();
  return result;
}

/** Get the first and last parameter values of a curve (edge or wire). */
export function curveParameters(oc: KernelInstance, shape: KernelShape): [number, number] {
  const isWire = shape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_WIRE;
  const adaptor = isWire
    ? new oc.BRepAdaptor_CompCurve_2(shape, false)
    : new oc.BRepAdaptor_Curve_2(shape);

  const result: [number, number] = [adaptor.FirstParameter(), adaptor.LastParameter()];
  adaptor.delete();
  return result;
}

/** Evaluate a point at a raw parameter value on a curve (edge or wire). */
export function curvePointAtParam(
  oc: KernelInstance,
  shape: KernelShape,
  param: number
): [number, number, number] {
  const isWire = shape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_WIRE;
  const adaptor = isWire
    ? new oc.BRepAdaptor_CompCurve_2(shape, false)
    : new oc.BRepAdaptor_Curve_2(shape);

  const pnt = adaptor.Value(param);
  const result: [number, number, number] = [pnt.X(), pnt.Y(), pnt.Z()];
  pnt.delete();
  adaptor.delete();
  return result;
}

/** Check if a curve (edge or wire) is closed. */
export function curveIsClosed(oc: KernelInstance, shape: KernelShape): boolean {
  const isWire = shape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_WIRE;
  const adaptor = isWire
    ? new oc.BRepAdaptor_CompCurve_2(shape, false)
    : new oc.BRepAdaptor_Curve_2(shape);

  const result = adaptor.IsClosed();
  adaptor.delete();
  return result;
}

/** Check if a curve (edge or wire) is periodic. */
export function curveIsPeriodic(oc: KernelInstance, shape: KernelShape): boolean {
  const isWire = shape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_WIRE;
  const adaptor = isWire
    ? new oc.BRepAdaptor_CompCurve_2(shape, false)
    : new oc.BRepAdaptor_Curve_2(shape);

  const result = adaptor.IsPeriodic();
  adaptor.delete();
  return result;
}

/** Get the period of a periodic curve (edge or wire). */
export function curvePeriod(oc: KernelInstance, shape: KernelShape): number {
  const isWire = shape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_WIRE;
  const adaptor = isWire
    ? new oc.BRepAdaptor_CompCurve_2(shape, false)
    : new oc.BRepAdaptor_Curve_2(shape);

  const result = adaptor.Period();
  adaptor.delete();
  return result;
}

/** Get the geometric curve type of an edge or wire. */
export function curveType(oc: KernelInstance, shape: KernelShape): string {
  const isWire = shape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_WIRE;
  const adaptor = isWire
    ? new oc.BRepAdaptor_CompCurve_2(shape, false)
    : new oc.BRepAdaptor_Curve_2(shape);

  const typeVal = adaptor.GetType();
  adaptor.delete();

  // OCCT Emscripten returns enum objects with a .value property
  const idx = typeof typeVal === 'number' ? typeVal : Number(typeVal?.value ?? typeVal);

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
// Shape introspection
// ---------------------------------------------------------------------------

/** Get the orientation of a shape. */
export function shapeOrientation(oc: KernelInstance, shape: KernelShape): ShapeOrientation {
  const orient = shape.Orientation_1();
  const ta = oc.TopAbs_Orientation;
  if (orient === ta.TopAbs_FORWARD) return 'forward';
  if (orient === ta.TopAbs_REVERSED) return 'reversed';
  if (orient === ta.TopAbs_INTERNAL) return 'internal';
  return 'external';
}

/** Downcast a generic TopoDS_Shape to its concrete subtype. */
export function downcast(oc: KernelInstance, shape: KernelShape, type?: string): KernelShape {
  const st = type ?? shapeTypeStr(oc, shape);
  switch (st) {
    case 'vertex':
      return oc.TopoDS.Vertex_1(shape);
    case 'edge':
      return oc.TopoDS.Edge_1(shape);
    case 'wire':
      return oc.TopoDS.Wire_1(shape);
    case 'face':
      return oc.TopoDS.Face_1(shape);
    case 'shell':
      return oc.TopoDS.Shell_1(shape);
    case 'solid':
      return oc.TopoDS.Solid_1(shape);
    case 'compsolid':
      return oc.TopoDS.CompSolid_1(shape);
    default:
      return oc.TopoDS.Compound_1(shape);
  }
}

/** Internal helper — get shape type as string. */
function shapeTypeStr(oc: KernelInstance, shape: KernelShape): string {
  const st = shape.ShapeType();
  const e = oc.TopAbs_ShapeEnum;
  if (st === e.TopAbs_VERTEX) return 'vertex';
  if (st === e.TopAbs_EDGE) return 'edge';
  if (st === e.TopAbs_WIRE) return 'wire';
  if (st === e.TopAbs_FACE) return 'face';
  if (st === e.TopAbs_SHELL) return 'shell';
  if (st === e.TopAbs_SOLID) return 'solid';
  if (st === e.TopAbs_COMPSOLID) return 'compsolid';
  return 'compound';
}

/** Get the hash code of a shape. */
export function hashCode(_oc: KernelInstance, shape: KernelShape, upperBound: number): number {
  return shape.HashCode(upperBound);
}

/** Check if a shape is null. */
export function isNull(_oc: KernelInstance, shape: KernelShape): boolean {
  return shape.IsNull();
}

/** Return a copy of the shape with reversed orientation. */
export function reverseShape(_oc: KernelInstance, shape: KernelShape): KernelShape {
  return shape.Reversed();
}

/** Check if a shape has triangulation data. */
export function hasTriangulation(oc: KernelInstance, shape: KernelShape): boolean {
  const explorer = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  const loc = new oc.TopLoc_Location_1();
  let found = false;
  while (explorer.More()) {
    const face = oc.TopoDS.Face_1(explorer.Current());
    const tri = oc.BRep_Tool.Triangulation(face, loc, 0);
    if (!tri.IsNull()) {
      found = true;
      break;
    }
    explorer.Next();
  }
  explorer.delete();
  loc.delete();
  return found;
}

/**
 * Perform incremental meshing on a shape (for export preparation).
 * This modifies the shape's internal triangulation data in place.
 */
export function meshShape(
  oc: KernelInstance,
  shape: KernelShape,
  tolerance: number,
  angularTolerance: number
): void {
  const mesher = new oc.BRepMesh_IncrementalMesh_2(
    shape,
    tolerance,
    false,
    angularTolerance,
    false
  );
  mesher.delete();
}

/** Extract the second-to-last Bezier control pole from a 3D edge curve. */
export function getBezierPenultimatePole(
  oc: KernelInstance,
  edge: KernelShape
): [number, number, number] | null {
  const adaptor = new oc.BRepAdaptor_Curve_2(edge);
  try {
    const bezier = adaptor.Bezier().get();
    const nbPoles = bezier.NbPoles();
    if (nbPoles < 2) return null;
    const pole = bezier.Pole(nbPoles - 1);
    const result: [number, number, number] = [pole.X(), pole.Y(), pole.Z()];
    pole.delete();
    return result;
  } catch {
    return null;
  } finally {
    adaptor.delete();
  }
}

/**
 * Create a BRepAdaptor for curve evaluation.
 * Returns CompCurve for wires, Curve for edges. Caller must delete.
 */
export function createCurveAdaptor(oc: KernelInstance, shape: KernelShape): KernelType {
  const isWire = shape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_WIRE;
  return isWire ? new oc.BRepAdaptor_CompCurve_2(shape, false) : new oc.BRepAdaptor_Curve_2(shape);
}

// ---------------------------------------------------------------------------
// Surface geometry extraction
// ---------------------------------------------------------------------------

/** Extract cylinder data from a surface handle. Returns null if not a cylinder. */
export function getSurfaceCylinderData(
  oc: KernelInstance,
  surface: KernelType
): { radius: number; isDirect: boolean } | null {
  const adaptor = new oc.GeomAdaptor_Surface_2(surface);
  const typeVal = adaptor.GetType();
  const typeIdx = typeof typeVal === 'number' ? typeVal : Number(typeVal?.value ?? typeVal);
  // 1 = GeomAbs_Cylinder
  if (typeIdx !== 1) {
    adaptor.delete();
    return null;
  }
  const cyl = adaptor.Cylinder();
  const result = {
    radius: cyl.Radius(),
    isDirect: cyl.Direct(),
  };
  cyl.delete();
  adaptor.delete();
  return result;
}

/** Reverse the U direction of a surface. Returns a new surface handle. */
export function reverseSurfaceU(_oc: KernelInstance, surface: KernelType): KernelType {
  return surface.get().UReversed();
}
