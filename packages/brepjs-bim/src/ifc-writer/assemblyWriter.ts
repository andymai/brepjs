import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';

/** IfcAssemblyPlaceEnum values; SITE for in-place assemblies, FACTORY for prefabricated. */
export type AssemblyPlaceIfc = 'SITE' | 'FACTORY' | 'NOTDEFINED';

/** IfcElementAssemblyTypeEnum values (IFC4). */
export type ElementAssemblyPredefinedTypeIfc =
  | 'ACCESSORY_ASSEMBLY'
  | 'ARCH'
  | 'BEAM_GRID'
  | 'BRACED_FRAME'
  | 'GIRDER'
  | 'REINFORCEMENT_UNIT'
  | 'RIGID_FRAME'
  | 'SLAB_FIELD'
  | 'TRUSS'
  | 'USERDEFINED'
  | 'NOTDEFINED';

/**
 * Emits an IfcElementAssembly grouping container. The assembly itself carries no
 * own geometry by default — parts contribute geometry and are linked via
 * {@link writeRelAggregatesElements} (or {@link writeRelNests} for ordered nesting).
 * Pass `productDefinitionShapeId` only when the assembly has an explicit envelope.
 */
export function writeElementAssemblyEntity(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  predefinedType: ElementAssemblyPredefinedTypeIfc,
  ownerHistoryId: number,
  localPlacementId: number | null,
  productDefinitionShapeId: number | null,
  assemblyPlace: AssemblyPlaceIfc = 'NOTDEFINED'
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCELEMENTASSEMBLY,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: localPlacementId !== null ? w.ref(localPlacementId) : null,
    Representation: productDefinitionShapeId !== null ? w.ref(productDefinitionShapeId) : null,
    Tag: null,
    AssemblyPlace: { type: 3, value: assemblyPlace },
    PredefinedType: { type: 3, value: predefinedType },
  });
  return id;
}

/**
 * Links child elements to an assembly via IfcRelAggregates. Use this for the
 * element-level (non-spatial) decomposition of an IfcElementAssembly into parts.
 * `relatedObjectIds` must be non-empty; an empty set is a no-op.
 */
export function writeRelAggregatesElements(
  w: IfcWriter,
  guid: IfcGuid,
  ownerHistoryId: number,
  relatingObjectId: number,
  relatedObjectIds: readonly number[]
): void {
  if (relatedObjectIds.length === 0) return;
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

/**
 * Links ordered child elements to a parent via IfcRelNests. Unlike
 * IfcRelAggregates, IfcRelNests preserves the order of `relatedObjectIds`,
 * which is the correct relationship for ordered members (e.g. stair/ramp
 * flights within their assembly). An empty set is a no-op.
 */
export function writeRelNests(
  w: IfcWriter,
  guid: IfcGuid,
  ownerHistoryId: number,
  relatingObjectId: number,
  relatedObjectIds: readonly number[]
): void {
  if (relatedObjectIds.length === 0) return;
  w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCRELNESTS,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    RelatingObject: w.ref(relatingObjectId),
    RelatedObjects: relatedObjectIds.map((id) => w.ref(id)),
  });
}
