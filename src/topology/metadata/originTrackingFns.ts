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

/** Max 3D centroid separation (mm²) for a "near" match — the general case. */
const MAX_MATCH_DIST_SQ = 100;

/** Min |outNormal·inNormal| for two faces to count as sharing a plane's orientation. */
const COPLANAR_NORMAL_MIN = 0.985;

/**
 * Max squared perpendicular offset (mm²) from an input face's plane for the
 * output face to count as *coplanar* with it — i.e. a piece the boolean sliced
 * off that same planar surface. 0.1mm² tolerates kernel/mesh float noise while
 * still separating floors that sit even a fraction of a mm apart in depth.
 */
const COPLANAR_OFFSET_SQ = 0.1;

interface OriginSig {
  readonly normal: readonly [number, number, number];
  readonly centroid: readonly [number, number, number];
  readonly origin: number;
  /** True only for planar surfaces — the coplanar fallback requires it. */
  readonly planar: boolean;
}

/**
 * Find the best origin match for a result face by comparing normals and centroids
 * against input face signatures. Returns `undefined` if no good match exists.
 *
 * Two passes, near strictly preferred:
 *  1. Near match — same-facing normal (signed dot ≥ 0.707) and centroids within
 *     {@link MAX_MATCH_DIST_SQ}. The general case for regenerated seam faces
 *     (feature tops, flush walls). Unchanged legacy behavior. If any near match
 *     exists it wins outright — the coplanar pass never runs — so a distant
 *     coplanar candidate can't outscore a valid near one.
 *  2. Coplanar match (only when no near match, and only between PLANAR faces) —
 *     the output face lies on an input face's plane (parallel *or* antiparallel
 *     normal, tiny perpendicular offset) regardless of how far its centroid
 *     drifted in-plane. Two cases pass 1 misses:
 *       • A boolean that splits a large planar face — a wide cutout floor sliced
 *         by an overlapping deeper cutout — leaves pieces >10mm from the parent
 *         centroid (past pass 1's cutoff).
 *       • A cut flips the cavity face's normal versus the tool face it came from,
 *         so the floor is antiparallel to its origin's input face.
 *     Both left the surface tagless → body color in multi-color consumers
 *     (gridfinity GH #2443). The planar gate keeps a curved output face from
 *     inheriting an origin off an unrelated face that merely shares a sampled
 *     tangent plane; among coplanar candidates the nearest in-plane wins.
 */
function findBestOriginMatch(
  outNormal: readonly [number, number, number],
  outCentroid: readonly [number, number, number],
  outPlanar: boolean,
  inputSigs: readonly OriginSig[]
): number | undefined {
  // Pass 1: near match — always wins when present.
  let bestNearScore = -Infinity;
  let bestNear: number | undefined;
  for (const inp of inputSigs) {
    const dot =
      outNormal[0] * inp.normal[0] + outNormal[1] * inp.normal[1] + outNormal[2] * inp.normal[2];
    if (dot < 0.707) continue;
    const dx = outCentroid[0] - inp.centroid[0];
    const dy = outCentroid[1] - inp.centroid[1];
    const dz = outCentroid[2] - inp.centroid[2];
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq > MAX_MATCH_DIST_SQ) continue;
    const score = dot - distSq / MAX_MATCH_DIST_SQ;
    if (score > bestNearScore) {
      bestNearScore = score;
      bestNear = inp.origin;
    }
  }
  if (bestNear !== undefined) return bestNear;

  // Pass 2: coplanar planar-face fallback. Only planar↔planar surfaces qualify.
  if (!outPlanar) return undefined;
  let bestInPlaneSq = Infinity;
  let bestCoplanar: number | undefined;
  for (const inp of inputSigs) {
    if (!inp.planar) continue;
    const dot =
      outNormal[0] * inp.normal[0] + outNormal[1] * inp.normal[1] + outNormal[2] * inp.normal[2];
    if (Math.abs(dot) < COPLANAR_NORMAL_MIN) continue;
    const dx = outCentroid[0] - inp.centroid[0];
    const dy = outCentroid[1] - inp.centroid[1];
    const dz = outCentroid[2] - inp.centroid[2];
    const perp = dx * inp.normal[0] + dy * inp.normal[1] + dz * inp.normal[2];
    if (perp * perp > COPLANAR_OFFSET_SQ) continue;
    const inPlaneSq = Math.max(0, dx * dx + dy * dy + dz * dz - perp * perp);
    if (inPlaneSq < bestInPlaneSq) {
      bestInPlaneSq = inPlaneSq;
      bestCoplanar = inp.origin;
    }
  }
  return bestCoplanar;
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
    const inputSigs: OriginSig[] = [];
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
          const planar = kernel.surfaceType(f.wrapped) === 'plane';
          inputSigs.push({ origin, normal, centroid, planar });
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
          const outPlanar = kernel.surfaceType(f.wrapped) === 'plane';

          const bestOrigin = findBestOriginMatch(outNormal, outCentroid, outPlanar, inputSigs);
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
