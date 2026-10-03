import { generateGeometry } from '../geometryGeneration.js';
import { validateGeneratedSolid } from './validateGeneratedSolid.js';
import { polygon, extrude, err } from 'brepjs';
import type { ValidSolid, Result } from 'brepjs';
import type { SpaceSpec } from '../specs/spaceSpec.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError } from '../errors/bimError.js';

// Returned solid is unplaced template geometry: the footprint (length × width)
// lies in the local XY plane with its corner at the origin, extruded along +Z
// by the clear height. origin/axisX/axisZ are applied by the IFC layer via
// IfcLocalPlacement and are not embedded in this brepjs solid.
export function spaceToSolid(spec: SpaceSpec): Result<ValidSolid, BimError> {
  return generateGeometry({ operation: 'spaceToSolid', codePrefix: 'SPACE' }, (own) => {
    if (spec.length <= 0) {
      return err(specError('SPACE_ZERO_LENGTH', 'Space length must be positive'));
    }
    if (spec.width <= 0) {
      return err(specError('SPACE_ZERO_WIDTH', 'Space width must be positive'));
    }
    if (spec.height <= 0) {
      return err(specError('SPACE_ZERO_HEIGHT', 'Space height must be positive'));
    }

    const { length, width, height } = spec;

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
          'SPACE_PROFILE_FAILED',
          'Failed to create space footprint'
        )
      );
    }

    const profile = own(profileResult.value);
    const solidResult = extrude(profile, [0, 0, height]);

    if (!solidResult.ok) {
      return err(
        fromBrepError(
          solidResult.error,
          'SPACE_EXTRUDE_FAILED',
          'Failed to extrude space footprint'
        )
      );
    }

    const solid = own(solidResult.value);
    return validateGeneratedSolid(solid, {
      code: 'SPACE_INVALID_SOLID',
      message: 'Extruded space solid failed validity check',
    });
  });
}
