import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import { toIfcLengthM } from '../units/units.js';
import type { SiteSpec } from '../specs/spatialSpec.js';

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
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    LongName: null,
    Phase: null,
    RepresentationContexts: [w.ref(geomContextId)],
    UnitsInContext: w.ref(unitAssignmentId),
  });
  return id;
}

export function writeSite(
  w: IfcWriter,
  guid: IfcGuid,
  spec: SiteSpec,
  ownerHistoryId: number,
  localPlacementId: number
): { entityId: number; placementId: number } {
  const entityId = w.nextId();
  w.writeLine({
    expressID: entityId,
    type: WebIFC.IFCSITE,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, spec.name),
    Description: spec.description ? w.mkType(WebIFC.IFCTEXT, spec.description) : null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: null,
    LongName: null,
    CompositionType: { type: 3, value: spec.compositionType ?? 'ELEMENT' },
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
  localPlacementId: number
): { entityId: number; placementId: number } {
  const entityId = w.nextId();
  w.writeLine({
    expressID: entityId,
    type: WebIFC.IFCBUILDING,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
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
  elevationMm: number | undefined,
  ownerHistoryId: number,
  localPlacementId: number
): { entityId: number; placementId: number } {
  const entityId = w.nextId();
  w.writeLine({
    expressID: entityId,
    type: WebIFC.IFCBUILDINGSTOREY,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: null,
    LongName: null,
    CompositionType: { type: 3, value: 'ELEMENT' },
    Elevation:
      elevationMm === undefined
        ? null
        : w.mkType(WebIFC.IFCLENGTHMEASURE, toIfcLengthM(elevationMm)),
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
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: w.ref(productDefinitionShapeId),
    Tag: null,
    PredefinedType: null,
  });
  return id;
}

export function writeSlabEntity(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  _predefinedType: 'FLOOR' | 'ROOF' | 'LANDING' | 'BASESLAB' | 'NOTDEFINED',
  ownerHistoryId: number,
  localPlacementId: number,
  productDefinitionShapeId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCSLAB,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: w.ref(productDefinitionShapeId),
    Tag: null,
    // Carried by the paired type object (OJT001): occurrence stays empty.
    PredefinedType: null,
  });
  return id;
}

export type BeamPredefinedTypeIfc =
  | 'BEAM'
  | 'JOIST'
  | 'LINTEL'
  | 'HOLLOWCORE'
  | 'PURLIN'
  | 'RAFTER'
  | 'SPANDREL'
  | 'T_BEAM'
  | 'NOTDEFINED';

export function writeBeamEntity(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  _predefinedType: BeamPredefinedTypeIfc,
  ownerHistoryId: number,
  localPlacementId: number,
  productDefinitionShapeId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCBEAM,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: w.ref(productDefinitionShapeId),
    Tag: null,
    // Carried by the paired type object (OJT001): occurrence stays empty.
    PredefinedType: null,
  });
  return id;
}

export type ColumnPredefinedTypeIfc = 'COLUMN' | 'PILASTER' | 'NOTDEFINED';

export function writeColumnEntity(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  _predefinedType: ColumnPredefinedTypeIfc,
  ownerHistoryId: number,
  localPlacementId: number,
  productDefinitionShapeId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCCOLUMN,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: w.ref(productDefinitionShapeId),
    Tag: null,
    // Carried by the paired type object (OJT001): occurrence stays empty.
    PredefinedType: null,
  });
  return id;
}
