import type { IfcGuid } from '../identity/ifcGuid.js';
import type { LocalId } from '../identity/localId.js';

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
}

export type BimRelationship =
  | AggregatesRel
  | ContainedInRel
  | AssociatesMaterialRel;
