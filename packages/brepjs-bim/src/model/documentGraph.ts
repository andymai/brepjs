import { RecordRef } from '../identity/recordRef.js';
import { specError, type BimError } from '../errors/bimError.js';
import type { AnyBimElement, BimCategory } from '../types/bimTypes.js';
import type { BimRelationship } from '../types/relationships.js';

export function relationshipEnds(rel: BimRelationship): readonly RecordRef[] {
  switch (rel.kind) {
    case 'AGGREGATES':
    case 'NESTS':
      return [rel.relatingObject, ...rel.relatedObjects];
    case 'CONTAINED_IN':
      return [rel.relatingStructure, ...rel.relatedElements];
    case 'ASSOCIATES_MATERIAL':
    case 'ASSOCIATES_CLASSIFICATION':
      return rel.relatedObjects;
    case 'VOIDS': return [rel.hostLocalId,rel.openingLocalId];
    case 'FILLS_OPENING':
      return [rel.openingLocalId, rel.fillerLocalId];
    case 'SPACE_BOUNDARY':
      return [rel.spaceLocalId, rel.elementLocalId];
    case 'COVERS_ELEMENT':
      return [rel.hostLocalId, rel.coveringLocalId];
    case 'ASSIGNS_TO_GROUP':
      return [rel.groupLocalId, ...rel.memberLocalIds];
    case 'CONNECTS_ELEMENTS':
    case 'CONNECTS_PATH_ELEMENTS':
      return [rel.relatingElementLocalId, rel.relatedElementLocalId];
  }
}

/** Preserve document references when snapshotting nested recipe or relationship data. */
export function snapshotData<T extends object>(input: T): T {
  const copy = structuredClone(input);
  function restore(original: object, target: object) {
    for (const [key, value] of Object.entries(original)) {
      if (value instanceof RecordRef) Object.defineProperty(target, key, { value });
      else if (value !== null && typeof value === 'object')
        restore(value, Reflect.get(target, key));
    }
    Object.freeze(target);
  }
  restore(input, copy);
  return copy;
}

export function graphError(code: string, message: string, ...references: RecordRef[]): BimError {
  return { ...specError(code, message), metadata: { references } };
}

function cyclic(parents: ReadonlyMap<RecordRef, RecordRef>): boolean {
  const done = new Set<RecordRef>();
  for (const start of parents.keys()) {
    const path = new Set<RecordRef>();
    let current: RecordRef | undefined = start;
    while (current !== undefined && !done.has(current)) {
      if (path.has(current)) return true;
      path.add(current);
      current = parents.get(current);
    }
    for (const ref of path) done.add(ref);
  }
  return false;
}

const spatial = new Set<BimCategory>([
  'SITE',
  'BUILDING',
  'STOREY',
  'BRIDGE',
  'BRIDGE_PART',
  'SPACE',
]);

