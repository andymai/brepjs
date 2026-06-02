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
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    RelatingObject: w.ref(relatingObjectId),
    RelatedObjects: relatedObjectIds.map((id) => w.ref(id)),
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
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    RelatedElements: relatedElementIds.map((id) => w.ref(id)),
    RelatingStructure: w.ref(relatingStructureId),
  });
}
