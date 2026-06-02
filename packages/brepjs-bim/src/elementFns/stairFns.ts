import { polygon, extrude, isValidSolid } from 'brepjs';
import type { ValidSolid, Result, Vec3 } from 'brepjs';
import { ok, err } from 'brepjs';
import type { StairFlightSpec } from '../specs/stairSpec.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError, geometryError } from '../errors/bimError.js';

export interface StairFlightSolid {
  readonly solid: ValidSolid;
  /**
   * False — stair flights are built as real stepped solids (tread/riser
   * sawtooth swept across the width), not a simplified bounding box. Present so
   * callers can surface a SIMPLIFIED_GEOMETRY note uniformly across element
   * kinds; the ramp builder sets this true.
   */
  readonly geometrySimplified: false;
}

// Builds the side silhouette of a stair flight as a closed polygon in the local
// XZ plane (y = 0). Travel is along +X, rise along +Z. The top edge is the
// stepped tread/riser sawtooth; the bottom edge is the flat soffit line from the
// far top corner back to the origin. Points are ordered counter-clockwise when
// viewed from +Y so the extrusion produces an outward-oriented solid.
//
// For N risers of height r and tread depth t, the nosing climbs in N steps:
//   (0,0) -> (0,r) -> (t,r) -> (t,2r) -> (2t,2r) -> ... -> (N*t, N*r)
// then the soffit closes back along the underside to (0,0).
function buildSilhouette(numberOfRisers: number, riserHeight: number, treadLength: number): Vec3[] {
  const pts: Vec3[] = [];
  // Start at the foot of the first riser.
  pts.push([0, 0, 0]);
  let x = 0;
  let z = 0;
  for (let i = 0; i < numberOfRisers; i++) {
    // Rise (riser face).
    z += riserHeight;
    pts.push([x, 0, z]);
    // Run (tread).
    x += treadLength;
    pts.push([x, 0, z]);
  }
  // Soffit: drop straight down at the far end, then back along the base.
  // Top-right corner is the last pushed point (x = N*t, z = N*r). Close the
  // loop along the bottom edge: far-bottom corner then origin.
  pts.push([x, 0, 0]);
  return pts;
}

// Returned solid is unplaced template geometry in the local frame: foot of the
// stair at the origin, climbing along +X / +Z, extruded across +Y by width.
// origin/axisX/axisZ are applied by the IFC layer via IfcLocalPlacement.
export function stairFlightToSolid(spec: StairFlightSpec): Result<StairFlightSolid, BimError> {
  if (spec.width <= 0) {
    return err(specError('STAIR_FLIGHT_ZERO_WIDTH', 'Stair flight width must be positive'));
  }
  if (spec.riserHeight <= 0) {
    return err(specError('STAIR_FLIGHT_ZERO_RISER', 'Stair flight riserHeight must be positive'));
  }
  if (spec.treadLength <= 0) {
    return err(specError('STAIR_FLIGHT_ZERO_TREAD', 'Stair flight treadLength must be positive'));
  }
  if (!Number.isInteger(spec.numberOfRisers) || spec.numberOfRisers < 1) {
    return err(
      specError('STAIR_FLIGHT_BAD_RISERS', 'Stair flight numberOfRisers must be a positive integer')
    );
  }

  const silhouette = buildSilhouette(spec.numberOfRisers, spec.riserHeight, spec.treadLength);

  const profileResult = polygon(silhouette);
  if (!profileResult.ok) {
    return err(
      fromBrepError(
        profileResult.error,
        'STAIR_FLIGHT_PROFILE_FAILED',
        'Failed to create stair flight silhouette profile'
      )
    );
  }

  using profile = profileResult.value;
  const solidResult = extrude(profile, [0, spec.width, 0]);
  if (!solidResult.ok) {
    return err(
      fromBrepError(
        solidResult.error,
        'STAIR_FLIGHT_EXTRUDE_FAILED',
        'Failed to extrude stair flight silhouette'
      )
    );
  }

  const solid = solidResult.value;
  if (!isValidSolid(solid)) {
    solid[Symbol.dispose]();
    return err(geometryError('STAIR_FLIGHT_INVALID_SOLID', 'Stair flight solid failed validity check'));
  }
  return ok({ solid, geometrySimplified: false });
}

// Net solid volume of a stair flight (sum of N right-triangle prisms = the
// stepped wedge). Useful for Qto and tests. mm³.
export function stairFlightVolume(spec: StairFlightSpec): number {
  const n = spec.numberOfRisers;
  // Stepped solid area in the XZ silhouette = sum over steps of the area under
  // each step's nosing relative to the flat base, which equals a staircase whose
  // cross-section area is t * r * (1 + 2 + ... + N) = t * r * N(N+1)/2.
  const area = spec.treadLength * spec.riserHeight * ((n * (n + 1)) / 2);
  return area * spec.width;
}
