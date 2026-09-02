import * as WebIFC from 'web-ifc';
import { mesh } from 'brepjs';
import type { ValidSolid } from 'brepjs';
import type { IfcWriter } from './ifcWriter.js';
import { toIfcLengthM } from '../units/units.js';
import { writeAxis2Placement3D } from './headerWriter.js';
import type { FrameInput } from '../import/placement.js';

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

export interface PreparedTessellation {
  readonly coordList: readonly (readonly [number, number, number])[];
  readonly coordIndex: readonly (readonly [number, number, number])[];
}

export type TessellationPreparation =
  | { readonly ok: true; readonly value: PreparedTessellation }
  | { readonly ok: false; readonly reason: string; readonly cause?: unknown };

export interface ExactBodyRepresentationIds {
  readonly localPlacementId: number;
  readonly productDefinitionShapeId: number;
  readonly bodyItemIds: readonly number[];
}

export function prepareTessellation(
  solid: ValidSolid,
  toleranceMm: number = IFC_MESH_TOLERANCE_MM
): TessellationPreparation {
  let meshData;
  try {
    meshData = mesh(solid, {
      tolerance: toleranceMm,
      angularTolerance: IFC_MESH_ANGULAR_TOLERANCE_RAD,
    });
  } catch (cause) {
    return {
      ok: false,
      reason: cause instanceof Error ? cause.message : String(cause),
      cause,
    };
  }

  const { vertices, triangles } = meshData;
  if (vertices.length === 0 || triangles.length === 0) {
    return { ok: false, reason: 'mesh() returned an empty triangle set' };
  }

  const coordList: Array<readonly [number, number, number]> = [];
  for (let i = 0; i + 2 < vertices.length; i += 3) {
    coordList.push([
      toIfcLengthM(vertices[i] ?? 0),
      toIfcLengthM(vertices[i + 1] ?? 0),
      toIfcLengthM(vertices[i + 2] ?? 0),
    ]);
  }

  const coordIndex: Array<readonly [number, number, number]> = [];
  for (let i = 0; i + 2 < triangles.length; i += 3) {
    coordIndex.push([
      (triangles[i] ?? 0) + 1,
      (triangles[i + 1] ?? 0) + 1,
      (triangles[i + 2] ?? 0) + 1,
    ]);
  }

  return { ok: true, value: { coordList, coordIndex } };
}

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
  const prepared = prepareTessellation(solid, toleranceMm);
  if (!prepared.ok) {
    const reason = prepared.reason;
    console.warn(`writeTessellation: mesh() failed, using IfcFacetedBrep fallback: ${reason}`);
    return writeFacetedBrepFallback(w, geomSubContextId, reason);
  }
  const { productDefinitionShapeId } = writePreparedTessellationBody(
    w,
    [prepared.value],
    geomSubContextId
  );

  return { productDefinitionShapeId, usedFallback: false };
}

export function writePreparedTessellationBody(
  w: IfcWriter,
  items: readonly PreparedTessellation[],
  geomSubContextId: number
): { readonly productDefinitionShapeId: number; readonly bodyItemIds: readonly number[] } {
  const bodyItemIds = items.map((item) => writePreparedTessellationItem(w, item));
  const shapeRepId = w.nextId();
  w.writeLine({
    expressID: shapeRepId,
    type: WebIFC.IFCSHAPEREPRESENTATION,
    ContextOfItems: w.ref(geomSubContextId),
    RepresentationIdentifier: w.mkType(WebIFC.IFCLABEL, 'Body'),
    RepresentationType: w.mkType(WebIFC.IFCLABEL, 'Tessellation'),
    Items: bodyItemIds.map((id) => w.ref(id)),
  });

  const productDefinitionShapeId = w.nextId();
  w.writeLine({
    expressID: productDefinitionShapeId,
    type: WebIFC.IFCPRODUCTDEFINITIONSHAPE,
    Name: null,
    Description: null,
    Representations: [w.ref(shapeRepId)],
  });
  return { productDefinitionShapeId, bodyItemIds };
}

export function writeExactBodyGeometry(
  w: IfcWriter,
  placement: FrameInput,
  items: readonly PreparedTessellation[],
  geomSubContextId: number,
  parentPlacementId: number | null
): ExactBodyRepresentationIds {
  const placement3DId = writeAxis2Placement3D(
    w,
    [
      toIfcLengthM(placement.origin[0]),
      toIfcLengthM(placement.origin[1]),
      toIfcLengthM(placement.origin[2]),
    ],
    [placement.axisZ[0], placement.axisZ[1], placement.axisZ[2]],
    [placement.axisX[0], placement.axisX[1], placement.axisX[2]]
  );
  const localPlacementId = w.nextId();
  w.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: parentPlacementId === null ? null : w.ref(parentPlacementId),
    RelativePlacement: w.ref(placement3DId),
  });
  const body = writePreparedTessellationBody(w, items, geomSubContextId);
  return { localPlacementId, ...body };
}

export function writePreparedTessellationItem(
  w: IfcWriter,
  prepared: PreparedTessellation
): number {
  const pointListId = w.nextId();
  w.writeLine({
    expressID: pointListId,
    type: WebIFC.IFCCARTESIANPOINTLIST3D,
    CoordList: prepared.coordList.map((point) =>
      point.map((value) => w.mkType(WebIFC.IFCLENGTHMEASURE, value))
    ),
    TagList: null,
  });

  const faceSetId = w.nextId();
  w.writeLine({
    expressID: faceSetId,
    type: WebIFC.IFCTRIANGULATEDFACESET,
    Coordinates: w.ref(pointListId),
    Normals: null,
    Closed: w.mkType(WebIFC.IFCBOOLEAN, true),
    CoordIndex: prepared.coordIndex.map((triangle) =>
      triangle.map((index) => w.mkType(WebIFC.IFCPOSITIVEINTEGER, index))
    ),
    PnIndex: null,
  });
  return faceSetId;
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
    Orientation: w.mkType(WebIFC.IFCBOOLEAN, true),
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
