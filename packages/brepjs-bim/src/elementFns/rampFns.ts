import { polygon, extrude, isValidSolid } from 'brepjs';
import type { ValidSolid, Result, Vec3 } from 'brepjs';
import { ok, err } from 'brepjs';
import type { RampFlightSpec } from '../specs/rampSpec.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError, geometryError } from '../errors/bimError.js';

export interface RampFlightSolid {
  readonly solid: ValidSolid;
  /**
   * True — the ramp flight is a simplified inclined-slab solid (a sloped prism),
   * not a fully detailed ramp with landings/nosings/edge details. Callers should
   * surface a SIMPLIFIED_GEOMETRY note. The solid is valid and non-degenerate.
   */
  readonly geometrySimplified: true;
}

// Builds the side silhouette of a ramp flight as a closed parallelogram in the
// local XZ plane (y = 0). The top surface runs from (0,0) to (length, rise)
// where rise = length * slope; the bottom surface is the same line offset down
// by `thickness` (measured vertically). Travel is along +X, rise along +Z.
// Points are ordered counter-clockwise viewed from +Y.
function buildSilhouette(length: number, rise: number, thickness: number): Vec3[] {
  return [
    [0, 0, -thickness],
    [length, 0, rise - thickness],
    [length, 0, rise],
    [0, 0, 0],
  ];
}

// Returned solid is unplaced template geometry in the local frame: foot of the
// ramp at the origin, climbing along +X / +Z, extruded across +Y by width.
// origin/axisX/axisZ are applied by the IFC layer via IfcLocalPlacement.
export function rampFlightToSolid(spec: RampFlightSpec): Result<RampFlightSolid, BimError> {
  if (spec.width <= 0) {
    return err(specError('RAMP_FLIGHT_ZERO_WIDTH', 'Ramp flight width must be positive'));
  }
  if (spec.length <= 0) {
    return err(specError('RAMP_FLIGHT_ZERO_LENGTH', 'Ramp flight length must be positive'));
  }
  if (spec.slope <= 0) {
    return err(specError('RAMP_FLIGHT_ZERO_SLOPE', 'Ramp flight slope must be positive'));
  }
  if (spec.thickness <= 0) {
    return err(specError('RAMP_FLIGHT_ZERO_THICKNESS', 'Ramp flight thickness must be positive'));
  }

  const rise = spec.length * spec.slope;
  const silhouette = buildSilhouette(spec.length, rise, spec.thickness);

  const profileResult = polygon(silhouette);
  if (!profileResult.ok) {
    return err(
      fromBrepError(
        profileResult.error,
        'RAMP_FLIGHT_PROFILE_FAILED',
        'Failed to create ramp flight silhouette profile'
      )
    );
  }

  using profile = profileResult.value;
  const solidResult = extrude(profile, [0, spec.width, 0]);
  if (!solidResult.ok) {
    return err(
      fromBrepError(
        solidResult.error,
        'RAMP_FLIGHT_EXTRUDE_FAILED',
        'Failed to extrude ramp flight silhouette'
      )
    );
  }

  const solid = solidResult.value;
  if (!isValidSolid(solid)) {
    solid[Symbol.dispose]();
    return err(geometryError('RAMP_FLIGHT_INVALID_SOLID', 'Ramp flight solid failed validity check'));
  }
  return ok({ solid, geometrySimplified: true });
}

// Net solid volume of a ramp flight (an inclined prism). The parallelogram
// cross-section area is `thickness * length` (a parallelogram's area is base ×
// perpendicular height; here base = length along X, vertical offset = thickness),
// swept across `width`. mm³.
export function rampFlightVolume(spec: RampFlightSpec): number {
  return spec.thickness * spec.length * spec.width;
}
