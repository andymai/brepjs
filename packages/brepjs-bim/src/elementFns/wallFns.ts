import { polygon, extrude, isValidSolid } from 'brepjs';
import type { ValidSolid, Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { WallSpec } from '../specs/wallSpec.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError, geometryError } from '../errors/bimError.js';

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

  const solidResult = extrude(profileResult.value, [length, 0, 0]);

  if (!solidResult.ok) {
    return err(fromBrepError(solidResult.error, 'WALL_EXTRUDE_FAILED', 'Failed to extrude wall profile'));
  }

  if (!isValidSolid(solidResult.value)) {
    return err(geometryError('WALL_INVALID_SOLID', 'Extruded wall solid failed validity check'));
  }
  return ok(solidResult.value);
}
