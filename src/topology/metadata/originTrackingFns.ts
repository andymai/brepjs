/**
 * Face origin tracking — tag faces with integer origins and propagate
 * them through kernel operations via ShapeEvolution records.
 */

import { getKernel } from '@/kernel/index.js';
import type { ShapeEvolution } from '@/kernel/types.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { HASH_CODE_MAX } from '@/core/constants.js';
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
    map.set(getKernel().hashCode(f.wrapped, HASH_CODE_MAX), origin);
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
          // Generated faces (new geometry created at a boolean seam) inherit
          // the origin of the input face that generated them, rather than
          // defaulting to 0 (body). Without this the surface where a feature
          // tool meets the body — e.g. a scoop ramp's top edge against the
          // wall — loses its tag and renders in the body color in multi-color
          // consumers (gridfinity-layout-tool GH #1654). first-writer-wins via
          // the `has` guard keeps it deterministic when a seam is shared.
          resultMap.set(genHash, origin);
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
 * Fallback origin propagation when no kernel op object is available
 * (native `fuseAll` / `cutAll`, which expose no ShapeEvolution record).
 *
 * Matches result faces to input faces by hash code first. Faces that pass
 * through the boolean unchanged keep their hash and recover their origin
 * directly. Faces the boolean *regenerates* (split, merged, or re-created at
 * the intersection) get a fresh hash that matches no input — these fall back
 * to geometric matching (normal + centroid) against the input face
 * signatures.
 *
 * The geometric pass runs for every unmatched face, not only when the hash
 * pass found nothing. A partial hash match is the common case for additive
 * features (pass-through side walls match by hash; the surfaces where the
 * tool meets the body — feature tops, flush walls — are regenerated and need
 * the geometric pass). Gating the fallback on "zero hash matches" left those
 * regenerated faces with no origin, so they fell back to 0 (body) at mesh
 * time — the multi-color export bug where a scoop/label/lip top printed in
 * the body color. Matching against the full signature set (body origin 0
 * included) keeps body faces body and feature faces feature.
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

  // Hash pass: faces unchanged by the boolean keep their origin directly.
  const unmatched: typeof resultFaces = [];
  for (const f of resultFaces) {
    const hash = kernel.hashCode(f.wrapped, HASH_CODE_MAX);
    const origin = lookup.get(hash);
    if (origin !== undefined) {
      resultMap.set(hash, origin);
    } else {
      unmatched.push(f);
    }
  }

  // Geometric pass: recover origins for boolean-regenerated faces by matching
  // surface normal + centroid against the input faces.
  if (unmatched.length > 0) {
    const inputSigs: {
      origin: number;
      normal: [number, number, number];
      centroid: [number, number, number];
    }[] = [];
    for (const input of inputs) {
      const origins = getFaceOrigins(input);
      if (!origins) continue;
      for (const f of getFaces(input)) {
        const hash = kernel.hashCode(f.wrapped, HASH_CODE_MAX);
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
      for (const f of unmatched) {
        const hash = kernel.hashCode(f.wrapped, HASH_CODE_MAX);
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

  if (resultMap.size > 0) {
    const cache = getOrCreateCache(result);
    cache.faceOrigins = resultMap;
  }
}
