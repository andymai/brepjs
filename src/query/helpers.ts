import { type AnyShape, Face } from '../topology/shapes.js';
import { FaceFinder } from './faceFinder.js';
import { type Result, ok } from '../core/result.js';

export type SingleFace = Face | FaceFinder | ((f: FaceFinder) => FaceFinder);

export function getSingleFace(f: SingleFace, shape: AnyShape): Result<Face> {
  // Use instanceof for proper type discrimination instead of duck-typing
  if (f instanceof Face) return ok(f);
  const finder =
    f instanceof FaceFinder ? f : (f as (ff: FaceFinder) => FaceFinder)(new FaceFinder());
  return finder.find(shape, { unique: true });
}
