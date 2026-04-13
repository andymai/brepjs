/**
 * Consolidated shape finders — edge, face, and wire finders in a single file.
 *
 * These three finders share the same structure (direction-based filtering,
 * distance filtering, geometric predicates) and are merged here from the
 * former edgeFinder.ts, faceFinder.ts, and wireFinder.ts.
 */

import type { Vec3 } from '@/core/types.js';
import type { Edge, Face, Wire } from '@/core/shapeTypes.js';
import { getKernel } from '@/kernel/index.js';
import { vecDot, vecNormalize } from '@/core/vecOps.js';
import { DEG2RAD } from '@/core/constants.js';
import { getCurveType, curveLength, curveIsClosed } from '@/topology/curveFns.js';
import { normalAt as faceNormalAt, getSurfaceType, type SurfaceType } from '@/topology/faceFns.js';
import { measureArea } from '@/measurement/measureFns.js';
import { isOk } from '@/core/result.js';
import { getEdges } from '@/topology/topologyQueryFns.js';
import type { CurveType } from '@/core/typeDiscriminants.js';
import { type ShapeFinder, type Predicate, createTypedFinder } from './finderCore.js';
import { type DirectionInput, resolveDir } from './directionUtils.js';
import { distanceFromPointFilter } from './shapeDistanceFilter.js';

// ---------------------------------------------------------------------------
// Edge finder
// ---------------------------------------------------------------------------

export interface EdgeFinderFn extends ShapeFinder<Edge> {
  readonly inDirection: (dir?: DirectionInput, angle?: number) => EdgeFinderFn;
  readonly ofLength: (length: number, tolerance?: number) => EdgeFinderFn;
  readonly ofCurveType: (curveType: CurveType) => EdgeFinderFn;
  readonly parallelTo: (dir?: DirectionInput) => EdgeFinderFn;
  readonly atDistance: (distance: number, point?: Vec3) => EdgeFinderFn;
}

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

// ---------------------------------------------------------------------------
// Face finder
// ---------------------------------------------------------------------------

export interface FaceFinderFn extends ShapeFinder<Face> {
  readonly inDirection: (dir?: DirectionInput, angle?: number) => FaceFinderFn;
  readonly parallelTo: (dir?: DirectionInput) => FaceFinderFn;
  readonly ofSurfaceType: (surfaceType: SurfaceType) => FaceFinderFn;
  readonly ofArea: (area: number, tolerance?: number) => FaceFinderFn;
  readonly atDistance: (distance: number, point?: Vec3) => FaceFinderFn;
}

function faceDirectionFilter(dir: DirectionInput, angle: number): Predicate<Face> {
  const d = vecNormalize(resolveDir(dir));
  return (face: Face): boolean => {
    const n = faceNormalAt(face);
    const ang = Math.acos(Math.min(1, Math.abs(vecDot(vecNormalize(n), d))));
    return Math.abs(ang - DEG2RAD * angle) < 1e-6;
  };
}

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
        withFilter((face) => {
          const r = getSurfaceType(face);
          return isOk(r) && r.value === surfaceType;
        }),

      ofArea: (area, tolerance = 1e-3) =>
        withFilter((face) => {
          const r = measureArea(face);
          return isOk(r) && Math.abs(r.value - area) < tolerance;
        }),

      atDistance: (distance, point: Vec3 = [0, 0, 0]) =>
        withFilter(distanceFromPointFilter<Face>(distance, point, 1e-6)),
    })
  );
}

/** Create an immutable face finder. */
export function faceFinder(): FaceFinderFn {
  return buildFaceFinder([]);
}

// ---------------------------------------------------------------------------
// Wire finder
// ---------------------------------------------------------------------------

export interface WireFinderFn extends ShapeFinder<Wire> {
  readonly isClosed: () => WireFinderFn;
  readonly isOpen: () => WireFinderFn;
  readonly ofEdgeCount: (count: number) => WireFinderFn;
}

function buildWireFinder(filters: ReadonlyArray<Predicate<Wire>>): WireFinderFn {
  return createTypedFinder<Wire, WireFinderFn>(
    'wire',
    filters,
    buildWireFinder,
    (_base, withFilter) => ({
      isClosed: () => withFilter((wire) => curveIsClosed(wire)),

      isOpen: () => withFilter((wire) => !curveIsClosed(wire)),

      ofEdgeCount: (count) => withFilter((wire) => getEdges(wire).length === count),
    })
  );
}

/** Create an immutable wire finder. */
export function wireFinder(): WireFinderFn {
  return buildWireFinder([]);
}
