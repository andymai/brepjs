/**
 * Face naming and metadata — tag faces with string names that persist
 * through boolean operations and modifiers.
 *
 * Built on the existing face hash / origin propagation system in shapeFns.ts.
 */

import type { AnyShape, Face } from '../core/shapeTypes.js';
import { HASH_CODE_MAX } from '../core/constants.js';
import { getFaces, iterOcList } from './shapeFns.js';

// ---------------------------------------------------------------------------
// Internal storage
// ---------------------------------------------------------------------------

// Maps shape (by identity) → tag name → set of face hashes
const shapeTagStore = new WeakMap<object, Map<string, Set<number>>>();

// Maps shape (by identity) → tag name → metadata
const tagMetadataStore = new WeakMap<object, Map<string, Record<string, unknown>>>();

function getTagMap(shape: AnyShape): Map<string, Set<number>> {
  let map = shapeTagStore.get(shape.wrapped);
  if (!map) {
    map = new Map();
    shapeTagStore.set(shape.wrapped, map);
  }
  return map;
}

function getMetaMap(shape: AnyShape): Map<string, Record<string, unknown>> {
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
  shape: AnyShape,
  selector: Face[] | ((face: Face) => boolean),
  tag: string
): AnyShape {
  const faces = Array.isArray(selector) ? selector : getFaces(shape).filter(selector);

  const tagMap = getTagMap(shape);
  const existing = tagMap.get(tag) ?? new Set<number>();

  for (const face of faces) {
    existing.add(face.wrapped.HashCode(HASH_CODE_MAX));
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
export function findFacesByTag(shape: AnyShape, tag: string): Face[] {
  const tagMap = shapeTagStore.get(shape.wrapped);
  if (!tagMap) return [];

  const hashes = tagMap.get(tag);
  if (!hashes || hashes.size === 0) return [];

  const result: Face[] = [];
  for (const face of getFaces(shape)) {
    const hash = face.wrapped.HashCode(HASH_CODE_MAX);
    if (hashes.has(hash)) {
      result.push(face);
    }
  }
  return result;
}

/**
 * Get all tags and their associated faces on a shape.
 */
export function getFaceTags(shape: AnyShape): Map<string, Face[]> {
  const result = new Map<string, Face[]>();
  const tagMap = shapeTagStore.get(shape.wrapped);
  if (!tagMap) return result;

  const faces = getFaces(shape);
  const faceByHash = new Map<number, Face>();
  for (const face of faces) {
    faceByHash.set(face.wrapped.HashCode(HASH_CODE_MAX), face);
  }

  for (const [tag, hashes] of tagMap) {
    const taggedFaces: Face[] = [];
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
  shape: AnyShape,
  tag: string,
  metadata: Record<string, unknown>
): AnyShape {
  const metaMap = getMetaMap(shape);
  metaMap.set(tag, metadata);
  return shape;
}

/**
 * Retrieve metadata for a tag on a shape.
 */
export function getTagMetadata(shape: AnyShape, tag: string): Record<string, unknown> | undefined {
  return tagMetadataStore.get(shape.wrapped)?.get(tag);
}

/**
 * Propagate face tags from input shapes to a result shape.
 *
 * Call this after any operation that creates a new shape from existing shapes
 * (booleans, fillets, chamfers, etc.) to preserve face tags.
 *
 * Uses OCCT's Modified()/Generated() to track which input faces
 * became which result faces.
 */
export function propagateFaceTags(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT WASM type gaps
  op: { Modified(s: any): any; Generated(s: any): any; IsDeleted?(s: any): boolean },
  inputs: readonly AnyShape[],
  result: AnyShape
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

    // For each tagged face in the input, find its descendants in the result
    for (const face of getFaces(input)) {
      const hash = face.wrapped.HashCode(HASH_CODE_MAX);
      const tags = hashToTags.get(hash);
      if (!tags) continue;

      if (op.IsDeleted?.(face.wrapped)) continue;

      // Check Modified faces
      const modifiedList = op.Modified(face.wrapped);
      const modSize = modifiedList.Size?.() ?? 0;
      if (modSize > 0) {
        iterOcList(modifiedList, (modFace) => {
          const modHash = modFace.HashCode(HASH_CODE_MAX);
          for (const tag of tags) {
            const set = resultTagMap.get(tag) ?? new Set<number>();
            set.add(modHash);
            resultTagMap.set(tag, set);
          }
        });
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
