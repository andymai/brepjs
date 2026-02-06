/**
 * Functional, immutable finder — filter-based shape querying with branded types.
 * Each filter method returns a NEW finder (immutable builder pattern).
 *
 * Usage:
 *   const edges = edgeFinder()
 *     .inDirection('Z')
 *     .ofLength(10, 0.01)
 *     .find(shape);
 */

import { getKernel } from '../kernel/index.js';
import type { Vec3 } from '../core/types.js';
import { toOcPnt } from '../core/occtBoundary.js';
import { gcWithScope } from '../core/disposal.js';
import { vecDot, vecNormalize, vecDistance } from '../core/vecOps.js';
import { DEG2RAD } from '../core/constants.js';
import type { AnyShape, Edge, Face, Wire, Vertex } from '../core/shapeTypes.js';
import { castShape } from '../core/shapeTypes.js';
import { iterTopo, downcast } from '../topology/cast.js';
import { getHashCode, isSameShape, vertexPosition } from '../topology/shapeFns.js';
import { normalAt as faceNormalAt, getSurfaceType, type SurfaceType } from '../topology/faceFns.js';
import { measureArea } from '../measurement/measureFns.js';
import { getCurveType, curveLength, curveIsClosed } from '../topology/curveFns.js';
import type { CurveType } from '../core/definitionMaps.js';
import { type Result, ok, err, unwrap } from '../core/result.js';
import { queryError } from '../core/errors.js';

// ---------------------------------------------------------------------------
// Predicate type
// ---------------------------------------------------------------------------

type Predicate<T> = (element: T) => boolean;

// ---------------------------------------------------------------------------
// Immutable finder
// ---------------------------------------------------------------------------

export interface ShapeFinder<T extends AnyShape> {
  /** Add a custom predicate filter. Returns new finder. */
  readonly when: (predicate: Predicate<T>) => ShapeFinder<T>;
  /** Filter to elements in a list. Returns new finder. */
  readonly inList: (elements: T[]) => ShapeFinder<T>;
  /** Invert a filter. Returns new finder. */
  readonly not: (builderFn: (f: ShapeFinder<T>) => ShapeFinder<T>) => ShapeFinder<T>;
  /** Combine filters with OR. Returns new finder. */
  readonly either: (fns: ((f: ShapeFinder<T>) => ShapeFinder<T>)[]) => ShapeFinder<T>;
  /** Find matching elements from a shape. */
  readonly find: ((shape: AnyShape) => T[]) &
    ((shape: AnyShape, opts: { unique: true }) => Result<T>);
  /** Check if an element passes all filters. */
  readonly shouldKeep: (element: T) => boolean;

  // ── Internal (for composition) ──
  readonly _filters: ReadonlyArray<Predicate<T>>;
  readonly _topoKind: 'edge' | 'face' | 'wire' | 'vertex';
}

