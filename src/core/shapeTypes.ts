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
 *
 * Dimension types (ADR-0004) live in dimensionTypes.ts;
 * validity brands (ADR-0005) live in validityTypes.ts;
 * both are re-exported here for backward compatibility.
 */

import type { KernelShape, KernelType, ShapeType } from '@/kernel/types.js';
import { getKernel } from '@/kernel/index.js';
import type { ShapeHandle } from './disposal.js';
import { createHandle } from './disposal.js';
import { is3D } from './dimensionTypes.js';
import type { Dimension } from './dimensionTypes.js';
import { getShapeKind as _getShapeKind } from './typeDiscriminants.js';
import { getOrQueryType, setCachedType } from './shapeTypeCache.js';

// ---------------------------------------------------------------------------
// Re-exports — dimensionTypes.ts (ADR-0004), validityTypes.ts (ADR-0005),
//              typeDiscriminants.ts (ADR-0008)
// ---------------------------------------------------------------------------

export { getShapeKind } from './typeDiscriminants.js';

export type {
  Dimension,
  DimensionError,
  RequireDimension,
  SameDimension,
} from './dimensionTypes.js';
export { is2D, is3D, as2D, as3D } from './dimensionTypes.js';
export type {
  ClosedWire,
  OrientedFace,
  ManifoldShell,
  ValidSolid,
  PlanarFace,
  PlanarWire,
} from './validityTypes.js';
export {
  closedWire,
  orientedFace,
  manifoldShell,
  validSolid,
  isClosedWire,
  isOrientedFace,
  isManifoldShell,
  isValidSolid,
  isPlanarFace,
  isPlanarWire,
  planarFace,
  planarWire,
} from './validityTypes.js';

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

/** Phantom brand key for dimension tracking (never exists at runtime). */
declare const __dim: unique symbol;
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
// Shape factories (brand a handle)
// ---------------------------------------------------------------------------

function brandHandle<D extends Dimension>(handle: ShapeHandle, dim?: D): AnyShape<D> {
  // brepjs-patterns-disable: no-double-cast
  if (dim === '2D') (handle as unknown as Record<string, unknown>)['__is2D'] = true;
  return handle as AnyShape<D>;
}

/** Wrap a raw kernel shape as a branded {@link Vertex} handle. */
export function createVertex<D extends Dimension = '3D'>(ocShape: KernelShape, dim?: D): Vertex<D> {
  return brandHandle<D>(createHandle(ocShape), dim) as Vertex<D>;
}

/** Wrap a raw kernel shape as a branded {@link Edge} handle. */
export function createEdge<D extends Dimension = '3D'>(ocShape: KernelShape, dim?: D): Edge<D> {
  return brandHandle<D>(createHandle(ocShape), dim) as Edge<D>;
}

/** Wrap a raw kernel shape as a branded {@link Wire} handle. */
export function createWire<D extends Dimension = '3D'>(ocShape: KernelShape, dim?: D): Wire<D> {
  return brandHandle<D>(createHandle(ocShape), dim) as Wire<D>;
}

