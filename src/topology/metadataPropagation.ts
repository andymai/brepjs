/**
 * Centralized metadata propagation pipeline for kernel operations.
 *
 * All kernel operations that produce new shapes from inputs need to propagate
 * three kinds of metadata: face origins, face tags, and face colors. This
 * module provides the shared plumbing so that booleanFns, modifierFns, and
 * transform functions don't duplicate the same ~20-line block.
 */

import type { ShapeEvolution } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import type { AnyShape, Dimension } from '../core/shapeTypes.js';
import { HASH_CODE_MAX } from '../core/constants.js';
import {
  getFaceOrigins,
  propagateOriginsFromEvolution,
  propagateOriginsByHash,
} from './originTrackingFns.js';
import { propagateFaceTagsFromEvolution, hasFaceTags } from './faceTagFns.js';
import { propagateColorsFromEvolution, hasColorMetadata } from './colorFns.js';

// ---------------------------------------------------------------------------
// Face hash collection
// ---------------------------------------------------------------------------

/**
 * Collect ALL face hashes from input shapes for WithHistory kernel methods.
 *
 * Fast-path: returns empty array when no inputs have any metadata (origins,
 * tags, or colors), avoiding expensive WASM topology exploration.
 */
export function collectInputFaceHashes(inputs: readonly AnyShape<Dimension>[]): number[] {
  // O(1) check: skip expensive face iteration when no metadata exists
  const hasMetadata = inputs.some(
    (s) => getFaceOrigins(s) !== undefined || hasFaceTags(s) || hasColorMetadata(s)
  );
  if (!hasMetadata) return [];

  const hashes: number[] = [];
  for (const input of inputs) {
    const faces = getKernel().iterShapes(input.wrapped, 'face');
    for (const face of faces) {
      hashes.push(face.HashCode(HASH_CODE_MAX));
    }
  }
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
 */
export function propagateMetadataByHash(
  inputs: readonly AnyShape<Dimension>[],
  result: AnyShape<Dimension>
): void {
  propagateOriginsByHash(inputs, result);
  // Tag and color propagation by hash requires evolution data —
  // without it, only origin propagation (which has its own hash fallback) works.
}