function createFinder<T extends AnyShape>(
  topoKind: 'edge' | 'face' | 'wire' | 'vertex',
  filters: ReadonlyArray<Predicate<T>>,
  getNormal: (element: T) => Vec3 | null
): ShapeFinder<T> {
  const withFilter = (pred: Predicate<T>): ShapeFinder<T> =>
    createFinder(topoKind, [...filters, pred], getNormal);

  const shouldKeep = (element: T): boolean => filters.every((f) => f(element));

  // Single-pass extraction avoids creating intermediate arrays
  // (compared to Array.from().map().filter() which creates 3 arrays)
  const extractElements = (shape: AnyShape): T[] => {
    const result: T[] = [];
    for (const raw of iterTopo(shape.wrapped, topoKind)) {
      const element = castShape(unwrap(downcast(raw))) as T;
      if (shouldKeep(element)) {
        result.push(element);
      }
    }
    return result;
  };

  const finder: ShapeFinder<T> = {
    _filters: filters,
    _topoKind: topoKind,

    when: (pred) => withFilter(pred),

    inList: (elements) => {
      const hashSet = new Map<number, T[]>();
      for (const e of elements) {
        const h = getHashCode(e);
        const bucket = hashSet.get(h);
        if (bucket) bucket.push(e);
        else hashSet.set(h, [e]);
      }
      return withFilter((el) => {
        const bucket = hashSet.get(getHashCode(el));
        return !!bucket && bucket.some((e) => isSameShape(e, el));
      });
    },

    not: (builderFn) => {
      const inner = builderFn(createFinder(topoKind, [], getNormal));
      return withFilter((el) => !inner.shouldKeep(el));
    },

    either: (fns) => {
      const builtFinders = fns.map((fn) => fn(createFinder(topoKind, [], getNormal)));
      return withFilter((el) => builtFinders.some((f) => f.shouldKeep(el)));
    },

    find: ((shape: AnyShape, opts?: { unique?: boolean }) => {
      const elements = extractElements(shape);
      if (opts?.unique) {
        if (elements.length !== 1) {
          return err(
            queryError(
              'FINDER_NOT_UNIQUE',
              `Finder expected a unique match but found ${elements.length} element(s)`
            )
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return ok(elements[0]!);
      }
      return elements;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- overload implementation
    }) as any,

    shouldKeep,
  };

  return finder;
}

// ---------------------------------------------------------------------------
// Direction constants
// ---------------------------------------------------------------------------

const DIRECTIONS: Record<string, Vec3> = {
  X: [1, 0, 0],
  Y: [0, 1, 0],
  Z: [0, 0, 1],
};

function resolveDir(dir: 'X' | 'Y' | 'Z' | Vec3): Vec3 {
  if (typeof dir === 'string') return DIRECTIONS[dir] ?? [0, 0, 1];
  return dir;
}

// ---------------------------------------------------------------------------
// Edge finder
// ---------------------------------------------------------------------------

export interface EdgeFinderFn extends ShapeFinder<Edge> {
  readonly inDirection: (dir?: 'X' | 'Y' | 'Z' | Vec3, angle?: number) => EdgeFinderFn;
  readonly ofLength: (length: number, tolerance?: number) => EdgeFinderFn;
  readonly ofCurveType: (curveType: CurveType) => EdgeFinderFn;
  readonly parallelTo: (dir?: 'X' | 'Y' | 'Z' | Vec3) => EdgeFinderFn;
  readonly atDistance: (distance: number, point?: Vec3) => EdgeFinderFn;
}

/** Create an immutable edge finder. */
export function edgeFinder(): EdgeFinderFn {
  return createEdgeFinder([]);
}

function createEdgeFinder(filters: ReadonlyArray<Predicate<Edge>>): EdgeFinderFn {
  const base = createFinder<Edge>('edge', filters, () => null);

  const withFilter = (pred: Predicate<Edge>): EdgeFinderFn => createEdgeFinder([...filters, pred]);

  return {
    ...base,
    when: (pred) => createEdgeFinder([...filters, pred]),
    inList: (elements) => createEdgeFinder([...base.inList(elements)._filters]),
    not: (fn) =>
      createEdgeFinder([...base.not(fn as (f: ShapeFinder<Edge>) => ShapeFinder<Edge>)._filters]),
    either: (fns) =>
      createEdgeFinder([
        ...base.either(fns as ((f: ShapeFinder<Edge>) => ShapeFinder<Edge>)[])._filters,
      ]),

    inDirection: (dir = 'Z', angle = 0) => {
      const d = vecNormalize(resolveDir(dir));
      return withFilter((edge) => {
        const oc = getKernel().oc;
        const r = gcWithScope();

        const adaptor = r(new oc.BRepAdaptor_Curve_2(edge.wrapped));
        const tmpPnt = r(new oc.gp_Pnt_1());
        const tmpVec = r(new oc.gp_Vec_1());
        const mid = (Number(adaptor.FirstParameter()) + Number(adaptor.LastParameter())) / 2;
        adaptor.D1(mid, tmpPnt, tmpVec);
        const tangent: Vec3 = vecNormalize([tmpVec.X(), tmpVec.Y(), tmpVec.Z()]);
        const ang = Math.acos(Math.min(1, Math.abs(vecDot(tangent, d))));
        return Math.abs(ang - DEG2RAD * angle) < 1e-6;
      });
    },

    ofLength: (length, tolerance = 1e-3) =>
      withFilter((edge) => Math.abs(curveLength(edge) - length) < tolerance),

    ofCurveType: (curveType) => withFilter((edge) => getCurveType(edge) === curveType),

    parallelTo: (dir = 'Z') => createEdgeFinder([...filters]).inDirection(dir, 0),

    atDistance: (distance, point = [0, 0, 0]) =>
      withFilter((edge) => {
        const oc = getKernel().oc;
        const r = gcWithScope();

        const pnt = r(toOcPnt(point));
        const vtxMaker = r(new oc.BRepBuilderAPI_MakeVertex(pnt));
        const vtx = vtxMaker.Vertex();

        const distTool = r(new oc.BRepExtrema_DistShapeShape_1());
        distTool.LoadS1(vtx);
        distTool.LoadS2(edge.wrapped);

        const progress = r(new oc.Message_ProgressRange_1());
        distTool.Perform(progress);
        const d = distTool.Value();

        return Math.abs(d - distance) < 1e-6;
      }),
  };
}

// ---------------------------------------------------------------------------
// Face finder
// ---------------------------------------------------------------------------

export interface FaceFinderFn extends ShapeFinder<Face> {
  readonly inDirection: (dir?: 'X' | 'Y' | 'Z' | Vec3, angle?: number) => FaceFinderFn;
  readonly parallelTo: (dir?: 'X' | 'Y' | 'Z' | Vec3) => FaceFinderFn;
  readonly ofSurfaceType: (surfaceType: SurfaceType) => FaceFinderFn;
  readonly ofArea: (area: number, tolerance?: number) => FaceFinderFn;
  readonly atDistance: (distance: number, point?: Vec3) => FaceFinderFn;
}

/** Create an immutable face finder. */
export function faceFinder(): FaceFinderFn {
  return createFaceFinder([]);
}

function createFaceFinder(filters: ReadonlyArray<Predicate<Face>>): FaceFinderFn {
  const base = createFinder<Face>('face', filters, (face) => faceNormalAt(face));

  const withFilter = (pred: Predicate<Face>): FaceFinderFn => createFaceFinder([...filters, pred]);

  return {
    ...base,
    when: (pred) => createFaceFinder([...filters, pred]),
    inList: (elements) => createFaceFinder([...base.inList(elements)._filters]),
    not: (fn) =>
      createFaceFinder([...base.not(fn as (f: ShapeFinder<Face>) => ShapeFinder<Face>)._filters]),
    either: (fns) =>
      createFaceFinder([
        ...base.either(fns as ((f: ShapeFinder<Face>) => ShapeFinder<Face>)[])._filters,
      ]),

    inDirection: (dir = 'Z', angle = 0) => {
      const d = vecNormalize(resolveDir(dir));
      return withFilter((face) => {
        const n = faceNormalAt(face);
        const ang = Math.acos(Math.min(1, Math.abs(vecDot(vecNormalize(n), d))));
        return Math.abs(ang - DEG2RAD * angle) < 1e-6;
      });
    },

    parallelTo: (dir = 'Z') => createFaceFinder([...filters]).inDirection(dir, 0),

    ofSurfaceType: (surfaceType) =>
      withFilter((face) => unwrap(getSurfaceType(face)) === surfaceType),

    ofArea: (area, tolerance = 1e-3) =>
      withFilter((face) => Math.abs(measureArea(face) - area) < tolerance),

    atDistance: (distance, point = [0, 0, 0]) =>
      withFilter((face) => {
        const oc = getKernel().oc;
        const r = gcWithScope();

        const pnt = r(toOcPnt(point));
        const vtxMaker = r(new oc.BRepBuilderAPI_MakeVertex(pnt));
        const vtx = vtxMaker.Vertex();

        const distTool = r(new oc.BRepExtrema_DistShapeShape_1());
        distTool.LoadS1(vtx);
        distTool.LoadS2(face.wrapped);

        const progress = r(new oc.Message_ProgressRange_1());
        distTool.Perform(progress);
        const d = distTool.Value();

        return Math.abs(d - distance) < 1e-6;
      }),
  };
}

// ---------------------------------------------------------------------------
// Wire finder
// ---------------------------------------------------------------------------

export interface WireFinderFn extends ShapeFinder<Wire> {
  readonly isClosed: () => WireFinderFn;
  readonly isOpen: () => WireFinderFn;
  readonly ofEdgeCount: (count: number) => WireFinderFn;
}

/** Create an immutable wire finder. */
export function wireFinder(): WireFinderFn {
  return createWireFinder([]);
}

function createWireFinder(filters: ReadonlyArray<Predicate<Wire>>): WireFinderFn {
  const base = createFinder<Wire>('wire', filters, () => null);

  const withFilter = (pred: Predicate<Wire>): WireFinderFn => createWireFinder([...filters, pred]);

  return {
    ...base,
    when: (pred) => createWireFinder([...filters, pred]),
    inList: (elements) => createWireFinder([...base.inList(elements)._filters]),
    not: (fn) =>
      createWireFinder([...base.not(fn as (f: ShapeFinder<Wire>) => ShapeFinder<Wire>)._filters]),
    either: (fns) =>
      createWireFinder([
        ...base.either(fns as ((f: ShapeFinder<Wire>) => ShapeFinder<Wire>)[])._filters,
      ]),

    isClosed: () => withFilter((wire) => curveIsClosed(wire)),

    isOpen: () => withFilter((wire) => !curveIsClosed(wire)),

    ofEdgeCount: (count) =>
      withFilter((wire) => {
        let edgeCount = 0;
        for (const _raw of iterTopo(wire.wrapped, 'edge')) {
          edgeCount++;
        }
        return edgeCount === count;
      }),
  };
}

// ---------------------------------------------------------------------------
// Vertex finder
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

/** Create an immutable vertex finder. */
export function vertexFinder(): VertexFinderFn {
  return createVertexFinder([]);
}

function createVertexFinder(filters: ReadonlyArray<Predicate<Vertex>>): VertexFinderFn {
  const base = createFinder<Vertex>('vertex', filters, () => null);

  const withFilter = (pred: Predicate<Vertex>): VertexFinderFn =>
    createVertexFinder([...filters, pred]);

  return {
    ...base,
    when: (pred) => createVertexFinder([...filters, pred]),
    inList: (elements) => createVertexFinder([...base.inList(elements)._filters]),
    not: (fn) =>
      createVertexFinder([
        ...base.not(fn as (f: ShapeFinder<Vertex>) => ShapeFinder<Vertex>)._filters,
      ]),
    either: (fns) =>
      createVertexFinder([
        ...base.either(fns as ((f: ShapeFinder<Vertex>) => ShapeFinder<Vertex>)[])._filters,
      ]),

    nearestTo: (point) => {
      // This is a post-filter: it runs after all other filters and keeps only the closest.
      // We implement this as a special predicate that tracks the best candidate.
      // Since predicates are pure boolean filters, we use a two-pass approach via find() override.
      // Instead, we add a filter that marks all elements, then override find.
      // Simplest correct approach: use when() with a closure that finds the nearest.
      const newFilters = [...filters];
      const finderWithNearestTo = createVertexFinderWithNearest(newFilters, point);
      return finderWithNearestTo;
    },

    atPosition: (point, tolerance = 1e-4) =>
      withFilter((vertex) => {
        const pos = vertexPosition(vertex);
        return vecDistance(pos, point) < tolerance;
      }),

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

    atDistance: (distance, point = [0, 0, 0], tolerance = 1e-4) =>
      withFilter((vertex) => {
        const pos = vertexPosition(vertex);
        return Math.abs(vecDistance(pos, point) - distance) < tolerance;
      }),
  };
}

/**
 * Creates a vertex finder that keeps only the vertex nearest to a given point.
 * The nearestTo filter is special — it selects the single closest element
 * among those that pass all other filters, using the base finder pipeline.
 */
function createVertexFinderWithNearest(
  filters: ReadonlyArray<Predicate<Vertex>>,
  nearestPoint: Vec3
): VertexFinderFn {
  // Use the base finder's find() pipeline for filtering
  const baseFinder = createVertexFinder(filters);

  const overriddenFind = ((shape: AnyShape, opts?: { unique?: boolean }) => {
    // Delegate to the base finder pipeline for filtering
    const candidates = baseFinder.find(shape);

    if (candidates.length === 0) {
      if (opts?.unique) {
        return err(
          queryError('FINDER_NOT_UNIQUE', 'Finder expected a unique match but found 0 element(s)')
        );
      }
      return [];
    }

    // Find the nearest vertex among filtered candidates
    let bestIdx = 0;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by length > 0 above
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
    const nearest = candidates[bestIdx]!;
    if (opts?.unique) {
      return ok(nearest);
    }
    return [nearest];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- overload implementation
  }) as any;

  return {
    ...baseFinder,
    find: overriddenFind,
  };
}
