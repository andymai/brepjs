/**
 * Base Finder class and shared type definitions for the query layer.
 * Ported from replicad's finders/definitions.ts.
 */

import type { Vector, Point } from '../core/geometry.js';
import type { Face, Edge } from '../topology/shapes.js';

export type Direction = 'X' | 'Y' | 'Z';
export const DIRECTIONS: Record<Direction, Point> = {
  X: [1, 0, 0],
  Y: [0, 1, 0],
  Z: [0, 0, 1],
};

export type StandardPlane = 'XY' | 'XZ' | 'YZ';
export const PLANE_TO_DIR: Record<StandardPlane, [number, number, number]> = {
  YZ: [1, 0, 0],
  XZ: [0, 1, 0],
  XY: [0, 0, 1],
};

export type FaceOrEdge = Face | Edge;

export type FilterFcn<Type> = {
  element: Type;
  normal: Vector | null;
};

export abstract class Finder<Type, FilterType> {
  protected filters: (({ element, normal }: FilterFcn<Type>) => boolean)[];

  protected abstract applyFilter(shape: FilterType): Type[];

  /**
   * Check if a particular element should be filtered or not according to the
   * current finder
   */
  abstract shouldKeep(t: Type): boolean;

  constructor() {
    this.filters = [];
  }

  /**
   * Creates a shallow clone of this finder with the same filters.
   */
  clone(): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic constructor invocation for polymorphic clone
    const cloned = new (this.constructor as any)() as this;
    cloned.filters = [...this.filters];
    return cloned;
  }

  delete(): void {
    this.filters = [];
  }

  /**
   * Combine logically a set of filter with an AND operation.
   *
   * You need to pass an array of functions that take a finder as a argument
   * and return the same finder with some filters applied to it.
   *
   * Note that by default filters are applied with and AND operation, but in
   * some case you might want to create them dynamically and use this method.
   *
   * @category Filter Combination
   */
  and(findersList: ((f: this) => this)[]): this {
    findersList.forEach((f) => f(this));
    return this;
  }

  /**
   * Invert the result of a particular finder
   *
   * You need to pass a function that take a finder as a argument
   * and return the same finder with some filters applied to it.
   *
   * @category Filter Combination
   */
  not(finderFun: (f: this) => this): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic constructor invocation for polymorphic clone
    const finder = new (this.constructor as any)() as this;
    finderFun(finder);

    const notFilter = ({ element }: { element: Type }) => !finder.shouldKeep(element);
    this.filters.push(notFilter);

    return this;
  }

  /**
   * Combine logically a set of filter with an OR operation.
   *
   * You need to pass an array of functions that take a finder as a argument
   * and return the same finder with some filters applied to it.
   *
   * @category Filter Combination
   */
  either(findersList: ((f: this) => this)[]): this {
    const builtFinders = findersList.map((finderFunction) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic constructor invocation for polymorphic clone
      const finder = new (this.constructor as any)() as this;
      finderFunction(finder);
      return finder;
    });

    const eitherFilter = ({ element }: { element: Type }) =>
      builtFinders.some((finder) => finder.shouldKeep(element));
    this.filters.push(eitherFilter);

    return this;
  }

  /**
   * Returns all the elements that fit the set of filters defined on this
   * finder
   *
   * If unique is configured as an option it will either return the unique
   * element found or throw an error.
   */
  find(shape: FilterType, options: { unique: true }): Type;
  find(shape: FilterType, options?: { unique?: false }): Type[];
  find(shape: FilterType, { unique = false } = {}): Type | Type[] {
    const elements = this.applyFilter(shape);

    if (unique) {
      if (elements.length !== 1) {
        console.error(elements);
        throw new Error(`Finder expected a unique match but found ${elements.length} element(s)`);
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return elements[0]!;
    }

    return elements;
  }
}
