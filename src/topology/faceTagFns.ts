/**
 * Face naming and metadata — tag faces with string names that persist
 * through boolean operations and modifiers.
 *
 * Built on the existing face hash / origin propagation system in shapeFns.ts.
 */

import type { ShapeEvolution } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import type { AnyShape, Dimension, Face } from '../core/shapeTypes.js';
import { HASH_CODE_MAX } from '../core/constants.js';
import { getFaces } from './shapeFns.js';

// ---------------------------------------------------------------------------
// Internal storage
// ---------------------------------------------------------------------------

// Maps shape (by identity) → tag name → set of face hashes
const shapeTagStore = new WeakMap<object, Map<string, Set<number>>>();

// Maps shape (by identity) → tag name → metadata
const tagMetadataStore = new WeakMap<object, Map<string, Record<string, unknown>>>();

/** O(1) check whether a shape has any face tags attached. */
export function hasFaceTags(shape: AnyShape<Dimension>): boolean {
  return shapeTagStore.has(shape.wrapped);
}

function getTagMap(shape: AnyShape<Dimension>): Map<string, Set<number>> {
  let map = shapeTagStore.get(shape.wrapped);
  if (!map) {
    map = new Map();
    shapeTagStore.set(shape.wrapped, map);
  }
  return map;
}

function getMetaMap(shape: AnyShape<Dimension>): Map<string, Record<string, unknown>> {
  let map = tagMetadataStore.get(shape.wrapped);
  if (!map) {
    map = new Map();
    tagMetadataStore.set(shape.wrapped, map);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Tag selected faces with a string name.
 *
 * @param shape - The shape containing the faces.
 * @param selector - Array of faces, or a predicate function.
 * @param tag - The tag name to assign.
 * @returns The same shape (tags are stored externally).
 */
export function tagFaces(
  shape: AnyShape<Dimension>,
  selector: Face<Dimension>[] | ((face: Face<Dimension>) => boolean),
  tag: string
): AnyShape<Dimension> {
  const faces = Array.isArray(selector) ? selector : getFaces(shape).filter(selector);

  const tagMap = getTagMap(shape);
  const existing = tagMap.get(tag) ?? new Set<number>();

  for (const face of faces) {
    existing.add(getKernel().hashCode(face.wrapped, HASH_CODE_MAX));
  }

  tagMap.set(tag, existing);
  return shape;
}

/**
 * Find all faces on a shape that have the given tag.
 *
 * Checks both direct tags and propagated origins (for faces that
 * survived boolean/modifier operations).
 */
export function findFacesByTag(shape: AnyShape<Dimension>, tag: string): Face<Dimension>[] {
  const tagMap = shapeTagStore.get(shape.wrapped);
  if (!tagMap) return [];

  const hashes = tagMap.get(tag);
  if (!hashes || hashes.size === 0) return [];

  const result: Face<Dimension>[] = [];
  for (const face of getFaces(shape)) {
    const hash = getKernel().hashCode(face.wrapped, HASH_CODE_MAX);
    if (hashes.has(hash)) {
      result.push(face);
    }
  }
  return result;
}

/**
 * Get all tags and their associated faces on a shape.
 */
export function getFaceTags(shape: AnyShape<Dimension>): Map<string, Face<Dimension>[]> {
  const result = new Map<string, Face<Dimension>[]>();
  const tagMap = shapeTagStore.get(shape.wrapped);
  if (!tagMap) return result;

  const faces = getFaces(shape);
  const faceByHash = new Map<number, Face<Dimension>>();
  for (const face of faces) {
    faceByHash.set(getKernel().hashCode(face.wrapped, HASH_CODE_MAX), face);
  }

  for (const [tag, hashes] of tagMap) {
    const taggedFaces: Face<Dimension>[] = [];
    for (const hash of hashes) {
      const face = faceByHash.get(hash);
      if (face) taggedFaces.push(face);
    }
    if (taggedFaces.length > 0) {
      result.set(tag, taggedFaces);
    }
  }

  return result;
}

/**
 * Store arbitrary metadata for a tag on a shape.
 */
export function setTagMetadata(
  shape: AnyShape<Dimension>,
  tag: string,
  metadata: Record<string, unknown>
): AnyShape<Dimension> {
  const metaMap = getMetaMap(shape);
  metaMap.set(tag, metadata);
  return shape;
}

/**
 * Retrieve metadata for a tag on a shape.
 */
export function getTagMetadata(
  shape: AnyShape<Dimension>,
  tag: string
): Record<string, unknown> | undefined {
  return tagMetadataStore.get(shape.wrapped)?.get(tag);
}

/**
 * Propagate face tags from input shapes to a result shape using a
 * kernel-provided ShapeEvolution record (no direct kernel op access needed).
 */
export function propagateFaceTagsFromEvolution(
  evolution: ShapeEvolution,
  inputs: readonly AnyShape<Dimension>[],
  result: AnyShape<Dimension>
): void {
  const resultTagMap = getTagMap(result);

  for (const input of inputs) {
    const inputTagMap = shapeTagStore.get(input.wrapped);
    if (!inputTagMap) continue;

    // Build hash→tags lookup for this input
    const hashToTags = new Map<number, string[]>();
    for (const [tag, hashes] of inputTagMap) {
      for (const hash of hashes) {
        const tags = hashToTags.get(hash) ?? [];
        tags.push(tag);
        hashToTags.set(hash, tags);
      }
    }

    // For each tagged face hash, use the evolution to find result hashes
    for (const [hash, tags] of hashToTags) {
      if (evolution.deleted.has(hash)) continue;

      const modifiedHashes = evolution.modified.get(hash);
      if (modifiedHashes && modifiedHashes.length > 0) {
        for (const modHash of modifiedHashes) {
          for (const tag of tags) {
            const set = resultTagMap.get(tag) ?? new Set<number>();
            set.add(modHash);
            resultTagMap.set(tag, set);
          }
        }
      } else {
        // Face survived unmodified
        for (const tag of tags) {
          const set = resultTagMap.get(tag) ?? new Set<number>();
          set.add(hash);
          resultTagMap.set(tag, set);
        }
      }
    }

    // Copy metadata
    const inputMetaMap = tagMetadataStore.get(input.wrapped);
    if (inputMetaMap) {
      const resultMetaMap = getMetaMap(result);
      for (const [tag, meta] of inputMetaMap) {
        if (!resultMetaMap.has(tag)) {
          resultMetaMap.set(tag, meta);
        }
      }
    }
  }
}
