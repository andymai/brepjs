import { ok, type Result, type ValidSolid } from 'brepjs';
import type { BimError } from '../errors/bimError.js';
import type { AnyBimElement, BimCategory, BimElement } from '../types/bimTypes.js';
import { validateBody } from '../types/body.js';

export type ElementFields = {
  [C in BimCategory]: Omit<BimElement<C>, 'guid' | 'localId'>;
}[BimCategory];

export function retainedSolids(element: ElementFields): readonly ValidSolid[] {
  switch (element.representation) {
    case 'BODY':
      return element.geometry.solids;
    case 'NONE':
      return [];
    default:
      throw new Error('Unsupported element representation', { cause: element satisfies never });
  }
}

/** Snapshot ownership-bearing descriptors only; never freeze or clone native handles. */
export function protectElement(element: AnyBimElement): Result<AnyBimElement, BimError> {
  if (element.representation === 'BODY') {
    const body = validateBody(element.geometry);
    return body.ok ? ok(Object.freeze({ ...element, geometry: body.value })) : body;
  }
  return ok(Object.freeze(element));
}
