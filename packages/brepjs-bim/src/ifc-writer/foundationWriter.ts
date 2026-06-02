import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import { writeAxis2Placement3D, writeDirection } from './headerWriter.js';
import { writeProfile } from './geometryWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import type { FootingSpec, PileSpec, FootingPredefinedType, PilePredefinedType, PileConstructionType } from '../specs/foundationSpec.js';
import { toIfcLengthM } from '../units/units.js';

export interface FoundationRepresentationIds {
  localPlacementId: number;
  productDefinitionShapeId: number;
}

// Footing geometry mirrors a flat slab: a rectangle profile (length × width)
// extruded along local +Z by thickness. The profile is centered on
// (length/2, width/2) so the local frame matches the brepjs solid (corner at
// origin, extending to +X/+Y) — IFC rectangle profiles are centered on their
// position, so the position is shifted to compensate.
export function writeFootingGeometry(
  w: IfcWriter,
  spec: FootingSpec,
  geomSubContextId: number,
  parentPlacementId: number | null
): FoundationRepresentationIds {
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

  const lengthM = toIfcLengthM(spec.length);
  const widthM = toIfcLengthM(spec.width);
  const thicknessM = toIfcLengthM(spec.thickness);

  const profileOriginId = w.nextId();
  w.writeLine({
    expressID: profileOriginId,
    type: WebIFC.IFCCARTESIANPOINT,
    Coordinates: [
      w.mkType(WebIFC.IFCLENGTHMEASURE, lengthM / 2),
      w.mkType(WebIFC.IFCLENGTHMEASURE, widthM / 2),
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
    XDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, lengthM),
    YDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, widthM),
  });

  const extrusionPosId = writeAxis2Placement3D(w, [0, 0, 0]);
  const extrusionDirId = writeDirection(w, [0, 0, 1]);
  const extrusionId = w.nextId();
  w.writeLine({
    expressID: extrusionId,
    type: WebIFC.IFCEXTRUDEDAREASOLID,
    SweptArea: w.ref(profileId),
    Position: w.ref(extrusionPosId),
    ExtrudedDirection: w.ref(extrusionDirId),
    Depth: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, thicknessM),
  });

  return finishRepresentation(w, extrusionId, geomSubContextId, localPlacementId);
}

// Pile geometry: the cross-section profile sits in local XY and extrudes along
// local +Z (= spec.axisZ) by length. spec.axisX directly defines the profile's
// X orientation, which is exactly IFC's RefDirection.
export function writePileGeometry(
  w: IfcWriter,
  spec: PileSpec,
  geomSubContextId: number,
  parentPlacementId: number | null
): FoundationRepresentationIds {
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

  const profileId = writeProfile(w, spec.profile);
  const extrusionPosId = writeAxis2Placement3D(w, [0, 0, 0]);
  const extrusionDirId = writeDirection(w, [0, 0, 1]);
  const extrusionId = w.nextId();
  w.writeLine({
    expressID: extrusionId,
    type: WebIFC.IFCEXTRUDEDAREASOLID,
    SweptArea: w.ref(profileId),
    Position: w.ref(extrusionPosId),
    ExtrudedDirection: w.ref(extrusionDirId),
    Depth: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, toIfcLengthM(spec.length)),
  });

  return finishRepresentation(w, extrusionId, geomSubContextId, localPlacementId);
}

function finishRepresentation(
  w: IfcWriter,
  extrusionId: number,
  geomSubContextId: number,
  localPlacementId: number
): FoundationRepresentationIds {
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

  return { localPlacementId, productDefinitionShapeId };
}

export function writeFootingEntity(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  predefinedType: FootingPredefinedType,
  ownerHistoryId: number,
  localPlacementId: number,
  productDefinitionShapeId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCFOOTING,
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

export function writePileEntity(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  predefinedType: PilePredefinedType,
  constructionType: PileConstructionType | null,
  ownerHistoryId: number,
  localPlacementId: number,
  productDefinitionShapeId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCPILE,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: w.ref(productDefinitionShapeId),
    Tag: null,
    PredefinedType: { type: 3, value: predefinedType },
    ConstructionType: constructionType !== null ? { type: 3, value: constructionType } : null,
  });
  return id;
}
