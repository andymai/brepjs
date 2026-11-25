import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import { writeAxis2Placement3D, writeDirection } from './headerWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import { toIfcLengthM } from '../units/units.js';
import type { CurtainWallSpec } from '../specs/curtainWallSpec.js';

// Emits IfcLocalPlacement + IfcExtrudedAreaSolid + IfcShapeRepresentation +
// IfcProductDefinitionShape for a single box component. The box footprint lies
// in local XY (size X × size Y) extruded along local +Z; the component's origin
// is carried as an offset relative to the curtain wall's placement.
export function writeComponentGeometry(
  w: IfcWriter,
  size: readonly [number, number, number],
  geomSubContextId: number,
  localPlacementId: number
): { localPlacementId: number; productDefinitionShapeId: number } {
  const [sizeX, sizeY, sizeZ] = size;
  const xDimM = toIfcLengthM(sizeX);
  const yDimM = toIfcLengthM(sizeY);
  const depthM = toIfcLengthM(sizeZ);

  // IFC rectangle profiles are centred on their position; shift the profile
  // origin to (sizeX/2, sizeY/2) so the solid corner sits at the local origin
  // and matches the brepjs template geometry.
  const profileOriginId = w.nextId();
  w.writeLine({
    expressID: profileOriginId,
    type: WebIFC.IFCCARTESIANPOINT,
    Coordinates: [
      w.mkType(WebIFC.IFCLENGTHMEASURE, xDimM / 2),
      w.mkType(WebIFC.IFCLENGTHMEASURE, yDimM / 2),
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
    XDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, xDimM),
    YDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, yDimM),
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
    Depth: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, depthM),
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

  return { localPlacementId, productDefinitionShapeId };
}

export function writePlate(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  ownerHistoryId: number,
  localPlacementId: number,
  productDefinitionShapeId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCPLATE,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: w.ref(productDefinitionShapeId),
    Tag: null,
    PredefinedType: { type: 3, value: 'CURTAIN_PANEL' },
  });
  return id;
}

export function writeMember(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  ownerHistoryId: number,
  localPlacementId: number,
  productDefinitionShapeId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCMEMBER,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: w.ref(productDefinitionShapeId),
    Tag: null,
    PredefinedType: { type: 3, value: 'MULLION' },
  });
  return id;
}

export function writeCurtainWall(
  w: IfcWriter,
  spec: CurtainWallSpec,
  guid: IfcGuid,
  name: string,
  ownerHistoryId: number,
  wallPlacementId: number
): number {
  const predefinedType = spec.predefinedType ?? 'NOTDEFINED';
  const curtainWallId = w.nextId();
  w.writeLine({
    expressID: curtainWallId,
    type: WebIFC.IFCCURTAINWALL,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(wallPlacementId),
    Representation: null,
    Tag: null,
    PredefinedType: { type: 3, value: predefinedType },
  });

  return curtainWallId;
}
