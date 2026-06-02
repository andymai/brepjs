import { polygon, extrude, isValidSolid, rotate } from 'brepjs';
import type { ValidSolid, Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { BeamSpec } from '../specs/beamSpec.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError, geometryError } from '../errors/bimError.js';
import { profileToPolygon } from './profileFns.js';
import { isExtendedProfile } from '../specs/profile.js';
import { extendedProfileToFace } from '../specs/profilesExtended.js';

// Returned solid is unplaced template geometry: profile in the global YZ plane
// (cross-section centered on the local Y/Z axes), extruded along +X by length.
// origin/axisX/axisZ are applied by the IFC layer via IfcLocalPlacement.
//
// The profile is rotated from its native XY definition into YZ here so that
// the brepjs solid grows in +X to match the standard wall/extrusion pattern.
export function beamToSolid(spec: BeamSpec): Result<ValidSolid, BimError> {
  if (spec.length <= 0) {
    return err(specError('BEAM_ZERO_LENGTH', 'Beam length must be positive'));
  }

  // Extended/hollow profiles have no single outer polygon. Build the XY face,
  // extrude along +Z, then rotate +90° about Y so the beam length runs along +X
  // (matching the core path's YZ cross-section / +X extrusion convention).
  if (isExtendedProfile(spec.profile)) {
    const faceResult = extendedProfileToFace(spec.profile);
    if (!faceResult.ok) return err(faceResult.error);
    using face = faceResult.value;
    const prismResult = extrude(face, [0, 0, spec.length]);
    if (!prismResult.ok) {
      return err(fromBrepError(prismResult.error, 'BEAM_EXTRUDE_FAILED', 'Failed to extrude beam profile'));
    }
    using prism = prismResult.value;
    const solid = rotate(prism, 90, { axis: [0, 1, 0] });
    if (!isValidSolid(solid)) {
      solid[Symbol.dispose]();
      return err(geometryError('BEAM_INVALID_SOLID', 'Extruded beam solid failed validity check'));
    }
    return ok(solid);
  }

  // profileToPolygon returns points in XY (z=0). Map (x,y,0) → (0,x,y) so the
  // profile lies in the YZ plane at x=0 ready to extrude along +X.
  const profilePtsResult = profileToPolygon(spec.profile);
  if (!profilePtsResult.ok) return err(profilePtsResult.error);
  const profilePts = profilePtsResult.value.map<[number, number, number]>(([px, py]) => [0, px, py]);

  const profileResult = polygon(profilePts);
  if (!profileResult.ok) {
    return err(fromBrepError(profileResult.error, 'BEAM_PROFILE_FAILED', 'Failed to create beam profile'));
  }

  using profile = profileResult.value;
  const solidResult = extrude(profile, [spec.length, 0, 0]);
  if (!solidResult.ok) {
    return err(fromBrepError(solidResult.error, 'BEAM_EXTRUDE_FAILED', 'Failed to extrude beam profile'));
  }

  const solid = solidResult.value;
  if (!isValidSolid(solid)) {
    solid[Symbol.dispose]();
    return err(geometryError('BEAM_INVALID_SOLID', 'Extruded beam solid failed validity check'));
  }
  return ok(solid);
}
