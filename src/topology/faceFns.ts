/**
 * Face-specific functions — functional replacements for Face class methods.
 * All functions accept branded Face handles and return plain values or branded shapes.
 */

import { getKernel } from '../kernel/index.js';
import type { Vec3, PointInput } from '../core/types.js';
import { toVec3 } from '../core/types.js';
import type { Face, Wire } from '../core/shapeTypes.js';
import { castShape } from '../core/shapeTypes.js';
import { toOcPnt } from '../core/occtBoundary.js';
import { gcWithScope } from '../core/disposal.js';
import { type Result, ok, err, unwrap } from '../core/result.js';
import { typeCastError } from '../core/errors.js';
import { iterTopo, downcast } from './cast.js';

// ---------------------------------------------------------------------------
// Surface type detection
// ---------------------------------------------------------------------------

export type SurfaceType =
  | 'PLANE'
  | 'CYLINDRE'
  | 'CONE'
  | 'SPHERE'
  | 'TORUS'
  | 'BEZIER_SURFACE'
  | 'BSPLINE_SURFACE'
  | 'REVOLUTION_SURFACE'
  | 'EXTRUSION_SURFACE'
  | 'OFFSET_SURFACE'
  | 'OTHER_SURFACE';

/** Get the geometric surface type of a face. */
export function getSurfaceType(face: Face): Result<SurfaceType> {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const adaptor = r(new oc.BRepAdaptor_Surface_2(face.wrapped, false));
  const ga = oc.GeomAbs_SurfaceType;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT enum keys are dynamic
  const CAST_MAP: Map<any, SurfaceType> = new Map([
    [ga.GeomAbs_Plane, 'PLANE'],
    [ga.GeomAbs_Cylinder, 'CYLINDRE'],
    [ga.GeomAbs_Cone, 'CONE'],
    [ga.GeomAbs_Sphere, 'SPHERE'],
    [ga.GeomAbs_Torus, 'TORUS'],
    [ga.GeomAbs_BezierSurface, 'BEZIER_SURFACE'],
    [ga.GeomAbs_BSplineSurface, 'BSPLINE_SURFACE'],
    [ga.GeomAbs_SurfaceOfRevolution, 'REVOLUTION_SURFACE'],
    [ga.GeomAbs_SurfaceOfExtrusion, 'EXTRUSION_SURFACE'],
    [ga.GeomAbs_OffsetSurface, 'OFFSET_SURFACE'],
    [ga.GeomAbs_OtherSurface, 'OTHER_SURFACE'],
  ]);

  const surfType = CAST_MAP.get(adaptor.GetType());

  if (!surfType) {
    return err(
      typeCastError('UNKNOWN_SURFACE_TYPE', 'Unrecognized surface type from OCCT adapter')
    );
  }
  return ok(surfType);
}

/** Get the surface type of a face (unwrapped convenience). */
export function faceGeomType(face: Face): SurfaceType {
  return unwrap(getSurfaceType(face));
}

// ---------------------------------------------------------------------------
// Face orientation
// ---------------------------------------------------------------------------

/** Get the topological orientation of a face. */
export function faceOrientation(face: Face): 'forward' | 'backward' {
  const oc = getKernel().oc;
  const orient = face.wrapped.Orientation_1();
  return orient === oc.TopAbs_Orientation.TopAbs_FORWARD ? 'forward' : 'backward';
}

/** Flip the orientation of a face. Returns a new face. */
export function flipFaceOrientation(face: Face): Face {
  return castShape(face.wrapped.Reversed()) as Face;
}

// ---------------------------------------------------------------------------
// UV and surface queries
// ---------------------------------------------------------------------------

/** UV parameter bounds of a face. */
export interface UVBounds {
  readonly uMin: number;
  readonly uMax: number;
  readonly vMin: number;
  readonly vMax: number;
}

/** Get the UV parameter bounds of a face. */
export function uvBounds(face: Face): UVBounds {
  const oc = getKernel().oc;
  const uMin = { current: 0 };
  const uMax = { current: 0 };
  const vMin = { current: 0 };
  const vMax = { current: 0 };
  oc.BRepTools.UVBounds_1(face.wrapped, uMin, uMax, vMin, vMax);
  return {
    uMin: uMin.current,
    uMax: uMax.current,
    vMin: vMin.current,
    vMax: vMax.current,
  };
}

/** Get a point on a face surface at normalized UV coordinates (0–1 range). */
export function pointOnSurface(face: Face, u: number, v: number): Vec3 {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const bounds = uvBounds(face);
  const adaptor = r(new oc.BRepAdaptor_Surface_2(face.wrapped, false));
  const p = r(new oc.gp_Pnt_1());

  const absU = u * (bounds.uMax - bounds.uMin) + bounds.uMin;
  const absV = v * (bounds.vMax - bounds.vMin) + bounds.vMin;

  adaptor.D0(absU, absV, p);
  return [p.X(), p.Y(), p.Z()];
}

