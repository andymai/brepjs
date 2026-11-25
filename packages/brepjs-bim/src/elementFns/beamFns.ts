import { generateGeometry } from '../geometryGeneration.js';
import { validateGeneratedSolid } from './validateGeneratedSolid.js';
import { polygon, extrude, rotate } from 'brepjs';
import type { ValidSolid, Result } from 'brepjs';
import { err } from 'brepjs';
import type { BeamSpec } from '../specs/beamSpec.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError } from '../errors/bimError.js';
import { profileToPolygon } from './profileFns.js';
import { isExtendedProfile } from '../specs/profile.js';
import { extendedProfileToFace } from '../specs/profilesExtended.js';

// In the unplaced beam, section point (u, v) at distance s is (s, u, v).
export function beamToSolid(spec: BeamSpec): Result<ValidSolid, BimError> {
  return generateGeometry({ operation: 'beamToSolid', codePrefix: 'BEAM' }, (own) => {
    if (spec.length <= 0) {
      return err(specError('BEAM_ZERO_LENGTH', 'Beam length must be positive'));
    }

    if (isExtendedProfile(spec.profile)) {
      const faceResult = extendedProfileToFace(spec.profile);
      if (!faceResult.ok) return err(faceResult.error);
      const face = own(faceResult.value);
      const prismResult = extrude(face, [0, 0, spec.length]);
      if (!prismResult.ok) {
        return err(
          fromBrepError(prismResult.error, 'BEAM_EXTRUDE_FAILED', 'Failed to extrude beam profile')
        );
      }
      const prism = own(prismResult.value);
      // Cycle the XY section and its +Z extrusion into beam axes Y, Z and X.
      const solid = own(rotate(prism, 120, { axis: [1, 1, 1] }));
      return validateGeneratedSolid(solid, {
        code: 'BEAM_INVALID_SOLID',
        message: 'Extruded beam solid failed validity check',
      });
    }

    // profileToPolygon returns points in XY (z=0). Map (x,y,0) → (0,x,y) so the
    // profile lies in the YZ plane at x=0 ready to extrude along +X.
    const profilePtsResult = profileToPolygon(spec.profile);
    if (!profilePtsResult.ok) return err(profilePtsResult.error);
    const profilePts = profilePtsResult.value.map<[number, number, number]>(([px, py]) => [
      0,
      px,
      py,
    ]);

    const profileResult = polygon(profilePts);
    if (!profileResult.ok) {
      return err(
        fromBrepError(profileResult.error, 'BEAM_PROFILE_FAILED', 'Failed to create beam profile')
      );
    }

    const profile = own(profileResult.value);
    const solidResult = extrude(profile, [spec.length, 0, 0]);
    if (!solidResult.ok) {
      return err(
        fromBrepError(solidResult.error, 'BEAM_EXTRUDE_FAILED', 'Failed to extrude beam profile')
      );
    }

    const solid = own(solidResult.value);
    return validateGeneratedSolid(solid, {
      code: 'BEAM_INVALID_SOLID',
      message: 'Extruded beam solid failed validity check',
    });
  });
}
