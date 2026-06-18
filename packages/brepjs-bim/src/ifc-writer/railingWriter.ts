import * as WebIFC from 'web-ifc';
import type { ValidSolid } from 'brepjs';
import type { IfcWriter } from './ifcWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import { writeAxis2Placement3D, writeDirection } from './headerWriter.js';
import { writeTessellation } from './tessellationWriter.js';
import { toIfcLengthM } from '../units/units.js';
import type { RailingSpec, RailingPredefinedType } from '../specs/railingSpec.js';

export interface RailingRepresentationIds {
  localPlacementId: number;
  productDefinitionShapeId: number;
  /**
   * Express ID of the body representation item (the swept extrusion) for surface
   * styling, or null for a tessellated POSTED railing (no single styleable item).
   */
  bodyItemId: number | null;
  /** True when tessellation fell back to a degenerate brep. */
  usedFallback: boolean;
}

// Emits IfcLocalPlacement + IfcRectangleProfileDef + IfcExtrudedAreaSolid +
// IfcShapeRepresentation + IfcProductDefinitionShape for a straight railing run.
// The rail cross-section (thickness × height) lies in the local XY plane and is
// swept along the local +Z, which is oriented to the run direction (local frame
// X = thickness, Y = height, Z = run length), mirroring writeWallGeometry.
export function writeRailingGeometry(
  w: IfcWriter,
  spec: RailingSpec,
  solid: ValidSolid,
  geomSubContextId: number,
  parentPlacementId: number | null
): RailingRepresentationIds {
  const placement3DId = writeAxis2Placement3D(
    w,
    spec.origin.map(toIfcLengthM) as [number, number, number],
    spec.axisZ,
    spec.axisX
  );

  const localPlacementId = w.nextId();
  w.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: parentPlacementId !== null ? w.ref(parentPlacementId) : null,
    RelativePlacement: w.ref(placement3DId),
  });

  // POSTED railing → tessellate the real posts+rails solid. There is no single
  // styleable body item, so bodyItemId is null (POSTED carries no surface style).
  if (spec.infill === 'POSTED') {
    const tess = writeTessellation(w, solid, geomSubContextId, localPlacementId);
    return {
      localPlacementId,
      productDefinitionShapeId: tess.productDefinitionShapeId,
      bodyItemId: null,
      usedFallback: tess.usedFallback,
    };
  }

  const thicknessM = toIfcLengthM(spec.thickness);
  const heightM = toIfcLengthM(spec.height);
  const lengthM = toIfcLengthM(spec.length);

  const profileOriginId = w.nextId();
  w.writeLine({
    expressID: profileOriginId,
    type: WebIFC.IFCCARTESIANPOINT,
    Coordinates: [
      w.mkType(WebIFC.IFCLENGTHMEASURE, thicknessM / 2),
      w.mkType(WebIFC.IFCLENGTHMEASURE, heightM / 2),
    ],
  });
  const profilePosId = w.nextId();
  w.writeLine({
    expressID: profilePosId,
    type: WebIFC.IFCAXIS2PLACEMENT2D,
    Location: w.ref(profileOriginId),
    RefDirection: null,
  });

  const profileId = w.nextId();
  w.writeLine({
    expressID: profileId,
    type: WebIFC.IFCRECTANGLEPROFILEDEF,
    ProfileType: { type: 3, value: 'AREA' },
    ProfileName: null,
    Position: w.ref(profilePosId),
    XDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, thicknessM),
    YDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, heightM),
  });

  // Orient so local Z = run length (X), local X = thickness (Y), local Y = height (Z).
  const extrusionPosId = writeAxis2Placement3D(w, [0, 0, 0], [1, 0, 0], [0, 1, 0]);
  const extrusionDirId = writeDirection(w, [0, 0, 1]);
  const extrusionId = w.nextId();
  w.writeLine({
    expressID: extrusionId,
    type: WebIFC.IFCEXTRUDEDAREASOLID,
    SweptArea: w.ref(profileId),
    Position: w.ref(extrusionPosId),
    ExtrudedDirection: w.ref(extrusionDirId),
    Depth: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, lengthM),
  });

  const shapeRepId = w.nextId();
  w.writeLine({
    expressID: shapeRepId,
    type: WebIFC.IFCSHAPEREPRESENTATION,
    ContextOfItems: w.ref(geomSubContextId),
    RepresentationIdentifier: w.mkType(WebIFC.IFCLABEL, 'Body'),
    RepresentationType: w.mkType(WebIFC.IFCLABEL, 'SweptSolid'),
    Items: [w.ref(extrusionId)],
  });

  const productDefinitionShapeId = w.nextId();
  w.writeLine({
    expressID: productDefinitionShapeId,
    type: WebIFC.IFCPRODUCTDEFINITIONSHAPE,
    Name: null,
    Description: null,
    Representations: [w.ref(shapeRepId)],
  });

  return { localPlacementId, productDefinitionShapeId, bodyItemId: extrusionId, usedFallback: false };
}

export function writeRailingEntity(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  predefinedType: RailingPredefinedType,
  ownerHistoryId: number,
  localPlacementId: number,
  productDefinitionShapeId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCRAILING,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: w.ref(productDefinitionShapeId),
    Tag: null,
    PredefinedType: { type: 3, value: predefinedType },
  });
  return id;
}
