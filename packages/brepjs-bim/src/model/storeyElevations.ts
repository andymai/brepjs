import type { RecordRef } from '../identity/recordRef.js';
import type { BimDocument } from './bimDocument.js';

/** Heights in the enclosing Building's frame, in mm. Aggregation identifies
 * the datum. The independent placement chains determine the height. */
export function storeyElevations(document: BimDocument): ReadonlyMap<RecordRef, number> {
  const parents = new Map<RecordRef, RecordRef>();
  for (const edge of document.getAllRelationships()) {
    if (edge.kind === 'AGGREGATES') {
      for (const child of edge.relatedObjects) parents.set(child, edge.relatingObject);
    }
  }

  const elevations = new Map<RecordRef, number>();
  for (const storey of document.getAllElements()) {
    if (storey.category !== 'STOREY') continue;
    let parent = parents.get(storey.localId);
    while (parent !== undefined && document.getElement(parent).category !== 'BUILDING')
      parent = parents.get(parent);
    if (parent === undefined) continue;
    const relative = document.frame(storey.localId, parent);
    if (relative.ok) elevations.set(storey.localId, relative.value.frame.matrix[14]);
  }
  return elevations;
}
