import { type AnyShape, Face } from '../topology/shapes.js';
import { FaceFinder } from './faceFinder.js';
import { type Result, ok } from '../core/result.js';

/** Input that resolves to a single face — a direct Face, a FaceFinder, or a finder callback. */
export type SingleFace = Face | FaceFinder | ((f: FaceFinder) => FaceFinder);

/** Resolve a {@link SingleFace} input to a concrete Face from the given shape. */
export function getSingleFace(f: SingleFace, shape: AnyShape): Result<Face> {
  // Use instanceof for proper type discrimination instead of duck-typing
  if (f instanceof Face) return ok(f);
  const finder =
    f instanceof FaceFinder ? f : (f as (ff: FaceFinder) => FaceFinder)(new FaceFinder());
  return finder.find(shape, { unique: true });
}
