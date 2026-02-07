import type { AnyShape, Face } from '../core/shapeTypes.js';
import { isFace } from '../core/shapeTypes.js';
import { FaceFinder } from './faceFinder.js';
import { faceFinder, type FaceFinderFn } from './finderFns.js';
import { type Result, ok } from '../core/result.js';

/**
 * Input that resolves to a single face — a direct Face, a FaceFinder/FaceFinderFn,
 * or a finder callback.
 */
export type SingleFace =
  | Face
  | FaceFinder
  | FaceFinderFn
  | ((f: FaceFinderFn) => FaceFinderFn)
  | ((f: FaceFinder) => FaceFinder);

/** Resolve a {@link SingleFace} input to a concrete Face from the given shape. */
export function getSingleFace(f: SingleFace, shape: AnyShape): Result<Face> {
  // Handle FaceFinder class instance (deprecated)
  if (f instanceof FaceFinder) return f.find(shape, { unique: true });

  // Handle functional finder instance (has _topoKind property)
  if (typeof f === 'object' && '_topoKind' in f) {
    return f.findUnique(shape);
  }

  // Use isFace type guard for proper type discrimination of Face values
  if (typeof f !== 'function' && isFace(f)) return ok(f);

  // Handle callback — try functional faceFinder first, fall back to deprecated class.
  // The functional path is preferred but the callback may use deprecated FaceFinder
  // methods (e.g. inPlane) that don't exist on FaceFinderFn, so we catch and retry.
  try {
    const fnResult = (f as (ff: FaceFinderFn) => FaceFinderFn)(faceFinder());
    if (typeof fnResult === 'object' && '_topoKind' in fnResult) {
      return fnResult.findUnique(shape);
    }
  } catch {
    // Callback likely uses deprecated FaceFinder API — fall through
  }

  // Fall back to deprecated FaceFinder class for backward compat
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- backward compat bridge
  const finder = (f as (ff: FaceFinder) => FaceFinder)(new FaceFinder());
  return finder.find(shape, { unique: true });
}
