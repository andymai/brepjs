import type { IfcGuid } from '../identity/ifcGuid.js';
import type { RecordRef } from '../identity/recordRef.js';
import type { MaterialLayer } from './materialTypes.js';
import type { ClassificationRef } from './classificationTypes.js';

export interface AggregatesRel {
  readonly kind: 'AGGREGATES';
  readonly guid: IfcGuid;
  readonly localId: RecordRef;
  readonly relatingObject: RecordRef;
  readonly relatedObjects: readonly RecordRef[];
}

export interface ContainedInRel {
  readonly kind: 'CONTAINED_IN';
  readonly guid: IfcGuid;
  readonly localId: RecordRef;
  readonly relatingStructure: RecordRef;
  readonly relatedElements: readonly RecordRef[];
}

export interface AssociatesMaterialRel {
  readonly kind: 'ASSOCIATES_MATERIAL';
  readonly guid: IfcGuid;
  readonly localId: RecordRef;
  readonly materialName: string;
  readonly relatedObjects: readonly RecordRef[];
  /**
   * When present, the element is associated via an IfcMaterialLayerSet built from
   * these layers instead of the bare `materialName` IfcMaterial.
   */
  readonly materialLayers?: readonly MaterialLayer[] | undefined;
  readonly layerSetName?: string | undefined;
}

export interface AssociatesClassificationRel {
  readonly kind: 'ASSOCIATES_CLASSIFICATION';
  readonly guid: IfcGuid;
  readonly localId: RecordRef;
  readonly ref: ClassificationRef;
  readonly relatedObjects: readonly RecordRef[];
}

export interface VoidsWallRel {
  readonly kind: 'VOIDS_WALL';
  readonly guid: IfcGuid;
  readonly localId: RecordRef;
  readonly wallLocalId: RecordRef;
  readonly openingLocalId: RecordRef;
}

export interface VoidsSlabRel {
  readonly kind: 'VOIDS_SLAB';
  readonly guid: IfcGuid;
  readonly localId: RecordRef;
  readonly slabLocalId: RecordRef;
  readonly openingLocalId: RecordRef;
}

export interface FillsOpeningRel {
  readonly kind: 'FILLS_OPENING';
  readonly guid: IfcGuid;
  readonly localId: RecordRef;
  readonly openingLocalId: RecordRef;
  readonly fillerLocalId: RecordRef;
}

export interface SpaceBoundaryRel {
  readonly kind: 'SPACE_BOUNDARY';
  readonly guid: IfcGuid;
  readonly localId: RecordRef;
  readonly spaceLocalId: RecordRef;
  readonly elementLocalId: RecordRef;
  readonly connectionType: 'PHYSICAL' | 'VIRTUAL' | 'NOTDEFINED';
}

/** Element-level decomposition of an IfcElementAssembly into its parts. */
export interface NestsRel {
  readonly kind: 'NESTS';
  readonly guid: IfcGuid;
  readonly localId: RecordRef;
  readonly relatingObject: RecordRef;
  readonly relatedObjects: readonly RecordRef[];
}

/** Logical connection between two elements (IfcRelConnectsElements). */
export interface ConnectsElementsRel {
  readonly kind: 'CONNECTS_ELEMENTS';
  readonly guid: IfcGuid;
  readonly localId: RecordRef;
  readonly relatingElementLocalId: RecordRef;
  readonly relatedElementLocalId: RecordRef;
  readonly description?: string | undefined;
}

/** Connection between two path-based elements at specified ends (IfcRelConnectsPathElements). */
export interface ConnectsPathElementsRel {
  readonly kind: 'CONNECTS_PATH_ELEMENTS';
  readonly guid: IfcGuid;
  readonly localId: RecordRef;
  readonly relatingElementLocalId: RecordRef;
  readonly relatedElementLocalId: RecordRef;
  readonly relatingConnectionType: 'ATSTART' | 'ATEND' | 'ATPATH' | 'NOTDEFINED';
  readonly relatedConnectionType: 'ATSTART' | 'ATEND' | 'ATPATH' | 'NOTDEFINED';
  readonly description?: string | undefined;
}

/** Links a covering to the building element it covers (IfcRelCoversBldgElements). */
export interface CoversElementRel {
  readonly kind: 'COVERS_ELEMENT';
  readonly guid: IfcGuid;
  readonly localId: RecordRef;
  readonly hostLocalId: RecordRef;
  readonly coveringLocalId: RecordRef;
}

/**
 * Assigns members to a grouping object — a zone or system (IfcRelAssignsToGroup).
 * `groupLocalId` is the IfcZone/IfcSystem; `memberLocalIds` are the assigned
 * spaces or elements.
 */
export interface AssignsToGroupRel {
  readonly kind: 'ASSIGNS_TO_GROUP';
  readonly guid: IfcGuid;
  readonly localId: RecordRef;
  readonly groupLocalId: RecordRef;
  readonly memberLocalIds: readonly RecordRef[];
}

export type BimRelationship =
  | AggregatesRel
  | ContainedInRel
  | AssociatesMaterialRel
  | AssociatesClassificationRel
  | VoidsWallRel
  | VoidsSlabRel
  | FillsOpeningRel
  | SpaceBoundaryRel
  | NestsRel
  | ConnectsElementsRel
  | ConnectsPathElementsRel
  | CoversElementRel
  | AssignsToGroupRel;
