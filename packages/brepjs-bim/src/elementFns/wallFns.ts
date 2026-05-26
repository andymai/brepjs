import { polygon, extrude, isValidSolid } from 'brepjs';
import type { ValidSolid, Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { WallSpec } from '../specs/wallSpec.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError, geometryError } from '../errors/bimError.js';

// Returned solid is unplaced template geometry (profile in global YZ plane,
// extruded along +X). origin/axisX/axisZ are applied by the IFC layer via
// IfcLocalPlacement and are not embedded in this brepjs solid.
export function wallToSolid(spec: WallSpec): Result<ValidSolid, BimError> {
  if (spec.length <= 0) {
    return err(specError('WALL_ZERO_LENGTH', 'Wall length must be positive'));
  }
  if (spec.height <= 0) {
    return err(specError('WALL_ZERO_HEIGHT', 'Wall height must be positive'));
  }
  if (spec.thickness <= 0) {
    return err(specError('WALL_ZERO_THICKNESS', 'Wall thickness must be positive'));
  }

  const { length, height, thickness } = spec;

  const profileResult = polygon([
    [0, 0, 0],
    [0, thickness, 0],
    [0, thickness, height],
    [0, 0, height],
  ]);

  if (!profileResult.ok) {
    return err(fromBrepError(profileResult.error, 'WALL_PROFILE_FAILED', 'Failed to create wall profile'));
  }

  using profile = profileResult.value;
  const solidResult = extrude(profile, [length, 0, 0]);

  if (!solidResult.ok) {
    return err(fromBrepError(solidResult.error, 'WALL_EXTRUDE_FAILED', 'Failed to extrude wall profile'));
  }

  const solid = solidResult.value;
  if (!isValidSolid(solid)) {
    solid[Symbol.dispose]();
    return err(geometryError('WALL_INVALID_SOLID', 'Extruded wall solid failed validity check'));
  }
  return ok(solid);
}
