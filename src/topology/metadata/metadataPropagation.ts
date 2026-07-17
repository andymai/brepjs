/**
 * Centralized metadata propagation pipeline for kernel operations.
 *
 * All kernel operations that produce new shapes from inputs need to propagate
 * three kinds of metadata: face origins, face tags, and face colors. This
 * module provides the shared plumbing so that booleanFns, modifierFns, and
 * transform functions don't duplicate the same ~20-line block.
 */

import type { ShapeEvolution } from '@/kernel/types.js';
import { getKernel } from '@/kernel/index.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { HASH_CODE_MAX } from '@/core/constants.js';
import {
  getFaceOrigins,
  propagateOriginsFromEvolution,
  propagateOriginsByHash,
} from './originTrackingFns.js';
import { propagateFaceTagsFromEvolution, hasFaceTags } from './faceTagFns.js';
import { propagateColorsFromEvolution, hasColorMetadata } from './colorFns.js';
import { subShapeHashes } from '@/topology/topologyQueryFns.js';

// ---------------------------------------------------------------------------
// Face hash collection
// ---------------------------------------------------------------------------

/**
 * Collect ALL face hashes from input shapes for WithHistory kernel methods.
 *
 * Fast-path: returns empty array when no inputs have any metadata (origins,
 * tags, or colors), avoiding expensive WASM topology exploration.
 */
/**
 * O(1) check: does a shape carry any propagatable metadata (face origins,
 * tags, or colors)? Lets callers skip both expensive face iteration and
 * metadata-preserving slow paths when there's nothing to preserve.
 */
export function hasAnyMetadata(shape: AnyShape<Dimension>): boolean {
  return getFaceOrigins(shape) !== undefined || hasFaceTags(shape) || hasColorMetadata(shape);
}

export function collectInputFaceHashes(inputs: readonly AnyShape<Dimension>[]): number[] {
  // O(1) check: skip expensive face iteration when no metadata exists
  if (!inputs.some(hasAnyMetadata)) return [];

  // Only the face hashes are needed (a membership set for metadata matching), so
  // use subShapeHashes — the native occt-wasm 3.7.0 path reads them without
  // allocating a handle per face, avoiding per-face arena churn on every
  // WithHistory boolean/transform/modifier.
  const hashes: number[] = [];
  for (const input of inputs) hashes.push(...subShapeHashes(input, 'face'));
  return hashes;
}

// ---------------------------------------------------------------------------
// Full propagation pipeline
// ---------------------------------------------------------------------------

/**
 * Propagate all metadata (origins, tags, colors) from inputs to result
 * using a kernel-provided ShapeEvolution record.
 *
 * This is the standard pipeline for any operation that returns
 * `{ shape, evolution }` from a WithHistory kernel method.
 */
export function propagateAllMetadata(
  evolution: ShapeEvolution,
  inputs: readonly AnyShape<Dimension>[],
  result: AnyShape<Dimension>
): void {
  propagateOriginsFromEvolution(evolution, inputs, result);
  propagateFaceTagsFromEvolution(evolution, inputs, result);
  propagateColorsFromEvolution(evolution, inputs, result);
}

/**
 * Fallback metadata propagation when no ShapeEvolution is available.
 *
 * Matches result faces to input faces by hash code (and geometric fallback).
 * Used by operations that don't support WithHistory (e.g., native fuseAll).
 *
 * **Limitation:** Only propagates face origins. Face tags and face colors
 * require a ShapeEvolution record to map input→output face hashes, so they
 * are lost through this path. Batch booleans (`fuseAll`, `cutAll`) therefore
 * have weaker metadata guarantees than pairwise booleans (`fuse`, `cut`).
 */
export function propagateMetadataByHash(
  inputs: readonly AnyShape<Dimension>[],
  result: AnyShape<Dimension>
): void {
  propagateOriginsByHash(inputs, result);
}

/**
 * Propagate all metadata through a *rigid relocation* (a `locate` re-tag).
 *
 * A relocated shape shares the source's TShape, so its faces correspond 1:1 to
 * the source faces in iteration order — but carry new, location-dependent
 * hashes, so the hash-keyed metadata must be re-keyed rather than left as-is.
 * This synthesizes a 1:1 `modified` evolution (source face hash → moved face
 * hash) and runs the standard propagation pipeline, so origins, tags, and
 * colors all survive a move at `locate` cost (O(faces)), not a full copy.
 *
 * Callers should gate on {@link hasAnyMetadata} first: with no metadata this
 * does pointless face iteration. The face counts always match for a rigid
 * relocation; the length guard is purely defensive.
 */
export function propagateMetadataThroughRelocation(
  source: AnyShape<Dimension>,
  moved: AnyShape<Dimension>
): void {
  const kernel = getKernel();
  const srcFaces = [...kernel.iterShapes(source.wrapped, 'face')];
  const movedFaces = [...kernel.iterShapes(moved.wrapped, 'face')];
  if (srcFaces.length !== movedFaces.length) return;

  const modified = new Map<number, number[]>();
  for (let i = 0; i < srcFaces.length; i++) {
    const sf = srcFaces[i];
    const mf = movedFaces[i];
    if (sf === undefined || mf === undefined) continue;
    modified.set(kernel.hashCode(sf, HASH_CODE_MAX), [kernel.hashCode(mf, HASH_CODE_MAX)]);
  }
  // Only the hashes are needed; release the transient face handles.
  for (const f of srcFaces) kernel.dispose(f);
  for (const f of movedFaces) kernel.dispose(f);
  propagateAllMetadata({ modified, generated: new Map(), deleted: new Set() }, [source], moved);
}
