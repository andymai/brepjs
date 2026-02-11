/**
 * Generic, immutable shape finder -- core factory and shared types.
 *
 * Every typed finder (edge, face, wire, vertex) is built on top of
 * `createTypedFinder`, which handles the duplicated builder methods
 * (`when`, `inList`, `not`, `either`, `findAll`, `findUnique`, `shouldKeep`)
 * in one place.
 */

import type { AnyShape } from '../core/shapeTypes.js';
import { castShape } from '../core/shapeTypes.js';
import { type Result, ok, err, unwrap } from '../core/result.js';
import { queryError } from '../core/errors.js';
import { getHashCode, isSameShape } from '../topology/shapeFns.js';
import { iterTopo, downcast } from '../topology/cast.js';

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

export interface ShapeFinder<T extends AnyShape> {
  /** Add a custom predicate filter. Returns new finder. */
  readonly when: (predicate: Predicate<T>) => ShapeFinder<T>;
  /** Filter to elements in a list. Returns new finder. */
  readonly inList: (elements: T[]) => ShapeFinder<T>;
  /** Invert a filter. Returns new finder. */
  readonly not: (builderFn: (f: ShapeFinder<T>) => ShapeFinder<T>) => ShapeFinder<T>;
  /** Combine filters with OR. Returns new finder. */
  readonly either: (fns: ((f: ShapeFinder<T>) => ShapeFinder<T>)[]) => ShapeFinder<T>;
  /** Find all matching elements from a shape. */
  readonly findAll: (shape: AnyShape) => T[];
  /** Find exactly one matching element. Returns error if 0 or more than 1 match. */
  readonly findUnique: (shape: AnyShape) => Result<T>;
  /** Check if an element passes all filters. */
  readonly shouldKeep: (element: T) => boolean;

  // -- Internal (for composition) --
  readonly _filters: ReadonlyArray<Predicate<T>>;
  readonly _topoKind: TopoKind;
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
export function createTypedFinder<T extends AnyShape, F extends ShapeFinder<T>>(
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

    findUnique: (shape) => {
      const elements = extractElements(shape);
      if (elements.length !== 1) {
        return err(
          queryError(
            'FINDER_NOT_UNIQUE',
            `Finder expected a unique match but found ${elements.length} element(s)`
          )
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by length === 1
      return ok(elements[0]!);
    },

    shouldKeep,
  };

  const extensions = extend(base, withFilter);

  return { ...base, ...extensions } as F;
}
