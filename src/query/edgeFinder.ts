/**
 * Edge-specific finder -- filters edges by direction, length, curve type, etc.
 *
 * ADR-0006: direction filtering (dot product, angle comparison) stays in
 * TypeScript — kernel provides the tangent vectors, TS does lightweight
 * filtering on pre-extracted data.
 */

import type { Vec3 } from '../core/types.js';
import type { Edge } from '../core/shapeTypes.js';
import { getKernel } from '../kernel/index.js';
import { vecDot, vecNormalize } from '../core/vecOps.js';
import { DEG2RAD } from '../core/constants.js';
import { getCurveType, curveLength } from '../topology/curveFns.js';
import type { CurveType } from '../core/definitionMaps.js';
import { type ShapeFinder, type Predicate, createTypedFinder } from './finderCore.js';
import { type DirectionInput, resolveDir } from './directionUtils.js';
import { distanceFromPointFilter } from './shapeDistanceFilter.js';

// ---------------------------------------------------------------------------
// Edge finder interface
// ---------------------------------------------------------------------------

export interface EdgeFinderFn extends ShapeFinder<Edge> {
  readonly inDirection: (dir?: DirectionInput, angle?: number) => EdgeFinderFn;
  readonly ofLength: (length: number, tolerance?: number) => EdgeFinderFn;
  readonly ofCurveType: (curveType: CurveType) => EdgeFinderFn;
  readonly parallelTo: (dir?: DirectionInput) => EdgeFinderFn;
  readonly atDistance: (distance: number, point?: Vec3) => EdgeFinderFn;
}

// ---------------------------------------------------------------------------
// Direction filter (edge tangent at midpoint)
// ---------------------------------------------------------------------------

function edgeDirectionFilter(dir: DirectionInput, angle: number): Predicate<Edge> {
  const d = vecNormalize(resolveDir(dir));
  return (edge: Edge): boolean => {
    const kernel = getKernel();
    const [firstParam, lastParam] = kernel.curveParameters(edge.wrapped);
    const midParam = (firstParam + lastParam) / 2;
    const { tangent: rawTangent } = kernel.curveTangent(edge.wrapped, midParam);
    const tangent: Vec3 = vecNormalize(rawTangent);
    const ang = Math.acos(Math.min(1, Math.abs(vecDot(tangent, d))));
    return Math.abs(ang - DEG2RAD * angle) < 1e-6;
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function buildEdgeFinder(filters: ReadonlyArray<Predicate<Edge>>): EdgeFinderFn {
  return createTypedFinder<Edge, EdgeFinderFn>(
    'edge',
    filters,
    buildEdgeFinder,
    (_base, withFilter) => ({
      inDirection: (dir: DirectionInput = 'Z', angle = 0) =>
        withFilter(edgeDirectionFilter(dir, angle)),

      ofLength: (length, tolerance = 1e-3) =>
        withFilter((edge) => Math.abs(curveLength(edge) - length) < tolerance),

      ofCurveType: (curveType) => withFilter((edge) => getCurveType(edge) === curveType),

      parallelTo: (dir: DirectionInput = 'Z') => buildEdgeFinder(filters).inDirection(dir, 0),

      atDistance: (distance, point: Vec3 = [0, 0, 0]) =>
        withFilter(distanceFromPointFilter<Edge>(distance, point, 1e-6)),
    })
  );
}

/** Create an immutable edge finder. */
export function edgeFinder(): EdgeFinderFn {
  return buildEdgeFinder([]);
}
