import type { AnyShape, Face } from '../core/shapeTypes.js';
import { isFace } from '../core/shapeTypes.js';
import { FaceFinder } from './faceFinder.js';
import { type Result, ok } from '../core/result.js';

/** Input that resolves to a single face — a direct Face, a FaceFinder, or a finder callback. */
export type SingleFace = Face | FaceFinder | ((f: FaceFinder) => FaceFinder);

/** Resolve a {@link SingleFace} input to a concrete Face from the given shape. */
export function getSingleFace(f: SingleFace, shape: AnyShape): Result<Face> {
  // Use isFace type guard for proper type discrimination
  if (typeof f !== 'function' && !(f instanceof FaceFinder) && isFace(f)) return ok(f);
  const finder =
    f instanceof FaceFinder ? f : (f as (ff: FaceFinder) => FaceFinder)(new FaceFinder());
  return finder.find(shape, { unique: true });
}
