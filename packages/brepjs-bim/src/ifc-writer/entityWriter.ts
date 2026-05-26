import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import { writeAxis2Placement3D } from './headerWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import { toIfcLengthM } from '../units/units.js';

export function writeProject(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  ownerHistoryId: number,
  unitAssignmentId: number,
  geomContextId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCPROJECT,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: { type: 5, value: ownerHistoryId },
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    LongName: null,
    Phase: null,
    RepresentationContexts: [{ type: 5, value: geomContextId }],
    UnitsInContext: { type: 5, value: unitAssignmentId },
  });
  return id;
}

export function writeSite(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  ownerHistoryId: number
): { entityId: number; placementId: number } {
  const placement3DId = writeAxis2Placement3D(w, [0, 0, 0]);
  const localPlacementId = w.nextId();
  w.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: null,
    RelativePlacement: { type: 5, value: placement3DId },
  });
  const entityId = w.nextId();
  w.writeLine({
    expressID: entityId,
    type: WebIFC.IFCSITE,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: { type: 5, value: ownerHistoryId },
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: { type: 5, value: localPlacementId },
    Representation: null,
    LongName: null,
    CompositionType: { type: 3, value: 'ELEMENT' },
    RefLatitude: null,
    RefLongitude: null,
    RefElevation: null,
    LandTitleNumber: null,
    SiteAddress: null,
  });
  return { entityId, placementId: localPlacementId };
}

export function writeBuilding(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  ownerHistoryId: number,
  parentPlacementId: number
): { entityId: number; placementId: number } {
  const placement3DId = writeAxis2Placement3D(w, [0, 0, 0]);
  const localPlacementId = w.nextId();
  w.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: { type: 5, value: parentPlacementId },
    RelativePlacement: { type: 5, value: placement3DId },
  });
  const entityId = w.nextId();
  w.writeLine({
    expressID: entityId,
    type: WebIFC.IFCBUILDING,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: { type: 5, value: ownerHistoryId },
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: { type: 5, value: localPlacementId },
    Representation: null,
    LongName: null,
    CompositionType: { type: 3, value: 'ELEMENT' },
    ElevationOfRefHeight: null,
    ElevationOfTerrain: null,
    BuildingAddress: null,
  });
  return { entityId, placementId: localPlacementId };
}

export function writeStorey(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  elevationMm: number,
  ownerHistoryId: number,
  parentPlacementId: number
): { entityId: number; placementId: number } {
  const elevM = toIfcLengthM(elevationMm);
  const placement3DId = writeAxis2Placement3D(w, [0, 0, elevM]);
  const localPlacementId = w.nextId();
  w.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: { type: 5, value: parentPlacementId },
    RelativePlacement: { type: 5, value: placement3DId },
  });
  const entityId = w.nextId();
  w.writeLine({
    expressID: entityId,
    type: WebIFC.IFCBUILDINGSTOREY,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: { type: 5, value: ownerHistoryId },
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: { type: 5, value: localPlacementId },
    Representation: null,
    LongName: null,
    CompositionType: { type: 3, value: 'ELEMENT' },
    Elevation: w.mkType(WebIFC.IFCLENGTHMEASURE, elevM),
  });
  return { entityId, placementId: localPlacementId };
}

export function writeWallEntity(
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
    type: WebIFC.IFCWALL,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: { type: 5, value: ownerHistoryId },
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: { type: 5, value: localPlacementId },
    Representation: { type: 5, value: productDefinitionShapeId },
    Tag: null,
    PredefinedType: null,
  });
  return id;
}
