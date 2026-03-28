/**
 * Face origin tracking — tag faces with integer origins and propagate
 * them through kernel operations via ShapeEvolution records.
 */

import { getKernel } from '@/kernel/index.js';
import type { ShapeEvolution } from '@/kernel/types.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { getOrQueryHashCode } from '@/core/shapePropertyCache.js';
import { getOrCreateCache, getCacheEntry, getFaces } from '@/topology/topologyQueryFns.js';

// ---------------------------------------------------------------------------
// Origin assignment
// ---------------------------------------------------------------------------

/**
 * Tag all faces of a shape with an opaque integer origin.
 * Consumers assign meaning (e.g., source line number).
 */
export function setShapeOrigin(shape: AnyShape<Dimension>, origin: number): void {
  const cache = getOrCreateCache(shape);
  const map = new Map<number, number>();
  for (const f of getFaces(shape)) {
    map.set(getOrQueryHashCode(getKernel(), f.wrapped), origin);
  }
  cache.faceOrigins = map;
}

/**
 * Get the face origin map for a shape (faceHash → originTag).
 * Returns undefined if no origins have been set or propagated.
 */
export function getFaceOrigins(shape: AnyShape<Dimension>): Map<number, number> | undefined {
  return getCacheEntry(shape)?.faceOrigins;
}

// ---------------------------------------------------------------------------
// Origin propagation via evolution
// ---------------------------------------------------------------------------

/**
 * Propagate face origins using a kernel-provided ShapeEvolution record.
 */
export function propagateOriginsFromEvolution(
  evolution: ShapeEvolution,
  inputs: readonly AnyShape<Dimension>[],
  result: AnyShape<Dimension>
): void {
  // Collect all input face origins
  const inputOrigins = new Map<number, number>();
  for (const input of inputs) {
    const origins = getFaceOrigins(input);
    if (!origins) continue;
    for (const [hash, origin] of origins) {
      inputOrigins.set(hash, origin);
    }
  }
  if (inputOrigins.size === 0) return;

  const resultMap = new Map<number, number>();

  for (const [hash, origin] of inputOrigins) {
    if (evolution.deleted.has(hash)) continue;

    const modifiedHashes = evolution.modified.get(hash);
    if (modifiedHashes && modifiedHashes.length > 0) {
      for (const modHash of modifiedHashes) {
        resultMap.set(modHash, origin);
      }
    } else {
      // Face was not modified — reuse original hash
      resultMap.set(hash, origin);
    }

    const generatedHashes = evolution.generated.get(hash);
    if (generatedHashes) {
      for (const genHash of generatedHashes) {
        if (!resultMap.has(genHash)) {
          resultMap.set(genHash, 0);
        }
      }
    }
  }

  if (resultMap.size > 0) {
    const cache = getOrCreateCache(result);
    cache.faceOrigins = resultMap;
  }
}

// ---------------------------------------------------------------------------
// Geometric matching helper
// ---------------------------------------------------------------------------

/**
 * Find the best origin match for a result face by comparing normals and centroids
 * against input face signatures. Returns `undefined` if no good match exists.
 */
function findBestOriginMatch(
  outNormal: readonly [number, number, number],
  outCentroid: readonly [number, number, number],
  inputSigs: ReadonlyArray<{
    normal: readonly [number, number, number];
    centroid: readonly [number, number, number];
    origin: number;
  }>
): number | undefined {
  let bestScore = -Infinity;
  let bestOrigin: number | undefined;
  for (const inp of inputSigs) {
    const dot =
      outNormal[0] * inp.normal[0] + outNormal[1] * inp.normal[1] + outNormal[2] * inp.normal[2];
    if (dot < 0.707) continue;
    const dx = outCentroid[0] - inp.centroid[0];
    const dy = outCentroid[1] - inp.centroid[1];
    const dz = outCentroid[2] - inp.centroid[2];
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq > 100) continue;
    const score = dot - distSq / 100;
    if (score > bestScore) {
      bestScore = score;
      bestOrigin = inp.origin;
    }
  }
  return bestOrigin;
}

// ---------------------------------------------------------------------------
// Origin propagation by hash (fallback)
// ---------------------------------------------------------------------------

/**
 * Fallback origin propagation when no kernel op object is available.
 * Matches result faces to input faces by hash code first; if no hash matches
 * are found, falls back to geometric matching (normal + centroid comparison).
 */
export function propagateOriginsByHash(
  inputs: readonly AnyShape<Dimension>[],
  result: AnyShape<Dimension>
): void {
  const lookup = new Map<number, number>();
  for (const input of inputs) {
    const origins = getFaceOrigins(input);
    if (!origins) continue;
    for (const [hash, origin] of origins) {
      lookup.set(hash, origin);
    }
  }
  if (lookup.size === 0) return;

  const kernel = getKernel();
  const resultMap = new Map<number, number>();
  const resultFaces = getFaces(result);

  // Try hash-based matching first
  for (const f of resultFaces) {
    const hash = getOrQueryHashCode(kernel, f.wrapped);
    const origin = lookup.get(hash);
    if (origin !== undefined) {
      resultMap.set(hash, origin);
    }
  }

  // Geometric fallback: when hash matching finds nothing, match by normal + centroid
  // This path only triggers with brepkit (arena-based face IDs) — not covered by OCCT tests
  /* v8 ignore start */
  if (resultMap.size === 0) {
    // Collect input face signatures
    const inputSigs: {
      origin: number;
      normal: [number, number, number];
      centroid: [number, number, number];
    }[] = [];
    for (const input of inputs) {
      const origins = getFaceOrigins(input);
      if (!origins) continue;
      for (const f of getFaces(input)) {
        const hash = getOrQueryHashCode(kernel, f.wrapped);
        const origin = origins.get(hash);
        if (origin === undefined) continue;
        try {
          const bounds = kernel.uvBounds(f.wrapped);
          const normal = kernel.surfaceNormal(
            f.wrapped,
            0.5 * (bounds.uMin + bounds.uMax),
            0.5 * (bounds.vMin + bounds.vMax)
          );
          const centroid = kernel.surfaceCenterOfMass(f.wrapped);
          inputSigs.push({ origin, normal, centroid });
        } catch {
          // skip faces that can't compute normal/centroid
        }
      }
    }

    if (inputSigs.length > 0) {
      for (const f of resultFaces) {
        const hash = getOrQueryHashCode(kernel, f.wrapped);
        try {
          const outBounds = kernel.uvBounds(f.wrapped);
          const outNormal = kernel.surfaceNormal(
            f.wrapped,
            0.5 * (outBounds.uMin + outBounds.uMax),
            0.5 * (outBounds.vMin + outBounds.vMax)
          );
          const outCentroid = kernel.surfaceCenterOfMass(f.wrapped);

          const bestOrigin = findBestOriginMatch(outNormal, outCentroid, inputSigs);
          if (bestOrigin !== undefined) {
            resultMap.set(hash, bestOrigin);
          }
        } catch {
          // skip faces that can't compute normal/centroid
        }
      }
    }
  }
  /* v8 ignore stop */

  if (resultMap.size > 0) {
    const cache = getOrCreateCache(result);
    cache.faceOrigins = resultMap;
  }
}
