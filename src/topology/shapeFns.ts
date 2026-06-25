/**
 * Shape identity, introspection, and serialization functions.
 *
 * Re-exports from focused modules for backward compatibility:
 * - Transform functions from `./transformFns.js`
 * - Topology query functions from `./topologyQueryFns.js`
 * - Origin tracking functions from `./metadata/originTrackingFns.js`
 */

import { getKernel } from '@/kernel/index.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { HASH_CODE_MAX } from '@/core/constants.js';
import type { Result } from '@/core/result.js';
import { kernelCall, kernelCallRaw } from '@/core/kernelCall.js';
import { BrepErrorCode } from '@/core/errors.js';

// ---------------------------------------------------------------------------
// Identity / introspection
// ---------------------------------------------------------------------------

/** Clone a shape (deep copy via kernel topology downcast). */
export function clone<T extends AnyShape<Dimension>>(shape: T): Result<T> {
  return kernelCall(
    () => getKernel().downcast(shape.wrapped),
    BrepErrorCode.CLONE_FAILED,
    'Failed to clone shape'
  ) as Result<T>;
}

/** Serialize a shape to BREP string format. */
export function toBREP(shape: AnyShape<Dimension>): Result<string> {
  return kernelCallRaw(
    () => getKernel().toBREP(shape.wrapped),
    BrepErrorCode.TO_BREP_FAILED,
    'Failed to serialize shape to BREP'
  );
}

/** Get the topology hash code of a shape. */
export function getHashCode(shape: AnyShape<Dimension>): number {
  return getKernel().hashCode(shape.wrapped, HASH_CODE_MAX);
}

/** Check if a shape is null. */
export function isEmpty(shape: AnyShape<Dimension>): boolean {
  return getKernel().isNull(shape.wrapped);
}

/** Check if two shapes are the same topological entity. */
export function isSameShape(a: AnyShape<Dimension>, b: AnyShape<Dimension>): boolean {
  return getKernel().isSame(a.wrapped, b.wrapped);
}

/** Check if two shapes are geometrically equal. */
export function isEqualShape(a: AnyShape<Dimension>, b: AnyShape<Dimension>): boolean {
  return getKernel().isEqual(a.wrapped, b.wrapped);
}

/** Simplify a shape by merging same-domain faces/edges. Returns a new shape. */
export function simplify<T extends AnyShape<Dimension>>(shape: T): Result<T> {
  return kernelCall(
    () => getKernel().simplify(shape.wrapped),
    BrepErrorCode.SIMPLIFY_FAILED,
    'Failed to simplify shape'
  ) as Result<T>;
}

// ---------------------------------------------------------------------------
// Re-exports for backward compatibility
// ---------------------------------------------------------------------------

export {
  translate,
  rotate,
  mirror,
  scale,
  resize,
  applyMatrix,
  composeTransforms,
  transformCopy,
  locate,
} from './transformFns.js';
export type { TransformOp, ComposedTransform } from './transformFns.js';

export {
  getEdges,
  getFaces,
  getWires,
  getVertices,
  getSolids,
  getShells,
  getCompSolids,
  iterEdges,
  iterFaces,
  iterWires,
  iterVertices,
  iterSolids,
  iterShells,
  iterCompSolids,
  getBounds,
  getCachedShapeKind,
  describe,
  vertexPosition,
  invalidateShapeCache,
} from './topologyQueryFns.js';
export type { Bounds3D, ShapeDescription } from './topologyQueryFns.js';

export {
  setShapeOrigin,
  getFaceOrigins,
  propagateOriginsFromEvolution,
  propagateOriginsByHash,
} from './metadata/originTrackingFns.js';
