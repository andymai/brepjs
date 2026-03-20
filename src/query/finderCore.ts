/**
 * Generic, immutable shape finder -- core factory and shared types.
 *
 * Every typed finder (edge, face, wire, vertex) is built on top of
 * `createTypedFinder`, which handles the duplicated builder methods
 * (`when`, `inList`, `not`, `either`, `findAll`, `findUnique`, `shouldKeep`)
 * in one place.
 */

import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { queryError } from '@/core/errors.js';
import { getHashCode, isSameShape } from '@/topology/shapeFns.js';
import { getEdges, getFaces, getWires, getVertices } from '@/topology/topologyQueryFns.js';

// ---------------------------------------------------------------------------
// Predicate type
// ---------------------------------------------------------------------------

export type Predicate<T> = (element: T) => boolean;

// ---------------------------------------------------------------------------
// Topology kind discriminant
// ---------------------------------------------------------------------------

export type TopoKind = 'edge' | 'face' | 'wire' | 'vertex';

// ---------------------------------------------------------------------------
// Base ShapeFinder interface
// ---------------------------------------------------------------------------

export interface ShapeFinder<T extends AnyShape<Dimension>> {
  /** Add a custom predicate filter. Returns new finder. */
  readonly when: (predicate: Predicate<T>) => ShapeFinder<T>;
  /** Filter to elements in a list. Returns new finder. */
  readonly inList: (elements: T[]) => ShapeFinder<T>;
  /** Invert a filter. Returns new finder. */
  readonly not: (builderFn: (f: ShapeFinder<T>) => ShapeFinder<T>) => ShapeFinder<T>;
  /** Combine filters with OR. Returns new finder. */
  readonly either: (fns: ((f: ShapeFinder<T>) => ShapeFinder<T>)[]) => ShapeFinder<T>;
  /** Find all matching elements from a shape. */
  readonly findAll: (shape: AnyShape<Dimension>) => T[];
  /** Find exactly one matching element. Returns error if 0 or more than 1 match. */
  readonly findUnique: (shape: AnyShape<Dimension>) => Result<T>;
  /** Check if an element passes all filters. */
  readonly shouldKeep: (element: T) => boolean;

  /** Intersect: element must match both this finder AND other. */
  readonly and: (other: ShapeFinder<T>) => ShapeFinder<T>;
  /** Union: element must match this finder OR other. */
  readonly or: (other: ShapeFinder<T>) => ShapeFinder<T>;
  /** Negate: invert all filters on this finder. */
  readonly negate: () => ShapeFinder<T>;

  // -- Internal (for composition) --
  readonly _filters: ReadonlyArray<Predicate<T>>;
  readonly _topoKind: TopoKind;
}

// ---------------------------------------------------------------------------
// findUnique helper
// ---------------------------------------------------------------------------

/**
 * Find exactly one element matching all predicates. Returns an error Result
 * if zero or more than one element matches.
 */
function findUniqueIn<T extends AnyShape<Dimension>>(
  elements: T[],
  shouldKeep: (el: T) => boolean
): Result<T> {
  let match: T | undefined;
  let count = 0;
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i] as T; // noUncheckedIndexedAccess: i < length guarantees defined
    if (shouldKeep(element)) {
      count++;
      if (count === 1) match = element;
      else break; // More than 1 match — no need to continue
    }
  }
  if (count !== 1) {
    return err(
      queryError(
        'FINDER_NOT_UNIQUE',
        `Finder expected a unique match but found ${count === 0 ? 0 : '2+'} element(s)`
      )
    );
  }
  return ok(match as T);
}

// ---------------------------------------------------------------------------
// Generic typed-finder factory
// ---------------------------------------------------------------------------

/**
 * Build a typed finder that extends `ShapeFinder<T>` with domain-specific
 * filter methods. The `rebuild` callback re-creates the full typed finder
 * whenever a new filter is added, eliminating the per-finder boilerplate
 * for `when`, `inList`, `not`, `either`, etc.
 *
 * @param topoKind  - topology iteration target
 * @param filters   - accumulated predicates (immutable list)
 * @param rebuild   - reconstruct the typed finder from a new filter list
 * @param extend    - attach domain-specific methods onto the base finder
 */
export function createTypedFinder<T extends AnyShape<Dimension>, F extends ShapeFinder<T>>(
  topoKind: TopoKind,
  filters: ReadonlyArray<Predicate<T>>,
  rebuild: (newFilters: ReadonlyArray<Predicate<T>>) => F,
  extend: (
    base: ShapeFinder<T>,
    withFilter: (pred: Predicate<T>) => F
  ) => Omit<F, keyof ShapeFinder<T>>
): F {
  const withFilter = (pred: Predicate<T>): F => rebuild([...filters, pred]);

  const shouldKeep = (element: T): boolean => filters.every((f) => f(element));

  // Use cached topology getters instead of raw iterTopo — avoids redundant
  // WASM calls and benefits from the castShapeWithKnownType fast path.
  function getCachedElements(shape: AnyShape<Dimension>): T[] {
    switch (topoKind) {
      case 'edge':
        return getEdges(shape) as T[];
      case 'face':
        return getFaces(shape) as T[];
      case 'wire':
        return getWires(shape) as T[];
      case 'vertex':
        return getVertices(shape) as T[];
    }
  }

  const extractElements = (shape: AnyShape<Dimension>): T[] => {
    const all = getCachedElements(shape);
    if (filters.length === 0) return all.slice();
    return all.filter(shouldKeep);
  };

  const emptyFinder = (): ShapeFinder<T> => createTypedFinder<T, F>(topoKind, [], rebuild, extend);

  const base: ShapeFinder<T> = {
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
      const inner = builderFn(emptyFinder());
      return withFilter((el) => !inner.shouldKeep(el));
    },

    either: (fns) => {
      const builtFinders = fns.map((fn) => fn(emptyFinder()));
      return withFilter((el) => builtFinders.some((f) => f.shouldKeep(el)));
    },

    findAll: (shape) => extractElements(shape),

    findUnique: (shape) => findUniqueIn(getCachedElements(shape), shouldKeep),

    shouldKeep,

    and: (other) => withFilter((el) => other.shouldKeep(el)),

    or: (other) => {
      // Union: element passes if it matches this finder's filters OR the other's
      const selfKeep = shouldKeep;
      return rebuild([(el: T) => selfKeep(el) || other.shouldKeep(el)]);
    },

    negate: () => {
      const selfKeep = shouldKeep;
      return rebuild([(el: T) => !selfKeep(el)]);
    },
  };

  const extensions = extend(base, withFilter);

  return { ...base, ...extensions } as F;
}
