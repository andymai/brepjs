import { generateGeometry } from '../geometryGeneration.js';
import { validateGeneratedSolid } from './validateGeneratedSolid.js';
import { polygon, extrude } from 'brepjs';
import type { ValidSolid, Result } from 'brepjs';
import { err } from 'brepjs';
import type { ColumnSpec } from '../specs/columnSpec.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError } from '../errors/bimError.js';
import { profileToPolygon } from './profileFns.js';
import { isExtendedProfile } from '../specs/profile.js';
import { extendedProfileToFace } from '../specs/profilesExtended.js';

// Returned solid is unplaced template geometry: profile in the global XY plane
// (cross-section centered on the local origin), extruded along +Z by height.
// origin/axisX/axisZ are applied by the IFC layer via IfcLocalPlacement.
export function columnToSolid(spec: ColumnSpec): Result<ValidSolid, BimError> {
  return generateGeometry({ operation: 'columnToSolid', codePrefix: 'COLUMN' }, (own) => {
    if (spec.height <= 0) {
      return err(specError('COLUMN_ZERO_HEIGHT', 'Column height must be positive'));
    }

    // Extended/hollow profiles have no single outer polygon; build the face (with
    // voids) directly and extrude along +Z like the core path.
    if (isExtendedProfile(spec.profile)) {
      const faceResult = extendedProfileToFace(spec.profile);
      if (!faceResult.ok) return err(faceResult.error);
      const face = own(faceResult.value);
      const extResult = extrude(face, [0, 0, spec.height]);
      if (!extResult.ok) {
        return err(
          fromBrepError(
            extResult.error,
            'COLUMN_EXTRUDE_FAILED',
            'Failed to extrude column profile'
          )
        );
      }
      const extSolid = own(extResult.value);
      return validateGeneratedSolid(extSolid, {
        code: 'COLUMN_INVALID_SOLID',
        message: 'Extruded column solid failed validity check',
      });
    }

    const profilePtsResult = profileToPolygon(spec.profile);
    if (!profilePtsResult.ok) return err(profilePtsResult.error);
    const profilePts = profilePtsResult.value;

    const profileResult = polygon(profilePts);
    if (!profileResult.ok) {
      return err(
        fromBrepError(
          profileResult.error,
          'COLUMN_PROFILE_FAILED',
          'Failed to create column profile'
        )
      );
    }

    const profile = own(profileResult.value);
    const solidResult = extrude(profile, [0, 0, spec.height]);
    if (!solidResult.ok) {
      return err(
        fromBrepError(
          solidResult.error,
          'COLUMN_EXTRUDE_FAILED',
          'Failed to extrude column profile'
        )
      );
    }

    const solid = own(solidResult.value);
    return validateGeneratedSolid(solid, {
      code: 'COLUMN_INVALID_SOLID',
      message: 'Extruded column solid failed validity check',
    });
  });
}
