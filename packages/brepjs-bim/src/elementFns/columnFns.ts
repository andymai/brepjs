import { polygon, extrude, isValidSolid } from 'brepjs';
import type { ValidSolid, Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { ColumnSpec } from '../specs/columnSpec.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError, geometryError } from '../errors/bimError.js';
import { profileToPolygon } from './profileFns.js';

// Returned solid is unplaced template geometry: profile in the global XY plane
// (cross-section centered on the local origin), extruded along +Z by height.
// origin/axisX/axisZ are applied by the IFC layer via IfcLocalPlacement.
export function columnToSolid(spec: ColumnSpec): Result<ValidSolid, BimError> {
  if (spec.height <= 0) {
    return err(specError('COLUMN_ZERO_HEIGHT', 'Column height must be positive'));
  }

  const profilePts = profileToPolygon(spec.profile);

  const profileResult = polygon(profilePts);
  if (!profileResult.ok) {
    return err(fromBrepError(profileResult.error, 'COLUMN_PROFILE_FAILED', 'Failed to create column profile'));
  }

  using profile = profileResult.value;
  const solidResult = extrude(profile, [0, 0, spec.height]);
  if (!solidResult.ok) {
    return err(fromBrepError(solidResult.error, 'COLUMN_EXTRUDE_FAILED', 'Failed to extrude column profile'));
  }

  const solid = solidResult.value;
  if (!isValidSolid(solid)) {
    solid[Symbol.dispose]();
    return err(geometryError('COLUMN_INVALID_SOLID', 'Extruded column solid failed validity check'));
  }
  return ok(solid);
}