/** Wrap a raw kernel shape as a branded {@link Face} handle. */
export function createFace<D extends Dimension = '3D'>(ocShape: KernelShape, dim?: D): Face<D> {
  return brandHandle<D>(createHandle(ocShape), dim) as Face<D>;
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
export function createCompound<D extends Dimension = '3D'>(
  ocShape: KernelShape,
  dim?: D
): Compound<D> {
  return brandHandle<D>(createHandle(ocShape), dim) as Compound<D>;
}

// ---------------------------------------------------------------------------
// Type guards (runtime checks via kernel ShapeType)
// ---------------------------------------------------------------------------

/** Type guard — check if a shape is a {@link Vertex}. */
export function isVertex<D extends Dimension>(s: AnyShape<D>): s is Vertex<D> {
  return _getShapeKind(s) === 'vertex';
}

/** Type guard — check if a shape is an {@link Edge}. */
export function isEdge<D extends Dimension>(s: AnyShape<D>): s is Edge<D> {
  return _getShapeKind(s) === 'edge';
}

/** Type guard — check if a shape is a {@link Wire}. */
export function isWire<D extends Dimension>(s: AnyShape<D>): s is Wire<D> {
  return _getShapeKind(s) === 'wire';
}

/** Type guard — check if a shape is a {@link Face}. */
export function isFace<D extends Dimension>(s: AnyShape<D>): s is Face<D> {
  return _getShapeKind(s) === 'face';
}

/** Type guard — check if a shape is a {@link Shell}. */
export function isShell(s: AnyShape<Dimension>): s is Shell {
  return _getShapeKind(s) === 'shell';
}

/** Type guard — check if a shape is a {@link Solid}. */
export function isSolid(s: AnyShape<Dimension>): s is Solid {
  return _getShapeKind(s) === 'solid';
}

/** Type guard — check if a shape is a {@link Compound}. */
export function isCompound<D extends Dimension>(s: AnyShape<D>): s is Compound<D> {
  return _getShapeKind(s) === 'compound';
}

/** Type guard — check if a shape is a 3D shape (shell, solid, compsolid, or 3D compound). */
export function isShape3D(s: AnyShape<Dimension>): s is Shape3D {
  const kind = _getShapeKind(s);
  if (kind === 'shell' || kind === 'solid' || kind === 'compsolid') return true;
  // Compounds can be 2D or 3D — check the runtime dimension marker
  if (kind === 'compound') return is3D(s);
  return false;
}

/** Type guard — check if a shape is a 1D shape (edge or wire). */
export function isShape1D<D extends Dimension>(s: AnyShape<D>): s is Shape1D<D> {
  const kind = _getShapeKind(s);
  return kind === 'edge' || kind === 'wire';
}

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
export function castShape<D extends Dimension = '3D'>(ocShape: KernelShape, dim?: D): AnyShape<D> {
  const kernel = getKernel();
  const st = getOrQueryType(kernel, ocShape);
  // Pass type to downcast to avoid recomputing ShapeType() in WASM
  const dc = kernel.downcast(ocShape, st);

  if (st === 'vertex') return createVertex<D>(dc, dim) as AnyShape<D>;
  if (st === 'edge') return createEdge<D>(dc, dim) as AnyShape<D>;
  if (st === 'wire') return createWire<D>(dc, dim) as AnyShape<D>;
  if (st === 'face') return createFace<D>(dc, dim) as AnyShape<D>;
  if (st === 'shell') return createShell(dc) as AnyShape<D>;
  if (st === 'solid') return createSolid(dc) as AnyShape<D>;
  if (st === 'compsolid') return createCompSolid(dc) as AnyShape<D>;
  return createCompound<D>(dc, dim) as AnyShape<D>;
}

/** Type-safe cast for shapes known to be 3D. */
export function castShape3D(ocShape: KernelShape): AnyShape {
  return castShape(ocShape);
}

/**
 * Fast-path cast when the shape type is already known (e.g., from iterShapes).
 * Skips the shapeType() WASM call — only performs downcast + branded handle creation.
 * Used internally by topology extractors for bulk sub-shape iteration.
 */
export function castShapeWithKnownType<D extends Dimension = '3D'>(
  ocShape: KernelShape,
  knownType: ShapeType,
  dim?: D
): AnyShape<D> {
  setCachedType(ocShape, knownType);
  const dc = getKernel().downcast(ocShape, knownType);
  if (knownType === 'vertex') return createVertex<D>(dc, dim) as AnyShape<D>;
  if (knownType === 'edge') return createEdge<D>(dc, dim) as AnyShape<D>;
  if (knownType === 'wire') return createWire<D>(dc, dim) as AnyShape<D>;
  if (knownType === 'face') return createFace<D>(dc, dim) as AnyShape<D>;
  if (knownType === 'shell') return createShell(dc) as AnyShape<D>;
  if (knownType === 'solid') return createSolid(dc) as AnyShape<D>;
  if (knownType === 'compsolid') return createCompSolid(dc) as AnyShape<D>;
  return createCompound<D>(dc, dim) as AnyShape<D>;
}
