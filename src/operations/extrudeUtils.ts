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
 * Build an OCCT Law from an extrusion profile.
 * The law defines how the profile scales along the extrusion path.
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
