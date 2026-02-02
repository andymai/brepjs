/**
 * Helper utilities for working with finders and shapes.
 * Ported from replicad's finders/helpers.ts.
 */

import type { AnyShape, Face } from '../topology/shapes.js';
import { FaceFinder } from './faceFinder.js';
import { type Result, ok } from '../core/result.js';

export type SingleFace = Face | FaceFinder | ((f: FaceFinder) => FaceFinder);

export function getSingleFace(f: SingleFace, shape: AnyShape): Result<Face> {
  if ('normalAt' in f && typeof f.normalAt === 'function') return ok(f);
  const finder =
    f instanceof FaceFinder ? f : (f as (ff: FaceFinder) => FaceFinder)(new FaceFinder());
  return finder.find(shape, { unique: true });
}
