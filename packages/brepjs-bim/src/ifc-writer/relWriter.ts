import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';

export function writeRelAggregates(
  w: IfcWriter,
  guid: IfcGuid,
  ownerHistoryId: number,
  relatingObjectId: number,
  relatedObjectIds: number[]
): void {
  w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCRELAGGREGATES,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: { type: 5, value: ownerHistoryId },
    Name: null,
    Description: null,
    RelatingObject: { type: 5, value: relatingObjectId },
    RelatedObjects: relatedObjectIds.map((id) => ({ type: 5, value: id })),
  });
}

export function writeRelContainedInSpatialStructure(
  w: IfcWriter,
  guid: IfcGuid,
  ownerHistoryId: number,
  relatingStructureId: number,
  relatedElementIds: number[]
): void {
  w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: { type: 5, value: ownerHistoryId },
    Name: null,
    Description: null,
    RelatedElements: relatedElementIds.map((id) => ({ type: 5, value: id })),
    RelatingStructure: { type: 5, value: relatingStructureId },
  });
}

export function writeRelAssociatesMaterial(
  w: IfcWriter,
  guid: IfcGuid,
  ownerHistoryId: number,
  materialName: string,
  relatedObjectIds: number[]
): void {
  const materialId = w.nextId();
  w.writeLine({
    expressID: materialId,
    type: WebIFC.IFCMATERIAL,
    Name: w.mkType(WebIFC.IFCLABEL, materialName),
    Description: null,
    Category: null,
  });
  w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCRELASSOCIATESMATERIAL,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: { type: 5, value: ownerHistoryId },
    Name: null,
    Description: null,
    RelatedObjects: relatedObjectIds.map((id) => ({ type: 5, value: id })),
    RelatingMaterial: { type: 5, value: materialId },
  });
}
