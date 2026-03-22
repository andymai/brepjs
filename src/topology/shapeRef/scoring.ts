/**
 * Face scoring for geometric fallback matching.
 * Modeled on the existing pattern in originTrackingFns.ts.
 */

import type { GeometricHint } from './shapeRefTypes.js';
import type { Face } from '@/core/shapeTypes.js';
import { normalAt, faceCenter, faceGeomType } from '@/topology/faceFns.js';
import { measureArea } from '@/measurement/measureFns.js';

// ---------------------------------------------------------------------------
// Scorer type
// ---------------------------------------------------------------------------

/** Scoring function: higher score = better match. Returns -Infinity to reject. */
export type FaceScorer = (hint: GeometricHint, face: Face) => number;

// ---------------------------------------------------------------------------
// Default scorer
// ---------------------------------------------------------------------------

/**
 * Default face scorer combining surface type, normal alignment, centroid proximity,
 * and area similarity.
 *
 * Scoring breakdown:
 * - Surface type match: +1.0 (mismatch when both defined: -Infinity)
 * - Normal dot product: weighted contribution (rejected if < 0.707)
 * - Centroid distance: quadratic penalty (rejected if distSq > 100)
 * - Area ratio: penalized if |log(hintArea / faceArea)| > 1.0
 */
export function defaultScorer(hint: GeometricHint, face: Face): number {
  let score = 0;

  // Surface type
  const faceType = faceGeomType(face);
  if (hint.surfaceType !== undefined) {
    if (faceType === hint.surfaceType) {
      score += 1.0;
    } else {
      return -Infinity;
    }
  }

  // Normal dot product
  if (hint.normal !== undefined) {
    const faceNormal = normalAt(face);
    const dot =
      hint.normal[0] * faceNormal[0] +
      hint.normal[1] * faceNormal[1] +
      hint.normal[2] * faceNormal[2];
    if (dot < 0.707) return -Infinity;
    score += dot;
  }

  // Centroid distance penalty
  if (hint.centroid !== undefined) {
    const faceCentroid = faceCenter(face);
    const dx = hint.centroid[0] - faceCentroid[0];
    const dy = hint.centroid[1] - faceCentroid[1];
    const dz = hint.centroid[2] - faceCentroid[2];
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq > 100) return -Infinity;
    score -= distSq / 100;
  }

  // Area ratio penalty
  if (hint.area !== undefined && hint.area > 0) {
    const areaResult = measureArea(face);
    if (areaResult.ok && areaResult.value > 0) {
      const logRatio = Math.abs(Math.log(hint.area / areaResult.value));
      if (logRatio > 1.0) {
        score -= logRatio;
      }
    }
  }

  return score;
}
