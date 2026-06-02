import type { IfcGuid } from '../identity/ifcGuid.js';
import type { LocalId } from '../identity/localId.js';
import type { MaterialLayer } from './materialTypes.js';
import type { ClassificationRef } from './classificationTypes.js';

export interface AggregatesRel {
  readonly kind: 'AGGREGATES';
  readonly guid: IfcGuid;
  readonly localId: LocalId;
  readonly relatingObject: LocalId;
  readonly relatedObjects: readonly LocalId[];
}

export interface ContainedInRel {
  readonly kind: 'CONTAINED_IN';
  readonly guid: IfcGuid;
  readonly localId: LocalId;
  readonly relatingStructure: LocalId;
  readonly relatedElements: readonly LocalId[];
}

export interface AssociatesMaterialRel {
  readonly kind: 'ASSOCIATES_MATERIAL';
  readonly guid: IfcGuid;
  readonly localId: LocalId;
  readonly materialName: string;
  readonly relatedObjects: readonly LocalId[];
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
  readonly localId: LocalId;
  readonly ref: ClassificationRef;
  readonly relatedObjects: readonly LocalId[];
}

export interface VoidsWallRel {
  readonly kind: 'VOIDS_WALL';
  readonly guid: IfcGuid;
  readonly localId: LocalId;
  readonly wallLocalId: LocalId;
  readonly openingLocalId: LocalId;
}

export interface VoidsSlabRel {
  readonly kind: 'VOIDS_SLAB';
  readonly guid: IfcGuid;
  readonly localId: LocalId;
  readonly slabLocalId: LocalId;
  readonly openingLocalId: LocalId;
}

export interface FillsOpeningRel {
  readonly kind: 'FILLS_OPENING';
  readonly guid: IfcGuid;
  readonly localId: LocalId;
  readonly openingLocalId: LocalId;
  readonly fillerLocalId: LocalId;
}

export type BimRelationship =
  | AggregatesRel
  | ContainedInRel
  | AssociatesMaterialRel
  | AssociatesClassificationRel
  | VoidsWallRel
  | VoidsSlabRel
  | FillsOpeningRel;
