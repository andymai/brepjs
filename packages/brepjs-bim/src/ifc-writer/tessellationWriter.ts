import * as WebIFC from 'web-ifc';
import { mesh } from 'brepjs';
import type { ValidSolid } from 'brepjs';
import type { IfcWriter } from './ifcWriter.js';
import { toIfcLengthM } from '../units/units.js';

export interface TessellationResult {
  readonly productDefinitionShapeId: number;
  /** True when the IfcFacetedBrep fallback was used because mesh() failed. */
  readonly usedFallback: false;
}

export interface TessellationFallbackResult {
  readonly productDefinitionShapeId: number;
  readonly usedFallback: true;
  readonly fallbackReason: string;
}

export type TessellationOutput = TessellationResult | TessellationFallbackResult;

// Coarse mesh defaults appropriate for IFC export (not render quality). IFC
// validators do not require fine meshes; finer values bloat the SPF file.
const IFC_MESH_TOLERANCE_MM = 5;
const IFC_MESH_ANGULAR_TOLERANCE_RAD = 0.3;

/**
 * Writes an IfcTriangulatedFaceSet (preferred IFC4 tessellation) from a brepjs
 * ValidSolid, wrapped in an IfcShapeRepresentation (Body/Tessellation) and an
 * IfcProductDefinitionShape. Returns the IfcProductDefinitionShape express ID.
 *
 * Vertices from mesh() are in mm (brepjs native units) and are converted to
 * metres for IFC. CoordIndex is emitted 1-based as IFC requires.
 *
 * On mesh() failure the function falls back to a degenerate single-vertex
 * IfcFacetedBrep, logs a console.warn, and returns usedFallback: true. The
 * caller should surface the fallback through its ValidationReport.
 *
 * geomSubContextId must be the geometric representation sub-context ('Body').
 * localPlacement is accepted for call-site symmetry with the other geometry
 * writers; tessellation placement is carried by the owning product, not by the
 * shape representation, so it is not referenced here.
 */
