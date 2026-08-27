import * as WebIFC from 'web-ifc';
import type { IfcGuid } from '../identity/ifcGuid.js';
import type {
  BridgePartSpec,
  BridgeSpec,
  EarthworksFillSpec,
} from '../specs/infrastructureSpec.js';
import type { IfcWriter } from './ifcWriter.js';
import { writeSpatialLocalPlacement } from './entityWriter.js';

export function writeBridge(
  w: IfcWriter,
  guid: IfcGuid,
  spec: BridgeSpec,
  ownerHistoryId: number,
  parentPlacementId: number | null
): { entityId: number; placementId: number } {
  const placementId = writeSpatialLocalPlacement(w, spec, parentPlacementId);
  const entityId = w.nextId();
  w.writeLine({
    expressID: entityId,
    type: WebIFC.IFCBRIDGE,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, spec.name),
    Description: spec.description ? w.mkType(WebIFC.IFCTEXT, spec.description) : null,
    ObjectType: null,
    ObjectPlacement: w.ref(placementId),
    Representation: null,
    LongName: null,
    CompositionType: { type: 3, value: spec.compositionType ?? 'ELEMENT' },
    PredefinedType: { type: 3, value: spec.predefinedType ?? 'NOTDEFINED' },
  });
  return { entityId, placementId };
}

export function writeBridgePart(
  w: IfcWriter,
  guid: IfcGuid,
  spec: BridgePartSpec,
  ownerHistoryId: number,
  parentPlacementId: number | null
): { entityId: number; placementId: number } {
  const placementId = writeSpatialLocalPlacement(w, spec, parentPlacementId);
  const entityId = w.nextId();
  w.writeLine({
    expressID: entityId,
    type: WebIFC.IFCBRIDGEPART,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, spec.name),
    Description: spec.description ? w.mkType(WebIFC.IFCTEXT, spec.description) : null,
    ObjectType: null,
    ObjectPlacement: w.ref(placementId),
    Representation: null,
    LongName: null,
    CompositionType: { type: 3, value: spec.compositionType ?? 'ELEMENT' },
    UsageType: { type: 3, value: spec.usageType },
    PredefinedType: { type: 3, value: spec.predefinedType ?? 'NOTDEFINED' },
  });
  return { entityId, placementId };
}

export function writeEarthworksFillEntity(
  w: IfcWriter,
  guid: IfcGuid,
  spec: EarthworksFillSpec,
  ownerHistoryId: number,
  localPlacementId: number,
  productDefinitionShapeId: number
): number {
  const entityId = w.nextId();
  w.writeLine({
    expressID: entityId,
    type: WebIFC.IFCEARTHWORKSFILL,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, spec.name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: w.ref(productDefinitionShapeId),
    Tag: null,
    PredefinedType: { type: 3, value: spec.predefinedType ?? 'NOTDEFINED' },
  });
  return entityId;
}
