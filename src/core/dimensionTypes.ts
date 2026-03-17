/**
 * Dimension phantom types and compile-time error utilities (ADR-0004).
 *
 * Shapes carry a phantom dimension parameter `D extends Dimension` that tracks
 * whether the shape is embedded in 2D or 3D space. This module provides:
 * - The `Dimension` type itself
 * - Runtime type guards (`is2D`, `is3D`) and assertion casts (`as2D`, `as3D`)
 * - Compile-time error template types from ADR-0004
 */

// Type-only import — erased at runtime, no circular dependency
import type { AnyShape } from './shapeTypes.js';

// ---------------------------------------------------------------------------
// Dimension phantom type
// ---------------------------------------------------------------------------

/** The geometric dimension a shape is embedded in. */
export type Dimension = '2D' | '3D';

// ---------------------------------------------------------------------------
// Dimension type guards — narrow unknown-dimension shapes
// ---------------------------------------------------------------------------

/**
 * Narrow an unknown-dimension shape to 3D.
 * All shapes from the kernel default to 3D embedding.
 * 2D shapes only exist when explicitly created via 2D API paths
 * that set the `__is2D` runtime marker on the handle.
 *
 * **Note**: Currently no production code path creates 2D-marked shapes.
 * This guard is provided for forward compatibility with future 2D API work.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments -- explicit '3D' for narrowing clarity
export function is3D(s: AnyShape<Dimension>): s is AnyShape<'3D'> {
  return (s as unknown as Record<string, unknown>)['__is2D'] !== true;
}

/**
 * Narrow an unknown-dimension shape to 2D.
 *
 * **Note**: Currently no production code path creates 2D-marked shapes.
 * This guard is provided for forward compatibility with future 2D API work.
 */
export function is2D(s: AnyShape<Dimension>): s is AnyShape<'2D'> {
  return (s as unknown as Record<string, unknown>)['__is2D'] === true;
}

/**
 * Assert a shape is 3D. Throws at runtime if wrong.
 * Use when you know the shape is 3D but TypeScript doesn't.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments -- explicit '3D' for narrowing clarity
export function as3D(s: AnyShape<Dimension>): AnyShape<'3D'> {
  if (!is3D(s)) throw new Error('Expected 3D shape, got 2D');
  return s;
}

/**
 * Assert a shape is 2D. Throws at runtime if wrong.
 * Use when you know the shape is 2D but TypeScript doesn't.
 */
export function as2D(s: AnyShape<Dimension>): AnyShape<'2D'> {
  if (!is2D(s)) throw new Error('Expected 2D shape, got 3D');
  return s;
}

// ---------------------------------------------------------------------------
// Compile-time error types (absorbed from typeErrors.ts — ADR-0004)
// ---------------------------------------------------------------------------

/**
 * Compile-time error message for dimension mismatches.
 * Resolves to a string literal type that appears in IDE diagnostics.
 *
 * @example
 * ```ts
 * // Consumer sees:
 * // Type '"❌ fuse: expected 3D, got 2D"' is not assignable to type 'Shape3D'.
 * ```
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
