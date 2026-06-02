import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import type { RoofPredefinedType } from '../specs/roofSpec.js';

/** IfcRoofTypeEnum values, mirrored from {@link RoofPredefinedType}. */
export type RoofTypeEnum = RoofPredefinedType;

/**
 * Writes an IfcRoof occurrence. `localPlacementId` and `productDefinitionShapeId`
 * are the IfcLocalPlacement and IfcProductDefinitionShape express IDs produced by
 * the geometry layer; pass `null` for either when not available.
 */
export function writeRoofEntity(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  predefinedType: RoofTypeEnum,
  ownerHistoryId: number,
  localPlacementId: number | null,
  productDefinitionShapeId: number | null
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCROOF,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: localPlacementId === null ? null : w.ref(localPlacementId),
    Representation: productDefinitionShapeId === null ? null : w.ref(productDefinitionShapeId),
    Tag: null,
    PredefinedType: { type: 3, value: predefinedType },
  });
  return id;
}

export interface RoofTypeWriteResult {
  typeExpressId: number;
  relExpressId: number;
}

/**
 * Writes one IfcRoofType plus an IfcRelDefinesByType linking it to the given
 * occurrence express IDs. `typeGuid`/`relGuid` are the deterministic GUIDs
 * derived for the type object and its relationship.
 */
export function writeRoofType(
  w: IfcWriter,
  ownerHistoryId: number,
  typeGuid: IfcGuid,
  relGuid: IfcGuid,
  predefinedType: RoofTypeEnum,
  occurrenceExpressIds: readonly number[]
): RoofTypeWriteResult {
  const typeExpressId = w.nextId();
  w.writeLine({
    expressID: typeExpressId,
    type: WebIFC.IFCROOFTYPE,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, typeGuid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    ApplicableOccurrence: null,
    HasPropertySets: null,
    RepresentationMaps: null,
    Tag: null,
    ElementType: null,
    PredefinedType: { type: 3, value: predefinedType },
  });
  const relExpressId = w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCRELDEFINESBYTYPE,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, relGuid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    RelatedObjects: occurrenceExpressIds.map((eid) => w.ref(eid)),
    RelatingType: w.ref(typeExpressId),
  });
  return { typeExpressId, relExpressId };
}
