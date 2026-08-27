import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import type { ProxySpec } from '../specs/proxySpec.js';
import {
  writeTessellatedProductGeometry,
  type TessellatedProductRepresentationIds,
} from './tessellatedProductWriter.js';

export type ProxyRepresentationIds = TessellatedProductRepresentationIds;

/**
 * Writes the IfcLocalPlacement (at origin, relative to parentPlacementId) and a
 * tessellated body (IfcTriangulatedFaceSet) for a proxy's solid. Solid
 * coordinates are emitted as supplied; the caller is responsible for matching
 * them to the containing spatial structure's frame.
 */
export function writeProxyGeometry(
  w: IfcWriter,
  spec: ProxySpec,
  geomSubContextId: number,
  parentPlacementId: number | null
): ProxyRepresentationIds {
  return writeTessellatedProductGeometry(w, spec.solid, geomSubContextId, parentPlacementId);
}

export function writeProxyEntity(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  predefinedType: string,
  ownerHistoryId: number,
  localPlacementId: number,
  productDefinitionShapeId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCBUILDINGELEMENTPROXY,
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
