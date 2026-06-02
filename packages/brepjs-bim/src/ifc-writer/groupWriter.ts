import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';

// IfcZone and IfcSystem are pure grouping objects (subtypes of IfcGroup). They
// carry no geometry; their only attributes are Name, Description, and
// ObjectType. IfcGroup has no LongName slot in IFC4, so the human-readable
// `longName` from the spec is emitted as the entity Description.

/**
 * Emits an IfcZone grouping object. `longName` (a descriptive label such as
 * "Top Floor Thermal Zone") maps to the entity Description since IfcZone has no
 * LongName attribute; `objectType` maps to ObjectType.
 */
export function writeZoneEntity(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  longName: string | null,
  objectType: string | null,
  ownerHistoryId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCZONE,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: longName !== null ? w.mkType(WebIFC.IFCTEXT, longName) : null,
    ObjectType: objectType !== null ? w.mkType(WebIFC.IFCLABEL, objectType) : null,
  });
  return id;
}

/**
 * Emits an IfcSystem grouping object. As with {@link writeZoneEntity}, `longName`
 * maps to Description and `objectType` to ObjectType.
 */
export function writeSystemEntity(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  longName: string | null,
  objectType: string | null,
  ownerHistoryId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCSYSTEM,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: longName !== null ? w.mkType(WebIFC.IFCTEXT, longName) : null,
    ObjectType: objectType !== null ? w.mkType(WebIFC.IFCLABEL, objectType) : null,
  });
  return id;
}

/**
 * Links a group (zone or system) to its members via IfcRelAssignsToGroup.
 * `groupExpressId` becomes RelatingGroup; each member id becomes a RelatedObjects
 * reference. Member entities must already be written so their express ids exist.
 */
export function writeRelAssignsToGroup(
  w: IfcWriter,
  guid: IfcGuid,
  ownerHistoryId: number,
  groupExpressId: number,
  memberExpressIds: readonly number[]
): void {
  w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCRELASSIGNSTOGROUP,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    RelatedObjects: memberExpressIds.map((id) => w.ref(id)),
    RelatedObjectsType: null,
    RelatingGroup: w.ref(groupExpressId),
  });
}
