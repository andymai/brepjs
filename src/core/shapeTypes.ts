/**
 * Branded shape types — type-safe shape discrimination without class hierarchies.
 * Each shape type is a branded ShapeHandle to prevent incorrect assignments.
 *
 * Shapes carry a phantom dimension parameter `D extends Dimension` that tracks
 * whether the shape is embedded in 2D or 3D space. This enables compile-time
 * rejection of dimension mismatches (e.g., fusing a 2D wire with a 3D solid).
 *
 * - Dimension-parameterized types: Vertex, Edge, Wire, Face, Compound (default '3D')
 * - Fixed 3D types: Shell, Solid, CompSolid (always '3D', no parameter)
 */

import type { KernelShape, KernelType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import type { ShapeHandle } from './disposal.js';
import { createHandle } from './disposal.js';

// ---------------------------------------------------------------------------
// CurveLike — kernel curve adaptor interface
// ---------------------------------------------------------------------------

/** Interface for kernel curve adaptors (BRepAdaptor_Curve / CompCurve). */
export interface CurveLike {
  delete(): void;
  Value(v: number): KernelType;
  IsPeriodic(): boolean;
  Period(): number;
  IsClosed(): boolean;
  FirstParameter(): number;
  LastParameter(): number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel enum return type
  GetType?(): any;
  D1(v: number, p: KernelType, vPrime: KernelType): void;
}

// ---------------------------------------------------------------------------
// Dimension phantom type
// ---------------------------------------------------------------------------

/** The geometric dimension a shape is embedded in. */
export type Dimension = '2D' | '3D';

/** Phantom brand key for dimension tracking (never exists at runtime). */
declare const __dim: unique symbol;

// ---------------------------------------------------------------------------
// Topological validity phantom brands (ADR-0005)
// ---------------------------------------------------------------------------

/** Phantom brand: wire forms a closed loop. */
declare const __closed: unique symbol;
/** Phantom brand: face has consistent normal orientation. */
declare const __oriented: unique symbol;
/** Phantom brand: shell is manifold (watertight, no dangling faces). */
declare const __manifold: unique symbol;
/** Phantom brand: solid passes BRepCheck validation. */
declare const __valid: unique symbol;

// ---------------------------------------------------------------------------
// Shape kind discriminant
// ---------------------------------------------------------------------------

/** String discriminant identifying the topological type of a shape. */
export type ShapeKind =
  | 'vertex'
  | 'edge'
  | 'wire'
  | 'face'
  | 'shell'
  | 'solid'
  | 'compsolid'
  | 'compound';

// ---------------------------------------------------------------------------
// Branded shape types
// ---------------------------------------------------------------------------

declare const __brand: unique symbol;

// Dimension-parameterized types (can be 2D or 3D, default '3D')

/** A topological vertex (0D point). */
export type Vertex<D extends Dimension = '3D'> = ShapeHandle & {
  readonly [__brand]: 'vertex';
  readonly [__dim]: D;
};
/** A topological edge (1D curve segment). */
export type Edge<D extends Dimension = '3D'> = ShapeHandle & {
  readonly [__brand]: 'edge';
  readonly [__dim]: D;
};
/** An ordered sequence of connected edges forming a path or loop. */
export type Wire<D extends Dimension = '3D'> = ShapeHandle & {
  readonly [__brand]: 'wire';
  readonly [__dim]: D;
};
/** A bounded portion of a surface. */
export type Face<D extends Dimension = '3D'> = ShapeHandle & {
  readonly [__brand]: 'face';
  readonly [__dim]: D;
};

// Fixed-dimension types (always 3D — no type parameter)

/** A connected set of faces sharing edges. Always 3D. */
export type Shell = ShapeHandle & { readonly [__brand]: 'shell'; readonly [__dim]: '3D' };
/** A closed volume bounded by shells. Always 3D. */
export type Solid = ShapeHandle & { readonly [__brand]: 'solid'; readonly [__dim]: '3D' };
/** A set of solids connected by faces. Always 3D. */
export type CompSolid = ShapeHandle & { readonly [__brand]: 'compsolid'; readonly [__dim]: '3D' };
/** A heterogeneous collection of shapes. */
export type Compound<D extends Dimension = '3D'> = ShapeHandle & {
  readonly [__brand]: 'compound';
  readonly [__dim]: D;
};

// ---------------------------------------------------------------------------
// Union types
// ---------------------------------------------------------------------------

/** Any branded shape type in a given dimension. Defaults to 3D. */
export type AnyShape<D extends Dimension = '3D'> =
  | Vertex<D>
  | Edge<D>
  | Wire<D>
  | Face<D>
  | Compound<D>
  | (D extends '3D' ? Shell | Solid | CompSolid : never);

/** 1D shapes (edges and wires) in a given dimension. */
export type Shape1D<D extends Dimension = '3D'> = Edge<D> | Wire<D>;

/** 3D shapes (solid-like). Always 3D by definition. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments -- explicit '3D' for documentation clarity
export type Shape3D = Shell | Solid | CompSolid | Compound<'3D'>;

/** Any shape whose dimension is unknown (e.g., from file import). Requires narrowing. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments -- explicit dimensions for documentation clarity
export type UnknownDimShape = AnyShape<'2D'> | AnyShape<'3D'>;

// ---------------------------------------------------------------------------
// Topological validity types (ADR-0005)
// ---------------------------------------------------------------------------

/**
 * A wire proven to form a closed loop.
 * The only way to obtain a `ClosedWire` is through smart constructors
 * (`closedWire()`, `rectangleWire()`, etc.) or type guards (`isClosedWire()`).
 * Assignable to `Wire<D>` — a subtype, not a separate type.
 */
export type ClosedWire<D extends Dimension = '3D'> = Wire<D> & { readonly [__closed]: true };

/**
 * A face with proven consistent normal orientation.
 * Obtained via `orientedFace()` or `isOrientedFace()`.
 * Assignable to `Face<D>`.
 */
export type OrientedFace<D extends Dimension = '3D'> = Face<D> & { readonly [__oriented]: true };

/**
 * A shell proven to be manifold (watertight, no dangling faces).
 * Obtained via `manifoldShell()` or `isManifoldShell()`.
 * Assignable to `Shell`.
 */
export type ManifoldShell = Shell & { readonly [__manifold]: true };

/**
 * A solid proven to pass BRepCheck validation.
 * Obtained via `validSolid()` or `isValidSolid()`.
 * Assignable to `Solid`.
 */
export type ValidSolid = Solid & { readonly [__valid]: true };

// ---------------------------------------------------------------------------
// Shape factories (brand a handle)
// ---------------------------------------------------------------------------

function brandHandle<D extends Dimension>(handle: ShapeHandle): AnyShape<D> {
  return handle as AnyShape<D>;
}

/** Wrap a raw kernel shape as a branded {@link Vertex} handle. */
export function createVertex<D extends Dimension = '3D'>(ocShape: KernelShape): Vertex<D> {
  return brandHandle<D>(createHandle(ocShape)) as Vertex<D>;
}

/** Wrap a raw kernel shape as a branded {@link Edge} handle. */
export function createEdge<D extends Dimension = '3D'>(ocShape: KernelShape): Edge<D> {
  return brandHandle<D>(createHandle(ocShape)) as Edge<D>;
}

/** Wrap a raw kernel shape as a branded {@link Wire} handle. */
export function createWire<D extends Dimension = '3D'>(ocShape: KernelShape): Wire<D> {
  return brandHandle<D>(createHandle(ocShape)) as Wire<D>;
}

/** Wrap a raw kernel shape as a branded {@link Face} handle. */
export function createFace<D extends Dimension = '3D'>(ocShape: KernelShape): Face<D> {
  return brandHandle<D>(createHandle(ocShape)) as Face<D>;
}

/** Wrap a raw kernel shape as a branded {@link Shell} handle. */
export function createShell(ocShape: KernelShape): Shell {
  return brandHandle(createHandle(ocShape)) as Shell;
}

/** Wrap a raw kernel shape as a branded {@link Solid} handle. */
export function createSolid(ocShape: KernelShape): Solid {
  return brandHandle(createHandle(ocShape)) as Solid;
}

/** Wrap a raw kernel shape as a branded {@link CompSolid} handle. */
export function createCompSolid(ocShape: KernelShape): CompSolid {
  return brandHandle(createHandle(ocShape)) as CompSolid;
}

/** Wrap a raw kernel shape as a branded {@link Compound} handle. */
export function createCompound<D extends Dimension = '3D'>(ocShape: KernelShape): Compound<D> {
  return brandHandle<D>(createHandle(ocShape)) as Compound<D>;
}

// ---------------------------------------------------------------------------
// Type guards (runtime checks via kernel ShapeType)
// ---------------------------------------------------------------------------

/** Query the kernel for the topological type of a shape. */
export function getShapeKind(shape: AnyShape<Dimension>): ShapeKind {
  return getKernel().shapeType(shape.wrapped);
}

/** Type guard — check if a shape is a {@link Vertex}. */
export function isVertex<D extends Dimension>(s: AnyShape<D>): s is Vertex<D> {
  return getShapeKind(s) === 'vertex';
}

/** Type guard — check if a shape is an {@link Edge}. */
export function isEdge<D extends Dimension>(s: AnyShape<D>): s is Edge<D> {
  return getShapeKind(s) === 'edge';
}

/** Type guard — check if a shape is a {@link Wire}. */
export function isWire<D extends Dimension>(s: AnyShape<D>): s is Wire<D> {
  return getShapeKind(s) === 'wire';
}

/** Type guard — check if a shape is a {@link Face}. */
export function isFace<D extends Dimension>(s: AnyShape<D>): s is Face<D> {
  return getShapeKind(s) === 'face';
}

/** Type guard — check if a shape is a {@link Shell}. */
export function isShell(s: AnyShape<Dimension>): s is Shell {
  return getShapeKind(s) === 'shell';
}

/** Type guard — check if a shape is a {@link Solid}. */
export function isSolid(s: AnyShape<Dimension>): s is Solid {
  return getShapeKind(s) === 'solid';
}

/** Type guard — check if a shape is a {@link Compound}. */
export function isCompound<D extends Dimension>(s: AnyShape<D>): s is Compound<D> {
  return getShapeKind(s) === 'compound';
}

/** Type guard — check if a shape is a 3D shape (shell, solid, compsolid, or 3D compound). */
export function isShape3D(s: AnyShape<Dimension>): s is Shape3D {
  const kind = getShapeKind(s);
  if (kind === 'shell' || kind === 'solid' || kind === 'compsolid') return true;
  // Compounds can be 2D or 3D — check the runtime dimension marker
  if (kind === 'compound') return is3D(s);
  return false;
}

/** Type guard — check if a shape is a 1D shape (edge or wire). */
export function isShape1D<D extends Dimension>(s: AnyShape<D>): s is Shape1D<D> {
  const kind = getShapeKind(s);
  return kind === 'edge' || kind === 'wire';
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime dimension marker
  return (s as any).__is2D !== true;
}

/**
 * Narrow an unknown-dimension shape to 2D.
 *
 * **Note**: Currently no production code path creates 2D-marked shapes.
 * This guard is provided for forward compatibility with future 2D API work.
 */
export function is2D(s: AnyShape<Dimension>): s is AnyShape<'2D'> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime dimension marker
  return (s as any).__is2D === true;
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
// Topological validity type guards (ADR-0005)
// ---------------------------------------------------------------------------

/**
 * Type guard — check if a wire is closed (forms a loop).
 * Uses the kernel's `curveIsClosed` to verify at runtime.
 */
export function isClosedWire<D extends Dimension>(wire: Wire<D>): wire is ClosedWire<D> {
  return getKernel().curveIsClosed(wire.wrapped);
}

/**
 * Type guard — check if a face is valid and thus safe to use in operations.
 *
 * Uses kernel validity (BRepCheck_Analyzer) which verifies geometric and
 * topological correctness. Faces produced by kernel operations (makeFace,
 * extrude, revolve, boolean ops) are oriented by construction. For faces
 * from STEP/IGES imports or external sources, validity does not guarantee
 * consistent normal orientation — use with caution or re-orient first.
 */
export function isOrientedFace<D extends Dimension>(face: Face<D>): face is OrientedFace<D> {
  return getKernel().isValid(face.wrapped);
}

/**
 * Type guard — check if a shell is manifold (watertight, no dangling faces).
 * Checks kernel validity, then attempts `solidFromShell` — if the shell
 * can form a valid solid, it is manifold by definition.
 *
 * The temporary solid created for the proof is disposed immediately to avoid
 * WASM memory leaks.
 */
export function isManifoldShell(shell: Shell): shell is ManifoldShell {
  const kernel = getKernel();
  if (!kernel.isValid(shell.wrapped)) return false;
  // A manifold shell can be converted to a solid — try it as a proof
  try {
    const solid = kernel.solidFromShell(shell.wrapped);
    const valid = kernel.isValid(solid);
    // Dispose the temporary solid to prevent WASM memory leaks
    try {
      kernel.dispose(solid);
    } catch {
      /* best-effort cleanup */
    }
    return valid;
  } catch {
    return false;
  }
}

/**
 * Type guard — check if a solid passes BRepCheck validation.
 */
export function isValidSolid(solid: Solid): solid is ValidSolid {
  return getKernel().isValid(solid.wrapped);
}

// ---------------------------------------------------------------------------
// Topological validity smart constructors (ADR-0005)
// ---------------------------------------------------------------------------

/**
 * Prove that a wire is closed, returning a branded `ClosedWire` on success.
 * This is the primary smart constructor for `ClosedWire`.
 *
 * @example
 * ```ts
 * const w = wire([e1, e2, e3]);
 * const closed = closedWire(unwrap(w));
 * if (isOk(closed)) {
 *   const f = face(closed.value); // ClosedWire accepted
 * }
 * ```
 */
export function closedWire<D extends Dimension>(wire: Wire<D>): ValidityResult<ClosedWire<D>> {
  if (isClosedWire(wire)) return { valid: true, shape: wire };
  return { valid: false, reason: 'Wire is not closed: start and end points do not coincide' };
}

/**
 * Prove that a face is oriented, returning a branded `OrientedFace` on success.
 */
export function orientedFace<D extends Dimension>(face: Face<D>): ValidityResult<OrientedFace<D>> {
  if (isOrientedFace(face)) return { valid: true, shape: face };
  return { valid: false, reason: 'Face orientation is inconsistent or face is invalid' };
}

/**
 * Prove that a shell is manifold, returning a branded `ManifoldShell` on success.
 */
export function manifoldShell(shell: Shell): ValidityResult<ManifoldShell> {
  if (isManifoldShell(shell)) return { valid: true, shape: shell };
  return { valid: false, reason: 'Shell is not manifold: has free edges or is invalid' };
}

/**
 * Prove that a solid is valid, returning a branded `ValidSolid` on success.
 */
export function validSolid(solid: Solid): ValidityResult<ValidSolid> {
  if (isValidSolid(solid)) return { valid: true, shape: solid };
  return { valid: false, reason: 'Solid failed BRepCheck validation' };
}

/**
 * Result of a validity proof. Either the shape is valid (branded type returned)
 * or invalid (reason string returned).
 */
export type ValidityResult<T> =
  | { readonly valid: true; readonly shape: T }
  | { readonly valid: false; readonly reason: string };

// ---------------------------------------------------------------------------
// Cast utility — wraps an kernel shape into the correct branded type
// ---------------------------------------------------------------------------

/**
 * Wrap a raw kernel shape into a properly branded type.
 * Performs a downcast and wraps in a disposable handle.
 *
 * **Note**: When `D` is `'2D'`, Shell/Solid/CompSolid are not valid members
 * of `AnyShape<'2D'>`. If the kernel shape happens to be one of these types,
 * they will be cast unsoundly. Prefer {@link castShape3D} for shapes known
 * to be 3D, and use the default `castShape()` (which defaults to `'3D'`)
 * for normal usage.
 */
export function castShape<D extends Dimension = '3D'>(ocShape: KernelShape): AnyShape<D> {
  const kernel = getKernel();
  const st = kernel.shapeType(ocShape);
  // Pass type to downcast to avoid recomputing ShapeType() in WASM
  const dc = kernel.downcast(ocShape, st);

  if (st === 'vertex') return createVertex<D>(dc) as AnyShape<D>;
  if (st === 'edge') return createEdge<D>(dc) as AnyShape<D>;
  if (st === 'wire') return createWire<D>(dc) as AnyShape<D>;
  if (st === 'face') return createFace<D>(dc) as AnyShape<D>;
  if (st === 'shell') return createShell(dc) as AnyShape<D>;
  if (st === 'solid') return createSolid(dc) as AnyShape<D>;
  if (st === 'compsolid') return createCompSolid(dc) as AnyShape<D>;
  return createCompound<D>(dc) as AnyShape<D>;
}

/** Type-safe cast for shapes known to be 3D. */
export function castShape3D(ocShape: KernelShape): AnyShape {
  return castShape(ocShape);
}
