/**
 * Shared utilities for extrusion operations.
 * Used by both class-based (extrude.ts) and functional (extrudeFns.ts) APIs.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT types are dynamic
type OcType = any;

import { getKernel } from '../kernel/index.js';
import { gcWithScope } from '../core/disposal.js';
import { type Result, ok, err } from '../core/result.js';
import { validationError } from '../core/errors.js';

// ---------------------------------------------------------------------------
// Sweep configuration
// ---------------------------------------------------------------------------

/** Configuration for sweep/pipe operations along a spine. */
export interface SweepOptions {
  /** Use Frenet trihedron for profile orientation */
  frenet?: boolean;
  /** Auxiliary spine for twist control */
  auxiliarySpine?: { wrapped: OcType };
  /** Scaling law along the path */
  law?: OcType;
  /** Transition mode at corners: 'right' (sharp), 'transformed', or 'round' */
  transitionMode?: 'right' | 'transformed' | 'round';
  /** Enable contact detection */
  withContact?: boolean;
  /** Support surface for constrained sweeps */
  support?: OcType;
  /** Force profile to be orthogonal to spine */
  forceProfileSpineOthogonality?: boolean;

  // --- Performance tuning ---

  /**
   * Use BRepOffsetAPI_MakePipe (simple pipe) instead of MakePipeShell.
   * Much faster for constant cross-section profiles, especially rotationally
   * symmetric ones (circles, regular polygons) where orientation doesn't matter.
   * Incompatible with frenet, auxiliarySpine, law, and support options.
   */
  mode?: 'general' | 'simple';
  /** 3D approximation tolerance for MakePipeShell (default: OCCT default ~1e-7). */
  tolerance?: number;
  /** Boundary tolerance for MakePipeShell. Defaults to `tolerance` if set. */
  boundTolerance?: number;
  /** Angular tolerance in radians for MakePipeShell. */
  angularTolerance?: number;
  /** Maximum B-spline degree for pipe surface approximation. */
  maxDegree?: number;
  /** Maximum number of approximation segments. */
  maxSegments?: number;
}

// ---------------------------------------------------------------------------
// Extrusion profile types
// ---------------------------------------------------------------------------

/** Configuration for extrusion profile scaling along the path. */
export interface ExtrusionProfile {
  /** Profile curve type: 's-curve' for smooth easing, 'linear' for constant scaling */
  profile?: 's-curve' | 'linear';
  /** End scale factor (1 = same size, 0.5 = half size at end) */
  endFactor?: number;
}

// ---------------------------------------------------------------------------
// Law construction
// ---------------------------------------------------------------------------

/**
 * Build an OCCT scaling law from an extrusion profile configuration.
 *
 * The law defines how the cross-section scales along the extrusion path.
 * An `'s-curve'` profile produces smooth ease-in/ease-out scaling, while
 * `'linear'` produces constant-rate scaling.
 *
 * @param extrusionLength - Total length of the extrusion path.
 * @param profile - Profile configuration with curve type and end scale factor.
 * @returns `Result` containing a trimmed OCCT `Law_Function`, or a validation error
 *   if the profile type is unsupported.
 */
export function buildLawFromProfile(
  extrusionLength: number,
  { profile, endFactor = 1 }: ExtrusionProfile
): Result<OcType> {
  const oc = getKernel().oc;
  const r = gcWithScope();

  let law: OcType;
  if (profile === 's-curve') {
    law = r(new oc.Law_S());
    law.Set_1(0, 1, extrusionLength, endFactor);
  } else if (profile === 'linear') {
    law = r(new oc.Law_Linear());
    law.Set(0, 1, extrusionLength, endFactor);
  } else {
    return err(
      validationError('UNSUPPORTED_PROFILE', `Unsupported extrusion profile: ${String(profile)}`)
    );
  }

  return ok(law.Trim(0, extrusionLength, 1e-6));
}
