/**
 * Face-specific finder -- filters faces by normal direction, surface type, area, etc.
 */

import type { Vec3 } from '../core/types.js';
import type { Face } from '../core/shapeTypes.js';
import { vecDot, vecNormalize } from '../core/vecOps.js';
import { DEG2RAD } from '../core/constants.js';
import { normalAt as faceNormalAt, getSurfaceType, type SurfaceType } from '../topology/faceFns.js';
import { measureArea } from '../measurement/measureFns.js';
import { unwrap } from '../core/result.js';
import { type ShapeFinder, type Predicate, createTypedFinder } from './finderCore.js';
import { type DirectionInput, resolveDir } from './directionUtils.js';
import { distanceFromPointFilter } from './shapeDistanceFilter.js';

// ---------------------------------------------------------------------------
// Face finder interface
// ---------------------------------------------------------------------------

export interface FaceFinderFn extends ShapeFinder<Face> {
  readonly inDirection: (dir?: DirectionInput, angle?: number) => FaceFinderFn;
  readonly parallelTo: (dir?: DirectionInput) => FaceFinderFn;
  readonly ofSurfaceType: (surfaceType: SurfaceType) => FaceFinderFn;
  readonly ofArea: (area: number, tolerance?: number) => FaceFinderFn;
  readonly atDistance: (distance: number, point?: Vec3) => FaceFinderFn;
}

// ---------------------------------------------------------------------------
// Direction filter (face normal)
// ---------------------------------------------------------------------------

function faceDirectionFilter(dir: DirectionInput, angle: number): Predicate<Face> {
  const d = vecNormalize(resolveDir(dir));
  return (face: Face): boolean => {
    const n = faceNormalAt(face);
    const ang = Math.acos(Math.min(1, Math.abs(vecDot(vecNormalize(n), d))));
    return Math.abs(ang - DEG2RAD * angle) < 1e-6;
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function buildFaceFinder(filters: ReadonlyArray<Predicate<Face>>): FaceFinderFn {
  return createTypedFinder<Face, FaceFinderFn>(
    'face',
    filters,
    buildFaceFinder,
    (_base, withFilter) => ({
      inDirection: (dir: DirectionInput = 'Z', angle = 0) =>
        withFilter(faceDirectionFilter(dir, angle)),

      parallelTo: (dir: DirectionInput = 'Z') => buildFaceFinder(filters).inDirection(dir, 0),

      ofSurfaceType: (surfaceType) =>
        withFilter((face) => unwrap(getSurfaceType(face)) === surfaceType),

      ofArea: (area, tolerance = 1e-3) =>
        withFilter((face) => Math.abs(measureArea(face) - area) < tolerance),

      atDistance: (distance, point: Vec3 = [0, 0, 0]) =>
        withFilter(distanceFromPointFilter<Face>(distance, point, 1e-6)),
    })
  );
}

/** Create an immutable face finder. */
export function faceFinder(): FaceFinderFn {
  return buildFaceFinder([]);
}
