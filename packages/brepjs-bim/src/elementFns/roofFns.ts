import { polygon, extrude, isValidSolid } from 'brepjs';
import type { ValidSolid, Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { RoofSpec } from '../specs/roofSpec.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError, geometryError } from '../errors/bimError.js';

// Returned solid is unplaced template geometry: footprint rectangle in the
// global XY plane (length × width), extruded along +Z by thickness.
// origin/axisX/axisZ are applied by the IFC layer via IfcLocalPlacement.
//
// All predefined types produce a flat rectangular slab. For pitched/curved roof
// shapes the slab is a simplified-but-valid envelope; `predefinedType` carries
// the intended shape to IFC consumers.
export function roofToSolid(spec: RoofSpec): Result<ValidSolid, BimError> {
  if (spec.length <= 0) {
    return err(specError('ROOF_ZERO_LENGTH', 'Roof length must be positive'));
  }
  if (spec.width <= 0) {
    return err(specError('ROOF_ZERO_WIDTH', 'Roof width must be positive'));
  }
  if (spec.thickness <= 0) {
    return err(specError('ROOF_ZERO_THICKNESS', 'Roof thickness must be positive'));
  }

  const { length, width, thickness } = spec;

  const profileResult = polygon([
    [0, 0, 0],
    [length, 0, 0],
    [length, width, 0],
    [0, width, 0],
  ]);

  if (!profileResult.ok) {
    return err(fromBrepError(profileResult.error, 'ROOF_PROFILE_FAILED', 'Failed to create roof profile'));
  }

  using profile = profileResult.value;
  const solidResult = extrude(profile, [0, 0, thickness]);

  if (!solidResult.ok) {
    return err(fromBrepError(solidResult.error, 'ROOF_EXTRUDE_FAILED', 'Failed to extrude roof profile'));
  }

  const solid = solidResult.value;
  if (!isValidSolid(solid)) {
    solid[Symbol.dispose]();
    return err(geometryError('ROOF_INVALID_SOLID', 'Extruded roof solid failed validity check'));
  }
  return ok(solid);
}