export function validateDocumentGraph(
  records: ReadonlyMap<RecordRef, AnyBimElement>,
  edges: Iterable<BimRelationship>
): BimError | undefined {
  const parents = new Map<RecordRef, RecordRef>();
  const decomposition = new Map<RecordRef, RecordRef>();
  const contained = new Set<RecordRef>();
  const hosts = new Set<RecordRef>();
  const filled = new Set<RecordRef>();
  const fillers = new Set<RecordRef>();
  for (const { localId, placement } of records.values()) {
    if (placement?.kind === 'LOCAL_FRAME' && placement.relativeTo !== undefined) {
      const parent = records.get(placement.relativeTo);
      if (!parent?.placement)
        return graphError(
          'INVALID_PLACEMENT_PARENT',
          'Placement parent must be a live placeable record in this document',
          localId,
          placement.relativeTo
        );
      parents.set(localId, placement.relativeTo);
    } else if (placement && placement.kind !== 'LOCAL_FRAME') {
      for (const target of placement.references) {
        if (target.kind === 'DOCUMENT' && !records.has(target.record))
          return graphError(
            'INVALID_PLACEMENT_REFERENCE',
            'Missing document placement reference',
            localId,
            target.record
          );
      }
    }
  }
  if (cyclic(parents)) return graphError('PLACEMENT_CYCLE', 'Placement graph contains a cycle');
  for (const edge of edges) {
    const ends = relationshipEnds(edge);
    if (ends.some((ref) => !records.has(ref)))
      return graphError(
        'INVALID_ENDPOINT',
        'Relationship endpoint belongs to another document or is missing',
        ...ends
      );
    if (ends.length === 0 || new Set(ends).size !== ends.length)
      return graphError('INVALID_RELATIONSHIP', 'Empty or repeated relationship endpoint', ...ends);
    const category = (ref: RecordRef) => records.get(ref)?.category;
    const badRole = () =>
      graphError('INVALID_RELATIONSHIP_ROLE', `Invalid endpoint role for ${edge.kind}`, ...ends);
    switch (edge.kind) {
      case 'CONTAINED_IN': {
        const parent = category(edge.relatingStructure);
        if (!parent || !spatial.has(parent) || !edge.relatedElements.length) return badRole();
        for (const child of edge.relatedElements) {
          const kind = category(child);
          if (
            !kind ||
            (spatial.has(kind) && kind !== 'SPACE') ||
            ['OPENING', 'PROJECT', 'ZONE', 'SYSTEM'].includes(kind)
          )
            return badRole();
          if (contained.has(child))
            return graphError('MULTIPLE_CONTAINERS', 'Record already has a container', child);
          contained.add(child);
        }
        break;
      }
      case 'AGGREGATES':
      case 'NESTS':
        if (!edge.relatedObjects.length) return badRole();
        for (const child of edge.relatedObjects) {
          if (decomposition.has(child))
            return graphError(
              'MULTIPLE_DECOMPOSITION_PARENTS',
              'Record already has a decomposition parent',
              child
            );
          if (category(child) === 'PROJECT') return badRole();
          decomposition.set(child, edge.relatingObject);
        }
        break;
      case 'VOIDS':
        if (category(edge.openingLocalId)!=='OPENING' || category(edge.hostLocalId)!==edge.hostCategory || hosts.has(edge.openingLocalId)) return badRole();
        hosts.add(edge.openingLocalId);
        break;
      case 'FILLS_OPENING':
        if (
          category(edge.openingLocalId) !== 'OPENING' ||
          !['DOOR', 'WINDOW'].includes(category(edge.fillerLocalId) ?? '') ||
          filled.has(edge.openingLocalId) ||
          fillers.has(edge.fillerLocalId)
        )
          return badRole();
        filled.add(edge.openingLocalId);
        fillers.add(edge.fillerLocalId);
        break;
      case 'ASSIGNS_TO_GROUP':
        if (
          !edge.memberLocalIds.length ||
          !['ZONE', 'SYSTEM'].includes(category(edge.groupLocalId) ?? '')
        )
          return badRole();
        break;
      case 'COVERS_ELEMENT':
        if (category(edge.coveringLocalId) !== 'COVERING') return badRole();
        break;
      case 'SPACE_BOUNDARY':
        if (category(edge.spaceLocalId) !== 'SPACE') return badRole();
        break;
      default:
        break;
    }
  }
  if (cyclic(decomposition))
    return graphError('DECOMPOSITION_CYCLE', 'Decomposition graph contains a cycle');
  for (const record of records.values()) {
    if (record.category === 'OPENING' && !hosts.has(record.localId))
      return graphError('OPENING_WITHOUT_HOST', 'Opening requires a host', record.localId);
  }
  return undefined;
}

/** Remove one incident endpoint while preserving surviving members and relationship identity. */
export function withoutRecord(rel: BimRelationship, ref: RecordRef): BimRelationship | null {
  switch (rel.kind) {
    case 'AGGREGATES':
    case 'NESTS':
      if (rel.relatingObject === ref) return null;
      break;
    case 'CONTAINED_IN': {
      const relatedElements = rel.relatedElements.filter((child) => child !== ref);
      return rel.relatingStructure !== ref && relatedElements.length
        ? snapshotData({ ...rel, relatedElements })
        : null;
    }
    case 'ASSIGNS_TO_GROUP': {
      const memberLocalIds = rel.memberLocalIds.filter((child) => child !== ref);
      return rel.groupLocalId !== ref && memberLocalIds.length
        ? snapshotData({ ...rel, memberLocalIds })
        : null;
    }
    case 'ASSOCIATES_CLASSIFICATION':
    case 'ASSOCIATES_MATERIAL':
      break;
    default:
      return null;
  }
  const relatedObjects = rel.relatedObjects.filter((child) => child !== ref);
  return relatedObjects.length ? snapshotData({ ...rel, relatedObjects }) : null;
}
