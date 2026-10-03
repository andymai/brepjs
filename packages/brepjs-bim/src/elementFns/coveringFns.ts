import { generateGeometry } from '../geometryGeneration.js';
import { validateGeneratedSolid } from './validateGeneratedSolid.js';
import { polygon, extrude } from 'brepjs';
import type { ValidSolid, Result } from 'brepjs';
import { err } from 'brepjs';
import type { CoveringSpec } from '../specs/coveringSpec.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError } from '../errors/bimError.js';

// Returned solid is unplaced template geometry: a thin footprint rectangle
// (length × width) in the global XY plane, extruded along +Z by thickness — a
// floor/ceiling/cladding covering sheet. origin/axisX/axisZ are applied by the
// IFC layer via IfcLocalPlacement and are not embedded in this brepjs solid.
export function coveringToSolid(spec: CoveringSpec): Result<ValidSolid, BimError> {
  return generateGeometry({ operation: 'coveringToSolid', codePrefix: 'COVERING' }, (own) => {
    if (spec.length <= 0) {
      return err(specError('COVERING_ZERO_LENGTH', 'Covering length must be positive'));
    }
    if (spec.width <= 0) {
      return err(specError('COVERING_ZERO_WIDTH', 'Covering width must be positive'));
    }
    if (spec.thickness <= 0) {
      return err(specError('COVERING_ZERO_THICKNESS', 'Covering thickness must be positive'));
    }

    const { length, width, thickness } = spec;

    const profileResult = polygon([
      [0, 0, 0],
      [length, 0, 0],
      [length, width, 0],
      [0, width, 0],
    ]);

    if (!profileResult.ok) {
      return err(
        fromBrepError(
          profileResult.error,
          'COVERING_PROFILE_FAILED',
          'Failed to create covering profile'
        )
      );
    }

    const profile = own(profileResult.value);
    const solidResult = extrude(profile, [0, 0, thickness]);

    if (!solidResult.ok) {
      return err(
        fromBrepError(
          solidResult.error,
          'COVERING_EXTRUDE_FAILED',
          'Failed to extrude covering profile'
        )
      );
    }

    const solid = own(solidResult.value);
    return validateGeneratedSolid(solid, {
      code: 'COVERING_INVALID_SOLID',
      message: 'Extruded covering solid failed validity check',
    });
  });
}