/** Get the UV coordinates on a face for a given 3D point. */
export function uvCoordinates(face: Face, point: PointInput): [number, number] {
  const oc = getKernel().oc;
  const r = gcWithScope();
  const v = toVec3(point);
  const surface = r(oc.BRep_Tool.Surface_2(face.wrapped));

  const projected = r(
    new oc.GeomAPI_ProjectPointOnSurf_2(
      r(toOcPnt(v)),
      surface,
      oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad
    )
  );

  const uPtr = { current: 0 };
  const vPtr = { current: 0 };
  projected.LowerDistanceParameters(uPtr, vPtr);
  return [uPtr.current, vPtr.current];
}

/** Get the surface normal at a point (or at the center if no point given). */
export function normalAt(face: Face, locationPoint?: PointInput): Vec3 {
  const oc = getKernel().oc;
  const r = gcWithScope();

  let u: number;
  let v: number;

  if (!locationPoint) {
    const bounds = uvBounds(face);
    u = 0.5 * (bounds.uMin + bounds.uMax);
    v = 0.5 * (bounds.vMin + bounds.vMax);
  } else {
    [u, v] = uvCoordinates(face, locationPoint);
  }

  const p = r(new oc.gp_Pnt_1());
  const vn = r(new oc.gp_Vec_1());
  const props = r(new oc.BRepGProp_Face_2(face.wrapped, false));
  props.Normal(u, v, p, vn);

  return [vn.X(), vn.Y(), vn.Z()];
}

/** Get the center of mass of a face. */
export function faceCenter(face: Face): Vec3 {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const props = r(new oc.GProp_GProps_1());
  oc.BRepGProp.SurfaceProperties_2(face.wrapped, props, 1e-7, true);
  const center = r(props.CentreOfMass());
  return [center.X(), center.Y(), center.Z()];
}

// ---------------------------------------------------------------------------
// Wire extraction from faces
// ---------------------------------------------------------------------------

/** Get the outer wire of a face. Returns a new Wire. */
export function outerWire(face: Face): Wire {
  const oc = getKernel().oc;
  return castShape(oc.BRepTools.OuterWire(face.wrapped)) as Wire;
}

/** Get the inner wires (holes) of a face. */
export function innerWires(face: Face): Wire[] {
  const outer = outerWire(face);
  const allWires = Array.from(iterTopo(face.wrapped, 'wire')).map(
    (w) => castShape(unwrap(downcast(w))) as Wire
  );
  const result = allWires.filter((w) => !w.wrapped.IsSame(outer.wrapped));
  return result;
}

// ---------------------------------------------------------------------------
// Triangulation
// ---------------------------------------------------------------------------

export interface FaceTriangulation {
  vertices: number[];
  trianglesIndexes: number[];
  verticesNormals: number[];
}

/**
 * Triangulate a face. Returns triangulation data or null if unavailable.
 * @deprecated Use meshShape() instead for better performance via bulk C++ extraction.
 */
export function triangulateFace(
  face: Face,
  index0 = 0,
  skipNormals = false
): FaceTriangulation | null {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const aLocation = r(new oc.TopLoc_Location_1());
  const triHandle = r(oc.BRep_Tool.Triangulation(face.wrapped, aLocation, 0));

  if (triHandle.IsNull()) return null;

  const transformation = r(aLocation.Transformation());
  const tri = triHandle.get();
  const nbNodes = tri.NbNodes();

  const result: FaceTriangulation = {
    vertices: new Array(nbNodes * 3),
    trianglesIndexes: [],
    verticesNormals: [],
  };

  // Vertex buffer
  for (let i = 1; i <= nbNodes; i++) {
    const p = r(r(tri.Node(i)).Transformed(transformation));
    result.vertices[(i - 1) * 3 + 0] = p.X();
    result.vertices[(i - 1) * 3 + 1] = p.Y();
    result.vertices[(i - 1) * 3 + 2] = p.Z();
  }

  // Normals
  if (!skipNormals) {
    const normalsArray = r(new oc.TColgp_Array1OfDir_2(1, nbNodes));
    const pc = r(new oc.Poly_Connect_2(triHandle));
    oc.StdPrs_ToolTriangulatedShape.Normal(face.wrapped, pc, normalsArray);
    result.verticesNormals = new Array(normalsArray.Length() * 3);
    for (let i = normalsArray.Lower(); i <= normalsArray.Upper(); i++) {
      const d = r(r(normalsArray.Value(i)).Transformed(transformation));
      result.verticesNormals[(i - 1) * 3 + 0] = d.X();
      result.verticesNormals[(i - 1) * 3 + 1] = d.Y();
      result.verticesNormals[(i - 1) * 3 + 2] = d.Z();
    }
  }

  // Triangle buffer
  const orient = faceOrientation(face);
  const nbTriangles = tri.NbTriangles();
  result.trianglesIndexes = new Array(nbTriangles * 3);
  let validCount = 0;
  for (let nt = 1; nt <= nbTriangles; nt++) {
    const t = r(tri.Triangle(nt));
    let n1 = t.Value(1);
    let n2 = t.Value(2);
    const n3 = t.Value(3);
    if (orient === 'backward') {
      const tmp = n1;
      n1 = n2;
      n2 = tmp;
    }
    result.trianglesIndexes[validCount * 3 + 0] = n1 - 1 + index0;
    result.trianglesIndexes[validCount * 3 + 1] = n2 - 1 + index0;
    result.trianglesIndexes[validCount * 3 + 2] = n3 - 1 + index0;
    validCount++;
  }

  return result;
}
