/**
 * Vertex-specific finder — filters vertices by position, proximity, bounding box, etc.
 */

import type { Vec3 } from '../core/types.js';
import type { AnyShape, Vertex } from '../core/shapeTypes.js';
import { vecDistance } from '../core/vecOps.js';
import { type Result, ok, err } from '../core/result.js';
import { queryError } from '../core/errors.js';
import { vertexPosition } from '../topology/shapeFns.js';
import { type ShapeFinder, type Predicate, createTypedFinder } from './finderCore.js';

// ---------------------------------------------------------------------------
// Vertex finder interface
// ---------------------------------------------------------------------------

export interface VertexFinderFn extends ShapeFinder<Vertex> {
  /** Filter vertices nearest to a reference point. Returns a new finder that keeps only the closest vertex. */
  readonly nearestTo: (point: Vec3) => VertexFinderFn;
  /** Filter vertices at an exact position (within tolerance). */
  readonly atPosition: (point: Vec3, tolerance?: number) => VertexFinderFn;
  /** Filter vertices within an axis-aligned bounding box. */
  readonly withinBox: (min: Vec3, max: Vec3) => VertexFinderFn;
  /** Filter vertices at a given distance from a point. */
  readonly atDistance: (distance: number, point?: Vec3, tolerance?: number) => VertexFinderFn;
}

// ---------------------------------------------------------------------------
// NearestTo post-filter
// ---------------------------------------------------------------------------

/**
 * Wrap a vertex finder so that `findAll` and `findUnique` return only the
 * single vertex closest to `nearestPoint` among candidates that pass all
 * other filters.
 */
function withNearestPostFilter(baseFinder: VertexFinderFn, nearestPoint: Vec3): VertexFinderFn {
  const findAllNearest = (shape: AnyShape): Vertex[] => {
    const candidates = baseFinder.findAll(shape);
    if (candidates.length === 0) return [];

    let bestIdx = 0;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by length > 0
    let bestDist = vecDistance(vertexPosition(candidates[0]!), nearestPoint);
    for (let i = 1; i < candidates.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- i < candidates.length
      const d = vecDistance(vertexPosition(candidates[i]!), nearestPoint);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bestIdx is valid
    return [candidates[bestIdx]!];
  };

  const findUniqueNearest = (shape: AnyShape): Result<Vertex> => {
    const nearest = findAllNearest(shape);
    if (nearest.length === 0) {
      return err(
        queryError('FINDER_NOT_UNIQUE', 'Finder expected a unique match but found 0 element(s)')
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
    return ok(nearest[0]!);
  };

  return {
    ...baseFinder,
    findAll: findAllNearest,
    findUnique: findUniqueNearest,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function buildVertexFinder(filters: ReadonlyArray<Predicate<Vertex>>): VertexFinderFn {
  return createTypedFinder<Vertex, VertexFinderFn>(
    'vertex',
    filters,
    buildVertexFinder,
    (_base, withFilter) => ({
      nearestTo: (point) => withNearestPostFilter(buildVertexFinder(filters), point),

      atPosition: (point, tolerance = 1e-4) =>
        withFilter((vertex) => vecDistance(vertexPosition(vertex), point) < tolerance),

      withinBox: (min, max) =>
        withFilter((vertex) => {
          const pos = vertexPosition(vertex);
          return (
            pos[0] >= min[0] - 1e-6 &&
            pos[0] <= max[0] + 1e-6 &&
            pos[1] >= min[1] - 1e-6 &&
            pos[1] <= max[1] + 1e-6 &&
            pos[2] >= min[2] - 1e-6 &&
            pos[2] <= max[2] + 1e-6
          );
        }),

      atDistance: (distance, point: Vec3 = [0, 0, 0], tolerance = 1e-4) =>
        withFilter((vertex) => {
          const pos = vertexPosition(vertex);
          return Math.abs(vecDistance(pos, point) - distance) < tolerance;
        }),
    })
  );
}

/** Create an immutable vertex finder. */
export function vertexFinder(): VertexFinderFn {
  return buildVertexFinder([]);
}
