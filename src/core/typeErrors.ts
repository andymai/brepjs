/**
 * Compile-time error types for dimension mismatches.
 *
 * When a consumer passes the wrong dimension, the IDE shows readable error
 * messages via template literal types instead of cryptic structural mismatches.
 *
 * @example
 * ```ts
 * // Consumer sees:
 * // Type '"❌ fuse: expected 3D, got 2D"' is not assignable to type 'Shape3D'.
 * ```
 */

import type { Dimension } from './shapeTypes.js';

/**
 * Compile-time error message for dimension mismatches.
 * Resolves to a string literal type that appears in IDE diagnostics.
 */
export type DimensionError<
  Op extends string,
  Expected extends string,
  Got extends string,
> = `❌ ${Op}: expected ${Expected}, got ${Got}`;

/**
 * Conditional type that resolves to T if D matches Expected,
 * otherwise resolves to a readable error string type.
 */
export type RequireDimension<
  D extends Dimension,
  Expected extends Dimension,
  T,
  Op extends string = 'operation',
> = D extends Expected ? T : DimensionError<Op, Expected, D>;

/**
 * Asserts both dimensions are equal at the type level.
 * Resolves to the shared dimension if equal, or a readable error if not.
 */
export type SameDimension<
  A extends Dimension,
  B extends Dimension,
  Op extends string = 'operation',
> = A extends B ? A : DimensionError<Op, A, B>;
