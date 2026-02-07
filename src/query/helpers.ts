import type { AnyShape, Face } from '../core/shapeTypes.js';
import { isFace } from '../core/shapeTypes.js';
import { faceFinder, type FaceFinderFn } from './finderFns.js';
import { type Result, ok } from '../core/result.js';

/**
 * Input that resolves to a single face — a direct Face, a FaceFinderFn,
 * or a finder callback.
 */
export type SingleFace = Face | FaceFinderFn | ((f: FaceFinderFn) => FaceFinderFn);

/** Resolve a {@link SingleFace} input to a concrete Face from the given shape. */
export function getSingleFace(f: SingleFace, shape: AnyShape): Result<Face> {
  // Handle functional finder instance (has _topoKind property)
  if (typeof f === 'object' && '_topoKind' in f) {
    return f.findUnique(shape);
  }

  // Use isFace type guard for proper type discrimination of Face values
  if (typeof f !== 'function' && isFace(f)) return ok(f);

  // Handle callback with functional finder
  const fnResult = (f as (ff: FaceFinderFn) => FaceFinderFn)(faceFinder());
  return fnResult.findUnique(shape);
}
