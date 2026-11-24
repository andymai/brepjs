import { ok, type Result, type ValidSolid } from 'brepjs';
import type { BimError } from '../errors/bimError.js';
import type { AnyBimElement, BimCategory, BimElement } from '../types/bimTypes.js';
import { validateProductBody } from '../types/productBody.js';

export type ElementFields = {
  [C in BimCategory]: Omit<BimElement<C>, 'guid' | 'localId'>;
}[BimCategory];

export function retainedSolids(element: ElementFields): readonly ValidSolid[] {
  return element.representation === 'BODY' ? element.geometry.solids : [];
}

/** Snapshot ownership-bearing descriptors only; never freeze or clone native handles. */
export function protectElement(element: AnyBimElement): Result<AnyBimElement, BimError> {
  if (element.representation === 'BODY') {
    const body = validateProductBody(element.geometry);
    return body.ok ? ok(Object.freeze({ ...element, geometry: body.value })) : body;
  }
  return ok(Object.freeze(element));
}
