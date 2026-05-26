import { polygon, extrude, isValidSolid } from 'brepjs';
import type { ValidSolid, Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { SlabSpec } from '../specs/slabSpec.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError, geometryError } from '../errors/bimError.js';

// Returned solid is unplaced template geometry: footprint rectangle in the
// global XY plane (length × width), extruded along +Z by thickness.
// origin/axisX/axisZ are applied by the IFC layer via IfcLocalPlacement.
export function slabToSolid(spec: SlabSpec): Result<ValidSolid, BimError> {
  if (spec.length <= 0) {
    return err(specError('SLAB_ZERO_LENGTH', 'Slab length must be positive'));
  }
  if (spec.width <= 0) {
    return err(specError('SLAB_ZERO_WIDTH', 'Slab width must be positive'));
  }
  if (spec.thickness <= 0) {
    return err(specError('SLAB_ZERO_THICKNESS', 'Slab thickness must be positive'));
  }

  const { length, width, thickness } = spec;

  const profileResult = polygon([
    [0, 0, 0],
    [length, 0, 0],
    [length, width, 0],
    [0, width, 0],
  ]);

  if (!profileResult.ok) {
    return err(fromBrepError(profileResult.error, 'SLAB_PROFILE_FAILED', 'Failed to create slab profile'));
  }

  using profile = profileResult.value;
  const solidResult = extrude(profile, [0, 0, thickness]);

  if (!solidResult.ok) {
    return err(fromBrepError(solidResult.error, 'SLAB_EXTRUDE_FAILED', 'Failed to extrude slab profile'));
  }

  const solid = solidResult.value;
  if (!isValidSolid(solid)) {
    solid[Symbol.dispose]();
    return err(geometryError('SLAB_INVALID_SOLID', 'Extruded slab solid failed validity check'));
  }
  return ok(solid);
}
