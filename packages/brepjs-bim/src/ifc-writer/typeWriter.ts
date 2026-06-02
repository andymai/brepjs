import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';

export type IfcTypeName =
  | 'IFCWALLTYPE'
  | 'IFCSLABTYPE'
  | 'IFCBEAMTYPE'
  | 'IFCCOLUMNTYPE'
  | 'IFCDOORTYPE'
  | 'IFCWINDOWTYPE';

export interface TypeWriteResult {
  typeExpressId: number;
  relExpressId: number;
}

const TYPE_CONSTANT: Record<IfcTypeName, number> = {
  IFCWALLTYPE: WebIFC.IFCWALLTYPE,
  IFCSLABTYPE: WebIFC.IFCSLABTYPE,
  IFCBEAMTYPE: WebIFC.IFCBEAMTYPE,
  IFCCOLUMNTYPE: WebIFC.IFCCOLUMNTYPE,
  IFCDOORTYPE: WebIFC.IFCDOORTYPE,
  IFCWINDOWTYPE: WebIFC.IFCWINDOWTYPE,
};

function commonTypeFields(
  w: IfcWriter,
  guid: IfcGuid,
  ownerHistoryId: number
): Record<string, unknown> {
  return {
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    ApplicableOccurrence: null,
    HasPropertySets: null,
    RepresentationMaps: null,
    Tag: null,
  };
}

function writeTypeObject(
  w: IfcWriter,
  typeName: IfcTypeName,
  guid: IfcGuid,
  ownerHistoryId: number,
  predefinedType: string
): number {
  const id = w.nextId();
  const base = commonTypeFields(w, guid, ownerHistoryId);

  // IfcDoorType carries door-specific required attributes and does not share the
  // ElementType/PredefinedType tail of the other IfcElementTypes.
  if (typeName === 'IFCDOORTYPE') {
    w.writeLine({
      expressID: id,
      type: WebIFC.IFCDOORTYPE,
      ...base,
      ElementType: null,
      PredefinedType: { type: 3, value: predefinedType },
      OperationType: { type: 3, value: 'NOTDEFINED' },
      ParameterTakesPrecedence: w.mkType(WebIFC.IFCBOOLEAN, false),
      UserDefinedOperationType: null,
    });
    return id;
  }

  // IfcWindowType (IFC4; supersedes IFC2x3 IfcWindowStyle) carries window-specific
  // required attributes: PredefinedType (IfcWindowTypeEnum) + PartitioningType
  // (IfcWindowTypePartitioningEnum), not the IFC2x3 ConstructionType/OperationType/Sizeable.
  if (typeName === 'IFCWINDOWTYPE') {
    w.writeLine({
      expressID: id,
      type: WebIFC.IFCWINDOWTYPE,
      ...base,
      ElementType: null,
      PredefinedType: { type: 3, value: predefinedType },
      PartitioningType: { type: 3, value: 'NOTDEFINED' },
      ParameterTakesPrecedence: w.mkType(WebIFC.IFCBOOLEAN, false),
      UserDefinedPartitioningType: null,
    });
    return id;
  }

  w.writeLine({
    expressID: id,
    type: TYPE_CONSTANT[typeName],
    ...base,
    ElementType: null,
    PredefinedType: { type: 3, value: predefinedType },
  });
  return id;
}

/**
 * Writes one IfcXxxType plus an IfcRelDefinesByType that
 * links it to the given occurrence expressIDs. `typeGuid`/`relGuid` are the
 * deterministic GUIDs derived for the type object and its relationship.
 */
export function writeIfcType(
  w: IfcWriter,
  ownerHistoryId: number,
  typeName: IfcTypeName,
  typeGuid: IfcGuid,
  relGuid: IfcGuid,
  predefinedType: string,
  occurrenceExpressIds: readonly number[]
): TypeWriteResult {
  const typeExpressId = writeTypeObject(w, typeName, typeGuid, ownerHistoryId, predefinedType);
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
