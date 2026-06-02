import { polygon, extrude, isValidSolid } from 'brepjs';
import type { ValidSolid, Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { RailingSpec } from '../specs/railingSpec.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError, geometryError } from '../errors/bimError.js';

// Returned solid is unplaced template geometry: a rectangular rail cross-section
// (thickness × height) in the global YZ plane, swept (extruded) along +X by the
// run length. A straight run sweeps the profile along a linear path, which is a
// pure extrusion. origin/axisX/axisZ are applied by the IFC layer via
// IfcLocalPlacement and are not embedded in this brepjs solid.
export function railingToSolid(spec: RailingSpec): Result<ValidSolid, BimError> {
  if (spec.length <= 0) {
    return err(specError('RAILING_ZERO_LENGTH', 'Railing length must be positive'));
  }
  if (spec.height <= 0) {
    return err(specError('RAILING_ZERO_HEIGHT', 'Railing height must be positive'));
  }
  if (spec.thickness <= 0) {
    return err(specError('RAILING_ZERO_THICKNESS', 'Railing thickness must be positive'));
  }

  const { length, height, thickness } = spec;

  const profileResult = polygon([
    [0, 0, 0],
    [0, thickness, 0],
    [0, thickness, height],
    [0, 0, height],
  ]);

  if (!profileResult.ok) {
    return err(fromBrepError(profileResult.error, 'RAILING_PROFILE_FAILED', 'Failed to create railing profile'));
  }

  using profile = profileResult.value;
  const solidResult = extrude(profile, [length, 0, 0]);

  if (!solidResult.ok) {
    return err(fromBrepError(solidResult.error, 'RAILING_EXTRUDE_FAILED', 'Failed to sweep railing profile'));
  }

  const solid = solidResult.value;
  if (!isValidSolid(solid)) {
    solid[Symbol.dispose]();
    return err(geometryError('RAILING_INVALID_SOLID', 'Swept railing solid failed validity check'));
  }
  return ok(solid);
}
