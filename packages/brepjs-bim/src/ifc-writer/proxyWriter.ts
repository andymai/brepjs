import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import { writeAxis2Placement3D } from './headerWriter.js';
import { writeTessellation } from './tessellationWriter.js';
import type { TessellationOutput } from './tessellationWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import type { ProxySpec } from '../specs/proxySpec.js';

export interface ProxyRepresentationIds {
  readonly localPlacementId: number;
  readonly productDefinitionShapeId: number;
  readonly tessellation: TessellationOutput;
}

/**
 * Writes the IfcLocalPlacement (at origin, relative to parentPlacementId) and a
 * tessellated body (IfcTriangulatedFaceSet) for a proxy's solid. The solid is
 * exported in its authored coordinate frame; placement is identity because proxy
 * solids carry their own world positions in the brepjs geometry.
 */
export function writeProxyGeometry(
  w: IfcWriter,
  spec: ProxySpec,
  geomSubContextId: number,
  parentPlacementId: number | null
): ProxyRepresentationIds {
  const placement3DId = writeAxis2Placement3D(w, [0, 0, 0]);
  const localPlacementId = w.nextId();
  w.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: parentPlacementId !== null ? w.ref(parentPlacementId) : null,
    RelativePlacement: w.ref(placement3DId),
  });

  const tessellation = writeTessellation(w, spec.solid, geomSubContextId, localPlacementId);

  return {
    localPlacementId,
    productDefinitionShapeId: tessellation.productDefinitionShapeId,
    tessellation,
  };
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