export function writeTessellation(
  w: IfcWriter,
  solid: ValidSolid,
  geomSubContextId: number,
  _localPlacementId: number | null,
  toleranceMm: number = IFC_MESH_TOLERANCE_MM
): TessellationOutput {
  let meshData;
  try {
    meshData = mesh(solid, {
      tolerance: toleranceMm,
      angularTolerance: IFC_MESH_ANGULAR_TOLERANCE_RAD,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`writeTessellation: mesh() failed, using IfcFacetedBrep fallback: ${reason}`);
    return writeFacetedBrepFallback(w, geomSubContextId, reason);
  }

  const { vertices, triangles } = meshData;
  if (vertices.length === 0 || triangles.length === 0) {
    const reason = 'mesh() returned an empty triangle set';
    console.warn(`writeTessellation: ${reason}, using IfcFacetedBrep fallback`);
    return writeFacetedBrepFallback(w, geomSubContextId, reason);
  }

  // Build the coordinate list (metres) as [x, y, z] triples. vertices is a
  // flat Float32Array of interleaved positions in mm.
  const coordList: number[][] = [];
  for (let i = 0; i + 2 < vertices.length; i += 3) {
    coordList.push([
      toIfcLengthM(vertices[i] ?? 0),
      toIfcLengthM(vertices[i + 1] ?? 0),
      toIfcLengthM(vertices[i + 2] ?? 0),
    ]);
  }

  const pointListId = w.nextId();
  w.writeLine({
    expressID: pointListId,
    type: WebIFC.IFCCARTESIANPOINTLIST3D,
    CoordList: coordList.map((pt) => pt.map((v) => w.mkType(WebIFC.IFCLENGTHMEASURE, v))),
    TagList: null,
  });

  // Build 1-based 3-tuple coordinate indices directly from the Uint32Array to
  // avoid an intermediate flat allocation. triangles holds 0-based vertex ids.
  const coordIndex: number[][] = [];
  for (let i = 0; i + 2 < triangles.length; i += 3) {
    coordIndex.push([
      (triangles[i] ?? 0) + 1,
      (triangles[i + 1] ?? 0) + 1,
      (triangles[i + 2] ?? 0) + 1,
    ]);
  }

  const faceSetId = w.nextId();
  w.writeLine({
    expressID: faceSetId,
    type: WebIFC.IFCTRIANGULATEDFACESET,
    Coordinates: w.ref(pointListId),
    Normals: null,
    Closed: true,
    CoordIndex: coordIndex.map((tri) =>
      tri.map((idx) => w.mkType(WebIFC.IFCPOSITIVEINTEGER, idx))
    ),
    PnIndex: null,
  });

  const shapeRepId = w.nextId();
  w.writeLine({
    expressID: shapeRepId,
    type: WebIFC.IFCSHAPEREPRESENTATION,
    ContextOfItems: w.ref(geomSubContextId),
    RepresentationIdentifier: w.mkType(WebIFC.IFCLABEL, 'Body'),
    RepresentationType: w.mkType(WebIFC.IFCLABEL, 'Tessellation'),
    Items: [w.ref(faceSetId)],
  });

  const productDefinitionShapeId = w.nextId();
  w.writeLine({
    expressID: productDefinitionShapeId,
    type: WebIFC.IFCPRODUCTDEFINITIONSHAPE,
    Name: null,
    Description: null,
    Representations: [w.ref(shapeRepId)],
  });

  return { productDefinitionShapeId, usedFallback: false };
}

/**
 * Builds a wall 'Axis' IfcShapeRepresentation: an IfcPolyline from (0,0) to
 * (lengthM, 0) in the wall's local XY plane, wrapped in an IfcShapeRepresentation
 * with RepresentationIdentifier='Axis', RepresentationType='Curve2D'. Returns
 * the IfcShapeRepresentation express ID so callers can add it alongside the Body
 * representation in an IfcProductDefinitionShape.
 *
 * wallLengthMm is the wall length in mm (brepjs native units); it is converted
 * to metres for IFC.
 */
export function writeWallAxisRepresentation(
  w: IfcWriter,
  wallLengthMm: number,
  geomSubContextId: number
): number {
  const lengthM = toIfcLengthM(wallLengthMm);

  const startId = w.nextId();
  w.writeLine({
    expressID: startId,
    type: WebIFC.IFCCARTESIANPOINT,
    Coordinates: [w.mkType(WebIFC.IFCLENGTHMEASURE, 0), w.mkType(WebIFC.IFCLENGTHMEASURE, 0)],
  });

  const endId = w.nextId();
  w.writeLine({
    expressID: endId,
    type: WebIFC.IFCCARTESIANPOINT,
    Coordinates: [w.mkType(WebIFC.IFCLENGTHMEASURE, lengthM), w.mkType(WebIFC.IFCLENGTHMEASURE, 0)],
  });

  const polylineId = w.nextId();
  w.writeLine({
    expressID: polylineId,
    type: WebIFC.IFCPOLYLINE,
    Points: [w.ref(startId), w.ref(endId)],
  });

  const shapeRepId = w.nextId();
  w.writeLine({
    expressID: shapeRepId,
    type: WebIFC.IFCSHAPEREPRESENTATION,
    ContextOfItems: w.ref(geomSubContextId),
    RepresentationIdentifier: w.mkType(WebIFC.IFCLABEL, 'Axis'),
    RepresentationType: w.mkType(WebIFC.IFCLABEL, 'Curve2D'),
    Items: [w.ref(polylineId)],
  });

  return shapeRepId;
}

// Degenerate IfcFacetedBrep used only when mesh() fails. A real face-polygon
// extraction is not available without a working mesh, so this emits a minimal
// valid-shaped (but geometrically empty) brep so the product still references a
// representation. The fallback is flagged to the caller via usedFallback: true.
function writeFacetedBrepFallback(
  w: IfcWriter,
  geomSubContextId: number,
  reason: string
): TessellationFallbackResult {
  const originId = w.nextId();
  w.writeLine({
    expressID: originId,
    type: WebIFC.IFCCARTESIANPOINT,
    Coordinates: [
      w.mkType(WebIFC.IFCLENGTHMEASURE, 0),
      w.mkType(WebIFC.IFCLENGTHMEASURE, 0),
      w.mkType(WebIFC.IFCLENGTHMEASURE, 0),
    ],
  });

  // IfcPolyLoop requires >= 3 points. Emit a degenerate triangle of three
  // coincident origin points so the fallback shell satisfies the IFC4 schema
  // (checkSchema) instead of tripping a polyloop cardinality violation.
  const p2Id = w.nextId();
  const p3Id = w.nextId();
  for (const id of [p2Id, p3Id]) {
    w.writeLine({
      expressID: id,
      type: WebIFC.IFCCARTESIANPOINT,
      Coordinates: [
        w.mkType(WebIFC.IFCLENGTHMEASURE, 0),
        w.mkType(WebIFC.IFCLENGTHMEASURE, 0),
        w.mkType(WebIFC.IFCLENGTHMEASURE, 0),
      ],
    });
  }
  const loopId = w.nextId();
  w.writeLine({
    expressID: loopId,
    type: WebIFC.IFCPOLYLOOP,
    Polygon: [w.ref(originId), w.ref(p2Id), w.ref(p3Id)],
  });

  const faceOuterBoundId = w.nextId();
  w.writeLine({
    expressID: faceOuterBoundId,
    type: WebIFC.IFCFACEOUTERBOUND,
    Bound: w.ref(loopId),
    Orientation: true,
  });

  const faceId = w.nextId();
  w.writeLine({
    expressID: faceId,
    type: WebIFC.IFCFACE,
    Bounds: [w.ref(faceOuterBoundId)],
  });

  const shellId = w.nextId();
  w.writeLine({
    expressID: shellId,
    type: WebIFC.IFCCLOSEDSHELL,
    CfsFaces: [w.ref(faceId)],
  });

  const brepId = w.nextId();
  w.writeLine({
    expressID: brepId,
    type: WebIFC.IFCFACETEDBREP,
    Outer: w.ref(shellId),
  });

  const shapeRepId = w.nextId();
  w.writeLine({
    expressID: shapeRepId,
    type: WebIFC.IFCSHAPEREPRESENTATION,
    ContextOfItems: w.ref(geomSubContextId),
    RepresentationIdentifier: w.mkType(WebIFC.IFCLABEL, 'Body'),
    RepresentationType: w.mkType(WebIFC.IFCLABEL, 'Brep'),
    Items: [w.ref(brepId)],
  });

  const productDefinitionShapeId = w.nextId();
  w.writeLine({
    expressID: productDefinitionShapeId,
    type: WebIFC.IFCPRODUCTDEFINITIONSHAPE,
    Name: null,
    Description: null,
    Representations: [w.ref(shapeRepId)],
  });

  return { productDefinitionShapeId, usedFallback: true, fallbackReason: reason };
}
